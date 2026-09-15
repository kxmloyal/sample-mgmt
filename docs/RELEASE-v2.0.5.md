# RELEASE v2.0.5 — 样品报表（方案甲·只读聚合） + 柜位视图工具栏修正

> 发布日：2026-09-14 ｜ 前序：v2.0.4（详情弹窗设计系统收敛 + samples 迁移）
> 提交：`d3ab4df`（柜位视图去掉跨子系统 pk- 类名）、`ce3817c`（规则文档：UI emoji 保留）、`5daaa93`（柜位视图工具栏分组）、`21cb0e1`（样品报表方案甲）、本发布说明
> **生效方式**：纯前端资源替换（`bundle.js` + `index.html` 版本号），**无需重启服务**，浏览器强刷（Ctrl+F5）即生效；当前资源版本 **`bmu1gjh4b`**
> **无后端代码变更、无表结构变更（无 DDL/DML）、无数据变更、无新增依赖**

## 1. 版本号统一（延续 v2.0.3 约定）

| 位置 | 旧值 | 新值 |
|---|---|---|
| `package.json` → `version` | `2.0.4` | **`2.0.5`** |
| `subsystems/{control,fixtures,projects,samples,workbench}/manifest.json` → `version` | `2.0.4` | **`2.0.5`** |
| `AGENTS.md` §13 版本号现值 / §3 发布说明清单 | `2.0.4` | **`2.0.5`** |

**版本约定**：发布号 = `package.json.version` = 5 个子系统 `manifest.json.version` = 最新 `docs/RELEASE-vX.Y.Z.md`（AGENTS §13）。`manifest.version` 仅用于启动日志（`server.js:151`）与 `/api/subsystems` 展示，无功能分支依赖。

**本批次覆盖的中间态说明**：`d3ab4df` / `ce3817c` / `5daaa93` 三个提交期间只重建了 samples 的 bundle（资源版本 `bmu0tq4jm`），而版本号仍停留在 `2.0.4`，导致「`tools/.bundle-ver` 与 samples 资源版本不一致」的表象。该中间态在本批次收口：v2.0.5 资源版本统一为 `bmu1gjh4b`。

## 2. 变更范围

### 2.1 样品报表（方案甲，`21cb0e1`）

新增只读聚合报表页 `#/report`（左侧导航「样品报表」，5 个角色可见）。

| 项 | 内容 |
|---|---|
| 数据源 | **全部复用既有只读端点，零新增接口**：`GET /api/dashboard`（状态/预警/待办）、`GET /api/samples/models?view=wall`（机型）、`GET /api/samples/storage-map`（柜位）、`GET /api/samples?station=X&limit=1` ×6（组别计数） |
| 页面区块 | 核心指标 → 状态分布（生命周期序 100% 堆叠条）→ 机型分布 → 组别分布（`STATIONS` 全集补零）→ 预警 → 柜位占用 → 我的待办 → 口径与数据说明 |
| 新增文件 | `subsystems/samples/frontend/js/views/report.js`（308 行） |
| 同步文件 | `router.js`（NAV+VIEWS+meta 三处）、`help.js`、`help-data.js`（14→15 模块）、`css/module.css`（`.rpt-*`）、`manifest.json`（navigation 增 `report`）、`tools/bundle-sources.json`（31→32 源） |
| 新增测试 | `tests/samples-report.test.js`（11 条静态契约）、`tests/samples-report-render.test.js`（9 条运行时渲染契约） |

**设计约束（写入代码注释，防回退）**：

1. 状态分布**按生命周期顺序**，禁止按数量排序 —— 实测 18/17/15 的相邻差异落在人眼可辨阈以下，数量排序会被读成「大小关系」。
2. 顶层标识符一律 `rpt*` 前缀且仅用 `var` + `function` —— bundle 是经典 `<script>` 拼接的**单一全局作用域**，顶层 `const`/`let` 重名 = `SyntaxError` 致整个 samples 前端白屏。
3. 零值状态**不渲染条段**（避免 0 宽度幽灵段），但**保留在图例与明细表中**（缺失比 0 更易被误读）。
4. 组别按 `STATIONS` 全集**补零**；`STATIONS` 延迟取值以规避顶层 TDZ。
5. 组别表**行不可点**：样品列表只解析 hash 的 `status`/`model`，不支持 `station` 深链，硬跳会落到未筛选列表造成误导（补深链列入下一批）。
6. 复检逾期**不作为 KPI 亮点**：实测 `release_cycle_days` 全部为 365、98 条 `next_inspect_at` 集中于 2027-08-31~2027-09-14，逾期恒为 0 属结构性预期，页面已显式标注该口径。

### 2.2 柜位视图工具栏修正（`d3ab4df` + `5daaa93`）

| 项 | 修正前 | 修正后 |
|---|---|---|
| 容器类名 | 误用 projects 私有 `.pk-filters`（`app.css` 无定义 → 非 flex，实测按钮间距 1px、`align-items:center` 静默失效、垂直中心差 5.5px、无换行） | 复用共享 `.filters`（`app.css:163`） |
| 表单容器 | 误用 `.pk-form` | 本子系统 `.sm-form`（纵向 flex） |
| 布局分组 | 单行平铺 | `.sm-tb-info`（信息组）+ 1px 竖分隔线 + `.sm-tb-ops`（操作组，`margin-left:auto` 靠右，换行时整组仍靠右） |
| 跨子系统类名 | samples 侧引用 projects 私有类 | **零引用**（测试断言锁死） |
| UI emoji | — | 「➕ 新增柜」等既有 UI emoji **逐字保留**（AGENTS §10） |

### 2.3 规则文档（`ce3817c`）

明确「产品 UI 文案中的 emoji 一律保留」；澄清 `CLAUDE.md` 第 13 节「不用 emoji 除非用户要求」只约束 **AI 回复文本**，不约束产品 UI。起因：2026-09-14 曾误删柜位视图「新增柜」按钮的 U+2795 并回滚。

### 2.4 文档与规则同步

`AGENTS.md` §3 发布说明清单新增 `RELEASE-v2.0.5.md`、§13 版本号现值 → `2.0.5`。

## 3. 全链路影响与回归

### 3.1 依赖清单（5 维度）

| 维度 | 结论 |
|---|---|
| 代码层 | 上游：hash 路由三处（`NAV`/`VIEWS`/`meta`）、左侧导航、页面标题、上下文提示条、帮助面板搜索。下游：`kb-stats.js`（`{n,l,color,href,title}` + `click:'navigate'`）、`api-base.js`、`utils.e()`、`constants.STATIONS`、`app.css` 共享 `.filters`/`.kb-stats`/`.dash-bar*`、`detail.viewDetail()` |
| 数据库层 | **零改动**（无 DDL/DML/迁移） |
| 配置层 | `tools/bundle-sources.json`：samples 31 → 32 源（`report.js` 插在 `router.js` **之前**，构建顺序即依赖顺序） |
| 接口层 | **零新增、零修改**（仅调用既有只读 GET） |
| 文档层 | 本发布说明、AGENTS §3/§13 |
| 跨子系统 | `build-bundles.js` 会用同一次构建的 VER 刷新**全部 5 个**子系统的 `module.css?v=`；本次已把这 4 个无关 diff **全部回退**，4 个子系统资源版本维持 `bmtwzbj0j` 且与各自线上 bundle banner 自洽 |
| `deployed` 标记 | **未改动**（projects 保持 `deployed:false`；samples 保持 `true`；测试断言锁死） |
| 状态机 | `samples/manifest.json` 的 `stateMachine.transitions` 仍为 **17 条**（测试断言锁死） |

### 3.2 回归证据

| 项 | 结果 |
|---|---|
| 新增静态契约 `tests/samples-report.test.js` | **11/11 通过** |
| 新增运行时渲染 `tests/samples-report-render.test.js` | **9/9 通过**（vm 沙箱真实执行 `viewReport()`，注入实测分布 fixture） |
| 渲染断言细目 | HTML 9945 字符；`<div>` **38/38 配平**；堆叠条 **6 段**（`CHECKED_OUT=0` 未产生幽灵段）；微条 13 处；无 `undefined`/`NaN`/`[object Object]`；出数 116/98/9/15/57/18/15.5%/78·37·1/22.2% |
| 关联回归集（9 套件同进程） | `samples-report`、`samples-storage-map`、`samples-storage-loc-picker`、`samples-station-filter`、`samples-pending-role`、`subsystems`、`subsystem-scaffold`、`dashboard`、`users` → **8 passed / 1 failed**，`138 passed / 4 failed` |
| **基线对比（关键）** | 失败项**全部**在 `tests/users.test.js`（`POST /api/users/batch` ×3、`/api/users/import` ×1）；在基线 `5daaa93` 上同文件**同样 4 failed / 27 passed** ⇒ **预存失败，与本批次无因果关系** |
| 构建产物 | samples `bundle.js` `node --check` 通过；`function viewReport(` 全 bundle 恰好 1 处；32 源；`BUNDLE vbmu1gjh4b — 32 files` |
| 线上冒烟（只读） | `index.html` → `bundle.js?v=bmu1gjh4b` + `module.css?v=bmu1gjh4b`；`bundle.js` HTTP 200 / 241850 bytes 且与磁盘 `cmp` 字节一致；4 个数据端点未登录均 `401`；服务进程启动时间 `Mon Sep 14 14:43:34` ⇒ **全程未重启** |
| 同进程 `cesu8` 问题 | v2.0.4 记录过「同一 jest 进程跑约 13 套件后 mysql2 握手 `cesu8` 致命错误」；本次 9 套件同进程取得完整汇总行，**未复现** |

### 3.3 手工回归清单（需人眼确认）

1. 左侧导航「样品报表」→ 页面加载出数，核心指标 6 张卡单击可跳样品列表
2. 状态分布条：7 个状态图例齐全、条段与图例联动跳转；「领用中」为 0 时**无**条段但图例仍在
3. 机型分布：按样品数降序，点行跳 `#/samples?model=X` 且列表已预选该机型
4. 组别分布：6 个组别全在（含 0 件组别），行不可点（预期行为）
5. 柜位占用：每柜行 + 未入柜告警；点「去柜位视图查看」跳 `#/storagemap`
6. 我的待办：点任一条打开样品详情弹窗
7. 柜位视图工具栏（回归）：信息组左、分隔线中、操作组右；窄屏整组换行仍靠右；ADMIN 的「➕ 新增柜」按钮 emoji 与文案逐字未变
8. 帮助面板（回归）：搜索「报表」能命中新增模块；报表页顶部出现上下文提示条

## 4. 部署与回滚

- **部署**：仓库工作区即生效（`subsystems/samples/frontend/js/bundle.js` + `index.html` 的 `?v=bmu1gjh4b`）；**无需重启服务**，浏览器强刷即可。其余 4 个子系统资源版本仍为 `bmtwzbj0j`，与各自线上 bundle 一致，**无需处理**
- **回滚**：`sudo -u www git revert 21cb0e1`（仅回退报表）或 `git reset --hard 5daaa93`（回到 v2.0.4 末尾状态）→ 资源版本回到 `bmu0tq4jm` / `bmtwzbj0j`；仍**无需重启**，强刷生效
- 本批次 **0 个后端文件 / 0 个 SQL / 0 个依赖**，无数据与接口副作用

## 5. 已知遗留（本次未修，登记待办）

| # | 项 | 说明 | 处置 |
|---|---|---|---|
| 1 | 组别深链 | 样品列表只解析 hash 的 `status`/`model`，`#/samples?station=X` 无效 | **下一批**补 `list.js` 约 8 行解析（用户 2026-09-14 已确认） |
| 2 | `package-lock.json` 根 `version` | 为 `0.1.0`，与 §13 约定不同步（预存，v2.0.4 亦未纳入） | 待确认是否纳入版本约定 |
| 3 | `listDueSoonSamples` | 缺 `deleted_at IS NULL`（预存缺陷） | 单独立项 |
| 4 | `listReturningOverdue`/`listCheckoutOverdue` | 以 `updated_at < UTC_TIMESTAMP() - INTERVAL 72 HOUR` 判超时，而 `updated_at` 是 +08 本地时间、`UTC_TIMESTAMP()` 是 UTC，**实际等效 80 小时**（注释与行为不一致，预存） | 单独立项，需先确认业务口径 |
| 5 | 报表机型区块 60s 延迟 | `/api/samples/models?view=wall` 机型字典缓存 60s | 预期行为，非缺陷 |
| 6 | 报表 5 个口径待拍板 | from/to 时间语义（`created_at`/`produced_at`/`released_at`/`scan_logs.created_at`）、RELEASED 双语义、复检是否含 RETIRED、软删日志是否计入、可见角色矩阵 | 待用户确认，影响后续方案乙/丙 |
| 7 | 方案甲能力边界 | 累计制作/发行、时长指标、重做率、数据质量缺口、在库停留时长分布、周度趋势、聚合 CSV 导出 —— 均需服务端聚合端点 | 方案乙/丙范围 |
