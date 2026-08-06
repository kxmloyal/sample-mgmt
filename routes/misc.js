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
    const depts = require('../data/depts.json');
    res.type('js').send(
      '// 由服务端 data/*.json 生成，请勿手动修改\n' +
      'const LIMIT_ITEMS = ' + JSON.stringify(limitItems) + ';\n' +
      'const SOURCE_TYPES = ' + JSON.stringify(sourceTypes) + ';\n' +
      'const DEPTS = ' + JSON.stringify(depts) + ';\n'
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
    if (!['RD', 'ME', 'QA', 'CUSTODY', 'PM'].includes(role)) return res.status(400).json({ error: '角色只能是 RD/ME/QA/CUSTODY/PM' });
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

  // 批量管理用户（ADMIN 专属，2026-08-06）：delete / reset-password / update / enable / disable
  app.post('/api/users/batch', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const { action, ids, password, role, dept } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择账号' });
    const idSet = [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];
    if (!idSet.length) return res.status(400).json({ error: '无效的账号 ID' });

    // 保护账号：当前登录者、id=1、内置 admin（防止误删/锁死）
    const adminUser = await D.getUserByUsername('admin');
    const protectedIds = new Set([u.id, 1, adminUser ? adminUser.id : -1]);
    const deletable = idSet.filter(id => !protectedIds.has(id));

    const ACTIONS = ['delete', 'reset-password', 'update', 'enable', 'disable'];
    if (!ACTIONS.includes(action)) return res.status(400).json({ error: '无效的批量操作类型' });

    // 删除：排除保护账号后执行，物理删除（无外键引用）
    if (action === 'delete') {
      if (!deletable.length) return res.status(400).json({ error: '所选账号均受保护，无法删除' });
      const skipped = idSet.length - deletable.length;
      const count = await D.withTransaction(conn => D.deleteUsers(deletable, conn));
      return res.json({ ok: true, action, count, skipped, protected: skipped > 0 });
    }
    // 重置密码：统一初始密码（可作用于任意账号，含 admin）
    if (action === 'reset-password') {
      if (typeof password !== 'string' || !password.trim()) return res.status(400).json({ error: '请输入新密码' });
      const count = await D.withTransaction(conn => D.resetPasswords(idSet, bcrypt.hashSync(password, 10), conn));
      return res.json({ ok: true, action, count, skipped: 0, protected: false });
    }
    // 改角色/部门：至少一项，role 限定枚举（与单条新增一致）
    if (action === 'update') {
      if (role === undefined && dept === undefined) return res.status(400).json({ error: '请提供角色或部门' });
      if (role !== undefined && !['RD', 'ME', 'QA', 'CUSTODY', 'PM'].includes(role)) return res.status(400).json({ error: '角色只能是 RD/ME/QA/CUSTODY/PM' });
      const count = await D.withTransaction(conn => D.updateUsers(idSet, { role, dept }, conn));
      return res.json({ ok: true, action, count, skipped: 0, protected: false });
    }
    // 启用/禁用：禁用排除保护账号（防锁死），启用可作用于任意账号
    if (action === 'disable') {
      const targets = deletable.length ? deletable : idSet;
      if (!targets.length) return res.status(400).json({ error: '所选账号均受保护，无法禁用' });
      const skipped = idSet.length - targets.length;
      const count = await D.withTransaction(conn => D.setUsersEnabled(targets, 0, conn));
      return res.json({ ok: true, action, count, skipped, protected: skipped > 0 });
    }
    const count = await D.withTransaction(conn => D.setUsersEnabled(idSet, 1, conn));
    return res.json({ ok: true, action, count, skipped: 0, protected: false });
  });

  // 批量导入用户（ADMIN 专属，2026-08-06）：前端 CSV 解析后逐行导入
  // 校验：账号必填/角色枚举/部门字典（data/depts.json）/账号唯一；初始密码留空默认 123456
  // 策略：跳过+失败清单（部分成功，created + skipped + errors = 总行数），单次最多 500 行
  app.post('/api/users/import', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const users = Array.isArray(req.body && req.body.users) ? req.body.users : null;
    if (!users || !users.length) return res.status(400).json({ error: '导入数据为空' });
    if (users.length > 500) return res.status(400).json({ error: '单次最多导入 500 行' });
    const depts = require('../data/depts.json');
    const ROLE_SET = ['RD', 'ME', 'QA', 'CUSTODY', 'PM'];
    const errors = [];
    const valid = [];
    let skipped = 0;
    for (let i = 0; i < users.length; i++) {
      const row = users[i] || {};
      const line = i + 2; // 第 1 行为表头
      const username = String(row.username == null ? '' : row.username).trim();
      const role = String(row.role == null ? '' : row.role).trim();
      const dept = String(row.dept == null ? '' : row.dept).trim();
      const display_name = String(row.display_name == null ? '' : row.display_name).trim();
      const password = String(row.password == null ? '' : row.password).trim() || '123456';
      if (!username) { errors.push({ row: line, username: '', error: '账号必填' }); continue; }
      if (username.length > 50) { errors.push({ row: line, username, error: '账号长度需 ≤50' }); continue; }
      if (!ROLE_SET.includes(role)) { errors.push({ row: line, username, error: '角色只能是 RD/ME/QA/CUSTODY/PM' }); continue; }
      if (dept && !depts.includes(dept)) { errors.push({ row: line, username, error: '部门不在部门字典内' }); continue; }
      if (await D.getUserByUsername(username)) { skipped++; continue; }
      valid.push({ username, display_name, role, dept, password_hash: bcrypt.hashSync(password, 10) });
    }
    let created = 0;
    for (const v of valid) {
      try { await D.createUser(v); created++; }
      catch (e) { errors.push({ row: 0, username: v.username, error: '写入失败: ' + (e.code === 'ER_DUP_ENTRY' ? '账号已存在（并发冲突）' : e.message) }); }
    }
    return res.json({ ok: true, action: 'import', created, skipped, errors });
  });

  // RD 用户列表（供退回指派选择）
  app.get('/api/rd-users', requireAuth, async (req, res) => {
    const users = await D.listUsers();
    const rds = users.filter(u => u.role === 'RD').map(u => ({ id: u.id, display_name: u.display_name || u.username, dept: u.dept }));
    res.json(rds);
  });

  // 门户卡片排序偏好（框架级，用户级个性化；AGENTS.md §21）
  // GET：返回当前用户偏好；无记录返回 { order: [] }
  app.get('/api/portal/prefs', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getPortalPrefs(u.id);
    res.json({ order });
  });

  // PUT：保存偏好（order 为子系统 id 有序数组）；order=[] 或 null 表示清除恢复默认
  // 校验：数组、去重（保序）、仅允许已注册子系统 id（实时扫描 subsystems/）
  app.put('/api/portal/prefs', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const body = req.body || {};
    if (body.order == null || (Array.isArray(body.order) && body.order.length === 0)) {
      await D.deletePortalPrefs(u.id);
      return res.json({ ok: true, order: [] });
    }
    if (!Array.isArray(body.order)) return res.status(400).json({ error: 'order 必须为子系统 id 数组' });
    const seen = {};
    const ids = [];
    body.order.forEach(id => {
      if (typeof id === 'string' && !seen[id]) { seen[id] = true; ids.push(id); }
    });
    const { scanSubsystems } = require('./subsystems');
    const validIds = Object.keys(scanSubsystems());
    if (!ids.every(id => validIds.includes(id))) return res.status(400).json({ error: 'order 包含未注册的子系统 id' });
    await D.upsertPortalPrefs(u.id, ids);
    res.json({ ok: true, order: ids });
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
