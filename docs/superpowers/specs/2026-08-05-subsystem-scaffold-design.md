# 子系统脚手架（create-subsystem.js）设计文档

- 日期：2026-08-05
- 状态：已确认（用户审批通过）
- 范围：方案 A（仅脚手架），方案 B（状态机引擎接入）另排迭代

## 1. 背景与目标

当前「门户 + 子系统插件协议」架构下，新增子系统需按 AGENTS.md 第 17.6 节 8 步手动创建目录骨架，
每子系统重复劳动（骨架手写、manifest 手填、前端 views 与 router 模板化编写），且易配错。
管理面板 `POST /api/subsystems` 已有极简骨架生成（ping 路由 + 占位页 + 空 schema），但远达不到「快速增加子系统」。

**目标**：一条命令生成「可运行的最小完整子系统骨架」，门户卡片出现、导航可用、示例 API 可通、示例表建好、seed 可跑。
业务逻辑留占位，开发者按需填充。

## 2. 需求澄清结论（已确认）

| 决策点 | 结论 |
|---|---|
| 迭代范围 | 仅方案 A（脚手架）；B 状态机引擎接入另行安排 |
| 与面板关系 | **抽取共用模板**：CLI 与面板共用一套模板模块 |
| 骨架完整度 | **可运行最小完整**（结构完整、业务占位） |
| CLI 方式 | **参数 + 交互补全**（id+name 必填参数，可选能力问答） |
| 实现方案 | **模板函数化 + 共用生成器**（方案 ①） |

## 3. 整体架构

```
tools/
├── subsystem-templates.js   # 新增：模板纯函数模块（唯一事实来源）
├── create-subsystem.js      # 新增：CLI 入口（参数解析 + 交互补全）
└── build-bundles.js         # 复用（按 bundle-sources.json keys 动态遍历；如硬编码则小改兼容）
routes/subsystems.js         # 修改：POST /api/subsystems 改调共用模板（出入参不变）
```

**模板模块接口**：

```js
generateSubsystem(ctx) → { files: { 'manifest.json': '…', 'backend/index.js': '…', … } }
// ctx = { id, name, description, icon, version, withStateMachine, withFiles, states, roles }
```

- 每个生成文件对应一个纯函数模板：
  `tplManifest` / `tplBackendIndex` / `tplSchemaSQL` / `tplFrontendIndex` / `tplRouterJS` /
  `tplViewDashboard` / `tplViewList` / `tplModuleCSS` / `tplSeedJS`（9 个顶层函数，符合 ≤10 红线）
- 容量预留：若模板总行数逼近工具上限（300 行），拆分为 `templates-backend.js` + `templates-frontend.js`
  两个模块，接口不变（`generateSubsystem` 聚合两个文件集合）。

## 4. 生成的文件（可运行最小完整）

```
subsystems/<id>/
├── manifest.json         # 完整：route/database/roles/navigation + stateMachine(可选) + files(可选)
├── backend/index.js      # register(app) + initDB()（执行 schema.sql）+ seed()（调 seed/seed.js）
├── db/schema.sql         # 示例主表（id/no/name/status/created_at/updated_at + status 索引）+ 日志表
├── frontend/
│   ├── index.html        # 完整 SPA 骨架（app.css + fluentui + bundle.js + #app）
│   ├── js/
│   │   ├── router.js     # hash 路由 + 导航渲染（读 manifest.navigation）
│   │   └── views/        # dashboard.js（欢迎卡）+ list.js（调示例 API）
│   └── css/module.css
└── seed/seed.js          # seed(pool) 示例（插入 1 条示例记录 + 日志）
```

### 4.1 各文件要点

**manifest.json**
- `id`：与目录名一致（kebab-case）
- `route.prefix`：`/api/<id>`；`entry`：`/subsystems/<id>/frontend/index.html`；`hashBase`：`/<id>`
- `database.tables`：主表 + 日志表（schema.sql）
- `roles.use`：默认五角色（ADMIN/RD/QA/CUSTODY/ME）
- `navigation`：默认两项（dashboard 首页 / list 列表），view 函数名带子系统前缀避免全局冲突
- `stateMachine`（交互选是时）：用户输入状态列表 → 生成 states + 初始态（transitions 由开发者后续补全）
- `files`（交互选是时）：enabled + 默认分类（photo/document）

**backend/index.js**
- `register(app)`：挂载 `GET /api/<id>/ping`（鉴权）+ `GET /api/<id>/list`（示例查询）+ 错误格式 `{error}`
- `initDB()`：幂等执行 schema.sql（复用 db.js 连接池）
- `seed()`：调用 `seed/seed.js`
- 遵循插件协议：`app.locals.requireAuth` 鉴权、路径前缀从 manifest 读取

**db/schema.sql**
- 示例主表 `<id>_items`：id / item_no / name / status / created_at / updated_at + `idx_<id>_status` 索引
- 日志表 `<id>_logs`：id / item_id / action / role / user_id / dept / note / created_at + 外键索引
- 全部 `CREATE TABLE IF NOT EXISTS` 幂等

**frontend/index.html**
- 引用：`/css/app.css` + `/vendor/fluentui-web-components.js`（module）+ `/subsystems/<id>/frontend/js/bundle.js`（defer）
- 结构：侧边导航 + `#view` 容器（与 samples/fixtures SPA 骨架一致）

**frontend/js/router.js**
- 解析 `location.hash` → 调用 `views/<key>.js` 注册的渲染函数 → 渲染导航（数据来自 `boot()` 拉取的 manifest）

**views**
- `dashboard.js`：欢迎卡 + 子系统说明（复用 `.kb-stat` 统计卡规范）
- `list.js`：示例列表（调用 `/api/<id>/list`，空态提示）

**seed/seed.js**
- 导出 `seed(pool)`：插入 1 条示例记录 + 1 条日志；幂等（按 item_no 查重）

## 5. CLI 交互流程

```
node tools/create-subsystem.js mymod 我的模块          # id+name 必填参数
✓ 校验（kebab-case / 目录不存在 / name 非空）
? 需要状态机（状态/流转声明）吗？ [y/N]                 # readline 交互补全
? 状态列表（逗号分隔，含初始态）如 DRAFT,ACTIVE,CLOSED
? 需要文件管理（附件上传）吗？ [y/N]
? 导航菜单项数（默认 2：首页/列表）
✓ 生成 9 个文件 → subsystems/mymod/
✓ 已追加 tools/bundle-sources.json（新子系统条目）
下一步：node tools/build-bundles.js && 重启服务
```

- 状态机交互仅收集「初始态 + 状态列表」，transitions 留空提示开发者补（状态机引擎接入前，前端 badge 与后端校验仍由开发者自建）
- 已存在目录 → 拒绝并提示

## 6. bundle 联动

- 生成后自动追加 `bundle-sources.json` 新子系统条目（依赖顺序：`shared/utils` → `api-base` → `modal` → `views/*` → `router.js`）
- **不自动执行 rebuild**（避免权限/进程干扰），输出提示命令：
  `node tools/build-bundles.js && sudo cp /tmp/bundle-<id>.js subsystems/<id>/frontend/js/bundle.js`
- 前置确认：`build-bundles.js` 若按 bundle-sources.json keys 动态遍历则直接支持新子系统；若硬编码三子系统（samples/fixtures/workbench）则小改兼容（遍历 keys）

## 7. 面板改造（POST /api/subsystems）

- 改为调用 `generateSubsystem`，ctx 从 `req.body` 映射（id/name/description/icon/version/route/roles/navigation/stateMachine/files）
- **出入参保持 201 + `{ ok, id }` 不变**（行为兼容，下游面板前端无感）
- 共享文件改动 → 双系统回归（样品/治具页面功能 + 面板创建功能）

## 8. 测试与回归

| 层级 | 内容 |
|---|---|
| 单测 | 模板输出快照断言：目录结构完整、manifest 可 JSON.parse、schema.sql 可执行、seed 幂等 |
| E2E | CLI 生成临时子系统 → 重启 → 门户卡片出现 → `/api/subsystems` 返回它 → ping 通 → 清理删除 |
| 回归 | 面板 `POST /api/subsystems` 仍工作（出入参不变）；样品/治具两子系统行为无变化 |

## 9. 风险与兼容性

| 项 | 说明 |
|---|---|
| 共享文件 | 仅 routes/subsystems.js（生成逻辑），出入参兼容 + 双系统回归 |
| 现有子系统 | 模板为纯新增，不触碰 samples/fixtures/workbench 文件 |
| bundle | 追加条目后需 rebuild 生效；现有三子系统 bundle 顺序不变 |
| 上线监控 | 生成一个新子系统验证全链路（1~3 周期） |

## 10. 验收标准

1. `node tools/create-subsystem.js mymod 我的模块` 全流程（含交互补全）无报错
2. 生成的子系统目录结构与本节第 4 条完全一致
3. 重启后门户出现新卡片，进入可访问（导航渲染 + ping 通）
4. `POST /api/subsystems`（面板）创建行为与改造前一致
5. 单测通过、双系统回归通过
