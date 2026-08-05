# AGENTS.md — 制造品质管理系统 AI 协作指南

> 本文件是所有 AI agent(包括 Claude、Codex、Gemini 等)在本项目工作时的统一指南。
> 任何 AI 在动手前 MUST 完整阅读本文件,并遵守其中所有规则。

## 1. 项目概述

**制造品质管理系统**:含样品管理、治具管理与全局工作台三大子系统，统一门户入口（portal.html），三方扫码驱动状态机，全量留痕。**架构基础：子系统插件协议（见第 17 节）**，新增子系统通过 manifest.json + 标准接口即可接入框架，无需修改框架核心代码。

**子系统**:
- **样品管理**:覆盖样品「发行 → 确认 → 生命周期管理 → 分发」全流程
- **治具管理**:覆盖治具「申请 → 制作 → 验证移交 → 领用 → 维修 → 报废」全流程
- **全局工作台**:跨部门监控样品/治具项目进度（待办/积压 3 档），积压阈值仅 ADMIN 可改（全局生效）

**五个责任主体**:
- 研发工程:建样、制作治具、扫码确认制作、维修治具、创建替代品
- 品保文管中心:样品扫码发行/复检/审核退回；治具验证移交/领用/报修
- 生技部:样品保管/退回；治具验证移交/领用/保养/维修
- 各部门保管:样品接收保管/申请退回；治具验证移交/领用/报修
- 管理员:用户管理、全局查看、治具报废

**状态机**:
- 样品:`NEW → PRODUCED → RELEASED → IN_CUSTODY → RETURNING → RETIRED`
- 治具:`REQUESTED → ACCEPTED → VERIFY_PENDING → TRANSFERRED ⇄ IN_USE → REPAIRING_ME/REPAIRING_RD → REPAIR_DONE → TRANSFERRED → RETIRED`，另有 `IN_USE←IMPROVING` 改善流程。验证为**单人验证**（申请部门人员验证即可移交）；`VERIFY_RD_OK/VERIFY_ORG_OK` 为历史状态（旧双人验证，存量数据兼容）

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express 4.x(CommonJS) |
| 数据库 | MariaDB(MySQL) via mysql2,连接池,数据存 `sample_mgmt` 库 |
| 鉴权 | express-session + bcryptjs,8h session |
| 二维码 | qrcode |
| 前端 | 原生 HTML/CSS/JS 单页(无构建、无框架) |
| 配置 | dotenv 加载 .env;PM2/宝塔注入的环境变量优先 |

**数据库**:已从 SQLite 迁移至 MariaDB。如需回退 SQLite,仅需替换 `db.js`。

## 3. 目录结构

```
/www/wwwroot/sample-mgmt/
├── server.js              # 框架入口:加载中间件、自动扫描 subsystems/ 挂载子系统、注册公共路由
├── db.js                  # 数据层入口:连接池 + 自动执行 subsystems/*/db/schema.sql 建表 + 扫描加载子系统 DAO
├── db/
│   ├── users.js           # 用户查询
│   ├── fixture-files.js   # 治具文件管理 DAO
│   ├── migrations.js      # 增量迁移
│   └── tx.js              # 事务工具
├── routes/
│   ├── auth.js            # 鉴权路由(登录/登出)
│   ├── misc.js            # 杂项路由(看板/日志/用户/健康检查)
│   └── subsystems.js      # 子系统发现 + CRUD API(管理面板)
├── shared/                # 框架共享层
│   ├── middleware/        # 鉴权/上传中间件(不绑定子系统)
│   ├── state-machine.js   # 通用状态机引擎
│   ├── file-manager.js    # 通用文件管理 DAO
│   └── frontend/          # 共享前端模块(api-base.js / modal.js / shared/utils.js)
├── subsystems/            # ★ 所有子系统(插件协议,见第 17 节)
│   ├── samples/           # 样品管理(backend/ db/ frontend/ seed/ manifest.json)
│   ├── fixtures/          # 治具管理(同上)
│   └── workbench/         # 全局工作台(跨部门积压监控 + 阈值设置)
├── logger.js              # 日志系统(Winston)
├── seed.js                # 种子:6 个角色账号
├── seed-samples.js        # 样品全量测试数据:15 个,6 种状态全覆盖
├── seed-fixture.js        # 治具全量测试数据:15 个,12 种状态全覆盖
├── public/
│   ├── portal.html        # 门户首页(统一入口,JS 动态渲染子系统卡片)
│   ├── admin-subsystems.html # 子系统可视化管理面板(仅 ADMIN)
│   ├── css/app.css        # 共享样式(布局/基础组件/CSS 变量/卡片设计 token)
│   └── uploads/           # 样品/治具图片上传目录
├── data/                  # 共享数据(limit-items.json, source-types.json)
├── tests/                 # 单元测试(含 helpers)
├── docs/
│   ├── deploy-baota.md    # 宝塔部署文档
│   ├── operation-manual.md # 用户操作说明书
│   ├── subsystem-management-guide.md # 子系统管理指南
│   ├── RELEASE-v2.0.0.md  # v2.0.0 发布说明
│   ├── archive/           # 已完成迭代的设计文档与实现计划归档
│   └── superpowers/       # 当前有效规范与计划
│       ├── specs/         # brainstorming 产出的设计文档(迭代完成后归档)
│       └── plans/         # writing-plans 产出的实现计划(迭代完成后归档)
├── .env.example           # 环境变量模板(含 MariaDB 连接配置)
├── .gitignore
└── package.json
```

## 4. 启动与运行

```bash
npm install         # 安装依赖
cp .env.example .env   # 首次复制环境变量
npm run seed        # 初始化角色账号(仅一次)
npm run seed-samples # 样品全量测试数据(15 个,6 种状态全覆盖)
npm run seed-fixture # 治具全量测试数据(15 个,12 种状态全覆盖)
npm start           # 启动,访问 http://localhost:4000(端口可通过 .env 中 PORT 配置)
```

**演示账号**(更多见 README.md):
| 账号 | 密码 | 角色 | 部门 |
|---|---|---|---|
| admin | admin123 | 管理员 | 系统 |
| rd01 | rd123 | 研发(RD) | 研发中心 |
| qa01 | qa123 | 品保(QA) | 品保文管中心 |
| mfg01 | mfg123 | 保管(CUSTODY) | 制造部 |
| fqc01 | fqc123 | 保管(CUSTODY) | FQC |
| me01 | me123 | 保管(ME) | 生技部 |

## 5. AI 工作流程(强制)

任何非平凡的需求,**MUST** 按以下流程执行,不得跳步:

```
1. brainstorming(技能)  → 探索意图、对比方案、用户确认设计
2. 写设计文档            → docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
3. writing-plans(技能)  → 产出实现计划 docs/superpowers/plans/YYYY-MM-DD-<topic>.md
4. subagent 驱动执行     → 每个 Task 派发独立 subagent,Task 间审查
5. 回归验证              → browser_use 自动化 + 手动检查清单
6. 文件臃肿检测报告       → 修改完成 MUST 输出(见第 9 节)
```

**例外**:简单 bug 修复、单行配置改动、纯文档更新可跳过 1-3,但仍需第 5-6 步。

> 迭代完成部署后,将已实施的设计文档/实现计划归档至 `docs/archive/`,当前有效文档保留在 `docs/superpowers/`。

## 6. 全链路变更规则(强制)

> 详细规则见用户 user_rules。核心要点:

1. **变更前** MUST 全局扫描项目,输出《全链路关联依赖清单》(上游/下游/跨模块),覆盖 5 维度:代码、SQL、配置、接口、文档。
2. **变更中** 禁止单点修改,清单内所有关联项同步改;无法同步的采用兼容改造方案(保留旧逻辑,逐步切换)。
3. **高危删除**(字段/接口/常量)MUST 三步走:兼容 → 注释下线 → 物理删除(≥2 个迭代周期后)。
4. **变更后** MUST 补充关联单元测试 + 输出业务回归清单 + 提示上线后 1~3 周期监控。

**AI 拦截逻辑**(触发即停止生成代码):
- 用户只改单点、拒绝全链路排查 → 拒写代码
- 直接删字段/参数无兼容代码 → 标记高危,中止
- 只改主文件、关联文件遗漏 → 列出遗漏,暂停

### 6.1 子系统隔离原则(强制)

本项目含**样品管理**与**治具管理**两个独立子系统,修改任一子系统 MUST 确保不影响另一子系统:

1. **共享资源变更 MUST 双系统回归**:修改共享文件（`server.js`/`db.js`/`app.css`/`modal.js`/`portal.html` 等）时,MUST 在样品和治具两个子系统中均进行回归验证,确认行为无变化。
2. **禁止交叉污染**:不得为了修复/优化一个子系统而改变另一个子系统的行为、样式、接口返回格式、状态机流转逻辑。
3. **共享 CSS 类修改**:修改 `app.css` 中的共享样式类时,MUST 同时在样品页面（`subsystems/samples/frontend/index.html`）和治具页面（`subsystems/fixtures/frontend/index.html`）验证渲染效果,不得破坏任一系统的 UI 布局。
4. **共享中间件/路由修改**:修改 `requireAuth`、`db.js` 连接池、公共路由模块时,MUST 验证两个子系统的鉴权、数据读写均正常。
5. **API 路径隔离**:样品 API（`/api/samples/...`）与治具 API（`/api/fixtures/...`）路径前缀已隔离,新增 API 不得跨子系统复用路径前缀。

**AI 拦截逻辑**:
- 修改共享文件但仅验证一个子系统 → 暂停,要求补充另一子系统的回归验证
- 为治具功能修改了样品的状态机/接口行为 → 标记高危,中止
- UI 改动仅在一个子系统验证 → 要求补充双系统截图/验证

## 7. 代码规范

### 7.1 文件容量红线(MUST)

| 文件类型 | 行数上限 | 字符上限 |
|---|---|---|
| 常量/枚举/实体DTO | 150 | — |
| 通用工具 utils | 200 | — |
| 独立脚本/通用函数 | 300 | — |
| Controller/API | 400 | — |
| Service 业务逻辑 | 400 | — |
| Vue/React 页面组件 | 400 | — |
| 项目唯一入口 main | 600 | — |
| SQL 脚本 | 800 | — |
| 任意源码文件(兜底) | — | 20000 |
| constants 常量文件(豁免) | 800 | — |
| 单元测试(豁免) | 1000 | — |

**阈值预警**:
- 达 70% 上限:MUST 停止新增业务逻辑,输出拆分方案
- 达 90% 上限:MUST 仅允许精简/重构,禁止追加新功能

### 7.2 元素数量

- 单文件顶层函数 MUST ≤10
- 单文件顶层 Class MUST ≤3
- 单函数内部代码块 MUST ≤60 行,超长 MUST 拆分子函数

### 7.3 单一职责

- Controller:仅参数接收/校验/转发,不写 DB/计算/渲染
- Service:仅业务流程,不写前端渲染/SQL/常量配置
- DB 操作统一抽 Mapper/DAO 层
- 常量/字典/枚举 MUST 抽至 constants 目录
- 页面复杂渲染逻辑 SHOULD 抽 hooks/helper 独立文件

### 7.4 命名风格

- JS:`camelCase` 变量/函数,`PascalCase` 类,`UPPER_SNAKE` 常量
- CSS:`kebab-case`,BEM 风格可选
- 文件:`kebab-case` 小写,业务按模块分文件

### 7.5 注释要求

新增/修改函数、类、接口 MUST 补充注释:
- 功能描述与变更目的
- 参数说明(类型、含义、必填/可选、是否兼容旧参数)
- 返回值说明(是否兼容旧调用方)
- 异常说明(变更后可能新增的异常场景)

## 8. Git 规范

### 8.1 提交格式(Conventional Commits)

```
<type>(<scope>): <subject>

<body 可选,说明 why>

<footer 可选,如 BREAKING CHANGE>
```

**type**:
- `feat`:新功能
- `fix`:bug 修复
- `refactor`:重构(无功能变化)
- `docs`:文档
- `chore`:构建/工具/杂项
- `test`:测试
- `style`:格式(不影响代码逻辑)
- `perf`:性能优化

**scope** 示例:`modal`/`detail`/`responsive`/`auth`/`scan`/`db`

**示例**:
```
feat(responsive): add 3 breakpoints (768/1200/1600px)

- 768px: 2-col grid 35%/65%
- 1200px: modal 800px, 2-col 30%/70%
- 1600px: modal 900px, 3-col 25%/25%/50%, show .detail-img
```

### 8.2 提交粒度

- 一个 Task 一个 commit(参考实现计划)
- commit 信息聚焦「why」而非「what」
- **禁止** `git add -A` 后一次提交多个无关改动
- **禁止** push 除非用户明确要求

### 8.3 禁止行为

- NEVER `git push --force` 到 main/master
- NEVER 修改 git config 除非用户要求
- NEVER `reset --hard` / `checkout .` / `clean -f` 除非用户明确要求
- NEVER commit `.env` / 凭证文件

## 9. 修改完成强制报告(MUST)

每次修改文件结束,MUST 输出 3 项臃肿检测信息:

1. **文件类型、当前有效代码行数、总字符、距离上限剩余空间**
2. **当前文件函数/顶层 Class 数量,是否触发预警阈值**
3. **冗余清单**:未使用导入、废弃代码块、可合并重复逻辑 + 瘦身拆分优化方案

## 10. 响应式 UI 约定

本项目前端为单体 HTML,CSS 已建立响应式断点体系:

| 断点 | 视窗宽度 | 用途 |
|---|---|---|
| XS | <576px | 手机单栏 |
| SM | 576~767px | 大手机/小平板 |
| MD | 768~1199px | 平板双栏 |
| LG | 1200~1599px | 桌面双栏 |
| XL | ≥1600px | 大屏三栏 |

新增 UI MUST 遵循上述断点,使用 CSS Grid + Flexbox,避免硬编码 px 宽度。

## 11. API 约定

- 所有 API 路径以 `/api/` 开头
- 返回 JSON,错误格式 `{ "error": "..." }`,HTTP 状态码语义化
- 鉴权:session cookie(`requireAuth` 中间件)
- 角色:`ADMIN`/`RD`/`ME`/`QA`/`CUSTODY`,接口需校验角色权限
- 样品状态:`NEW`/`PRODUCED`/`RELEASED`/`IN_CUSTODY`/`RETURNING`/`RETIRED`
- 治具状态:`REQUESTED`/`ACCEPTED`/`VERIFY_PENDING`/`VERIFY_RD_OK`/`VERIFY_ORG_OK`/`TRANSFERRED`/`IN_USE`/`IMPROVING`/`REPAIRING_ME`/`REPAIRING_RD`/`REPAIR_DONE`/`RETIRED`

**变更 API 出入参** MUST 保留旧参数做兼容,全量排查下游(前端页面、第三方对接)。

## 12. 数据库约定

- 五表:`users` / `samples` / `scan_logs` / `fixtures` / `fixture_logs` + `fixture_files` 附属表(schema 见 `db.js`)
- 数据库写入由 `mysql2` 连接池自动提交,无需手动 `persist()`(no-op 保留兼容)
- 时间字段:建表用 `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,代码中用 `nowISO()` 生成 ISO 8601
- **改字段名/类型/删除字段** MUST 全量检索 DAO、XML、原生 SQL、ETL、报表、定时脚本、历史初始化脚本

## 13. 文档同步

代码修改完成后 MUST 同步更新文档(AGENTS.md/CLAUDE.md 除非用户明确要求):
- README.md 中受影响的功能说明、配置项、使用示例
- 接口文档(docs/api.md 或 Swagger 注释,若有)
- 依赖说明(版本变更原因与兼容性影响)
- 提供**变更记录**:文件/接口/配置清单 + 兼容性影响 + 部署/回滚步骤

## 14. 当前已知技术债

- `subsystems/fixtures/backend/routes-fixtures.js` 状态机分支多（含 4 个 action helper 拆分后仍偏大），后续治具迭代需关注拆分
- `subsystems/samples/frontend/js/views/list-render.js` 承担列表渲染 + 列宽拖拽，若继续膨胀建议再拆分
- `subsystems/workbench/frontend/js/views/dashboard.js` 顶层函数 8 个（≤10），阈值弹窗已抽独立 `threshold.js`
- 无阻塞性技术债；旧版 `public/js/*`、`routes/samples.js` 等已随 Phase 5/6 迁移删除，不再列为技术债

## 15. 禁止行为黑名单

1. 只无限追加代码,从不清理废弃/重复/冗余内容
2. 超长 if/else、多层嵌套不拆子方法
3. 超大静态数组、长配置字典硬编码塞业务文件
4. 单个 controller/service 堆十余个无关联接口
5. 数百行巨型函数不拆分
6. 全局临时变量泛滥、大量复制粘贴
7. 长期保留 console/log 调试打印、测试临时代码
8. 大段废弃代码注释堆积,不删除不归档

## 16. 验证清单

任何修改完成前 MUST 自检:

- [ ] 全链路依赖已排查(5 维度)
- [ ] 关联文件已同步修改
- [ ] 文件臃肿检测报告已输出
- [ ] 回归验证步骤已列出
- [ ] 子系统隔离已验证（修改共享文件时 MUST 双系统回归）
- [ ] 兼容性影响已说明
- [ ] 部署/回滚步骤已提供
- [ ] 上线后监控提示已给出(1~3 周期)
- [ ] 文档已同步更新(如适用)

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
| `GET /api/subsystems` | 获取所有已注册子系统的 manifest 列表（门户卡片渲染） |
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
5. 触发热重载（无需手动重启）

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

## 18. 卡片设计系统规范（强制）

> 完整规范见 `docs/superpowers/specs/2026-08-04-card-design-system.md`。
> 所有子系统的卡片组件 MUST 遵循本节规范，禁止各自定义风格不一的卡片。

### 18.1 设计 Token（app.css :root 已定义）

```css
--card-radius:12px;                    /* 统一圆角 */
--card-border:1px solid var(--line);   /* 统一边框 */
--card-pad:14px 16px;                  /* 统一内边距 */
--card-hover:transform .15s ease,box-shadow .15s ease;  /* 统一过渡 */
--card-shadow-hover:0 4px 12px rgba(15,23,42,.10);      /* 统一 hover 阴影 */
```

所有卡片 MUST 使用上述 token，禁止硬编码圆角/阴影/过渡值。

### 18.2 卡片类型

| 类型 | 类名 | 用途 | 结构 |
|---|---|---|---|
| 统计卡 | `.kb-stat` | 看板/工作台待办统计 | 色条 + 数字 + 标签（+可选扩展区） |
| 入口卡 | `.portal-card` | 门户子系统入口 | 图标 + 标题 + 描述 + 按钮 |
| 内容卡 | `.card` | 表格/表单内容容器 | 任意内容块 |

### 18.3 统计卡 .kb-stat 组件规范（唯一标准）

**结构（四区）**：fluent-card 容器 + `.n` 数字（26px 粗体，颜色 = `--stat-color`）+ `.l` 标签（12px muted）+ 可选 `.x` 扩展区；左侧 4px 色条 `--stat-color`。

**交互协议（MUST）**：

| 动作 | 行为 |
|---|---|
| hover | 上浮 `translateY(-2px)` + `--card-shadow-hover` |
| 单击 | 联动筛选对应数据（看板筛选待办 / 工作台筛选部门） |
| 再次单击 | 切换（取消筛选） |
| 双击 | 跳转对应列表页（仅单一子系统看板） |
| active | 边框高亮 + `--stat-color` 2px 光环 + `#eef2ff` 背景 |

**颜色语义（--stat-color）**：品牌/待办 = `var(--brand)`；警告/待验证 = `var(--warn)`；进行中 = `#1d4ed8`/`#065f46`/`#92400e`；危险/逾期 = `var(--bad)`。

### 18.4 新子系统导入方法

1. `index.html` 引入 `/css/app.css` + 加载 `/vendor/fluentui-web-components.js`
2. 统计卡直接使用 `.kb-stat`（fluent-card 容器），MUST 加载 fluent 组件
3. 卡片遍历 `data-k` + `onclick` 调子系统筛选函数 + `active` 态管理
4. 子系统专属补充样式（如积压标签）写入本子系统 `css/module.css`，**禁止**写入 app.css
5. 禁止修改 app.css 中 `.kb-stat` 的视觉/交互定义（共享约束，三系统依赖）

### 18.5 AI 拦截规则（卡片相关）

- 新增卡片自定义样式未使用共享 token/类 → 拒绝，要求使用 `.kb-stat` + `module.css`
- 在 app.css 添加子系统卡片样式 → 拒绝，要求写入 `module.css`
- 修改 app.css 中 `.kb-stat` 共享定义 → 标记高危，需样品/治具/工作台三系统回归

## 19. JS 合并构建规范（强制）

> 2026-08-04 实施。每个子系统前端原先 7~25 个独立 `<script>` 标签，HTTP/1.1 下单域名并发仅 6 连接，首屏需排队多轮往返，
> 通过合并 + defer 将请求数降为 1 个，加载时间减少 50%+。

### 19.1 构建脚本

```bash
node tools/build-bundles.js
```

该脚本自动：
1. 解析三个子系统 `index.html` 中的 `<script src>` 顺序（即依赖顺序）
2. 按顺序拼接所有 JS 文件为单个 `bundle.js`
3. 在末尾追加子系统对应的初始化调用（`boot()`/`bootFixture()`）
4. 将 `bundle.js` 输出到 `/tmp`（避免 `subsystems/` 目录权限问题）
5. 生成唯一版本号（`b`+时间戳），写入 `tools/.bundle-ver`

**输出**：
| 子系统 | 原始文件数 | bundle 大小 |
|---|---|---|
| samples | 25 → 1 | ~100KB |
| fixtures | 16 → 1 | ~75KB |
| workbench | 7 → 1 | ~29KB |

### 19.2 部署步骤

```bash
node tools/build-bundles.js
# 将 /tmp/bundle-*.js 复制到子系统 js/ 目录
sudo cp /tmp/bundle-samples.js    subsystems/samples/frontend/js/bundle.js
sudo cp /tmp/bundle-fixtures.js   subsystems/fixtures/frontend/js/bundle.js
sudo cp /tmp/bundle-workbench.js  subsystems/workbench/frontend/js/bundle.js
# 更新 index.html script 引用路径 + 版本号
```

### 19.3 index.html 规范

每个子系统入口 MUST 仅含以下 script 标签：
```html
<script type="module" src="/vendor/fluentui-web-components.js"></script>
<script src="/subsystems/<id>/frontend/js/bundle.js?v=<ver>" defer></script>
```

- `fluentui-web-components.js` 为共享 UI 组件库（367KB，`type="module"` 异步加载）
- `bundle.js` 使用 `defer`：异步下载 + 解析后执行（DOM 就绪），不阻塞首屏
- 不再使用内联 `<script>boot()</script>`，初始化逻辑已包含在 bundle 末尾
- 版本号 MUST 使用构建脚本生成的值（`tools/.bundle-ver`）

### 19.4 何时重建 bundle

以下情况 MUST 执行 `node tools/build-bundles.js && 复制 + 更新版本号`：
- 新增/删除/重命名 `subsystems/*/frontend/js/` 下的任何 JS 文件
- 修改 `index.html` 中 script 引用顺序
- 修改了任意 JS 文件内容

**例外**：仅修改 CSS 或后端代码无需重建 bundle。

### 19.5 AI 拦截规则

- 直接修改 `index.html` 手动添加/删除 `<script src>` 而不重建 bundle → 拒绝，要求执行构建流程
- 在 bundle 之外新增独立 `<script>` 标签 → 拒绝，应合并到 bundle 中
- 修改 bundle 已覆盖的单个 JS 文件后未重建 → 警告，提示重建

---

**本文件为项目级 AI 协作指南,适用于所有 AI agent。修改本文件需用户明确同意。**
