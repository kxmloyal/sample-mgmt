# 治具存放-领用-归还-保养 强化实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有治具管理系统中嵌入存放位置管理、保养周期、逾期预警，覆盖 IATF 16949 工装管理要求。

**Architecture:** 不新增状态机状态，保养作为正交操作（不改变状态），4 个新字段追加到 fixtures 表，前端看板+扫码台+详情+清单+新建表单 5 个入口协同暴露。

**Tech Stack:** Node.js + Express + MariaDB + 原生 HTML/CSS/JS

**Spec:** [2026-07-31-fixture-maintenance-design.md](../specs/2026-07-31-fixture-maintenance-design.md)

---

## 文件结构

| 文件 | 职责 | 操作 |
|---|---|---|
| `db.js` | 数据库迁移：fixtures 表新增 4 字段 | 修改 |
| `db/fixtures.js` | 看板聚合查询 + CRUD 支持新字段 | 修改 |
| `routes/fixture-helpers.js` | allowedActions 新增 MAINTENANCE | 修改 |
| `routes/fixture-actions-cycle.js` | doMaintenance 保养操作函数 | 修改 |
| `routes/fixtures.js` | 路由注册 MAINTENANCE；新建/更新 API 支持新字段 | 修改 |
| `public/js/fixture-dashboard.js` | 看板新增待保养卡片+逾期保养预警表 | 修改 |
| `public/js/fixture-scan.js` | 扫码台保养按钮+表单+信息展示 | 修改 |
| `public/js/fixture-detail.js` | 详情概览追加存放/保养字段 | 修改 |
| `public/js/fixture-list.js` | 清单追加存放位置列 | 修改 |
| `public/js/fixture-router.js` | 新建表单追加存放位置/保养周期字段 | 修改 |

---

### Task 1: 数据库迁移 — fixtures 表新增 4 字段

**Files:** Modify `db.js`

- [ ] **Step 1: 在 migrateFixtureLifecycle 中追加字段迁移**

在 `db.js` 的 `migrateFixtureLifecycle()` 函数末尾（`fixture_files` 表迁移之后）追加 4 个 `ALTER TABLE` 语句。

当前 `migrateFixtureLifecycle` 函数末尾（fixture_files 迁移之后）追加：

```js
  // 2026-07-31 存放+保养
  await pool.query(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS storage_location VARCHAR(100) NULL`);
  await pool.query(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS maintenance_cycle_days INT DEFAULT 0`);
  await pool.query(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS last_maintenance_at DATETIME NULL`);
  await pool.query(`ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS next_maintenance_at DATETIME NULL`);
```

> **注意**：MariaDB 10.0+ 支持 `IF NOT EXISTS`，如报语法错误，改用 try-catch 逐个添加。

- [ ] **Step 2: 验证迁移**

```bash
cd /www/wwwroot/sample-mgmt && node -e "require('./db').init().then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
```

期望：`OK`，检查数据库 `DESC fixtures` 包含 4 个新字段。

- [ ] **Step 3: 重启服务**

```bash
pm2 restart sample-mgmt
```

- [ ] **Step 4: Commit**

```bash
git add db.js
git commit -m "feat(db): add storage_location, maintenance_cycle_days, last/next_maintenance_at to fixtures"
```

---

### Task 2: DAO 层 — 看板聚合 + CRUD 新字段支持

**Files:** Modify `db/fixtures.js`

- [ ] **Step 1: 看板 API — 新增待保养逾期查询**

在 `db/fixtures.js` 中新增两个导出函数：

```js
// 查询逾期未保养的治具 (next_maintenance_at <= NOW)
async function listOverdueMaintenanceFixtures(role, userId) {
  var sql = 'SELECT * FROM fixtures WHERE retired_at IS NULL AND next_maintenance_at IS NOT NULL AND next_maintenance_at <= NOW() ORDER BY next_maintenance_at ASC';
  var [rows] = await pool.query(sql);
  return rows;
}

// 查询 7 日内将到保养期的治具
async function listUpcomingMaintenanceFixtures(role, userId) {
  var sql = 'SELECT * FROM fixtures WHERE retired_at IS NULL AND next_maintenance_at IS NOT NULL AND next_maintenance_at > NOW() AND next_maintenance_at <= DATE_ADD(NOW(), INTERVAL 7 DAY) ORDER BY next_maintenance_at ASC';
  var [rows] = await pool.query(sql);
  return rows;
}
```

在文件顶部的 `module.exports` 中导出这两个函数（加入已有导出列表）。

- [ ] **Step 2: 新建/更新支持新字段**

找到 `createFixture` 和 `updateFixture` 函数，在 INSERT/UPDATE 语句中添加新字段。

`createFixture` 在字段列表中追加：
```
storage_location, maintenance_cycle_days
```
VALUES 中对应追加 `data.storage_location || null, data.maintenance_cycle_days || 90`

`updateFixture` 的动态 SET 部分追加处理：
```js
// 在现有动态字段循环中或单独追加
if (data.storage_location !== undefined) {
  sets.push('storage_location = ?'); values.push(data.storage_location);
}
if (data.maintenance_cycle_days !== undefined) {
  sets.push('maintenance_cycle_days = ?'); values.push(data.maintenance_cycle_days);
  // 若有 last_maintenance_at 则重新计算 next_maintenance_at
  if (data.last_maintenance_at || data._recalc_maintenance) {
    sets.push('next_maintenance_at = DATE_ADD(last_maintenance_at, INTERVAL ? DAY)');
    values.push(data.maintenance_cycle_days);
  }
}
```

- [ ] **Step 3: 路由层看板接口调用新查询**

在 `routes/fixtures.js` 的看板路由处理中，追加查询调用和返回字段：

```js
var overdueM = await D.listOverdueMaintenanceFixtures();
var upcomingM = await D.listUpcomingMaintenanceFixtures();
// 在返回的 result 对象中追加
result.maintenanceOverdue = overdueM;
result.maintenanceUpcoming = upcomingM;
result.maintenanceOverdueCount = overdueM.length;
result.maintenanceUpcomingCount = upcomingM.length;
```

- [ ] **Step 4: Commit**

```bash
git add db/fixtures.js routes/fixtures.js
git commit -m "feat(db,route): add maintenance overdue/upcoming queries and dashboard aggregation"
```

---

### Task 3: allowedActions — 新增 MAINTENANCE 操作

**Files:** Modify `routes/fixture-helpers.js`

- [ ] **Step 1: 追加保养操作权限**

在 `allowedActions` 对象中，为 `TRANSFERRED` 和 `IN_USE` 追加 `MAINTENANCE`：

```js
// TRANSFERRED: [...]  → 末尾追加
{ action: 'MAINTENANCE', roles: ['ME'] }
// IN_USE: [...] → 末尾追加
{ action: 'MAINTENANCE', roles: ['ME'] }
```

- [ ] **Step 2: 在 STATE 字典中追加 MAINTENANCE 标签（已有 `MAINTENANCE_DONE` 的复用方式）**

无需新增字典项，`MAINTENANCE` 本身不出现在状态标签中（只是操作，不是状态）。

- [ ] **Step 3: Commit**

```bash
git add routes/fixture-helpers.js
git commit -m "feat(helpers): add MAINTENANCE action for TRANSFERRED/IN_USE (ME only)"
```

---

### Task 4: 保养操作函数

**Files:** Modify `routes/fixture-actions-cycle.js`

- [ ] **Step 1: 新增 doMaintenance 函数**

在文件末尾 `module.exports` 之前新增：

```js
async function doMaintenance(fixture, body, user) {
  var maintDate = body.maintenance_date ? new Date(body.maintenance_date) : new Date();
  var updated = { ...fixture, last_maintenance_at: maintDate.toISOString() };

  // 计算下次保养时间
  var cycle = fixture.maintenance_cycle_days || 0;
  if (body.next_maintenance_at) {
    updated.next_maintenance_at = body.next_maintenance_at;
  } else if (cycle > 0) {
    var next = new Date(maintDate);
    next.setDate(next.getDate() + cycle);
    updated.next_maintenance_at = next.toISOString();
  } else {
    updated.next_maintenance_at = null;
  }

  // 更新数据库
  await D.updateFixture(fixture.id, {
    last_maintenance_at: updated.last_maintenance_at,
    next_maintenance_at: updated.next_maintenance_at,
    _recalc_maintenance: false
  });

  // 写日志
  await D.addFixtureLog(fixture.id, 'MAINTENANCE', user.role, user.id, user.dept, body.note || '');

  return updated;
}
```

- [ ] **Step 2: 导出函数**

在 `module.exports` 末尾追加 `doMaintenance,`。

- [ ] **Step 3: Commit**

```bash
git add routes/fixture-actions-cycle.js
git commit -m "feat(maintenance): add doMaintenance function with date calculation and logging"
```

---

### Task 5: 路由注册 — MAINTENANCE 操作入口

**Files:** Modify `routes/fixtures.js`

- [ ] **Step 1: 引入 doMaintenance**

在 `routes/fixtures.js` 顶部 require 处追加：

```js
var { doMaintenance } = require('./fixture-actions-cycle');
```

- [ ] **Step 2: 在 POST /api/fixtures/scan 的 action 分支中追加**

在现有的 `if (req.body.action === ...)` 链中追加分支：

```js
} else if (req.body.action === 'MAINTENANCE') {
  if (!isMECustodyQA(req.session.user.role)) return res.status(403).json({ error: '仅限 ME/QA/CUSTODY 操作' });
  if (!['TRANSFERRED', 'IN_USE'].includes(fixture.status)) return res.status(400).json({ error: '当前状态不允许保养操作' });
  var result = await doMaintenance(fixture, req.body, req.session.user);
  return res.json({ success: true, result });
```

- [ ] **Step 3: 新建/更新 API 支持新字段**

在 `POST /api/fixtures` 的处理中，将 `storage_location` 和 `maintenance_cycle_days` 从 `req.body` 传递给 `D.createFixture`。

在 `PUT /api/fixtures/:id` 的处理中同样传递。

- [ ] **Step 4: Commit**

```bash
git add routes/fixtures.js
git commit -m "feat(route): register MAINTENANCE action and support new fields in CRUD"
```

---

### Task 6: 看板 — 待保养卡片 + 逾期保养预警表

**Files:** Modify `public/js/fixture-dashboard.js`

- [ ] **Step 1: DASH_STATS 新增「待保养」卡片**

```js
var DASH_STATS = [
  { label: '待处理', status: null,   countKey: 'myPending' },
  { label: '待验证', status: 'VERIFY_PENDING', countByStatus: true },
  { label: '领用中', status: 'IN_USE',         countByStatus: true },
  { label: '已接收', status: 'ACCEPTED',       countByStatus: true },
  { label: '改善中', status: 'IMPROVING',       countByStatus: true },
  { label: '待保养', status: 'MAINTENANCE_DUE',  countByStatus: true }
];
```

`countKey: 'maintenanceOverdueCount'` 显示逾期 + 即将到期总数。

点击筛选时：`_dashFilter` 切换到 'MAINTENANCE_DUE'，表格显示逾期保养和即将到期保养治具。

- [ ] **Step 2: 逾期保养预警表渲染**

在 `_renderDashContent()` 中，现有逾期归还表之后追加：

```js
// 逾期保养预警表
var maintPending = (d.maintenanceOverdue || []).concat(d.maintenanceUpcoming || []);
if (maintPending.length > 0) {
  html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">待保养治具 (' + maintPending.length + ')</h3>';
  html += '<table><tr><th>编号</th><th>名称</th><th>部门</th><th>存放位置</th><th>上次保养</th><th>应保养日期</th><th>状态</th></tr>';
  html += maintPending.map(function(f) {
    var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
    var overdueDays = isOverdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
    var cls = isOverdue ? ' overdue-row' : '';
    var label = isOverdue ? '<span style="color:var(--bad);font-weight:600">已逾期' + overdueDays + '天</span>' : '<span style="color:#d97706">即将到期</span>';
    return '<tr class="' + cls + '" style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td><b>' + (f.fixture_no || '—') + '</b></td><td>' + (f.name || '—') + '</td><td>' + (f.requested_dept || '—') + '</td><td class="muted">' + (f.storage_location || '—') + '</td><td>' + fmt(f.last_maintenance_at) + '</td><td style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + '</td><td>' + label + '</td></tr>';
  }).join('');
  html += '</table></div>';
}
```

- [ ] **Step 3: 筛选支持**

当 `_dashFilter === 'MAINTENANCE_DUE'` 时，表格标题显示 "待保养治具 (N)"，仅显示维护中的治具。

```js
// 在 _renderDashContent 中的筛选逻辑中追加
var isMaintFilter = _dashFilter === 'MAINTENANCE_DUE';
if (isMaintFilter) {
  html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (' + maintPending.length + ')</h3>';
  // ...表格渲染同上
}
```

- [ ] **Step 4: Commit**

```bash
git add public/js/fixture-dashboard.js
git commit -m "feat(dashboard): add maintenance-due card and overdue maintenance alert table"
```

---

### Task 7: 扫码台 — 保养按钮 + 表单 + 信息展示

**Files:** Modify `public/js/fixture-scan.js`

- [ ] **Step 1: 保养信息展示**

在 `showFixActions(result)` 函数的治具信息卡片区域追加 4 行字段：

```js
// 在现有信息卡片 HTML 中，状态行之后追加：
if (f.storage_location) {
  html += '<div class="field"><span class="label">存放位置</span><span>' + f.storage_location + '</span></div>';
}
if (f.maintenance_cycle_days > 0) {
  html += '<div class="field"><span class="label">保养周期</span><span>' + f.maintenance_cycle_days + ' 天</span></div>';
  html += '<div class="field"><span class="label">上次保养</span><span>' + fmt(f.last_maintenance_at) + '</span></div>';
  var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
  var nextLabel = isOverdue ? '<span style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + ' (已逾期)</span>' : fmt(f.next_maintenance_at);
  html += '<div class="field"><span class="label">下次保养</span><span>' + nextLabel + '</span></div>';
}
```

- [ ] **Step 2: labelMap 新增 MAINTENANCE**

```js
var labelMap = {
  // ...现有映射
  MAINTENANCE: '保养'
};
```

- [ ] **Step 3: 保养表单（execFixAction 分支）**

在 `execFixAction` 函数中，当 `action === 'MAINTENANCE'` 时渲染保养专用表单：

```js
} else if (action === 'MAINTENANCE') {
  var nextDate = fixture.next_maintenance_at ? new Date(fixture.next_maintenance_at).toISOString().slice(0,10) : '';
  if (!nextDate && fixture.maintenance_cycle_days > 0) {
    var d = new Date(); d.setDate(d.getDate() + fixture.maintenance_cycle_days);
    nextDate = d.toISOString().slice(0,10);
  }
  formHtml = '<div class="field"><label>保养内容 <small>(必填)</small></label><textarea id="act-note" rows="3" required></textarea></div>';
  formHtml += '<div class="field"><label>保养日期</label><input type="date" id="act-maint-date" value="' + new Date().toISOString().slice(0,10) + '" /></div>';
  formHtml += '<div class="field"><label>下次保养日期</label><input type="date" id="act-next-date" value="' + nextDate + '" /></div>';
```

- [ ] **Step 4: 提交保养（submitFixAction 分支）**

在 `submitFixAction` 函数中追加：

```js
if (action === 'MAINTENANCE') {
  data.maintenance_date = document.getElementById('act-maint-date').value;
  var nd = document.getElementById('act-next-date');
  if (nd && nd.value) data.next_maintenance_at = nd.value;
}
```

- [ ] **Step 5: Commit**

```bash
git add public/js/fixture-scan.js
git commit -m "feat(scan): add maintenance button, form, and info display in fixture scan"
```

---

### Task 8: 详情弹窗 — 概览 Tab 追加存放/保养字段

**Files:** Modify `public/js/fixture-detail.js`

- [ ] **Step 1: 基础信息卡片追加字段**

在 `buildOverview(f)` 函数的「基础信息」卡片中，现有字段之后追加：

```js
// 存放位置 + 保养周期
if (f.storage_location) info += kv('存放位置', f.storage_location);
if (f.maintenance_cycle_days > 0) {
  info += kv('保养周期', f.maintenance_cycle_days + ' 天');
  info += kv('上次保养', fmt(f.last_maintenance_at));
  var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
  var overdueDays = isOverdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
  var nextHtml = isOverdue ? '<span style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + ' · 已逾期' + overdueDays + '天</span>' : fmt(f.next_maintenance_at);
  info += '<span class="label">下次保养</span><span>' + nextHtml + '</span>';
}
```

- [ ] **Step 2: 添加编辑按钮**

不在此任务中实现（编辑弹窗逻辑复杂，后续单独任务）。如用户明确要求，在概览卡片末尾加 `click="editFixture('${f.id}')"` 按钮。

- [ ] **Step 3: Commit**

```bash
git add public/js/fixture-detail.js
git commit -m "feat(detail): add storage location and maintenance info to overview tab"
```

---

### Task 9: 清单 — 追加存放位置列

**Files:** Modify `public/js/fixture-list.js`

- [ ] **Step 1: 表头追加列**

在清单表头的 `<tr>` 中，`<th>状态</th>` 之前追加 `<th>存放位置</th>`。

- [ ] **Step 2: 数据行追加列**

在每行渲染逻辑中追加 `<td class="muted">${row.storage_location || '—'}</td>`。

- [ ] **Step 3: Commit**

```bash
git add public/js/fixture-list.js
git commit -m "feat(list): add storage_location column to fixture table"
```

---

### Task 10: 新建申请表单 — 追加存放位置/保养周期

**Files:** Modify `public/js/fixture-router.js`

- [ ] **Step 1: 新建表单追加字段**

在新建治具表单 `renderNewFixture` 函数中，申请说明之后追加：

```js
'<label>存放位置 <small>(选填)</small></label>' +
'<input id="nf-location" placeholder="如：A-3-12 / 线边1号工位" style="width:100%;box-sizing:border-box" />' +
'<label>保养周期(天) <small>(选填，默认90)</small></label>' +
'<input id="nf-maint-cycle" type="number" min="0" value="90" placeholder="0=无需定期保养" style="width:100%;box-sizing:border-box" />' +
```

- [ ] **Step 2: 提交时携带新字段**

在 `submitNewFixture` 函数中追加：

```js
data.storage_location = document.getElementById('nf-location').value || null;
data.maintenance_cycle_days = parseInt(document.getElementById('nf-maint-cycle').value) || 90;
```

- [ ] **Step 3: Commit**

```bash
git add public/js/fixture-router.js
git commit -m "feat(form): add storage_location and maintenance_cycle_days to new fixture form"
```

---

## 回归验证清单

- [ ] 看板页面：待保养卡片显示正确计数，点击筛选只显示待保养治具
- [ ] 看板页面：逾期保养预警表显示逾期和即将到期治具
- [ ] 扫码台：扫描 TRANSFERRED 或 IN_USE 治具，ME 角色可见「保养」按钮
- [ ] 扫码台：非 ME 角色扫描同状态治具，不出现保养按钮
- [ ] 扫码台：提交保养后，`last_maintenance_at` 和 `next_maintenance_at` 正确更新
- [ ] 扫码台：保养操作写入 fixture_logs
- [ ] 详情弹窗：概览 Tab 显示存放位置、保养周期、保养时间
- [ ] 清单：存放位置列正常显示
- [ ] 新建申请：存放位置和保养周期字段正常保存到数据库
- [ ] 样品管理系统：无影响，所有页面正常

## 子系统隔离验证

- 共享文件 `db.js` 变更：仅追加治具表字段，样品表无变更
- 共享 CSS `app.css`：无修改
- 样品管理 `index.html` + `public/js/*`（样品专属）：无修改
- 样品扫码台、看板、清单：回归通过
