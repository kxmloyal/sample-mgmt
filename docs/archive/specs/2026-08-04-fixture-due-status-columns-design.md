# 2026-08-04 治具到期状态双列（归还/保养）设计

## 1. 背景与目标

治具清单现有列 `# | 编号 | 名称 | 规格 | 部门 | 储位 | 图片 | 状态 | 更新时间 | 操作`，仅通过整行红色高亮（`overdue-row`）提示领用归还超期，保养到期（`next_maintenance_at`）在清单中**完全没有展示**（仅看板有待保养区块）。

参考样品「复检状态」三态列方案（specs/2026-08-04-inspect-status-column-design.md），为治具清单新增两列，让到期维度一眼可辨。**模式参考样品，代码独立**（遵守子系统隔离原则，禁止跨子系统引用文件）。

## 2. 方案：归还状态 + 保养状态 双列

在「状态」列后、「更新时间」前新增两列，判定规则与后端 DAO 权威逻辑严格一致：

| 列 | 判定字段 | 参与条件 | 三态 + 空态 |
|---|---|---|---|
| 归还状态 | `expected_return_at` | `status === 'IN_USE'`（与看板 `listOverdueFixtures` 一致） | 正常 / 近7天到期 / 超期N天 / — |
| 保养状态 | `next_maintenance_at` | `retired_at IS NULL`（与看板 `listOverdueMaintenance`/`listUpcomingMaintenance` 一致） | 正常 / 近7天到期 / 逾期N天 / — |

判定逻辑（阈值 7 天，与样品及看板「7 天」一致）：

```
dueState(date, active) → 'none'|'ok'|'soon'|'overdue'
- 不满足参与条件或无日期 → 'none'
- date <= now → 'overdue'
- date <= now + 7*86400000 → 'soon'
- 其余 → 'ok'
```

徽章样式：正常绿底 / 近7天黄底 / 逾期（超期）复用共享 `.b-overdue`（红底脉冲）/ 无计划灰色「—」，悬停显示到期日。

## 3. 函数规范（fixture-inspect.js，顶层函数 ≤10）

| 函数 | 说明 |
|---|---|
| `maintState(f)` | 保养三态计算 |
| `returnState(f)` | 归还三态计算 |
| `_dueBadge(st, date, okCls, soonCls, overdueLabel)` | 通用徽章渲染 |
| `maintBadge(f)` / `returnBadge(f)` | 保养/归还徽章入口 |

## 4. 全链路改动清单

| 文件 | 改动 |
|---|---|
| `subsystems/fixtures/frontend/js/views/fixture-inspect.js` | **新增**：状态计算 + 徽章渲染 |
| `subsystems/fixtures/frontend/js/views/list.js` | 表头/colgroup/行渲染新增两列 |
| `subsystems/fixtures/frontend/index.html` | 引入 fixture-inspect.js + 版本号递增 |
| `subsystems/fixtures/frontend/css/module.css` | 新增 `.b-maint-ok`/`.b-maint-soon`/`.b-ret-ok`/`.b-ret-soon` |
| `tests/fixture-inspect.test.js` | **新增**：双维度三态边界单元测试 |
| `docs/operation-manual.md` | 治具清单章节补充双列说明 |

不改后端（列表接口 `SELECT *` 已返回 `expected_return_at`/`next_maintenance_at`/`retired_at`）。

## 5. 回归验证

1. 治具清单：领用中且有归还期 → 归还状态徽章三态；未报废且有保养计划 → 保养状态徽章三态；其余显示「—」
2. 与看板「逾期未归还」「待保养」数据一致性抽查
3. 移动端 `data-label` 卡片式布局正常
4. 样品子系统不受影响（未改动共享文件，仅新增治具 module.css 徽章类）
