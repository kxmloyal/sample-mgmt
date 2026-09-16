# 样品「批量领用/归还」+「作废样品复检展示」— 实现计划

| 项 | 内容 |
|---|---|
| 立项日期 | 2026-09-16（用户确认 4 项设计决策 + 7 项业务决策，见设计文档 §11） |
| 状态 | **未开始（待实现授权）** |
| 设计依据 | `docs/superpowers/specs/2026-09-16-samples-batch-checkout-and-inspect-display-design.md` |
| 目标版本 | `2.1.0`（`package.json.version` + 5 个 `subsystems/*/manifest.json.version` + `docs/RELEASE-v2.1.0.md` 四处同步） |
| 交付边界 | **已确认分两批发布**（Q7）：批次一＝需求 2（独立、零数据风险、可先发），批次二＝需求 1；两批各自可独立上线与回滚 |
| 硬约束 | 不改状态机、不清数据、不做单事务整批回滚、不写 `app.css`、不新增 `scan_logs` 列、前端改后必须重建 bundle |

---

## 1. 任务分解

### T0（前置，独立提交）`scan.js` 表单外迁，腾出批量挂钩空间

| 项 | 内容 |
|---|---|
| 目的 | `views/scan.js` 实测 17,109 字符 / 85.5%，已过 §7.1 的 70% 线，按规则不得再追加业务逻辑 |
| 改动 | 新建 `subsystems/samples/frontend/js/views/scan-forms.js`，把 `views/scan.js:80-155` 的 `showScanActionForm` 各动作表单构造**逐字节搬移**为 `buildScanFormHtml(action,s)`；`scan.js` 保留薄分发（调用 + 表单渲染后的 picker 初始化，`:148-154`） |
| 登记 | `tools/bundle-sources.json` 的 `samples` 数组插入 `subsystems/samples/frontend/js/views/scan-forms.js`，位置紧随 `views/scan-payload.js`（第 28 行）之后、`views/scan.js`（第 29 行）之前 |
| 不做 | 不改任何文案、不改分支条件、不删 emoji（`scan.js:111` 的柜位图符号等必须原样保留） |
| 验收 | `views/scan.js` 字符数降至 ≈13,300（≤70%）；表单 HTML 与迁移前文本 diff 仅位置差异；扫码台 8 类动作表单渲染与迁移前一致（只读目视 + 单测） |
| 提交 | `refactor(scan): 外迁扫码台动作表单至 scan-forms.js（为批量模式腾出容量）` |

### T1（需求 2 前端）复检适用状态判定 + `na` 态

> 状态：**已完成**（2026-09-16 本地提交，待运维重启发布）

| 项 | 内容 |
|---|---|
| 改动 1 | `subsystems/samples/frontend/js/views/list-inspect.js`：新增 `INSPECT_NA_STATUSES`（`RETURNING`/`RETIRED`/`NEW`/`PRODUCED`）与 `INSPECT_GREY_STATUSES`（`RELEASED`/`CHECKED_OUT`）；`inspectState` 增加守卫「`s.status` 存在且在**不适用集合** → `'na'`」，顺序在 `!s.next_inspect_at` 判定之前；另抽 `inspectReason`（title 文案）/`inspectText`（展示文案）/`inspectTone`（灰化·红徽章）三个纯函数，供列表徽章、复检到期列、详情行共用同一口径；「无计划」保持「—」+ 新增 `title="未设置复检计划"` |
| 改动 2 | `views/list-render.js:34-40`：「复检到期」列复用 `inspectTone`/`inspectText`——`na` 输出灰字「不适用」、`CHECKED_OUT` 输出「领用中·暂停复检」、`RELEASED` 灰化不出红；逾期判定不再自行比较时间，改走 `inspectState` 单一口径 |
| 改动 3 | `views/detail.js:132-134`：复检行改为按 `inspectState`/`inspectTone` 分支——`na` → 「复检 不适用（已作废/退回审核中/未发行）」、`CHECKED_OUT` → 「复检 领用中·暂停复检」、`RELEASED` 灰化不出红，其余保持现状（原先自算 `overdue(s)` 的调用已移除） |
| 兼容红线 | 守卫必须写成「**status 存在**且不适用 → `na`」，不得改变 `inspectState()`/`inspectState({})` 的 `none` 行为（`tests/inspect-state.test.js:19-25`、`:53-56` 必须保持绿） |
| 测试 | `tests/inspect-state.test.js` 增 3 组用例：①不适用集合（日期在过去/未来/无日期/缺字段）→ `'na'`；②`CHECKED_OUT`/`RELEASED` 灰化且不含 `b-overdue`、`IN_CUSTODY` 逾期仍为红徽章；③`inspectBadge` 的 `title`（作废原因 / 未发行 / 领用中 / 未设置复检计划） |
| 重建 | 必须重建 bundle + 更新 `subsystems/samples/frontend/index.html` 的 `?v=` |
| 验收 | 设计文档 §8.2 的 C1~C3、C6、C7 |
| 提交 | `fix(samples): 复检状态按状态判定适用性，作废/退回中样品不再显示“正常”` |

### T2（需求 2 后端）导出口径同源 + 容量合规

> 状态：**已完成**（2026-09-16 本地提交，待运维重启发布）

| 项 | 内容 |
|---|---|
| 改动 1 | 新建 `subsystems/samples/backend/inspect-state-cn.js`（**实测 28 行 / 1,233 字符 / 6.2%**）：导出 `inspectStateCn(row)` + 不适用/灰化集合常量 |
| 改动 2 | `backend/routes-samples.js:78-85` 删除本地 `inspectStateCn` 与 `INSPECT_SOON_DAYS`，顶部 require 新文件（列定义调用点不变）→ **实测净减 312 字符 / 9 行**（17,840 / 89.2% → **17,528 / 87.6%**） |
| 不做 | 不动 `db/dao-list.js` 的 SQL 过滤（逾期/近 7 天/机型墙计数口径零变化） |
| 测试 | 新建 `tests/inspect-state-cn.test.js`（纯函数，无 DB 依赖）：不适用集合 → 「不适用」；`CHECKED_OUT` → 「领用中·暂停复检」；`IN_CUSTODY` 三态与 `ceil` 取整不变；`RELEASED` 保留三态文字；空行/空字段 → 「—」；另加两条源码契约（不再就地定义 `inspectStateCn`、CSV 列序 状态→复检状态→制作时间） |
| 验收 | 设计文档 §8.2 的 C4、C5 |
| 提交 | `fix(samples): 导出复检状态与前端同口径（外迁 inspect-state-cn 至独立文件）` |

### T3（需求 1 后端）批量预校验 + 批量执行 + 409 语义

| 项 | 内容 |
|---|---|
| 改动 1 | 新建 `subsystems/samples/backend/batch-scan.js`（`register(app)`）：`POST /api/samples/batch-resolve`（只读，≤50）、`POST /api/samples/batch-action`（两阶段：全量预校验→全通过才逐件执行；逐件复用 `scan-actions.js` 的 `applyAction` + `D.withTransaction`/`updateSample`(CAS)/`addLog`） |
| 改动 2 | `backend/index.js`：`require('./batch-scan').register(app)` **置于 `routes-samples` 之前**（`:16-21` 的 `:id` 贪婪捕获教训） |
| 改动 3 | `backend/routes-scan.js:66-69`、`:91-92`：409 响应体增量补 `code`（`ACTION_NOT_ALLOWED` / `VERSION_CONFLICT`）与 `status`，**保留**原 `error` 文案与 `sample` 字段 |
| 约束 | 上限 50（超出 400）；批次内重复编号去重进 `skipped`；`batchId` **必填**（缺失/非法 400）并写入 `note` 尾部 ` [batch:<id>]`（单件原文逐字节不变，含「领用人 X（部门）」「应还 …」——`routes-checkout-users.js:19-26` 依赖该正则）；执行前幂等探测命中 → 409 `BATCH_DUPLICATE` 零副作用（设计 §5.5）；仅支持 `CHECKOUT`/`RETURN_OUT`；`scan-actions.js` 零改动 |
| 测试 | 测试库 `sample_mgmt_test`：全通过执行、预校验拒绝（整批零执行）、执行期 CAS 冲突、越权逐件 409、超上限 400、重复编号跳过、日志 note 与单件路径逐字段比对、同一 `batchId` 二次提交 → 409 `BATCH_DUPLICATE` 且 `scan_logs` 零新增、缺 `batchId` → 400；**实测 `note LIKE` 幂等探测耗时与 `scan_logs` 行数并记入容量报告**（>50ms 按设计 §5.5 改精确后缀匹配） |
| 护栏 | `samples` 已 `deployed:true`：写库类用例必须走测试库，生产只读（`tests/helpers/deployed.js`） |
| 验收 | 设计文档 §8.1 的 B3、B4、B6、B7、B8、B9、B10、B11 |
| 提交 | `feat(samples): 新增批量领用/归还接口（预校验全或无 + 执行期逐件结果）` |

### T4（需求 1 前端）扫码队列 + 公共设置 + 结果面板

| 项 | 内容 |
|---|---|
| 改动 1 | 新建 `subsystems/samples/frontend/js/views/scan-batch.js`：队列模型（按 `sample_no` 去重、上限 50、localStorage + 班次隔离、项状态位）、公共设置表单（领用人复用 `checkout-user-picker.js`、时长、部门、备注）、结果面板（三段式 IA，见设计 §4.3）、每次提交生成 `batchId`（`crypto.randomUUID()`，重试复用同一值）、`BATCH_DUPLICATE` 命中后的「已生效 / 换新 id 重交」分流 |
| 改动 2 | `views/scan.js`：改造既有「连续扫码」开关语义为批量模式（`:20-21`），`viewScan` 增加队列容器，`doScan` 在批量模式改走入队（薄挂钩，T0 后有余量） |
| 改动 3 | `frontend/js/api.js:42-61`：为批量通道增加「静默」能力（不弹逐件 toast、不触发单件刷新），**不得新增顶层函数**（现 10 个，已达上限） |
| 改动 4 | `views/scan-payload.js`：公共项载荷收集复用 `collectCheckoutPayload`（`:28-41`） |
| 改动 5 | `frontend/css/module.css`：队列 chips / 公共设置区 / 结果面板样式（禁写 `app.css`） |
| 改动 6 | `tools/bundle-sources.json`：登记 `views/scan-batch.js`（位置在 `views/scan.js` 之前） |
| 重建 | 必须重建 bundle + 更新 `subsystems/samples/frontend/index.html` 的 `?v=`；构建脚本会刷新 5 个 `index.html`，需**回退 4 个非目标文件** |
| 验收 | 设计文档 §8.1 的 B1、B2、B5；异常矩阵逐条走查（设计 §4.4） |
| 提交 | `feat(samples): 扫码台批量领用/归还（连扫入队 + 公共设置 + 结果面板）` |

### T5（需求 1 前端，可并入 T4 提交）失败重试与导出失败清单

| 项 | 内容 |
|---|---|
| 改动 | `views/scan-batch.js`：失败项单独重试、复制失败编号、导出失败清单 CSV（复用 `shared/csv.js` 约定）、「清空并开始新一批」显式动作 |
| 验收 | 重试复用同一 `batchId`（不重复执行成功项）；命中 `BATCH_DUPLICATE` 后已生效件标「已生效」，其余件换**新 `batchId`** 重交且零重复执行 |
| 提交 | `feat(samples): 批量结果面板失败重试与清单导出` |

### T6 回归、文档同步与容量报告

| 项 | 内容 |
|---|---|
| 测试 | 目标用例 + 全量 `npx jest`（须打印完整 `Tests:` 摘要才算通过；若未打印 = 编码表致命错误回归） |
| 双系统回归 | 样品与治具列表列宽拖拽、详情弹窗、`.b-overdue` 徽章样式（共享类 `public/css/app.css:85`） |
| 文档 | `docs/样品系统操作说明.md`、`docs/operation-manual.md` 增补「批量领用/归还」与「复检不适用口径」；新建 `docs/RELEASE-v2.1.0.md`；`README.md` 相关段（如需） |
| 授权项 | `AGENTS.md §14` / `CLAUDE.md §6` 容量台账更新**需用户明确授权**后才改 |
| 输出 | 文件臃肿检测报告（容量/元素/冗余三项）+ 全链路依赖清单回执 |

### T7 部署与监控（运维执行重启）

| 项 | 内容 |
|---|---|
| 部署 | 推送 GitHub → 服务器 `git pull` → **运维在宝塔面板重启**（因新增后端路由文件必须重启加载）→ 前端硬刷新（bundle `?v=` 已变） |
| AI 禁令 | **AI 不得重启/停服/改启动脚本**；只提交《重启申请》 |
| 回滚 | `git revert <本次提交>` → 同步重启（同样走运维）；前端为纯新增/展示改动，无数据迁移，回滚零数据处理 |
| 监控 | 1~3 个业务周期观测：批量 409 发生率、部分失败率、`scan_logs` note 解析（领用人候选排序是否正常）、复检徽章与看板 overdue/dueSoon 计数对账、导出与列表一致性 |

---

## 2. 实施顺序

```
批次一（需求 2，可独立发布）：T1 → T2 → T6(部分) → 发布
批次二（需求 1）：T0 → T3 → T4 → T5 → T6 → 发布
```

> 2026-09-16 用户确认（Q7）：按上述两批划分发布，两批各自独立上线与回滚。

- T0 必须先于 T4（容量红线），且**独立提交**便于单独回滚；
- T1/T2 同批（前后端同口径必须同时上线，否则出现「列表不适用、导出逾期」的新漂移）；
- T3 可先于 T4（后端就绪后前端才可联调），但**同批发布**；
- 每个任务一个 commit（Conventional Commits），一任务一审查。

---

## 3. 测试与回归清单

| 面 | 点位 |
|---|---|
| 单测 | `tests/inspect-state.test.js`（改）、样本导出单测、批量接口新单测；既有 `tests/samples-checkout*.test.js`、`samples-picker-timing.test.js`、`detail-modal-shared.test.js`、`samples-report.test.js`（bundle 版本号与文件计数断言）、`samples-storage-map.test.js` 全绿 |
| 接口 | `POST /api/scan`、`GET /api/resolve`（零行为变化）、`POST /api/samples/batch-resolve`、`POST /api/samples/batch-action`、`GET /api/samples`、`GET /api/samples/export` |
| 页面 | 扫码台（单件 8 动作 + 批量模式）、列表（复检状态列、逾期视图到期列、列宽拖拽、分页、快捷筛选）、详情弹窗复检行、看板待办表、工作台（只读） |
| 共享文件 | 本次不改 `shared/`；仍需双系统只读回归列表列宽与徽章样式 |
| 数据合规 | 生产库只读验证；写库类验证仅在 `sample_mgmt_test` |

---

## 4. 部署与回滚

| 步骤 | 命令/动作 |
|---|---|
| 重建 bundle | `rm -f /tmp/bundle-*.js && node tools/build-bundles.js` → 复制 samples bundle → 更新 `index.html? v=` → 回退 4 个非目标 `index.html` |
| 推送 | `git push`（用户明确要求时；`sudo -u www` 视环境） |
| 服务器 | `git pull` → 提交《重启申请》→ 运维面板重启 |
| 只读验收 | `/health`、登录、`/api/subsystems`、`/api/samples?limit=1`、`/api/samples/storage-map`、`/api/dashboard`、`/api/fixtures?limit=1`、`/api/fixtures/dashboard` 全 200 |
| 回滚 | `git revert` + 重启；前端改动回滚零数据影响 |

---

## 5. 提交前自检清单（§16）

- [ ] 全链路依赖已排查（5 维度：代码 / SQL / 配置 / 接口 / 文档）
- [ ] 关联文件已同步修改（含 `bundle-sources.json`、`index.html` 版本号、`.bundle-ver`）
- [ ] 文件臃肿检测报告已输出（容量 / 元素数量 / 冗余）
- [ ] 回归验证步骤已列出并通过
- [ ] 子系统隔离已验证（双系统只读回归）
- [ ] 兼容性影响已说明（409 只加字段；`api()` 默认行为不变；`inspectState` 既有断言不破；单件 `note` 不带 `batchId` 后缀、逐字节不变）
- [ ] 部署 / 回滚步骤已提供
- [ ] 上线监控提示已给出（1~3 周期）
- [ ] 文档已同步（操作说明 + 发布说明；规则文件改动另需授权）

---

## 6. 明确不做

1. 不做单事务整批回滚；2. 不清 `next_inspect_at`/`valid_until`；3. 不做存量数据订正；
4. 不统一后端 SQL 逾期口径；5. 不做列表多选批量（二期）；6. 不放开批量到图片类动作；
7. 不新增 `scan_logs` 列/表（`batchId` 记在 `note` 尾部，列化留待观察）；8. 不改状态机与共享层；9. 不改规则文件（未授权时）；
10. AI 不执行任何重启/停服。

---

## 7. 实施记录（批次一 T1 / T2，2026-09-16）

| 项 | 实测 |
|---|---|
| 变更文件（容量为 AGENTS §7.1 权威口径 LF 归一字符数） | `views/list-inspect.js` 26→**71 行 / 3,085 字符（15.4%）**；`views/list-render.js` 94→96 / 5,734（28.7%）；`views/detail.js` 14,071→**14,342（71.7%）**；`backend/routes-samples.js` 353→**344 / 17,528（87.6%，净减 312）**；**新增** `backend/inspect-state-cn.js` 28 / 1,233（6.2%）；`frontend/js/bundle.js` 重建（`?v=bmu4aj9bb`）；`frontend/index.html` 3 处版本号 |
| 测试文件 | `tests/inspect-state.test.js` 79→165 行；**新增** `tests/inspect-state-cn.test.js` 66 行 |
| 验收 | 本地等价验收脚本 **35/35 PASS**（C1/C2/C3/C5 + 既有断言 + 三处接线检查）；`npx jest` 全量须在服务器执行（本地镜像无 `node_modules`） |
| 口径定稿 | 方案 A（2026-09-16 用户确认，已写入设计 §6.1 决策行）：`CHECKED_OUT` → 灰字「领用中·暂停复检」；`RELEASED` → 保留三态文字但灰化不出红；两者**均不进**「不适用」集合 |
| 踩坑留档 | `pwsh Get-Content -Raw` + `Set-Content -Encoding utf8` 往返会把 `index.html` 中文写成乱码并加 BOM（实测 48 行全变）——已 `git restore` 该文件后改用 node 以 UTF-8 安全替换，diff 收敛为 3 行版本号。**今后 HTML/中文文本一律用 node 或 `edit` 工具改，禁止 pwsh 文本往返** |
| 未做 | 未改 `db/dao-list.js` 的 SQL（看板 overdue/dueSoon、机型墙计数零变化 = C4）；未改 `scan-actions.js`；未改规则文件容量台账（T6 标注需授权） |
| 待办 | 服务器 `git pull` → 运维面板重启（后端新增 require 文件必须重启才生效）→ 只读验收 + 双系统 `.b-overdue` 回归（C7） |

### 线上验收结果（2026-09-16 23:5x 推送拉取 + 2026-09-17 01:00 运维重启后，全程只读）

| 项 | 实测 |
|---|---|
| 服务 | `ss -ltnp \| grep :4000` → PID **2317087**，属主 `www`，`node /www/wwwroot/sample-mgmt/server.js`，启动 `Thu Sep 17 01:00:02 2026`；`/health` **200** `{status:ok, db:connected}`；版本 **2.0.9** |
| 服务器版本 | `git log` = `85d4986`（与本地/远端一致），18 files / +1456−576，工作树干净 |
| 目标用例 | **2 suites / 25 tests 全绿**（含 `Tests:` 完整摘要） |
| 全量用例 | `1 failed, 7 skipped, 38 passed`；`4 failed, 10 skipped, 523 passed, 537 total`；`Encoding not recognized` **0**；失败仅 `tests/users.test.js` 4 条 `Lock wait timeout exceeded`（环境性，与修复前基线一致） |
| C5 导出（真实数据） | `RETIRED` 26 行 → 「不适用」26/26；`CHECKED_OUT` 53 行 → 「领用中·暂停复检」53/53；`IN_CUSTODY` 45 行 → 「正常」45/45；列序 状态@6 / 复检状态@7 / 复检到期@17 **未变** |
| C1/C2 页面渲染（用线上 `list-inspect.js` + 线上列表 JSON 实渲染） | `RETIRED` 26 → 「不适用」26/26、红徽章 **0**；`CHECKED_OUT` 53 → 「领用中·暂停复检」53/53、红徽章 **0**；`IN_CUSTODY` 45 → 「正常」45/45 |
| 存量口径澄清 | 26 件 `RETIRED` + 53 件 `CHECKED_OUT` 的 `next_inspect_at` **全为未来日期** ⇒ 修复前显示**绿色「正常」**（C1 的真实失效点），非红脉冲（详见设计 §6.2 校正） |
| C4 看板计数 | `/api/dashboard` 200：`{NEW:2, IN_CUSTODY:45, CHECKED_OUT:53, RETIRED:26, total:126}`，`overdue:[]`、`dueSoon:[]`；SQL 未改（`git diff` 无 `dao-list.js`） |
| C7 双系统回归 | `/api/fixtures?limit=1` 200、`/api/fixtures/dashboard` 200；共享 `public/css/app.css` 与 `shared/` **零改动**，`.b-overdue` 定义未动 |
| 前端资源 | 线上 `index.html` → `bundle.js?v=bmu4aj9bb`；线上 bundle 含 `INSPECT_NA_STATUSES`（grep 命中 2 处） |
| 监控基线（1~3 周期对账用） | total 126 / IN_CUSTODY 45 / CHECKED_OUT 53 / RETIRED 26 / NEW 2 / overdue 0 / dueSoon 0 |
| 过程事故（已处置） | ① 本地 `pwsh` 文本往返曾把 `index.html` 写成乱码，已 `git restore` 后改用 node 修复（见上表踩坑行）；② 以 root 跑 jest 产生 11 个 root 属主文件（当日日志 + 上传测试件），已 `chown www:www` 复原，复核剩余 0；③ 验收前一度发现 4000 端口无监听（PID 文件不存在），经只读排查确认非本次代码所致（`node --check` 与模块 require 均通过，且新代码曾在 2243874 实例上 `/health` 200），已由运维面板重启恢复 |

---

## 8. 实施记录（批次二 T0 / T3 / T4 / T5 / T6，2026-09-17）

### 8.1 提交链（每个 Task 一个 commit，均已 push）

| 提交 | Task | 说明 |
|---|---|---|
| `8a77ea1` | T0 | `refactor(samples)`：动作表单构造外迁 `scan-forms.js`（行为零变化、独立提交便于单独回滚） |
| `e9726eb` | T4 | `feat(samples)`：批量领用/归还（连扫入队 + 公共设置 + 结果面板） |
| `1fc79d2` | T4 | `test`：修正前端契约断言计数（`_sbMode` 两处分流 / `api.js` 声明数口径） |
| `6b2279d` | T0 | `test`：三处既有扫码台护栏改为「`scan.js` + `scan-forms.js` 合并视图」 |
| `a796d11` | T4 | `test`：修正 `scan.js` 容量断言阈值（T4 挂钩后 53.2%） |
| `0599290` | T5 | `feat(samples)`：失败重试与失败清单 CSV 导出 |
| `dc01306` | T6 | `docs`：使用人员版 + 总操作说明书增补 |
| `60024a0` | T6 | `chore(release)`：v2.1.0 版本号 6 处统一 + `RELEASE-v2.1.0.md` |
| `6671794` | T6 | `docs(release)`：回填幂等探测成本基线 |

> T3（后端批量通道）已在 `f28397d` / `349141f` 完成（见前次记录）。

### 8.2 容量（AGENTS §7.1 权威口径 = LF 归一字符数）

| 文件 | 行 | 字符 | 占比 | 顶层函数 | 判定 |
|---|---|---|---|---|---|
| `backend/batch-scan.js`（新增） | 178 | 9,955 | 49.8% | 8 | 合规 |
| `backend/scan-allowed.js`（新增） | 29 | 1,480 | 7.4% | — | 合规 |
| `backend/routes-scan.js` | 82 | 3,968 | 19.8% | — | 合规（原 98/4,694/23.5%） |
| `backend/index.js` | 50 | 1,601 | 8.0% | — | 合规 |
| `db/dao.js` | 174 | 10,441 | 52.2% | — | 合规 |
| `views/scan-batch.js`（新增） | 238 | 12,708 | 63.5% | 10 | 合规（顶层函数**恰达** §7.2 上限，后续不可再加） |
| `views/scan-batch-result.js`（新增） | 107 | 6,801 | 34.0% | 5 | 合规 |
| `views/scan-forms.js`（新增，T0） | 83 | 7,832 | 39.2% | 1 | 合规 |
| `views/scan.js` | 182 | 10,648 | 53.2% | 5 | 合规（T0 前 244/17,109/**85.5%**） |
| `js/api.js` | 67 | 3,407 | 17.0% | 10 | 合规（顶层函数 10，已达上限） |
| `css/batch.css`（新增） | 40 | 2,400 | 12.0% | — | 合规 |
| `css/module.css` | 181 | 12,608 | 63.0% | — | 合规（加入 `.sb-*` 曾达 72.2%，故拆出） |

### 8.3 测试

| 文件 | 行 | 字符 | 类型 |
|---|---|---|---|
| `tests/samples-batch-scan.test.js` | 120 | 5,798 | 纯函数 + 源文件契约 |
| `tests/samples-batch-scan-e2e.test.js` | 251 | 12,105 | DB 真跑（独立测试库 + 守卫跳过） |
| `tests/samples-batch-frontend.test.js` | 442 | 20,923 | 假 DOM `vm` 真跑 + 源文件契约（单元测试豁免 ≤1000 行） |

批次二 3 套件 = **39 用例全绿**；全量 = `1 failed, 7 skipped, 41 passed` / `4 failed, 10 skipped, 562 passed, 576 total`；`Encoding not recognized` **0**。

### 8.4 两处对计划文本的偏离（兼容优先）

| 计划原文 | 实际做法 | 原因 |
|---|---|---|
| T4 改动 2：「改造既有『连续扫码』开关语义为批量模式」 | 新增**独立开关** `#sb-mode-btn`，不改 `#scan-cont` | `#scan-cont` 同时驱动标示卡打印队列累积（`views/scan-camera.js` 的 `enqueuePrintCard`），改造会静默改变单件路径行为（§6 兼容优先） |
| 样式写入 `module.css` | 新建 `css/batch.css` | 写入后 `module.css` 达 **72.2%**，越 §7.1 的 70% 线；沿用 2026-09-15 `report.css` 先例。仍是子系统自有 CSS，未写共享 `app.css`（§18 禁令） |

### 8.5 全链路排查遗漏（已补齐，重要留档）

T0 把动作表单构造外迁到 `scan-forms.js` 后，**三个既有前端护栏**因从 `scan.js` 单文件读取标记而失败：

- `tests/samples-scan-payload-split.test.js`（4 个载荷函数调用点）
- `tests/samples-checkout-users.test.js`（领用人候选面板容器 / 失焦收起 / fixed 定位）
- `tests/samples-storage-loc-picker.test.js`（CUSTODY/EDIT_STORAGE 两处储位表单 / 柜位图按钮 / 防误确认）

**修法**：改为读取「扫码台两文件合并视图」，断言逐条不变——护栏强度不降反增。**教训**：外迁代码时必须跑该文件对应的既有护栏，不能只看目标套件。

### 8.6 幂等探测成本基线（部署前只读实测）

`scan_logs` **747 行** / 数据 112 KB / 索引 16 KB；索引仅 `PRIMARY(id)`、`idx_logs_sample(sample_id)`，`note` **无索引**。探测 SQL 100 次批量法扣除客户端基线后 **约 0.4~0.6 ms/次**；`EXPLAIN` = `type=ALL`、`rows=723`、`Using where`（前导通配全表扫描，符合设计预期）。后续优化触发阈值：`scan_logs` 超 10 万行，或 `probeMs` 持续 > 50 ms。

### 8.7 共享面与双系统回归

`git diff --stat 349141f HEAD -- shared/ public/css/app.css server.js db.js public/portal.html public/js/` **输出为空** ⇒ 共享面零变更。`.b-overdue` 仍在 `public/css/app.css:85` / `:197`；治具入口 `200`（2776 B）、治具 `bundle.js` `200`（119,866 B）、样品入口 `200`（3036 B）。

### 8.8 待办（T7 发布）

服务器已 `git pull` 到 `6671794`，工作树干净，版本号 6 处均为 **2.1.0**；服务 **未中断**（PID 2317087，`www` 属主，已运行 2:07:44）。因新增后端路由文件**不热挂载**（§17），`POST /api/samples/batch-resolve` 当前返回 **404**（正常），**待运维在宝塔面板重启后生效**（见《重启申请》）。规则文件 `AGENTS.md §13/§14`、`CLAUDE.md §6·§11` 容量台账更新**待用户授权**。

### 8.9 与本次变更无关的既有失败（不影响验收）

`tests/users.test.js` 4 例失败（`POST /api/users/batch` ×3 + `POST /api/users/import` ×1）。**已排除本次变更嫌疑**：① 批次二提交区间 `349141f..HEAD` 未触碰 `routes/`、`db/`、`shared/`、`server.js`、`tests/helpers/`、`tests/users*`；② 单独运行 `tests/users.test.js`（无并行竞争）**同样失败**，表现为 `Lock wait timeout exceeded` 与 30s 测试超时；③ `GET_LOCK('sample_mgmt_ddl')` 返回 `NULL`（DDL 命名锁未被占用）；④ 与批次一基线**同项同因**。建议列为独立排查项。
