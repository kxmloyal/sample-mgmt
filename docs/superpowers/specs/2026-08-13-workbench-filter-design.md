# 全局工作台筛选功能优化 设计文档

> 日期：2026-08-13
> 状态：已确认（方案 A：服务端 SQL 筛选 + 分页 + 等级后端计算）
> 关联：AGENTS.md §11 API 约定、§7 容量红线、§19 bundle 构建、子系统隔离 §6.1

## 1. 背景与痛点

全局工作台（workbench）合并样品 + 治具活跃数据，当前筛选为**纯前端内存过滤**：

| 痛点 | 现状 | 影响 |
|---|---|---|
| 筛选结果不完整 | 后端 `GET /api/workbench` 默认分页 200 条（上限 500），前端只在这批数据内 `doFilter()` 隐藏 DOM 行 | 数据量增长后筛选漏项，跨部门监控失真 |
| 筛选维度不足 | 仅类型下拉 / 积压等级下拉 / 部门卡单击 | 无法按申请部门、关键字、阶段、呆滞、停留时长筛选 |
| 交互体验不足 | 无结果计数、无一键清除、无分页 UI（后端分页闲置）、筛选状态刷新丢失、部门只能单选 | 使用不便 |

## 2. 目标与方案（已确认方案 A）

**核心目标**：筛选下推服务端（SQL 过滤基础维度 + 后端 JS 计算积压等级），分页返回，彻底解决截断漏项；扩展筛选维度；增强交互。

**等级计算下沉后端**（关键决策 ①）：`calcOverdue` 逻辑（overdue.js L42-62 + `_sampleOverdueHours/_sampleOverdueReason/_fixtureOverdue`）迁移为后端独立 service `workbench-overdue.js`，作为**单一事实来源**；后端返回 `overdue_level/overdue_label/overdue_hours/overdue_reason` 字段，前端列表直接渲染，不再自行计算。前端 `calcOverdue` 仅保留给阈值弹窗的**临时阈值实时预览**（保存前本地重算，无法走后端）。

## 3. 后端设计

### 3.1 新文件 `subsystems/workbench/db/workbench-overdue.js`（Service，≤400 行）

迁移前端 overdue.js 的等级计算（逻辑不变，函数签名适配后端）：

```js
// 迁移自 frontend/js/views/overdue.js（权威版本），阈值由调用方传入
function calcOverdue(item, cfg) // → { level, label, hours, reason }
function tierLabels(b)          // → {0:'≤N天', 1:'N~M天', 2:'>M天'}
```

- 输入 item 字段：`item_type/status/dwell_hours/next_inspect_at/expected_return_at/expected_finish_at/next_maintenance_at/repair_requested_at/stage_cn`
- 逻辑分支与 overdue.js 完全一致（样品 4 分支含 NEW/PRODUCED 阈值放大 3 倍；治具 6 分支含 expected_finish_at 优先、repair_requested_at 兜底、next_maintenance_at 保养逾期）
- 阈值 cfg：`{ warn, bad }`（小时，取自 workbench_settings，默认 72/168）

### 3.2 `workbench-queries.js` 改造

- 保留 `unionSQL` 基础（输出列已含 `resp_dept/apply_dept/stage_cn/dwell_hours/status/dormant_days` 等全部筛选维度）
- 新增 `buildWorkbenchSQL(filters)`：`SELECT * FROM (unionSQL) AS wb WHERE 1=1 [AND item_type=?] [AND resp_dept=?] [AND apply_dept=?] [AND (item_no LIKE ? OR name LIKE ?)] [AND stage_cn=?] [AND dormant_days IS NOT NULL] [AND dwell_hours>=?] [AND dwell_hours<=?]`，返回 `{ sql, params }`（全部参数化，防注入）
- **等级 level 不做 SQL 过滤**：由 3.1 服务层 JS 计算后过滤（派生值，SQL CASE 双份逻辑风险高，不采用）
- 数据量保护：基础过滤结果一次性取出（活跃数据量级内网可接受），JS 计算等级 → 排序 → 服务端分页

### 3.3 路由 `/api/workbench` 改造（backend/index.js）

**入参**（GET Query，均可选）：

| 参数 | 校验 | 说明 |
|---|---|---|
| `type` | `sample`/`fixture` | 类型 |
| `level` | `0`/`1`/`2` | 积压等级（后端 JS 算后过滤） |
| `dept` | 字符串 | 负责部门（部门卡联动） |
| `apply_dept` | 字符串 | 申请部门 |
| `keyword` | 字符串，≤50 字符 | 编号/名称模糊 |
| `stage` | 字符串 | 阶段中文（stage_cn 精确） |
| `dormant` | `1` | 仅呆滞（dormant_days 非空） |
| `min_hours`/`max_hours` | 非负整数 | 停留时长范围 |
| `limit` | 1~500 钳制，默认 50 | 页大小 |
| `offset` | ≥0，默认 0 | 偏移 |

**流程**：解析校验参数 → `buildWorkbenchSQL` 基础过滤（全量）→ 遍历 `calcOverdue(item, settings)` 附加等级字段 → level 过滤 → 按 `level DESC, dwell_hours DESC` 排序 → `total`（过滤后总数）+ `deptStats`（部门聚合：total/d3in/d37/d7，用于统计卡，不受分页影响）+ `summaryStats`（总计/三档/呆滞计数）→ 分页切片 items → 响应：

```json
{
  "items": [...], "total": 100, "limit": 50, "offset": 0,
  "summary": { "total": 100, "d3in": 30, "d37": 40, "d7": 30, "dormant": 5 },
  "deptStats": [ { "dept": "研发部", "total": 40, "d3in": 10, "d37": 15, "d7": 15 } ]
}
```

**错误处理**：参数非法 → `400 { error }`；查询异常 → `500 { error }`（沿用现有 try-catch 模式）。**统计卡数据由后端计算**（前端不再遍历当前页统计），保证分页下统计准确。

### 3.4 性能说明

- 基础过滤结果集 = 活跃数据（样品 6 状态 + 治具 11 状态），内网规模（数百~数千）可一次性 JS 处理，无全表扫描风险（两表状态列可走索引，现状已如此）
- 等级计算 O(n)、排序 O(n log n)，n=活跃数据量，开销可控

## 4. 前端设计

### 4.1 `views/dashboard.js` 改造（现 214 行 → 拆分防膨胀）

**筛选状态**：`_wbFilter = { type, level, dept, apply_dept, keyword, stage, dormant, min_hours, max_hours, limit, offset }`（offset 默认 0）

**数据流**：筛选变化 → 更新 `_wbFilter` + 写 `location.hash` → `renderWorkbenchDashboard()` 读 hash 解析筛选 → 带参请求 `/api/workbench` → 渲染（统计卡 + 筛选栏 + 表格 + 分页）

**渲染**：
- 统计卡：直接用 `summary`/`deptStats` 渲染（不再遍历 items）
- 行渲染：`item.overdue_level/overdue_label/overdue_reason` 直接取自后端；`OVERDUE_STYLES` 保留（颜色映射）
- 表格行 `data-*` 属性保留（阈值弹窗预览依赖？——预览改用后端样本，见 4.3）

**拆分**（红线 400 行 / 顶层函数 ≤10）：
- 新增 `views/wb-filter.js`：筛选栏渲染 `renderWbFilterBar()`、分页渲染 `renderWbPager()`、hash 解析/序列化 `parseWbHash/serializeWbHash`
- dashboard.js 保留：主流程、统计卡渲染、表格渲染、部门卡交互、阈值联动

### 4.2 筛选栏扩展

- 搜索框（编号/名称）+ 类型/等级/负责部门/申请部门/阶段下拉 + 呆滞开关 + 停留时长范围（min/max 数字输入）+ 刷新
- 「共 N 条」结果计数 + 「清除筛选」按钮（复位全部筛选 + 部门卡 active 态）
- 部门卡单击 → 设置 `_wbFilter.dept` → 重载（取消前端 DOM 过滤 doFilter）

### 4.3 阈值弹窗兼容（关键决策 ②）

- 打开 `openThresholdModal()` 时：若当前筛选非空，先以「无筛选 + limit=500」拉一次全量样本存入 `_wbItems` 供预览（避免预览范围被筛选/分页截断）
- 弹窗标题标注「按当前阈值，当前活跃数据样本 N 条（≤500）的分布」；>500 条极端场景为近似值（文档标注局限）
- 保存阈值后 `renderWorkbenchDashboard(true)` 重载（沿用现状）

### 4.4 筛选状态持久化（location.hash）

- 每次筛选变化序列化 `#type=sample&level=2&dept=%E7%A0%94%E5%8F%91%E9%83%A8...` 写入 hash
- 页面加载/刷新时从 hash 解析恢复筛选与分页（刷新不丢）
- 兼容：无 hash = 默认全量

### 4.5 分页控件

- 上一页/下一页 + 页码/总数（对齐治具列表 `lkPager` 风格），limit=50 每页
- 翻页仅改 `offset` 重载，保留其余筛选

## 5. bundle 构建（AGENTS.md §19）

- 变更 `subsystems/workbench/frontend/js/` 下 JS → 必须 `node tools/build-bundles.js` + 复制 `bundle-workbench.js` + 更新 `index.html?v=` 版本号

## 6. 兼容性与全链路影响

| 维度 | 影响 | 处理 |
|---|---|---|
| 代码 | workbench-queries.js / backend/index.js / dashboard.js + 新增 overdue service / wb-filter.js | 内部改造，不涉及他系统 |
| 接口 | `/api/workbench` 响应新增 `summary/deptStats` 字段与行 `overdue_*` 字段 | 仅工作台前端消费；**保留旧字段**（items/total/limit/offset）兼容；threshold.js 依赖 `_wbItems` 字段不变 |
| 配置 | 无 | — |
| SQL | 无表结构变更 | — |
| 文档 | README API 表 `/api/workbench` 参数说明、操作说明书 | 同步更新 |
| 子系统隔离 | 仅 workbench 内部文件 + bundle；不动 app.css 共享类 | 其他子系统零影响 |

**遗留兼容**：前端 overdue.js 保留 calcOverdue（阈值预览专用），与后端 service 逻辑一致的维护约束写入代码注释（后端为权威）。

## 7. 测试策略

1. **`tests/workbench-overdue.test.js`**（新）：迁移一致性——用前端 overdue.js 原逻辑的已知输入输出用例（样品 RETURNING/RELEASED 复检逾期/NEW 放大 3 倍、治具 IN_USE 归还逾期/ACCEPTED 制作超期/REPAIRING expected_finish_at 优先与 repair_requested_at 兜底/保养逾期/无期停留）验证后端 `calcOverdue` 输出
2. **`tests/workbench-filter.test.js`**（新）：接口测试——各筛选参数生效、level 服务端过滤正确、keyword/时长/呆滞/阶段、分页 total 与统计卡数据正确、非法参数 400、limit 钳制
3. **前端 browser 验证**：筛选联动、计数、清除、分页、hash 刷新恢复、部门卡联动、阈值弹窗预览

## 8. 容量红线

| 文件 | 现 | 目标 | 约束 |
|---|---|---|---|
| workbench-overdue.js（新） | — | ≤400 行 | Service |
| workbench-queries.js | 119 行 | 增长可控（buildWorkbenchSQL） | ≤400 行 |
| backend/index.js | 90 行 | ~150 行 | Controller ≤400 行 |
| dashboard.js | 214 行 | 拆分后 ≤300 行 | 顶层函数 ≤10 |
| wb-filter.js（新） | — | ≤200 行 | utils/视图 |

## 9. 部署/回滚

- 部署：改后 `node tools/build-bundles.js` → 复制 bundle → 重启服务（kill 4000 PID + www 身份重启）
- 回滚：git revert 相关 commit + 重建旧 bundle + 重启；无数据迁移
- 上线后 1~3 周期监控：`/api/workbench` 响应时长、4xx 参数异常日志
