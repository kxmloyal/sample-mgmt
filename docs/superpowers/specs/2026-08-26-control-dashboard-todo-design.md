# 管制流程管理子系统 · 交互链路优化设计文档（看板数据卡 / NCR 详细内容 / 角色待办）

> 生成日期：2026-08-26
> 状态：**已确认，待实施**（用户已就 §8 三项确认：超期滞留阈值 48h·admin 可调整 / 今日新增以 apply_at 为准 / NCR 创建人姓名依赖后端重启显示）
> 关联规范：[AGENTS.md §17 子系统插件协议](../AGENTS.md)、[§18 卡片设计系统](../AGENTS.md)、[§19 bundle 构建](../AGENTS.md)、[§21 列表导出](../AGENTS.md)、[§5 强制工作流程](../AGENTS.md)
> 覆盖子系统：`control`（管制流程管理，`deployed: false` 未上线，可自由改动）
> 前置设计：[2026-08-24-control-flow-design.md](2026-08-24-control-flow-design.md)

---

## 1. 背景与目标

管制流程管理子系统已按设计文档接入框架，具备「看板 / 列表 / 新建 / 详情（会签闸口·委托单·报工·日志）/ 标签打印」完整链路。用户在实际使用中反馈三处**交互链路体验问题**，集中在「概览信息薄、明细内容空、角色待办不清」：

1. **看板信息薄**：看板卡片仅展示「单号 + 品名 + 状态徽章 + 滞留时长」，看不到数量、不良类型、滞留天数、下一步该做什么；看板顶部无任何汇总统计，缺乏全局概览。
2. **NCR 明细空**：详情页「不良品委托单」Tab 仅 4 列（委托单号/检验部门/处理部门/创建时间），未展示 `form_template`（表单版本）、`created_by`（创建人）等**已采集字段**，信息缺失、无法快速核对委托单全貌。
3. **角色待办不清**：各角色登录后进入看板，无法一眼确认「当前需要我做什么」，需进入每张单据详情逐个翻查会签/流转状态。

**目标**：对看板做「**数据概览 + 我的待办 + 待办定位**」统一增强，NCR Tab 展示全字段。核心改动为**纯前端增强**（看板/NCR/待办派生），外加**一处后端只读查询增强**（`created_by_name`）与**一处阈值持久化能力**（`control_settings` 表 + 读/写接口，供 admin 调整超期滞留阈值）。

> **本次新增持久化范围（对原「不改数据库」约束的有意放开）**：因用户确认「超期滞留阈值 48h **admin 可调整**」，阈值需落库持久化，故新增 `control_settings` 表（仿 workbench `workbench_settings` 键值对模式）+ 设置读/写接口 + admin 设置入口。其余（`created_by_name`）仍为只读查询增强、不改表结构。

---

## 2. 现状诊断（问题定位）

| 位置 | 现状代码 | 问题 |
|---|---|---|
| 看板卡片 | [dashboard.js](../specs/../../subsystems/control/frontend/js/views/dashboard.js) `ctlBoardCardHtml` | 只渲染 单号/品名/状态徽章/dwell，缺数量/不良类型/滞留天数/下一步提示 |
| 看板顶部 | [dashboard.js](../specs/../../subsystems/control/frontend/js/views/dashboard.js) `ctlBoardHtml` | 标题下直接进入 5 阶段列，无统计卡、无待办区 |
| NCR 明细 | [detail.js](../specs/../../subsystems/control/frontend/js/views/detail.js) `_ctlTabSheet.ncr` | 表格仅 4 列，未展示 `form_template` / `created_by` |
| 角色待办 | 无 | 无「待我签核/待我流转」聚合视图 |
| 超期阈值 | 无（`ctlDwellOf` 前端硬编码判断） | 无持久化，无法由 admin 调整 |

**关键数据可用性**：
- `form_template` 已由后端 `listNcrLogsByOrder` 以 `SELECT *` 返回（[routes-orders.js](../specs/../../subsystems/control/backend/routes-orders.js) 详情聚合 → `ncrLogs`），**前端只需展示即可；`created_by_name` 需后端左连增强（见 §3.2，需重启）**。
- 看板数据源：`GET /api/control/orders?limit=200`（卡片概览） + `GET /api/control/orders/stats`（按状态计数，避免 limit 截断）+ `GET /api/control/settings`（超期阈值，默认 48h，可持久化调整）。

---

## 3. 设计方案

### 3.1 改善点①：看板数据卡片（顶部汇总统计卡 + 卡片信息增强）

采用用户确认的**「两者都要」**。

#### 3.1.1 顶部汇总统计卡（复用 `.kb-stat`）

在看板标题 `<h3 class="ctl-sec">` 下方、5 阶段列上方，新增一排统计卡：

```
[进行中] [今日新增] [待我签核] [待我流转] [超期滞留] [⚙ 阈值(ADMIN)]
```

统计口径（「进行中/今日新增」基于前端列表 `orders` 派生；「待我签核/待我流转」基于 §3.3 待办派生；「超期滞留」基于后端阈值）：

| 统计卡 | 口径 | 颜色语义 |
|---|---|---|
| 进行中 | `status ∉ {SHIPPED, RETIRED}` 的数量 | 品牌色 `--brand` |
| 今日新增 | `apply_at` 日期 == 今天 的数量（**以 apply_at 为准**，老单无 `apply_at` 回退 `created_at`） | 品牌色 `--brand` |
| 待我签核 | 见 §3.3 待办派生的「待签」数量 | 警告色 `--warn` |
| 待我流转 | 见 §3.3 待办派生的「待流转」数量 | 警告色 `--warn` |
| 超期滞留 | 未完结且 `ctlDwellOf ≥ overdue_hours` 的数量（默认 48h，admin 可调） | 危险色 `--bad` |

交互遵循 [§18.3](../AGENTS.md) `.kb-stat` 协议：单击联动筛选（跳列表带状态过滤），active 态高亮。统计卡 HTML 生成抽独立函数 `ctlStatsHtml(orders, todo, overdueHours)`，避免 `ctlBoardHtml` 膨胀。

#### 3.1.2 超期滞留阈值的持久化（admin 可调整）—— 新增能力

**背景**：`ctlDwellOf` 目前在前端按固定值判断超期，无法由业务调整。用户确认默认 48h 且 **admin 可调整**，故阈值需落库持久化。

**数据层**（仿 workbench `workbench_settings` 键值对模式）：新增 `control_settings` 表（[schema.sql](../specs/../../subsystems/control/db/schema.sql)）：

```sql
CREATE TABLE IF NOT EXISTS control_settings (
  k VARCHAR(32) PRIMARY KEY,
  v INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO control_settings (k, v) VALUES ('overdue_hours', 48);
```

**登记**：[manifest.json](../specs/../../subsystems/control/manifest.json) `database.tables` 追加 `{ "name": "control_settings", "schema": "db/schema.sql" }`。

**DAO**（[dao.js](../specs/../../subsystems/control/db/dao.js)）新增：

```js
function getControlSetting(k) { return one('SELECT v FROM control_settings WHERE k = ?', [k]).then(r => r ? Number(r.v) : null); }
async function setControlSetting(k, v, conn) { var sql = 'INSERT INTO control_settings (k,v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)'; ... }
```

**后端接口**（新建独立文件 [routes-settings.js](../specs/../../subsystems/control/backend/routes-settings.js)，避免膨胀 `routes-orders.js` 至 70% 红线以上）：

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/control/settings` | 读取阈值（`{ overdue_hours: 48 }`，缺省回退 48） | 登录 |
| PUT | `/api/control/settings` | 更新阈值（body `{ overdue_hours }`，校验 1~720） | 仅 ADMIN（`u.role === 'ADMIN'`） |

> 因 `routes-orders.js` 当前 293 行已超 70%×400=280 预警线，**设置路由 MUST 新建 `backend/routes-settings.js`** 并在 [backend/index.js](../specs/../../subsystems/control/backend/index.js) 的 `register` 中追加 `require('./routes-settings').register(app)`。

**前端设置入口**：新建 [js/settings.js](../specs/../../subsystems/control/frontend/js/settings.js)：
- `ctlLoadSettings()` → 请求 `GET /api/control/settings`，返回 `overdue_hours`（缺省/异常回退 48）。
- `openControlThresholdModal()`（仿 [threshold.js](../specs/../../subsystems/workbench/frontend/js/views/threshold.js)）：弹窗输入阈值（默认取当前值，快捷预设 24/48/72），校验后 `PUT` 写库并刷新看板。**仅 `me.role === 'ADMIN'` 显示设置入口**；非 admin 读取默认/已有阈值，只读展示。

#### 3.1.3 看板卡片信息增强（`ctlBoardCardHtml`）

在原「单号 + 品名 + 状态徽章」基础上，卡片新增两行元信息：

- **数量 + 不良类型**：`qty 件 · bad_type`
- **滞留天数 + 下一步提示**：滞留 ≥`overdue_hours` 显示超期高亮；「下一步」为基于当前角色与状态派生的动作提示文案（见 §3.3），如 `待 QA 会签`、`待入仓`、`已完结`。

卡片结构（沿用 `.ctl-board-card`，新增 `.ctl-board-i` 元信息行，样式写入本子系统 `module.css`）：

```html
<a class="ctl-board-card" href="#/detail?id=...">
  <div class="ctl-board-no">CTL-20260825-001</div>
  <div class="ctl-board-part">品名</div>
  <div class="ctl-board-i">120 件 · 功能不良</div>
  <div class="ctl-board-meta">[状态徽章] [滞留 2d]</div>
  <div class="ctl-board-next">待 QA 会签</div>
</a>
```

### 3.2 改善点②：NCR 明细详细内容（可展开记录卡，展示已有全部字段）

采用用户确认的**「展示已有全部字段」**，将 `_ctlTabSheet.ncr` 的 4 列表格改为**可展开记录卡**（`<details>/<summary>`）：

- **每张委托单一行 + 可展开**：summary 显示 `委托单号 + 检验部门→处理部门 + 创建时间`；展开后展示全部已采集字段：
  - 委托单号 `ncr_no`
  - 检验部门 `inspect_dept`
  - 处理部门 `handle_dept`
  - 表单版本 `form_template`（已返回，直接展示，如 `GYS-Q2-008_01(REV_1)`）
  - 创建人 `created_by_name`（见下方后端增强，字段未就绪则展示 `—` 降级）
  - 创建时间 `created_at`

渲染抽独立函数 `_ctlTabSheet.ncr` 内联为 `<details>`，并将 key-value 复用 `_ctlUtil.kv()` 以保持与主卡一致视觉。为控制 [detail.js](../specs/../../subsystems/control/frontend/js/views/detail.js) 行数（当前 291 行，上限 400，90% 红线 360），NCR 卡 HTML 生成抽到新文件 [views/ncr-tab.js](../specs/../../subsystems/control/frontend/js/views/ncr-tab.js)，由 bundle 顺序引用。

**后端读接口小增强（需重启）**：[dao.js](../specs/../../subsystems/control/db/dao.js) `listNcrLogsByOrder` 由 `SELECT *` 改为左连 `users` 返回 `created_by_name`：

```sql
SELECT n.*, u.display_name AS created_by_name
FROM control_ncr_logs n LEFT JOIN users u ON n.created_by = u.id
WHERE n.order_id = ? ORDER BY n.id DESC
```

此为**只读查询增强、不改表结构、不改返回结构（仅新增字段）**。用户已确认接受「等待后端重启完成后名字才显示」；重启前前端对 `created_by_name` 缺失做降级（显示 `—`），不影响其它功能。

### 3.3 改善点③：角色待办（看板顶部待办区）

采用用户确认的**「看板顶部待办区（管制子系统内部）」**。在看板顶部统计卡下方、5 阶段列上方新增「我的待办」区块，纯前端基于当前角色 `me.role` 与订单列表派生，展示两类：

```html
<h3 class="ctl-sec">我的待办（{n}）</h3>
<div class="card">
  <div class="ctl-todo-group">
    <span class="ctl-todo-tip">待我会签</span>
    ... 每项跳详情 ...
  </div>
  <div class="ctl-todo-group">
    <span class="ctl-todo-tip">待我流转</span>
    ... 每项跳详情 ...
  </div>
</div>
```

#### 3.3.1 待办派生逻辑（纯函数，抽到新文件 [js/todo.js](../specs/../../subsystems/control/frontend/js/todo.js)）

```
ctlTodoOf(orders, role):
  for each order（跳过 SHIPPED / RETIRED）:
    // A. 待我签核：当前状态命中某会签节点 trigger_status，且当前角色轮到的 step 未签
    for each node in CONTROL_SIGN_NODES where node.trigger_status === order.status:
      if signPassed(node) -> 跳过（全部已AGREE）
      for each step in node.steps where step.role === role:
        // 找到该角色当前应签的 step 序列：前面 seq 均已 AGREE，且本 seq 未签
        if seq 之前未全部 AGREE -> 跳过（未轮到本角色）
        else -> 添加待办 {order, kind:'sign', node, step(待签单位 dept)}
    // B. 待我流转：controlTransitionsOf(order.status, role) 非空
    ts = controlTransitionsOf(order.status, role)
    if ts.length -> 添加待办 {order, kind:'trans', actions:[{action,label}]}
```

**业务说明**：
- 复用现有 `controlTransitionsOf`（[constants.js](../specs/../../subsystems/control/frontend/js/constants.js)）派生「待我流转」，无需重复维护映射。
- 会签节点存在**同角色多单位**（如闸口① seq3 ME生管 / seq4 ME生产、seq5 CUSTODY仓库）。前端无法从订单唯一确定当前应签单位，故「待签核」列**待签单位列表（step.dept）**，点击进详情后详情页 `_ctlUtil.canSign` 会精确定位当前应签单位与按钮（现有能力，不重复实现）。
- 排序：按 `ctlDwellOf` 降序（滞留越久越靠前）。

#### 3.3.2 与 3.1 联动

- 统计卡「待我签核 / 待我流转」计数直接取自 `ctlTodoOf` 结果。
- 看板卡片「下一步提示」也取自 `ctlTodoOf(order)` 的首个待办标签（有则显示动作，无则「已完结」）。

---

## 4. 实施范围与文件清单

| 文件 | 类型 | 改动 | 容量评估（上限） |
|---|---|---|---|
| [views/dashboard.js](../specs/../../subsystems/control/frontend/js/views/dashboard.js) | 前端 | 头部插入统计卡 + 我的待办区 + admin 阈值入口；调用 `ctlTodoOf`/`ctlLoadSettings`；增强 `ctlBoardCardHtml` | 当前 75 行（上限 400），预计 +130 → ~205 行，安全 |
| [views/detail.js](../specs/../../subsystems/control/frontend/js/views/detail.js) | 前端 | `_ctlTabSheet.ncr` 改为调用 `renderNcrTab` | 当前 291 行，本次仅替换调用行，净变化 ~-10 行 |
| [views/ncr-tab.js](../specs/../../subsystems/control/frontend/js/views/ncr-tab.js) | 前端 | **新文件**：NCR 可展开记录卡渲染 | ~60 行 |
| [js/todo.js](../specs/../../subsystems/control/frontend/js/todo.js) | 前端 | **新文件**：`ctlTodoOf` 待办派生纯函数 | ~110 行（≤200，utils 红线） |
| [js/settings.js](../specs/../../subsystems/control/frontend/js/settings.js) | 前端 | **新文件**：`ctlLoadSettings` + `openControlThresholdModal`（admin） | ~90 行（≤200，utils 红线） |
| [css/module.css](../specs/../../subsystems/control/frontend/css/module.css) | 样式 | 新增统计卡容器（复用 `.kb-stat`）、待办区、NCR 卡、卡片元信息、阈值弹窗样式 | 控制在合理范围，**禁写入 app.css** |
| [db/dao.js](../specs/../../subsystems/control/db/dao.js) | 后端 | `listNcrLogsByOrder` 左连 users 返回 `created_by_name`；新增 `getControlSetting`/`setControlSetting` | 微增 |
| [db/schema.sql](../specs/../../subsystems/control/db/schema.sql) | 数据库 | 新增 `control_settings` 表（幂等 CREATE + INSERT IGNORE 默认 48） | 末行追加 ~6 行 |
| [backend/routes-settings.js](../specs/../../subsystems/control/backend/routes-settings.js) | 后端 | **新文件**：GET/PUT `/api/control/settings`（PUT 仅 ADMIN） | ~60 行 |
| [backend/index.js](../specs/../../subsystems/control/backend/index.js) | 后端 | `register` 追加 `require('./routes-settings').register(app)` | 微增 |
| [manifest.json](../specs/../../subsystems/control/manifest.json) | 配置 | `database.tables` 追加 `control_settings` | 微增 |
| [frontend/index.html](../specs/../../subsystems/control/frontend/index.html) | 入口 | 按 bundle 自动排序引入新 JS（`views/ncr-tab.js`、`js/todo.js`、`js/settings.js`），版本号更新 | 微增 |

> 新增前端 JS 后 MUST 执行 `node tools/build-bundles.js` 重建 bundle 并更新版本号（[§19.1](../AGENTS.md)）。
> `routes-orders.js` 已达 70% 红线（293/400），**禁止**向其追加设置路由，设置路由 MUST 走独立文件。

---

## 5. 文件臃肿检测（实施前预评估，实施后 MUST 复核输出）

| 文件 | 类型 | 有效行数 | 距离上限 | 预警 |
|---|---|---|---|---|
| dashboard.js | View | ~205 | 195（<70%×400=280） | 无 |
| detail.js | View | ~281 | 119 | 无（>70% 但未达 90%×400=360，不阻断） |
| ncr-tab.js | 工具/View（新） | ~60 | — | 无 |
| todo.js | 工具（新） | ~110（≤200） | — | 无 |
| settings.js | 工具（新） | ~90（≤200） | — | 无 |
| routes-orders.js | Controller | 293（≤400） | 107 | **已达 70%×400=280，禁止追加业务逻辑**（本次不改） |
| routes-settings.js | Controller（新） | ~60 | — | 无 |
| dao.js | DAO | 微增 | — | 无 |
| module.css | 样式 | 微增 | — | 无 |

**冗余清单（实施时同步清理）**：无历史未使用导入；重点核查 `ctlBoardHtml` 拆出统计卡/待办后是否残留临时变量。

---

## 6. 验证清单（实施完成后 MUST 执行）

- [ ] 看板：5 张统计卡正确计数（进行中/今日新增/待我签核/待我流转/超期滞留），点击联动跳列表筛选
- [ ] 超期阈值：默认 48h；admin 弹窗修改后保存、刷新看板生效；非 admin 仅读；`control_settings` 落库
- [ ] 看板卡片：显示数量/不良类型/滞留天数/下一步提示
- [ ] 我的待办区：不同角色（QA/RD/ME/CUSTODY/ADMIN）登录后待办清单正确、点击跳详情
- [ ] NCR 明细：可展开记录卡展示 `form_template`，有 `created_by_name` 时显示姓名（后端重启后）
- [ ] 新建 `control_settings` 表成功、`manifest.database.tables` 已登记、建表幂等
- [ ] 双系统隔离：仅改动 control 子系统，未触碰 samples/fixtures/workbench 共享文件
- [ ] bundle 重建成功、版本号已更新、index.html 引用正确
- [ ] 文件臃肿检测报告已输出（§5）
- [ ] 兼容性影响：旧 API 出入参未变（详情聚合仅新增 `created_by_name`），无破坏性变更
- [ ] 上线后监控提示：control 未上线（deployed:false），无线上数据风险

---

## 7. 兼容性影响与部署

- **兼容性**：
  - 前端改动均为新增渲染/待办派生，不改任何 API 出入参、不改状态机/角色权限。
  - `created_by_name` 为详情聚合只读新增字段，旧客户端忽略即可。
  - 新增 `control_settings` 表为独立新表 + 幂等建表，不影响现有 6 张表。
  - 对 samples/fixtures/workbench 零影响（§6.1 子系统隔离）。
- **部署/回滚**：
  - 前端改动（bundle + module.css + 新表依赖）：替换 `bundle.js` 与版本号即可；回滚=换回旧 bundle。
  - 后端 `dao.js` 增强 + `routes-settings.js` + `schema.sql` 建表：需宝塔面板重启生效（按 [§23.2](../AGENTS.md) 提交《重启申请》，由运维执行）。`control_settings` 建表为幂等，重启后自动创建并写入默认 48h。
  - 若暂不重启：`created_by_name` 降级显示 `—`、阈值走默认 48（读取失败回退），均可先跑，**拆分先后上线**。
- **上线后监控**：control 未上线，无线上数据；阈值默认 48h 生效后关注 admin 是否会调低/调高（影响「超期滞留」统计口径），若后续转上线需按 [§20](../AGENTS.md) 走授权流程。

---

## 8. 待评审确认项（用户已确认，回填方案）

1. **超期滞留阈值 = 48h（admin 可调整）** ✅ → 落库 `control_settings.overdue_hours` 默认 48，admin 可改（详见 §3.1.2）。
2. **「今日新增」以 `apply_at` 为准** ✅ → 统计口径用 `apply_at`，老单无 `apply_at` 回退 `created_at`（详见 §3.1.1）。
3. **NCR 创建人姓名依赖后端重启显示** ✅ → 后端 `listNcrLogsByOrder` 左连 users 返回 `created_by_name`（需重启）；前端对缺失做降级显示 `—`（详见 §3.2）。
