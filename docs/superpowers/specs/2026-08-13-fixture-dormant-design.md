# 呆滞治具提示及管理 — 设计文档

> 日期：2026-08-13 ｜ 范围：治具子系统（fixtures）+ 全局工作台（workbench）
> 状态：设计已确认（方案 A：实时计算 + 工作台同步）

## 1. 目标

治具长期停滞在某状态、或在库长期无人领用，需在看板 / 列表 / 详情 / 工作台给出提示，帮助管理员及时发现并处置闲置治具。

## 2. 判定规则（实时计算，不落库）

| 维度 | 覆盖状态 | 判定公式 |
|---|---|---|
| 状态长期停滞 | `REQUESTED / ACCEPTED / VERIFY_PENDING / IMPROVING / REPAIRING_ME / REPAIRING_RD / REPAIR_DONE`（含历史 `VERIFY_RD_OK / VERIFY_ORG_OK` 存量兼容） | 当前状态最近一次变更时间（`fixture_logs` 该治具最新日志时间，兜底 `created_at`）距今天数 ≥ 阈值 |
| 在库无人领用 | `TRANSFERRED` | 同上判定 |

- 阈值：`fixtures_settings` 表 `dormant_days`，默认 `60`，ADMIN 可调
- `dormant_days`（呆滞天数）= `DATEDIFF(NOW(), COALESCE(最近日志时间, created_at))`
- 呆滞原因区分：`TRANSFERRED → '在库无人领用'`，其余 → `'状态长期停滞'`

## 3. 数据库

新增 `fixtures_settings` 配置表（写入 `subsystems/fixtures/db/schema.sql`，幂等 + 默认值，与 workbench_settings 同模式）：

```sql
CREATE TABLE IF NOT EXISTS fixtures_settings (
  k VARCHAR(50) PRIMARY KEY,
  v VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO fixtures_settings (k, v) VALUES ('dormant_days', '60');
```

## 4. DAO（subsystems/fixtures/db/dao.js）

| 函数 | 说明 |
|---|---|
| `listDormantFixtures(threshold)` | 呆滞聚合查询，返回呆滞治具（含 `dormant_days`、`dormant_reason`），按呆滞天数倒序 |
| `getFixtureSetting(k, defaultVal)` | 读配置（无记录返回默认值） |
| `setFixtureSetting(k, v)` | 写配置（INSERT ... ON DUPLICATE KEY UPDATE） |
| `listFixtures(opts.dormant='1')` | 列表呆滞筛选（子查询判定，保持 SELECT * 结构） |
| `countAllFixtures(opts.dormant='1')` | 分页 total 同步支持呆滞筛选 |

呆滞判定 SQL（核心）：

```sql
SELECT f.*,
  DATEDIFF(NOW(), COALESCE(l.last_at, f.created_at)) AS dormant_days,
  CASE WHEN f.status='TRANSFERRED' THEN '在库无人领用' ELSE '状态长期停滞' END AS dormant_reason
FROM fixtures f
LEFT JOIN (SELECT fixture_id, MAX(created_at) AS last_at FROM fixture_logs GROUP BY fixture_id) l ON l.fixture_id = f.id
WHERE f.status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK',
                   'IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE','TRANSFERRED')
  AND DATEDIFF(NOW(), COALESCE(l.last_at, f.created_at)) >= ?
ORDER BY dormant_days DESC
```

## 5. 后端接口（下一阶段）

- `GET /api/fixtures/dashboard` 增强：返回 `dormantCount` + `dormant[]`
- `GET /api/fixtures` 支持 `dormant=1` 筛选参数
- `GET /api/fixtures/settings` / `PUT /api/fixtures/settings`（PUT 仅 ADMIN，body `{ dormant_days: N }`，校验 1~365）
- 工作台积压聚合同步呆滞计数

## 6. 前端（下一阶段）

- 治具看板：DASH_STATS 新增「呆滞」统计卡（`var(--bad)`）+ 呆滞清单表（编号/名称/状态/呆滞天数/原因），点击进扫码详情；看板阈值设置小齿轮（仅 ADMIN）
- 治具列表：筛选区新增「呆滞」选项；命中行标红 + 状态列「呆滞 N 天」徽章
- 治具详情：info 主卡呆滞标注
- 工作台：治具积压卡含呆滞计数

## 7. 测试与回归

- DAO 单测：三场景（停滞超阈值 / 在库超阈值 / 未超阈值不命中）+ 阈值边界（=阈值命中）+ settings 读写
- 接口测试：dashboard 呆滞字段、列表 dormant 筛选、settings 权限（非 ADMIN 403）
- 双系统回归：样品管理不受影响（改动仅限 fixtures + workbench 查询）

## 8. 范围外（本次不做）

历史呆滞追溯、处置动作（确认/解除/报废）、批量导出。
