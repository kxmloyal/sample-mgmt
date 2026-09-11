# 管制流程管理 · 不良品委托单(NCR)详细内容设计（参照 GYS-Q2-008_01 表单）

> 生成日期：2026-08-26
> 状态：待用户评审（已确认修正方案）
> 关联规范：[AGENTS.md §17 子系统插件协议](../AGENTS.md)、[§5 强制工作流程](../AGENTS.md)、[§6.1 子系统隔离原则](../AGENTS.md)、[§7.1 文件容量红线](../AGENTS.md)、[§19 bundle 构建](../AGENTS.md)、[§20 上线保护](../AGENTS.md)、[§21 列表导出](../AGENTS.md)、[§22 门户排列](../AGENTS.md)
> 覆盖子系统：`control`（管制流程管理）
> 参考文档：[2026-08-24-control-flow-design.md](./2026-08-24-control-flow-design.md)、[2026-08-26-control-ncr-interaction-design.md](./2026-08-26-control-ncr-interaction-design.md)

---

## 1. 背景与目标

当前 `control` 子系统已具备不良品委托单（NCR）的独立聚合页 + 子表 `control_ncr_logs`，但明细仅含「委托单号/检验部门/处理部门/表单版本/创建人/创建时间」6 个字段，与线下纸质表单 `(GYS-Q2-008_01)不良品委托检验单_V1.doc` 的完整字段结构差距较大，无法承载品质信息留痕。

**目标**：以现有 `GYS-Q2-008_01` 表单为蓝本，补齐 NCR 对应字段到系统数据模型，并通过「开单表单化录入 + 后续阶段补录 + 详情主卡展示 + 导出列扩充」实现完整留痕。**不新建独立存储**，复用 `control_orders` 主表与 `control_rework_logs` 报工子表（NCR 为 `control_orders` 的派生明细，无独立副本）。

## 2. 需求概述（表单字段 → 系统字段落点）

经与用户逐项确认，`GYS-Q2-008_01` 各区块字段落点如下（★=本方案新增）：

| 表单区块 | 字段 | 系统落点 | 填写时点 | 是否新增 |
|---|---|---|---|---|
| 基本信息 | 销货单号 | 主表 `control_orders.sales_no` | 建单时 | 已有 |
| 基本信息 | 喷码日期 | 主表 `control_orders.spray_date` | 建单/编辑草稿 | ★新增 |
| 基本信息 | 委托单号/检验部门/处理部门 | NCR子表 `control_ncr_logs` | 开委托单 | 已有 |
| 不良原因分析 | 不良类型+管制原因 | 主表 `control_orders.bad_type/reason` | 建单/开NCR | 已有 |
| 解决方案 | 处理方式会签结论 | 主表 `control_orders.disposal_opinion` | 闸口②会签(DISPOSAL_OK) | 已有 |
| 重工/全检标准 | 重工SOP | 主表 `control_orders.rework_sop` | **会签发起时必填** | 已有 |
| 重工/全检标准 | 现场指导 | 主表 `control_orders.rework_guide` | **会签发起时必填** | ★新增 |
| 重工/全检标准 | 其他标准文件 | 主表 `control_orders.rework_other` | **会签发起时必填** | ★新增 |
| 处理结果 | 全检/重工数量、不良/合格/报废/结余 | 主表 `control_orders.good_qty/ng_qty/scrap_qty/remain_qty` | 报工阶段 | 已有 |
| 处理结果 | 批次号 | 报工子表 `control_rework_logs.batch_no` | 报工(REPORT) | ★新增 |
| 处理结果 | 包装称重记录 | 报工子表 `control_rework_logs.pack_record` | 报工(REPORT) | ★新增 |
| 处理结果 | 确认人 | 报工子表 `control_rework_logs.confirm_by` | 报工(REPORT) | ★新增 |
| 处理结果 | 确认数量是否一致 | 报工子表 `control_rework_logs.qty_consistent` | 报工(REPORT) | ★新增 |
| 签核 | 主管/经办 | 复用 `control_logs` 操作留痕（role/user_id/dept/comment） | 各流转 | 已有（不新增字段） |

## 3. 范围与非目标

**范围内**
- 主表补列：`spray_date`、`rework_guide`、`rework_other`（幂等迁移，含 schema.sql + migrations.js 双轨）
- 报工子表补列：`batch_no`、`pack_record`、`confirm_by`、`qty_consistent`
- 处理方式会签发起（`DISPATCH`，NCR_DONE→DISPOSAL_SIGNING）时前端模态收集重工/全检标准，后端校验**必填**并写主表
- 报工（`REPORT`）模态扩充：批次号/包装称重记录/确认人/数量是否一致
- 详情主卡字段分组展示增强（喷码日期/重工标准/处理结果完整区块）
- 主表导出 `/api/control/orders/export` 扩充列（喷码日期/重工标准/现场指导/其他标准）
- 开 NCR 模态保持 3 字段不变（NCR 作为子表分录，详细品质字段归属主表）

**非目标（YAGNI，明确不做）**
- 不新增独立 NCR 打印页（沿用现有 `GET /api/control/ncrs` 聚合页 + 详情展开卡）
- 不新建 NCR 独立数据副本/冗余快照
- 不再新增签核专员字段（复用操作留痕，避免与 `control_signs` 会签记录重复）
- 不修改 `control` 子系统状态机结构与流转顺序（DISPATCH/START 顺序不变）

## 4. 数据模型变更

### 4.1 主表 `control_orders` 补列

| 列名 | 类型 | 说明 |
|---|---|---|
| `spray_date` | VARCHAR(24) | 喷码日期（ISO，如 `2026-08-26`） |
| `rework_guide` | TEXT | 现场指导（重工/全检标准之一） |
| `rework_other` | TEXT | 其他标准文件（重工/全检标准之一） |

### 4.2 报工子表 `control_rework_logs` 补列

| 列名 | 类型 | 说明 |
|---|---|---|
| `batch_no` | VARCHAR(50) | 批次号 |
| `pack_record` | VARCHAR(100) | 包装称重记录 |
| `confirm_by` | VARCHAR(50) | 确认人 |
| `qty_consistent` | TINYINT(1) DEFAULT 0 | 确认数量是否一致（1=一致，0=不一致） |

### 4.3 迁移方案（双轨幂等）

1. **schema.sql**（新建库全量建表）：在 `control_orders` / `control_rework_logs` 的 `CREATE TABLE IF NOT EXISTS` 中直接追加上述列（新库即时生效）。
2. **db/migrations.js**（存量库补列）：新增 `migrateControlNcrDetail(pool)`，与现有 `migrateUserEnabled` 等幂等 ALTER 模式一致（捕获 `ER_DUP_FIELDNAME` 跳过），并在 `runMigrations` 中注册：

```js
async function migrateControlNcrDetail(pool) {
  const orderAdds = [
    'ADD COLUMN spray_date VARCHAR(24)',
    'ADD COLUMN rework_guide TEXT',
    'ADD COLUMN rework_other TEXT'
  ];
  for (const c of orderAdds) {
    try { await pool.execute('ALTER TABLE control_orders ' + c); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
  const reworkAdds = [
    'ADD COLUMN batch_no VARCHAR(50)',
    'ADD COLUMN pack_record VARCHAR(100)',
    'ADD COLUMN confirm_by VARCHAR(50)',
    'ADD COLUMN qty_consistent TINYINT(1) DEFAULT 0'
  ];
  for (const c of reworkAdds) {
    try { await pool.execute('ALTER TABLE control_rework_logs ' + c); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}
```

## 5. 后端变更

### 5.1 `routes-orders.js` — `applyActionFields` 补 DISPATCH 字段派生

在 `switch (action)` 增加 `DISPATCH` 分支，写入重工/全检标准：

```js
case 'DISPATCH': // 发起处理方式会签：登记重工/全检标准（必填，校验见 transition 路由）
  if ((body.rework_sop || '').trim()) o.rework_sop = body.rework_sop.trim();
  if ((body.rework_guide || '').trim()) o.rework_guide = body.rework_guide.trim();
  if ((body.rework_other || '').trim()) o.rework_other = body.rework_other.trim();
  break;
```

### 5.2 `routes-orders.js` — `POST /api/control/orders/:id/transition` 加必填校验

在 `canTransition` 之后、进入事务之前，对 `DISPATCH` 做必填校验（返回 400 语义化错误）：

```js
if (action === 'DISPATCH') {
  const rb = req.body || {};
  const sop = (rb.rework_sop || '').trim();
  const guide = (rb.rework_guide || '').trim();
  const other = (rb.rework_other || '').trim();
  if (!sop) return res.status(400).json({ error: '处理方式会签前必须填写重工/全检标准：重工SOP' });
  if (!guide && !other) return res.status(400).json({ error: '处理方式会签前必须填写重工/全检标准：现场指导或标准文件至少填一项' });
}
```

> 校验口径（**用户已确认**）：**重工SOP 必填**；**现场指导 与 其他标准文件 至少填一项**（对应表单「重工/全检标准文件」区块整体必填）。

### 5.3 `dao.js` — 报工子表读写补列

- `addReworkLog`：`INSERT` 列扩至 12 行，新增 `batch_no/pack_record/confirm_by/qty_consistent`。
- `listReworkLogsByOrder`：`SELECT *` 已自动带新列，无需改动。
- NCR 子表 `addNcrLog` / `listNcrLogsByOrder` / `listNcrAgg` 均保持 `n.*` 自动含新列，**无需改动**。

### 5.4 `routes-ncr.js` — NCR 导出列（如需对齐表单）

当前 NCR 聚合导出 10 列。若评审确认，可将 NCR 详细品质字段并入主表导出而非 NCR 单独导出，**默认保持 NCR 导出列不变**，避免重复报表口径。详细安排在 writing-plans 阶段定夺。

## 6. 前端变更

### 6.1 `detail.js` — `_CTL_TRANS_FIELDS` 补 DISPATCH 字段

```js
var _CTL_TRANS_FIELDS = {
  STORE: [{ k: 'storage_location', label: '管制仓储位' }],
  CREATE_NCR: [{ k: 'ncr_no', label: '不良品委托单号' }],
  DISPATCH: [
    { k: 'rework_sop', label: '重工SOP', type: 'textarea' },
    { k: 'rework_guide', label: '现场指导' },
    { k: 'rework_other', label: '其他标准文件' }
  ],
  DISPOSAL_OK: [{ k: 'disposal_opinion', label: '处理方式结论' }],
  START: [{ k: 'rework_no', label: '重工工单号' }]
};
```

> `START` 移除 `rework_sop`（已在新前置 DISPATCH 必填），仅保留 `rework_no`；`fieldHtml` 增加 `type='textarea'` 分支渲染 `<textarea>`。

### 6.2 `detail.js` — `modalCfg('trans')` 增加必填标记

`transFields` 的字段在模态渲染时，对必填字段（重工标准相关）加 `required` 标记并增大 `nf-full` 占位（textarea 用整行）。`ctlSubmit` 提交前做前端必填校验：`rework_sop` 非空、`rework_guide` 或 `rework_other` 至少一项，否则 `toast` 阻止提交。

### 6.3 `detail.js` — `ctlFieldGrid` 主卡展示增强

- `基本信息` 组补 `['喷码日期', o.spray_date]`。
- `管制信息` 组补 `['重工SOP', o.rework_sop]`、`['现场指导', o.rework_guide]`、`['其他标准', o.rework_other]`。
- `执行结果` 组保持 `good_qty/ng_qty/scrap_qty/remain_qty`。
- 空值显示 `—`（复用 `_ctlUtil.kv`）。

### 6.4 `detail.js` — `ctlSubmit('rework')` 补报工字段

`REPORT` 模态收集新增 4 字段并随 `POST /rework-log` 提交：`batch_no`、`pack_record`、`confirm_by`、`qty_consistent`（布尔化：一致=1/不一致=0）。

### 6.5 `rework-tab.js`（若为独立文件）— 报工记录展开卡展示新列

若报工子表在 `rework` tab 已单独渲染，则补充展示 `batch_no/pack_record/confirm_by/qty_consistent`；否则并入 `detail.js` 的 `_ctlTabSheet.rework()`。

### 6.6 容量与拆分

`detail.js` 当前 287 行，已超 70% 红线（280）。本方案新增字段与校验逻辑将使 `detail.js` 接近/超过 400 行，**MUST 拆分**为独立子文件，建议：
- 拆分字段/校验纯逻辑 → `subsystems/control/frontend/js/views/ncr-form.js`（新增 `NCR_FORM_FIELDS` / `ncrRequiredCheck()` / 后端必填映射常量）。
- `detail.js` 仅保留渲染与提交转发。

> 拆分方案**用户已确认**采用 `ncr-form.js`（§10 确认项 3）。

> 拆分后需重新构建 bundle（`node tools/build-bundles.js` + 复制 + 更新 `index.html` 版本号，见 §7）。

## 7. 构建与回归

### 7.1 bundle 重建（MUST）

新增/移动 `control/frontend/js/views/*.js` 后 MUST 执行：
```bash
node tools/build-bundles.js
sudo cp /tmp/bundle-control.js subsystems/control/frontend/js/bundle.js
# 更新 subsystems/control/frontend/index.html 中 bundle 版本号（取自 tools/.bundle-ver）
```
同时更新 `tools/bundle-sources.json`（若新增 `ncr-form.js`）。

### 7.2 回归验证清单

- [ ] 主表导出 `/api/control/orders/export` 新增列（喷码日期/重工SOP/现场指导/其他标准）正确输出
- [ ] DISPATCH 流转：缺 `rework_sop` → 400 错误提示；仅填 `rework_guide` 无 `rework_other` → 通过
- [ ] DISPATCH 成功后：`rework_sop/rework_guide/rework_other` 写入主表，详情主卡渲染
- [ ] 报工（REPORT）提交 4 新字段 → `control_rework_logs` 落库，rework tab 展示
- [ ] 新库从零建表（schema.sql）与存量库迁移（migrations.js）均正常，重复启动不报错（幂等）
- [ ] 会签闸口②（DISPOSAL_SIGN）流程不受影响（状态机顺序不变）

### 7.3 文件容量检测报告（MUST）

- `routes-orders.js`：修改后需复核行数（DISPATCH 分支 + 校验约 +15 行，仍 <400 上限）
- `detail.js`：287 行 → 拆分后应回落到 <300 行（拆出 `ncr-form.js`）
- `dao.js` / `schema.sql` / `migrations.js`：在各自红线内

## 8. 权限与必填矩阵

| 操作 | 执行角色 | 必填字段 | 时机 |
|---|---|---|---|
| 发起处理方式会签 `DISPATCH` | QA（/ADMIN） | `rework_sop` 必填；`rework_guide`/`rework_other` 至少一 | NCR_DONE → DISPOSAL_SIGNING |
| 报工 `REPORT` | 生产/生技（复用现有 role 限制） | `batch_no/pack_record/confirm_by/qty_consistent` **可空，留痕为主**（用户已确认） | REWORKING/REWORK_OPENED |
| 编辑/补录 | 申请人/ADMIN（仅 DRAFT） | `spray_date` 等可编辑 | DRAFT 编辑草稿 |

## 9. 风险与兼容性

- **子系统隔离**：仅改 `control` 子系统文件与 `db/migrations.js`（框架层迁移），不触碰 `samples/fixtures`；`migrations.js` 新增迁移函数为**纯新增**，不影响既有 `migrate*` 行为；但因 `migrations.js` 为框架层共享文件，需确认其可正常加载执行（无需双系统数据回归）。
- **兼容性**：所有补列均可空、有默认值，不删除任何既有字段/接口，旧数据无需回填；`SELECT *`/`n.*` 自动兼容。
- **上线保护**：`control` 子系统 `deployed:false`（未上线），允许注入测试数据验证。

## 10. 决策确认记录（用户已确认 2026-08-26）

1. **必填口径**：重工SOP 必填 + 现场指导/其他标准至少一项（已确认）。
2. **报工 4 新字段**：可空，留痕为主（已确认）。
3. **`detail.js` 拆分**：拆出 `ncr-form.js`（已确认）。
4. **NCR 聚合导出列**：默认保持 10 列不变，详细品质字段并入主表导出（已确认）。

---

## 附：涉及文件清单

| 文件 | 变更 |
|---|---|
| `subsystems/control/db/schema.sql` | 主表/报工子表 CREATE TABLE 补列 |
| `db/migrations.js` | 新增 `migrateControlNcrDetail` + `runMigrations` 注册 |
| `subsystems/control/backend/routes-orders.js` | `applyActionFields` 补 DISPATCH；transition 加必填校验；导出列扩充 |
| `subsystems/control/db/dao.js` | `addReworkLog` INSERT 补列 |
| `subsystems/control/frontend/js/views/detail.js` | `_CTL_TRANS_FIELDS` 补 DISPATCH；`fieldHtml` 支持 textarea；`ctlFieldGrid` 展示增强；`ctlSubmit('rework')` 补字段；拆分至 `ncr-form.js` |
| `subsystems/control/frontend/js/views/ncr-form.js` | 新增：NCR 详细字段/必填校验纯逻辑 |
| `tools/bundle-sources.json` | 加入 `ncr-form.js` |
| `subsystems/control/frontend/index.html` | bundle 版本号更新 |
