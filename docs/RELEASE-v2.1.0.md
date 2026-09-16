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
| `AGENTS.md` §13 版本号（2.0.9 → 2.1.0） | **待授权**（规则文件，需用户明确同意） |
| `AGENTS.md` §14 / `CLAUDE.md` §6·§11 容量台账刷新 | **待授权** |
| `README.md` 拆分（`README.md` LF 98.6%） | 已立项未执行（`docs/superpowers/plans/2026-09-15-split-readme.md`） |
| `public/css/app.css` 门户块拆分（109.5%，已超红线） | 未授权（需三系统回归） |
| `routes-fixtures.js` 97.0% / `scan-actions.js` 88.1% | 仅允许精简重构，本版零变更 |
| `flow-ops.js` 顶层函数 12 个（超 §7.2 上限） | 待拆分 |
| `tests/users.test.js` 4 个 `Lock wait timeout` 失败 | 环境基线问题，需独立排查（与本次变更无关） |

---

## 8. 上线后监控提示（1~3 个业务周期）

- 关注 `/api/samples/batch-action` 的 **422 / 409 比例**：422 偏高说明现场对「当前状态可做哪些动作」理解不足；409 偏高说明客户端重试链路或网络不稳定。
- 关注单批实际件数分布与**平均 `probeMs`**（幂等探测为 `note LIKE '%[batch:...]%'` 前导通配，随 `scan_logs` 增长成本上升）。若 `probeMs` 持续偏高，评估将批次标记迁至独立列 + 索引（属后续优化，不在本版）。
- 关注 `scan_logs` 中带 `[batch:` 后缀的行数与批量提交次数是否吻合（防漏记/重记）。
- 关注前端批量模式下是否出现「入队件数与实际提交件数不符」的现场反馈。
