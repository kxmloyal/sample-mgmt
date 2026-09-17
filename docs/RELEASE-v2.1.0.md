# RELEASE v2.1.0 — 样品扫码台批量领用 / 归还（连扫入队 + 公共设置 + 全或无预校验 + 幂等防重 + 失败清单导出）

> 发布日期：2026-09-17
> 上一版：[RELEASE-v2.0.9.md](./RELEASE-v2.0.9.md)（启动加固 + scan.js 拆分瘦身）
> 本版性质：**新功能（feat）+ 前置重构（refactor）+ 文档（docs）**。样品状态机、既有单件接口出入参、其它四个子系统**均无变更**。
> 设计依据：`docs/superpowers/specs/2026-09-16-samples-batch-checkout-and-inspect-display-design.md`（批次二 需求 1）
> 实现计划：`docs/superpowers/plans/2026-09-16-samples-batch-checkout-and-inspect-display.md`

---

## 1. 版本号统一（延续 v2.0.3 / v2.0.9 约定）

| 位置 | 值 |
|---|---|
| `package.json` → `version` | `2.1.0` |
| `subsystems/control/manifest.json` → `version` | `2.1.0` |
| `subsystems/fixtures/manifest.json` → `version` | `2.1.0` |
| `subsystems/projects/manifest.json` → `version` | `2.1.0` |
| `subsystems/samples/manifest.json` → `version` | `2.1.0` |
| `subsystems/workbench/manifest.json` → `version` | `2.1.0` |
| 本文件 | `docs/RELEASE-v2.1.0.md` |

> **待授权项**：`AGENTS.md` §13「版本号约定」原文记录「当前 **2.0.9**」，按规则文件需用户明确授权后方可修改（本次未改动规则文件）。同一批待授权项还包括 `AGENTS.md` §14 / `CLAUDE.md` §6·§11 的容量台账刷新（见 §7）。

---

## 2. 需求与范围

**用户需求**：生产/测试现场一次领出或归还多件样品时，现行单件路径必须「每件一次扫码 + 一次确认」，20 件就是 20 轮确认，扫码枪连扫的优势被抵消。

**本版交付**：扫码台新增「批量领用 / 归还」模式，把交互压缩为 **公共设置一次 → 连扫入队（0 次确认）→ 一次提交 → 三段式结果面板**。

**范围边界（冻结决策，2026-09-16 用户确认）**：

| 编号 | 决策 |
|---|---|
| Q1 | 单批上限 **50 件** |
| Q2 | 整批 **统一领用人 + 统一领用时长**（不逐件填写） |
| Q3 | 队列内重复项 **记为「跳过」并说明原因**（不算失败、不阻断整批） |
| Q4 | 动作不适用时用「**不适用**」+ 悬浮说明原因（不逐件弹错） |
| Q5 | 一期即写入 `batchId` 并做幂等校验 |
| Q6 | **不新增跨部门门槛**（与单件路径一致） |
| Q7 | 分两批上线，本版为**批次二** |

---

## 3. 后端（2 个新端点，1 个新文件）

### 3.1 新增端点

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/api/samples/batch-resolve` | **只读**复核：逐件返回状态 / 名称 / 领用人 / 应还时间 / 当前允许动作 | 登录（沿用扫码台鉴权） |
| POST | `/api/samples/batch-action` | 批量执行 `CHECKOUT` / `RETURN_OUT` | 登录 + 角色（CUSTODY / ME，与单件一致） |

`batch-action` 契约：

- 入参：`{ action, codes[], batchId, checkout_user?, durationHours?, note? }`
- `action` 仅接受 `CHECKOUT` / `RETURN_OUT`；`batchId` 必填，`^[A-Za-z0-9_-]{8,40}$`
- 超过 50 件 → **HTTP 400**「单批最多 50 件，当前 N 件」
- 预校验不通过 → **HTTP 422** `{code:'PRECHECK_FAILED', executed:0, rejected[], skipped[]}`（**零副作用**，样品状态未变）
- `batchId` 重复 → **HTTP 409** `{code:'BATCH_DUPLICATE', executed:0, applied[]}`（**零副作用**，不重复执行）
- 成功 → `{action, batchId, executed, ok[], failed[{code, code_, reason, retryable}], skipped[], probeMs}`

### 3.2 两阶段全或无（设计 §5.2）

- **阶段 1 预校验**：对全部编号做只读校验（存在性 + 状态机是否允许该动作），任一不合格即整批 422。这一步不写任何数据。
- **阶段 2 执行**：**逐件独立事务**（物理领出/归还不可整体回滚；50 件单事务会长时间持锁并放大死锁风险）。故阶段 1 通过后，阶段 2 仍可能个别失败（并发抢占、版本冲突），失败项逐件返回并标注 `retryable`。

> **口径说明**：批量端点对「不合格项」返回的是**批次级 422 + 逐件 `code_` 标记**（`NOT_FOUND` / `ACTION_NOT_ALLOWED`），而非每件一个 409——这是设计 §5.2「全或无」的既定语义；单件的 409 语义仍保留在 `routes-scan.js` 路径中，两者不冲突。

### 3.3 幂等防重（Q5）

- 客户端每次提交生成一个 `batchId`（`crypto.randomUUID()`），**网络中断等未知态重试复用同一值**。
- 服务端在执行前先探测该 `batchId` 是否已落库（`scan_logs.note` 携带 `[batch:<id>]` 后缀），命中即返回 409 且**一件都不执行**。
- 前端收到 409 后逐件调用只读 `batch-resolve` 复核，把已生效件标为「已生效」、其余重置为待提交。
- **结论**：任何情况下成功件都不会被二次执行。
- 注：后缀只追加到 `scan_logs.note`，**不污染** `samples.checkout_note` 等业务字段。

### 3.4 新增/变更文件

| 文件 | 变更 | 说明 |
|---|---|---|
| `subsystems/samples/backend/batch-scan.js` | **新增** | 批量端点全部逻辑（校验/预校验/逐件执行/幂等探测） |
| `subsystems/samples/backend/scan-allowed.js` | **新增** | 抽「当前状态允许哪些动作」+ 状态中文标签 + 复检提前天数，供单件与批量共用 |
| `subsystems/samples/backend/routes-scan.js` | 改 | 消费 `scan-allowed`，自身瘦身；409 分支**仅新增兼容字段**（`code`/`status`/`sample`/`error`），原字段不变 |
| `subsystems/samples/backend/index.js` | 改 | 注册 `batch-scan`，**顺序置于 `routes-checkout-users` / `routes-samples` 之前**（否则 `/api/samples/:id` 会吞掉 `/api/samples/batch-*`） |
| `subsystems/samples/db/dao.js` | 改 | 新增 `listBatchLogs(batchId)`（幂等探测）；**函数名全局唯一**（`db.js` 展平后无前缀冲突） |
| `subsystems/samples/backend/scan-actions.js` | **零变更** | 明确不动，避免影响存量单件路径 |

---

## 4. 前端（批量交互）

### 4.1 T0 前置重构（独立提交，行为零变化）

`subsystems/samples/frontend/js/views/scan.js` 在批次二开始前为 **244 行 / 17,109 字符（85.5%）**，已越 §7.1 的 70% 预警线。按规则「越线先等量外迁再挂钩新功能」，先做纯搬迁：

| 文件 | 行数 | 字符 | 占比 | 顶层函数 |
|---|---|---|---|---|
| `views/scan.js`（T0 后） | 170 | 9,936 | 49.7% | 5 |
| `views/scan-forms.js`（新增） | 83 | 7,832 | 39.2% | 1 |

`showScanActionForm` 逐字搬迁，**函数名与调用点不变**（`renderScanAction` 末尾调用 + 按钮 `onclick="showScanActionForm(...)"`），故行为等价；bundle 内该函数出现 **1 次**（无重复定义）。

### 4.2 新增/变更文件

| 文件 | 行数 | 字符 | 占比 | 顶层函数 | 说明 |
|---|---|---|---|---|---|
| `views/scan-batch.js` | 238 | 12,708 | 63.5% | 10 | 队列模型 + 公共设置 + 提交流程 + HTTP 语义分流 |
| `views/scan-batch-result.js` | 107 | 6,801 | 34.0% | 5 | 结果面板渲染 + 重试 / 复制 / 导出 CSV |
| `views/scan.js` | 182 | 10,648 | 53.2% | 5 | 批量模式开关 + 队列容器 + `doScan` 入队分流 |
| `js/api.js` | 67 | 3,407 | 17.0% | 10 | `api()` 增第 4 个**可选**参数 `opts.silent`；`_apiFetch` 错误对象新增 `err.data` |
| `css/batch.css` | 40 | 2,400 | 12.0% | — | `.sb-*` 全部样式 |
| `css/module.css` | 181 | 12,608 | 63.0% | — | 仅加指针注释（样式未落入此文件） |

> 容量口径：**服务器端 LF 归一字符数**（§7.1）实测值。

### 4.3 两处对计划文本的偏离（均为兼容优先，已报备）

1. **批量模式用新的显式开关 `#sb-mode-btn`，而不是改造既有「连续扫码」`#scan-cont`**。
   原因：`#scan-cont` 除连扫外还驱动标示卡打印队列累积（`views/scan-camera.js` 的 `enqueuePrintCard`），改造它会**静默改变单件路径行为**（§6 兼容优先）。新开关零影响存量路径。
2. **样式放 `css/batch.css`，未写入 `module.css`**。
   原因：写入 `module.css` 会使其达 **72.2%**，越过 §7.1 的 70% 线；沿用 2026-09-15 `report.css` 的拆分先例。仍是**子系统自有 CSS，未写入共享 `app.css`**（§18 禁令）。

### 4.4 交互要点

- **公共设置**：领用人（必填，可点选候选或直接输入）+ 领用时长，复用单件路径同一份校验函数 `collectCheckoutPayload`（`scan-payload.js`），不另造一份校验。
- **连扫入队**：批量模式下 `doScan` 不再渲染单件动作表单，而是把样品入队并立刻清空输入框重新聚焦；同编号去重（首件为准），上限 50，超出提示。
- **队列持久化 + 班次隔离**：队列写 `localStorage`；「换操作人」或「距上次操作超 8 小时」即整队丢弃（防跨班次误提交）。**「无历史记录」不等于「跨班次」**——首次使用绝不清队列（本地预跑曾发现该缺陷并已修复）。
- **提交**：一次 `POST /api/samples/batch-action`，`silent: true`（不弹全局 toast、不触发单件冲突刷新；401 仍照常跳登录），逐件错误由结果面板承载。
- **结果面板**：结论条 + 成功 / 失败 / 跳过三组；底部动作条按结果种类给按钮——「重试全部可重试项」「复制失败编号」「导出失败清单 CSV」「修正后重交整批」「清空并开始新一批」。
- **重试语义**：
  - 部分失败后重试 → **只重交可重试的失败件**，并**换新幂等键**（上一批已落库，复用旧键会被判重复）；成功件与「需人工」件状态位原样保留。
  - 预校验整批被拒后重交 → **复用同一幂等键**（该情形零副作用、旧键未被占用）。
- **导出失败清单 CSV**：遵循 §21 约定——BOM UTF-8、CRLF、含逗号/引号/换行字段双引号转义，列 = 编号 / 样品号 / 现状态 / 原因 / 可重试（状态输出中文），文件名 `batch-failed-YYYYMMDD-HHmm.csv`。
- **复制失败编号**：优先 Clipboard API；局域网 http（非安全上下文）自动降级为临时 `textarea` + `execCommand`。

---

## 5. 测试与验证

### 5.1 新增测试

| 文件 | 行数 | 字符 | 类型 |
|---|---|---|---|
| `tests/samples-batch-scan.test.js` | 120 | 5,798 | 纯函数 + 源文件契约 |
| `tests/samples-batch-scan-e2e.test.js` | 251 | 12,105 | **DB 真跑**（独立测试库 + 守卫跳过） |
| `tests/samples-batch-frontend.test.js` | 442 | 20,923 | 假 DOM/`vm` 真跑前端队列与提交 + 源文件契约 |

e2e 覆盖：整批 422 零副作用、批量领出/归还字段逐项等价（`scan_logs.note` 文案逐字符比对）、上限 50 与去重、`BATCH_DUPLICATE` 后 `scan_logs` 与 `expected_return_at` 均未变、CAS 版本冲突路径、`batch-resolve` 只读、单件 409 兼容字段。

前端覆盖 20 用例：去重 + 上限、队列增删清、首次使用不清队列（回归护栏）、班次隔离三场景、成功分流、领用人缺失前置、422 整批、网络异常同键重试、409 幂等命中、重试范围与幂等键、被拒后复用旧键、CSV 内容与转义、复制降级、动作条按种类渲染，以及 6 组源文件契约断言。

### 5.2 回归结果（服务器实测，2026-09-17）

| 项 | 结果 |
|---|---|
| 批次二专属 3 套件 | **3 passed / 39 tests passed**（50.0 s） |
| 全量回归 | **41 passed / 7 skipped；557 passed / 10 skipped / 4 failed**（502 s） |
| `Encoding not recognized` 致命错误 | **0** |
| 4 个失败用例 | `tests/users.test.js` 的 `POST /api/users/batch`（3）+ `POST /api/users/import`（1），根因均为 **`Lock wait timeout exceeded` 环境基线**，与本次变更无关（与批次一基线同项同因） |

### 5.3 全链路排查补漏（重要）

T0 外迁把动作表单构造搬到了 `scan-forms.js`，导致**三个既有前端护栏**从 `scan.js` 读不到这些标记而失败：

- `tests/samples-scan-payload-split.test.js`（载荷函数调用点）
- `tests/samples-checkout-users.test.js`（领用人候选面板容器 / 失焦收起 / fixed 定位）
- `tests/samples-storage-loc-picker.test.js`（CUSTODY/EDIT_STORAGE 两处储位表单 / 柜位图按钮 / 防误确认）

修法：这三处改为读取「**扫码台两文件合并视图**」，断言逐条不变——护栏强度不降反增（现同时覆盖两个文件，且对未来继续拆分稳健）。**这是一次真实的全链路排查遗漏，已补齐并单独提交。**

---

## 6. 部署与回滚

### 6.1 部署步骤（**需重启，见《重启申请》**）

后端新增了路由文件，**新路由不热挂载**（§17），必须由运维在**宝塔面板**重启 sample-mgmt（AI 不得代执行，§23）。

```bash
# 由运维执行（AI 不执行）
cd /www/wwwroot/sample-mgmt
sudo -u www git pull --ff-only
# 宝塔面板 → sample-mgmt → 重启
```

前端资源已随 `git pull` 生效，浏览器**强刷（Ctrl+F5）**即可拿到 `bundle.js?v=bmu4g7w4d`。
`/api/samples/batch-*` 在重启前会返回 404（属正常，重启后生效）。

**本次无数据库结构变更**：无新增表、无 `ALTER TABLE`，`scan_logs` 复用既有 `note` 字段承载批次标记。

### 6.2 回滚步骤

```bash
cd /www/wwwroot/sample-mgmt
git revert --no-edit <本版提交区间>   # 逐个 revert，禁止 reset --hard / push --force
# 宝塔面板 → sample-mgmt → 重启
```

若仅需**快速关闭前端入口**而不回滚后端：移除 `subsystems/samples/frontend/index.html` 中 `batch.css` 的 `<link>` 与 `scan.js` 的批量按钮即可（后端端点保留不影响存量单件路径）。
`batchId` 后缀只写在 `scan_logs.note`，回滚后存量日志仍可读（不影响任何查询口径）。

### 6.3 兼容性影响

| 面 | 影响 |
|---|---|
| 样品状态机 | **无变更**（未新增状态/迁移；`CHECKOUT`/`RETURN_OUT` 复用既有声明） |
| 单件接口出入参 | **无破坏性变更**；`routes-scan.js` 409 分支仅**新增**字段 |
| 其它四个子系统 | **零影响**（未触碰 `shared/`、`app.css`、`server.js`、`db.js`） |
| 既有前端契约测试 | 三处读取路径调整（见 §5.3），断言不变 |
| 数据库 | 无 DDL；无迁移 |

---

## 7. 待授权 / 未完成事项

| 项 | 状态 |
|---|---|
| `AGENTS.md` §13 版本号（2.0.9 → 2.1.0） | **已执行（2026-09-17，用户授权）**：提交 `eff4f5c` |
| `AGENTS.md` §14 / `CLAUDE.md` §6·§11 容量台账刷新 | **已执行（2026-09-17，用户授权）**：提交 `eff4f5c`；本次 README 拆分后 README 容量条目需再次刷新 |
| `README.md` 拆分（`README.md` LF 98.6%） | **已执行（2026-09-17）**：`## API 一览` 外迁 `docs/api.md`，README LF 19,796 → **15,525（77.6%）**；验收 A1~A5 全部通过（计划 `docs/superpowers/plans/2026-09-15-split-readme.md`） |
| `public/css/app.css` 门户块拆分（109.5%，已超红线） | 未授权（需三系统回归） |
| `routes-fixtures.js` 97.0% / `scan-actions.js` 88.1% | 仅允许精简重构，本版零变更 |
| `flow-ops.js` 顶层函数 12 个（超 §7.2 上限） | 待拆分 |
| `tests/users.test.js` 4 个 `Lock wait timeout` 失败 | **已解决（2026-09-17）**：立项独立排查确认**非环境基线问题**，系 `db/users.js:135` 漏传事务连接 `conn`，已修复并全量回归通过（提交 `5a862c6`，见第 9 节） |

---

## 8. 上线后监控提示（1~3 个业务周期）

- 关注 `/api/samples/batch-action` 的 **422 / 409 比例**：422 偏高说明现场对「当前状态可做哪些动作」理解不足；409 偏高说明客户端重试链路或网络不稳定。
- 关注单批实际件数分布与**平均 `probeMs`**。
- 关注 `scan_logs` 中带 `[batch:` 后缀的行数与批量提交次数是否吻合（防漏记/重记）。
- 关注前端批量模式下是否出现「入队件数与实际提交件数不符」的现场反馈。

### 8.1 幂等探测成本基线（部署前实测，2026-09-17）

幂等探测 SQL 为 `note LIKE CONCAT('%[batch:', ?, ']%')`——**前导通配无法走索引**，是全表扫描。已实测建立基线，供后续判断是否需迁列加索引：

| 指标 | 实测值 |
|---|---|
| `scan_logs` 行数 | **747** 行（`information_schema` 估算 723 行） |
| `scan_logs` 数据/索引体积 | 112 KB / 16 KB |
| 探测 SQL 单次耗时（100 次批量法，扣除客户端基线） | **约 0.4 ~ 0.6 ms** |
| 现有索引 | `PRIMARY(id)`、`idx_logs_sample(sample_id)`；`note` **无索引** |
| `EXPLAIN` | `type=ALL`，`rows=723`，`Using where`（全表扫描，符合预期） |

**判定**：当前规模（千行级、百 KB 级）下单次探测 < 1 ms，**不构成性能问题**，无需在本版加索引。
**触发后续优化的阈值**：`scan_logs` 超过 **10 万行**，或现场反馈单次提交总耗时（`probeMs`）持续 > 50 ms 时，评估把批次标记迁至独立列（如 `scan_logs.batch_id`）+ 索引，属后续迭代范围。

---

## 9. 发布后缺陷修复：批量改角色「跨连接自我锁等待」（2026-09-17，提交 `5a862c6`）

> 本版发布后，对 `tests/users.test.js` 长期 4 项失败**立项独立排查**，确认其为**真实代码缺陷**，而非 `docs/RELEASE-v2.0.9.md` §9.4 原记的「环境性失败」（该节结论已更正）。

### 9.1 根因（单点缺陷）

`db/users.js` 的 `updateUsers(ids, fields, conn)` 内三条语句传参不一致：

| 行 | 语句 | 传 `conn` | 后果 |
|---|---|---|---|
| 131 | `UPDATE users SET role/dept WHERE id IN (…)` | 传了 | 走**事务连接**，持 `users(N)` 行级 X 锁且未提交 |
| 133 | `DELETE FROM user_roles WHERE user_id IN (…)` | 传了 | 走事务连接 |
| **135** | **`INSERT INTO user_roles (user_id, role) VALUES (?,?)`** | **漏传** | 退化为 `dbRef.run` ⇒ 落到**池上另一条独立连接** |

### 9.2 失效机理

事务连接持 `users(N)` 行级 **X 锁**（未提交）→ 池上另一条连接的 `INSERT INTO user_roles (N,…)` 其**外键检查需同一 `users(N)` 行的 S 锁**，被该 X 锁挡住 → 而事务回调正在 `await` 这条 INSERT ⇒ **回调等 INSERT、INSERT 等回调释放锁**；等满 `innodb_lock_wait_timeout=50s` 抛 `ER_LOCK_WAIT_TIMEOUT(1205)`，抛出点 `db.js:65`（`dbRef.run` 的 `pool.execute`）。

### 9.3 证据链（6 项实测）

| # | 证据 | 手段 |
|---|---|---|
| 1 | 卡住语句恒为 `INSERT INTO user_roles (…) VALUES (N,'…')`，`STATE=update`，`t=27~50` | `information_schema.PROCESSLIST` 采样 |
| 2 | `users(N)` 确被 X 锁：`FOR UPDATE NOWAIT` → `ERROR 3572` | 独立会话锁探针（立即返回，无等待无写入） |
| 3 | 事务连接呈 **Sleep + 未结束事务**（末语句 `DELETE FROM user_roles`） | mysql2 `Pool.prototype.getConnection` 层连接探针（纯 JS，免 PROCESS 权限） |
| 4 | **错误栈 `exec (db/users.js:108)` ← `dbRef.run (db.js:65)`，`sql: INSERT INTO user_roles`** | 70s 长等待抓取 —— **决定性证据**：证明走池连接而非 `conn.execute` |
| 5 | 同一 SQL 序列（UPDATE→DELETE→INSERT）纯 SQL 执行 **7 ms 通过** | 排除 SQL 层自身锁，反证问题在「跨连接」 |
| 6 | 测试库 `users.id=514/516` 的 role 仍为 `RD` | 证明事务已正确 `rollback`，**无脏数据** |

### 9.4 全链路排查（§6 五维度）

| 维度 | 结论 |
|---|---|
| 代码层 | `updateUsers` 全项目**仅 1 个调用点**（`routes/misc.js:137`）；「三参 `exec(sql,params,conn)`」模式全项目**仅 `db/users.js:107` 一处**，6 个 `exec` 调用逐行核对——**只有 L135 漏传**，其余 5 处正确 |
| 接口层 | `POST /api/users/batch` 且 `action='update'` 且带 `role` → 必现；其余 action（`delete`/`reset-password`/`enable`/`disable`）不受影响 |
| 级联面 | 事务持锁期间任何 `INSERT INTO user_roles`（建号 `createUser`、`/api/users/import`）被阻塞最多 50s ⇒ 解释另 2 例「级联受害者」 |
| 数据库层 | 无 schema 变更、无数据变更（失败即回滚） |
| 文档层 | `docs/RELEASE-v2.0.9.md` §9.4 结论已更正 |

### 9.5 修复与验证（服务器实测）

修复：`db/users.js:135` 补第 3 个参数 `conn`（+5 行 why 注释）。

| 项 | 修复前 | 修复后 |
|---|---|---|
| `tests/users.test.js` | 4 failed / 31，145.1 s | **31 passed / 31，47.7 s** |
| `should update role to PM in batch` | ✕ 30,002 ms | ✓ 1,152 ms |
| `should update role and dept in batch` | ✕ 30,001 ms | ✓ 2,256 ms |
| `should create user with PM role`（级联） | ✕ 23,369 ms | ✓ 1,470 ms |
| `should import valid users`（级联） | ✕ 25,147 ms | ✓ 3,317 ms |
| **全量回归** | 1 suite failed / 4 tests failed，493.555 s | **42 suites passed（42/49）、566 passed、0 failed，388.186 s** |
| `Encoding not recognized`（cesu8） | 0 | 0 |

### 9.6 部署与回滚

- **部署**：已随 2026-09-17 11:42:48 重启生效（PID 2497127 → **2577563**；进程启动时间晚于文件 mtime ⇒ 已加载新版）。
- **回滚**：`git revert 5a862c6`（无 schema / 数据迁移，回滚零风险）。
- **重启后只读巡检**：`/api/login`、`/api/users`、`/api/dashboard`、`/api/logs`、`/api/rd-users`、`/api/subsystems`、`/api/portal/prefs`、`/api/samples?limit=3`、`/api/samples/batch-resolve`、`/api/fixtures?limit=1`、`/api/fixtures/dashboard`、`bundle.js`、`batch.css`、`portal.html` 全部 **200**；5 个子系统均加载 v2.1.0；启动日志无 error；`pgrep -fc '[s]ample-mgmt/server.js'` = **1**（单实例）。
- **生产数据护栏（与批次二验收基线逐项一致、零漂移）**：`samples` 存活 **126**、`CHECKED_OUT` **53**、`scan_logs` **747**、`[batch:` 标记 **0**、`users` **40**、`user_roles` **41**、非法角色 **0**。

### 9.7 监控提示

- 关注生产日志是否再现 `ER_LOCK_WAIT_TIMEOUT` / `Lock wait timeout exceeded`（缺陷唯一表现形态）；若再现且栈指向 `db.js:65`，说明仍有语句在事务内漏用 `conn`。
- 用户管理页「批量改角色」响应时间正常应为数十毫秒级。
- **顺带发现（未修，独立事项）**：`sessions` 表 5,658 行，索引仅 `PRIMARY(session_id)`，**`expires` 列无索引**；`server.js:61-63` 已刻意禁用 `touch` 以避免每请求 UPDATE。若后续启用会话清理或 `touch`，该表将出现全表扫描/大范围加锁，届时评估补 `expires` 索引。

## 10. 发布后缺陷修复：样品统计口径可见性（2026-09-17，`4ae623d` + 构建 `857de41`）

> 用户反馈：已废弃样品被一并统计，确认某机种正式发行数量时数据偏多。
> **同类缺陷早有预警**：2026-09-10 的 RELEASED 卡片评审文档已写明「『总数』含已废弃：`total` 包含 RETIRED 状态样品（当前 RETIRED=0，无影响）」；v2.0.7 作废 26 件后预警条件恰好触发，本次为其落地。

### 10.1 根因（三层，非单点缺陷）

| 层 | 位置 | 问题 |
|---|---|---|
| 口径 | `db/dao-list.js:117` `aggregateModelsWall` 与看板 `countSamplesByStatus` | 只排软删 `deleted_at IS NULL`，**不排 `RETIRED`** |
| 标签 | `views/dashboard.js` 总数卡、`views/model-wall.js` 卡片 | 直接显示该数字，「总数」「样品 N 件」**未说明口径**（同一标签两种读法） |
| 对账 | `views/model-wall.js` 的 `WALL_STATUSES` | 徽章只渲染 `IN_CUSTODY/CHECKED_OUT/RETURNING`，**缺 `RETIRED`** → 卡片数字与徽章之和不可对账，放大误读 |

### 10.2 生产库实测与修复

- **口径实测（只读）**：`samples` 表总行数 135（含**软删 9**，**不可直接当存活数**）；**存活样品总量 126**（= `/api/dashboard` 的 `total`）；已废弃 **26**（且 26 件**全部发行过**）；**在管总量 100**。
- **受影响面**：4 个机型中**仅 BD7620D** —— 修复前卡片显示 86 且状态徽章只有三态（合计 60），数字与徽章不可对账；现显示「样品 86 件（含已废弃 26）」+ `RETIRED` 徽章，**徽章之和 = 86 ✅**；其余 BD9324N 37 / BD5315 1 / BD1125 2 均无废弃。
- **修复内容（纯前端；术语与 `report.js:125-126`「存活样品总量 / 在管总量」统一）**：
  - `views/dashboard.js`：总数卡主数字改为「**在管总量 = total − RETIRED**」，标签补「（已废弃 N）」；比例条分母与 `_kbStats` 键仍为 `total`（加总恒 100%、待办筛选语义不变），`retired=0` 时逐字等价。
  - `views/model-wall.js`：`WALL_STATUSES` 补 `RETIRED` 徽章，卡片数字标注「（含已废弃 N）」，顶部汇总同步。
  - `views/help-data.js`：看板/机型视图帮助文案同步口径。
  - `tests/dashboard.test.js`：新增「样品统计口径可见性」3 例静态断言，并同步受影响既有断言（「总数 + 7 个状态」→「在管总量 + 7 个状态」）。
  - bundle 重建：`?v= bmu4g7w4d → bmu5czv8c`。
- **刻意未改**：`views/report.js`（其机型/状态表**已并列**「存活样品总量 / 在管总量」并含已作废，口径本就正确，本次以其术语为基准）；`db/dao.js:163` `countSamplesByModel`（用于机型删除的**引用守卫**「已被 N 个样品使用，禁止删除」，含已废弃是**正确行为**——作废样品仍引用该机型）。

### 10.3 部署与验证

- **无需重启**（纯前端 + bundle 重建）：`bundle.js?v=bmu5czv8c` 已生效，用户 **Ctrl+F5** 即可；服务未受影响（PID **2577563** 不变、`/health` = `{"status":"ok","db":"connected"}`）。
- `tests/dashboard.test.js` **8 passed / 8**（含 3 例新增断言）。
- 渲染逻辑回归（用真实接口数据复刻渲染分支）：总数卡数字 **100** · 标签「在管总量（已废弃 26）」，100 + 26 = 126 = `total` ✅；机型视图 **4 个机型「徽章之和 === sample_count」全部成立** ✅；顶部汇总 126 === `total` ✅。
- 回滚：`git revert 4ae623d 857de41`（无 schema / 数据变更，零风险）。

### 10.4 遗留与后续

1. **「累计发行」指标尚未提供**：`sample_count` 是「该机型样品总数」，**不是**累计发行量（后者为 `released_at` 非空）；BD7620D 两者恰好都等于 86，**新机型会不等**，且前端 `status_stats` 只有当前状态分布、拿不到「曾发行过」→ **纯前端无法计算**。如需该指标，须在既有聚合 SQL 内加一列 `SUM(released_at IS NOT NULL)`（`dao-list.js` 余量 8,521 字符，属「已有 SQL 加列」而非新增查询）**并重启一次**。
2. **列表页 `total` 仍含已废弃**：**刻意保留**——列表是全量台账，作废样品须可见可筛（可经 `status=RETIRED` 查看）。
3. **`views/dashboard.js` 顶层函数 12 个**（**超 §7.2 上限 10**；2026-09-17 复核，**既有问题、本次未新增函数**）→ 建议单独立项拆分并补入 §14 技术债清单。
4. **`docs/operation-manual.md` 未同步**：该文件 26,030 字符（130.2%，超 §7.1 兜底线）且为文档而非源码、规则文件技术债清单中未立项；产品内帮助（`help-data.js`）已同步，外部总册的口径同步建议随其拆分立项一并处理。

