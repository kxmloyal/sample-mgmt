# 治具清单 · 机型视图改造（方案A）设计与实施记录

- 版本：1.0（2026-09-03，已实施并上线前端；后端聚合接口待宝塔重启生效）
- 需求：治具清单呈现方式改造为**以机型显示/排列**，点击机型跳转到该机型下所有治具列表
- 方案：经链路评审后提供 4 个布局方案比选，用户选定 **方案A「机型卡片墙 + 视图切换」**；卡片信息密度选定 **状态分布徽章 + 呆滞标记 + 首图封面**
- 交付：commit `fa54523`（10 文件，+257/−14）

---

## 一、方案比选（评审结论）

| 方案 | 思路 | 优点 | 缺点 | 结论 |
|------|------|------|------|------|
| **A 卡片墙+视图切换** | 清单页新增「机型视图」模式，卡片网格展示机型，点击跳 `#/list?model=X` | 不破坏现有清单任何功能；深链可分享收藏；工程量最小；列表页所有筛选/排序/分页/导出能力零成本复用 | 多一次点击进入列表 | **✅ 选定** |
| B 单页分组表格 | 表格按机型分组渲染（组头可折叠） | 一页看全 | 与后端按行分页冲突，需一次性拉全量；机型增长后页面过长；list.js 渲染核心改动风险高 | 未选 |
| C 机型看板分列 | 仿看板横向分列，列内治具卡 | 可视化强，适合车间大屏 | 当前 18 机型横向溢出严重；信息密度低；工程量最大 | 未选 |
| D 左机型树+右表 | 左侧机型树点击刷新右侧表格 | 桌面端选择效率最高 | 窄屏需抽屉化适配；布局改动中等 | 未选 |

**链路评审关键发现**（支撑方案A）：
1. 后端 `/api/fixtures` 已支持 `model=` 筛选 + 分页 + 排序 + CSV 导出 → 机型跳转列表的数据层零改动；
2. `routeFixture()` 原**丢弃 hash 中 `?query`** → 深链不可用，需补路由解析（本次已修）；
3. `renderFixtureList()` 每次进入无条件重置全部筛选 → 深链预选机型需改重置时序（本次已修）；
4. fixtures 存在与 projects 同款 **bundle 缓存失配**（banner `vbmtldqewd` vs `?v=bmtkuakrd`）→ 本次重建同步（已修）。

---

## 二、实现设计

### 数据流
```
机型视图 #/models                          列表视图 #/list?model=X
┌─────────────────────┐   点卡片    ┌──────────────────────────┐
│ GET /api/fixtures/  │ ──────────→ │ GET /api/fixtures?model=X │
│ models?view=wall    │             │ （既有接口，含分页/筛选） │
│ 状态分布/呆滞/封面聚合│  ←返回按钮─ │ 筛选/排序/分页/CSV 全复用 │
└─────────────────────┘             └──────────────────────────┘
```

### 后端（`db/models-dao.js` + `backend/routes-fixtures.js`）
- `listModelsForWall(dormantDays)`：一次并行聚合三组数据合并进机型列表——
  - `status_stats`：`GROUP BY model, status` 状态分布；
  - `dormant_count`：呆滞口径与清单 `dormant=1` **完全一致**（`updated_at ≤ NOW()-阈值日` + 非领用停滞状态集合，阈值取 `fixtures_settings.dormant_days`，默认 60）；
  - `cover_photo`：每机型任一治具的首图（图片类目 `verify_photo/repair_photo/other` 取 `MIN(id)`）。
- 路由 `GET /api/fixtures/models?view=wall` 返回增强聚合；**不带参数保持原返回**（机型管理弹窗向后兼容，零影响）。

### 前端
- `router.js`：解析 hash query 到 `_fxRouteQuery`（`#/list?model=X` 深链）；注册 `#/models` 视图。
- `views/model-wall.js`（新文件）：卡片墙渲染 + 前端关键字过滤（机型短码/全称）；卡片点击 `location.hash='#/list?model=<code>'`。
- `views/list.js`：进入时消费 `_fxRouteQuery.model`（仅保留 model，重置其余筛选）；头部加「机型视图」切换；深链进入时显示**机型上下文条**（当前机型 + 「查看全部机型」/「← 机型视图」按钮）。
- `views/models.js`：机型全称编辑后按所在视图刷新（卡片墙或列表）。
- `css/module.css`：卡片墙响应式网格（`auto-fill minmax(240px,1fr)`，移动端 160px），呆滞机型警示边框（`--warn`）。
- `tools/bundle-sources.json`：加入 model-wall.js（bundle 18→19 文件）。

---

## 三、验证记录

- 语法：5 个 JS 文件 `node --check` 全通过；bundle-sources.json JSON 校验通过。
- 前端上线：HTTP 实测 bundle `vbmtlqsw6w`（19 files）= index.html `?v=bmtlqsw6w`；`renderFixtureModelWall`/`fx-wall-grid` 均在 bundle 中。
- 后端 DAO 实测（**测试库 sample_mgmt_test**，直接加载服务器上部署的 models-dao.js）：
  - 18 机型全部返回 `status_stats`/`dormant_count`/`cover_photo`；
  - 构造 90 天未更新的 MT-2000 → `dormant_count:1` ✅；
  - 构造 BGA-484 验证照片 → `cover_photo:'test.jpg'` ✅。
- Git：`fa54523` 已推 `origin/main`。

## 四、待办与提示

- ⚠️ **`?view=wall` 聚合接口需宝塔重启后生效**（当前进程仍返回旧格式，前端已上线但机型视图的数据增强待重启后可见；重启前卡片仍可显示计数，但状态徽章/呆滞/封面为空——前端已做空值兜底）。
- 呆滞测试数据仅写入测试库，生产库未动。
- 深链示例：`/subsystems/fixtures/frontend/index.html#/list?model=BGA-484` 可直接收藏/分享。
