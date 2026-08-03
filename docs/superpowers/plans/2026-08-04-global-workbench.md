# 全局工作台 Implementation Plan

> **For agentic workers:** 每个 Task 对应一个独立实施单元，使用 subagent-driven 模式执行。

**Goal:** 新增全局工作台子系统，合并样品+治具数据，按部门维度展示待办和积压情况。

**Architecture:** 遵循子系统插件协议（AGENTS.md §17），作为 subsystems/workbench/ 独立子系统注册，不创建数据库表，通过 UNION ALL 查询 samples+fixtures 两表。

**Tech Stack:** Node.js/Express + MariaDB(mysql2) + 原生 HTML/CSS/JS

**Spec:** [docs/superpowers/specs/2026-08-04-global-workbench-design.md](../specs/2026-08-04-global-workbench-design.md)

---

### 文件结构

```
subsystems/workbench/
├── manifest.json                  # 子系统元数据（新建）
├── db/
│   └── workbench-queries.js       # 统一 SQL 查询（新建）
├── backend/
│   └── index.js                   # API 端点 GET /api/workbench（新建）
├── frontend/
│   ├── index.html                 # SPA 入口（新建）
│   ├── js/
│   │   ├── router.js              # 前端路由（新建）
│   │   └── views/
│   │       └── dashboard.js       # 渲染 + calcOverdue（新建）
│   └── css/
│       └── module.css             # 工作台样式（新建）
└── seed/
    └── (无种子数据，跳过)
```

无修改现有文件。门户页（portal.html）通过 `/api/subsystems` 动态发现，无需硬编码。

---

### Task 1: 创建目录结构 + manifest.json

**Files:**
- Create: `subsystems/workbench/manifest.json`

- [ ] **Step 1: 创建目录骨架**

```bash
mkdir -p subsystems/workbench/{db,backend,frontend/{js/views,css},seed}
```

- [ ] **Step 2: 编写 manifest.json**

```json
{
  "id": "workbench",
  "name": "全局工作台",
  "description": "跨部门项目进度监控，合并样品与治具待办积压视图",
  "version": "1.0.0",
  "icon": "chart",
  "route": {
    "prefix": "/api/workbench",
    "entry": "/subsystems/workbench/frontend/index.html",
    "hashBase": "/workbench"
  },
  "database": {
    "tables": []
  },
  "roles": {
    "use": ["ADMIN", "RD", "QA", "CUSTODY", "ME"],
    "admin": ["ADMIN"]
  },
  "navigation": [
    {
      "key": "dashboard",
      "label": "工作台",
      "icon": "chart",
      "view": "renderWorkbenchDashboard",
      "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"]
    }
  ]
}
```

- [ ] **Step 3: 验证 manifest schema**

```bash
node -e "var m=require('./subsystems/workbench/manifest.json'); console.log(m.id + ' OK')"
```

预期: `workbench OK`

- [ ] **Step 4: Commit**

```bash
git add subsystems/workbench/manifest.json
git commit -m "feat(workbench): add manifest.json for global workbench subsystem"
```

---

### Task 2: 编写统一 SQL 查询

**Files:**
- Create: `subsystems/workbench/db/workbench-queries.js`

- [ ] **Step 1: 编写完整 SQL 字符常量**

```javascript
// subsystems/workbench/db/workbench-queries.js
// 统一工作台查询：合并样品 + 治具活跃数据，排除 RETIRED

var unifiedWorkbenchSQL = `
SELECT * FROM (
  SELECT
    s.sample_no AS item_no,
    s.name,
    'sample' AS item_type,
    '样品' AS item_type_cn,
    s.status,
    CASE s.status
      WHEN 'NEW' THEN '制样中'
      WHEN 'PRODUCED' THEN '待发行'
      WHEN 'RELEASED' THEN '保管中'
      WHEN 'IN_CUSTODY' THEN '保管中'
      WHEN 'RETURNING' THEN '退回审核中'
      WHEN 'RETIRED' THEN '已废弃'
    END AS stage_cn,
    CASE s.status
      WHEN 'NEW' THEN '研发中心'
      WHEN 'PRODUCED' THEN '研发中心'
      WHEN 'RELEASED' THEN COALESCE(s.custody_dept, '品保文管中心')
      WHEN 'IN_CUSTODY' THEN COALESCE(s.custody_dept, '-')
      WHEN 'RETURNING' THEN '品保文管中心'
      ELSE '-'
    END AS resp_dept,
    COALESCE(s.custody_dept, '-') AS apply_dept,
    s.spec,
    s.model,
    s.station,
    TIMESTAMPDIFF(HOUR, s.updated_at, NOW()) AS dwell_hours,
    s.next_inspect_at,
    s.release_cycle_days,
    NULL AS expected_return_at,
    NULL AS expected_finish_at,
    NULL AS next_maintenance_at,
    NULL AS transferred_at,
    NULL AS used_at,
    NULL AS repair_requested_at,
    s.created_at,
    s.updated_at
  FROM samples s
  WHERE s.status NOT IN ('RETIRED')

  UNION ALL

  SELECT
    f.fixture_no AS item_no,
    f.name,
    'fixture' AS item_type,
    '治具' AS item_type_cn,
    f.status,
    CASE f.status
      WHEN 'REQUESTED' THEN '待接收'
      WHEN 'ACCEPTED' THEN '制作中'
      WHEN 'VERIFY_PENDING' THEN '待验证'
      WHEN 'TRANSFERRED' THEN '可领用'
      WHEN 'IN_USE' THEN '领用中'
      WHEN 'IMPROVING' THEN '改善中'
      WHEN 'REPAIRING_ME' THEN 'ME维修中'
      WHEN 'REPAIRING_RD' THEN 'RD维修中'
      WHEN 'REPAIR_DONE' THEN '待确认维修'
      WHEN 'RETIRED' THEN '已报废'
    END AS stage_cn,
    CASE f.status
      WHEN 'REQUESTED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'ACCEPTED' THEN '研发中心'
      WHEN 'VERIFY_PENDING' THEN COALESCE(f.requested_dept, '-')
      WHEN 'TRANSFERRED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IN_USE' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IMPROVING' THEN '研发中心'
      WHEN 'REPAIRING_ME' THEN '生技部'
      WHEN 'REPAIRING_RD' THEN '研发中心'
      WHEN 'REPAIR_DONE' THEN '生技部'
      ELSE '-'
    END AS resp_dept,
    COALESCE(f.requested_dept, '-') AS apply_dept,
    f.spec,
    f.model,
    f.station,
    CASE f.status
      WHEN 'REQUESTED' THEN TIMESTAMPDIFF(HOUR, f.created_at, NOW())
      WHEN 'IN_USE' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.used_at, f.updated_at), NOW())
      WHEN 'TRANSFERRED' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.transferred_at, f.updated_at), NOW())
      WHEN 'VERIFY_PENDING' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.made_at, f.updated_at), NOW())
      ELSE TIMESTAMPDIFF(HOUR, f.updated_at, NOW())
    END AS dwell_hours,
    NULL AS next_inspect_at,
    NULL AS release_cycle_days,
    f.expected_return_at,
    f.expected_finish_at,
    f.next_maintenance_at,
    f.transferred_at,
    f.used_at,
    f.repair_requested_at,
    f.created_at,
    f.updated_at
  FROM fixtures f
  WHERE f.status NOT IN ('RETIRED')
) AS unified
ORDER BY dwell_hours DESC, item_type ASC, item_no ASC
`;

module.exports = { unifiedWorkbenchSQL };
```

- [ ] **Step 2: 验证 SQL 语法（在 Node 中加载不报错即通过）**

```bash
node -e "var q=require('./subsystems/workbench/db/workbench-queries.js'); console.log('SQL length:', q.unifiedWorkbenchSQL.length)"
```

预期: `SQL length: <数字>`

- [ ] **Step 3: Commit**

```bash
git add subsystems/workbench/db/workbench-queries.js
git commit -m "feat(workbench): add unified SQL query for merged samples+fixtures listing"
```

---

### Task 3: 编写后端 API 端点

**Files:**
- Create: `subsystems/workbench/backend/index.js`

- [ ] **Step 1: 编写 backend/index.js**

```javascript
// subsystems/workbench/backend/index.js
// 全局工作台后端 — 只读查询，不创建表/种子数据

var D = require('../../../db');
var { unifiedWorkbenchSQL } = require('../db/workbench-queries');

function register(app) {
  var requireAuth = app.locals.requireAuth;

  // GET /api/workbench — 合并样品+治具活跃数据
  app.get('/api/workbench', requireAuth, async function(req, res) {
    try {
      var rows = await D.query(unifiedWorkbenchSQL);
      var items = buildResponse(rows, req.query);
      res.json(items);
    } catch (err) {
      console.error('[workbench] 查询失败:', err.message);
      res.status(500).json({ error: '获取工作台数据失败：' + err.message });
    }
  });
}

/**
 * 构建响应：按部门分组统计 + 完整列表
 */
function buildResponse(rows, query) {
  // 筛选（可选）
  var items = rows;
  if (query.item_type) {
    items = items.filter(function(r) { return r.item_type === query.item_type; });
  }
  if (query.dept) {
    items = items.filter(function(r) { return r.resp_dept === query.dept; });
  }

  // 按部门分组
  var byDept = {};
  items.forEach(function(item) {
    var dept = item.resp_dept || '-';
    if (!byDept[dept]) {
      byDept[dept] = { dept: dept, total: 0, d1: 0, d3: 0, d7: 0, items: [] };
    }
    byDept[dept].total++;
    byDept[dept].items.push(item);
  });
  var deptList = Object.values(byDept);

  return { items: items, byDept: deptList, summary: { total: items.length } };
}

function initDB() { return Promise.resolve(); }
function seed() { return Promise.resolve(); }

module.exports = { register, initDB, seed };
```

- [ ] **Step 2: 验证模块加载不报错**

```bash
node -e "var m=require('./subsystems/workbench/backend/index.js'); console.log('register:', typeof m.register, 'initDB:', typeof m.initDB)"
```

预期: `register: function initDB: function`

- [ ] **Step 3: Commit**

```bash
git add subsystems/workbench/backend/index.js
git commit -m "feat(workbench): add backend API endpoint GET /api/workbench"
```

---

### Task 4: 编写前端 SPA

**Files:**
- Create: `subsystems/workbench/frontend/index.html`
- Create: `subsystems/workbench/frontend/js/router.js`
- Create: `subsystems/workbench/frontend/js/views/dashboard.js`
- Create: `subsystems/workbench/frontend/css/module.css`

- [ ] **Step 1: 编写 SPA 入口 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#0f766e" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%230f766e'/><text x='16' y='22' text-anchor='middle' fill='white' font-size='18' font-family='sans-serif'>W</text></svg>" />
<title>制造品质管理系统 - 全局工作台</title>
<link rel="stylesheet" href="/css/app.css?v=20260804" />
<link rel="stylesheet" href="/subsystems/workbench/frontend/css/module.css" />
</head>
<body>

<div id="login" style="display:none">
  <div class="login-card">
    <h1>制造品质管理系统</h1>
    <p class="sub">全局项目进度监控</p>
    <label>账号</label>
    <input id="lg-user" placeholder="用户名" />
    <label>密码</label>
    <input id="lg-pass" type="password" placeholder="密码" onkeydown="if(event.key==='Enter')doLogin()" />
    <button class="btn btn-primary" style="width:100%;margin-top:18px" onclick="doLogin()">登录</button>
    <div class="login-err" id="lg-err"></div>
  </div>
</div>

<div id="app" style="display:none">
  <header class="topbar">
    <a href="/portal.html" class="back-link" title="返回门户">&larr;</a>
    <span class="sys-name">全局工作台</span>
    <span class="topbar-right">
      <span class="topbar-role" id="topbar-role"></span>
      <a href="#" onclick="logout()" class="logout-link" id="logout-link">退出</a>
    </span>
  </header>
  <div id="nav" class="tab-nav"></div>
  <main id="view"></main>
</div>

<div class="toast" id="toast"></div>

<script src="/shared/frontend/api-base.js"></script>
<script src="/subsystems/workbench/frontend/js/views/dashboard.js"></script>
<script src="/subsystems/workbench/frontend/js/router.js"></script>
<script>
window.addEventListener('hashchange', route);
boot();
</script>
</body>
</html>
```

- [ ] **Step 2: 编写前端路由 router.js**

```javascript
// subsystems/workbench/frontend/js/router.js

function route() {
  var h = location.hash.replace('#/', '') || 'dashboard';
  if (h === 'dashboard') { renderWorkbenchDashboard(); }
}

function boot() {
  checkLogin()
    .then(function(u) {
      if (!u) return showLogin();
      me = u;
      document.getElementById('topbar-role').textContent = me.name + ' (' + (ROLE[me.role] || me.role) + ')';
      changeTheme(me.role);
      initApp();
    })
    .catch(function() { showLogin(); });
}

function initApp() {
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('logout-link').style.display = '';
  renderNav();
  route();
}

function renderNav() {
  document.getElementById('nav').innerHTML =
    '<a href="#/dashboard" class="tab active">工作台</a>';
}

function showLogin() {
  document.getElementById('login').style.display = '';
  document.getElementById('app').style.display = 'none';
}
```

- [ ] **Step 3: 编写核心视图 dashboard.js（含 calcOverdue）**

```javascript
// subsystems/workbench/frontend/js/views/dashboard.js

var OVERDUE_THRESHOLDS = { day1: 24, day3: 72, day7: 168 };

var OVERDUE_STYLES = {
  0: { color: '#16a34a', bg: '#f0fdf4' },
  1: { color: '#d97706', bg: '#fffbeb' },
  2: { color: '#ea580c', bg: '#fff7ed' },
  3: { color: '#dc2626', bg: '#fef2f2' }
};

async function renderWorkbenchDashboard() {
  var view = document.getElementById('view');
  view.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">加载中…</div>';

  try {
    var data = await api('GET', '/api/workbench');

    // 前端逐条计算逾期
    data.items.forEach(function(item) {
      var od = calcOverdue(item);
      item.overdue_level = od.level;
      item.overdue_label = od.label;
      item.overdue_hours = od.hours;
      item.overdue_reason = od.reason;
    });

    // 按逾期等级+停留时长重新排序
    data.items.sort(function(a, b) {
      if (a.overdue_level !== b.overdue_level) return b.overdue_level - a.overdue_level;
      if (a.dwell_hours !== b.dwell_hours) return b.dwell_hours - a.dwell_hours;
      if (a.item_type !== b.item_type) return a.item_type > b.item_type ? 1 : -1;
      return a.item_no > b.item_no ? 1 : -1;
    });

    // 重新分组统计
    var byDept = {};
    data.items.forEach(function(item) {
      var dept = item.resp_dept;
      if (!byDept[dept]) byDept[dept] = { dept: dept, total: 0, d1: 0, d3: 0, d7: 0 };
      byDept[dept].total++;
      if (item.overdue_level >= 1) byDept[dept].d1++;
      if (item.overdue_level >= 2) byDept[dept].d3++;
      if (item.overdue_level >= 3) byDept[dept].d7++;
    });

    var summary = { total: data.items.length, d1: 0, d3: 0, d7: 0 };
    data.items.forEach(function(item) {
      if (item.overdue_level >= 1) summary.d1++;
      if (item.overdue_level >= 2) summary.d3++;
      if (item.overdue_level >= 3) summary.d7++;
    });

    view.innerHTML =
      renderSummaryCards(Object.values(byDept), summary) +
      renderFilterBar() +
      renderItemTable(data.items);
  } catch (err) {
    view.innerHTML = '<div style="padding:40px;text-align:center;color:#dc2626">加载失败：' + err.message + '</div>';
  }
}

function renderSummaryCards(depts, summary) {
  var html = '<div class="wb-cards">';
  html += '<div class="wb-card wb-card-total">' +
    '<div class="wb-card-title">总计</div>' +
    '<div class="wb-card-num">' + summary.total + '</div>' +
    '<div class="wb-card-tags">' +
      (summary.d7 ? '<span class="wb-tag wb-tag-3">7d+ ' + summary.d7 + '</span>' : '') +
      (summary.d3 ? '<span class="wb-tag wb-tag-2">3d+ ' + summary.d3 + '</span>' : '') +
      (summary.d1 ? '<span class="wb-tag wb-tag-1">1d+ ' + summary.d1 + '</span>' : '') +
    '</div>' +
    '</div>';
  depts.forEach(function(d) {
    html += '<div class="wb-card">' +
      '<div class="wb-card-title">' + d.dept + '</div>' +
      '<div class="wb-card-num">' + d.total + '</div>' +
      '<div class="wb-card-tags">' +
        (d.d7 ? '<span class="wb-tag wb-tag-3">7d+ ' + d.d7 + '</span>' : '') +
        (d.d3 ? '<span class="wb-tag wb-tag-2">3d+ ' + d.d3 + '</span>' : '') +
        (d.d1 ? '<span class="wb-tag wb-tag-1">1d+ ' + d.d1 + '</span>' : '') +
      '</div>' +
      '</div>';
  });
  html += '</div>';
  return html;
}

function renderFilterBar() {
  return '<div class="filters" style="margin:16px 0">' +
    '<select class="filter-select" id="filter-type" onchange="doFilter()">' +
      '<option value="">全部类型</option>' +
      '<option value="sample">样品</option>' +
      '<option value="fixture">治具</option>' +
    '</select>' +
    '<select class="filter-select" id="filter-level" onchange="doFilter()">' +
      '<option value="">全部积压等级</option>' +
      '<option value="0">正常</option>' +
      '<option value="1">1天+</option>' +
      '<option value="2">3天+</option>' +
      '<option value="3">7天+</option>' +
    '</select>' +
    '<button class="btn btn-sm" onclick="renderWorkbenchDashboard()" style="margin-left:8px">刷新</button>' +
    '</div>';
}

function renderItemTable(items) {
  var rows = items.map(function(item) {
    var style = OVERDUE_STYLES[item.overdue_level] || OVERDUE_STYLES[0];
    var badgeHtml = item.overdue_level > 0
      ? '<span class="wb-badge" style="color:' + style.color + ';background:' + style.bg + '">' + item.overdue_label + '·' + item.overdue_reason + '</span>'
      : '<span style="color:var(--muted)">正常</span>';
    var typeBadge = item.item_type === 'sample'
      ? '<span class="wb-type-tag sample">样品</span>'
      : '<span class="wb-type-tag fixture">治具</span>';

    return '<tr class="wb-row" data-type="' + item.item_type + '" data-level="' + item.overdue_level + '">' +
      '<td>' + item.item_no + '</td>' +
      '<td>' + item.name + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td>' + (item.stage_cn || '-') + '</td>' +
      '<td>' + (item.resp_dept || '-') + '</td>' +
      '<td>' + (item.apply_dept || '-') + '</td>' +
      '<td>' + formatHours(item.dwell_hours) + '</td>' +
      '<td>' + badgeHtml + '</td>' +
      '</tr>';
  }).join('');

  return '<div class="table-wrap">' +
    '<table class="data-table" id="wb-table">' +
    '<thead><tr>' +
    '<th>编号</th><th>名称</th><th>类型</th><th>阶段</th><th>负责部门</th><th>申请部门</th><th>停留</th><th>积压状态</th>' +
    '</tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
    '</table></div>';
}

function doFilter() {
  var typeVal = document.getElementById('filter-type').value;
  var levelVal = document.getElementById('filter-level').value;
  var rows = document.querySelectorAll('#wb-table tbody tr');
  rows.forEach(function(tr) {
    var show = true;
    if (typeVal && tr.getAttribute('data-type') !== typeVal) show = false;
    if (levelVal !== '' && tr.getAttribute('data-level') !== levelVal) show = false;
    tr.style.display = show ? '' : 'none';
  });
}

function formatHours(h) {
  if (!h && h !== 0) return '-';
  h = Math.round(h);
  if (h < 1) return '<1h';
  var days = Math.floor(h / 24);
  var remaining = h % 24;
  if (days >= 1) return days + '天' + (remaining > 0 ? remaining + 'h' : '');
  return h + 'h';
}

// ========== 逾期判断函数 ==========

/**
 * 判断单条统一记录的积压/逾期等级
 * @param {Object} item — 统一列表中的一条记录
 * @param {Object} cfg  — 可选，覆盖阈值
 * @returns {{ level:number, label:string, hours:number, reason:string }}
 */
function calcOverdue(item, cfg) {
  var th = cfg || OVERDUE_THRESHOLDS;
  var hours = 0, reason = '';

  if (item.item_type === 'sample') {
    hours = _sampleOverdueHours(item);
    reason = _sampleOverdueReason(item);
    if (item.status === 'NEW' || item.status === 'PRODUCED') {
      hours = hours / 3;
    }
  } else if (item.item_type === 'fixture') {
    hours = _fixtureOverdueHours(item);
    reason = _fixtureOverdueReason(item);
  }

  var level = 0;
  if (hours > th.day7) level = 3;
  else if (hours > th.day3) level = 2;
  else if (hours > th.day1) level = 1;

  var labels = { 0: '正常', 1: '1天+', 2: '3天+', 3: '7天+' };
  return { level: level, label: labels[level], hours: Math.round(hours), reason: reason };
}

function _sampleOverdueHours(item) {
  var s = item.status;
  if (s === 'RETURNING') return item.dwell_hours;
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    var d = new Date(item.next_inspect_at);
    if (d < new Date()) return Math.round((Date.now() - d.getTime()) / 3600000);
    return 0;
  }
  return item.dwell_hours;
}

function _sampleOverdueReason(item) {
  var s = item.status;
  if (s === 'RETURNING') return '退回审核中停留';
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    if (new Date(item.next_inspect_at) < new Date()) return '复检逾期';
    return '';
  }
  return '停留中(' + item.stage_cn + ')';
}

function _fixtureOverdueHours(item) {
  var s = item.status;
  var now = Date.now();

  if (s === 'IN_USE' && item.expected_return_at) {
    var er = new Date(item.expected_return_at);
    if (er < new Date()) return Math.round((now - er.getTime()) / 3600000);
    return 0;
  }
  if (s === 'ACCEPTED' && item.expected_finish_at) {
    var ef = new Date(item.expected_finish_at);
    if (ef < new Date()) return Math.round((now - ef.getTime()) / 3600000);
    return 0;
  }
  if (s === 'REPAIRING_ME' || s === 'REPAIRING_RD' || s === 'IMPROVING') {
    if (item.repair_requested_at) {
      return Math.round((now - new Date(item.repair_requested_at).getTime()) / 3600000);
    }
    return item.dwell_hours;
  }
  if (item.next_maintenance_at) {
    var nm = new Date(item.next_maintenance_at);
    if (nm < new Date()) return Math.round((now - nm.getTime()) / 3600000);
  }
  return item.dwell_hours;
}

function _fixtureOverdueReason(item) {
  var s = item.status;
  if (s === 'IN_USE' && item.expected_return_at && new Date(item.expected_return_at) < new Date())
    return '归还逾期';
  if (s === 'ACCEPTED' && item.expected_finish_at && new Date(item.expected_finish_at) < new Date())
    return '制作超期';
  if (s === 'REPAIRING_ME') return 'ME维修中';
  if (s === 'REPAIRING_RD') return 'RD维修中';
  if (s === 'IMPROVING') return '改善中';
  if (item.next_maintenance_at && new Date(item.next_maintenance_at) < new Date())
    return '保养逾期';
  if (s === 'REQUESTED') return '待接收停留';
  if (s === 'VERIFY_PENDING') return '待验证停留';
  if (s === 'TRANSFERRED') return '待领用停留';
  return '停留中(' + item.stage_cn + ')';
}
```

- [ ] **Step 4: 编写专属样式 module.css**

```css
/* subsystems/workbench/frontend/css/module.css */

.wb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px}
.wb-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.wb-card-total{border-color:var(--brand);border-width:2px}
.wb-card-title{font-size:13px;color:var(--muted);margin-bottom:4px}
.wb-card-num{font-size:28px;font-weight:700;color:var(--text);margin-bottom:6px}
.wb-card-tags{display:flex;gap:4px;flex-wrap:wrap}
.wb-tag{font-size:11px;padding:1px 6px;border-radius:4px;font-weight:600}
.wb-tag-1{color:#d97706;background:#fffbeb}
.wb-tag-2{color:#ea580c;background:#fff7ed}
.wb-tag-3{color:#dc2626;background:#fef2f2}
.wb-badge{font-size:12px;padding:2px 8px;border-radius:4px;font-weight:600;white-space:nowrap}
.wb-type-tag{font-size:11px;padding:1px 6px;border-radius:4px;font-weight:600}
.wb-type-tag.sample{color:var(--brand);background:#f0fdfa}
.wb-type-tag.fixture{color:#7c3aed;background:#f5f3ff}
.wb-row td{padding:10px 12px;border-bottom:1px solid var(--line);font-size:13px}
.filter-select{padding:6px 10px;border:1px solid var(--line);border-radius:6px;font-size:13px;background:#fff;color:var(--text)}
.filter-select:focus{outline:none;border-color:var(--brand)}

@media(max-width:767px){
  .wb-cards{grid-template-columns:repeat(2,1fr)}
  .wb-card-num{font-size:22px}
}
```

- [ ] **Step 5: Commit**

```bash
git add subsystems/workbench/frontend/
git commit -m "feat(workbench): add frontend SPA with dashboard view and overdue calculator"
```

---

### Task 5: 重启验证 + 浏览器回归

- [ ] **Step 1: 重启服务**

```bash
sudo systemctl restart sample-mgmt || pm2 restart sample-mgmt
```

- [ ] **Step 2: 验证子系统已注册**

```bash
curl -s http://localhost:4000/api/subsystems | node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){var a=JSON.parse(d);a.forEach(function(m){console.log(m.id,m.name)})})"
```

预期输出包含: `workbench 全局工作台`

- [ ] **Step 3: 验证 API 返回数据**

```bash
curl -s -c /tmp/cj.txt http://localhost:4000/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' > /dev/null && curl -s -b /tmp/cj.txt http://localhost:4000/api/workbench | node -e "var d='';process.stdin.on('data',function(c){d+=c});process.stdin.on('end',function(){var a=JSON.parse(d);console.log('items:',a.items.length,'depts:',a.byDept.length,'summary:',JSON.stringify(a.summary))})"
```

预期: `items: <数字> depts: <数字> summary: {"total":<数字>}`

- [ ] **Step 4: 浏览器验证**
  - 访问 `http://localhost:4000/portal.html`，确认「全局工作台」卡片出现
  - 点击进入，确认页面正常渲染
  - Console 无 JavaScript 错误
  - Network 无 404/500
  - 摘要卡片统计数字正确
  - 列表包含样品+治具混合数据
  - 积压标签颜色正确（绿/橙/深橙/红）

---

### 验证清单

- [ ] 门户页出现「全局工作台」卡片（通过 /api/subsystems 自动发现）
- [ ] 点击进入后，页面正常加载，无 Console/Network 错误
- [ ] 摘要卡片按部门正确分组统计
- [ ] 统一列表正确显示样品+治具混合数据
- [ ] 积压标签颜色正确
- [ ] 筛选（类型/积压等级）正常工作
- [ ] 排序符合设计（逾期等级→停留时长→类型→编号）
- [ ] 子系统隔离：不修改样品/治具的任何数据
- [ ] 各角色均可访问
