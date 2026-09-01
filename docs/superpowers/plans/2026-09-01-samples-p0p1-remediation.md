# 实现计划：样品子系统 P0/P1 缺陷修复（含打印流程）

> 关联 spec：[2026-09-01-samples-p0p1-remediation-design.md](../specs/2026-09-01-samples-p0p1-remediation-design.md)
> 覆盖子系统：`samples`（共享层联动：`db/migrations.js`、`db/users.js`、`shared/state-machine.js`）
> 执行方式：Subagent 驱动，Task 间审查
> 关键约束：
> - **`samples` 已上线（`deployed:true`）**：禁止注入测试数据、禁止跑写入类测试（`tests/helpers/deployed.js` 护栏）；写入验证一律用独立测试库（`DB_NAME=sample_mgmt_test`）
> - **禁止重启**（§23）：服务启停只走宝塔面板运维；本计划不含任何重启步骤，部署以《重启申请》收尾
> - 所有 ALTER 幂等；API 既有出入参语义不变；每 Task 一个 commit（§8.2）

---

## 任务总览（21 个 Task）

### 批次 1（P0 包，T1~T10）

| # | 任务 | 主要文件 | 要点 |
|---|---|---|---|
| T1 | 迁移：samples 加 `version` 列 | `db/migrations.js` | 幂等 ALTER，乐观锁底座 |
| T2 | DAO：updateSample 改 CAS | `subsystems/samples/db/dao.js` | `WHERE id=? AND version=?`，冲突抛 CONFLICT |
| T3 | 扫码后端：INSPECT_CUSTODY + 字段清理 + 周期/版次规则 + 照片时间戳 | `subsystems/samples/backend/routes-scan.js` | P0-1 主体 + P1-4 + P-H3 |
| T4 | manifest：声明 INSPECT_CUSTODY | `subsystems/samples/manifest.json` | transitions 新增 1 条 |
| T5 | PUT 样品走 CAS | `subsystems/samples/backend/routes-samples.js` | 编辑并发防护 |
| T6 | 前端：withSubmitLock + 409 处理 + 请求序号 | `shared/frontend/api-base.js` 或 samples `js/api.js`（T6 评审定）、`views/scan.js`、`views/new.js` | 防重 + 加载态统一 |
| T7 | 前端：向导一致性 + XSS 修复 | `views/scan-wizard.js`、`views/scan.js`、`views/list-filter.js`、`views/models.js` | P0-3 |
| T8 | 前端：复检表单 + 重打按钮 | `views/scan.js`、`views/scan-wizard.js` | QA 扫 IN_CUSTODY 显示表单；成功提示条常驻「重新打印」 |
| T9 | bundle 重建 + 版本号 | `tools/build-bundles.js`、`bundle.js`、`index.html` | §19 强制 |
| T10 | 批次 1 回归 + 文档同步 + 臃肿报告 | README、operation-manual §5.4 | 验证清单 §16 全项 |

### 批次 2（P1 包，T11~T21）

| # | 任务 | 主要文件 | 要点 |
|---|---|---|---|
| T11 | 迁移：samples 加 `deleted_at` 列 | `db/migrations.js` | 幂等 ALTER |
| T12 | 指派校验 + ADMIN 兜底转移 | `routes-scan.js`、`db/users.js`、`manifest.json` | listActiveRdUsers（不改原函数）+ FORCE_REASSIGN/FORCE_RETIRE |
| T13 | 软删除全链路 | `db/dao.js`、`routes-samples.js`、`db/sample-code.js`、`card-page.js`、workbench 聚合 SQL | 全部查询补 deleted_at 过滤 |
| T14 | 照片历史 + 魔数校验 | `routes-scan.js`、`routes-samples.js`、`views/detail.js` | 大图 Tab 历史列表 |
| T15 | EDIT_CARD 版次防篡改 | `routes-scan.js` | `^\d{1,2}$` + ≥当前 + ≤99 + 日志 |
| T16 | 状态机唯一真相源 | `shared/state-machine.js`、`routes-scan.js`、`manifest.json` | allowedActions 从 manifest 派生 |
| T17 | 批量打印接口 | `routes-cards.js`、`card-print-html.js` | `GET /api/samples/cards/print?ids=`，≤50 |
| T18 | 打印触发重构（前端） | `views/scan-camera.js`、`views/new.js`、`views/print-queue.js` | 占位页模式 + 队列去重/持久化/恢复 |
| T19 | 打印显示一致性 | `card-print-html.js`、`card-page.js`、`views/detail.js`、`card-html.js` | 有效期口径/匿名卡脱敏/mm 直出 |
| T20 | bundle 重建 + 版本号 | 同 T9 | §19 强制 |
| T21 | 批次 2 回归 + 文档同步 + 技术债更新 | README、label-card-standard、sample-code-encoding §3、AGENTS.md §14 | 含跨子系统回归 |

---

## 核心代码底座

**状态机新增转移（manifest.json，批次 1 + 批次 2 合计 3 条）**：
```
IN_CUSTODY →(INSPECT_CUSTODY, QA)→ IN_CUSTODY      // 到期复检（批次1）
RETURNING  →(FORCE_REASSIGN, ADMIN)→ RETURNING      // 强制改派（批次2）
RETURNING  →(FORCE_RETIRE, ADMIN)→ RETIRED          // 强制作废（批次2）
```

**schema 变更（仅新增列，幂等，无需回填）**：
```sql
ALTER TABLE samples ADD COLUMN version INT NOT NULL DEFAULT 1;            -- T1
ALTER TABLE samples ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL;    -- T11
```

**复检窗口常量**：`INSPECT_EARLY_DAYS = 7`（到期前 7 天起可复检），定义于 `routes-scan.js` 顶部并注释口径。

**周期规则**：合法范围 1~3650 天；非法输入 → 400；前端表单默认沿用 `release_cycle_days`，不再静默兜底 90 天。

---

# 批次 1（P0 包）

## T1 · 迁移：samples 加 version 列

### Files
- `db/migrations.js`

### Steps
1.1 新增 `migrateSamplesOptimisticLock(pool)`：
```js
// 样品乐观锁底座：version 列（2026-09-01，幂等）
try { await pool.execute('ALTER TABLE samples ADD COLUMN version INT NOT NULL DEFAULT 1'); }
catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
```
1.2 注册进 `runMigrations`（位于既有 samples 迁移之后，保持注册顺序注释）。

### 验证
- 独立测试库执行 `node -e "require('dotenv').config(); ...runMigrations"` 两次，第二次不报错（幂等）
- `SHOW COLUMNS FROM samples LIKE 'version'` → 存在，存量行全为 1

### Commit
`feat(samples): add version column for optimistic locking`

---

## T2 · DAO：updateSample 改 CAS

### Files
- `subsystems/samples/db/dao.js`

### Steps
2.1 `updateSample(id, fields)` 签名扩展为 `updateSample(id, fields, expectedVersion)`：
```js
// expectedVersion 传入时启用乐观锁：UPDATE ... SET ..., version=version+1
// WHERE id=? AND version=?；affectedRows=0 → 抛 {code:'CONFLICT'}
// 未传入时保持旧行为（向后兼容，供非状态机写路径过渡使用）
```
2.2 新增 `getSampleVersion(id)` 或在现有 get 查询中确保 `SELECT` 含 `version`（检查 `SELECT *` 已覆盖则免改）。
2.3 `deleteSample` 本批次不动（软删除在 T13）。

### 验证
- 单测（独立测试库）：同 id 两次带相同 expectedVersion 更新 → 第二次抛 CONFLICT
- 不传 expectedVersion 的旧调用方行为不变

### Commit
`feat(samples): optimistic-lock CAS in updateSample`

---

## T3 · 扫码后端：INSPECT_CUSTODY + 字段清理 + 周期/版次规则 + 照片时间戳

### Files
- `subsystems/samples/backend/routes-scan.js`

### Steps
3.1 `allowedActions` 增加 QA + IN_CUSTODY 分支：当样品处于复检窗口（`next_inspect_at - 7天 ≤ now`，含已逾期）时返回 `INSPECT_CUSTODY`。
3.2 新增 `INSPECT_CUSTODY` 处理器（复用 INSPECT 主体逻辑，差异点）：
- 允许状态 `IN_CUSTODY`；照片文件名 `{sample_no}_insp_{YYYYMMDD-HHmmss}.{ext}`（时间戳化，杜绝同名覆盖）
- 周期：`Number(cycleDays)` 非 1~3650 正整数 → 400 `复检周期须为 1~3650 天的整数`；缺省沿用 `s.release_cycle_days`（仍为空才允许 400 提示必填，**删除 `|| 90` 静默兜底**）
- 版次：`updated.card_version = nextCardVersion(s.card_version)`（自动 +1，上限 99）
- `next_inspect_at`/`valid_until` = NOW + cycle
- 同事务 addLog（旧/新版次、周期、结论）
3.3 `printCard` 判定扩展：`RELEASE || RE_RELEASE || EDIT_CARD || INSPECT || INSPECT_CUSTODY`。
3.4 字段清理（P1-4）：
- `RE_RELEASE`：`custody_dept=NULL, storage_location=NULL` 加入 updated
- `RETIRE_ONLY`：`retire_assigned_rd=NULL`
- `RETURN_REJECT`：`next_inspect_at` 顺延审核消耗天数（`RETURN_REQUEST` 日志时间至现在的整天数）
3.5 所有 action 处理器调用 `updateSample(..., s.version)`（接 T2），catch CONFLICT → `409 {error:'该样品刚被他人操作，请刷新后重试'}`。

### 验证
- 独立测试库走 NEW→PRODUCED→RELEASED→IN_CUSTODY→INSPECT_CUSTODY 全链
- 并发双扫同一 IN_CUSTODY 样品 → 一方 409
- RE_RELEASE 后详情不再显示旧储位；RETURN_REJECT 后未立即逾期

### Commit
`feat(samples): custody inspection path + CAS + field cleanup`

---

## T4 · manifest：声明 INSPECT_CUSTODY

### Files
- `subsystems/samples/manifest.json`

### Steps
4.1 `stateMachine.transitions` 追加：
```json
{ "from": "IN_CUSTODY", "to": "IN_CUSTODY", "action": "INSPECT_CUSTODY", "role": ["QA"], "label": "到期复检" }
```
4.2 同步补声明既有但未声明的自环 action（`EDIT_CARD`、`EDIT_STORAGE`，为 T16 真相源统一铺路——本批次仅声明，不切换派生逻辑）。

### 验证
- `node -e "JSON.parse(...)"` 校验 JSON 合法
- 管理面板子系统详情页可正常读取 manifest（只读 GET `/api/subsystems/samples`）

### Commit
`feat(samples): declare INSPECT_CUSTODY transition in manifest`

---

## T5 · PUT 样品走 CAS

### Files
- `subsystems/samples/backend/routes-samples.js`

### Steps
5.1 PUT `/api/samples/:id`：请求体接受可选 `version`；传入时走 `updateSample(..., version)`，409 语义同 T3。
5.2 保留旧参数兼容：不传 version 时按旧行为（§11 出入参兼容规则）。

### 验证
- 前端编辑并发场景模拟：两个会话先后保存 → 后到者 409（前端 T6 配合携带 version）

### Commit
`feat(samples): optimistic lock on sample PUT`

---

## T6 · 前端：withSubmitLock + 409 处理 + 请求序号

### Files
- `subsystems/samples/frontend/js/api.js`（helper 落点；若评审认为应共享则 `shared/frontend/shared/utils.js`，仅 samples 引用先行）
- `subsystems/samples/frontend/js/views/scan.js`、`views/new.js`、`views/detail.js`

### Steps
6.1 新增 `withSubmitLock(btn, fn)`：执行期禁用按钮 + 加 `.loading`；finally 释放。
6.2 `api()` 包装：统一捕获 409 → toast「数据已被他人修改，已为您刷新」+ 触发当前视图刷新；401 → 跳登录页。
6.3 列表/看板请求序号：`_listReqSeq` 自增，仅最后响应生效（防乱序覆盖）。
6.4 替换 `new.js` 的 `_nSubmitting` 为统一 helper；`confirmScan` 套 helper。

### 验证
- 手工：连点提交按钮仅发一次请求；devtools 乱序响应不被旧响应覆盖

### Commit
`feat(samples): unified submit lock and 409 handling`

---

## T7 · 前端：向导一致性 + XSS 修复

### Files
- `subsystems/samples/frontend/js/views/scan-wizard.js`、`views/scan.js`、`views/list-filter.js`、`views/models.js`

### Steps
7.1 Step3 编号输入框 `readonly`；`confirmScan` 的 `code` 取 `wizardSample.sample_no`；提交前兜底比对输入框值，不一致 → 报错中止。
7.2 `list-filter.js:54-55`：`st`/`dept` 统一 `e()` 转义。
7.3 `models.js`：`m.code` 拼接 onclick 处转义。

### 验证
- hash 注入 `#/samples?status=<img onerror=alert(1)>` → 页面显示转义文本无弹窗
- Step3 中扫码枪误扫 → 提交被拦截并提示

### Commit
`fix(samples): wizard code consistency and chips XSS escaping`

---

## T8 · 前端：复检表单 + 重打按钮

### Files
- `subsystems/samples/frontend/js/views/scan.js`、`views/scan-wizard.js`

### Steps
8.1 QA 扫 IN_CUSTODY 且 action=INSPECT_CUSTODY：显示复检表单（照片上传 + 周期输入框默认沿用 + 复检结论备注）。
8.2 扫码成功提示条增加常驻「🖨 重新打印标示卡」按钮（`card/print` 链接，用户手势内触发——兼作弹窗拦截兜底，批次 2 T18 做根治）。

### 验证
- 表单周期非法 → 400 提示；留空 → 沿用原周期
- 提示条按钮可打开打印页

### Commit
`feat(samples): custody inspection form and reprint button`

---

## T9 · bundle 重建 + 版本号（批次 1）

### Files
- `tools/build-bundles.js`（执行）、`subsystems/samples/frontend/js/bundle.js`、`subsystems/samples/frontend/index.html`

### Steps
9.1 `node tools/build-bundles.js` → `sudo cp /tmp/bundle-samples.js subsystems/samples/frontend/js/bundle.js`
9.2 index.html 版本号更新为 `tools/.bundle-ver` 新值（§19）。

### 验证
- 浏览器强刷后 Network 中 bundle 版本号为新值；扫码台/列表/详情功能正常

### Commit
`chore(samples): rebuild bundle (batch 1)`

---

## T10 · 批次 1 回归 + 文档同步 + 臃肿报告

### Steps
10.1 回归清单：扫码台全动作、列表筛选/分页、详情四 Tab、看板计数、打印入口；fixtures/workbench/portal 冒烟（manifest 变更属子系统内，但 badge 由框架派生需目检）。
10.2 文档：README 扫码台表格补 INSPECT_CUSTODY 行 + 状态机图；operation-manual §5.4（版次自动 +1、周期可改）；AGENTS.md §14 技术债相应条目更新。
10.3 输出文件臃肿检测报告（§9）。

### Commit
`docs(samples): sync custody inspection docs`

---

# 批次 2（P1 包）

## T11 · 迁移：samples 加 deleted_at 列

### Files
- `db/migrations.js`

### Steps
11.1 `migrateSamplesSoftDelete(pool)`：幂等 `ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`，注册。

### 验证
- 幂等执行两次；存量行全 NULL

### Commit
`feat(samples): add deleted_at for soft delete`

---

## T12 · 指派校验 + ADMIN 兜底

### Files
- `subsystems/samples/backend/routes-scan.js`、`db/users.js`、`subsystems/samples/manifest.json`、前端 `views/scan.js`（二次确认弹窗）

### Steps
12.1 `RETIRE_RECREATE`：`getUserById(assignedRd)` 校验存在 + `role='RD'` + `enabled=1`，否则 400。
12.2 `db/users.js`：新增 `listActiveRdUsers()`（`WHERE role='RD' AND enabled=1`）；先全局 grep `listRdUsers` 调用方，仅 samples 指派处切换为新函数（原函数保留）。
12.3 manifest 追加 FORCE_REASSIGN / FORCE_RETIRE（ADMIN）两条转移；`allowedActions` 增加 ADMIN + RETURNING 分支。
12.4 前端：ADMIN 执行时二次确认弹窗（modal.js 确认模式）。
12.5 RETURNING 停留 > 3 天进 QA/ADMIN 待办（dao 待办查询补条件，口径注释）。

### 验证
- 指派已禁用账号 → 400；ADMIN 强制改派后新 RD 可见待办并可 RECREATE

### Commit
`feat(samples): assignee validation and admin fallback actions`

---

## T13 · 软删除全链路

### Files
- `subsystems/samples/db/dao.js`、`backend/routes-samples.js`、`backend/card-page.js`、`db/sample-code.js`、`subsystems/workbench/backend/`（聚合 SQL）

### Steps
13.1 `deleteSample` → `UPDATE samples SET deleted_at=UTC_TIMESTAMP(), version=version+1 WHERE id=?`，**删除 scan_logs 物理删除语句**；事务包裹。
13.2 **全链路排查（§12 强制）**：dao.js 全部 list/get/overdue/todo/export 查询、workbench 聚合 samples 的 SQL、`/card/:sample_no`——统一补 `deleted_at IS NULL`。
13.3 匿名卡对已删除样品返回统一 404（不区分不存在/已删除）。
13.4 `sample-code.js`：取号不再复用已分配编号（含软删）；空档接受。
13.5 全局 grep `FROM samples` / `JOIN samples` 确认无遗漏查询点（含 tests/、seed 只读路径）。

### 验证
- 软删样品：列表/看板/导出/匿名卡均不可见，scan_logs 保留可查（ADMIN 日志页）
- workbench 合并视图不再出现已删样品（跨子系统回归点）

### Commit
`feat(samples): soft delete with log retention and seq no-reuse`

---

## T14 · 照片历史 + 魔数校验

### Files
- `subsystems/samples/backend/routes-samples.js`（saveSampleImage）、`backend/routes-scan.js`、`frontend/js/views/detail.js`

### Steps
14.1 `saveSampleImage`：魔数校验（jpg `FFD8`、png `89504E47`、gif `47494638`、webp `RIFF…WEBP`），不匹配 → 400。
14.2 制作照片同步时间戳化 `_prod_` 前缀。
14.3 详情「大图」Tab：历史照片列表（后端新增只读接口 `GET /api/samples/:id/images` 列 uploads 中该编号前缀文件，按时间倒序）。

### 验证
- 伪造 data URL（MIME 声明 png 实为文本）→ 400
- 多次复检后大图 Tab 可见历史列表

### Commit
`feat(samples): photo history and magic-bytes validation`

---

## T15 · EDIT_CARD 版次防篡改

### Files
- `subsystems/samples/backend/routes-scan.js`、前端 `views/card-fields.js`

### Steps
15.1 新增 `validateCardVersion(input, current)` helper：`^\d{1,2}$` 且数值 ≥ 当前版次且 ≤ 99，非法 → 400（防降级/置空/非数字）。
15.2 版次变更写入 scan_logs（记录旧值→新值）。
15.3 前端编辑表单显示当前版次并加输入约束（min/pattern 提示，后端兜底为准）。

### 验证
- 提交低于当前版次/非数字/100 → 400；合法递增 → 通过且日志含新旧值

### Commit
`fix(samples): validate card_version monotonicity on EDIT_CARD`

---

## T16 · 状态机唯一真相源

### Files
- `shared/state-machine.js`、`subsystems/samples/backend/routes-scan.js`、`subsystems/samples/manifest.json`

### Steps
16.1 先 grep 确认 fixtures 对 `shared/state-machine.js` 的使用情况并记录结论（决定回归范围）。
16.2 `routes-scan.js` `allowedActions` 改为：读 manifest → `stateMachine.legalActions(state, role)` 派生；action 特有校验（照片/原因必填等）保留在处理器。
16.3 manifest 补齐遗漏声明（T4 已补部分，本 Task 核对全量）。

### 验证
- manifest 增删一条转移 → allowedActions 行为同步变化（单测断言）
- fixtures 扫码台冒烟（§6.1）

### Commit
`refactor(samples): derive allowed actions from manifest`

---

## T17 · 批量打印接口

### Files
- `subsystems/samples/backend/routes-cards.js`、`backend/card-print-html.js`

### Steps
17.1 `GET /api/samples/cards/print?ids=1,2,3&size=…`：requireAuth；ids 解析去重、上限 50（超出 400）；逐一样品实时查库渲染，`@page` 分页单 HTML 输出。
17.2 复用 `parseSize` 与版式逻辑（抽公共函数，禁复制粘贴，§15）。

### 验证
- 51 个 id → 400；含软删 id → 跳过并在页尾注明
- Chrome 打印预览分页正确

### Commit
`feat(samples): batch card print endpoint`

---

## T18 · 打印触发重构（前端）

### Files
- `subsystems/samples/frontend/js/views/scan-camera.js`、`views/new.js`、`views/print-queue.js`

### Steps
18.1 占位页模式：手势内 `window.open('about:blank')` → 异步完成后 `win.location = url`；`win` 为 null（被拦）→ toast + 「重新打印」按钮。
18.2 `printAllCards` 改为打开 T17 单页（一次手势一次打印）。
18.3 打印队列：入队按 id 去重；localStorage 持久化；扫码视图渲染时恢复 `renderPrintQueue()`。

### 验证
- 连续扫码 5 张 →「打印全部」单页 5 卡全出
- 切走再回扫码页，队列 UI 与数据一致

### Commit
`fix(samples): print trigger via placeholder page and queue persistence`

---

## T19 · 打印显示一致性

### Files
- `subsystems/samples/backend/card-print-html.js`、`backend/card-page.js`、`backend/card-html.js`、`frontend/js/views/detail.js`、`frontend/js/constants.js`、`frontend/js/views/help-data.js`

### Steps
19.1 有效期三处统一 `YYYY-MM-DD`（UTC 日期口径，注释说明）；文档写明自然日口径。
19.2 匿名 `/card` 页日志去 role/dept（仅时间+动作）。
19.3 `card-print-html.js` 纸张 mm 直出（取消 px 往返换算）。
19.4 `card-html.js` 缺高按等比计算（激活死代码分支，行为与注释拉齐）。
19.5 清理过期注释（constants.js「70mm」）；help-data.js 尺寸文案注明「以系统尺寸预设为准」。

### 验证
- 同一样品三处有效期显示一致；00:00–08:00 CST 发行场景日期一致
- 匿名页源码 grep 无部门名

### Commit
`fix(samples): print display consistency and anonymous page minimization`

---

## T20 · bundle 重建 + 版本号（批次 2）

同 T9 步骤。Commit：`chore(samples): rebuild bundle (batch 2)`

---

## T21 · 批次 2 回归 + 文档同步 + 技术债更新

### Steps
21.1 跨子系统回归（共享层 touched：`db/users.js`、`shared/state-machine.js`、workbench SQL）：fixtures 扫码台/列表冒烟、workbench 口径核对、portal 卡片。
21.2 文档：README（API 表加批量打印、状态机图、扫码台表格）、label-card-standard（INSPECT 触发重打、匿名页口径）、sample-code-encoding §3（编号不复用）、AGENTS.md §14。
21.3 文件臃肿检测报告（§9）；验证清单（§16）逐项勾销。
21.4 输出《重启申请》草稿（含影响范围/回滚方案）交付运维部署——**AI 不执行重启**。

### Commit
`docs(samples): sync batch-2 docs and tech-debt notes`

---

## 全局风险与回退

| 风险 | 缓解 |
|---|---|
| 迁移在已上线库执行 | 仅加列、幂等、无回填；执行前 `/www/backup/` 备份（运维配合） |
| CAS 改变既有写行为 | expectedVersion 可选传入，旧路径兼容；409 为新增码不破坏旧客户端 |
| 软删除过滤遗漏 | T13 grep 全量 `FROM samples` + workbench 回归兜底 |
| 批次间冲突 | 批次 2 全部基于批次 1 完成态开发；T16 真相源改造放最后避免中途双写 |

**执行顺序**：T1→T2→…→T10（批次 1 交付评审）→ T11→…→T21（批次 2）。每 Task 完成后立即 commit（一个 Task 一个 commit），Task 间由审查者核对臃肿报告与验证项。
