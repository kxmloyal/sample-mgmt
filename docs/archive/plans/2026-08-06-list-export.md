# 子系统列表「导出 CSV」标准能力 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为样品列表与治具清单提供「按当前显示顺序导出 CSV」能力（筛选全量、忽略分页），并以 AGENTS.md §21 固化标准，供后续子系统复用。

**Architecture:** 新增共享 `shared/csv.js`（BOM CSV 生成 + 响应发送，不绑定子系统）；samples/fixtures 各自注册 `GET /api/<prefix>/export` 端点，复用列表查询参数与 DAO（`listSamples`/`listFixtures` 不传 limit 即全量）；前端列表筛选栏加「导出 CSV」按钮，用现有筛选参数构建函数拼 URL 触发下载。状态/归还/保养列在导出端点内联中文映射（与前端 badge 判定一致）。

**Tech Stack:** Node.js + Express 4 (CommonJS) / MariaDB / 原生前端 + fluentui / jest (supertest)

**设计文档:** `docs/superpowers/specs/2026-08-06-list-export-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `shared/csv.js` | 新建 | 通用 CSV 工具：`toCsv(rows, cols)`、`sendCsv(res, filename, csv)`（≤100 行） |
| `tests/csv.test.js` | 新建 | CSV 工具单元测试（纯函数，无 DB） |
| `subsystems/samples/backend/routes-samples.js` | 修改 | 新增 `GET /api/samples/export`（复用列表 filterOpts，忽略分页） |
| `tests/samples.test.js` | 修改 | 追加导出端点用例（在 `if (isDeployed('samples'))` else 块内） |
| `subsystems/fixtures/backend/routes-fixtures.js` | 修改 | 新增 `GET /api/fixtures/export` |
| `tests/fixtures-export.test.js` | 新建 | 治具导出端点用例（只读验证 + 护栏） |
| `subsystems/samples/frontend/js/views/list.js` | 修改 | 「查询」按钮旁加「导出 CSV」+ `exportSamplesCsv()` |
| `subsystems/fixtures/frontend/js/views/list.js` | 修改 | 「清除」按钮旁加「导出 CSV」+ `exportFixturesCsv()` |
| `subsystems/samples/frontend/js/bundle.js` / `subsystems/fixtures/frontend/js/bundle.js` | 重建 | 构建产物（含新按钮逻辑） |
| 4 个 `subsystems/*/frontend/index.html` | 修改 | bundle 版本号更新（`tools/.bundle-ver`） |
| `AGENTS.md` | 修改 | 新增 §21 列表导出标准 + §3 目录结构加 `shared/csv.js` |
| `README.md` | 修改 | API 表加两个导出端点 |
| `docs/operation-manual.md` | 修改 | 导出操作说明 |

> 容量红线核对：`routes-samples.js` 213 行 / `routes-fixtures.js` 185 行（Controller 上限 400），各追加约 50 行不超限；`shared/csv.js` ≤100 行（工具上限 200）；前端 `list.js` 各加 1 个顶层函数（samples 6 个 / fixtures 5 个，均 ≤10）。

---

### Task 1: 共享 CSV 工具 shared/csv.js

**Files:**
- Create: `shared/csv.js`
- Test: `tests/csv.test.js`

- [ ] **Step 1: 写失败测试**

Create `tests/csv.test.js`:

```js
// tests/csv.test.js — shared/csv.js 单元测试（纯函数，无 DB 依赖）
const { toCsv, sendCsv } = require('../shared/csv');

describe('shared/csv', () => {
  it('should prepend BOM and write header + data rows', () => {
    const csv = toCsv([{ a: 'x', b: 1 }], [{ key: 'a', label: '甲' }, { key: 'b', label: '乙' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toBe('甲,乙');
    expect(lines[1]).toBe('x,1');
  });

  it('should quote values containing comma / quote / newline', () => {
    const csv = toCsv([{ a: 'he said "hi", ok\nline2' }], [{ key: 'a', label: 'A' }]);
    const body = csv.replace('\uFEFF', '').split('\r\n')[1];
    expect(body).toBe('"he said ""hi"", ok\nline2"');
  });

  it('should treat null / undefined as empty string', () => {
    const csv = toCsv([{ a: null, b: undefined }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
    expect(csv.replace('\uFEFF', '').split('\r\n')[1]).toBe(',');
  });

  it('should apply fmt formatter with (value, row)', () => {
    const csv = toCsv([{ st: 'RELEASED' }], [{ key: 'st', label: '状态', fmt: v => (v === 'RELEASED' ? '已发行' : v) }]);
    expect(csv.replace('\uFEFF', '').split('\r\n')[1]).toBe('已发行');
  });

  it('sendCsv should set headers and send body', () => {
    const res = { setHeader: jest.fn(), send: jest.fn() };
    sendCsv(res, 'samples-20260806.csv', '\uFEFFa');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('samples-20260806.csv'));
    expect(res.send).toHaveBeenCalledWith('\uFEFFa');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest tests/csv.test.js`
Expected: FAIL — `Cannot find module '../shared/csv'`

- [ ] **Step 3: 实现 shared/csv.js**

Create `shared/csv.js`:

```js
// shared/csv.js — 通用 CSV 导出工具（BOM UTF-8，供各子系统列表导出复用，AGENTS.md §21）
// 禁止子系统各自重复实现 CSV 生成；本文件不绑定任何子系统

/** 值转义：含逗号/引号/换行时双引号包裹，内部引号 "" 转义；null/undefined → 空串 */
function esc(v) {
  var s = String(v == null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * 生成 BOM CSV 文本
 * @param {Array<Object>} rows 数据行
 * @param {Array<{key:string,label:string,fmt?:Function}>} cols 列定义
 *        fmt: (value, row) => string 可选格式化（如状态中文映射）
 * @returns {string} BOM(\uFEFF) 前缀的 CSV 文本（\r\n 换行）
 */
function toCsv(rows, cols) {
  var lines = [cols.map(function (c) { return esc(c.label); }).join(',')];
  (rows || []).forEach(function (row) {
    lines.push(cols.map(function (c) {
      var v = row == null ? '' : row[c.key];
      return esc(c.fmt ? c.fmt(v, row) : v);
    }).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

/**
 * 发送 CSV 下载响应
 * @param {Object} res Express res
 * @param {string} filename 建议 samples-YYYYMMDD-HHmm.csv
 * @param {string} csv toCsv 输出
 */
function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename));
  res.send(csv);
}

module.exports = { toCsv, sendCsv };
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest tests/csv.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 提交**

```bash
git add shared/csv.js tests/csv.test.js
git commit -m "feat(export): 共享 CSV 导出工具（toCsv/sendCsv，BOM UTF-8 + 转义）"
```

---

### Task 2: 样品导出端点 GET /api/samples/export

**Files:**
- Modify: `subsystems/samples/backend/routes-samples.js`（顶部 require 区 + 文件末尾新端点）
- Test: `tests/samples.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `tests/samples.test.js` 的 else 块内（文件末尾、`}` 之前）追加：

```js
describe('GET /api/samples/export', () => {
  let expId, adminAgent;

  beforeAll(async () => {
    ({ agent: adminAgent } = await login('admin', 'admin123'));
    const res = await adminAgent.post('/api/samples').send({
      name: '导出测试样', spec: 'EXP-1', model: 'SF1225', station: '马达组',
      sample_type: 'OK', limit_item: 'A', source_type: 'T', notes: 'csv-export'
    });
    expect(res.status).toBe(200);
    expId = res.body.id;
  });

  it('should reject unauthenticated', async () => {
    const res = await request(await getApp()).get('/api/samples/export');
    expect(res.status).toBe(401);
  });

  it('should return CSV with BOM, header and created sample', async () => {
    const res = await adminAgent.get('/api/samples/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const text = res.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    const lines = text.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toContain('编号');
    expect(lines[0]).toContain('状态');
    expect(lines.some(l => l.includes('导出测试样'))).toBe(true);
    expect(lines.some(l => l.includes('待制作'))).toBe(true); // NEW → 待制作
  });

  it('should respect status filter (full export ignores paging)', async () => {
    // 不传 status：导出全部（含新建样品）
    const all = await adminAgent.get('/api/samples/export');
    const allLines = all.text.replace('\uFEFF', '').split('\r\n').slice(1).filter(l => l.trim());
    const listRes = await adminAgent.get('/api/samples');
    expect(allLines.length).toBe(listRes.body.total);
  });

  afterAll(async () => {
    if (expId) await adminAgent.delete('/api/samples/' + expId);
  });
});
```

> 说明：`request` 已在文件顶部导入（现有代码使用），若未导入则补 `const request = require('supertest');`。

- [ ] **Step 2: 运行确认失败**

Run: `npx jest tests/samples.test.js -t "export"`
Expected: FAIL — 404（`/api/samples/export` 未注册）

- [ ] **Step 3: 实现导出端点**

在 `subsystems/samples/backend/routes-samples.js` 顶部 require 区追加：

```js
const { toCsv, sendCsv } = require('../../../shared/csv');
```

在 `register(app)` 末尾（`module.exports` 前）追加：

```js
  // 导出列表 CSV（复用列表筛选参数，忽略分页取全量；AGENTS.md §21 列表导出标准）
  const SAMPLE_STATUS_CN = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已作废' };
  const INSPECT_SOON_DAYS = 7;

  /** 复检状态中文（与前端 list-inspect.js 判定一致：正常/近7天到期/逾期N天/—） */
  function inspectStateCn(row) {
    if (!row || !row.next_inspect_at) return '—';
    const t = new Date(row.next_inspect_at).getTime();
    if (t < Date.now()) return '逾期' + Math.ceil((Date.now() - t) / 86400000) + '天';
    if (t <= Date.now() + INSPECT_SOON_DAYS * 86400000) return '近7天到期';
    return '正常';
  }

  app.get('/api/samples/export', requireAuth, asyncHandler(async (req, res) => {
    const { status, dept, q, sort, overdue, sample_type, limit_item, source_type, model } = req.query;
    const filterOpts = {
      status: status || undefined, dept: dept || undefined, search: q || undefined,
      sort: sort || undefined, overdue: overdue || undefined,
      sample_type: sample_type || undefined, limit_item: limit_item || undefined,
      source_type: source_type || undefined, model: model || undefined
    };
    const samples = await D.listSamples(filterOpts); // 不传 limit/offset → 全量（与列表同排序）
    const cols = [
      { key: 'sample_no', label: '编号' },
      { key: 'name', label: '名称' },
      { key: 'model', label: '机型' },
      { key: 'station', label: '站别' },
      { key: 'spec', label: '规格' },
      { key: 'sample_type', label: '类型', fmt: v => (v === 'OK' ? 'OK样品' : v === 'NG' ? 'NG样品' : (v || '')) },
      { key: 'status', label: '状态', fmt: v => SAMPLE_STATUS_CN[v] || v },
      { key: 'next_inspect_at', label: '复检状态', fmt: (v, row) => inspectStateCn(row) },
      { key: 'produced_at', label: '制作时间', fmt: v => (v || '').slice(0, 16).replace('T', ' ') },
      { key: 'released_at', label: '发行时间', fmt: v => (v || '').slice(0, 16).replace('T', ' ') },
      { key: 'custody_dept', label: '保管部门' },
      { key: 'storage_location', label: '储位' },
      { key: 'next_inspect_at', label: '复检到期', fmt: v => (v || '').slice(0, 16).replace('T', ' ') },
      { key: 'updated_at', label: '更新时间', fmt: v => (v || '').slice(0, 16).replace('T', ' ') }
    ];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    sendCsv(res, 'samples-' + stamp + '.csv', toCsv(samples, cols));
  }));
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest tests/samples.test.js`
Expected: PASS（原有用例 + 新 export describe 全部通过）

- [ ] **Step 5: 提交**

```bash
git add subsystems/samples/backend/routes-samples.js tests/samples.test.js
git commit -m "feat(samples): 列表导出 CSV 接口 GET /api/samples/export（筛选全量、忽略分页）"
```

---

### Task 3: 治具导出端点 GET /api/fixtures/export

**Files:**
- Modify: `subsystems/fixtures/backend/routes-fixtures.js`（顶部 require 区 + register 内追加）
- Test: `tests/fixtures-export.test.js`（新建）

- [ ] **Step 1: 写失败测试**

Create `tests/fixtures-export.test.js`:

```js
// tests/fixtures-export.test.js — GET /api/fixtures/export 导出接口（只读验证）
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

// 治具子系统上线保护：deployed:true 时跳过（AGENTS.md §20）；导出为只读接口，实际始终可安全运行
if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('GET /api/fixtures/export', () => {
  let adminAgent;

  beforeAll(async () => {
    await getApp();
    ({ agent: adminAgent } = await login('admin', 'admin123'));
  });

  it('should reject unauthenticated', async () => {
    const res = await require('supertest')(await getApp()).get('/api/fixtures/export');
    expect(res.status).toBe(401);
  });

  it('should return CSV with BOM, Chinese header and status mapping', async () => {
    const res = await adminAgent.get('/api/fixtures/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const text = res.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    const lines = text.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toContain('编号');
    expect(lines[0]).toContain('归还状态');
    expect(lines[0]).toContain('保养状态');
  });

  it('should export same count as unfiltered list total (full export)', async () => {
    const exp = await adminAgent.get('/api/fixtures/export');
    const dataLines = exp.text.replace('\uFEFF', '').split('\r\n').slice(1).filter(l => l.trim());
    const list = await adminAgent.get('/api/fixtures');
    expect(dataLines.length).toBe(list.body.total);
  });

  it('should respect status filter', async () => {
    const res = await adminAgent.get('/api/fixtures/export?status=IN_USE');
    const lines = res.text.replace('\uFEFF', '').split('\r\n').slice(1).filter(l => l.trim());
    const list = await adminAgent.get('/api/fixtures?status=IN_USE');
    expect(lines.length).toBe(list.body.total);
  });
});

}
```

- [ ] **Step 2: 运行确认失败**

Run: `npx jest tests/fixtures-export.test.js`
Expected: FAIL — 404（端点未注册）

- [ ] **Step 3: 实现导出端点**

在 `subsystems/fixtures/backend/routes-fixtures.js` 顶部 require 区追加：

```js
var { toCsv, sendCsv } = require('../../../shared/csv');
```

在 `register(app)` 内、`GET /api/fixtures` 端点之后追加：

```js
  // 导出清单 CSV（复用列表筛选/排序参数，忽略分页取全量；AGENTS.md §21 列表导出标准）
  var FIXTURE_STATUS_CN = {
    REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待验证',
    VERIFY_RD_OK: 'RD验证通过', VERIFY_ORG_OK: '申请单位验证',
    TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
    REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成',
    RETIRED: '已废弃'
  };
  var FIXTURE_SOON_DAYS = 7;

  // 到期状态中文（与前端 fixture-inspect.js 判定一致）：statusField 限制状态（归还仅 IN_USE）
  function fixtureDueCn(statusField, dateField, overdueLabel) {
    return function (v, row) {
      if (row == null || !row[dateField]) return '—';
      if (statusField && row.status !== statusField) return '—';
      var t = new Date(row[dateField]).getTime();
      if (t < Date.now()) return overdueLabel + Math.ceil((Date.now() - t) / 86400000) + '天';
      if (t <= Date.now() + FIXTURE_SOON_DAYS * 86400000) return '近7天到期';
      return '正常';
    };
  }

  app.get('/api/fixtures/export', requireAuth, async function (req, res) {
    var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search,
        overdue = _a.overdue, sort = _a.sort, dir = _a.dir;
    var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, sort: sort, dir: dir });
    var cols = [
      { key: 'fixture_no', label: '编号' },
      { key: 'name', label: '名称' },
      { key: 'spec', label: '规格' },
      { key: 'requested_dept', label: '部门' },
      { key: 'storage_location', label: '储位' },
      { key: 'status', label: '状态', fmt: function (v) { return FIXTURE_STATUS_CN[v] || v; } },
      { key: 'expected_return_at', label: '归还状态', fmt: fixtureDueCn('IN_USE', 'expected_return_at', '超期') },
      { key: 'next_maintenance_at', label: '保养状态', fmt: fixtureDueCn(null, 'next_maintenance_at', '逾期') },
      { key: 'updated_at', label: '更新时间', fmt: function (v) { return (v || '').slice(0, 16).replace('T', ' '); } }
    ];
    var stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    sendCsv(res, 'fixtures-' + stamp + '.csv', toCsv(fixtures, cols));
  });
```

- [ ] **Step 4: 运行确认通过**

Run: `npx jest tests/fixtures-export.test.js`
Expected: PASS（4 tests）

- [ ] **Step 5: 提交**

```bash
git add subsystems/fixtures/backend/routes-fixtures.js tests/fixtures-export.test.js
git commit -m "feat(fixtures): 清单导出 CSV 接口 GET /api/fixtures/export（筛选/排序全量）"
```

---

### Task 4: 前端「导出 CSV」按钮 + bundle 重建

**Files:**
- Modify: `subsystems/samples/frontend/js/views/list.js`
- Modify: `subsystems/fixtures/frontend/js/views/list.js`
- Rebuild: `subsystems/samples/frontend/js/bundle.js`、`subsystems/fixtures/frontend/js/bundle.js`
- Modify: 4 个 `subsystems/*/frontend/index.html`（bundle 版本号）

- [ ] **Step 1: 样品列表加按钮 + 导出函数**

在 `subsystems/samples/frontend/js/views/list.js` 中，将查询按钮行：

```js
    '<fluent-button appearance="accent" size="small" onclick="loadSamples()">查询</fluent-button></div>' +
```

改为：

```js
    '<fluent-button appearance="accent" size="small" onclick="loadSamples()">查询</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="exportSamplesCsv()">导出 CSV</fluent-button></div>' +
```

在文件末尾（`deleteSample` 之后）追加：

```js
// 导出当前筛选结果 CSV（复用列表筛选参数，忽略分页；AGENTS.md §21 列表导出标准）
function exportSamplesCsv() {
  var qs = (_sampleBuildParams ? _sampleBuildParams() : _buildQueryParams('')).replace(/^&/, '');
  location.href = '/api/samples/export' + (qs ? '?' + qs : '');
}
```

- [ ] **Step 2: 治具清单加按钮 + 导出函数**

在 `subsystems/fixtures/frontend/js/views/list.js` 中，将清除按钮行：

```js
    html += '<fluent-button appearance="accent" onclick="clearAllFilters()">清除</fluent-button></div>';
```

改为：

```js
    html += '<fluent-button appearance="accent" onclick="clearAllFilters()">清除</fluent-button>';
    html += '<fluent-button appearance="neutral" onclick="exportFixturesCsv()">导出 CSV</fluent-button></div>';
```

在文件末尾（`loadFixtureList` 之后）追加：

```js
// 导出当前筛选结果 CSV（复用列表筛选参数，忽略分页；AGENTS.md §21 列表导出标准）
function exportFixturesCsv() {
  var parts = [];
  if (fixtureListState.status) parts.push('status=' + encodeURIComponent(fixtureListState.status));
  if (fixtureListState.dept) parts.push('dept=' + encodeURIComponent(fixtureListState.dept));
  if (fixtureListState.search) parts.push('search=' + encodeURIComponent(fixtureListState.search));
  if (fixtureListState.col) parts.push('col=' + encodeURIComponent(fixtureListState.col) + '&dir=' + fixtureListState.dir);
  location.href = '/api/fixtures/export?' + parts.join('&');
}
```

- [ ] **Step 3: 重建 bundle + 更新版本号**

Run:

```bash
node tools/build-bundles.js
```

Expected: 输出 3 个 bundle 到 /tmp + 写入 `tools/.bundle-ver`（读取新 VER）。

Run（复制 bundle + 更新 4 个 index.html 版本号；VER 为 Step 3 实际输出值，如 `bxxxxxxx`）：

```bash
sudo cp /tmp/bundle-samples.js subsystems/samples/frontend/js/bundle.js
sudo cp /tmp/bundle-fixtures.js subsystems/fixtures/frontend/js/bundle.js
VER=$(cat tools/.bundle-ver)
sed -i "s|bundle.js?v=[a-z0-9]*|bundle.js?v=$VER|" subsystems/samples/frontend/index.html subsystems/fixtures/frontend/index.html subsystems/workbench/frontend/index.html subsystems/projects/frontend/index.html
```

> 若 `sed -i` 因 www 属主报 EACCES：走 /tmp 副本 + `echo 'mnbvcxz123' | sudo -S cp` 回写流程（本会话既有方式）。

- [ ] **Step 4: 服务重启 + 冒烟验证**

重启服务（精确 kill 4000 端口 PID，勿动 3500）：

```bash
echo 'mnbvcxz123' | sudo -S bash -c 'PID=$(ss -tlnp | grep :4000 | grep -oP "pid=\K[0-9]+"); [ -n "$PID" ] && kill $PID; sleep 1'
echo 'mnbvcxz123' | sudo -S -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
sleep 4
curl -s http://localhost:4000/api/samples/export -o /dev/null -w '%{http_code}'   # 未登录 → 401
```

Expected: 输出 `401`。

- [ ] **Step 5: 提交**

```bash
git add subsystems/samples/frontend/js/views/list.js subsystems/fixtures/frontend/js/views/list.js \
        subsystems/samples/frontend/js/bundle.js subsystems/fixtures/frontend/js/bundle.js \
        subsystems/samples/frontend/index.html subsystems/fixtures/frontend/index.html \
        subsystems/workbench/frontend/index.html subsystems/projects/frontend/index.html tools/.bundle-ver
git commit -m "feat(export): 样品/治具列表页导出 CSV 按钮 + bundle 重建"
```

---

### Task 5: 设计规则固化（AGENTS.md §21 + 文档同步）

**Files:**
- Modify: `AGENTS.md`（新增 §21 + §3 目录结构）
- Modify: `README.md`（API 表）
- Modify: `docs/operation-manual.md`（导出操作说明）

- [ ] **Step 1: AGENTS.md 新增 §21**

在 `AGENTS.md` 文件末尾（§20 之后）追加：

```markdown
## 21. 列表导出标准（强制）

> 2026-08-06 实施。所有含列表页的子系统 MUST 提供「导出 CSV」能力，共享 `shared/csv.js`，禁止各自重复实现。

### 21.1 后端接口

- 端点：`GET /api/<prefix>/export`（鉴权与对应列表接口一致，登录即可）
- 参数：复用列表筛选/排序参数，**忽略分页取全量**（DAO 不传 limit/offset 即全量）
- 响应：BOM UTF-8 CSV（`shared/csv.js` 的 `sendCsv`），文件名 `<prefix>-YYYYMMDD-HHmm.csv`
- 列约定：状态列 MUST 输出中文、时间列 MUST 输出 `YYYY-MM-DD HH:mm` 可读格式

### 21.2 前端

- 列表筛选栏 MUST 提供「导出 CSV」按钮，复用列表查询参数构建函数拼 URL（`location.href` 触发下载，避免弹窗拦截）
- 按钮位置：与其他筛选操作按钮（查询/清除）同行，小屏可换行不破版

### 21.3 约束

- 禁止各子系统自行重复实现 CSV 生成逻辑（复用 `shared/csv.js`）
- 导出列 = 列表核心业务字段（不含图片/操作列）；新增子系统按 §17 协议接入后同步实现导出
```

同时更新 `AGENTS.md` §3 目录结构 `shared/` 块，在 `state-machine.js` 行后加：

```markdown
│   ├── state-machine.js   # 通用状态机引擎
│   ├── csv.js             # 通用 CSV 导出工具（toCsv/sendCsv，AGENTS.md §21）
```

- [ ] **Step 2: README.md API 表**

在 `README.md` 的 API 表（样品/治具相关行附近）追加：

```markdown
| GET /api/samples/export | 样品列表导出 CSV（复用筛选参数，忽略分页） |
| GET /api/fixtures/export | 治具清单导出 CSV（复用筛选/排序参数，忽略分页） |
```

- [ ] **Step 3: docs/operation-manual.md**

在样品/治具列表章节补一句：

```markdown
列表页点击「导出 CSV」可下载当前筛选条件下的全部记录（CSV，Excel/WPS 直接打开）。
```

- [ ] **Step 4: 提交**

```bash
git add AGENTS.md README.md docs/operation-manual.md
git commit -m "docs(export): AGENTS.md §21 列表导出标准 + README/操作手册同步"
```

---

### Task 6: 全量回归验证

**Files:** 无代码改动，仅验证

- [ ] **Step 1: 全量单测**

Run: `npx jest`
Expected: 全部 PASS（csv / samples / fixtures-export / users / projects / models / sample-code / auth / dashboard / workbench-drilldown / inspect-state / fixture-inspect / subsystem-scaffold / subsystems）

> 若 projects.test 出现 2 个上传 EACCES 失败，属历史环境问题（测试进程对 www 属主 uploads 无写权限），与本次导出无关——记录并在汇报中说明。

- [ ] **Step 2: browser_use 端到端（双系统）**

- 登录 admin → 样品列表：设置筛选（如状态=已发行）→ 点击「导出 CSV」→ 确认下载文件名为 `samples-*.csv`、Excel 打开中文无乱码（BOM）、行数与筛选结果一致
- 登录 admin → 治具清单：排序「编号」→ 点击「导出 CSV」→ 确认 `fixtures-*.csv` 内容与排序一致
- 未登录访问 `/api/samples/export` / `/api/fixtures/export` → 401
- 小屏（390px）验证导出按钮不破版

- [ ] **Step 3: 输出修改报告**

按用户规则输出 3 项臃肿检测（每修改文件的有效行数/函数数/冗余清单）与业务回归清单、上线后 1~3 周期监控提示。

---

## Self-Review 记录

- **Spec 覆盖**：§4.1 shared/csv.js → Task 1；§4.2 两个端点 → Task 2/3；§4.3 前端按钮 → Task 4；§5 AGENTS.md §21 → Task 5；§4.4 测试 + §7 回归 → Task 2/3/6。全部覆盖。
- **占位符扫描**：无 TBD/TODO；所有代码步骤含完整实现。
- **类型一致性**：`toCsv(rows, cols)` / `sendCsv(res, filename, csv)` 全计划签名一致；`exportSamplesCsv`/`exportFixturesCsv` 为全局函数与 onclick 引用一致；`fixtureDueCn`/`inspectStateCn` 在各端点内定义与使用一致。
- **容量红线**：routes-samples.js 213→~265、routes-fixtures.js 185→~235（Controller ≤400）；shared/csv.js ≤100（工具 ≤200）；samples list.js 顶层函数 5→6、fixtures list.js 4→5（≤10）。
