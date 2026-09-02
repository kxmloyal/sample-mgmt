# 实现计划：批次 3 拆分重构

> 关联 spec：[2026-09-02-batch3-split-design.md](../specs/2026-09-02-batch3-split-design.md)
> 覆盖：samples backend + db/migrations
> 执行方式：Subagent 驱动（或 orchestrator 直接执行）
> 关键约束：纯重构行为零变化；禁止重启；samples 已上线只读验证

## 任务总览（3 个 Task）

| # | 任务 | 文件 | 要点 |
|---|---|---|---|
| B3-T1 | routes-samples.js 拆分 | `sample-images.js`(新)、`routes-samples-models.js`(新)、`routes-samples.js` | 行为零变化 |
| B3-T2 | db/migrations 目录拆分 | `db/migrations/*.js`(新)、`db/migrations.js` | 接口不变 |
| B3-T3 | 回归 + 文档 + 部署申请 | 测试库 E2E、AGENTS §14、README | 全链验证 |

---

## B3-T1 · routes-samples.js 拆分

### Files
- `subsystems/samples/backend/sample-images.js`（新建）
- `subsystems/samples/backend/routes-samples-models.js`（新建）
- `subsystems/samples/backend/routes-samples.js`（修改）

### Steps
1. 读 routes-samples.js 全文（333 行）。
2. 建 `sample-images.js`：迁出 UPLOAD_DIR/UPLOAD_MAX_SIZE/matchImageMagic/saveSampleImage，导出 `{ saveSampleImage }`。
3. 建 `routes-samples-models.js`：迁出 MODEL_CACHE_KEYS/invalidateModelCaches + 4 个 models 路由，导出 `{ register }`。
4. 改 routes-samples.js：删 models 路由与图片保存逻辑；`const { saveSampleImage } = require('./sample-images');`；register 内 `require('./routes-samples-models').register(app)`（放在 :id 路由之前）；保留 app.locals.saveSampleImage。
5. 逐行核对：迁移的代码逐字保留（含注释），不改变任何逻辑。

### 验证
- `node --check` 三文件
- 测试库 E2E：建样→PRODUCE→RELEASE→CUSTODY、models 增删、images 接口、export CSV
- 确认 app.locals.saveSampleImage 仍被 routes-scan 使用正常

### Commit
`refactor(samples): split models and image helpers out of routes-samples`

---

## B3-T2 · db/migrations 目录拆分

### Files
- `db/migrations/fixtures.js`、`control.js`、`projects.js`、`samples.js`、`users.js`、`index.js`（新建）
- `db/migrations.js`（改为薄转发）

### Steps
1. 读 db/migrations.js 全文（148 行）。
2. 按设计 §3.1 建 5 个迁移文件，每个导出对应迁移函数。
3. 建 `db/migrations/index.js`：import 各文件，runMigrations 按原顺序调用全部迁移。
4. 改 `db/migrations.js`：`module.exports = require('./migrations');`
5. 核对迁移执行顺序与原 runMigrations 完全一致。

### 验证
- `node --check` 全部文件
- 测试库跑 runMigrations 两次（幂等）不报错
- 确认 db.js 的 require('./db/migrations') 正常

### Commit
`refactor(db): split migrations into per-subsystem modules`

---

## B3-T3 · 回归 + 文档 + 部署申请

### Steps
1. 测试库全链 E2E（复用 B3-T1 验证 + 迁移幂等）。
2. 线上冒烟（旧代码基线）：/api/samples、/api/samples/models、/api/samples/1/images、/api/samples/export 全 200。
3. 文档：AGENTS.md §14 更新（两文件已拆分）；README 目录结构（如涉及）。
4. 《重启申请》草稿（纯重构，无 DB 迁移新增，重启仅加载新代码）。

### Commit
`docs(samples): batch3 split notes`
