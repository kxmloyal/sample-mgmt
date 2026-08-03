# 子系统插件协议 — 实现计划

> **For agentic workers:** 使用 subagent-driven-development 逐任务实现，每任务独立审核。
> 步骤使用 checkbox (`- [ ]`) 语法追踪。

**Goal:** 将当前制造品质管理系统重构为「子系统插件协议」架构，33 个阶段任务覆盖框架层抽取、样品/治具迁移、自动发现、管理面板。

**Architecture:** 抽取共享层（鉴权/状态机/文件管理/前端基础），将样品和治具子系统各自封装为 `subsystems/<id>/` 目录，`manifest.json` 驱动框架自动发现、建表、挂载路由、渲染门户。迁移期间旧路径与新路径并行运行，零停机切换。

**Tech Stack:** Node.js + Express 4.x + MariaDB(mysql2) + 原生 HTML/CSS/JS（无框架）

**设计文档:** [AGENTS.md 第 17 节](../../AGENTS.md#17-子系统插件协议核心架构)

**总步数:** 33 个 Task，分 6 个 Phase
**预计新建文件:** ~35 个
**预计修改文件:** ~5 个
**预计删除文件:** ~25 个（Phase 6 统一清理）

---

### Phase 1: 框架共享层（6 Tasks）

> 目标：从现有代码中抽取通用模块到 `shared/` 目录。不改变现有系统行为。
> 验证：每 Task 完成后，样品和治具系统回归正常。

---

### Task 1: 创建 shared/ 目录结构 + 鉴权中间件

**Files:**
- Create: `shared/middleware/auth.js`
- Modify: `server.js:96-97`（引用路径）
- Modify: `routes/auth.js`（require 路径）

- [ ] **Step 1: 创建 `shared/middleware/auth.js`**

从 `routes/auth.js` 中提取 `requireAuth` 和 `currentUser` 定义逻辑：

```js
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
```

- [ ] **Step 2: 更新 `routes/auth.js`**

将原来的 requireAuth/currentUser 内联定义替换为从 shared 引用：

```js
// routes/auth.js 顶部新增
const { mount: mountAuth } = require('../shared/middleware/auth');

// register(app) 中，原来直接定义的 requireAuth/currentUser 替换为：
function register(app) {
  mountAuth(app);  // ← 替代原来的 app.locals.requireAuth = ... 等
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  // ... 其余不变
}
```

- [ ] **Step 3: 验证**

```bash
cd /www/wwwroot/sample-mgmt && node -c routes/auth.js && node -c shared/middleware/auth.js
npm start  # 登录测试：rd01/rd123，确认样品+治具页面正常
```

- [ ] **Step 4: Commit**

```bash
git add shared/middleware/auth.js routes/auth.js
git commit -m "refactor(shared): extract auth middleware from routes/auth.js"
```

---

### Task 2: 创建通用文件上传中间件

**Files:**
- Create: `shared/middleware/upload.js`

- [ ] **Step 1: 创建 `shared/middleware/upload.js`**

```js
// shared/middleware/upload.js — 通用文件上传中间件
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * 创建 multer 上传实例
 * @param {object} opts
 * @param {string} opts.uploadDir - 上传目录（相对于项目根目录）
 * @param {number} opts.maxSize - 单文件最大字节数（默认 10MB）
 * @param {Function} opts.filename - 文件名生成函数 (req, file) => string
 * @param {string[]} opts.allowedMimes - 允许的 MIME 类型
 */
function createUploader(opts) {
  const dir = path.join(__dirname, '..', '..', opts.uploadDir || 'public/uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: opts.filename || function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
      }
    }),
    limits: { fileSize: opts.maxSize || 10485760 },
    fileFilter: function (req, file, cb) {
      if (!opts.allowedMimes || opts.allowedMimes.length === 0) return cb(null, true);
      if (opts.allowedMimes.includes(file.mimetype)) return cb(null, true);
      cb(new Error('不支持的文件类型: ' + file.mimetype));
    }
  });
}

module.exports = { createUploader };
```

- [ ] **Step 2: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c shared/middleware/upload.js
```

- [ ] **Step 3: Commit**

```bash
git add shared/middleware/upload.js
git commit -m "feat(shared): add generic file upload middleware"
```

---

### Task 3: 创建通用状态机引擎

**Files:**
- Create: `shared/state-machine.js`

- [ ] **Step 1: 创建 `shared/state-machine.js`**

```js
// shared/state-machine.js — 通用状态机引擎
// 基于 manifest.stateMachine 声明式校验和驱动状态转移

/**
 * 加载 manifest 的状态机定义，返回操作接口
 * @param {object} stateMachine - manifest.stateMachine 对象
 * @returns {{ getAllowedActions, canTransition, getStateLabel, getStateBadge, getTransitions }}
 */
function createStateMachine(stateMachine) {
  const states = stateMachine.states || {};
  const transitions = stateMachine.transitions || [];

  /** 获取当前状态下当前角色可执行的操作列表 */
  function getAllowedActions(role, currentStatus) {
    return transitions
      .filter(function (t) { return t.from === currentStatus && t.role.includes(role); })
      .map(function (t) { return { action: t.action, label: t.label, to: t.to }; });
  }

  /** 校验操作是否允许 */
  function canTransition(role, from, action) {
    return transitions.some(function (t) {
      return t.from === from && t.action === action && t.role.includes(role);
    });
  }

  /** 获取状态人类可读标签 */
  function getStateLabel(status) {
    return states[status] ? states[status].label : status;
  }

  /** 获取状态 badge 的 HTML（颜色信息） */
  function getStateBadge(status) {
    var s = states[status];
    if (!s) return { label: status, color: '#999', bg: '#f0f0f0' };
    return { label: s.label, color: s.color, bg: s.bg };
  }

  /** 获取所有转移规则 */
  function getTransitions() {
    return transitions;
  }

  return { getAllowedActions, canTransition, getStateLabel, getStateBadge, getTransitions };
}

module.exports = { createStateMachine };
```

- [ ] **Step 2: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c shared/state-machine.js
# 快速单元测试
node -e "
var sm = require('./shared/state-machine');
var m = sm.createStateMachine({
  states: { A: {label:'状态A',color:'#111',bg:'#eee'}, B: {label:'状态B',color:'#222',bg:'#ddd'} },
  transitions: [{from:'A',to:'B',action:'GO',role:['RD'],label:'去B'}]
});
console.assert(m.canTransition('RD','A','GO'), 'canTransition failed');
console.assert(!m.canTransition('QA','A','GO'), 'role check failed');
console.assert(m.getStateLabel('A')==='状态A', 'label failed');
console.log('PASS');
"
```

- [ ] **Step 3: Commit**

```bash
git add shared/state-machine.js
git commit -m "feat(shared): add generic state machine engine"
```

---

### Task 4: 创建通用文件管理 DAO

**Files:**
- Create: `shared/file-manager.js`

- [ ] **Step 1: 创建 `shared/file-manager.js`**

从 `db/fixture-files.js` 中提取通用文件管理逻辑，去掉治具特定依赖：

```js
// shared/file-manager.js — 通用文件管理 DAO（子系统无关）
const path = require('path');
const fs = require('fs');

/**
 * 创建文件管理器工厂
 * @param {object} deps
 * @param {Function} deps.q - 数据库查询函数 (sql, params) => rows
 * @param {Function} deps.one - 单行查询函数
 * @param {Function} deps.run - 写操作函数
 * @param {string} deps.uploadDir - 物理上传目录绝对路径
 * @param {string} deps.filesTable - 文件表名（供子系统自定义）
 * @param {Array} deps.categories - 文件分类 [{key, label, extensions}]
 */
function createFileManager(deps) {
  var q = deps.q, one = deps.one, run = deps.run;
  var uploadDir = deps.uploadDir;
  var table = deps.filesTable || 'files';
  var categories = deps.categories || [];

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  /** 新增文件记录 */
  async function addFile(record) {
    var sql = 'INSERT INTO ' + table + ' (target_id, category, filename, original_name, mime_type, file_size, file_path, created_by, note) VALUES (?,?,?,?,?,?,?,?,?)';
    var result = await run(sql, [record.target_id, record.category, record.filename, record.original_name, record.mime_type, record.file_size, record.file_path, record.created_by, record.note || '']);
    return result;
  }

  /** 列出目标对象的文件 */
  async function listFiles(targetId, category) {
    var sql = 'SELECT * FROM ' + table + ' WHERE target_id = ?';
    var params = [targetId];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY created_at DESC';
    return q(sql, params);
  }

  /** 删除文件记录及物理文件 */
  async function deleteFile(fileId) {
    var row = await one('SELECT * FROM ' + table + ' WHERE id = ?', [fileId]);
    if (!row) throw { status: 404, message: '文件不存在' };
    var fp = path.join(uploadDir, row.file_path || row.filename);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略物理删除失败 */ }
    await run('DELETE FROM ' + table + ' WHERE id = ?', [fileId]);
    return row;
  }

  /** 按分类统计文件数 */
  async function countByCategory(targetId, category) {
    var sql = 'SELECT COUNT(*) as cnt FROM ' + table + ' WHERE target_id = ?';
    var params = [targetId];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    return one(sql, params);
  }

  return { addFile, listFiles, deleteFile, countByCategory, uploadDir, categories };
}

module.exports = { createFileManager };
```

- [ ] **Step 2: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c shared/file-manager.js
```

- [ ] **Step 3: Commit**

```bash
git add shared/file-manager.js
git commit -m "feat(shared): add generic file manager DAO factory"
```

---

### Task 5: 迁移共享前端模块到 shared/frontend/

**Files:**
- Create: `shared/frontend/shared/utils.js`（复制自 `public/js/shared/utils.js`）
- Create: `shared/frontend/modal.js`（复制自 `public/js/modal.js`）
- Modify: `server.js`（添加 shared/frontend/ 静态服务）

- [ ] **Step 1: 复制文件**

```bash
cd /www/wwwroot/sample-mgmt
mkdir -p shared/frontend/shared
cp public/js/shared/utils.js shared/frontend/shared/utils.js
cp public/js/modal.js shared/frontend/modal.js
```

- [ ] **Step 2: 拆分 api-base.js — 创建共享版**

创建 `shared/frontend/api-base.js`，仅保留通用部分（api/doLogin/doLogout/boot/statusBadge/fmt/showToast/$），移除子系统特定的 STATUS/ACTION_CN 常量（它们应移到各自的 manifest 或 constants 文件中）：

```js
// shared/frontend/api-base.js — 框架共享前端基础
// 子系统特定常量(STATUS/ACTION_CN) → subsystems/<id>/frontend/js/constants.js

var $ = function (s, r) { return (r || document).querySelector(s); };

var ROLE = { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' };

async function api(method, url, body) {
  var opt = { method: method, credentials: 'include', headers: {} };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  var r = await fetch(url, opt);
  var text = await r.text();
  var data = {};
  try { data = JSON.parse(text); } catch (e) { data = {}; }
  if (!r.ok) throw new Error(data.error || ('错误 ' + r.status));
  return data;
}

async function doLogin() {
  var err = document.getElementById('lg-err');
  err.textContent = '';
  try {
    me = await api('POST', '/api/login', {
      username: document.getElementById('lg-user').value,
      password: document.getElementById('lg-pass').value
    });
    document.getElementById('login').style.display = 'none';
    showApp();
  } catch (e) { err.textContent = e.message; }
}

async function doLogout() {
  try { await api('POST', '/api/logout'); } catch (e) { }
  location.reload();
}

async function boot(pageTitle) {
  try {
    var res = await api('GET', '/api/me');
    me = res;
    document.title = pageTitle || '制造品质管理系统';
    showApp();
  } catch (e) { document.getElementById('login').style.display = 'flex'; }
}

function statusBadge(row) {
  var cls0 = row.status || 'NEW';
  var cls = 'b-' + cls0;
  var label = row._statusLabel || cls0;
  return '<fluent-badge class="badge ' + cls + '" appearance="filled">' + label + '</fluent-badge>';
}

function fmt(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function showToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(function() { el.className = 'toast'; }, 2500);
}

var me = null;
```

- [ ] **Step 5: 在 server.js 中注册 shared/frontend/ 静态路径**

```js
// 在 existing express.static 之前添加：
app.use('/shared/frontend', express.static(path.join(__dirname, 'shared', 'frontend'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
  etag: true,
  setHeaders: function(res, filePath) {
    if (/\.js$/.test(filePath)) {
      res.set('Cache-Control', process.env.NODE_ENV === 'production' ? 'public, max-age=604800, immutable' : 'no-cache');
    }
  }
}));
```

- [ ] **Step 6: 验证**

```bash
cd /www/wwwroot/sample-mgmt && node -c shared/frontend/api-base.js
npm start
# 浏览器访问: http://localhost:3000/shared/frontend/api-base.js → 应返回JS源码
```

- [ ] **Step 7: Commit**

```bash
git add shared/frontend/
git commit -m "feat(shared): migrate shared frontend modules to shared/frontend/"
```

---

### Task 6: 创建 subsystems/ 根目录 + 子系统注册路由

**Files:**
- Create: `subsystems/.gitkeep`
- Create: `routes/subsystems.js`（GET/PUT /api/subsystems）

- [ ] **Step 1: 创建目录**

```bash
mkdir -p /www/wwwroot/sample-mgmt/subsystems
touch /www/wwwroot/sample-mgmt/subsystems/.gitkeep
```

- [ ] **Step 2: 创建 `routes/subsystems.js`**

```js
// routes/subsystems.js — 子系统注册与管理 API
const fs = require('fs');
const path = require('path');

/** 全局子系统注册表：{ id: manifest } */
var registry = {};

/**
 * 扫描 subsystems/ 目录，加载所有 manifest.json
 * @returns {object} { id: manifest }
 */
function scanSubsystems(subsystemsDir) {
  var dir = subsystemsDir || path.join(__dirname, '..', 'subsystems');
  var result = {};
  if (!fs.existsSync(dir)) return result;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (entry) {
    if (!entry.isDirectory()) return;
    var manifestPath = path.join(dir, entry.name, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.id && manifest.id === entry.name) {
          result[manifest.id] = manifest;
        }
      } catch (e) {
        console.error('[子系统] 无法解析 manifest: ' + manifestPath, e.message);
      }
    }
  });
  return result;
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 获取所有子系统（门户渲染用）
  app.get('/api/subsystems', function (req, res) {
    var list = Object.values(registry).map(function (m) {
      return {
        id: m.id, name: m.name, description: m.description,
        icon: m.icon, version: m.version,
        route: m.route,
        stateCount: m.stateMachine ? Object.keys(m.stateMachine.states).length : 0,
        navCount: m.navigation ? m.navigation.length : 0
      };
    });
    res.json(list);
  });

  // 获取单个子系统 manifest
  app.get('/api/subsystems/:id', function (req, res) {
    var m = registry[req.params.id];
    if (!m) return res.status(404).json({ error: '子系统不存在' });
    res.json(m);
  });

  // 更新 manifest（ADMIN 专属）
  app.put('/api/subsystems/:id/manifest', requireAuth, async function (req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可操作' });
    var id = req.params.id;
    var subsystemDir = path.join(__dirname, '..', 'subsystems', id);
    if (!fs.existsSync(subsystemDir)) return res.status(404).json({ error: '子系统不存在' });
    try {
      var newManifest = req.body;
      if (!newManifest.id || newManifest.id !== id) return res.status(400).json({ error: 'manifest.id 必须与路径一致' });
      fs.writeFileSync(path.join(subsystemDir, 'manifest.json'), JSON.stringify(newManifest, null, 2), 'utf8');
      registry[id] = newManifest;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: '更新失败: ' + e.message });
    }
  });
}

module.exports = { register, scanSubsystems, registry };
```

- [ ] **Step 3: 在 server.js 中注册**

```js
// server.js 路由注册区新增一行：
require('./routes/subsystems').register(app);
```

- [ ] **Step 4: 验证**

```bash
cd /www/wwwroot/sample-mgmt && node -c routes/subsystems.js
npm start
# curl http://localhost:3000/api/subsystems → 应返回 []
```

- [ ] **Step 5: Commit**

```bash
git add subsystems/ routes/subsystems.js
git commit -m "feat(subsystems): add subsystem registry route + scan logic"
```

---

### Phase 2: 样品子系统迁移（8 Tasks）

> 目标：将样品管理代码迁移到 `subsystems/samples/`，旧路径保留并行运行。
> 验证：每 Task 完成后，样品管理全部功能正常。

---

### Task 7: 创建样品子系统目录 + manifest.json

**Files:**
- Create: `subsystems/samples/manifest.json`

- [ ] **Step 1: 创建目录**

```bash
mkdir -p /www/wwwroot/sample-mgmt/subsystems/samples/{backend,db,frontend/{js/views,css},seed}
```

- [ ] **Step 2: 创建 manifest.json**

```json
{
  "id": "samples",
  "name": "样品管理",
  "description": "覆盖样品发行→确认→生命周期管理→分发全流程",
  "version": "1.0.0",
  "icon": "flask",
  "route": {
    "prefix": "/api/samples",
    "entry": "/subsystems/samples/frontend/index.html",
    "hashBase": "/samples"
  },
  "database": {
    "tables": [
      { "name": "samples", "schema": "db/schema.sql" },
      { "name": "scan_logs", "schema": "db/schema.sql" }
    ]
  },
  "roles": {
    "use": ["ADMIN", "RD", "QA", "CUSTODY", "ME"],
    "admin": ["ADMIN"]
  },
  "navigation": [
    { "key": "dashboard", "label": "样品看板", "icon": "chart", "view": "renderDashboard", "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "samples",   "label": "样品列表", "icon": "list",  "view": "viewSamples",     "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "new",       "label": "新建样品", "icon": "add",   "view": "viewNew",         "roles": ["ADMIN", "RD"] },
    { "key": "scan",      "label": "扫码台",   "icon": "qr",    "view": "viewScan",        "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "logs",      "label": "操作日志", "icon": "history","view": "viewLogs",       "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "users",     "label": "用户管理", "icon": "people", "view": "viewUsers",      "roles": ["ADMIN"] }
  ],
  "stateMachine": {
    "initial": "NEW",
    "states": {
      "NEW":        { "label": "新建(待制作)",   "color": "#115e59", "bg": "#f0fdfa" },
      "PRODUCED":   { "label": "制作完成",       "color": "#155e75", "bg": "#ecfeff" },
      "RELEASED":   { "label": "已发行",         "color": "#854d0e", "bg": "#fef9c3" },
      "IN_CUSTODY": { "label": "保管中",         "color": "#166534", "bg": "#dcfce7" },
      "RETURNING":  { "label": "退回审核中",     "color": "#991b1b", "bg": "#fee2e2" },
      "RETIRED":    { "label": "已作废",         "color": "#999999", "bg": "#f0f0f0" }
    },
    "transitions": [
      { "from": "NEW",        "to": "PRODUCED",   "action": "PRODUCE",       "role": ["RD"],           "label": "制作完成" },
      { "from": "PRODUCED",   "to": "RELEASED",   "action": "RELEASE",       "role": ["QA"],           "label": "正式发行" },
      { "from": "RELEASED",   "to": "IN_CUSTODY", "action": "CUSTODY",       "role": ["CUSTODY","ME"], "label": "接收保管" },
      { "from": "IN_CUSTODY", "to": "RETURNING",  "action": "RETURN_REQUEST","role": ["CUSTODY","ME"], "label": "申请退回" },
      { "from": "RETURNING",  "to": "RELEASED",   "action": "RE_RELEASE",    "role": ["QA"],           "label": "重新发行" },
      { "from": "RETURNING",  "to": "RETIRED",    "action": "RETIRE_ONLY",   "role": ["QA"],           "label": "直接作废" },
      { "from": "RETURNING",  "to": "IN_CUSTODY", "action": "RETURN_REJECT", "role": ["QA"],           "label": "拒绝退回" },
      { "from": "RELEASED",   "to": "RELEASED",   "action": "INSPECT",       "role": ["QA"],           "label": "复检"},
      { "from": "RELEASED",   "to": "RELEASED",   "action": "EDIT_CARD",     "role": ["QA"],           "label": "修正标示卡" },
      { "from": "IN_CUSTODY", "to": "IN_CUSTODY", "action": "EDIT_STORAGE",  "role": ["CUSTODY","ME"], "label": "修改储位" },
      { "from": "RETURNING",  "to": "RETURNING",  "action": "RETIRE_RECREATE","role": ["QA"],          "label": "退回研发重做" },
      { "from": "RETURNING",  "to": "RETIRED",    "action": "RECREATE",      "role": ["RD"],           "label": "创建替代品" }
    ]
  }
}
```

- [ ] **Step 3: 手动校验 manifest schema**

```bash
cd /www/wwwroot/sample-mgmt
node -e "
var m = require('./subsystems/samples/manifest.json');
console.assert(m.id==='samples', 'id');
console.assert(m.route.prefix, 'prefix');
console.assert(m.navigation.length>=5, 'nav');
console.assert(m.stateMachine.states.NEW, 'states');
console.assert(m.stateMachine.transitions.length>=10, 'transitions');
console.log('manifest OK');
"
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/samples/manifest.json
git commit -m "feat(samples): add manifest.json for subsystem plugin protocol"
```

---

### Task 8: 提取样品 DB schema + DAO

**Files:**
- Create: `subsystems/samples/db/schema.sql`
- Create: `subsystems/samples/db/dao.js`

- [ ] **Step 1: 创建 `subsystems/samples/db/schema.sql`**

从 `db.js` 的 `init()` 中提取 `samples` 和 `scan_logs` 的 CREATE TABLE 语句：

```sql
-- subsystems/samples/db/schema.sql
-- 样品子系统数据库表定义

CREATE TABLE IF NOT EXISTS samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_no VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  spec VARCHAR(200) DEFAULT '',
  model VARCHAR(100) DEFAULT '',
  station VARCHAR(100) DEFAULT '',
  sample_type VARCHAR(20) DEFAULT '',
  limit_item VARCHAR(50) DEFAULT '',
  source_type VARCHAR(10) DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'NEW',
  image TEXT,
  produced_image TEXT,
  inspect_image TEXT,
  notes TEXT,
  signed_by_rd VARCHAR(100) DEFAULT '',
  signed_by_qa VARCHAR(100) DEFAULT '',
  card_version VARCHAR(10) DEFAULT '01',
  test_standard TEXT,
  test_data TEXT,
  release_cycle_days INT DEFAULT 90,
  released_at VARCHAR(30) DEFAULT '',
  produced_at VARCHAR(30) DEFAULT '',
  next_inspect_at VARCHAR(30) DEFAULT '',
  valid_until VARCHAR(30) DEFAULT '',
  custody_dept VARCHAR(100) DEFAULT '',
  storage_location VARCHAR(200) DEFAULT '',
  retired_reason TEXT,
  retire_assigned_rd VARCHAR(10) DEFAULT NULL,
  replaced_by VARCHAR(20) DEFAULT '',
  replaces VARCHAR(20) DEFAULT '',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(30) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scan_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_id INT NOT NULL,
  target_type VARCHAR(20) DEFAULT 'sample',
  target_id INT DEFAULT NULL,
  action VARCHAR(30) NOT NULL,
  role VARCHAR(20) DEFAULT '',
  user_id INT,
  dept VARCHAR(100) DEFAULT '',
  location VARCHAR(200) DEFAULT '',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: 创建 `subsystems/samples/db/dao.js`**

从 `db/samples.js` + `db/logs.js` 迁移，保持函数签名不变：

```js
// subsystems/samples/db/dao.js — 样品数据访问层
module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  function escapeLike(str) { return str.replace(/[%_\\]/g, '\\$&'); }

  async function createSample(data) {
    var no = await generateSampleNo();
    var sql = 'INSERT INTO samples (sample_no,name,spec,model,station,sample_type,limit_item,source_type,notes,image,signed_by_rd,signed_by_qa,card_version,test_standard,test_data,valid_until,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    var result = await run(sql, [no, data.name, data.spec||'', data.model||'', data.station||'', data.sample_type||'', data.limit_item||'', data.source_type||'', data.notes||'', data.image||'', data.signed_by_rd||'', data.signed_by_qa||'', data.card_version||'01', data.test_standard||'', data.test_data||'', data.valid_until||'', data.created_by, nowISO()]);
    return { id: result.insertId, sample_no: no, ...data };
  }

  async function generateSampleNo() {
    var ts = nowISO().replace(/[-:T]/g,'').slice(2,12);
    var row = await one('SELECT COUNT(*) as cnt FROM samples WHERE sample_no LIKE ?', [ts + '%']);
    var seq = String((row.cnt || 0) + 1).padStart(3, '0');
    return ts + seq;
  }

  async function getSampleById(id) {
    return one('SELECT * FROM samples WHERE id = ?', [id]);
  }

  async function getSampleByNo(no) {
    return one('SELECT * FROM samples WHERE sample_no = ?', [no]);
  }

  async function getSampleByToken(token) {
    return one('SELECT * FROM samples WHERE sample_no = ? OR id = ?', [token, parseInt(token)||0]);
  }

  async function listSamples(opts) {
    opts = opts || {};
    var where = [], params = [];
    if (opts.status) { where.push('status = ?'); params.push(opts.status); }
    if (opts.dept) { where.push('custody_dept = ?'); params.push(opts.dept); }
    if (opts.search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)');
      var like = '%' + escapeLike(opts.search) + '%';
      params.push(like, like, like); }
    if (opts.sample_type) { where.push('sample_type = ?'); params.push(opts.sample_type); }
    if (opts.limit_item) { where.push('limit_item = ?'); params.push(opts.limit_item); }
    if (opts.source_type) { where.push('source_type = ?'); params.push(opts.source_type); }
    var wc = where.length ? ' WHERE ' + where.join(' AND ') : '';
    var sort = ' ORDER BY id DESC';
    if (opts.sort) {
      if (opts.sort === 'sample_no') sort = ' ORDER BY CAST(sample_no AS CHAR) ASC';
      else if (opts.sort === '-sample_no') sort = ' ORDER BY CAST(sample_no AS CHAR) DESC';
      else if (opts.sort === 'created_at') sort = ' ORDER BY id ASC';
    }
    var limit = ' LIMIT ' + (opts.limit || 20) + ' OFFSET ' + (opts.offset || 0);
    return q('SELECT * FROM samples' + wc + sort + limit, params);
  }

  async function countAllSamples(opts) {
    opts = opts || {};
    var where = [], params = [];
    if (opts.status) { where.push('status = ?'); params.push(opts.status); }
    if (opts.dept) { where.push('custody_dept = ?'); params.push(opts.dept); }
    if (opts.search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)');
      var like = '%' + escapeLike(opts.search) + '%'; params.push(like, like, like); }
    if (opts.sample_type) { where.push('sample_type = ?'); params.push(opts.sample_type); }
    if (opts.limit_item) { where.push('limit_item = ?'); params.push(opts.limit_item); }
    if (opts.source_type) { where.push('source_type = ?'); params.push(opts.source_type); }
    var wc = where.length ? ' WHERE ' + where.join(' AND ') : '';
    var row = await one('SELECT COUNT(*) as cnt FROM samples' + wc, params);
    return row.cnt;
  }

  async function updateSample(data, conn) {
    var clauses = [], vals = [];
    var fields = ['name','spec','model','station','sample_type','limit_item','source_type','status','image','produced_image','inspect_image','notes','signed_by_rd','signed_by_qa','card_version','test_standard','test_data','release_cycle_days','released_at','produced_at','next_inspect_at','valid_until','custody_dept','storage_location','retired_reason','retire_assigned_rd','replaced_by','replaces','updated_at'];
    fields.forEach(function(f) {
      if (data[f] !== undefined) { clauses.push(f + ' = ?'); vals.push(data[f]); }
    });
    if (clauses.length === 0) return data;
    vals.push(data.id);
    await (conn ? conn.execute : run)('UPDATE samples SET ' + clauses.join(',') + ' WHERE id = ?', vals);
    return data;
  }

  async function deleteSample(id) {
    await run('DELETE FROM scan_logs WHERE sample_id = ?', [id]);
    await run('DELETE FROM samples WHERE id = ?', [id]);
  }

  // 日志
  async function addLog(log, conn) {
    var sql = 'INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note) VALUES (?,?,?,?,?,?,?)';
    await (conn ? conn.execute : run)(sql, [log.sample_id, log.action, log.role, log.user_id, log.dept||'', log.location||'', log.note||'']);
  }

  async function listLogsBySample(sampleId) {
    return q('SELECT * FROM scan_logs WHERE sample_id = ? ORDER BY created_at DESC', [sampleId]);
  }

  return { createSample, getSampleById, getSampleByNo, getSampleByToken, listSamples, countAllSamples, updateSample, deleteSample, addLog, listLogsBySample };
};
```

- [ ] **Step 3: 验证语法并挂载到 db.js**

在 `db.js` 顶部新增子系统 DAO 加载逻辑：

```js
// db.js — loader（新增部分）
const fs = require('fs');
const path = require('path');

// 扫描 subsystems/ 加载各子系统的 db/dao.js
function loadSubsystemDAOs(deps) {
  const subsystemsDir = path.join(__dirname, 'subsystems');
  if (!fs.existsSync(subsystemsDir)) return {};
  const result = {};
  const entries = fs.readdirSync(subsystemsDir, { withFileTypes: true });
  entries.forEach(entry => {
    if (!entry.isDirectory()) return;
    const daoPath = path.join(subsystemsDir, entry.name, 'db', 'dao.js');
    if (fs.existsSync(daoPath)) {
      try {
        result[entry.name] = require(daoPath)(deps);
      } catch (e) {
        console.error('[DB] 加载 DAO 失败: ' + daoPath, e.message);
      }
    }
  });
  return result;
}
```

然后在 `module.exports` 中展开子系统 DAO（保持与现有 API 兼容）。

- [ ] **Step 4: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c subsystems/samples/db/dao.js
```

- [ ] **Step 5: Commit**

```bash
git add subsystems/samples/db/
git commit -m "feat(samples): extract DB schema + DAO for plugin protocol"
```

---

### Task 9: 迁移样品后端路由

**Files:**
- Create: `subsystems/samples/backend/index.js`
- Modify: `db.js`（挂载子系统 DAO，与旧路径并行）

- [ ] **Step 1: 创建 `subsystems/samples/backend/index.js`**

从 `routes/samples.js` + `routes/scan.js` + `routes/cards.js` 迁移全部路由到一个 register 函数中：

```js
// subsystems/samples/backend/index.js — 样品子系统后端入口
const path = require('path');
const fs = require('fs');
const { logger } = require('../../../logger');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
const UPLOAD_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10);

// 保存样品图片
async function saveSampleImage(dataUrl, sampleNo) {
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
    await fs.promises.writeFile(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
    return '/uploads/' + fname;
  } catch (e) { logger.error('保存图片失败: ' + e.message); return null; }
}

// 扫码台 — allowedActions
const STATUS_LABEL = {
  NEW: '新建(待制作确认)', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已作废'
};

function allowedActions(role, status, next_inspect_at, retire_assigned_rd, currentUserId) {
  const actions = [];
  if (role === 'RD' && status === 'NEW') actions.push('PRODUCE');
  if (role === 'QA' && status === 'PRODUCED') actions.push('RELEASE');
  if ((role === 'CUSTODY' || role === 'ME') && status === 'RELEASED') actions.push('CUSTODY');
  if (role === 'QA' && status === 'RELEASED') { actions.push('INSPECT'); actions.push('EDIT_CARD'); }
  if ((role === 'CUSTODY' || role === 'ME') && status === 'IN_CUSTODY') { actions.push('EDIT_STORAGE'); actions.push('RETURN_REQUEST'); }
  if (role === 'QA' && status === 'RETURNING') { actions.push('RE_RELEASE'); actions.push('RETIRE_RECREATE'); actions.push('RETIRE_ONLY'); actions.push('RETURN_REJECT'); }
  if (role === 'RD' && status === 'RETURNING' && String(retire_assigned_rd) === String(currentUserId)) actions.push('RECREATE');
  return actions;
}

function nextCardVersion(current) {
  const m = String(current||'').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return String(Math.min(n + 1, 99)).padStart(2, '0');
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  const D = require('../../../db');
  // 保持旧路径完全兼容：/api/samples, /api/scan, /api/resolve, /card/
  require('../../../routes/samples').register(app);
  require('../../../routes/scan').register(app);
  require('../../../routes/cards').register(app);

  // 挂载 saveSampleImage 供 scan 使用
  app.locals.saveSampleImage = app.locals.saveSampleImage || saveSampleImage;
}

module.exports = { register };
```

- [ ] **Step 2: 当前阶段保持旧路由兼容**

子系统迁移阶段，`subsystems/samples/backend/index.js` 内部仍引用旧路由文件，确保零停机。Phase 6 统一切换。

- [ ] **Step 3: Commit**

```bash
git add subsystems/samples/backend/
git commit -m "feat(samples): add backend entry for plugin protocol (parallel with old routes)"
```

---

### Task 10: 迁移样品前端 SPA 入口

**Files:**
- Create: `subsystems/samples/frontend/index.html`
- Create: `subsystems/samples/frontend/css/module.css`

- [ ] **Step 1: 从 app.css 中提取样品专属样式到 module.css**

```bash
# 从 app.css 提取 .b-NEW, .b-PRODUCED, .b-RELEASED, .b-IN_CUSTODY, .b-RETURNING, .b-overdue 等状态 badge
# 以及 .samples-table, .dash-alert-table, .card-grid, .scan-box 等样品专属样式
```

创建 `subsystems/samples/frontend/css/module.css`（从 app.css 对应行复制）。

- [ ] **Step 2: 创建前端 SPA 入口**

`subsystems/samples/frontend/index.html` 基于当前 `public/index.html` 修改，调整路径引用：

```html
<link rel="stylesheet" href="/css/app.css?v=20260803d" />
<link rel="stylesheet" href="/subsystems/samples/frontend/css/module.css" />
<!-- 共享 JS -->
<script src="/shared/frontend/shared/utils.js?v=20260803a"></script>
<script src="/shared/frontend/api-base.js"></script>
<script src="/shared/frontend/modal.js"></script>
<!-- 子系统常量 + API -->
<script src="/js/shared-constants.js"></script>
<script src="/js/constants.js"></script>
<script src="/js/api.js"></script>
<script src="/js/ui.js"></script>
<!-- ... 其余页面模块 JS ... -->
```

- [ ] **Step 3: 验证语法 / 验证路径可访问**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 浏览器访问: http://localhost:3000/subsystems/samples/frontend/index.html
# 确认能正常登录和使用
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/samples/frontend/
git commit -m "feat(samples): add frontend SPA entry for plugin protocol"
```

---

### Task 11: 迁移样品前端 JS（views 拆分）

**Files:**
- Create: `subsystems/samples/frontend/js/router.js`（复制自 `public/js/router.js`）
- Create: `subsystems/samples/frontend/js/views/*.js`（从 `public/js/` 按 view 拆分）

- [ ] **Step 1: 创建 views 目录并复制文件**

```bash
cd /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js
cp /www/wwwroot/sample-mgmt/public/js/router.js ./router.js
cp /www/wwwroot/sample-mgmt/public/js/dashboard.js ./views/dashboard.js
cp /www/wwwroot/sample-mgmt/public/js/dashboard-todo.js ./views/dashboard-todo.js
cp /www/wwwroot/sample-mgmt/public/js/samples.js ./views/list.js
cp /www/wwwroot/sample-mgmt/public/js/sample-filter.js ./views/list-filter.js
cp /www/wwwroot/sample-mgmt/public/js/sample-list-render.js ./views/list-render.js
cp /www/wwwroot/sample-mgmt/public/js/new.js ./views/new.js
cp /www/wwwroot/sample-mgmt/public/js/scan.js ./views/scan.js
cp /www/wwwroot/sample-mgmt/public/js/scan-wizard.js ./views/scan-wizard.js
cp /www/wwwroot/sample-mgmt/public/js/scan-return-actions.js ./views/scan-return-actions.js
cp /www/wwwroot/sample-mgmt/public/js/scan-camera.js ./views/scan-camera.js
cp /www/wwwroot/sample-mgmt/public/js/logs.js ./views/logs.js
cp /www/wwwroot/sample-mgmt/public/js/users.js ./views/users.js
cp /www/wwwroot/sample-mgmt/public/js/detail.js ./views/detail.js
```

- [ ] **Step 2: 更新 router.js 中的路径引用**

如果 router.js 中有对 `public/js/` 路径的引用，更新为子系统内部路径。

- [ ] **Step 3: 验证**

```bash
npm start
# 浏览器访问: http://localhost:3000/subsystems/samples/frontend/index.html#/dashboard
# 确认看板、列表、新建、扫码、日志、用户管理全部正常
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/samples/frontend/js/
git commit -m "feat(samples): migrate frontend JS views for plugin protocol"
```

---

### Task 12: 迁移样品种子数据

**Files:**
- Create: `subsystems/samples/seed/seed.js`

- [ ] **Step 1: 创建 seed.js**

```bash
cp /www/wwwroot/sample-mgmt/seed-samples.js /www/wwwroot/sample-mgmt/subsystems/samples/seed/seed.js
```

修改为导出 `seed(pool)` 函数：

```js
// subsystems/samples/seed/seed.js
module.exports = async function seed(pool) {
  // ... 原有 seed-samples.js 的内容，使用传入的 pool 替代直接 require db ...
};
```

- [ ] **Step 2: Commit**

```bash
git add subsystems/samples/seed/
git commit -m "feat(samples): add seed data for plugin protocol"
```

---

### Task 13: 更新 index.html 引用路径指向子系统目录

**Files:**
- Modify: `public/index.html`（改动最小化——添加注释标记过渡期）

- [ ] **Step 1: 当前阶段仅做标记，不做路径切换**

在 `public/index.html` 顶部添加注释：

```html
<!--
  过渡期说明：此文件为样品子系统旧入口。
  新入口: /subsystems/samples/frontend/index.html
  Phase 6 统一切换后删除此文件。
-->
```

- [ ] **Step 2: Commit**

```bash
git add public/index.html
git commit -m "docs(samples): add migration marker in old index.html"
```

---

### Task 14: 样品迁移完成后回归验证

- [ ] **Step 1: 全功能回归**

```bash
npm start
# 手动验证：
# 1. 旧入口 http://localhost:3000/index.html → 登录 → 全部功能正常
# 2. 新入口 http://localhost:3000/subsystems/samples/frontend/index.html → 同上
# 3. 门户 http://localhost:3000/ → 样品卡片可点入
# 4. API: curl http://localhost:3000/api/samples?limit=5 → 正常返回
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(samples): subsystem migration regression verified"
```

---

### Phase 3: 治具子系统迁移（8 Tasks）

> 目标：将治具管理代码迁移到 `subsystems/fixtures/`。流程与 Phase 2 完全对称。
> 由于篇幅限制，Tasks 15-22 与 Tasks 7-14 结构相同，此处列出关键差异点。

---

### Task 15: 创建治具子系统目录 + manifest.json

**Files:**
- Create: `subsystems/fixtures/manifest.json`

关键差异：状态机包含 12 个状态 + 20+ 条转移规则 + `files` 字段。

```json
{
  "id": "fixtures",
  "name": "治具管理",
  "description": "覆盖治具申请→制作→验证移交→领用→维修→报废全流程",
  "version": "1.0.0",
  "icon": "wrench",
  "route": {
    "prefix": "/api/fixtures",
    "entry": "/subsystems/fixtures/frontend/index.html",
    "hashBase": "/fixtures"
  },
  "database": {
    "tables": [
      { "name": "fixtures", "schema": "db/schema.sql" },
      { "name": "fixture_logs", "schema": "db/schema.sql" },
      { "name": "fixture_files", "schema": "db/schema.sql" }
    ]
  },
  "roles": { "use": ["ADMIN", "RD", "QA", "CUSTODY", "ME"], "admin": ["ADMIN"] },
  "navigation": [
    { "key": "dashboard", "label": "治具看板", "icon": "chart", "view": "renderFixtureDashboard", "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "list", "label": "治具清单", "icon": "list", "view": "renderFixtureList", "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "new", "label": "新建申请", "icon": "add", "view": "renderFixtureNew", "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "scan", "label": "扫码台", "icon": "qr", "view": "renderFixtureScan", "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "logs", "label": "操作日志", "icon": "history", "view": "renderFixtureLogs", "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"] }
  ],
  "stateMachine": {
    "initial": "REQUESTED",
    "states": {
      "REQUESTED": { "label": "已申请", "color": "#666666", "bg": "#f0f0f0" },
      "ACCEPTED": { "label": "已接收", "color": "#1d4ed8", "bg": "#dbeafe" },
      "VERIFY_PENDING": { "label": "待双人验证", "color": "#92400e", "bg": "#fef3c7" },
      "VERIFY_RD_OK": { "label": "RD已确认", "color": "#3730a3", "bg": "#e0e7ff" },
      "VERIFY_ORG_OK": { "label": "申请单位已确认", "color": "#9d174d", "bg": "#fce7f3" },
      "TRANSFERRED": { "label": "已移交", "color": "#065f46", "bg": "#d1fae5" },
      "IN_USE": { "label": "领用中", "color": "#1d4ed8", "bg": "#dbeafe" },
      "IMPROVING": { "label": "改善中", "color": "#92400e", "bg": "#fef3c7" },
      "REPAIRING_ME": { "label": "ME维修中", "color": "#991b1b", "bg": "#fee2e2" },
      "REPAIRING_RD": { "label": "RD维修中", "color": "#9a3412", "bg": "#fed7aa" },
      "REPAIR_DONE": { "label": "维修完成", "color": "#3730a3", "bg": "#e0e7ff" },
      "RETIRED": { "label": "已废弃", "color": "#999999", "bg": "#f0f0f0" }
    },
    "transitions": [
      { "from": "REQUESTED", "to": "ACCEPTED", "action": "ACCEPT", "role": ["RD"], "label": "RD接收" },
      { "from": "REQUESTED", "to": "RETIRED", "action": "CANCEL", "role": ["RD","ADMIN"], "label": "撤销申请" },
      { "from": "ACCEPTED", "to": "VERIFY_PENDING", "action": "MAKE", "role": ["RD"], "label": "制作完成" },
      { "from": "VERIFY_PENDING", "to": "VERIFY_RD_OK", "action": "VERIFY_RD", "role": ["RD"], "label": "RD验证" },
      { "from": "VERIFY_PENDING", "to": "VERIFY_ORG_OK", "action": "VERIFY_ORG", "role": ["QA","CUSTODY","ME"], "label": "申请单位验证" },
      { "from": "VERIFY_RD_OK", "to": "TRANSFERRED", "action": "VERIFY_ORG", "role": ["QA","CUSTODY","ME"], "label": "申请单位验证（移交）" },
      { "from": "VERIFY_ORG_OK", "to": "TRANSFERRED", "action": "VERIFY_RD", "role": ["RD"], "label": "RD验证（移交）" },
      { "from": "TRANSFERRED", "to": "IN_USE", "action": "USE", "role": ["ME","QA","CUSTODY"], "label": "领用" },
      { "from": "IN_USE", "to": "TRANSFERRED", "action": "RETURN", "role": ["ME","QA","CUSTODY"], "label": "归还" },
      { "from": "IN_USE", "to": "REPAIRING_ME", "action": "REPAIR_ME", "role": ["ME"], "label": "ME自行维修" },
      { "from": "IN_USE", "to": "REPAIRING_RD", "action": "REPAIR_RD_REQ", "role": ["ME","QA","CUSTODY"], "label": "退回RD维修" },
      { "from": "REPAIRING_ME", "to": "REPAIR_DONE", "action": "REPAIR_DONE", "role": ["ME"], "label": "ME维修完成" },
      { "from": "REPAIRING_RD", "to": "REPAIR_DONE", "action": "REPAIR_RD_DONE", "role": ["RD"], "label": "RD维修完成" },
      { "from": "REPAIR_DONE", "to": "TRANSFERRED", "action": "REPAIR_CONFIRM", "role": ["ME"], "label": "ME确认维修" },
      { "from": "IN_USE", "to": "IMPROVING", "action": "IMPROVE", "role": ["ME","QA","CUSTODY"], "label": "申请改善" },
      { "from": "IMPROVING", "to": "RETIRED", "action": "IMPROVE_DONE", "role": ["ME","QA","CUSTODY"], "label": "改善完成" },
      { "from": "TRANSFERRED", "to": "RETIRED", "action": "RETIRE", "role": ["ADMIN"], "label": "报废" }
    ]
  },
  "files": {
    "enabled": true,
    "uploadDir": "public/uploads/fixtures",
    "maxSize": 10485760,
    "categories": [
      { "key": "design_drawing", "label": "设计图纸", "extensions": ["pdf","dwg","dxf","step","stp","iges","igs"] },
      { "key": "verify_photo", "label": "验证照片", "extensions": ["jpg","jpeg","png","webp"] },
      { "key": "repair_photo", "label": "维修照片", "extensions": ["jpg","jpeg","png","webp"] },
      { "key": "maintenance_log", "label": "保养记录", "extensions": ["pdf","jpg","jpeg","png"] },
      { "key": "other", "label": "其他", "extensions": ["pdf","zip","rar","jpg","jpeg","png","webp"] }
    ]
  }
}
```

---

### Tasks 16-22: 治具子系统迁移（对称操作）

| Task | 内容 | 对应 Phase 2 Task |
|---|---|---|
| Task 16 | 提取治具 DB schema + DAO | Task 8 |
| Task 17 | 迁移治具后端路由（fixtures/fixture-files/fixture-preview） | Task 9 |
| Task 18 | 迁移治具前端 SPA 入口 + module.css | Task 10 |
| Task 19 | 迁移治具前端 JS（fixture-*.js → views/） | Task 11 |
| Task 20 | 迁移治具种子数据 | Task 12 |
| Task 21 | 标记旧 fixture.html | Task 13 |
| Task 22 | 治具迁移完成后回归验证 | Task 14 |

每 Task 的具体步骤与 Phase 2 对应 Task 相同，此处不再重复。

---

### Phase 4: 自动发现 + 门户动态渲染（4 Tasks）

> 目标：改造 server.js 实现子系统自动发现，改造 portal.html 实现动态卡片渲染。
> 验证：新子系统放入 `subsystems/` 后重启自动出现。

---

### Task 23: 改造 server.js 实现子系统自动发现

**Files:**
- Modify: `server.js:96-104`（路由注册区）

- [ ] **Step 1: 替换硬编码路由为自动扫描**

```js
// server.js — 替换原有硬编码路由注册：
// 原代码：
// require('./routes/auth').register(app);
// require('./routes/samples').register(app);
// ...

// 新代码：
const { scanSubsystems } = require('./routes/subsystems');
const subsystemRegistry = scanSubsystems();

// 1. 鉴权中间件始终最先注册
require('./routes/auth').register(app);

// 2. 注册子系统管理路由（门户/管理面板需要）
require('./routes/subsystems').register(app);

// 3. 扫描并注册所有子系统
Object.entries(subsystemRegistry).forEach(([id, manifest]) => {
  const backendPath = path.join(__dirname, 'subsystems', id, 'backend', 'index.js');
  if (fs.existsSync(backendPath)) {
    try {
      require(backendPath).register(app);
      logger.info('子系统已加载: ' + manifest.name + ' (' + id + ')');
    } catch (e) {
      logger.error('子系统加载失败: ' + id, e.message);
    }
  } else {
    logger.warn('子系统缺少 backend/index.js: ' + id);
  }
});

// 4. 兼容期：同时保留旧路由注册（Phase 6 删除）
require('./routes/samples').register(app);
require('./routes/scan').register(app);
require('./routes/cards').register(app);
require('./routes/misc').register(app);
require('./routes/fixtures').register(app);
require('./routes/fixture-files').register(app);
require('./routes/fixture-preview').register(app);
```

- [ ] **Step 2: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c server.js
```

- [ ] **Step 3: Commit**

```bash
git add server.js
git commit -m "feat(server): add subsystem auto-discovery with old route fallback"
```

---

### Task 24: 改造 db.js 支持子系统 schema 自动建表

**Files:**
- Modify: `db.js`（init 函数）

- [ ] **Step 1: 添加自动建表逻辑**

在 `db.js` 的 `init()` 函数末尾（建表之后），添加扫描子系统 schema：

```js
// db.js — init() 末尾添加：
// 扫描 subsystems/ 目录，自动执行各子系统的 db/schema.sql
const fs = require('fs');
const path = require('path');
const subsystemsDir = path.join(__dirname, 'subsystems');
if (fs.existsSync(subsystemsDir)) {
  const entries = fs.readdirSync(subsystemsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const schemaPath = path.join(subsystemsDir, entry.name, 'db', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      try {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        const statements = sql.split(';').filter(s => s.trim());
        for (const stmt of statements) {
          await pool.execute(stmt);
        }
        logger.info('子系统 schema 已加载: ' + entry.name);
      } catch (e) {
        logger.error('加载子系统 schema 失败: ' + entry.name, e.message);
      }
    }
  }
}
```

- [ ] **Step 2: 验证**

```bash
cd /www/wwwroot/sample-mgmt && node -c db.js && npm start
# 观察启动日志：应显示「子系统 schema 已加载: samples」「子系统 schema 已加载: fixtures」
```

- [ ] **Step 3: Commit**

```bash
git add db.js
git commit -m "feat(db): auto-create subsystem tables from schema.sql"
```

---

### Task 25: 改造 portal.html 实现动态卡片渲染

**Files:**
- Modify: `public/portal.html`（重写为动态渲染）

- [ ] **Step 1: 重写 portal.html**

移除硬编码的样品/治具卡片，替换为 JS 动态渲染：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>制造品质管理系统</title>
<style>
  /* 保持原有 portal 样式不变 */
  :root{--brand:#0f766e;--bg:#f0fdfa;/* ... 原有样式 ... */}
  /* ... 原有 CSS ... */
  .card:hover{transform:translateY(-2px);box-shadow:0 8px 25px rgba(15,23,42,.12)}
  .card .icon{font-size:32px;margin-bottom:12px}
  .card .title{font-size:16px;font-weight:700;margin-bottom:6px;color:var(--brand)}
  .card .desc{font-size:13px;color:var(--muted);line-height:1.5}
</style>
</head>
<body>
<div class="wrap">
  <div style="text-align:center;padding:50px 20px 30px">
    <h1 style="font-size:28px;margin:0">制造品质管理系统</h1>
    <p style="color:var(--muted)">选择子系统进入</p>
  </div>
  <div class="grid" id="subsystem-grid">
    <div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">加载中…</div>
  </div>
</div>
<script>
// 动态获取子系统列表并渲染卡片
(async function() {
  try {
    var res = await fetch('/api/subsystems');
    var subsystems = await res.json();
    var grid = document.getElementById('subsystem-grid');
    if (subsystems.length === 0) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:40px">暂无可用子系统</div>';
      return;
    }
    grid.innerHTML = subsystems.map(function(m) {
      return '<a class="card" href="' + m.route.entry + '">' +
        '<div class="icon">' + (m.icon || '📦') + '</div>' +
        '<div class="title">' + m.name + '</div>' +
        '<div class="desc">' + (m.description || '') + '</div>' +
        '<div style="margin-top:10px;font-size:11px;color:var(--muted)">' +
        (m.stateCount || 0) + '种状态 · ' + (m.navCount || 0) + '个功能</div>' +
        '</a>';
    }).join('');
  } catch (e) {
    document.getElementById('subsystem-grid').innerHTML = '<div style="grid-column:1/-1;text-align:center;color:#dc2626;padding:40px">加载子系统失败：' + e.message + '</div>';
  }
})();
</script>
</body>
</html>
```

- [ ] **Step 2: 验证**

```bash
npm start
# 浏览器访问 http://localhost:3000/
# 确认动态渲染了样品和治具两张卡片
```

- [ ] **Step 3: Commit**

```bash
git add public/portal.html
git commit -m "feat(portal): dynamic subsystem cards from /api/subsystems"
```

---

### Task 26: 自动发现完成后全链路回归

- [ ] **Step 1: 验证完整流程**

```bash
npm start
# 1. 门户 http://localhost:3000/ → 2 张卡片 → 可点击进入
# 2. 样品管理系统：全部功能正常
# 3. 治具管理系统：全部功能正常
# 4. curl http://localhost:3000/api/subsystems → 返回 [samples, fixtures]
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(protocol): auto-discovery + portal regression verified"
```

---

### Phase 5: 子系统管理可视化面板（4 Tasks）

> 目标：实现 ADMIN 专属的「子系统管理」界面。

---

### Task 27: 管理面板 — 子系统列表视图

**Files:**
- Create: `public/js/subsystem-manager.js`
- Modify: `public/index.html`（在导航中添加「子系统管理」入口）

- [ ] **Step 1: 创建 `public/js/subsystem-manager.js`**

```js
// subsystem-manager.js — ADMIN 子系统管理面板
var subsys_registry = [];

async function fetchSubsystems() {
  try { subsys_registry = await api('GET', '/api/subsystems'); } catch (e) { subsys_registry = []; }
}

async function viewSubsystemManager() {
  await fetchSubsystems();
  var v = $('#view');
  v.innerHTML = '<h3 style="margin:0 0 16px">子系统管理</h3>' +
    '<button class="btn" onclick="showNewSubsystemForm()" style="margin-bottom:14px">+ 新建子系统</button>' +
    '<div id="sm-cards" class="overview-cards"></div>';
  renderSubsystemCards();
}

function renderSubsystemCards() {
  var el = $('#sm-cards');
  if (!el) return;
  if (subsys_registry.length === 0) { el.innerHTML = '<div class="empty">暂无子系统</div>'; return; }
  el.innerHTML = subsys_registry.map(function(m) {
    return '<div class="overview-card">' +
      '<div class="title">' + m.name + ' <span class="tag">' + m.id + '</span></div>' +
      '<div style="font-size:12px;color:var(--muted);margin:6px 0">' + (m.stateCount || 0) + '种状态 · ' + (m.navCount || 0) + '个功能</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px">' +
      '<button class="btn sm ghost" onclick="editSubsystem(\'' + m.id + '\')">编辑</button>' +
      '<button class="btn sm ghost" style="color:var(--bad);border-color:var(--bad)" onclick="exportManifest(\'' + m.id + '\')">导出</button>' +
      '</div></div>';
  }).join('');
}

async function exportManifest(id) {
  try { var m = await api('GET', '/api/subsystems/' + id); var blob = new Blob([JSON.stringify(m, null, 2)], {type:'application/json'});
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = id + '-manifest.json'; a.click();
    showToast('已导出 manifest.json', 'ok'); } catch (e) { showToast('导出失败: ' + e.message, 'err'); }
}
```

- [ ] **Step 2: 验证**

```bash
cd /www/wwwroot/sample-mgmt && node -c public/js/subsystem-manager.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/subsystem-manager.js
git commit -m "feat(admin): add subsystem manager list view"
```

---

### Task 28: 管理面板 — 新建子系统分步表单

**Files:**
- Modify: `public/js/subsystem-manager.js`（追加表单函数）

- [ ] **Step 1: 追加 5 步表单**

```js
var newSubsysForm = { step: 1, id: '', name: '', description: '', prefix: '', icon: 'package', roles: ['ADMIN'], states: [], transitions: [], navItems: [], tables: [] };

function showNewSubsystemForm() { newSubsysForm = { step: 1, id: '', name: '', description: '', prefix: '', icon: 'package', roles: ['ADMIN'], states: [], transitions: [], navItems: [], tables: [] }; renderSubsysForm(); }

function renderSubsysForm() {
  var v = $('#view');
  var step = newSubsysForm.step;
  v.innerHTML = '<h3 style="margin:0 0 16px">新建子系统 — 步骤 ' + step + '/5</h3>' +
    (step === 1 ? renderStep1() : step === 2 ? renderStep2() : step === 3 ? renderStep3() : step === 4 ? renderStep4() : renderStep5()) +
    '<div style="margin-top:18px;display:flex;gap:10px">' +
    (step > 1 ? '<button class="btn ghost" onclick="newSubsysForm.step--;renderSubsysForm()">上一步</button>' : '') +
    (step < 5 ? '<button class="btn" onclick="newSubsysForm.step++;renderSubsysForm()">下一步</button>' : '<button class="btn" onclick="submitNewSubsystem()">提交</button>') +
    '<button class="btn ghost" onclick="viewSubsystemManager()">取消</button></div>';
}

function renderStep1() {
  return '<label>子系统ID（kebab-case）</label><input id="sf-id" value="' + newSubsysForm.id + '" placeholder="如 my-module" />' +
    '<label>名称</label><input id="sf-name" value="' + newSubsysForm.name + '" placeholder="如 我的模块" />' +
    '<label>描述</label><textarea id="sf-desc" rows="2" placeholder="子系统功能描述">' + newSubsysForm.description + '</textarea>' +
    '<label>API 前缀</label><input id="sf-prefix" value="' + newSubsysForm.prefix + '" placeholder="如 /api/my-module" />' +
    '<label>图标</label><select id="sf-icon"><option>flask</option><option>wrench</option><option>chart</option><option>package</option><option>list</option></select>';
}

function renderStep2() {
  collectStep1();
  return '<label>状态机定义（每行一个状态，格式: 状态KEY|标签|颜色|背景色）</label>' +
    '<textarea id="sf-states" rows="6" placeholder="NEW|新建|#115e59|#f0fdfa&#10;DONE|完成|#16a34a|#dcfce7">' + (newSubsysForm.states.join('\n')) + '</textarea>' +
    '<label>转移规则（每行一个，格式: 从状态|到状态|操作KEY|角色|标签）</label>' +
    '<textarea id="sf-transitions" rows="6" placeholder="NEW|DONE|COMPLETE|RD|完成操作">' + (newSubsysForm.transitions.join('\n')) + '</textarea>';
}

function collectStep1() { newSubsysForm.id = $('#sf-id').value; newSubsysForm.name = $('#sf-name').value; newSubsysForm.description = $('#sf-desc').value; newSubsysForm.prefix = $('#sf-prefix').value; }

// Steps 3-5 篇幅限制，简化处理（实际执行时补全）

async function submitNewSubsystem() {
  collectStep1();
  var manifest = { id: newSubsysForm.id, name: newSubsysForm.name, description: newSubsysForm.description, version: '1.0.0', icon: newSubsysForm.icon, route: { prefix: newSubsysForm.prefix, entry: '/subsystems/' + newSubsysForm.id + '/frontend/index.html', hashBase: '/' + newSubsysForm.id }, database: { tables: newSubsysForm.tables }, roles: { use: newSubsysForm.roles, admin: ['ADMIN'] }, navigation: newSubsysForm.navItems };
  try { await api('PUT', '/api/subsystems/' + newSubsysForm.id + '/manifest', manifest); showToast('子系统已创建', 'ok'); viewSubsystemManager(); } catch (e) { showToast('创建失败: ' + e.message, 'err'); }
}
```

- [ ] **Step 2: 验证**

```bash
cd /www/wwwroot/sample-mgmt && node -c public/js/subsystem-manager.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/subsystem-manager.js
git commit -m "feat(admin): add new subsystem wizard (5-step form)"
```

---

### Task 29: 集成管理面板到导航 + 全局入口

**Files:**
- Modify: `routes/misc.js`（给 shared-constants 添加子系统管理标记）
- Modify: `public/js/router.js`（添加管理面板路由）

- [ ] **Step 1: 在 router.js 的 VIEWS 表中添加条目**

```js
VIEWS['/admin/subsystems'] = viewSubsystemManager;
```

- [ ] **Step 2: 在 misc.js 中为 ADMIN 角色添加全局导航项**

在 `GET /js/shared-constants.js` 的导航生成逻辑中，为 ADMIN 添加：
```js
{ key: 'admin-subsystems', label: '子系统管理', view: 'viewSubsystemManager', roles: ['ADMIN'] }
```

- [ ] **Step 3: Commit**

```bash
git add routes/misc.js public/js/router.js
git commit -m "feat(admin): integrate subsystem manager into navigation"
```

---

### Task 30: 管理面板回归验证

- [ ] **Step 1: 全功能验证**

```bash
npm start
# admin/admin123 登录:
# 1. 左侧导航出现「子系统管理」
# 2. 可查看现有子系统卡片
# 3. 可创建新子系统 → 检查 subsystems/ 目录是否生成 manifest.json
# 4. 可导出 manifest
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "chore(admin): subsystem manager regression verified"
```

---

### Phase 6: 清理与完成（3 Tasks）

> 目标：删除旧文件，统一入口，更新文档。

---

### Task 31: 删除旧文件

**Files:**
- Delete: `routes/samples.js`
- Delete: `routes/scan.js`
- Delete: `routes/cards.js`
- Delete: `routes/card-page.js`
- Delete: `routes/card-html.js`
- Delete: `routes/card-constants.js`（如存在）
- Delete: `routes/fixtures.js`
- Delete: `routes/fixture-files.js`
- Delete: `routes/fixture-preview.js`
- Delete: `routes/fixture-helpers.js`（如存在）
- Delete: `routes/fixture-actions-*.js`（如存在）
- Delete: `db/samples.js`
- Delete: `db/fixtures.js`
- Delete: `db/logs.js`
- Delete: `db/fixture-files.js`
- Delete: `public/index.html`
- Delete: `public/fixture.html`
- Delete: `public/js/router.js`
- Delete: `public/js/dashboard.js` 等样品专属 JS
- Delete: `public/js/fixture-*.js` 等治具专属 JS
- Delete: `seed-samples.js`
- Delete: `seed-fixture.js`
- Modify: `server.js`（删除旧路由兼容代码）

- [ ] **Step 1: 删除旧文件**

```bash
cd /www/wwwroot/sample-mgmt
# 删除旧路由
rm routes/samples.js routes/scan.js routes/cards.js routes/card-page.js routes/card-html.js
rm routes/fixtures.js routes/fixture-files.js routes/fixture-preview.js
# 删除旧 DAO
rm db/samples.js db/fixtures.js db/logs.js db/fixture-files.js
# 删除旧前端入口
rm public/index.html public/fixture.html
# 删除旧种子
rm seed-samples.js seed-fixture.js
```

- [ ] **Step 2: 删除 server.js 兼容代码**

从 server.js 中删除 Phase 4 添加的旧路由兼容注释块：
```js
// 删除以下代码块：
// require('./routes/samples').register(app);
// require('./routes/scan').register(app);
// require('./routes/cards').register(app);
// require('./routes/misc').register(app);
// require('./routes/fixtures').register(app);
// require('./routes/fixture-files').register(app);
// require('./routes/fixture-preview').register(app);
```

- [ ] **Step 3: 删除旧前端 JS**

```bash
cd /www/wwwroot/sample-mgmt
# 删除已迁移到 subsystems/samples/js/views/ 的文件
rm public/js/router.js public/js/dashboard.js public/js/dashboard-todo.js
rm public/js/samples.js public/js/sample-filter.js public/js/sample-list-render.js
rm public/js/new.js public/js/scan.js public/js/scan-wizard.js public/js/scan-return-actions.js public/js/scan-camera.js
rm public/js/logs.js public/js/users.js public/js/detail.js
# 删除已迁移到 subsystems/fixtures/js/views/ 的文件
rm public/js/fixture-router.js public/js/fixture-dashboard.js public/js/fixture-detail.js
rm public/js/fixture-list.js public/js/fixture-list-filter.js public/js/fixture-file-ui.js
rm public/js/fixture-photo-upload.js public/js/fixture-scan.js public/js/fixture-logs.js public/js/fixture-new.js
```

- [ ] **Step 4: 验证启动无报错**

```bash
node -c server.js && npm start
# 确认无 require 报错，日志显示子系统加载正常
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(protocol): remove old files after full migration"
```

---

### Task 32: 最终全链路回归验证

- [ ] **Step 1: 完整功能清单**

```bash
npm start
# === 样品子系统 ===
# [ ] 门户 → 点击样品卡片 → 进入样品管理
# [ ] 样品看板（统计正确、待办列表、逾期/即将到期）
# [ ] 样品列表（搜索、筛选、排序、分页、快捷筛选）
# [ ] 新建样品（填写表单、上传照片、提交成功）
# [ ] 扫码台（扫码识别、操作按钮、状态更新）
# [ ] 操作日志（最近2条 + 查看全部）
# [ ] 用户管理（ADMIN专属）
# [ ] 标示卡打印

# === 治具子系统 ===
# [ ] 门户 → 点击治具卡片 → 进入治具管理
# [ ] 治具看板（统计卡、待验证/维修列表）
# [ ] 治具清单（筛选、排序、分页）
# [ ] 新建申请（表单 + 文件上传）
# [ ] 治具扫码（各 action 正常流转）
# [ ] 操作日志

# === 管理面板 ===
# [ ] 子系统管理（列表 + 新建 + 编辑 + 导出manifest）
```

- [ ] **Step 2: API 验证**

```bash
curl http://localhost:3000/api/subsystems | python3 -m json.tool
# 确认返回 samples + fixtures 两个条目，字段完整
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(protocol): full regression verified, all systems normal"
```

---

### Task 33: 更新文档 + 部署指引

**Files:**
- Modify: `README.md`（更新架构说明和启动方式）

- [ ] **Step 1: 更新 README.md**

在下述位置更新内容：
- 「项目概述」部分：添加「子系统插件协议」简介和链接
- 「目录结构」部分：更新为协议目录
- 「启动与运行」部分：确认启动命令不变

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for subsystem plugin protocol architecture"
```

---

### 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| 旧路由删除后 API 404 | 前端崩溃 | Phase 1-5 旧路由与子系统并行，Phase 6 最后删除 |
| manifest schema 校验不通过 | 子系统不被发现 | Task 7/15 内置 node -e 校验脚本 |
| 共享模块引用路径变更 | 子系统 JS 加载失败 | 静态服务 /shared/frontend 在 server.js 注册 |
| app.css 子系统样式拆分遗漏 | UI 样式丢失 | module.css 从 app.css 逐段复制，旧 CSS 暂不删除 |

**回滚方案**：
- Phase 1-5 期间：直接 `git checkout` 恢复旧文件，子系统仅新增不改旧
- Phase 6 之后：恢复旧文件 + 恢复 server.js 中旧路由注册

---
