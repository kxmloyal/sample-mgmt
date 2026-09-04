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

- [x] 一期实施 + 部署（bundle v=bmtms2rmm，css v=20260905a）+ 回归（提交 2998c78）
- [x] 二期实施（见 §六）
- 一期期间用户重启过一次后端（18:01，纯前端本不需重启）

## 六、二期：后端 view=wall 聚合（2026-09-05）

### 依赖清单（实施前已核）
| 点位 | 结论 |
|---|---|
| `/api/samples/models` 调用方 ×4（models 管理 / new 下拉 / list 筛选下拉 / 机型墙） | 仅 `view=wall` 分支聚合返回；无参调用行为与结构不变 |
| `D=require('../../../db')` 装配方式 | db.js `scanDao()` 按 `Object.keys(dao)` 展平透传 → 新增 DAO 方法自动暴露，无需改 db.js |
| DAO 方法名跨子系统冲突 | 服务器现存 5 个 dao.js 均无 `aggregateModelsWall` 命名 → 无冲突；**注意**：db.js 冲突改名机制会加子系统前缀，治具后续做同款聚合须错开命名（如 aggregateFixtureModelsWall） |
| 样品图片路径格式 | 前端列表/详情均直接 `<img src=e(s.produced_image||s.image)>` → 存完整 URL 路径，封面可直接用 |
| 逾期口径 | 复检=dao.js ISO_UTC 规范化+IN_CUSTODY；领用超时=同法+CHECKED_OUT+expected_return_at（listCheckoutOverdue 同款）；聚合 SQL 逐字对齐 |
| 缓存 | 新键 `sl_sample_models_wall` 加入 MODEL_CACHE_KEYS → POST/DELETE 机型即时失效 |

### 变更内容
- db/dao.js：+`aggregateModelsWall()`（两条 GROUP BY 只读 SQL，Promise.all 合并；封面取 MIN(id|图) 解析为 {id,photo}）
- routes-samples-models.js：GET models 入口 `view=wall` 增量分支（主数据左联聚合，缺省补 0/空）；缓存键同步失效
- views/model-wall.js：优先聚合渲染（状态徽章/复检逾期红标/领用超时橙标/封面图/汇总行）；旧后端返回纯主数据时自动回退一期并发计数
- css/module.css：+徽章/角标/红边样式段（css `?v=20260905b`）

### 兼容与回滚
- 前端先上：旧后端（忽略 view 参数）→ 自动一期渲染，**零中断**；后端重启后自动升级
- 回滚 = git revert 后端两文件（聚合为纯增量，无 schema 变更）；前端检测不到 sample_count 自动降级
- **生效条件：宝塔重启 node 进程**（重启前 wall 页保持一期形态）

### 验证记录
- DAO 级：假依赖单测（q 桩按 SQL 区分两结果集）断言 sample_count/overdue/cover 解析/status_stats 合并 —— 部署脚本内联执行
- 路由级：静态断言（view=wall 分支 / D.aggregateModelsWall 调用 / 聚合缓存键）+ `node --check`（模块 require 依赖运行时 DB 环境，接口行为留待重启后实测）
- 静态链路：线上 bundle 含 smw-badge/has-overdue/checkout_overdue；css 含新段
- 重启后待验：`GET /api/samples/models?view=wall`（登录态）返回 sample_count>0 且含 status_stats；机型墙显示徽章（回退消失）
