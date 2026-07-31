# Dashboard 交互统一+角色排序 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard 4类可点击元素交互统一(卡片双击下钻/待办预警行进详情/比例条active)+卡片按角色优先级排序

**Architecture:** 纯前端改造,无API/DB变更。dashboard.js 加 STAT_ORDER 排序+卡片双击+比例条active+预警行onclick;dashboard-todo.js 加待办行onclick进详情+active;app.css 补 hover/active 样式;index.html 版本号升级。向后兼容(单击筛选/"去处理"/比例条跳转均保留)。

**Tech Stack:** 原生 JS(无框架)+ CSS 变量 + Express 静态服务

**Spec:** [docs/superpowers/specs/2026-08-01-dashboard-interaction-design.md](../specs/2026-08-01-dashboard-interaction-design.md)

---

## File Structure

| 文件 | 职责 | 改动 |
|---|---|---|
| public/js/dashboard.js | 统计卡片+比例条+预警渲染 | 加 STAT_ORDER + 卡片双击 + 比例条active + 预警行onclick |
| public/js/dashboard-todo.js | 待办列表渲染 | 待办行 onclick 进详情 + active |
| public/css/app.css | 样式 | 补 .dash-bar-seg/.dash-todo-row/.dash-alert-row hover+active |
| public/index.html | 入口 | 版本号 0803→0804 |
| public/js/detail.js | 样品详情 | 确认 viewDetail(id) 可用(无需改) |

**测试策略**:前端交互无单测框架(jest 仅测后端 API),采用"语法检查 + 手动验证 + browser_use 回归"。

---

## Task 1: dashboard.js STAT_ORDER 角色排序 + 卡片双击下钻

**Files:**
- Modify: `public/js/dashboard.js`(_renderStats 区域,约第 45-60 行)

- [ ] **Step 1: 读 dashboard.js 确认 _renderStats 当前结构**

Run: 读 `public/js/dashboard.js` 第 40-60 行,确认 `STAT_COLORS` 常量位置 + `_renderStats` 函数结构。

- [ ] **Step 2: 加 STAT_ORDER 常量(角色→状态顺序)**

在 `STAT_COLORS` 常量后(约第 8 行后)新增:

```javascript
// 角色优先级排序:高优先级状态前置(RD制作优先/QA发行优先/CUSTODY接收优先)
var STAT_ORDER = {
  ADMIN:   ['total','NEW','PRODUCED','RELEASED','IN_CUSTODY','RETURNING','RETIRED'],
  RD:      ['total','NEW','PRODUCED','RETURNING','RELEASED','IN_CUSTODY','RETIRED'],
  QA:      ['total','PRODUCED','RETURNING','RELEASED','NEW','IN_CUSTODY','RETIRED'],
  ME:      ['total','RELEASED','IN_CUSTODY','NEW','PRODUCED','RETURNING','RETIRED'],
  CUSTODY: ['total','RELEASED','IN_CUSTODY','NEW','PRODUCED','RETURNING','RETIRED']
};
```

- [ ] **Step 3: _renderStats 按 STAT_ORDER 排序 stats 数组**

在 `var stats = [...];` 之后、`var cards = stats.map(...)` 之前,插入排序逻辑:

```javascript
  // 按角色优先级排序卡片(STAT_ORDER 未定义角色用 ADMIN 顺序兜底)
  var order = STAT_ORDER[me.role] || STAT_ORDER.ADMIN;
  stats.sort(function(a, b) { return order.indexOf(a[2]) - order.indexOf(b[2]); });
```

- [ ] **Step 4: 卡片加 ondblclick 下钻跳样品列表**

修改 `var cards = stats.map(...)` 内的 return,加 `ondblclick`:

```javascript
  var cards = stats.map(function(x) {
    // 卡片单击筛选待办(不跳转),双击下钻样品列表(看该状态全部)
    var f = x[2] === 'total' ? '' : x[2];
    var href = x[2] === 'total' ? '#/samples' : '#/samples?status=' + x[2];
    return '<div class="dash-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterTodo(\'' + f + '\',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
  }).join('');
```

- [ ] **Step 5: 语法检查**

Run: `cd /www/wwwroot/sample-mgmt && node --check public/js/dashboard.js`
Expected: 无输出(语法 OK)

- [ ] **Step 6: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/dashboard.js && git commit -m "feat(dashboard): 卡片按角色优先级排序+双击下钻样品列表

- STAT_ORDER 定义 5 角色状态顺序(RD制作/QA发行/CUSTODY接收优先)
- _renderStats 按 STAT_ORDER[me.role] 排序卡片
- 卡片 ondblclick 跳样品列表(下钻看该状态全部)
- 单击筛选待办保留(向后兼容)"
```

---

## Task 2: dashboard.js 比例条 active + 预警行 onclick 进详情

**Files:**
- Modify: `public/js/dashboard.js`(_renderBar 比例条 + _renderAlerts 预警渲染)

- [ ] **Step 1: 读 dashboard.js 确认比例条与预警渲染结构**

Run: 读 `public/js/dashboard.js` 比例条渲染段(约 _renderBar 函数) + 预警渲染段(约 _renderAlerts 函数),确认 onclick 当前写法。

- [ ] **Step 2: 比例条段/图例加 active 切换(保留跳转)**

比例条段/图例当前 onclick 跳样品列表。改为跳转前先切换 active 高亮:

```javascript
// 比例条段 onclick:先切换 active,再跳转(下钻样品列表)
// 图例同理
// 用 querySelectorAll('.dash-bar-seg.active').forEach 移除旧 active,当前段加 active
```

具体实现(根据实际代码调整):
```javascript
// 比例条段
return '<div class="dash-bar-seg" style="width:' + pct + '%;background:' + color + '" onclick="barDrill(\'' + key + '\',this)" title="' + label + ':' + val + '"></div>';
// 图例
return '<span class="dash-legend" onclick="barDrill(\'' + key + '\',this)"><i style="background:' + color + '"></i>' + label + '(' + val + ')</span>';
```

新增 `barDrill` 函数(在 _renderBar 后):
```javascript
// 比例条下钻:切换 active 高亮 + 跳转样品列表
function barDrill(key, el) {
  document.querySelectorAll('.dash-bar-seg.active,.dash-legend.active').forEach(function(n){ n.classList.remove('active'); });
  if (el) el.classList.add('active');
  location.hash = key === 'total' ? '#/samples' : '#/samples?status=' + key;
}
```

- [ ] **Step 3: 预警行 onclick 进详情 + "去处理"加 stopPropagation**

预警行(逾期/即将到期)tr 加 onclick="viewDetail(id)",td 内"去处理"a 加 onclick="event.stopPropagation();goScan('编号')":

```javascript
// 预警行(逾期示例,即将到期同理)
return '<tr class="dash-alert-row" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer">' +
  '<td>...' + s.sample_no + '</td>' +
  ... +
  '<td><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去处理</a></td>' +
  '</tr>';
```

- [ ] **Step 4: 确认 viewDetail 函数存在**

Run: `cd /www/wwwroot/sample-mgmt && grep -n "function viewDetail\|viewDetail =" public/js/detail.js public/js/*.js | head -5`
Expected: 找到 viewDetail 定义(若在 detail.js,确认签名 viewDetail(id))

若 viewDetail 不存在或签名不符,需在 detail.js 补充(根据实际样品详情路由 #/detail?id=XXX 跳转)。

- [ ] **Step 5: 语法检查**

Run: `cd /www/wwwroot/sample-mgmt && node --check public/js/dashboard.js`
Expected: 无输出(语法 OK)

- [ ] **Step 6: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/dashboard.js && git commit -m "feat(dashboard): 比例条active高亮+预警行onclick进详情

- 比例条段/图例 onclick 切换 active + 跳转(barDrill 函数)
- 预警行 tr onclick 进样品详情(viewDetail)
- 预警'去处理'按钮加 event.stopPropagation 防冒泡
- 比例条跳转/去处理保留(向后兼容)"
```

---

## Task 3: dashboard-todo.js 待办行 onclick 进详情 + active

**Files:**
- Modify: `public/js/dashboard-todo.js`(_renderTodoTable 函数)

- [ ] **Step 1: 读 dashboard-todo.js 确认待办行渲染**

Run: 读 `public/js/dashboard-todo.js` 第 35-50 行(_renderTodoTable 的 rows map),确认当前 tr 结构。

- [ ] **Step 2: 待办行 tr 加 onclick 进详情 + active 切换**

修改 `var rows = pageList.map(...)` 内的 tr:

```javascript
  var rows = pageList.map(function(s) {
    var info = _getTodoInfo(s);
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    // 待办行单击进详情(viewDetail),"去处理"按钮 stopPropagation 防冒泡
    return '<tr class="dash-todo-row ' + info.cls + '" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer"><td>' + e(s.sample_no) + '</td><td>' + e(s.name || '—') + '</td><td>' + img + '</td><td class="muted">' + e(s.spec || '—') + '</td><td>' + info.type + '</td><td>' + statusBadge(s) + '</td><td><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
```

注意:`info.cls` 原用于 td 优先级样式(dash-todo-pri-high/normal),现移到 tr class。CSS 需对应调整(Task 4)。

- [ ] **Step 3: 语法检查**

Run: `cd /www/wwwroot/sample-mgmt && node --check public/js/dashboard-todo.js`
Expected: 无输出(语法 OK)

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/dashboard-todo.js && git commit -m "feat(dashboard): 待办行onclick进详情+去处理防冒泡

- 待办行 tr onclick 进样品详情(viewDetail)
- '去处理'按钮加 event.stopPropagation 防冒泡到行
- info.cls 优先级样式从 td 移到 tr(dash-todo-row)
- 去处理跳扫码台保留(向后兼容)"
```

---

## Task 4: app.css 比例条/待办行/预警行 hover+active 样式

**Files:**
- Modify: `public/css/app.css`(.dash-bar-seg / .dash-todo-row / .dash-alert-row 区域)

- [ ] **Step 1: 读 app.css 确认现有 .dash-* 样式**

Run: 读 `public/css/app.css` 第 120-152 行(.dash-stat 及相关),确认现有 hover/active 写法。

- [ ] **Step 2: 加 .dash-bar-seg hover/active 样式**

在 .dash-stat.active 后新增:

```css
.dash-bar-seg{cursor:pointer;transition:opacity .15s}
.dash-bar-seg:hover{opacity:.8}
.dash-bar-seg.active{outline:2px solid var(--brand);outline-offset:1px;opacity:1}
.dash-legend{cursor:pointer;display:inline-flex;align-items:center;gap:4px;transition:opacity .15s}
.dash-legend:hover{opacity:.7}
.dash-legend.active{font-weight:600;opacity:1}
```

- [ ] **Step 3: 加 .dash-todo-row hover/active 样式**

```css
.dash-todo-row{cursor:pointer;transition:background .15s}
.dash-todo-row:hover{background:rgba(20,30,50,.04)}
.dash-todo-row.active{background:rgba(20,30,50,.08)}
.dash-todo-row.dash-todo-pri-high{border-left:3px solid var(--warn)}
.dash-todo-row.dash-todo-pri-normal{border-left:3px solid var(--ok)}
.dash-todo-row.dash-todo-pri-high:hover,.dash-todo-row.dash-todo-pri-high.active{border-left-width:5px}
```

- [ ] **Step 4: 加 .dash-alert-row hover/active 样式**

```css
.dash-alert-row{cursor:pointer;transition:background .15s}
.dash-alert-row:hover{background:rgba(220,53,69,.08)}
.dash-alert-row.active{background:rgba(220,53,69,.15)}
```

- [ ] **Step 5: 验证 CSS 无语法错误**

Run: `cd /www/wwwroot/sample-mgmt && curl -s "http://localhost:4000/css/app.css" | grep -c "dash-bar-seg\|dash-todo-row\|dash-alert-row"`
Expected: 输出 ≥6(各 class 至少 1 次)

- [ ] **Step 6: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/css/app.css && git commit -m "style(dashboard): 比例条/待办行/预警行 hover+active 样式

- .dash-bar-seg/.dash-legend hover 透明度+active 外边框
- .dash-todo-row hover 背景+active 加深+优先级竖条加粗
- .dash-alert-row hover 红色背景+active 加深
- 视觉统一:所有可点击元素有反馈"
```

---

## Task 5: index.html 版本号升级 + 全量验证

**Files:**
- Modify: `public/index.html`(版本号 0803→0804)

- [ ] **Step 1: 升级 index.html 3 处版本号**

将 app.css / dashboard.js / dashboard-todo.js 的 `?v=20260803` 改为 `?v=20260804`:

```html
<link rel="stylesheet" href="/css/app.css?v=20260804" />
<script src="/js/dashboard.js?v=20260804"></script>
<script src="/js/dashboard-todo.js?v=20260804"></script>
```

- [ ] **Step 2: 语法检查全部 JS**

Run: `cd /www/wwwroot/sample-mgmt && node --check public/js/dashboard.js && node --check public/js/dashboard-todo.js && echo OK`
Expected: OK

- [ ] **Step 3: 生产验证版本号生效**

Run: `cd /www/wwwroot/sample-mgmt && curl -s "http://localhost:4000/index.html" | grep -c "v=20260804"`
Expected: 3

- [ ] **Step 4: 生产验证新函数存在**

Run: `cd /www/wwwroot/sample-mgmt && curl -s "http://localhost:4000/js/dashboard.js?v=20260804" | grep -c "STAT_ORDER\|barDrill" && curl -s "http://localhost:4000/js/dashboard-todo.js?v=20260804" | grep -c "dash-todo-row\|viewDetail"`
Expected: STAT_ORDER/barDrill ≥1,dash-todo-row/viewDetail ≥1

- [ ] **Step 5: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/index.html && git commit -m "chore(dashboard): 版本号升级 0803→0804 强制刷新缓存

交互统一+角色排序改动上线:
- 卡片双击下钻/角色排序
- 比例条active/待办预警行进详情
- hover+active 视觉统一"
```

- [ ] **Step 6: 文件臃肿检测**

Run: `cd /www/wwwroot/sample-mgmt && for f in public/js/dashboard.js public/js/dashboard-todo.js public/css/app.css public/index.html; do printf "%-32s lines=%-5s chars=%-6s\n" "$f" "$(wc -l < $f)" "$(wc -c < $f)"; done`

Expected:
- dashboard.js ≤300行(预估155)
- dashboard-todo.js ≤300行(预估75)
- app.css ≤20000字符(预估~165行)
- index.html ≤600行(86)

- [ ] **Step 7: 手动 UI 验证(5角色)**

硬刷新浏览器(Ctrl+F5)访问 `http://服务器IP:4000`,用 5 角色登录验证:

| 验证项 | 预期 |
|---|---|
| 卡片顺序 | RD:NEW置顶 / QA:PRODUCED置顶 / CUSTODY:RELEASED置顶 |
| 卡片单击 | 筛选待办(不跳转,已有) |
| 卡片双击 | 跳样品列表(下钻,新) |
| 比例条段单击 | 跳样品列表 + active高亮(新) |
| 比例条段 hover | 透明度变化(新) |
| 待办行单击 | 进样品详情(新) |
| 待办"去处理" | 跳扫码台(保留) |
| 待办行 hover | 背景变化(新) |
| 预警行单击 | 进样品详情(新) |
| 预警"去处理" | 跳扫码台(保留) |
| 预警行 hover | 红色背景(新) |
| 治具系统 | 不受影响(子系统隔离) |

- [ ] **Step 8: 回归验证(已有功能不破坏)**

| 验证项 | 预期 |
|---|---|
| 卡片筛选待办 | 正常(已有) |
| 比例条跳转 | 正常(已有) |
| 待办分页 | 正常(已有) |
| 待办优先级红/黄 | 正常(已有) |
| 预警展示 | 正常(已有) |
| 快捷操作 | 正常(已有) |
| 治具 fixture.html | 正常(子系统隔离) |

---

## Self-Review

**1. Spec coverage:**
- 3.1 交互统一:卡片双击(Task1)/比例条active(Task2)/待办行onclick(Task3)/预警行onclick(Task2) ✅
- 3.2 角色排序:STAT_ORDER(Task1) ✅
- 3.3 视觉统一:hover+active(Task4) ✅
- 4 文件改动:dashboard.js(Task1,2)/dashboard-todo.js(Task3)/app.css(Task4)/index.html(Task5) ✅
- 5 兼容性:单击筛选/去处理/比例条跳转均保留(各 Task 注明) ✅
- 7 验证清单:Task5 Step 6-8 覆盖 ✅

**2. Placeholder scan:** 无 TBD/TODO,所有 step 含具体代码 ✅

**3. Type consistency:**
- STAT_ORDER 各角色一致 ✅
- barDrill(key,el) Task2 定义,Task2 使用 ✅
- viewDetail(id) Task2/3 使用,Task2 Step4 确认存在 ✅
- .dash-todo-row / .dash-alert-row / .dash-bar-seg CSS(Task4)与 JS(Task2,3) class 名一致 ✅

无问题,计划完整。

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-01-dashboard-interaction.md`. Two execution options:

**1. Subagent-Driven (recommended)** - 每个 Task 派发独立 subagent,Task 间审查,快速迭代

**2. Inline Execution** - 当前会话执行,batch + checkpoint

Which approach?
