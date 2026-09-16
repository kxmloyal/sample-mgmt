# AGENTS.md 参考卷 A — 子系统插件协议（§17）

> 本文件是 `AGENTS.md` 的参考卷，收录原 §17（§17.1~§17.12）全文，**编号保持不变**。
> 拆分原因（2026-09-16）：`AGENTS.md` 曾达 68,256 字节，超出 AI 上下文注入预算（65,536 字节）后被静默截断——被截掉的正是文件尾部，而 **§23 禁止自动重启规则**就在尾部；故把低频查阅型长节外迁，主文件保留摘要与指针（见 `AGENTS.md`「本文件结构与参考卷」）。
> 章节导航：§17.1 核心原则 / §17.2 目标目录结构 / §17.3 manifest.json 完整规范 / §17.4 后端插件接口 / §17.5 前端插件接口 / §17.6 新增子系统完整流程（8 步）/ §17.7 框架自动发现机制 / §17.8 子系统管理可视化面板 / §17.9 现有子系统迁移路径 / §17.10 协议版本与兼容性 / §17.11 快速参考：新增子系统最小示例 / §17.12 新增子系统文档同步规则（强制）

---

## 17. 子系统插件协议（核心架构）

> 本协议定义了制造品质管理系统的**子系统接入标准**。所有子系统（含现有的样品管理、治具管理）
> 均遵循本协议。新增子系统只需按协议创建目录 + manifest.json + 实现接口，框架自动发现并挂载。

### 17.1 核心原则

1. **自包含**：每个子系统在其 `subsystems/<id>/` 目录内自包含，不跨子系统引用文件
2. **单一事实来源**：`manifest.json` 是框架发现子系统的唯一入口，所有配置集中于此
3. **约定优于配置**：`backend/index.js`、`db/schema.sql`、`frontend/index.html` 为固定路径
4. **框架不动、插件动**：新增子系统不修改 `server.js`、`portal.html`、`app.css` 等框架文件
5. **声明式状态机**：状态、转移规则、角色权限均在 manifest 中声明，框架自动校验

### 17.2 目标目录结构

```
/www/wwwroot/sample-mgmt/
├── server.js                    # 框架入口（自动扫描 subsystems/）
├── db.js                        # 数据层入口
├── shared/                      # 框架共享层
│   ├── middleware/
│   │   ├── auth.js              # 鉴权中间件（不绑定子系统）
│   │   └── upload.js            # 通用文件上传中间件
│   ├── state-machine.js         # 通用状态机引擎
│   ├── file-manager.js          # 通用文件管理 DAO
│   └── frontend/
│       ├── shared/              # 共享前端模块
│       ├── modal.js             # 通用弹窗
│       └── api-base.js          # 通用 api()/boot()/showToast()
├── subsystems/                  # ★ 所有子系统
│   └── <subsystem-id>/          # 单子系统根目录（id = kebab-case）
│       ├── manifest.json        # ★ 子系统元数据（框架唯一发现入口）
│       ├── backend/
│       │   └── index.js         # register(app) 入口，导出标准接口
│       ├── db/
│       │   ├── schema.sql       # 建表 DDL
│       │   └── dao.js           # 数据访问层
│       ├── frontend/
│       │   ├── index.html       # SPA 入口
│       │   ├── js/              # 子系统专属 JS
│       │   │   ├── router.js    # 前端路由 + VIEWS 注册
│       │   │   └── views/       # 各视图渲染函数
│       │   └── css/
│       │       └── module.css   # 子系统专属样式
│       └── seed/
│           └── seed.js          # 测试数据（导出 seed(pool) 函数）
├── public/
│   ├── portal.html              # 门户（JS 动态渲染子系统卡片）
│   ├── css/
│   │   └── app.css              # 仅保留共享样式（布局/基础组件/CSS 变量）
│   └── uploads/                 # 上传目录
└── docs/
    ├── archive/           # 历史设计文档与实现计划归档(已完成迭代)
    └── superpowers/
        ├── specs/         # 当前有效设计规范与文档
        └── plans/         # 当前有效实现计划
```

### 17.3 manifest.json 完整规范

manifest.json 是**单一事实来源**。框架通过读取它自动完成：门户卡片生成、导航菜单渲染、状态机校验、路由前缀分配、数据库建表。

```jsonc
{
  // ===== 基础元数据（必填） =====
  "id": "samples",                          // 唯一标识，与目录名一致，kebab-case
  "name": "样品管理",                        // 显示名称
  "description": "...",                     // 描述文本（门户卡片显示）
  "version": "2.0.0",                       // 语义化版本，DB 迁移使用
  "icon": "flask",                          // 图标标识（门户 + 侧边导航）

  // ===== 路由与入口（必填） =====
  "route": {
    "prefix": "/api/samples",               // API 路径前缀，框架自动挂载
    "entry": "/subsystems/samples/frontend/index.html",  // 前端入口
    "hashBase": "/samples"                  // 前端 hash 路由基准
  },

  // ===== 数据库（必填） =====
  "database": {
    "tables": [                             // 声明要建的数据库表
      { "name": "samples",   "schema": "db/schema.sql" },
      { "name": "scan_logs", "schema": "db/schema.sql" }
    ],
    "migrations": "db/migrations.js"        // 增量迁移脚本（可选）
  },

  // ===== 角色权限（必填） =====
  "roles": {
    "use": ["ADMIN", "RD", "QA", "CUSTODY", "ME"],   // 可进入子系统的角色
    "admin": ["ADMIN"]                                // 管理角色
  },

  // ===== 左侧导航（必填） =====
  "navigation": [
    {
      "key": "dashboard",                   // 唯一键，用于 hash 路由
      "label": "样品看板",                   // 显示文本
      "icon": "chart",                      // 图标标识
      "view": "renderDashboard",            // 前端 view 函数名（全局作用域）
      "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"]  // 可见角色
    },
    {
      "key": "list",
      "label": "样品列表",
      "icon": "list",
      "view": "renderList",
      "roles": ["ADMIN", "RD", "QA", "CUSTODY", "ME"]
    }
    // ... 更多菜单项
  ],

  // ===== 状态机（必填：含状态机的子系统） =====
  "stateMachine": {
    "initial": "NEW",                       // 初始状态
    "states": {                             // 状态定义
      "NEW": {
        "label": "新建(待制作)",
        "color": "#115e59",                 // 文字颜色
        "bg": "#f0fdfa"                     // 背景颜色
      }
      // ... 更多状态
    },
    "transitions": [                        // 状态转移规则
      {
        "from": "NEW",                      // 源状态
        "to": "PRODUCED",                   // 目标状态
        "action": "PRODUCE",                // 操作标识
        "role": ["RD"],                     // 允许执行的角色
        "label": "制作完成"                  // 人类可读标签
      }
      // ... 更多转移
    ]
  },

  // ===== 文件管理（可选：含文件上传的子系统） =====
  "files": {
    "enabled": true,
    "uploadDir": "uploads/my-module",       // 上传子目录
    "maxSize": 10485760,                    // 最大文件字节数（默认 10MB）
    "categories": [                         // 文件分类
      { "key": "design_drawing", "label": "设计图纸", "extensions": ["pdf","dwg","step"] },
      { "key": "photo",         "label": "实物照片", "extensions": ["jpg","png","webp"] }
    ]
  }
}
```

**manifest 字段清单**：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | 是 | 唯一标识，kebab-case，与目录名一致 |
| `name` | string | 是 | 显示名称 |
| `description` | string | 是 | 描述文本 |
| `version` | string | 是 | 语义化版本号 |
| `deployed` | boolean | 否 | 上线标记：`true`=已正式上线，受 §20 保护规则约束（默认未上线）|
| `icon` | string | 是 | 图标标识 |
| `route.prefix` | string | 是 | API 路径前缀 |
| `route.entry` | string | 是 | 前端入口页面路径 |
| `route.hashBase` | string | 是 | 前端 hash 路由基准 |
| `database.tables` | array | 是 | 数据库表声明 |
| `database.migrations` | string | 否 | 迁移脚本路径 |
| `roles.use` | string[] | 是 | 可进入子系统的角色列表 |
| `roles.admin` | string[] | 否 | 管理角色列表 |
| `navigation` | array | 是 | 导航菜单项，每项含 key/label/icon/view/roles |
| `stateMachine` | object | 否 | 状态机定义（无状态子系统可省略） |
| `stateMachine.initial` | string | 是* | 初始状态 |
| `stateMachine.states` | object | 是* | 状态定义，每个状态含 label/color/bg |
| `stateMachine.transitions` | array | 是* | 转移规则，每项含 from/to/action/role/label |
| `files` | object | 否 | 文件管理配置（无文件子系统可省略） |
| `files.uploadDir` | string | 是* | 上传目录路径 |
| `files.categories` | array | 是* | 文件分类，每项含 key/label/extensions |

### 17.4 后端插件接口

每个子系统的 `backend/index.js` **MUST** 导出以下接口：

```js
// subsystems/<id>/backend/index.js

/**
 * 注册子系统的 Express 路由和中间件。
 * @param {Express} app - Express 应用实例
 *
 * 实现要求：
 * - 所有 API 路径 MUST 使用 manifest.route.prefix 作为前缀
 * - 鉴权通过 req.session.userId 获取，角色通过 req.user.role
 * - 敏感写操作 MUST 使用事务
 */
function register(app) { ... }

/**
 * 初始化数据库表（幂等：使用 CREATE TABLE IF NOT EXISTS）。
 * 框架在首次加载时自动调用。
 * @returns {Promise<void>}
 */
async function initDB() { ... }

/**
 * 填充种子数据（仅开发/测试环境使用）。
 * @returns {Promise<void>}
 */
async function seed() { ... }

module.exports = { register, initDB, seed };
```

**register 函数必须遵循的规则**：
- 通过 `app.locals.requireAuth` 获取鉴权中间件
- 通过 `app.locals.currentUser` 获取当前用户
- 路径前缀从 `manifest.json` 的 `route.prefix` 读取
- 错误返回格式 `{ error: "..." }` + 语义化 HTTP 状态码
- 写操作 MUST 包裹 try-catch，返回 500 兜底

### 17.5 前端插件接口

每个子系统的 `frontend/` 目录为独立 SPA，与现有子系统（samples/fixtures）前端模式一致：

**必须提供的文件**：

| 文件 | 作用 |
|---|---|
| `frontend/index.html` | SPA 入口，格式与现有子系统（samples/fixtures）前端一致 |
| `frontend/js/router.js` | 前端路由，解析 `location.hash`，调用 `manifest.navigation[].view` 对应函数 |
| `frontend/js/views/*.js` | 每个 view 函数独立文件，文件容量遵循第 7.1 节红线 |

**共享引用约定**：
```html
<!-- 共享 CSS -->
<link rel="stylesheet" href="/css/app.css?v=..." />
<!-- 子系统专属 CSS -->
<link rel="stylesheet" href="/subsystems/<id>/frontend/css/module.css" />
<!-- 共享 JS（框架提供） -->
<script src="/shared/frontend/shared/utils.js"></script>
<script src="/shared/frontend/api-base.js"></script>
<script src="/shared/frontend/modal.js"></script>
<!-- 子系统 JS -->
<script src="/subsystems/<id>/frontend/js/views/dashboard.js"></script>
<script src="/subsystems/<id>/frontend/js/router.js"></script>
```

**注意事项**：
- `app.css` 仅保留框架级样式（布局、基础组件、CSS 变量、`.toast`、`.modal` 等）
- 子系统专属样式写入 `frontend/css/module.css`，**禁止**写入 `app.css`
- 子系统状态 badge 样式由框架根据 `manifest.stateMachine.states` 自动生成
- 系统间禁止交叉引用 JS/CSS 文件

### 17.6 新增子系统完整流程（8 步）

> 快速生成：也可用脚手架 CLI `node tools/create-subsystem.js <id> <name> [描述]`，交互式补全状态机/文件管理（非 TTY 自动用默认值），一步生成 manifest + backend + schema.sql + frontend 全套骨架。CLI 与管理面板共用 tools/subsystem-templates.js 同一模板源。

```
第1步：创建目录
  mkdir -p subsystems/my-module/{backend,db,frontend/{js/views,css},seed}

第2步：编写 manifest.json
  填写 id/name/description/route/database/roles/navigation/stateMachine/files
  可使用「子系统管理」可视化面板辅助生成

第3步：编写 db/schema.sql
  CREATE TABLE IF NOT EXISTS my_module (...)

第4步：编写 backend/index.js
  实现 register(app) / initDB() / seed() 三个接口

第5步：编写 frontend/index.html
  复制现有 SPA 骨架，修改标题 + logo + JS 引用

第6步：编写前端 views
  每个 navigation.view 对应一个 js/views/<view>.js 文件
  实现全局函数，接收并渲染数据到 #view 容器

第7步：编写 frontend/js/router.js
  解析 hash → 调用对应 view 函数 → 渲染导航菜单

第8步：重启服务
  框架自动扫描 subsystems/ → 读取 manifest → 建表 → 挂载路由 → 生成门户卡片
```

**不需要做的**（框架自动处理）：
- 不需要修改 `server.js`
- 不需要修改 `portal.html`
- 不需要修改 `app.css`
- 不需要手动注册路由
- 不需要手动建表

### 17.7 框架自动发现机制

`server.js` 在启动时执行以下逻辑（伪代码）：

```
1. 扫描 subsystems/ 下所有子目录
2. 对每个子目录，读取 manifest.json → 校验 schema
3. 对每个通过校验的 manifest：
   a. 调用 backend/index.js 的 initDB() → 建表
   b. 调用 backend/index.js 的 register(app) → 挂载路由
   c. 将 manifest 注册到全局 subsystemRegistry
4. 启动 HTTP 服务
5. 门户 portal.html 通过 API 获取 subsystemRegistry → 动态渲染卡片
```

**运行时 API**：

| 端点 | 用途 |
|---|---|
| `GET /api/subsystems` | 获取已注册子系统的 manifest 列表（门户卡片渲染）；2026-09-08 起普通用户仅返回 `deployed:true` 已上线子系统；**ADMIN 返回全量（含未上线，门户以半透明+「未上线」角标渲染）**，见 §20 |
| `GET /api/subsystems?all=1` | 全量清单（2026-09-08 二次调整后与 ADMIN 默认列表等效，参数向后兼容保留；普通用户传 `all=1` 不扩权仍为过滤列表） |
| `GET /api/subsystems/:id` | 获取单个子系统的 manifest |
| `PUT /api/subsystems/:id/manifest` | 更新 manifest.json（ADMIN 专属，子系统管理面板使用） |

### 17.8 子系统管理可视化面板

在「用户管理」旁新增「子系统管理」入口（仅 ADMIN 可见）。

**功能**：

| 功能 | 说明 |
|---|---|
| 子系统列表 | 卡片展示所有已注册子系统（图标 + 名称 + 状态数 + 角色数） |
| 新建子系统 | 5 步分步表单，填写后自动生成 manifest.json 和目录骨架 |
| 编辑子系统 | 可视化编辑 manifest 各项配置（基本信息/状态机/导航/角色/数据库） |
| 启用/禁用 | 临时关闭某子系统（不删除，仅从门户和路由中隐藏） |
| 导出 manifest | 下载 manifest.json 供版本控制 |

**新建子系统分步表单**：

| 步骤 | 填什么 | 产出 |
|---|---|---|
| 1. 基本信息 | id/name/description/icon/API 前缀 | manifest 基础字段 |
| 2. 状态机 | 可视化添加状态节点 + 拖拽连线定义转移规则 | `stateMachine` 字段 |
| 3. 角色权限 | 勾选哪些角色可访问该子系统 | `roles` 字段 |
| 4. 导航菜单 | 添加菜单项（key/label/view 函数名） | `navigation[]` 字段 |
| 5. 数据库 | 声明表名 + 输入 SQL DDL | `database.tables[]` 字段 |

提交后后端自动：
1. 写入 `subsystems/<id>/manifest.json`
2. 生成 `backend/index.js` 骨架（含 register/initDB/seed 模板）
3. 生成 `frontend/index.html` 骨架
4. 生成 `db/schema.sql` 骨架
5. 写入 manifest 与骨架文件并刷新 registry（门户刷新即见卡片）；**注意：新增子系统的 API 路由不会热挂载**——`POST /api/subsystems` 不调用新子系统的 `register(app)`，需**重启服务**后才生效（由运维在宝塔面板执行，见 §23）

### 17.9 现有子系统迁移路径

样品管理、治具管理已按协议完成迁移（2026-08，Phase 5/6），全局工作台亦按协议新增。下表为迁移路径参考（已完成，仅存档）：

| 迁移项 | 当前位置 → 目标位置 | 注意事项 |
|---|---|---|
| 路由 | `routes/samples.js` → `subsystems/samples/backend/index.js` | 保持 API 返回格式不变 |
| 扫码 | `routes/scan.js` → `subsystems/samples/backend/index.js`（合并） | 状态机逻辑从 if-else 改为 manifest 驱动 |
| 标示卡 | `routes/cards.js` + `routes/card-page.js` → `subsystems/samples/backend/` | 作为子模块文件保留 |
| 治具路由 | `routes/fixtures.js` + 4 个 helper → `subsystems/fixtures/backend/` | 合并 register |
| 数据库 | `db.js` 内嵌 DDL → `subsystems/*/db/schema.sql` | 原有 CREATE TABLE IF NOT EXISTS 保持幂等 |
| DAO | `db/samples.js` `db/fixtures.js` → `subsystems/*/db/dao.js` | 保持函数签名不变 |
| 前端 CSS | `app.css` 中 `.b-NEW` 等 → 由框架根据 manifest 自动生成 | 删除 `app.css` 中子系统状态 badge |
| 前端 HTML | `public/index.html` → `subsystems/samples/frontend/` | 共享引用路径调整 |
| 前端 JS | `public/js/*.js` → `subsystems/samples/frontend/js/` | 按 views/ 拆分 |
| 种子数据 | `seed-samples.js` → `subsystems/samples/seed/seed.js` | 导出 seed(pool) 函数 |
| 门户 | `portal.html` 硬编码卡片 → JS 动态渲染 | 新增子系统自动出现 |

**迁移原则**：
- 先建新结构，并行运行，逐步切换
- API 路径不变（`/api/samples` 保持不变），前端入口 URL 不变
- 数据库表不改名、不改字段
- 迁移期间不影响生产环境

### 17.10 协议版本与兼容性

| 协议版本 | 说明 |
|---|---|
| `1.0.0` | 初始版本，定义 manifest schema 和后端/前端接口 |
| 未来版本 | manifest 字段新增 MUST 向后兼容（新字段设默认值），字段删除 MUST 经过 2 个迭代周期弃用期 |

**AI 拦截规则（协议相关）**：
- 新增代码违反目录规范（如把新子系统路由写入 `routes/`） → 拒绝，要求按协议放入 `subsystems/`
- 修改 `app.css` 添加子系统特定样式 → 拒绝，要求写入 `module.css`
- 跨子系统引用文件 → 标记高危，中止

### 17.11 快速参考：新增子系统最小示例

**最小 manifest.json**（无状态机、无文件管理的最简子系统）：
```json
{
  "id": "reports",
  "name": "报表中心",
  "description": "品质报表汇总与导出",
  "version": "1.0.0",
  "icon": "chart",
  "route": { "prefix": "/api/reports", "entry": "/subsystems/reports/frontend/index.html", "hashBase": "/reports" },
  "database": { "tables": [] },
  "roles": { "use": ["ADMIN", "QA"] },
  "navigation": [
    { "key": "dashboard", "label": "报表看板", "icon": "chart", "view": "renderReportDashboard", "roles": ["ADMIN", "QA"] }
  ]
}
```

### 17.12 新增子系统文档同步规则（强制）

> 新增/删除子系统时，除 `subsystems/<id>/` 目录与 manifest 外，MUST 同步维护规则文件与相关文档。
> 自动化：`tools/sync-subsystem-docs.js` 扫描 `subsystems/*/manifest.json`（单一事实来源），自动重写各文档标记块。

**自动维护的标记块**（禁止手改，由脚本生成）：

| 标记块 | 位置 | 内容 |
|---|---|---|
| `<!-- AUTO-SUBSYSTEMS:START/END -->` | AGENTS.md / CLAUDE.md / README.md / docs/subsystem-management-guide.md | 子系统清单（名称+描述） |
| `<!-- AUTO-SUBSYSTEMS-TREE:START/END -->` | AGENTS.md | 目录结构 subsystems/ 子树 |

**执行时机（MUST）**：
- 通过脚手架新增子系统：`node tools/create-subsystem.js <id> <name>` 已自动调用同步脚本
- 通过管理面板或手动新增/删除子系统：MUST 手动运行 `node tools/sync-subsystem-docs.js`（无 sudo 时用 `sudo -u www`）

**标记块外的人工同步项（AI MUST 同步）**：
- AGENTS.md 第 1 节子系统概述（如「三大子系统」措辞）、第 14 节技术债、API 表
- CLAUDE.md 第 1 节、第 5.1 节隔离原则、第 11 节技术债
- README.md 各子系统功能章节、API 表
- docs/subsystem-management-guide.md 迁移表

**AI 拦截规则**：
- 新增/删除子系统后标记块未同步 → 暂停，要求运行同步脚本
- 手改标记块内内容 → 警告，要求用脚本重新生成
- 跳过文档同步项直接交付 → 拒绝
