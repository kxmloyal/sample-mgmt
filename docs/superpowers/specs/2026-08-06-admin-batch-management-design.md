# 管理增强：子系统上线开关 + 账号批量管理 — 设计文档

日期：2026-08-06
范围：管理面板（admin-subsystems.html）+ 用户管理（samples 子系统 users 视图）+ 共享 API

## 1. 需求

1. **子系统上线开关**：在门户「子系统管理」面板为每个子系统提供「已上线/未上线」可视化开关，切换 manifest.deployed。
2. **账号批量管理**：用户管理页支持多选账号后执行 4 类批量操作：删除、重置密码、改部门/角色、启用/禁用。

用户已确认：上线开关为**双向**（下线时警告解除测试数据保护）；批量功能**四项全选**。

## 2. 现状

- `GET /api/subsystems` 列表返回字段不含 `deployed`；面板（admin-subsystems.html）仅有新建/编辑(JSON)/导出。
- 用户管理（subsystems/samples/frontend/js/views/users.js）仅新增单账号 + 编辑姓名/密码；users 表无 enabled 字段；无删除/批量接口。
- 已有 `PUT /api/subsystems/:id/manifest` 可整份覆盖 manifest（含 deployed），但无轻量开关端点。

## 3. 方案设计

### 3.1 上线开关

| 层 | 改动 |
|---|---|
| 接口 | `GET /api/subsystems` 每项新增 `deployed` 字段（只增不改，兼容旧调用方） |
| 接口 | 新增 `PUT /api/subsystems/:id/deployed`（ADMIN）：body `{ deployed: true/false }`，仅更新 manifest.json 的 deployed 字段并刷新 registry |
| 前端 | admin-subsystems.html 每行渲染开关按钮；下线操作弹窗确认「将解除测试数据保护（seed/jest 护栏）」，上线操作弹窗确认「上线后禁止注入测试数据」 |

**切换生效说明**：seed-samples.js / tests/helpers/deployed.js 均运行时读取磁盘 manifest.json，切换后立即生效，无需重启；门户卡片按 `/api/subsystems` 实时渲染，deployed 不影响门户可见性。

### 3.2 账号批量管理

**DB 迁移**：users 表新增 `enabled TINYINT(1) NOT NULL DEFAULT 1`。
- 新建库：db.js 的 CREATE TABLE 加列。
- 存量库：db/migrations.js 新增 migrateUserEnabled（捕获 ER_DUP_FIELDNAME 幂等）。

**鉴权拦截**：
- `POST /api/login`：enabled=0 → 401「账号已被停用」。
- `requireAuth`（shared/middleware/auth.js）：异步校验会话用户 enabled，禁用则销毁会话并返回 401。当前 requireAuth 为同步，改为 async + try-catch（Express4 不自动捕获 async 错误）。

**DAO（db/users.js）**：
- `listUsers`/`getUserById` 查询增加 enabled 字段。
- 新增 `deleteUsers(ids)`（事务批量删除）。
- 新增 `setUsersEnabled(ids, enabled)`（事务批量启/禁用）。
- 新增 `updateUsers(ids, {role, dept})`（事务批量改角色/部门）。

**批量接口（routes/misc.js）**：`POST /api/users/batch`（ADMIN）
```json
{ "action": "delete" | "reset-password" | "update" | "enable" | "disable",
  "ids": [1,2,3],
  "password": "xxx",   // reset-password 时必填
  "role": "QA",        // update 时可选
  "dept": "制造部" }    // update 时可选
```
- 删除保护：排除当前登录用户本人、id=1、username='admin' 的内置管理员；不得空操作。
- reset-password：bcrypt 哈希统一密码。
- update：role 仅允许 RD/ME/QA/CUSTODY（与单条新增一致）；dept 可选。
- 写操作一律事务。

**前端（users.js 视图）**：
- 表格加首列 checkbox + 表头全选；行加「启用/禁用」状态标签。
- 表格上方批量工具栏：删除 / 重置密码 / 改角色部门 / 启用 / 禁用（选中数 > 0 时可用）。
- 弹窗收集批量参数（重置密码输入新密码；改角色部门选择角色/部门）。
- 删除二次确认（含风险提示）。
- 修改后重建 samples bundle。

## 4. 全链路关联依赖清单（5 维度）

| 维度 | 关联点 |
|---|---|
| 代码 | routes/misc.js、routes/subsystems.js、routes/auth.js、shared/middleware/auth.js、db.js、db/migrations.js、db/users.js、public/admin-subsystems.html、subsystems/samples/frontend/js/views/users.js |
| SQL | users 表 ALTER（enabled）；无外键约束，物理删除不产生级联风险 |
| 配置 | manifest.json deployed 字段（复用，无新增配置） |
| 接口 | GET /api/subsystems（+deployed，向后兼容）；PUT /api/subsystems/:id/deployed（新增）；POST /api/users/batch（新增）；/api/login、requireAuth 行为变化（停用账号拦截） |
| 文档 | AGENTS.md §20（切换语义补充）、README（用户管理批量说明）、tests/users.test.js 扩展 |

## 5. 保护规则与安全

- 删除/禁用均排除：当前登录者、id=1、内置 admin（防锁死）。
- 批量删除物理删除（无 FK，关联日志留孤儿 ID，前端已有容忍逻辑，本次不扩）。
- requireAuth 异步化需全局回归（所有子系统鉴权）。

## 6. 回归清单

1. 登录：正常账号可登录；enabled=0 账号登录 401、已登录会话 401（需重启后验证）。
2. 批量接口：4 类 action 各验证 + 保护账号不可删。
3. 上线开关：samples 切换 offline→online→offline，seed-samples.js 护栏状态随之变化。
4. 双系统回归：共享文件（auth.js / misc.js / db.js / users.js）改动后验证治具/工作台/项目子系统鉴权与用户列表正常。
5. 前端：admin-subsystems.html 开关、users 批量 UI（browser_use）。


---

## 7. 架构治理决策（2026-08-06 追加）

用户提出三项架构问题（批量选择可见 admin、用户管理寄生于样品子系统、PM 角色无处管理），经确认采用：

### 7.1 前端禁用保护账号
- 用户管理列表对受保护账号（内置 admin / id=1 / 当前登录者）勾选框渲染 `disabled`，显示「受保护」标记，全选自动跳过，避免触发后端 400 保护提示。
- 后端保护逻辑不变（routes/misc.js），前端仅为体验优化。

### 7.2 用户管理独立为框架级页面
- 新建 `public/admin-users.html`（ADMIN 专属，仿 admin-subsystems.html 模式，复用 app.css + shared/frontend/*.js + modal.js）。
- 从 samples 子系统移除用户管理：manifest navigation、router.js NAV/VIEWS、bundle-sources.json、删除 views/users.js。
- 门户 footer 增加「用户管理」入口（portal.html）。
- 用户编辑弹窗样式（ue-*）自 samples module.css 迁移至 app.css 共享样式（禁止跨子系统引用）。
- 框架级接口 GET/POST /api/users、PUT /api/users/:id、POST /api/users/batch 本就位于 routes/misc.js，位置不变。

### 7.3 PM 角色接入用户管理
- routes/misc.js：POST /api/users 与 batch update 角色白名单加入 PM。
- api-base.js：ROLE 增加 PM: 项目经理(PM)。
- 用户管理 UI 角色下拉（新增/批量改）加入 PM，与项目追踪子系统 ADMIN/PM 权限对齐。
- 测试：users.test.js 新增创建 PM 用户、批量改 role=PM 两个用例（19/19 通过），并为 PUT describe 补 afterAll 清理防测试残留。

### 7.4 回归结果
- users.test.js 19/19 通过，测试零残留（users 表 13 个正式账号）。
- 重启后 samples 子系统正常注册（navCount 7→6），门户/管理面板 200。
- browser_use 前端验证 8/8：导航移除、独立页可访问、admin 行受保护禁用、全选跳过（已选 12/13）、PM 下拉存在、无 JS 报错。
- 注意：manifest.json 删除 navigation 项时曾破坏 JSON（尾逗号），已修复并验证合法；后续此类操作须先 JSON.parse 校验再写入。

---

## 8. 部门字典统一与改名（2026-08-06 追加）

用户提出：**部门改为下拉选择** + **「研发中心」全链路更名为「研发部」**。

### 8.1 部门单一事实来源

新增 `data/depts.json`（后端常量文件，7 个部门）：

```json
["系统", "研发部", "品保文管中心", "制造部", "FQC", "生技部", "项目部"]
```

- 服务端动态版：`routes/misc.js` `/js/shared-constants.js` 注入 `const DEPTS`（独立框架页如 admin-users.html 使用）。
- Bundle 版：`tools/build-bundles.js` 头部注入 `var DEPTS`（samples/fixtures 列表筛选使用，`typeof DEPTS !== 'undefined'` 兜底兼容）。
- 前端硬编码部门下拉（用户管理新增/批量改、样品/治具列表筛选）全部对齐 DEPTS；用户管理原 `u-dept`/`bu-dept` 为文本输入框，改为 `fluent-select` 下拉。

### 8.2 改名全链路清单（研发中心 → 研发部）

| 维度 | 关联点 | 处理 |
|---|---|---|
| 代码 | seed.js、tests/helpers/setup.js、samples/seed/seed.js、fixtures/seed/seed.js（含 storage_location `研发中心·治具架A/维修区/改善区`）、workbench-queries.js（resp_dept 映射 5 处） | 全部替换 |
| 前端 | samples/fixtures/workbench/projects 四个 `frontend/index.html` 登录页演示账号提示 | 全部替换 |
| 测试 | tests/projects.test.js（6 处）、tests/test-workbench-api.sh（4 处） | 全部替换 |
| SQL | users.dept×7、fixtures.storage_location×3、fixture_logs.dept×90 | 一次性迁移 UPDATE 已执行，0 残留 |
| 文档 | README.md、AGENTS.md 演示账号表、workbench spec/plan、model-list-design spec、project-tracking plan | 全部替换 |
| 归档 | docs/archive/**（历史设计文档） | 保留原名（历史快照，不回改） |

### 8.3 回归结果

- 全仓 `研发中心` 仅剩：admin-users.html 变更注释 + 本文档变更记录（有意保留）；4 个子系统 bundle 已重建（bmsh8gvcd），运行时零残留。
- 数据库三表迁移完成，`研发中心` 计数 0。
- 验证完成：重启后 `/js/shared-constants.js` 返回 DEPTS；用户管理新增/批量改部门下拉均渲染 7 部门（含研发部，browser_use 验证通过）；samples/fixtures 列表筛选下拉已由 DEPTS 驱动；workbench API resp_dept 返回研发部；users.test.js 19/19 + projects.test.js 33/35（2 个附件上传失败为历史环境问题：测试进程对 www 属主 uploads 目录无写权限 EACCES，与本次变更无关）。

---

## 9. 用户批量导入 + 模板导出（2026-08-06 追加）

用户确认：**CSV 模板** + **跳过+失败清单**（部分成功）+ **密码列+默认值**。

### 9.1 方案

| 层 | 改动 |
|---|---|
| 接口 | 新增 `POST /api/users/import`（ADMIN）：body `{ users: [{username, display_name, role, dept, password}] }`，单次 ≤500 行；逐行校验（账号必填/长度≤50/角色枚举 RD·ME·QA·CUSTODY·PM/部门 ∈ data/depts.json/账号唯一）；密码留空默认 `123456` |
| 返回值 | `{ ok, action:'import', created, skipped, errors:[{row, username, error}] }`，`created + skipped + errors = 总行数`（重复账号 → skipped；非法行/写入失败 → errors） |
| 前端 | 新增独立脚本 `public/js/admin-users-import.js`（模板导出 + CSV 解析 + 导入提交 + 结果弹窗），admin-users.html 仅加 2 个按钮 + 隐藏 file input + script 引用，避免该页顶层函数继续超红线 |
| 模板 | CSV 表头 `账号,姓名,角色,部门,初始密码`（UTF-8 + BOM，Excel/WPS 可直接编辑），含一行示例；角色列填代码 |

### 9.2 导入实现要点

- **事务语义**：逐行独立插入（非事务）。理由：导入目标是「部分成功」——每行校验通过即插入并持久化，失败行跳过；并发重复由唯一键 `ER_DUP_ENTRY` 捕获计入失败（与批量管理 delete/enable 用事务的「对存量记录操作」场景不同）。
- **前端解析**：FileReader 读 UTF-8 → `parseCSV`（支持引号包裹与 `""` 转义、去 BOM、跳空行）→ 取前 5 列 → POST import；文件 ≤1MB、行数由后端限 500。
- **结果反馈**：弹窗显示「成功创建 N / 已存在跳过 N / 失败 M」+ 失败明细表（行号/账号/原因），导入后自动刷新列表。

### 9.3 回归结果

- users.test.js 24/24 通过（新增 5 用例：非管理员 403、空数据 400、合法导入+默认密码可登录、重复跳过、非法角色/部门/空账号 errors），测试零残留（users 表 7 个正式账号）。
