// shared/middleware/auth.js — 框架鉴权中间件（子系统无关）
const D = require('../../db');

/** session 鉴权守卫，未登录返回 401；账号被停用/删除时销毁会话并拒绝（2026-08-06 批量启停） */
async function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: '未登录' });
  try {
    const u = await D.getUserById(req.session.userId);
    if (!u || u.enabled !== 1) {
      if (req.session) req.session.destroy(function() {});
      return res.status(401).json({ error: '账号已停用或不存在' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: '鉴权校验失败' });
  }
}

/** 获取当前用户完整对象 */
async function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  return D.getUserById(req.session.userId);
}

/** 在 app.locals 上挂载中间件，供各子系统路由使用 */
function mount(app) {
  app.locals.requireAuth = requireAuth;
  app.locals.currentUser = currentUser;
}

module.exports = { requireAuth, currentUser, mount };
