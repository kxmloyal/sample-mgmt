# 治具管理生命周期完善设计文档

> 日期：2026-07-30 | 状态：已确认 | 前置：冶具管理设计已完成

## 1. 需求概述

完善治具管理系统生命周期，纳入以下能力：
- **RD 接收确认**（含预计完成日）
- **直接归还**（IN_USE → TRANSFERRED，无需经过维修）
- **撤销申请**（REQUESTED → RETIRED）
- **升级优化（持续改善）**（含 IATF 16949 版次控制）
- **验证方从固定 ME 改为申请单位**
- **IATF 16949 版次控制**（improvement_count 追踪）

## 2. 设计决策

| 决策项 | 选择 | 理由 |
|---|---|---|
| 改善发起 | 任何角色均可 | 全员参与持续改善 |
| 改善执行 | RD 或 ME | 简单改善 ME 做，复杂改善 RD 做 |
| 改善后验证 | 双人重新验证（复用 VERIFY_PENDING） | 与首次验证一致，确保质量 |
| 改善触发时机 | 仅 TRANSFERRED | 使用中治具先归还再改善 |
| RD 接收 | 新增 ACCEPTED 状态 | 含预计完成日期 |
| 验证方 | RD + 申请单位（dept 匹配 requested_dept） | 谁申请谁验证 |
| 分配储位 | 验证时填写 storage_location | 不新增独立步骤 |
| 版次控制 | improvement_count 自增 | IATF 16949 版次追踪 |

## 3. 状态机

### 完整流程（12 态）

```
REQUESTED ──RD接收──→ ACCEPTED ──制作完成──→ VERIFY_PENDING
                                                     │
                                           RD + 申请单位双人验证
                                                     │
                                                     ↓
                                                TRANSFERRED
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              ↓                      ↓                      ↓
                           IN_USE               IMPROVING                RETIRED
                              │                      ↓                   (终态)
                              │                改善完成 → VERIFY_PENDING
                              │                (improvement_count +1)
                    ┌─────────┼─────────┐
                    ↓         ↓         ↓
                归还      自行维修    退回RD
                    ↓         ↓         ↓
             TRANSFERRED  REPAIRING_ME  REPAIRING_RD
                              ↓              ↓
                         维修完成        RD维修完成
                              ↓              ↓
                         TRANSFERRED    REPAIR_DONE
                                           ↓
                                       ME确认 → TRANSFERRED
```

**取消/报废入口**：
- `REQUESTED` ──CANCEL──→ `RETIRED`（任何人可撤销自己的申请）
- 任何状态 ──ADMIN RETIRE──→ `RETIRED`

### 状态枚举

| 状态 | 中文 | 说明 |
|---|---|---|
| `REQUESTED` | 已申请 | 待 RD 接收 |
| `ACCEPTED` | 已接收 | RD 已接收，含预计完成日 |
| `VERIFY_PENDING` | 待验证 | 制作完成/改善完成，待双人验证 |
| `VERIFY_RD_OK` | RD已确认 | RD 已验证，待申请单位确认 |
| `VERIFY_ORG_OK` | 申请单位已确认 | 申请单位已验证，待 RD 确认 |
| `TRANSFERRED` | 已移交 | 可领用 |
| `IN_USE` | 领用中 | 使用中 |
| `IMPROVING` | 改善中 | 升级优化执行中 |
| `REPAIRING_ME` | ME维修中 | 生技自行维修 |
| `REPAIRING_RD` | RD维修中 | 退回研发维修 |
| `REPAIR_DONE` | 维修完成 | 待 ME 确认 |
| `RETIRED` | 已报废 | 终态 |

> `VERIFY_ME_OK` 重命名为 `VERIFY_ORG_OK`，兼容过渡（旧数据保留旧值）。

## 4. 角色操作权限

| 状态 | RD | ME / QA / CUSTODY | ADMIN |
|---|---|---|---|
| REQUESTED | ACCEPT（接收） | — | RETIRE（报废） |
| REQUESTED（申请人） | — | CANCEL（撤销自己的申请） | — |
| ACCEPTED | 制作完成 → VERIFY_PENDING | — | RETIRE |
| VERIFY_PENDING | VERIFY（确认验证） | VERIFY（确认验证，仅 dept 匹配者） | — |
| VERIFY_RD_OK | — | VERIFY（确认，仅 dept 匹配者） | — |
| VERIFY_ORG_OK | VERIFY（确认验证） | — | — |
| TRANSFERRED | — | USE（领用） | RETIRE |
| TRANSFERRED | — | IMPROVE（申请改善） | — |
| IN_USE | — | RETURN（归还）/ REPAIR_ME / REPAIR_RD_REQ | RETIRE |
| IMPROVING | IMPROVE_DONE | IMPROVE_DONE | RETIRE |
| REPAIRING_ME | — | REPAIR_DONE（维修完成） | — |
| REPAIRING_RD | REPAIR_DONE | — | — |
| REPAIR_DONE | — | REPAIR_CONFIRM（确认） | RETIRE |
| RETIRED | — | — | —（终态） |

## 5. 新增/变更数据库字段

### fixtures 表新增

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `expected_finish_at` | DATETIME | NULL | RD 接收时预计完成日期 |
| `improve_note` | TEXT | NULL | 改善申请说明 |
| `improvement_count` | INT | 0 | 改善版次，每次 IMPROVE_DONE 时 +1 |
| `improved_by` | INT | NULL | 改善执行人 |
| `improved_at` | DATETIME | NULL | 改善完成时间 |

> `verified_me` / `verified_me_at` 字段保留不变（兼容旧数据），代码中语义改为「申请单位确认」。

## 6. 新增 Action

| Action | 前置状态 | 角色 | 目标状态 | 前置条件 |
|---|---|---|---|---|
| ACCEPT | REQUESTED | RD | ACCEPTED | 必填预计完成日 |
| CANCEL | REQUESTED | 申请人本人 | RETIRED | 非申请人不可撤销 |
| RETURN | IN_USE | ME/QA/CUSTODY | TRANSFERRED | — |
| IMPROVE | TRANSFERRED | 任何人 | IMPROVING | 必填改善说明 |
| IMPROVE_DONE | IMPROVING | RD/ME | VERIFY_PENDING | improvement_count +1 |

## 7. 版次控制规则

- `fixture_no` 始终为 `FJ-XXXXXX`（不变）
- `improvement_count` 初始 0，每次 `IMPROVE_DONE` 时 `+1`
- 显示版次：`fixture_no + "-V" + improvement_count`（如 `FJ-000001-V2`）
- 展示位置：治具清单、详情弹窗、扫码台结果卡片

## 8. 申请单位验证规则

- 用户扫码验证时，检查 `user.dept === fixture.requested_dept`
- dept 不匹配 → 拒绝验证：“验证需要 RD 与 申请单位（{requested_dept}）共同完成”
- RD 无此限制（任何 RD 均可验证）

## 9. 展示版次控制规则

- 首次创建：`fixture_no = "FJ-000001"`，`improvement_count = 0`，无 V 后缀
- 第 N 次改善完成：`improvement_count = N`，显示为 `FJ-000001-V{N}`
- 仅 `improvement_count > 0` 时显示 V 后缀
- 展示位置：治具清单、详情弹窗、扫码台 3 处

## 10. 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `db.js` | 修改 | ALTER TABLE fixtures ADD 4 列 |
| `db/fixtures.js` | 修改 | nextFixtureNo、createFixture 适配新字段 |
| `routes/fixtures.js` | 修改 | 新增 ACCEPT/CANCEL/RETURN/IMPROVE/IMPROVE_DONE handler；allowedActions 扩展；VERIFY_ME_OK → VERIFY_ORG_OK；申请单位 dept 校验 |
| `public/js/fixture-api.js` | 修改 | 新增 STATUS/STATUS_LABEL/CSS；ACTION_CN 扩展；版次显示工具函数 |
| `public/js/fixture-scan.js` | 修改 | 新增按钮 label；版次 + 预计完成日显示 |
| `public/js/fixture-list.js` | 修改 | 清单/详情弹窗显示版次；ACCEPT 后显示预计完成日 |
| `public/js/fixture-dashboard.js` | 修改 | 看板统计适配新状态 |

## 11. 验收标准

- [ ] RD 接收申请：扫码 → 显示填报预计完成日 → 状态变为「已接收」
- [ ] 申请人撤销自己的申请：REQUESTED → RETIRED
- [ ] 非申请人不可撤销他人的申请（拒绝 + 错误提示）
- [ ] 直接归还：IN_USE → TRANSFERRED（无需维修流程）
- [ ] 改善申请：TRANSFERRED → IMPROVING（任何人可发起）
- [ ] 改善执行：RD/ME 改善完成 → VERIFY_PENDING（improvement_count +1）
- [ ] 改善后双人验证：RD + 申请单位 dept 匹配方可验证
- [ ] 版次显示：FJ-000001-V1（清单/详情/扫码台 3 处一致）
- [ ] 非申请单位人员无法参与验证（dept 不匹配 → 错误提示）
- [ ] ACCEPT 后看板可查看预计完成日
- [ ] 操作日志完整记录所有新 action
- [ ] E2E 全流程回归通过
- [ ] sample 子系统零影响

## 12. IATF 16949 覆盖

| IATF 要求 | 实现 | 匹配 |
|---|---|---|
| 唯一标识与状态追踪 | fixture_no + 12 态 | 完全匹配 |
| 治具设计变更文件化 | IMPROVING + 日志 | 完全匹配 |
| 版次控制 | improvement_count | 完全匹配 |
| 治具仓储与恢复 | 储位 + 归还 | 完全匹配 |
| 使用前验证/确认 | RD+申请单位双人验证 | 完全匹配 |
| 生命周期追踪 | 12 态全日志 | 完全匹配 |
| 磨损/损坏处置 | 维修+报废 | 完全匹配 |
| 预防性保养 | 方案 C 未实施 | 待迭代 |
