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
