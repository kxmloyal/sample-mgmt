# 样品首页概览对齐治具看板 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将样品「首页概览」对齐治具「看板」风格,统一卡片 class `.kb-stat` + 索引 toggle 交互,治具内联 style 迁出,行为零回退。

**Architecture:** 纯前端改造,9 个文件。核心是一次原子改名(`.dash-stat`→`.kb-stat` 跨 app.css/dashboard.js/dashboard-todo.js/fixture-dashboard.js 同步)+ 样品卡片单击由字符串筛选改索引 toggle(`filterTodo`→`filterKbStat`,跨文件共享 `_kbStats`/`_kbFilter`)+ 治具 fixture.html 内联 style 删除。无 API/DB 变更。

**Tech Stack:** Node.js + Express(后端不动)/ 原生 HTML+CSS+JS 单页 / MariaDB(不动)/ 浏览器回归验证(无前端单测框架,tests/dashboard.test.js 是后端 API 测试)。

**Spec:** [docs/superpowers/specs/2026-08-01-sample-dashboard-align-fixture-design.md](../specs/2026-08-01-sample-dashboard-align-fixture-design.md)

**前置确认:**
- 生产环境 4000 端口(www 用户,宝塔管理),前端用 `?v=版本号` 强制刷新缓存。
- 当前版本号 `20260804`,本次升级到 `20260805`。
- 工作树有大量无关 modified 文件(db/migrations.js、fixture-new.js 等),**每个 Task 仅 `git add` 本 Task 改动的文件,禁用 `git add -A`/`git add .`**,避免混入无关改动。
- 项目无前端单测框架,验证靠 browser_use 双系统回归(5 角色)。

---

## File Structure

| 文件 | 责任 | 本次改动 |
|---|---|---|
| `public/css/app.css` | 全部样式(样品+治具共享) | `.dash-stat`→`.kb-stat`(5处)、`.dash-stats`→`.kb-stats`(2处:128行+164行媒体查询),样式规则体零变化 |
| `public/js/dashboard.js` | 样品看板渲染(卡片+比例条+预警) | 新增 `_kbFilter`/`_kbStats` 变量 + `_renderStats` 保存排序后 stats + 卡片 class 改名 + onclick 改 `filterKbStat` + 新增 `filterKbStat` 函数 |
| `public/js/dashboard-todo.js` | 样品看板待办列表 | 删 `_todoFilter` 变量 + 删 `filterTodo` 函数 + `renderTodo` 重置 `_kbFilter=0` + `_renderTodoTable` 用 `_kbStats[_kbFilter]` + 选择器 `.dash-stat`→`.kb-stat` |
| `public/js/fixture-dashboard.js` | 治具看板渲染 | 卡片 class `.stat`→`.kb-stat` + active ` dash-active`→` active`(仅改名,逻辑零变化) |
| `public/fixture.html` | 治具单页入口 | 删第9-11行内联 `<style>` + 第8行 app.css 加 `?v=20260805` |
| `public/js/router.js` | 样品导航+哈希路由 | NAV `t:'首页概览'`→`'样品看板'` + route meta `dashboard:'首页概览'`→`'样品看板'` |
| `public/js/help.js` | 帮助提示条 | `HELP_PAGE_TIPS.dashboard` 文案「首页概览」→「样品看板」 |
| `public/js/help-data.js` | 帮助数据 | dashboard 模块 `desc` 文案「登录后的首页面板」→「登录后的样品看板」 |
| `public/index.html` | 样品单页入口 | 4 处版本号 `0804`/`0802`→`0805`(app.css/dashboard.js/dashboard-todo.js/router.js) |

**任务分解依据:** class 改名跨 4 文件+fixture.html 必须原子提交(任一文件漏改则卡片失样式或 JS 选择器失配),故 Task 1 合并核心改动;命名(Task 2)独立;版本号(Task 3)随各 Task 同步提交;最后 Task 4 双系统 browser_use 回归。

---

## Task 1: 统一卡片 class `.kb-stat` + 样品索引 toggle 交互(原子提交)

**Files:**
- Modify: `public/css/app.css:128,129,131,132,133,134,164`
- Modify: `public/js/dashboard.js:1-2,48-83,90-96`(新增变量 + `_renderStats` 改 + 新增 `filterKbStat`)
- Modify: `public/js/dashboard-todo.js:4-23,26-45`(删变量/函数 + `_renderTodoTable` 改)
- Modify: `public/js/fixture-dashboard.js:36-37`
- Modify: `public/fixture.html:8-11`
- Modify: `public/index.html:8,62,63`(版本号同步)

**为什么原子:** `.dash-stat`→`.kb-stat` 改名跨 app.css(选择器)+ dashboard.js(渲染 class)+ dashboard-todo.js(active 选择器)+ fixture-dashboard.js(渲染 class)4 处,任一漏改则卡片失样式或 `querySelectorAll('.kb-stat.active')` 失配;`filterTodo`→`filterKbStat` 跨 dashboard.js(调用)+ dashboard-todo.js(定义)2 处,任一漏改则卡片 onclick 报 ReferenceError。必须同 commit 提交。

- [ ] **Step 1.1: 改 `public/css/app.css` class 改名(7 处选择器,样式体零变化)**

用 Edit 工具逐处替换(或 replace_all)。目标:把所有 `.dash-stat` 选择器改为 `.kb-stat`,把 `.dash-stats` 改为 `.kb-stats`。

第128行:
```css
/* 旧 */ .dash-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
/* 新 */ .kb-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
```

第129行:
```css
/* 旧 */ .dash-stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s}
/* 新 */ .kb-stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px;position:relative;overflow:hidden;cursor:pointer;transition:transform .15s,box-shadow .15s}
```

第131行:
```css
/* 旧 */ .dash-stat.active{border-color:var(--stat-color);box-shadow:0 0 0 2px var(--stat-color)}
/* 新 */ .kb-stat.active{border-color:var(--stat-color);box-shadow:0 0 0 2px var(--stat-color)}
```

第132行:
```css
/* 旧 */ .dash-stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--stat-color,var(--brand))}
/* 新 */ .kb-stat::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--stat-color,var(--brand))}
```

第133-134行:
```css
/* 旧 */ .dash-stat .n{font-size:26px;font-weight:700;color:var(--stat-color,var(--brand))}
.dash-stat .l{color:var(--muted);font-size:12px;margin-top:2px}
/* 新 */ .kb-stat .n{font-size:26px;font-weight:700;color:var(--stat-color,var(--brand))}
.kb-stat .l{color:var(--muted);font-size:12px;margin-top:2px}
```

第164行(媒体查询):
```css
/* 旧 */ @media(max-width:767px){.dash-stats{grid-template-columns:repeat(2,1fr)}}
/* 新 */ @media(max-width:767px){.kb-stats{grid-template-columns:repeat(2,1fr)}}
```

**注意**:`.dash-bar`/`.dash-bar-seg`/`.dash-bar-legend`/`.dash-legend`/`.dash-actions`/`.dash-todo-*`/`.dash-alert-*`/`.dash-pager` 这些非卡片类**不改**(本次仅卡片类收敛)。

- [ ] **Step 1.2: 改 `public/js/dashboard.js` — 新增变量 + `_renderStats` 改 + 新增 `filterKbStat`**

(a) 文件头第1-2行注释更新 + 新增模块级变量。在第2行后(第3行 `_dashOverduePager` 前)插入两行:

```javascript
// dashboard.js — 样品看板（统计卡片 + 比例条 + 预警区块 + 错误处理）
// 待办和快捷操作见 dashboard-todo.js（renderTodo 由本文件 viewDashboard 延迟调用）
var _kbFilter = 0;   // 卡片筛选索引：0=总数(默认全部待办)，1..6=STAT_ORDER 排序后各状态
var _kbStats = [];   // _renderStats 填充的排序后 stats 数组 [[label,count,key],...]，供 dashboard-todo.js 查索引→状态键
var _dashOverduePager = { limit: 5, offset: 0, total: 0 };
```

(b) 改 `_renderStats`(第48-83行)。原第59-67行(排序 + cards map):

```javascript
  // 按角色优先级排序卡片（STAT_ORDER 未定义角色用 ADMIN 顺序兜底）
  var order = STAT_ORDER[me.role] || STAT_ORDER.ADMIN;
  stats.sort(function(a, b) { return order.indexOf(a[2]) - order.indexOf(b[2]); });
  var cards = stats.map(function(x) {
    // 卡片单击筛选待办（不跳转），双击下钻样品列表（看该状态全部）
    var f = x[2] === 'total' ? '' : x[2];
    var href = x[2] === 'total' ? '#/samples' : '#/samples?status=' + x[2];
    return '<div class="dash-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterTodo(\'' + f + '\',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
  }).join('');
```

改为:

```javascript
  // 按角色优先级排序卡片（STAT_ORDER 未定义角色用 ADMIN 顺序兜底）
  var order = STAT_ORDER[me.role] || STAT_ORDER.ADMIN;
  stats.sort(function(a, b) { return order.indexOf(a[2]) - order.indexOf(b[2]); });
  _kbStats = stats.slice(); // 保存排序后数组，供 dashboard-todo.js 的 _renderTodoTable 按索引查状态键
  var cards = stats.map(function(x, idx) {
    // 卡片单击索引 toggle 筛选待办（不跳转，再点回退默认），双击下钻样品列表（看该状态全部）
    var href = x[2] === 'total' ? '#/samples' : '#/samples?status=' + x[2];
    return '<div class="kb-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterKbStat(' + idx + ',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
  }).join('');
```

注意:`stats.map` 回调加 `idx` 参数;`onclick` 由 `filterTodo(''+f+'',this)` 改 `filterKbStat(idx,this)`;class 由 `dash-stat` 改 `kb-stat`;删除局部变量 `f`(不再需要,filterKbStat 用索引)。

(c) 改 `_renderStats` 返回行(第82行)。原:

```javascript
  return '<div class="dash-stats">' + cards + '</div><div style="margin-top:12px">' + barHtml + '</div>';
```

改为:

```javascript
  return '<div class="kb-stats">' + cards + '</div><div style="margin-top:12px">' + barHtml + '</div>';
```

(d) 新增 `filterKbStat` 函数。在 `barDrill` 函数(第86-90行)之后、`_renderQuickActions`(第93行)之前插入:

```javascript
// 卡片单击索引式 toggle：点击同一卡片回退到默认(0=总数=全部待办)，否则切换到目标卡片
function filterKbStat(idx, el) {
  _kbFilter = (_kbFilter === idx) ? 0 : idx;
  _todoPager.offset = 0;
  document.querySelectorAll('.kb-stat.active').forEach(function(n){ n.classList.remove('active'); });
  if (el && _kbFilter !== 0) el.classList.add('active');
  if (typeof _renderTodoTable === 'function') _renderTodoTable();
}
```

- [ ] **Step 1.3: 改 `public/js/dashboard-todo.js` — 删变量/函数 + `_renderTodoTable` 改**

(a) 删除第6行 `var _todoFilter = '';`。原第4-6行:

```javascript
var _todoPager = { limit: 10, offset: 0, total: 0 };
var _todoData = [];
var _todoFilter = '';
```

改为:

```javascript
var _todoPager = { limit: 10, offset: 0, total: 0 };
var _todoData = [];
```

(b) 改 `renderTodo`(第9-14行)。原:

```javascript
function renderTodo(d) {
  _todoData = d.myPending || [];
  _todoFilter = '';
  _todoPager.offset = 0;
  _renderTodoTable();
}
```

改为:

```javascript
function renderTodo(d) {
  _todoData = d.myPending || [];
  _kbFilter = 0; // 跨文件重置 dashboard.js 的筛选状态，确保每次 dashboard 加载清空旧筛选
  _todoPager.offset = 0;
  _renderTodoTable();
}
```

(c) **删除整个 `filterTodo` 函数**(第16-23行,含其上注释行第16行):

```javascript
// 点击统计卡片按状态筛选待办（status 空字符串=全部，el=点击的卡片元素用于高亮）
function filterTodo(status, el) {
  _todoFilter = status;
  _todoPager.offset = 0;
  document.querySelectorAll('.dash-stat.active').forEach(function(n){ n.classList.remove('active'); });
  if (el) el.classList.add('active');
  _renderTodoTable();
}
```

(整段删除,逻辑已迁入 dashboard.js 的 `filterKbStat`。)

(d) 改 `_renderTodoTable`(第26-45行,删除 filterTodo 后行号前移)。原第29-30行:

```javascript
  var title = '我的待办（' + (ROLE[me.role] || me.role) + '）' + (_todoFilter ? ' · ' + (STAT_LABELS[_todoFilter] || _todoFilter) : '');
  var filtered = _todoFilter ? _todoData.filter(function(s){ return s.status === _todoFilter; }) : _todoData;
```

改为:

```javascript
  var filterKey = _kbStats[_kbFilter] ? _kbStats[_kbFilter][2] : '';
  if (filterKey === 'total') filterKey = '';
  var title = '我的待办（' + (ROLE[me.role] || me.role) + '）' + (filterKey ? ' · ' + (STAT_LABELS[filterKey] || filterKey) : '');
  var filtered = filterKey ? _todoData.filter(function(s){ return s.status === filterKey; }) : _todoData;
```

注意:`_kbStats`/`_kbFilter` 由 dashboard.js 定义(挂 window 全局),此处跨文件读取。运行时 `viewDashboard` 先调 `_renderStats`(填充 `_kbStats`)再调 `renderTodo`(重置 `_kbFilter=0`),`_kbStats` 已就绪。

- [ ] **Step 1.4: 改 `public/js/fixture-dashboard.js` — 卡片 class 改名(逻辑零变化)**

第36-37行。原:

```javascript
    var isActive = (_dashFilter === i);
    var cls = isActive ? ' dash-active' : '';
    return '<div class="stat' + cls + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></div>';
```

改为:

```javascript
    var isActive = (_dashFilter === i);
    var cls = isActive ? ' active' : '';
    return '<div class="kb-stat' + cls + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></div>';
```

注意:**仅改 class 名与 active class 名**,`filterDashStats/DASH_STATS/_renderDashContent/goFixScan` 等逻辑全不变。

- [ ] **Step 1.5: 改 `public/fixture.html` — 删内联 style + app.css 加版本号**

(a) 删除第9-11行内联 `<style>` 块(共3行,含 `<style>` 与 `</style>` 标签):

```html
<style>
.stat{cursor:pointer;transition:box-shadow .15s,background .15s}.stat:hover{background:#f9fafb}.stat.dash-active{box-shadow:0 0 0 2px var(--brand);background:#eef2ff}
</style>
```

(b) 第8行 app.css 加版本号。原:

```html
<link rel="stylesheet" href="/css/app.css" />
```

改为:

```html
<link rel="stylesheet" href="/css/app.css?v=20260805" />
```

删除内联 style 后,治具卡片由 app.css 的 `.kb-stat` 统一接管(获左侧色条 fallback `var(--brand)` 蓝 + 上浮 hover + active 彩色边框,视觉升级,行为不变)。

- [ ] **Step 1.6: 改 `public/index.html` — 3 处版本号同步**

第8行:
```html
<!-- 旧 --> <link rel="stylesheet" href="/css/app.css?v=20260804" />
<!-- 新 --> <link rel="stylesheet" href="/css/app.css?v=20260805" />
```

第62行:
```html
<!-- 旧 --> <script src="/js/dashboard.js?v=20260804"></script>
<!-- 新 --> <script src="/js/dashboard.js?v=20260805"></script>
```

第63行:
```html
<!-- 旧 --> <script src="/js/dashboard-todo.js?v=20260804"></script>
<!-- 新 --> <script src="/js/dashboard-todo.js?v=20260805"></script>
```

(router.js 第80行版本号在 Task 2 一起改)

- [ ] **Step 1.7: 静态校验**

用 Grep 工具确认无残留:

```
Grep pattern="dash-stat" output_mode=files_with_matches
```
预期:仅 `docs/superpowers/specs/*` 与 `docs/superpowers/plans/*` 历史文档命中,`public/` 下源码 0 命中。

```
Grep pattern="filterTodo" output_mode=files_with_matches
```
预期:仅历史文档命中,`public/` 下源码 0 命中。

```
Grep pattern="dash-active" output_mode=files_with_matches
```
预期:仅历史文档命中,`public/` 下 0 命中(fixture.html 内联 style 已删)。

若 `public/` 下有残留,补 Edit 修复后再提交。

- [ ] **Step 1.8: 启动服务 + 浏览器烟雾验证(样品+治具首页能渲染)**

```bash
cd /www/wwwroot/sample-mgmt && node server.js
```
(若 4000 端口已被生产占用,在另一端口启动:`PORT=4001 node server.js`,然后用 browser_use 访问 `http://localhost:4001`)

用 browser_use 子代理(或手动)访问 `http://localhost:4000/`(样品)与 `http://localhost:4000/fixture.html`(治具),分别登录 admin/admin123,确认:
- 样品首页:7 张卡片渲染正常(左侧色条 + 数字 + 标签),无样式塌陷
- 治具首页:6 张卡片渲染正常(获左侧蓝色色条 + 上浮 hover),无样式塌陷
- 浏览器 Console 无 JS 报错(无 `filterTodo is not defined`/`_kbStats is undefined` 等)

若有报错,回到 Step 1.1-1.6 修复。

- [ ] **Step 1.9: 提交(仅 add 本 Task 改动的 6 个文件)**

```bash
cd /www/wwwroot/sample-mgmt
git add public/css/app.css public/js/dashboard.js public/js/dashboard-todo.js public/js/fixture-dashboard.js public/fixture.html public/index.html
git commit -m "$(cat <<'EOF'
feat(dashboard): 统一卡片class .kb-stat + 样品卡片索引toggle交互

- app.css: .dash-stat→.kb-stat(5处)、.dash-stats→.kb-stats(2处),样式体零变化
- dashboard.js: 新增 _kbFilter/_kbStats, _renderStats 保存排序后stats, 卡片onclick改filterKbStat(idx)
- dashboard-todo.js: 删 _todoFilter/filterTodo, _renderTodoTable 用 _kbStats[_kbFilter] 查状态键, renderTodo 重置 _kbFilter=0
- fixture-dashboard.js: 卡片class .stat→.kb-stat, active dash-active→active(逻辑零变化)
- fixture.html: 删内联style(迁入app.css), app.css加?v=20260805
- index.html: app.css/dashboard.js/dashboard-todo.js 版本号 0804→0805

样品卡片单击改索引toggle(对齐治具filterDashStats),再点回退默认;治具卡片获色条+上浮视觉升级,行为零变化。
EOF
)"
git log --oneline -1
```

- [ ] **Step 1.10: 文件臃肿检测报告(本 Task 改动的 3 个 JS 文件)**

输出 3 项(每文件):
1. 容量:文件类型、有效代码行数、总字符、距上限剩余
2. 元素:顶层函数数/Class 数,是否触发预警(70%/90%)
3. 冗余:未使用导入、废弃代码、可合并重复 + 瘦身方案

**重点预警 `dashboard.js`**:本次后顶层函数 9→10(`filterKbStat` 新增,`filterTodo` 在 dashboard-todo.js 删除),触 10 函数硬上限。需如实标注:本次为等价重构(改名+逻辑迁文件),非追加新业务;提示下版本拆分(如将预警区块 `_renderOverdue`/`_renderDueSoon`/`_renderAlertBlock`/`goOverduePage`/`goDueSoonPage` 抽到独立 `dashboard-alerts.js`)。

---

## Task 2: 命名统一「首页概览」→「样品看板」

**Files:**
- Modify: `public/js/router.js:3,23`
- Modify: `public/js/help.js:10`
- Modify: `public/js/help-data.js:4`
- Modify: `public/index.html:80`(router.js 版本号 0802→0805)

**为什么独立提交:** 命名是纯文案改动,与 Task 1 的 class/逻辑改动正交,独立 commit 便于回滚。

- [ ] **Step 2.1: 改 `public/js/router.js` 导航 + 标题**

第3行(NAV 数组 dashboard 项):
```javascript
/* 旧 */ {k:'dashboard',t:'首页概览',roles:['ADMIN','RD','ME','QA','CUSTODY']},
/* 新 */ {k:'dashboard',t:'样品看板',roles:['ADMIN','RD','ME','QA','CUSTODY']},
```

第23行(route 函数内 meta 对象):
```javascript
/* 旧 */ const meta={dashboard:'首页概览',samples:'样品列表',new:'新建样品',scan:'扫码台',board:'生命周期看板',logs:'操作日志',users:'用户管理'};
/* 新 */ const meta={dashboard:'样品看板',samples:'样品列表',new:'新建样品',scan:'扫码台',board:'生命周期看板',logs:'操作日志',users:'用户管理'};
```

- [ ] **Step 2.2: 改 `public/js/help.js` 提示条文案**

第10行(HELP_PAGE_TIPS.dashboard):
```javascript
/* 旧 */ dashboard:'首页概览：查看统计数据和待办事项',
/* 新 */ dashboard:'样品看板：查看统计数据和待办事项',
```

- [ ] **Step 2.3: 改 `public/js/help-data.js` 帮助模块 desc**

第4行(dashboard 模块):
```javascript
/* 旧 */ id:'dashboard', module:'看板', desc:'登录后的首页面板',
/* 新 */ id:'dashboard', module:'看板', desc:'登录后的样品看板',
```

注意:`module:'看板'` 保持不变(帮助面板里的模块名「看板」与导航「样品看板」语义一致,无需改)。

- [ ] **Step 2.4: 改 `public/index.html` router.js 版本号**

第80行:
```html
<!-- 旧 --> <script src="/js/router.js?v=20260802"></script>
<!-- 新 --> <script src="/js/router.js?v=20260805"></script>
```

- [ ] **Step 2.5: 静态校验**

```
Grep pattern="首页概览" path=/www/wwwroot/sample-mgmt/public output_mode=content -n=true
```
预期:`public/` 下 0 命中(全部改为「样品看板」)。若 `dashboard.js` 文件头注释有「首页概览」也一并改(见 spec 3.1「不改」备注:dashboard.js 文件头注释同步)。

检查 `dashboard.js` 第1行注释:
```javascript
/* 旧 */ // dashboard.js — 首页概览（统计卡片 + 比例条 + 预警区块 + 错误处理）
/* 新 */ // dashboard.js — 样品看板（统计卡片 + 比例条 + 预警区块 + 错误处理）
```
(若 Task 1 Step 1.2(a) 已改,则跳过)

- [ ] **Step 2.6: 浏览器烟雾验证**

用 browser_use 访问样品首页,登录 admin/admin123:
- 左侧导航「样品看板」(非「首页概览」)
- 顶部页面标题「样品看板」
- 帮助提示条「样品看板：查看统计数据和待办事项」(若未被 dismiss)
- 点击右上角「?」打开帮助面板,dashboard 模块 desc「登录后的样品看板」

- [ ] **Step 2.7: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/js/router.js public/js/help.js public/js/help-data.js public/index.html
git commit -m "$(cat <<'EOF'
refactor(dashboard): 首页概览→样品看板命名统一

- router.js: NAV t 与 route meta 文案改
- help.js: HELP_PAGE_TIPS.dashboard 文案改
- help-data.js: dashboard 模块 desc 文案改
- index.html: router.js 版本号 0802→0805

避与样品已有的「生命周期看板」(#/board)重名;治具fixture-api.js label:'看板'保留(子系统隔离)。
EOF
)"
git log --oneline -1
```

- [ ] **Step 2.8: 文件臃肿检测报告**

router.js/help.js/help-data.js 均为文案改动,行数不变,不触预警。简式输出即可。

---

## Task 3: 双系统 browser_use 回归验证(5 角色)

**Files:** 无(纯验证 Task,不提交)

**为什么独立:** 验证 Task 1+2 的合并效果,覆盖 spec 第 7 节全部验证清单。本 Task 不改代码,若发现 bug 则回到 Task 1/2 修复后重新验证。

- [ ] **Step 3.1: 启动/确认服务运行**

确认 4000 端口服务运行中(`curl -s http://localhost:4000/api/health` 应返回 ok)。若未运行:
```bash
cd /www/wwwroot/sample-mgmt && node server.js &
```

- [ ] **Step 3.2: 样品看板回归(5 角色逐个登录验证)**

派 browser_use 子代理,对每个角色执行下表验证。账号:admin/admin123、rd01/rd123、qa01/qa123、mfg01/mfg123、me01/me123。

| 验证项 | 操作 | 预期 |
|---|---|---|
| 导航命名 | 登录后看左侧导航 | 「样品看板」 |
| 页面标题 | 看顶部 topbar | 「样品看板」 |
| 卡片视觉 | 看 7 张卡片 | 左侧色条(按状态着色)+ 上浮 hover + 数字+标签 |
| 卡片单击 | 点 NEW 卡片 | 待办列表筛选为 NEW 状态,卡片 active 高亮(彩色边框) |
| 卡片再点回退 | 再点同一张 NEW 卡片 | 待办列表恢复全部,active 清除 |
| 卡片双击 | 双击 NEW 卡片 | 跳转 `#/samples?status=NEW` 样品列表 |
| 比例条单击 | 点比例条某段 | 跳样品列表 + 段 active 高亮 |
| 待办行单击 | 点待办行 | 弹出样品详情弹窗 |
| 待办"去处理" | 点"去处理"链接 | 跳扫码台,编号自动填充 |
| 待办分页 | (若待办>10)点下一页 | 翻页正常 |
| 待办优先级 | 看待办行左侧 | 红高/黄常规竖条 |
| 预警行单击 | (若有逾期/即将到期)点预警行 | 弹样品详情 |
| 预警"去处理" | 点预警"去处理" | 跳扫码台 |
| 快捷操作 | 看快捷操作按钮组 | 按角色显示(admin:多个, custody:仅扫码台) |
| 卡片顺序 | 看卡片排列 | RD:NEW置顶;QA:PRODUCED置顶;CUSTODY/ME:RELEASED置顶 |
| Console 无报错 | F12 看 Console | 无 JS error |

**重点验证 RD 角色**:RD 的 STAT_ORDER 是 `['total','NEW','PRODUCED','RETURNING','RELEASED','IN_CUSTODY','RETIRED']`,点 idx=1(NEW)→ 待办筛选 NEW;再点 idx=1 → 回退全部;点 idx=2(PRODUCED)→ 待办筛选 PRODUCED。确认索引 toggle 与状态键映射正确。

- [ ] **Step 3.3: 治具看板回归(5 角色逐个登录验证)**

访问 `http://localhost:4000/fixture.html`,5 角色登录。

| 验证项 | 操作 | 预期 |
|---|---|---|
| 导航命名 | 看左侧导航 | 「看板」(保留不变) |
| 内联 style 已删 | 查看页面源码 | `<head>` 内无 `<style>` 块 |
| 卡片视觉升级 | 看 6 张卡片 | 获左侧蓝色色条(fallback var(--brand)) + 上浮 hover + active 彩色边框 |
| 卡片单击 | 点「待验证」卡片 | 待办筛选为 VERIFY_PENDING,卡片 active |
| 卡片再点回退 | 再点同一张 | 待办恢复待处理默认,active 清除 |
| 逾期表 | (若有逾期)看逾期表 | 展示,行单击跳 goFixScan |
| 保养预警表 | (若有保养到期)看预警表 | 展示,行单击跳 goFixScan |
| 待办表 | 看待办表 | 展示,行单击跳 goFixScan |
| MAINTENANCE_DUE 筛选 | 点「待保养」卡片 | 显示保养列表(非常规待办表) |
| Console 无报错 | F12 看 Console | 无 JS error |

- [ ] **Step 3.4: 子系统隔离回归**

| 验证项 | 操作 | 预期 |
|---|---|---|
| 样品列表 | 样品页点「样品列表」 | 列表正常加载 |
| 样品新建 | 样品页点「新建样品+打印码」(RD/admin) | 新建表单正常 |
| 样品扫码台 | 样品页点「扫码台」 | 扫码台正常 |
| 生命周期看板 | 样品页点「生命周期看板」 | 看板正常(注意:此「生命周期看板」非刚改的「样品看板」,是 #/board) |
| 治具清单 | 治具页点「治具清单」 | 列表正常 |
| 治具新建 | 治具页点「新建申请」 | 申请表单正常 |
| 治具扫码台 | 治具页点「扫码台」 | 扫码台正常 |
| 门户入口 | 访问 `/portal.html` | 门户正常,两子系统入口可跳转 |
| 共享弹窗 | 样品/治具任一详情弹窗 | modal.js 弹窗正常 |

- [ ] **Step 3.5: 回归结果汇总**

汇总 3.2/3.3/3.4 的验证结果。若全部通过,标记 Task 3 完成。若有失败项:
- 记录失败项 + 复现步骤 + Console 报错截图
- 回到 Task 1(若涉及 class/逻辑)或 Task 2(若涉及命名)修复
- 修复后重新执行失败项 + 受影响项的验证

- [ ] **Step 3.6: 输出最终臃肿检测报告 + 上线监控提示**

汇总 Task 1.10 + Task 2.8 的臃肿报告,重点标注:
- `dashboard.js`:10 顶层函数触硬上限(等价重构,提示下版本拆分预警区块到 `dashboard-alerts.js`)
- 其他文件均健康

输出上线后 1~3 周期监控提示(按 spec 第 10 节):
- 样品看板:5 角色 toggle/双击/比例条/待办/预警
- 治具看板:5 角色卡片样式升级不破坏 toggle/预警/待办
- CSS 缓存:`app.css?v=20260805` 生效,若报告样式错乱排查浏览器缓存
- 跨文件变量:`_kbStats`/`_kbFilter` 加载顺序依赖 index.html 第62-63行

---

## Self-Review

### 1. Spec 覆盖检查

| Spec 章节 | 覆盖 Task |
|---|---|
| 3.1 命名统一(router/help/help-data) | Task 2.1-2.3 ✓ |
| 3.2 视觉统一(app.css 7处 + fixture.html 删style + fixture-dashboard.js class + dashboard.js class + dashboard-todo.js selector) | Task 1.1, 1.2(c), 1.3(d 间接), 1.4, 1.5 ✓ |
| 3.3 卡片交互(_kbFilter/_kbStats/filterKbStat/renderTodo 重置/_renderTodoTable 改) | Task 1.2, 1.3 ✓ |
| 3.4 保留功能(双击/比例条/viewDetail/分页/优先级/预警/去处理/快捷操作/STAT_ORDER) | Task 3.2 验证清单全覆盖 ✓ |
| 3.5 治具影响(fixture.html/fixture-dashboard.js/app.css) | Task 1.1, 1.4, 1.5 + Task 3.3 验证 ✓ |
| 3.6 版本号(index.html 4处 + fixture.html 1处) | Task 1.6(3处) + Task 2.4(router.js) + Task 1.5(fixture.html) ✓ |
| 7. 验证清单(样品/治具/回归/臃肿) | Task 3.2/3.3/3.4/3.6 ✓ |
| 8.2 dashboard.js 触上限 | Task 1.10 输出报告 ✓ |

无 spec 漏覆盖。

### 2. 占位符扫描

- 无 "TBD"/"TODO"/"implement later"/"add appropriate..." 等。
- 每个 Step 均含具体代码或具体命令。
- 无 "Similar to Task N"(Task 1.3(d) 引用 Task 1.2(d) 但已重复贴出 filterKbStat 代码,不依赖跨 Task 阅读)。

### 3. 类型/签名一致性

- `_kbFilter`:Task 1.2(a) 定义为 `var _kbFilter = 0;`(数字),Task 1.2(d) `filterKbStat(idx, el)` 内 `_kbFilter = (_kbFilter === idx) ? 0 : idx;`(数字),Task 1.3(b) `renderTodo` 内 `_kbFilter = 0;`(数字),Task 1.3(d) `_kbStats[_kbFilter]`(数字索引)。一致 ✓
- `_kbStats`:Task 1.2(a) 定义为 `var _kbStats = [];`(数组),Task 1.2(b) `_kbStats = stats.slice();`(数组赋值),Task 1.3(d) `_kbStats[_kbFilter][2]`(数组索引取第3元素=状态键字符串)。一致 ✓
- `filterKbStat`:Task 1.2(d) 定义 `function filterKbStat(idx, el)`,Task 1.2(b) onclick 调用 `filterKbStat(idx,this)`。签名一致 ✓
- `filterTodo`:Task 1.3(c) 删除,Task 1.2(b) onclick 不再调用。无残留 ✓
- class `.kb-stat`:Task 1.1(app.css 选择器)、1.2(b)(dashboard.js 渲染)、1.3(d 间接,通过 .kb-stat.active 选择器)、1.4(fixture-dashboard.js 渲染)一致 ✓
- class `.kb-stats`:Task 1.1(app.css 128+164行)、1.2(c)(dashboard.js 容器)一致 ✓
- active class:Task 1.2(d) `.kb-stat.active` 选择器、1.4 ` active`(前导空格, fixture-dashboard.js)。一致 ✓

无类型/签名不一致。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-01-sample-dashboard-align-fixture.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - 每 Task 派 fresh general_purpose_task subagent,Task 间审查,fast iteration
2. **Inline Execution** - 在当前 session 用 executing-plans 批量执行,checkpoint 审查

Which approach?
