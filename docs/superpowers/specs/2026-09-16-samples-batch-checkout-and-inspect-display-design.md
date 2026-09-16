# 样品「批量领用/归还」+「作废样品复检展示」设计方案（2026-09-16）

| 项 | 内容 |
|---|---|
| 立项日期 | 2026-09-16（用户确认 4 项决策后立项） |
| 状态 | **设计已定，待实现**（本文件不含实现代码） |
| 影响子系统 | `samples`（前端 + 后端 + CSV 导出）；`workbench` 仅只读聚合，零改动 |
| 目标版本 | 下一迭代（`2.1.0`，版本号四处同步见 §9） |
| 决策记录 | ① 交互形态＝**扫码队列 + 公共设置前置**；② 失败语义＝**两阶段（预校验全或无 + 执行期逐件结果）**；③ 需求 2＝**只改展示层**（前端徽章 + 导出同口径），**不动数据**；④ 本轮只出文档，不改代码 |

---

## 一、需求

### 1.1 批量领用 / 批量归还（用户原话：「批量领用，或者批量归还的时候目前需要一个一个的操作，是否有更好更快捷的操作方式？」）

现状：领用与归还**只能逐件扫码**——每件都要 `resolve` → 填表/确认 → 提交，N 件 = N 次完整交互。目标：N 件降为「N 次扫码 + 1 次公共设置 + 1 次提交」。

### 1.2 作废样品仍显示复检「正常」（用户原话：「已经废弃的样品复测还是显示正常是否合理」）

结论：**不合理**，属展示层缺陷——全系统唯一一处复检判定不检查 `status`。目标：让「不适用」与「无计划」语义分离，且列表 / 详情 / 导出三处同口径。

---

## 二、现状取证（事实基线）

### 2.1 需求 1 相关事实

| 事实 | 证据 |
|---|---|
| 单件解析：一次只解析一个编号并给出 `allowedActions` | `subsystems/samples/backend/routes-scan.js:36-49` |
| 单件执行：`POST /api/scan` 单样品，`withTransaction(updateSample CAS + addLog)` | `routes-scan.js:52-95`、`:83-87` |
| 越权/状态不允许 → 409（带 `sample`）；CAS 冲突 → 409（不带状态） | `routes-scan.js:66-69`、`:91-92` |
| 全局 409 处理：toast + 触发各视图刷新回调 | `frontend/js/api.js:54-61`（`_notifyConflict` `:32`） |
| 领用参数：`checkout_user` 必填、`durationHours` 1~8760 整数、部门默认操作人、备注选填；写 `expected_return_at`，储位保留 | `backend/scan-actions.js:164-179` |
| 归还参数：仅备注选填；回 `IN_CUSTODY`、清空全部领用字段 | `scan-actions.js:180-190` |
| 权限：`CHECKOUT`/`RETURN_OUT` 仅 `CUSTODY`/`ME` | `manifest.json:218-237` |
| 列表操作列仅 详情/打印/下载QR/取消，无多选、无领用归还入口 | `views/list-render.js:28-33` |
| 「连续扫码」勾选只做自动清空+聚焦，每件仍需一次确认 | `views/scan.js:20-21`、`:158` |
| 已有队列范式：按 id 去重、上限 50、localStorage 持久化、chips + 删项 | `views/print-queue.js:24-30`、`:14-22`、`:37-53` |
| 已有批量范式（不可照抄）：「任一行非法则整批不创建」单事务 | `views/new.js:52`、`backend/routes-samples.js:226-281` |
| 既有「逐条校验 + 跳过统计」范式（可参照） | `backend/routes-task-edit.js:71-129`（projects 子系统） |
| 路由注册顺序约束：`/api/samples/:id` 会贪婪捕获后置路由 | `backend/index.js:16-21` |

### 2.2 需求 2 相关事实

| 事实 | 证据 |
|---|---|
| 复检状态只判 `next_inspect_at`，**不判 `status`**；`ok` → 「正常」 | `views/list-inspect.js:9-15`、`:18-25`（「正常」在 `:22`） |
| 列表「复检状态」列对所有状态无差别渲染 | `views/list-render.js:48`（表头 `:6`） |
| 「复检到期」列仅逾期/近 7 天视图渲染，按 `next_inspect_at < now` 判红 | `views/list-render.js:34-37`、`:7` |
| 看板待办表复用同一徽章；ADMIN 待办查询返回全状态（含 RETIRED） | `views/dashboard-todo.js:46`、`db/dao-list.js:102-107` |
| 详情弹窗复检行：日期任何状态都显示，仅 `overdue(s)` 控制标红（要求 `status==='IN_CUSTODY'`） | `views/detail.js:132-133`、`frontend/js/api.js:11` |
| 后端筛选/统计**已**限定 `status='IN_CUSTODY'`（逾期/近 7 天/机型墙计数） | `db/dao-list.js:20-21`、`:76-77`、`:118-119` |
| 后端导出「复检状态」列是同款无状态门复制体 | `backend/routes-samples.js:78-85`、`:117` |
| 作废路径均不清 `next_inspect_at`/`valid_until` | `scan-actions.js:243-249`、`:278-285`、`:286-306` |
| `RETIRE_RECREATE` 保持 `RETURNING`（非终态），后续 `RETURN_REJECT` 依赖该字段顺延 | `scan-actions.js:230-242`、`:256-267` |
| 既有单测断言：无 status 时必须返回 `none` / 渲染 `.muted` + 「—」 | `tests/inspect-state.test.js:19-25`、`:53-56` |

### 2.3 容量基线（LF 归一权威口径，2026-09-16 实测）

> 口径说明：本地评审镜像为 CRLF 检出，用 `Get-Content -Raw` / `String.Length` 会因每行多计 1 个 CR 而高估（例：`scan.js` 曾得 18,186）。权威口径 = `readFileSync(utf8)` 去掉 `\r` 的字符数。

| 文件 | 字符 | 占比 | 判定 |
|---|---|---|---|
| `subsystems/samples/frontend/js/views/scan.js` | 17,109 | 85.5% | 仅允许薄挂钩；新业务必须落新文件 |
| `subsystems/samples/backend/scan-actions.js` | 17,615 | 88.1% | **零改动**（禁止再堆业务） |
| `subsystems/samples/backend/routes-samples.js` | 17,840 | 89.2% | 只允许等量精简式改动 |
| `views/new.js` | 16,286 | 81.4% | 本次不改 |
| `views/detail.js` | 14,071 | 70.4% | 临界，仅做必要展示改动 |
| `views/list.js` / `list-render.js` | 6,993 / 5,593 | 35.0% / 28.0% | 安全 |
| `views/list-inspect.js` | 1,113 | 5.6% | 安全（需求 2 主落点） |
| `frontend/js/api.js` | 2,988 | 14.9% | 安全，但**顶层函数已 10 个（上限）** |
| `backend/routes-scan.js` | 4,694 | 23.5% | 安全（薄入口） |
| `frontend/css/module.css` / `public/css/app.css` | 12,475 / 21,910 | 62.4% / **109.5%** | 样式只写 `module.css` |
| `tools/bundle-sources.json` samples 条目 | 34 个 | — | 文档记的 30 个已过时 |

---

## 三、全链路关联依赖清单（变更前置输出）

### 3.1 上游依赖（引用被改内容处）

| 点位 | 文件 | 影响与适配 |
|---|---|---|
| 复检徽章消费方 1 | `views/list-render.js:48` | 零改动（调用签名不变，新增 `na` 态自动生效） |
| 复检徽章消费方 2 | `views/dashboard-todo.js:46` | 零改动（ADMIN 待办含 RETIRED 行，自动受益） |
| 复检日期展示 | `views/detail.js:132-133` | 改为按 `inspectState` 分支：`na` → 「不适用（原因）」 |
| 复检到期列 | `views/list-render.js:34-37` | `na` → 灰字「不适用」，不再输出日期 |
| CSV 导出列 | `backend/routes-samples.js:117`（fmt 在 `:79-85`） | 改为引用新文件同口径函数 |
| 扫码台入口 | `views/scan.js`（`viewScan` `:7-36`、`doScan` `:38-53`、`showScanActionForm` `:80-155`） | 薄挂钩 + 前置外迁（见 §5、§7） |
| 提交封装 | `frontend/js/api.js:42-61` | 为批量通道增加「静默」选项（不改共享层、不新增顶层函数） |
| 载荷收集 | `views/scan-payload.js:28-41` | 复用 `collectCheckoutPayload` |
| 路由注册 | `backend/index.js:14-24` | 新增批量路由注册，**必须早于 `routes-samples`** |
| 409 语义 | `backend/routes-scan.js:66-69`、`:91-92` | 增量补 `code` 字段（保留原 `error`/`sample`） |
| 领用人候选 | `backend/routes-checkout-users.js:19-26` | **契约依赖**：从 `scan_logs.note` 解析「领用人 X（部门）」，批量日志 note 格式必须与单件完全一致 |

### 3.2 下游依赖（被改内容依赖的基础）

- `shared/state-machine.js`：纯声明式引擎，**零改动**；
- `db/tx.js`（显式 begin/commit/rollback，无重试）：批量逐件事务复用，不改；
- `db.js` 连接池（上限 20）：逐件事务峰值占用 1 条连接，不改；
- `shared/frontend/api-base.js` 的 `api()`：被子系统 `api.js` 覆盖包装，本次只改子系统层；
- `shared/csv.js`：导出复用，不改。

### 3.3 跨模块依赖

- `workbench`：其 SQL 的 samples 分支只读聚合，本次不改口径（保持 `RELEASED`/`IN_CUSTODY` 现状，见 §10）；
- `fixtures`：零改动；但前端改动需做**双系统只读回归**（列表列宽拖拽、详情弹窗、徽章样式 `.b-overdue` 为共享类 `public/css/app.css:85`）；
- `projects`：仅作为「逐条校验 + 跳过统计」范式参照，不改。

### 3.4 业务影响清单

样品列表（渲染/列宽/分页/快捷筛选）、样品扫码台（新增队列面板）、样品详情弹窗、样品看板待办表、CSV 导出、样品操作说明书与总说明书、`docs/RELEASE-v2.0.9.md`→新发布说明、`AGENTS.md §14` 容量台账（需用户授权）。

---

## 四、需求 1 交互设计

### 4.1 三段式流程（复用既有范式）

```
① 公共设置（整批一次）        ② 连扫入队（每件一次扫码，0 次确认）      ③ 提交 + 结果面板
领用：领用人 / 部门 / 时长 / 备注   扫码枪或摄像头逐件扫 → resolve 校验 → 入队   1 次「提交 N 件」→ 逐件回执
归还：备注                     队列面板可删错扫项、可看每件状态/当前领用人     成功不回滚、失败留队列可重试
```

交互成本对比（N=10）：现状 = 10 次确认 + 10 次填表；新流程 = **1 次公共设置 + 1 次提交**，扫码次数不变。

### 4.2 队列模型

| 项 | 设计 | 依据 |
|---|---|---|
| 入队校验 | 入队时只调只读 `resolve`，写入前再校验一次；格式非法/不存在**不入队** | `routes-scan.js:36-49`、`frontend/js/views/scan.js:45` |
| 去重 | 按 `sample_no` 去重（已在队列则提示，不入队） | 复刻 `print-queue.js:26` |
| 上限 | **50 件/批**（超出前端即拒，后端二次校验） | 与批量新建 `routes-samples.js:242`、批量打印 `routes-cards.js:94`、打印队列 `print-queue.js:27` 三处先例一致 |
| 持久化 | localStorage 持久化 + **班次隔离**（记录创建时间与操作人 id，跨班次/超时自动丢弃） | `print-queue.js:14-22` 有持久化但无班次隔离，本次补齐 |
| SPA 重挂载 | 队列面板随视图重挂载补偿（同 `print-queue.js:71-77` 思路） | 既有范式 |
| 开关语义 | **改造既有「连续扫码」复选框为「批量模式下的连扫入队」**，不新增第二个同屏连扫开关 | `scan.js:20-21`（避免同屏两个连扫开关） |
| 队列项状态位 | 每项 `pending / submitting / ok / failed / skipped`，防止重复提交与重复重试 | 前端专家建议（`withSubmitLock` 只锁单按钮，`api.js:20-27`） |

### 4.3 批量结果面板（信息架构）

1. **结论条**：`已完成 N 件：成功 A · 失败 B · 跳过 C`，副文案「成功项已生效，不会回滚」；
2. **成功组**（默认折叠）：编号 / 名称 / 状态流转 / 操作时间，行内「详情」；
3. **失败组**（默认展开，分「可重试」「需人工」二级）：编号 / 名称 / **后端原文原因** / 当前状态 / 行内重试 / 去扫码台处理；
4. **跳过组**（默认折叠，不提供重试）：输入值 / 跳过原因（格式非法 / 队列内重复）；
5. **底部动作条**：重试全部可重试项 / 复制失败编号 / 导出失败清单 CSV / 清空并开始新一批 / 关闭；
6. **幂等命中**单独标「已生效（无需重试）」，不计入失败（依赖后端 409 的 `code` 字段）；
7. 面板**不自动关闭、不自动清队列**，清空必须显式点击。

### 4.4 异常处理矩阵

| 异常 | 后端表现 | 分组 | 可重试 | 处理 |
|---|---|---|---|---|
| 并发抢占（CAS） | 409 + `code=VERSION_CONFLICT` | 失败·可重试 | 是 | 重试前 `resolve` 复核；若已是目标态 → 判「已生效」 |
| 角色/状态不允许 | 409 + `code=ACTION_NOT_ALLOWED` | 失败·需人工 | 否 | 提示当前状态与建议动作 |
| 编号格式非法/不存在 | 前端拦 + 404 | 跳过 / 失败 | 否 | 入队阶段即拦，不污染队列 |
| 预校验未全通过 | 422（整批未执行） | 不提交 | — | 列出不合格件与原因，修正后重新提交 |
| 参数类 400（时长/领用人） | 400 | 失败·可重试 | 是 | 回到公共项修正 |
| 网络中断 / 服务端 500 | fetch 抛错 / 500 | 失败·**未知态** | 是 | 保留队列，恢复后逐件 `resolve` 复核再提交 |

### 4.5 响应式与可访问

- 队列 chips 在 XS（<576px）换行 + 可折叠；结果面板三组改纵向卡片流；
- 新增样式**只写 `subsystems/samples/frontend/css/module.css`**（禁止写 `app.css`，AGENTS §18.5）；
- 新增 `td`/`th` 若涉及列表（本次不涉及）MUST 带 `data-label`。

---

## 五、需求 1 后端设计

### 5.1 接口清单（新增，路径前缀 `/api/samples`）

| 方法 | 路径 | 用途 | 权限 |
|---|---|---|---|
| POST | `/api/samples/batch-resolve` | 批量只读预校验（body `{codes:[...]}`，≤50）→ 逐件返回 `{code, ok, id, status, name, checkout_user, expected_return_at, allowedActions, reason}` | 登录（逐件按角色算 `allowedActions`） |
| POST | `/api/samples/batch-action` | 批量执行（body `{action:'CHECKOUT'\|'RETURN_OUT', codes:[], checkout_user, checkout_dept, durationHours, note, batchId?}`） | 登录 + 逐件角色校验 |

- 上限 50，超出 → 400；
- 批次内重复编号去重（首件为准，重复项进「跳过」组）；
- **不放开到其它动作**（图片类动作与批量不兼容，仅 `CHECKOUT`/`RETURN_OUT`）。

### 5.2 两阶段语义（本次核心决策）

```
阶段 1 预校验（全或无）：逐件 allowedActions + 状态 + 参数校验
  ├── 任一件不合格 → HTTP 422，返回 { rejected:[{code,reason,status}], executed:0 }，整批不执行（零副作用）
  └── 全部通过 → 进入阶段 2
阶段 2 执行（逐件独立事务）：逐件 applyAction → withTransaction(updateSample CAS + addLog)
  └── 返回 { ok:[...], failed:[{code,code_,reason}], skipped:[...] }，成功项不回滚
```

理由：产品要求「任一件失败则整批不生效」用于**避免半途而废**，可用预校验零副作用满足；而实物一旦领出/归还，数据库回滚无法撤销物理事实，故执行期必须件级事务。此设计同时避免单事务 50 件的长事务、死锁（两个批次交叠 id 顺序不同会形成等待环）与锁等待。

### 5.3 兼容增量

| 位置 | 增量 | 兼容性 |
|---|---|---|
| `backend/routes-scan.js:66-69` | 409 响应体补 `code:'ACTION_NOT_ALLOWED'` 与 `status` | **只加字段**，保留原 `error` 文案与 `sample` |
| `backend/routes-scan.js:91-92` | 409 响应体补 `code:'VERSION_CONFLICT'` | 同上 |
| `frontend/js/api.js:54-61` | `api()` 增加第三参可选「静默」语义（批量通道不弹逐件 toast、不触发单件刷新） | 默认行为不变；**不新增顶层函数**（顶层函数已 10 个） |
| `backend/index.js:14-24` | 注册 `routes-batch-scan`（或 `batch-scan.js` 的 `register`），**置于 `routes-samples` 之前** | 顺序约束依据 `:16-21` 注释（`:id` 贪婪捕获） |

### 5.4 审计与留痕

- 每件写一条 `scan_logs`（复用 `applyAction` + `D.addLog`，**零新表、零 DDL**）；
- 日志 `note` 格式**必须与单件完全一致**（`routes-checkout-users.js:19-26` 依赖「领用人 X（部门）」解析历史频率，格式变更会静默破坏候选排序）；
- 批次号阶段一写入 `note` 尾部 `[批次 <batchId>]`（零 DDL）；是否加 `scan_logs.batch_no` 列留待观察，不在本期。

### 5.5 幂等与并发

- 前端：队列级锁 + 每项状态位（防重复点击）；
- 后端：`batchId` 纯内存 LRU 去重为**可选**；阶段一以「CAS + 预校验」为幂等底线（重复提交第二批会因状态已变落到 `ACTION_NOT_ALLOWED` 或「已生效」判定）。

---

## 六、需求 2 设计

### 6.1 「复检适用状态集合」单一事实来源

| 状态 | 适用 | 语义 |
|---|---|---|
| `RELEASED` | 适用 | 已发行，尚未接收保管；按日期显示但**灰化，不出逾期红徽章** |
| `IN_CUSTODY` | 适用 | 唯一完整生效态 |
| `CHECKED_OUT` | 适用 | 计划仍在计时，归还后回 `IN_CUSTODY` 继续；显示「领用中·暂停复检」灰字 |
| `RETURNING` | **不适用** | 退回审核中，复检日已被顺延逻辑占用 |
| `RETIRED` | **不适用** | 已作废（终态） |
| `NEW` / `PRODUCED` | **不适用** | 未发行，从未产生复检计划 |

两态区分（文案必须不同）：
- **不适用** = 状态层面不存在复检语义 → 灰字「不适用」+ `title` 说明状态原因；
- **无计划** = 状态适用但字段为空 → 保持现有灰字「—」+ 新增 `title="未设置复检计划"`。

### 6.2 呈现矩阵

| 状态 | 列表「复检状态」列 | 「复检到期」列（逾期/近 7 天视图） | 详情弹窗复检行 | CSV「复检状态」列 |
|---|---|---|---|---|
| `RELEASED` | 现状三态 | 现状日期 + 逾期红 | 现状 | 现状 |
| `IN_CUSTODY` | 现状三态 | 现状 | 现状 | 现状 |
| `CHECKED_OUT` | 「不适用」灰字 + title「领用中，复检计划暂停」 | 「不适用」 | 「复检 不适用（领用中）」 | 「不适用」 |
| `RETURNING` | 「不适用」+ title「退回审核中，计划已顺延」 | 「不适用」 | 「复检 不适用（退回审核中）」 | 「不适用」 |
| `RETIRED` | 「不适用」+ title「已作废，复检计划不适用（原因：X）」 | 「不适用」 | 「复检 不适用（已作废）」 | 「不适用」 |
| `NEW`/`PRODUCED` | 「不适用」+ title「未发行，无复检计划」 | 「不适用」 | 「复检 不适用」 | 「不适用」 |
| 适用状态但字段空 | 现状「—」+ title「未设置复检计划」 | 现状「—」 | 现状「— / —」 | 「—」 |

视觉约束：
- 「不适用」用灰字（复用 `.muted`），**不得**使用徽章类，尤其**不得继承 `.b-overdue`**——该类带 1.5s 无限脉冲动画（`public/css/app.css:85`），已作废样品持续红色脉冲等于「仍在报警」；
- 权威「已作废」提示已存在于状态列（`views/list-render.js:47` → `statusBadge`），不新增列、不整行灰化、不使用删除线；
- **不新增 emoji、也不得顺手删除任何既有 UI emoji**（AGENTS §10 强制）。

### 6.3 守卫写法（与既有测试兼容，关键）

```
适用判定顺序：① s 为空 → 现状 none；② s.status 存在且在「不适用集合」→ na；③ 无 next_inspect_at → none；④ 三态照旧。
```

必须写成「**status 存在**且不适用 → `na`」，不能写成「无 status → `na`」，否则 `inspectState({})` / 缺 status 的调用方行为改变，破坏 `tests/inspect-state.test.js:19-25`、`:53-56`。

### 6.4 后端同口径（容量合规）

`backend/routes-samples.js` 已 89.2%：把 `inspectStateCn`（`:78-85`）与适用集合常量**外迁新文件** `backend/inspect-state-cn.js`（约 30 行），`routes-samples.js` 改为 require 调用（净减约 250 字符），既满足「70% 以上只允许精简」的红线规则，也为前后端同口径提供后端唯一落点。

---

## 七、容量规划（改动后预期）

| 文件 | 现状 | 预期 | 说明 |
|---|---|---|---|
| `views/scan.js` | 17,109 / 85.5% | ≈13,300 / 66% | **前置外迁**：`showScanActionForm`（`:80-155`）的表单构造迁 `views/scan-forms.js`，`scan.js` 留薄分发 + 批量挂钩 |
| **新增** `views/scan-forms.js` | — | ≈4,300 / 22% | 各动作表单 HTML 构造 |
| **新增** `views/scan-batch.js` | — | ≈5,000~7,000 / 35% | 队列模型 + 公共设置 + 结果面板 |
| `views/scan-payload.js` | 2,685 / 13.4% | ≈3,000 / 15% | 公共项收集复用 |
| `frontend/js/api.js` | 2,988 / 14.9% | ≈3,200 / 16% | 静默选项（不加顶层函数） |
| **新增** `backend/batch-scan.js` | — | ≈5,000~6,500 / 33% | 批量预校验 + 批量执行 |
| `backend/routes-scan.js` | 4,694 / 23.5% | ≈4,900 / 25% | 注册 1 行 + 409 `code` |
| **新增** `backend/inspect-state-cn.js` | — | ≈1,200 / 6% | 复检状态下端口径唯一落点 |
| `backend/routes-samples.js` | 17,840 / 89.2% | ≈17,600 / 88% | 外迁后净减 |
| `views/list-inspect.js` | 1,113 / 5.6% | ≈1,900 / 10% | 适用集合 + `na` 态 |
| `views/detail.js` | 14,071 / 70.4% | ≈14,150 / 71% | 临界，仅改复检行 |
| `css/module.css` | 12,475 / 62.4% | ≈13,500 / 68% | 队列/操作条/结果面板样式 |

`scan-actions.js`、`list-render.js`、`list.js`、`dashboard-todo.js`：**零改动**。

---

## 八、验收标准

### 8.1 需求 1

| id | 标准 |
|---|---|
| B1 | 10 件批量归还：操作次数从「10 次扫码 + 10 次确认」降为「10 次扫码 + 1 次提交」 |
| B2 | 提交前清单逐条可见编号/名称/当前领用人/应还时间，可移除误扫件 |
| B3 | 预校验未全通过时：**整批不执行**（DB 零变化），返回不合格件与原因 |
| B4 | 执行期部分失败：成功件**不回滚**，失败件留在队列可单独重试 |
| B5 | 批量与逐件路径对同一批数据**逐字段等价**：状态、`scan_logs` 条数、`note` 文本完全一致（含「领用人 X（部门）」「应还 …」格式） |
| B6 | 并发：两人同时操作同一样品 → 后到者得 `VERSION_CONFLICT`，结果面板归入「可重试」，不产生脏数据 |
| B7 | 权限：非 `CUSTODY`/`ME` 调用批量接口逐件 409，零执行 |
| B8 | 上限：>50 件被拒（后端 400），重复编号进「跳过」组 |
| B9 | 单件链路零回归：`POST /api/scan`、`GET /api/resolve` 行为与文案不变 |

### 8.2 需求 2

| id | 标准 |
|---|---|
| C1 | `RETIRED`（无论 `next_inspect_at` 在过去/未来/为空）在列表显示「不适用」，**不出现**「正常」「近7天到期」「逾期N天」 |
| C2 | `RETURNING`/`NEW`/`PRODUCED` 同样显示「不适用」；`CHECKED_OUT` 显示「不适用（领用中）」 |
| C3 | `IN_CUSTODY` 三态与逾期/近 7 天计算结果**零变化** |
| C4 | 看板 overdue/dueSoon 计数、机型墙逾期计数**零变化**（SQL 未动） |
| C5 | 导出 CSV「复检状态」列与页面同口径（不出现「列表不适用、导出逾期N天」） |
| C6 | 既有单测全绿；新增 `RETIRED` + 未来日期的用例断言为 `na` / 「不适用」 |
| C7 | 治具等其它子系统徽章（`.b-overdue` 共享类）不受影响（双系统只读回归） |

---

## 九、风险与缓解

| id | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 队列持久化跨班次误提交 | 中 | 班次隔离（创建时间 + 操作人），超时自动丢弃 |
| R2 | 前端入队窗口放大 409 | 中 | 提交前逐件 `resolve` 复核；409 `code` 分组；「已生效」判定 |
| R3 | 领用人候选排序被日志格式变更破坏 | **高** | 批量 `note` 严格复用单件格式；测试断言 note 正则（`routes-checkout-users.js:19-26`） |
| R4 | 路由顺序错误导致批量接口被 `/api/samples/:id` 捕获 | 中 | 注册置于 `routes-samples` 之前（`backend/index.js:16-21` 既有教训） |
| R5 | `scan.js` 外迁引入渲染回归 | 中 | 外迁为纯搬移（文案/结构逐字节不变），先单独提交、可单独 revert |
| R6 | 版本号四处不同步 | 低 | 按 §13 约定同步 `package.json` / 5 个 manifest / 发布说明 |
| R7 | 存量作废数据 | 低 | **无需订正**（本设计不改数据；展示层修复对存量立即生效） |

---

## 十、明确不做（非目标）

1. 不改状态机（`manifest.json` 零改动，`CHECKOUT`/`RETURN_OUT` 已声明）；
2. 不做「单事务整批回滚」；
3. 不清理 `next_inspect_at`/`valid_until`（**保留字段**，本次为纯展示修复）；
4. 不做数据订正（存量作废行无需 UPDATE）；
5. 不统一后端 SQL 逾期口径（`dao-list.js:20-21` 的 `IN_CUSTODY` 与工作台 `RELEASED`/`IN_CUSTODY` 差异属独立口径问题）；
6. 列表多选 + 批量操作条（`list-batch.js`）本期不做，留二期；
7. 批量入口不放开到 `PRODUCE`/`INSPECT` 等含图片动作；
8. 不新增 `scan_logs` 列、不新建表；
9. 不修改 `shared/`、`app.css`、`server.js`（无需双系统功能回归，仅做只读回归）；
10. 不改 `AGENTS.md`/`CLAUDE.md` 规则文件（容量台账更新需用户单独授权）。

---

## 十一、待业务确认项（不阻塞设计，阻塞实现冻结）

| # | 事项 | 默认取值 |
|---|---|---|
| Q1 | 一次真实批量件数分布，是否存在 >50 的真实需求 | 默认上限 50，超出提示分批 |
| Q2 | 同批领用人/时长是否统一（决定公共设置形态） | 默认同批同一人 + 统一时长，支持逐件覆盖备注 |
| Q3 | 「本就已归还」的件是否算跳过 | 默认跳过（`skipped`），不计失败 |
| Q4 | `RETIRED` 占位文案 | 默认「不适用」+ title 含作废原因 |
| Q5 | 是否需要 `batchId` 幂等键 | 默认阶段一仅队列去重 + CAS 兜底 |
| Q6 | 跨部门领用是否加部门门槛 | 默认沿用现状（不加新门槛） |
