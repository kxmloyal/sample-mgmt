# 样品列表角色默认筛选（2026-09-07）

## 需求（用户原话口径）

不同角色打开样品列表时，**数据本身按角色优先显示**（如保管部门优先显示「保管中」），而非全员同一视图。已确认三点：

1. **优先显示 + 可看全部**：默认按角色状态过滤，一键清除看全量，数据不隐藏；
2. **角色映射**：RD→NEW；QA→PRODUCED,RETURNING；CUSTODY/ME→IN_CUSTODY；ADMIN→不过滤（全量最新优先）；
3. 部署：纯前端即可（复用既有 status 多值参数），后端零改动；交付时提醒重启与否（本次无需）。

## 设计（最小改动）

- **list.js** `viewSamples()` 无深链时不再 `loadSamples()`，改调 `loadSamplesWithStatus(ROLE_DEFAULT_STATUS[me.role])`；深链 `?status=`/`?model=` 优先（用户意图优先于角色默认）。新增全局 `ROLE_DEFAULT_STATUS` 映射 + `_roleDefaultApplied` 标记（本次会话内角色默认已应用/已清除状态，用于芯片渲染）。
- **list-filter.js**：
  - 新增 `_roleStatusLabel()`（多状态映射中文，逗号串拆开逐个翻译）；
  - `renderChips()`：`_roleDefaultApplied` 时渲染「已按角色优先显示：保管中 ✕」橙色提示芯片（点击清除回全量）；状态下拉多值（如 PRODUCED,RETURNING）时同样拆开翻译显示；普通状态下拉芯片逻辑不变；
  - `quickFilter('pending')` 保持角色映射，但加 `_roleDefaultApplied=false`（用户主动点击=明确意图，覆盖角色默认提示）。
- 深链进入（带 status= 或 model=）时 `_roleDefaultApplied=false`（用户意图优先，不显示角色默认芯片）。
- **不改动**：后端路由/DAO、列渲染（list-render.js）、CSV 导出、其它视图。

## 角色映射表

| 角色 | 默认状态过滤 | 语义 |
|---|---|---|
| RD | NEW | 研发优先处理待制作 |
| QA | PRODUCED,RETURNING | 品保优先处理待发行与退回审核 |
| CUSTODY / ME | IN_CUSTODY | 保管/生技优先看在库样品 |
| ADMIN / 未知 | （不过滤） | 全量最新优先 |

## 风险与验证

- 风险：多状态值含逗号需 encodeURIComponent（loadSamplesWithStatus 基础上不变——现有深链 status 已按逗号串透传，后端 IN 支持多值）。
- 验证：node --check；4 角色分支逻辑审查（含深链覆盖）；服务器真实请求只读验证；bundle 重建部署；移动端芯片换行不破版。
- 回滚：单 commit revert + 重建 bundle（无 DB/后端变更）。
