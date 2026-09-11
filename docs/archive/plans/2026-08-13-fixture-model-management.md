# 治具按机型分类管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 治具系统以机型为分类——列表可按机型筛选、新增治具先选/建机型再填治具清单、RD/ADMIN 可维护机型主数据（复用 `sample_models` 共享表）。

**Architecture:** 复用样品子系统 `sample_models` 表作为共享机型主数据；治具 `fixtures.model` 存机型 code。新增治具侧机型 DAO（独立文件，规避 dao.js 97.5% 容量红线）与机型接口；前端列表加机型筛选器、新增弹窗改两步流、机型管理走弹窗（RD/ADMIN）。存量 `fixtures.model` 自由文本用幂等迁移导入 `sample_models`。

**Tech Stack:** Node.js + Express 4（CommonJS）、MariaDB（mysql2）、原生前端（bundle 构建）、Jest + supertest。

**设计依据:** `docs/superpowers/specs/2026-08-13-fixture-model-management-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `subsystems/fixtures/db/models-dao.js` | 治具侧操作 `sample_models`（列表含治具计数/新建/改全称/迁移） | 新建 |
| `subsystems/fixtures/db/dao.js` | `listFixtures`/`countAllFixtures` 增加 `model` 筛选条件 | 修改（+4 行，红线豁免见 Task 3） |
| `subsystems/fixtures/backend/routes-fixtures.js` | 机型接口 GET/POST/PUT + 列表/导出透传 model + 启动迁移 | 修改 |
| `tests/fixture-models.test.js` | 机型接口权限/冲突/筛选/迁移幂等测试 | 新建 |
| `subsystems/fixtures/frontend/js/views/new.js` | 两步表单：先选/建机型 → 再填治具 | 修改 |
| `subsystems/fixtures/frontend/js/views/list.js` | 机型筛选下拉 + 机型列 + state.model | 修改 |
| `subsystems/fixtures/frontend/js/views/list-filter.js` | model 筛选函数/chips/清除 | 修改 |
| `subsystems/fixtures/frontend/js/views/models.js` | 机型管理弹窗（RD/ADMIN） | 新建 |
| `tools/bundle-sources.json` | fixtures 数组追加 models.js | 修改 |
| `subsystems/fixtures/frontend/css/module.css` | 机型徽章/下拉样式 | 修改 |

**关键既有代码锚点（勿破坏）：**
- `routes-fixtures.js` 路由顺序约束：`:id` 路由在 L160，固定路径（scan/list/export/POST/dashboard/settings/logs/models）必须在其之前
- `dao.js` L42-69 `listFixtures`、L71-87 `countAllFixtures`（L76 search 已含 `model LIKE`）
- 样品侧权限模式：`['RD','ADMIN'].indexOf(u.role) !== -1`；POST 唯一冲突 `err.code === 'ER_DUP_ENTRY' || err.errno === 1062` → 409
- `sample_models` 表：code（唯一，6-20 位字母数字）/ full_name（唯一）/ created_by / created_at

---

## Task 1: 写接口测试（先失败）

**Files:**
- Create: `tests/fixture-models.test.js`

- [ ] **Step 1: 创建测试文件**

```js
// tests/fixture-models.test.js — 治具机型主数据接口（复用 sample_models 表）
// fixtures 未上线（deployed 未置 true）可安全写入；测试自建临时账号与机型，afterAll 清理
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('治具机型主数据', () => {
  let adminAgent, rdAgent, qaAgent;
  let tempModelIds = [];

  beforeAll(async () => {
    await getApp();
    // 生产库非 ADMIN 账号均停用，创建临时账号（RD 用于权限测试，QA 用于 403 验证）
    const bcrypt = require('bcryptjs');
    const D = require('../db');
    for (const [u, role, dept] of [['dorm_rd', 'RD', '研发部'], ['dorm_qa', 'QA', '品保文管中心']]) {
      if (!(await D.getUserByUsername(u))) {
        await D.createUser({ username: u, password_hash: bcrypt.hashSync('test123', 10), role: role, dept: dept, display_name: '机型测试' + role });
      }
    }
    ({ agent: adminAgent } = await login('admin', 'admin123'));
    ({ agent: rdAgent } = await login('dorm_rd', 'test123'));
    ({ agent: qaAgent } = await login('dorm_qa', 'test123'));
  });

  afterAll(async () => {
    const D = require('../db');
    for (const id of tempModelIds) {
      await D.pool().execute('DELETE FROM sample_models WHERE id = ?', [id]);
    }
    await D.pool().execute('DELETE FROM users WHERE username IN (?, ?)', ['dorm_rd', 'dorm_qa']);
  });

  describe('GET /api/fixtures/models', () => {
    it('登录用户可读，返回含治具计数的机型列表', async () => {
      const res = await adminAgent.get('/api/fixtures/models');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const m of res.body) {
        expect(typeof m.code).toBe('string');
        expect(typeof m.full_name).toBe('string');
        expect(typeof m.fixture_count).toBe('number');
      }
    });
  });

  describe('POST /api/fixtures/models（新建机型）', () => {
    it('非 RD/ADMIN 应返回 403', async () => {
      const res = await qaAgent.post('/api/fixtures/models').send({ code: 'TEST123', full_name: '测试机型' });
      expect(res.status).toBe(403);
    });

    it('RD 创建成功并返回机型', async () => {
      const res = await rdAgent.post('/api/fixtures/models').send({ code: 'TEST001', full_name: '测试治具机型壹' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('TEST001');
      tempModelIds.push(res.body.id);
    });

    it('code 重复应返回 409', async () => {
      const res = await adminAgent.post('/api/fixtures/models').send({ code: 'TEST001', full_name: '不同全称' });
      expect(res.status).toBe(409);
    });

    it('code 含非法字符（<6 位或非字母数字）应返回 400', async () => {
      const res1 = await adminAgent.post('/api/fixtures/models').send({ code: 'A', full_name: '过短' });
      expect(res1.status).toBe(400);
      const res2 = await adminAgent.post('/api/fixtures/models').send({ code: 'ABC 123', full_name: '含空格' });
      expect(res2.status).toBe(400);
    });
  });

  describe('PUT /api/fixtures/models/:id（编辑）', () => {
    it('非 RD/ADMIN 应返回 403', async () => {
      const res = await qaAgent.put('/api/fixtures/models/' + tempModelIds[0]).send({ full_name: '篡改' });
      expect(res.status).toBe(403);
    });

    it('RD 可改 full_name，code 改动被忽略', async () => {
      const res = await rdAgent.put('/api/fixtures/models/' + tempModelIds[0]).send({ full_name: '测试治具机型壹改', code: 'HACKED' });
      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('测试治具机型壹改');
      expect(res.body.code).toBe('TEST001');
    });

    it('不存在的 id 应返回 404', async () => {
      const res = await adminAgent.put('/api/fixtures/models/999999').send({ full_name: '不存在' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/fixtures?model=X 筛选', () => {
    it('model 筛选只返回该机型治具，且不筛选时全量更多', async () => {
      const all = await adminAgent.get('/api/fixtures?limit=200');
      const m = await adminAgent.get('/api/fixtures?model=TEST001&limit=200');
      expect(m.status).toBe(200);
      expect(Array.isArray(m.body.fixtures)).toBe(true);
      for (const f of m.body.fixtures) expect(f.model).toBe('TEST001');
      expect(all.body.total).toBeGreaterThanOrEqual(m.body.total);
    });
  });
});

}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixture-models.test.js 2>&1 | grep -E "Tests:|GET /api/fixtures/models|404|Cannot GET" | head -20`
Expected: FAIL（`GET /api/fixtures/models` 返回 404，路由不存在）

---

## Task 2: 治具侧机型 DAO（新文件）

**Files:**
- Create: `subsystems/fixtures/db/models-dao.js`

- [ ] **Step 1: 创建 models-dao.js**

```js
// subsystems/fixtures/db/models-dao.js — 治具侧机型主数据 DAO（复用样品共享表 sample_models）
// 职责：机型列表（含治具计数）/ 新建 / 改全称 / 存量 model 迁移导入
// 权限在路由层校验（仅 RD/ADMIN）；code 创建后只读，编辑仅允许改 full_name
var pool = null;

function setPool(p) { pool = p; }

function q(sql, params) { return pool.execute(sql, params).then(function (r) { return r[0]; }); }
function one(sql, params) { return q(sql, params).then(function (rows) { return rows[0] || null; }); }

// 全部机型 + 各机型治具计数（LEFT JOIN fixtures 按 model=code 聚合，按 code 排序）
function listModelsWithCount() {
  return q('SELECT m.id, m.code, m.full_name, m.created_by, m.created_at, COUNT(f.id) AS fixture_count FROM sample_models m LEFT JOIN fixtures f ON f.model = m.code GROUP BY m.id, m.code, m.full_name, m.created_by, m.created_at ORDER BY m.code ASC');
}

function getModelById(id) { return one('SELECT * FROM sample_models WHERE id = ?', [id]); }
function getModelByCode(code) { return one('SELECT * FROM sample_models WHERE code = ?', [code]); }

// 新建机型；code/full_name 唯一冲突由 DB 约束抛 ER_DUP_ENTRY，路由层转 409
function createModel(data) {
  return q('INSERT INTO sample_models (code, full_name, created_by) VALUES (?, ?, ?)', [data.code, data.full_name, data.created_by || null])
    .then(function () { return getModelByCode(data.code); });
}

// 仅更新 full_name（code 只读）；返回更新后的机型
function updateModelName(id, full_name) {
  return q('UPDATE sample_models SET full_name = ? WHERE id = ?', [full_name, id])
    .then(function () { return getModelById(id); });
}

// 存量兼容迁移：fixtures.model 自由文本去重导入 sample_models（code=full_name=原值），幂等可重复执行
function migrateFixtureModels() {
  return q('INSERT IGNORE INTO sample_models (code, full_name) SELECT DISTINCT model, model FROM fixtures WHERE model IS NOT NULL AND model <> \'\'');
}

module.exports = { setPool: setPool, listModelsWithCount: listModelsWithCount, getModelById: getModelById, getModelByCode: getModelByCode, createModel: createModel, updateModelName: updateModelName, migrateFixtureModels: migrateFixtureModels };
```

- [ ] **Step 2: 语法检查**

Run: `node -c subsystems/fixtures/db/models-dao.js`
Expected: 无输出（通过）

---

## Task 3: 后端路由（机型接口 + 列表/导出透传 model + 启动迁移）

**Files:**
- Modify: `subsystems/fixtures/backend/routes-fixtures.js`
- Modify: `subsystems/fixtures/db/dao.js`

> ⚠️ dao.js 当前约 195/200 行（97.5% 红线）。本次仅新增 4 行必要筛选条件（不新增函数），属豁免范围；完成后需在提交说明中标注后续拆分建议。

- [ ] **Step 1: dao.js 的 listFixtures 增加 model 条件**

在 `subsystems/fixtures/db/dao.js` L46（`if (opts.dept)` 行）之前插入：

```js
    if (opts.model) { where.push('model = ?'); params.push(opts.model); }
```

- [ ] **Step 2: dao.js 的 countAllFixtures 增加 model 条件**

在 `subsystems/fixtures/db/dao.js` L74（`if (opts.status)` 行）之前插入：

```js
    if (opts.model) { where.push('model = ?'); params.push(opts.model); }
```

- [ ] **Step 3: routes-fixtures.js 引入 models-dao 并注册连接池**

在 L8（`var { toCsv, sendCsv } = ...`）之后追加：

```js
var MD = require('../db/models-dao');
```

在 `register(app)` 函数内 L12（`var currentUser = app.locals.currentUser;`）之后追加：

```js
  MD.setPool(D.pool());
  // 启动即执行存量机型迁移（幂等 INSERT IGNORE，重复执行无副作用）
  MD.migrateFixtureModels().catch(function () { /* 迁移失败不影响启动，models 路由首次调用会重试 */ });
```

- [ ] **Step 4: 列表接口透传 model**

修改 L31-35 的 `GET /api/fixtures`：

```js
    var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search, overdue = _a.overdue, dormant = _a.dormant, model = _a.model,
        sort = _a.sort, dir = _a.dir, limit = parseInt(_a.limit) || 20, offset = parseInt(_a.offset) || 0;
    var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, dormant: dormant, model: model, sort: sort, dir: dir, limit: limit, offset: offset });
    var total = await D.countAllFixtures({ status: status, dept: dept, search: search, overdue: overdue, dormant: dormant, model: model });
```

- [ ] **Step 5: 导出接口透传 model**

修改 L79-81 的 `GET /api/fixtures/export`：

```js
    var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search,
        overdue = _a.overdue, dormant = _a.dormant, model = _a.model, sort = _a.sort, dir = _a.dir;
    var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, dormant: dormant, model: model, sort: sort, dir: dir });
```

- [ ] **Step 6: 新增机型路由（settings 路由之后、logs/:id 之前，即 L147 与 L148 之间插入）**

```js
  // 机型列表（含治具计数）：登录可读
  app.get('/api/fixtures/models', requireAuth, async function(req, res) {
    res.json(await MD.listModelsWithCount());
  });

  // 新建机型：仅 RD/ADMIN；code 6~20 位字母数字，唯一冲突 409
  app.post('/api/fixtures/models', requireAuth, async function(req, res) {
    try {
      var u = await currentUser(req);
      if (['RD', 'ADMIN'].indexOf(u.role) === -1) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
      var code = ((req.body || {}).code || '').trim().toUpperCase();
      var full_name = ((req.body || {}).full_name || '').trim();
      if (!code) return res.status(400).json({ error: '请填写机型短码' });
      if (code.length < 6 || code.length > 20) return res.status(400).json({ error: '机型短码须为 6~20 位' });
      if (!/^[A-Za-z0-9]+$/.test(code)) return res.status(400).json({ error: '机型短码仅允许字母和数字' });
      if (!full_name) return res.status(400).json({ error: '请填写机型全称' });
      var m = await MD.createModel({ code: code, full_name: full_name, created_by: u.id });
      res.json(m);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(409).json({ error: '机型短码或全称已存在' });
      res.status(500).json({ error: '新增机型失败：' + (err.message || '服务器内部错误') });
    }
  });

  // 编辑机型：仅 RD/ADMIN；仅允许改 full_name（code 只读防破坏已引用治具）
  app.put('/api/fixtures/models/:id', requireAuth, async function(req, res) {
    try {
      var u = await currentUser(req);
      if (['RD', 'ADMIN'].indexOf(u.role) === -1) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
      var m = await MD.getModelById(Number(req.params.id));
      if (!m) return res.status(404).json({ error: '机型不存在' });
      var full_name = ((req.body || {}).full_name || '').trim();
      if (!full_name) return res.status(400).json({ error: '请填写机型全称' });
      var updated = await MD.updateModelName(m.id, full_name);
      res.json(updated);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(409).json({ error: '机型全称已存在' });
      res.status(500).json({ error: '编辑机型失败：' + (err.message || '服务器内部错误') });
    }
  });
```

- [ ] **Step 7: 语法检查**

Run: `node -c subsystems/fixtures/backend/routes-fixtures.js && node -c subsystems/fixtures/db/dao.js && node -c subsystems/fixtures/db/models-dao.js`
Expected: 全部无输出

---

## Task 4: 运行测试验证通过

- [ ] **Step 1: 运行机型接口测试**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixture-models.test.js 2>&1 | grep -E "Tests:|✕" | head -20`
Expected: `Tests: 10 passed, 10 total`

- [ ] **Step 2: 运行既有测试回归（呆滞/导出/子系统）**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixtures-dormant.test.js tests/fixtures-export.test.js tests/subsystems.test.js 2>&1 | grep -E "Tests:|Suites:" | head -10`
Expected: 全部 PASS（改动未破坏既有行为）

- [ ] **Step 3: 提交**

```bash
git add subsystems/fixtures/db/models-dao.js subsystems/fixtures/db/dao.js subsystems/fixtures/backend/routes-fixtures.js tests/fixture-models.test.js
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(fixtures): 机型主数据接口与列表 model 筛选（复用 sample_models）

- 新增 models-dao.js：机型列表含治具计数/新建/改全称/存量迁移（幂等）
- 路由：GET/POST/PUT /api/fixtures/models（新建/编辑仅 RD/ADMIN，code 只读）
- 列表与导出透传 model 参数；启动执行存量 model 迁移导入
- 测试：权限 403/唯一冲突 409/非法 code 400/model 筛选一致性（10 用例）
- 注：dao.js 已超 90% 容量红线，本次仅 +4 行必要筛选条件，后续需拆分"
```

---

## Task 5: 前端新建治具两步表单

**Files:**
- Modify: `subsystems/fixtures/frontend/js/views/new.js`

- [ ] **Step 1: 重写 new.js（先选/建机型 → 再填治具清单）**

```js
// fixture-new.js — 治具新建申请（两步：① 选择/新建机型 → ② 填写治具清单）
var _fnSelectedModel = ''; // 当前选中的机型 code
var _fnModelList = [];     // 机型下拉数据（含治具计数）

async function renderFixtureNew() {
  _fnSelectedModel = ''; _fnModelList = [];
  var html = '<div class="card" style="max-width:720px">';
  html += '<h3 style="margin:0 0 16px">新建治具申请</h3>';

  // 第一步：选择机型（全角色可选已有机型；仅 RD/ADMIN 可新建机型）
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 选择机型 <span style="color:var(--bad)">*</span></div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<select id="fn-model" onchange="fnPickModel(this.value)" style="flex:1;min-width:180px"><option value="">请选择机型…</option></select>';
  html += '<span id="fn-model-new-zone" style="display:none;gap:8px;align-items:center;flex-wrap:wrap;width:100%">';
  html += '<fluent-text-field id="fn-model-code" placeholder="机型短码(6~20位字母数字)"></fluent-text-field>';
  html += '<fluent-text-field id="fn-model-name" placeholder="机型全称(必填)" style="flex:1"></fluent-text-field>';
  html += '<fluent-button appearance="accent" size="small" onclick="fnCreateModel()">保存机型</fluent-button>';
  html += '<fluent-button appearance="neutral" size="small" onclick="fnCancelNewModel()">取消</fluent-button>';
  html += '</span></div>';
  html += '<div style="margin-top:8px" id="fn-model-actions"></div>';
  html += '</div>';

  // 第二步：治具清单
  html += '<form id="fixture-new-form" onsubmit="submitFixtureNew(event)">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">② 治具清单</div>';
  html += '<div class="new-grid">';
  html += '<div class="new-col"><div class="new-col-title">基础信息</div>';
  html += '<label>治具名称<span style="color:var(--bad)">*</span></label><fluent-text-field id="fn-name" required></fluent-text-field>';
  html += '<label>规格</label><fluent-text-field id="fn-spec"></fluent-text-field>';
  html += '<label>机型</label><fluent-text-field id="fn-model-display" readonly></fluent-text-field>';
  html += '</div>';
  html += '<div class="new-col"><div class="new-col-title">使用信息</div>';
  html += '<label>对应工站</label><fluent-text-field id="fn-station"></fluent-text-field>';
  html += '<label>分类</label><fluent-text-field id="fn-category" placeholder="如测试治具/装配治具"></fluent-text-field>';
  html += '<label>申请说明</label><textarea id="fn-note" rows="3"></textarea>';
  html += '<label>保养周期(天) <small>(选填，默认90)</small></label><fluent-text-field id="fn-maint-cycle" type="number" min="0" value="90" placeholder="0=无需定期保养"></fluent-text-field>';
  html += '</div></div>';
  html += '<fluent-button appearance="accent" onclick="submitFixtureNew(event)" style="margin-top:16px">提交申请</fluent-button>';
  html += '</form></div>';
  document.getElementById('view').innerHTML = html;
  await fnLoadModels();
}

// 加载机型下拉（含治具计数）；仅 RD/ADMIN 显示「新建机型」按钮
async function fnLoadModels() {
  try {
    var list = await api('GET', '/api/fixtures/models');
    _fnModelList = list || [];
    var sel = document.getElementById('fn-model');
    if (!sel) return;
    var opts = '<option value="">请选择机型…</option>' + _fnModelList.map(function(m) {
      return '<option value="' + e(m.code) + '">' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + '治具)' : '') + '</option>';
    }).join('');
    sel.innerHTML = opts;
    if (_fnSelectedModel) sel.value = _fnSelectedModel;
    var canManage = typeof me !== 'undefined' && me && ['ADMIN', 'RD'].indexOf(me.role) !== -1;
    var zone = document.getElementById('fn-model-actions');
    if (zone) {
      zone.innerHTML = canManage
        ? '<fluent-button appearance="lightweight" size="small" onclick="fnShowNewModel()">＋ 新建机型</fluent-button><fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()">管理机型</fluent-button>'
        : '<span class="muted" style="font-size:12px">机型由研发/管理员维护，如需新机型请联系研发</span>';
    }
  } catch (e) { showToast(e.message); }
}

function fnShowNewModel() {
  var zone = document.getElementById('fn-model-new-zone');
  if (zone) zone.style.display = 'flex';
}

function fnCancelNewModel() {
  var zone = document.getElementById('fn-model-new-zone');
  if (zone) zone.style.display = 'none';
  document.getElementById('fn-model-code').value = '';
  document.getElementById('fn-model-name').value = '';
}

// 内联新建机型：校验 → POST → 自动选中新机型
async function fnCreateModel() {
  var code = document.getElementById('fn-model-code').value.trim().toUpperCase();
  var full_name = document.getElementById('fn-model-name').value.trim();
  if (!code || !full_name) { showToast('请填写机型短码和全称'); return; }
  try {
    await api('POST', '/api/fixtures/models', { code: code, full_name: full_name });
    _fnSelectedModel = code;
    fnCancelNewModel();
    await fnLoadModels();
    showToast('机型已新建并选中');
  } catch (e) { showToast(e.message); }
}

function fnPickModel(val) {
  _fnSelectedModel = val;
  var dis = document.getElementById('fn-model-display');
  if (dis) dis.value = val;
}

async function submitFixtureNew(e) {
  e.preventDefault();
  var model = _fnSelectedModel || document.getElementById('fn-model').value;
  if (!model) { showToast('请先选择机型'); return; }
  try {
    var body = {
      name: document.getElementById('fn-name').value, spec: document.getElementById('fn-spec').value, model: model,
      station: document.getElementById('fn-station').value, category: document.getElementById('fn-category').value, request_note: document.getElementById('fn-note').value
    };
    var cycleEl = document.getElementById('fn-maint-cycle'); if (cycleEl && cycleEl.value) body.maintenance_cycle_days = parseInt(cycleEl.value) || 90;
    var f = await api('POST', '/api/fixtures', body);
    showToast('申请成功：' + f.fixture_no);
    location.hash = '#/list';
  } catch (err) { showToast(err.message); }
}
```

- [ ] **Step 2: 语法检查**

Run: `node -c subsystems/fixtures/frontend/js/views/new.js`
Expected: 无输出

---

## Task 6: 前端列表机型筛选 + 机型管理弹窗

**Files:**
- Modify: `subsystems/fixtures/frontend/js/views/list.js`
- Modify: `subsystems/fixtures/frontend/js/views/list-filter.js`
- Create: `subsystems/fixtures/frontend/js/views/models.js`
- Modify: `tools/bundle-sources.json`
- Modify: `subsystems/fixtures/frontend/css/module.css`

- [ ] **Step 1: list.js — state 增加 model**

L4 改为：

```js
var fixtureListState = { status: '', dept: '', search: '', dormant: '', model: '', col: '', dir: 'desc', page: 20, pageNo: 1 };
```

- [ ] **Step 2: list.js — renderFixtureList 重置时清 model**

L20（`fixtureListState.dormant = '';` 之后）追加：

```js
    fixtureListState.model = '';
```

- [ ] **Step 3: list.js — loadFixtureList 请求参数加 model**

L35（`if (fixtureListState.dormant)` 行之后）追加：

```js
    if (fixtureListState.model) parts.push('model=' + encodeURIComponent(fixtureListState.model));
```

- [ ] **Step 4: list.js — 筛选栏加机型下拉（L49 呆滞下拉之后）**

在 `html += '<span style="display:flex;align-items:center;gap:4px;white-space:nowrap"><span class="muted">排序</span>...` 行之前追加：

```js
    html += '<select id="fx-model-filter" onchange="filterFixtureListModel(this.value)"><option value="">全部机型</option>' + (window._fxModels || []).map(function(m) { return '<option value="' + e(m.code) + '"' + (fixtureListState.model === m.code ? ' selected' : '') + '>' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + ')' : '') + '</option>'; }).join('') + '</select>';
    html += '<fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()" title="机型管理">机型</fluent-button>';
```

- [ ] **Step 5: list.js — 异步加载机型下拉数据（loadFixtureList 内，L40 api 调用改为并行）**

将 L39-41 改为：

```js
    var qs = parts.join('&');
    var p = await Promise.all([
      api('GET', '/api/fixtures' + (qs ? '?' + qs : '')),
      api('GET', '/api/fixtures/models').catch(function(){ return []; })
    ]).then(function(a){ window._fxModels = a[1] || []; return a[0]; });
    var fixtures = p.fixtures || [];
```

- [ ] **Step 6: list.js — chips 加机型标签（L60 呆滞 chip 之后）**

```js
    if (fixtureListState.model) {
      var mIdx = (fixtureListState.status ? 1 : 0) + (fixtureListState.dept ? 1 : 0) + (fixtureListState.dormant ? 1 : 0);
      chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + mIdx + ')">机型 ' + e(fixtureListState.model) + ' ✕</span>');
    }
```

- [ ] **Step 7: list.js — 表格加机型列（表头 + 行单元格）**

表头（L79 `'<th>归还状态...'` 之前）插入 `<th>机型<span class="col-rsz"></span></th>`，并同步在 colgroup（L77-78）加 `<col style="width:90px">`。

行单元格（L88 `'<td data-label="规格">'` 之后）插入 `<td data-label="机型">' + e(f.model || '—') + '</td>`。

- [ ] **Step 8: list.js — 空状态判断加 model（L73）**

```js
      var hasFilter = fixtureListState.status || fixtureListState.dept || fixtureListState.search || fixtureListState.dormant || fixtureListState.model;
```

- [ ] **Step 9: list.js — exportFixturesCsv 加 model（L114 之后）**

```js
  if (fixtureListState.model) parts.push('model=' + encodeURIComponent(fixtureListState.model));
```

- [ ] **Step 10: list-filter.js — 机型筛选函数与清除支持**

在 `filterFixtureListDormant` 之后追加：

```js
function filterFixtureListModel(val) {
  fixtureListState.model = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}
```

`clearFilterChip` 的 keys（L6-9）追加 model：

```js
  if (fixtureListState.model) keys.push('model');
```

`clearAllFilters`（L16-22）追加：

```js
  fixtureListState.model = '';
```

- [ ] **Step 11: 创建 models.js（机型管理弹窗，RD/ADMIN）**

```js
// fixture-models.js — 治具机型管理弹窗（仅 RD/ADMIN 可见入口；后端 POST/PUT 403 兜底）
// 与样品共享 sample_models 表；code 只读，仅可编辑 full_name；本期不做删除（引用风险）
async function openFixtureModelsModal() {
  var list;
  try { list = await api('GET', '/api/fixtures/models'); } catch (e) { showToast(e.message); return; }
  var rows = list.map(function(m) {
    return '<tr><td><b>' + e(m.code) + '</b></td><td id="fxm-name-' + m.id + '">' + e(m.full_name) + '</td><td>' + (m.fixture_count || 0) + '</td><td><a class="link" onclick="fxmEditName(' + m.id + ',\'' + e(m.full_name) + '\')">编辑全称</a></td></tr>';
  }).join('') || '<tr><td colspan="4" class="empty">暂无机型，请先新增</td></tr>';
  var body = '<div style="max-height:60vh;overflow:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr><th style="text-align:left;padding:6px">机型短码</th><th style="text-align:left;padding:6px">机型全称</th><th style="text-align:left;padding:6px">治具数</th><th style="width:90px"></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
  openModal('机型管理（共享机型主数据）', body, {
    foot: '<fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>'
  });
}

function fxmEditName(id, oldName) {
  var cur = document.getElementById('fxm-name-' + id);
  if (!cur) return;
  cur.innerHTML = '<input id="fxm-input-' + id + '" style="width:180px" value="' + oldName + '"/> ' +
    '<a class="link" onclick="fxmSaveName(' + id + ')">保存</a> <a class="link" onclick="openFixtureModelsModal()">取消</a>';
  document.getElementById('fxm-input-' + id).focus();
}

async function fxmSaveName(id) {
  var input = document.getElementById('fxm-input-' + id);
  var full_name = (input ? input.value : '').trim();
  if (!full_name) { showToast('机型全称必填'); return; }
  try {
    await api('PUT', '/api/fixtures/models/' + id, { full_name: full_name });
    showToast('机型全称已更新');
    openFixtureModelsModal();
    if (typeof loadFixtureList === 'function') loadFixtureList();
  } catch (e) { showToast(e.message); }
}
```

- [ ] **Step 12: bundle-sources.json — fixtures 数组追加 models.js**

在 `"subsystems/fixtures/frontend/js/views/list.js"` 之后插入：

```json
    "subsystems/fixtures/frontend/js/views/models.js",
```

- [ ] **Step 13: module.css 追加机型徽章样式**

在文件末尾追加：

```css
/* 机型管理弹窗表格内联输入（2026-08-13） */
#fxm-input, [id^="fxm-input-"] { border:1px solid var(--line); border-radius:4px; padding:4px 8px; font-size:13px; }
```

- [ ] **Step 14: 语法检查全部前端文件**

Run: `node -c subsystems/fixtures/frontend/js/views/list.js && node -c subsystems/fixtures/frontend/js/views/list-filter.js && node -c subsystems/fixtures/frontend/js/views/models.js && node -c subsystems/fixtures/frontend/js/views/new.js`
Expected: 全部无输出

---

## Task 7: 部署与浏览器回归

**Files:**
- 构建产物：`subsystems/fixtures/frontend/js/bundle.js`
- Modify: `subsystems/fixtures/frontend/index.html`（版本号）

- [ ] **Step 1: 重建 fixtures bundle**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www node tools/build-bundles.js 2>&1 | grep fixtures`
Expected: `files=17  src≈XXKB  bundle≈XXKB`（models.js 已并入）

- [ ] **Step 2: 复制 bundle + 更新 4 个 index.html 版本号**

Run（替换 `VER` 为 Step 1 输出的实际值）:

```bash
echo 'mnbvcxz123' | sudo -S -u www bash -c 'cp /tmp/bundle-fixtures.js /www/wwwroot/sample-mgmt/subsystems/fixtures/frontend/js/bundle.js && cp /tmp/bundle-workbench.js /www/wwwroot/sample-mgmt/subsystems/workbench/frontend/js/bundle.js && cp /tmp/bundle-samples.js /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/bundle.js && cp /tmp/bundle-projects.js /www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/bundle.js && cd /www/wwwroot/sample-mgmt && sed -i "s/bundle.js?v=[a-z0-9]*/bundle.js?v=VER/g" subsystems/fixtures/frontend/index.html subsystems/workbench/frontend/index.html subsystems/samples/frontend/index.html subsystems/projects/frontend/index.html'
```

> 注：本次仅改 fixtures 前端 + 后端路由，samples/projects/workbench bundle 同步复制以保持版本号一致（构建脚本会重新生成全部）。

- [ ] **Step 3: 重启服务（精确 kill 4000 端口 PID）**

```bash
sudo ss -tlnp | grep ':4000'   # 记录 PID
sudo kill <PID> && sleep 1
sudo -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
sleep 3 && sudo ss -tlnp | grep ':4000'   # 确认新进程监听
```

- [ ] **Step 4: 后端接口冒烟**

```bash
cd /tmp && rm -f cj.txt
curl -s -c cj.txt -X POST http://localhost:4000/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' -o /dev/null -w "login:%{http_code}\n"
curl -s -b cj.txt http://localhost:4000/api/fixtures/models | head -c 400
```
Expected: login:200；models 返回含 `fixture_count` 的机型数组（迁移脚本已把存量 model 导入）

- [ ] **Step 5: 浏览器回归（browser_use）**

验证清单：
1. 治具清单页：机型下拉存在，选择某机型后列表只显示该机型治具，chips 出现「机型 X ✕」
2. 新建治具页：先选机型（下拉含已有机型 + 治具计数）→ 填治具提交成功；「＋新建机型」内联创建后自动选中
3. 机型管理弹窗（admin 登录可见）：编辑全称保存成功，列表机型下拉同步更新
4. 非 RD/ADMIN 登录（qa01 若停用则用 admin 验证弹窗入口仅 RD/ADMIN 显示逻辑）：新建机型按钮不显示
5. 双系统回归：样品系统机型列表/新建样品下拉仍正常（共享 sample_models 未被破坏）

- [ ] **Step 6: 提交**

```bash
git add subsystems/fixtures/frontend/js/views/new.js subsystems/fixtures/frontend/js/views/list.js subsystems/fixtures/frontend/js/views/list-filter.js subsystems/fixtures/frontend/js/views/models.js subsystems/fixtures/frontend/css/module.css tools/bundle-sources.json subsystems/fixtures/frontend/js/bundle.js subsystems/fixtures/frontend/index.html
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(fixtures): 前端机型分类——筛选器/两步新建/机型管理弹窗

- 列表加机型筛选下拉 + 机型列 + 导出联动
- 新建治具改两步：先选/建机型再填清单，无机型拦截提交
- 机型管理弹窗（RD/ADMIN）：编辑全称，code 只读
- bundle 重建 + 版本号更新；bundle-sources 追加 models.js"
```

---

## 自审（Self-Review）

**Spec 覆盖：**
- §3 数据模型（复用 sample_models）→ Task 2 models-dao.js ✅
- §4 存量迁移（幂等导入）→ Task 2 `migrateFixtureModels` + Task 3 启动触发 ✅
- §5 后端接口（GET/POST/PUT models、列表 model 透传）→ Task 3 ✅
- §6.1 列表机型筛选器 + 机型列 + chips/导出联动 → Task 6 ✅
- §6.2 新增治具两步弹窗 + 内联新建 → Task 5 ✅
- §6.3 机型管理弹窗（仅编辑全称、无删除）→ Task 6 Step 11 ✅
- §7 测试（403/409/400/筛选/迁移幂等）→ Task 1+4 ✅
- §8 双系统回归（共享 sample_models）→ Task 7 Step 5 ✅

**占位符扫描：** 无 TBD/TODO；Task 7 Step 2 的 `VER` 明确标注为 Step 1 实际输出。

**类型一致性：**
- `MD.listModelsWithCount/createModel/getModelById/updateModelName/migrateFixtureModels` 在 Task 2 定义、Task 3/6 引用一致 ✅
- `filterFixtureListModel` / `openFixtureModelsModal` / `fxmEditName` / `fxmSaveName` / `fnLoadModels` / `fnPickModel` / `fnCreateModel` / `fnShowNewModel` / `fnCancelNewModel` 均在对应 Task 定义并被引用 ✅
- `fixtureListState.model` 在 list.js/list-filter.js 中命名一致 ✅
