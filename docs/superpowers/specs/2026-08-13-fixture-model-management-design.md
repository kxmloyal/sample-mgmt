# 治具按机型分类管理 — 设计文档

> 日期：2026-08-13
> 状态：已确认（brainstorming 产出）
> 关联系统：治具管理（fixtures）

## 1. 背景与目标

治具系统当前按状态/部门平铺管理，`fixtures.model` 为自由文本，无机型维度分类。本次改造：

1. **以机型为分类**：选择机型后显示该机型下的治具
2. **研发新增治具时可选新机型新增**：机型主数据可维护
3. **新增流程改为「先选机型 → 再填治具清单」**

## 2. 关键决策（已与用户确认）

| 决策点 | 结论 |
|---|---|
| 机型主数据来源 | 复用样品子系统 `sample_models` 表（共享），样品/治具双向可维护 |
| 列表交互形态 | 列表页加机型筛选器（下拉/标签条），选中显示该机型治具 |
| 整体方案 | 方案 A：筛选器 + 弹窗内联机型管理 + 存量迁移 |
| 机型 code | 创建后只读不可编辑（防破坏已引用治具）；`full_name` 可编辑 |
| 新建机型权限 | 仅 RD / ADMIN（与样品侧 sample_models 权限一致） |

## 3. 数据模型

复用 `samples` 子系统已有主数据表（`subsystems/samples/db/schema.sql`）：

```sql
CREATE TABLE IF NOT EXISTS sample_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,        -- 机型编码，唯一
  full_name VARCHAR(200) NOT NULL,  -- 机型全称
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_model_code (code),
  UNIQUE KEY uk_model_full_name (full_name)
)
```

- 治具 `fixtures.model` 存机型 code（与样品一致）
- **不新增治具专属机型表**，避免双份主数据不同步

## 4. 存量数据兼容（迁移脚本）

新增幂等迁移（首启执行，`db/migrations.js` 追加或独立 `tools/migrate-fixture-models.js`）：

1. `SELECT DISTINCT model FROM fixtures WHERE model IS NOT NULL AND model <> ''`
2. 对每个去重后的 model 值执行 `INSERT IGNORE INTO sample_models (code, full_name)`（code=原值，full_name=原值）
3. 迁移可重复执行不报错（INSERT IGNORE 幂等）

无法匹配的历史自由文本保留原值可读，不做强制删除/改写。

## 5. 后端接口

**新文件 `subsystems/fixtures/db/models-dao.js`**（dao.js 已达 97.5% 容量红线，禁止再塞函数）。

| 接口 | 权限 | 说明 |
|---|---|---|
| `GET /api/fixtures/models` | 登录 | 全部机型 + 各机型治具计数（LEFT JOIN fixtures ON model=code GROUP BY） |
| `POST /api/fixtures/models` | RD/ADMIN | 新建 `{code, full_name}`；code 必填 ≤20 字符、full_name 必填 ≤200；code 或 full_name 唯一冲突返回 409 |
| `PUT /api/fixtures/models/:id` | RD/ADMIN | 仅更新 `full_name`（code 只读），404 兜底 |
| `GET /api/fixtures?model=X` | 登录 | 列表透传 `model` 筛选（与 status/dept/dormant/search 叠加） |

错误格式遵循 `{ error: "..." }` + 语义化状态码；写操作 try-catch 500 兜底。

## 6. 前端交互（fixtures 前端，重建 bundle）

### 6.1 治具清单列表页（list.js / list-filter.js）
- 筛选条新增「机型」下拉：`全部机型 | 各机型（名称+治具数）| ＋新建机型`
- 选中机型后 `fixtureListState.model` 生效，列表只显示该机型治具；与现有状态/部门/呆滞/搜索筛选叠加
- chips 支持机型标签清除；「清除筛选」「导出 CSV」联动
- 列表行新增机型列（原 detail 已有 model 展示，列表当前无该列——补列）

### 6.2 新增治具弹窗（两步）
1. **第一步：选择机型**——下拉选已有机型，或点「＋新建机型」内联展开 code/full_name 输入，提交创建后自动选中
2. **第二步：填治具清单**——名称/规格/工站/分类/申请说明等（沿用现有 REQUEST 表单字段）
- 无机型选中不允许提交（校验提示）

### 6.3 机型管理弹窗（RD/ADMIN）
- 入口：机型下拉旁「管理」图标（非 RD/ADMIN 不显示）
- 列表：全部机型（code + full_name + 关联治具数）
- 操作：新增机型（code/full_name）、编辑 full_name（code 只读展示）
- 删除机型：**本期不做**（存在引用风险，YAGNI）

### 6.4 看板
- 本次不改动（范围外）

## 7. 测试

新增 `tests/fixture-models.test.js`（fixtures 未上线可写）：

1. `GET /api/fixtures/models` 登录可见，返回含治具计数
2. `POST` 非 RD/ADMIN → 403（用临时非权限账号）
3. `POST` code 重复 → 409；full_name 重复 → 409；code 超长 → 400
4. `PUT` 仅可改 full_name；code 改动被忽略；不存在 id → 404
5. `GET /api/fixtures?model=X` 只返回该机型治具，与无 model 筛选全量一致
6. 迁移脚本幂等（重复执行不报错、不重复插入）

## 8. 影响范围与回归

- **共享资源变更**：复用 `sample_models`（只读引用 + 新增维护接口），需样品/治具双系统回归：样品机型维护入口不受影响、治具新增接口不影响样品接口
- **容量红线**：dao.js 不新增函数；新 DAO 独立文件；routes-fixtures.js 预估 +40 行（仍 <400）
- **文档**：AGENTS.md 第 1 节治具描述、README 治具功能章节、操作手册同步

## 9. 范围外（YAGNI）

- 机型删除/停用（引用风险）
- 机型级属性扩展（产品线/客户/负责人）
- 看板按机型联动
- 治具编号按机型前缀生成
