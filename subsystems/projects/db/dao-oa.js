// subsystems/projects/db/dao-oa.js — OA 能力移植数据访问层（里程碑/风险/预算扩展/变更单/机型引用/模板/项目关系）
// 方案A纯增量：只新增函数，不改现有 dao*.js 任何函数；工厂模式由 dao.js 聚合注入
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

  // ===== 变更单（二期批次1；审批人=ADMIN/PM/项目 owner，TIME 类仅记录不自动顺延） =====
  // 列表（含申请人/审批人展示名）
  async function listChanges(conn, projectId) {
    return fetchAll(conn,
      'SELECT c.*, u1.display_name AS applicant_name, u2.display_name AS approver_name ' +
      'FROM project_changes c ' +
      'LEFT JOIN users u1 ON u1.id=c.applicant_id ' +
      'LEFT JOIN users u2 ON u2.id=c.approver_id ' +
      'WHERE c.project_id=? ORDER BY c.id DESC', [projectId]);
  }
  async function getChange(conn, id) {
    return fetchOne(conn, 'SELECT * FROM project_changes WHERE id=?', [id]);
  }
  async function createChange(data, conn) {
    if (!conn) throw new Error('createChange 必须传事务连接 conn（需取 insertId）');
    const r = await conn.execute(
      'INSERT INTO project_changes (project_id,change_no,change_type,description,before_value,after_value,reason,applicant_id,created_by) VALUES (?,?,?,?,?,?,?,?,?)',
      [data.project_id, data.change_no || null, data.change_type, data.description,
       data.before_value || '', data.after_value || '', data.reason || '',
       data.applicant_id, data.created_by]);
    return { id: r[0].insertId };
  }
  // 编辑变更单（CAS：仅 PENDING 可改）
  async function updateChange(conn, id, data, expectVersion) {
    const r = await conn.execute(
      'UPDATE project_changes SET change_type=?, description=?, before_value=?, after_value=?, reason=?, version=version+1 ' +
      'WHERE id=? AND status=\'PENDING\' AND version=?',
      [data.change_type, data.description, data.before_value || '', data.after_value || '',
       data.reason || '', id, expectVersion]);
    return { changed: r[0].affectedRows };
  }
  // 审批（CAS：仅 PENDING 可批；to=APPROVED/REJECTED；同事务写 approver/approved_at）
  async function approveChange(conn, id, to, userId, expectVersion) {
    const r = await conn.execute(
      'UPDATE project_changes SET status=?, approver_id=?, approved_at=CURRENT_TIMESTAMP, version=version+1 ' +
      'WHERE id=? AND status=\'PENDING\' AND version=?',
      [to, userId, id, expectVersion]);
    return { changed: r[0].affectedRows };
  }
  async function deleteChange(conn, id) {
    const r = await conn.execute('DELETE FROM project_changes WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }

  // ===== 项目引用机型（二期批次1；sample_models 只读引用） =====
  // 项目机型引用列表（JOIN sample_models 取 code/full_name；机型号不存在时字段为 NULL 仍返回行，便于发现脏数据）
  async function listModelRefs(conn, projectId) {
    return fetchAll(conn,
      'SELECT r.*, m.code AS model_code, m.full_name AS model_name, u.display_name AS creator_name ' +
      'FROM project_model_refs r ' +
      'LEFT JOIN sample_models m ON m.id=r.model_id ' +
      'LEFT JOIN users u ON u.id=r.created_by ' +
      'WHERE r.project_id=? ORDER BY r.id', [projectId]);
  }
  async function addModelRef(conn, projectId, modelId, role, userId) {
    const r = await conn.execute(
      'INSERT IGNORE INTO project_model_refs (project_id,model_id,role,created_by) VALUES (?,?,?,?)',
      [projectId, modelId, role || 'TARGET', userId]);
    return { changed: r[0].affectedRows };
  }
  async function removeModelRef(conn, projectId, modelId) {
    const r = await conn.execute('DELETE FROM project_model_refs WHERE project_id=? AND model_id=?', [projectId, modelId]);
    return { changed: r[0].affectedRows };
  }
  // 校验机型存在（跨子系统只读查询 sample_models）
  async function getModelExists(conn, modelId) {
    return fetchOne(conn, 'SELECT id, code, full_name FROM sample_models WHERE id=?', [modelId]);
  }
  // 全部在册机型（项目引用下拉用；只读）
  async function listAllModels(conn) {
    return fetchAll(conn, 'SELECT id, code, full_name FROM sample_models ORDER BY code');
  }
  // 变更编号当日序列（DB 原子计数，防并发重号；按日前缀轮转，格式 PC+yyyyMMdd+N）
  // 注：sample-mgmt 无 Redis 依赖（与 OA 源系统不同），序列走 MySQL 原子 UPDATE + LAST_INSERT_ID 技巧
  async function nextChangeSeq(prefix) {
    if (!run) throw new Error('nextChangeSeq 需要 run 依赖');
    await run(
      'INSERT INTO project_seq (seq_key, seq_val) VALUES (?, LAST_INSERT_ID(1)) ' +
      'ON DUPLICATE KEY UPDATE seq_val = LAST_INSERT_ID(seq_val + 1)',
      [prefix]);
    const row = await one('SELECT LAST_INSERT_ID() AS n');
    return row ? row.n : 1;
  }

  // ===== 项目模板（二期批次2） =====
  async function listTemplates(conn) {
    return fetchAll(conn, 'SELECT * FROM project_templates WHERE is_active=1 ORDER BY id DESC');
  }
  async function getTemplate(conn, id) {
    return fetchOne(conn, 'SELECT * FROM project_templates WHERE id=? AND is_active=1', [id]);
  }
  async function createTemplate(conn, data, userId) {
    const r = await conn.execute(
      'INSERT INTO project_templates (name,description,tasks_json,milestones_json,created_by) VALUES (?,?,?,?,?)',
      [data.name, data.description || '', data.tasks_json || '[]', data.milestones_json || '[]', userId]);
    return { id: r[0].insertId };
  }
  async function updateTemplate(conn, id, data) {
    const r = await conn.execute(
      'UPDATE project_templates SET name=?, description=?, tasks_json=?, milestones_json=? WHERE id=? AND is_active=1',
      [data.name, data.description || '', data.tasks_json || '[]', data.milestones_json || '[]', id]);
    return { changed: r[0].affectedRows };
  }
  async function deleteTemplate(conn, id) {
    // 停用式删除（兼容迭代）：保留历史数据，不再出现在列表/实例化
    const r = await conn.execute('UPDATE project_templates SET is_active=0 WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }
  async function incrTemplateInstance(conn, id) {
    await conn.execute('UPDATE project_templates SET instance_count=instance_count+1 WHERE id=?', [id]);
  }

  // ===== 项目关系（二期批次3；图谱数据源） =====
  async function listRelations(conn) {
    return fetchAll(conn, 'SELECT * FROM project_relations ORDER BY id DESC');
  }
  async function addRelation(conn, data, userId) {
    // 幂等：UNIQUE(from,to,type,custom_type) 冲突时不重复插入
    // custom_type 用空串而非 NULL（MySQL 唯一索引不约束 NULL，NULL 会导致幂等失效）
    const r = await conn.execute(
      'INSERT IGNORE INTO project_relations (from_project_id,to_project_id,relation_type,custom_type,note,created_by) VALUES (?,?,?,?,?,?)',
      [data.from_project_id, data.to_project_id, data.relation_type, data.custom_type || '', data.note || null, userId]);
    return { changed: r[0].affectedRows };
  }
  async function removeRelation(conn, id) {
    const r = await conn.execute('DELETE FROM project_relations WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }
  async function getRelation(conn, id) {
    return fetchOne(conn, 'SELECT * FROM project_relations WHERE id=?', [id]);
  }
  // 全部「项目-机型」引用对（图谱 SHARES_MODEL 自动推导用；JOIN 取机型 code）
  async function listAllModelRefPairs(conn) {
    return fetchAll(conn,
      'SELECT r.project_id, r.model_id, m.code AS model_code FROM project_model_refs r ' +
      'LEFT JOIN sample_models m ON m.id=r.model_id');
  }

  return {
    listMilestones, getMilestone, createMilestone, updateMilestone, achieveMilestone, deleteMilestone,
    listRisks, getRisk, createRisk, updateRisk, resolveRisk, deleteRisk,
    getProjectExtras, saveProjectExtras,
    listChanges, getChange, createChange, updateChange, approveChange, deleteChange,
    listModelRefs, addModelRef, removeModelRef, getModelExists, listAllModels, nextChangeSeq,
    listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate, incrTemplateInstance,
    listRelations, addRelation, removeRelation, getRelation, listAllModelRefPairs
  };
};
