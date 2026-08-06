# 全局工作台 — 设计文档

> 创建日期: 2026-08-04
> 状态: DRAFT
> 协议版本: 1.0.0（遵循 AGENTS.md 第 17 节 子系统插件协议）

## 1. 概述

### 1.1 需求背景

制造品质管理系统含样品管理与治具管理两个子系统。当前缺乏跨子系统的统一监控视图，管理者无法一站式了解各部门的待办积压情况。需要新增一个 **全局工作台**，合并样品+治具数据，按部门维度展示流转进度与积压告警。

### 1.2 核心目标

- 合并两个子系统的活跃数据（排除已报废/已废弃），统一字段结构
- 按部门维度展示：每个部门当前有多少待办、多少项积压（1天/3天/7天+）
- 支持按类型（样品/治具）、部门、积压等级筛选
- 逾期阈值可配置：day1=24h, day3=72h, day7=168h

### 1.3 非目标（明确不做）

- 不创建新数据库表（只读查询，不写入）
- 不修改现有样品/治具子系统的状态机或 API
- 不导出报表、不发送通知（留待后续迭代）

---

## 2. 架构设计

### 2.1 整体架构图

```
┌──────────────────────────────────────────────────────┐
│                    portal.html                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │样品管理    │  │治具管理    │  │全局工作台 ★新增│   │
│  │(/samples)│  │(/fixtures)│  │(/workbench)   │   │
│  └───────────┘  └───────────┘  └───────────────┘   │
└──────────────────────────────────────────────────────┘
         │               │                │
         ▼               ▼                ▼
┌────────────────┐ ┌──────────┐ ┌─────────────────────┐
│ samples        │ │ fixtures │ │ workbench (新)       │
│ backend/       │ │ backend/ │ │ backend/index.js     │
│ index.js       │ │ index.js │ │ frontend/index.html  │
│ db/dao.js      │ │ db/dao.js│ │ frontend/js/views/   │
└───────┬────────┘ └────┬─────┘ └──────────┬──────────┘
        │               │                  │
        ▼               ▼                  ▼
┌──────────────────────────────────────────────────────┐
│                    MariaDB                           │
│  ┌──────────┐  ┌──────────┐  (只读，不写)           │
│  │ samples  │  │ fixtures │                         │
│  └──────────┘  └──────────┘                         │
└──────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
前端 (workbench SPA)
  │  GET /api/workbench
  ▼
backend/index.js → D.query(unifiedWorkbenchSQL)
  │                  │
  │                  ├── UNION ALL ──┬── SELECT ... FROM samples
  │                  │               └── SELECT ... FROM fixtures
  │                  ▼
  │              返回 row[] 数组（每条含 item_type, status, dwell_hours 等）
  ▼
前端 calcOverdue(row) → 附加 overdue_level/overdue_label/overdue_reason
  │
  ▼
前端 renderWorkbench():
  ├── 顶部摘要卡片（按部门分组统计）
  ├── 筛选栏（类型/部门/积压等级）
  └── 统一列表表格（按 overdue_level desc, dwell_hours desc 排序）
```

### 2.3 与现有子系统关系

```
┌─────────────────────────────┐
│        全局工作台            │
│   (只读，不修改任何子系统)    │
└──────────┬──────────────────┘
           │ 读取
     ┌─────┴─────┐
     ▼           ▼
┌─────────┐ ┌─────────┐
│ 样品管理 │ │ 治具管理 │
└─────────┘ └─────────┘
```

- **隔离原则**：全局工作台是只读视图，不得修改样品/治具的任何数据
- **不增加耦合**：工作台通过 SQL 直接查询两表，不通过子系统 API（避免循环依赖和性能问题）
- **子系统协议**：工作台作为独立子系统注册，manifest.json 遵循 AGENTS.md 第 17 节规范

---

## 3. 子系统 manifest 定义

```json
{
  "id": "workbench",
  "name": "全局工作台",
  "description": "跨部门项目进度监控，合并样品与治具待办积压视图",
  "version": "1.0.0",
  "icon": "chart",
  "route": {
    "prefix": "/api/workbench",
    "entry": "/subsystems/workbench/frontend/index.html",
    "hashBase": "/workbench"
  },
  "database": {
    "tables": []
  },
  "roles": {
    "use": ["ADMIN", "RD", "QA", "CUSTODY", "ME"],
    "admin": ["ADMIN"]
  },
  "navigation": [
    {
      "key": "dashboard",
      "label": "工作台",
      "icon": "chart",
      "view": "renderWorkbenchDashboard",
      "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"]
    }
  ]
}
```

> 注意：`database.tables` 为空数组 —— 工作台不创建自己的表，只读查询样品+治具表。

---

## 4. 统一字段定义

每条合并记录包含以下字段（由 SQL UNION 产生 + 前端 calcOverdue 附加）：

| 字段 | 类型 | 来源 | 说明 |
|---|---|---|---|
| `item_no` | string | SQL | 样品编号 SM-xxxxxx 或治具编号 FJ-xxxxxx |
| `name` | string | SQL | 名称 |
| `item_type` | string | SQL | `"sample"` 或 `"fixture"` |
| `item_type_cn` | string | SQL | `"样品"` 或 `"治具"` |
| `status` | string | SQL | 原始状态码（如 `RETURNING`、`IN_USE`） |
| `stage_cn` | string | SQL | 当前阶段中文（状态→阶段 映射） |
| `resp_dept` | string | SQL | 当前负责部门 |
| `apply_dept` | string | SQL | 申请部门 |
| `spec` | string | SQL | 规格 |
| `model` | string | SQL | 型号 |
| `station` | string | SQL | 工站 |
| `dwell_hours` | number | SQL | 当前状态停留小时数 |
| `next_inspect_at` | string/null | SQL | 样品下次复检时间 |
| `expected_return_at` | string/null | SQL | 治具预计归还时间 |
| `expected_finish_at` | string/null | SQL | 治具RD预计完成时间 |
| `next_maintenance_at` | string/null | SQL | 治具下次保养时间 |
| `transferred_at` | string/null | SQL | 治具移交时间 |
| `used_at` | string/null | SQL | 治具领用时间 |
| `overdue_level` | number | JS | 0=正常, 1=1天+, 2=3天+, 3=7天+（calcOverdue 计算） |
| `overdue_label` | string | JS | 中文标签："正常"/"1天+"/"3天+"/"7天+" |
| `overdue_hours` | number | JS | 实际逾期小时数（取整） |
| `overdue_reason` | string | JS | 逾期原因描述 |

### 4.1 状态→阶段 映射表

| 子系统 | 状态码 | 阶段中文 |
|---|---|---|
| 样品 | NEW | 制样中 |
| 样品 | PRODUCED | 待发行 |
| 样品 | RELEASED | 保管中 |
| 样品 | IN_CUSTODY | 保管中 |
| 样品 | RETURNING | 退回审核中 |
| 治具 | REQUESTED | 待接收 |
| 治具 | ACCEPTED | 制作中 |
| 治具 | VERIFY_PENDING | 待验证 |
| 治具 | TRANSFERRED | 可领用 |
| 治具 | IN_USE | 领用中 |
| 治具 | IMPROVING | 改善中 |
| 治具 | REPAIRING_ME | ME维修中 |
| 治具 | REPAIRING_RD | RD维修中 |
| 治具 | REPAIR_DONE | 待确认维修 |

### 4.2 状态→负责部门 映射表

| 子系统 | 状态码 | 负责部门 |
|---|---|---|
| 样品 | NEW | 研发部 |
| 样品 | PRODUCED | 研发部 |
| 样品 | RELEASED | 当前保管部门 |
| 样品 | IN_CUSTODY | 当前保管部门 |
| 样品 | RETURNING | 品保文管中心 |
| 治具 | REQUESTED | 申请部门 |
| 治具 | ACCEPTED | 研发部 |
| 治具 | VERIFY_PENDING | 申请部门 |
| 治具 | TRANSFERRED | 申请部门 |
| 治具 | IN_USE | 申请部门 |
| 治具 | IMPROVING | 研发部 |
| 治具 | REPAIRING_ME | 生技部 |
| 治具 | REPAIRING_RD | 研发部 |
| 治具 | REPAIR_DONE | 生技部 |

---

## 5. 核心 SQL 查询

```sql
-- 统一工作台查询：合并样品 + 治具活跃数据，排除 RETIRED
-- 详细 SQL 见 设计文档第 5 节（此处为伪代码结构）

SELECT item_no, name, item_type, item_type_cn, status, stage_cn,
       resp_dept, apply_dept, spec, model, station, dwell_hours,
       next_inspect_at, expected_return_at, expected_finish_at,
       next_maintenance_at, transferred_at, used_at,
       created_at, updated_at
FROM (
  -- 样品子查询（status != 'RETIRED'）
  SELECT ... FROM samples WHERE status != 'RETIRED'
  UNION ALL
  -- 治具子查询（status != 'RETIRED'）
  SELECT ... FROM fixtures WHERE status != 'RETIRED'
) AS unified
ORDER BY dwell_hours DESC, item_type ASC, item_no ASC;
```

完整 SQL 见设计文档附录。

---

## 6. 逾期判断函数

```javascript
// 逾期阈值配置（小时），后续可移至 constants 文件
var OVERDUE_THRESHOLDS = { day1: 24, day3: 72, day7: 168 };

/**
 * 判断单条统一记录的积压/逾期等级
 * @param {Object} item  统一列表中的一条记录
 * @param {Object} cfg   可选，覆盖 OVERDUE_THRESHOLDS
 * @returns {{ level:number, label:string, hours:number, reason:string }}
 */
function calcOverdue(item, cfg) {
  var th = cfg || OVERDUE_THRESHOLDS;
  var hours = 0, reason = '';

  if (item.item_type === 'sample') {
    hours = _sampleOverdueHours(item);
    reason = _sampleOverdueReason(item);
  } else {
    hours = _fixtureOverdueHours(item);
    reason = _fixtureOverdueReason(item);
  }

  var level = 0;
  if (hours > th.day7) level = 3;
  else if (hours > th.day3) level = 2;
  else if (hours > th.day1) level = 1;

  var labels = { 0: '正常', 1: '1天+', 2: '3天+', 3: '7天+' };
  return { level: level, label: labels[level], hours: Math.round(hours), reason: reason };
}
```

### 6.1 样品逾期逻辑

| 状态 | 判断条件 | 逾期计算基准 |
|---|---|---|
| RETURNING | 停留小时数 | `updated_at` |
| RELEASED / IN_CUSTODY | `next_inspect_at < NOW()` | `NOW() - next_inspect_at` |

### 6.2 治具逾期逻辑

| 状态 | 判断条件 | 逾期计算基准 |
|---|---|---|
| IN_USE | `expected_return_at < NOW()` | `NOW() - expected_return_at` |
| ACCEPTED | `expected_finish_at < NOW()` | `NOW() - expected_finish_at` |
| 任意 | `next_maintenance_at < NOW()` | `NOW() - next_maintenance_at` |
| REQUESTED | 兜底：`dwell_hours` | `created_at` |
| VERIFY_PENDING | 兜底：`dwell_hours` | `made_at` |
| TRANSFERRED | 兜底：`dwell_hours` | `transferred_at` |

### 6.3 逾期判断流程

```
输入: item (统一记录)
   │
   ├── item_type === 'sample'
   │     ├── status === 'RETURNING'     → dwell_hours → 阈值比较 → level
   │     └── next_inspect_at 已过期     → NOW() - next_inspect_at → 阈值比较 → level
   │
   └── item_type === 'fixture'
         ├── IN_USE + expected_return_at 已过期  → NOW() - expected_return_at
         ├── ACCEPTED + expected_finish_at 已过期 → NOW() - expected_finish_at
         ├── next_maintenance_at 已过期          → NOW() - next_maintenance_at
         └── 兜底（REQUESTED/VERIFY_PENDING/TRANSFERRED）→ dwell_hours
```

---

## 7. API 设计

### 7.1 GET /api/workbench

**请求**: 无需参数（或可选 `?dept=xxx&item_type=sample&overdue_level=1` 筛选）

**响应**:

```json
{
  "items": [
    {
      "item_no": "FJ-000007",
      "name": "温湿度测试治具",
      "item_type": "fixture",
      "item_type_cn": "治具",
      "status": "IN_USE",
      "stage_cn": "领用中",
      "resp_dept": "生技部",
      "apply_dept": "生技部",
      "dwell_hours": 312,
      "expected_return_at": "2026-07-20T00:00:00.000Z",
      "overdue_level": 3,
      "overdue_label": "7天+",
      "overdue_hours": 360,
      "overdue_reason": "归还逾期"
    }
  ],
  "byDept": [
    {
      "dept": "研发部",
      "total": 5,
      "d1": 2,
      "d3": 1,
      "d7": 1,
      "items": [...]
    }
  ],
  "summary": {
    "total": 28,
    "d1": 5,
    "d3": 3,
    "d7": 2
  }
}
```

### 7.2 可选筛选参数

| 参数 | 类型 | 说明 |
|---|---|---|
| `dept` | string | 按负责部门筛选 |
| `item_type` | string | `sample` 或 `fixture` |
| `overdue_level` | number | 最小积压等级 (1/2/3) |

---

## 8. 前端设计

### 8.1 页面布局

```
┌─────────────────────────────────────────────┐
│  全局工作台                    [筛选] [刷新]  │
├─────────────────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │研发部   │ │品保文管中心│ │制造部     │    │
│  │待办 5    │ │待办 2    │ │待办 4    │    │
│  │1d+ 2    │ │1d+ 1    │ │7d+ 1    │    │
│  │3d+ 1    │ │         │ │         │    │
│  │7d+ 1    │ │         │ │         │    │
│  └──────────┘ └──────────┘ └──────────┘    │
├─────────────────────────────────────────────┤
│  筛选: [全部▾类型] [全部▾部门] [全部▾积压]  │
├──────┬──────────┬──────┬──────┬─────────────┤
│ 编号  │ 名称     │ 类型  │ 部门  │ 积压状态    │
├──────┼──────────┼──────┼──────┼─────────────┤
│FJ-007│温湿度... │ 治具 │ 生技 │ 🔴 7天+·归还逾期│
│FJ-008│耐压测试..│ 治具 │ 品保 │ 🟡 3天+·保养逾期│
│SM-012│散热风扇..│ 样品 │ 品保 │ 🟢 1天+·复检逾期│
│...   │...       │ ...  │ ...  │ ...         │
└──────┴──────────┴──────┴──────┴─────────────┘
```

### 8.2 组件树

```
renderWorkbenchDashboard()
├── renderSummaryCards(byDept)        // 顶部摘要卡片行
├── renderFilterBar()                 // 筛选栏（类型/部门/积压等级）
└── renderItemTable(items, filter)    // 统一列表表格
      └── 每行调用 calcOverdue() 渲染积压标签
```

### 8.3 前端文件结构

```
subsystems/workbench/frontend/
├── index.html              # SPA 入口（复用现有骨架）
├── js/
│   ├── router.js           # 前端路由（单页 dashboard）
│   └── views/
│       └── dashboard.js    # 核心渲染函数 renderWorkbenchDashboard()
└── css/
    └── module.css          # 工作台专属样式（摘要卡片、积压标签颜色）
```

### 8.4 样式约定

- 积压等级颜色:
  - 正常: `#16a34a` (绿) / `#f0fdf4`
  - 1天+: `#d97706` (橙) / `#fffbeb`
  - 3天+: `#ea580c` (深橙) / `#fff7ed`
  - 7天+: `#dc2626` (红) / `#fef2f2`
- 摘要卡片: 复用 `.portal-card` 样式，缩小为 3 列 grid
- 表格: 复用现有 `#data-table` 样式

---

## 9. 后端实现

### 9.1 backend/index.js

```javascript
// subsystems/workbench/backend/index.js
var D = require('../../../db');

function register(app) {
  var requireAuth = app.locals.requireAuth;

  app.get('/api/workbench', requireAuth, async function(req, res) {
    try {
      var items = await D.query(unifiedWorkbenchSQL);
      res.json(buildResponse(items));
    } catch (err) {
      res.status(500).json({ error: '获取工作台数据失败：' + err.message });
    }
  });
}

function initDB() { return Promise.resolve(); }  // 无表需建
function seed() { return Promise.resolve(); }     // 无种子数据

module.exports = { register, initDB, seed };
```

### 9.2 SQL 存放位置

统一 SQL 存储在 `subsystems/workbench/db/workbench-queries.js`，导出 `unifiedWorkbenchSQL` 常量，与 DAO 分离（因为不涉及写入，不是真正的 DAO）。

---

## 10. 排序规则

```
1. overdue_level DESC    — 积压等级最高的排最前
2. dwell_hours DESC      — 同等级内停留最久的优先
3. item_type ASC         — 样品 (sample) 排在治具 (fixture) 前面
4. item_no ASC           — 编号从小到大
```

---

## 11. 完整 SQL（附录）

```sql
-- 完整 SQL 见设计文档附录。此处为结构概览，实现时写入
-- subsystems/workbench/db/workbench-queries.js

SELECT * FROM (
  SELECT
    s.sample_no AS item_no, s.name,
    'sample' AS item_type, '样品' AS item_type_cn,
    s.status,
    CASE s.status
      WHEN 'NEW' THEN '制样中'
      WHEN 'PRODUCED' THEN '待发行'
      WHEN 'RELEASED' THEN '保管中'
      WHEN 'IN_CUSTODY' THEN '保管中'
      WHEN 'RETURNING' THEN '退回审核中'
      WHEN 'RETIRED' THEN '已废弃'
    END AS stage_cn,
    CASE s.status
      WHEN 'NEW' THEN '研发部'
      WHEN 'PRODUCED' THEN '研发部'
      WHEN 'RELEASED' THEN COALESCE(s.custody_dept, '品保文管中心')
      WHEN 'IN_CUSTODY' THEN COALESCE(s.custody_dept, '-')
      WHEN 'RETURNING' THEN '品保文管中心'
      ELSE '-'
    END AS resp_dept,
    COALESCE(s.custody_dept, '-') AS apply_dept,
    s.spec, s.model, s.station,
    TIMESTAMPDIFF(HOUR, s.updated_at, NOW()) AS dwell_hours,
    s.next_inspect_at, s.release_cycle_days,
    NULL AS expected_return_at, NULL AS expected_finish_at,
    NULL AS next_maintenance_at, NULL AS transferred_at,
    NULL AS used_at,
    s.created_at, s.updated_at
  FROM samples s
  WHERE s.status NOT IN ('RETIRED')

  UNION ALL

  SELECT
    f.fixture_no AS item_no, f.name,
    'fixture' AS item_type, '治具' AS item_type_cn,
    f.status,
    CASE f.status
      WHEN 'REQUESTED' THEN '待接收'
      WHEN 'ACCEPTED' THEN '制作中'
      WHEN 'VERIFY_PENDING' THEN '待验证'
      WHEN 'TRANSFERRED' THEN '可领用'
      WHEN 'IN_USE' THEN '领用中'
      WHEN 'IMPROVING' THEN '改善中'
      WHEN 'REPAIRING_ME' THEN 'ME维修中'
      WHEN 'REPAIRING_RD' THEN 'RD维修中'
      WHEN 'REPAIR_DONE' THEN '待确认维修'
      WHEN 'RETIRED' THEN '已报废'
    END AS stage_cn,
    CASE f.status
      WHEN 'REQUESTED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'ACCEPTED' THEN '研发部'
      WHEN 'VERIFY_PENDING' THEN COALESCE(f.requested_dept, '-')
      WHEN 'TRANSFERRED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IN_USE' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IMPROVING' THEN '研发部'
      WHEN 'REPAIRING_ME' THEN '生技部'
      WHEN 'REPAIRING_RD' THEN '研发部'
      WHEN 'REPAIR_DONE' THEN '生技部'
      ELSE '-'
    END AS resp_dept,
    COALESCE(f.requested_dept, '-') AS apply_dept,
    f.spec, f.model, f.station,
    CASE f.status
      WHEN 'REQUESTED' THEN TIMESTAMPDIFF(HOUR, f.created_at, NOW())
      WHEN 'IN_USE' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.used_at, f.updated_at), NOW())
      WHEN 'TRANSFERRED' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.transferred_at, f.updated_at), NOW())
      WHEN 'VERIFY_PENDING' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.made_at, f.updated_at), NOW())
      ELSE TIMESTAMPDIFF(HOUR, f.updated_at, NOW())
    END AS dwell_hours,
    NULL AS next_inspect_at, NULL AS release_cycle_days,
    f.expected_return_at, f.expected_finish_at,
    f.next_maintenance_at, f.transferred_at,
    f.used_at,
    f.created_at, f.updated_at
  FROM fixtures f
  WHERE f.status NOT IN ('RETIRED')
) AS unified
ORDER BY dwell_hours DESC, item_type ASC, item_no ASC;
```

---

## 12. 实现步骤（概要）

| # | 步骤 | 产出 |
|---|---|---|
| 1 | 创建 `subsystems/workbench/` 目录结构 | 目录骨架 |
| 2 | 编写 `manifest.json` | 子系统注册 |
| 3 | 编写 `db/workbench-queries.js` | 完整 SQL 导出 |
| 4 | 编写 `backend/index.js` | GET /api/workbench 端点 |
| 5 | 编写 `frontend/index.html` | SPA 骨架 |
| 6 | 编写 `frontend/js/views/dashboard.js` | 核心渲染函数 + calcOverdue |
| 7 | 编写 `frontend/js/router.js` | 单页路由 |
| 8 | 编写 `frontend/css/module.css` | 工作台专属样式 |
| 9 | 重启服务 → 门户自动发现 | 验证卡片出现 + 数据正常 |

---

## 13. 验证清单

- [ ] 门户页出现「全局工作台」卡片
- [ ] 点击进入后，页面正常加载（无 Console/Network 错误）
- [ ] 摘要卡片按部门正确分组统计
- [ ] 统一列表正确显示样品+治具混合数据
- [ ] 积压标签颜色正确（绿/橙/深橙/红）
- [ ] 筛选（类型/部门/积压等级）正常工作
- [ ] 排序符合设计（积压等级 → 停留时长 → 类型 → 编号）
- [ ] 子系统隔离：工作台不修改样品/治具的任何数据
- [ ] 各角色均可访问（ADMIN/RD/QA/CUSTODY/ME）
