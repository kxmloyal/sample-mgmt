// subsystems/projects/db/dao-tasks.js — 项目任务域数据访问（工厂，由 dao.js 注入依赖）
// 拆分原因：Task 5-7 追加子任务/评论/依赖/附件/关联/统计后，原 dao.js 将超 200 行工具文件上限
// 依赖注入：deps = { q, one, run, nowISO, fetchOne, fetchAll }，fetchOne/fetchAll 由 dao.js 定义传入
module.exports = function createTaskDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO, fetchOne = deps.fetchOne, fetchAll = deps.fetchAll;

  // v2：有效状态动态判定（已过计划日期且未完成 → 视作 OVERDUE，不写库；需 t 表别名）
  var STATUS_EFF = "CASE WHEN t.planned_date < CURDATE() AND t.status IN ('NOT_STARTED','IN_PROGRESS') THEN 'OVERDUE' ELSE t.status END AS status_eff";

  // v2：跨项目任务 WHERE 构建（listAllTasks / listAllTasksPage / countAllTasks 复用）
  function buildTaskWhere(filters) {
    var sql = '', params = [];
    if (filters.project_id) { sql += ' AND t.project_id=?'; params.push(filters.project_id); }
    if (filters.category) { sql += ' AND t.category=?'; params.push(filters.category); }
    if (filters.priority) { sql += ' AND t.priority=?'; params.push(filters.priority); }
    if (filters.status && filters.status !== 'OVERDUE') { sql += ' AND t.status=?'; params.push(filters.status); }
    if (filters.status === 'OVERDUE') {
      sql += " AND (t.status='OVERDUE' OR (t.status IN ('NOT_STARTED','IN_PROGRESS') AND t.planned_date < CURDATE()))";
    }
    if (filters.assignee_id) { sql += ' AND t.assignee_id=?'; params.push(filters.assignee_id); }
    // A1 全文搜索：title/description/notes/solution LIKE 匹配；转义 %/_ 防通配符注入；无索引全表扫，<5万行可接受
    if (filters.q) {
      const escaped = String(filters.q).replace(/[\\%_]/g, m => '\\' + m);
      sql += ' AND (t.title LIKE ? OR t.description LIKE ? OR t.notes LIKE ? OR t.solution LIKE ?)';
      const like = '%' + escaped + '%';
      params.push(like, like, like, like);
    }
    return { sql: sql, params: params };
  }

  // ===== 任务 =====
  async function createTask(data, conn) {
    const sql = 'INSERT INTO project_tasks (project_id,title,description,category,priority,assignee_id,planned_date,status,progress,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)';
    const params = [data.project_id, data.title, data.description || '', data.category || 'other',
      data.priority || 'M', data.assignee_id || null, data.planned_date || null, 'NOT_STARTED', 0, data.created_by];
    const r = await conn.execute(sql, params);
    return { id: r[0].insertId };
  }
  async function listProjectTasks(conn, projectId) {
    return fetchAll(conn,
      'SELECT t.*, ' + STATUS_EFF + ', u.display_name AS assignee_name, u.username AS assignee_username ' +
      'FROM project_tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? ORDER BY t.id DESC', [projectId]);
  }
  async function getTask(conn, id) {
    return fetchOne(conn, "SELECT *, CASE WHEN planned_date < CURDATE() AND status IN ('NOT_STARTED','IN_PROGRESS') THEN 'OVERDUE' ELSE status END AS status_eff FROM project_tasks WHERE id=?", [id]);
  }
  // v2：详情 JOIN 项目名与责任人名（消除前端补查）
  async function getTaskDetail(conn, id) {
    return fetchOne(conn,
      'SELECT t.*, ' + STATUS_EFF + ', p.name AS project_name, u.display_name AS assignee_name, u.username AS assignee_username ' +
      'FROM project_tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE t.id=?', [id]);
  }
  async function updateTask(conn, id, data, version) {
    // 乐观锁：WHERE id AND version；匹配成功则 version+1，返回 affectedRows（0=版本冲突）
    const sets = [], params = [];
    // C1 修复：剔除 status（状态仅能经 /status 流转接口变更，DAO 层兜底防绕过）
    const fields = ['title', 'description', 'category', 'priority', 'assignee_id', 'planned_date', 'progress', 'solution', 'notes', 'actual_date'];
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(f + '=?'); params.push(data[f]); }
    }
    if (sets.length === 0) return { changed: 1 };
    sets.push('version=version+1');
    params.push(id, version);
    const sql = 'UPDATE project_tasks SET ' + sets.join(',') + ' WHERE id=? AND version=?';
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行；调用方需 affectedRows 必须传 conn（修正3）
    return { changed: 1 };
  }
  async function deleteTask(conn, id) {
    const sql = 'DELETE FROM project_tasks WHERE id=?';
    if (conn) {
      const r = await conn.execute(sql, [id]);
      return { changed: r[0].affectedRows };
    }
    await run(sql, [id]); // 无事务仅执行（修正3）
    return { changed: 1 };
  }
  async function listAllTasks(conn, filters) {
    filters = filters || {};
    var w = buildTaskWhere(filters);
    var sql = 'SELECT t.*, ' + STATUS_EFF + ', p.name AS project_name, u.display_name AS assignee_name ' +
      'FROM project_tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE 1=1' +
      w.sql + ' ORDER BY t.id DESC';
    return fetchAll(conn, sql, w.params);
  }
  async function countAllTasks(conn, filters) {
    filters = filters || {};
    var w = buildTaskWhere(filters);
    var row = await fetchOne(conn, 'SELECT COUNT(*) AS c FROM project_tasks t WHERE 1=1' + w.sql, w.params);
    return row ? row.c : 0;
  }
  async function listAllTasksPage(conn, filters, limit, offset) {
    filters = filters || {};
    var w = buildTaskWhere(filters);
    // 修正：LIMIT/OFFSET 经 Number() 内插（mysql2 execute 服务端 prepared 对 LIMIT ? 绑定报
    // "Incorrect arguments to mysqld_stmt_execute"；limit/offset 已在路由层 parseInt+钳制，内插安全）
    var sql = 'SELECT t.*, ' + STATUS_EFF + ', p.name AS project_name, u.display_name AS assignee_name ' +
      'FROM project_tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE 1=1' +
      w.sql + ' ORDER BY t.id DESC LIMIT ' + Number(limit) + ' OFFSET ' + Number(offset);
    return fetchAll(conn, sql, w.params);
  }
  async function deleteTaskCascade(conn, tid) {
    // 级联删除（同事务，由调用方 withTransaction 包裹）
    // 修正3：project_logs 无 task_id 列，须用 entity_type+entity_id 条件删除；其余附属表按 task_id 删
    await conn.execute('DELETE FROM project_logs WHERE entity_type=\'task\' AND entity_id=?', [tid]);
    for (const tbl of ['project_subtasks', 'project_task_comments', 'project_task_deps', 'project_task_files', 'project_task_links']) {
      await conn.execute('DELETE FROM ' + tbl + ' WHERE task_id=?', [tid]);
    }
    await conn.execute('DELETE FROM project_tasks WHERE id=?', [tid]);
  }

  // ===== 子任务（三态：NOT_STARTED/IN_PROGRESS/DONE，无 OVERDUE） =====
  async function createSubtask(data, conn) {
    const sql = 'INSERT INTO project_subtasks (task_id,title,assignee_id,planned_date,created_by) VALUES (?,?,?,?,?)';
    const params = [data.task_id, data.title, data.assignee_id || null, data.planned_date || null, data.created_by];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { id: r[0].insertId };
    }
    await run(sql, params); // 无事务仅执行；调用方需 insertId 必须传 conn
    return { id: 0 };
  }
  async function listSubtasks(conn, taskId) {
    return fetchAll(conn, 'SELECT * FROM project_subtasks WHERE task_id=? ORDER BY id', [taskId]);
  }
  async function updateSubtask(conn, id, data, version) {
    // 乐观锁：WHERE id AND version；匹配成功则 version+1，返回 affectedRows（0=版本冲突）
    const sets = [], params = [];
    const fields = ['title', 'assignee_id', 'planned_date'];
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(f + '=?'); params.push(data[f]); }
    }
    if (sets.length === 0) return { changed: 1 };
    sets.push('version=version+1');
    params.push(id, version);
    const sql = 'UPDATE project_subtasks SET ' + sets.join(',') + ' WHERE id=? AND version=?';
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行；调用方需 affectedRows 必须传 conn
    return { changed: 1 };
  }
  async function deleteSubtask(conn, id) {
    const sql = 'DELETE FROM project_subtasks WHERE id=?';
    if (conn) {
      const r = await conn.execute(sql, [id]);
      return { changed: r[0].affectedRows };
    }
    await run(sql, [id]); // 无事务仅执行
    return { changed: 1 };
  }
  // 子任务 CAS：按 status 条件更新（前端无需回传 version）
  // 落地修正：不递增 version——CAS 以 status 字段做并发控制，与乐观锁编辑（version）两套机制独立，
  // 否则流转后 version 被抬高，前端按创建时的 version:0 编辑必然 409（计划 Step 1 测试已锁定该语义）
  async function casSubtaskStatus(conn, id, fromStatus, to) {
    const doneAt = to === 'DONE' ? (await conn.execute('SELECT NOW() AS n'))[0][0].n : null;
    const sql = 'UPDATE project_subtasks SET status=?, done_at=? WHERE id=? AND status=?';
    const params = [to, doneAt, id, fromStatus];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { changed: r[0].affectedRows };
    }
    await run(sql, params); // 无事务仅执行；CAS 需 affectedRows，调用方必须传 conn
    return { changed: 1 };
  }
  // v2：子任务完成度联动父任务 progress（COMPLETE 事务内调用；同值不更新避免无谓写）
  async function syncSubtaskProgress(conn, taskId) {
    var row = await fetchOne(conn, "SELECT COUNT(*) AS total, SUM(status='DONE') AS done FROM project_subtasks WHERE task_id=?", [taskId]);
    if (!row || !row.total) return;
    var progress = Math.round(Number(row.done || 0) / row.total * 100);
    await conn.execute('UPDATE project_tasks SET progress=? WHERE id=? AND progress<>?', [progress, taskId, progress]);
  }

  // ===== 评论 =====
  async function createComment(conn, taskId, content, operatorId) {
    const sql = 'INSERT INTO project_task_comments (task_id,content,operator_id) VALUES (?,?,?)';
    const params = [taskId, content, operatorId];
    if (conn) {
      const r = await conn.execute(sql, params);
      return { id: r[0].insertId };
    }
    await run(sql, params); // 无事务仅执行；调用方需 insertId 必须传 conn
    return { id: 0 };
  }
  async function listTaskComments(conn, taskId) {
    return fetchAll(conn,
      'SELECT c.*, u.display_name AS operator_name FROM project_task_comments c LEFT JOIN users u ON u.id=c.operator_id ' +
      'WHERE c.task_id=? ORDER BY c.id', [taskId]);
  }
  async function deleteComment(conn, id) {
    const sql = 'DELETE FROM project_task_comments WHERE id=?';
    if (conn) {
      const r = await conn.execute(sql, [id]);
      return { changed: r[0].affectedRows };
    }
    await run(sql, [id]); // 无事务仅执行
    return { changed: 1 };
  }

  return { createTask, listProjectTasks, getTask, getTaskDetail, updateTask, deleteTask, listAllTasks, listAllTasksPage, countAllTasks, deleteTaskCascade,
    createSubtask, listSubtasks, updateSubtask, deleteSubtask, casSubtaskStatus, syncSubtaskProgress,
    createComment, listTaskComments, deleteComment };
};
