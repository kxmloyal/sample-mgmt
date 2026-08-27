# 管制流程管理子系统 · 设计文档（方案B：阶段化流程单 + 进度可视化）

> 生成日期：2026-08-24
> 状态：待用户评审（已确认方案B）
> 关联规范：[AGENTS.md §17 子系统插件协议](../AGENTS.md)、[§5 强制工作流程](../AGENTS.md)、[§6.1 子系统隔离原则](../AGENTS.md)、[§19 bundle 构建](../AGENTS.md)、[§20 上线保护](../AGENTS.md)、[§21 列表导出](../AGENTS.md)、[§23 禁止自动重启](../AGENTS.md)、[§24 标签标准](../AGENTS.md)
> 覆盖子系统：新增 `control`（管制流程管理）；改造 `workbench`（全局工作台聚合管制待办）

---

## 1. 背景与目标

制造品质管理系统中存在一条跨部门「管制品/不良品处理」主线：从需求部门发起管制申请，经各单位会签，品保贴管制标签、入管制仓，随后对不良品开委托单、联合研发会签处理方式，生管开重工工单、生产执行重工并报工，最终入库出货。目前该系统在框架外（纸质/邮件/线下），无法留痕、无法跟踪积压、无法按部门统计。

**目标**：以子系统插件协议接入一个「管制流程管理」子系统，用**单一流程单**串联这条主线。**方案B：阶段化流程单 + 进度可视化** —— 把 11 个步骤归并为 5 大阶段，操作按阶段打包、一次提交多步记录；只在**2 个关键审批闸口**做会签留痕；详情页提供**实时进度步骤条 + 会签进度 + 留痕时间轴**；报工自动算结余；主表瘦身（NCR/重工详情拆子表）。实现高效、可行、留痕、可执行、可追溯，并复用现有角色体系与框架能力。

## 2. 需求概述（用户流程）

```
需求部门申请管制(管制品申请单)
  → 会签各单位                          [闸口①  审批：是否批准管制]
  → 品保依管制需求贴管制标签
  → 仓库入管制品仓
  → 开出不良品委托单
  → 品保+研发会签处理方式(可会议讨论)      [闸口②  审批：处理方式]
  → 会签到生管开重工工单
  → 生产依重工工单+重工SOP 安排重工
  → 生产报工(良品/不良品数量、物料报废申请)
  → 入库
  → 出货
```

## 3. 范围与非目标

**范围内**
- 管制/不良品处理单一流程单贯穿全流程，**阶段化**（5 阶段）操作
- 状态机驱动 + 会签子表（**2 个关键闸口**：申请管制会签、处理方式会签）
- **进度可视化**：详情页实时步骤条、阶段分组、会签进度、留痕时间轴
- 管制标签打印（自包含复用，尺寸预设与实时派生机制）
- 报工良品/不良品/报废数量与物料报废申请留痕，**自动算结余**
- 不良品委托检验单字段复用（补 `sales_no`；NCR 明细拆子表 `control_ncr_logs`；不做独立打印页）
- 全局工作台聚合管制待办（只读，展示阶段/停留时长/逾期）

**非目标（YAGNI，明确不做）**
- 不做通用审批流引擎（加签/转签/代理/时限提醒）
- 不做独立物料主数据/批次库存系统（料号/品名作为单据字段录入即可，不管理库存账）
- 不做样品/治具/项目追踪以外的额外角色扩展
- 不做生产排程/产能（重工工单仅是记录编号与 SOP，不排产）

## 4. 子系统定位

- **id**：`control`，目录名 `subsystems/control/`
- **name**：管制流程管理
- **接入**：完全遵循 [AGENTS.md §17](file:///www/wwwroot/sample-mgmt/AGENTS.md) 插件协议，框架自动发现，不修改 `server.js`/`portal.html`/`app.css`
- **上线状态**：`"deployed": false`（[§20.3](file:///www/wwwroot/sample-mgmt/AGENTS.md)，未上线，允许注入测试数据验证；上线须用户授权后改 `true`）
- **路由前缀**：`/api/control`；前端入口 `/subsystems/control/frontend/index.html`；hash 基准 `/control`
- **角色**：`use` 为 `[ADMIN, RD, QA, CUSTODY, ME]`，`admin` 为 `[ADMIN]`；**复用 5 角色，部门字段区分单位**（如 CUSTODY 下制造部/资材部）

### 目标目录结构

```
subsystems/control/
├── manifest.json
├── backend/
│   ├── index.js              # register(app)/initDB()/seed()
│   ├── routes-orders.js      # 主单据 CRUD + 阶段流转 + 会签 + 报工（≤400 行）
│   ├── routes-ncr.js         # 不良品委托单(NCR) 子记录
│   └── routes-label.js       # 管制标签打印
├── db/
│   ├── schema.sql            # 6 张表 DDL
│   └── dao.js                # 数据访问层 + control-code.js(编号)
├── frontend/
│   ├── index.html
│   ├── css/module.css        # 状态 badge / 阶段条 / 管制标签样式（禁止写入 app.css）
│   └── js/
│       ├── constants.js / api.js / progress.js
│       ├── constants/label.js    # 尺寸预设 PRESET_MM（自包含）
│       ├── views/{dashboard,list,new,detail,label,logs}.js
│       └── router.js
└── seed/seed.js              # 测试数据（deployed:false 才允许运行）
```

## 5. 阶段划分与进度派生

### 5.1 五大阶段

| 阶段 | 名称 | 覆盖步骤 | 关键闸口 |
|---|---|---|---|
| 阶段1 | 申请与会签 | ①申请 ②会签各单位 | 闸口① |
| 阶段2 | 贴标与入仓 | ③贴管制标签 ④入管制仓 | — |
| 阶段3 | NCR 与处理会签 | ⑤开不良品委托单 ⑥处理方式会签 | 闸口② |
| 阶段4 | 重工执行 | ⑦开重工工单 ⑧排产重工 ⑨报工 | — |
| 阶段5 | 入库出货 | ⑩入库 ⑪出货 | — |

### 5.2 进度派生（不落库，运行时计算）

前端进度步骤条/阶段卡由 `status` + 子表/字段存在性**实时派生**，非写入：

| 步骤 | 派生依据 |
|---|---|
| ① 申请 | 单已创建（status >= DRAFT） |
| ② 会签(闸口①) | `control_signs` APPLY_SIGN 全部 AGREE |
| ③ 贴标 | `control_orders.label_no` 非空 |
| ④ 入仓 | `storage_location` 非空 |
| ⑤ 开NCR | `control_ncr_logs` 有记录 |
| ⑥ 处理会签(闸口②) | `control_signs` DISPOSAL_SIGN 全部 AGREE |
| ⑦ 开重工单 | `rework_no` 非空 |
| ⑧ 排产 | `rework_sop` 非空 + status >= REWORKING |
| ⑨ 报工 | `control_rework_logs` 有记录 |
| ⑩ 入库 | status >= DONE / `in_stock` 标记 |
| ⑪ 出货 | status = SHIPPED |

## 6. 数据模型（6 张表，`db/schema.sql`，幂等 `CREATE TABLE IF NOT EXISTS`）

### 6.1 主表 `control_orders`（唯一事实来源，瘦身：只存汇总/核心字段）

```sql
CREATE TABLE IF NOT EXISTS control_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(20) UNIQUE NOT NULL,        -- 单据流水号
  part_no VARCHAR(50),                         -- 料号
  part_name VARCHAR(200),                      -- 品名
  sales_no VARCHAR(50),                        -- 销货单号（不良品委托检验单 GYS-Q2-008_01）
  model VARCHAR(100),                          -- 机型/规格
  qty INT,                                     -- 申请/不良数量
  bad_type VARCHAR(50),                        -- 不良类型
  reason TEXT,                                 -- 管制/不良原因
  applicant_id INT,
  applicant_name VARCHAR(50),
  apply_dept VARCHAR(50),                      -- 申请部门（CUSTODY/ME/RD/QA 下具体单位）
  apply_at VARCHAR(24),                        -- 申请时间 ISO
  label_no VARCHAR(50),                        -- 管制标签号（②③ 记录）
  storage_location VARCHAR(100),               -- 管制仓储位（④ 记录）
  stored_at VARCHAR(24),
  ncr_no VARCHAR(50),                          -- 不良品委托单号（⑤ 摘要，明细见 control_ncr_logs）
  disposal_opinion TEXT,                       -- 品保+研发会签处理方式结论（闸口②）
  rework_no VARCHAR(50),                       -- 重工工单号（⑦）
  rework_sop TEXT,                             -- 重工 SOP（⑧）
  good_qty INT,                                -- 良品数（⑨ 汇总）
  ng_qty INT,                                  -- 不良品数（⑨ 汇总）
  scrap_qty INT,                               -- 报废数（⑨ 汇总）
  remain_qty INT,                              -- 结余数（自动算：qty-good-ng-scrap）
  scrap_note TEXT,                             -- 物料报废申请说明（⑨）
  in_stock_at VARCHAR(24),                     -- 入库时间（⑩）
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- 状态机状态（阶段）
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_control_status (status),
  INDEX idx_control_order_no (order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.2 会签子表 `control_signs`（2 个闸口）

```sql
CREATE TABLE IF NOT EXISTS control_signs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  node_key VARCHAR(30) NOT NULL,               -- APPLY_SIGN / DISPOSAL_SIGN
  node_name VARCHAR(50),
  seq INT NOT NULL,                            -- 会签顺序
  role VARCHAR(20),
  sign_dept VARCHAR(50),                       -- 会签单位（部门）
  signer_id INT,
  signer_name VARCHAR(50),
  decision VARCHAR(10) DEFAULT '',             -- AGREE/REJECT/空(待签)
  comment TEXT,
  signed_at VARCHAR(24),
  UNIQUE KEY uk_sign (order_id, node_key, seq),
  INDEX idx_sign_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.3 不良品委托单子表 `control_ncr_logs`（⑥ 明细，可多次开单）

```sql
CREATE TABLE IF NOT EXISTS control_ncr_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  ncr_no VARCHAR(50),                          -- 委托单号
  inspect_dept VARCHAR(50),                    -- 检验部门
  handle_dept VARCHAR(50),                     -- 处理部门
  form_template VARCHAR(50),                   -- 表单版本 GYS-Q2-008_01(REV_1)
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ncr_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.4 报工子表 `control_rework_logs`

```sql
CREATE TABLE IF NOT EXISTS control_rework_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  work_date VARCHAR(24),
  good_qty INT,                                -- 良品数（本次）
  ng_qty INT,                                  -- 不良品数（本次）
  scrap_qty INT,                               -- 报废数（本次）
  scrap_reason TEXT,
  operator_id INT,
  operator_name VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rework_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.5 留痕 `control_logs`

```sql
CREATE TABLE IF NOT EXISTS control_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  action VARCHAR(30) NOT NULL,                 -- SUBMIT/SIGN_OK/STORE/CREATE_NCR/DISPOSAL_OK/OPEN_REWORK/START/REPORT/IN_STOCK/SHIP/VOID/EDIT...
  role VARCHAR(20),
  user_id INT,
  dept VARCHAR(50),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.6 编号序列表 `control_seqs`

```sql
CREATE TABLE IF NOT EXISTS control_seqs (
  prefix VARCHAR(16) PRIMARY KEY,
  cur_seq INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**编号设计**：`order_no` 复用 [sample_seqs 思想](file:///www/wwwroot/sample-mgmt/subsystems/samples/db/schema.sql#L72-L77)，前缀 `CTL` + 年月，取号用 `INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq+1` + `FOR UPDATE` 行锁。

### 6.7 不良品委托检验单字段映射（外部表单 `GYS-Q2-008_01 REV_1`）

| 委托检验单字段 | spec 字段 | 说明 |
|---|---|---|
| 销货单号 | `control_orders.sales_no`（新增） | 本轮唯一补充字段 |
| 料号 | `control_orders.part_no` | 已覆盖 |
| 委托部门 | `control_orders.apply_dept` / `control_signs.sign_dept` | 已覆盖 |
| 处理部门 | `DISPOSAL_SIGN` 会签（品保+研发，`disposal_opinion`） | 已覆盖 |
| 检验部门 | QA 角色承担 → `control_ncr_logs.inspect_dept` | 已覆盖 |
| 处理/检验/委托 × 主管/经办 签字矩阵 | `control_signs`（`node_key`/`seq`/`role`/`signer_name`/`signed_at`） | 精准对应，§6.2 已建模 |
| 表单编号 GYS-Q2-008_01（REV_1） | `control_ncr_logs.form_template` | 模板版本号留档 |

> 该表单对应流程「开出不良品委托单」（NCR）节点；`control_ncr_logs` 承担委托单明细，`control_orders.ncr_no` 承担单号摘要。

## 7. 状态机（manifest 声明式）

### 7.1 状态定义与阶段归属

| 状态 | label | 阶段 | 说明 |
|---|---|---|---|
| `DRAFT` | 申请草稿 | 阶段1 | 需求部门起草 |
| `SIGNING` | 管制会签中 | 阶段1 | 闸口① 会签各单位 |
| `LABELED` | 已贴管制标签 | 阶段2 | 品保贴标 |
| `CONTROL_STORED` | 已入管制仓 | 阶段2 | 仓库入库（避免与样品 `IN_CUSTODY` 冲突）|
| `NCR_DONE` | 不良品委托单已开 | 阶段3 | 开出委托单 |
| `DISPOSAL_SIGNING` | 处理方式会签中 | 阶段3 | 闸口② 品保+研发 |
| `REWORK_OPENED` | 重工工单已开 | 阶段4 | 生管开单 |
| `REWORKING` | 重工执行中 | 阶段4 | 生产执行 |
| `REWORK_REPORTED` | 已报工 | 阶段4 | 生产报工 |
| `REIN_STOCK` | 已入库 | 阶段5 | 入库（避免与样品 `IN_CUSTODY` 冲突）|
| `SHIPPED` | 已出货 | 阶段5 | 终态 |
| `RETIRED` | 已作废 | — | 任意阶段 `VOID` 作废（ADMIN）|

### 7.2 主流转（transitions，role 归属）

| from → to | action | role | label |
|---|---|---|---|
| DRAFT→SIGNING | SUBMIT | CUSTODY/ME (需求部门) | 提交会签 |
| SIGNING→LABELED | SIGN_OK | QA | 闸口①会签通过/贴标 |
| LABELED→CONTROL_STORED | STORE | CUSTODY (仓库) | 入管制仓 |
| CONTROL_STORED→NCR_DONE | CREATE_NCR | QA | 开不良品委托单 |
| NCR_DONE→DISPOSAL_SIGNING | DISPATCH | QA | 发起处理方式会签 |
| DISPOSAL_SIGNING→REWORK_OPENED | DISPOSAL_OK | QA/RD | 闸口②会签通过 |
| REWORK_OPENED→REWORKING | START | ME (生管) | 生产确认开工 |
| REWORKING→REWORK_REPORTED | REPORT | CUSTODY/ME (生产) | 报工（写数量+报废）|
| REWORK_REPORTED→REIN_STOCK | IN_STOCK | CUSTODY/ME | 入库 |
| REIN_STOCK→SHIPPED | SHIP | CUSTODY/ME | 出货 |

**退回/异常边**：`SIGNING→DRAFT`（闸口① 任一 REJECT）、`DISPOSAL_SIGNING→NCR_DONE`（闸口② 任一 REJECT）；所有状态 `VOID`→`RETIRED`（作废，ADMIN）。所有 transition 复用 `shared/state-machine.js` 的 `createStateMachine(manifest.stateMachine)`，后端 `canTransition(role, from, action)` 权威校验。

## 8. 会签节点设计（收敛为 2 个关键闸口）

| node_key | 名称 | 会签单位（角色→部门） | 触发状态 |
|---|---|---|---|
| `APPLY_SIGN` | 申请管制会签 | 品保(QA)→研发(RD)→生管(ME)→生产(ME/制造部)→仓库(CUSTODY/资材) | SIGNING |
| `DISPOSAL_SIGN` | 处理方式会签 | 品保(QA)+研发(RD)，填 `disposal_opinion` | DISPOSAL_SIGNING |

- 会签单位清单初版**硬编码**为流程模板（不引入可配置引擎，见非目标）。
- **签字接口**：`POST /api/control/orders/:id/sign`，body=`{node_key, decision, comment}`；校验当前 `seq` 为该用户且角色匹配。
- **退回**：`decision=REJECT` 记录 `control_signs`+`control_logs`，状态回退到上一业务节点（SIGNING→DRAFT / DISPOSAL_SIGNING→NCR_DONE），可修改后重走。
- **会签通过与流转衔接**：每个闸口节点的所有 `seq` 均 `AGREE` 后，该节点才算「通过」——此时系统**允许**执行对应流转 action（非系统自动推进）：`APPLY_SIGN` 全通过 → 允许 `SIGN_OK`（QA 贴标 → LABELED）；`DISPOSAL_SIGN` 全通过 → 允许 `DISPOSAL_OK`（→ REWORK_OPENED）。后端在 `transition` 前校验对应闸口是否全通过，否则返回 `400` 提示「该节点会签未完成」。
- **重工单不再作为独立会签节点**：闸口②通过后，生管登记 `rework_no`+`rework_sop`（`OPEN_REWORK`，记录型），生产用 `START` 确认开工（单人确认），减少会签开销，提升效率。

## 9. 管制标签（自包含复用）

原则：**机制复用、文件自包含**，不跨子系统引用（[§17.5 禁止跨子系统引用](file:///www/wwwroot/sample-mgmt/AGENTS.md)）。

- **唯一事实来源** = `control_orders`，标签实时派生，无独立存储/无冗余快照（沿用 [§24 实时派生思想](file:///www/wwwroot/sample-mgmt/AGENTS.md)）。
- **尺寸**：`frontend/js/constants/label.js` 自包含复制 `PRESET_MM`（小37×18/中52×25/大60×40+自定义 30~150mm）与 contain 缩放规则，**不 require samples 的 card-constants.js**。
- **渲染**：`GET /api/control/orders/:id/label` 返回可打印 HTML（左 QR + 管制信息：order_no/料号/品名/不良原因/日期）；`label/print` 登录即可；`label/download` 仅 ADMIN/QA/RD。
- **缓存**：仅 QR LRU（键=`order_no + qr_token + width`），缓存只依赖二维码内容。
- **禁止**：在 `app.css` 添加管制标签样式；为标签建立独立副本/冗余快照。

## 10. 前端视图与 API

### 10.1 导航菜单（manifest.navigation）

| key | 名称 | view | 角色 |
|---|---|---|---|
| dashboard | 管制看板（状态统计/待办/逾期） | `renderDashboard` | 全 |
| orders | 管制单列表（筛选+导出） | `renderList` | 全 |
| new | 新建管制申请 | `renderNew` | 全 |
| detail | 单据详情（主卡+进度+阶段卡+会签/报工/日志Tabs） | `renderDetail` | 全 |
| label | 管制标签打印页 | `renderLabel` | 登录 |
| logs | 操作日志 | `renderLogs` | ADMIN |

### 10.2 详情页进度可视化组件

- **进度步骤条**：11 步横向/纵向步骤条，实时高亮当前步、勾选已完成（`progress.js` 由详情聚合响应派生，见 §5.2）。
- **阶段卡片**：5 大阶段分卡展示，每卡展示该阶段需操作/已完成动作；当前阶段高亮，提供该阶段的合并操作入口（如「一键完成贴标+入仓」写 `label_no`+`storage_location`+`stored_at` 并更新状态）。
- **会签进度**：闸口处显示「已签 n/待签 m」，每单位状态点（已同意/已退回/待签）。
- **留痕时间轴**：`control_logs` 渲染时间轴（谁/何时/做了什么/改了哪些字段）。
- 主信息卡 + Tabs（会签记录 / 不良品委托单 / 报工报废 / 留痕日志），操作后局部刷新（借鉴 samples `tdRefresh` 模式，禁全量重渲染）。

### 10.3 API（前缀 `/api/control`，错误 `{error}`，态码语义化；鉴权 `requireAuth`）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/orders` | 列表（筛选/排序/分页） | 登录 |
| GET | `/orders/:id` | 详情聚合（主卡+阶段/进度+会签+委托单+报工+日志） | 登录 |
| POST | `/orders` | 创建管制申请单 | 登录 |
| PUT | `/orders/:id` | 编辑草稿 | 申请人/ADMIN |
| POST | `/orders/:id/transition` | 阶段流转 `{action,comment}` | 按 role |
| POST | `/orders/:id/sign` | 会签签字 | 按 node role |
| POST | `/orders/:id/ncr` | 追加不良品委托单记录 | QA |
| POST | `/orders/:id/rework-log` | 追加报工记录 | 生产/CUSTODY |
| GET | `/orders/:id/label` / `/label/print` | 管制标签 | 登录 |
| POST | `/orders/:id/void` | 作废 | ADMIN |
| GET | `/orders/export` | CSV 导出 | 登录 |

**导出**：复刻 [§21](file:///www/wwwroot/sample-mgmt/AGENTS.md) 标准，复用 `shared/csv.js` 的 `sendCsv`，状态列中文、时间列 `YYYY-MM-DD HH:mm`，忽略分页取全量，文件名 `control-YYYYMMDD-HHmm.csv`。

### 10.4 前端结构与构建

- `index.html` + `js/router.js` + `api.js`/`constants.js`/`progress.js` 复用共享 `api-base.js`/`modal.js`（[§17.5](file:///www/wwwroot/sample-mgmt/AGENTS.md)）。
- **新增 JS 文件 MUST 重建 bundle**：[§19](file:///www/wwwroot/sample-mgmt/AGENTS.md) —— 在 `tools/bundle-sources.json` 为 `control` 添加按依赖顺序的脚本列表，执行 `node tools/build-bundles.js`，复制 `/tmp/bundle-control.js` → `subsystems/control/frontend/js/bundle.js`，`index.html` 用 `bundle.js?v=<ver>`（`tools/.bundle-ver`）；INIT 缺省 `window.addEventListener('hashchange',route);boot();`。

## 11. 全局工作台聚合管制待办

workbench 当前仅聚合 sample/fixture（`deployed:false` 未上线，改造回归压力小）。改造点：

1. **`subsystems/workbench/db/workbench-queries.js`**：`buildWorkbenchSQL` 的 UNION 增加 `control` 待办分支（状态∈进行中非终态的单据，输出 `item_type='control'`、`item_no=order_no`、`stage_cn`（阶段中文）、`resp_dept`、`dwell_hours` 等统一列）。
2. **`subsystems/workbench/backend/index.js`**：`parseWorkbenchFilters` 的 `type` 白名单加 `control`；`applySet` 等兼容；`summary/deptStats` 支持 control。
3. **workbench 前端**：类型筛选、`wb-filter`、`dashboard` 增加「管制」；`wb-detail` 支持跳转 `/control/...`、展示阶段。
4. **等级计算**：复用 `calcOverdue` 与 `workbench_settings` 阈值；`item_type` 参与排序与统计。

> 说明：workbench 聚合只需**只读** control 数据，不做 datasheet 写入；仍须对 samples/fixtures 保持既有行为不变（[§6.1](file:///www/wwwroot/sample-mgmt/AGENTS.md) 双向回归）。

## 12. 错误处理与异常链路

- 创建/流转/会签/报工：后端 try-catch，业务校验失败返回 `400/403/404`，未知异常 `500 {error}`。
- 状态流转：`canTransition` 校验失败 → `403 { error: '当前状态/角色不允许该操作' }`；闸口未全通过 → `400 { error: '该节点会签未完成' }`。
- 会签重复签字：唯一键 `(order_id,node_key,seq)` 冲突 → `400 { error: '该节点已签字' }`；非当前 seq 签字 → `400`。
- 写操作（流转/会签/报工/NCR）MUST 使用事务（`db/tx.js`），保证状态与会签/报工/留痕原子一致。
- 流签过程中若遇用户缺失（会签单位无对应人员）：允许该节点记录 `decision='SKIP'` 由 ADMIN 强制通过并留痕。

## 13. 测试策略

- `deployed:false`：允许造数测试（[§20.3](file:///www/wwwroot/sample-mgmt/AGENTS.md)），seed 脚本可运行。
- 单元测试（`tests/`）：
  - 状态机引擎：`createStateMachine` + manifest 的 `canTransition` 各边、各 role 校验；
  - 进度派生：`progress.js`/`flow.js` 由 status+子表派生 11 步进度正确；
  - 编号生成：`control_seqs` 原子自增并发正确性；
  - 会签流：2 闸口顺序 + REJECT 回退 + 重复签字冲突；
  - 报工/报废：数量写入、**结余自动计算**（`remain=qty-good-ng-scrap`）、报工子表追加；
  - CSV 导出：列/中文状态/时间格式（复用 `shared/csv.js` 测试）。
- 集成/回归：workbench 聚合（新增 control 类型并对 samples/fixtures 双系统只读回归）；标签打印 HTML 快照。
- 全链路回归：改共享文件（若抽取 `PRESET_MM` 到 shared 时）需样品/治具/工作台三系统回归（[§18.5](file:///www/wwwroot/sample-mgmt/AGENTS.md)）；本方案标签自包含，规避该回归。

## 14. 部署与回滚

**部署步骤**（注意热载入受限，[§23 禁止自动重启](file:///www/wwwroot/sample-mgmt/AGENTS.md)）：
1. 新建 `subsystems/control/` 全目录 + 编写 manifest/backend/db/frontend/seed。
2. `node tools/build-bundles.js` → 复制 `bundle-control.js` → `control/frontend/js/bundle.js`（`chown www:www`）。
3. `tools/bundle-sources.json` 增加 control 条目（先于构建）。
4. **重启 pending**：`server.js` 只在启动时 `register()`，新子系统后端路由须**重启后生效**（热载入仅 manifest 层）。按 [§23.2](file:///www/wwwroot/sample-mgmt/AGENTS.md) 提交《重启申请》→ 用户/运维审核 → 运维用宝塔「停止→启动」。
5. 若 workbench 聚合改造未完成，先装 control（不勾 control 加入 workbench 聚合，避免 list 报错），再单独改 workbench + 重建其 bundle + 再次走重启申请。

**回滚**：
- 移除 `subsystems/control/`（`rm -rf` 或备份移走），删除 `control_seqs` 关联增量迁移（或保留表不启用）；框架扫描不到即不再挂载。
- 恢复 `tools/bundle-sources.json` 移除 control 条目，重建受影响子系统 bundle。
- workbench 聚合改造：回退 `workbench-queries.js`/`parseWorkbenchFilters`/前端 control 分支（尽量用增删小块，避免破坏现有 sample/fixture 聚合）。
- 推荐先备份 `db.js`/`server.js` 涉及的 manifest 扫描与 `workbench-queries.js`，再操作；回滚后走一次重启申请。

## 15. 隔离与回归检查（[§6.1](file:///www/wwwroot/sample-mgmt/AGENTS.md)）

- control 为全新子系统，**API 前缀 `/api/control` 隔离**，不跨复用 sample/fixture 路径。
- **不修改**共享文件：`server.js`/`db.js`/`portal.html`/`app.css`/`modal.js`/`api-base.js`（除非将 `PRESET_MM` 抽到 shared，本方案不抽）。
- **共享文件改动仅限 workbench 聚合**（`workbench-queries.js`/`backend/index.js`/workbench 前端），且只新增 control 分支，不改 sample/fixture 分支行为。
- 回归清单：
  - samples 列表/看板/扫码/标签打印 全流程无变化；
  - fixtures 列表/看板/扫码/验证移交 全流程无变化；
  - workbench 展示 sample/fixture 待办与统计、阈值、`calcOverdue` 无变化，新增 control 类型正常；
  - 门户 portal 出现「管制流程管理」卡片（manifest 自动发现）。

## 16. 风险与技术债

- **热载入受限**：新增子系统后端路由需重启生效，迭代期间每次改动走 [§23.2](file:///www/wwwroot/sample-mgmt/AGENTS.md) 重启申请，迭代效率受限；若后续需要，引入 `fs.watch` + `delete require.cache` + 重新 `register`（需防重复注册/路由冲突），列入后续增强。
- **会签单位硬编码**：初版流程模板硬编码于 manifest/代码；若要调整单位为可配置，需引入流程模板配置（非目标，后续演进）。
- **workbench `workbench-queries.js` 复杂度**：UNION 增加 control 分支后 SQL 更庞大，若触发 [§7.1 阈值](file:///www/wwwroot/sample-mgmt/AGENTS.md) 需评估拆分（如按类型独立查询再 JS 聚合）。
- **`control/backend/routes-orders.js`**：状态机分支 + 会签 + 报工 + 留痕业务较集中，须遵守 [§7.1](file:///www/wwwroot/sample-mgmt/AGENTS.md)（≤400 行），超限拆 helper（参考 fixtures 的 action helper 拆分）。NCR/委托已独立为 `routes-ncr.js` 分担。
- **进度派生复杂度**：11 步由 status+子表派生，需保证派生逻辑与流转动作同步维护（`flow.js`/`progress.js` 单一来源），避免步骤条与实际状态脱节。
