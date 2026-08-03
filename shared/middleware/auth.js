// shared/middleware/auth.js — 框架鉴权中间件（子系统无关）
const D = require('../../db');

/** session 鉴权守卫，未登录返回 401 */
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: '未登录' });
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
