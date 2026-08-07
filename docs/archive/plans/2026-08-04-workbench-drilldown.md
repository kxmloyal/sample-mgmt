# 全局工作台信息下钻 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 点击全局工作台表格行 → 弹出详情弹窗，展示基本信息 + 完整流转日志时间线，并提供跳转对应子系统扫码台的入口。

**Architecture:** 后端 workbench UNION 查询补 `id` 字段 → 前端新增 `wb-detail.js` 视图（调既有详情 API + 共享 `openModal` 渲染）→ `dashboard.js` 行加 onclick 绑定 → 重建 bundle 部署。全链路零表结构变更、零接口破坏。

**Tech Stack:** Node.js / Express / MariaDB / 原生 HTML+JS（无框架）/ 共享 modal.js

**前置设计文档:** `docs/superpowers/specs/2026-08-04-workbench-drilldown-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `subsystems/workbench/db/workbench-queries.js` | 修改 | UNION 两分支各加 `id` 字段 |
| `subsystems/workbench/frontend/js/views/wb-detail.js` | 新建 | 下钻弹窗：拉详情 API + 渲染基本信息/时间线 + 跳转按钮 |
| `subsystems/workbench/frontend/js/views/dashboard.js` | 修改 | 表格行绑定 `onclick="openWbDetail(...)"` |
| `tools/bundle-sources.json` | 修改 | workbench 列表追加 wb-detail.js（放在 dashboard.js 之后、threshold.js 之前） |
| `subsystems/workbench/frontend/js/bundle.js` | 重建 | 构建产物 |
| `subsystems/workbench/frontend/index.html` | 修改 | bundle 版本号 |
| `tests/workbench-drilldown.test.js` | 新建 | 后端 SQL id 字段回归 |

---

## Task 1: 后端 workbench 查询补 id 字段

**Files:**
- Modify: `subsystems/workbench/db/workbench-queries.js:5-101`
- Test: `tests/workbench-drilldown.test.js`

- [ ] **Step 1: 写失败测试**

创建 `tests/workbench-drilldown.test.js`：

```js
// tests/workbench-drilldown.test.js — 工作台下钻：id 字段回归
const { unifiedWorkbenchSQL } = require('../subsystems/workbench/db/workbench-queries');

describe('workbench drilldown', () => {
  test('UNION 两分支均包含 id 字段', () => {
    // 样品分支：s.id AS id
    expect(unifiedWorkbenchSQL).toMatch(/s\.id AS id/);
    // 治具分支：f.id AS id
    expect(unifiedWorkbenchSQL).toMatch(/f\.id AS id/);
  });

  test('id 字段位置在首列，不破坏既有字段', () => {
    const sampleIdx = unifiedWorkbenchSQL.indexOf('s.id AS id');
    const itemNoIdx = unifiedWorkbenchSQL.indexOf('s.sample_no AS item_no');
    const fixtureIdx = unifiedWorkbenchSQL.indexOf('f.id AS id');
    const fItemNoIdx = unifiedWorkbenchSQL.indexOf('f.fixture_no AS item_no');
    expect(sampleIdx).toBeGreaterThan(-1);
    expect(itemNoIdx).toBeGreaterThan(-1);
    expect(fixtureIdx).toBeGreaterThan(-1);
    expect(fItemNoIdx).toBeGreaterThan(-1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx jest tests/workbench-drilldown.test.js 2>&1 | tail -20
```
预期：`FAIL`，`toMatch(/s\.id AS id/)` 断言失败（当前 SQL 无 id 字段）。

- [ ] **Step 3: 修改 workbench-queries.js 加 id 字段**

在 `unifiedWorkbenchSQL` 的 UNION 两个分支各插入一行：

样品分支（当前第 7 行 `s.sample_no AS item_no,` 之前）插入：
```sql
    s.id AS id,
    s.sample_no AS item_no,
```

治具分支（当前第 51 行 `f.fixture_no AS item_no,` 之前）插入：
```sql
    f.id AS id,
    f.fixture_no AS item_no,
```

用 Edit 工具精确替换：

```js
    s.sample_no AS item_no,
    s.name,
```
→
```js
    s.id AS id,
    s.sample_no AS item_no,
    s.name,
```

以及

```js
    f.fixture_no AS item_no,
    f.name,
```
→
```js
    f.id AS id,
    f.fixture_no AS item_no,
    f.name,
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx jest tests/workbench-drilldown.test.js 2>&1 | tail -20
```
预期：`PASS`，2 个用例全部通过。

- [ ] **Step 5: 提交**

```bash
git add subsystems/workbench/db/workbench-queries.js tests/workbench-drilldown.test.js
git commit -m "feat(workbench): add id field to workbench query for drilldown"
```

---

## Task 2: 新建 wb-detail.js 下钻视图

**Files:**
- Create: `subsystems/workbench/frontend/js/views/wb-detail.js`

前置依赖（均在现有 bundle 中，无需新增）：
- `openModal(title, html, opts)` / `closeModal(mask)` — shared/frontend/modal.js
- `api(method, url, body)` — shared/frontend/api-base.js
- `ACTION_CN` / `STATUS` / `ROLE` — shared/frontend/api-base.js
- `e()` — shared/frontend/shared/utils.js

- [ ] **Step 1: 创建 wb-detail.js**

```js
// subsystems/workbench/frontend/js/views/wb-detail.js
// 工作台下钻：点击表格行 → 弹窗展示基本信息 + 完整流转日志时间线
// 依赖：openModal/closeModal（modal.js）、api()（api-base.js）、ACTION_CN、e()
// 详情数据来自子系统既有接口：样品 /api/samples/:id（含 logs）、治具 /api/fixtures/:id + /api/fixtures/:id/logs

// 各类型关键时间点字段（按存在性展示）
var _KEY_DATES = {
  sample: [
    { k: 'created_at', l: '创建时间' },
    { k: 'released_at', l: '发行时间' },
    { k: 'next_inspect_at', l: '下次复检' },
    { k: 'updated_at', l: '最后更新' }
  ],
  fixture: [
    { k: 'created_at', l: '创建时间' },
    { k: 'expected_finish_at', l: '预计完成' },
    { k: 'transferred_at', l: '移交时间' },
    { k: 'used_at', l: '领用时间' },
    { k: 'next_maintenance_at', l: '下次保养' },
    { k: 'repair_requested_at', l: '报修时间' }
  ]
};

// 入口：按类型分派详情 API，成功后渲染弹窗
async function openWbDetail(item) {
  if (!item || !item.id) {
    return openModal('详细信息', '<div style="padding:20px;color:var(--bad)">数据版本过旧，缺少 id，请刷新页面后重试</div>');
  }
  try {
    var detail, logs;
    if (item.item_type === 'sample') {
      detail = await api('GET', '/api/samples/' + item.id);
      logs = detail.logs || [];
      delete detail.logs; // 与治具结构对齐，统一传 logs 参数
    } else {
      detail = await api('GET', '/api/fixtures/' + item.id);
      logs = await api('GET', '/api/fixtures/' + item.id + '/logs');
    }
    _renderWbDetail(detail, logs, item);
  } catch (err) {
    openModal('详细信息', '<div style="padding:20px">' +
      '<div style="color:var(--bad);margin-bottom:12px">加载失败：' + e(err.message) + '</div>' +
      '<fluent-button appearance="accent" size="small" onclick="closeModal(this.closest(\'.modal-mask\'));openWbDetail(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')">重试</fluent-button>' +
      '</div>');
  }
}

// 组装弹窗 HTML：基本信息区 + 时间线
function _renderWbDetail(detail, logs, item) {
  var typeLabel = item.item_type === 'sample' ? '样品' : '治具';
  var stageLabel = STATUS[detail.status] || detail.status || '-';
  var html = '<div class="wb-detail-info">' +
    _kv('编号', detail.sample_no || detail.fixture_no || item.item_no) +
    _kv('名称', detail.name) +
    _kv('类型', typeLabel) +
    _kv('阶段', stageLabel) +
    _kv('规格', detail.spec) +
    _kv('型号', detail.model) +
    _kv('负责部门', item.resp_dept) +
    _kv('申请部门', item.apply_dept) +
    _keyDates(detail, item.item_type) +
    '</div>' +
    '<h4 class="wb-detail-tl-title">流转日志</h4>' +
    _renderTimeline(logs, item);

  var foot = '<div style="display:flex;gap:8px">' +
    '<fluent-button appearance="accent" size="small" onclick="' + _openWbScanJs(item) + '">前往处理 →</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>' +
    '</div>';

  openModal('详细信息 · ' + (detail.sample_no || detail.fixture_no || item.item_no), html, { foot: foot });
}

// 键值行
function _kv(k, v) {
  if (v === null || v === undefined || v === '') return '';
  return '<div class="wb-detail-kv"><span class="wb-detail-k">' + k + '</span><span class="wb-detail-v">' + e(String(v)) + '</span></div>';
}

// 关键时间点区（按类型字段，存在才显示）
function _keyDates(detail, type) {
  var list = _KEY_DATES[type] || [];
  var html = '';
  list.forEach(function(f) {
    if (detail[f.k]) html += _kv(f.l, String(detail[f.k]).slice(0, 16).replace('T', ' '));
  });
  return html;
}

// 流转日志时间线（按时间倒序，数据已按 id DESC 排序）
function _renderTimeline(logs, item) {
  if (!logs || !logs.length) {
    return '<div class="wb-detail-empty">暂无流转记录</div>';
  }
  var html = '<div class="wb-timeline">';
  logs.forEach(function(l) {
    var action = ACTION_CN[l.action] || l.action || '-';
    var who = l.display_name || l.username || (ROLE[l.role] || l.role || '') + (l.dept ? ' · ' + l.dept : '');
    var time = l.created_at ? String(l.created_at).slice(0, 16).replace('T', ' ') : '';
    var note = l.note ? '<div class="wb-tl-note">' + e(l.note) + '</div>' : '';
    html += '<div class="wb-tl-item">' +
      '<span class="wb-tl-dot"></span>' +
      '<div class="wb-tl-body">' +
        '<div class="wb-tl-head"><span class="wb-tl-action">' + e(action) + '</span><span class="wb-tl-time">' + time + '</span></div>' +
        '<div class="wb-tl-who">' + e(who) + '</div>' +
        note +
      '</div>' +
      '</div>';
  });
  return html + '</div>';
}

// 跳转按钮 onclick 表达式（内联 JSON 转义，防止引号破坏 onclick）
function _openWbScanJs(item) {
  var entry = item.item_type === 'sample'
    ? '/subsystems/samples/frontend/index.html'
    : '/subsystems/fixtures/frontend/index.html';
  var no = item.item_no || '';
  return "window.open('" + entry + "#/scan?no=" + no + "','_blank')";
}
```

- [ ] **Step 2: 校验语法**

```bash
node --check subsystems/workbench/frontend/js/views/wb-detail.js && echo 'SYNTAX OK'
```
预期输出：`SYNTAX OK`

- [ ] **Step 3: 提交**

```bash
git add subsystems/workbench/frontend/js/views/wb-detail.js
git commit -m "feat(workbench): add drilldown detail modal view"
```

---

## Task 3: dashboard.js 表格行绑定下钻

**Files:**
- Modify: `subsystems/workbench/frontend/js/views/dashboard.js:140-151`（renderItemTable 行渲染）

- [ ] **Step 1: 修改行渲染绑定 onclick**

将 `renderItemTable` 中的行模板（当前 `return '<tr class="wb-row" ...>' + ...`）改为在 `<tr>` 上绑定 onclick。用 Edit 替换：

```js
    return '<tr class="wb-row" data-type="' + item.item_type + '" data-level="' + item.overdue_level + '" data-dept="' + item.resp_dept + '">' +
```
→
```js
    return '<tr class="wb-row" data-type="' + item.item_type + '" data-level="' + item.overdue_level + '" data-dept="' + item.resp_dept + '" style="cursor:pointer" onclick="openWbDetail(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')">' +
```

- [ ] **Step 2: 校验语法 + 单测筛选逻辑不受影响**

```bash
node --check subsystems/workbench/frontend/js/views/dashboard.js && echo 'SYNTAX OK'
npx jest tests/workbench-drilldown.test.js 2>&1 | tail -5
```
预期：`SYNTAX OK` + 既有测试通过。

- [ ] **Step 3: 提交**

```bash
git add subsystems/workbench/frontend/js/views/dashboard.js
git commit -m "feat(workbench): bind row click to drilldown modal"
```

---

## Task 4: 注册 wb-detail.js 到 bundle-sources 并重建 bundle

**Files:**
- Modify: `tools/bundle-sources.json`（workbench 数组）
- Rebuild: `subsystems/workbench/frontend/js/bundle.js`
- Modify: `subsystems/workbench/frontend/index.html`（版本号）

- [ ] **Step 1: bundle-sources.json 追加 wb-detail.js**

在 `tools/bundle-sources.json` 的 workbench 数组中，将：
```json
"subsystems/workbench/frontend/js/views/dashboard.js",
"subsystems/workbench/frontend/js/views/threshold.js",
```
改为：
```json
"subsystems/workbench/frontend/js/views/dashboard.js",
"subsystems/workbench/frontend/js/views/wb-detail.js",
"subsystems/workbench/frontend/js/views/threshold.js",
```

- [ ] **Step 2: 重建 bundle**

```bash
node tools/build-bundles.js
```
预期输出（末尾）：
```
Done. VER=bXXXXXX
```
记录 `VER` 值。

- [ ] **Step 3: 复制 bundle 到子系统目录 + 更新版本号**

```bash
sudo cp /tmp/bundle-workbench.js subsystems/workbench/frontend/js/bundle.js
# 用 build 输出的 VER 更新 index.html 版本号
grep -o 'bundle.js?v=[^"]*' subsystems/workbench/frontend/index.html
# 用 Edit 将 index.html 中 bundle.js?v=旧值 替换为 bundle.js?v=<新VER>
```

- [ ] **Step 4: 验证 bundle 含新视图 + index.html 版本更新**

```bash
grep -c 'openWbDetail' subsystems/workbench/frontend/js/bundle.js
grep -o 'bundle.js?v=[^"]*' subsystems/workbench/frontend/index.html
```
预期：`openWbDetail` 出现（≥1 处），版本号为新 VER。

- [ ] **Step 5: 提交**

```bash
git add tools/bundle-sources.json subsystems/workbench/frontend/js/bundle.js subsystems/workbench/frontend/index.html
git commit -m "build(workbench): rebuild bundle with drilldown view"
```

---

## Task 5: 部署 + 端到端验证

**Files:** 无新增（重启服务 + curl 验证）

- [ ] **Step 1: 重启后端服务**

```bash
sudo kill $(ps aux | grep 'www.*node.*server.js' | grep -v grep | awk '{print $2}')
sleep 1
sudo -u www bash -c 'cd /www/wwwroot/sample-mgmt && nohup node server.js > /dev/null 2>&1 &'
sleep 3
```

- [ ] **Step 2: 验证工作台 API 返回 id 字段**

```bash
curl -s -c /tmp/cj.txt -X POST http://127.0.0.1:4000/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' > /dev/null
curl -s -b /tmp/cj.txt 'http://127.0.0.1:4000/api/workbench?limit=2' | python3 -c "import sys,json; d=json.load(sys.stdin); [print(i['item_type'], i['item_no'], 'id=', i.get('id')) for i in d['items']]"
```
预期：每行末尾显示非空 id（如 `sample SM-000001 id= 12`）。

- [ ] **Step 3: 验证详情 API 可被下钻复用**

```bash
# 取第一个样品 id 与第一个治具 id 分别请求详情
curl -s -b /tmp/cj.txt http://127.0.0.1:4000/api/samples/12 | python3 -c "import sys,json; d=json.load(sys.stdin); print('sample detail ok, logs=', len(d.get('logs',[])))"
curl -s -b /tmp/cj.txt http://127.0.0.1:4000/api/fixtures/3/logs | python3 -c "import sys,json; d=json.load(sys.stdin); print('fixture logs ok, count=', len(d))"
```
预期：均返回正常 JSON，logs 计数 ≥0。

- [ ] **Step 4: 提交（如有残留变更）**

```bash
git status --short
# 若 index.html 版本号有未提交变更则补齐提交
```

---

## 自审记录（实现后填写）

- [ ] Spec 覆盖：Task1 覆盖「后端补 id」；Task2 覆盖「基本信息+时间线+跳转按钮」；Task3 覆盖「行点击」；Task5 覆盖「测试/回归」
- [ ] 无占位符：全部步骤含完整代码/命令/预期输出
- [ ] 类型一致：`openWbDetail(item)` / `_renderWbDetail(detail, logs, item)` / `_renderTimeline(logs, item)` / `_openWbScanJs(item)` / `_kv(k,v)` / `_keyDates(detail,type)` 名称在 Task2 定义与 Task3 引用处一致
- [ ] 错误处理覆盖：404（openWbDetail catch 分支）、空日志（_renderTimeline 空态）、无 id（openWbDetail 顶部守卫）、失败重试（catch 内重试按钮）

## 回归验证清单

- [ ] 工作台列表正常渲染（id 新增不影响既有列）
- [ ] 点击样品行弹窗显示基本信息 + 时间线
- [ ] 点击治具行弹窗同上
- [ ] 时间线按 id DESC（即时间倒序）
- [ ] 跳转按钮打开对应子系统扫码台（带 no 参数）
- [ ] 筛选/部门卡/编号连续逻辑不受影响（onclick 不改变 doFilter）
- [ ] 样品/治具子系统回归：`curl /api/samples/:id`、`/api/fixtures/:id` 正常
