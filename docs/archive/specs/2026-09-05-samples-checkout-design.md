# 样品子系统「领用/归还」流程设计方案（2026-09-05）

## 一、需求

保管中（IN_CUSTODY）的样品需能被**领出使用**：领出时登记领用人/部门/领用时长（小时），超时未归还在看板、列表、详情提示；归还后回到保管中。旧流程（退回→重新发行等）完全不动。

## 二、全链路关联依赖清单（变更前置输出）

### 上游依赖（引用被改内容处）
| 点位 | 文件 | 影响与适配 |
|---|---|---|
| 状态机唯一真相源 | subsystems/samples/manifest.json | 新增 CHECKED_OUT 状态 + CHECKOUT/RETURN_OUT 转移 |
| 动作执行器 | subsystems/samples/backend/scan-actions.js | 新增 CHECKOUT/RETURN_OUT 分支（必填校验+字段写入+日志） |
| 扫码路由 | subsystems/samples/backend/routes-scan.js | STATUS_LABEL 补状态；allowedActions 动态门：领用中隐藏申请退回 |
| 表结构 | subsystems/samples/db/schema.sql | samples 表补 6 列（借出人/部门/时间/应还/备注/实际归还） |
| 迁移 | db/migrations/samples.js | 新增 migrateSamplesCheckout（幂等 ADD COLUMN，兼容存量） |
| DAO | subsystems/samples/db/dao.js | updateSample 列集补 6 列；新增 listCheckoutOverdue |
| 看板 API | routes/misc.js /api/dashboard | 并入 checkoutOverdue 清单 |
| 看板前端 | views/dashboard.js + module.css | 新增「领用中」状态卡（角色排序）+「逾期未归还」预警区块（复用 _renderAlertBlock，需支持自定义列） |
| 列表 | views/list.js（状态下拉）、list-filter.js（chips 字典）、list-render.js（无需改，statusBadge 驱动） | 新状态选项/标签 |
| 状态徽章 | views/api.js statusBadge、css/module.css | CHECKED_OUT 徽章样式；领用中且逾期 → b-overdue 高亮 |
| 详情 | views/detail.js | 展示借出信息行 |
| CSV 导出 | backend/routes-samples.js /api/samples/export | SAMPLE_STATUS_CN 补状态 + 借出人/应还时间列 |
| 共享字典 | shared/frontend/api-base.js STATUS/ACTION_CN | 补 CHECKED_OUT/IN_USE 撞名规避：直接加 CHECKED_OUT: '领用中'、动作中文名 |
| 扫码台 | views/scan.js、scan-return-actions.js | CHECKOUT 表单（借出人/部门下拉/时长）、RETURN_OUT 表单；CONFIRM_ACTIONS 补 CHECKOUT |
| 工作台 | subsystems/workbench/db/workbench-queries.js | samples 分支 status IN 补 CHECKED_OUT、resp_dept CASE 补行、expected_return_at 改读真实列（原恒 NULL） |
| 帮助 | views/help-data.js | 新增「领用与归还」说明 |
| 样式 | css/module.css | .b-CHECKED_OUT 徽章 |

### 下游依赖（被改内容依赖的基础）
- shared/state-machine.js 通用引擎（零改动，纯声明式）
- db/migrations/index.js 聚合入口（追加一行调用）
- 扫码 CAS 主事务/409 机制（复用，零改动）
- tests/（新增 samples-checkout.test.js 单测；现有用例须全绿）

### 业务影响清单
- 样品看板（状态卡+比例条+预警区）、样品列表（筛选/导出）、扫码台（新动作）、详情弹窗、工作台待办、CSV 导出
- 治具/管制/项目子系统：无影响（仅 workbench SQL 的 samples UNION 分支内改动）

## 三、状态机增量（manifest.json）

```
IN_CUSTODY 保管中 --CHECKOUT 领出(role: CUSTODY,ME)--> CHECKED_OUT 领用中
CHECKED_OUT 领用中 --RETURN_OUT 归还入库(role: CUSTODY,ME)--> IN_CUSTODY
```
- CHECKOUT 动态门（routes-scan allowedActions）：CHECKED_OUT 状态下对 CUSTODY/ME 隐藏 RETURN_REQUEST（须先归还，防借用中走退回链路）；对 QA 正常保留（退回申请借出中的样品由 QA 决策，与实物归还解耦）。
- 逾期口径：`status='CHECKED_OUT' AND expected_return_at < NOW()`，纯查询计算，无定时任务。

## 四、数据库迁移（幂等，兼容存量）

samples 新增列（全部 NULL 兼容旧数据）：
- `checkout_user VARCHAR(50)` 领用人
- `checkout_dept VARCHAR(50)` 领用部门
- `checkout_at VARCHAR(24)` 领出时间（ISO UTC，与 next_inspect_at 同规范）
- `expected_return_at VARCHAR(24)` 应还时间
- `returned_at VARCHAR(24)` 实际归还时间（保留上次归还留痕）
- `checkout_note VARCHAR(200)` 领用备注

## 五、动作语义

- **CHECKOUT 领出**：必填 checkout_user / durationHours(1~8760 整数) / checkout_dept 默认操作人部门；写 checkout_at=now、expected_return_at=now+时长；日志 note 含领用人+应还时间；storage_location 保留（归还回原储位）。
- **RETURN_OUT 归还入库**：写 returned_at=now，清 checkout_user/checkout_dept/checkout_at/expected_return_at/checkout_note；日志留归还+借出时长实绩。

## 六、E2E 与回归

- 测试库 sample_mgmt_test 全流程：领出→列表/看板可见→超时判定→归还→储位不变→领用中禁退回（409）→CAS 冲突 409。
- jest：tests/samples-checkout.test.js（校验函数+SQL 口径）；既有 samples/dashboard/workbench 用例回归。
- 生产库只读验证迁移列就绪；**AI 不重启服务**，后端生效须宝塔面板重启（前端 bundle 重建+版本号后硬刷新即生效）。

## 七、回滚方案

- 代码：git revert 本次提交；新增列为可空列，不删（物理清理留两个迭代周期后）。
- 数据：领用中存量样品（如有）手工 UPDATE 回 IN_CUSTODY 即可恢复旧流程，无破坏性。
