# 治具存放-领用-归还-保养 强化设计

> IATF 16949 工装类治具（装配夹具/焊接工装/定位治具），混合模式（线边固定+流转借用）

## 1. 设计原则

- 不新增状态，不改变现有状态机流转
- 保养作为不改变状态的独立正交操作
- 最小侵入现有代码，优先扩展现有文件

## 2. 数据库变更

### 2.1 `fixtures` 表新增 4 字段

```sql
ALTER TABLE fixtures ADD COLUMN storage_location VARCHAR(100) NULL COMMENT '存放位置';
ALTER TABLE fixtures ADD COLUMN maintenance_cycle_days INT DEFAULT 0 COMMENT '保养周期(天)，0=无需定期保养';
ALTER TABLE fixtures ADD COLUMN last_maintenance_at DATETIME NULL COMMENT '上次保养完成时间';
ALTER TABLE fixtures ADD COLUMN next_maintenance_at DATETIME NULL COMMENT '下次应保养时间';
```

### 2.2 无新表

保养记录写入现有 `fixture_logs` 表，action=`MAINTENANCE`。

## 3. 状态机（不变）

现有流转完全不受影响：

```
TRANSFERRED ⇄ IN_USE → 维修流程
     │           │
     └── MAINTENANCE ──┘ (正交操作，不改变状态)
```

### 3.1 allowedActions 新增

| 状态 | 新增操作 | 角色 |
|---|---|---|
| TRANSFERRED | MAINTENANCE | ME |
| IN_USE | MAINTENANCE | ME |

## 4. API 设计

### 4.1 看板 API `GET /api/fixtures/dashboard`

返回增加：

```json
{
  "maintenanceOverdue": [...],   // 已过保养日期的治具
  "maintenanceUpcoming": [...],  // 7日内到期的治具
  "maintenanceOverdueCount": 3,
  "maintenanceUpcomingCount": 5
}
```

### 4.2 扫码操作 `POST /api/fixtures/scan`

新增 action=`MAINTENANCE`，body：

```json
{
  "code": "FJ-000001",
  "action": "MAINTENANCE",
  "note": "清洁导轨并紧固螺栓",
  "maintenance_date": "2026-07-31",     // 可选，默认今天
  "next_maintenance_at": "2026-10-29"    // 可选，默认 date+cycle
}
```

后端逻辑：
1. 校验 R、状态 (TRANSFERRED/IN_USE)、角色 (ME)
2. 更新 `last_maintenance_at` = `maintenance_date`
3. 计算 `next_maintenance_at` = `maintenance_date + maintenance_cycle_days`（用户可覆盖）
4. 写入 `fixture_logs`：action=`MAINTENANCE`, note=保养内容

### 4.3 新建/更新 API 扩展

`POST/PUT /api/fixtures` body 新增可选字段：
- `storage_location`: string
- `maintenance_cycle_days`: int

## 5. 前端设计

### 5.1 看板（fixture-dashboard.js）

DASH_STATS 新增第 6 个卡片：

```js
{ label: '待保养', status: null, countKey: 'maintenancePending' }
```

表格区域新增逾期保养预警表（红色边框）：

```
编号 | 名称 | 部门 | 存放位置 | 上次保养 | 应保养日期 | 已逾期N天
```

### 5.2 扫码台（fixture-scan.js）

- 治具信息卡片新增：存放位置、保养周期、上次/下次保养时间
- 逾期保养：下次保养日期红色显示 + "已逾期 N 天"
- 新增「保养」按钮（TRANSFERRED/IN_USE，仅ME角色可见）
- 保养表单：保养内容(textarea,必填)、保养日期(date,默认今天)、下次保养(date,自动计算)
- 标签映射新增：`MAINTENANCE: '保养'`

### 5.3 详情弹窗（fixture-detail.js）

概览 Tab 基础信息卡片追加：
- `存放位置 / 保养周期` 行
- `上次保养 / 下次保养` 行
- 逾期时下次保养红色 + "已逾期 12 天"

新增「编辑」按钮 → 编辑弹窗可修改存放位置和保养周期。

### 5.4 清单（fixture-list.js）

表头新增「存放位置」列，空值显示 `—`。

### 5.5 新建申请表单

追加两个字段：存放位置（选填）、保养周期（选填，默认 90 天）。

### 5.6 样式（app.css）

保养逾期复用现有 `.b-overdue` 红色闪烁样式。

## 6. 变更清单

| 文件 | 变更 |
|---|---|
| `db.js` | `migrateFixtureLifecycle()` 追加 4 字段 |
| `db/fixtures.js` | 看板 API `countFixturesByStatus` 扩展：待保养+逾期保养；CRUD 支持新字段 |
| `routes/fixture-helpers.js` | `allowedActions` 为 TRANSFERRED/IN_USE 增加 MAINTENANCE（ME） |
| `routes/fixture-actions-cycle.js` | 新增 `doMaintenance` 函数 |
| `routes/fixtures.js` | 注册 MAINTENANCE 路由分支；新建/更新接口支持新字段 |
| `public/js/fixture-dashboard.js` | DASH_STATS 加 1 卡片；逾期保养表渲染 |
| `public/js/fixture-scan.js` | 保养信息展示+操作按钮+保养表单；labelMap 新增 MAINTENANCE |
| `public/js/fixture-detail.js` | 概览 Tab 追加存放/保养字段；编辑按钮 |
| `public/js/fixture-list.js` | 表头追加存放位置列 |
| `public/js/fixture-router.js` | 新建表单追加存放位置/保养周期 |
| `public/css/app.css` | 无新增样式（复用 `.b-overdue`） |

## 7. IATF 16949 合规覆盖

| 条款 | 要求 | 覆盖方式 |
|---|---|---|
| 8.5.1.6 生产工装管理 | 工装标识 | 唯一编号（已有） |
| 8.5.1.6 e) | 工装仓储/修复 | 存放位置 + 保养追踪 |
| 8.5.1.5 全面生产维护 | 定期维护计划 | 保养周期 + 自动提醒 |
| 8.5.1.5 | 维护记录 | fixture_logs MAINTENANCE 全量留痕 |
| 9.1.1.1 | 过程监视 | 看板逾期预警驱动执行 |

## 8. 子系统隔离影响评估

- **样品管理系统**：无影响。所有变更为治具专属文件（`fixture-*`），共享文件（`db.js`/`app.css`）仅追加字段/复用已有样式类。
- **共享 CSS**：复用 `.b-overdue`，已在样品和治具页面验证可用。
