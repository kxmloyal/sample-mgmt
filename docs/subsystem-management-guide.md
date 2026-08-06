# 子系统管理模块部署与使用指南

> 版本：2.0.0 | 日期：2026-08-03 | 适用：制造品质管理系统

---

## 1. 架构概述

子系统插件协议允许在不修改框架核心代码（`server.js`、`portal.html`、`app.css`）的前提下，新增业务子系统。每个子系统为自包含目录，通过 `manifest.json` 声明元数据、状态机、导航、权限。

```
server.js 启动
  ├── 1. 扫描 subsystems/*/manifest.json
  ├── 2. 调用 subsystems/*/db/schema.sql → 建表（幂等）
  ├── 3. 调用 subsystems/*/backend/index.js → 挂载 Express 路由
  └── 4. GET /api/subsystems → portal.html 动态渲染卡片
```

**当前子系统清单**(由 `node tools/sync-subsystem-docs.js` 自动维护):

<!-- AUTO-SUBSYSTEMS:START -->
- **治具管理**(`fixtures`)：覆盖治具申请→制作→验证移交→领用→维修→报废全流程
- **项目追踪**(`projects`)：多项目问题/任务追踪：看板、子任务、依赖、评论、附件、留痕、导出
- **样品管理**(`samples`)：覆盖样品发行→确认→生命周期管理→分发全流程
- **全局工作台**(`workbench`)：跨部门项目进度监控，合并样品与治具待办积压视图
<!-- AUTO-SUBSYSTEMS:END -->

**核心文件**：

| 文件 | 职责 |
|---|---|
| `shared/middleware/auth.js` | 鉴权中间件工厂 |
| `shared/state-machine.js` | 通用状态机引擎 |
| `shared/file-manager.js` | 通用文件管理 DAO |
| `routes/subsystems.js` | 子系统发现 + CRUD API |
| `public/admin-subsystems.html` | 可视化管理面板 |
| `public/portal.html` | 门户首页（动态卡片） |

---

## 2. 快速新增子系统（3 步）

### 方式一：可视化面板（推荐）

1. 管理员登录门户 → 页脚「子系统管理」→ 进入管理面板
2. 点击「+ 新建子系统」→ 填写 ID / 名称 / 描述 / 图标 → 确认创建
3. 重启服务（`pm2 restart sample-mgmt`）使新路由生效

### 方式二：命令行手动创建

```bash
ID=my-module
mkdir -p subsystems/$ID/{backend,db,frontend/{js/views,css},seed}
```

**最小 manifest.json**：

```json
{
  "id": "my-module",
  "name": "我的模块",
  "description": "子系统描述",
  "version": "1.0.0",
  "icon": "_default",
  "route": {
    "prefix": "/api/my-module",
    "entry": "/subsystems/my-module/frontend/index.html",
    "hashBase": "/my-module"
  },
  "database": { "tables": [] },
  "roles": { "use": ["ADMIN"] },
  "navigation": [
    { "key": "home", "label": "首页", "icon": "chart", "view": "renderHome", "roles": ["ADMIN"] }
  ]
}
```

**最小 backend/index.js**：

```js
function register(app) {
  var requireAuth = app.locals.requireAuth;
  app.get('/api/my-module/ping', requireAuth, function(req, res) {
    res.json({ msg: 'pong' });
  });
}
async function initDB() { return true; }
async function seed() { return true; }
module.exports = { register, initDB, seed };
```

**重启后自动生效**，门户页自动出现新卡片。

---

## 3. API 端点一览

| 方法 | 路径 | 鉴权 | 角色 | 说明 |
|---|---|---|---|---|
| `GET` | `/api/subsystems` | 无 | 全角色 | 获取所有子系统摘要列表 |
| `GET` | `/api/subsystems/:id` | 无 | 全角色 | 获取单个子系统完整 manifest |
| `POST` | `/api/subsystems` | 是 | ADMIN | 创建新子系统（生成目录+模板） |
| `PUT` | `/api/subsystems/:id/manifest` | 是 | ADMIN | 更新 manifest.json |
| `GET` | `/api/subsystems/:id/export` | 是 | ADMIN | 下载 manifest.json 文件 |

### POST /api/subsystems 请求体

```json
{
  "id": "my-module",        // 必填，字母开头 kebab-case
  "name": "我的模块",        // 必填，显示名称
  "description": "描述",     // 可选
  "icon": "_default",       // 可选，_default/flask/wrench/chart
  "version": "1.0.0",       // 可选，默认 1.0.0
  "route": {                // 可选，自动生成
    "prefix": "/api/my-module",
    "entry": "/subsystems/my-module/frontend/index.html",
    "hashBase": "/my-module"
  },
  "roles": { "use": ["ADMIN"] },
  "navigation": [ ... ],
  "stateMachine": { ... },
  "files": { ... }
}
```

### GET /api/subsystems 返回格式

```json
[
  {
    "id": "samples",
    "name": "样品管理",
    "description": "覆盖样品发行→确认→生命周期管理→分发全流程",
    "version": "1.0.0",
    "icon": "flask",
    "route": { "entry": "/subsystems/samples/frontend/index.html" },
    "stateCount": 6,
    "navCount": 6
  }
]
```

---

## 4. 权限模型

| 操作 | ADMIN | RD | QA | CUSTODY | ME | 未登录 |
|---|---|---|---|---|---|---|
| 查看子系统列表 | 是 | 是 | 是 | 是 | 是 | 是 |
| 查看单个 manifest | 是 | 是 | 是 | 是 | 是 | 是 |
| 新建子系统 | **是** | 否 | 否 | 否 | 否 | 否 |
| 编辑 manifest | **是** | 否 | 否 | 否 | 否 | 否 |
| 导出 manifest | **是** | 否 | 否 | 否 | 否 | 否 |

---

## 5. 管理面板功能

访问路径：`http://<host>:<port>/admin-subsystems.html`（需 ADMIN 登录）

| 功能 | 操作 |
|---|---|
| 查看所有子系统 | 页面自动加载卡片式列表 |
| 新建子系统 | 点击「+ 新建子系统」→ 填写表单 → 确认 |
| 编辑 manifest | 点击「编辑」→ JSON 编辑器 → 修改 → 保存 |
| 导出 manifest | 点击「导出」→ 浏览器下载 JSON 文件 |

**注意事项**：
- 新建后的子系统需**重启服务**才能激活路由挂载
- 编辑 manifest 后，路由变更需**重启服务**生效
- 删除子系统：直接删除 `subsystems/<id>/` 目录，下次请求列表时自动刷新

---

## 6. manifest.json 字段完整规范

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 唯一标识，kebab-case |
| `name` | string | 是 | 显示名称 |
| `description` | string | 是 | 描述文本 |
| `version` | string | 是 | 语义化版本 |
| `icon` | string | 是 | 图标：flask/wrench/chart/_default |
| `route.prefix` | string | 是 | API 路径前缀 |
| `route.entry` | string | 是 | 前端入口路径 |
| `route.hashBase` | string | 是 | 前端 hash 路由基准 |
| `database.tables` | array | 是 | 数据库表声明 |
| `roles.use` | string[] | 是 | 可进入子系统的角色 |
| `navigation` | array | 是 | 导航菜单项 |
| `stateMachine` | object | 否 | 状态机定义 |
| `files` | object | 否 | 文件管理配置 |

---

## 7. 迁移与兼容性清单

样品管理、治具管理已随 Phase 5/6 迁移至子系统目录，全局工作台按协议新增：

| 现有功能 | 影响 | 说明 |
|---|---|---|
| 样品路由/入口 | 已迁移 | `routes/samples.js`、`public/index.html` 已迁至 `subsystems/samples/`，经门户统一访问 |
| 治具路由/入口 | 已迁移 | `routes/fixtures.js`、`public/fixture.html` 已迁至 `subsystems/fixtures/` |
| 扫码台 | 不变 | 状态机逻辑完全保持 |
| 治具管理 | 不变 | 独立子系统目录隔离 |
| 用户管理 | 不变 | 全局共享 `users` 表 |
| 操作日志 | 不变 | 各子系统写入 `scan_logs`/`fixture_logs` |

---

## 8. 目录生成模板

POST 创建子系统后，自动生成的完整骨架：

```
subsystems/<id>/
├── manifest.json              # 用户填写的元数据
├── backend/
│   └── index.js               # register(app) + initDB() + seed() 模板
├── db/
│   └── schema.sql             # 建表 DDL 占位
├── frontend/
│   ├── index.html             # 最小 SPA 入口
│   ├── css/
│   │   └── module.css         # 子系统专属样式占位
│   └── js/
│       └── views/             # 页面视图 JS
├── seed/
│   └── seed.js                # seed(pool) 函数模板
```

---

## 9. 部署检查清单

- [ ] 服务运行：`pm2 status` 确认 `sample-mgmt` 状态为 `online`
- [ ] 子系统发现：`curl http://localhost:4000/api/subsystems` 返回预期子系统
- [ ] 门户卡片：访问 `/` 确认动态渲染正确
- [ ] 管理页面：`/admin-subsystems.html` 可访问，ADMIN 可新建/编辑/导出
- [ ] 权限守卫：非 ADMIN 调用 POST/PUT/export 返回 403
- [ ] 三方隔离：样品/治具 API 不受新增子系统影响

---

## 10. 常见问题

**Q: 新建子系统后门户未显示新卡片？**
A: 需重启服务（`pm2 restart sample-mgmt`）使路由挂载生效。

**Q: 删除子系统目录后列表仍显示？**
A: 下次请求 `/api/subsystems` 时会自动刷新 registry，刷新页面即可。

**Q: 管理面板提示"加载失败"？**
A: 需以 ADMIN 账号登录后才可访问子系统管理 API。

**Q: 旧入口（index.html/fixture.html）还能用吗？**
A: 已统一迁移至 `subsystems/<id>/frontend/`，旧 `public/index.html`、`public/fixture.html` 已随 Phase 5/6 删除。所有子系统一律通过门户（portal.html）卡片进入。
