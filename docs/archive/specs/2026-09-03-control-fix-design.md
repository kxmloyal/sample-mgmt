# 管制流程管理子系统修复设计

- 日期：2026-09-03
- 依据：全链路评审（流程结构/后端审计/数据现状）
- 状态：待评审
- 管制子系统未上线（deployed:false），修复可注入测试数据验证

## 1. 修复范围

| 优先级 | 项 | 问题 |
|---|---|---|
| **P0** | C1 并发 CAS（version 乐观锁） | updateOrder 无版本控制，双人同签可重复流转 |
| **P0** | C2 会签并行化 | 闸口① 5 单位串行效率低，改为并行会签 |
| **P1** | C3 会签超时催办 | 会签无时限，长期卡死无人知 |
| **P1** | C4 出货结余校验 | SHIP 前校验 remain_qty===0 |

## 2. 关键设计决策

### C1 并发 CAS
- `control_orders` 表加 `version INT NOT NULL DEFAULT 1`（幂等迁移）
- `updateOrder(o, conn, expectedVersion)`：传 version 时 `WHERE id=? AND version=?` + `version=version+1`，冲突抛 CONFLICT → 409
- 所有写操作（transition/sign/rework-log/void/updateOrder）携带 version
- 前端 409 统一提示

### C2 会签并行化
- `resolveSignTarget` 改为**并行模式**：删除 seq 顺序限制，当前节点所有未签步骤均可签（角色匹配即可）
- 闸口全通过条件不变：`isGatePassed` 仍要求所有步骤 AGREE/SKIP
- 前端会签 UI 显示当前节点所有待签步骤（按角色分组），用户签自己的步骤
- 会签模板初始化不变（5 步）
- 仅在 `resolveSignTarget` 中移除 seq 顺序限制，其他逻辑不变

### C3 会签超时催办
- 在 `dao.js` 新增 `listOverdueSigns(hours)`：会签创建后超过阈值（如 48h）仍未签
- 看板/仪表盘增加「会签超期」卡片
- 阈值可配置（`control_settings` 表 `overdue_hours`，已有）

### C4 出货结余校验
- `targetOf('SHIP')` 前校验 `remain_qty === 0`，否则 400 '结余未清零，无法出货'

## 3. 兼容性
- 治具未上线，无存量数据约束
- API 出入参不变（新增 409 错误码语义）
- 新增 version 列向后兼容

## 4. 验证
- 测试库 E2E：全流程 DRAFT→SHIPPED + 并发 409 + 会签并行 + 出货结余校验
- 会签并行：两个不同角色同时签不同步骤，均成功

## 5. 部署
- 涉及 DB 迁移 + 共享层（dao.js 改）→ 需重启