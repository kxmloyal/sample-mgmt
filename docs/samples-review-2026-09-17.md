# 样品管理子系统专项评审报告（2026-09-17）

> 评审对象：`subsystems/samples/`（backend + db + frontend）及其框架依赖层（`server.js` / `db.js` / `db/users.js` / `routes/` / `shared/`）
> 评审基线：`origin/main = 53ba135`（本地镜像先前滞后于 `167dfea`，已于本次评审中同步并核对差异）
> 评审方式：三路并行专家评审（后端 / 前端 / 安全）+ 主控独立逐行复核；全程只读
> 容量口径：AGENTS.md §7.1 权威口径 `fs.readFileSync(p,'utf8').replace(/\r/g,'').length`（LF 归一字符数）
> 约束遵守：零文件修改、零数据库写、零服务重启、零写请求；`manifest.deployed=true` 按上线保护处理

---

## 一、评审维度总览

| 维度 | 发现数 | 本次最严重项 |
|---|---|---|
| 响应（首屏/请求编排/错误态） | 11 | `/report` 单次 9 并发请求超 HTTP/1.1 同源 6 连接上限 |
| 合理（口径一致/单一事实来源） | 14 | 状态字典 9 份副本且已产生 4 处真实文案/颜色分歧 |
| 科学（资源生命周期/规范符合性） | 12 | `_initColResize` document 监听无界泄漏（共享文件，跨子系统） |
| 高效（重复请求/重渲开销） | 11 | 候选格位逐键全量重建并排序，无记忆化与防抖 |
| 交互（反馈/确认/防重） | 12 | 状态标签排点击无即时反馈，且失败路径导出与屏幕不符 |
| 跳转（深链/卸载/返回） | 10 | 刷新/后退丢失全部筛选与分页；无视图卸载协议 |
| 安全（独立专项） | 13 | 2 个存储型 XSS（`retired_reason`、`sample_type`） |
| 数据正确性（独立专项） | 6 | `listLogs` JOIN 条件写错，两列恒为 NULL |
| 容量红线 | 5 | `public/css/app.css` 21,910 字符 = 109.5%，已越 20,000 红线 |

**总体结论**：样品子系统的**工程底色良好**——单一 bundle、状态机服务端裁定、CAS 乐观锁 + 幂等留痕、乐观并发取号重试、全接口 `requireAuth` + 角色校验、错误态在多数视图已实现、`withSubmitLock` 防重复提交已全面落地、测试断言覆盖 bundle 文件顺序与样式前缀。缺陷集中在三类：**（1）跨子系统边界处的隐性耦合**（借用 `D.fetchAll`、重复实现 `asyncHandler`、共享常量 `SOURCE_TYPES` 死代码）；**（2）"已有正确样板却只在部分路径落地"的遗漏传播**（多角色校验、错误文案回显、CSV 单点复用、危险动作确认）；**（3）SPA 有挂载点但无卸载点**（监听器/摄像头/在途请求/提示条）。

---

## 二、修复清单

### P0（阻断发布）

**无。** 三路评审一致未发现 P0 级问题（无 SQL 注入、无文件上传漏洞、无越权、无未鉴权写接口）。

### P1（优先处理：影响正确性、安全或实物账实）

#### P1-1 存储型 XSS：`retired_reason` 未转义直接拼入 HTML 属性（无长度上限）

- **漏洞点**：`subsystems/samples/frontend/js/views/list-inspect.js:32` 返回 `'已作废，复检计划不适用（原因：' + (s.retired_reason || '—') + '）'`（无 `e()`）→ `list-inspect.js:65` `'<span class="muted"' + (reason ? ' title="' + reason + '"' : '') + '>'` **直接拼进 `title="..."`**。
- **注入上下文**：双引号包裹的 HTML 属性。载荷 `"><img src=x onerror=alert(document.cookie)>` 即可闭合属性并落地可执行元素。
- **可控写入口**：`subsystems/samples/backend/scan-actions.js:246`（`RETIRE_ONLY`）、`:282`（`FORCE_RETIRE`）均为 `updated.retired_reason = note.trim()`，`note` 来自用户输入；`subsystems/samples/db/schema.sql:45` 为 `retired_reason TEXT`，**无长度上限**。作者角色 = QA（品保）或 ADMIN。
- **扩散面**：经 `list-render.js:50`（列表主页面「复检状态」列）与 `dashboard-todo.js:46` 的 `inspectBadge(s)` 复用 → **样品列表主页与看板均触发**。
- **修复**：两层同时做——① `inspectReason` 内部对原因值 `e()`；② 属性上下文统一走 `e()`。建议同时限制 `retired_reason` 长度（如 ≤200 字符）。

#### P1-2 存储型 XSS：`sample_type` 无服务端白名单 + 标签函数"未知值原样返回"

- **漏洞点链**：`subsystems/samples/frontend/js/views/list.js:5` `function sampleTypeLabel(v){ return v==='OK'?'OK样品':v==='NG'?'NG样品':v; }` —— **未知值原样透传**；`list-render.js:26` `+ sampleTypeLabel(s.sample_type) +` **未经 `e()`**。
- **可控写入口（均无白名单）**：`subsystems/samples/backend/routes-samples.js:194`（建样）、`:313`（PUT 标示卡）、`scan-actions.js:195`（EDIT_CARD）、`scan-actions.js:85`（RELEASE/RE_RELEASE），均只做 `.trim()` 或直存。**对照**同一函数内 `routes-samples.js:185` 对 `source_type` 有 `['C','T','G'].includes` 校验、`:189` 对 `station` 有 `STATION_GROUPS` 校验 —— 唯独 `sample_type` 漏了。
- **可利用性边界（本次复核新增，评审原文未提）**：`subsystems/samples/db/schema.sql:35` 为 `sample_type VARCHAR(20)`，**载荷长度硬上限 20 字符**。20 字符内仍足以构成有效 XSS（如 `<svg onload=open(1)>` 恰为 20 字符）；若 MySQL 处于严格模式，超长值将直接报 `ER_DATA_TOO_LONG`（并因 P2-1 而回显给客户端）。因此**危害面窄于 P1-1，但性质同为存储型 XSS**。
- **修复**：① 四处写入口统一 `['','OK','NG'].includes(v)` 白名单，非法值 400；② `sampleTypeLabel` 兜底改为安全常量（`'—'`）而非 `v`；③ 调用点补 `e()`。

#### P1-3 `db/dao.js:147` `listLogs` JOIN 条件两侧同表，`sample_no` / `sample_name` 恒为 NULL

- **证据**：`subsystems/samples/db/dao.js:147` 写作 `LEFT JOIN samples s ON l.id = l.sample_id` —— **`ON` 条件两侧都取自别名 `l`**（应为 `s.id = l.sample_id`）。正确对照见同文件 `:154` `listBatchLogs` 的 `LEFT JOIN samples s ON s.id = l.sample_id`。
- **影响**：`SELECT l.*, s.sample_no, s.name AS sample_name` 的两个样品列**恒为 NULL**。后端不报错，前端列表照常渲染 → **静默的数据缺失**，靠测试与人工回归均难发现。
- **修复**：改为 `ON s.id = l.sample_id`；并补一条针对 `listLogs` 返回列非空的测试（当前 `dao-list.js` 侧的测试未覆盖此 JOIN）。

#### P1-4 跨子系统借用 `D.fetchAll`：DAO 边界被 `db.js` 扁平化掩盖

- **证据**：`subsystems/samples/db/dao.js` 的导出（`:169-173`）**不含** `fetchAll` / `fetchOne`；而 samples 后端在 `routes-storage-map.js:44,45`、`routes-checkout-users.js:17,20` 共 **4 处调用 `D.fetchAll(null, ...)`**。真正提供者是 `subsystems/projects/db/dao.js:6,14`（五个子系统中唯一导出者）→ samples 实际借用 projects 的导出，违反 CLAUDE.md §15.5-3。
- **放大风险**：`db.js:106-108` 对 DAO 装载失败**仅 `console.error`、不阻断启动** → 一旦 projects 的 DAO 装载失败或被移除，samples 这 4 处调用会在运行期才报错。
- **误修陷阱（必须先读再改）**：直接给 `samples/db/dao.js` 增加 `fetchAll` 导出**不会生效**——`db.js:96-103` 检测到跨 DAO 同名导出后会重命名为 `samples_fetchAll`，调用点仍解析到 projects 版本，表现为「改了但没效果」。**必须三步独立提交**：先抽共享实现 → 再切换调用点 → 最后回收 projects 的重复导出。
- **落点**：`shared/dao-helpers.js`（或经 `db.js:94` 的 `deps` 注入事务感知读）。

#### P1-5 多角色账号的次级角色全面失效

- **证据**：`shared/middleware/auth.js:52-58` 定义并导出 `hasRole(u, roles)`，注释明示「新代码请用 `u.roles` + `hasRole()`」；但 samples 后端 **`hasRole` / `u.roles` 命中数为 0**，裸 `u.role` 共 **38 处**（`scan-actions.js` 18、`routes-samples.js` 9、`batch-scan.js` 4、`routes-scan.js` 3、`routes-samples-models.js` 2、`routes-cards.js` 1、`routes-storage-map.js` 1）。状态机侧 `shared/state-machine.js:14-18` 亦为单值 `t.role.includes(role)`，`scan-allowed.js:20-27` 只传会话主角色。
- **影响方向**：是**"该放行的被拒绝"（功能静默缺失）**，不是越权 —— `[ME, QA]` 用户在 `u.role='ME'` 时无法执行 RELEASE / RETIRE 等 QA 动作，与其角色矩阵展示不一致。
- **修复**：统一 `hasRole(u, [...])`；状态机入口改传 `u.roles`。

#### P1-6 帮助上下文提示条在 9 条路由中的 6 条被静默清除

- **证据**：`subsystems/samples/frontend/js/router.js:32` 用 `$('#view').insertAdjacentHTML('afterbegin', hint)` 插入提示条；而以下视图在 `await` 之后**整体重写 `#view.innerHTML`**，把它一并覆盖：`dashboard.js:63`、`list.js:31`、`model-wall.js:121`、`logs.js:6`、`storage-map.js:34`、`report.js:105`。仅 `#/new`、`#/models`、`#/scan` 幸存。
- **影响**：产品级新手引导入口实际只在 1/3 页面可见，且表现为"闪一下消失"——静默失效，用户与测试都难发现。
- **修复（推荐 A）**：A 把提示条移出 `#view`，改为与 `#view` 平级的独立容器（如 `#page-hint`）；B 约定视图只重渲 `#view` 内的固定子容器。

#### P1-7 状态标签排点击无即时反馈，且失败路径下导出内容与屏幕不符

- **证据（无即时反馈）**：`subsystems/samples/frontend/js/views/list-status-bar.js:44-45`（`smToggleStatus`）改完 `#f-status.value` 后**直接 `loadSamples()`**，`:52-53`（`smToggleActivePreset`）同样；全 bundle 仅 2 处调用 `smSyncStatusBar()`（`list.js:77`、`list-filter.js:81`），而后者位于 `renderChips` 内、需等 `/api/samples` 响应成功才执行。→ 点击到高亮变化要经过一个完整网络往返，用户易误判"没点上"而**重复点击，反而取消选择**。
- **证据（失败路径不一致）**：`list-render.js:69` 的 `catch` 只写 `#s-list` 错误文案，**不调 `renderChips()`** → 请求失败时标签排停留旧选中态，而参数源 `#f-status` 已是新值。具体后果：屏幕显示"筛了 RELEASED"，点「导出 CSV」却按 `#f-status` 真值导出**全量**。
- **附带耦合**：`list-filter.js:63` `var chips = $('#f-chips'); if (!chips) return;` 位于 `:81` 同步调用**之前** → 标签排同步能力被耦合到"与状态无关的 chips 容器存在性"上。
- **修复**：`smToggleStatus` / `smToggleActivePreset` 改值后**立即调用 `smSyncStatusBar()`**（纯本地 DOM 操作）；并在 `_fetchSamplePage` 用 `.finally(function(){ renderChips(); })` 兜底；建议抽 `smSetStatus(v)` 统一带守卫写入（`list-status-bar.js:44`、`:52` 与 `list-filter.js:8,57,69,86` 共 6 个写入点目前仅部分有守卫）。

#### P1-8 `_initColResize` 的 document 监听无界泄漏（共享文件，跨子系统）

- **证据**：`shared/frontend/shared/utils.js:46-71`——`ths.forEach` 内对每个含 `.col-rsz` 的表头在**初始化时**各注册一次 `document.addEventListener('mousemove')`（`:60`）与 `('mouseup')`（`:65`），全文件 **`removeEventListener` 出现 0 次**（`addEventListener` 3 次）。
- **量化**：样品列表列定义 12 列（`list-render.js` 的 `cols` 数组元素数 = 12）→ **每次列表渲染永久新增约 24 个 document 监听器**；调用点为 `list-render.js:95`（每次翻页/筛选/状态多选均触发）与 `dashboard.js:66,129,141,153`。闭包同时持有 `cols` / `ths` 节点列表 → 旧表格被 `innerHTML` 替换后其 DOM 仍被引用，**监听器与内存双重泄漏**。
- **共享影响**：`utils.js` 被 5 个子系统 bundle 全部载入，fixtures 同样受影响 → 按 §6.1 **MUST 做 samples + fixtures 双系统回归**。
- **修复**：改为事件委托——模块级单例只注册 1 组 `mousemove`/`mouseup` 并在 `mousedown` 时记录拖动目标；或让 `_initColResize` 返回 `teardown()` 在重渲前调用。

#### P1-9 摄像头资源不回收（切页后指示灯常亮）

- **证据**：`subsystems/samples/frontend/js/views/scan-camera.js:7-33` `startCamera()` 在 `:18` 获取 `getUserMedia` 后于 `:21-26` 启动 `requestAnimationFrame` 循环持续 `BarcodeDetector.detect`；`stopCamera()`（`:34`）的**唯一触发路径是检测成功**（`:23`）。`afterScanReset`（`:70`）不调 `stopCamera`；`router.js` **无任何 leave/onLeave/destroy 卸载协议**（实测为 false）。
- **影响**：用户在扫码台打开摄像头后切到任意页面，`MediaStream` 不停止 → **摄像头指示灯常亮**、`_camStream` 泄漏、检测循环持续占用 CPU。属用户可感知的隐私层面问题。
- **修复**：`router.js:21` 的 `VIEWS` 表登记可选 `leave` 回调，`route()` 覆写 `#view` 前调用；`viewScan` 的 leave 调 `stopCamera()`。该协议可同时关闭 P1-8 与 P2-6。

#### P1-10 状态字典 9 份副本，且已产生 4 处真实分歧

- **9 份副本**：`shared/frontend/api-base.js:7` `STATUS`（共享层，5 子系统共用）；`list-status-bar.js:13,15,17`；`list-filter.js:27`；`list-filter.js:67`；`dashboard.js:25-34` `DASH_STATS`；`dashboard.js:46-49` `STAT_LABELS`；`report.js:14-22` `RPT_STATUS_META`；`storage-map.js:112-113` 内联映射；`model-wall.js:57` / `scan.js:3` / `scan-batch.js:17`。
- **已确认的真实分歧（非风格问题）**：
  | 分歧 | A 方 | B 方 |
  |---|---|---|
  | `NEW` 文案 | `api-base.js:9`「新建·待制作确认」 | `dashboard.js:47`「新建·待制作」 |
  | 保管/领用/制作 | `api-base.js:9`「保管中/领用中/制作完成」 | `storage-map.js:112-113`「在柜/被领走/已制作」 |
  | `RELEASED` 颜色 | `dashboard.js:29` `var(--ok)`（绿） | `report.js:17` `#ca8a04`（琥珀） |
- **影响**：同一批样品跨页面比对时产生真实误读；绿色在该系统其余位置语义为"正常/OK"，`RELEASED` 用绿尤易误导。
- **修复**：以 `api-base.js:7` 为唯一来源，扩展 `STATUS_CN` / `STATUS_COLOR`，各视图只引用；属共享层改动，**MUST 多系统回归**。

#### P1-11 `/report` 单次访问发 9 个并发请求，超 HTTP/1.1 同源 6 连接上限

- **证据**：`subsystems/samples/frontend/js/views/report.js:62-105`——`/api/dashboard` + `/api/samples/models?view=wall` + `/api/samples/storage-map` + 6 个 station 请求（`rptFetchStations`，`:53-59`，对每个组别各发 1 个 `?station=X&limit=1`）= **9 个并发请求**，其中 6 个属典型 N+1 聚合。
- **影响**：HTTP/1.1 下单域名同源并发上限 6（这正是 §19 引入 bundle 的原始动因），第 7~9 个请求排队，首屏多一个完整 RTT；点「刷新」9 个请求全部重发。
- **修复**：后端补聚合端点（`GET /api/samples/report` 或 `?groupBy=station`）一次返回全部站别计数，降到 2~3 个请求。

#### P1-12 `RETURN_REJECT` 不恢复已释放的储位 → 样品「在库却无位」

- **证据链**：`subsystems/samples/backend/scan-actions.js:101-110` `releaseCabinet()` 将 `storage_location` 置空；`:238-242`（`RETIRE_RECREATE` 清柜，状态仍停留在 `RETURNING`）；`:250-268`（`RETURN_REJECT` 把状态置回 `IN_CUSTODY`，但**未写回 `storage_location`**）。
- **影响**：样品回到「保管中」却不占任何格位 → 柜位图与储位视图显示"在库但无位"，保管员无法定位实物，**账实不符**。
- **修复**：`RETURN_REJECT` 在回到保管链时同步要求/恢复储位，或在 UI 明确"退回被拒后由保管重新接收落位"的流程提示。

#### P1-13 作废类动作的确认闸门缺失（高低危倒挂）

- **证据**：`views/scan.js:108-110` 只对 ADMIN 兜底的 `FORCE_REASSIGN` / `FORCE_RETIRE` 弹 `confirm()`；而 `RETIRE_ONLY`（作废并释放柜位，`views/scan-return-actions.js:12-13`）、`RETIRE_RECREATE`（作废 + 指派重做，`:22-26`）、`RETURN_REJECT`（拒绝退回，`:14-16`）**均无确认闸门**。相反，低危的 `deleteSample`（`list.js:97`）、`deleteModel`（`models.js:37`）都有 `confirm()`。
- **根因**：`js/constants.js:3` `const CONFIRM_ACTIONS=new Set(['RELEASE','INSPECT','CUSTODY'])` 恰好把作废三动作排除在外 → 命名/口径漂移而非有意豁免。
- **修复**：按"不可逆动作集合"判断，把 `RETIRE_ONLY`/`RETIRE_RECREATE`/`RETURN_REJECT` 纳入；`CONFIRM_ACTIONS` 与确认集合统一为一个常量并补测试锁定。

### P2（系统性，建议成组处理）

| # | 问题 | 关键证据 | 修复要点 |
|---|---|---|---|
| P2-1 | **错误信息回显**：DB 原始 `err.message` 直达客户端 | 9 处：`routes-samples.js:137/209/270`、`routes-scan.js:77`、`routes-storage-map.js:97/119`、`routes-checkout-users.js:36`、`routes-samples-models.js:80`、`batch-scan.js:112`；**正确样板已存在**于 `server.js:164` | 统一 `logger.error` + 固定文案，仅保留白名单业务态提示；可构造 `GET /api/samples?status=,`（`dao-list.js:17` 生成 `status IN ()`）回显 MySQL 方言/表名/约束名 |
| P2-2 | **幂等键与用户自由文本共用 `scan_logs.note`**，可污染致误判 `BATCH_DUPLICATE` | 写入 `batch-scan.js:101`；探测 `db/dao.js:154` `LIKE CONCAT('%[batch:', ?, ']%')` 不限定 `action`/操作人；同列用户文本 `scan-actions.js:179/190/217/238/246/249/282`；`schema.sql:63` `note TEXT` 不截断 | 幂等标记迁独立列/表；过渡期至少加 `AND l.action IN ('CHECKOUT','RETURN_OUT')`；用户文本入库前剥离保留字面量。**方向是"误拒 + 审计污染"，非越权/重复执行**（`batch-scan.js:104` CAS 与 `scan-allowed.js:20-27` 已拦住二次流转） |
| P2-3 | **`FORCE_REASSIGN` 漏调 `releaseCabinet`**（第 5 个出口） | `scan-actions.js:269-277` 对比 `:242/249/285/300` 四个正确出口 | 多出口业务动作应改为**单一列表驱动**的副作用收敛，并补"全部出口动作名覆盖"断言测试 |
| P2-4 | **`app.js` 级 `register()` 超 60 行** | 39 个 >60 行函数中 **20 个是 `register()`**（如 `fixtures/routes-fixtures.js` 350 行、`samples/routes-samples.js` 330 行）；已核实 `register()` 是**路由注册表**而非业务逻辑（`routes-samples.js` 的 register = 9 条路由注册 + 9 个内联处理器，最长连续非注册块 55 行） | §7.2 的 60 行规则对路由注册函数**结构性不可满足**，需在规则中为 `register()` 明确豁免口径，否则规则被系统性无视 |
| P2-5 | **§7.2 顶层函数上限被隐式全局赋值规避** | `subsystems/samples/frontend/js/api.js:59` `api=async function(...)`（**无 `var`/`function`**），`:58` 注释自陈「**不新增顶层函数**（本文件顶层函数已达 §7.2 上限 10 个）」 | 显式写 `var api = ...`；规则需明确"隐式全局赋值同样计入顶层声明" |
| P2-6 | **异步视图无路由令牌**，晚到响应覆盖当前页 | `dashboard.js:52-73`、`report.js:62-105` 无序号守卫；**正例已存在**于 `scan.js:41`（`_scanReqSeq`）、`new.js:248`（`_previewReqSeq`） | `route()` 维护全局 `_routeSeq++`，异步视图写 DOM 前比对 |
| P2-7 | **`typeof X !== 'undefined'` 守卫对 `const` 无效（假安全）** | `js/constants.js:4` 为 **`const STATIONS`**，而 `list.js:40` 写 `typeof STATIONS !== 'undefined' ? STATIONS : [...]`；对块级声明，TDZ 期间 `typeof` 会抛 `ReferenceError` 而非返回 `'undefined'` —— 把"降级"变成"崩溃" | 跨文件共享常量统一改 `var`（与构建注入头一致）或显式 `window.X` 挂载；补清单顺序断言测试 |
| P2-8 | **`var me` 重复声明 + `statusBadge` 静默覆盖** | `shared/frontend/api-base.js:116` `var me = null;` 与 `subsystems/samples/frontend/js/api.js:2` `var me = null;` 同作用域重复；`api-base.js:87` 与 `api.js:15` 的 `statusBadge` 后者覆盖前者 | 当前未爆**仅因 `boot()` 在 bundle 末尾执行**；任何清单顺序调整即导致鉴权/角色判断全失效。差异应显式命名（如 `statusBadgeWithInspect`）而非静默覆盖 |
| P2-9 | **前端实际未被 ESLint 覆盖** | `.eslintrc.json` 仅 `"env": {"node": true, ...}` + `"no-undef": "error"`，无 `.eslintignore`；浏览器全局在 `env.node` 下为未定义标识符 → 对 `subsystems/*/frontend/js/**` 跑 `npm run lint` 会产生上千条 `no-undef` | 为 `subsystems/*/frontend/**` 增加 override 设 `"env": {"browser": true}`，并开 `no-redeclare` + `no-implicit-globals`。**本次评审中投入产出比最高的整改项**，可一次性暴露 P2-5/P2-8 与死变量 |
| P2-10 | **`logs.js` / `models.js` 完全缺失错误态** | `views/logs.js:2-7` 无 `try/catch`，失败时永久停在「加载中…」且产生未处理拒绝；`views/models.js:12-21` 失败时 `#m-list` 空白无提示 | 抽 `withLoadState(container, fn)` 或在 `api()` 层统一注入；正例已有 6 处 |
| P2-11 | **操作日志无分页全量渲染** | `views/logs.js:4-7` 把 `/api/logs` 全部记录 map 进单表；`routes/misc.js:40-44` 调 `D.listLogs()` 未传 limit/offset；`scan_logs` 为高频写入表 | 后端补 limit/offset（无参保留兼容默认），前端补分页或至少 `LIMIT 200` |
| P2-12 | **无客户端缓存，重复进入即重复请求** | `list.js:21-22`、`new.js:80`、`dashboard.js:56` 与 `report.js:67` 各请求同一聚合接口 | 模块级 `Map` + TTL（5 分钟）；`addModel`/`deleteModel` 成功后失效 |
| P2-13 | **机型字典缓存失效不完整** | `routes-samples-models.js:9` `invalidateModelCaches` 仅由 `:75`/`:92`（createModel/deleteModel）调用；缓存键 `sl_sample_models_wall`/`sl_sample_models`/`sl_sample_model_options` **不被样品写路径失效**（≤60s 陈旧窗口） | 在样品写路径统一调用失效，或改用带版本号的缓存键 |
| P2-14 | **`/report` 站别行与看板组别卡无法深链** | `views/dashboard.js:111`（`barDrill`）不写 `station`；`report.js:191` 注释自陈站别/机型/柜位行只展示不跳转 | 把 `station`/`model`/`dept` 纳入统一深链参数集 |
| P2-15 | **刷新/后退丢失筛选、分页与列宽** | `router.js:22-33` 只解析 4 个 hash 键（`status`/`model`/`kw`/`no`）；`q`/`dept`/`sample_type`/`limit_item`/`source_type`/`station`/`sort`（`list-filter.js:6-23`）、`samplePager.offset`（`list.js:12`）、列宽全在内存 | 筛选结果整体写入 hash（`replaceState`），`route()` 反向回填；与列宽持久化一并做 |
| P2-16 | **深链与筛选真值漂移（改选后 F5 回退）** | `list.js:56-58` 进入时把 hash 的 `status=` 写入 `#f-status`，但此后所有写入点（`list-status-bar.js:44`、`list-filter.js:57,69,86`）**从不回写 hash** | 状态变化统一 `syncHash()` |
| P2-17 | **新建页无脏检查，路由离开即丢数据** | `new.js:4-8` 的 `_nbRows` 等全在 `#view` 内，`router.js:22-33` 直接覆写；**同产品内标示卡 Tab 已实现完整脏检查**（`detail-card.js:4,28,85-90`） | 依赖 `VIEWS[k].leave` 协议做离开拦截 |
| P2-18 | **内联 `onclick` 中做 HTML 转义（双重上下文反模式）** | `detail.js:236` `onclick="showImageView(' + e(it.url) + ')"`；`scan-batch.js:126`、`detail.js:65-68` 同类。HTML 实体在 JS 解析前解码，`&#39;` → `'` 会闭合 JS 字符串 | 改 `data-*` + 事件委托（**正例已有**：`models.js:18`） |
| P2-19 | **输入过滤无防抖，同 bundle 三套做法** | 正例 `list.js:16`（`debounceSearch` 300ms）；违规 `model-wall.js:116`、`help.js:48`、`storage-loc-picker.js:63` 均裸即时全量重渲 | 抽共享 `debounce(fn, ms)` 统一 200~300ms |
| P2-20 | **候选格位逐键全量重建并排序** | `storage-loc-picker.js:47-61` `smSortedCells()` 每次调用重建 cabinets×cells 并排序；触发源为 `scan-forms.js:38,66` 的 `oninput` | 用 `_smCache` 数据版本号做记忆化 + 输入侧防抖 |
| P2-21 | **全表 `innerHTML` 重渲导致列宽丢失** | `list-render.js:78-95` 整体替换表格后 `setTimeout(_initColResize, 0)`；列宽仅在 DOM inline style | 列宽存模块级状态或 `localStorage`，渲染时回填 |
| P2-22 | **危险 JS 注入样式表 + 非品牌色** | `scan-camera.js:112-123` `injectWizardCSS()` 注入 `<style>`，硬编码 `#2563eb`（蓝）；而 `public/css/app.css` 的 `var(--brand)` 为 `#0f766e`（青） | 样式迁至 `samples/frontend/css/`（**正例已有** `css/batch.css:1-5` 的注释即同一情形的正确处理） |
| P2-23 | **CSS 规范违反 6 类** | 桌面优先媒体查询 6 处（`module.css:29,41,79,178`、`report.css:33`、`batch.css:40`）；`report.css:28` 用 `rgba()`；`module.css:184-188` 变量回退值 `#2563eb` **与真值 `#0f766e` 不符**；`report.css:15` 硬编码 `minmax(320px,1fr)` | 统一 `min-width` 移动优先；回退值与 `app.css` `:root` 对齐；硬编码 px 改 `min(320px,100%)` |
| P2-24 | **内联硬编码色值 40+ 处** | `card-fields.js:37-59`、`scan-wizard.js:36-92`、`print-queue.js:42-47`、`list-render.js:26`、`scan-camera.js:99,103`、`model-wall.js:64,65` 等；**同一子系统内两套写法并存**（`list.js:49` 正确用 `var(--muted)`） | 统一 `var(--ok)/var(--bad)/var(--warn)/var(--muted)/var(--text)` |
| P2-25 | **`RETURN_REJECT` 之外的储位互斥缺失** | `schema.sql:26` `storage_location VARCHAR(100)` **无唯一索引**；`scan-actions.js:157-161`（CUSTODY）与 `:211-213`（EDIT_STORAGE）只校验非空 | 加"仅存活行唯一"函数索引（**成熟模式**见 `db/migrations/samples.js:60-70` 的 `uk_sample_no_live`），或提交前 `SELECT ... FOR UPDATE` 校验占用 |
| P2-26 | **取号重试可收敛性未验证（需测试库窗口）** | `db/sample-code.js:68` 的 `USED_SQL` 是非锁定一致性读，`db/dao.js:39-64` 的 `ER_DUP_ENTRY` 重试依赖它重发现占用。分析：`sample-code.js:61-62` 对 `sample_seqs` 行加 X 锁并持有到 `tx.js:9` 提交 → 同 prefix 取号被串行化，理论可收敛；**但若调用方在同一事务内先做一致性读，快照被提前固定 → 重试永远选同号、3 次后 500** | 需在非生产 MySQL 上并发压测验证（本次禁止连库/造数）。附带：`db/dao.js:50` 每次重试复用同名 SAVEPOINT 且失败路径只 `ROLLBACK TO` 不 `RELEASE`，MySQL 允许同名重定义，非缺陷，建议加注释 |
| P2-27 | **生产 `SESSION_SECRET` / `NODE_ENV` 需人工核对** | `server.js:20` 默认 `'sample-mgmt-dev-secret-change-me'`，`:22-25` 仅当 `NODE_ENV === 'production'` 时 FATAL 退出；`.env.example:11` 又把该默认值写成推荐示例。若生产漏配 `NODE_ENV` → 可用公开默认值伪造 session cookie 冒充任意账号（含 ADMIN），且 `secure:true`（`:85`）不生效 | **需人工核对生产环境变量**（AI 不读取生产 `.env`、不发起探测） |
| P2-28 | **seed 护栏不在函数入口（latent）** | `subsystems/samples/seed/seed.js:35-40` 无 in-file 护栏即 `DELETE FROM scan_logs`/`samples`/`sample_models` + 3× `ALTER TABLE ... AUTO_INCREMENT = 1`，而 `:11` 注释却声称"护栏拒绝执行"；对照 `subsystems/fixtures/seed/seed.js:10` 的 `assertSeedAllowed` **位于 `:29` 首个 DELETE 之前**（防御纵深） | 已核实**根 `seed-samples.js:11-16` 确有护栏**（§20.2.5 指定位置，npm 路径安全），故非 P1；真实缺口是插件协议路径 `backend/index.js:39-43` 的 `seed()` 绕过该护栏。**当前不可达**（`server.js` 对 `initDB`/`seed` 引用数为 0，仅有 5×`register(`），定级 latent P2。修复：在 `subsystems/samples/seed/seed.js` 函数入口补 `assertSeedAllowed` |

### P3（优化/规范，可批量处理）

| # | 问题 | 证据 |
|---|---|---|
| P3-1 | 前端 CSV 导出未复用 `shared/csv.js`，且**无公式注入中和** | `scan-batch-result.js:94-98` 自写 `esc`（仅处理 `"`/`,`/CR/LF），对比 `shared/csv.js:8`。当前导出列均为服务端枚举/约束值，可利用性低 |
| P3-2 | CSV 公式中和存在"前导空白"残留（2026-09-01 S3 修复的残留） | `shared/csv.js:8` `if (/^[=+\-@\t\r]/.test(s))` 未跳前导空格，`\n` 亦未列入 → `" =1+1"`、`"\n=1+1"` 不命中。且 `tests/csv.test.js`（36 行）**从未断言该公式护栏** → 保护全仓无测试 |
| P3-3 | `/health` 无鉴权，泄漏 `status/uptime/memory/db` | `routes/misc.js:229-239`；`:231` 的 `dbReady` 计算后未使用 |
| P3-4 | 详情/列表回传 `SELECT *`（含 `qr_token`） | `routes-samples.js:168-172` + `db/dao.js:68`；`qr_token` 在 `/api/resolve`、`batch-scan.js:73` 被当作等价凭据。调用方均已登录，风险有限但字段无展示需求 |
| P3-5 | 详情接口无记录级范围校验（**判为设计选择，需业务确认**） | `routes-samples.js:146-172` 任何登录用户可读任意样品详情 + 最多 100 条日志；与列表全员可见（`:47-58` 无范围过滤，`dao-list.js:49-55` 的 `scope=role` 只是**排序**不是过滤）一致。同类：`routes-checkout-users.js:14-37` 暴露全部启用用户，`routes-storage-map.js:39-98` 暴露全部样品储位 |
| P3-6 | 自助改密无强度/历史校验（内控决策） | `routes/auth.js:56-57` 仅长度 ≥6 且不等于旧密码 |
| P3-7 | 改密之外的**授权变更不使会话失效**（S2 复核残留②） | `db/users.js:135-153` 的改角色/降权路径不 bump `session_version`；仅"停用"被 `auth.js:12` 的 `enabled !== 1` 兜住 → **降权后已登录会话最长存活 24h**（`server.js:82`）。建议权限变更同样 bump |
| P3-8 | `shared/middleware/auth.js:16-17` 对 `sessionVersion === undefined` 的存量会话自动采纳（兼容取舍，非缺陷） | 上线前签发的旧 cookie 首次请求被放行一次，采纳后即受约束 |
| P3-9 | 提交防重复未统一 | `models.js:23-34`、`models.js:36-43` 未用 `withSubmitLock`；样品侧全部提交点已用（`new.js:182,264`、`scan.js:97`、`detail-card.js:51`、`scan-batch.js:189`） |
| P3-10 | 全前端无请求取消/超时 | 38 个源文件中 `AbortController` 出现 0 次；`api()`（`js/api.js:59`）不接受 signal |
| P3-11 | `src`/`index.html` preload 类型不匹配（需浏览器确认） | `index.html:14` `<link rel="preload" ... as="script">` 而 `:15` 是 `<script type="module">`（CORS 模式）→ fetch 模式不匹配，367KB 组件库可能被请求两次 |
| P3-12 | 构建脚本非幂等 | `tools/build-bundles.js:10` 用 `'b'+Date.now().toString(36)` 生成版本号；`:66` 写 `tools/.bundle-ver`（已 gitignore）；`:74-83` 回写 `index.html` 的 `?v=`。实测本次评审前本地 `.bundle-ver=bmu5ivq2r` 而 `index.html` 为 `bmu5isi2j` → 存在未提交的本地构建痕迹 |
| P3-13 | 死代码 / 只写不读变量 | `_roleScopeApplied`（`list.js:8`，注释自陈"无 UI 含义"，4 写 0 读）；`_sbRestore`（`scan-batch.js:21-34`，全 bundle 出现 1 次）；`_bindPreview`（`new.js:236-243` 绑定始终 `disabled` 的 `#n-model`）；`formatFileSize`（`shared/frontend/shared/utils.js:7`，samples bundle 内调用 0 次）；`SOURCE_TYPES`（构建注入但 4 个视图 0 引用，见 P3-14） |
| P3-14 | 来源类型文案 4 处硬编码、2 种写法，权威字典是死代码 | `list.js:36`/`new.js:13`/`detail-card.js:23` 写 `塔岗(G)`；`card-fields.js:51` 写 `元将五金塔岗分厂(G)`；而构建注入的 `var SOURCE_TYPES={"C":"客供","T":"元山","G":"元将五金塔岗分厂"}` 在 samples bundle 内**出现 1 次（仅声明本身）、使用 0 次** |
| P3-15 | 未知路由与路由重入无兜底 | `router.js:22-33` hash 未匹配 `VIEWS` 时无任何提示，页面停留上一视图；`route()` 无重入令牌 |
| P3-16 | 提示条对 `#/models` 永不显示，`users` 键为历史残留 | `views/help.js:5-8` 的 `HELP_PAGE_MAP` 含已移除的 `users`、缺 `models` → `renderContextHint('models')` 在 `help.js:108-110` 直接返回空 |
| P3-17 | 状态值载体顺序依赖点击次序 | `list-status-bar.js:41-44` 按点击顺序 `splice`/`push` 后 `join(',')`，而 `:52` 预设用固定顺序 → 同一组状态因点击次序产生不同参数串，URL/导出/日志不可规范化比对。建议按 `_STATUS_LIST` 排序 |
| P3-18 | 机型视图「清除」按钮用脆弱选择器 | `model-wall.js:122-125` 取视图内**第一个** `fluent-text-field`；前置任何输入控件即静默清错目标。建议加 `id="smw-kw"` |
| P3-19 | 弹窗栈治理两套策略并存 | `detail-modal.js` 已用实例化 `mask.__dmApi` 支持叠层（`:114-122`），而 `chain.js:61-65` 与 `detail.js:54` 仍各自手写"先清 dirty → close → 再开"清栈序列 |
| P3-20 | `MutationObserver` 代替显式渲染钩子 | `print-queue.js:72-80` 对 `#view` 建观察者；建议在 `viewScan` 末尾显式调用 |
| P3-21 | `deleted_at IS NULL` 未统一写入 DAO 写语句 | 规则候选 3.2-3 的证据基础；正确性不应外包给调用点 |
| P3-22 | 服务端无共享 `escapeHtml` | `backend/html-utils.js:3-5` 仅 samples 具备，被 `card-html.js`/`card-print-html.js`/`card-page.js`/`routes-cards.js` 共用 → 值得上移共享层 |

### 容量红线

| 文件 | 字符数 | 行数 | 顶层 fn | 占比 | 判定 |
|---|---|---|---|---|---|
| `public/css/app.css` | **21,910** | 300 | — | **109.5%** | **★ 全仓唯一真实越红线**（指令 3 遗留目标） |
| `subsystems/samples/backend/scan-actions.js` | 17,615 | 312 | 8 | 88.1% | 越 70%，进入"仅瘦身"区 |
| `subsystems/samples/backend/routes-samples.js` | 17,528 | 344 | 1 | 87.6% | 同上 |
| `subsystems/samples/frontend/js/views/new.js` | 16,286 | 304 | **17** | 81.4% | 同上 + 顶层 fn 超 §7.2 上限 |
| `subsystems/samples/frontend/js/views/report.js` | 15,619 | 308 | **16** | 78.1% | 同上 |
| `subsystems/samples/frontend/js/views/detail.js` | 14,342 | 257 | **19** | 71.7% | 同上 |
| `subsystems/samples/frontend/js/views/dashboard.js` | 13,406 | 195 | **12** | 67.0% | 顶层 fn 超限 |
| `subsystems/samples/frontend/js/views/storage-loc-picker.js` | 10,299 | 211 | **12** | 51.5% | 顶层 fn 超限 |
| `subsystems/samples/frontend/js/views/scan-batch.js` | 12,715 | 238 | 10（满） | 63.6% | 达上限，新增前须外迁 |
| `subsystems/samples/frontend/js/api.js` | 3,407 | 67 | 10（满） | 17.0% | 达上限 |
| `subsystems/samples/frontend/js/views/scan-camera.js` | 5,372 | 123 | 10（满） | 26.9% | 达上限 |

- **样品树内 63+ 文件中无任何文件超 20,000 字符红线**（权威口径已双向核实：本地镜像与生产服务器逐一吻合）。
- 全仓超红线项经排除法确认：`public/vendor/fluentui-web-components.js`（375,019，vendor）、`package-lock.json`（235,365）、`tests/projects.test.js`（25,544，测试豁免）、`tests/samples-batch-frontend.test.js`（21,019，测试豁免）、`bundle.js`（236,049，构建产物豁免）——**真实违规仅 `public/css/app.css`**。
- 顶层函数超 §7.2 上限（>10）共 19 个文件（projects 8、**samples 5**、fixtures 2、control 2、workbench 2），样品侧为 `detail.js`(19)、`new.js`(17)、`report.js`(16)、`dashboard.js`(12)、`storage-loc-picker.js`(12)。

### 台账偏差（文档层，需同步）

| 台账位置 | 台账值 | 实测值 | 偏差 |
|---|---|---|---|
| `AGENTS.md:378` / `CLAUDE.md:230`（`routes-samples.js`） | 353 行 / 17,840 字符 / 89.2% | **344 行 / 17,528 字符 / 87.6%** | 多记 9 行 / 312 字符；台账**跨过了 90% 线而实际未跨** |
| AGENTS §19.1（samples bundle 字符数） | 231,002 | **236,049** | +5,047 |
| AGENTS §19.1 / CLAUDE §17（samples bundle 源文件数） | 37 | **38** | 少记 1 个 |
| AGENTS §19.1（bundle 版本号） | `?v=bmu4g7w4d` | `bmu5j4sm0` | 版本号未同步 |
| CLAUDE.md §6/§11（`scan-batch.js`） | 12,708 | **12,715** | +7 |
| CLAUDE.md §6/§11（`scan-batch-result.js`） | 6,801 / 107 行 | **6,866 / 108 行** | +65 / +1 |
| `subsystems/samples/manifest.json` | `navigation[0].view = renderDashboard` | `router.js:21` 实际为 `viewDashboard` | 视图名漂移（当前不致命，见 3.2-10） |

---

## 三、可提取为项目规则的候选

### 3.1 已有规则但**缺乏强制检查点**（条文已存在、仍被系统性违反）

这一类最值得优先固化——**不是认知问题，而是遗漏传播**：仓库里已有正确样板，规则却只在部分路径落地。

| # | 现有规则 | 违反实例 | 建议检查点（可执行） |
|---|---|---|---|
| R-1 | **AGENTS §21 / §21.3**：禁止各自重复实现 CSV 生成逻辑 | `subsystems/projects/backend/routes-stats.js:68` 自建 `esc`（**且缺失 `shared/csv.js:8` 的公式注入中和** → 2026-09-01 S3 修复在该导出路径被旁路）；`subsystems/samples/frontend/js/scan-batch-result.js:94-98` 另一套实现。**4/5 子系统正确复用，projects 是唯一违规者** | ① 静态断言：`*.js` 中不得出现第二个 `toCsv`/`sendCsv` 等价实现（可按"含 `\r\n` 拼接 + `replace(/"/g,'""')`"特征检出）；② 把公式中和逻辑抽到前端共享模块，供 Blob 下载复用 |
| R-2 | **AGENTS §19.4**：修改任意 JS 文件后 MUST 执行重建 | 本次评审的"镜像滞后"事件正是该规则的**可见性缺口**：`167dfea` 改了 `help-data.js` 未重建（该次由紧随的 `53ba135` 补上，故生产未受影响），但**若无这条补建提交，没有任何机制能发现** | 构建版本号改为**源文件集合内容哈希**（`sha1(files+order)`）→ 幂等、可追溯，并新增断言"bundle 首行哈希 == 源集合重算哈希"；同时可用 `git diff --exit-code` 做 CI 校验 |
| R-3 | **CLAUDE.md §15.5-3**：禁止跨子系统借用实现 | `subsystems/samples` 借用 `subsystems/projects/db/dao.js` 的 `fetchAll`/`fetchOne` 共 4 处（`routes-storage-map.js:44,45`、`routes-checkout-users.js:17,20`）；`db.js` 的扁平化 `D.*` 在静态层面**无法区分归属** | ① DAO 导出唯一性检查必须是**运行期工厂展开**，不能靠 grep（正则仅能匹配 171 个真实导出名中的 55 个）；② 断言"调用方 `D.<fn>` 的来源 DAO == 本子系统 DAO" |
| R-4 | **AGENTS §7.1/§7.2 容量红线** | 台账手工维护已出现 6 处偏差（见上表），且 `routes-samples.js` 台账值与实测跨在 90% 线两侧；`public/css/app.css` 21,910 字符（109.5%）越红线未被阻断 | ① 台账值**必须由脚本重算**、禁止手工誊写；② 台账条目 MUST 标注口径（LF 归一字符数）；③ 新增容量断言测试（红线 + 70%/90% 阈值 + 顶层函数数） |
| R-5 | **AGENTS §20.2.5**：破坏性脚本 MUST 在函数入口护栏、读 manifest、fail-closed | `subsystems/samples/seed/seed.js:35` 首个 `DELETE` 之前无护栏（注释却称"护栏拒绝执行"）；对照 `fixtures/seed/seed.js:10` 的正例。2026-09-10 fixtures 数据被清空的根因即"护栏不在入口" | 断言"含 `DELETE FROM`/`TRUNCATE`/`ALTER TABLE` 的 `seed/*.js`，其文件内 `assertSeedAllowed` 行号 < 首个破坏性语句行号" |

### 3.2 建议**新增**的规则（本次评审新识别）

| # | 建议规则 | 支撑证据 | 可执行性 |
|---|---|---|---|
| R-6 | **用户可写入的枚举/标签字段 MUST 在服务端白名单化，禁止只做 `.trim()`**；不得以"前端下拉已限制"为由豁免 | `routes-samples.js:185`（`source_type` 有校验）vs `:194`（`sample_type` 无校验）——**同一函数内一有一无，正是 P1-2 的根因**；对照 `scan-actions.js:85,195` | 高：白名单可被评审清单与静态检查机械核对 |
| R-7 | **非本函数产出的字符串进入 `innerHTML` 或 HTML 属性前 MUST 经 `e()`**；**标签映射函数 MUST NOT 用原始值兜底**（禁止 `x==='A'?'甲':x` 这种"未知值透传"，兜底须返回安全常量） | `list.js:5`（兜底透传）+ `list-render.js:26`（未 `e()`）；`list-inspect.js:32`（未转义）→ `:65`（进属性） | 高：本系统前端是单 bundle 单全局作用域的手工拼接，**无框架自动转义，此规则是唯一防线**；可写成 grep 检查项 |
| R-8 | **机器可读标记禁止写入用户自由文本列**；幂等键 MUST 落在有 UNIQUE 约束的列或独立表；过渡期探测侧 MUST 限定 `action` + `user_id` | `batch-scan.js:101`（写入）+ `db/dao.js:154`（探测）+ `scan-actions.js:179/190/217/238/246/249/282`（同列用户文本）+ `schema.sql:63`（TEXT 不截断）；跨"路由写入 / DAO 探测 / 前端复核"三处 | 中：需 schema 变更；可先加断言"探测 SQL 必须限定 action 维度" |
| R-9 | **错误响应 MUST NOT 透出 `err.message`**；除明确列入白名单的业务态提示外，`catch` 一律返回固定文案 + `logger.error` | `server.js:164` 已有正确样板 vs 9 处遗漏 | 高：一条规则 + 一次全仓清理即可根治，并防新子系统重犯 |
| R-10 | **多角色鉴权 MUST 使用 `hasRole(u, [...])`，禁止裸 `u.role`**；状态机入口 MUST 传 `u.roles` | `shared/middleware/auth.js:52-58` 已定义并导出该 helper、注释明示用法；samples 后端 **0 处使用、38 处裸 `u.role`** | 高：可静态断言后端路由文件中 `\bu\.role\b` 出现次数为 0 |
| R-11 | **超时/期限类谓词 MUST 时钟同源**：TIMESTAMP 列只能与 `NOW()` 比较，ISO 字符串列只能与 `UTC_TIMESTAMP()` 比较 | 已发生 **2 次真实的 8 小时偏差缺陷**；现存 `dao-list.js:83` `updated_at < UTC_TIMESTAMP() - INTERVAL ? HOUR`（TIMESTAMP × UTC → 72h 退化为 80h） | 中：需人工判断列类型；可加 schema 注释与评审清单 |
| R-12 | **一个业务不变量 = 一个校验器，被所有写入口共用** | P1-2 的 `sample_type` 校验只可能写在 4 处（`routes-samples.js:194,313`、`scan-actions.js:85,195`）；当前 4 处全缺 | 中 |
| R-13 | **多出口业务动作 MUST 把副作用收敛到单一列表驱动函数**，并补"全部出口动作名覆盖"断言测试 | `scan-actions.js:269-277` `FORCE_REASSIGN` 漏调 `releaseCabinet`（第 5 个出口），而 `:242/249/285/300` 四出口正确；**同类已有先例**：`card_version` 单调性只部分校验（`routes-samples.js:313-316`） | 高：动作名集合可枚举，断言易写 |
| R-14 | **状态机新动作 MUST 声明并断言 `to` 字段** | `shared/state-machine.js:14-18` 仅校验 `from`；当前 16 条转移与 `applyAction` 零漂移（本次已核）——但漂移会静默通过 | 高：可加断言"每个 action 的 `to` 非空且可达" |
| R-15 | **`§7.2` 的 60 行/函数规则需为路由注册函数明确豁免口径** | 39 个 >60 行函数中 **20 个是 `register()`**（`fixtures/routes-fixtures.js` 350 行、`samples/routes-samples.js` 330 行）；已核实 `register()` 是**注册表**而非业务逻辑（`routes-samples.js` 的 register = 9 条路由注册 + 9 个内联处理器，最长连续非注册块 55 行） | 高：需修改规则文本（当前规则**结构性不可满足**，导致被系统性无视） |
| R-16 | **SPA 视图 MUST 声明卸载协议**（`VIEWS[k].leave`），涉及全局副作用资源的视图**MUST**实现 | 一条协议可同时关闭 4 类问题：`scan-camera.js:18-26`（摄像头 + 无界 rAF）、`print-queue.js:75-77`（`#view` 级 Observer）、`shared/frontend/shared/utils.js:46-71`（无界 document 监听）、`dashboard.js:52-73`/`report.js:62-105`（在途请求写已卸载 DOM）。**根因同一个：SPA 有挂载点但无卸载点** | 高：`VIEWS` 表可加断言"含 `getUserMedia`/`MutationObserver`/`addEventListener('mousemove'` 的文件其视图必须登记 `leave`" |
| R-17 | **状态/字典的中文名与颜色 MUST 只有一处来源**；视图内 MUST NOT 新建映射字面量 | 状态映射 **9 份**且已产生 4 处真实分歧（`api-base.js:9` vs `dashboard.js:47` vs `storage-map.js:112-113`）；来源类型 4 份硬编码 + 2 种写法，而 `SOURCE_TYPES` 使用 0 次 | 高：可断言 `views/*.js` 中不出现含 ≥3 个状态键的对象字面量 |
| R-18 | **跨文件全局符号唯一性 + 声明顺序契约**（单 bundle 单全局作用域下的强制约束） | `var me` 在 `api-base.js:116` 与 `samples/js/api.js:2` 重复；`statusBadge` 静默覆盖；`api.js:59` 用**隐式全局赋值**规避 §7.2 计数（注释自陈）。当前 `me` 未爆**仅因 `boot()` 在 bundle 末尾执行**，任何清单顺序调整即鉴权全失效 | 高：遍历 `bundle-sources.json`，断言跨文件同名声明仅出现在显式白名单（当前 3 处），且共享常量声明序 < 全部消费者 |
| R-19 | **前端代码 MUST 被 lint 覆盖**（浏览器环境 + 禁用隐式全局与重复声明） | `.eslintrc.json` 仅 `env.node` + `no-undef:error` → 前端跑 lint 产生上千条 `no-undef`，等于**实际未被覆盖**；这正是 R-18 类问题长期存留的原因 | 高：加 override `env.browser` + `no-redeclare` + `no-implicit-globals`。**本次评审投入产出比最高的整改项** |
| R-20 | **新增子系统 MUST 经 `tools/subsystem-templates.js` 生成，禁止手工复制既有子系统** | 5 个子系统 `index.html` 行相似度 72~89%，差异为语义性；**7 个演示账号硬编码在全部 5 个 `index.html` 中（35 行字面凭据，改一次密码需改 5 处）**；`manifest.json` schema 已漂移（见 R-21） | 中：模板已存在（`tools/subsystem-templates.js` 11,899 字符），需在规则中明确为唯一入口 |
| R-21 | **`manifest.json` 应作为导航/状态机/表结构的唯一事实来源，并补全量漂移测试** | `routes/subsystems.js:66` 只读 `manifest.navigation.length`；**4/5 个子系统的 `router.js` 硬编码自己的 NAV**；samples 存在真实视图名漂移（manifest `renderDashboard` vs `router.js:21` `viewDashboard`）与标签漂移（`new`：manifest「新建样品」vs router「新建样品+打印码」）；跨 manifest schema 漂移：`stateMachine.states` 在 samples 是**数组**、在 control/fixtures/projects 是**对象映射**；samples manifest 漏声明 `sample_seqs` 表、`sample_storage_cabinets` 根本不在 `schema.sql`（由 `routes-storage-map.js:29-33` 内联 DDL 创建）；现有测试只抽查 `storagemap`/`report` 两个键 | 高：加全量漂移测试（视图名集合、状态集合、表集合、导航键集合双向比对） |
| R-22 | **共享代码变更前 MUST 先确认其真实使用方数量** | `shared/file-manager.js`（2,332 字符）**全仓 0 引用 = 死代码**；`shared/frontend/shared/utils.js:7` 的 `formatFileSize` 在 samples bundle 内调用 0 次；`SOURCE_TYPES` 注入 5 个 bundle 但 samples 内使用 0 次；而 `control/backend/routes-files.js`（4,149 字符）与 `fixtures/backend/routes-files.js`（8,345 字符）各自重造 multer+crypto 实现**同一套 4 端点形状**，都不用共享模块 | 高：可加"共享模块引用计数"报告；此规则直接防止"以为在复用、其实各写一套" |
| R-23 | **跨子系统同名的文件不是共享代码**（风险提示规则） | fixtures 与 samples **各有自己的** `views/list-filter.js`、`model-wall.js`、`scan.js`、`detail.js`，但**行重合度仅 2~4%**（实测 list-filter 三文件、model-wall 28%）→ 方法名相似**不等于**代码重复，**MUST NOT 强行"统一"** | 高：作为反向约束写入，防止未来基于文件名误判而做破坏性合并 |
| R-24 | **共享 CSS 变量必须有缓存失效机制** | `public/css/app.css` 的 `?v=20260805b` 是**全部 5 个 `index.html` 中的静态字面量**，`tools/build-bundles.js` 明确不触碰它（"后者使用独立的 v=20260805b 版本体系"）；而 `app.css` 已达 21,910 字符（109.5%、越红线）且**注定要重构** → 一旦改版，用户将拿到旧缓存 | 高：把 `app.css` 纳入版本号刷新或改用内容哈希 |

### 3.3 规则候选优先级建议

1. **R-19（前端 lint 覆盖）** —— 一次性暴露 R-18/R-16 相关的隐式全局、重复声明、死变量，投入最小、收益最大。
2. **R-9（错误文案不回显）** + **R-10（多角色 `hasRole`）** —— 均为"已有正确样板、只在部分路径落地"的遗漏传播型，一次全仓清理可根治并防新子系统重犯。
3. **R-7（`e()` 转义 + 标签函数兜底）** + **R-6（枚举白名单）** —— 直接关闭两个 P1 XSS 的根因类别。
4. **R-2（构建产物内容哈希）+ R-4（台账脚本重算）** —— 把"君子协定"变成可执行约束，并消除本次评审遇到的基线歧义。
5. **R-16（视图卸载协议）** + **R-21（manifest 全量漂移测试）** —— 结构性整改，一次协议化关闭多类资源与一致性问题。
6. **R-15（§7.2 对 `register()` 的豁免口径）** —— 规则文本若不修，其余容量规则会继续被系统性无视。

> 说明：以上规则文本**尚未写入 `AGENTS.md` / `CLAUDE.md`**。按 §14.6，规则文件不得擅自修改，需用户明确授权后再落地；`AGENTS.md` 受 65,536 字节注入预算约束（当前约 47,538 字节，余量约 17,998），新增条文需评估预算。

---

## 四、可多子系统复用的候选

### 4.1 后端复用（按价值排序）

| # | 候选 | 当前重复情况（实测） | 建议落点 | 迁移风险 |
|---|---|---|---|---|
| B-1 | **`asyncHandler`** | `subsystems/samples/backend/async-handler.js` 与 `subsystems/control/backend/async-handler.js` **逐字重复**（仅 L1 注释不同），实体代码 `function asyncHandler(fn){ return function(req,res,next){ Promise.resolve(fn(req,res,next)).catch(next); }; }`；**被引用 15 次**（control 8 / samples 7），**无第三个副本，无共享版本** | `shared/middleware/async-handler.js` | **低**。迁移 = 改 15 处 `require('./async-handler')` 路径；后端文件在 bundle 之外（§19.4），**无需重建前端产物** |
| B-2 | **事务感知读 `fetchOne(conn,sql,params)` / `fetchAll`** | 仅 `projects/db/dao.js:6,14` 导出；samples `db/dao.js` 内部定义 `fetchOne`（`:12-18`）但**不导出**，其导出（`:169-173`）**排除 `fetchAll`/`fetchOne`**；samples 在 4 处借用 projects 的实现 | `shared/dao-helpers.js`，或经 `db.js:94` 的 `deps = { q, one, run, runAffected, nowISO }` 注入（当前 deps 缺事务感知读，这正是被迫跨子系统借用的结构性原因） | **高（最高价值 + 最高风险）**。**顺序陷阱**：直接给 samples 增加 `fetchAll` 导出会触发 `db.js:96-103` 的 `<subsystem>_` 前缀重命名 → 调用点仍解析 projects 版本，表现为"改了但无效果"。**MUST 三步独立提交**：抽共享实现 → 切换调用点 → 回收 projects 重复导出。另注：`db.js:106-108` 对 DAO 装载失败仅 `console.error`、不阻断启动，需一并加固 |
| B-3 | **文件上传（multer + crypto）** | `control/backend/routes-files.js`（4,149 字符）与 `fixtures/backend/routes-files.js`（8,345 字符）**各自重造**同一套 4 端点形状（`GET/POST /:id/files`、`GET/DELETE /:id/files/:fileId[/download]`），**行相似度 54%**；两者都不用 `shared/file-manager.js`（2,332 字符，**全仓 0 引用 = 死代码**）；`shared/middleware/upload.js` 的 `createUploader` **仅被 `projects/backend/routes-task-extras.js:9` 使用** | `shared/file-manager.js`（让死模块承担其设计职责）+ `shared/middleware/upload.js` | **中**。需先确认三方（control/fixtures/projects）的目录约定与校验差异；建议先合并 control+fixtures，projects 的 multipart 契约不同，单独评估 |
| B-4 | **服务端 HTML 转义** | `subsystems/samples/backend/html-utils.js:3-5` 的 `escapeHtml` 是**全仓唯一的服务端转义**，被 `card-html.js`/`card-print-html.js`/`card-page.js`/`routes-cards.js` 四个文件共用 | `shared/html-escape.js` | **低**。纯函数、无依赖；样本侧内部已 4 处复用，说明抽取动机充分 |
| B-5 | **data-URL 图片解码 + 魔数校验** | `subsystems/samples/backend/sample-images.js:10-37`：`data:image/` 前缀 + `/^data:image\/(\w+);base64,(.+)$/` + 扩展名白名单 + 5MB 上限 + 逐格式魔数校验 + 文件名由服务端派生 | `shared/image-dataurl.js` | **中**。**注意**：base64（样品图片）与 multipart（projects 附件）是**两种不同前端契约，MUST NOT 合并** |
| B-6 | **状态机** | `shared/state-machine.js` 已被 `control/backend/flow-ops.js:4` 与 `samples/backend/scan-allowed.js:8` 复用（2 处） | 已是共享模块；建议按 R-14 补 `to` 校验 | **低** |
| B-7 | **认证中间件 / CSV / TTL 缓存** | `shared/middleware/auth.js`（1 处引用）、`shared/csv.js`（4 子系统正确复用）、`shared/cache.js`（7 处） | 已是共享模块 | **低**；`shared/cache.js` 需按 P2-13 补失效注册表 |

### 4.2 前端复用

| # | 候选 | 当前重复情况 | 建议落点 | 迁移风险 |
|---|---|---|---|---|
| F-1 | **`withSubmitLock` 提交防重复锁** | 已成熟存在于 `subsystems/samples/frontend/js/api.js:20`，但位于**子系统目录内**；已覆盖样品侧全部 5 个提交点，而 `models.js:23-43` 未用 | `shared/frontend/api-base.js`（或 `shared/frontend/submit-lock.js`） | **低**。纯函数、无子系统依赖、只操作传入的 `btn`。**注意** samples 版用 `btn.disabled` + `textContent='处理中…'`，若 fixtures 混用原生 `<button>` 与 `<fluent-button>`，需先验证 `disabled` 在两类元素上行为一致 |
| F-2 | **加载/空/错误"三态"渲染** | 6 个视图各写一份内联实现（`report.js:64,74`、`dashboard.js:54,71`、`list-render.js:80`、`model-wall.js:16,34,71`、`storage-map.js:10,13`、`dashboard-todo.js:38`），文案与结构各异；`logs.js` 与 `models.js` **完全缺失**（P2-10） | `shared/frontend/view-state.js`：`renderLoading/renderEmpty/renderError(el, err, retryFn)` | **低**。纯渲染函数、无状态。收益在于把"错误态缺失"从"靠自觉"变成"默认就有"——`logs.js`/`models.js` 的缺陷正是因为手写成本高而被省略 |
| F-3 | **CSV 下载前端工具** | 两套实现：`list.js:106-109`（`exportSamplesCsv` 走 `location.href` 后端导出）与 `scan-batch-result.js:85-108`（前端 Blob 生成，含 BOM/CRLF/引号转义 + 文件名时间戳） | `shared/frontend/csv.js`：`downloadCsv(rows, headers, filenamePrefix)` | **低**。`sbExportFailed` 实现已符合 §21，是可直接提取的成熟实现。**注意** §21.2 规定列表导出走 `location.href`（避免弹窗拦截），与前端 Blob 是两种合法路径，共享模块应同时提供两个入口。**落此模块时一并补 P3-1 的公式中和** |
| F-4 | **`debounce(fn, ms)`** | 正例 `list.js:16`（300ms）；违规裸即时 `model-wall.js:116`、`help.js:48`、`storage-loc-picker.js:63` | `shared/frontend/shared/utils.js` | **低** |
| F-5 | **候选选择器组件（用户点选 + 储位点选）** | `checkout-user-picker.js`（117 行 / 6 顶层 fn）与 `storage-loc-picker.js`（211 行 / 12 顶层 fn）**结构高度同构**：`_xxCache` 缓存、`initXxPicker` 注册（**均正确 remove-before-add**）、`positionXxPanel`、`renderXx` candidates、`hideXx`、`pickXx` | `shared/frontend/candidate-picker.js`（泛型：`source` 提供候选 / `onPick` 回调 / `panelId`） | **中**。两文件在面板定位、blur 定时器（`_coBlurTimer` / `_smBlurTimer`）、键盘导航上已有细微差异；`storage-loc-picker.js` 还兼有柜位图选择（`openSmMapPicker` 等 5 个函数）。**建议先抽用户点选**（更单纯），验证后再评估储位 |
| F-6 | **状态字典 + 徽章渲染** | 状态映射 9 份（P1-10）；samples 有 `statusBadge`（`js/api.js:15`，覆盖共享版）与 `inspectBadge`（`list-inspect.js:60`）两套徽章 | 先 `shared/frontend/api-base.js` 扩 `STATUS_CN`/`STATUS_COLOR`，再 `shared/frontend/badge.js` | **中**。**必须先完成字典单一来源化（R-17）**，否则共享徽章会把 samples 与 fixtures 的现存文案分歧**固化进共享层**。建议顺序：R-17 → F-2 → F-6 |
| F-7 | **标示卡字段表格** | `card-fields.js:28-63` `buildCardFieldTable` 已在 samples 内三处复用；治具有对称的"治具卡"需求 | 暂**不建议**上移 | **高**。`card-fields.js:51` 硬编码 `元将五金塔岗分厂(G)`、字段集（`sample_type`/`limit_item`/`source_type`/`card_version`/`test_data`/`test_standard`）是样品专属。**共享的是"字段状态标记 + 表格骨架"这一抽象，而非字段集**——建议两子系统都稳定后再抽 |
| F-8 | **`window.*` 命名空间化** | 共 **25 个 `window.*` 赋值点**全部无命名空间前缀约束（`window._scanSample`、`window._smMapData`、`window._smwKeyword`/`smwCard`/`smwRender`/`smwFilter`、`window._sbOwned`、`window._wizResetHooked` 等） | 已有正确范式：`shared/frontend/kb-stats.js:1-50` 整体 IIFE、仅暴露 `window.KbStats`、**0 顶层符号泄漏** | **低但需逐个改造**。与 R-18 互补：命名空间化是**预防**，测试是**检出**。**注意** `scan-wizard.js:11-15` 的 `window.afterScanReset` 是对 `scan-camera.js` 的**跨文件行为劫持（猴子补丁）**，命名空间化后应改为显式钩子数组 |

### 4.3 复用落点优先级建议

1. **B-1 `asyncHandler` 上移** —— 100% 有效代码重复、15 个调用点、零共享版本，**无需重建前端产物**，立刻消除重复。
2. **F-1 `withSubmitLock` 上移** + **F-2 三态渲染共享** —— 实现已成熟、零依赖；后者直接关闭 P2-10 并让新视图"默认正确"。
3. **F-3 CSV 前端下载共享** —— 实现已符合 §21，提取即完成前端侧统一，并顺带补公式中和。
4. **B-2 事务感知读抽取** —— **价值最高但风险最高**，必须按三步独立提交并避开 `db.js` 前缀重命名陷阱。
5. **F-6 / F-7 徽章与标示卡** —— **必须等 R-17（字典统一）之后**，否则会把现状分歧固化。
6. **B-3 文件上传统一** —— 建议先合并 control + fixtures，projects 的 multipart 契约单独评估。

### 4.4 已确认为共享（勿重复抽取）

`shared/` 现有 11 个文件 / 28,592 字符，其中被多于一个子系统真实引用的为：`frontend/shared/utils.js`（5 bundle）、`frontend/api-base.js`（5）、`frontend/modal.js`（5）、`frontend/detail-modal.js`（4：samples/fixtures/projects/control）、`frontend/kb-stats.js`（3：samples/fixtures/projects）、`cache.js`（7 处）、`csv.js`（8 处）、`state-machine.js`（2 处）、`middleware/auth.js`（1 处）、`middleware/upload.js`（1 处）。
**真正无引用者仅 `shared/file-manager.js`（0 引用）** —— 是死代码，但同时也正是 B-3 应复活的落点。

### 4.5 跨子系统复用的既有事实（供风险评估）

- **同名文件 ≠ 共享代码**：fixtures 与 samples **各有自己的** `views/list-filter.js`、`model-wall.js`、`scan.js`、`detail.js`，但行重合度仅 **2~4%**（`model-wall.js` 28% 为最高）→ **MUST NOT 依据文件名做"统一"合并**（见 R-23）。
- **静默覆盖导致的"双系统分叉"已发生**：samples 的 `js/api.js:15` 覆盖了 `api-base.js:87` 的 `statusBadge`（samples 版支持逾期高亮），而 fixtures/projects 仍用共享版 → **只改共享版时 samples 不跟随，只改 samples 版时其它子系统不跟随**，双系统回归极易漏测。
- **§6.1 强制回归清单**：修改 `shared/frontend/shared/utils.js`（含 P1-8 的 `_initColResize`）、`shared/frontend/api-base.js`（`STATUS`/`statusBadge`/`me`）、`public/css/app.css`（`--brand` 等变量）时，**MUST** 在 samples 与 fixtures 双侧回归；`app.css` 类改动还需含 projects/workbench。

---

## 五、验证记录

### 5.1 评审方法与独立性

- **三路并行专家评审**：后端（数据/SQL/并发）、前端（6 维度 + 全局重名专项 + `list-status-bar.js` 专项）、安全（9 项必查清单 + 2026-09-01 安全专项 6 提交复核）。
- **主控独立复核**：对全部 P1 断言逐行读取源码验证，不采信评审转述；本轮共执行 6 个只读复核脚本。
- **只读约束遵守**：未修改被评审仓库任何文件；前端评审**刻意未运行 `tools/build-bundles.js`**（该脚本会回写 `tools/.bundle-ver` 与 5 个 `index.html`，与只读约束冲突），改用内存重建比对；未连库、未发写请求、未重启。

### 5.2 已更正或降级的结论（诚实性记录）

| # | 原结论 | 复核后结论 | 依据 |
|---|---|---|---|
| 1 | 前端评审 P1-3：**已提交的 `bundle.js` 与源码不一致，构成规则违反** | **对仓库与生产为假阳性，予以撤销。** 真实情况是**本地评审镜像滞后 1 个提交**。`origin/main = 53ba135` 的差异仅 `index.html`(8 行) + `bundle.js`(4 行) 两个构建产物，**源码零差异**；生产服务器实测 `bundle.js` 含新版帮助文案（1 次）、旧版残留 0 次，banner `vbmu5j4sm0` 与 `index.html` 一致，`.bundle-ver` 亦为 `bmu5j4sm0`。**该提交已正确重建并上线。** | 本地 `git fetch` + `git diff 167dfea..origin/main`；服务器只读探针 `/tmp/_probe_deploy.sh` |
| 2 | 后端评审 P1：**samples seed 无护栏** | **降级为 latent P2。** 根 `seed-samples.js:11-16` **确有护栏**（§20.2.5 指定位置），npm 路径安全。真实缺口是 `subsystems/samples/seed/seed.js` 无 in-file 护栏，而插件协议路径 `backend/index.js:39-43` 的 `seed()` 会绕过它 —— 但 `server.js` 对 `initDB`/`seed` 引用数为 **0**（仅 5 次 `register(`），该路径**当前不可达** | 直读 `seed-samples.js`（22 行）与 `tools/seed-guard.js`（47 行）；`grep` `server.js` |
| 3 | 安全评审 P1（`sample_type` XSS） | **确认成立，但补充可利用性上限**：`schema.sql:35` 为 `VARCHAR(20)`，载荷硬上限 20 字符（20 字符内仍可构成有效 XSS）。危害面**窄于** `retired_reason`（`TEXT` 无上限）。评审原文未提该列长度约束 | 直读 `schema.sql:35` |
| 4 | 前端评审计 `storage-loc-picker.js` = 11,071 字符、`scan-camera.js` = 6,053 字符 | **数值偏高，以权威口径为准**：`storage-loc-picker.js` = **10,299**、`scan-camera.js` = **5,372**。已排除 CRLF 未归一的解释（含 CR 仅 +211 / +123，仍不足以解释偏差）。该偏差不影响这两项的结论方向（顶层函数超限/达上限仍成立） | 本地与服务器双向 LF 归一复算，逐一吻合 |
| 5 | 前端评审前提「`views/*.js` 里可能有 `export` 语句未被构建消费」 | **评审已自行否定，我确认其正确**：samples `js/` 目录下 `export`/`module.exports` **0 处**；`tools/build-bundles.js` 是纯字符串拼接、无模块隔离逻辑。真正的机制风险是**所有源文件共享同一 classic-script 全局作用域**（`var`/`function` 同名静默覆盖，`const`/`let` 同名直接 `SyntaxError` 白屏） | 直读 `tools/build-bundles.js`；全目录检索 |
| 6 | 我的前期记录：「`53ba135` 重建 bundle `bmu5j4sm0` 已提交并推送，本地与服务器同为 `53ba135`」 | **部分失准**：本地镜像实为 `167dfea`（未 fetch）。现已 `git merge --ff-only origin/main` 同步至 `53ba135`，本地与生产基线一致 | 同上 |

### 5.3 容量与红线实测（权威口径，本地镜像与生产服务器双向核对一致）

- 样品树 **63+ 文件内无任何文件超 20,000 字符红线**。
- 全仓唯一真实越红线：`public/css/app.css` = **21,910 字符 / 300 行 = 109.5%**（指令 3 的遗留目标，仍待瘦身）。
- 越 70% 预警线（依 §7.1 只允许停止新增业务逻辑并输出拆分方案）：`scan-actions.js`（88.1%）、`routes-samples.js`（87.6%）、`new.js`（81.4%）、`report.js`（78.1%）、`detail.js`（71.7%）。
- 顶层函数超 §7.2 上限 10：样品侧 5 个文件（`detail.js` 19、`new.js` 17、`report.js` 16、`dashboard.js` 12、`storage-loc-picker.js` 12）；全仓 19 个文件。
- 达上限（=10，新增前须外迁）：`api.js`、`scan-batch.js`、`scan-camera.js`。
- 单函数超 60 行：全仓 39 个，其中 **20 个是 `register()`**（路由注册表，见 R-15）。

### 5.4 生产只读事实

- `git HEAD = 53ba135`、工作区干净（`git status --short` 为空）。
- `bundle.js` = 236,049 字符 / 4,410 行；banner `vbmu5j4sm0` 与 `index.html` 引用一致；`.bundle-ver = bmu5j4sm0`。
- 端口 4000 监听进程 **pid=2734245**（与本次评审前后一致，**AI 全程未重启、未停止服务**）。
- 生产数据（只读核验）：存活 126 = 在管 100 + 已废弃 26；`/api/dashboard` total 126 / RETIRED 26。
- 未执行任何造数、清库、迁移或写请求（`samples`/`fixtures`/`control`/`workbench` 均 `deployed:true`，§20.2 生效）。

### 5.5 未能在本次评审中验证的项（需人工或测试库窗口）

1. **取号重试可收敛性**（P2-26）——需在非生产 MySQL 上跑并发压测；本项目禁止连库/造数，且无可用测试库连接。
2. **生产 `SESSION_SECRET` / `NODE_ENV` 实际值**（P2-27）——AI 不读取生产 `.env`、不发起探测请求。**建议人工核对**（若漏配 `NODE_ENV=production`，默认密钥生效 + `secure:true` 不生效）。
3. **`index.html:14` preload 类型不匹配是否真导致重复下载**（P3-11）——需真实浏览器 DevTools Network 面板确认。
4. **`GET /api/samples/:id` 的可见性边界**（P3-5）——与"列表全员可见"的既有设计一致，判为设计选择，但需**业务确认** CUSTODY/ME 是否应读取其它部门样品的全部日志；同类需确认的还有全部用户 `id/display_name/dept` 暴露（`routes-checkout-users.js:14-37`）与全部样品储位暴露（`routes-storage-map.js:39-98`）。
5. **自助改密口令强度策略**（P3-6）——属内控决策，非技术缺陷。

---

## 六、对运营的提示

1. **两个存储型 XSS 建议优先修复**。`retired_reason` 路径无长度上限、由 QA/ADMIN 写入、在样品列表主页与看板均会触发，且样品数据是 `deployed:true` 的生产长期数据——**一次写入即持久化、会被反复触发**。修复成本极低（两处 `e()` + 一处白名单 + `sampleTypeLabel` 兜底改安全常量）。
2. **`listLogs` 的 JOIN 缺陷是"看不见的"数据缺失**：操作日志页的样品编号/名称列为空，但页面不报错。若曾有用户反馈"日志里看不到样品编号"，此处即根因。修复只改一个 `ON` 条件。
3. **多角色账号存在"看得见却没权限"的困惑来源**（P1-5）：角色矩阵显示某用户应能执行品保动作，但其实际会话主角色不是 QA，操作会被拒绝且**拒绝方向是"静默缺失"**。建议在修复前，对已知的多角色用户（`users_roles` 有 ≥2 条记录者）做一次人工权限核对。
4. **实物账实核对**：`RETURN_REJECT` 不恢复储位（P1-12）与储位无唯一约束（P2-25）都可能导致"一格两样"或"在库无位"。建议近期对柜位图做一次账实盘点，重点核查曾发生"退回被拒"的样品。
5. **`_initColResize` 的监听器泄漏是"用久了变卡"的隐性来源**（P1-8）：用户长时间在列表页反复翻页/筛选会持续累积监听器与游离 DOM。这解释了部分"页面越用越慢"的体感，属共享文件缺陷，修完需 samples + fixtures 双侧回归。
6. **帮助面板的提示条只在 1/3 页面可见**（P1-6），且是"闪一下消失"。若培训材料里提到过提示条，需同步告知其实际表现，或在修复后再作为引导手段推广。
7. **本次评审未重启、未停止任何服务，未做任何写入**。端口 4000 进程 `pid=2734245` 全程未变。所有容量结论均为**只读实测**，可复现。
8. **台账需同步**（见二、台账偏差表）：`routes-samples.js` 台账多记 9 行 / 312 字符，且**跨在 90% 线两侧**；bundle 字符数偏差 +5,047、源文件数少记 1 个、版本号未同步。台账与实测不一致会影响后续容量决策，建议一并更正。

---

## 附：本次评审产出的可执行脚本（均只读，位于仓库外）

| 脚本 | 用途 |
|---|---|
| `F:\work\_verify_xss.js` | 逐行核验两个 P1 XSS 的漏洞点、可控写入口、注入上下文与扩散面 |
| `F:\work\_verify_front.js` | 前端 P1 断言复核（bundle 一致性、状态字典分歧、`const`/`typeof`、`SOURCE_TYPES`、监听器泄漏、全局重名、ESLint 覆盖） |
| `F:\work\_verify_front2.js` | 前端剩余断言复核（`smSyncStatusBar` 调用点、摄像头回收、提示条覆写、`me`/`api`/`statusBadge` 重名） |
| `F:\work\_bundle_diff.js` | bundle 与源码差异的精确定位（含版本号三方一致性） |
| `/tmp/_probe_deploy.sh`（服务器） | 生产只读探针：git 状态、bundle 版本、帮助文案新旧、进程 pid |
| `/tmp/_char_count.js`（服务器） | 权威容量口径（LF 归一字符数）复算与全仓红线扫描 |

> 报告生成时间：2026-09-17　评审基线：`53ba135`　评审方式：三路并行专家评审 + 主控独立逐行复核（全程只读）
