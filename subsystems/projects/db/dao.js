// subsystems/projects/db/dao.js — 项目追踪数据访问层（工厂模式，db.js 自动扫描加载）
module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  // 事务内单行查询：传 conn 用当前连接，否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].length ? Object.assign({}, rows[0][0]) : undefined;
    }
    return one(sql, params);
  }
  // 事务内多行查询
  async function fetchAll(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].map(function (r) { return Object.assign({}, r); });
    }
    return q(sql, params);
  }

  // ===== 项目 =====
  // 写操作统一约定：有 conn → conn.execute 取 r[0]（insertId/affectedRows）；无 conn → run() 仅执行
  async function createProject(data, conn) {
    const sql = 'INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)';
    const params = [data.name, data.description || '', 'ACTIVE', data.created_by];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { id: r[0].insertId };
    }
    await run(sql, params); // 无事务仅执行；调用方需 insertId 必须传 conn
    return { id: 0 };
  }
  async function listProjects(conn) {
    return fetchAll(conn,
      'SELECT p.*, (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id) AS task_count, ' +
      '(SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id AND t.status=\'DONE\') AS done_count ' +
      'FROM projects p ORDER BY p.id DESC');
  }
  async function getProject(conn, id) { return fetchOne(conn, 'SELECT * FROM projects WHERE id=?', [id]); }
  async function updateProject(conn, id, data) {
    const sql = 'UPDATE projects SET name=?, description=? WHERE id=?';
    const params = [data.name, data.description || '', id];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params);
    return { changed: 1 };
  }
  async function deleteProject(conn, id) {
    const sql = 'DELETE FROM projects WHERE id=?';
    if (conn) {
      const r = await conn.execute(sql, [id]);
      return { changed: r[0].affectedRows };
    }
    await run(sql, [id]);
    return { changed: 1 };
  }
  async function countProjectTasks(conn, id) {
    const row = await fetchOne(conn, 'SELECT COUNT(*) AS c FROM project_tasks WHERE project_id=?', [id]);
    return row ? row.c : 0;
  }

  // ===== 成员 =====
  async function listMembers(conn, projectId) {
    return fetchAll(conn,
      'SELECT m.user_id, m.is_owner, m.created_at, u.username, u.display_name, u.role, u.dept ' +
      'FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.is_owner DESC, m.id', [projectId]);
  }
  async function addMember(conn, projectId, userId, isOwner) {
    const sql = 'INSERT IGNORE INTO project_members (project_id,user_id,is_owner) VALUES (?,?,?)';
    const params = [projectId, userId, isOwner ? 1 : 0];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }
  async function setOwner(conn, projectId, userId) {
    const clear = 'UPDATE project_members SET is_owner=0 WHERE project_id=?';
    const set = 'UPDATE project_members SET is_owner=1 WHERE project_id=? AND user_id=?';
    if (conn) {
      await conn.execute(clear, [projectId]);
      await conn.execute(set, [projectId, userId]);
    } else {
      await run(clear, [projectId]);
      await run(set, [projectId, userId]);
    }
  }
  async function removeMember(conn, projectId, userId) {
    const sql = 'DELETE FROM project_members WHERE project_id=? AND user_id=?';
    if (conn) await conn.execute(sql, [projectId, userId]);
    else await run(sql, [projectId, userId]);
  }

  // ===== 任务域（已拆分至 dao-tasks.js，防容量超限；导出名与拆分前完全一致）=====
  const taskDao = require('./dao-tasks')({ q, one, run, nowISO, fetchOne, fetchAll });
  // ===== 任务域扩展（Task 6：依赖/附件/关联/日志；独立文件防 dao-tasks.js 超预警线）=====
  const extraDao = require('./dao-extras')({ q, one, run, nowISO, fetchOne, fetchAll });
  // ===== 看板统计（Task 7：弱一致只读聚合；独立文件防 dao.js 容量超限）=====
  const statsDao = require('./dao-stats')({ q, one, run, nowISO, fetchOne, fetchAll });

  // ===== 留痕（全 Task 共用）=====
  async function addProjectLog(conn, entityType, entityId, action, detail, operatorId) {
    const sql = 'INSERT INTO project_logs (entity_type,entity_id,action,detail,operator_id) VALUES (?,?,?,?,?)';
    const params = [entityType, entityId, action, detail || '', operatorId || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  return Object.assign({ fetchOne, fetchAll, createProject, listProjects, getProject, updateProject,
    deleteProject, countProjectTasks, listMembers, addMember, setOwner, removeMember, addProjectLog }, taskDao, extraDao, statsDao);
};
