# 实现计划：管制流程管理子系统修复

> 关联 spec：[2026-09-03-control-fix-design.md](../specs/2026-09-03-control-fix-design.md)
> 覆盖：subsystems/control（backend/db/frontend）+ db/migrations + 文档
> 执行方式：orchestrator 直接执行（治具未上线，可注入测试数据）
> 关键约束：禁止重启；改前端 JS 后重建 bundle；迁移死锁重试（参照治具修复经验）

## 任务总览

| # | 任务 | 文件 |
|---|---|---|
| C-T1 | 迁移：control_orders 加 version 列 + dao updateOrder CAS | `db/migrations/control.js`、`subsystems/control/db/dao.js` |
| C-T2 | 路由接入 CAS（transition/sign/rework-log/void/编辑） | `backend/routes-orders.js`、`backend/routes-ncr.js` |
| C-T3 | 会签并行化（resolveSignTarget 去 seq 顺序限制） | `backend/flow-ops.js` |
| C-T4 | 出货结余校验 + 会签超时催办（dao + 看板） | `backend/routes-orders.js`、`db/dao.js`、`frontend/js/views/dashboard.js` |
| C-T5 | bundle 重建 + 全流程 E2E + 文档 | 全部 |

## 执行顺序
C-T1 → C-T2 → C-T3 → C-T4 → C-T5。每 Task 一个 commit。