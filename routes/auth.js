// routes/auth.js — 鉴权守卫 + 登录/登出
const bcrypt = require('bcryptjs');
const D = require('../db');

function register(app) {
  // 鉴权守卫（导出供其他路由复用）
  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    next();
  }
  async function currentUser(req) {
    if (!req.session.userId) return null;
    return await D.getUserById(req.session.userId);
  }

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });
    const u = await D.getUserByUsername(username);
    if (!u || !bcrypt.compareSync(password, u.password_hash))
      return res.status(401).json({ error: '账号或密码错误' });
    req.session.userId = u.id;
    res.json({ id: u.id, username: u.username, role: u.role, dept: u.dept, display_name: u.display_name });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', async (req, res) => {
    const u = await currentUser(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    res.json({ id: u.id, username: u.username, role: u.role, dept: u.dept, display_name: u.display_name });
  });

  // 挂到 app 上供其他路由模块使用
  app.locals.requireAuth = requireAuth;
  app.locals.currentUser = currentUser;
}

module.exports = { register };
