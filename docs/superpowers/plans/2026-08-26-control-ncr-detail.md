# 实现计划：管制流程 · 不良品委托单(NCR)详细内容

> 生成日期：2026-08-26
> 关联 Spec：[2026-08-26-control-ncr-detail.md](../specs/2026-08-26-control-ncr-detail.md)
> 覆盖子系统：`control`（管制流程管理）
> 工作流程：AGENTS.md §5（brainstorming 已完成 → writing-plans）
> 拆分与容量：detail.js 已 287 行超 70% 红线(280)，本计划将其表单/校验纯逻辑拆分至 `ncr-form.js`

---

## 任务总览（8 个 Task）

| # | 任务 | 涉及文件 | Commit |
|---|---|---|---|
| 1 | 数据层双轨补列 | `db/schema.sql`、`db/migrations.js` | `feat(control): NCR详细字段主表/报工子表补列` |
| 2 | DAO 读写补列 | `subsystems/control/db/dao.js` | `feat(control): DAO 主表/报工子表读写补列` |
| 3 | 后端路由变更 | `subsystems/control/backend/routes-orders.js` | `feat(control): 会签必填校验+报工透传+导出扩列+编辑草稿` |
| 4 | 新建 ncr-form.js | `subsystems/control/frontend/js/views/ncr-form.js` | `feat(control): 拆分 NCR 字段/必填校验纯逻辑` |
| 5 | 新建单补喷码日期 | `subsystems/control/frontend/js/views/new.js` | `feat(control): 新建单补喷码日期` |
| 6 | detail.js 拆分接入 | `subsystems/control/frontend/js/views/detail.js` | `refactor(control): detail.js 拆分接入 ncr-form.js` |
| 7 | bundle 构建 | `tools/bundle-sources.json`、`subsystems/control/frontend/index.html` | `chore(control): 重建 bundle 接入 ncr-form.js` |
| 8 | 回归验证 | ——（含语法自检/迁移幂等/导出/校验/容量） | `test(control): NCR详细内容回归验证` |

---

## Task 1：数据层双轨补列

**涉及文件**：`db/schema.sql`、`db/migrations.js`

### 1.1 schema.sql — 主表补列（在 `rework_sop` 之后追加）

`subsystems/control/db/schema.sql` 第 25 行 `rework_sop TEXT,` 之后追加：

```sql
  spray_date VARCHAR(24),                      -- 喷码日期（基本信息）
  rework_guide TEXT,                           -- 现场指导（重工/全检标准之一）
  rework_other TEXT,                           -- 其他标准文件（重工/全检标准之一）
```

### 1.2 schema.sql — 报工子表补列（在 `operator_name` 之后追加）

`subsystems/control/db/schema.sql` 第 81 行 `operator_name VARCHAR(50),` 之后追加：

```sql
  batch_no VARCHAR(50),                        -- 批次号（处理结果）
  pack_record VARCHAR(100),                    -- 包装称重记录（处理结果）
  confirm_by VARCHAR(50),                      -- 确认人（处理结果）
  qty_consistent TINYINT(1) DEFAULT 0,         -- 确认数量是否一致（1=一致，0=不一致）
```

### 1.3 migrations.js — 新增 `migrateControlNcrDetail` 并在 `runMigrations` 注册

`db/migrations.js` 在 `migrateUserEnabled` 函数之后、`runMigrations` 之前追加：

```js
async function migrateControlNcrDetail(pool) {
  // NCR 详细内容：主表补喷码日期/重工标准；报工子表补处理结果（2026-08-26，spec §4，幂等）
  var orderAdds = [
    'ADD COLUMN spray_date VARCHAR(24)',
    'ADD COLUMN rework_guide TEXT',
    'ADD COLUMN rework_other TEXT'
  ];
  for (var i = 0; i < orderAdds.length; i++) {
    try { await pool.execute('ALTER TABLE control_orders ' + orderAdds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
  var reworkAdds = [
    'ADD COLUMN batch_no VARCHAR(50)',
    'ADD COLUMN pack_record VARCHAR(100)',
    'ADD COLUMN confirm_by VARCHAR(50)',
    'ADD COLUMN qty_consistent TINYINT(1) DEFAULT 0'
  ];
  for (var n = 0; n < reworkAdds.length; n++) {
    try { await pool.execute('ALTER TABLE control_rework_logs ' + reworkAdds[n]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}
```

`db/migrations.js` 的 `runMigrations` 函数（第 71-77 行）追加一行：

```js
  await migrateControlNcrDetail(pool);
```

**验证**：
```bash
node -e "require('./db/migrations')"   # 语法校验，不实际执行迁移
# 或节点内仅校验语法：
node --check db/migrations.js
```

**提交**：
```bash
git add db/schema.sql db/migrations.js
git commit -m "feat(control): NCR详细字段主表/报工子表补列"
```

---

## Task 2：DAO 读写补列

**涉及文件**：`subsystems/control/db/dao.js`

### 2.1 `createOrder`（第 27-28 行）INSERT 列与 params 补 3 列

`rework_sop` 之后插入 `spray_date,rework_guide,rework_other`。列清单（第 27 行）：

```js
    var sql = 'INSERT INTO control_orders (order_no,part_no,part_name,sales_no,model,qty,bad_type,reason,applicant_id,applicant_name,apply_dept,apply_at,label_no,storage_location,stored_at,ncr_no,disposal_opinion,rework_no,rework_sop,spray_date,rework_guide,rework_other,good_qty,ng_qty,scrap_qty,remain_qty,scrap_note,in_stock_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
```

params（第 28 行）`data.rework_sop || null` 之后插入：

```js
data.spray_date || null, data.rework_guide || null, data.rework_other || null,
```

### 2.2 `updateOrder`（第 79-80 行）UPDATE 列与 params 补 3 列

第 79 行 `rework_sop=?` 之后插入 `spray_date=?,rework_guide=?,rework_other=?`：

```js
    var sql = 'UPDATE control_orders SET part_no=?, part_name=?, sales_no=?, model=?, qty=?, bad_type=?, reason=?, applicant_id=?, applicant_name=?, apply_dept=?, apply_at=?, label_no=?, storage_location=?, stored_at=?, ncr_no=?, disposal_opinion=?, rework_no=?, rework_sop=?, spray_date=?, rework_guide=?, rework_other=?, good_qty=?, ng_qty=?, scrap_qty=?, remain_qty=?, scrap_note=?, in_stock_at=?, status=? WHERE id=?';
```

第 80 行 `o.rework_sop ?? null` 之后插入：

```js
o.spray_date ?? null, o.rework_guide ?? null, o.rework_other ?? null,
```

### 2.3 `addReworkLog`（第 154-155 行）INSERT 补 4 列

第 154 行（8 列 → 12 列）：

```js
    var sql = 'INSERT INTO control_rework_logs (order_id,work_date,good_qty,ng_qty,scrap_qty,scrap_reason,operator_id,operator_name,batch_no,pack_record,confirm_by,qty_consistent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
```

第 155 行 params：

```js
    var params = [r.order_id, r.work_date || null, r.good_qty ?? 0, r.ng_qty ?? 0, r.scrap_qty ?? 0, r.scrap_reason || null, r.operator_id || null, r.operator_name || null, r.batch_no || null, r.pack_record || null, r.confirm_by || null, r.qty_consistent != null ? (r.qty_consistent ? 1 : 0) : 0];
```

> 说明：`listReworkLogsByOrder`/`listNcrLogsByOrder`/`listNcrAgg` 均 `SELECT *`/`n.*`，自动带新列，**无需改动**。

**验证**：
```bash
node --check subsystems/control/db/dao.js
```

**提交**：
```bash
git add subsystems/control/db/dao.js
git commit -m "feat(control): DAO 主表/报工子表读写补列"
```

---

## Task 3：后端路由变更

**涉及文件**：`subsystems/control/backend/routes-orders.js`

### 3.1 `applyActionFields` — START 移除 rework_sop（第 38 行）

原第 38 行：

```js
    case 'START': if ((body.rework_no || '').trim()) o.rework_no = body.rework_no.trim(); if ((body.rework_sop || '').trim()) o.rework_sop = body.rework_sop.trim(); break;
```

改为：

```js
    case 'START': if ((body.rework_no || '').trim()) o.rework_no = body.rework_no.trim(); break;
```

### 3.2 `applyActionFields` — 新增 DISPATCH 分支（第 38 行后追加）

```js
    case 'DISPATCH': // 发起处理方式会签：登记重工/全检标准（必填，校验见 transition 路由）
      if ((body.rework_sop || '').trim()) o.rework_sop = body.rework_sop.trim();
      if ((body.rework_guide || '').trim()) o.rework_guide = body.rework_guide.trim();
      if ((body.rework_other || '').trim()) o.rework_other = body.rework_other.trim();
      break;
```

### 3.3 `POST /api/control/orders/:id/transition` — 加 DISPATCH 必填校验

在第 183 行 `if (!t) return res.status(400).json({ error: '该操作无对应流转' });` 之后、`let result;` 之前插入：

```js
    if (action === 'DISPATCH') { // 处理方式会签发起：重工/全检标准必填（SOP 必填 + 指导/其他至少一项）
      const rb = req.body || {};
      const sop = (rb.rework_sop || '').trim();
      const guide = (rb.rework_guide || '').trim();
      const other = (rb.rework_other || '').trim();
      if (!sop) return res.status(400).json({ error: '处理方式会签前必须填写重工/全检标准：重工SOP' });
      if (!guide && !other) return res.status(400).json({ error: '处理方式会签前必须填写重工/全检标准：现场指导或标准文件至少填一项' });
    }
```

### 3.4 `POST /api/control/orders` — `createOrder` 透传 spray_date（第 140-143 行）

在 `createOrder({` 数据对象中 `reason,` 之后增加 `spray_date`：

```js
      const no = await D.createOrder({
        part_no, part_name, sales_no: (body.sales_no || '').trim(), model: (body.model || '').trim(),
        qty, bad_type, reason, spray_date: (body.spray_date || '').trim(), applicant_id: u.id, applicant_name: u.display_name || u.username,
        apply_dept: (body.apply_dept || '').trim() || u.dept, apply_at: D.nowISO(), status: 'DRAFT', created_by: u.id
      }, conn);
```

### 3.5 `PUT /api/control/orders/:id` — 编辑草稿白名单加 spray_date（第 161 行）

```js
    ['part_no', 'part_name', 'sales_no', 'model', 'qty', 'bad_type', 'reason', 'apply_dept', 'spray_date'].forEach(k => { if (body[k] !== undefined) updated[k] = body[k]; });
```

### 3.6 `POST /api/control/orders/:id/rework-log` — `addReworkLog` 透传 4 新字段（第 256 行）

```js
        await D.addReworkLog({ order_id: order.id, work_date: body.work_date || D.nowISO(), good_qty: g, ng_qty: n, scrap_qty: s, scrap_reason: body.scrap_reason || null, operator_id: u.id, operator_name: u.display_name || u.username, batch_no: body.batch_no || null, pack_record: body.pack_record || null, confirm_by: body.confirm_by || null, qty_consistent: body.qty_consistent != null ? (body.qty_consistent === 1 || body.qty_consistent === '1' || body.qty_consistent === true ? 1 : 0) : 0 }, conn);
```

### 3.7 `GET /api/control/orders/export` — 扩充列

- `sales_no` 行（第 84 行）之后插入 `spray_date` 列：

```js
      { key: 'spray_date', label: '喷码日期' },
```

- `rework_no` 行（第 95 行）之后插入重工标准列：

```js
      { key: 'rework_sop', label: '重工SOP' },
      { key: 'rework_guide', label: '现场指导' },
      { key: 'rework_other', label: '其他标准' },
```

**验证**：
```bash
node --check subsystems/control/backend/routes-orders.js
```

**提交**：
```bash
git add subsystems/control/backend/routes-orders.js
git commit -m "feat(control): 会签必填校验+报工透传+导出扩列+编辑草稿"
```

---

## Task 4：新建 ncr-form.js（拆分 NCR 字段/必填校验纯逻辑）

**涉及文件**：`subsystems/control/frontend/js/views/ncr-form.js`（新建）

> 拆分动机：`detail.js` 当前 287 行已超 70% 红线(280)。将「流转需填字段定义 + 处理方式会签必填校验」等**纯逻辑**抽离至此，`detail.js` 仅保留渲染/收集。

新文件完整内容：

```js
// subsystems/control/frontend/js/views/ncr-form.js — NCR 详细内容：流转需填字段 + 必填校验（纯逻辑，供 detail.js 引用）
// 拆分目的：detail.js 已 287 行超 70% 红线(280)，将「流转额外字段定义 + DISPATCH 必填校验」抽离至此。
// 约定：detail.js 的 _ctlUtil.fieldHtml 会按 f.type 渲染 textarea；_ctlSubmit 提交前调 ncrRequiredCheck。

// 需要额外字段输入的流转 action（其余流转仅确认即提交）
// 变更：START 不再收集 rework_sop（已在 DISPATCH 会签时登记）；新增 DISPATCH 收集重工/全检标准
var _CTL_TRANS_FIELDS = {
  STORE: [{ k: 'storage_location', label: '管制仓储位' }],
  CREATE_NCR: [{ k: 'ncr_no', label: '不良品委托单号' }],
  DISPOSAL_OK: [{ k: 'disposal_opinion', label: '处理方式结论' }],
  START: [{ k: 'rework_no', label: '重工工单号' }],
  DISPATCH: [
    { k: 'rework_sop', label: '重工 SOP', type: 'textarea', required: true },
    { k: 'rework_guide', label: '现场指导' },
    { k: 'rework_other', label: '其他标准文件' }
  ]
};

/**
 * 处理方式会签(DISPATCH)必填校验：SOP 必填 + 现场指导/其他标准文件至少一项。
 * 与后端 routes-orders.js §8.3 校验口径一致。
 * @param {string} action 流转 action
 * @param {Object} body 已收集的字段对象
 * @returns {string} 错误文案（合法返回空串）
 */
function ncrRequiredCheck(action, body) {
  if (action !== 'DISPATCH') return '';
  var sop = (body.rework_sop || '').trim();
  var guide = (body.rework_guide || '').trim();
  var other = (body.rework_other || '').trim();
  if (!sop) return '处理方式会签前必须填写重工/全检标准：重工SOP';
  if (!guide && !other) return '处理方式会签前必须填写重工/全检标准：现场指导或标准文件至少填一项';
  return '';
}
```

**验证**：
```bash
node --check subsystems/control/frontend/js/views/ncr-form.js
```

**提交**：
```bash
git add subsystems/control/frontend/js/views/ncr-form.js
git commit -m "feat(control): 拆分 NCR 字段/必填校验纯逻辑"
```

---

## Task 5：新建单补喷码日期

**涉及文件**：`subsystems/control/frontend/js/views/new.js`

### 5.1 `renderNew` — 表单加「喷码日期」

将第 20 行 `<div class="empty-block"></div>` 替换为喷码日期输入：

```js
    + '<div><label>喷码日期</label><fluent-text-field id="n-spray_date" placeholder="可选"></fluent-text-field></div>'
```

> 将原有 empty-block 占位替换为实际字段，保持 nf-grid 偶数对齐（8 个普通字段 + 1 个 full）。

### 5.2 `submitNewOrder` — payload 透传 spray_date

第 47-48 行 `reason:` 之后增加：

```js
      spray_date: $('#n-spray_date').value,
```

> 喷码日期为可选字段，不加入 `ctlValidateNew` 必填校验（仍只有 part_no/part_name/qty/bad_type/reason 必填）。

**验证**：
```bash
node --check subsystems/control/frontend/js/views/new.js
```

**提交**：
```bash
git add subsystems/control/frontend/js/views/new.js
git commit -m "feat(control): 新建单补喷码日期"
```

---

## Task 6：detail.js 拆分接入 + 展示/收集增强

**涉及文件**：`subsystems/control/frontend/js/views/detail.js`

### 6.1 删除 `_CTL_TRANS_FIELDS` 定义（第 13-19 行）

删除第 13-19 行（注释 + `var _CTL_TRANS_FIELDS = {...};`），改由 ncr-form.js 提供：

```js
// 需要额外字段输入的流转 action（其余流转仅确认即提交）
var _CTL_TRANS_FIELDS = {
  STORE: [{ k: 'storage_location', label: '管制仓储位' }],
  CREATE_NCR: [{ k: 'ncr_no', label: '不良品委托单号' }],
  DISPOSAL_OK: [{ k: 'disposal_opinion', label: '处理方式结论' }],
  START: [{ k: 'rework_no', label: '重工工单号' }, { k: 'rework_sop', label: '重工 SOP' }]
};
```

### 6.2 `_ctlUtil.fieldHtml` — 支持 textarea（第 28-30 行）

```js
  /** 表单字段输入 HTML（id = cf-<key>；type='textarea' 渲染多行） */
  fieldHtml: function (k, label, type) {
    if (type === 'textarea') return '<div><label>' + label + '</label><textarea id="cf-' + k + '" rows="2"></textarea></div>';
    return '<div><label>' + label + '</label><input id="cf-' + k + '" type="' + (type || 'text') + '"></div>';
  },
```

### 6.3 `modalCfg('trans')` — 透传 f.type（第 70 行）

```js
      var fb = _ctlUtil.transFields(action).map(function (f) { return _ctlUtil.fieldHtml(f.k, f.label, f.type); }).join('');
```

### 6.4 `modalCfg('rework')` — 补处理结果字段（第 92-96 行）

```js
        body: '<div class="ctl-form-grid">'
          + '<div><label>良品数</label><input id="cf-good_qty" type="number" min="0"></div>'
          + '<div><label>不良数</label><input id="cf-ng_qty" type="number" min="0"></div>'
          + '<div><label>报废数</label><input id="cf-scrap_qty" type="number" min="0"></div>'
          + '<div><label>报废原因</label><input id="cf-scrap_reason"></div>'
          + '<div><label>批次号</label><input id="cf-batch_no" placeholder="可选"></div>'
          + '<div><label>包装称重记录</label><input id="cf-pack_record" placeholder="可选"></div>'
          + '<div><label>确认人</label><input id="cf-confirm_by" placeholder="可选"></div>'
          + '<div><label>数量一致</label><select id="cf-qty_consistent"><option value="0">否</option><option value="1">是</option></select></div></div>',
```

### 6.5 `_ctlTabSheet.rework()` — 补处理结果列（第 137-142 行）

```js
    return '<table class="grid"><thead><tr><th>报工日期</th><th>良品</th><th>不良</th><th>报废</th><th>报废原因</th><th>批次号</th><th>包装称重</th><th>确认人</th><th>数量一致</th><th>操作人</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><td class="mono">' + fmtTime(r.work_date) + '</td><td>' + (r.good_qty || 0) + '</td>'
          + '<td>' + (r.ng_qty || 0) + '</td><td>' + (r.scrap_qty || 0) + '</td>'
          + '<td class="muted">' + e(r.scrap_reason || '—') + '</td>'
          + '<td class="muted">' + e(r.batch_no || '—') + '</td><td class="muted">' + e(r.pack_record || '—') + '</td>'
          + '<td class="muted">' + e(r.confirm_by || '—') + '</td><td>' + (r.qty_consistent ? '是' : '否') + '</td>'
          + '<td>' + e(r.operator_name || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
```

### 6.6 `ctlFieldGrid` — 主卡分组增强（第 186-206 行）

基本信息组加「喷码日期」，管制信息组加重工标准：

```js
    ['基本信息', [
      ['料号', o.part_no], ['品名', o.part_name], ['机型', o.model], ['数量', o.qty],
      ['喷码日期', o.spray_date], ['不良类型', o.bad_type], ['申请部门', o.apply_dept],
      ['申请人', o.applicant_name], ['申请时间', fmtTime(o.apply_at)]
    ]],
    ['管制信息', [
      ['管制标签号', o.label_no], ['储位', o.storage_location], ['委托单号', o.ncr_no],
      ['处理方式', o.disposal_opinion], ['重工工单号', o.rework_no],
      ['重工SOP', o.rework_sop], ['现场指导', o.rework_guide], ['其他标准', o.rework_other]
    ]],
```

### 6.7 `ctlSubmit('trans')` — 调 ncrRequiredCheck（第 266-269 行）

```js
    if (kind === 'trans') {
      var body = { comment: _ctlUtil.val('#cf-comment') || '' };
      _ctlUtil.transFields(m.action).forEach(function (f) { var v = _ctlUtil.val('#cf-' + f.k); if (v) body[f.k] = v; });
      var err = ncrRequiredCheck(m.action, body);
      if (err) { toast(err, 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/transition', Object.assign({ action: m.action }, body));
```

### 6.8 `ctlSubmit('rework')` — 透传处理结果字段（第 274-275 行）

```js
    } else if (kind === 'rework') {
      var rw = {
        good_qty: Number(_ctlUtil.val('#cf-good_qty')) || 0,
        ng_qty: Number(_ctlUtil.val('#cf-ng_qty')) || 0,
        scrap_qty: Number(_ctlUtil.val('#cf-scrap_qty')) || 0,
        scrap_reason: _ctlUtil.val('#cf-scrap_reason'),
        batch_no: _ctlUtil.val('#cf-batch_no'),
        pack_record: _ctlUtil.val('#cf-pack_record'),
        confirm_by: _ctlUtil.val('#cf-confirm_by'),
        qty_consistent: $('#cf-qty_consistent') ? ($('#cf-qty_consistent').value === '1' ? 1 : 0) : 0
      };
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/rework-log', rw);
```

**验证**：
```bash
node --check subsystems/control/frontend/js/views/detail.js
```

**提交**：
```bash
git add subsystems/control/frontend/js/views/detail.js
git commit -m "refactor(control): detail.js 拆分接入 ncr-form.js"
```

---

## Task 7：bundle 构建配置 + 重建

**涉及文件**：`tools/bundle-sources.json`、`subsystems/control/frontend/index.html`

### 7.1 bundle-sources.json — control 段加入 ncr-form.js

在 `subsystems/control/frontend/js/views/ncr-list.js`（第 89 行）与 `subsystems/control/frontend/js/views/detail.js`（第 90 行）之间插入一行：

```json
    "subsystems/control/frontend/js/views/ncr-form.js",
```

> ncr-form.js 必须排在 detail.js 之前，确保 `_CTL_TRANS_FIELDS`/`ncrRequiredCheck` 在 bundle 执行时已初始化。

### 7.2 重建 bundle

```bash
node tools/build-bundles.js
# 控制子系统产物在 /tmp/bundle-control.js，复制到子系统 js/ 目录
sudo cp /tmp/bundle-control.js subsystems/control/frontend/js/bundle.js
# 读取新版本号
cat tools/.bundle-ver
# 更新 index.html 的 ?v= 为上述新版本号（见 7.3）
```

### 7.3 index.html — 更新版本号

`subsystems/control/frontend/index.html` 第 61 行：

```html
<script src="/subsystems/control/frontend/js/bundle.js?v=<新版本号>" defer></script>
```

> 本次当前版本号为 `bmt9lawrm`，重建后更新为 `tools/.bundle-ver` 中的新值。

**验证**：刷新页面无 404；`ncr-form.js` 的函数已在 bundle 生效（控制台 `typeof ncrRequiredCheck === 'function'`）。

**提交**：
```bash
git add tools/bundle-sources.json subsystems/control/frontend/index.html subsystems/control/frontend/js/bundle.js
git commit -m "chore(control): 重建 bundle 接入 ncr-form.js"
```

---

## Task 8：回归验证清单

> control 子系统 manifest 为 `"deployed": false`，未受 §20 上线保护，允许数据写入类验证。

| # | 验证项 | 操作 | 期望 |
|---|---|---|---|
| 8.1 | 语法自检 | `node --check` 逐个检查 migrations.js / dao.js / routes-orders.js / ncr-form.js / new.js / detail.js | 全部无报错 |
| 8.2 | 迁移幂等 | 连续两次执行 `runMigrations`（或重启后自动迁移） | 无 `ER_DUP_FIELDNAME` 报错，幂等 |
| 8.3 | 字段落库 | 新建单填喷码日期 → 详情主卡显示「喷码日期」；会签时填重工标准 → 主卡「管制信息」组显示 SOP/现场指导/其他标准 |
| 8.4 | DISPATCH 必填校验 | 会签时 SAP 留空 / 指导与其他均空 | 前后端均拦截，提示「处理方式会签前必须填写重工/全检标准」 |
| 8.5 | 报工处理结果 | 报工填批次号/包装/确认人/数量一致 → 报工 Tab 新列正确显示 | 新列「批次号/包装称重/确认人/数量一致」展示正确 |
| 8.6 | 导出扩列 | `GET /api/control/orders/export` | CSV 含「喷码日期/重工SOP/现场指导/其他标准」列；NCR 聚合导出仍为 10 列不变 |
| 8.7 | HOME 页面断点 | 在 <576 / 768-1199 / ≥1600 断点查看详情主卡与报工表 | 不破版，可横向滚动 |
| 8.8 | 容量检测 | 输出 Task 9 附录臃肿检测报告 | detail.js ≤360 红线、ncr-form.js 等均达标 |

**提交**：
```bash
git add -A
git commit -m "test(control): NCR详细内容回归验证"
```

---

## 附录：容量与臃肿检测报告（执行后补充）

> 每次修改文件后 MUST 同步输出（AGENTS.md §9）下列 3 项。以下为预估基线，实施后按实际更新。

| 文件 | 类型/上限 | 当前有效行 | 距上限 | 顶层函数/Class | 触发预警 |
|---|---|---|---|---|---|
| `db/migrations.js` | 300 连续 | ~180 行 | 余 ~120 | 函数 8/10 | 未触发 |
| `dao.js` | 400 | ~180 行 | 余 ~220 | 函数 10/10 | 达上限预警 |
| `routes-orders.js` | 400 | ~270 行 | 余 ~130 | 函数 9/10 | 未触发 |
| `ncr-form.js`（新） | 200 | ~30 行 | 余 ~170 | 顶层函数 1/10 | 未触发 |
| `new.js` | 300 | ~72 行 | 余 ~228 | 函数 3/10 | 未触发 |
| `detail.js` | 400 | ~305 行（预估） | 余 ~95 | 函数 6/10 | **达 70% 预警(280)** |

**detail.js 冗余与瘦身建议**（不阻塞本轮，建议下个迭代执行）：
- `ctlFieldGrid` 主卡分组渲染可独立至 `views/detail-fields.js`；
- `_ctlTabSheet` 四 Tab 渲染可独立至 `views/detail-tabs.js`；
- 拆分后建议 `detail.js` 收敛至 ≤280 行。

