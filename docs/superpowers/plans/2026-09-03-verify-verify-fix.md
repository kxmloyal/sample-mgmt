# 治具「验证不合格退回」流程增强（VERIFY_REJECT）

日期：2026-09-03
适用范围：`subsystems/fixtures`（治具管理）

## 背景 / 现状痛点

治具流程中，`VERIFY_PENDING`（待验证）阶段目前只有两条可用出口：

1. `VERIFY` → `TRANSFERRED`（单人验证通过，直接移交）；
2. `RETIRE` → `RETIRED`（仅 ADMIN 报废兜底）。

**缺少**“验证不合格 / 不合适→退回重做”通路。实际遇到验证不通过时，验证人（申请部门 / ME / QA / CUSTODY）无法直接把治具退回整改，只能求助 ADMIN 报废；也缺少对不合格原因的结构化留痕与重做次数的追溯。

## 目标

在 `VERIFY_PENDING` 增加 `VERIFY_REJECT`（验证不合格退回）动作，让验证人可一键把不合格治具退回重做，并完整记录：

- 谁在何时因何原因退回了治具（`verify_reject_by/at/note`）；
- 退回重做的次数（`verify_reject_count`，可追溯多次整改）。

退回目标根据该次 `VERIFY_PENDING` 的来源自动判定：

- 由 **制作完成（MAKE）** 进入（`improvement_count === 0`）→ 退回 `ACCEPTED`，由 RD 重做；
- 由 **改善复验（IMPROVE_DONE）** 进入（`improvement_count > 0`）→ 退回 `IMPROVING`，继续改善。

## 全链路关联变更

| 层面 | 文件 | 变更 |
| --- | --- | --- |
| 状态机声明 | `subsystems/fixtures/manifest.json` | 新增 `VERIFY_REJECT` 两条转移（→ACCEPTED 重做 / →IMPROVING 改善复验） |
| 后端执行器 | `subsystems/fixtures/backend/fixture-actions-make.js` | 新增 `doVerifyReject`（权限校验 / 必填不合格原因 / 目标判定 / 审计字段 / 日志） |
| 后端路由 | `subsystems/fixtures/backend/routes-fixtures.js` | `POST /api/fixtures/scan` 分发 `VERIFY_REJECT`，必填原因校验 |
| 后端权限 | `subsystems/fixtures/backend/fixture-helpers.js` | `VERIFY_PENDING` 下与 `VERIFY` 同权限开放 `VERIFY_REJECT` |
| DAO | `subsystems/fixtures/db/dao.js` | `updateFixture` 支持新列；`getFixtureDetailById` 联表 `verify_reject_by` |
| DB Schema | `subsystems/fixtures/db/schema.sql` | `fixtures` 表新增 `verify_reject_by/at/note/count` |
| DB 迁移 | `db/migrations/fixtures.js` | `migrateFixtureSchemaAlign` 幂等 + 死锁重试新增 4 列 |
| 前端扫码台 | `subsystems/fixtures/frontend/js/views/scan.js` | 按钮 `labelMap`、`VERIFY_REJECT` 表单（必填不合格原因 + 目标提示） |
| 前端详情 | `subsystems/fixtures/frontend/js/views/detail.js` | 人员/原因卡片 + 时间轴展示验证不合格退回及原因 |
| 共享常量 | `shared/frontend/api-base.js` | `ACTION_CN['VERIFY_REJECT']` |
| 前端 Bundle | `subsystems/*/frontend/js/bundle.js`（5 个，因 api-base 共享） | 全量重建 |

## 权限

与 `VERIFY` 完全一致：申请部门人员（`userDept === requested_dept`）或治具管理方（`ME / QA / CUSTODY`）。

## 兼容性

- 纯新增状态转移与字段；存量状态、既有 `VERIFY`/`RETIRE` 逻辑不变。
- 旧 `VERIFY_RD_OK`/`VERIFY_ORG_OK` 死锁兜底不受影响。
- 迁移幂等 + 死锁重试，重启后自动生效。
- 前端 bundle 全量重建，`ACTION_CN` 仅追加键，向后兼容。

## 部署

- 后端 Node 变更需重启（宝塔面板运维）后加载生效。
- 前端静态 + bundle 硬刷新即可生效。

## 回归验证

对 `sample_mgmt_test` 直连验证：

- `migrateFixtureSchemaAlign` 幂等创建 4 个 `verify_reject_*` 列成功；
- 断言初次制作场景（`improvement_count=0`）→ `ACCEPTED`；
- 断言改善复验场景（`improvement_count>0`）→ `IMPROVING`；
- CAS 乐观锁（`version`+1）与 `verify_reject_count` 计数正确。

结果：全部 PASS。