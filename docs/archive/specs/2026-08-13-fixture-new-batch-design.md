# 治具新建申请 — 清单列表式批量录入 设计文档

> 日期：2026-08-13
> 状态：已确认（brainstorming 产出）
> 关联系统：治具管理（fixtures）
> 前置：机型分类架构已上线（2026-08-13）

## 1. 背景

治具新建申请页（#/new）当前为单屏两区（选机型 → 填 1 条治具 → 提交）。浏览器实测与代码审查发现：

- **P1 功能 Bug**：前端传 `maintenance_cycle_days`，但 `POST /api/fixtures` 路由未解构、`createFixture` 未接收该列 → 保养周期填了不生效
- **P2 显示 Bug**：新建机型成功后「②治具清单」机型只读字段仍显示旧值（`fnLoadModels` 只改下拉 value 不触发 `fnPickModel`）
- **P3 体验**：机型只读字段只显示 code，不看全称
- **P5 兜底**：治具名称空时前端无必填校验（fluent 组件 required 对原生 form 校验不生效），依赖后端 400

用户确认采用**清单列表式批量录入**：选机型（可新建）→ 该机型下动态行表格录入 N 条治具 → 一次提交批量落库为独立治具。

## 2. 关键决策（已与用户确认）

| 决策点 | 结论 |
|---|---|
| 交互形态 | 清单列表式批量录入（替换单条表单） |
| 提交方式 | 新增批量端点，事务保证 N 条全成或全回滚 |
| 单条接口 | `POST /api/fixtures` 保留，**同步补收 maintenance_cycle_days**（L1，消除批量/单条语义分歧） |
| 保养周期 | 每行独立、默认 90、0=无需保养；后端彻底接收（P1 根治） |
| 提交防抖 | 批量提交按钮禁用 + loading 态（L2，防双击重复建批） |
| 窄屏 | 行表格 <576px 纵向堆叠 CSS 兜底（可选，已确认纳入） |
| dao.js 容量 | 已 197/200 行红线，本次先拆分再改（见 §5） |

## 3. 页面交互（new.js 重写）

```
① 选择机型（必选，可新建）
   下拉（code · 全称 (N治具)） + 「＋新建机型」内联（短码/全称/保存/取消） + 「管理机型」
② 治具清单（行式表格）
   列：治具名称* | 规格 | 工站 | 分类 | 保养周期(天) | 删除
   「＋添加一行」；「提交申请」
```
- ②区顶部显示已选机型 `code · 全称`（P3 修复）
- 新建机型成功后同步刷新机型显示（P2 修复：`fnLoadModels` 后补调 `fnPickModel`）
- 前端行内校验：名称空的行禁止提交并标红；至少 1 行有名称（P5 修复）
- 默认初始 1 行，可加至最多 50 行；删行至 1 行时删除键禁用
- 提交成功 → toast「成功创建 N 条治具」→ 跳转 #/list

## 4. 后端接口

### 4.1 新增 `POST /api/fixtures/batch`

登录即可。body：
```json
{
  "model": "TESTMACH01",
  "items": [
    { "name": "治具A", "spec": "DC-12V", "station": "SMT1", "category": "测试治具", "maintenance_cycle_days": 90 },
    { "name": "治具B" }
  ]
}
```
- 校验：`model` 必填；`items` 数组 1~50 条；每条 `name` 必填（空则 400 并提示行号「第 N 行：治具名称必填」）
- 事务：`pool.getConnection()` + BEGIN/COMMIT/ROLLBACK，循环 `createFixture`（携带 maintenance_cycle_days）+ `addFixtureLog(action:'CREATE', note:'批量新建申请')`
- 成功返回 `{ created: N, fixtures: [ ... ] }`（每条含 fixture_no）
- 失败 500 全量回滚，不留半批数据

### 4.2 修改 `createFixture`（P1 根治）

`subsystems/fixtures/db/dao.js`：INSERT 增加 `maintenance_cycle_days` 列（解构 + 参数 + SQL 列）。

### 4.3 兼容

`POST /api/fixtures`（单条）行为不变，**同步补收 `maintenance_cycle_days`**（L1，路由解构 + 透传 createFixture），扫码台、列表其他入口创建的治具同样生效。

## 5. dao.js 容量拆分（前置步骤，强制）

dao.js 当前 197/200 行（98.5% 红线），必须先拆分再改：

- 新建 `subsystems/fixtures/db/dao-fixtures-crud.js` 或按 AGENTS.md 模式抽独立子模块——**具体拆分方案在实现计划中锁定**（目标：createFixture 相关 CRUD + 字段白名单迁出，dao.js 瘦身至 ≤70%）
- 拆分原则：纯搬移不改行为；导出与现引用方（routes-fixtures.js `D.xxx`）签名保持一致

## 6. 测试（tests/fixture-batch.test.js）

1. batch 成功创建 N 条：编号连续、状态 REQUESTED、每条有 CREATE 日志、`maintenance_cycle_days` 落库正确
2. batch 含空名称行 → 400，且**库中无任何新增**（事务回滚断言：batch 前后 count 相等）
3. batch model 缺失 → 400；items 空数组 → 400；items 51 条 → 400
4. `maintenance_cycle_days` 缺省 → 落库为 NULL（兼容旧行为）
5. 单条 `POST /api/fixtures` 行为不变（回归）
6. 单条 `POST /api/fixtures` 带 `maintenance_cycle_days` → 落库生效（L1 回归）

## 7. 影响范围与回归

- 改：`new.js`（重写，含 L2 提交防抖）、`routes-fixtures.js`（+batch 路由 + L1 单条透传，容量已达 74.75% 预警，注意控制）、`dao.js`（拆分 + createFixture 字段）、`module.css`（窄屏堆叠）、`tests/`、bundle 重建
- 双系统回归：扫码台单条创建正常（POST /api/fixtures 仅增字段不破坏）、样品系统不受影响
- 文档：操作手册「新建治具」章节同步

## 8. 范围外（YAGNI）

- 行内重复校验（同名治具告警）
- 批量导入 Excel
- 批量带图片/附件
- 行内型号独立编辑（批量场景统一用所选机型）
