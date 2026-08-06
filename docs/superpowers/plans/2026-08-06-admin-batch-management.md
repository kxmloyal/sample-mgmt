# 管理增强：子系统上线开关 + 账号批量管理 — 实现计划

日期：2026-08-06
前置：设计文档 docs/superpowers/specs/2026-08-06-admin-batch-management-design.md

## Task 1：DB 层 — users.enabled 字段

- [ ] db.js：CREATE TABLE users 加 `enabled TINYINT(1) NOT NULL DEFAULT 1`
- [ ] db/migrations.js：新增 migrateUserEnabled（`ALTER TABLE users ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1`，捕获 ER_DUP_FIELDNAME 幂等）并挂入 runMigrations
- [ ] db/users.js：listUsers/getUserById 返回 enabled；新增 deleteUsers(ids)、setUsersEnabled(ids, enabled)、updateUsers(ids, {role, dept})（均事务）
- 验证：重启后 `SHOW COLUMNS FROM users` 含 enabled；迁移幂等

## Task 2：鉴权层 — 停用账号拦截

- [ ] shared/middleware/auth.js：requireAuth 改 async，校验会话用户 enabled，禁用则销毁会话 + 401「账号已停用」；try-catch 兜底 500
- [ ] routes/auth.js：POST /api/login 校验 enabled=0 → 401「账号已被停用」
- 验证：停用后登录 401、已登录会话 401

## Task 3：后端 API

- [ ] routes/subsystems.js：GET /api/subsystems 每项加 `deployed`；新增 `PUT /api/subsystems/:id/deployed`（ADMIN，仅更新 deployed 字段并刷新 registry）
- [ ] routes/misc.js：新增 `POST /api/users/batch`（ADMIN）：
  - delete：排除当前登录者/id=1/username='admin'，事务删除，返回删除数与跳过数
  - reset-password：校验新密码非空，bcrypt 统一哈希
  - update：role ∈ RD/ME/QA/CUSTODY、dept 可选，事务更新
  - enable/disable：事务批量设置 enabled
- 验证：curl/脚本覆盖 4 类 action + 保护账号

## Task 4：前端 — 子系统上线开关

- [ ] public/admin-subsystems.html：列表渲染「已上线/未上线」开关按钮；上线/下线分别弹窗确认（下线提示解除测试数据保护）；调 PUT deployed 后刷新
- 验证：browser_use 操作开关 + seed 护栏联动

## Task 5：前端 — 用户批量管理

- [ ] subsystems/samples/frontend/js/views/users.js：checkbox 列 + 全选；批量工具栏（删除/重置密码/改角色部门/启用/禁用）；状态标签；弹窗收集参数；删除二次确认
- [ ] `node tools/build-bundles.js` + sudo 上传 samples bundle + 更新 index.html 版本号
- 验证：browser_use 全流程

## Task 6：测试与回归

- [ ] tests/users.test.js：扩展批量接口用例（4 类 action + 保护账号 + 权限校验）+ 停用登录拦截用例
- [ ] 重启服务；回归：登录、批量接口、上线开关、双系统（治具/工作台/项目）鉴权与用户列表
- [ ] 输出文件臃肿检测报告；文档同步（README 用户管理批量说明 + AGENTS.md §20 切换语义）
