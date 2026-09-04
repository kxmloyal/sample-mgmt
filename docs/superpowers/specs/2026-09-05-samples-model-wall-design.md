# 样品子系统「机型视图」一期设计（2026-09-05）

- 模式来源：治具 model-wall（fx-wall-*）→ 样品 smw-*（前缀独立，样式不复用治具 module.css）
- 范围：**纯前端，零后端改动，零重启**（一期评估结论落地）

## 一、依赖清单（变更前置）

| 点位 | 结论 |
|---|---|
| `/api/samples/models` | 现有接口直接复用（code/full_name 主数据） |
| `/api/samples?model=X&limit=1` | 现有列表接口，响应含 total → 卡片样品数；失败降级「—」 |
| `/api/samples` 后端 `model=` 过滤 | 已存在（listSamples filterOpts.model），零改动 |
| 样品列表机型筛选 | `#f-model` 下拉 + chips 已存在（list-filter.js L18/L59），零改动 |
| 路由深链 | router.js `route()` 保持丢弃 query 不变；深链消费在 viewSamples 内正则直读 hash（与 2026-09-05 领用会话的 status 深链同款模式） |
| bundle-sources.json | samples 数组登记 model-wall.js（置于 list-render.js 后、router.js 前） |
| 样式 | samples module.css 尾部追加 smw-* 段；module.css 有独立 `?v=`，同步更新 |

## 二、交互设计

- 新导航「机型视图」（`#/wall`，全角色同样品列表）；列表页工具栏加「机型视图」切换按钮，机型墙有「列表视图」返回
- 卡片：机型短码 + 全称 + 样品数；点击 → `#/samples?model=<code>` → 下拉预选（异步注册重试赋值，同 projects list 预选模式）→ chips 显示"机型 X ✕"
- 顶部搜索框按短码/全称前端过滤；计数请求并发（机型量级几十）失败不阻断（显示 —，汇总行提示 N 个机型计数不可用）
- 治具已踩的坑沿用规避：视图切换一律走 `location.hash`，禁止直调渲染函数

## 三、文件清单

| 文件 | 变更 |
|---|---|
| views/model-wall.js | 新增（一期 ~85 行） |
| router.js | NAV/VIEWS/meta 各 +wall 项 |
| views/list.js | 工具栏 +机型视图按钮；viewSamples 深链 else-if 分支 |
| css/module.css | 尾部 +smw-* 样式段（`?v=` 同步） |
| tools/bundle-sources.json | samples 数组 +model-wall.js |

## 四、回归口径

1. 导航/列表按钮双入口进机型墙；「列表视图」返回
2. 卡片样品数与列表按机型筛选总数一致；计数失败显示 —
3. 点卡 → 样品列表机型下拉预选 + chips → 清除 chip 恢复全量
4. 搜索过滤/空态/无机型空态（RD/ADMIN 有引导文案）
5. status 深链（并行会话新增）回归不破坏：`#/samples?status=X` 仍生效
6. 其余 4 子系统 bundle 与 `?v=` 未变

## 五、状态

- [x] 实施 + 部署（bundle v=见提交）+ 回归
- 二期（后端 view=wall 聚合 + 状态徽章 + 复检逾期红标 + 封面图）：待用户安排宝塔重启窗口
