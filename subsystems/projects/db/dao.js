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
      'SELECT t.*, u.display_name AS assignee_name, u.username AS assignee_username ' +
      'FROM project_tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? ORDER BY t.id DESC', [projectId]);
  }
  async function getTask(conn, id) { return fetchOne(conn, 'SELECT * FROM project_tasks WHERE id=?', [id]); }
  async function updateTask(conn, id, data, version) {
    // 乐观锁：WHERE id AND version；匹配成功则 version+1，返回 affectedRows（0=版本冲突）
    const sets = [], params = [];
    const fields = ['title', 'description', 'category', 'priority', 'assignee_id', 'planned_date', 'status', 'progress', 'solution', 'notes', 'actual_date'];
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
    // 跨项目列表（Task 7 使用）；filters: project_id/category/priority/status/assignee_id/overdue
    let sql = 'SELECT t.*, p.name AS project_name, u.display_name AS assignee_name ' +
      'FROM project_tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE 1=1';
    const params = [];
    if (filters.project_id) { sql += ' AND t.project_id=?'; params.push(filters.project_id); }
    if (filters.category) { sql += ' AND t.category=?'; params.push(filters.category); }
    if (filters.priority) { sql += ' AND t.priority=?'; params.push(filters.priority); }
    if (filters.status && filters.status !== 'OVERDUE') { sql += ' AND t.status=?'; params.push(filters.status); }
    if (filters.status === 'OVERDUE') { sql += " AND t.status<>'DONE' AND t.planned_date < CURDATE()"; }
    if (filters.assignee_id) { sql += ' AND t.assignee_id=?'; params.push(filters.assignee_id); }
    sql += ' ORDER BY t.id DESC';
    return fetchAll(conn, sql, params);
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

  // ===== 留痕（全 Task 共用）=====
  async function addProjectLog(conn, entityType, entityId, action, detail, operatorId) {
    const sql = 'INSERT INTO project_logs (entity_type,entity_id,action,detail,operator_id) VALUES (?,?,?,?,?)';
    const params = [entityType, entityId, action, detail || '', operatorId || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  return { fetchOne, fetchAll, createProject, listProjects, getProject, updateProject, deleteProject,
    countProjectTasks, listMembers, addMember, setOwner, removeMember, createTask, addProjectLog,
    listProjectTasks, getTask, updateTask, deleteTask, listAllTasks, deleteTaskCascade };
};
