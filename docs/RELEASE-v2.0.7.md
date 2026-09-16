# RELEASE v2.0.7 — 作废样品柜位释放（「作废残留」分桶 + 清柜释放储位动作）

> 发布日：2026-09-16 ｜ 前序：v2.0.6（样品替代链视图）
> 提交：`2701033`（分桶 + 清柜动作）、`37bcdcd`（契约断言）、`439df7b`（文档同步）、`e240198`（版本号）、本发布说明
> **生效方式**：后端**新增状态机动作 + 出参新增字段** → 需要**一次服务重启**（按 §23.2 已于 2026-09-16 提交《重启申请》，由运维在宝塔面板「停止 → 启动」执行，**AI 未代执行**）；前端资源版本 **`bmu2cu8zb` → `bmu2kg6y6`**（浏览器强刷 Ctrl+F5 即生效）
> **无表结构变更（无 DDL）**；**含一次性生产数据订正**（26 件作废样品释放储位，用户授权 + 已全库备份，见 §4）
> **版本号元数据纯 ff 拉取即生效，无需重启**：`GET /api/subsystems` 每次请求以磁盘为准重建 registry

## 1. 版本号统一（延续 v2.0.3 约定）

| 位置 | 旧值 | 新值 |
|---|---|---|
| `package.json` → `version` | `2.0.6` | **`2.0.7`** |
| `subsystems/{control,fixtures,projects,samples,workbench}/manifest.json` → `version` | `2.0.6` | **`2.0.7`** |
| `docs/RELEASE-v2.0.7.md` | — | **本文件** |
| `AGENTS.md` §13 版本号现值 / §3 发布说明清单 | `2.0.6` | **本次未改**（见下）|

**版本约定**：发布号 = `package.json.version` = 5 个子系统 `manifest.json.version` = 最新 `docs/RELEASE-vX.Y.Z.md`（AGENTS §13）。

**AGENTS.md 未同步说明**：v2.0.6 发布时同步更新了 `AGENTS.md` §13 现值与 §3 发布说明清单；本次因 `CLAUDE.md` §14.6「禁改 AGENTS.md / CLAUDE.md 除非用户明确要求」**未改**，已登记待办（§7）。不影响任何功能——`manifest.version` 全项目唯一消费点是 `server.js` 的启动日志。

**校验证据**：改动后 5 个 manifest 用应用自身加载方式（`require`）逐一加载通过 —— 均 `OK version=2.0.7`；`git diff` 仅 **6 文件 / 6 行**（每文件仅 version 一行）；无 BOM；samples `transitions` 由 17 → **18**（见 §2.2）。

## 2. 变更范围

### 2.1 柜位聚合拆桶：`gone`（已作废残留）与 `reserved`（预占）分离（`2701033`）

| 项 | 内容 |
|---|---|
| 文件 | `subsystems/samples/backend/routes-storage-map.js`（132 行 / 7,687 字符 / 38.4%）|
| 改动 | 非在柜三态但仍有储位的样品原**全部**计入 `reserved`；现按状态分两桶：`RETIRED` → `gone`（已作废残留·待清柜），其余（未制作/已制作/已发行）→ `reserved`（提前占位防两人同格）|
| 空位口径 | `occupied = in + out + ret + reserved + gone` —— **两桶都阻断空位**（储位仍有数据指向该格，清柜前不得被他人占用）|
| 出参 | `cell.occupancy.gone` 与 `summary.gone` **纯增量**（旧前端不读该字段 → 行为不变）|
| 数据依据 | 线上实测：26 件作废样品 **26/26 保留储位**，与 `reserved` 混计使 **8 个受影响格位中 7 个件数角标虚高**（最高 +60%）；且原 `reserved` 池 **100% 是作废残留**（0 件真实预占）|
| 冗余净减 | 原 if/else 两支各写一份 `samples.push` 完整对象字面量 → 改为单次 `snap` 构造 |

### 2.2 新增状态机动作 `CLEAR_STORAGE`（清柜释放储位）（`2701033`）

| 项 | 内容 |
|---|---|
| manifest 转移 | `RETIRED → RETIRED`（自环，仿 `EDIT_CARD` / `EDIT_STORAGE` / `INSPECT` 既有自环先例），`role: [ADMIN, CUSTODY, ME]`，`label: 清柜释放储位`；**samples transitions 17 → 18** |
| 后端 | `subsystems/samples/backend/scan-actions.js`（300 行 / 17,271 字符 / **86.4%**）新增 `CLEAR_STORAGE` 分支：状态兜底非 `RETIRED` → **409**；本就无储位 → **400**（防重复提交零动作）；执行 `storage_location = null` |
| 留痕 | 原储位写入 `scan_logs.location`（`logData = { sample_id, action:'CLEAR_STORAGE', role, user_id, dept, location: clearedLoc, note }`）→ **清柜后仍可在时间线/日志表追溯**；备注选填，缺省「清柜释放格位 <原储位>」|
| 为何新增 | 应用内**原无任何释放格位的路径**：`EDIT_STORAGE` 要求储位非空、`PUT /api/samples/:id` 对 RETIRED 直接 409 且仅接受标示卡字段、`DELETE` 仅限 NEW/PRODUCED —— 26 件残留此前只能手工改库释放 |
| 不可撤销 | 是（清空后再次提交被 400 拦截）|
| 打印 | 不触发标示卡打印（`printCard` 列表不含该动作）|

### 2.3 前端显示修复（`2701033`）

| 文件 | 改动 |
|---|---|
| `views/storage-map.js`（187 行 / 53.0%）| 图例补第 5 态「已作废(待清柜)」；角标 `total` 只计真实占位（in+out+ret+reserved），作废残留单列「废N」副标；**纯作废格位不再套 `sm-empty`**（改 `sm-gone`，修复「看着是空位却能放样」的现场误判）；格位清单状态中文化补 `RETIRED/NEW/PRODUCED/RELEASED`（原先直接显示英文 `RETIRED`）|
| `views/storage-loc-picker.js`（218 行 / 53.7%）| 选位弹窗同源改造：候选徽标只计真实占位，纯作废格位显示「待清柜」而非「0件」；图例经 `smLegendHtml` 共享自动继承第 5 态 |
| `views/scan.js`（286 行 / **95.4%**）| 本地 `SCAN_ACTION_CN_EXT` 增 `CLEAR_STORAGE:'清柜释放储位'`（**不动共享 `api-base.js`** → 其它 4 个子系统零改动、无需重建其 bundle）；提交时收集备注；成功后失效格位缓存 `_smCache` |
| `views/scan-return-actions.js`（46 行 / 20.3%）| 新增清柜确认表单（原储位提示 + 备注选填 + 「确认清柜释放格位」按钮）|
| `views/detail.js`（254 行 / 69.5%）| 日志时间线 `_LOG_FLOW` 补 `CLEAR_STORAGE: '⬆ 已作废（柜位释放·自环）'`；动作名回退链补 `SCAN_ACTION_CN_EXT`（原先会显示原始英文常量）|
| `views/report.js`（312 行 / 79.3%）| 柜位占用报表「在用」口径含 `gone`；构成文案拆出「作废残留 N（待清柜）」|
| `views/help-data.js`（134 行 / 34.1%）| 站内帮助「四色图例」→「五色图例」+ 新增「清柜释放储位（保管/管理员）」说明 |
| `css/module.css`（183 行 / 63.1%）| 新增 `.sm-cell.sm-gone` / `.sm-dot.sm-gone` / `.sm-sub-gone` |

### 2.4 测试（`37bcdcd`）

- `tests/samples-storage-map.test.js`（258 行）：新增 2 条契约断言 —— 「作废残留与预占分桶」（分桶依据 / 空位含 gone / summary 兼容 / 三处快照构造 / 前端第 5 态 / 报表与选位同源）、「清柜释放储位」（manifest 声明 / 状态兜底 / 留痕 / 前端接线 / **bundle 落地自证**）
- `tests/samples-report-render.test.js`：柜位 fixture 补 `gone:2`，占用率断言 `22.2% → 29.6%`，并覆盖**旧后端无 gone 时的向后兼容口径**
- `tests/samples-report.test.js`：状态机守卫 `transitions.length` **17 → 18**（该守卫的作用就是拦住未申报的状态机改动，本次属有意变更，已注明原因）

### 2.5 文档（`439df7b`）

`docs/operation-manual.md` §6.4 与 `docs/样品系统操作说明.md` §7.6 同步：五色图例、角标口径拆桶、清柜入口/角色/效果/留痕/不可撤销。

## 3. 全链路影响与回归

### 3.1 依赖清单（5 维度）

| 维度 | 结论 |
|---|---|
| 代码 | 上游消费方 8 处**全部同步改毕**（见 §2.3）；全仓 `git grep reserved` 与 `git grep storage-map` 复核：`reserved` / `storage-map` **仅 samples 内消费，0 处跨子系统引用** |
| SQL | **无 DDL**；仅一次性 DML（§4）；聚合查询复用既有 `samples.storage_location` |
| 配置 | `manifest.json` transitions 17→18（唯一配置改动）；`tools/bundle-sources.json` **0 改动**；`index.html` 仅版本号 |
| 接口 | `GET /api/samples/storage-map` 出参**纯增量**；`POST /api/scan` 新增 action 取值 `CLEAR_STORAGE`（旧客户端不会发送 → 零影响）；**无删除 / 改名 / 路径变更** |
| 文档 | 总操作说明书 §6.4、样品分册 §7.6、站内帮助已同步；本发布说明 |

**命名唯一性**：本次**未新增任何顶层函数/类**（§7.2 元素数零增长）；新增 CSS 类仅存在于 samples `module.css`。

### 3.2 回归证据

| 项 | 结果 |
|---|---|
| 静态断言 | **61 PASS / 1 FAIL** —— 唯一失败为**本地无 `node_modules`** 导致 `require` 连库模块报 `Cannot find module 'mysql2/promise'`（环境性，改造前即如此；该文件其余断言全过，含本次新增 2 条）|
| `node --check` | **9/9 PASS**（2 后端 + 7 前端视图）|
| manifest | 5 个 `require` 加载通过；所有转移 `from`/`to` 均存在于 `states`；`CLEAR_STORAGE` 计数 = 1 |
| bundle 落地自证 | 服务端 `bundle.js` 含 `CLEAR_STORAGE`(6 处) / `sm-sub-gone`(2) / `清柜释放储位`(3)；头 `BUNDLE vbmu2kg6y6 — 33 files`；入口 `bundle.js?v=` = `module.css?v=` = `bmu2kg6y6` |
| 部署只读验收 | `/health` 200；端口 4000 单实例（PID `1742892`，重启前旧进程）；服务器 HEAD = `e240198`，工作区干净，`samples manifest v2.0.7 transitions=18` |

### 3.3 手工回归清单（需人眼确认，重启后执行）

- [ ] 柜位视图顶栏图例出现 **5 片**（含「已作废(待清柜)」），XS/SM 断点下换行不破版
- [ ] 选位弹窗（接收保管 / 修改储位）标题栏图例同样 5 片，格位无「0件」怪值
- [ ] 扫码台扫**已作废**样品：保管/生技/管理员可见「清柜释放储位」并弹出确认表单；QA/RD 提示「你的角色无法推进该样品」
- [ ] 扫码台扫**在柜**样品：动作列表与 v2.0.6 完全一致（无清柜按钮）
- [ ] 报表页「柜位占用」构成文案出现「作废残留 N（待清柜）」
- [ ] 详情弹窗时间线对本次 26 件显示「清柜释放储位 · ⬆ 已作废（柜位释放·自环）」（无英文常量 / undefined）

## 4. 一次性生产数据订正（用户授权 + 已备份）

| 项 | 内容 |
|---|---|
| 授权 | 用户 2026-09-16 明确授权「一次性 SQL 订正（先备份）」（依 §20.2.3）|
| 备份 | `/www/backup/sample-mgmt/retired-cabinet-release-20260916-081933/`：全库 `mysqldump` gzip（54KB，`gzip -t` 通过）+ `before-baseline.txt` + `before-target-rows.txt`（26 行明细）+ `after-baseline.txt` + `after-logs-sample.txt` |
| 变更前 | `RETIRED` 且储位非空 = **26**（`RETIRED` 合计 26，即 100% 残留）；其它状态储位：`CHECKED_OUT` 53、`IN_CUSTODY` 45 |
| 安全性 | 单事务 + **精确计数守卫**（`@n = 26`）：数量不为 26 时 INSERT 与 UPDATE 均 0 行（整体不动作）；`ROW_COUNT()` 实测 `inserted_logs=26`、`updated_samples=26` |
| 变更后 | `RETIRED` 且储位非空 = **0**；`RETIRED` 合计仍 **26**（状态与样品编号完好）；`CHECKED_OUT` 53 / `IN_CUSTODY` 45 **零触碰**；26 件逐条留痕（`scan_logs.id 716–741`，`action='CLEAR_STORAGE'`、`role='ADMIN'`、`user_id=1`（admin）、`dept='系统'`、`location`=原储位、`note` 含「一次性订正…v2.0.7」）|
| 写入契约 | 完全对齐应用自身写入（`subsystems/samples/db/dao.js:118`）：`INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note)`，`target_type` 走列默认值 `'sample'` |
| 效果 | 8 个受影响格位（`1#样品柜 3-7` / `1#样品柜3-8` / `1#样品柜3-9` / `2#样品柜5-1` / `2#样品柜5-2` / `4#样品柜3-11` / `4#样品柜3-4` / `4#样品柜3-8`）全部变回空位，可正常放样 |

## 5. 部署与回滚

**实际部署顺序**

| 步骤 | 执行方 | 结果 |
|---|---|---|
| 1. 推送 | AI | `origin/main`：`fbfb7d2` → **`e240198`**（4 个提交；用户 2026-09-16 明确授权）|
| 2. 静态拉取 | AI | `sudo -u www git fetch && sudo -u www git merge --ff-only origin/main`：23 文件 / +222 −63；工作区干净；HEAD = `e240198` |
| 3. 重启 | **运维**（宝塔面板「停止 → 启动」）| **待执行**（《重启申请》已按 §23.2 提交；AI 未代执行）|
| 4. 数据订正 | AI（用户授权）| 见 §4，已完成 |

**实测注意**：`gone` 分桶与 `CLEAR_STORAGE` 均为**后端**行为，**重启前**线上仍走旧逻辑（表现为柜位图无第 5 态、扫码台无清柜按钮）。**新前端 + 旧后端完全兼容**（`occ.gone || 0`），故「拉取 → 重启」之间的窗口不会报错，仅功能未出现——与 v2.0.6「拉取与重启应紧邻执行」同理。

**回滚方案**

| 范围 | 操作 | 需重启 |
|---|---|---|
| 全部回滚 | `git revert --no-edit e240198 439df7b 37bcdcd 2701033` → 推回 → 服务器 ff 拉取 → 再重启一次（运维）| 是 |
| 仅前端回滚 | `git checkout fbfb7d2 -- subsystems/samples/frontend/js/bundle.js subsystems/samples/frontend/index.html` | 否 |
| 仅版本号回滚 | `git revert e240198` | 否 |
| 数据回滚 | 按 `before-target-rows.txt` 逐条回填 26 行 `storage_location`（或整库还原 `db-sample_mgmt-20260916-081933.sql.gz`）；**同时删除 `scan_logs.id 716–741`** 以保持留痕一致 | 否（即时生效）|

## 6. 上线后监控（1–3 周期）

- `GET /api/samples/storage-map` 的 5xx 计数与响应中 `summary.gone` 是否为**数字**（重启后应为 `0`）
- 8 个已释放格位在柜位图与报表「在用」中的回落是否正确（在用 −26、空位 +8）
- 扫码台对 `RETIRED` 样品的清柜可用性与拦截（无储位 → 400；QA/RD 不可见）
- 详情时间线对 `CLEAR_STORAGE` 的渲染（本次 26 件订正 + 后续人工清柜）

## 7. 已知遗留（登记，未在本次范围）

| 项 | 现状 | 处置方案 |
|---|---|---|
| `views/scan.js` | **95.4%**（已越 §7.1 的 90% 线；本次仅 +84 字符，改动前即 95.0%）| 抽 `views/scan-forms.js`（动作表单）+ `views/scan-collect.js`（提交载荷收集）→ 预计 ≈65% |
| `backend/scan-actions.js` | 86.4%，`applyAction` **202 行**（超 §7.2 单函数 60 行）| 按域拆 3 个子分发器（release / custody / return），`applyAction` 仅留分发 |
| `views/report.js` | 79.3%，顶层函数 **16 个**（超 §7.2 上限 10）| 抽 `views/report-sections.js`（5 个分块），`report.js` 仅留装配 |
| `backend/routes-storage-map.js` | `register` **92 行**（超 §7.2）| 抽纯函数 `aggregateStorageMap()`（可单测），`register` 仅留路由声明 |
| `views/storage-loc-picker.js` | 顶层函数 **12 个**（超 §7.2，历史遗留）| 与 `storage-map.js` 的格位渲染合并为共享 `smCellHtml(cell, opts)` |
| 冗余（本次新增）| 第 5 态渲染同时写在 `smRenderCell` 与 `smMapRenderCell`（两函数高度相似，差异仅 onclick）| 同上合并（§15.2 禁复制粘贴）|
| `views/detail.js` | 顶层函数 **19 个**（历史遗留）| 按「详情骨架 / Tab 内容 / 动作」三域拆分 |
| `docs/operation-manual.md` | **936 行 / 25,388 字符（126.9%）**，本次 +约 559 | 按子系统分节迁入各分册，总册留索引（需用户授权）|
| `AGENTS.md` §13 / §3 | 版本号仍写 `2.0.6` | 待用户授权后一次补正（`CLAUDE.md` §14.6）|
| `fixtures` / `samples` / `workbench` 的 `manifest.json` | 末行无换行（§7.6）| 既有现象，本次未改；建议单独一次格式收口提交 |
| `package-lock.json` 根 `version` | 仍为 `0.1.0`，与发布号体系无关 | 既有现象；如需归一可单独一次 `npm install` 收口 |
