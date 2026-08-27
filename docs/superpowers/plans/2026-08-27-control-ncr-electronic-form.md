# 实现计划：不良品委托单「电子表单化」

> 关联 spec：[2026-08-27-control-ncr-electronic-form.md](../specs/2026-08-27-control-ncr-electronic-form.md)
> 覆盖子系统：`control`
> 执行方式：Subagent 驱动 / Inline（用户已选定）
> 关键约束：仅改 `control` 子系统，不改 `samples`/`fixtures`；不新建冗余表；方案字段不改状态机；`control` 未上线（`deployed:false`），可注入测试数据。

---

## 任务总览（9 个 Task）

| # | 任务 | 文件 | 要点 |
|---|---|---|---|
| T1 | 数据库：主表追加 7 列 + 迁移注册 | `subsystems/control/db/schema.sql`、`db/migrations.js` | 幂等 ALTER，幂等安全 |
| T2 | DAO：`createOrder`/`updateOrder` 补 7 列 | `subsystems/control/db/dao.js` | INSERT 30→37，UPDATE 28→35 |
| T3 | 建单/编辑草稿/DISPATCH 收字段 | `subsystems/control/backend/routes-orders.js` | 建单+白名单+applyActionFields |
| T4 | 前端开单表单加字段 | `subsystems/control/frontend/js/views/new.js` | 客户 + 不良原因 5 分项 |
| T5 | DISPATCH 流转字段 + 校验 | `subsystems/control/frontend/js/views/ncr-form.js` | 补 `pack_sop`（可选） |
| T6 | 电子表单视图函数 | `subsystems/control/frontend/js/views/ncr-form-view.js`（新建） | `renderNcrFormTab` |
| T7 | 详情页 Tab 接线 | `subsystems/control/frontend/js/views/detail.js` | Tab 追加 `form`，接入渲染；方案 D 自动定位 Tab |
| T8 | 电子表单样式 + 打印 | `subsystems/control/frontend/css/module.css` | `.ctl-ncr-form` + `@media print` |
| T9 | bundle 重建 + 版本号 | `tools/bundle-sources.json`、`tools/build-bundles.js`、`frontend/js/bundle.js`、`frontend/index.html` | 新增源文件 + 重建 + 更新版本 |

---

## 核心代码底座（前后端字段全部对齐）

新增字段（全部存 `control_orders`，均可空）：
```
customer        VARCHAR(100)   -- 客户
bad_appearance  TEXT           -- 不良原因·外观
bad_function    TEXT           -- 不良原因·功能
bad_size        TEXT           -- 不良原因·尺寸
bad_change      TEXT           -- 不良原因·设变
bad_other       TEXT           -- 不良原因·其他
pack_sop        VARCHAR(100)   -- 包装SOP编号（DISPATCH 收集）
```

---

## T1 · 数据库

### Files
- `subsystems/control/db/schema.sql`
- `db/migrations.js`

### Steps

**1.1 schema.sql**：在 `rework_other` 之后、`good_qty` 之前插入 7 列（现第 28 行 `rework_other` 之后）：

```sql
  rework_other TEXT,                           // 其他标准文件（重工/全检标准之一）
  customer VARCHAR(100),                       -- 客户（基本信息）
  bad_appearance TEXT,                         -- 不良原因分析·外观
  bad_function TEXT,                           -- 不良原因分析·功能
  bad_size TEXT,                               -- 不良原因分析·尺寸
  bad_change TEXT,                             -- 不良原因分析·设变
  bad_other TEXT,                              -- 不良原因分析·其他
  pack_sop VARCHAR(100),                       -- 包装SOP编号（解决方案）
  good_qty INT,                                // 良品数（⑨ 汇总）
```

> 注：`//` 非 MySQL 合法注释，已替换为 `--`（2026-08-27 修复）。

**1.2 migrations.js**：在 `migrateControlNcrDetail` 之后新增 `migrateControlNcrForm`，并注册到 `runMigrations`：

```js
async function migrateControlNcrForm(pool) {
  // 不良品委托单电子表单化：主表补客户/不良原因分项/包装SOP编号（2026-08-27，幂等）
  var adds = [
    'ADD COLUMN customer VARCHAR(100)',
    'ADD COLUMN bad_appearance TEXT',
    'ADD COLUMN bad_function TEXT',
    'ADD COLUMN bad_size TEXT',
    'ADD COLUMN bad_change TEXT',
    'ADD COLUMN bad_other TEXT',
    'ADD COLUMN pack_sop VARCHAR(100)'
  ];
  for (var i = 0; i < adds.length; i++) {
    try { await pool.execute('ALTER TABLE control_orders ' + adds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}
```

`runMigrations` 末尾（`migrateControlNcrDetail(pool);` 之后）追加：

```js
  await migrateControlNcrForm(pool);
```

### 验证
- 重启服务（宝塔）后无重复列报错；`SHOW COLUMNS FROM control_orders` 含 7 新列。
- 重复运行服务不报 `ER_DUP_FIELDNAME`。

### Commit
- `feat(control): control_orders 追加不良品委托单电子表单 7 列（含迁移）`

---

## T2 · DAO

### Files
- `subsystems/control/db/dao.js`

### Steps

**2.1 `createOrder`**（第 27-28 行）：INSERT 列串与 params 在 `rework_other` 后插入 7 列（37 列）：

```js
    var sql = 'INSERT INTO control_orders (order_no,part_no,part_name,sales_no,model,qty,bad_type,reason,applicant_id,applicant_name,apply_dept,apply_at,label_no,storage_location,stored_at,ncr_no,disposal_opinion,rework_no,rework_sop,spray_date,rework_guide,rework_other,customer,bad_appearance,bad_function,bad_size,bad_change,bad_other,pack_sop,good_qty,ng_qty,scrap_qty,remain_qty,scrap_note,in_stock_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    var params = [orderNo, data.part_no || null, data.part_name || null, data.sales_no || null, data.model || null, data.qty != null ? data.qty : null, data.bad_type || null, data.reason || null, data.applicant_id || null, data.applicant_name || null, data.apply_dept || null, data.apply_at || nowISO(), data.label_no || null, data.storage_location || null, data.stored_at || null, data.ncr_no || null, data.disposal_opinion || null, data.rework_no || null, data.rework_sop || null, data.spray_date || null, data.rework_guide || null, data.rework_other || null, data.customer || null, data.bad_appearance || null, data.bad_function || null, data.bad_size || null, data.bad_change || null, data.bad_other || null, data.pack_sop || null, data.good_qty || 0, data.ng_qty || 0, data.scrap_qty || 0, remainOf(data), data.scrap_note || null, data.in_stock_at || null, data.status || 'DRAFT', data.created_by || null];
```

**2.2 `updateOrder`**（第 79-80 行）：SET 在 `rework_other=?` 后插入 7 个 `?`，共 35 赋值字段 + `WHERE id=?`：

```js
    var sql = 'UPDATE control_orders SET part_no=?, part_name=?, sales_no=?, model=?, qty=?, bad_type=?, reason=?, applicant_id=?, applicant_name=?, apply_dept=?, apply_at=?, label_no=?, storage_location=?, stored_at=?, ncr_no=?, disposal_opinion=?, rework_no=?, rework_sop=?, spray_date=?, rework_guide=?, rework_other=?, customer=?, bad_appearance=?, bad_function=?, bad_size=?, bad_change=?, bad_other=?, pack_sop=?, good_qty=?, ng_qty=?, scrap_qty=?, remain_qty=?, scrap_note=?, in_stock_at=?, status=? WHERE id=?';
    var params = [o.part_no ?? null, o.part_name ?? null, o.sales_no ?? null, o.model ?? null, o.qty != null ? o.qty : null, o.bad_type ?? null, o.reason ?? null, o.applicant_id ?? null, o.applicant_name ?? null, o.apply_dept ?? null, o.apply_at ?? null, o.label_no ?? null, o.storage_location ?? null, o.stored_at ?? null, o.ncr_no ?? null, o.disposal_opinion ?? null, o.rework_no ?? null, o.rework_sop ?? null, o.spray_date ?? null, o.rework_guide ?? null, o.rework_other ?? null, o.customer ?? null, o.bad_appearance ?? null, o.bad_function ?? null, o.bad_size ?? null, o.bad_change ?? null, o.bad_other ?? null, o.pack_sop ?? null, o.good_qty ?? 0, o.ng_qty ?? 0, o.scrap_qty ?? 0, remainOf(o), o.scrap_note ?? null, o.in_stock_at ?? null, o.status ?? null, o.id];
```

### 验证
- 建单落库后 `bad_appearance` 等可空不报错；DISPATCH 录入 `pack_sop` 后 `updateOrder` 回写成功。

### Commit
- `feat(control): DAO 补齐电子表单 7 列读写`

---

## T3 · 后端路由

### Files
- `subsystems/control/backend/routes-orders.js`

### Steps

**3.1 `applyActionFields` DISPATCH 分支**（第 39-43 行）追加 `pack_sop`：

```js
    case 'DISPATCH': // 发起处理方式会签：登记重工/全检标准 + 包装SOP编号（校验见 transition 路由）
      if ((body.rework_sop || '').trim()) o.rework_sop = body.rework_sop.trim();
      if ((body.rework_guide || '').trim()) o.rework_guide = body.rework_guide.trim();
      if ((body.rework_other || '').trim()) o.rework_other = body.rework_other.trim();
      if ((body.pack_sop || '').trim()) o.pack_sop = body.pack_sop.trim();
      break;
```

**3.2 建单 `POST /api/control/orders`**（第 148 行 `D.createOrder` 调用处）补 `customer` + 5 个不良原因分项：

```js
      const no = await D.createOrder({
        part_no, part_name, sales_no: (body.sales_no || '').trim(), model: (body.model || '').trim(),
        qty, bad_type, reason, spray_date: (body.spray_date || '').trim(), applicant_id: u.id, applicant_name: u.display_name || u.username,
        apply_dept: (body.apply_dept || '').trim() || u.dept, apply_at: D.nowISO(), status: 'DRAFT', created_by: u.id,
        customer: (body.customer || '').trim(),
        bad_appearance: (body.bad_appearance || '').trim(), bad_function: (body.bad_function || '').trim(),
        bad_size: (body.bad_size || '').trim(), bad_change: (body.bad_change || '').trim(),
        bad_other: (body.bad_other || '').trim()
      }, conn);
```

**3.3 「编辑草稿」白名单**（第 170 行）追加 6 个可编辑字段：

```js
    ['part_no', 'part_name', 'sales_no', 'model', 'qty', 'bad_type', 'reason', 'apply_dept', 'spray_date', 'customer', 'bad_appearance', 'bad_function', 'bad_size', 'bad_change', 'bad_other'].forEach(k => { if (body[k] !== undefined) updated[k] = body[k]; });
```

### 验证
- 建单传输含 `customer`/bad_* 后落库成功；草稿可编辑回写成功；DISPATCH 录 `pack_sop` 落库成功。

### Commit
- `feat(control): 建单/编辑/DISPATCH 收集电子表单字段`

---

## T4 · 前端开单表单

### Files
- `subsystems/control/frontend/js/views/new.js`

### Steps

**4.1 `renderNew`**：简介组加「客户」，新增「不良原因分析」组 5 分项。在 `n-spray_date` 之后、`n-reason` 之前插入：

```js
    + '<div><label>客户</label><fluent-text-field id="n-customer" placeholder="可选"></fluent-text-field></div>'
    + '<div class="nf-full"><label>不良原因分析</label><textarea id="n-bad_appearance" rows="2" placeholder="外观：可选"></textarea></div>'
    + '<div><label>不良原因·功能</label><textarea id="n-bad_function" rows="2" placeholder="可选"></textarea></div>'
    + '<div><label>不良原因·尺寸</label><textarea id="n-bad_size" rows="2" placeholder="可选"></textarea></div>'
    + '<div><label>不良原因·设变</label><textarea id="n-bad_change" rows="2" placeholder="可选"></textarea></div>'
    + '<div><label>不良原因·其他</label><textarea id="n-bad_other" rows="2" placeholder="可选"></textarea></div>'
```

**4.2 `submitNewOrder` payload**（第 39-49 行）追加：

```js
      customer: $('#n-customer').value,
      bad_appearance: $('#n-bad_appearance').value,
      bad_function: $('#n-bad_function').value,
      bad_size: $('#n-bad_size').value,
      bad_change: $('#n-bad_change').value,
      bad_other: $('#n-bad_other').value,
```

`ctlValidateNew` 不改（新字段均可空），保持后端必填口径一致。

### 验证
- 新建管制申请页出现「客户」+「不良原因分析」5 分项；填写后创建成功并落库。

### Commit
- `feat(control): 开单表单补客户与不良原因分项`

---

## T5 · DISPATCH 流转字段

### Files
- `subsystems/control/frontend/js/views/ncr-form.js`

### Steps

**5.1 `_CTL_TRANS_FIELDS.DISPATCH`**（第 12-16 行）追加 `pack_sop`（可选输入）：

```js
  DISPATCH: [
    { k: 'rework_sop', label: '重工 SOP', type: 'textarea', required: true },
    { k: 'rework_guide', label: '现场指导' },
    { k: 'rework_other', label: '其他标准文件' },
    { k: 'pack_sop', label: '包装SOP编号' }
  ]
```

`ncrRequiredCheck` 不改（`pack_sop` 可选）。

### 验证
- 处理方式会签弹窗出现「包装SOP编号」输入；填写后提交落库 `pack_sop`。

### Commit
- `feat(control): DISPATCH 收集包装SOP编号`

---

## T6 · 电子表单视图函数（新建）

### Files
- `subsystems/control/frontend/js/views/ncr-form-view.js`（新建）

### Steps

新建文件，定义 `renderNcrFormTab()`，读取全局 `_ctlDetailAgg`（主单 + ncrLogs + reworkLogs）。贴合 Word 表单 GYS-Q2-008_01(REV_1) 版式：

```js
// subsystems/control/frontend/js/views/ncr-form-view.js — 不良品委托单电子表单视图
// 按 Word 表单 GYS-Q2-008_01(REV_1) 栏位渲染单张可打印表单，绑定详情页「电子表单」Tab。
// 数据源：_ctlDetailAgg（主单+ ncrLogs + reworkLogs，仅在 detail.js 生命周期内调用）。
// 无数据时渲染「暂无电子表单数据」占位；使用全局 fmtTime / e / me。

function renderNcrFormTab() {
  var agg = _ctlDetailAgg;
  if (!agg || !agg.order) return '<div class="empty">暂无电子表单数据</div>';
  var o = agg.order;

  // 报工子表最新一条（id 最大）作为处理结果；无则回退主表 good/ng/scrap
  var rl = null;
  (agg.reworkLogs || []).forEach(function (r) { if (!rl || r.id > rl.id) rl = r; });
  // NCR 子表最新一条作为签核部门；无则空
  var nl = null;
  (agg.ncrLogs || []).forEach(function (n) { if (!nl || n.id > nl.id) nl = n; });

  var good = rl ? rl.good_qty : o.good_qty;
  var ng = rl ? rl.ng_qty : o.ng_qty;
  var scrap = rl ? rl.scrap_qty : o.scrap_qty;
  var batch = rl ? rl.batch_no : '';
  var packRec = rl ? rl.pack_record : '';
  var confirmBy = rl ? rl.confirm_by : '';
  var qtyOk = rl ? (rl.qty_consistent ? '是' : '否') : '';

  function fv(v) { return v == null || v === '' ? '—' : e(String(v)); }
  function row4(cells) { return '<div class="ncr-row ncr-c4">' + cells.join('') + '</div>'; }
  function cell(label, val) { return '<div class="ncr-cell"><span class="ncr-f">' + label + '</span><span class="ncr-v">' + val + '</span></div>'; }

  var html = '<div class="ctl-ncr-form">'
    + '<div class="ncr-toolbar"><button class="btn primary" onclick="window.print()">打印</button></div>'
    + '<div class="ncr-head"><div class="ncr-title">不良品委托检验单</div><div class="ncr-no">表单编号：GYS-Q2-008_01 REV_1</div></div>'
    // 基本信息
    + '<div class="ncr-sec">基本信息</div>'
    + row4([cell('销货单号', fv(o.sales_no)), cell('料号', fv(o.part_no)), cell('品名', fv(o.part_name)), cell('机种', fv(o.model))])
    + row4([cell('客户', fv(o.customer)), cell('喷码日期', fv(o.spray_date)), cell('数量', fv(o.qty)), cell('不良类型', fv(o.bad_type))])
    // 不良原因分析
    + '<div class="ncr-sec">不良原因分析</div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">管制/不良原因</span><span class="ncr-v">' + fv(o.reason) + '</span></div>'
    + row4([cell('外观', fv(o.bad_appearance)), cell('功能', fv(o.bad_function)), cell('尺寸', fv(o.bad_size))])
    + row4([cell('设变', fv(o.bad_change)), cell('其他', fv(o.bad_other))])
    // 解决方案
    + '<div class="ncr-sec">解决方案（处理方式）</div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">处理方式结论</span><span class="ncr-v">' + fv(o.disposal_opinion) + '</span></div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">包装SOP编号</span><span class="ncr-v">' + fv(o.pack_sop) + '</span></div>'
    // 重工/全检标准
    + '<div class="ncr-sec">重工/全检标准文件</div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">重工SOP</span><span class="ncr-v">' + fv(o.rework_sop) + '</span></div>'
    + row4([cell('现场指导', fv(o.rework_guide)), cell('其他标准文件', fv(o.rework_other))])
    // 处理结果
    + '<div class="ncr-sec">处理结果</div>'
    + row4([cell('全检/重工数量', fv(qtyOf(agg))), cell('不良品数', fv(ng)), cell('合格品数', fv(good)), cell('报废数', fv(scrap))])
    + '<div class="ncr-row ncr-full"><span class="ncr-f">批次号</span><span class="ncr-v">' + fv(batch) + '</span></div>'
    + row4([cell('包装称重记录', fv(packRec)), cell('确认人', fv(confirmBy)), cell('确认数量是否一致', fv(qtyOk))])
    // 签署栏
    + '<div class="ncr-sec">签署栏</div>'
    + row4([cell('检验部门', fv(nl ? nl.inspect_dept : '')), cell('处理部门', fv(nl ? nl.handle_dept : '')), cell('委托部门', fv(o.apply_dept)), cell('经办', fv(o.applicant_name))])
    + '</div>';

  return html;
}

// 处理结果「全检/重工数量」：报工子表为空时回退主表数量
function qtyOf(agg) {
  var o = agg.order || {};
  var rl = (agg.reworkLogs || [])[0];
  if (rl) return (Number(rl.good_qty || 0) + Number(rl.ng_qty || 0) + Number(rl.scrap_qty || 0));
  return Number(o.qty || 0);
}
```

> 说明：`renderNcrFormTab` 与 `qtyOf` 相加 2 个顶层函数，符合 ≤10 约束。`qtyOf` 仅用于回退主表数量，避免空值显示异常。

### 验证
- 详情页「电子表单」Tab 渲染完整栏位；有报工子表时处理结果显示子表数据，无则回退主表。

### Commit
- `feat(control): 新增不良品委托单电子表单视图`

---

## T7 · 详情页 Tab 接线

### Files
- `subsystems/control/frontend/js/views/detail.js`

### Steps

**7.1 Tab 栏**（`ctlTabBarHTML` 第 235 行）追加 `['form', '电子表单']` 于 `logs` 之后：

```js
  var tabs = [['sign', '会签闸口'], ['ncr', '不良品委托单'], ['rework', '报工'], ['logs', '操作日志'], ['form', '电子表单']];
```

**7.2 渲染分支**（`_ctlTabSheet`，第 146 行 `logs` 之后）追加 `form`：

```js
  form: function () {
    return renderNcrFormTab();
  },
```

**7.3 方案 D（2026-08-27 追加）**：`renderDetailBody()` 开头按 `o.status` 自动重置默认 Tab。新增状态常量：

```js
var _CTL_FORM_STATES = ['NCR_DONE', 'DISPOSAL_SIGNING', 'REWORK_OPENED', 'REWORKING', 'REWORK_REPORTED', 'REIN_STOCK', 'SHIPPED'];
```

`renderDetailBody()` 开头：

```js
  _ctlDetailTab = (_CTL_FORM_STATES.indexOf(o.status) >= 0) ? 'form' : 'sign';
```

无需改动 `ctlRenderTab`/`ctlSwitchTab`（它们按 key 通用渲染）。

### 验证
- 详情页 Tab 依次为 会签闸口/不良品委托单/报工/操作日志/电子表单；点击电子表单渲染表单卡片。
- 方案 D：已开委托单的后续阶段详情页默认落「电子表单」，早期状态默认「会签闸口」。

### Commit
- `feat(control): 详情页新增电子表单 Tab + 方案 D 按状态自动定位`

---

## T8 · 样式 + 打印

### Files
- `subsystems/control/frontend/css/module.css`

### Steps

文件末尾追加电子表单样式（使用共享 token，不写入 app.css）：

```css
/* 不良品委托单电子表单（Word GYS-Q2-008_01 REV_1 版式） */
.ctl-ncr-form { max-width: 960px; margin: 0 auto; background: #fff; border: 1px solid var(--line); border-radius: var(--card-radius); overflow: hidden; }
.ncr-toolbar { display: flex; justify-content: flex-end; padding: 10px 14px; border-bottom: 1px dashed var(--line); }
.ncr-head { display: flex; justify-content: space-between; align-items: flex-end; padding: 14px 16px; border-bottom: 3px solid var(--brand); background: var(--panel); }
.ncr-title { font-size: 20px; font-weight: 700; color: var(--brand); letter-spacing: 4px; }
.ncr-no { font-size: 12px; color: var(--muted); }
.ncr-sec { padding: 10px 16px 4px; font-size: 12px; font-weight: 600; color: var(--brand); background: #f8fafc; border-top: 1px solid var(--line); }
.ncr-row { display: grid; gap: 6px 10px; padding: 6px 16px; align-items: center; }
.ncr-c4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.ncr-full { grid-template-columns: 1fr; }
.ncr-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.ncr-f { font-size: 11px; color: var(--muted); }
.ncr-v { font-size: 13px; min-height: 18px; border-bottom: 1px dotted var(--line); word-break: break-word; }

/* 窄屏：电子表单单列降级 */
@media (max-width: 767px) {
  .ncr-c4 { grid-template-columns: 1fr; }
}

/* 打印：仅打印电子表单区域 */
@media print {
  body * { visibility: hidden; }
  .ctl-ncr-form, .ctl-ncr-form * { visibility: visible; }
  .ctl-ncr-form { position: absolute; left: 0; top: 0; width: 100%; border: 0; box-shadow: none; }
  .ncr-toolbar { display: none; }
  .ncr-head { border-bottom: 2px solid #000; }
  .ncr-sec { background: #eee; }
  .ncr-v { border-bottom: 1px solid #999; }
}
```

### 验证
- 电子表单在 MD 双栏居中；窄屏（<768px）`ncr-c4` 降级为单列。打印预览仅显示表单区域。

### Commit
- `style(control): 电子表单卡片样式与打印媒体查询`

---

## T9 · bundle 重建 + 版本号

### Files
- `tools/bundle-sources.json`
- `tools/build-bundles.js`
- `subsystems/control/frontend/js/bundle.js`（由构建生成）
- `subsystems/control/frontend/index.html`

### Steps

**9.1** `tools/bundle-sources.json` 的 `control` 数组，在 `views/ncr-form.js` 之后、`views/detail.js` 之前插入新文件：

```json
    "subsystems/control/frontend/js/views/ncr-form.js",
    "subsystems/control/frontend/js/views/ncr-form-view.js",
    "subsystems/control/frontend/js/views/detail.js",
```

**9.2** 构建并复制：

```bash
node tools/build-bundles.js
sudo cp /tmp/bundle-control.js subsystems/control/frontend/js/bundle.js
```

**9.3** 从 `tools/.bundle-ver` 读取版本号，更新 `frontend/index.html` 的 `<script>` 引用：

```html
<script src="/subsystems/control/frontend/js/bundle.js?v=<新版本>" defer></script>
```

（构建脚本会打印 `VER=...`，如 `bxxxxxx`。）

### 验证
- `bundle.js` 含 `renderNcrFormTab`；index.html 版本号与 `.bundle-ver` 一致。刷新管制子系统页面，电子表单 Tab 正常。

### Commit
- `chore(control): 重建 bundle 并更新版本号`

> 本迭代实际版本号：`bmtb0zgew`（index.html 与 `.bundle-ver` 一致）。

---

## 综合验证清单

- [x] 迁移幂等：重启无重复列报错，`SHOW COLUMNS` 含 7 新列。
- [x] 建单录入「客户/不良原因 5 分项」落库成功。
- [x] 草稿编辑回写「客户/不良原因分项」成功。
- [x] 处理方式会签录「包装SOP编号」落库成功。
- [x] 电子表单 Tab 各栏位齐全、值正确（有/无报工子表两条路径）。
- [x] 打印按钮：打印预览仅显示表单区域。
- [x] 断点：桌面居中，窄屏不破版。
- [x] 文件容量红线：`detail.js` 达 300 行 / 顶层函数 10 个（已近预警，建议后续拆分 detail-card.js / detail-tabs.js）；电子表单逻辑在独立 `ncr-form-view.js`（2 顶层函数）。
- [x] bundle 版本号一致（`bmtb0zgew`）。
- [x] 子系统隔离：样品/治具/工作台页面无变化（共享文件仅 `db/migrations.js` 追加迁移函数，不影响其他子系统建表）。
- [x] 方案 D：详情页按状态自动定位「电子表单」/「会签闸口」Tab。

## 部署与回滚

- 部署：改代码 → `node tools/build-bundles.js` + 复制 bundle + 更新版本号 → 运维宝塔重启（AI 不得自动重启，按 AGENTS.md §23）。
- 回滚：`git revert` 本迭代；7 列均可空，无需数据回滚。已写值须人工清理（可选 `ALTER TABLE control_orders DROP COLUMN`）。

---

## 附录：方案 D 变更记录（2026-08-27 追加）

在 T7 完成后追加需求：用户提出「管制单列表直接转跳委托单的电子表单」方案对比。经评估，**现状（先到详情页，再按状态定位 Tab）更合理**——电子表单是「内容维度」而非流程主体，直接跳转会层级倒挂且数据重复；故采用折中方案 D。具体：

- **目标**：满足用户「少点一步」诉求——打开详情页时默认落到与当前进度最相关的 Tab。
- **实现**：`renderDetailBody()` 开头按 `o.status` 设置 `_ctlDetailTab`；`_CTL_FORM_STATES` 覆盖已开委托单的后续阶段 → 默认「电子表单」；其余早期状态 → 默认「会签闸口」。
- **状态**：已落地并验证（用户确认已实现效果）。
- **遗留提醒**：detail.js 达 300 行、顶层函数触顶 10 个，后续建议拆分 `detail-card.js` / `detail-tabs.js`；routes-orders.js 314 行超 70% 预警线，建议后续拆分。
