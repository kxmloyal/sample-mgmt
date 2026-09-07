// subsystems/projects/db/dao-notif.js — 站内通知 DAO（2026-09-08 方案B-②）
// 独立文件防 dao.js 容量超限；工厂形态与 dao-oa/dao-stats 一致
module.exports = function createNotifDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO, fetchAll = deps.fetchAll, fetchOne = deps.fetchOne;

  // 写入一条通知（可传 conn 保证与业务写同事务）
  async function addNotification(conn, n) {
    const sql = 'INSERT INTO project_notifications (user_id,type,title,body,link,ref_type,ref_id) VALUES (?,?,?,?,?,?,?)';
    const params = [n.user_id, n.type, n.title, n.body || '', n.link || '', n.ref_type || '', n.ref_id || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  // 我的未读数
  async function countUnread(userId) {
    const r = await one('SELECT COUNT(*) AS c FROM project_notifications WHERE user_id=? AND is_read=0', [userId]);
    return r ? r.c : 0;
  }

  // 我的通知（最新 50 条；已读未读都返回，前端分区展示）
  async function listNotifications(userId) {
    const rows = await q('SELECT id,type,title,body,link,ref_type,ref_id,is_read,created_at FROM project_notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', [userId]);
    return rows;
  }

  // 标记已读（单条 / 全部；仅本人）
  async function markRead(userId, id) {
    if (id) await run('UPDATE project_notifications SET is_read=1 WHERE user_id=? AND id=?', [userId, id]);
    else await run('UPDATE project_notifications SET is_read=1 WHERE user_id=? AND is_read=0', [userId]);
  }

  return { addNotification, countUnread, listNotifications, markRead };
};
