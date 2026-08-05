// routes/misc.js — 看板 / 日志 / 用户管理 / 健康检查 / 共享常量
const bcrypt = require('bcryptjs');
const D = require('../db');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 共享常量（前端脚本，数据源为 data/*.json）
  app.get('/js/shared-constants.js', (req, res) => {
    const limitItems = require('../data/limit-items.json');
    const sourceTypes = require('../data/source-types.json');
    res.type('js').send(
      '// 由服务端 data/*.json 生成，请勿手动修改\n' +
      'const LIMIT_ITEMS = ' + JSON.stringify(limitItems) + ';\n' +
      'const SOURCE_TYPES = ' + JSON.stringify(sourceTypes) + ';\n'
    );
  });

  // 看板
  app.get('/api/dashboard', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    var [rows, overdue, dueSoon, myPending] = await Promise.all([
      D.countSamplesByStatus(),
      D.listOverdueSamples(),
      D.listDueSoonSamples(),
      D.listMyPendingSamples(u.role, u.id)
    ]);
    var byStatus = { NEW: 0, PRODUCED: 0, RELEASED: 0, IN_CUSTODY: 0, RETURNING: 0, RETIRED: 0 };
    var total = 0;
    for (var _i = 0; _i < rows.length; _i++) { var r = rows[_i]; byStatus[r.status] = Number(r.cnt); total += Number(r.cnt); }
    res.json({ byStatus, total, overdue, dueSoon, myPending, role: u.role, dept: u.dept, display_name: u.display_name });
  });

  // 日志（ADMIN 专属）
  app.get('/api/logs', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可查看全量操作日志' });
    res.json(await D.listLogs());
  });

  // 用户管理（ADMIN）
  app.get('/api/users', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    res.json(await D.listUsers());
  });

  app.post('/api/users', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const { username, password, role, dept, display_name } = req.body || {};
    if (!username || !password || !role) return res.status(400).json({ error: '账号/密码/角色必填' });
    if (await D.getUserByUsername(username)) return res.status(409).json({ error: '账号已存在' });
    if (!['RD', 'ME', 'QA', 'CUSTODY'].includes(role)) return res.status(400).json({ error: '角色只能是 RD/ME/QA/CUSTODY' });
    const created = await D.createUser({ username, password_hash: bcrypt.hashSync(password, 10), role, dept: dept || '', display_name: display_name || '' });
    res.json(created);
  });

  // 修改用户（ADMIN 专属）：姓名 / 密码，至少一项；账号 username 不可变
  app.put('/api/users/:id', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: '无效用户 ID' });
    const target = await D.getUserById(id);
    if (!target) return res.status(404).json({ error: '用户不存在' });
    const { display_name, password } = req.body || {};
    const fields = {};
    if (display_name !== undefined) {
      if (typeof display_name !== 'string' || display_name.length > 50) return res.status(400).json({ error: '姓名长度需 ≤50 字符' });
      fields.display_name = display_name.trim();
    }
    if (password !== undefined) {
      if (typeof password !== 'string' || !password.trim()) return res.status(400).json({ error: '密码不能为空' });
      fields.password_hash = bcrypt.hashSync(password, 10);
    }
    if (!Object.keys(fields).length) return res.status(400).json({ error: '请至少提供姓名或新密码' });
    res.json(await D.updateUser(id, fields));
  });

  // RD 用户列表（供退回指派选择）
  app.get('/api/rd-users', requireAuth, async (req, res) => {
    const users = await D.listUsers();
    const rds = users.filter(u => u.role === 'RD').map(u => ({ id: u.id, display_name: u.display_name || u.username, dept: u.dept }));
    res.json(rds);
  });

  // 健康检查
  app.get('/health', (req, res) => {
    const pool = D.pool();
    const dbReady = pool && pool.pool && pool.pool._allConnections;
    res.json({
      status: pool ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage().rss,
      db: pool ? 'connected' : 'disconnected'
    });
  });
}

module.exports = { register };
