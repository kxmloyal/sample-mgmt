# 治具管理子系统全量修复设计

- 日期：2026-09-02
- 依据：治具全维度评审（后端/前端/安全/业务流程 4 路审计）
- 状态：待评审
- 治具子系统未上线（deployed:false），修复可自由注入测试数据验证

## 1. 修复范围（映射审计发现）

| 批次 | 项 | 审计编号 |
|---|---|---|
| **P0** | F1 schema.sql 对齐（fixture_files 补列/外键） | H5 |
| | F2 并发 CAS（fixtures.version + updateFixture CAS） | H1 |
| | F3 MAINTENANCE 响应统一 + 前端修复 | H2 |
| | F4 上传魔数校验 + 扩展名白名单 | H3 |
| | F5 死锁状态兜底（VERIFY_RD_OK/VERIFY_ORG_OK） | H4 |
| **P1** | F6 ADMIN 报废兜底扩展（REPAIRING_*/REPAIR_DONE/REQUESTED） | M2 |
| | F7 IMPROVE 角色收紧（IN_USE + ME/QA/CUSTODY） | M3 |
| | F8 维修完成/确认角色收紧为 ME | M4 |
| | F9 状态机统一（IMPROVING 去向、ME 维修走 REPAIR_DONE） | M5/M6 |
| | F10 manifest 状态机与代码拉齐 | 2.1 |
| **P2** | F11 保养首次排程（createFixture 初始化 next_maintenance_at） | M7 |
| | F12 维修/改善更新 expected_finish_at | M8 |
| | F13 附件 IDOR 校验 | M9 |
| | F14 附件生命周期（验证/维修/保养照片通道 + 分类统一） | M10 |
| | F15 保养内容提交修复（前端 act-note） | M11 |
| | F16 呆滞判定口径统一 | M12 |
| | F17 前端防重 | M13 |
| **P3** | F18 孤儿文件清理 | 3.2 |
| | F19 种子数据修正 | 3.4 |
| | F20 文档全面同步 | 4.x |

## 2. 关键设计决策

### F1 schema.sql 对齐
- `fixture_files` 补 `file_size INT`、`uploaded_at DATETIME`、外键 `FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE`（与 db/migrations/fixtures.js 一致）
- `fixtures` 列宽与生产表对齐（fixture_no VARCHAR(20) 等，以 db/migrations 为准）
- 新增迁移 `migrateFixtureSchemaAlign`（幂等：补列/外键，若列已存在跳过）

### F2 并发 CAS
- `fixtures` 表加 `version INT NOT NULL DEFAULT 1`（幂等迁移）
- `updateFixture(updated, original, conn, expectedVersion)`：传版本号时 `WHERE id=? AND version=?`，冲突抛 CONFLICT → 409
- 所有扫码 action 携带 `f.version`；MAINTENANCE 同样走 CAS
- 前端 409 统一提示刷新

### F3 MAINTENANCE 响应统一
- 后端 MAINTENANCE 改为与其他 action 一致：`res.json({ fixture: result, action, message })`（doMaintenance 返回 updated 后走统一 updateFixture+addFixtureLog 事务）
- 前端 submitFixAction 正常处理 r.fixture

### F4 上传安全
- 上传后读文件头做魔数校验（jpg/png/gif/webp/pdf/zip 等按分类），不匹配拒绝
- 扩展名白名单：仅允许分类对应的安全扩展名（禁 .html/.js/.svg 等可执行/脚本）
- 下载时 Content-Disposition 用 attachment（非 inline）除非明确安全类型

### F5 死锁状态兜底
- `VERIFY_RD_OK`/`VERIFY_ORG_OK`：ADMIN 可执行 `FORCE_TRANSFER`（→TRANSFERRED）或 `RETIRE`（→RETIRED）
- allowedActions 增加 ADMIN 分支

### F6 ADMIN 报废兜底
- RETIRE 范围扩展：`REPAIRING_ME/REPAIRING_RD/REPAIR_DONE/REQUESTED` 纳入 ADMIN 报废

### F7/F8 角色收紧
- IMPROVE：仅 `IN_USE` 状态 + `ME/QA/CUSTODY` 角色
- REPAIR_DONE/REPAIR_CONFIRM：仅 ME

### F9 状态机统一
- **决策**：IMPROVING 完成后 → `VERIFY_PENDING`（需复验，与代码一致），同步 README/manifest
- ME 维修完成 → `REPAIR_DONE`（待 ME 确认，与 RD 路径对称），`REPAIR_CONFIRM` → TRANSFERRED

### F10 manifest 拉齐
- 更新 manifest transitions 与代码一致（IMPROVING→VERIFY_PENDING、REPAIRING_ME→REPAIR_DONE、MAINTENANCE 自环、角色收紧）

### F11 保养首次排程
- `createFixture` 时若 `maintenance_cycle_days > 0`，初始化 `next_maintenance_at = created_at + cycle`

### F12 维修/改善期限
- `doRepairME/doRepairRDReq/doImprove` 重置 `expected_finish_at = now + 合理默认`（或新增字段，最小改动：复用 expected_finish_at 重置）

### F13 附件 IDOR
- 下载/删除/预览校验 `file.fixture_id === Number(req.params.id)`

### F14 附件生命周期
- 上传状态放宽：ACCEPTED（设计图纸/请购单）、VERIFY_PENDING（验证照片）、REPAIRING_*（维修照片）、保养（保养照片）
- 分类统一：manifest 与代码对齐（design_drawing/purchase_order/fixture_photo/verify_photo/repair_photo/maintenance_photo/site_photo/other）
- 前端 detail.js/scan.js 文件管理区按状态显示对应分类

### F15 保养内容提交
- 前端 submitFixAction 收集 `act-note` 作为 body.note

### F16 呆滞口径统一
- 呆滞基准改为 `updated_at`（状态变更即更新），两处 SQL 统一用 `<= DATE_SUB(NOW(), INTERVAL ? DAY)`

### F17 前端防重
- 提交按钮 withSubmitLock（复用 samples 的 helper 模式，fixtures 前端加本地实现）

### F18 孤儿文件清理
- 删除 `public/uploads/fixture_files/` 中无 DB 记录的 22 个文件（运维确认后）

### F19 种子数据修正
- f15 改 REPAIR_DONE+RD 或按新状态机；f16 去掉手工 expected_finish_at

### F20 文档同步
- README 治具章节、operation-manual、manifest 全面对齐

## 3. 兼容性
- 治具未上线，无存量数据约束；生产库三表全空
- API 出入参：MAINTENANCE 响应结构变化（前端同步改）；其余不变
- 新增 version 列向后兼容

## 4. 验证
- 测试库全流程 E2E：申请→接收→制作→验证→移交→领用→维修（ME/RD 两路径）→改善→报废 + 保养 + 附件 + 并发 409
- 前端 bundle 重建
- 孤儿文件清理确认

## 5. 部署
- 治具未上线，修复后随下次部署生效；无上线保护约束
