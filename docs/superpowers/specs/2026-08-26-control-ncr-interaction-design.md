# 管制流程管理子系统 · 管制单 ⇄ 不良品委托单（NCR）关联交互优化设计文档

> 生成日期：2026-08-26
> 状态：**已确认，待实施**
> 关联规范：[AGENTS.md §17 子系统插件协议](../AGENTS.md)、[§18 卡片设计系统](../AGENTS.md)、[§19 bundle 构建](../AGENTS.md)、[§21 列表导出](../AGENTS.md)、[§5 强制工作流程](../AGENTS.md)
> 覆盖子系统：`control`（管制流程管理，`deployed: false` 未上线，可自由改动）
> 前置设计：[2026-08-24-control-flow-design.md](2026-08-24-control-flow-design.md)、[2026-08-26-control-dashboard-todo-design.md](2026-08-26-control-dashboard-todo-design.md)
> 演进原因：本文档为 2026-08-26 交互链路优化设计的**延续**，聚焦「管制单列表 ↔ 不良品委托单」的关联交互增强。

---

## 1. 背景与目标

用户反馈管制单列表与不良品委托单（NCR）之间的关联交互存在信息缺漏与单向性，核心痛点：

1. **列表信息不完整**：管制单列表仅显示主单单个摘要字段 `ncr_no`；当一张管制单开出**多张** NCR 时，列表无法体现全貌。
2. **NCR 无独立检索/聚合入口**：NCR 明细仅在管制单详情页的「不良品委托单」Tab 内展示，品保（QA）无法集中检索「我开出过的所有委托单」，也无法跨单按单号/检验部门/处理部门/创建人检索。
3. **关联单向**：只能从「管制单 → 详情 → 看 NCR」；无法从 NCR 出发反查所属管制单，缺双向直达。

**目标**：落地「**独立 NCR 聚合页 + 双向跳转 + 列表内联增强**」，一次解决以上三个痛点。经用户确认：
- NCR 聚合页**全部角色可见**（ADMIN/RD/QA/CUSTODY/ME）。
- 管制单列表「委托单号」列（多张时）点击采用**行内展开全部 NCR**。

---

## 2. 现状诊断（数据与代码）

| 实体 | 位置 | 现状 |
|---|---|---|
| 主单 | `control_orders` | 含 `ncr_no`（⑤ 摘要，单值），列表页 `list.js` 直接展示该字段 |
| 明细 | `control_ncr_logs` | 一对多子表，每张管制单可挂多张 NCR；字段 `ncr_no/inspect_dept/handle_dept/form_template/created_by/created_at` |
| NCR 追加 | `backend/routes-ncr.js` | 仅 `POST /api/control/orders/:id/ncr`，无聚合列表/导出接口 |
| NCR 明细查询 | `db/dao.js` `listNcrLogsByOrder` | `SELECT *` 左连 users 带 `created_by_name`，仅供单详情使用 |
| NCR 展示 | `frontend/js/views/ncr-tab.js` | 详情页「不良品委托单」Tab 内展开卡，无独立视图 |
| 列表 UI | `frontend/js/views/list.js` | 委托单号列 = 单个 `o.ncr_no` |

**数据关系**：1 张管制单 → 多张 NCR（`control_ncr_logs.order_id` 关联 `control_orders.id`）。NCR 无独立状态机，状态由管制单状态机驱动（`CONTROL_STORED → NCR_DONE → DISPOSAL_SIGNING`）。

---

## 3. 方案设计

### 3.1 后端：NCR 聚合接口（只读 + 复用导出）

**新增 DAO**（`db/dao.js`）：
- `listNcrAgg(opts)`：从 `control_ncr_logs` 左连 `control_orders`（带 `order_no/part_no/part_name/status`），左连 `users`（带 `created_by_name`），按 `ncr_no`/`order_no`/`inspect_dept`/`handle_dept`/`created_by_name`/`created_at` 区间筛选，`ORDER BY id DESC` + 分页。
- `countNcrAgg(opts)`：对应计数。

**新增/扩展路由**（`backend/routes-ncr.js`，文件当前 55 行，安全容量内）：
- `GET /api/control/ncrs`：登录即可，返回 `{ ncrs, total }`，筛选/排序/分页参数与列表页对齐。
- `GET /api/control/ncrs/export`：复用 `shared/csv.js` 的 `sendCsv`，导出列 = NCR 核心字段（委托单号/所属管制单/料号/品名/状态/检验部门/处理部门/表单版本/创建人/创建时间），**忽略分页取全量**（AGENTS.md §21）。

### 3.2 前端：独立「不良品委托单」聚合页

**新增视图**（`frontend/js/views/ncr-list.js`）：
- `renderNcrList()`：筛选栏（委托单号/所属管制单/检验部门/处理部门/创建人/日期区间）+ 表格 + 分页 + 导出 CSV。
- 表格列：委托单号、所属管制单、料号、品名、状态、检验部门、处理部门、表单版本、创建人、创建时间。
- 行点击跳 `#/detail?id=<order_id>&focusNcr=<ncr_no>`（回跳管制单详情并定位该张 NCR）。

**导航**（`frontend/js/router.js` + `manifest.json`）：
- `NAV`/`PAGE_TITLE`/`VIEWS` 新增 `ncr` 项，位置在 `orders` 之后；`manifest.navigation` 同步（AGENTS.md §17.3 单一事实来源）。

### 3.3 前端：管制单列表「委托单号」列行内增强

**修改**（`frontend/js/views/list.js`）：
- 列表额外拉取每单 NCR 数量（或复用聚合接口按 `order_id` 聚合），委托单号列显示：单张 → 直接显示 `ncr_no`；多张 → 显示「首单号 +N」，点击该单元格**行内展开**本单全部 NCR 明细面板（复用 `renderNcrTab` 展开卡样式），再次点击收起。
- 若该单无 NCR，显示「—」。

### 3.4 双向跳转 + 定位

**聚合页 → 详情定位**：
- 详情页支持定位参数 `focusNcr`（路由 `#/detail?id=x&focusNcr=NCR-xxx`）。`detail.js` 渲染 NCR Tab 后，若命中该委托单号则**自动切到「不良品委托单」Tab 并展开/高亮**该张 NCR 卡。
- 定位逻辑放 `ncr-tab.js`（`ctlFocusNcrCard(ncrNo)`），`detail.js` 仅接线，避免后者持续膨胀。

**详情 NCR 卡 → 聚合页**：
- 每张 NCR 展开卡提供「复制单号」入口（`navigator.clipboard`）。
- NCR Tab 头部提供「在委托单页查看」链接跳 `#/ncr`。

---

## 4. 权限

| 访问 | 角色 |
|---|---|
| `GET /api/control/ncrs` / `ncrs/export` | 登录即可（全部角色） |
| NCR 聚合页导航 | 全部角色（与其它导航项一致） |
| NCR 追加（开单） | 仍仅 QA/ADMIN，走现有 `POST /orders/:id/ncr` |

---

## 5. 容量约束（写入即执行）

| 文件 | 类型 | 现有效行 | 上限 | 说明 |
|---|---|---|---|---|
| `backend/routes-ncr.js` | Controller | 55 | 400 | 新增 ~50 行，安全 |
| `db/dao.js` | DAO | 161 | 400 | 新增 ~25 行，安全 |
| `frontend/js/views/ncr-list.js` | View | 新建 | 400 | 保持 ≤120 行 |
| `frontend/js/views/list.js` | View | 114 | 400 | 新增 ~35 行，安全 |
| `frontend/js/views/detail.js` | View | 285 | 400（70% 预警 = 280） | **已超 70% 预警**：仅允许极小接线（≤5 行），不新增业务；定位逻辑下沉 `ncr-tab.js`。会签闸口/报工等已有拆分由后续迭代处理 |
| `frontend/js/views/ncr-tab.js` | 组件 | 21 | 300 | 新增 focus 函数，安全 |

> 其余改动为导航/清单/样式/构建，均远低于红线。

---

## 6. 回归验证清单

- [ ] 管制单列表：单张 NCR 显示单号；多张显示「首单号 +N」，点击行内展开全部，再次点击收起；无 NCR 显示「—」。
- [ ] 「不良品委托单」聚合页：筛选（单号/所属管制单/检验部门/处理部门/创建人）各维度生效；分页正确；导出 CSV 列完整、中文/时间格式符合 §21。
- [ ] 聚合页行点击 → 跳管制单详情并自动定位展开该张 NCR。
- [ ] 详情 NCR 卡 → 「复制单号」「在委托单页查看」入口可用。
- [ ] 各角色（含 QA/CUSTODY/RD/ME/ADMIN）均可见并可用聚合页导航。
- [ ] bundle 重建后版本号更新，浏览器刷新生效（前端改动，后端重启后聚合接口生效）。
- [ ] 子系统隔离：仅动 `control` 子系统内文件，不触及其他子系统。

---

## 7. 部署/回滚

- **部署**：前端改动随 bundle 重建生效；后端两个新接口需**重启 sample-mgmt 进程**（运维经宝塔面板执行，AGENTS.md §23）。`control` 子系统 `deployed:false`，无上线保护约束。
- **回滚**：撤销本次改动对应文件；后端回滚后重启；聚合接口为新增只读接口，不影响既有接口。
