# RELEASE v2.0.6 — 样品替代链视图（只读链接口 + 详情弹窗「替代链」Tab）

> 发布日：2026-09-15 ｜ 前序：v2.0.5（样品报表方案甲 + 柜位视图工具栏修正）
> 提交：`c3b75e7`（替代链视图）、`4978587`（两项拆分立项）、`daf1afc`（迭代归档 + 实测部署记录）、本发布说明
> **生效方式**：后端**新增只读路由** → 需要**一次服务重启**（已于 2026-09-15 由运维在宝塔面板「停止 → 启动」执行完毕，AI 未代执行）；前端资源版本 **`bmu2aignx`**（浏览器强刷 Ctrl+F5 即生效）
> **无后端表结构变更（无 DDL/DML）、无数据变更、无新增依赖、无配置项变更**
> **本发布说明自身**（版本号元数据）**纯 ff 拉取即生效，无需重启**：`GET /api/subsystems` 每次请求以磁盘为准重建 registry（`routes/subsystems.js:48`），管理面板 `public/admin-subsystems.html:75` 的 `v2.0.6` 拉取后立即显示；仅 `server.js:151` 的启动日志需等下次（任意）重启更新

## 1. 版本号统一（延续 v2.0.3 约定）

| 位置 | 旧值 | 新值 |
|---|---|---|
| `package.json` → `version` | `2.0.5` | **`2.0.6`** |
| `subsystems/{control,fixtures,projects,samples,workbench}/manifest.json` → `version` | `2.0.5` | **`2.0.6`** |
| `AGENTS.md` §13 版本号现值 / §3 发布说明清单 | `2.0.5` | **`2.0.6`** |

**版本约定**：发布号 = `package.json.version` = 5 个子系统 `manifest.json.version` = 最新 `docs/RELEASE-vX.Y.Z.md`（AGENTS §13）。

**`manifest.version` 依赖面（本次全仓检索确认）**：全项目**仅一处**使用 —— `server.js:151` 的启动日志 `logger.info(... ' v' + manifest.version)`。无功能分支依赖、无迁移分支依赖；`db/migrations/*.js` 不读取 `manifest.version`（各自内部 version 字段与发布号无关）。

**校验证据**：改动后 5 个 manifest 用应用自身的加载方式（`server.js:149` 的 `require`）逐一加载通过 —— `control/fixtures/projects/samples/workbench` 均 `OK, version=2.0.6`；**无 BOM、行尾与末行状态未变**；`git diff` 仅 8 行（7 文件，每文件仅 version 一行）。

## 2. 变更范围

### 2.1 替代链只读接口（`c3b75e7`）

| 项 | 内容 |
|---|---|
| 端点 | `GET /api/samples/:id/chain` |
| 鉴权 | `requireAuth`（登录即可，与 `GET /api/samples/:id` 同口径） |
| 成功响应 | `{ current:{id,sample_no}, length, truncated, chain:[...] }` |
| 节点字段（白名单） | `ord, isCurrent, soft_deleted, id, sample_no, name, model, station, status, created_at, released_at, retired_reason, next_inspect_at, expected_return_at, replaces, replaced_by` |
| `ord` 语义 | **升序**：负 = 更早（链头）、`0` = 当前样品、正 = 更新（链尾）|
| 404 | `{error:'样品不存在'}`（id 不存在）|
| 401 | 未登录 |
| 分页 | 无（整链一次返回；`truncated` 标记是否被安全上限截断）|
| 写操作 | **无**（纯只读，无 INSERT/UPDATE/DELETE）|
| 表结构 | **无新增表/列**（复用既有 `samples.replaces` / `samples.replaced_by`，写入口仍仅 `RECREATE`）|
| 实现 | `subsystems/samples/db/dao-list.js` 的 `listSampleChain`（`WITH RECURSIVE` newer/older/origin 三段 + `|ord| ≤ 20` 防环收敛）+ `subsystems/samples/backend/routes-chain.js`（44 行 / 1,879 字符，2 个顶层函数）|

### 2.2 详情弹窗「替代链」Tab（`c3b75e7`）

| 项 | 内容 |
|---|---|
| 位置 | 样品详情弹窗 Tab：`信息 → 替代链 → 标示卡 → 全量日志 → 大图` |
| 显示条件 | 仅当 `s.replaced_by || s.replaces` 为真（**字段已在详情响应中，零额外请求**）|
| 渲染 | `subsystems/samples/frontend/js/views/chain.js`（65 行 / 3,243 字符，6 个顶层函数）；懒加载（`lazyTabs` 增加 `chain`）|
| 四态 | 加载中骨架 / 正常整链 / 空 / 失败 |
| 交互 | 点击链节点跳转对应样品详情（`chainNodeJump`）|
| 新增导航/路由 | **无**（零 `manifest.json` / `router.js` 改动）|

### 2.3 顺手修复（`c3b75e7`）

`subsystems/samples/frontend/js/views/detail.js` 的 `_LOG_FLOW` 补齐 `RECREATE_REPLACED: '⬆ 已作废（自环）'`（原缺失会显示原始常量名，不影响既有数据行）。

### 2.4 测试与文档（`c3b75e7` / `4978587` / `daf1afc`）

- 新增 `tests/samples-replacement-chain.test.js`（200 行 / 10,091 字符）：18 条静态断言 + 只读运行时时序（`deployed` 守卫，不写生产数据）
- 文档同步：`README.md`、`docs/role-permission-matrix.md`、`docs/样品系统操作说明.md`（§7.9）、`docs/operation-manual.md`（§5.10）
- 设计文档与实现计划随迭代完成归档至 `docs/archive/{specs,plans}/`，设计文档新增 §12 实测部署记录
- 另立两项拆分待办：`docs/superpowers/plans/2026-09-15-split-report-css.md`、`docs/superpowers/plans/2026-09-15-split-readme.md`

### 2.5 并发集成说明

推送时远端已被并发提交推进（`21cb0e1` 样品报表方案甲、`617b28d` v2.0.5 发布说明）。已 rebase 到 `617b28d` 之上，4 个重叠文件（`module.css` / `index.html` / `bundle.js` / `README.md`）**双方案全部保留**，并重建 samples bundle 使资源版本自洽 —— 报表页与替代链 Tab **在同一 bundle 内共存**（线上实测 bundle 内 `_buildChainTab`、`rptCard`、`views/report.js` 三类代码均存在）。

## 3. 全链路影响与回归

### 3.1 依赖清单（5 维度）

| 维度 | 结论 |
|---|---|
| 代码 | 新增 2 个文件（`routes-chain.js` / `views/chain.js`）+ 1 个测试；改 `backend/index.js`（注册一行）、`db/dao-list.js`（新增 `listSampleChain`）、`views/detail.js`（lazyTabs/Tab 判定/内容分支/`_LOG_FLOW`）、`css/module.css`（新增 `sm-chain*`）|
| SQL | **无 DDL/DML**；仅新增只读递归 CTE 查询（复用既有 `replaces`/`replaced_by` 列，无新索引、无新表）|
| 配置 | 无（`.env` / manifest 业务字段 / 端口 均未变；仅 manifest `version` 元数据）|
| 接口 | **仅新增** `GET /api/samples/:id/chain`；既有接口出入参**零改动**（3 段路径 `/:id/chain` 不会被 2 段 `/:id` 捕获）|
| 文档 | README / 权限矩阵 / 样品操作说明 / 总操作说明书 已同步；发布说明即本文件 |

**命名唯一性**：`listSampleChain` 定义全局唯一（仅 `db/dao-list.js`，其余为调用点）；新增 6 个前端函数在 bundle 内声明次数各为 1。已提交 bundle 中的 6 处顶层 `const/let`（`NAV`/`VIEWS`/`STATIONS`/`CONFIRM_ACTIONS`/`el`/`_camStream`）位于共享常量头，属**既有基线**（`statusBadge` 同名 2 处在基线 `617b28d` 中同样为 2），本次未新增顶层 `const/let`，**无白屏风险**。

### 3.2 回归证据

| 项 | 结果 |
|---|---|
| 静态断言三套件 | **38/38 PASS**（本迭代 18 + 既有报表 11 + 既有报表渲染 9）|
| `node --check` | 7/7 PASS（含 bundle 整体语法）|
| 线上只读验收（重启后） | `id=65`：200 / `length=2` / `truncated=false`，`ord`0=`058-01`(RETIRED, `replaced_by=061-01`)、`ord`1=`061-01`(PRODUCED, `replaces=058-01`）；`id=122`：同链 `ord`−1/0 反向验证；`id=5`：`length=1` 无链边界；`id=999999`：404 `{error:'样品不存在'}`；无 cookie：401 |
| 线上回归 | 列表 / 看板 / 机型墙(`view=wall`) / 柜位(`storage-map`) / 按组别查询 全部 200；`/health`、`/api/config` 200；登录+登出 200（会话无残留）|
| 进程 | 端口 4000 单实例（重启后 PID `1503826`，未再变化）|

### 3.3 手工回归清单（需人眼确认）

- [ ] 打开带替代关系的样品详情（如 `G-BD7620-A-058-01`）→ 出现「替代链」Tab → 点击链节点可跳转
- [ ] 无替代关系的样品（如 `G-BD7620-S-004-01`）→ **不出现**「替代链」Tab
- [ ] 报表页（方案甲）与柜位视图工具栏**显示与 v2.0.5 一致**（本 bundle 同时含两方案）
- [ ] 详情弹窗其余 Tab（信息/标示卡/全量日志/大图）无变化
- [ ] XS/SM 断点下替代链节点换行正常

## 4. 部署与回滚

**本次实际部署顺序（已完成）**

| 步骤 | 执行方 | 结果 |
|---|---|---|
| 1. 推送 | AI | `origin/main` = `daf1afc` |
| 2. 静态拉取 | AI | `sudo -u www git fetch && git merge --ff-only origin/main`：`617b28d` → `4978587`（后至 `daf1afc`），工作区干净 |
| 3. 重启 | **运维**（宝塔面板「停止 → 启动」） | 端口 4000 PID `1498664` → `1503826`，单实例 |

**实测注意（供后续迭代参考）**：`GET /api/samples/:id/chain` 重启前 404、重启后 401 —— 证明 **Express 路由仅在进程启动时挂载**。因此「后端新增路由 + 前端新 Tab」类改动，**拉取与重启应紧邻执行**；否则新 bundle 已生效而路由尚未挂载，对带替代关系的样品点击「替代链」Tab 会出现短暂「替代链加载失败」（该 Tab 非默认页、需主动点击，影响面小）。

**本次版本号变更（§1）无需重启**（见文件头说明）。

**回滚方案**

| 范围 | 操作 | 是否需重启 |
|---|---|---|
| 全部回滚 | `git revert c3b75e7` + 再重启一次（运维） | 是 |
| 仅前端回滚 | `git revert c3b75e7 -- subsystems/samples/frontend/`（或 checkout 旧的 `bundle.js` + `index.html` 版本号） | 否 |
| 仅版本号回滚 | `git revert <本发布说明提交>` | 否 |
| 数据回滚 | **不需要**（无 DDL/DML、无数据写入） | — |

## 5. 已知遗留（本次未修，登记待办）

| 项 | 现状 | 处置 |
|---|---|---|
| `subsystems/samples/frontend/css/module.css` | **202 行 / 14,355 字符（71.8%）已越 §7.1 的 70% 预警线**（报表块与替代链块**合并后**才越线：54.0% → 64.5% → 71.8%） | 已立项外迁 `.rpt-*` 至 `report.css` → 回落 62.1%；计划 `docs/superpowers/plans/2026-09-15-split-report-css.md` |
| `README.md` | 497 行 / 19,714 字符（**98.6%**，LF 口径）；台账口径 20,211（**101.1%**），仅余 286 字符 | 已立项拆分（`## API 一览` 4,457 字符外迁 `docs/api.md`）→ 76.9%；计划 `docs/superpowers/plans/2026-09-15-split-readme.md` |
| `subsystems/samples/frontend/js/views/detail.js` | 252 行 / 13,838 字符（69.2%），**顶层函数 19 个（超 §7.2 上限 10）** | 历史遗留，本次仅做最小必要修改未加剧；建议后续按「详情骨架 / Tab 内容 / 动作」三域拆分 |
| `package-lock.json` 根 `version` | 仍为 `0.1.0`，与发布号体系无关（既有现象，v2.0.5 亦未同步） | 记录备查；如需归一可单独一次 `npm install` 收口 |
| `fixtures` / `samples` / `workbench` 的 `manifest.json` | **末行无换行**（§7.6 要求末行换行） | 既有现象，本次未在范围内改动；建议单独一次格式收口提交 |
| 生产数据 | 全库 26 组替代关系 / 52 行（均为 BD7620），无异常 | 无需处理 |

## 6. 上线后监控（1–3 周期）

- `GET /api/samples/:id/chain` 的 **5xx / 404 计数**（预期仅非法 id 出 404）
- 面板/日志中递归 CTE 相关报错（已以 `|ord| ≤ 20` 收敛防环）
- `truncated:true` 出现次数（若出现说明存在超长链，需评估上限）
- 替代链 Tab 在 XS/SM 断点的换行与节点可点击性
