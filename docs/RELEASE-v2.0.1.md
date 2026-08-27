# Release Notes — v2.0.1

> **发布日期**：2026-08-27 · **基线提交**：`b604c9e` · **变更规模**：10 文件 / +188 行 / -128 行（项目追踪子系统 + 数据库迁移 + 测试）
>
> 本次版本聚焦**项目追踪看板统计性能优化**与**测试套件数据一致性修复**，无破坏性 API 变更。

---

## 概述

v2.0.1 针对项目追踪子系统的 `/api/projects/stats` 看板接口进行**性能优化**（标量合并 + 并行化 + TTL 缓存 + 复合索引），并系统性修复 `tests/projects.test.js` 中此前存在的 **28 项测试失败**。测试通过率由 24/52 提升至 **52/52**。

其中测试失败的核心根因暴露了一个**数据一致性缺陷**：部分写路由在数据库事务回调内提前发送 HTTP 响应，导致响应先返回客户端、事务提交失败时数据未持久化却仍显示成功。本次已统一改为「事务内收集结果 → 提交 → 事务外发送响应」。

---

## 性能优化：/api/projects/stats 看板接口

### 背景

优化前该接口需要 **10 次串行连接池往返**（6 个标量 COUNT + 4 个 GROUP BY 聚合查询），且 `planned_date`/`created_at` 无索引导致全表扫描，看板首查延迟高。

### 方案与效果

| 维度 | 优化前 | 优化后 |
|---|---|---|
| SQL 往返 | 10 次串行 | **1 次标量条件聚合 + 4 次并行**（5 次，其中 4 次并发） |
| 标量统计 | 6 个独立 COUNT | 合并为 1 次 `SUM(status='...')` 条件聚合（overdue 条件并入） |
| 分布/趋势 | 4 个串行 | `Promise.all` 并发（等待 max 而非累加） |
| 缓存 | 无 | 进程内 TTL 缓存 30s（复用 `shared/cache.js`），重复刷新看板近零 SQL 成本 |
| 全表扫描 | overdue/趋势查询全扫 | `(status, planned_date)`、`(status, created_at)` 复合索引消除 |

**返回结构与字段完全不变**（`project_count/total_tasks/done_count/in_progress_count/not_started_count/overdue_count/completion_rate/category_dist/priority_dist/status_dist/trend`），仅性能提升，对前端透明。

### 索引变更（数据库）

为 `project_tasks` 新增两张复合索引，用于消除 overdue 判定与近 8 周 DONE 趋势查询的全表扫描：

- `idx_status_planned (status, planned_date)`
- `idx_status_created (status, created_at)`

**幂等迁移**：MySQL 8.0 兼容，使用 `ALTER TABLE ADD INDEX` 并捕获 `ER_DUP_KEYNAME` / `ER_DUP_INDEX`，重复执行无副作用。

---

## Bug 修复：28 项测试失败

### 根因 1（24 项）：事务内发送响应导致数据未持久化

**问题**：多个写路由在 `withTransaction` 回调内直接调用 `res.status(201).json()`，而事务提交 `conn.commit()` 在响应之后。一旦提交异常（如乐观锁冲突、SQL 错误），客户端已收到成功响应，但数据实际未落库。

**修复**：统一改为「事务内收集 `{status, body}` 结果对象 → 提交事务 → 事务外用 `res.status(r.status).json(r.body)` 发送响应」，与 create project 路由一致，保证「响应成功 = 数据已持久化」。

涉及路由（共 18+ 条写操作）：
- `routes-tasks.js`：编辑/删除任务、任务状态流转、子任务增删改/流转、评论增删
- `routes-projects.js`：编辑/删除项目、添加/转让/移除成员
- `routes-task-extras.js`：任务依赖增删、附件上传/删除、样品/治具关联增删
- `routes-stats.js`：工作流配置更新 `PUT /api/projects/workflow`

### 根因 2（2 项）：测试数据使用过期计划日期

**问题**：任务 CRUD 测试中任务 `planned_date` 使用已过期日期（如 `2026-08-20`），触发「状态动态延期 OVERDUE」逻辑（`planned_date < CURDATE()`），使后续状态流转 START/COMPLETE 的 CAS 校验返回 409。

**修复**：测试任务排期改为**相对未来日期**，不影响专门验证 OVERDUE 的用例（其仍用历史日期 `2020-01-01`）。

### 根因 3（2 项）：附件上传目录权限

**问题**：附件上传测试写文件到 `public/uploads/projects`，该目录归属 `www:www`，测试进程用户（`ystech`）无写权限，multer 写盘返回 EACCES 导致 400。

**修复**：`sudo chown -R ystech:www public/uploads/projects`（保持 `www` 组可写，不影响生产写入）。

---

## 文件清单

| 类别 | 文件 | 类型 | 说明 |
|---|---|---|---|
| 优化 | [dao-stats.js](../subsystems/projects/db/dao-stats.js) | MOD | 标量条件聚合 + Promise.all 并行 |
| 优化 | [routes-stats.js](../subsystems/projects/backend/routes-stats.js) | MOD | 看板 TTL 缓存；workflow PUT 事务外响应 |
| 优化 | [schema.sql](../subsystems/projects/db/schema.sql) | MOD | 新增两张复合索引 |
| 优化 | [migrations.js](../db/migrations.js) | MOD | 新增 `migrateProjectTaskIndexes`（幂等） |
| 修复 | [routes-tasks.js](../subsystems/projects/backend/routes-tasks.js) | MOD | 事务外响应（8 条写路由） |
| 修复 | [routes-projects.js](../subsystems/projects/backend/routes-projects.js) | MOD | 事务外响应（成员/编辑/删除） |
| 修复 | [routes-task-extras.js](../subsystems/projects/backend/routes-task-extras.js) | MOD | 事务外响应（依赖/附件/关联） |
| 修复 | [projects.test.js](../tests/projects.test.js) | MOD | 任务排期改相对未来日期 |
| 同步 | frontend/index.html、bundle.js | MOD | bundle 版本号同步 |

> `db/tx.js` 已清理临时诊断日志，逻辑无变更，未计入统计。

---

## 变更统计

| 维度 | 数值 |
|---|---|
| 修改文件 | 10 个 |
| 新增行 | +188 |
| 删除行 | -128 |
| **范围** | 项目追踪子系统 + 数据库迁移 + 测试 |

---

## API 变更

**无破坏性变更。** 所有 `/api/projects/*` 路径、参数、返回结构与字段保持不变。`GET /api/projects/stats` 仅优化内部实现与增加 30s TTL 缓存，前端无感。

`PUT /api/projects/workflow` 行为不变（ADMIN 专属 + 行锁事务 + 四态拓扑校验），仅修复了「事务内发响应」导致的状态机配置可能未持久化问题。

---

## 数据库变更

`project_tasks` 新增两张复合索引（幂等迁移，无数据改动，无副作用）。现有表结构、字段、数据不变。

---

## 测试验证

| 镜像 | 结果 |
|---|---|
| `tests/projects.test.js` | **52/52 PASS**（此前 24/52） |

测试覆盖：项目 CRUD、成员管理（owner 转移/移除）、任务 CRUD 与乐观锁、状态机流转与 CAS 并发、子任务三态流转、依赖环/阻塞校验、附件上传、样品/治具关联、工作流配置读写、CSV 导出。

> 说明：测试当前连接生产库 `sample_mgmt`；projects 子系统尚未标记 `deployed`（未上线），按 §20 允许注入测试数据。后续 projects 上线需按 §20 配置独立测试库与护栏。

---

## 发布与回滚

### 部署步骤

```bash
git checkout v2.0.1
npm install          # 若依赖未变可跳过
# 重启由宝塔面板运维执行（项目禁用 AI 自动重启）
```

### 数据库迁移

自动执行：`runMigrations()` 会在启动时幂等调用 `migrateProjectTaskIndexes`，无需手动执行 SQL。

### 回滚步骤

```bash
git checkout v2.0.0
```
索引可保留，无破坏性影响；如需移除可手动 `DROP INDEX`，非必须。

---

## 已知限制

| 限制 | 说明 |
|---|---|
| 看板统计为弱一致 | TTL 缓存 30s，最长接受 30s 延迟；如看板强一致场景需缩短 TTL 或绕过缓存 |
| 测试连生产库 | projects 未上线，允许注入；上线前需按 §20 隔离测试库 |

---

## 版本标记

```
v2.0.1 ← 当前版本
v2.0.0 ← 上一版本（子系统插件协议架构升级）
```

## 维护者

制造品质管理系统团队 · 详见 [AGENTS.md](./AGENTS.md)
