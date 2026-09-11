# 批次 3 设计：routes-samples.js 与 db/migrations.js 拆分（纯重构，行为零变化）

- 日期：2026-09-02
- 依据：AGENTS.md §14 技术债——routes-samples.js 92.1% 字符红线（超 90% 严控线）、db/migrations.js 11 顶层函数超 §7.2 ≤10 上限
- 状态：待评审

## 1. 目标

| 文件 | 现状 | 拆分后 |
|---|---|---|
| `subsystems/samples/backend/routes-samples.js` | 333 行 / 18420 字符（92.1%） | 主文件 ~230 行 / ~13k（65%），拆出 models 与 images 两个模块 |
| `db/migrations.js` | 148 行 / 11 顶层函数 | 拆为 `db/migrations/` 目录按子系统分文件，index.js 聚合，db/migrations.js 变薄转发 |

**纯重构：行为零变化，不改任何业务逻辑/文案/SQL/API。**

## 2. routes-samples.js 拆分

### 2.1 新建 `subsystems/samples/backend/sample-images.js`
- 迁出：`UPLOAD_DIR`、`UPLOAD_MAX_SIZE`、`matchImageMagic`、`saveSampleImage`
- 导出：`{ saveSampleImage }`
- 依赖：path、fs、logger

### 2.2 新建 `subsystems/samples/backend/routes-samples-models.js`
- 迁出：`MODEL_CACHE_KEYS`、`invalidateModelCaches`、`GET /api/samples/models`、`GET /api/samples/model-options`、`POST /api/samples/models`、`DELETE /api/samples/models/:id`
- 导出：`{ register }`（挂载上述路由）
- 依赖：D、cache、asyncHandler

### 2.3 修改 `routes-samples.js`
- 移除 models 路由与 saveSampleImage/matchImageMagic/UPLOAD 常量
- `const { saveSampleImage } = require('./sample-images');`
- register 内保留：list、export、code-preview、:id/images、:id GET/POST/DELETE/PUT
- 保留 `app.locals.saveSampleImage = saveSampleImage`（routes-scan 依赖）
- 调用 `require('./routes-samples-models').register(app)`（在 :id 路由之前，避免 /models 被 :id 捕获——注意现有顺序）

## 3. db/migrations.js 拆分

### 3.1 新建 `db/migrations/` 目录
| 文件 | 迁移函数 |
|---|---|
| `fixtures.js` | migrateFixtureLifecycle、migrateFixtureFiles、migrateFixtureMaintenance、migratePerfIndexes |
| `control.js` | migrateControlNcrDetail、migrateControlNcrForm |
| `projects.js` | migrateProjectTaskIndexes |
| `samples.js` | migrateSamplesOptimisticLock、migrateSamplesSoftDelete |
| `users.js` | migrateUserEnabled、migrateUsersSessionVersion |
| `index.js` | runMigrations：按原顺序调用全部迁移 |

### 3.2 修改 `db/migrations.js`
- 变为薄转发：`module.exports = require('./migrations');`
- db.js 的 `require('./db/migrations')` 接口不变

## 4. 兼容性

- API 路径/行为零变化；app.locals.saveSampleImage 仍由 routes-samples 设置
- db/migrations.js 导出接口不变（runMigrations）
- 迁移执行顺序与原 runMigrations 完全一致

## 5. 验证

- `node --check` 全部改动/新建文件
- 测试库 E2E：建样→PRODUCE→RELEASE→CUSTODY 全链 + models 增删 + images 接口 + 导出 CSV
- 迁移幂等：测试库跑 runMigrations 两次不报错
- 线上冒烟（旧代码运行中，仅基线）：/api/samples、/api/samples/models、/api/samples/1/images 200

## 6. 文档同步

- AGENTS.md §14：routes-samples.js 与 db/migrations.js 技术债条目更新为「已拆分」
- README 目录结构（如涉及）
