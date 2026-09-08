// subsystems/projects/db/dao-tdux.js — 任务详情交互强化 DAO（2026-09-08 方案A）
// 子任务排序 + 评论 mentions 读写；独立文件防容量超限
module.exports = function createTdUxDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO, fetchAll = deps.fetchAll, fetchOne = deps.fetchOne;

  // 子任务列表（带 sort 排序 + 指派人/创建人信息，替代旧 listSubtasks 的裸查询口径由路由层渐进切换）
  async function listSubtasksSorted(conn, taskId) {
    return fetchAll(conn,
      'SELECT s.*, u.display_name AS assignee_name, cu.display_name AS creator_name ' +
      'FROM project_subtasks s LEFT JOIN users u ON u.id=s.assignee_id LEFT JOIN users cu ON cu.id=s.created_by ' +
      'WHERE s.task_id=? ORDER BY s.sort, s.id', [taskId]);
  }

  // 子任务排序持久化（整批覆写；ids 顺序即新顺序；仅校验归属任务）
  // 兼容说明：参照 dao.js addMember 形态，conn 存在必须用 conn.execute(sql, params) 完整调用
  async function reorderSubtasks(conn, taskId, ids) {
    const sql = 'UPDATE project_subtasks SET sort=? WHERE id=? AND task_id=?';
    for (let i = 0; i < ids.length; i++) {
      if (conn) await conn.execute(sql, [i + 1, ids[i], taskId]);
      else await run(sql, [i + 1, ids[i], taskId]);
    }
    return { changed: ids.length };
  }

  // 写评论（带 mentions JSON 字符串；返回插入 id）
  async function addCommentMentions(conn, taskId, content, operatorId, mentionsJson) {
    const sql = 'INSERT INTO project_task_comments (task_id,content,operator_id,mentions) VALUES (?,?,?,?)';
    const params = [taskId, content, operatorId, mentionsJson || null];
    const r = await (conn ? conn.execute(sql, params) : run(sql, params));
    return { id: r[0].insertId };
  }

  return { listSubtasksSorted, reorderSubtasks, addCommentMentions };
};
