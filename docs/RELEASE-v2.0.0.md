# Release Notes — v2.0.0

> **发布日期**：2026-08-03 · **提交**：`937ec11` · **变更规模**：122 文件 / +10,870 行 / -1,141 行

---

## 概述

v2.0.0 是制造品质管理系统的**架构升级版本**，引入**子系统插件协议**，允许在不修改框架核心代码的前提下新增业务子系统。30 秒即可完成：`mkdir + manifest.json → 重启 → 自动发现`。

同时完成了样品管理、治具管理两大现有子系统的协议化迁移，新增子系统管理可视化面板、自动化测试（43 用例），并产出完整的部署与使用指南。

---

## 新增功能

### 1. 子系统插件协议 (Phase 1)

**核心架构**：`subsystems/<id>/manifest.json` 作为子系统唯一入口，声明元数据、API 路由、导航、状态机、角色权限。框架启动时自动扫描并挂载。

| 编号 | 文件 | 说明 |
|---|---|---|
| NEW | `shared/middleware/auth.js` | 鉴权中间件工厂，导出 `mount`/`requireAuth`/`currentUser` |
| NEW | `shared/middleware/upload.js` | 通用文件上传中间件工厂 (multer)，支持按子系统定制白名单 |
| NEW | `shared/state-machine.js` | 声明式状态机引擎，支持 `getAllowedActions`/`canTransition`/`getStateBadge` |
| NEW | `shared/file-manager.js` | 通用文件管理 DAO 工厂 |
| NEW | `shared/frontend/api-base.js` | 框架共享前端基础库（`$`/`api`/`boot`/`showToast`/`statusBadge` 等） |
| NEW | `shared/frontend/shared/utils.js` | 前端工具函数 |
| NEW | `shared/frontend/modal.js` | 通用弹窗组件 |
| NEW | `routes/subsystems.js` | 子系统发现与管理 API（5 个端点） |
| NEW | `subsystems/.gitkeep` | 占位目录 |
| MOD | `routes/auth.js` | 鉴权守卫重构为从 `shared/middleware/auth.js` 挂载 |
| MOD | `server.js` | 新增 `/shared/frontend` 和 `/subsystems` 静态服务路径 |

### 2. 样品子系统迁移 (Phase 2)

现有样品管理按协议重构为 `subsystems/samples/`，与旧路由并行运行。

| 编号 | 文件 | 说明 |
|---|---|---|
| NEW | `subsystems/samples/manifest.json` | 样品子系统元数据（6 状态 + 12 转移 + 6 导航） |
| NEW | `subsystems/samples/db/schema.sql` | samples + scan_logs DDL（幂等） |
| NEW | `subsystems/samples/db/dao.js` | 16 个 DAO 方法工厂 |
| NEW | `subsystems/samples/backend/index.js` | 协议接口桩 |
| NEW | `subsystems/samples/frontend/index.html` | SPA 入口 |
| NEW | `subsystems/samples/frontend/css/module.css` | 样品状态 badge 样式 |
| NEW | `subsystems/samples/frontend/js/` | 19 个 JS views 文件 |
| NEW | `subsystems/samples/seed/seed.js` | 15 个样品全状态覆盖 |
| MOD | `public/index.html` | 添加迁移标记注释 |

### 3. 治具子系统迁移 (Phase 3)

现有治具管理按协议重构为 `subsystems/fixtures/`。

| 编号 | 文件 | 说明 |
|---|---|---|
| NEW | `subsystems/fixtures/manifest.json` | 治具子系统元数据（12 状态 + 17 转移 + 5 文件分类） |
| NEW | `subsystems/fixtures/db/schema.sql` | fixtures + fixture_logs + fixture_files DDL |
| NEW | `subsystems/fixtures/db/dao.js` | 18 个 DAO 方法工厂 |
| NEW | `subsystems/fixtures/backend/index.js` | 协议接口桩 |
| NEW | `subsystems/fixtures/frontend/index.html` | SPA 入口 |
| NEW | `subsystems/fixtures/frontend/css/module.css` | 治具状态 badge 样式 |
| NEW | `subsystems/fixtures/frontend/js/` | 12 个 JS views 文件 |
| NEW | `subsystems/fixtures/seed/seed.js` | 15 个治具全状态覆盖 |
| MOD | `public/fixture.html` | 添加迁移标记注释 |

### 4. 自动发现 + 门户动态渲染 (Phase 4)

| 编号 | 文件 | 说明 |
|---|---|---|
| MOD | `server.js` | 启动时自动扫描 `subsystems/*/backend/index.js` → 调用 `register(app)`；扫描 `subsystems/*/db/schema.sql` → 建表 |
| MOD | `db.js` | `init()` 中新增子系统 schema 自动扫描与执行（幂等 `CREATE TABLE IF NOT EXISTS`） |
| MOD | `public/portal.html` | 硬编码卡片 → JS 动态渲染（`/api/subsystems` 驱动） |

### 5. 子系统管理可视化面板 (Phase 5)

| 编号 | 文件 | 说明 |
|---|---|---|
| NEW | `public/admin-subsystems.html` | 管理面板 SPA（子系统列表 + 新建 + 编辑 + 导出） |
| MOD | `routes/subsystems.js` | 新增 `POST /api/subsystems`（生成目录骨架 + 模板文件）、`GET /api/subsystems/:id/export`（下载 manifest.json） |
| MOD | `public/portal.html` | 页脚添加「子系统管理」入口链接 |
| MOD | `public/css/app.css` | 新增 `.portal-cards` + `.portal-card` 通用对齐类 |

### 6. 新模块模板

| 编号 | 文件 | 说明 |
|---|---|---|
| NEW | `subsystems/new-module/` | 最小可运行子系统模板，含 manifest.json + backend + frontend + db |

### 7. 测试与文档

| 编号 | 文件 | 说明 |
|---|---|---|
| NEW | `tests/subsystems.test.js` | **43 个单元测试用例**，覆盖 5 个端点 × 6 个角色的权限矩阵 |
| NEW | `docs/subsystem-management-guide.md` | 部署与使用指南（10 章） |
| NEW | `docs/superpowers/plans/2026-08-03-subsystem-protocol.md` | 33 个 Task 的完整实现计划 |
| NEW | `docs/superpowers/specs/2026-08-03-comprehensive-audit-report.md` | 全量审计报告 |

---

## API 变更

### 新增端点

| 方法 | 路径 | 鉴权 | 角色 | 说明 |
|---|---|---|---|---|
| `GET` | `/api/subsystems` | 无 | 全部 | 获取所有子系统摘要列表 |
| `GET` | `/api/subsystems/:id` | 无 | 全部 | 获取单个子系统完整 manifest |
| `POST` | `/api/subsystems` | 是 | ADMIN | 创建新子系统（生成目录骨架） |
| `PUT` | `/api/subsystems/:id/manifest` | 是 | ADMIN | 更新 manifest.json |
| `GET` | `/api/subsystems/:id/export` | 是 | ADMIN | 下载 manifest.json |

### 现有 API 不变

所有已有 `/api/samples/*`、`/api/fixtures/*`、`/api/scan/*`、`/api/cards/*`、`/api/login`、`/api/me`、`/api/dashboard` 路径和返回值**完全不变**。

### 新增静态路径

| 路径 | 映射目录 | 用途 |
|---|---|---|
| `/shared/frontend` | `shared/frontend/` | 框架共享 JS 模块 |
| `/subsystems` | `subsystems/` | 子系统 SPA 入口 |

---

## 变更统计

| 维度 | 数值 |
|---|---|
| 新建文件 | 70 个（+9,278 行） |
| 修改文件 | 49 个（+1,592 / -1,012） |
| 删除文件 | 3 个（-129 行） |
| **合计** | **122 个（+10,870 / -1,141）** |

### 目录级分布

| 目录 | 新建 | 修改 | 说明 |
|---|---|---|---|
| `shared/` | 8 | 0 | 框架共享层 |
| `subsystems/samples/` | 21 | 0 | 样品子系统 |
| `subsystems/fixtures/` | 13 | 0 | 治具子系统 |
| `subsystems/new-module/` | 5 | 0 | 模板子系统 |
| `routes/` | 1 | 1 | 子系统路由 |
| `public/` | 1 | 5 | 管理面板 + 门户 + 入口 |
| `docs/` | 4 | 12 | 设计文档 + 部署指南 |
| `tests/` | 1 | 1 | 单元测试 |
| 根目录 | 0 | 6 | server.js / db.js / package.json 等 |

---

## 迁移指南

### 对现有用户的影响

**零影响**。所有旧入口（`index.html`、`fixture.html`）和旧 API 路径保持不变，新旧路由并行运行。

### 数据库变更

**无需手动迁移**。`db.js` 自动扫描所有子系统 `db/schema.sql` 并执行幂等建表语句。现有 `samples`、`scan_logs`、`fixtures`、`fixture_logs`、`fixture_files` 表不受影响。

### 配置项变更

无。所有配置项（`.env`、PM2 环境变量）保持不变。

### 部署步骤

```bash
# 1. 拉取代码
git checkout v2.0.0

# 2. 安装依赖（如有新增）
npm install

# 3. 重启服务
pm2 restart sample-mgmt

# 4. 验证
curl http://localhost:4000/health
curl http://localhost:4000/api/subsystems
```

---

## 新增子系统快速指南

### 30 秒上手

```bash
# 方式一：命令行
mkdir -p subsystems/my-app/{backend,db,frontend,seed}
# 编写 manifest.json → 重启 → 门户自动出现

# 方式二：可视化面板
# 管理员登录 → 页脚「子系统管理」→ 新建 → 重启
```

最小 `manifest.json`：

```json
{
  "id": "my-app",
  "name": "我的应用",
  "description": "子系统描述",
  "version": "1.0.0",
  "icon": "_default",
  "route": {
    "prefix": "/api/my-app",
    "entry": "/subsystems/my-app/frontend/index.html",
    "hashBase": "/my-app"
  },
  "database": { "tables": [] },
  "roles": { "use": ["ADMIN"] },
  "navigation": [
    { "key": "home", "label": "首页", "icon": "chart", "view": "renderHome", "roles": ["ADMIN"] }
  ]
}
```

---

## 测试验证

| 镜像 | 结果 |
|---|---|
| `tests/subsystems.test.js` | **43/43 PASS** |
| `tests/auth.test.js` | PASS |
| `tests/dashboard.test.js` | PASS |
| `tests/samples.test.js` | PASS |

### 权限矩阵（全绿）

| 操作 | ADMIN | RD | QA | CUSTODY | ME | 未登录 |
|---|---|---|---|---|---|---|
| 查看子系统列表 | PASS | PASS | PASS | PASS | PASS | PASS |
| 查看单个 manifest | PASS | PASS | PASS | PASS | PASS | PASS |
| 新建子系统 | PASS | 403 | 403 | 403 | 403 | 401 |
| 编辑 manifest | PASS | 403 | 403 | 403 | 403 | 401 |
| 导出 manifest | PASS | 403 | 403 | 403 | 403 | 401 |

---

## 已知限制与后续计划

### Phase 6（未包含在本版本）

| Task | 说明 |
|---|---|
| 清理旧路由 | 移除 `routes/samples.js`/`routes/fixtures.js` 等旧文件，统一由子系统协议加载 |
| 清理旧 JS | 删除 `public/js/` 中已迁移到子系统的重复文件 |
| 前端入口切换 | 门户卡片默认指向 `subsystems/*/frontend/index.html` |

### 已知限制

| 限制 | 影响 | 缓解 |
|---|---|---|
| 新建/编辑子系统后需重启 | 路由变更在下次启动生效 | 管理面板已提示 |
| `statusBadge` 三处覆盖 | 依赖 JS 加载顺序 | Phase 6 改为显式插件注册 |
| `.b-RETURNING` 样式 | 旧版缺失，已填补到 module.css | 仅影响新 SPA 入口 |
| PM2 重启计数偏高 (107) | 开发期间频繁重启 | 发布后稳定运行 |
| 远端仓库未配置 | 无法 git push | 待配置 |

---

## 版本标记

```
v2.0.0 ← 当前版本
```

## 维护者

制造品质管理系统团队 · 详见 [AGENTS.md](./AGENTS.md)
