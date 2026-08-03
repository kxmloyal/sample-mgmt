# 样品 Dashboard 首页概览重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构样品 dashboard 首页概览，补全 dueSoon 预警、加错误处理、角色差异化待办和快捷操作、统计卡片增强、CSS 比例条。

**Architecture:** 后端仅扩展 `/api/dashboard` 返回 `roleActions` 字段（无新增 API）；前端拆分为 `dashboard.js`（主入口+统计+预警）和 `dashboard-todo.js`（待办+快捷操作），新增 `.dash-*` CSS 类。

**Tech Stack:** Node.js + Express（后端）、原生 HTML/CSS/JS（前端）、MariaDB（数据库）

**Spec:** `docs/superpowers/specs/2026-08-01-dashboard-redesign-design.md`

---

## 文件结构

| 文件 | 操作 | 职责 | 预估行数 |
|---|---|---|---|
| `routes/misc.js` | 修改 | `/api/dashboard` 增加 `roleActions` 字段 | ~50 |
| `public/css/app.css` | 修改 | 新增 `.dash-*` 样式类 | +30 行 |
| `public/js/dashboard.js` | 重写 | 主入口：统计卡片+比例条+预警区块+错误处理 | ~200 |
| `public/js/dashboard-todo.js` | 新建 | 角色定制待办+快捷操作+分页 | ~150 |
| `public/index.html` | 修改 | 添加 `dashboard-todo.js` script 标签 | +1 行 |
| `tests/dashboard.test.js` | 新建 | `/api/dashboard` 返回 `roleActions` 的 API 测试 | ~60 |

---

## Task 1: 后端 — /api/dashboard 扩展 roleActions

**Files:**
- Modify: `routes/misc.js:21-33`
- Test: `tests/dashboard.test.js`

- [ ] **Step 1: 写失败测试 — 验证 /api/dashboard 返回 roleActions**

创建 `tests/dashboard.test.js`：

```javascript
const request = require('supertest');
const setup = require('./helpers/setup');

describe('GET /api/dashboard — roleActions', () => {
  it('should return roleActions for ADMIN', async () => {
    const { agent } = await setup.login('admin', 'admin123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.roleActions)).toBe(true);
    expect(res.body.roleActions.length).toBeGreaterThan(0);
    expect(res.body.roleActions[0]).toHaveProperty('t');
    expect(res.body.roleActions[0]).toHaveProperty('h');
  });

  it('should return roleActions for RD with new+scan', async () => {
    const { agent } = await setup.login('rd01', 'rd123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    var labels = res.body.roleActions.map(a => a.t);
    expect(labels).toContain('新建样品');
    expect(labels).toContain('扫码台');
  });

  it('should return roleActions for CUSTODY with only scan', async () => {
    const { agent } = await setup.login('mfg01', 'mfg123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    var labels = res.body.roleActions.map(a => a.t);
    expect(labels).toEqual(['扫码台']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest tests/dashboard.test.js --verbose`
Expected: FAIL — `res.body.roleActions` is undefined

- [ ] **Step 3: 实现 — misc.js 添加 ROLE_ACTIONS 并在响应中返回**

修改 `routes/misc.js`，在 `function register(app) {` 内部、`// 看板` 注释前插入：

```javascript
  // 角色快捷操作映射（dashboard 用）
  var ROLE_ACTIONS = {
    ADMIN: [{t:'新建样品',h:'#/new'},{t:'扫码台',h:'#/scan'},{t:'生命周期看板',h:'#/board'},{t:'用户管理',h:'#/users'}],
    RD: [{t:'新建样品',h:'#/new'},{t:'扫码台',h:'#/scan'}],
    QA: [{t:'扫码台',h:'#/scan'},{t:'生命周期看板',h:'#/board'}],
    ME: [{t:'扫码台',h:'#/scan'},{t:'生命周期看板',h:'#/board'}],
    CUSTODY: [{t:'扫码台',h:'#/scan'}]
  };
```

修改 `res.json` 行（原第 32 行），在 `display_name: u.display_name` 后增加 `roleActions`：

```javascript
    res.json({ byStatus, total, overdue, dueSoon, myPending, role: u.role, dept: u.dept, display_name: u.display_name, roleActions: ROLE_ACTIONS[u.role] || [] });
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest tests/dashboard.test.js --verbose`
Expected: PASS — 3 tests passed

- [ ] **Step 5: 提交**

```bash
git add routes/misc.js tests/dashboard.test.js
git commit -m "feat(dashboard): add roleActions to /api/dashboard response

- 新增 ROLE_ACTIONS 映射（5 个角色）
- /api/dashboard 返回 roleActions 字段
- 向后兼容：仅新增字段，旧前端忽略不受影响"
```

---

## Task 2: CSS — 新增 .dash-* 样式类

**Files:**
- Modify: `public/css/app.css`（在现有 `.stat` 样式后追加）

- [ ] **Step 1: 在 app.css 末尾追加 dashboard 专用样式**

在 `public/css/app.css` 文件末尾追加：

```css
/* ===== Dashboard 专用 ===== */
.dash-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
.dash-stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden}
.dash-stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--stat-color,var(--brand))}
.dash-stat .n{font-size:26px;font-weight:700;color:var(--stat-color,var(--brand))}
.dash-stat .l{color:var(--muted);font-size:12px;margin-top:2px}
.dash-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;margin-top:12px;background:var(--bg)}
.dash-bar-seg{height:100%;cursor:pointer;transition:opacity .2s}
.dash-bar-seg:hover{opacity:.8}
.dash-bar-legend{display:flex;flex-wrap:wrap;gap:8px 16px;margin-top:8px;font-size:12px}
.dash-bar-legend span{display:flex;align-items:center;gap:4px;cursor:pointer}
.dash-bar-legend i{width:10px;height:10px;border-radius:2px;display:inline-block}
.dash-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.dash-actions .btn{padding:8px 18px;font-size:14px}
.dash-todo-pri-high{border-left:3px solid var(--bad);padding-left:8px}
.dash-todo-pri-normal{border-left:3px solid var(--warn);padding-left:8px}
.dash-alert-overdue{border:1px solid #fecaca;background:#fef2f2;border-radius:14px;padding:16px;margin-top:16px}
.dash-alert-overdue h3{margin:0 0 10px;color:var(--bad)}
.dash-alert-soon{border:1px solid #fde68a;background:#fffbeb;border-radius:14px;padding:16px;margin-top:16px}
.dash-alert-soon h3{margin:0 0 10px;color:#b45309}
.dash-pager{display:flex;justify-content:center;align-items:center;gap:10px;padding:10px;font-size:13px}
.dash-pager .btn{padding:4px 12px;font-size:12px}
@media(max-width:767px){.dash-stats{grid-template-columns:repeat(2,1fr)}}
```

- [ ] **Step 2: 提交**

```bash
git add public/css/app.css
git commit -m "style(dashboard): add .dash-* CSS classes for redesigned dashboard

- 统计卡片组 grid 布局 + 主题色左边框
- CSS 比例条 + 图例
- 快捷操作按钮组
- 待办优先级标记（红/黄左边框）
- 逾期(红)/即将到期(黄) 预警区块
- 分页控件样式
- 移动端 2 列适配"
```

---

## Task 3: 前端 — dashboard.js 重构（统计卡片+比例条+预警+错误处理）

**Files:**
- Rewrite: `public/js/dashboard.js`

- [ ] **Step 1: 重写 dashboard.js**

完整重写 `public/js/dashboard.js`：

```javascript
// dashboard.js — 首页概览（统计卡片 + 比例条 + 预警区块 + 错误处理）
// 待办和快捷操作见 dashboard-todo.js
var _dashOverduePager = { limit: 5, offset: 0, total: 0 };
var _dashDueSoonPager = { limit: 5, offset: 0, total: 0 };

// 状态颜色映射（与 .dash-stat::before 配合）
var STAT_COLORS = {
  total: 'var(--brand)', NEW: 'var(--muted)', PRODUCED: 'var(--warn)',
  RELEASED: 'var(--ok)', IN_CUSTODY: 'var(--brand)',
  RETURNING: 'var(--bad)', RETIRED: 'var(--muted)'
};
var STAT_LABELS = {
  NEW: '新建·待制作', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已废弃'
};

async function viewDashboard() {
  var v = $('#view');
  v.innerHTML = '<div class="muted">加载中…</div>';
  try {
    var d = await api('GET', '/api/dashboard');
    var h = '';
    h += _renderStats(d);
    h += _renderQuickActions(d.roleActions || []);
    h += '<div id="dash-todo"></div>';
    h += _renderOverdue(d.overdue || []);
    h += _renderDueSoon(d.dueSoon || []);
    v.innerHTML = h;
    // 待办由 dashboard-todo.js 渲染（延迟调用确保 DOM 就绪）
    if (typeof renderTodo === 'function') renderTodo(d);
  } catch (e) {
    v.innerHTML = '<div class="empty">数据加载失败：' + e(e.message) + ' <a class="link" onclick="viewDashboard()">点击重试</a></div>';
  }
}

// 4.1 统计卡片 + CSS 比例条
function _renderStats(d) {
  var s = d.byStatus || {};
  var stats = [
    ['总数', d.total || 0, 'total'],
    ['新建·待制作', s.NEW || 0, 'NEW'],
    ['制作完成', s.PRODUCED || 0, 'PRODUCED'],
    ['已发行', s.RELEASED || 0, 'RELEASED'],
    ['保管中', s.IN_CUSTODY || 0, 'IN_CUSTODY'],
    ['退回审核中', s.RETURNING || 0, 'RETURNING'],
    ['已废弃', s.RETIRED || 0, 'RETIRED']
  ];
  var cards = stats.map(function(x) {
    return '<div class="dash-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
  }).join('');
  // 比例条
  var total = d.total || 0;
  var segs = '', legend = '';
  if (total > 0) {
    var keys = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'];
    segs = keys.map(function(k) {
      var pct = ((s[k] || 0) / total * 100);
      if (pct < 0.1) return '';
      return '<div class="dash-bar-seg" style="width:' + pct + '%;background:' + (STAT_COLORS[k]) + '" title="' + STAT_LABELS[k] + ': ' + (s[k] || 0) + ' (' + pct.toFixed(1) + '%)" onclick="location.hash=\'#/samples?status=' + k + '\'"></div>';
    }).join('');
    legend = '<div class="dash-bar-legend">' + keys.map(function(k) {
      return '<span onclick="location.hash=\'#/samples?status=' + k + '\'"><i style="background:' + STAT_COLORS[k] + '"></i>' + STAT_LABELS[k] + ' ' + (s[k] || 0) + '</span>';
    }).join('') + '</div>';
  }
  return '<div class="dash-stats">' + cards + '</div><div style="margin-top:12px">' + (total > 0 ? '<div class="dash-bar">' + segs + '</div>' + legend : '') + '</div>';
}

// 4.2 快捷操作（由 dashboard-todo.js 覆盖，此处提供 fallback）
function _renderQuickActions(actions) {
  if (!actions || !actions.length) return '';
  var btns = actions.map(function(a) {
    return '<button class="btn" onclick="location.hash=\'' + a.h + '\'">' + a.t + '</button>';
  }).join('');
  return '<div class="dash-actions" style="margin-top:16px">' + btns + '</div>';
}

// 4.4 复检逾期预警（分页 5 条/页）
function _renderOverdue(list) {
  _dashOverduePager.total = list.length;
  _dashOverduePager.offset = 0;
  return _renderAlertBlock('overdue', '⚠ 复检逾期', list, _dashOverduePager, 'goOverduePage', true);
}
function goOverduePage(page) {
  _dashOverduePager.offset = (page - 1) * _dashOverduePager.limit;
  var box = $('#dash-overdue');
  if (box) box.outerHTML = _renderAlertBlock('overdue', '⚠ 复检逾期', _dashOverdueData, _dashOverduePager, 'goOverduePage', true);
}
var _dashOverdueData = [];

// 4.5 即将到期预警（分页 5 条/页）
function _renderDueSoon(list) {
  _dashDueSoonPager.total = list.length;
  _dashDueSoonPager.offset = 0;
  return _renderAlertBlock('soon', '⏰ 即将到期·7天内', list, _dashDueSoonPager, 'goDueSoonPage', false);
}
function goDueSoonPage(page) {
  _dashDueSoonPager.offset = (page - 1) * _dashDueSoonPager.limit;
  var box = $('#dash-soon');
  if (box) box.outerHTML = _renderAlertBlock('soon', '⏰ 即将到期·7天内', _dashDueSoonData, _dashDueSoonPager, 'goDueSoonPage', false);
}
var _dashDueSoonData = [];

// 预警区块通用渲染
function _renderAlertBlock(type, title, list, pager, pageFn, isOverdue) {
  if (isOverdue) { _dashOverdueData = list; } else { _dashDueSoonData = list; }
  if (!list.length) return '';
  var cls = type === 'overdue' ? 'dash-alert-overdue' : 'dash-alert-soon';
  var pageList = list.slice(pager.offset, pager.offset + pager.limit);
  var rows = pageList.map(function(s) {
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    var dateCls = isOverdue ? 'b-overdue' : 'muted';
    var dateStyle = isOverdue ? 'font-weight:700' : '';
    return '<tr><td>' + e(s.sample_no) + '</td><td>' + e(s.name || '—') + '</td><td>' + img + '</td><td>' + e(s.custody_dept || '—') + '</td><td>' + e(s.storage_location || '—') + '</td><td class="' + dateCls + '" style="' + dateStyle + '">' + fmt(s.next_inspect_at) + '</td><td><a class="link" onclick="goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(pager, pageFn);
  return '<div class="' + cls + '" id="dash-' + type + '"><h3>' + title + '（' + list.length + '）</h3><div style="overflow-x:auto"><table><tr><th>编号</th><th>名称</th><th>图片</th><th>保管部门</th><th>储位</th><th>' + (isOverdue ? '应复检日' : '到期日') + '</th><th>操作</th></tr>' + rows + '</table></div>' + pagerHtml + '</div>';
}

// 分页控件
function _renderPager(pager, pageFn) {
  if (pager.total <= pager.limit) return '';
  var totalPages = Math.ceil(pager.total / pager.limit);
  var currentPage = Math.floor(pager.offset / pager.limit) + 1;
  return '<div class="dash-pager"><button class="btn sm" ' + (pager.offset === 0 ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage - 1) + ')">← 上一页</button><span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + pager.total + '</b> 条</span><button class="btn sm" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage + 1) + ')">下一页 →</button></div>';
}
```

- [ ] **Step 2: 语法检查**

Run: `node -c public/js/dashboard.js`
Expected: 无输出（语法正确）

- [ ] **Step 3: 提交**

```bash
git add public/js/dashboard.js
git commit -m "feat(dashboard): rewrite dashboard.js with stats+proportion bar+alerts

- 7 个统计卡片（1 总数+6 状态）带主题色左边框
- CSS 比例条展示状态分布，点击跳转对应列表
- 复检逾期预警（红色区块，5 条/页分页）
- 即将到期预警（黄色区块，使用 dueSoon 数据）
- try-catch 错误处理，失败显示点击重试"
```

---

## Task 4: 前端 — dashboard-todo.js 新建（角色定制待办+快捷操作）

**Files:**
- Create: `public/js/dashboard-todo.js`

- [ ] **Step 1: 创建 dashboard-todo.js**

```javascript
// dashboard-todo.js — Dashboard 待办列表 + 快捷操作（角色定制）
var _todoPager = { limit: 10, offset: 0, total: 0 };
var _todoData = [];

// 渲染快捷操作（覆盖 dashboard.js 的 fallback，使用更丰富的样式）
function _renderQuickActionsRich(actions) {
  if (!actions || !actions.length) return '';
  var btns = actions.map(function(a) {
    return '<button class="btn" onclick="location.hash=\'' + a.h + '\'">' + a.t + '</button>';
  }).join('');
  return '<div class="dash-actions" style="margin-top:16px">' + btns + '</div>';
}

// 渲染待办列表（由 dashboard.js 的 viewDashboard 调用）
function renderTodo(d) {
  // 覆盖快捷操作
  var actionsBox = document.querySelector('.dash-actions');
  if (actionsBox && d.roleActions) {
    actionsBox.outerHTML = _renderQuickActionsRich(d.roleActions);
  }
  // 渲染待办
  _todoData = d.myPending || [];
  _todoPager.total = _todoData.length;
  _todoPager.offset = 0;
  _renderTodoTable();
}

function _renderTodoTable() {
  var box = $('#dash-todo');
  if (!box) return;
  if (!_todoData.length) {
    box.innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）</h3><div class="empty">暂无待办</div></div>';
    return;
  }
  var pageList = _todoData.slice(_todoPager.offset, _todoPager.offset + _todoPager.limit);
  var rows = pageList.map(function(s) {
    var info = _getTodoInfo(s);
    return '<tr><td class="' + info.cls + '">' + e(s.sample_no) + '</td><td>' + e(s.name || '—') + '</td><td>' + ((s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—') + '</td><td class="muted">' + e(s.spec || '—') + '</td><td class="' + info.cls + '">' + info.type + '</td><td>' + statusBadge(s) + '</td><td><a class="link" onclick="goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = '';
  if (_todoPager.total > _todoPager.limit) {
    var totalPages = Math.ceil(_todoPager.total / _todoPager.limit);
    var currentPage = Math.floor(_todoPager.offset / _todoPager.limit) + 1;
    pagerHtml = '<div class="dash-pager"><button class="btn sm" ' + (_todoPager.offset === 0 ? 'disabled' : '') + ' onclick="goTodoPage(' + (currentPage - 1) + ')">← 上一页</button><span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + _todoPager.total + '</b> 条</span><button class="btn sm" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goTodoPage(' + (currentPage + 1) + ')">下一页 →</button></div>';
  }
  box.innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）</h3><div style="overflow-x:auto"><table><tr><th>编号</th><th>名称</th><th>图片</th><th>规格</th><th>待办类型</th><th>状态</th><th>操作</th></tr>' + rows + '</table></div>' + pagerHtml + '</div>';
}

function goTodoPage(page) {
  _todoPager.offset = (page - 1) * _todoPager.limit;
  _renderTodoTable();
}

// 根据角色和状态获取待办类型+优先级样式
function _getTodoInfo(s) {
  var type = '', cls = 'dash-todo-pri-normal';
  if (s.status === 'NEW') { type = '待制作确认'; if (me.role === 'RD' || me.role === 'ADMIN') cls = 'dash-todo-pri-high'; }
  else if (s.status === 'PRODUCED') { type = '待发行'; if (me.role === 'QA' || me.role === 'ADMIN') cls = 'dash-todo-pri-high'; }
  else if (s.status === 'RELEASED') { type = '待接收'; cls = 'dash-todo-pri-normal'; }
  else if (s.status === 'RETURNING') {
    if (me.role === 'RD' && String(s.retire_assigned_rd) === String(me.id)) { type = '待重做'; cls = 'dash-todo-pri-high'; }
    else if (me.role === 'QA') { type = '待审核退回'; cls = 'dash-todo-pri-high'; }
    else { type = '退回审核中'; cls = 'dash-todo-pri-normal'; }
  }
  return { type: type, cls: cls };
}
```

- [ ] **Step 2: 语法检查**

Run: `node -c public/js/dashboard-todo.js`
Expected: 无输出（语法正确）

- [ ] **Step 3: 提交**

```bash
git add public/js/dashboard-todo.js
git commit -m "feat(dashboard): add dashboard-todo.js for role-specific todo+actions

- 角色快捷操作按钮（ADMIN 4个/RD 2个/QA·ME 2个/CUSTODY 1个）
- 角色定制待办列表（RD/QA 紧急红色，CUSTODY/ME 常规黄色）
- 待办分页（10 条/页）
- 优先级左边框标记（红=紧急/黄=常规）"
```

---

## Task 5: index.html — 添加 dashboard-todo.js 引用

**Files:**
- Modify: `public/index.html:62`（在 dashboard.js 后添加 dashboard-todo.js）

- [ ] **Step 1: 添加 script 标签**

修改 `public/index.html`，在 `<script src="/js/dashboard.js"></script>` 行后添加：

```html
<script src="/js/dashboard.js?v=20260801"></script>
<script src="/js/dashboard-todo.js?v=20260801"></script>
```

注意：同时给 `dashboard.js` 添加版本号 `?v=20260801`（强制浏览器加载新版本）。

- [ ] **Step 2: 提交**

```bash
git add public/index.html
git commit -m "feat(dashboard): add dashboard-todo.js script tag with cache-busting version

- 添加 dashboard-todo.js 引用
- 给 dashboard.js 加 ?v=20260801 版本号强制刷新缓存"
```

---

## Task 6: 验证 — 双系统回归 + 文件臃肿检测

**Files:** 无修改，仅验证

- [ ] **Step 1: 重启服务器**

```bash
# 通过宝塔/sudo 重启（www 用户运行）
# 或测试环境直接启动
cd /www/wwwroot/sample-mgmt && PORT=4001 node server.js &
```

- [ ] **Step 2: API 验证**

```bash
# 登录获取 cookie
curl -s -c /tmp/ck.txt -X POST http://localhost:4001/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}'

# 验证 roleActions
curl -s -b /tmp/ck.txt http://localhost:4001/api/dashboard | python3 -c "import sys,json; d=json.load(sys.stdin); print('roleActions:', d.get('roleActions')); print('dueSoon count:', len(d.get('dueSoon',[]))); print('overdue count:', len(d.get('overdue',[])))"
```

Expected: roleActions 数组非空，dueSoon 和 overdue 有数据

- [ ] **Step 3: 5 个角色验证**

分别用 admin/admin123, rd01/rd123, qa01/qa123, me01/me123, mfg01/mfg123 登录，访问 dashboard，检查：
- 统计卡片显示 7 个
- 比例条显示各状态占比
- 快捷操作按钮按角色显示
- 待办列表按角色过滤
- 复检逾期区块（如有逾期数据）
- 即将到期区块（如有即将到期数据）

- [ ] **Step 4: 治具 dashboard 回归验证**

```bash
curl -s -b /tmp/ck.txt http://localhost:4001/api/fixtures/dashboard | python3 -c "import sys,json; d=json.load(sys.stdin); print('keys:', list(d.keys())); print('total:', d.get('total'))"
```

Expected: 治具 dashboard 正常返回，不受样品 dashboard 变更影响

- [ ] **Step 5: 文件臃肿检测**

```bash
for f in routes/misc.js public/js/dashboard.js public/js/dashboard-todo.js; do
  lines=$(wc -l < "$f"); chars=$(wc -c < "$f")
  echo "$f: ${lines} lines, ${chars} chars"
done
```

Expected:
- `routes/misc.js`: ~50 行 / 400 上限 = 13%
- `public/js/dashboard.js`: ~95 行 / 300 上限 = 32%（实际可能更少，因单行压缩风格）
- `public/js/dashboard-todo.js`: ~75 行 / 300 上限 = 25%

- [ ] **Step 6: 最终提交（如有修复）**

```bash
git add -A
git commit -m "fix(dashboard): regression fixes from testing" || echo "No fixes needed"
```

---

## 自审检查

**Spec 覆盖率**:
- [x] 4.1 统计卡片组 → Task 3 `_renderStats`
- [x] 4.2 角色快捷操作 → Task 1 后端 + Task 4 前端
- [x] 4.3 我的待办（定制） → Task 4 `renderTodo` + `_getTodoInfo`
- [x] 4.4 复检逾期预警 → Task 3 `_renderOverdue` + `goOverduePage`
- [x] 4.5 即将到期预警 → Task 3 `_renderDueSoon` + `goDueSoonPage`
- [x] 4.6 错误处理 → Task 3 `viewDashboard` try-catch
- [x] 后端 roleActions → Task 1
- [x] CSS 样式 → Task 2
- [x] index.html 引用 → Task 5
- [x] 子系统隔离验证 → Task 6 Step 4
- [x] 文件臃肿检测 → Task 6 Step 5

**Placeholder 扫描**: 无 TBD/TODO，所有代码步骤包含完整代码。

**类型一致性**: `renderTodo(d)` 在 Task 3 dashboard.js 中调用、Task 4 dashboard-todo.js 中定义，签名一致。`goTodoPage`/`goOverduePage`/`goDueSoonPage` 命名一致。
