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

| 项 | 内容 |
|---|---|
| 改动 1 | `subsystems/samples/frontend/js/views/list-inspect.js`：新增适用集合常量；`inspectState` 增加守卫「`s.status` 存在且在**不适用集合**（`RETIRED`/`RETURNING`/`NEW`/`PRODUCED`）→ `'na'`」，顺序在 `!s.next_inspect_at` 判定之前；`inspectBadge` 增加 `na` 分支 → 灰字「不适用」+ 按状态给 `title`（作废原因取 `s.retired_reason`）；「无计划」保持「—」+ 新增 `title="未设置复检计划"` |
| 改动 2 | `views/list-render.js:34-37`：「复检到期」列在 `na` 状态输出灰字「不适用」 |
| 改动 3 | `views/detail.js:132-133`：复检行改为按 `inspectState(s)` 分支——`na` → 「复检 不适用（已作废/退回审核中/领用中/未发行）」，其余保持现状 |
| 兼容红线 | 守卫必须写成「**status 存在**且不适用 → `na`」，不得改变 `inspectState()`/`inspectState({})` 的 `none` 行为（`tests/inspect-state.test.js:19-25`、`:53-56` 必须保持绿） |
| 测试 | `tests/inspect-state.test.js` 增用例：`RETIRED` + 未来日期 → `'na'`；`RETIRED` + 无日期 → `'na'`；`RETURNING`/`NEW`/`PRODUCED` → `'na'`；`inspectBadge` 对 `na` 含「不适用」且**不含** `b-overdue`/`b-inspect-ok` |
| 重建 | 必须重建 bundle + 更新 `subsystems/samples/frontend/index.html` 的 `?v=` |
| 验收 | 设计文档 §8.2 的 C1~C3、C6、C7 |
| 提交 | `fix(samples): 复检状态按状态判定适用性，作废/退回中样品不再显示“正常”` |

### T2（需求 2 后端）导出口径同源 + 容量合规

| 项 | 内容 |
|---|---|
| 改动 1 | 新建 `subsystems/samples/backend/inspect-state-cn.js`：导出适用集合常量 + `inspectStateCn(row)`（含 `na` → 「不适用」分支） |
| 改动 2 | `backend/routes-samples.js:78-85` 删除本地 `inspectStateCn`，改为 require 引用新文件（`:117` 的列定义调用点不变）→ 文件字符数**净减**（89.2% → ≈88%） |
| 不做 | 不动 `db/dao-list.js` 的 SQL 过滤（逾期/近 7 天/机型墙计数口径零变化） |
| 测试 | 新增/补充导出单测：`RETIRED` 行导出「不适用」；`IN_CUSTODY` 三态文本不变；CSV 列顺序不变 |
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
