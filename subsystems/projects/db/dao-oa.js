// subsystems/projects/db/dao-oa.js — OA 能力移植数据访问层（里程碑/风险/预算扩展）
// 方案A一期纯增量：只新增函数，不改现有 dao*.js 任何函数；工厂模式由 db.js 自动扫描加载
module.exports = function createDaoOa(deps) {
  var q = deps.q, one = deps.one, run = deps.run;

  // 事务内单行查询：传 conn 用当前连接，否则用连接池（与 dao.js 同构）
  async function fetchOne(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].length ? Object.assign({}, rows[0][0]) : undefined;
    }
    return one(sql, params);
  }
  async function fetchAll(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].map(function (r) { return Object.assign({}, r); });
    }
    return q(sql, params);
  }

  // ===== 里程碑 =====
  // 列表（含创建人/达成人展示名 LEFT JOIN users）
  async function listMilestones(conn, projectId) {
    return fetchAll(conn,
      'SELECT m.*, u.display_name AS creator_name ' +
      'FROM project_milestones m LEFT JOIN users u ON u.id=m.created_by ' +
      'WHERE m.project_id=? ORDER BY m.sort, m.id', [projectId]);
  }
  async function getMilestone(conn, id) {
    return fetchOne(conn, 'SELECT * FROM project_milestones WHERE id=?', [id]);
  }
  // 写操作约定：必须传事务连接（需 insertId / 事务一致性）
  async function createMilestone(data, conn) {
    if (!conn) throw new Error('createMilestone 必须传事务连接 conn（需取 insertId）');
    const r = await conn.execute(
      'INSERT INTO project_milestones (project_id,name,description,target_date,sort,created_by) VALUES (?,?,?,?,?,?)',
      [data.project_id, data.name, data.description || '', data.target_date || null, data.sort || 0, data.created_by]);
    return { id: r[0].insertId };
  }
  async function updateMilestone(conn, id, data, expectVersion) {
    // CAS：WHERE version=? 防并发覆盖；changed=0 表示已被他人修改
    const r = await conn.execute(
      'UPDATE project_milestones SET name=?, description=?, target_date=?, sort=?, version=version+1 WHERE id=? AND version=?',
      [data.name, data.description || '', data.target_date || null, data.sort || 0, id, expectVersion]);
    return { changed: r[0].affectedRows };
  }
  // 达成里程碑（CAS + 延期判定；与手动流转同事务留痕由路由层负责）
  async function achieveMilestone(conn, id, expectVersion) {
    // is_delayed：实际达成日 > 目标日（目标日为空不算延期）；delayed 为 MySQL 保留字故列名 is_delayed
    const r = await conn.execute(
      'UPDATE project_milestones SET status=\'ACHIEVED\', actual_date=CURDATE(), ' +
      'is_delayed=(CASE WHEN target_date IS NOT NULL AND CURDATE() > target_date THEN 1 ELSE 0 END), ' +
      'version=version+1 WHERE id=? AND status=\'PENDING\' AND version=?',
      [id, expectVersion]);
    return { changed: r[0].affectedRows };
  }
  async function deleteMilestone(conn, id) {
    const r = await conn.execute('DELETE FROM project_milestones WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }

  // ===== 风险 =====
  async function listRisks(conn, projectId) {
    return fetchAll(conn,
      'SELECT r.*, u1.display_name AS identified_name, u2.display_name AS resolved_name ' +
      'FROM project_risks r ' +
      'LEFT JOIN users u1 ON u1.id=r.identified_by ' +
      'LEFT JOIN users u2 ON u2.id=r.resolved_by ' +
      'WHERE r.project_id=? ORDER BY r.id DESC', [projectId]);
  }
  async function getRisk(conn, id) {
    return fetchOne(conn, 'SELECT * FROM project_risks WHERE id=?', [id]);
  }
  async function createRisk(data, conn) {
    if (!conn) throw new Error('createRisk 必须传事务连接 conn（需取 insertId）');
    const r = await conn.execute(
      'INSERT INTO project_risks (project_id,risk_name,description,risk_type,severity,probability,impact,mitigation,identified_by,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [data.project_id, data.risk_name, data.description || '', data.risk_type || 'other',
       data.severity || 'M', data.probability || 'M', data.impact || '', data.mitigation || '',
       data.identified_by, data.created_by]);
    return { id: r[0].insertId };
  }
  async function updateRisk(conn, id, data, expectVersion) {
    const r = await conn.execute(
      'UPDATE project_risks SET risk_name=?, description=?, risk_type=?, severity=?, probability=?, impact=?, mitigation=?, version=version+1 ' +
      'WHERE id=? AND status=\'OPEN\' AND version=?',
      [data.risk_name, data.description || '', data.risk_type || 'other', data.severity || 'M',
       data.probability || 'M', data.impact || '', data.mitigation || '', id, expectVersion]);
    return { changed: r[0].affectedRows };
  }
  // 解决风险（CAS：仅 OPEN 可解决；resolved_at=当前时间）
  async function resolveRisk(conn, id, userId, expectVersion) {
    const r = await conn.execute(
      'UPDATE project_risks SET status=\'RESOLVED\', resolved_by=?, resolved_at=CURRENT_TIMESTAMP, version=version+1 ' +
      'WHERE id=? AND status=\'OPEN\' AND version=?',
      [userId, id, expectVersion]);
    return { changed: r[0].affectedRows };
  }
  async function deleteRisk(conn, id) {
    const r = await conn.execute('DELETE FROM project_risks WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }

  // ===== 项目扩展信息（预算/成本，1:1 扩展表） =====
  async function getProjectExtras(conn, projectId) {
    return fetchOne(conn, 'SELECT * FROM project_extras WHERE project_id=?', [projectId]);
  }
  // 幂等 upsert：未建过 extras 行的新项目也能直接保存
  async function saveProjectExtras(conn, projectId, data, userId) {
    await conn.execute(
      'INSERT INTO project_extras (project_id,budget,actual_cost,project_type,priority,updated_by) VALUES (?,?,?,?,?,?) ' +
      'ON DUPLICATE KEY UPDATE budget=VALUES(budget), actual_cost=VALUES(actual_cost), project_type=VALUES(project_type), priority=VALUES(priority), updated_by=VALUES(updated_by)',
      [projectId, data.budget || null, data.actual_cost || null, data.project_type || '', data.priority || 'M', userId]);
    return { changed: 1 };
  }

  return {
    listMilestones, getMilestone, createMilestone, updateMilestone, achieveMilestone, deleteMilestone,
    listRisks, getRisk, createRisk, updateRisk, resolveRisk, deleteRisk,
    getProjectExtras, saveProjectExtras
  };
};
