# 全量审计修复 — 实现计划

## 分组 1：基础设施（无依赖，全并行）

### Task 1.1: 创建 shared/utils.js
共享工具函数模块，从 fixture-scan.js/fixture-list.js 提取 e()，新增公共帮助函数。
- 文件：新建 `public/js/shared/utils.js`
- 内容：e() HTML转义、formatFileSize、el()快捷DOM创建
- HTML 文件：index.html、fixture.html 在脚本列表顶部添加此引用

### Task 1.2: 创建 shared/api-base.js  
消除 api.js 和 fixture-api.js 约 70 行重复。
- 文件：新建 `public/js/shared/api-base.js`
- 内容：`sharedApi(basePath)` 生成 api/get/post 函数、`me` 变量声明、`ROLE`/`STATUS`/`ACTION_CN` 常量
- 改造：api.js 调用 `sharedApi('/api')`，fixture-api.js 调用 `sharedApi('/api')`
- 每个子系统各自的特有常量/函数保留在原文件（如样品 STATUS 独有字段、治具 FILE_CATEGORY_CN 等）

### Task 1.3: SESSION_SECRET 强制检查
- 文件：`server.js`
- 变更：启动时检测 SESSION_SECRET === 'sample-mgmt-dev-secret-change-me' 则打印警告并拒绝启动

### Task 1.4: 文件上传 MIME 白名单
- 文件：`routes/fixture-files.js`
- 变更：multer fileFilter 对所有分类加 MIME 校验，非白名单拒绝
- 白名单：design_drawing→pdf/dwg/dxf/dwf/stp/stl/step/igs/iges/zip
  purchase_order→pdf/doc/docx/xls/xlsx/jpg/png
  other→pdf/doc/docx/xls/xlsx/jpg/png/zip/stp/stl

## 分组 2：安全修复（依赖 Task 1.1 e()，全并行）

### Task 2.1: 样品详情 innerHTML 转义
- 文件：`public/js/detail.js`
- 变更：所有 `+= s.name`/`s.spec`/`s.model`/`s.notes` 等用户字段加 e() 包裹

### Task 2.2: 治具详情 innerHTML 转义
- 文件：`public/js/fixture-detail.js`
- 变更：所有 `+= f.name`/`f.spec`/`f.model`/`f.request_note`/`f.retired_reason` 等用户字段加 e() 包裹

### Task 2.3: 样品扫码台 innerHTML 转义
- 文件：`public/js/scan.js`（含 scan-wizard.js / scan-return-actions.js）
- 变更：所有 `+= s.xxx` 用户字段加 e() 包裹

### Task 2.4: 治具扫码台 innerHTML 转义
- 文件：`public/js/fixture-scan.js`
- 变更：所有 `+= f.xxx` 用户字段加 e() 包裹

### Task 2.5: 余下前端文件 innerHTML 转义
- 文件：`public/js/samples.js`、`public/js/new.js`、`public/js/dashboard.js`、`public/js/board.js`、`public/js/logs.js`、`public/js/users.js`、`public/js/card-fields.js`、`public/js/print-queue.js`、`public/js/help.js`、`public/js/fixture-list.js`、`public/js/fixture-dashboard.js`、`public/js/fixture-file-ui.js`、`public/js/fixture-logs.js`
- 变更：所有用户数据字段加 e() 包裹。fixture-list.js 和 fixture-scan.js 移除本地 e() 定义，改用 shared/utils.js 的。

## 分组 3：容量红线消除（全并行）

### Task 3.1: db.js 拆分
- 文件：`db.js` → 拆分出 `db/migrations.js`
- 内容：将 init() 中的 migrateFixtureLifecycle/migrateFixtureFiles/migrateFixtureMaintenance 3 个迁移函数 + DDL 语句移到新文件
- db.js 改为引入 db/migrations.js 的 initDDL 函数
- 目标：db.js 从 256 行降到 ≤200 行

### Task 3.2: fixture-api.js 常量+鉴权提取
- 文件：`fixture-api.js` 改造为调用 shared/api-base.js
- 保留治具独有的 FILE_CATEGORY_CN、PREVIEW_TYPES 等常量
- 变更：移除 ROLE/STATUS/ACTION_CN/api/me/doLogin/doLogout/showApp/statusBadge/fmt 的定义，改为从 shared/api-base.js 导入

### Task 3.3: fixture-scan.js 照片逻辑抽离
- 文件：`fixture-scan.js` → 拆分出 `fixture-photo-upload.js`
- 内容：`_pendingPhotos`、`_handlePhotoSelected()`、`_removePendingPhoto()` + 照片上传逻辑
- 目标：fixture-scan.js 从 12 函数降到 ≤10，行数降到 ≤200

### Task 3.4: scan.js 扫码逻辑模块化
- 文件：`scan.js` → 拆分 `scan-camera.js`（摄像头/连续扫码逻辑）
- 提取：`startCamera()`/`stopCamera()`/`camStream` 相关代码
- 目标：scan.js 从 224 行降到 ≤180 行

## 分组 4：性能优化（全并行）

### Task 4.1: 看板查询 Promise.all 并行化
- 文件：`routes/fixtures.js`（治具看板）、`routes/misc.js`（样品看板）
- 变更：将串行 await 改为 Promise.all 并行
- 治具看板：5 个查询 → 并行
- 样品看板：4 个查询 → 并行

### Task 4.2: 列表查询加默认 LIMIT
- 文件：`db/samples.js`、`db/fixtures.js`
- 变更：listSamples/listFixtures/listMyPendingSamples/listMyPendingFixtures 加 `LIMIT ? OFFSET ?` 默认值
- 默认 LIMIT = 100

### Task 4.3: 样品详情去重 API 请求
- 文件：`public/js/detail.js`
- 变更：viewDetail 和 renderDetailBody 合并为一次请求，renderDetailBody 复用数据

## 分组 5：清理与杂项修复（全并行）

### Task 5.1: 删除 shared-constants.js 引用
- 文件：`public/index.html`
- 变更：移除 `<script src="/js/shared-constants.js"></script>` 行

### Task 5.2: 修复帮助系统
- 文件：`public/js/help-data.js` + `public/js/help.js`
- 变更1：help-data.js 中 `var helpData` 改为 `var HELP_DATA`
- 变更2：help.js 中 filterHelp 适配 help-data.js 的实际 schema（module/desc/items）

### Task 5.3: 废弃 CSS 清理 + 治具 badge 统一
- 文件：`public/css/app.css` + `public/fixture.html`
- 变更1：移除 .step/.step.done/.step.cur/.chip.pending/.btn.danger 废弃样式
- 变更2：将 fixture.html 内联的 14 个治具 badge 类移到 app.css

### Task 5.4: doMaintenance 签名修复
- 文件：`routes/fixture-actions-cycle.js`
- 变更：`D.updateFixture(fixture.id, {...})` → `D.updateFixture({ id: fixture.id, ...fields }, fixture)`

### Task 5.5: Toast 位置统一
- 文件：`public/fixture.html` + `public/css/app.css`
- 变更：移除 fixture.html 的 `.toast` 覆写，统一用 app.css 的 top-right 定位
