# RELEASE v2.0.8 — 作废即清柜（作废/退回研发重做同步释放柜位；独立清柜动作下线）

> 发布日：2026-09-16 ｜ 前序：v2.0.7（该版交付的独立「清柜释放储位」动作 + 第 5 态**从未激活上线**——后端始终未重启——已被本版按用户规则整体回退）
> 提交：`5cc5548`（feat：同步释放 + 回退）、`4b066f4`（test：契约断言）、本发布说明（docs，随本文件所在提交）
> **生效方式**：后端行为变更 → 需要**一次服务重启**；本轮**沿用** 2026-09-16 已提交的《重启申请》（同一进程从未重启，故**不增加重启次数**），由运维在宝塔面板「停止 → 启动」执行，**AI 未代执行**（§23.1）
> 前端资源版本 **`bmu2kg6y6` → `bmu3he1a0`**（浏览器强刷 Ctrl+F5 即生效，无需重启）
> **无表结构变更（无 DDL）**；本版**不含新的数据订正**——26 件作废样品释放储位已于 v2.0.7 完成（见 `docs/RELEASE-v2.0.7.md` §4）

## 1. 版本号统一（延续 v2.0.3 约定）

| 位置 | 旧值 | 新值 | 生效方式 |
|---|---|---|---|
| `package.json` → `version` | `2.0.7` | **`2.0.8`** | ff 拉取即生效 |
| `subsystems/{control,fixtures,projects,samples,workbench}/manifest.json` → `version` | `2.0.7` | **`2.0.8`** | ff 拉取即生效（`GET /api/subsystems` 每请求按磁盘重建 registry，**无需重启**）|
| `docs/RELEASE-v2.0.8.md`（本文件） | — | 新增 | — |

> `AGENTS.md` §13「当前 2.0.6」与 §3 发布清单**仍未更新**（CLAUDE §14.6 禁改规则文件），已连续两版登记待授权。

## 2. 变更范围

### 2.1 新增：作废即清柜（自动同步释放）

**业务规则（用户 2026-09-16 明确）**：清柜释放储位应发生在**作废时、柜位同步清理**，不设「作废后再单独清柜」的人工后置步骤。

| 出口 | 角色 | 状态变化 | 释放行为 |
|---|---|---|---|
| `RETIRE_ONLY`（直接作废） | QA | `RETURNING → RETIRED` | 同步释放柜位 |
| `FORCE_RETIRE`（强制作废） | ADMIN | `RETURNING → RETIRED` | 同步释放柜位 |
| `RETIRE_RECREATE`（退回研发重做） | QA | `RETURNING → RETURNING` | 同步释放柜位（指派重做即实物随研发离柜）|
| `RECREATE`（创建替代品） | RD | `RETURNING → RETIRED`（原样品）| 事务内**先释放后写库**；替代品**不继承**储位 |

实现收口：`subsystems/samples/backend/scan-actions.js` 新增 `releaseCabinet(target, s, log)`（顶层函数 7 → 8），4 个出口复用：

- 就地置空 `target.storage_location`（`D.updateSample` 列清单含该列 → 置空为真实写入，非静默无效）
- 原储位写入该动作日志的 `location` 列，`note` 追加「，**同步释放柜位 X**」→ **不新增日志条目**，一次操作一条记录且可追溯
- 无储位时零动作（原样返回日志，旧日志格式不变）；**不动 `custody_dept`**（保管口径报表不受影响）

### 2.2 下线：独立清柜动作与第 5 态（回退 v2.0.7 的该部分）

| 文件 | 处理 |
|---|---|
| `subsystems/samples/manifest.json` | 删除 `CLEAR_STORAGE`（`RETIRED → RETIRED` 自环）→ 转移 **18 → 17** |
| `scan-actions.js` | 删除 `CLEAR_STORAGE` 分支（含 409/400 兜底与独立日志）|
| `backend/routes-storage-map.js` | 回退 `gone` 分桶与 `summary.gone`（`occupied` 恢复「在柜+领走+退回+预占」四段口径）|
| `frontend/js/views/storage-map.js` | 回退第 5 态图例、`.sm-gone`、`废N` 副标、`gone` 兜底 |
| `frontend/js/views/storage-loc-picker.js` | 回退候选徽标的 `gone` 分支 |
| `frontend/css/module.css` | 回退 3 条 `sm-gone` 相关规则 |
| `frontend/js/views/report.js` | 回退「作废残留」计入「在用」的口径与文案 |
| `frontend/js/views/scan-return-actions.js` | 删除清柜确认表单 |
| 测试 | 回退 `gone` 分桶断言与状态机守卫（18 → 17）|

> 兼容性：`gone` 为 v2.0.7 新增字段，**从未激活**（0 条生产数据命中），无外部消费者 → 免兼容分支。**存量数据 0 件**：26 件作废样品已于 v2.0.7 订正清零。

### 2.3 关联适配（全链路排查出的易漏项）

| 位置 | 适配内容 | 不做会怎样 |
|---|---|---|
| `frontend/js/views/scan.js` | 新增 `_SM_LOC_ACTIONS` 常量（`CUSTODY`/`EDIT_STORAGE`/**4 个作废/重做动作**），成功后统一失效 `_smCache` | 释放结果在操作员浏览器内**滞留整个会话**，刚释放的格位在选位弹窗仍显示占用 |
| `frontend/js/views/scan-return-actions.js` | 新增 `retiredReleaseHint(s)` 助手，4 个作废确认框统一显示「注意：提交后柜位 **X** 将同步释放，该格随即变为空位」 | 破坏性副作用**无提示**，操作员不知情（隐藏行为） |
| `frontend/js/views/help-data.js` | 新增「作废即清柜（自动，2026-09-16）」帮助条目；品保审核条目补「直接作废（柜位同步释放）」；修正旧错述「退回研发重做 → 状态回 NEW」（实为**保持退回审核中**，`scan-actions.js:219`）|
| `frontend/js/views/detail.js` + `scan.js` | **保留** `CLEAR_STORAGE` 的**显示映射**（时间线流向 + 中文名「清柜释放储位(历史)」），但动作不可再执行 | 2026-09-16 订正产生的 **26 条**历史日志会回显英文 `CLEAR_STORAGE`（§6.3 禁用「直接删除枚举常量」）|

## 3. 全链路关联依赖清单（5 维度）

| 维度 | 排查结果 |
|---|---|
| **代码层** | 写入 `status='RETIRED'` 的位置**全仓仅 3 处**（`scan-actions.js` 的 `RETIRE_ONLY`/`FORCE_RETIRE`/`RECREATE`），全部已接入；另有 `RETIRE_RECREATE` 走重做通道 → 共 4 个释放出口，`git grep releaseCabinet` = 5 处（1 定义 + 4 调用）。`storage_location` 写入方 = `D.updateSample`（列清单含该列，`dao.js:84`）|
| **数据库层** | **无 DDL、无字段变更、无迁移脚本**。仅既有列 `samples.storage_location` 置空；`scan_logs.location` / `note` 复用既有列。报表 SQL（在用口径、占用率）读 `samples` 现状 → 随释放自动回落 |
| **配置层** | manifest 状态机转移 18 → 17（唯一配置变更）；无 `.env`/端口/依赖/环境变量变更 |
| **接口层** | `POST /api/scan` 出参形状不变（`{sample, action, message, printCard}`），仅副作用新增；`GET /api/resolve` 已返回完整 sample 行（含 `storage_location`）→ 前端提示**无需改接口**；`GET /api/samples/storage-map` 出参形状回退为 v2.0.6 形态（`summary` 去掉 `gone`，消费方为本子系统前端，同一提交内同步）|
| **文档层** | 新增本发布说明；`docs/RELEASE-v2.0.7.md` 加前向标注（从未激活、已被回退）；`docs/operation-manual.md` §6.4 与 `docs/样品系统操作说明.md` §7.6 回退清柜段并补「作废即清柜」；`docs/archive/plans/2026-09-15-retired-cabinet-release.md` §7 修正原判断 + §9 口径修正记录；`frontend/js/views/help-data.js` 内置帮助同步 |

## 4. 回归证据

| 项 | 结果 |
|---|---|
| 语法 | `node --check` **11/11 PASS**（后端 2 + 前端 9，含 bundle 与测试文件）|
| 静态断言（与测试文件同源逻辑）| **47 PASS / 0 FAIL**：manifest 17 转移且落 `RETIRED` 路径 = `FORCE_RETIRE/RECREATE/RETIRE_ONLY`、`releaseCabinet` 语义（置空 + location + note 追加 + 无储位零动作 + 不动 `custody_dept`）、4 出口接入、**RECREATE 先释放后写库**、前端 4 处提示与缓存失效、第 5 态/gone 三端无残留、历史映射保留、bundle 落地自证 |
| 变更前基线对比 | 回退文件与 `fbfb7d2`（迭代前）`git diff` **为空** = 可证明的干净回退；仅 `storage-map.js` 有意保留「格位清单状态中文化」这一独立显示修复 |
| jest 全量 | **需在服务器侧执行**（本地 review 镜像为纯 git clone、无 `node_modules`，`tests/setup-env.js` 依赖 `dotenv`）→ 见 §6 部署步骤第 4 步 |
| 只读线上核对（部署后）| 待运维重启后执行（见 §7）|

**回归自测步骤（人工，样品数据只读优先）**

1. 用 `qa01` 扫一个 `退回审核中` 且有储位的样品 → 出现「确认作废」表单，**顶部显示「提交后柜位 <X> 将同步释放」**；提交后：详情时间线该条日志备注含「，同步释放柜位 X」、`储位`列为原储位；柜位视图该格变为**空位**、总占用 −1。
2. 用 `qa01` 对另一 `退回审核中` 样品执行「退回研发重做」→ 提示同上；提交后该样品**状态仍为退回审核中**且**无储位** → 应出现在柜位视图顶部「未入柜样品」告警区（预期行为）。
3. 用 `rd01`（被指派人）对第 2 步样品执行「创建替代品」→ 替代品生成、原样品转「已作废」；原样品柜位保持空，替代品**无储位**（需重新接收保管）；告警区中该样品消失。
4. 用 `admin` 对 `退回审核中` 样品执行「强制作废」→ 提示与释放行为同上。
5. 柜位视图检查：**图例恢复四色**（无「已作废(待清柜)」）；任意格位**无「废N」副标**；样品清单中的状态为中文。
6. 回归无关功能：领用/归还/复检/发行、治具与管制子系统入口（本次未改共享层，双系统回归为冒烟级）。

## 5. 兼容性与已知行为

| 项 | 说明 |
|---|---|
| 旧前端 + 新后端 | 旧 bundle 不读 `storage_location` 的释放结果 → 仅表现为「柜位未及时刷新」，**无报错** |
| 新前端 + 旧后端（重启前窗口）| 提示文案会出现，但后端仍为旧逻辑 → **提交后柜位不释放**。故**建议重启前不要执行作废操作**，或知悉此窗口 |
| **已知行为 1** | `RETIRE_RECREATE` 后状态仍为 `RETURNING` 且已无储位 → 该样品在研发创建替代品前会出现在顶部「未入柜样品」告警区（该池只收在柜三态）。属用户决策的必然结果，已在帮助指南写明 |
| **已知行为 2** | 上述窗口内若被「拒绝退回」驳回 → 样品回保管中但**无储位**，需保管用「修改储位」重新登记（可恢复，无数据丢失）|
| 可逆性 | 释放动作**不可撤销**（与作废本身同为终局操作）；但原储位已写入日志 `location` 列，可据日志人工复原 |
| 回滚 | 见 §6.2 |

## 6. 部署与回滚

### 6.1 部署（运维/用户执行）

1. **前端（可先做，ff 拉取即生效，不影响运行中进程）**：`git pull` → 刷新门户/样品页（Ctrl+F5）。`index.html` 的 `bundle.js?v=` 已更新为 `bmu3he1a0`。
2. **后端（需重启）**：按 §23.2 由运维在**宝塔面板**执行「停止 → 启动」（AI 不代执行）。**本轮与 v2.0.7 的待执行重启合并为同一次，不新增重启次数**。
3. **重启后只读核对**（`admin` 会话，或 curl 带 cookie）：
   - `GET /health` → 200
   - `GET /api/subsystems` → samples `version=2.0.8`
   - `GET /api/samples/storage-map` → 响应中 **不含** `"gone"` 字段（已回退）
   - 进程：`ss -ltnp | grep :4000` → **单实例**；PID 应为重启后的新值（旧 PID `1742892` 应消失）
4. **服务器侧回归**：`cd /www/wwwroot/sample-mgmt && npx jest tests/samples-storage-map.test.js tests/samples-report.test.js tests/samples-report-render.test.js --forceExit` → 期望全绿（本地镜像是纯 clone 无依赖，故此项只能在服务器执行）。
5. **人工冒烟**：§4 的 6 步（步骤 1–4 属数据写入，请在**测试样品**上执行；samples 已上线，禁止造数）。

### 6.2 回滚

| 场景 | 操作 |
|---|---|
| 前端异常 | 将 `subsystems/samples/frontend/{index.html,js/bundle.js,js/views/*,css/module.css}` 回退到 `3ff5547^`（即 `89c8d9c`）后 `git checkout` 该路径并刷新；**无需重启** |
| 后端异常 | `git revert 8e96a8e 3ff5547`（保留历史，禁 `reset --hard`）→ 再走一次运维重启 |
| 仅需禁用自动释放 | 把 `releaseCabinet` 内的 `target.storage_location = null;` 注释并重启（等价恢复 v2.0.6 行为）|
| 数据修复 | 从 `scan_logs.location`（含被释放的原储位）恢复 `samples.storage_location`；备份基线见 v2.0.7 §4 |

## 7. 上线监控（1–3 个业务周期）

| 指标 | 观察点 | 期望 |
|---|---|---|
| 作废类日志 | `scan_logs` 中 `RETIRE_ONLY`/`FORCE_RETIRE`/`RETIRE_RECREATE`/`RECREATE_REPLACED` 的 `note` 是否含「，同步释放柜位」 | 有储位的样品 100% 带该后缀 |
| 残留 | `SELECT COUNT(*) FROM samples WHERE status='RETIRED' AND storage_location IS NOT NULL` | 恒为 **0**（新增残留 = 释放漏接） |
| 未入柜池 | 柜位视图顶部告警 `uncabineted` 是否出现「退回审核中且已指派研发」的样品 | 少量且短暂属**预期**；若长期滞留说明研发未及时创建替代品 |
| 柜位占用/空位 | 报表「在用」与柜位视图占用数 | 每次作废后对应 −1，与日志条数一致 |
| 异常 | `logger` 中 `/api/scan` 500/409、`CONFLICT` 频次 | 无新增 |

## 8. 遗留与拆分方案（容量体检）

| 文件 | 行数 | 字符(LF) | 占 20,000 | 顶层函数 | 状态 |
|---|---|---|---|---|---|
| `subsystems/samples/backend/scan-actions.js` | 312 | 17,615 | **88.1%** | 8 | 70% 线（停新增）；`applyAction` 199 行超 §7.2 单函数 60 行 |
| `subsystems/samples/frontend/js/views/scan.js` | 289 | 19,313 | **96.6%** | 10 | **越 90% 线**（改动前 95.4%）→ 仅允许精简/重构 |
| `subsystems/samples/frontend/js/views/report.js` | 308 | 15,619 | 78.1% | 16 | 函数 > 10 |
| `subsystems/samples/frontend/js/views/detail.js` | 255 | 14,071 | 70.4% | 19 | 函数 > 10 |
| `subsystems/samples/frontend/js/views/storage-loc-picker.js` | 211 | 10,299 | 51.5% | 12 | 函数 > 10 |
| `subsystems/samples/frontend/css/module.css` | 179 | 12,475 | 62.4% | — | 正常 |
| `subsystems/samples/frontend/js/views/storage-map.js` | 178 | 10,077 | 50.4% | 9 | 正常（较 v2.0.7 减 2.6 pt）|
| `subsystems/samples/frontend/js/views/scan-return-actions.js` | 44 | 3,699 | 18.5% | 2 | 正常 |
| `subsystems/samples/backend/routes-storage-map.js` | 123 | 7,114 | 35.6% | 4 | 正常（回退 −2.8 pt）|
| `subsystems/samples/frontend/js/views/help-data.js` | 133 | 6,719 | 33.6% | — | 正常 |
| `subsystems/samples/manifest.json` | 350 | 6,366 | 31.8% | — | 正常（17 转移）|
| `docs/operation-manual.md` | 925 | 24,929 | **124.6%** | — | 越 20,000 兜底线（较 v2.0.7 −2.3 pt，仍待拆分）|
| `docs/样品系统操作说明.md` | 297 | 6,913 | 34.6% | — | 正常 |
| `docs/archive/plans/2026-09-15-retired-cabinet-release.md` | 110 | 6,020 | 30.1% | — | 正常 |
| `tests/samples-storage-map.test.js` | 295 | 16,086 | 80.4% | — | 单元测试豁免（≤1000 行）|
| `subsystems/samples/frontend/js/bundle.js` | 3,880 | 252,630 字节 | — | — | 构建产物豁免（§19.3）|

**冗余与瘦身清单（未做，需你授权后单独迭代）**

1. **`scan.js` 最紧迫（96.6%）**：把表单取值块（`collectScanPayload` 一族，约 30 行 / 1.2k 字符）抽为 `scan-payload.js` → 预计降至 ~90.6%；再把 `SCAN_ACTION_CN_EXT`/`_SM_LOC_ACTIONS` 抽常量文件 → 可进 88% 以内。
2. `storage-map.js` 与 `storage-loc-picker.js` 的格位渲染仍有 `smRenderCell` / `smMapRenderCell` 两份近似实现 → 合并共享 `smCellHtml`。
3. `scan-actions.js`：`applyAction` 199 行为既存超长函数，建议按「生命周期族 / 保管族 / 退回族 / 作废族」拆为子执行器（本轮仅新增 1 个顶层函数，未恶化）。
4. `report.js`（16 函数）/ `detail.js`（19 函数）/ `storage-loc-picker.js`（12 函数）超 §7.2 顶层函数上限，需按视图域拆分。
5. `docs/operation-manual.md` 124.6%：建议把「治具/管制/项目/工作台」四章迁至各分册，总说明书只保留样品+索引。
6. `routes-storage-map.js` 的 `register` 92 行（既存）→ 按端点拆子注册函数。
7. `AGENTS.md` §13 现值/§3 发布清单仍为 `2.0.6`（连续两版待授权）。
