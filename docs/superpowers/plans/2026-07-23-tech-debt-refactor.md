# 技术债务修复 — 后端+前端模块拆分 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将超限文件 `server.js`(553行)、`db.js`(20函数)、`scan.js`(11函数)、`api.js`(10函数) 拆分至合规范围，对外接口完全兼容。

**Architecture:** 后端：server.js 拆为 1入口+5路由模块(register模式)，db.js 拆为 1入口+3实体模块(工厂模式)。前端：api.js 常量抽出 constants.js，scan.js 摄像头抽出 camera-helper.js。

**Tech Stack:** Node.js + Express 4.x(CommonJS), SQLite(sql.js), 原生 JS(无构建)

---

## 文件结构

### 后端 — 新建文件
```
routes/auth.js          (~50行)  requireAuth/currentUser + 登录/登出/me
routes/samples.js       (~120行) samples CRUD + saveSampleImage
routes/scan.js          (~100行) resolve + scan 状态机
routes/cards.js         (~140行) /card/:sample_no + 打印/二维码/标签下载
routes/misc.js          (~70行)  dashboard/logs/users + /health
db/users.js             (~35行)  用户 CRUD(工厂模式)
db/samples.js           (~70行)  样品 CRUD(工厂模式)
db/logs.js              (~30行)  日志 CRUD(工厂模式)
```

### 后端 — 修改文件
```
server.js               (553→~120行)  删路由代码,末尾 register 组装
db.js                   (198→~80行)   删 CRUD 函数,组装工厂导出
```

### 前端 — 新建文件
```
public/js/constants.js    (~50行)  STATUS/ROLE/STATIONS/LIMIT_ITEMS/SOURCE_TYPES + $/el
public/js/camera-helper.js (~40行) startCamera/stopCamera/scanFromCamera
```

### 前端 — 修改文件
```
public/js/api.js          (65→~50行)  删常量字典和 $/el 工具
public/js/scan.js         (140→~100行) 删摄像头函数
public/index.html         (69行)     新增 2 个 script 标签
```

---

### Task 1: 创建 db/users.js — 用户 CRUD

**Files:**
- Create: `db/users.js`

- [ ] **Step 1: 创建 db/users.js**

```js
// db/users.js — 用户 CRUD（工厂模式：接收 { q, one, persist }）
module.exports = function({ q, one, persist }) {
  function createUser({ username, password_hash, role, dept, display_name }) {
    require('./db').db().run('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      [username, password_hash, role, dept || null, display_name || null]);
    persist();
    return getUserByUsername(username);
  }
  function getUserById(id) { return one('SELECT * FROM users WHERE id = ?', [id]); }
  function getUserByUsername(username) { return one('SELECT * FROM users WHERE username = ?', [username]); }
  function listUsers() { return q('SELECT id,username,role,dept,display_name,created_at FROM users ORDER BY id'); }
  return { createUser, getUserById, getUserByUsername, listUsers };
};
```

> **注意**: `createUser` 需要访问 `db` 对象执行 `db.run`。为避免循环依赖，工厂接收一个 `dbRef`（通过 `db.js` 闭包访问）或直接使用 `require('./db').db().run(...)` 模式。这里采用运行时 require，因为 `ready` promise 确保 `db.js` 初始化完成。

Wait — 运行时 `require('./db')` 在工厂函数体内调用会形成循环依赖（db.js require users.js，users.js 又 require db.js）。需要在 db.js 初始化完成后，将 `db` 对象和工具函数传给工厂。

实际上直接传 `{ dbRef }` 更好：

```js
// db/users.js — 用户 CRUD（工厂模式）
module.exports = function({ q, one, dbRef, persist }) {
  function createUser({ username, password_hash, role, dept, display_name }) {
    dbRef.run('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      [username, password_hash, role, dept || null, display_name || null]);
    persist();
    return getUserByUsername(username);
  }
  function getUserById(id) { return one('SELECT * FROM users WHERE id = ?', [id]); }
  function getUserByUsername(username) { return one('SELECT * FROM users WHERE username = ?', [username]); }
  function listUsers() { return q('SELECT id,username,role,dept,display_name,created_at FROM users ORDER BY id'); }
  return { createUser, getUserById, getUserByUsername, listUsers };
};
```

- [ ] **Step 2: 验证文件语法**

```
Run: node -c db/users.js
Expected: no output (syntax OK)
```

---

### Task 2: 创建 db/samples.js — 样品 CRUD

**Files:**
- Create: `db/samples.js`

- [ ] **Step 1: 创建 db/samples.js**

```js
// db/samples.js — 样品 CRUD（工厂模式：接收 { q, one, dbRef, persist, nowISO }）
const crypto = require('crypto');

module.exports = function({ q, one, dbRef, persist, nowISO }) {
  function nextSampleNo() {
    const row = one('SELECT COUNT(*) AS c FROM samples');
    return 'SM-' + String((row.c || 0) + 1).padStart(6, '0');
  }
  function createSample({ name, spec, model, station, image, notes, created_by,
    sample_type, limit_item, source_type, valid_until, card_version,
    test_standard, test_data, signed_by_rnd, signed_by_qa }) {
    const ts = nowISO();
    const nextNo = nextSampleNo();
    dbRef.run(`INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,
      sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rnd,signed_by_qa,
      created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'NEW',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [nextNo, name || null, spec || null, model || null, station || null, image || null,
       crypto.randomBytes(8).toString('hex'), created_by || null, notes || null,
       sample_type || '', limit_item || '', source_type || '', valid_until || '',
       card_version || '', test_standard || '', test_data || '',
       signed_by_rnd || '', signed_by_qa || '',
       ts, ts]);
    persist();
    return getSampleByNo(nextNo);
  }
  function getSampleById(id) { return one('SELECT * FROM samples WHERE id = ?', [id]); }
  function getSampleByNo(sample_no) { return one('SELECT * FROM samples WHERE sample_no = ?', [sample_no]); }
  function getSampleByToken(qr_token) { return one('SELECT * FROM samples WHERE qr_token = ?', [qr_token]); }
  function listSamples({ status, dept, search, sort, overdue, sample_type, limit_item, source_type } = {}) {
    const where = []; const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (dept) { where.push('custody_dept = ?'); params.push(dept); }
    if (search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
    if (overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now')"); }
    else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now','+7 days')"); }
    if (sample_type) { where.push('sample_type = ?'); params.push(sample_type); }
    if (limit_item) { where.push('limit_item = ?'); params.push(limit_item); }
    if (source_type) { where.push('source_type = ?'); params.push(source_type); }
    let orderBy = 'ORDER BY id DESC';
    if (sort === 'created_at') orderBy = 'ORDER BY created_at ASC';
    else if (sort === '-created_at') orderBy = 'ORDER BY created_at DESC';
    else if (sort === 'sample_no') orderBy = 'ORDER BY sample_no ASC';
    else if (sort === '-sample_no') orderBy = 'ORDER BY sample_no DESC';
    const sql = 'SELECT * FROM samples' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ' + orderBy;
    return q(sql, params);
  }
  function updateSample(s) {
    dbRef.run(`UPDATE samples SET status=?, produced_at=?, released_at=?, release_cycle_days=?,
      next_inspect_at=?, custody_dept=?, storage_location=?, model=?, station=?, image=?,
      produced_image=?, inspect_image=?, notes=?, updated_at=?,
      sample_type=?, limit_item=?, source_type=?, valid_until=?, card_version=?,
      test_standard=?, test_data=?, signed_by_rnd=?, signed_by_qa=?
      WHERE id=?`,
      [s.status, s.produced_at || null, s.released_at || null, s.release_cycle_days ?? null,
       s.next_inspect_at || null, s.custody_dept || null, s.storage_location || null,
       s.model ?? null, s.station ?? null, s.image ?? null,
       s.produced_image ?? null, s.inspect_image ?? null, s.notes || null, nowISO(),
       s.sample_type ?? '', s.limit_item ?? '', s.source_type ?? '', s.valid_until ?? '',
       s.card_version ?? '', s.test_standard ?? '', s.test_data ?? '',
       s.signed_by_rnd ?? '', s.signed_by_qa ?? '',
       s.id]);
    persist();
    return getSampleById(s.id);
  }
  function deleteSample(id) {
    dbRef.run('DELETE FROM scan_logs WHERE sample_id=?', [id]);
    dbRef.run('DELETE FROM samples WHERE id=?', [id]);
    persist();
  }
  return { nextSampleNo, createSample, getSampleById, getSampleByNo, getSampleByToken, listSamples, updateSample, deleteSample };
};
```

- [ ] **Step 2: 验证语法**

```
Run: node -c db/samples.js
Expected: no output
```

---

### Task 3: 创建 db/logs.js — 日志 CRUD

**Files:**
- Create: `db/logs.js`

- [ ] **Step 1: 创建 db/logs.js**

```js
// db/logs.js — 操作日志 CRUD（工厂模式：接收 { q, dbRef, persist }）
module.exports = function({ q, dbRef, persist }) {
  function addLog({ sample_id, action, role, user_id, dept, location, note }) {
    dbRef.run('INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note) VALUES (?,?,?,?,?,?,?)',
      [sample_id, action, role || null, user_id || null, dept || null, location || null, note || null]);
    persist();
  }
  function listLogsBySample(sample_id) { return q('SELECT * FROM scan_logs WHERE sample_id = ? ORDER BY id', [sample_id]); }
  function listLogs() {
    return q(`SELECT l.*, s.sample_no, s.name AS sample_name
              FROM scan_logs l LEFT JOIN samples s ON s.id = l.sample_id ORDER BY l.id DESC LIMIT 500`);
  }
  return { addLog, listLogsBySample, listLogs };
};
```

- [ ] **Step 2: 验证语法**

```
Run: node -c db/logs.js
Expected: no output
```

---

### Task 4: 精简 db.js — 组装工厂导出

**Files:**
- Modify: `db.js`

- [ ] **Step 1: 精简 db.js**

删除 `createUser`..`deleteSample`、`addLog`..`listLogs` 等 16 个 CRUD 函数（lines 105-191），替换为工厂组装 + 工具函数 `run`。

替换后的 `db.js` 完整内容：

```js
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, process.env.TEST_MODE ? 'test.db.sqlite' : 'sample.db.sqlite');

let db = null;

function persist() {
  if (!db) return;
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}
function nowISO() { return new Date().toISOString(); }

// 异步初始化（加载 wasm + 读取/创建库）
const ready = initSqlJs().then(SQL => {
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      dept TEXT,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS samples (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_no TEXT UNIQUE NOT NULL,
      name TEXT,
      spec TEXT,
      model TEXT,
      station TEXT,
      image TEXT,
      qr_token TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'NEW',
      created_by INTEGER,
      produced_at TEXT,
      released_at TEXT,
      release_cycle_days INTEGER,
      next_inspect_at TEXT,
      custody_dept TEXT,
      storage_location TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sample_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      role TEXT,
      user_id INTEGER,
      dept TEXT,
      location TEXT,
      note TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_samples_status ON samples(status);
    CREATE INDEX IF NOT EXISTS idx_logs_sample ON scan_logs(sample_id);
  `);
  // 迁移：已存在的库补加新列
  for (const col of ['model', 'station', 'image', 'produced_image', 'inspect_image',
    'sample_type', 'limit_item', 'source_type', 'valid_until', 'card_version',
    'test_standard', 'test_data', 'signed_by_rnd', 'signed_by_qa']) {
    const has = db.exec(`PRAGMA table_info(samples)`)[0].values.some(r => r[1] === col);
    if (!has) db.run(`ALTER TABLE samples ADD COLUMN ${col} TEXT`);
  }
  if (!fs.existsSync(DB_FILE)) persist();
  return true;
});

function rowToObj(stmt) {
  const cols = stmt.getColumnNames();
  const vals = stmt.get();
  const o = {};
  for (let i = 0; i < cols.length; i++) o[cols[i]] = vals[i];
  return o;
}
function q(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(rowToObj(stmt));
  stmt.free();
  return rows;
}
function one(sql, params) {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  let row = undefined;
  if (stmt.step()) row = rowToObj(stmt);
  stmt.free();
  return row;
}
function run(sql, params) { db.run(sql, params); }

// 工厂组装实体模块（db 初始化完成后 cbRef 可用）
const dbRef = { get run() { return db.run.bind(db); } };
const users = require('./db/users')({ q, one, dbRef, persist });
const samples = require('./db/samples')({ q, one, dbRef, persist, nowISO });
const logs = require('./db/logs')({ q, dbRef, persist });

module.exports = {
  ready, db: () => db, nowISO,
  ...users, ...samples, ...logs
};
```

> **注意**: `dbRef` 用 getter 代理 `db.run.bind(db)`，因为工厂模块在 `ready` promise 完成前就会被 `require`（此时 `db` 为 `null`），但实际调用（createUser 等）发生在 `ready.then()` 之后，db 已初始化。getter 确保每次访问都能拿到最新的 `db` 引用。

- [ ] **Step 2: 运行全量测试验证**

```
Run: npm test
Expected: 40 tests passed
```

- [ ] **Step 3: 运行 seed 脚本验证**

```
Run: node seed.js
Expected: 正常输出账号/样品创建信息
```

- [ ] **Step 4: Commit**

```bash
git add db/users.js db/samples.js db/logs.js db.js
git commit -m "refactor(db): split db.js into core + 3 entity modules (factory pattern)

- db.js: ~80行, 保留 init/helpers + 工厂组装导出
- db/users.js: ~35行, 用户 CRUD  
- db/samples.js: ~70行, 样品 CRUD
- db/logs.js: ~30行, 日志 CRUD
- 对外兼容: D.createUser() 等调用路径不变"
```

---

### Task 5: 创建 routes/auth.js — 鉴权路由

**Files:**
- Create: `routes/auth.js`

- [ ] **Step 1: 创建 routes/auth.js**

```js
// routes/auth.js — 鉴权守卫 + 登录/登出
const bcrypt = require('bcryptjs');
const D = require('../db');

function register(app) {
  // 鉴权守卫（导出供其他路由复用）
  function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '未登录' });
    next();
  }
  function currentUser(req) {
    if (!req.session.userId) return null;
    return D.getUserById(req.session.userId);
  }

  app.post('/api/login', (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });
    const u = D.getUserByUsername(username);
    if (!u || !bcrypt.compareSync(password, u.password_hash))
      return res.status(401).json({ error: '账号或密码错误' });
    req.session.userId = u.id;
    res.json({ id: u.id, username: u.username, role: u.role, dept: u.dept, display_name: u.display_name });
  });

  app.post('/api/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get('/api/me', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: '未登录' });
    res.json({ id: u.id, username: u.username, role: u.role, dept: u.dept, display_name: u.display_name });
  });

  // 挂到 app 上供其他路由模块使用
  app.locals.requireAuth = requireAuth;
  app.locals.currentUser = currentUser;
}

module.exports = { register };
```

- [ ] **Step 2: 验证语法**

```
Run: node -c routes/auth.js
Expected: no output
```

---

### Task 6: 创建 routes/samples.js — 样品 CRUD 路由

**Files:**
- Create: `routes/samples.js`

- [ ] **Step 1: 创建 routes/samples.js**

```js
// routes/samples.js — 样品 CRUD（列表/详情/新建/删除/更新 + saveSampleImage）
const path = require('path');
const fs = require('fs');
const D = require('../db');
const { logger } = require('../logger');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
const UPLOAD_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10);

function saveSampleImage(dataUrl, sampleNo) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  let ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return null;
  const size = Buffer.byteLength(m[2], 'base64');
  if (size > UPLOAD_MAX_SIZE) { logger.warn('图片过大:' + size); return null; }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fname = sampleNo + '.' + ext;
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
    return '/uploads/' + fname;
  } catch (e) { logger.error('保存图片失败: ' + e.message); return null; }
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  app.get('/api/samples', requireAuth, (req, res) => {
    const { status, dept, q, sort, overdue, sample_type, limit_item, source_type } = req.query;
    res.json(D.listSamples({
      status: status || undefined,
      dept: dept || undefined,
      search: q || undefined,
      sort: sort || undefined,
      overdue: overdue || undefined,
      sample_type: sample_type || undefined,
      limit_item: limit_item || undefined,
      source_type: source_type || undefined
    }));
  });

  app.get('/api/samples/:id', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.json({ ...s, logs: D.listLogsBySample(s.id) });
  });

  // 新建样品（研发或管理员）
  app.post('/api/samples', requireAuth, (req, res) => {
    const u = currentUser(req);
    if (!['RND', 'ME', 'ADMIN'].includes(u.role))
      return res.status(403).json({ error: '无权限：仅研发可新建样品' });
    const { name, spec, model, station, notes,
      sample_type, limit_item, source_type, valid_until, card_version,
      test_standard, test_data } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
    const s = D.createSample({
      name: name.trim(), spec: spec || '', model: model || '', station: station || '',
      notes: notes || '', image: '', created_by: u.id,
      sample_type: sample_type || '', limit_item: limit_item || '',
      source_type: source_type || '', valid_until: valid_until || '',
      card_version: card_version || '', test_standard: test_standard || '',
      test_data: test_data || '',
      signed_by_rnd: u.display_name || u.username,
      signed_by_qa: ''
    });
    D.addLog({ sample_id: s.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '新建样品' });
    res.json(s);
  });

  // 删除样品（仅NEW/PRODUCED，ADMIN或创建者或RND可删）
  app.delete('/api/samples/:id', requireAuth, (req, res) => {
    const u = currentUser(req);
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    if (!['NEW', 'PRODUCED'].includes(s.status))
      return res.status(400).json({ error: '仅允许取消NEW或PRODUCED状态的样品' });
    if (u.role !== 'ADMIN' && u.role !== 'RND' && s.created_by !== u.id)
      return res.status(403).json({ error: '无权限：仅ADMIN、研发或创建者可取消' });
    D.deleteSample(s.id);
    logger.info('样品已取消: '+s.sample_no+' by '+u.username);
    res.json({ ok: true });
  });

  // 更新样品限度信息（RND/QA/ADMIN）
  app.put('/api/samples/:id', requireAuth, (req, res) => {
    const u = currentUser(req);
    if (!['RND', 'ME', 'QA', 'ADMIN'].includes(u.role))
      return res.status(403).json({ error: '无权限：仅研发/品保/管理员可编辑' });
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });

    const { sample_type, limit_item, source_type, valid_until, card_version,
      test_standard, test_data, signed_by_rnd, signed_by_qa } = req.body || {};

    let qaSigner = signed_by_qa;
    if (u.role === 'QA') qaSigner = u.display_name || u.username;

    const updated = { ...s,
      sample_type: sample_type !== undefined ? sample_type : s.sample_type,
      limit_item: limit_item !== undefined ? limit_item : s.limit_item,
      source_type: source_type !== undefined ? source_type : s.source_type,
      valid_until: valid_until !== undefined ? valid_until : s.valid_until,
      card_version: card_version !== undefined ? card_version : s.card_version,
      test_standard: test_standard !== undefined ? test_standard : s.test_standard,
      test_data: test_data !== undefined ? test_data : s.test_data,
      signed_by_rnd: signed_by_rnd !== undefined ? signed_by_rnd : s.signed_by_rnd,
      signed_by_qa: qaSigner !== undefined ? qaSigner : s.signed_by_qa
    };

    const result = D.updateSample(updated);
    D.addLog({ sample_id: s.id, action: 'UPDATE_CARD', role: u.role, user_id: u.id, dept: u.dept, note: '更新标示卡信息' });
    res.json({ ...result, logs: D.listLogsBySample(s.id) });
  });

  // 导出 saveSampleImage 供 scan 路由复用
  app.locals.saveSampleImage = saveSampleImage;
}

module.exports = { register };
```

- [ ] **Step 2: 验证语法**

```
Run: node -c routes/samples.js
Expected: no output
```

---

### Task 7: 创建 routes/scan.js — 扫码状态机路由

**Files:**
- Create: `routes/scan.js`

- [ ] **Step 1: 创建 routes/scan.js**

```js
// routes/scan.js — 扫码台：解析 + 状态机
const D = require('../db');

const STATUS_LABEL = {
  NEW: '新建(待制作确认)', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中'
};

function actionForRole(role, status, next_inspect_at) {
  if ((role === 'RND' || role === 'ME') && status === 'NEW') return 'PRODUCE';
  if (role === 'QA' && status === 'PRODUCED') return 'RELEASE';
  if (role === 'QA' && status === 'RELEASED' && next_inspect_at && new Date(next_inspect_at).getTime() <= Date.now()) return 'INSPECT';
  if (role === 'CUSTODY' && status === 'RELEASED') return 'CUSTODY';
  return null;
}

function fmtCard(t) {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  const saveSampleImage = app.locals.saveSampleImage;

  // 解析扫码内容
  app.get('/api/resolve', requireAuth, (req, res) => {
    const code = (req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: '无效码' });
    let s = D.getSampleByNo(code) || D.getSampleByToken(code);
    if (!s) return res.status(404).json({ error: '未找到对应样品：' + code });
    const u = currentUser(req);
    res.json({ sample: s, allowedAction: actionForRole(u.role, s.status, s.next_inspect_at) });
  });

  // 扫码状态机
  app.post('/api/scan', requireAuth, (req, res) => {
    const u = currentUser(req);
    const { code, location, cycleDays, note } = req.body || {};
    const scanCode = (code || '').trim();
    if (!scanCode) return res.status(400).json({ error: '未提供扫码内容' });

    const s = D.getSampleByNo(scanCode) || D.getSampleByToken(scanCode);
    if (!s) return res.status(404).json({ error: '未找到对应样品：' + scanCode });

    const action = actionForRole(u.role, s.status, s.next_inspect_at);
    if (!action)
      return res.status(409).json({
        error: `当前角色(${u.role})无法对状态为「${STATUS_LABEL[s.status] || s.status}」的样品执行操作`,
        sample: s
      });

    const ts = D.nowISO();
    const updated = { ...s, updated_at: ts };

    if (action === 'PRODUCE') {
      const img = req.body.image;
      if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传制作照片' });
      const prodImgUrl = saveSampleImage(img, s.sample_no + '_prod');
      if (prodImgUrl) updated.produced_image = prodImgUrl;
      updated.status = 'PRODUCED';
      updated.produced_at = ts;
      D.addLog({ sample_id: s.id, action: 'PRODUCE', role: u.role, user_id: u.id, dept: u.dept, note: note || '研发确认制作完成' });
    } else if (action === 'RELEASE') {
      const cyc = Number(cycleDays);
      if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
      const d = new Date(ts); d.setDate(d.getDate() + cyc);
      updated.status = 'RELEASED';
      updated.released_at = ts;
      updated.release_cycle_days = cyc;
      updated.next_inspect_at = d.toISOString();
      D.addLog({ sample_id: s.id, action: 'RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: `正式发行，复检周期${cyc}天` });
    } else if (action === 'INSPECT') {
      const img = req.body.image;
      if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传复检照片' });
      const inspImgUrl = saveSampleImage(img, s.sample_no + '_insp');
      const cyc = Number(cycleDays) || s.release_cycle_days || 90;
      const d = new Date(ts); d.setDate(d.getDate() + cyc);
      if (inspImgUrl) updated.inspect_image = inspImgUrl;
      updated.next_inspect_at = d.toISOString();
      D.addLog({ sample_id: s.id, action: 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次周期' + cyc + '天') });
    } else if (action === 'CUSTODY') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写保管储位' });
      updated.status = 'IN_CUSTODY';
      updated.custody_dept = u.dept;
      updated.storage_location = location.trim();
      D.addLog({ sample_id: s.id, action: 'CUSTODY', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '部门接收保管' });
    }

    const result = D.updateSample(updated);
    res.json({ sample: result, action, message: `操作成功：${action}` });
  });
}

module.exports = { register };
```

- [ ] **Step 2: 验证语法**

```
Run: node -c routes/scan.js
Expected: no output
```

---

### Task 8: 创建 routes/cards.js — 标示卡 + 二维码路由

**Files:**
- Create: `routes/cards.js`

- [ ] **Step 1: 创建 routes/cards.js**

```js
// routes/cards.js — 标示卡：匿名查看 + 打印 + 标签/二维码下载
const QRCode = require('qrcode');
const D = require('../db');
const { logger } = require('../logger');

function fmtCard(t) {
  if (!t) return '—';
  return new Date(t).toLocaleString('zh-CN', { hour12: false });
}

function register(app) {
  const requireAuth = app.locals.requireAuth;

  // 匿名数字标示卡（无需登录，QR码扫码查看）
  app.get('/card/:sample_no', (req, res) => {
    const sampleNo = (req.params.sample_no || '').trim();
    if (!sampleNo) return res.status(400).send('无效样品编号');
    const s = D.getSampleByNo(sampleNo);
    if (!s) {
      return res.status(404).send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>未找到</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;color:#999}</style></head><body><div style="text-align:center"><h1>404</h1><p>未找到样品: '+sampleNo+'</p></div></body></html>');
    }

    const logs = D.listLogsBySample(s.id).slice(0, 2);
    const sourceLabel = {C:'客供', T:'元山', G:'元将五金塔岗分厂'}[s.source_type] || s.source_type || '—';
    const typeBadge = s.sample_type === 'OK' ? '<span style="background:#16a34a;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">OK</span>'
      : s.sample_type === 'NG' ? '<span style="background:#dc2626;color:#fff;padding:2px 8px;border-radius:4px;font-size:12px">NG</span>' : '';
    const now = new Date();
    const expired = s.valid_until && new Date(s.valid_until) < now;
    const validClass = expired ? 'color:#dc2626;font-weight:700' : '';

    let logsHtml = '';
    if (logs.length) {
      logsHtml = '<div class="divider"></div>\n' +
      '  <div class="section-title">最近操作</div>\n' +
      logs.map(l=>
        '<div class="log-item">' + fmtCard(l.created_at) + ' \u00b7 ' + l.action + ' \u00b7 ' + (l.role||'') + '/' + (l.dept||'') + '</div>'
      ).join('\n');
    }

    const html = '<!DOCTYPE html>\n' +
'<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<title>标示卡 ' + s.sample_no + '</title>\n' +
'<style>\n' +
'*{margin:0;padding:0;box-sizing:border-box}\n' +
'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f0f2f5;color:#1a1a1a;line-height:1.5;min-height:100vh}\n' +
'.card-wrap{max-width:480px;margin:0 auto;padding:16px}\n' +
'.card{background:#fff;border-radius:16px;padding:20px;box-shadow:0 1px 3px rgba(0,0,0,.08)}\n' +
'.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb}\n' +
'.card-header h2{font-size:18px;font-weight:700;color:#1e293b}\n' +
'.row{display:flex;margin-bottom:10px;font-size:14px}\n' +
'.row .lbl{color:#64748b;width:80px;flex-shrink:0;font-size:13px}\n' +
'.row .val{flex:1;word-break:break-all}\n' +
'.divider{margin:14px 0;border-top:1px dashed #e5e7eb}\n' +
'.section-title{font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}\n' +
'.log-item{font-size:12px;color:#64748b;padding:4px 0;border-bottom:1px solid #f1f5f9}\n' +
'.log-item:last-child{border-bottom:none}\n' +
'.footer{text-align:center;color:#94a3b8;font-size:11px;margin-top:20px;padding-top:12px;border-top:1px solid #f1f5f9}\n' +
'.badge-expired{background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600}\n' +
'@media(min-width:768px){.card-wrap{padding:32px 16px}.card{padding:28px}}\n' +
'</style></head><body>\n' +
'<div class="card-wrap">\n' +
'<div class="card">\n' +
'  <div class="card-header"><h2>' + s.sample_no + '</h2>' + typeBadge + '</div>\n' +
'  <div class="row"><span class="lbl">样品名称</span><span class="val">' + (s.name||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">限度项目</span><span class="val">' + (s.limit_item||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">来源</span><span class="val">' + sourceLabel + '</span></div>\n' +
'  <div class="row"><span class="lbl">版次</span><span class="val">' + (s.card_version||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">测试标准</span><span class="val">' + (s.test_standard||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">测试数据</span><span class="val">' + (s.test_data||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">有效期</span><span class="val" style="' + validClass + '">' + (s.valid_until ? fmtCard(s.valid_until) : '—') + (expired ? ' <span class="badge-expired">已过期</span>' : '') + '</span></div>\n' +
'  <div class="divider"></div>\n' +
'  <div class="section-title">签署</div>\n' +
'  <div class="row"><span class="lbl">制作人</span><span class="val">' + (s.signed_by_rnd||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">确认人</span><span class="val">' + (s.signed_by_qa||'—') + '</span></div>\n' +
'  <div class="divider"></div>\n' +
'  <div class="section-title">规格/型号</div>\n' +
'  <div class="row"><span class="lbl">机型</span><span class="val">' + (s.model||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">站别</span><span class="val">' + (s.station||'—') + '</span></div>\n' +
'  <div class="row"><span class="lbl">规格</span><span class="val">' + (s.spec||'—') + '</span></div>\n' +
'  ' + logsHtml + '\n' +
'  <div class="divider"></div>\n' +
'  <div class="footer">此卡供现场参照，系统内可查看更多信息</div>\n' +
'</div>\n</div>\n' +
'</body></html>';
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // 下载完整标签
  app.get('/api/samples/:id/label/download', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    QRCode.toDataURL(s.sample_no, { width: 400, margin: 1, errorCorrectionLevel: 'M' })
      .then(qrDataUrl => {
        const meta = [s.model || '', s.station || ''].filter(Boolean).join(' · ') || '—';
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>标签 ${s.sample_no}</title>
<style>
@page{margin:3mm;size:auto}*{margin:0;padding:0}body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.lab{width:280px;text-align:center;border:2px solid #000;border-radius:12px;padding:14px}
.lab h2{font-size:16px;margin-bottom:4px}.lab .no{font-size:20px;font-weight:700;margin:4px 0}
.lab .meta{font-size:11px;color:#333;margin:1px 0}
@media print{html,body{width:auto;height:auto;overflow:visible}}
</style></head><body>
<div class="lab">
<h2>样品标签</h2>
<div class="no">${s.sample_no}</div>
<div class="meta">${s.name||'—'}</div>
<div class="meta">${meta}</div>
<div class="meta">${s.spec||'—'}</div>
<img src="${qrDataUrl}" width="200" style="margin-top:8px" alt="QR"/>
<div class="meta" style="margin-top:4px">请贴于样品并扫码确认</div>
</div></body></html>`;
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_label.html"');
        res.send(html);
      })
      .catch(e => {
        logger.error('生成标签失败: '+e.message);
        res.status(500).json({ error: '生成标签失败' });
      });
  });

  // 下载二维码（高分辨率 PNG）
  app.get('/api/samples/:id/qrcode/download', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_QR.png"');
    QRCode.toFileStream(res, s.sample_no, { width: 600, margin: 1, errorCorrectionLevel: 'M' });
  });

  // 二维码流
  app.get('/api/samples/:id/qrcode', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.set('Content-Type', 'image/png');
    QRCode.toFileStream(res, s.sample_no, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
  });

  // 打印标示卡
  app.get('/api/samples/:id/card/print', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    QRCode.toDataURL(s.sample_no, { width: 300, margin: 1, errorCorrectionLevel: 'M' })
      .then(qrDataUrl => {
        const sourceLabel = {C:'客供', T:'元山', G:'元将五金塔岗分厂'}[s.source_type] || s.source_type || '—';
        const typeBadge = s.sample_type === 'OK' ? 'OK' : s.sample_type === 'NG' ? 'NG' : '';
        const now = new Date();
        const expired = s.valid_until && new Date(s.valid_until) < now;
        const validClass = expired ? 'color:#dc2626;font-weight:700' : '';
        const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>标示卡 ${s.sample_no}</title>
<style>
@page{margin:5mm;size:auto}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#1a1a1a;line-height:1.4;font-size:13px}
.card{max-width:400px;margin:0 auto;border:2px solid #000;border-radius:12px;padding:16px}
.card-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #ccc}
.card-header h2{font-size:16px;font-weight:700}
.row{display:flex;margin-bottom:5px}
.row .lbl{color:#555;width:65px;flex-shrink:0;font-size:12px}
.row .val{flex:1;word-break:break-all}
.divider{margin:8px 0;border-top:1px dashed #ccc}
.section-title{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.footer{text-align:center;color:#999;font-size:10px;margin-top:12px;padding-top:8px;border-top:1px solid #eee}
.qr-wrap{text-align:center;margin-top:12px}
@media print{html,body{width:auto;height:auto;overflow:visible}}
</style></head><body>
<div class="card">
  <div class="card-header"><h2>${s.sample_no}</h2>${typeBadge ? '<span style="font-size:14px;font-weight:700">'+typeBadge+'</span>' : ''}</div>
  <div class="row"><span class="lbl">名称</span><span class="val">${s.name||'—'}</span></div>
  <div class="row"><span class="lbl">项目</span><span class="val">${s.limit_item||'—'}</span></div>
  <div class="row"><span class="lbl">来源</span><span class="val">${sourceLabel}</span></div>
  <div class="row"><span class="lbl">版次</span><span class="val">${s.card_version||'—'}</span></div>
  <div class="row"><span class="lbl">标准</span><span class="val">${s.test_standard||'—'}</span></div>
  <div class="row"><span class="lbl">数据</span><span class="val">${s.test_data||'—'}</span></div>
  <div class="row"><span class="lbl">有效期</span><span class="val" style="${validClass}">${s.valid_until?fmtCard(s.valid_until):'—'}${expired?' [已过期]':''}</span></div>
  <div class="row"><span class="lbl">制作</span><span class="val">${s.signed_by_rnd||'—'}</span></div>
  ${s.signed_by_qa ? '<div class="row"><span class="lbl">确认</span><span class="val">'+s.signed_by_qa+'</span></div>' : ''}
  <div class="divider"></div>
  <div class="section-title">规格</div>
  <div class="row"><span class="lbl">机型</span><span class="val">${s.model||'—'}</span></div>
  <div class="row"><span class="lbl">站别</span><span class="val">${s.station||'—'}</span></div>
  <div class="row"><span class="lbl">规格</span><span class="val">${s.spec||'—'}</span></div>
  <div class="qr-wrap"><img src="${qrDataUrl}" width="160" alt="QR"/></div>
  <div class="footer">请贴于样品旁供现场扫码</div>
</div></body></html>`;
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_card.html"');
        res.send(html);
      })
      .catch(e => {
        logger.error('生成标示卡失败: '+e.message);
        res.status(500).json({ error: '生成标示卡失败' });
      });
  });
}

module.exports = { register };
```

- [ ] **Step 2: 验证语法**

```
Run: node -c routes/cards.js
Expected: no output
```

---

### Task 9: 创建 routes/misc.js — 看板/日志/用户/健康检查

**Files:**
- Create: `routes/misc.js`

- [ ] **Step 1: 创建 routes/misc.js**

```js
// routes/misc.js — 看板 / 日志 / 用户管理 / 健康检查
const bcrypt = require('bcryptjs');
const D = require('../db');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 看板
  app.get('/api/dashboard', requireAuth, (req, res) => {
    const u = currentUser(req);
    const all = D.listSamples({});
    const byStatus = { NEW: 0, PRODUCED: 0, RELEASED: 0, IN_CUSTODY: 0 };
    for (const s of all) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

    const now = Date.now();
    const overdue = all.filter(s => s.status === 'IN_CUSTODY' && s.next_inspect_at && new Date(s.next_inspect_at).getTime() < now);
    const dueSoon = all.filter(s => s.status === 'IN_CUSTODY' && s.next_inspect_at && new Date(s.next_inspect_at).getTime() >= now && new Date(s.next_inspect_at).getTime() < now + 7 * 864e5);

    let myPending = [];
    if (u.role === 'RND' || u.role === 'ME') myPending = all.filter(s => s.status === 'NEW');
    else if (u.role === 'QA') myPending = all.filter(s => s.status === 'PRODUCED');
    else if (u.role === 'CUSTODY') myPending = all.filter(s => s.status === 'RELEASED');
    else myPending = all;

    res.json({
      byStatus, total: all.length, overdue, dueSoon, myPending,
      role: u.role, dept: u.dept, display_name: u.display_name
    });
  });

  // 日志
  app.get('/api/logs', requireAuth, (req, res) => {
    res.json(D.listLogs());
  });

  // 用户管理（ADMIN）
  app.get('/api/users', requireAuth, (req, res) => {
    const u = currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    res.json(D.listUsers());
  });

  app.post('/api/users', requireAuth, (req, res) => {
    const u = currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限' });
    const { username, password, role, dept, display_name } = req.body || {};
    if (!username || !password || !role) return res.status(400).json({ error: '账号/密码/角色必填' });
    if (D.getUserByUsername(username)) return res.status(409).json({ error: '账号已存在' });
    if (!['RND', 'ME', 'QA', 'CUSTODY'].includes(role)) return res.status(400).json({ error: '角色只能是 RND/ME/QA/CUSTODY' });
    const created = D.createUser({ username, password_hash: bcrypt.hashSync(password, 10), role, dept: dept || '', display_name: display_name || '' });
    res.json(created);
  });

  // 健康检查
  app.get('/health', (req, res) => {
    const dbReady = D.db();
    res.json({
      status: dbReady ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage().rss,
      db: dbReady ? 'connected' : 'disconnected'
    });
  });
}

module.exports = { register };
```

- [ ] **Step 2: 验证语法**

```
Run: node -c routes/misc.js
Expected: no output
```

---

### Task 10: 精简 server.js — 入口组装

**Files:**
- Modify: `server.js`

- [ ] **Step 1: 将 server.js 精简为入口**

保留 imports、中间件配置、错误处理、启动，删除所有路由 handler 和工具函数。替换后完整内容：

```js
// 加载 .env 文件中的环境变量（须在其他模块 require 之前）
require('dotenv').config();
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { logger, morganStream } = require('./logger');

const path = require('path');
const express = require('express');
const session = require('express-session');
const D = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'sample-mgmt-dev-secret-change-me';

app.use(express.json({ limit: '15mb' }));
app.use(helmet({
  contentSecurityPolicy: false
}));
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: '请求过于频繁,请1分钟后重试' })
});
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: '请求过于频繁,请稍后重试' })
});
if (!process.env.TEST_MODE) {
  app.use('/api/login', loginLimiter);
  app.use('/api', apiLimiter);
}

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  }
}));
app.use(express.static(path.join(__dirname, 'public')));
app.use(morgan('short', { stream: morganStream }));

// 路由注册（顺序：auth 必须先于其他模块，因为 requireAuth 挂在 app.locals 上）
require('./routes/auth').register(app);
require('./routes/samples').register(app);
require('./routes/scan').register(app);
require('./routes/cards').register(app);
require('./routes/misc').register(app);

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error('未捕获错误', { message: err.message, stack: err.stack, url: req.url });
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

// 测试模式下不自动 listen，生产/开发模式正常启动
if (!process.env.TEST_MODE) {
  D.ready.then(() => {
    app.listen(PORT, () => {
      logger.info('样品管理系统已启动: http://localhost:' + PORT);
    });
  });
}

module.exports = app;
```

- [ ] **Step 2: 运行全量测试验证**

```
Run: npm test
Expected: 40 tests passed
```

- [ ] **Step 3: 运行种子脚本 + 端到端测试**

```
Run: node seed-rich.js && node test_flow.js
Expected: 导入完成 + 端到端流程通过
```

- [ ] **Step 4: Commit**

```bash
git add routes/ server.js
git commit -m "refactor(server): split 553-line server.js into 1 entry + 5 route modules

- server.js: ~100行, 仅保留 imports/中间件/错误处理/启动
- routes/auth.js: ~50行, 鉴权守卫 + 登录/登出
- routes/samples.js: ~120行, 样品 CRUD
- routes/scan.js: ~100行, 扫码状态机
- routes/cards.js: ~140行, 标示卡/标签/二维码
- routes/misc.js: ~70行, 看板/日志/用户/健康检查
- 对外兼容: 所有 API 路径/出入参不变, 测试通过"
```

---

### Task 11: 创建 js/constants.js — 前端常量

**Files:**
- Create: `public/js/constants.js`

- [ ] **Step 1: 创建 public/js/constants.js**

```js
// constants.js — 全部常量、枚举、字典 + DOM 工具函数
const STATUS = {NEW:'新建·待制作确认',PRODUCED:'制作完成',RELEASED:'已发行',IN_CUSTODY:'保管中'};
const ROLE = {ADMIN:'系统管理员',RND:'研发',ME:'生技',QA:'品保',CUSTODY:'保管'};
const STATIONS = ['马达组','扇叶组','成品组','调机样'];
const LIMIT_ITEMS = [
  { code: 'A',  label: '成品震动(限度)' },
  { code: 'AI', label: '扇叶震动(限度)' },
  { code: 'A1', label: 'MCU IC烧録器(限度)' },
  { code: 'A2', label: '平衡机测试(限度)' },
  { code: 'A3', label: '入充磁扇叶组立(限度)' },
  { code: 'B',  label: '异音(限度)' },
  { code: 'C',  label: '外观(限度)' },
  { code: 'D',  label: '定子组绝缘耐压/阻抗' },
  { code: 'E',  label: '马达组电测（波形、反转）' },
  { code: 'F',  label: '层间测试' },
  { code: 'G',  label: '定子组大小边' },
  { code: 'H',  label: 'AOI视觉/CCD检测' },
  { code: 'I',  label: '压定子高度' },
  { code: 'J',  label: '扣环检测' },
  { code: 'K',  label: 'PCB组与定子组结合焊锡' },
  { code: 'L',  label: '自动化马达组组立' },
  { code: 'M',  label: '马达组焊导线组' },
  { code: 'N',  label: '导线焊点位置检测' },
  { code: 'O',  label: '断电功能检测' },
  { code: 'P',  label: '成品检测(转速、电流)' },
  { code: 'Q',  label: '定子组自动绕、缠线' },
  { code: 'R',  label: '铜轴承自动化' },
  { code: 'S',  label: 'CCD检测浸锡后定子组' },
  { code: 'T',  label: 'CCD检测外框组' },
  { code: 'U',  label: '2Ball成品自动化组立' },
  { code: 'X',  label: '特殊工站' }
];
const SOURCE_TYPES = {C:'客供', T:'元山', G:'元将五金塔岗分厂'};
const $ = (s,r=document)=>r.querySelector(s);
const el = (t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
```

- [ ] **Step 2: 验证语法**

```
Run: node -c public/js/constants.js
Expected: no output (or syntax error if any)
```

Note: `document` 在 Node.js 环境 `-c` 不会报错因为只是语法检查。

---

### Task 12: 精简 js/api.js — 删除常量和 DOM 工具

**Files:**
- Modify: `public/js/api.js`

- [ ] **Step 1: 替换 api.js 内容**

删除前 36 行中的所有常量定义和 `$`/`el`，保留 `me` 变量和函数。

`api.js` 新内容：

```js
// api.js — 鉴权登录、API请求、公共辅助函数（常量见 constants.js）
let me = null;

function toast(msg,type){const t=$('#toast');t.textContent=msg;t.className='toast show '+(type||'');setTimeout(()=>t.className='toast',2600);}
async function api(method,url,body){const opt={method,credentials:'include',headers:{}};if(body){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  const r=await fetch(url,opt);const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||('错误 '+r.status));return data;}

async function boot(){
  try{ me=await api('GET','/api/me'); showApp(); }
  catch(e){ $('#login').style.display='flex'; }
}
async function doLogin(){
  $('#lg-err').textContent='';
  try{ me=await api('POST','/api/login',{username:$('#lg-user').value,password:$('#lg-pass').value});
    $('#login').style.display='none'; showApp(); }
  catch(e){ $('#lg-err').textContent=e.message; }
}
async function doLogout(){ try{await api('POST','/api/logout');}catch(e){} location.reload(); }

function showApp(){
  $('#app').style.display='flex';
  $('#me-name').textContent=me.display_name||me.username;
  $('#me-role').textContent=(ROLE[me.role]||me.role)+' · '+(me.dept||'');
  buildNav(); route();
}

// ---- helpers ----
function statusBadge(s){const cls='b-'+(s.status==='IN_CUSTODY'&&overdue(s)?'overdue':s.status);return '<span class="badge '+cls+'">'+(STATUS[s.status]||s.status)+'</span>';}
function overdue(s){return s.status==='IN_CUSTODY'&&s.next_inspect_at&&new Date(s.next_inspect_at).getTime()<Date.now();}
function fmt(t){if(!t)return '—';const d=new Date(t);return d.toLocaleString('zh-CN',{hour12:false});}
function goScan(code){location.hash='#/scan';setTimeout(()=>{if(code)$('#scan-code').value=code;},50);}
```

---

### Task 13: 创建 js/camera-helper.js — 摄像头扫码

**Files:**
- Create: `public/js/camera-helper.js`

- [ ] **Step 1: 创建 public/js/camera-helper.js**

```js
// camera-helper.js — 摄像头扫码辅助（startCamera/stopCamera/scanFromCamera）
let camStream=null;

async function startCam(){
  const msg=$('#cam-msg');const video=$('#cam');
  if(!('BarcodeDetector'in window)){msg.textContent='当前浏览器不支持摄像头识别，请使用 Chrome/Edge，或直接用扫码枪/手动输入。';return;}
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=camStream;video.style.display='block';await video.play();
    const bd=new BarcodeDetector({formats:['qr_code']});msg.textContent='摄像头已开启，对准二维码…';
    const tick=async()=>{
      if(video.readyState>=2){
        try{const cs=await bd.detect(video);if(cs.length){stopCam();$('#scan-code').value=cs[0].rawValue.trim();doScan();return;}}catch(e){}
      }
      requestAnimationFrame(tick);
    };tick();
  }catch(e){msg.textContent='无法访问摄像头：'+e.message;}
}

function stopCam(){if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;$('#cam').style.display='none';}}
```

---

### Task 14: 精简 js/scan.js — 删除摄像头函数

**Files:**
- Modify: `public/js/scan.js`

- [ ] **Step 1: 删除 scan.js 中的摄像头函数**

删除文件末尾的 `camStream` 变量声明和 `startCam`/`stopCam` 函数（lines 124-140）。

`scan.js` 删除以下部分：
```js
let camStream=null;
async function startCam(){...}
function stopCam(){...}
```

保留 `viewScan`/`bindScanInput`/`refocusScan`/`onContToggle`/`afterScanReset`/`doScan`/`renderScanAction`/`previewScanImg`/`confirmScan` 等 9 个函数。

---

### Task 15: 更新 index.html — 新增 script 标签

**Files:**
- Modify: `public/index.html`

- [ ] **Step 1: 在 api.js 前插入 constants.js，在 scan.js 前插入 camera-helper.js**

将 script 加载区改为：

```html
<!-- 核心基础（最先加载，其他模块依赖） -->
<script src="/js/constants.js"></script>
<script src="/js/api.js"></script>
<script src="/js/modal.js"></script>
<!-- 页面模块（按需注册全局函数） -->
<script src="/js/dashboard.js"></script>
<script src="/js/new.js"></script>
<script src="/js/samples.js"></script>
<script src="/js/detail.js"></script>
<script src="/js/camera-helper.js"></script>
<script src="/js/scan.js"></script>
<script src="/js/board.js"></script>
<script src="/js/logs.js"></script>
<script src="/js/users.js"></script>
<!-- 路由最后加载 -->
<script src="/js/router.js"></script>
```

- [ ] **Step 2: 验证前端页面**

```
Run: npm start (后台启动)
浏览器打开 http://localhost:3000
验证：登录→概览→列表→详情→新建→扫码→看板→日志→用户 全部正常
```

- [ ] **Step 3: Commit**

```bash
git add public/js/constants.js public/js/camera-helper.js public/js/api.js public/js/scan.js public/index.html
git commit -m "refactor(frontend): extract constants + camera-helper modules

- js/constants.js: ~50行, STATUS/ROLE/LIMIT_ITEMS/SOURCE_TYPES + $/el
- js/camera-helper.js: ~40行, startCam/stopCam
- js/api.js: 65→~50行, 10→8函数
- js/scan.js: 140→~100行, 11→9函数
- index.html: 新增2个script标签, 加载顺序不变"
```

---

### Task 16: 最终回归验证

**Files:** 无（验证任务）

- [ ] **Step 1: 运行全量测试**

```
Run: npm test
Expected: 40 tests passed
```

- [ ] **Step 2: 端到端测试**

```
Run: node test_flow.js
Expected: 端到端流程通过（登录→建样→制作→发行→保管）
```

- [ ] **Step 3: 种子脚本验证**

```
Run: node seed.js
Expected: 正常输出账号/样品创建信息
```

- [ ] **Step 4: 文件容量验收**

```
Run: 统计所有修改后的文件行数/函数数
Expected: 全部在下限以内
```

| 文件 | 目标 | 状态 |
|---|---|---|
| server.js | ≤400行 / ≤20000字符 / ≤10函数 | 等待验证 |
| db.js | ≤200行 / ≤10函数 | 等待验证 |
| routes/* | 各 ≤400行 / ≤10函数 | 等待验证 |
| db/*.js | 各 ≤200行 / ≤10函数 | 等待验证 |
| js/scan.js | ≤300行 / ≤10函数 | 等待验证 |
| js/api.js | ≤200行 / ≤10函数 | 等待验证 |

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final verification - all tech debt files within limits"
```