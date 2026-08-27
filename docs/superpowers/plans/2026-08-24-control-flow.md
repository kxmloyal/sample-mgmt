# 管制流程管理子系统 · 实现计划（方案B：阶段化流程单 + 进度可视化）

> 生成日期：2026-08-24
> 依据：[2026-08-24-control-flow-design.md](../specs/2026-08-24-control-flow-design.md)（方案B，16 章）
> 覆盖：新增 `control`（管制流程管理）子系统；改造 `workbench`（全局工作台聚合管制待办）
> 关联规范：AGENTS.md §17（插件协议）/ §19（bundle 构建）/ §20（上线保护）/ §21（列表导出）/ §23（禁止自动重启）/ §24（标签标准）

---

## Goal

在现有制造品质管理系统中，以「子系统插件协议」接入一个全新的 **管制流程管理（`control`）** 子系统，用单一流程单打通「需求部门申请管制 → 各单位会签 → 品保贴管制标签 → 入管制仓 → 开不良品委托单 → 品保+研发会签处理方式 → 生管开重工工单 → 生产执行重工 → 报工（良品/不良/报废数） → 入库 → 出货」全链路。

**方案B 核心**：把 11 个步骤归并为 **5 大阶段**，操作按阶段打包、一次提交多步记录；只在 **2 个关键审批闸口**（`APPLY_SIGN`/`DISPOSAL_SIGN`）做会签留痕；**重工单降为记录型**（非会签节点）；详情页提供 **实时进度步骤条 + 阶段卡片 + 会签进度 + 留痕时间轴**（由 `status`+子表/字段存在性实时派生，非落库）；报工自动算结余；主表瘦身（NCR/重工详情拆子表）。子系统 `deployed:false`（未上线，允许造数验证）。

## Architecture

- **单一流程单 + 阶段化**：`control_orders` 为唯一事实来源，主表只存汇总/核心字段；11 步归并为 5 大阶段，操作按阶段打包。进度由 `status`+子表/字段存在性**实时派生**（`progress.js`/`flow.js` 单一来源，非落库）。
- **状态机驱动 + 2 会签闸口**：状态机用 `manifest.json` 声明式（`shared/state-machine.js` 驱动，后端 `canTransition` 权威校验）；2 个关键会签节点（`APPLY_SIGN`/`DISPOSAL_SIGN`）写入 `control_signs` 子表，全部 `AGREE` 后才**允许**对应流转 action（非系统自动推进）；`SIGN_OK`/`DISPOSAL_OK` 作为「会签完成后由特定角色执行」的流转动作。
- **主表瘦身 + 子表承载明细**：NCR 委托明细拆 `control_ncr_logs` 子表；报工明细拆 `control_rework_logs` 子表；`control_orders` 仅存 `ncr_no`（摘要）、`good_qty/ng_qty/scrap_qty/remain_qty`（汇总）。
- **报工自动算结余**：`remain_qty = qty - (good_qty + ng_qty + scrap_qty)`，写入子表后同步更新主表汇总。
- **自包含管制标签**：机制复用、文件自包含 —— `frontend/js/constants/label.js` 复制 `PRESET_MM` 尺寸预设与 contain 缩放规则，标签由 `control_orders` 实时派生，无独立存储/快照；不跨子系统 require。
- **复用 5 角色 + 部门区分**：`roles.use=[ADMIN,RD,QA,CUSTODY,ME]`，`admin=[ADMIN]`；同角色下按 `apply_dept`/`sign_dept` 区分具体单位（如 CUSTODY 下制造部/资材部）。
- **workbench 只读聚合**：`buildWorkbenchSQL` 的 UNION 增加 `control` 分支，仅只读，不改 sample/fixture 分支行为。

## Tech Stack

- 后端：Node.js + Express 4.x（CommonJS）+ MariaDB(mysql2) + dotenv
- 状态机：`shared/state-machine.js` 的 `createStateMachine(manifest.stateMachine)`
- 编号：参考 `subsystems/samples/db/sample-code.js` 的 `sample_seqs` 思想 → 新增 `control_seqs`（`INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq+1` + `FOR UPDATE` 行锁）
- 事务：`db/tx.js` 的 `withTransaction`（经 `D.withTransaction` 调用）
- 导出：`shared/csv.js` 的 `sendCsv`（BOM UTF-8）
- 前端：原生 HTML/CSS/JS 单页（无框架），复用 `shared/frontend/api-base.js`/`modal.js`；`tools/build-bundles.js` 合并为 `bundle.js`
- 测试：`tests/helpers/setup.js`（`getApp()/login()`），账号 admin/rd01/qa01/mfg01/fqc01/me01

---

## File Structure

**新建 `subsystems/control/`**：

| 文件 | 职责 |
|---|---|
| `subsystems/control/manifest.json` | 单一事实来源：id/name/description/version/deployed/icon/route/database/roles/navigation/stateMachine |
| `subsystems/control/backend/index.js` | 导出 `register(app)/initDB()/seed()` |
| `subsystems/control/backend/routes-orders.js` | 主单据 CRUD + 流转 + 会签 + 报工 + 作废（≤400 行，超限拆 helper） |
| `subsystems/control/backend/routes-ncr.js` | **新增**：不良品委托单(NCR)子记录追加（`POST /orders/:id/ncr`） |
| `subsystems/control/backend/routes-label.js` | 管制标签打印 HTML / print / download |
| `subsystems/control/backend/flow.js` | 纯逻辑：2 会签节点模板、会签通过判定、流签推进、进度派生、报工结余计算（可单测） |
| `subsystems/control/db/schema.sql` | **6 张表** DDL（control_orders/control_signs/control_ncr_logs/control_rework_logs/control_logs/control_seqs），幂等 |
| `subsystems/control/db/dao.js` | `createDao(deps)` 数据访问层 |
| `subsystems/control/db/control-code.js` | `order_no` 原子生成器（control_seqs 行锁） |
| `subsystems/control/frontend/index.html` | SPA 入口（仅 bundle.js + fluent，`type=module`） |
| `subsystems/control/frontend/css/module.css` | 状态 badge / 阶段条 / 管制标签 / 详情 Tabs（禁止写入 app.css） |
| `subsystems/control/frontend/js/router.js` | `NAV` + `route()`（解析 hash → `VIEWS[k]`） |
| `subsystems/control/frontend/js/api.js` | `api()` 封装 + 子集 ROLE/STATUS/ACTION_CN |
| `subsystems/control/frontend/js/constants.js` | 业务常量（会签节点、阶段映射、状态映射、action 中文） |
| `subsystems/control/frontend/js/progress.js` | **新增**：进度派生（11 步步骤条 + 5 阶段卡 + 会签进度 + 时间轴数据） |
| `subsystems/control/frontend/js/constants/label.js` | 尺寸预设 `PRESET_MM`（自包含）+ contain 缩放规则 |
| `subsystems/control/frontend/js/views/dashboard.js` | 状态统计/待办/逾期看板 |
| `subsystems/control/frontend/js/views/list.js` | 列表（筛选+分页+导出） |
| `subsystems/control/frontend/js/views/new.js` | 新建管制申请 |
| `subsystems/control/frontend/js/views/detail.js` | 详情（主卡+进度步骤条+阶段卡+Tabs：会签/委托单/报工/日志） |
| `subsystems/control/frontend/js/views/label.js` | 管制标签打印页 |
| `subsystems/control/frontend/js/views/logs.js` | 操作日志（ADMIN） |
| `subsystems/control/seed/seed.js` | 导出 `seed(pool)`（deployed:false 才可运行） |

**修改项目文件**：

| 文件 | 改动 |
|---|---|
| `tools/bundle-sources.json` | 新增 `control` 条目（按依赖顺序脚本列表，含 constants → constants/label → api → progress → views → router） |
| `tools/build-bundles.js` | 新增 `INIT.control`（`window.addEventListener('hashchange',route);boot();`） |
| `subsystems/workbench/db/workbench-queries.js` | `buildWorkbenchSQL` UNION 增加 control 待办分支（含 `stage_cn`、`resp_dept`、`dwell_hours` 统一列） |
| `subsystems/workbench/db/workbench-overdue.js` | `calcOverdue` 增加 control 分支 |
| `subsystems/workbench/backend/index.js` | `parseWorkbenchFilters` type 白名单加 `control`；applySet 兼容 |
| `subsystems/workbench/frontend/js/views/dashboard.js` | 增加「管制」统计卡/筛选 |
| `subsystems/workbench/frontend/js/views/...`（列表/detail） | 类型筛选 `control`、跳转 `/control/...`（若必要） |
| `tests/control-flow.test.js`（新增） | 状态机/会签/编号/报工/进度派生单测 |
| `tests/workbench-control.test.js`（新增） | workbench 聚合 control 分支的 SQL 与服务端筛选测试 |
| `AGENTS.md` / `CLAUDE.md` / README（子系统清单标记块） | `node tools/sync-subsystem-docs.js` 自动维护 + 人工更新第 1/14 节等 |

> 注意：新增子系统后端路由须**重启**才生效（§17 / §23），热载入仅 manifest 层。

---

## Task 1 — 建表 DDL（`db/schema.sql`，6 张表）

**目标**：创建 control 子系统 **6 张表**（幂等 `CREATE TABLE IF NOT EXISTS`），供 `db.js` 自动扫描执行。

**文件**：`subsystems/control/db/schema.sql`

**表**：
1. `control_orders` — 主表（唯一事实来源，瘦身：只存汇总/核心字段），字段完整覆盖 spec §6.1；含 `order_no UNIQUE`、`sales_no`（销货单号）、`status DEFAULT 'DRAFT'`、`remain_qty`；索引 `idx_control_status/idx_control_order_no`。
2. `control_signs` — 会签子表，唯一键 `uk_sign(order_id,node_key,seq)`（2 个闸口节点）。
3. `control_ncr_logs` — **新增**不良品委托单子表（`order_id/ncr_no/inspect_dept/handle_dept/form_template/created_by/created_at`，spec §6.3）。
4. `control_rework_logs` — 报工子表（`work_date/good_qty/ng_qty/scrap_qty/scrap_reason/operator_id/operator_name`，spec §6.4）。
5. `control_logs` — 留痕表（`action/role/user_id/dept/comment`，spec §6.5）。
6. `control_seqs` — 编号序列表（`prefix VARCHAR(16) PRIMARY KEY, cur_seq INT`，spec §6.6）。

**验证**：
- `db.js` 启动能自动执行建表（幂等）；重复启动不报错。
- `SHOW TABLES LIKE 'control_%'` 返回 6 表。

---

## Task 2 — manifest.json（声明式状态机 + 导航）

**目标**：声明 control 子系统的元数据、路由、角色、导航、状态机，框架自动发现。

**文件**：`subsystems/control/manifest.json`

**字段**：
- `id:'control'` / `name:'管制流程管理'` / `description` / `version:'1.0.0'` / `deployed:false` / `icon:'flow'`
- `route: { prefix:'/api/control', entry:'/subsystems/control/frontend/index.html', hashBase:'/control' }`
- `database.tables`: 6 张表（`schema:'db/schema.sql'`）
- `roles: { use:[ADMIN,RD,QA,CUSTODY,ME], admin:[ADMIN] }`
- `navigation`：dashboard/orders/new/detail/label/logs（见 spec §10.1，view 函数名、roles）
- `stateMachine`：`initial:'DRAFT'`，12 状态（`stateMachine.states` 各含 label/color/bg）；transitions 全量（见 spec §7.2，含退回边 `SIGNING→DRAFT`/`DISPOSAL_SIGNING→NCR_DONE` 与 `VOID→RETIRED`）

**验证**：
- `GET /api/subsystems` 返回 control，门户出现「管制流程管理」卡片。
- `createStateMachine(manifest.stateMachine)` 的 `getAllowedActions/canTransition/getStateLabel` 与 spec §7 一致（12 态、12 主流转 + 3 异常边）。

---

## Task 3 — 纯逻辑模块 `backend/flow.js` + `frontend/js/progress.js` + 单测

**目标**：沉淀 2 会签节点模板、会签通过判定、流签推进、进度派生、报工结余的纯逻辑，便于单测与复用（Controller/路由只调用）。

**文件**：
- `subsystems/control/backend/flow.js`
- `subsystems/control/frontend/js/progress.js`（前后端共用同一套派生规则：`flow.js` 为权威、`progress.js` 仅为前端渲染映射）
- `tests/control-flow.test.js`

**内容（`flow.js`）**：
- `SIGN_NODES` 常量：**2 会签节点**（`APPLY_SIGN` 申请管制会签：品保→研发→生管→生产(ME/制造部)→仓库(CUSTODY/资材)；`DISPOSAL_SIGN` 处理方式会签：品保+研发），硬编码初版流程模板（spec §8）。**无 `REWORK_SIGN`**。
- `isNodeComplete(signs, nodeKey)`：某节点所有 `seq` 均 `AGREE`。
- `getNodeSeqForUser(nodeKey, role, dept)`：当前用户应签的 `seq`；`signDepts(nodeKey)` 返回单位清单。
- `rejectPrevState(currentStatus, nodeKey)`：REJECT 回退状态（`SIGNING→DRAFT` / `DISPOSAL_SIGNING→NCR_DONE`）。
- `deriveProgress(order, signs, ncrLogs, reworkLogs)`：由 `status`+子表/字段存在性派生 11 步进度（spec §5.2 表，非落库）。
- `STAGE_OF(status)`：状态 → 5 大阶段分组（阶段1~阶段5，spec §5.1）。
- `summarizeCounts(...)`：报工良品/不良/报废结余计算（`remain_qty = qty - (good+ng+scrap)`）。

**内容（`progress.js`，前端）**：
- 由详情聚合响应调用 `deriveProgress` 结果，渲染 11 步步骤条（高亮当前步/勾选已完成）、5 阶段卡、会签进度（已签 n/待签 m）、留痕时间轴。

**TDD**：
1. 先写 `tests/control-flow.test.js`（会签模板完整性、全部 AGREE 判定、REJECT 回退、进度派生 11 步、结余计算），`npm test -- control-flow` 确认失败（模块未实现）。
2. 实现 `flow.js` 使测试通过。

---

## Task 4 — 编号生成 `db/control-code.js` + 数据访问层 `db/dao.js`

**目标**：实现 `order_no` 原子生成器与 DAO 访问层（工厂模式），供路由调用。

**文件**：
- `subsystems/control/db/control-code.js`
- `subsystems/control/db/dao.js`

**内容**：
- `control-code.js`：`nextOrderNo(opts)` —— 前缀 `CTL` + `YYYYMM`，`INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq`（no-op upsert 建行）→ `SELECT cur_seq ... FOR UPDATE` → `cur_seq+1` 更新返回。`opts.conn` 存在走 `opts.conn.execute`，否则 `opts.query`。
- `dao.js`：`createDao(deps)` 接受 `{q, one, run, nowISO}`，导出 `fetchOne(conn,sql,params)`（事务感知）与各业务方法：`listOrders/createOrder/getOrder/listSigns/listNcrLogs/addNcrLog/addReworkLog/patchOrder/listLogs` 等；对并发 UNIQUE 冲突用 SAVEPOINT 重试（参考 `samples/db/dao.js` 的 `createSample`）。

**验证**：
- 并发取号不重复、连续自增。
- DB 层函数经 `db.js` 扫描展平为 `D.<fnName>()` 可调用。

---

## Task 5 — 后端路由（`routes-orders.js` + `routes-ncr.js` + `routes-label.js` + `index.js` + `seed.js`）

**目标**：暴露 control 的 CRUD、流转、会签、NCR、报工、作废、标签、导出 API；`index.js` 实现 `register/initDB/seed`。

**文件**：
- `subsystems/control/backend/routes-orders.js`（≤400 行，超限将流转/会签/报工拆 helper）
- `subsystems/control/backend/routes-ncr.js`（**新增**，NCR 子记录）
- `subsystems/control/backend/routes-label.js`
- `subsystems/control/backend/index.js`
- `subsystems/control/seed/seed.js`

**API**（前缀 `/api/control`，全部 `requireAuth`，错误 `{error}`）：
- `GET /orders` — 列表（筛选/排序/分页/`export`）
- `GET /orders/:id` — 详情聚合（主卡 + 阶段/进度 + 会签 + 委托单 + 报工 + 日志）
- `POST /orders` — 创建（写 `control_orders` + 初始化 `APPLY_SIGN` 会签模板，生成 `order_no`）
- `PUT /orders/:id` — 编辑草稿（申请人/ADMIN）
- `POST /orders/:id/transition` — 状态流转 `{action,comment}`，`canTransition(role,from,action)` 校验 + 对应会签节点全通过校验（闸口未全通过 → 400「该节点会签未完成」）
- `POST /orders/:id/sign` — 会签签字 `{node_key,decision,comment}`；唯一键冲突→400「该节点已签字」；REJECT 记录+回退（`SIGNING→DRAFT`/`DISPOSAL_SIGNING→NCR_DONE`）
- `POST /orders/:id/ncr` — **新增**：追加不良品委托单记录（写 `control_ncr_logs` + 更新 `control_orders.ncr_no`，QA）
- `POST /orders/:id/rework-log` — 追加报工记录（写 `control_rework_logs` + 更新汇总 `good_qty/ng_qty/scrap_qty/remain_qty`，`remain=qty-good-ng-scrap`）
- `POST /orders/:id/void` — 作废（ADMIN → RETIRED）
- `GET /orders/:id/label` / `/label/print` — 标签可打印 HTML（登录）；`label/download` 仅 ADMIN/QA/RD
- `GET /orders/export` — `sendCsv` BOM UTF-8，中文状态、时间 `YYYY-MM-DD HH:mm`

**写操作**：流转/会签/报工/NCR MUST 用 `D.withTransaction(async conn => {...})` 保证状态与会签/报工/留痕原子。

**seed.js**：`deployed:false` 才运行（读 manifest 判断，若 `true` 拒绝执行）；造 6+ 条覆盖各状态（含含 `control_ncr_logs`/`control_rework_logs` 子表数据的单据）。

**验证**：`curl`/测试登录各角色，走完整流程到 SHIPPED；导出 CSV 列正确。

---

## Task 6 — 前端视图（`index.html` + `router.js` + `views/*` + `api.js` + `constants.js` + `progress.js`）

**目标**：完成 SPA 前端，复用 `api-base.js`/`modal.js`；标签自包含；详情页进度可视化。

**文件**：
- `subsystems/control/frontend/index.html`
- `js/router.js` / `js/api.js` / `js/constants.js` / `js/progress.js` / `js/constants/label.js`
- `js/views/{dashboard,list,new,detail,label,logs}.js`
- `css/module.css`

**结构**：
- `index.html`：`<link rel="stylesheet" href="/css/app.css?v=...">` + `module.css`；`<script type="module" src="/vendor/fluentui-web-components.js">` + `<script src=".../js/bundle.js?v=<ver>" defer>`（§19.3 规范，不内联 boot）。
- `router.js`：`NAV`（含 roles 过滤），`buildNav()`，`route()` 读 `location.hash` → `VIEWS[k]`。
- `dashboard.js`：`.kb-stat` 统计卡（§18.3）+ 状态/逾期待办联动筛选；按 5 阶段分组统计。
- `list.js`：筛选栏（含「导出 CSV」按钮，`location.href` 触发）+ 分页 + 状态 badge（`statusBadge`）+ `t.status` 语义由 manifest 状态决定（control 无动态延期，直接用 `t.status`，但可展示 `stage_cn`）。
- `new.js`：表单创建管制申请单（填写申请信息，提交后进入会签）。
- `detail.js`：主卡 + **进度步骤条（11 步）+ 阶段卡（5 阶段，当前阶段高亮并提供该阶段合并操作入口）** + Tabs（会签记录/不良品委托单/报工报废/留痕日志），操作后局部刷新（借鉴 samples `tdRefresh` 模式，禁全量重渲染）。
- `label.js`：`PRESET_MM`（小37×18/中52×25/大60×40+自定义30~150mm）+ contain 缩放；实时派生渲染管制标签（左 QR + order_no/料号/品名/不良原因/日期）。
- `logs.js`：ADMIN 操作日志。

**验证**：浏览器流完整流程；标签打印 HTML 快照；详情页进度步骤条/阶段卡/会签进度渲染正确；各视图在 XS/SM/MD/LG/XL 断点正常渲染。

---

## Task 7 — bundle 构建配置

**目标**：把 control 前端 JS 合并为 `bundle.js`，并重建受影响 bundle。

**文件**：
- `tools/bundle-sources.json`（新增 `control` 条目，按依赖顺序：constants → constants/label → api → progress → views → router）
- `tools/build-bundles.js`（`INIT.control = "window.addEventListener('hashchange',route);boot();"`）
- `subsystems/control/frontend/js/bundle.js`（构建产物）

**验证**：`node tools/build-bundles.js` 生成 `/tmp/bundle-control.js`（并确认 samples/fixtures/workbench/projects 四组仍正常），复制到 `control/frontend/js/bundle.js`，`index.html` 引用 `bundle.js?v=<ver>`（`tools/.bundle-ver`）。

---

## Task 8 — workbench 聚合管制待办（共享文件改动，需双系统回归）

**目标**：只读聚合 control 待办进全局工作台，不改 sample/fixture 分支行为（§6.1）。

**文件**：
- `subsystems/workbench/db/workbench-queries.js`：`buildWorkbenchSQL` UNION 增加 control 分支（状态∈进行中非终态；输出 `item_type='control'`、`item_no=order_no`、**`stage_cn`（阶段中文）**、`resp_dept`、`dwell_hours` 等统一列）。
- `subsystems/workbench/db/workbench-overdue.js`：`calcOverdue` 增加 control 分支（`hours=item.dwell_hours||0`，`reason='停留中('+stage_cn+')'`）。
- `subsystems/workbench/backend/index.js`：`parseWorkbenchFilters` type 白名单加 `control`；`summary/deptStats` 兼容。
- `subsystems/workbench/frontend/js/views/dashboard.js` 等：类型筛选/`.kb-stat` 增加「管制」；`wb-detail` 跳 `/control/...`、展示阶段。

**验证**（§6.1 双系统回归）：
- samples 列表/看板/扫码/标签 无变化；
- fixtures 列表/看板/扫码/验证移交 无变化；
- workbench：sample/fixture 待办、统计、阈值、`calcOverdue` 无变化，新增 `control` 类型正常。
- 重建 workbench bundle。

---

## Task 9 — 集成/回归测试

**目标**：覆盖全链路与共享文件回归。

**文件**：
- `tests/control-flow.test.js`（单元：状态机/会签/编号/报工结余/进度派生/CSV）
- `tests/workbench-control.test.js`（workbench 聚合 control 分支）
- 全链路：`GET /api/control/orders`、完整流转到 SHIPPED、会签 REJECT 回退、闸口未全通过拦截（400）、重复签字冲突、NCR 追加、报工结余计算、导出 CSV、标签 HTML。

**验证**：`npm test` 全部通过；workbench 对 samples/fixtures 只读回归通过；`deployed:false` 允许造数。

---

## Task 10 — 部署 / 重启申请

**目标**：将 control 投入运行（遵守 §23 禁止自动重启，新子系统后端路由需重启生效）。

**步骤**：
1. 全目录 + manifest/backend/db/frontend/seed 就绪；`node tools/build-bundles.js` 复制 bundle；`chown www:www`。
2. `node tools/sync-subsystem-docs.js` 同步文档标记块 + 人工更新 AGENTS/CLAUDE/README 相应章节。
3. **提交《重启申请》**（§23.2）：原因（接入新子系统后端路由）、影响范围、涉及文件、回滚方案 → 用户/运维审核 → 运维用宝塔「停止→启动」。
4. workbench 聚合若未完成，先装 control（不勾 control 聚合），再单独改 workbench + 重建 bundle + 再次重启申请。

**回滚**：移除 `subsystems/control/`；`tools/bundle-sources.json` 移除 control 条目并重建；workbench 回退 control 分支；走一次重启申请。

---

## Self-Review

- [x] **Spec 覆盖**：计划逐条覆盖 spec 16 章（背景目标/需求/范围/定位/数据模型/状态机/会签/标签/前端 API/workbench 聚合/错误处理/测试/部署/隔离/风险）。
- [x] **方案B 一致**：5 大阶段、2 会签闸口（无 `REWORK_SIGN`）、6 张表（含 `control_ncr_logs`）、重工单降为记录型、进度可视化（`progress.js`）、报工自动算结余（`remain=qty-good-ng-scrap`）。
- [x] **版本一致性**：manifest `deployed:false`，`route.prefix=/api/control`，导航 view 名与 spec §10.1 一致，12 状态名与 spec §7 一致。
- [x] **占位符**：无 `TODO`/`TBD`/待定数值残留；尺寸/状态/接口均为具体值。
- [x] **协议合规**：后端 `register/initDB/seed` 完整；前端 `index.html` 符合 §19.3；样式写 `module.css`；不跨子系统 require；不动 `server.js`/`portal.html`/`app.css`（仅 workbench 聚合为共享改动）。
- [x] **切换点**：会签通过衔接（全 AGREE 才允许流转 action，违者 400）在 Task 3/5 明确；`sales_no` 补字段在 schema/DAO/详情覆盖；闸口②后生管登记 `rework_no`+`rework_sop`（记录型非会签）。
- [x] **业务回归清单**：Task 8 明确 samples/fixtures 双系统回归 + 全链路三系统验证。

---

## Execution

计划已保存至 `docs/superpowers/plans/2026-08-24-control-flow.md`。

两种执行方式：
1. **Subagent-Driven（推荐）**：按 Task 1→10 逐个派发独立 subagent，Task 间审查，符合 AGENTS.md §5 进程。
2. **Inline Execution**：在当前会话内按 Task 顺序直接实现。

需要哪种执行方式？
