# 样品首页概览对齐治具看板设计(方案A:轻量看板化)

> 日期: 2026-08-01
> 状态: 待用户审核
> 前置: 2026-08-01-dashboard-redesign(已完成)、2026-08-01-dashboard-interaction(已完成:双击下钻+比例条active+STAT_ORDER角色排序+待办/预警行onclick)
> brainstorming: 已完成(3方案对比 → 用户选方案A → 8节详细设计全部确认)

## 1. 背景与问题

样品子系统首页(`router.js` 导航「首页概览」/`viewDashboard`/`#/dashboard`)与治具子系统首页(`fixture-api.js` 导航「看板」/`renderFixtureDashboard`/`#/dashboard`)同为"统计卡片 + 待办 + 预警"结构,但实现风格不统一:

1. **命名不统一**:样品叫"首页概览",治具叫"看板",用户认知割裂
2. **卡片样式不统一**:样品用 `.dash-stat`(左侧色条 `::before` + 上浮 hover + 彩色 active 边框,精致);治具用 `.stat`(通用扁平) + `fixture.html` 第10行内联 `<style>` 补 `.dash-active`(简陋)
3. **卡片交互不统一**:样品卡片单击=`filterTodo(status,el)`(按状态字符串筛选,无 toggle 回退);治具卡片单击=`filterDashStats(idx)`(按索引 toggle,再点回退默认)
4. **样式散落**:治具 `.stat:hover/.dash-active` 写死在 `fixture.html` 内联 `<style>`,未集中到 `app.css`,违反单一职责

## 2. 设计目标

- **命名统一**:导航「首页概览」→「样品看板」(避与样品已有的「生命周期看板」`#/board` 重名),治具「看板」label 保留
- **视觉统一**:统一卡片 class `.kb-stat`(kanban-stat,两系统共用);治具卡片获色条+上浮视觉升级;`fixture.html` 内联 `<style>` 迁入 `app.css` 后删除
- **交互统一**:样品卡片单击改索引 toggle(对齐治具 `filterDashStats` 模式),再点同一卡回退默认(总数=全部待办)
- **行为零回退**:样品现有的双击下钻/比例条/viewDetail/待办分页/优先级/预警行/"去处理"跳扫码台/快捷操作/STAT_ORDER 角色排序全部保留;治具 `filterDashStats/goFixScan/预警/待办` 逻辑零变化
- **子系统隔离**:改共享文件 `app.css` 须双系统回归;治具仅样式迁出+class 改名,行为零变化

## 3. 详细设计

### 3.1 命名统一(导航 + 注释)

| 位置 | 旧 | 新 | 说明 |
|---|---|---|---|
| `router.js` NAV 第3行 `t` | `首页概览` | `样品看板` | 避与「生命周期看板」重名 |
| `router.js` route 第23行 meta `dashboard` | `首页概览` | `样品看板` | 页面标题同步 |
| `help.js` HELP_PAGE_TIPS.dashboard | `首页概览：查看统计数据和待办事项` | `样品看板：查看统计数据和待办事项` | 提示条文案同步 |
| `help-data.js` dashboard 模块 desc | `登录后的首页面板` | `登录后的样品看板` | 帮助文案同步 |
| `fixture-api.js` buildFixtureNav label | `看板` | `看板`(**保留**) | 治具不变,子系统隔离 |

**不改**:`dashboard.js` 文件头注释「首页概览」→「样品看板」(代码注释同步);`fixture-dashboard.js` 文件头「治具看板」保留。

### 3.2 视觉统一(卡片 class 收敛)

**统一 class 命名**:`.kb-stat`(kanban-stat,两系统共用),取代样品 `.dash-stat` + 治具 `.stat`(治具 dashboard 上下文)。

**`app.css` 改动**:

| 行 | 旧 | 新 | 说明 |
|---|---|---|---|
| 128 | `.dash-stats{display:grid;...}` | `.kb-stats{display:grid;...}` | 容器主样式改名 |
| 129 | `.dash-stat{...}` | `.kb-stat{...}` | 主样式改名 |
| 131 | `.dash-stat.active{...}` | `.kb-stat.active{...}` | active 样式改名(合并治具 `.dash-active`) |
| 132 | `.dash-stat::before{...}` | `.kb-stat::before{...}` | 左侧色条改名,`background:var(--stat-color,var(--brand))` 保留(治具无 `--stat-color` 时 fallback brand 蓝) |
| 133 | `.dash-stat .n{...}` | `.kb-stat .n{...}` | 数字样式改名 |
| 134 | `.dash-stat .l{...}` | `.kb-stat .l{...}` | 标签样式改名 |
| 164 媒体查询 | `.dash-stats{grid-template-columns:repeat(2,1fr)}` | `.kb-stats{grid-template-columns:repeat(2,1fr)}` | 移动端 2 列改名 |

**保留**:`.stat`(第45-47行通用样式)保留(用户确认;作为通用 base,非 dashboard 上下文不强制清理)。

**`fixture.html` 改动**:
- 删除第9-11行内联 `<style>`(`.stat{cursor:pointer;...}.stat.dash-active{...}` 全部迁入 `app.css` 由 `.kb-stat` 统一覆盖)
- 第8行 `<link rel="stylesheet" href="/css/app.css" />` → 加 `?v=20260805`(见 3.6,确保 css 更新生效)

**`fixture-dashboard.js` 改动**:
- 第37行 `'<div class="stat' + cls + '" ...>'` → `'<div class="kb-stat' + cls + '" ...>'`
- 第36行 `var cls = isActive ? ' dash-active' : ''` → `var cls = isActive ? ' active' : ''`(对齐样品 `.kb-stat.active`)

**`dashboard.js` 改动**:
- 第66行 `class="dash-stat"` → `class="kb-stat"`(保留 `style="--stat-color:..."` 内联,样品按状态着色)
- 第82行 `'<div class="dash-stats">'` → `'<div class="kb-stats">'`(容器同步)

**`dashboard-todo.js` 改动**:
- 第20行 `document.querySelectorAll('.dash-stat.active')` → `document.querySelectorAll('.kb-stat.active')`(active 清除选择器同步)

**效果**:
- 样品卡片:视觉零变化(`.kb-stat` 完全继承 `.dash-stat` 样式,`--stat-color` 仍按状态着色)
- 治具卡片:获左侧色条(`var(--brand)` fallback 蓝)+ 上浮 hover + 彩色 active 边框(视觉升级,行为不变)

### 3.3 卡片交互统一(索引 toggle)

**样品卡片单击**:由"按状态字符串筛选"改为"按索引 toggle",对齐治具 `filterDashStats` 模式。

**`dashboard.js` 改动**:

1. 新增模块级变量 `var _kbFilter = 0;`(0=总数/默认全部,1=NEW,2=PRODUCED,3=RELEASED,4=IN_CUSTODY,5=RETURNING,6=RETIRED)
2. `_renderStats` 内 `stats` 数组按 `STAT_ORDER[me.role]` 排序后,索引即为 toggle key(0=总数,1..6=各状态)
3. 卡片 `onclick` 由 `filterTodo(''+f+'',this)` 改为 `filterKbStat(idx,this)`,其中 `idx` 为 `stats` 排序后的下标
4. 卡片 `ondblclick` 保留(双击下钻样品列表,不变)
5. 卡片 `title` 文案保留"单击筛选待办·双击查看列表"

**`dashboard.js` 新签名**:
```javascript
// 索引式 toggle:点击同一卡片回退到默认(总数=全部待办),否则切换到目标卡片
function filterKbStat(idx, el) {
  _kbFilter = (_kbFilter === idx) ? 0 : idx;
  _todoPager.offset = 0;
  document.querySelectorAll('.kb-stat.active').forEach(function(n){ n.classList.remove('active'); });
  if (el && _kbFilter !== 0) el.classList.add('active');
  _renderTodoTable();
}
```

**`dashboard-todo.js` 改动**:
- 删除 `filterTodo(status, el)` 函数(第17-23行),由 `dashboard.js` 的 `filterKbStat` 取代
- 删除模块级变量 `var _todoFilter = '';`(第6行,逻辑迁入 `dashboard.js` 的 `_kbFilter`)
- `renderTodo(d)` 入口(第9-14行):原 `_todoFilter = '';` 改为 `_kbFilter = 0;`(跨文件重置 dashboard.js 的筛选状态,确保每次 dashboard 加载清空旧筛选)
- `_renderTodoTable` 内 `_todoFilter` 由字符串改为"按索引查 stats 数组得状态键":
  - 排序后 `stats` 数组需在 `_renderTodoTable` 可见 → 将 `stats` 提升为模块级 `var _kbStats = []`(由 `dashboard.js` 的 `_renderStats` 填充,见 6.1)
  - `var filtered = _todoFilter ? _todoData.filter(...)` → `var filterKey = _kbStats[_kbFilter] ? _kbStats[_kbFilter][2] : ''; if(filterKey==='total') filterKey=''; var filtered = filterKey ? _todoData.filter(function(s){return s.status===filterKey;}) : _todoData;`
- `title` 文案 `_todoFilter ? ' · ' + (STAT_LABELS[_todoFilter]...)` → 用 `filterKey` 替代 `_todoFilter`

**`filterTodo` 调用方排查**(grep 已确认仅 `dashboard.js`/`dashboard-todo.js` 两文件引用,无外部调用,安全删除):
- `dashboard.js` 第66行 `onclick="filterTodo(...)"` → 改 `filterKbStat(idx,this)`
- `dashboard-todo.js` 第17-23行 `function filterTodo` → 删除(逻辑迁入 `dashboard.js` 的 `filterKbStat`)

**治具 `filterDashStats` 不变**(治具 dashboard 仍用 `DASH_STATS[_dashFilter]` 索引模式,与样品各自独立,不强行合并函数)。

### 3.4 保留功能清单(样品增强全保留)

| 功能 | 当前实现 | 本次改动 | 说明 |
|---|---|---|---|
| 双击下钻 | `ondblclick="location.hash='#/samples?status=...'"` | 不变 | 卡片双击跳样品列表 |
| 比例条 barDrill | `barDrill(key,el)` 跳列表 + active | 不变 | 比例条段/图例单击下钻 |
| viewDetail | 待办/预警行 `onclick="viewDetail(id)"` | 不变 | 行单击进详情 |
| 待办分页 10页 | `_todoPager={limit:10,...}` | 不变 | 分页控件保留 |
| 优先级 dash-todo-pri | `_getTodoInfo` 返回 cls | 不变 | 红高/黄常规优先级竖条 |
| 预警行 viewDetail | `_renderAlertBlock` 行 onclick | 不变 | 逾期/即将到期行单击进详情 |
| "去处理" goScan | `goScan(sample_no)` + stopPropagation | 不变 | 待办/预警"去处理"跳扫码台 |
| 快捷操作 roleActions | `_renderQuickActions(actions)` | 不变 | 角色定制按钮组 |
| STAT_ORDER 角色排序 | `stats.sort(STAT_ORDER[me.role])` | 不变 | 卡片顺序按角色优先级 |

### 3.5 治具影响(仅样式迁出,行为零变化)

| 文件 | 改动 | 行为变化 |
|---|---|---|
| `fixture.html` | 删第9-11行内联 `<style>`;第8行 `app.css` 加 `?v=20260805`(可选,见3.6) | 无 |
| `fixture-dashboard.js` | 第37行 `.stat`→`.kb-stat`;第36行 ` dash-active`→` active` | 无(`filterDashStats/goFixScan/预警/待办` 逻辑全不变) |
| `app.css` | `.dash-stat`→`.kb-stat`(含 active/::before/.n/.l);`.dash-stats`→`.kb-stats` 媒体查询 | 治具卡片获色条+上浮(视觉升级,非行为变化) |

**治具不变清单**:
- `DASH_STATS` 配置数组(6 张卡:待处理/待验证/领用中/已接收/改善中/待保养)
- `filterDashStats(idx)` 索引 toggle 函数
- `_renderDashContent` 逾期表/保养预警表/待办表渲染
- `goFixScan(fixture_no)` 跳扫码台
- `esc(s)` 转义工具
- 逾期/保养预警 `onclick="goFixScan(...)"` 行为

### 3.6 版本号与缓存刷新

- `index.html` 第8行 `/css/app.css?v=20260804` → `?v=20260805`
- `index.html` 第62行 `/js/dashboard.js?v=20260804` → `?v=20260805`
- `index.html` 第63行 `/js/dashboard-todo.js?v=20260804` → `?v=20260805`
- `index.html` 第80行 `/js/router.js?v=20260802` → `?v=20260805`(导航文案改)
- `fixture.html` 第8行 `/css/app.css`(无版本号)→ 加 `?v=20260805`(治具首次引入版本号,确保 css 更新生效)
- `help.js`/`help-data.js` 无版本号引用(index.html 第77-78行),纯文案改动不强求加版本(用户首屏加载即拿最新),保持现状

## 4. 文件改动清单

| 文件 | 改动类型 | 预估行数变化 | 容量上限 | 改后预估 |
|---|---|---|---|---|
| `public/js/router.js` | 改名(导航+标题) | +0(行内替换) | 300 | 29行 |
| `public/js/dashboard.js` | class改名+filterTodo→filterKbStat+_kbStats/_kbFilter | +6~+8(新增变量+新函数,删 filterTodo 调用) | 300 | ~155行(9顶层函数,90%接近上限,见8.2) |
| `public/js/dashboard-todo.js` | 删 filterTodo+_renderTodoTable 用 _kbStats | -6~-8(删 filterTodo 函数) | 300 | ~58行 |
| `public/js/help.js` | 文案改 | +0 | 300 | 122行 |
| `public/js/help-data.js` | 文案改 | +0 | 800 | 86行 |
| `public/js/fixture-dashboard.js` | class改名(.stat→.kb-stat, dash-active→active) | +0 | 300 | 109行 |
| `public/fixture.html` | 删内联 style + 加 css 版本号 | -3(删3行 style) | 600 | 62行 |
| `public/css/app.css` | .dash-stat→.kb-stat(5处)+.dash-stats→.kb-stats(1处) | +0(改名) | 20000字符 | 165行/~12150字符 |
| `public/index.html` | 4处版本号 0804→0805 | +0 | 600 | 86行 |

**总计**:9 个文件,净增约 -2 行(dashboard.js +8 / dashboard-todo.js -8 / fixture.html -3 / 其他 +0)。

## 5. 兼容性

### 5.1 向后兼容

- **卡片单击 toggle 替代旧 filterTodo 状态筛选**:语义等价(0=全部待办=旧空字符串;1..6=各状态=旧 status 字符串);再点回退默认=旧"取消筛选"的快捷路径,用户体验提升
- **双击/比例条/viewDetail 全保留**:不破坏现有下钻/查看/操作链
- **"去处理"跳扫码台保留**:操作链不破坏
- **STAT_ORDER 角色排序保留**:卡片顺序仍按角色优先级
- **治具行为零变化**:`filterDashStats/goFixScan/预警/待办` 逻辑全不变,仅 class 改名

### 5.2 子系统隔离

- **共享文件 `app.css` 改动**:仅 class 改名(`.dash-stat`→`.kb-stat`),样式规则体零变化 → 样品/治具渲染均不受改名影响(只要 JS 同步改)
- **共享文件无行为改动**:`server.js`/`db.js`/`modal.js`/`portal.html` 不动
- **API 路径隔离**:样品 `/api/dashboard` 与治具 `/api/fixtures/dashboard` 不变
- **状态机零改动**:样品/治具状态机均不动

### 5.3 无 API/DB 变更

纯前端改造,无后端接口/数据库/配置变更。

## 6. 实现要点

### 6.1 dashboard.js filterKbStat(索引 toggle)

```javascript
var _kbFilter = 0;       // 0=总数(默认全部),1..6=各状态
var _kbStats = [];       // 由 _renderStats 填充的排序后 stats 数组 [[label,count,key],...]

// _renderStats 内:
_kbStats = stats.slice(); // 排序后保存(供 _renderTodoTable 查索引→状态键)
var cards = stats.map(function(x, idx) {
  var href = x[2] === 'total' ? '#/samples' : '#/samples?status=' + x[2];
  return '<div class="kb-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterKbStat(' + idx + ',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
}).join('');

// 新函数(取代 filterTodo):
function filterKbStat(idx, el) {
  _kbFilter = (_kbFilter === idx) ? 0 : idx;
  _todoPager.offset = 0;
  document.querySelectorAll('.kb-stat.active').forEach(function(n){ n.classList.remove('active'); });
  if (el && _kbFilter !== 0) el.classList.add('active');
  if (typeof _renderTodoTable === 'function') _renderTodoTable();
}
```

### 6.2 dashboard-todo.js _renderTodoTable(用 _kbStats 索引)

```javascript
// 顶部:删除 var _todoFilter = '';
// renderTodo(d) 内:_todoFilter=''; → _kbFilter=0;(跨文件重置 dashboard.js 筛选状态)
// 删除 filterTodo(迁入 dashboard.js 的 filterKbStat)
// _renderTodoTable 内:
var filterKey = _kbStats[_kbFilter] ? _kbStats[_kbFilter][2] : '';
if (filterKey === 'total') filterKey = '';
var filtered = filterKey ? _todoData.filter(function(s){ return s.status === filterKey; }) : _todoData;
var title = '我的待办（' + (ROLE[me.role] || me.role) + '）' + (filterKey ? ' · ' + (STAT_LABELS[filterKey] || filterKey) : '');
```

注意:`_kbStats`/`_kbFilter` 由 `dashboard.js` 顶部 `var` 定义(挂 window 全局),`dashboard-todo.js` 跨文件读写。加载顺序 `dashboard.js` 先于 `dashboard-todo.js`(见 `index.html` 第62-63行);运行时 `viewDashboard` 先调 `_renderStats`(填充 `_kbStats`)再调 `renderTodo`(重置 `_kbFilter=0` 并渲染),`_kbStats` 已就绪。

### 6.3 app.css class 改名(零样式体变化)

仅选择器名 `.dash-stat`→`.kb-stat`、`.dash-stats`→`.kb-stats`,样式规则体一字不改,确保样品视觉零回退。

### 6.4 fixture.html 删内联 style

```html
<!-- 删除第9-11行: -->
<style>
.stat{cursor:pointer;transition:box-shadow .15s,background .15s}.stat:hover{background:#f9fafb}.stat.dash-active{box-shadow:0 0 0 2px var(--brand);background:#eef2ff}
</style>
```
删除后治具卡片由 `app.css` 的 `.kb-stat` 统一接管(获色条+上浮+active 彩色边框,`--stat-color` fallback `var(--brand)` 蓝)。

## 7. 验证清单

### 7.1 样品看板功能验证(5角色登录)

- [ ] 导航「首页概览」→「样品看板」(router.js 文案)
- [ ] 页面标题「样品看板」(route meta)
- [ ] 帮助提示条「样品看板：查看统计数据和待办事项」(help.js)
- [ ] 帮助面板 dashboard 模块 desc「登录后的样品看板」(help-data.js)
- [ ] 卡片视觉零变化(左侧色条+上浮 hover+彩色 active 边框,`--stat-color` 按状态着色)
- [ ] 卡片单击→筛选待办(索引 toggle,按 STAT_ORDER 排序后索引对应状态)
- [ ] 卡片再点同一张→回退默认(总数=全部待办)
- [ ] 卡片双击→跳样品列表(下钻,不变)
- [ ] 比例条单击→跳样品列表 + active 高亮(不变)
- [ ] 待办行单击→进样品详情(不变)
- [ ] 待办"去处理"→扫码台带编号(不变)
- [ ] 待办分页 10页(不变)
- [ ] 待办优先级竖条(红高/黄常规,不变)
- [ ] 预警行单击→进样品详情(不变)
- [ ] 预警"去处理"→扫码台(不变)
- [ ] 快捷操作按钮组(角色定制,不变)
- [ ] 卡片顺序按角色优先级(RD:NEW置顶,QA:PRODUCED置顶,CUSTODY:RELEASED置顶)

### 7.2 治具看板功能验证(5角色登录)

- [ ] 导航「看板」label 保留(fixture-api.js 不变)
- [ ] `fixture.html` 内联 `<style>` 已删除(查看页面源码无 `<style>` 块)
- [ ] 卡片视觉升级(获左侧色条 fallback 蓝 + 上浮 hover + active 彩色边框)
- [ ] 卡片单击→筛选待办(filterDashStats 索引 toggle,不变)
- [ ] 卡片再点同一张→回退默认(待处理,不变)
- [ ] 逾期表展示 + 行单击跳 goFixScan(不变)
- [ ] 保养预警表展示 + 行单击跳 goFixScan(不变)
- [ ] 待办表展示 + 行单击跳 goFixScan(不变)
- [ ] MAINTENANCE_DUE 筛选显示保养列表(不变)

### 7.3 回归验证(子系统隔离)

- [ ] 样品列表/新建/扫码/生命周期看板/日志/用户管理 功能正常
- [ ] 治具清单/新建申请/扫码台/日志 功能正常
- [ ] portal.html 门户入口正常
- [ ] 共享 modal.js 弹窗正常(两系统)
- [ ] 共享 app.css 其他样式类未受影响(两系统渲染对比)

### 7.4 文件臃肿检测

- [ ] `dashboard.js` ≤300行(预估155,9顶层函数,90%接近上限,见8.2 风险)
- [ ] `dashboard-todo.js` ≤300行(预估58)
- [ ] `fixture-dashboard.js` ≤300行(预估109)
- [ ] `app.css` ≤20000字符(预估~12150)
- [ ] `index.html`/`fixture.html` ≤600行

## 8. 风险与冗余

### 8.1 风险(中)

- **双系统 CSS 改名**:`.dash-stat`→`.kb-stat` 需同步改 `dashboard.js`/`dashboard-todo.js`/`fixture-dashboard.js` 三处 class 引用,遗漏任一处会导致卡片样式丢失 → 改名后须双系统截图对比
- **样品卡片 toggle 逻辑改**:`filterTodo`(字符串)→`filterKbStat`(索引)需跨文件共享 `_kbStats`/`_kbFilter`,加载顺序依赖 `index.html` 第62-63行 → 验证 5 角色登录 toggle 正常
- **治具 `.stat` 通用类保留**:用户确认保留 `app.css` 第45-47行 `.stat`(通用 base),但治具 dashboard 改用 `.kb-stat` 后 `.stat` 在 dashboard 上下文不再使用 → 见 8.3 冗余项

### 8.2 dashboard.js 容量预警

当前 `dashboard.js` 147行/9顶层函数(90% 接近上限)。本次 `filterTodo`→`filterKbStat` 是**改名+逻辑迁移**(从 dashboard-todo.js 迁入 dashboard.js),`dashboard.js` 净增约 8 行(新增 `_kbFilter`/`_kbStats` 变量 + `filterKbStat` 函数,但 `_renderStats` 内调用改名不增函数数)。

- 顶层函数数:9 → 10(`filterKbStat` 新增,`filterTodo` 在 dashboard-todo.js 删除)→ **触发 10 函数硬上限**
- **缓解**:`filterKbStat` 与 `filterTodo` 是等价替换(逻辑迁文件),非新增业务;若严格触上限,可将 `filterKbStat` 留在 `dashboard-todo.js`(仅改 _kbStats/_kbFilter 跨文件读取方向)→ 备选方案见 8.4

**主方案采用**:`filterKbStat` 放 `dashboard.js`(与 `_renderStats` 卡片 onclick 同文件,内聚性好),`dashboard.js` 顶层函数达 10 触上限但无新增业务逻辑(改名+迁移),符合"90%仅允许精简/重构,禁追加新功能"——本次非追加新功能,是等价重构。**输出臃肿报告时如实标注触上限,提示下版本拆分**。

### 8.3 冗余清单

- `app.css` 第45-47行 `.stat`(通用 base):治具 dashboard 改用 `.kb-stat` 后,`.stat` 在 dashboard 上下文不再使用。**用户确认保留**(作为通用 base 供潜在其他场景使用)。可在下版本评估是否清理(若全项目 grep 无其他引用则删)。
- `fixture.html` 第9-11行内联 `<style>`:本次删除(迁入 app.css),无残留。
- `dashboard-todo.js` `filterTodo` 函数:本次删除(逻辑迁入 dashboard.js `filterKbStat`),无残留。

### 8.4 备选方案(filterKbStat 位置)

若 8.2 触上限视为阻断,备选:`filterKbStat` 留在 `dashboard-todo.js`(原 `filterTodo` 位置),仅改 `_kbStats`/`_kbFilter` 跨文件读取方向(`dashboard.js` 定义并填充 `_kbStats`/`_kbFilter`,`dashboard-todo.js` 的 `filterKbStat` 读写它们)。此方案 `dashboard.js` 顶层函数保持 9 不触上限,但 `_renderStats` 的 onclick 调用跨文件引用 `filterKbStat`。

**主方案采用**:`filterKbStat` 放 `dashboard.js`(内聚),触上限标注。若用户审核时偏好备选,可切换。

## 9. 不做(YAGNI)

- 不合并样品 `filterKbStat` 与治具 `filterDashStats`(两系统 stats 数组结构不同,强行合并引入耦合,违反子系统隔离)
- 不为治具卡片加 `--stat-color` 按状态着色(治具 DASH_STATS 6 张卡非状态枚举,着色语义不通;统一用 brand 蓝 fallback 即可)
- 不重构样品/治具 dashboard 为共享组件(两系统数据源/角色/状态机不同,共享组件过度抽象,YAGNI)
- 不改 `app.css` `.stat` 通用类(用户确认保留)
- 不改后端 API/DB(纯前端改造)

## 10. 上线后监控(1~3 周期)

- **样品看板**:5 角色登录验证卡片 toggle/双击/比例条/待办/预警/快捷操作(1 周内观察用户反馈)
- **治具看板**:5 角色登录验证卡片样式升级(色条+上浮+active)不破坏 toggle/预警/待办(1 周内观察)
- **CSS 缓存**:`app.css?v=20260805` 生效后,用户首次访问拿到新样式;若报告样式错乱,排查浏览器缓存(强刷)
- **跨文件变量**:`_kbStats`/`_kbFilter` 跨 `dashboard.js`/`dashboard-todo.js` 共享,若加载顺序异常(TypeError: _kbStats is undefined)→ 检查 `index.html` 第62-63行 script 顺序
