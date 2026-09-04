// shared/middleware/auth.js — 框架鉴权中间件（子系统无关）
// 2026-09-04 多角色架构（提交①）：currentUser 附加 u.roles[]（用户全部角色，首角色=主角色）；
// u.role 单值字段保留（=主角色），既有 u.role 引用行为零变化；新代码请用 u.roles + hasRole()
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
    // 会话版本校验（2026-09-01 安全专项）：改密后旧会话失效；存量会话无版本号则自动采纳（避免上线即踢全部在线用户）
    if (req.session.sessionVersion === undefined) req.session.sessionVersion = u.session_version;
    else if (req.session.sessionVersion !== u.session_version) {
      if (req.session) req.session.destroy(function() {});
      return res.status(401).json({ error: '会话已失效，请重新登录' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: '鉴权校验失败' });
  }
}

// 角色列表规范化：优先 user_roles 关联表；空/异常时回退 users.role 单值（兼容期防御）
// 异常防御：迁移未跑/表损坏/绕过 DAO 建号时仍保证鉴权可用（roles 至少含 [role]）
async function resolveRoles(u) {
  try {
    const list = await D.getUserRoles(u.id);
    if (Array.isArray(list) && list.length) {
      // 关联表存在但缺当前主角色行（极端不一致）：并入 u.role 保证不丢权限
      return (u.role && list.indexOf(u.role) === -1) ? [u.role].concat(list) : list;
    }
  } catch (e) { /* 回退单角色 */ }
  return [u.role];
}

/** 获取当前用户完整对象（含 roles[] 角色并集） */
async function currentUser(req) {
  if (!req.session || !req.session.userId) return null;
  const u = await D.getUserById(req.session.userId);
  if (!u || u.enabled !== 1) return null;
  // 会话版本校验（与 requireAuth 一致）：存量会话自动采纳，改密后旧会话失效
  if (req.session.sessionVersion === undefined) req.session.sessionVersion = u.session_version;
  else if (req.session.sessionVersion !== u.session_version) return null;
  u.roles = await resolveRoles(u);
  return u;
}

/** 角色判定（多角色统一入口）：命中任一角色即 true；ADMIN 全能放行由调用方按需使用 u.isAdmin */
function hasRole(u, roles) {
  if (!u) return false;
  const list = Array.isArray(roles) ? roles : [roles];
  const mine = u.roles || [u.role];
  return list.some(function(r) { return mine.indexOf(r) !== -1; });
}

/** 在 app.locals 上挂载中间件，供各子系统路由使用 */
function mount(app) {
  app.locals.requireAuth = requireAuth;
  app.locals.currentUser = currentUser;
  app.locals.hasRole = hasRole;
}

module.exports = { requireAuth, currentUser, hasRole, mount };
