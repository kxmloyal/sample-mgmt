// routes/auth.js — 鉴权守卫 + 登录/登出
const bcrypt = require('bcryptjs');
const D = require('../db');
const { mount: mountAuth } = require('../shared/middleware/auth');

// 演示模式开关：true=登录页展示演示账号；生产环境通过 .env 设 DEMO_MODE=false 关闭
const DEMO_MODE = process.env.DEMO_MODE === undefined
  ? process.env.NODE_ENV !== 'production'
  : ['true', '1'].includes(String(process.env.DEMO_MODE).toLowerCase());

function register(app) {
  // 挂载共享鉴权中间件（requireAuth/currentUser）
  mountAuth(app);
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 公共配置（登录页渲染前调用，无需鉴权）
  app.get('/api/config', (req, res) => {
    res.json({ demoMode: DEMO_MODE });
  });

  app.post('/api/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });
    const u = await D.getUserByUsername(username);
    if (!u || !bcrypt.compareSync(password, u.password_hash))
      return res.status(401).json({ error: '账号或密码错误' });
    if (u.enabled !== 1)
      return res.status(403).json({ error: '账号已被停用，请联系管理员' });
    req.session.userId = u.id;
    // 防止 session fixation：登录后重新生成 session ID
    req.session.regenerate(function(err) {
      if (err) return res.status(500).json({ error: '会话创建失败' });
      req.session.userId = u.id;
      res.json({ id: u.id, username: u.username, role: u.role, dept: u.dept, display_name: u.display_name });
    });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', async (req, res) => {
    const u = await currentUser(req);
    if (!u || u.enabled !== 1) return res.status(401).json({ error: '未登录或账号已停用' });
    res.json({ id: u.id, username: u.username, role: u.role, dept: u.dept, display_name: u.display_name });
  });
}

module.exports = { register };
