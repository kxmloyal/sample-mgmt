// subsystems/projects/backend/routes-notif.js — 站内通知路由（2026-09-08 方案B-②）
// 纯增量新文件；全部挂 /api/projects/notifications 静态前缀（注册顺序在最前，不被 /:id 抢占）
const D = require('../../../db');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 未读数（轮询轻接口，只回一个数字）
  app.get('/api/projects/notifications/unread', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      res.json({ unread: await D.countUnread(u.id) });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 通知列表（最新 50）
  app.get('/api/projects/notifications', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      res.json(await D.listNotifications(u.id));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 标记已读（body.id 可选；缺省=全部已读）
  app.post('/api/projects/notifications/read', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number((req.body || {}).id) || null;
      await D.markRead(u.id, id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
