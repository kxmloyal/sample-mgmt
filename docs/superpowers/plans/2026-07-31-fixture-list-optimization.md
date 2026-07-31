# 治具清单页面优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 治具清单页（fixture.html#/list）三阶段优化：交互体感 → 性能分页 → 功能对齐样品清单

**Architecture:** 后端 API 响应从数组改为 `{fixtures,total}` 分页格式；前端新增操作列、分页控件、排序表头、缩略图、响应式布局、代码拆分为 fixture-list.js + fixture-new.js

**Tech Stack:** Node.js + Express + MariaDB(mysql2) + 原生 HTML/CSS/JS

---

**Phase 1: 交互体验**

### Task 1: 加载指示器

**Files:**
- Modify: `public/js/fixture-list.js:9-13`

- [ ] **Step 1: 在 renderFixtureList 开头注入 loading**

将 `renderFixtureList` 函数的 try 块开头改为：

```js
async function renderFixtureList() {
  try {
    document.getElementById('view').innerHTML = '<div class="loading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>';
    var params = new URLSearchParams(fixtureListState).toString();
    // ... 后续代码不变
```

- [ ] **Step 2: 验证语法**

Run: `node -c public/js/fixture-list.js`
Expected: no output (pass)

---

### Task 2: 操作列 + 代码清理

**Files:**
- Modify: `public/js/fixture-list.js:4-7,53-57,67-75`

- [ ] **Step 1: 删除未使用的 clearFixtureFilter 函数**

删除第 4-7 行：
```js
function clearFixtureFilter(key) {
  fixtureListState[key] = '';
  renderFixtureList();
}
```

- [ ] **Step 2: 表头新增「操作」列 + 每行增加详情链接**

修改第 53 行表头和第 54-57 行行渲染：

表头改为（在原 `<th>更新时间</th>` 后追加）：
```js
html += '<table><thead><tr><th>#</th><th>编号</th><th>名称</th><th>规格</th><th>部门</th><th>储位</th><th>图片</th><th>状态</th><th>更新时间</th><th>操作</th></tr></thead><tbody>';
```

行渲染的 `html +=` 在 `</tr>` 前追加操作列：
```js
html += '<tr' + cls + ' style="cursor:pointer" onclick="showFixtureDetail(' + f.id + ')"><td class="muted">' + (i + 1) + '</td><td><b>' + fixtureNoVersion(f) + '</b></td><td>' + e(f.name || '—') + '</td><td>' + e(f.spec || '—') + '</td><td>' + e(f.requested_dept || '—') + '</td><td class="muted">' + e(f.storage_location || '—') + '</td><td>' + photoHtml + '</td><td>' + statusBadge(f) + '</td><td><small>' + fmt(f.updated_at) + '</small></td><td><a class="link" onclick="event.stopPropagation();showFixtureDetail(' + f.id + ')">详情</a></td></tr>';
```

**注意：** 操作列中「详情」链接使用 `event.stopPropagation()` 防止触发行点击事件（行已绑定 `onclick="showFixtureDetail(...)"`）。标签打印/QR下载为后续独立功能，本次仅保留详情入口。

- [ ] **Step 3: 验证语法**

Run: `node -c public/js/fixture-list.js`
Expected: no output (pass)

---

### Task 3: 关闭空状态提示优化

**Files:**
- Modify: `public/js/fixture-list.js:51`

- [ ] **Step 1: 筛选无结果时给出明确提示**

修改第 51 行空状态判断：

```js
if (fixtures.length === 0) {
  var hasFilter = fixtureListState.status || fixtureListState.dept || fixtureListState.search;
  html += '<div class="hint">' + (hasFilter ? '未找到匹配的治具，请调整筛选条件' : '暂无治具数据') + '</div>';
}
```

- [ ] **Step 2: 验证语法**

Run: `node -c public/js/fixture-list.js`
Expected: no output (pass)

---

**Phase 2: 性能分页**

### Task 4: 后端 countAllFixtures + 排序支持

**Files:**
- Modify: `db/fixtures.js` (在 listFixtures 附近新增函数)
- Modify: `db/fixtures.js` (listFixtures 增加 sort/dir 参数)

- [ ] **Step 1: 新增 countAllFixtures 函数**

在 `listFixtures` 函数之后（约第 42 行后），新增函数，复用相同的 WHERE 构建逻辑但使用 COUNT(*)：

```js
function countAllFixtures({ status, dept, search, overdue } = {}) {
  var where = [], params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (dept) { where.push('requested_dept LIKE ?'); params.push('%' + dept + '%'); }
  if (search) { where.push('(fixture_no LIKE ? OR name LIKE ? OR spec LIKE ? OR model LIKE ?)');
    var kw = '%' + search + '%';
    params.push(kw, kw, kw, kw);
  }
  if (overdue === '1') { where.push('expected_return_at < NOW() AND status = ?'); params.push('IN_USE'); }
  var sql = 'SELECT COUNT(*) as total FROM fixtures';
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' AND retired_at IS NULL';
  return q(sql, params).then(function(rows) { return rows[0].total; });
}
```

- [ ] **Step 2: listFixtures 增加排序参数**

修改 `listFixtures` 签名和函数体，在 LIMIT 行之前添加排序逻辑：

```js
function listFixtures({ status, dept, search, overdue, sort, dir, limit = 100, offset = 0 } = {}) {
  var where = [], params = [];
  // ... 现有 WHERE 构建代码不变 ...

  var sql = 'SELECT * FROM fixtures';
  if (where.length) sql += ' WHERE ' + where.join(' AND ') + ' AND retired_at IS NULL';
  else sql += ' WHERE retired_at IS NULL';

  // 排序（白名单防注入）
  var ALLOWED_SORT = { fixture_no: 'fixture_no', name: 'name', updated_at: 'updated_at' };
  var sortCol = ALLOWED_SORT[sort] || 'id';
  var sortDir = (dir === 'asc' || dir === 'ASC') ? 'ASC' : 'DESC';
  sql += ' ORDER BY ' + sortCol + ' ' + sortDir;

  if (limit != null) { sql += ' LIMIT ' + parseInt(limit, 10); }
  if (offset != null) { sql += ' OFFSET ' + parseInt(offset, 10); }
  return q(sql, params);
}
```

- [ ] **Step 3: 导出 countAllFixtures**

修改 `db/fixtures.js:111` return 对象，追加 `countAllFixtures`：

找到 `return { nextFixtureNo, createFixture, ... getFixturePhotoCounts };` 这一行，追加 `countAllFixtures` 到最后。

- [ ] **Step 4: 验证语法**

Run: `node -c db/fixtures.js`
Expected: no output (pass)

---

### Task 5: 后端清单 API 重构（分页响应格式）

**Files:**
- Modify: `routes/fixtures.js:29-39`

- [ ] **Step 1: 改为分页响应格式 + 保养筛选**

将 GET `/api/fixtures` handler 改为：

```js
app.get('/api/fixtures', requireAuth, async function(req, res) {
  var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search, overdue = _a.overdue,
      sort = _a.sort, dir = _a.dir, limit = parseInt(_a.limit) || 20, offset = parseInt(_a.offset) || 0,
      maint = _a.maint;
  // 保养筛选 → 转为 overdue 逻辑
  var maintOverdue = null;
  if (maint === 'overdue') maintOverdue = '1'; // 逾期未保养
  else if (maint === 'upcoming') maintOverdue = null; // 7日内到期：需特殊查询
  // 暂仅支持 overdue 保养筛选，upcoming 筛选用后端过滤

  var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, sort: sort, dir: dir, limit: limit, offset: offset });
  var total = await D.countAllFixtures({ status: status, dept: dept, search: search, overdue: overdue });

  // 批量附加图片数量
  var ids = fixtures.map(function(f) { return f.id; });
  if (ids.length) {
    var rows = await D.getFixturePhotoCounts(ids);
    var map = {}; rows.forEach(function(r) { map[r.fixture_id] = r.cnt; });
    fixtures.forEach(function(f) { f.photo_count = map[f.id] || 0; });
  }

  res.json({ fixtures: fixtures, total: total, limit: limit, offset: offset });
});
```

- [ ] **Step 2: 验证语法**

Run: `node -c routes/fixtures.js`
Expected: no output (pass)

---

### Task 6: 前端分页控件

**Files:**
- Modify: `public/js/fixture-list.js` (renderFixtureList 函数)

- [ ] **Step 1: 添加分页状态变量**

在文件第 2 行 `fixtureListState` 后添加：

```js
var fixtureListPager = { limit: 20, offset: 0, total: 0 };
```

- [ ] **Step 2: 修改 renderFixtureList 适配新响应格式**

替换 renderFixtureList 函数中从 API 调用到表格渲染部分：

```js
async function renderFixtureList() {
  try {
    document.getElementById('view').innerHTML = '<div class="loading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>';
    var p = fixtureListPager;
    fixtureListState.limit = String(p.limit);
    fixtureListState.offset = String(p.offset);
    var params = new URLSearchParams(fixtureListState).toString();
    var data = await api('GET', '/api/fixtures?' + params);
    var fixtures = data.fixtures;
    p.total = data.total;
    var html = '';

    // 筛选栏 ... (保持现有代码不变)

    // 表格头部显示总数
    html += '<div class="card" style="padding:0">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">';
    html += '<span style="font-weight:600;font-size:14px">全部治具 (<b>' + p.total + '</b>)</span>';
    html += '</div>';

    if (fixtures.length === 0) {
      var hasFilter = fixtureListState.status || fixtureListState.dept || fixtureListState.search;
      html += '<div class="hint">' + (hasFilter ? '未找到匹配的治具，请调整筛选条件' : '暂无治具数据') + '</div>';
    } else {
      // 表格表头+行 ... (保持现有代码不变)
    }
    html += '</div>';

    // 分页控件
    var totalPages = Math.ceil(p.total / p.limit);
    var currentPage = Math.floor(p.offset / p.limit) + 1;
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html += '<button class="btn sm" ' + (p.offset === 0 ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage - 1) + ')">← 上一页</button>';
    html += '<span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + p.total + '</b> 条</span>';
    html += '<button class="btn sm" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage + 1) + ')">下一页 →</button>';
    html += '</div>';

    document.getElementById('view').innerHTML = html;
  } catch (e) { document.getElementById('view').innerHTML = '<div class="hint">加载失败：' + e.message + '</div>'; }
}
```

- [ ] **Step 3: 新增 goFixturePage 函数**

在文件末尾添加：

```js
function goFixturePage(page) {
  fixtureListPager.offset = (page - 1) * fixtureListPager.limit;
  renderFixtureList();
}
```

- [ ] **Step 4: 筛选变更时重置到第 1 页**

修改 `renderFixtureList` 调用点。在 `fixture-router.js` 的 `list` handler 中保持不变。但在 `clearFilterChip` 和 `clearAllFilters` 中需要重置 offset：

```js
function clearFilterChip(idx) {
  // ... 现有逻辑 ...
  fixtureListPager.offset = 0;  // 添加到 keys 处理之后、renderFixtureList 之前
  renderFixtureList();
}

function clearAllFilters() {
  fixtureListState = { status: '', dept: '', search: '' };
  fixtureListPager.offset = 0;
  renderFixtureList();
}
```

- [ ] **Step 5: 验证语法**

Run: `node -c public/js/fixture-list.js`
Expected: no output (pass)

---

**Phase 3: 功能对齐**

### Task 7: 表头排序

**Files:**
- Modify: `public/js/fixture-list.js:53` (表头渲染)

- [ ] **Step 1: 表头改为可点击排序链接**

修改表头行，将 `<th>` 替换为可点击版本：

```js
var sortCol = fixtureListState.sort || 'id';
var sortDir = fixtureListState.dir || 'desc';
function th(label, field) {
  var arrow = '';
  if (sortCol === field) arrow = sortDir === 'asc' ? ' ▲' : ' ▼';
  return '<th style="cursor:pointer;white-space:nowrap" onclick="toggleFixtureSort(\'' + field + '\')">' + label + '<span style="font-size:10px">' + arrow + '</span></th>';
}
html += '<table><thead><tr><th>#</th>' + th('编号', 'fixture_no') + th('名称', 'name') + '<th>规格</th><th>部门</th><th>储位</th><th>图片</th><th>状态</th>' + th('更新时间', 'updated_at') + '<th>操作</th></tr></thead><tbody>';
```

- [ ] **Step 2: 新增 toggleFixtureSort 函数**

在文件末尾添加：

```js
function toggleFixtureSort(field) {
  if (fixtureListState.sort === field) {
    fixtureListState.dir = fixtureListState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    fixtureListState.sort = field;
    fixtureListState.dir = 'asc';
  }
  fixtureListPager.offset = 0;
  renderFixtureList();
}
```

**注意：** 排序仅针对 `fixture_no`、`name`、`updated_at` 三列可点击。其他列（规格、部门、储位、图片、状态）保持纯文本表头，不添加点击事件。

- [ ] **Step 3: 验证语法**

Run: `node -c public/js/fixture-list.js`
Expected: no output (pass)

---

### Task 8: 图片缩略图展示

**Files:**
- Modify: `db/fixtures.js` (新增函数)
- Modify: `routes/fixtures.js:29-39` (GET handler)
- Modify: `public/js/fixture-list.js:56` (photoHtml 行)

- [ ] **Step 1: 新增 getFirstPhotoMap 批量查询**

在 `db/fixtures.js` 的 `getFixturePhotoCounts` 之后新增：

```js
// 批量查询每个治具的首张实物照片路径
async function getFirstPhotoMap(ids) {
  if (!ids || !ids.length) return {};
  var sql = 'SELECT ff.fixture_id, ff.file_path FROM fixture_files ff INNER JOIN (SELECT fixture_id, MIN(id) as min_id FROM fixture_files WHERE fixture_id IN (' + ids.join(',') + ') AND category IN (?,?,?) GROUP BY fixture_id) sub ON ff.id = sub.min_id';
  var rows = await q(sql, ['fixture_photo', 'maintenance_photo', 'site_photo']);
  var map = {};
  rows.forEach(function(r) { map[r.fixture_id] = r.file_path; });
  return map;
}
```

- [ ] **Step 2: 导出 getFirstPhotoMap**

在 return 对象末尾添加 `getFirstPhotoMap`。

- [ ] **Step 3: 后端 GET handler 附加 first_photo**

在 `routes/fixtures.js` 的 GET handler 中，图片计数之后添加：

```js
var photoMap = await D.getFirstPhotoMap(ids);
fixtures.forEach(function(f) { f.first_photo = photoMap[f.id] || null; });
```

- [ ] **Step 4: 前端缩略图渲染**

修改 `fixture-list.js:56` 的 photoHtml 行：

```js
var photoHtml;
if (f.first_photo) {
  photoHtml = '<img src="' + f.first_photo + '" width="32" height="32" style="object-fit:cover;border-radius:4px" onerror="this.style.display=\'none\'" />';
  if (f.photo_count > 1) photoHtml += ' <small class="muted">+' + (f.photo_count - 1) + '</small>';
} else {
  photoHtml = '<span class="muted">—</span>';
}
```

- [ ] **Step 5: 验证语法**

Run: `node -c db/fixtures.js && node -c routes/fixtures.js && node -c public/js/fixture-list.js`
Expected: no output (pass)

---

### Task 9: 响应式表格（移动端卡片布局）

**Files:**
- Modify: `public/css/app.css` (新增响应式规则)

- [ ] **Step 1: 在 app.css 末尾新增响应式规则**

```css
@media(max-width:767px){
  .fx-list-table thead{display:none}
  .fx-list-table,.fx-list-table tbody,.fx-list-table tr,.fx-list-table td{display:block}
  .fx-list-table tr{border-bottom:1px solid var(--line);padding:8px;cursor:pointer}
  .fx-list-table td{padding:2px 0;text-align:left}
  .fx-list-table td:before{content:attr(data-label);font-size:11px;color:var(--muted);display:block;margin-bottom:2px}
}
```

- [ ] **Step 2: 给表格和单元格添加 class 和 data-label**

修改 `fixture-list.js:53-57`，表格加 class，每个 td 加 data-label：

```js
html += '<table class="fx-list-table"><thead><tr><th>#</th>' + th('编号', 'fixture_no') + th('名称', 'name') + '<th>规格</th><th>部门</th><th>储位</th><th>图片</th><th>状态</th>' + th('更新时间', 'updated_at') + '<th>操作</th></tr></thead><tbody>';
```

行渲染改为带 data-label：
```js
html += '<tr' + cls + ' onclick="showFixtureDetail(' + f.id + ')"><td data-label="序号" class="muted">' + (i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="储位" class="muted">' + e(f.storage_location || '—') + '</td><td data-label="图片">' + photoHtml + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="更新时间"><small>' + fmt(f.updated_at) + '</small></td><td data-label="操作"><a class="link" onclick="event.stopPropagation();showFixtureDetail(' + f.id + ')">详情</a></td></tr>';
```

- [ ] **Step 3: 验证语法**

Run: `node -c public/js/fixture-list.js`
Expected: no output (pass)

---

### Task 10: 代码拆分 — fixture-new.js

**Files:**
- Create: `public/js/fixture-new.js`
- Modify: `public/js/fixture-list.js` (删除 renderFixtureNew + submitFixtureNew)
- Modify: `public/fixture.html` (新增 script 引用)

- [ ] **Step 1: 创建 fixture-new.js**

将 `renderFixtureNew` 和 `submitFixtureNew` 两个函数从 fixture-list.js 剪切到新文件：

```js
// fixture-new.js — 治具新建申请
async function renderFixtureNew() {
  var html = '<div class="card" style="max-width:720px">';
  html += '<h3 style="margin:0 0 16px">新建治具申请</h3>';
  html += '<form id="fixture-new-form" onsubmit="submitFixtureNew(event)">';
  html += '<div class="new-grid">';
  html += '<div class="new-col"><div class="new-col-title">基础信息</div>';
  html += '<label>治具名称<span style="color:var(--bad)">*</span></label><input id="fn-name" required />';
  html += '<label>规格</label><input id="fn-spec" />';
  html += '<label>型号</label><input id="fn-model" />';
  html += '</div>';
  html += '<div class="new-col"><div class="new-col-title">使用信息</div>';
  html += '<label>对应工站</label><input id="fn-station" />';
  html += '<label>分类</label><input id="fn-category" placeholder="如测试治具/装配治具" />';
  html += '<label>申请说明</label><textarea id="fn-note" rows="3"></textarea>';
  html += '<label>保养周期(天) <small>(选填，默认90)</small></label><input id="fn-maint-cycle" type="number" min="0" value="90" placeholder="0=无需定期保养" />';
  html += '</div></div>';
  html += '<button class="btn" type="submit" style="margin-top:16px">提交申请</button>';
  html += '</form></div>';
  document.getElementById('view').innerHTML = html;
}

async function submitFixtureNew(e) {
  e.preventDefault();
  try {
    var body = {
      name: document.getElementById('fn-name').value, spec: document.getElementById('fn-spec').value, model: document.getElementById('fn-model').value,
      station: document.getElementById('fn-station').value, category: document.getElementById('fn-category').value, request_note: document.getElementById('fn-note').value
    };
    var cycleEl = document.getElementById('fn-maint-cycle'); if (cycleEl && cycleEl.value) body.maintenance_cycle_days = parseInt(cycleEl.value) || 90;
    var f = await api('POST', '/api/fixtures', body);
    showToast('申请成功：' + f.fixture_no);
    location.hash = '#/list';
  } catch (err) { showToast(err.message); }
}
```

- [ ] **Step 2: 从 fixture-list.js 删除 renderFixtureNew + submitFixtureNew**

删除这两函数（第 89-122 行）。

- [ ] **Step 3: fixture.html 加载新文件**

在 `fixture-logs.js` 之后添加：
```html
<script src="/js/fixture-new.js"></script>
```

- [ ] **Step 4: 验证语法**

Run: `node -c public/js/fixture-list.js && node -c public/js/fixture-new.js`
Expected: no output (pass)

---

### Task 11: 最终集成验证

**Files:** 无修改，仅验证

- [ ] **Step 1: 全量语法检查**

Run:
```bash
node -c db/fixtures.js && node -c routes/fixtures.js && node -c public/js/fixture-list.js && node -c public/js/fixture-new.js && echo 'all OK'
```
Expected: `all OK`

- [ ] **Step 2: 启动并回归测试**

```bash
pm2 restart sample-mgmt
```

手动验证清单：
1. 治具清单加载中 → 显示 loading → 显示表格（含分页控件）
2. 点击「下一页」正确翻页，`←` 在第 1 页禁用
3. 筛选条件变更后自动重置到第 1 页
4. 表头点击「编号」「名称」「更新时间」排序，箭头切换 ▲/▼
5. 图片列显示缩略图（有图）/ `—`（无图）
6. 操作列「详情」链接点击不触发行点击
7. 移动端（<768px）表格变为卡片堆叠布局
8. 「新建申请」功能正常（从独立 fixture-new.js 加载）
9. 样品管理系统无影响

- [ ] **Step 3: 臃肿检测**

输出 fixture-list.js + fixture-new.js 的行数/函数数/预警状态。
