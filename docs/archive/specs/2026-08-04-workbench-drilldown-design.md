# 全局工作台信息下钻设计文档

> 日期：2026-08-04
> 状态：已确认
> 关联子系统：全局工作台（workbench）

## 1. 背景与目标

全局工作台表格当前仅展示概要字段（编号/名称/类型/阶段/部门/停留/积压状态），用户无法在工作台内查看某条项目的完整信息与流转历史，需跳转到对应子系统才能查看。

**目标**：点击工作台表格行 → 弹出详情弹窗，展示「基本信息 + 完整流转日志」，并提供跳转对应子系统扫码台的入口，实现跨部门监控下的快速下钻。

## 2. 方案选型结论

| 对比项 | 方案 A：工作台弹窗（选定） | 方案 B：跳转子系统详情 | 方案 C：行内嵌展开 |
|---|---|---|---|
| 交互 | 共享 modal 弹窗 | 新标签页 | 行下方展开 |
| 复用 | 详情 API + 共享 modal.js | 子系统完整详情页 | 详情 API |
| 实现量 | 中 | 小 | 大 |
| 上下文保持 | 保持 | 离开 | 保持 |
| 缺点 | 需后端补 id 字段 | 切换慢 | 与筛选/编号逻辑冲突 |

**选定方案 A**：工作台弹窗复用详情 API。理由：交互与样品/治具子系统一致、复用共享 modal 组件与既有详情接口、不破坏工作台筛选/编号逻辑。

## 3. 交互设计

### 3.1 交互流程

```
点击工作台表格行
  └→ openWbDetail(item)（新增 views/wb-detail.js）
       ├→ 样品: GET /api/samples/:id    （响应已含 logs）
       ├→ 治具: GET /api/fixtures/:id + GET /api/fixtures/:id/logs
       └→ 共享 openModal() 渲染弹窗
            ├─ 基本信息区（编号/名称/规格/负责部门/关键时间点/积压信息）
            ├─ 流转日志时间线（按时间倒序）
            └─ 底部「前往处理 →」按钮 → 新标签打开对应子系统扫码台
```

### 3.2 弹窗结构

```
┌──────────────────────────────────────┐
│ 详细信息 · SM-000011                  │  ← modal-head (h3 标题)
├──────────────────────────────────────┤
│ [基本信息区]                          │  ← modal-body
│   编号 / 名称 / 类型 / 规格 / 型号     │
│   负责部门 / 申请部门 / 当前阶段       │
│   关键时间点（按类型动态显示）          │
│   积压状态（等级+原因）               │
├──────────────────────────────────────┤
│ [流转日志时间线]                      │
│   ▸ 2026-08-03 10:24  复检完成 · QA   │
│   ▸ 2026-08-01 09:12  接收保管 · FQC  │
│   ▸ ...（按时间倒序）                 │
├──────────────────────────────────────┤
│ [前往处理 →]  [关闭]                  │  ← modal-foot
└──────────────────────────────────────┘
```

### 3.3 跳转按钮

- 位置：modal-foot 左侧
- 行为：`window.open('/subsystems/<samples|fixtures>/frontend/index.html#/scan?no=<item_no>')` 新标签打开
- 可见性：**所有角色可见**（操作权限由子系统 requireAuth + 状态机校验兜底，弹窗本身保持只读）
- 理由：工作台不感知子系统角色-状态机映射，提供统一入口、由子系统校验，职责边界清晰

## 4. 技术设计

### 4.1 后端改动（1 处）

**文件**：`subsystems/workbench/db/workbench-queries.js`

在 UNION 两个分支各新增 `id` 字段（纯新增，向后兼容）：

```sql
-- 样品分支
s.id AS id,
-- 治具分支
f.id AS id,
```

### 4.2 前端改动（2 处）

**新增文件**：`subsystems/workbench/frontend/js/views/wb-detail.js`（≤150 行）

| 函数 | 职责 |
|---|---|
| `openWbDetail(item)` | 入口：按 item_type 分派详情 API，加载后调用渲染 |
| `_renderWbDetail(detail, logs)` | 组装基本信息区 + 时间线 HTML |
| `_renderTimeline(logs)` | 流转日志倒序渲染 |
| `_openWbScan(item)` | 跳转对应子系统扫码台（新标签） |

**修改文件**：`subsystems/workbench/frontend/js/views/dashboard.js`

- `renderItemTable` 中行 `<tr>` 增加 `onclick="openWbDetail(ITEM_JSON)"` 与 `style="cursor:pointer"`
- 行数据含 `id`（来自后端新增字段）

### 4.3 数据流

```
GET /api/workbench（含 id）
  → 行点击 openWbDetail(item)
  → GET /api/samples/:id 或 /api/fixtures/:id（+ /logs）
  → openModal() 渲染弹窗
  → 前往处理 → #/scan?no=xxx（新标签）
```

### 4.4 时间线字段映射

日志对象统一字段（样品 logs / 治具 logs 字段一致）：
- `action` → `ACTION_CN[action] || action` 中文操作名
- `created_at` → 时间（精确到分钟）
- `role` / `dept` / `user_name` → 操作人信息
- `note` → 备注

### 4.5 关键时间点（按 item_type 动态显示）

| 类型 | 时间字段 |
|---|---|
| 样品 | created_at / released_at / next_inspect_at / updated_at |
| 治具 | created_at / expected_finish_at / transferred_at / used_at / next_maintenance_at / repair_requested_at |

## 5. 错误处理

| 场景 | 表现 |
|---|---|
| 详情 API 404 | 弹窗显示「物品不存在或已删除」+ 关闭按钮 |
| 日志为空 | 时间线区显示「暂无流转记录」 |
| API 网络失败 | 弹窗内错误提示 + 重试按钮 |
| 行数据无 id（旧缓存） | 弹窗提示「数据版本过旧，请刷新页面」 |

## 6. 测试计划

### 6.1 后端
- 工作台 SQL 返回含 `id` 字段（样品/治具两分支各 1 项）
- 现有工作台 API 响应字段无破坏（向后兼容）

### 6.2 前端
- 样品行点击 → 弹窗展示基本信息 + 时间线
- 治具行点击 → 同上
- 时间线按时间倒序
- 跳转按钮 URL 正确（样品→samples、治具→fixtures，均带 no 参数）
- 筛选/编号逻辑不受影响（行点击不改变 doFilter 行为）

### 6.3 回归
- 样品/治具子系统正常（后端仅新增字段，无行为变更）

## 7. 兼容性与影响

| 维度 | 影响 |
|---|---|
| 代码 | workbench-queries.js 加 2 个 SELECT 字段；新增 wb-detail.js；dashboard.js 行加 onclick |
| SQL | UNION 查询新增字段，无表结构变更 |
| 接口 | workbench API 响应新增 `id` 字段（向后兼容） |
| 配置 | 无 |
| 文档 | 更新本设计文档对应章节 |

**高危删除**：无。

## 8. 文件容量预估

| 文件 | 类型 | 预估行数 | 上限 | 状态 |
|---|---|---|---|---|
| workbench-queries.js | SQL/通用 | ~109 | 300 | 健康 |
| wb-detail.js（新增） | 前端 view | ~150 | 400 | 健康 |
| dashboard.js | 前端 view | ~210 | 400 | 健康 |

## 9. 部署与回滚

- 部署：改后端 → 重启服务 → 重建 bundle → 复制 bundle → 更新 index.html 版本号
- 回滚：git revert 对应 commit，重启 + 重建 bundle
- 监控：上线后 1~3 周期观察工作台 API 响应时间（新增 id 字段开销可忽略）
