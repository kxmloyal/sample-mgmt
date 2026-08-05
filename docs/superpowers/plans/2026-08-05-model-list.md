# 机型列表 + 新建表单/筛选联动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增机型主数据（`sample_models` 表 + `/api/samples/models` CRUD），新建样品规格/型号改为下拉选机型（短码自动填入+只读），列表页新增按机型筛选，仅 RD/ADMIN 可维护机型。

**Architecture:** 数据层新增 `sample_models` 表（短码 code + 全称 full_name，唯一键兜底），DAO 增加 6 个机型函数与 `model` 列表筛选、存量机型补集查询；后端在 `routes-samples.js` 注册 models CRUD（GET 全角色可读、POST/DELETE 仅 RD/ADMIN，注册在 `/:id` 之前）与下拉数据源 `model-options`，新建样品强制校验机型存在；前端新增 `views/models.js` 管理页，`router.js`/`manifest.json` 增加导航，改造 `new.js`/`list.js`/`list-filter.js`，最后重建 bundle 并全量回归。

**Tech Stack:** Node.js + Express 4.x (CommonJS)、MariaDB (mysql2)、原生 HTML/JS 单页、Fluent Web Components、jest + supertest。

**前置知识（执行者必读）：**
- 测试实际走 MariaDB `sample_mgmt` 库（`tests/helpers/setup.js` 的 SQLite 逻辑是残留死代码），`getApp()` 会触发 `db.js init()` 自动执行 `subsystems/*/db/schema.sql` 幂等建表 → 新增表无需手动建
- 所有 jest 命令必须以 www 用户运行：`export SUDO_ASKPASS=/tmp/askpass.sh && sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest <file> 2>&1 | tail -40'`
- 文件写入协议：项目文件属主 www，不可直接编辑的用 `/tmp` 副本 + `sudo -A cp` + `chown www:www`
- git 提交协议：`sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com`
- 路由注册顺序：`/api/samples/models` 与 `/api/samples/model-options` MUST 注册在 `GET /api/samples/:id` 之前（与 `code-preview` 同理）
- `e()` 转义函数为全局（shared/utils.js），fluent-select 选中文本取 `el.selectedOptions[0].text`

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `subsystems/samples/db/schema.sql` | 修改 | 追加 `sample_models` 建表 |
| `subsystems/samples/manifest.json` | 修改 | `database.tables` 声明新表（Task 1）；`navigation` 加机型列表（Task 4） |
| `subsystems/samples/db/dao.js` | 修改 | 新增 6 个机型函数 + `listSamples/countAllSamples` 加 `model` 筛选 + `listLegacyModels` |
| `subsystems/samples/backend/routes-samples.js` | 修改 | models CRUD + `model-options` + 列表 `model` 参数 + 新建强制校验 |
| `tests/models.test.js` | 新建 | 机型接口测试（7 组用例） |
| `tests/samples.test.js` | 修改 | `beforeAll` 预置机型，适配强制校验 |
| `subsystems/samples/frontend/js/views/models.js` | 新建 | 机型列表管理页（增/删） |
| `subsystems/samples/frontend/js/router.js` | 修改 | NAV/VIEWS/meta 增加 models |
| `subsystems/samples/frontend/js/views/new.js` | 修改 | 规格/型号改下拉选机型、机型编码只读联动 |
| `subsystems/samples/frontend/js/views/list.js` | 修改 | 筛选区加 `#f-model` 下拉 |
| `subsystems/samples/frontend/js/views/list-filter.js` | 修改 | `_buildQueryParams` 加 model、chips 加机型 |
| `tools/bundle-sources.json` | 修改 | samples 数组插入 models.js |

---

### Task 1: 数据层（表 + manifest 声明 + DAO）

**Files:**
- Modify: `subsystems/samples/db/schema.sql`（文件末尾追加）
- Modify: `subsystems/samples/manifest.json`（`database.tables`）
- Modify: `subsystems/samples/db/dao.js`

- [ ] **Step 1: schema.sql 追加 sample_models 表**

在 `subsystems/samples/db/schema.sql` 末尾追加：

```sql

-- 机型主数据（2026-08-05）：新建样品规格/型号下拉数据源，仅 RD/ADMIN 维护
CREATE TABLE IF NOT EXISTS sample_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_model_code (code),
  UNIQUE KEY uk_model_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: manifest.json 声明新表**

`subsystems/samples/manifest.json` 的 `database.tables` 数组追加：

```json
      {
        "name": "sample_models",
        "schema": "db/schema.sql"
      }
```

- [ ] **Step 3: dao.js 加 model 列表筛选**

`subsystems/samples/db/dao.js` 的 `listSamples`（`if (opts.source_type)` 之后）追加：

```js
    if (opts.model) { where.push('model = ?'); params.push(opts.model); }
```

`countAllSamples`（同样位置）追加相同一行。

- [ ] **Step 4: dao.js 新增机型函数并导出**

在 `dao.js` 的 `listLogs` 函数之后、`return {...}` 之前新增：

```js
  function listModels() { return q('SELECT * FROM sample_models ORDER BY code ASC'); }
  function getModelById(id) { return one('SELECT * FROM sample_models WHERE id = ?', [id]); }
  function getModelByCode(code) { return one('SELECT * FROM sample_models WHERE code = ?', [code]); }
  function createModel(data) { return run('INSERT INTO sample_models (code,full_name,created_by) VALUES (?,?,?)', [data.code, data.full_name, data.created_by || null]).then(function () { return getModelByCode(data.code); }); }
  function deleteModel(id) { return run('DELETE FROM sample_models WHERE id=?', [id]); }
  function countSamplesByModel(code) { return q('SELECT COUNT(*) as c FROM samples WHERE model = ?', [code]).then(function (rows) { return rows[0].c; }); }
  function listLegacyModels() { return q("SELECT DISTINCT model AS code FROM samples WHERE model IS NOT NULL AND model != '' ORDER BY model ASC").then(function (rows) { return rows.map(function (r) { return r.code; }); }); }
```

`return {...}` 追加导出（`listLogs` 之后）：

```js
  listModels, getModelById, getModelByCode, createModel, deleteModel, countSamplesByModel, listLegacyModels
```

- [ ] **Step 5: 验证语法与 DAO 加载**

Run: `node -e "const D=require('./db'); D.ready.then(()=>console.log('models fns:', typeof D.listModels, typeof D.getModelByCode, typeof D.listLegacyModels)).catch(e=>{console.error(e.message);process.exit(1)})"`
Expected: `models fns: function function function`（`db.js` 自动扫描加载 samples dao，`sample_models` 表由 init 幂等建表）

- [ ] **Step 6: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/db/schema.sql subsystems/samples/manifest.json subsystems/samples/db/dao.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(samples): 机型主数据表与 DAO 函数"
```

---

### Task 2: 后端 API（models CRUD + 下拉数据源 + 列表筛选 + 新建强制校验）

**Files:**
- Modify: `subsystems/samples/backend/routes-samples.js`

- [ ] **Step 1: 列表接口加 model 参数**

`routes-samples.js` `app.get('/api/samples', ...)` 中，`req.query` 解构增加 `model`，`filterOpts` 增加一行：

```js
    const { status, dept, q, sort, overdue, sample_type, limit_item, source_type, model, limit, offset } = req.query;
```

```js
      model: model || undefined
```

- [ ] **Step 2: models CRUD 与 model-options 路由**

在 `app.get('/api/samples/code-preview', ...)` 之后、`app.get('/api/samples/:id', ...)` 之前插入：

```js
  // 机型列表：GET 所有登录角色可读（新建下拉/筛选数据源）；POST/DELETE 仅 RD/ADMIN（须注册在 /:id 之前）
  app.get('/api/samples/models', requireAuth, async (req, res) => {
    res.json(await D.listModels());
  });

  // 下拉数据源：机型列表全称 + 存量样品 model 补集（历史值不丢，避免漏筛）
  app.get('/api/samples/model-options', requireAuth, async (req, res) => {
    const models = await D.listModels();
    const legacy = await D.listLegacyModels();
    const seen = {};
    const out = models.map(function (m) { seen[m.code] = 1; return { value: m.code, label: m.full_name }; });
    legacy.forEach(function (code) { if (!seen[code]) out.push({ value: code, label: code }); });
    res.json(out);
  });

  app.post('/api/samples/models', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['RD', 'ADMIN'].includes(u.role)) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
      const code = ((req.body || {}).code || '').trim().toUpperCase();
      const full_name = ((req.body || {}).full_name || '').trim();
      if (!code) return res.status(400).json({ error: '请填写机型短码' });
      if (code.length < 6) return res.status(400).json({ error: '机型短码至少 6 位' });
      if (code.length > 20) return res.status(400).json({ error: '机型短码最长 20 位' });
      if (!full_name) return res.status(400).json({ error: '请填写机型全称' });
      res.json(await D.createModel({ code: code, full_name: full_name, created_by: u.id }));
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(409).json({ error: '机型短码或全称已存在' });
      logger.error('新增机型失败: ' + (err.message || String(err)));
      res.status(500).json({ error: '新增机型失败：' + (err.message || '服务器内部错误') });
    }
  });

  app.delete('/api/samples/models/:id', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (!['RD', 'ADMIN'].includes(u.role)) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
    const m = await D.getModelById(Number(req.params.id));
    if (!m) return res.status(404).json({ error: '机型不存在' });
    const used = await D.countSamplesByModel(m.code);
    if (used > 0) return res.status(409).json({ error: '该机型已被 ' + used + ' 个样品使用，禁止删除' });
    await D.deleteModel(m.id);
    res.json({ ok: true });
  });
```

- [ ] **Step 3: 新建样品强制机型校验**

`app.post('/api/samples', ...)` 中，`if (!model || model.trim().length < 6)` 校验之后追加：

```js
      const m = await D.getModelByCode(model.trim());
      if (!m) return res.status(400).json({ error: '机型不存在，请先在机型列表添加该机型' });
```

- [ ] **Step 4: 语法自检**

Run: `node -c subsystems/samples/backend/routes-samples.js && node -c subsystems/samples/db/dao.js`
Expected: 无输出（语法 OK）

- [ ] **Step 5: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/backend/routes-samples.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(samples): 机型列表 API、列表 model 筛选与新建强制校验"
```

---

### Task 3: 后端测试（models.test.js 新建 + samples.test.js 适配）

**Files:**
- Create: `tests/models.test.js`
- Modify: `tests/samples.test.js`

- [ ] **Step 1: 新建 tests/models.test.js**

`tests/models.test.js` 完整内容（沿用 `helpers/setup.js`，随机后缀保证幂等）：

```js
const { getApp, login } = require('./helpers/setup');

beforeAll(async () => { await getApp(); });

const R = 'M' + Date.now().toString(36).toUpperCase(); // 随机后缀，保证重复跑幂等

describe('GET /api/samples/models', () => {
  it('should list models as any login role', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent.get('/api/samples/models');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/samples/models', () => {
  it('should create model as RD', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples/models').send({ code: R + '01', full_name: R + ' 低噪马达' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(R + '01');
  });

  it('should reject code shorter than 6', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples/models').send({ code: 'AB1', full_name: 'x' });
    expect(res.status).toBe(400);
  });

  it('should reject duplicate code or full_name', async () => {
    const { agent } = await login('rd01', 'rd123');
    await agent.post('/api/samples/models').send({ code: R + '02', full_name: R + ' 重复A' });
    const dupCode = await agent.post('/api/samples/models').send({ code: R + '02', full_name: R + ' 重复B' });
    expect(dupCode.status).toBe(409);
    const dupName = await agent.post('/api/samples/models').send({ code: R + '03', full_name: R + ' 重复A' });
    expect(dupName.status).toBe(409);
  });

  it('should reject POST by non-RD/ADMIN', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent.post('/api/samples/models').send({ code: R + '04', full_name: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/samples/models/:id', () => {
  it('should delete unused model', async () => {
    const { agent } = await login('rd01', 'rd123');
    const created = await agent.post('/api/samples/models').send({ code: R + '05', full_name: '待删机型' });
    const res = await agent.delete('/api/samples/models/' + created.body.id);
    expect(res.status).toBe(200);
  });

  it('should reject delete of referenced model', async () => {
    const { agent } = await login('rd01', 'rd123');
    const created = await agent.post('/api/samples/models').send({ code: R + '06', full_name: '被引用机型' });
    await agent.post('/api/samples').send({ name: '引用样品' + R, spec: 'S', model: R + '06', station: '马达组', source_type: 'T' });
    const res = await agent.delete('/api/samples/models/' + created.body.id);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/samples?model=', () => {
  it('should filter samples by model', async () => {
    const { agent } = await login('rd01', 'rd123');
    await agent.post('/api/samples/models').send({ code: R + '07', full_name: '筛选机型' });
    await agent.post('/api/samples').send({ name: '机型A样品' + R, spec: 'S', model: R + '07', station: '马达组', source_type: 'T' });
    const res = await agent.get('/api/samples?model=' + R + '07');
    expect(res.status).toBe(200);
    expect(res.body.samples.length).toBeGreaterThan(0);
    res.body.samples.forEach(function (s) { expect(s.model).toBe(R + '07'); });
  });
});
```

- [ ] **Step 2: 运行 models.test.js 验证通过**

Run: `sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest tests/models.test.js 2>&1 | tail -40'`
Expected: 8 个用例全部 PASS（含 409 引用校验、403 权限、model 筛选）

- [ ] **Step 3: 适配 samples.test.js（beforeAll 预置机型）**

`tests/samples.test.js` 顶部 `beforeAll` 替换为：

```js
beforeAll(async () => {
  await getApp();
  // 新增强制校验：预置测试用机型（幂等：409 已存在也接受）
  const { agent } = await login('rd01', 'rd123');
  const codes = ['SF1225', 'SF9225', 'MX1234', 'MY1234'];
  for (const code of codes) {
    const r = await agent.post('/api/samples/models').send({ code: code, full_name: '测试机型 ' + code });
    if (r.status !== 200 && r.status !== 409) throw new Error('预置机型失败: ' + code + ' → ' + r.body.error);
  }
});
```

- [ ] **Step 4: 全量跑 samples 相关测试**

Run: `sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest tests/samples.test.js tests/models.test.js tests/sample-code.test.js 2>&1 | tail -25'`
Expected: 全部 PASS（samples 用例约 34、models 8、sample-code 18）

- [ ] **Step 5: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add tests/models.test.js tests/samples.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "test(samples): 机型列表接口测试与 samples 测试适配强制校验"
```

---

### Task 4: 前端机型列表页 + 导航

**Files:**
- Create: `subsystems/samples/frontend/js/views/models.js`
- Modify: `subsystems/samples/frontend/js/router.js`
- Modify: `subsystems/samples/manifest.json`（navigation）

- [ ] **Step 1: 新建 views/models.js**

`subsystems/samples/frontend/js/views/models.js` 完整内容：

```js
// models.js — 机型列表管理（仅 RD/ADMIN 可见，后端 POST/DELETE 403 兜底）
function viewModels() {
  const v = $('#view');
  v.innerHTML = '<div class="filters">' +
    '<fluent-text-field id="m-code" placeholder="机型短码（≥6位，如 YD9015）" style="flex:1.5"></fluent-text-field>' +
    '<fluent-text-field id="m-full-name" placeholder="机型全称（如 YD9015 低噪声马达）" style="flex:2"></fluent-text-field>' +
    '<fluent-button appearance="accent" size="small" onclick="addModel()">新增机型</fluent-button>' +
    '</div><div id="m-list"></div>';
  loadModels();
}

async function loadModels() {
  const list = await api('GET', '/api/samples/models');
  $('#m-list').innerHTML = '<div class="card" style="padding:0"><table>' +
    '<tr><th>机型短码</th><th>机型全称</th><th>创建时间</th><th style="width:80px">操作</th></tr>' +
    (list.length ? list.map(function (m) {
      return '<tr><td><b>' + e(m.code) + '</b></td><td>' + e(m.full_name) + '</td><td class="muted">' + e((m.created_at || '').replace('T', ' ').slice(0, 19)) + '</td>' +
        '<td><a class="link" onclick="deleteModel(' + m.id + ',\'' + m.code + '\')">删除</a></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">暂无机型，请先新增</td></tr>') +
    '</table></div>';
}

async function addModel() {
  const code = $('#m-code').value.trim().toUpperCase();
  const full_name = $('#m-full-name').value.trim();
  if (!code || !full_name) { toast('请填写机型短码和全称', 'err'); return; }
  try {
    await api('POST', '/api/samples/models', { code: code, full_name: full_name });
    toast('机型已新增', 'ok');
    $('#m-code').value = ''; $('#m-full-name').value = '';
    loadModels();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteModel(id, code) {
  if (!confirm('确认删除机型 ' + code + ' ？')) return;
  try {
    await api('DELETE', '/api/samples/models/' + id);
    toast('机型已删除', 'ok');
    loadModels();
  } catch (e) { toast(e.message, 'err'); }
}
```

- [ ] **Step 2: router.js 增加导航/视图/meta**

`subsystems/samples/frontend/js/router.js`：

- `NAV` 数组 `{k:'new',...}` 之后插入：`{k:'models',t:'机型列表',roles:['ADMIN','RD']},`
- `VIEWS` 增加：`models:viewModels,`
- `meta` 增加：`models:'机型列表',`

- [ ] **Step 3: manifest.json navigation 增加（保持声明一致）**

`subsystems/samples/manifest.json` `navigation` 数组「新建样品」（key: new）对象之后插入：

```json
    {
      "key": "models",
      "label": "机型列表",
      "icon": "cube",
      "view": "viewModels",
      "roles": [
        "ADMIN",
        "RD"
      ]
    },
```

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/views/models.js subsystems/samples/frontend/js/router.js subsystems/samples/manifest.json
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(samples): 机型列表管理页与导航入口"
```

---

### Task 5: 新建表单改造（规格/型号下拉选机型）

**Files:**
- Modify: `subsystems/samples/frontend/js/views/new.js`

- [ ] **Step 1: viewNew 改为异步加载机型下拉**

`subsystems/samples/frontend/js/views/new.js`：

- `viewNew` 改为 `async function viewNew(){`，其中「机型」栏与「规格/型号」栏替换为：

```js
    '<label>机型 *</label><fluent-text-field id="n-model" disabled placeholder="选择机型后自动填入"></fluent-text-field>'+
    '<label>规格/型号 *</label><fluent-select id="n-spec"><fluent-option value="">请选择机型</fluent-option></fluent-select>'+
```

- `viewNew` 函数体末尾（`_bindPreview();` 之前）插入机型下拉加载与联动：

```js
  try {
    const opts = await api('GET', '/api/samples/model-options');
    const sel = $('#n-spec');
    if (!opts.length) {
      sel.innerHTML = '<fluent-option value="">暂无机型，请先到机型列表添加</fluent-option>';
    } else {
      sel.innerHTML = '<fluent-option value="">请选择机型</fluent-option>' + opts.map(function (o) { return '<fluent-option value="' + e(o.value) + '">' + e(o.label) + '</fluent-option>'; }).join('');
      sel.addEventListener('change', function () {
        $('#n-model').value = sel.value;
        _schedulePreview();
      });
    }
  } catch (_) { /* 下拉加载失败保持仅提示项 */ }
```

- [ ] **Step 2: submitNew 取选中全称**

`submitNew` 的 payload 中 `spec` 改为：

```js
      spec: $('#n-spec').selectedOptions && $('#n-spec').selectedOptions.length ? $('#n-spec').selectedOptions[0].text : ''
```

（`model` 仍取 `$('#n-model').value`，未选机型为空 → 命中后端「机型编码至少 6 位」校验）

- [ ] **Step 3: 语法自检**

Run: `node -c subsystems/samples/frontend/js/views/new.js`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/views/new.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(samples): 新建样品规格/型号改为下拉选机型并自动带出编码"
```

---

### Task 6: 列表筛选按机型

**Files:**
- Modify: `subsystems/samples/frontend/js/views/list.js`
- Modify: `subsystems/samples/frontend/js/views/list-filter.js`

- [ ] **Step 1: list.js 加载机型选项并渲染下拉**

`subsystems/samples/frontend/js/views/list.js` 的 `viewSamples` 改为 `async`（已是 async），在 `var v = $('#view');` 之后插入机型选项加载：

```js
  var modelOpts = '<fluent-option value="">全部机型</fluent-option>';
  try {
    (await api('GET', '/api/samples/model-options')).forEach(function (o) { modelOpts += '<fluent-option value="' + e(o.value) + '">' + e(o.label) + '</fluent-option>'; });
  } catch (_) {}
```

`#f-source` 下拉之后插入机型下拉：

```js
    '<fluent-select id="f-model" onchange="loadSamples()">' + modelOpts + '</fluent-select>' +
```

- [ ] **Step 2: list-filter.js 参数与 chips**

`subsystems/samples/frontend/js/views/list-filter.js`：

`_buildQueryParams` 中 `src` 解构后追加：

```js
  var mo = $('#f-model').value;
```

`if (src)` 之后追加：

```js
  if (mo) p += '&model=' + encodeURIComponent(mo);
```

`renderChips` 中 `src` 声明后追加 `var mo = $('#f-model').value;`，并在 source chip 之后追加：

```js
  if (mo) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-model\').value=\'\';loadSamples()">机型 ' + e(mo) + ' ✕</span>';
```

- [ ] **Step 3: 语法自检**

Run: `node -c subsystems/samples/frontend/js/views/list.js && node -c subsystems/samples/frontend/js/views/list-filter.js`
Expected: 无输出

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/views/list.js subsystems/samples/frontend/js/views/list-filter.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(samples): 样品列表新增按机型筛选"
```

---

### Task 7: bundle 重建 + 全量回归 + 部署 + 端到端验证

**Files:**
- Modify: `tools/bundle-sources.json`
- Modify: `subsystems/samples/frontend/index.html`（版本号）

- [ ] **Step 1: bundle-sources.json 插入 models.js**

`tools/bundle-sources.json` samples 数组 `"subsystems/samples/frontend/js/views/users.js"` 之后、`"subsystems/samples/frontend/js/router.js"` 之前插入：

```json
    "subsystems/samples/frontend/js/views/models.js",
```

- [ ] **Step 2: 重建 bundle 并部署**

Run: `node tools/build-bundles.js`
Expected: `Done. VER=bXXXXXX`（读 `tools/.bundle-ver` 取值）

Run（替换 `<VER>` 为实际版本号）：
```bash
export SUDO_ASKPASS=/tmp/askpass.sh
cp /tmp/bundle-samples.js /tmp/bundle-samples.final.js
sudo -A cp /tmp/bundle-samples.final.js /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/bundle.js
sudo -A chown www:www /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/bundle.js
sed -i 's|bundle.js?v=[a-z0-9]*|bundle.js?v=<VER>|' /tmp/idx-samples.html
# 若 /tmp/idx-samples.html 不存在：cp index.html 到 /tmp 再 sed
sudo -A cp /tmp/idx-samples.html /www/wwwroot/sample-mgmt/subsystems/samples/frontend/index.html
sudo -A chown www:www /www/wwwroot/sample-mgmt/subsystems/samples/frontend/index.html
```

- [ ] **Step 3: 重启 4000 服务（使 schema 建表 + 新路由生效）**

```bash
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A ss -tlnp | grep ':4000 '   # 记下 PID
sudo -A kill <PID>
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
sleep 3
curl -s http://localhost:4000/api/samples/models | head -c 200   # 期望 JSON 数组
```

- [ ] **Step 4: 全量测试回归**

Run: `sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest 2>&1 | tail -30'`
Expected: 全部 PASS（samples/fixtures/workbench 测试文件，含既有 134+ 用例）

- [ ] **Step 5: 浏览器端到端验证（browser_use subagent）**

派发 browser_use 验证清单：
1. rd01 登录 → 导航出现「机型列表」→ 新增机型（短码 + 全称）→ 表格出现
2. 新建样品 → 规格/型号下拉选刚建机型 → 机型编码自动填入（只读）→ 编号预览出现 → 创建成功
3. 样品列表 → 机型筛选下拉选择 → 列表只显示该机型
4. qa01 登录 → 无「机型列表」导航；直接访问 `#/models` 时页面无机型管理入口（后端 GET 可读、写操作 403）

- [ ] **Step 6: 提交 bundle 相关改动**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add tools/bundle-sources.json subsystems/samples/frontend/js/bundle.js subsystems/samples/frontend/index.html
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "chore(samples): 重建 bundle 引入机型列表功能"
```

- [ ] **Step 7: 输出文件臃肿检测报告（AGENTS.md 第 9 节）**

对每个修改文件输出：有效代码行数 / 总字符 / 距上限剩余 / 函数数量 / 冗余清单。

---

## 验证清单（提交前自检）

- [ ] models 路由注册在 `/:id` 之前
- [ ] GET models/model-options 全角色可读、POST/DELETE 仅 RD/ADMIN
- [ ] 新建样品强制机型存在校验生效
- [ ] 被引用机型删除返回 409
- [ ] 列表 `?model=` 精确筛选 + chips 移除
- [ ] bundle 已重建、版本号已更新、服务已重启
- [ ] 全量 jest PASS
- [ ] 文件臃肿检测报告已输出
- [ ] fixtures/workbench 无回归（本次未改共享文件）
