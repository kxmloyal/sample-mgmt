# 2026-08-04 样品复检状态列（三态徽章）设计

## 1. 背景与目标

用户发现保管中样品列表里，复检逾期的样品（如 SM-000011）状态徽章会变红脉冲，而正常样品（如 SM-000012）保持绿色，但仅凭「状态」列难以一眼区分逾期原因。

目标：新增「复检状态」列，用独立徽章明确区分样品的复检计划状态，让逾期/临期样品在列表与看板待办中一眼可辨。

## 2. 方案：三态徽章列

在样品列表与看板待办表格中，于「状态」列后新增「复检状态」列，按 `next_inspect_at` 计算三态 + 空态：

| 状态 | 判定条件 | 徽章样式 | 文案 |
|---|---|---|---|
| `none`（不复检） | 无 `next_inspect_at` | 灰色占位 | `—` |
| `ok`（正常） | 下次复检 > 7 天后 | 绿底 `.b-inspect-ok` | 正常 |
| `soon`（近7天） | 0 ~ 7 天内到期（含今天） | 黄底 `.b-inspect-soon` | 近7天到期 |
| `overdue`（已逾期） | 下次复检已过 | 红底脉冲 `.b-overdue`（共享，app.css） | 逾期N天 |

- 阈值 7 天与列表快捷筛选「近7天」（`overdue=7`）保持一致。
- 徽章附加 `title="复检日期：YYYY-MM-DD"` 悬停提示。
- 原有「复检到期」列（仅逾期/近7天筛选模式显示日期）保留，与徽章互补：徽章表状态、日期列表具体日期。

## 3. inspectState 计算规范

```js
inspectState(s) → 'none' | 'ok' | 'soon' | 'overdue'
```

- `!s || !s.next_inspect_at` → `'none'`
- `next_inspect_at < Date.now()` → `'overdue'`
- `next_inspect_at <= Date.now() + 7*86400000` → `'soon'`
- 其余 → `'ok'`

配套 `inspectBadge(s)` 返回徽章 HTML（依赖全局 `fmt` 格式化日期，与 list-render 一致）。

## 4. 应用范围

| 位置 | 改动 |
|---|---|
| 样品列表（list-render.js） | 表头/colgroup/行渲染三处新增「复检状态」列 |
| 看板待办（dashboard-todo.js） | 待办表格新增「复检状态」列 |

不动后端 API（`next_inspect_at` 已随列表/看板接口返回），纯前端展示层改动。

## 5. 全链路改动清单

| 文件 | 改动 |
|---|---|
| `subsystems/samples/frontend/js/views/list-inspect.js` | **新增**：`inspectState`/`inspectBadge` 两个顶层函数 |
| `subsystems/samples/frontend/js/views/list-render.js` | 表头/colgroup/行渲染新增列 |
| `subsystems/samples/frontend/js/views/dashboard-todo.js` | 待办表头/行新增列 |
| `subsystems/samples/frontend/index.html` | 引入 list-inspect.js + 相关 JS 版本号递增（`20260804c`） |
| `subsystems/samples/frontend/css/module.css` | 新增 `.b-inspect-ok`/`.b-inspect-soon`（子系统专属，不动 app.css） |
| `tests/inspect-state.test.js` | **新增**：三态边界单元测试 |
| `docs/operation-manual.md` | 样品列表章节补充「复检状态」列说明 |

## 6. 回归验证

1. 样品列表：正常样品显示「正常」，7 天内到期显示「近7天到期」，逾期显示「逾期N天」红脉冲，未设置复检显示「—」
2. 逾期/近7天快捷筛选模式下，「复检到期」日期列仍正常显示
3. 看板待办：各角色待办表均出现「复检状态」列，数据与列表一致
4. 移动端：`data-label="复检状态"` 保证卡片式布局表头可见
5. 治具子系统不受影响（未改动共享文件）
