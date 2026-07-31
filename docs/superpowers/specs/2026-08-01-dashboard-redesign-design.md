# 样品 Dashboard 首页概览重构设计

> 日期: 2026-08-01
> 状态: 设计待审

## 1. 背景与问题

当前样品 dashboard（[dashboard.js](../../../public/js/dashboard.js)，28 行）存在以下问题：

| # | 问题 | 严重度 |
|---|---|---|
| 1 | API 返回 `dueSoon` 数据但前端完全未展示 | 高 |
| 2 | `api()` 调用无 try-catch，失败时页面卡在"加载中…" | 高 |
| 3 | 统计卡片只展示 4/6 个状态（缺 PRODUCED/RETURNING/RETIRED） | 中 |
| 4 | 无快捷操作入口，用户需点导航栏跳转 | 中 |
| 5 | 逾期表格无分页，数据多时全量渲染 | 中 |
| 6 | 不同角色看到相同内容，无差异化 | 中 |
| 8 | 与治具 dashboard 结构不一致（缺即将到期预警） | 中 |

## 2. 设计决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 图表方案 | **不做图表，用 CSS 比例条** | 样品管理是操作导向系统，核心痛点是待办和预警，图表 ROI 不足 |
| 趋势数据 | **不做** | 样品低频流转，30 天趋势对管理决策意义有限，YAGNI |
| 角色差异化 | **快捷操作+待办定制** | 不同角色关注点不同，统计卡片统一 |
| 文件拆分 | **dashboard.js + dashboard-todo.js** | 主入口+待办模块，单文件不超 300 行 |

## 3. 架构

```
后端（仅扩展，不新增 API）:
  routes/misc.js    GET /api/dashboard 返回增加 roleActions 字段

前端:
  public/js/dashboard.js        主入口：统计卡片 + CSS比例条 + 预警区块 + 错误处理（≤200行）
  public/js/dashboard-todo.js   角色定制待办 + 快捷操作（≤150行）
  public/css/app.css            新增 .dash-* 样式类
```

**无需新增后端 API**，仅扩展 `/api/dashboard` 返回 `roleActions` 字段。

## 4. 组件设计（6 个区块）

### 4.1 统计卡片组（统一）

7 个卡片（1 总数 + 6 状态），每个带主题色：

| 卡片 | 颜色 | 数据源 |
|---|---|---|
| 总样品 | `--brand` 蓝色 | `d.total` |
| 新建·待制作 | `--muted` 灰色 | `d.byStatus.NEW` |
| 制作完成 | `--warn` 黄色 | `d.byStatus.PRODUCED` |
| 已发行 | `--ok` 绿色 | `d.byStatus.RELEASED` |
| 保管中 | `--brand` 蓝色 | `d.byStatus.IN_CUSTODY` |
| 退回审核中 | `--bad` 红色 | `d.byStatus.RETURNING` |
| 已废弃 | `--muted` 灰色 | `d.byStatus.RETIRED` |

卡片下方渲染一行 **CSS 比例条**：各状态占比的彩色横条，点击跳转对应状态列表。

### 4.2 角色快捷操作（定制）

| 角色 | 快捷操作按钮 |
|---|---|
| ADMIN | 新建样品 · 扫码台 · 生命周期看板 · 用户管理 |
| RD | 新建样品 · 扫码台 |
| QA | 扫码台 · 生命周期看板 |
| ME | 扫码台 · 生命周期看板 |
| CUSTODY | 扫码台 |

后端 `/api/dashboard` 返回 `roleActions` 数组，前端按数组渲染按钮。

### 4.3 我的待办（定制）

- 按角色过滤待办类型，标记优先级（红=紧急/黄=常规）
- 分页：10 条/页，底部分页控件
- "去处理"链接跳转扫码台

优先级规则：

| 角色 | 待办类型 | 优先级 |
|---|---|---|
| RD | 待制作确认(NEW)、待重做(RETURNING+assigned) | 紧急(红) |
| QA | 待发行(PRODUCED)、待审核退回(RETURNING) | 紧急(红) |
| CUSTODY | 待接收(RELEASED) | 常规(黄) |
| ME | 待接收(RELEASED) | 常规(黄) |
| ADMIN | 全部待办 | 按类型标记 |

### 4.4 复检逾期预警（统一）

- 红色边框区块，标题 `⚠ 复检逾期（N）`
- 表格分页：5 条/页
- 列：编号、名称、图片、保管部门、储位、应复检日、"去处理"链接

### 4.5 即将到期预警（统一，新增）

- 黄色边框区块，标题 `⏰ 即将到期·7天内（N）`
- 使用已获取但未展示的 `d.dueSoon` 数据
- 表格分页：5 条/页
- 列：编号、名称、图片、保管部门、储位、到期日、"去处理"链接

### 4.6 错误处理

- `viewDashboard()` 包裹 try-catch
- API 失败时显示"数据加载失败，[点击重试]"而非卡在"加载中…"
- 每个预警区块独立 try-catch，单区块失败不影响其他

## 5. 后端变更

### `/api/dashboard` 扩展

仅 `routes/misc.js` 第 32 行 `res.json()` 增加 `roleActions` 字段：

```javascript
// 角色快捷操作映射
var ROLE_ACTIONS = {
  ADMIN: [{t:'新建样品',h:'#/new'},{t:'扫码台',h:'#/scan'},{t:'生命周期看板',h:'#/board'},{t:'用户管理',h:'#/users'}],
  RD: [{t:'新建样品',h:'#/new'},{t:'扫码台',h:'#/scan'}],
  QA: [{t:'扫码台',h:'#/scan'},{t:'生命周期看板',h:'#/board'}],
  ME: [{t:'扫码台',h:'#/scan'},{t:'生命周期看板',h:'#/board'}],
  CUSTODY: [{t:'扫码台',h:'#/scan'}]
};
// res.json 增加 roleActions: ROLE_ACTIONS[u.role] || []
```

**无破坏性变更**：仅新增字段，旧前端忽略 `roleActions` 不受影响。

## 6. 前端变更

### dashboard.js 重构（~200 行）

```javascript
// 主入口
async function viewDashboard() {
  try {
    const d = await api('GET', '/api/dashboard');
    renderStats(d);           // 4.1 统计卡片+比例条
    renderQuickActions(d);    // 4.2 角色快捷操作
    renderTodo(d);            // 4.3 待办（调用 dashboard-todo.js）
    renderOverdue(d);         // 4.4 复检逾期
    renderDueSoon(d);         // 4.5 即将到期
  } catch (e) {
    $('#view').innerHTML = '<div class="empty">数据加载失败：' + e.message + ' <a class="link" onclick="viewDashboard()">点击重试</a></div>';
  }
}
```

### dashboard-todo.js 新建（~150 行）

```javascript
// 角色定制待办 + 分页
function renderTodo(d) { ... }
function goTodoPage(page) { ... }
```

### CSS 新增

```css
.dash-stats { ... }       /* 统计卡片组 */
.dash-stat { ... }        /* 单个卡片（带主题色） */
.dash-bar { ... }         /* CSS 比例条容器 */
.dash-bar-seg { ... }     /* 比例条段 */
.dash-actions { ... }     /* 快捷操作按钮组 */
.dash-todo-pri-high { ... } /* 高优先级标记 */
.dash-todo-pri-normal { ... } /* 常规优先级标记 */
.dash-alert-overdue { ... }  /* 红色预警区块 */
.dash-alert-soon { ... }     /* 黄色预警区块 */
.dash-pager { ... }          /* 分页控件 */
```

## 7. 子系统隔离

- 仅修改样品子系统文件（dashboard.js, misc.js, app.css 样品部分）
- 治具 dashboard (`/api/fixtures/dashboard`, fixture.html) 不受影响
- 共享 CSS 变量（`--brand`/`--ok`/`--warn`/`--bad`/`--muted`）不变，仅新增 `.dash-*` 类
- 共享 `api-base.js` 不修改

## 8. 兼容性

- `/api/dashboard` 仅新增 `roleActions` 字段，旧前端忽略不受影响
- 无数据库变更
- 无新依赖
- `index.html` 需添加 `dashboard-todo.js` 的 `<script>` 标签（带版本号 `?v=20260801`）

## 9. 验证清单

- [ ] 5 个角色分别登录验证 dashboard 展示
- [ ] 统计卡片显示 7 个（1 总数 + 6 状态）
- [ ] CSS 比例条正确显示各状态占比
- [ ] 角色快捷操作按钮正确显示且跳转正常
- [ ] 待办列表按角色过滤，优先级标记正确
- [ ] 待办分页正常（10 条/页）
- [ ] 复检逾期区块显示且分页正常（5 条/页）
- [ ] 即将到期区块显示且分页正常（5 条/页）
- [ ] API 失败时显示"点击重试"而非卡在"加载中"
- [ ] 治具 dashboard 回归验证（不受影响）
- [ ] 响应式：768px 以下卡片 2 列、表格横向滚动
- [ ] 文件臃肿检测：dashboard.js ≤200 行、dashboard-todo.js ≤150 行

## 10. 文件容量预估

| 文件 | 类型 | 预估行数 | 上限 | 达标 |
|---|---|---|---|---|
| dashboard.js | 脚本 | ~200 | 300 | 67% |
| dashboard-todo.js | 脚本 | ~150 | 300 | 50% |
| misc.js | API | ~50 | 400 | 13% |
| app.css（新增部分） | 样式 | ~30 行新增 | — | — |
