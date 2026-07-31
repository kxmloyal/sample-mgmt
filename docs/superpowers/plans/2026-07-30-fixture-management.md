# 治具管理系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为制造品质管理系统新增治具管理子系统，覆盖申请→制作→验证移交→领用→维修→报废全生命周期。

**Architecture:** 独立子应用 fixture.html + 独立路由 routes/fixtures.js + 独立 DAO db/fixtures.js，与样品系统共用 MariaDB、session 鉴权、CSS 变量。

**Tech Stack:** 原生 HTML/CSS/JS + Express + MariaDB(mysql2)，复用现有模式。

---

### Task 1: 数据库 — fixtures 表 + fixture_logs 表

**Files:**
- Modify: `db.js:31-106` (init 中添加建表)
- Create: `db/fixtures.js`

- [ ] **Step 1: 在 db.js 的 init() 中添加 fixtures 建表**

在 `scan_logs` 建表之后、`} finally {` 之前，插入：

```sql
await conn.execute(`
  CREATE TABLE IF NOT EXISTS fixtures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fixture_no VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(200) NOT NULL,
    spec VARCHAR(200),
    model VARCHAR(100),
    station VARCHAR(100),
    category VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
    -- 申请
    requested_by INT,
    requested_dept VARCHAR(50),
    request_note TEXT,
    request_image VARCHAR(300),
    -- 制作
    made_by INT,
    made_at DATETIME,
    made_note TEXT,
    made_image VARCHAR(300),
    -- 验证移交
    verified_rd INT,
    verified_rd_at DATETIME,
    verified_me INT,
    verified_me_at DATETIME,
    transferred_at DATETIME,
    verify_note TEXT,
    -- 领用
    used_by INT,
    used_at DATETIME,
    use_location VARCHAR(100),
    expected_return_days INT DEFAULT NULL,
    expected_return_at DATETIME DEFAULT NULL,
    use_note TEXT,
    -- 维修
    repair_type VARCHAR(10),
    repair_requested_by INT,
    repair_requested_at DATETIME,
    repair_note TEXT,
    repaired_by INT,
    repaired_at DATETIME,
    repair_done_image VARCHAR(300),
    repair_confirmed_by INT,
    repair_confirmed_at DATETIME,
    -- 报废
    retired_by INT,
    retired_at DATETIME,
    retired_reason TEXT,
    -- 通用
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_fixtures_status (status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);

await conn.execute(`
  CREATE TABLE IF NOT EXISTS fixture_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    fixture_id INT NOT NULL,
    action VARCHAR(30) NOT NULL,
    role VARCHAR(20),
    user_id INT,
    dept VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_flogs_fixture (fixture_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
`);
```

- [ ] **Step 2: 创建 db/fixtures.js（数据访问层）**

```js
// db/fixtures.js — 治具 CRUD（工厂模式：接收 { q, one, dbRef, persist, nowISO }）
module.exports = function({ q, one, dbRef, persist, nowISO }) {
  async function nextFixtureNo() {
    const row = await one('SELECT COALESCE(MAX(id), 0) AS m FROM fixtures');
    return 'FJ-' + String(row.m + 1).padStart(6, '0');
  }
  async function createFixture({ name, spec, model, station, category, requested_by, requested_dept, request_note, request_image, notes }) {
    const ns = await nextFixtureNo();
    await dbRef.run(`INSERT INTO fixtures (fixture_no,name,spec,model,station,category,status,requested_by,requested_dept,request_note,request_image,notes)
      VALUES (?,?,?,?,?,?,'REQUESTED',?,?,?,?,?)`,
      [ns, name||null, spec||null, model||null, station||null, category||null, requested_by||null, requested_dept||null, request_note||null, request_image||null, notes||null]);
    persist();
    return await getFixtureByNo(ns);
  }
  function getFixtureById(id) { return one('SELECT * FROM fixtures WHERE id = ?', [id]); }
  function getFixtureByNo(fixture_no) { return one('SELECT * FROM fixtures WHERE fixture_no = ?', [fixture_no]); }
  function listFixtures({ status, dept, search, overdue } = {}) {
    const where = []; const params = [];
    if (status) { var statuses = status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (dept) { where.push('requested_dept = ?'); params.push(dept); }
    if (search) { where.push('(fixture_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
    if (overdue === '1') { where.push("status='IN_USE' AND expected_return_at IS NOT NULL AND expected_return_at < NOW()"); }
    const sql = 'SELECT * FROM fixtures' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY id DESC';
    return q(sql, params);
  }
  async function updateFixture(updated) {
    await dbRef.run(`UPDATE fixtures SET name=?,spec=?,model=?,station=?,category=?,status=?,requested_by=?,requested_dept=?,
      request_note=?,request_image=?,made_by=?,made_at=?,made_note=?,made_image=?,
      verified_rd=?,verified_rd_at=?,verified_me=?,verified_me_at=?,transferred_at=?,verify_note=?,
      used_by=?,used_at=?,use_location=?,expected_return_days=?,expected_return_at=?,use_note=?,
      repair_type=?,repair_requested_by=?,repair_requested_at=?,repair_note=?,repaired_by=?,repaired_at=?,
      repair_done_image=?,repair_confirmed_by=?,repair_confirmed_at=?,retired_by=?,retired_at=?,retired_reason=?,
      notes=?,updated_at=NOW() WHERE id=?`,
      [updated.name||null,updated.spec||null,updated.model||null,updated.station||null,updated.category||null,
       updated.status||'REQUESTED',updated.requested_by||null,updated.requested_dept||null,
       updated.request_note||null,updated.request_image||null,updated.made_by||null,updated.made_at||null,updated.made_note||null,updated.made_image||null,
       updated.verified_rd||null,updated.verified_rd_at||null,updated.verified_me||null,updated.verified_me_at||null,updated.transferred_at||null,updated.verify_note||null,
       updated.used_by||null,updated.used_at||null,updated.use_location||null,updated.expected_return_days||null,updated.expected_return_at||null,updated.use_note||null,
       updated.repair_type||null,updated.repair_requested_by||null,updated.repair_requested_at||null,updated.repair_note||null,updated.repaired_by||null,updated.repaired_at||null,
       updated.repair_done_image||null,updated.repair_confirmed_by||null,updated.repair_confirmed_at||null,updated.retired_by||null,updated.retired_at||null,updated.retired_reason||null,
       updated.notes||null,updated.id]);
    persist();
    return await getFixtureById(updated.id);
  }
  async function addFixtureLog({ fixture_id, action, role, user_id, dept, note }) {
    await dbRef.run('INSERT INTO fixture_logs (fixture_id,action,role,user_id,dept,note) VALUES (?,?,?,?,?,?)',
      [fixture_id, action, role||null, user_id||null, dept||null, note||null]);
    persist();
  }
  function listFixtureLogs() { return q('SELECT fl.*,u.username,u.display_name FROM fixture_logs fl LEFT JOIN users u ON u.id=fl.user_id ORDER BY fl.id DESC'); }
  return { nextFixtureNo, createFixture, getFixtureById, getFixtureByNo, listFixtures, updateFixture, addFixtureLog, listFixtureLogs };
};
```

- [ ] **Step 3: 在 db.js 中注册 fixtures DAO**

在 `const logs = require('./db/logs')(...)` 之后添加：

```js
const fixtures = require('./db/fixtures')({ q, one, dbRef, persist, nowISO });
```

并在 `module.exports` 的展开中添加 `...fixtures`：

```js
module.exports = {
  init, ready, pool: getPool, nowISO,
  ...users, ...samples, ...logs, ...fixtures
};
```

- [ ] **Step 4: 重启服务并验证建表**

```bash
# 重启后检查表是否存在
node -e "require('dotenv').config();const D=require('./db');(async()=>{await D.init();const r=await require('./db').q('SHOW TABLES LIKE \"fixture%\"');console.log(r);})()"
```

Expected: `[{Tables_in_sample_mgmt: 'fixtures'}, {Tables_in_sample_mgmt: 'fixture_logs'}]`

- [ ] **Step 5: Commit**

```bash
git add db.js db/fixtures.js
git commit -m "feat(fixture): add fixtures and fixture_logs tables with DAO layer"
```

---

### Task 2: 后端路由 — routes/fixtures.js

**Files:**
- Create: `routes/fixtures.js`

- [ ] **Step 1: 创建 fixtures 路由（含状态机）**

```js
// routes/fixtures.js — 治具路由：CRUD + 扫码状态机
const D = require('../db');

const STATUS_LABEL = {
  REQUESTED: '已申请', IN_PROGRESS: '制作中', VERIFY_PENDING: '待双人验证',
  VERIFY_RD_OK: 'RD已确认(待ME)', VERIFY_ME_OK: 'ME已确认(待RD)',
  TRANSFERRED: '已移交', IN_USE: '领用中', REPAIRING_ME: 'ME维修中',
  REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成(待ME确认)', RETIRED: '已报废'
};

function allowedActions(role, status, currentUserId) {
  const actions = [];
  if (role === 'RD' && status === 'REQUESTED') actions.push('MAKE');
  if (role === 'RD' && (status === 'VERIFY_PENDING' || status === 'VERIFY_ME_OK')) actions.push('VERIFY_RD');
  if (role === 'ME' && (status === 'VERIFY_PENDING' || status === 'VERIFY_RD_OK')) actions.push('VERIFY_ME');
  if (role === 'ME' && status === 'TRANSFERRED') actions.push('USE');
  if (role === 'ME' && status === 'IN_USE') { actions.push('REPAIR_ME'); actions.push('REPAIR_RD_REQ'); }
  if (role === 'RD' && status === 'IN_USE') actions.push('REPAIR_ME');
  if (role === 'ME' && status === 'REPAIRING_ME') actions.push('REPAIR_DONE');
  if (role === 'RD' && status === 'REPAIRING_RD') actions.push('REPAIR_RD_DONE');
  if (role === 'ME' && status === 'REPAIR_DONE') actions.push('REPAIR_CONFIRM');
  if (role === 'ADMIN' && (status === 'IN_USE' || status === 'TRANSFERRED')) actions.push('RETIRE');
  return actions;
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  const saveSampleImage = app.locals.saveSampleImage;

  // 清单
  app.get('/api/fixtures', requireAuth, async (req, res) => {
    const { status, dept, search, overdue } = req.query;
    res.json(await D.listFixtures({ status, dept, search, overdue }));
  });

  // 详情
  app.get('/api/fixtures/:id', requireAuth, async (req, res) => {
    const f = await D.getFixtureById(Number(req.params.id));
    if (!f) return res.status(404).json({ error: '治具不存在' });
    res.json(f);
  });

  // 新建申请
  app.post('/api/fixtures', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const { name, spec, model, station, category, request_note, notes } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '治具名称必填' });
    const f = await D.createFixture({ name: name.trim(), spec, model, station, category, requested_by: u.id, requested_dept: u.dept, request_note, notes });
    await D.addFixtureLog({ fixture_id: f.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '新建申请' });
    res.json(f);
  });

  // 看板
  app.get('/api/fixtures/dashboard', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const all = await D.listFixtures({});
    const byStatus = {}; for (const f of all) byStatus[f.status] = (byStatus[f.status] || 0) + 1;
    const overdue = all.filter(f => f.status === 'IN_USE' && f.expected_return_at && new Date(f.expected_return_at).getTime() < Date.now());
    let myPending = all.filter(f => {
      if (u.role === 'RD') return ['REQUESTED', 'VERIFY_PENDING', 'VERIFY_ME_OK', 'REPAIRING_RD'].includes(f.status);
      if (u.role === 'ME') return ['VERIFY_PENDING', 'VERIFY_RD_OK', 'TRANSFERRED', 'REPAIRING_ME', 'REPAIR_DONE'].includes(f.status);
      if (u.role === 'ADMIN') return true;
      return f.requested_by === u.id;
    });
    res.json({ byStatus, total: all.length, overdue, myPending, role: u.role, dept: u.dept });
  });

  // 操作日志
  app.get('/api/fixtures/logs', requireAuth, async (req, res) => {
    res.json(await D.listFixtureLogs());
  });

  // 扫码状态机（统一入口）
  app.post('/api/fixtures/scan', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const { code, note, location, days } = req.body || {};
    const fixtureNo = (code || '').trim();
    if (!fixtureNo) return res.status(400).json({ error: '未提供治具编号' });

    const f = await D.getFixtureByNo(fixtureNo);
    if (!f) return res.status(404).json({ error: '未找到治具：' + fixtureNo });

    const actions = allowedActions(u.role, f.status, u.id);
    const chosenAction = (req.body.action || '').trim() || actions[0];
    if (!chosenAction || !actions.includes(chosenAction))
      return res.status(409).json({ error: '当前角色(' + u.role + ')无法对状态「' + (STATUS_LABEL[f.status]||f.status) + '」执行「' + chosenAction + '」操作', fixture: f });

    const ts = D.nowISO();
    const updated = { ...f };

    if (chosenAction === 'MAKE') {
      const img = req.body.image;
      if (img && typeof img === 'string') {
        const url = saveSampleImage(img, f.fixture_no + '_made');
        if (url) updated.made_image = url;
      }
      updated.made_by = u.id; updated.made_at = ts;
      updated.status = 'IN_PROGRESS';
      await D.addFixtureLog({ fixture_id: f.id, action: 'MAKE', role: u.role, user_id: u.id, dept: u.dept, note: note || '制作完成' });
      // 制作完成后自动进入验证
      updated.status = 'VERIFY_PENDING';
      await D.addFixtureLog({ fixture_id: f.id, action: 'MAKE_DONE', role: u.role, user_id: u.id, dept: u.dept, note: '进入双人验证' });
    } else if (chosenAction === 'VERIFY_RD') {
      updated.verified_rd = u.id; updated.verified_rd_at = ts; updated.verify_note = note || '';
      updated.status = f.status === 'VERIFY_ME_OK' ? 'TRANSFERRED' : 'VERIFY_RD_OK';
      if (updated.status === 'TRANSFERRED') updated.transferred_at = ts;
      await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY_RD', role: u.role, user_id: u.id, dept: u.dept, note: updated.status === 'TRANSFERRED' ? '双人验证完成，已移交' : 'RD验证通过，待ME验证' });
    } else if (chosenAction === 'VERIFY_ME') {
      updated.verified_me = u.id; updated.verified_me_at = ts; updated.verify_note = note || '';
      updated.status = f.status === 'VERIFY_RD_OK' ? 'TRANSFERRED' : 'VERIFY_ME_OK';
      if (updated.status === 'TRANSFERRED') updated.transferred_at = ts;
      await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY_ME', role: u.role, user_id: u.id, dept: u.dept, note: updated.status === 'TRANSFERRED' ? '双人验证完成，已移交' : 'ME验证通过，待RD验证' });
    } else if (chosenAction === 'USE') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写使用位置' });
      const d = Number(days); if (!d || d <= 0) return res.status(400).json({ error: '请填写预计使用天数' });
      updated.used_by = u.id; updated.used_at = ts; updated.use_location = location.trim();
      updated.expected_return_days = d;
      const ed = new Date(ts); ed.setDate(ed.getDate() + d);
      updated.expected_return_at = ed.toISOString(); updated.use_note = note || '';
      updated.status = 'IN_USE';
      await D.addFixtureLog({ fixture_id: f.id, action: 'USE', role: u.role, user_id: u.id, dept: u.dept, note: '领用，预计' + d + '天后归还' });
    } else if (chosenAction === 'REPAIR_ME') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写维修说明' });
      updated.repair_type = 'ME'; updated.repair_requested_by = u.id; updated.repair_requested_at = ts; updated.repair_note = note.trim();
      updated.status = 'REPAIRING_ME';
      await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_ME', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    } else if (chosenAction === 'REPAIR_RD_REQ') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写故障说明' });
      updated.repair_type = 'RD'; updated.repair_requested_by = u.id; updated.repair_requested_at = ts; updated.repair_note = note.trim();
      updated.status = 'REPAIRING_RD';
      await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_RD_REQ', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    } else if (chosenAction === 'REPAIR_DONE') {
      updated.repaired_by = u.id; updated.repaired_at = ts;
      // ME自行维修完成后直接回移交
      updated.status = 'TRANSFERRED';
      await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_DONE', role: u.role, user_id: u.id, dept: u.dept, note: note || 'ME维修完成，已交回' });
    } else if (chosenAction === 'REPAIR_RD_DONE') {
      const img = req.body.image;
      if (img && typeof img === 'string') {
        const url = saveSampleImage(img, f.fixture_no + '_repair');
        if (url) updated.repair_done_image = url;
      }
      updated.repaired_by = u.id; updated.repaired_at = ts;
      updated.status = 'REPAIR_DONE';
      await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_RD_DONE', role: u.role, user_id: u.id, dept: u.dept, note: note || 'RD维修完成，待ME确认' });
    } else if (chosenAction === 'REPAIR_CONFIRM') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写确认说明' });
      updated.repair_confirmed_by = u.id; updated.repair_confirmed_at = ts;
      updated.status = 'TRANSFERRED';
      updated.expected_return_days = null; updated.expected_return_at = null;
      await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_CONFIRM', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    } else if (chosenAction === 'RETIRE') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写作废原因' });
      updated.status = 'RETIRED'; updated.retired_by = u.id; updated.retired_at = ts; updated.retired_reason = note.trim();
      await D.addFixtureLog({ fixture_id: f.id, action: 'RETIRE', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    }

    const result = await D.updateFixture(updated);
    res.json({ fixture: result, action: chosenAction, message: '操作成功：' + chosenAction });
  });
}

module.exports = { register };
```

- [ ] **Step 2: 在 server.js 注册路由**

在 `require('./routes/misc').register(app);` 之后添加：

```js
require('./routes/fixtures').register(app);
```

- [ ] **Step 3: 重启并验证路由**

```bash
curl -s http://localhost:4000/api/fixtures | head -c 50
```

Expected: `[]` (空列表，表已就绪)

- [ ] **Step 4: Commit**

```bash
git add routes/fixtures.js server.js
git commit -m "feat(fixture): add fixtures router with state machine and dual verification"
```

---

### Task 3: 前端 SPA — fixture.html + fixture-api.js

**Files:**
- Create: `public/fixture.html`
- Create: `public/js/fixture-api.js`

- [ ] **Step 1: 创建 fixture.html（治具 SPA 入口）**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%232563eb'/><text x='16' y='22' text-anchor='middle' fill='white' font-size='18' font-family='sans-serif'>M</text></svg>" />
<title>制造品质管理系统 - 治具管理</title>
<link rel="stylesheet" href="/css/app.css" />
</head>
<body>

<div id="login" style="display:none">
  <div class="login-card">
    <h1>制造品质管理系统</h1>
    <p class="sub">治具管理</p>
    <label>账号</label>
    <input id="lg-user" placeholder="如 rd01 / me01 / admin" />
    <label>密码</label>
    <input id="lg-pass" type="password" placeholder="密码" onkeydown="if(event.key==='Enter')doLogin()" />
    <button class="btn" style="width:100%;margin-top:18px" onclick="doLogin()">登录</button>
    <div class="login-err" id="lg-err"></div>
  </div>
</div>

<div id="app" style="display:none">
  <div class="side">
    <div class="logo">治具管理</div>
    <div class="nav" id="nav"></div>
    <div class="me">
      <div><b id="me-name"></b></div>
      <div id="me-role" class="muted"></div>
      <button class="btn ghost sm" style="margin-top:8px" onclick="doLogout()">退出登录</button>
    </div>
  </div>
  <div class="main">
    <div class="topbar"><h2 id="page-title"></h2><div id="page-actions"></div></div>
    <div id="view"></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script src="/js/constants.js"></script>
<script src="/js/fixture-api.js"></script>
<script src="/js/fixture-dashboard.js"></script>
<script src="/js/fixture-list.js"></script>
<script src="/js/fixture-scan.js"></script>
<script src="/js/fixture-router.js"></script>
<script>
window.addEventListener('hashchange',routeFixture);
bootFixture();
</script>
</body>
</html>
```

- [ ] **Step 2: 创建 fixture-api.js（API 封装）**

```js
// fixture-api.js — 治具 API 请求 + 鉴权
let me = null;

async function api(method, url, body) {
  const opt = { method, credentials: 'include', headers: {} };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  const text = await r.text();
  var data = {};
  try { data = JSON.parse(text); } catch (e) { data = {}; }
  if (!r.ok) throw new Error(data.error || ('错误 ' + r.status));
  return data;
}
function $(sel) { return document.querySelector(sel); }
const ROLE = { ADMIN: '管理员', RD: '研发工程', QA: '品保', CUSTODY: '保管', ME: '生技' };
const STATUS = { REQUESTED: '已申请', IN_PROGRESS: '制作中', VERIFY_PENDING: '待双人验证', VERIFY_RD_OK: 'RD已确认', VERIFY_ME_OK: 'ME已确认', TRANSFERRED: '已移交', IN_USE: '领用中', REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成', RETIRED: '已报废' };

async function bootFixture() {
  try { me = await api('GET', '/api/me'); showFixtureApp(); }
  catch (e) { $('#login').style.display = 'flex'; }
}
async function doLogin() {
  $('#lg-err').textContent = '';
  try { me = await api('POST', '/api/login', { username: $('#lg-user').value, password: $('#lg-pass').value });
    $('#login').style.display = 'none'; showFixtureApp(); }
  catch (e) { $('#lg-err').textContent = e.message; }
}
async function doLogout() { try { await api('POST', '/api/logout'); } catch (e) {} location.reload(); }

function showFixtureApp() {
  $('#app').style.display = 'flex';
  $('#me-name').textContent = me.display_name || me.username;
  $('#me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
  buildFixtureNav(); routeFixture();
}

function buildFixtureNav() {
  var nav = [
    { hash: '#/dashboard', label: '看板' },
    { hash: '#/list', label: '治具清单' }
  ];
  if (me.role !== 'ADMIN') nav.push({ hash: '#/new', label: '新建申请' });
  nav.push({ hash: '#/scan', label: '扫码台' });
  if (me.role === 'ADMIN') nav.push({ hash: '#/logs', label: '操作日志' });
  $('#nav').innerHTML = nav.map(function (n) {
    return '<a href="' + n.hash + '">' + n.label + '</a>';
  }).join('');
}

function statusBadge(f) {
  var cls = 'b-' + (f.status === 'IN_USE' && isOverdue(f) ? 'overdue' : f.status);
  return '<span class="badge ' + cls + '">' + (STATUS[f.status] || f.status) + '</span>';
}
function isOverdue(f) { return f.status === 'IN_USE' && f.expected_return_at && new Date(f.expected_return_at).getTime() < Date.now(); }
function fmt(t) { if (!t) return '—'; var d = new Date(t); return d.toLocaleString('zh-CN', { hour12: false }); }
```

- [ ] **Step 3: 验证 fixture.html 可访问**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/fixture.html
```

Expected: `200`

- [ ] **Step 4: Commit**

```bash
git add public/fixture.html public/js/fixture-api.js
git commit -m "feat(fixture): add fixture SPA entry and API module"
```

---

### Task 4: 前端模块 — fixture-dashboard.js + fixture-list.js + fixture-scan.js + fixture-router.js

**Files:**
- Create: `public/js/fixture-dashboard.js`
- Create: `public/js/fixture-list.js`
- Create: `public/js/fixture-scan.js`
- Create: `public/js/fixture-router.js`

此 Task 内容较多（4 个前端模块约 400 行），派发 subagent 时需要完整传递每个文件的代码。

> **subagent 分配方式**：可在一个 subagent 中依次创建所有 4 个模块文件，每个文件按其职责写入完整代码。

- [ ] **Step 1: 创建 fixture-router.js（路由）**

```js
// fixture-router.js — 治具页面路由
var VIEWS = {
  dashboard: function () {
    $('#page-title').textContent = '治具看板';
    $('#page-actions').innerHTML = '';
    renderFixtureDashboard();
  },
  list: function () {
    $('#page-title').textContent = '治具清单';
    $('#page-actions').innerHTML = '';
    renderFixtureList();
  },
  'new': function () {
    $('#page-title').textContent = '新建申请';
    $('#page-actions').innerHTML = '';
    renderFixtureNew();
  },
  scan: function () {
    $('#page-title').textContent = '治具扫码台';
    $('#page-actions').innerHTML = '';
    renderFixtureScan();
  },
  logs: function () {
    $('#page-title').textContent = '操作日志';
    $('#page-actions').innerHTML = '';
    renderFixtureLogs();
  }
};
function routeFixture() {
  var h = location.hash || '#/dashboard';
  var page = h.replace('#/', '');
  if (!VIEWS[page]) page = 'dashboard';
  var fn = VIEWS[page];
  if (fn) fn();
  var links = document.querySelectorAll('#nav a');
  links.forEach(function (a) { a.classList.remove('active'); if (a.getAttribute('href') === h) a.classList.add('active'); });
}
```

- [ ] **Step 2: 创建 fixture-dashboard.js（看板）**

看板显示治具状态统计 + RD/ME 待办数量 + 逾期治具列表，与样品看板结构一致。

```js
// fixture-dashboard.js — 治具看板
async function renderFixtureDashboard() {
  var d = await api('GET', '/api/fixtures/dashboard');
  var s = d.byStatus;
  var html = '<div class="dash-stats">';
  html += '<div class="stat"><b>' + (d.myPending.length) + '</b><span>待处理</span></div>';
  html += '<div class="stat"><b>' + (s.REQUESTED || 0) + '</b><span>已申请</span></div>';
  html += '<div class="stat"><b>' + (s.VERIFY_PENDING || 0) + '</b><span>待验证</span></div>';
  html += '<div class="stat"><b>' + (s.IN_USE || 0) + '</b><span>领用中</span></div>';
  html += '</div>';

  if (d.overdue.length > 0) {
    html += '<h3 style="margin-top:20px">逾期未归还</h3>';
    html += '<div class="samples-grid">';
    d.overdue.forEach(function (f) {
      html += '<div class="sample-card overdue"><b>' + f.fixture_no + '</b> ' + (f.name || '—') + '<br><small>领用人：' + (f.used_by || '—') + ' | 预计归还：' + fmt(f.expected_return_at) + '</small></div>';
    });
    html += '</div>';
  }

  if (d.myPending.length > 0) {
    html += '<h3 style="margin-top:20px">我的待办</h3>';
    html += '<div class="samples-grid">';
    d.myPending.forEach(function (f) {
      html += '<div class="sample-card"><b>' + f.fixture_no + '</b> <span class="badge">' + (STATUS[f.status] || f.status) + '</span><br>' + (f.name || '—') + '</div>';
    });
    html += '</div>';
  }
  $('#view').innerHTML = html;
}
```

- [ ] **Step 3: 创建 fixture-list.js（清单 + 新建申请）**

清单页支持按状态、部门筛选 + 搜索，逾期行高亮。新建申请表单内联。

```js
// fixture-list.js — 治具清单 + 新建申请
var fixtureListState = { status: '', dept: '', search: '' };

async function renderFixtureList() {
  var params = new URLSearchParams(fixtureListState).toString();
  var fixtures = await api('GET', '/api/fixtures?' + params);
  var html = '<div style="margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap">';
  html += '<select onchange="fixtureListState.status=this.value;renderFixtureList()" style="width:auto"><option value="">全部状态</option>';
  Object.keys(STATUS).forEach(function (k) {
    html += '<option value="' + k + '"' + (fixtureListState.status === k ? ' selected' : '') + '>' + STATUS[k] + '</option>';
  });
  html += '</select>';
  html += '<input placeholder="搜索编号/名称/规格" value="' + (fixtureListState.search || '') + '" oninput="fixtureListState.search=this.value;renderFixtureList()" style="width:200px" />';
  html += '</div>';

  if (fixtures.length === 0) { html += '<div class="hint">暂无治具数据</div>'; }
  else {
    html += '<table class="samples-table"><thead><tr><th>编号</th><th>名称</th><th>规格</th><th>部门</th><th>状态</th><th>更新时间</th></tr></thead><tbody>';
    fixtures.forEach(function (f) {
      var cls = isOverdue(f) ? ' class="overdue-row"' : '';
      html += '<tr' + cls + '><td>' + f.fixture_no + '</td><td>' + (f.name || '—') + '</td><td>' + (f.spec || '—') + '</td><td>' + (f.requested_dept || '—') + '</td><td>' + statusBadge(f) + '</td><td><small>' + fmt(f.updated_at) + '</small></td></tr>';
    });
    html += '</tbody></table>';
  }
  $('#view').innerHTML = html;
}

async function renderFixtureNew() {
  var html = '<form id="fixture-new-form" onsubmit="submitFixtureNew(event)" style="max-width:500px">';
  html += '<label>治具名称<span style="color:var(--bad)">*</span></label><input id="fn-name" required />';
  html += '<label>规格</label><input id="fn-spec" />';
  html += '<label>型号</label><input id="fn-model" />';
  html += '<label>对应工站</label><input id="fn-station" />';
  html += '<label>分类</label><input id="fn-category" placeholder="如测试治具/装配治具" />';
  html += '<label>申请说明</label><textarea id="fn-note" rows="3"></textarea>';
  html += '<button class="btn" type="submit" style="margin-top:16px">提交申请</button>';
  html += '</form>';
  $('#view').innerHTML = html;
}

async function submitFixtureNew(e) {
  e.preventDefault();
  try {
    var body = {
      name: $('#fn-name').value, spec: $('#fn-spec').value, model: $('#fn-model').value,
      station: $('#fn-station').value, category: $('#fn-category').value, request_note: $('#fn-note').value
    };
    var f = await api('POST', '/api/fixtures', body);
    alert('申请成功：' + f.fixture_no);
    location.hash = '#/list';
  } catch (err) { alert(err.message); }
}
```

- [ ] **Step 4: 创建 fixture-scan.js（扫码台）**

扫码台：显示治具信息 + 允许操作按钮 + 领用强填使用位置和天数。

```js
// fixture-scan.js — 治具扫码台
async function renderFixtureScan() {
  $('#view').innerHTML = '<label>扫描/输入治具编号</label><input id="scan-code" placeholder="FJ-000001" onkeydown="if(event.key===\'Enter\')doScanFix()" /><button class="btn" style="margin-top:8px" onclick="doScanFix()">查询</button><div id="scan-result"></div>';
}

async function doScanFix() {
  var code = $('#scan-code').value.trim(); if (!code) return alert('请输入治具编号');
  try {
    var f = await api('GET', '/api/fixtures/scan?code=' + encodeURIComponent(code));
    showFixActions(f);
  } catch (e) { alert(e.message); }
}

function showFixActions(result) {
  var f = result.fixture, actions = result.allowedActions;
  var html = '<div class="sample-card" style="margin-top:12px">';
  html += '<b>' + f.fixture_no + '</b> ' + (f.name || '—') + '<br>';
  html += '状态：' + (STATUS[f.status] || f.status);
  if (f.expected_return_at) html += ' | 预计归还：' + fmt(f.expected_return_at);
  html += '</div>';

  if (actions.length === 0) { html += '<p style="margin-top:12px;color:var(--muted)">当前角色无可执行操作</p>'; }
  else {
    html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">';
    actions.forEach(function (a) {
      html += '<button class="btn" onclick="execFixAction(\'' + f.fixture_no + '\',\'' + a + '\')">' + a + '</button>';
    });
    html += '</div>';
    html += '<div id="fix-action-form" style="margin-top:12px"></div>';
  }
  $('#scan-result').innerHTML = html;
}

function execFixAction(fixtureNo, action) {
  var formHtml = '';
  if (['USE'].includes(action)) {
    formHtml = '<label>使用位置<span style="color:var(--bad)">*</span></label><input id="fx-location" placeholder="生产线/工位" />';
    formHtml += '<label>预计使用天数<span style="color:var(--bad)">*</span></label><input id="fx-days" type="number" min="1" placeholder="如 30" />';
  }
  if (['REPAIR_ME', 'REPAIR_RD_REQ', 'REPAIR_CONFIRM', 'RETIRE'].includes(action)) {
    formHtml += '<label>说明<span style="color:var(--bad)">*</span></label><textarea id="fx-note" rows="2" placeholder="请填写说明"></textarea>';
  }
  formHtml += '<button class="btn" style="margin-top:8px" onclick="submitFixAction(\'' + fixtureNo + '\',\'' + action + '\')">确认执行</button>';
  $('#fix-action-form').innerHTML = formHtml;
}

async function submitFixAction(fixtureNo, action) {
  var body = { code: fixtureNo, action: action };
  var loc = document.getElementById('fx-location');
  var days = document.getElementById('fx-days');
  var note = document.getElementById('fx-note');
  if (loc) body.location = loc.value;
  if (days) body.days = Number(days.value);
  if (note) body.note = note.value;
  try {
    var r = await api('POST', '/api/fixtures/scan', body);
    alert('操作成功：' + r.message);
    renderFixtureScan(); document.getElementById('scan-code').value = '';
  } catch (e) { alert(e.message); }
}

async function renderFixtureLogs() {
  var logs = await api('GET', '/api/fixtures/logs');
  var html = '<table class="samples-table"><thead><tr><th>时间</th><th>治具</th><th>动作</th><th>用户</th><th>备注</th></tr></thead><tbody>';
  logs.forEach(function (l) {
    html += '<tr><td><small>' + fmt(l.created_at) + '</small></td><td>' + (l.fixture_id || '—') + '</td><td>' + l.action + '</td><td>' + (l.display_name || l.username || '—') + '</td><td>' + (l.note || '—') + '</td></tr>';
  });
  html += '</tbody></table>';
  $('#view').innerHTML = html;
}
```

- [ ] **Step 5: 验证 fixture.html 前端加载不报错**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/fixture.html
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/js/fixture-api.js
```

Expected: all `200`

- [ ] **Step 6: Commit**

```bash
git add public/js/fixture-dashboard.js public/js/fixture-list.js public/js/fixture-scan.js public/js/fixture-router.js
git commit -m "feat(fixture): add frontend modules (dashboard, list, scan, router)"
```

---

### Task 5: 门户卡片启用 + 端到端验证

**Files:**
- Modify: `public/portal.html:47` (启用治具卡片)

- [ ] **Step 1: 启用 portal.html 治具卡片**

将 disabled 卡片改为可点击链接：

```html
<!-- 修改前 -->
<div class="card disabled">
  <span class="badge">即将上线</span>
  ...
  <span class="btn-enter">敬请期待</span>
</div>

<!-- 修改后 -->
<a class="card" href="/fixture.html">
  <span class="icon">🔧</span>
  <h3>治具管理</h3>
  <p>申请·制作·验证·维修</p>
  <span class="btn-enter">进入系统</span>
</a>
```

- [ ] **Step 2: 端到端验证流程**

1. 访问 `http://localhost:4000/` → 显示门户
2. 点击「治具管理」→ 进入 `/fixture.html` → 显示登录页
3. 登录 me01 → 显示治具看板
4. 点击「新建申请」→ 填写信息 → 提交 → 跳转清单页
5. 登录 rd01 → 扫码台 → 输入 FJ-000001 → 制作 → 验证确认
6. 登录 me01 → 扫码台 → 验证确认 → 状态变为 TRANSFERRED
7. me01 领用 → 填位置+天数 → 状态变为 IN_USE
8. ADMIN 登录 → 可执行报废

- [ ] **Step 3: 验证 API 端点**

```bash
# 治具清单
curl -s http://localhost:4000/api/fixtures | head -c 20
# 看板
curl -s http://localhost:4000/api/fixtures/dashboard | head -c 20
```

Expected: 非空 JSON

- [ ] **Step 4: Commit**

```bash
git add public/portal.html
git commit -m "feat(fixture): enable fixture card in portal page"
```

---

## 验证清单

完成后逐项验证：

- [ ] 门户页治具卡片可点击进入 `fixture.html`
- [ ] 新建申请 → 填写名称/规格 → 生成 FJ-000001
- [ ] RD 扫码制作 → 进入双人验证
- [ ] RD + ME 双人扫码完成验证移交
- [ ] ME 扫码领用 → 强制填写使用位置+预计天数
- [ ] 逾期治具在清单中高亮标红
- [ ] 看板显示逾期数量
- [ ] 领用中可报修（ME自行/退回RD）
- [ ] 维修后 ME 确认（退回RD场景）
- [ ] ADMIN 可执行报废
- [ ] 操作日志完整记录
- [ ] 响应式：手机/平板/桌面正常
- [ ] 现有样品功能不受影响（`npm test` 通过）
