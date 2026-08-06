// subsystems/projects/db/dao-extras.js — 项目任务域扩展数据访问（依赖/附件/关联/日志，工厂）
// 拆分原因：Task 6 追加 11 个方法后 dao-tasks.js 将逼近 70% 预警线（139 行/上限 200），故独立文件
// 依赖注入：deps = { q, one, run, nowISO, fetchOne, fetchAll }，fetchOne/fetchAll 由 dao.js 定义传入
// 写操作统一约定：有 conn → conn.execute 取 r[0]（insertId/affectedRows）；无 conn → run() 返回 {changed:1}
module.exports = function createExtraDao(deps) {
  var run = deps.run, fetchOne = deps.fetchOne, fetchAll = deps.fetchAll;

  // ===== 依赖 =====
  async function listTaskDeps(conn, taskId) {
    return fetchAll(conn,
      'SELECT d.*, t.title AS depends_on_title FROM project_task_deps d JOIN project_tasks t ON t.id=d.depends_on_id ' +
      'WHERE d.task_id=? ORDER BY d.id', [taskId]);
  }
  async function addTaskDep(conn, taskId, dependsOnId, createdBy) {
    const sql = 'INSERT IGNORE INTO project_task_deps (task_id,depends_on_id,created_by) VALUES (?,?,?)';
    const params = [taskId, dependsOnId, createdBy];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行
    return { changed: 1 };
  }
  async function removeTaskDep(conn, taskId, dependsOnId) {
    const sql = 'DELETE FROM project_task_deps WHERE task_id=? AND depends_on_id=?';
    const params = [taskId, dependsOnId];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行
    return { changed: 1 };
  }
  // W1 修复：全路径环检测（fetchAll 遍历所有前置分支，防多前置任务时单链 fetchOne 漏检循环依赖）
  async function hasCycle(conn, taskId, dependsOnId) {
    const stack = [dependsOnId];
    const visited = new Set();
    while (stack.length) {
      const cur = stack.pop();
      if (cur === taskId) return true;
      if (visited.has(cur)) continue; // 防御：既有数据存在环时终止遍历
      visited.add(cur);
      const rows = await fetchAll(conn, 'SELECT depends_on_id FROM project_task_deps WHERE task_id=?', [cur]);
      for (const r of rows) stack.push(r.depends_on_id);
    }
    return false;
  }

  // ===== 附件 =====
  async function createTaskFile(conn, taskId, file, uploadedBy) {
    const sql = 'INSERT INTO project_task_files (task_id,file_name,file_path,size,uploaded_by) VALUES (?,?,?,?,?)';
    const params = [taskId, file.file_name, file.file_path, file.size || 0, uploadedBy];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { id: r[0].insertId };
    }
    await run(sql, params); // 无事务仅执行；调用方需 insertId 必须传 conn
    return { id: 0 };
  }
  async function listTaskFiles(conn, taskId) {
    return fetchAll(conn, 'SELECT * FROM project_task_files WHERE task_id=? ORDER BY id', [taskId]);
  }
  async function deleteTaskFile(conn, id) {
    const sql = 'DELETE FROM project_task_files WHERE id=?';
    if (conn) {
      const r = await conn.execute(sql, [id]);
      return { changed: r[0].affectedRows };
    }
    await run(sql, [id]); // 无事务仅执行
    return { changed: 1 };
  }

  // ===== 关联 =====
  async function addTaskLink(conn, taskId, refType, refId) {
    const sql = 'INSERT IGNORE INTO project_task_links (task_id,ref_type,ref_id) VALUES (?,?,?)';
    const params = [taskId, refType, refId];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行
    return { changed: 1 };
  }
  async function listTaskLinks(conn, taskId) {
    return fetchAll(conn,
      'SELECT l.*, CASE WHEN l.ref_type=\'sample\' THEN s.sample_no WHEN l.ref_type=\'fixture\' THEN f.fixture_no END AS ref_no, ' +
      'CASE WHEN l.ref_type=\'sample\' THEN s.name WHEN l.ref_type=\'fixture\' THEN f.name END AS ref_name ' +
      'FROM project_task_links l LEFT JOIN samples s ON s.id=l.ref_id AND l.ref_type=\'sample\' ' +
      'LEFT JOIN fixtures f ON f.id=l.ref_id AND l.ref_type=\'fixture\' WHERE l.task_id=? ORDER BY l.id', [taskId]);
  }
  async function removeTaskLink(conn, taskId, refType, refId) {
    const sql = 'DELETE FROM project_task_links WHERE task_id=? AND ref_type=? AND ref_id=?';
    const params = [taskId, refType, refId];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行
    return { changed: 1 };
  }

  // ===== 任务留痕 =====
  async function listTaskLogs(conn, taskId) {
    return fetchAll(conn,
      'SELECT l.*, u.display_name AS operator_name FROM project_logs l LEFT JOIN users u ON u.id=l.operator_id ' +
      "WHERE l.entity_type='task' AND l.entity_id=? ORDER BY l.id DESC LIMIT 200", [taskId]);
  }

  return { listTaskDeps, addTaskDep, removeTaskDep, hasCycle,
    createTaskFile, listTaskFiles, deleteTaskFile,
    addTaskLink, listTaskLinks, removeTaskLink, listTaskLogs };
};
