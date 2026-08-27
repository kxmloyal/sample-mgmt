# 管制流程管理 · 不良品委托单「电子表单化」设计

> 生成日期：2026-08-27
> 状态：待用户评审（设计已确认）
> 关联规范：[AGENTS.md §17 子系统插件协议](../AGENTS.md)、[§5 强制工作流程](../AGENTS.md)、[§6.1 子系统隔离原则](../AGENTS.md)、[§7.1 文件容量红线](../AGENTS.md)、[§19 bundle 构建](../AGENTS.md)、[§20 上线保护](../AGENTS.md)
> 覆盖子系统：`control`（管制流程管理）
> 参考文档：[2026-08-24-control-flow-design.md](./2026-08-24-control-flow-design.md)、[2026-08-26-control-ncr-interaction-design.md](./2026-08-26-control-ncr-interaction-design.md)、[2026-08-26-control-ncr-detail.md](./2026-08-26-control-ncr-detail.md)

---

## 1. 背景与目标

`control` 子系统已具备不良品委托单（NCR）的基本留痕：子表 `control_ncr_logs` + 主表 `control_orders` 的相关字段（详见 [2026-08-26-control-ncr-detail.md](./2026-08-26-control-ncr-detail.md)）。但当前为「分解式」存储——字段分散在会签闸口/不良品委托单/报工多个 Tab 中，**没有一张与线下纸质表单 `(GYS-Q2-008_01)不良品委托检验单_V1.doc` 版式一致的「电子表单视图」**，且若干表单字段（客户、不良原因分项、包装SOP编号）尚未建模。

**目标**：
1. **全补全**：把 Word 表单缺失字段（客户、不良原因 5 分项、包装SOP编号）补齐到 `control_orders`。
2. **表单化视图**：在单据详情页新增「电子表单」Tab，把主单 + 报工子表相关字段按 Word 表单栏位渲染成一张可打印的电子表单，便于查看与留痕。

**约束**：不新建独立副本存储；全部新字段可空兼容存量；仅改 `control` 子系统，不触碰 `samples`/`fixtures`。

## 2. 需求概述（Word 表单字段 → 系统字段落点）

经与用户逐项确认，本方案在此前 [2026-08-26-control-ncr-detail.md](./2026-08-26-control-ncr-detail.md) 已落点基础上**新增以下字段**（★=本方案新增，全部存入 `control_orders` 主表）：

| 表单区块 | Word 字段 | 系统落点 | 填写时点 | 是否新增 |
|---|---|---|---|---|
| 基本信息 | 客户 | 主表 `control_orders.customer` | 建单/编辑草稿 | ★新增 |
| 基本信息 | 销货单号/料号/品名/机种/数量 | 主表 `sales_no`/`part_no`/`part_name`/`model`/`qty` | 建单 | 已有 |
| 基本信息 | 喷码日期 | 主表 `control_orders.spray_date` | 建单/编辑草稿 | 已有 |
| 不良原因分析 | 外观/功能/尺寸/设变/其他 | 主表 `bad_appearance`/`bad_function`/`bad_size`/`bad_change`/`bad_other` | 建单/开NCR | ★新增 |
| 不良原因分析 | 不良类型+管制原因 | 主表 `bad_type`/`reason` | 建单/开NCR | 已有 |
| 解决方案 | 处理方式结论 | 主表 `disposal_opinion` | 闸口②会签(DISPOSAL_OK) | 已有 |
| 解决方案 | 包装SOP编号 | 主表 `control_orders.pack_sop` | 处理方式会签(DISPATCH) | ★新增 |
| 重工/全检标准 | 重工SOP/现场指导/其他标准 | 主表 `rework_sop`/`rework_guide`/`rework_other` | 处理方式会签(DISPATCH) | 已有 |
| 处理结果 | 全检/重工数量、不良/合格/报废 | 主表 `good_qty`/`ng_qty`/`scrap_qty` + 报工子表 | 报工 | 已有 |
| 处理结果 | 批次号/包装称重/确认人/数量一致 | 报工子表 `control_rework_logs.*` | 报工(REPORT) | 已有 |
| 签核 | 检验部门/处理部门 | NCR子表 `control_ncr_logs.inspect_dept`/`handle_dept` | 开委托单 | 已有 |
| 签核 | 委托部门/主管/经办 | 复用 `apply_dept`/`applicant_name`/`created_by` | 各流转 | 已有（复用）

> 说明：解决方案保留 `disposal_opinion` 文本（不勾选化），仅新增 `pack_sop` 一个包装SOP编号字段。不良原因拆为 5 个独立分项字段。

## 3. 数据模型变更（`control_orders` 追加 7 列）

在 `subsystems/control/db/schema.sql` 主表 `control_orders` 的 `rework_other` 之后追加：

```sql
  customer VARCHAR(100),                       -- 客户（基本信息）
  bad_appearance TEXT,                         -- 不良原因分析·外观
  bad_function TEXT,                           -- 不良原因分析·功能
  bad_size TEXT,                               -- 不良原因分析·尺寸
  bad_change TEXT,                             -- 不良原因分析·设变
  bad_other TEXT,                              -- 不良原因分析·其他
  pack_sop VARCHAR(100),                       -- 包装SOP编号（解决方案）
```

同步在 `db/migrations.js` 的 `runMigrations(pool)` 注册 `migrateControlNcrForm(pool)`，对上述 7 列幂等 ALTER（`catch e.code==='ER_DUP_FIELDNAME'` 跳过）。

## 4. 范围与非目标

**范围内**
- `control_orders` 追加 `customer`/`bad_appearance`/`bad_function`/`bad_size`/`bad_change`/`bad_other`/`pack_sop` 7 列；schema.sql + migrations 同步。
- DAO：`createOrder`/`updateOrder` INSERT/UPDATE 补 7 列。
- 前端开单（`new.js`）：基本信息组加「客户」，新增「不良原因分析」组 5 分项输入。
- 处理方式会签（DISPATCH，`detail.js`/`ncr-form.js`）：补「包装SOP编号」输入。
- 详情页新增「电子表单」Tab（key=`form`），按 Word 栏位渲染表单卡片，含「打印」按钮。
- 样式写入 `subsystems/control/frontend/css/module.css`。
- bundle 重建（`node tools/build-bundles.js` + 复制 + 更新版本号）。

**非目标**
- 不勾选化「解决方案」8 选项，保留 `disposal_opinion` 文本。
- 不新增 `control_ncr_logs`/`control_rework_logs` 字段。
- 不新建独立副本/冗余表。
- 不改变状态机、流转逻辑与 NCR 聚合页/聚合导出（导出列保持默认 10 列不变）。

## 5. 电子表单 Tab 视图设计

### 5.1 入口
详情页 Tab 栏由 `['sign','会签闸口'],['ncr','不良品委托单'],['rework','报工'],['logs','操作日志']` 扩为追加 `['form','电子表单']`，置于 `logs` 之后。

**方案 D（2026-08-27 落地）**：详情页按订单状态自动定位默认 Tab。已开委托单的后续阶段（`NCR_DONE` / `DISPOSAL_SIGNING` / `REWORK_OPENED` / `REWORKING` / `REWORK_REPORTED` / `REIN_STOCK` / `SHIPPED`，常量 `_CTL_FORM_STATES`）默认落在「电子表单」Tab（`form`），其余早期状态默认落在「会签闸口」Tab（`sign`）。实现在 `renderDetailBody()` 开头按 `o.status` 重置 `_ctlDetailTab`（见 [detail.js](../../../subsystems/control/frontend/js/views/detail.js)）。

### 5.2 版式（贴近 Word 表单栏位）
一张表单卡片（`.ctl-ncr-form`，`@media(max-width)` 单列降级），自上而下：

1. **表头**：居左标题「不良品委托检验单」+ 右上「表单编号：GYS-Q2-008_01 REV_1」+ 印章行「表单编号:GYS-Q2-008_01 REV_1」。
2. **基本信息**：销货单号 / 料号 / 品名 / 机种 / 客户 / 喷码日期 / 数量。
3. **不良原因分析**：外观 / 功能 / 尺寸 / 设变 / 其他 5 分项。
4. **解决方案（处理方式）**：处理方式结论 `disposal_opinion` + 包装SOP编号 `pack_sop`。
5. **重工/全检标准文件**：重工SOP `rework_sop` / 现场指导 `rework_guide` / 其他标准文件 `rework_other`。
6. **处理结果**：全检/重工数量、不良品数、合格品数、批次号、确认数量是否一致、确认人、包装称重记录（取报工子表最近一条，或汇总主表 `good_qty`/`ng_qty`/`scrap_qty`）。
7. **签署栏**：检验部门 / 处理部门（取 NCR 子表最近的 `inspect_dept`/`handle_dept`）、委托部门（`apply_dept`）；主管/经办（复用 `applicant_name`/`created_by`）。

### 5.3 打印
表单卡片顶部提供「打印」按钮，调用 `window.print()`（打印样式 `@media print` 隐藏导航/按钮，仅打印表单区域）。

### 5.4 数据来源
- 主单字段直接读 `agg.order`。
- 处理结果以报工子表最新一条为主，无则取主表 `good_qty`/`ng_qty`/`scrap_qty`；批次号/包装称重/确认人/数量一致从 `_ctlDetailAgg.reworkLogs` 最近一条。
- 签署栏检验/处理部门取 `_ctlDetailAgg.ncrLogs` 最近一条。
- 涉及格式化时间为 `YYYY-MM-DD HH:mm`（复用 `fmtTime`）。

## 6. 文件改动清单（预估）

| 文件 | 类型 | 改动 |
|---|---|---|
| `subsystems/control/db/schema.sql` | SQL | 主表追加 7 列 |
| `db/migrations.js` | JS | 注册 `migrateControlNcrForm` |
| `subsystems/control/db/dao.js` | JS | `createOrder`/`updateOrder` 补 7 列 |
| `subsystems/control/backend/routes-orders.js` | JS | `POST /api/control/orders` 建单与「编辑草稿」白名单补 7 列（第 148 行 `createOrder` 调用处） |
| `subsystems/control/frontend/js/views/new.js` | JS | 加「客户」+「不良原因分析」5 分项输入 |
| `subsystems/control/frontend/js/views/detail.js` | JS | Tab 加「电子表单」；DISPATCH 表单补「包装SOP编号」；接入 `renderNcrFormTab`；方案 D 按状态自动定位 Tab |
| `subsystems/control/frontend/js/views/ncr-form.js` | JS | 补 `pack_sop` 到 DISPATCH 字段定义 |
| `subsystems/control/frontend/js/views/ncr-form-view.js` | JS（新建） | 电子表单视图渲染函数 `renderNcrFormTab`/`qtyOf` |
| `subsystems/control/frontend/css/module.css` | CSS | 电子表单卡片样式 + `@media print` |
| `subsystems/control/frontend/js/bundle.js` | bundle | 重建（文件列表变化） |
| `subsystems/control/frontend/index.html` | HTML | bundle 版本号 |

> 电子表单视图函数独立成 `ncr-form-view.js`（detail.js 已达容量预警线，避免继续膨胀）。

## 7. 兼容性与隔离

- 7 列全部可空，存量数据不受影响；增量迁移幂等。
- 不删字段、不改接口出入参（新增字段可选）。
- 仅改 `control` 子系统；`samples`/`fixtures` 不回归（无共享文件改动，bundle 仅重建 control）。
- `db/migrations.js` 为共享文件，新增迁移函数不影响其他子系统建表。

## 8. 验证清单

- [x] 迁移幂等：重启后无重复列报错。
- [x] 建单录入「客户/不良原因分项」落库成功。
- [x] 处理方式会签录「包装SOP编号」落库成功。
- [x] 电子表单 Tab 栏位齐全、字段值正确（含报工子表回填）。
- [x] 打印按钮样式在打印预览不破版。
- [x] 断点：MD 双栏居中，窄屏单列降级。
- [x] 文件容量红线达标（controller/view ≤400 行，70% 预警）。
- [x] bundle 重建版本号一致（`bmtb0zgew`）。
- [x] 子系统隔离：样品/治具功能无变化。
- [x] 方案 D：详情页按状态自动定位电子表单/会签闸口 Tab。

## 9. 部署与回滚

- 部署：改代码 → `node tools/build-bundles.js` + 复制 bundle + 更新版本号 → 运维宝塔重启。
- 回滚：`git revert` 本迭代；新列可空，无需数据回滚。
