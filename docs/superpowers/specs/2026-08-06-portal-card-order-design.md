# 门户入口卡片个性化排列 设计文档

> 状态：已确认设计（2026-08-06）
> 关联计划：`docs/superpowers/plans/2026-08-06-portal-card-order.md`（待产出）
> 适用子系统：框架级功能（门户 portal.html，不绑定任一子系统）

## 1. 背景与目标

门户页（`public/portal.html`）以入口卡片形式展示所有已注册子系统，当前卡片顺序完全由 `GET /api/subsystems` 返回顺序决定，而该顺序来自 `fs.readdirSync` 扫描 `subsystems/` 目录的文件系统顺序——**不可控、不可定制**。随着子系统增多（当前 4 个，未来持续新增），不同岗位用户对「最常用子系统置顶」的诉求越来越强烈。

**目标**：为用户提供**用户级个人排序**能力——每个登录用户可自定义门户卡片显示顺序，偏好按用户持久化；未配置用户与新增子系统的行为与现状完全一致（默认顺序排尾）。

**非目标**（本次明确排除）：
- 不做「隐藏不常用子系统卡片」能力（仅排序）
- 不做使用频率自动排序（无埋点）
- 不做系统级全局排序配置（管理员统一顺序）
- 不做多端实时同步（以最后一次保存为准）

## 2. 澄清记录（用户决策）

| 问题 | 决策 | 理由 |
|---|---|---|
| 排序方式 | 用户级个人排序 | 各岗位使用偏好不同，个人优先 |
| 交互形式 | 编辑模式开关 + 拖拽手柄（方案 C） | 日常浏览防误触，进入编辑态才可拖 |
| 保存机制 | 编辑后手动保存（统一提交一次） | 避免拖动即写库的频繁请求 |
| 编辑能力 | 仅排序，无隐藏 | YAGNI，简洁优先 |
| 存储位置 | 独立偏好表 `user_portal_prefs` | 不侵入 users 表及登录/用户管理/批量导入导出链路 |

## 3. 现状分析

- [portal.html](file:///www/wwwroot/sample-mgmt/public/portal.html#L43-L64)：`fetch('/api/subsystems')` 后按返回顺序 `map` 渲染 `.portal-card`，无任何排序/个性化逻辑
- [routes/subsystems.js](file:///www/wwwroot/sample-mgmt/routes/subsystems.js#L36-L49)：`Object.values(registry)` 顺序 = `fs.readdirSync` 目录扫描顺序，新建子系统目录会出现在不可预期位置
- manifest 无 `order`/`sort` 字段，四个子系统 manifest 均未声明顺序

## 4. 方案设计

### 4.1 数据层：`user_portal_prefs` 表（框架级，db.js 建表）

```sql
CREATE TABLE IF NOT EXISTS user_portal_prefs (
  user_id INT PRIMARY KEY,
  portal_order JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- `portal_order`：子系统 id 有序数组，如 `["fixtures","samples","workbench","projects"]`
- 外键级联删除：用户删除时偏好自动清理，无孤儿数据

### 4.2 API（框架公共路由 `routes/misc.js`，requireAuth）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/portal/prefs` | 返回 `{ order: [...] }`；无记录返回 `{ order: [] }` |
| PUT | `/api/portal/prefs` | body `{ order: [...] }` → upsert；`{ order: [] }` 或 `{ order: null }` 清除偏好（DELETE 语义） |

**PUT 校验规则**（非法均 400）：
1. order 必须为数组
2. 元素去重（重复 id 以首次出现为准）
3. 只允许已注册子系统 id（`routes/subsystems.js` 的 registry）
4. 长度 ≤ 当前已注册子系统总数

**兼容性**：`GET /api/subsystems` 返回格式与顺序完全不变（排序合并放前端），无下游影响。

### 4.3 前端 portal.html（交互与数据流）

**加载合并算法**：
1. 并行拉取 `GET /api/subsystems`（默认顺序）+ `GET /api/portal/prefs`
2. 合并：prefs 中存在的 id 按用户顺序置前；未在 prefs 中的子系统按默认顺序追加排尾
3. 渲染卡片（icon/name/desc/action 结构不变）

**编辑模式状态机**：

| 状态 | 行为 |
|---|---|
| 浏览态（默认） | 卡片不可拖，布局与现状完全一致 |
| 点「编辑排列」 | 按钮区变为「保存顺序」「取消」；每卡右上角出现拖拽手柄 ⋮⋮；卡片 `draggable=true`，hover 上浮提示可拖 |
| 拖动换位 | HTML5 DnD（dragstart/dragover/drop）交换顺序，实时预览，仅内存不写库 |
| 点「保存顺序」 | `PUT /api/portal/prefs` → 成功 toast「已保存排列顺序」→ 恢复浏览态；失败 toast「保存失败，请重试」→ **停留在编辑态**（不丢已拖顺序） |
| 点「取消」 | 丢弃未保存调整，恢复浏览态 |

**拖拽实现细节**：
- 原生 HTML5 Drag & Drop，无第三方库
- 编辑态卡片 `draggable=true`，拖放目标 `dragover` 虚线占位高亮
- 触屏端依赖浏览器原生 touch 拖拽能力（桌面端为主，不额外实现箭头 fallback）
- 保存前前端自校验：以当前渲染的子系统 id 集合为准，防止提交非法 id

**入口位置**：`welcome-sub` 区域右侧「编辑排列」文字按钮（登录用户可见；portal 整体需登录访问）。

### 4.4 样式

- 门户为框架级页面，编辑模式相关样式（手柄、占位高亮、按钮态）写入 `public/css/app.css` 门户区块
- 遵循 §18 卡片设计 token（`--card-shadow-hover`、`.portal-card`、hover 上浮），不硬编码圆角/阴影
- 响应式沿用现有 `.portal-cards` 5 档断点，小屏手柄缩小为 16px 图标不破坏布局

## 5. 测试计划（TDD）

### 5.1 后端单测 `tests/portal-prefs.test.js`

| 用例 | 断言 |
|---|---|
| 未登录 GET | 401 |
| 未登录 PUT | 401 |
| GET 无记录 | 200 且 `{ order: [] }` |
| PUT upsert → GET | 返回一致顺序 |
| PUT 非法 id（不存在的子系统） | 400 |
| PUT 重复 id | 200 且去重 |
| PUT `{order:[]}` 清除 | GET 返回 `{ order: [] }` |
| PUT `{order:null}` 清除 | GET 返回 `{ order: [] }` |
| 用户隔离 | A 保存顺序不影响 B 的 GET |
| PUT 非数组 | 400 |

### 5.2 端到端（browser_use）

登录 → 门户「编辑排列」→ 拖拽换位 → 保存 → 刷新 → 顺序保持；取消不生效；未配置用户顺序与默认一致。

### 5.3 上线保护说明

`user_portal_prefs` 为门户配置表，非子系统业务数据，不受 AGENTS.md §20 保护限制；samples 已上线不影响本功能测试（不触碰 samples/scan_logs/sample_models 数据）。

## 6. 文档同步

- AGENTS.md：目录结构（`user_portal_prefs` 表）+ API 表（2 个端点）+ 「门户个性化排列」说明小节
- README.md：功能说明
- docs/operation-manual.md：操作说明「门户卡片个性化排列」（编辑入口、保存/取消、默认行为）
- 数据库表清单同步（§12 数据库约定）

## 7. 风险与兼容性

| 项 | 说明 |
|---|---|
| API 兼容 | `GET /api/subsystems` 顺序不变，仅前端合并排序，无下游调用方受影响 |
| 数据变更 | 仅新增表，无字段删除/改名，低风险 |
| 依赖 | 原生 HTML5 DnD，无新增第三方依赖 |
| 并发 | 同一用户两次编辑以最后一次保存为准，不做版本控制（YAGNI） |
| 回滚 | 删除新增 API 与表即可回滚，门户回到默认顺序 |

**上线后监控（1~3 周期）**：prefs 表写入量、`PUT /api/portal/prefs` 报错率、多端/换浏览器后顺序一致性。

## 8. 变更记录

| 日期 | 变更 |
|---|---|
| 2026-08-06 | 初始设计（brainstorming），用户确认：用户级排序 / 编辑模式拖拽 / 手动保存 / 仅排序 / 独立偏好表 |
