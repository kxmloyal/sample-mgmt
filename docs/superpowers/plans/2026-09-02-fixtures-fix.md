# 实现计划：治具管理子系统全量修复

> 关联 spec：[2026-09-02-fixtures-fix-design.md](../specs/2026-09-02-fixtures-fix-design.md)
> 覆盖：subsystems/fixtures（backend/db/frontend/seed）+ db/migrations + 文档
> 执行方式：orchestrator 直接执行（治具未上线，可注入测试数据）
> 关键约束：禁止重启；改前端 JS 后重建 bundle

## 任务总览（按批次）

### P0（阻断性 + 高危）
| # | 任务 | 文件 |
|---|---|---|
| F1 | schema.sql 对齐 + 迁移 | `subsystems/fixtures/db/schema.sql`、`db/migrations/fixtures.js` |
| F2 | 并发 CAS（version 列 + updateFixture CAS） | `db/migrations/fixtures.js`、`subsystems/fixtures/db/dao.js`、`backend/routes-fixtures.js`、`backend/fixture-actions-*.js` |
| F3 | MAINTENANCE 响应统一 + 前端修复 | `backend/routes-fixtures.js`、`frontend/js/views/scan.js` |
| F4 | 上传魔数校验 + 扩展名白名单 | `backend/routes-files.js` |
| F5 | 死锁状态兜底（VERIFY_RD_OK/ORG_OK） | `backend/fixture-helpers.js`、`backend/routes-fixtures.js` |

### P1（状态机/角色/兜底）
| # | 任务 | 文件 |
|---|---|---|
| F6 | ADMIN 报废兜底扩展 | `backend/fixture-helpers.js` |
| F7 | IMPROVE 角色收紧 | `backend/fixture-helpers.js` |
| F8 | 维修完成/确认角色收紧为 ME | `backend/fixture-helpers.js` |
| F9 | 状态机统一（IMPROVING→VERIFY_PENDING、ME 维修走 REPAIR_DONE） | `backend/fixture-actions-special.js`、`backend/fixture-actions-repair.js` |
| F10 | manifest 状态机拉齐 | `subsystems/fixtures/manifest.json` |

### P2（机制完善）
| # | 任务 | 文件 |
|---|---|---|
| F11 | 保养首次排程 | `subsystems/fixtures/db/dao.js` |
| F12 | 维修/改善更新 expected_finish_at | `backend/fixture-actions-*.js` |
| F13 | 附件 IDOR 校验 | `backend/routes-files.js`、`backend/routes-preview.js` |
| F14 | 附件生命周期（分类统一 + 状态放宽） | `backend/routes-files.js`、`frontend/js/views/detail.js`、`frontend/js/views/scan.js`、`manifest.json` |
| F15 | 保养内容提交修复 | `frontend/js/views/scan.js` |
| F16 | 呆滞口径统一 | `subsystems/fixtures/db/dao-dormant.js`、`db/dao.js` |
| F17 | 前端防重 | `frontend/js/views/scan.js`、`frontend/js/api.js` |

### P3（清理/文档）
| # | 任务 | 文件 |
|---|---|---|
| F18 | 孤儿文件清理 | `public/uploads/fixture_files/` |
| F19 | 种子数据修正 | `subsystems/fixtures/seed/seed.js` |
| F20 | 文档全面同步 | README、operation-manual、manifest |

### 收尾
| # | 任务 |
|---|---|
| F21 | bundle 重建 + 全流程 E2E 回归 + 提交 |

## 执行顺序
P0（F1-F5）→ P1（F6-F10）→ P2（F11-F17）→ P3（F18-F20）→ F21 收尾。每 Task 一个 commit。
