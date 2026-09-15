# module.css 报表块外迁 report.css — 实现计划

| 项 | 内容 |
|---|---|
| 立项日期 | 2026-09-15（用户确认立项）|
| 状态 | **未开始（backlog）** |
| 目标文件 | `subsystems/samples/frontend/css/module.css` |
| 触发规则 | AGENTS.md §7.1「达 70% 上限 MUST 停止新增业务逻辑，输出拆分方案」 |

## 1. 触发证据（实测字符数）

| 时点 | 字符 | 占比 |
|---|---|---|
| `5daaa93` 原状 | 10,803 | 54.0% |
| `617b28d` 并发落地的报表块 `rpt-*`（方案甲）后 | 12,890 | 64.5% |
| `c3b75e7` 本方替代链块 `sm-chain*` 后（当前） | **14,355** | **71.8%** |

行数现状：202 行。

**关键结论**：两个提交**单独都没越线**（61.3% / 64.5%），**合并后才越过 70% 预警线**。故该文件自 `c3b75e7` 起禁止再追加任何规则，新增样式一律进新文件。

## 2. 拆分方案

| 批次 | 外迁内容 | 实测字符 | 外迁后 module.css |
|---|---|---|---|
| 第 1 批（本次） | `/* ═══ 样品报表 ═══ */` 起全部 `.rpt-*`（27 条规则 + 1 条 `@media(max-width:767px)`）| 1,933 | 12,422（**62.1%**）|
| 第 2 批（仅当再次破 70%） | `.sm-chain*`（替代链 Tab）| 1,463 | 10,959（54.8%）|

第 2 批不必现在做：第 1 批已回到 62.1%，留有余量。

## 3. 实施步骤

1. 新建 `subsystems/samples/frontend/css/report.css`，把 `module.css` 中报表块**整体、逐行**搬入（不改选择器名、不改任何视觉值、不重排属性）。
2. 在 `subsystems/samples/frontend/index.html` 中，**于 `module.css` 的 `<link>` 之后**追加：
   `<link rel="stylesheet" href="/subsystems/samples/frontend/css/report.css?v=<ver>" />`
   - 依据 AGENTS.md §19.3：该节仅约束 `<script>` 数量（恰好 2 个），样式表链接不受此限。
   - 依据 AGENTS.md §17.5：子系统专属样式写本子系统 css 目录，合协议。
   - **顺序必须在 `module.css` 之后**，以保持拆分前的层叠覆盖关系不变。
3. 版本号 `?v=` 取构建脚本产出的 VER（与 bundle 同源），避免浏览器缓存旧样式。
4. 按第 4 节回归，按第 5 节核对风险项。
5. 更新 AGENTS.md §14 / CLAUDE.md §6 的 `module.css` 容量条目 —— **本项需用户明确授权**（规则文件禁擅自改）。

## 4. 验收标准

| id | 标准 | 验收方式 |
|---|---|---|
| A1 | `module.css` ≤ 13,000 字符（≤65%） | 实测 LF 归一字符数 |
| A2 | `tests/samples-report-render.test.js` 9 项渲染契约全部 PASS | 项目 jest（本地无 node_modules 时用桩 runner）|
| A3 | `subsystems/samples/frontend/index.html` 仍恰好 2 个 `<script>` | 计数 |
| A4 | 报表页 / 柜位视图 / 机型视图 / 替代链 Tab 视觉与拆分前一致 | 同分辨率截图逐区比对 |
| A5 | `.rpt-*` 未进入 `public/css/app.css` 或其它子系统 | 全仓检索 |

## 5. 风险与缓解

| id | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 样式表顺序改变导致层叠覆盖失效 | 中 | `report.css` 置于 `module.css` 之后；纯搬迁不重排 |
| R2 | 新增 CSS 无版本号 → 浏览器缓存旧样式 | 低 | 与新 bundle 同一 VER |
| R3 | 误判需双系统回归 | 低 | `module.css` / `report.css` 是 samples 专属文件，§6.1「共享资源」不适用；仅需 samples 回归 |

## 6. 明确不做

- 不改任何选择器命名、不改颜色/尺寸/断点数值（纯物理搬迁）。
- 不动 `public/css/app.css`（该文件已 109.6%，超 20000 字符红线）。
- 不合并 `.sm-chain*`（留待第 2 批）。

## 7. 实施记录（2026-09-15 完成）

| 项 | 实施前 | 实施后 |
|---|---|---|
| `css/module.css` | 202 行 / 14,355 字符（**71.8%**，越 §7.1 预警线）| **179 行 / 12,476 字符（62.4%）** |
| `css/report.css` | 不存在 | **33 行 / 2,470 字符（12.4%）** |
| `index.html` 样式引用 | 1 个自有 CSS | 2 个（在 `module.css` **之后**追加 `report.css`，层叠顺序不变）|
| samples 资源版本 | `bmu2aignx` | **`bmu2cu8zb`**（重建 bundle，头部逐行与旧版仅差版本号）|

**改动文件（6 个）**：新增 `subsystems/samples/frontend/css/report.css`；修改 `css/module.css`（移除原 L158-183 报表块 26 行，替换为指针注释）、`frontend/index.html`（新增 `<link>` + 三处 `?v=`）、`tools/build-bundles.js`（CSS 版本刷新正则扩面）、`tests/samples-report.test.js`（样式归属断言改指 report.css + 新增顺序断言）、`js/bundle.js`（重建）。

**验收对照（第 4 节）**

| id | 标准 | 实测 | 结论 |
|---|---|---|---|
| A1 | `module.css` ≤ 13,000 字符（≤65%）| 12,476（62.4%）| **PASS** |
| A2 | 报表渲染契约 9 项仍 PASS | 三套件 **38/38** 全绿 | **PASS** |
| A3 | `index.html` 仍恰好 2 个 `<script>` | 2 | **PASS** |
| A4 | 报表页视觉与拆分前一致 | 纯搬迁，未改选择器/视觉值；**待人工截图复核** | 待人工 |
| A5 | `.rpt-` 未进入 `app.css` 或其它子系统 | `app.css` 0 处；仅 samples 的 `report.css` 有 28 处 | **PASS** |

**等价性证据**：搬迁前原块 26 行逐行核对，**未出现在 `report.css` 的行数 = 0**；`report.css` 中 `.rpt-` 出现 **28 次**，与原 `module.css` 完全一致；花括号平衡（`module.css` 130/130、`report.css` 25/25）；新 bundle 与 HEAD 版**逐行仅差头部版本号 1 行**，`[MISSING]`=0。

**工具变更理由（`tools/build-bundles.js`）**：原正则 `(module\.css\?v=)` 只刷新 `module.css`，拆分后 `report.css` 会长期吃旧缓存 —— 而这正是该机制 2026-09-09 诞生的原因（旧实证：`module.css` 固定 `v=` 导致候选面板样式不生效）。新正则把范围限定为「子系统自有 CSS」：`(/subsystems/[a-z0-9-]+/frontend/css/[a-z0-9-]+\.css\?v=)([A-Za-z0-9]+)`（加 `g`），**不触及共享 `/css/app.css`**（后者使用独立的 `v=20260805b` 体系）。实测：脚本运行后 samples 的 **`module.css` 与 `report.css` 同时**刷新为新 VER；其余 4 个子系统的 `index.html` 被脚本刷新后已按 §6.1 隔离原则**回退**，其版本仍为旧值，未受本次影响。

**回归影响面**：`tests/samples-report-render.test.js`（9 项）**不读取 CSS 文件**，不受影响；`views/report.js` 的 42 处 `rpt-` 均为类名使用，零改动；后端与数据库零改动（纯前端样式搬迁）。

**遗留（需用户授权后处理）**：`AGENTS.md` §3 目录树与 §17.2 将子系统 CSS 描述为「`frontend/css/module.css`」单文件，未涵盖「一个子系统可有多个自有 CSS」。规则文件禁擅自修改，建议后续单独一次文档同步提交：把该处改为 `css/*.css`（可多个）或在树中补 `report.css`。
