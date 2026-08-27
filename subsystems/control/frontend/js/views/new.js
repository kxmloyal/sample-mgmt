// subsystems/control/frontend/js/views/new.js — 新建管制申请
// 表单字段与后端 POST /api/control/orders 校验对齐（part_no/part_name/qty/bad_type/reason 必填）。
// 成功后跳转详情页（返回值 id），防重复提交：提交中禁用按钮 + _ctlNewSubmitting 标志位拦截。

function renderNew() {
  var view = $('#view');
  var badOpts = ['<fluent-option value="">请选择不良类型</fluent-option>']
    .concat(CONTROL_BAD_TYPES.map(function (b) { return '<fluent-option value="' + b + '">' + b + '</fluent-option>'; })).join('');
  var deptOpts = ['<fluent-option value="">请选择申请部门</fluent-option>']
    .concat(CONTROL_DEPTS.map(function (d) { return '<fluent-option value="' + d + '">' + d + '</fluent-option>'; })).join('');
  view.innerHTML = '<div class="card" style="max-width:760px">'
    + '<div class="nf-grid">'
    + '<div><label>料号 *</label><fluent-text-field id="n-part_no" placeholder="如 SN-1001" required></fluent-text-field></div>'
    + '<div><label>品名 *</label><fluent-text-field id="n-part_name" placeholder="不良品名称" required></fluent-text-field></div>'
    + '<div><label>销货单号</label><fluent-text-field id="n-sales_no" placeholder="可选"></fluent-text-field></div>'
    + '<div><label>机型</label><fluent-text-field id="n-model" placeholder="可选"></fluent-text-field></div>'
    + '<div><label>数量 *</label><fluent-text-field id="n-qty" type="number" min="1" placeholder="如 100" required></fluent-text-field></div>'
    + '<div><label>不良类型 *</label><fluent-select id="n-bad_type" required>' + badOpts + '</fluent-select></div>'
    + '<div><label>申请部门</label><fluent-select id="n-apply_dept">' + deptOpts + '</fluent-select></div>'
    + '<div><label>喷码日期</label><fluent-text-field id="n-spray_date" placeholder="可选"></fluent-text-field></div>'
    + '<div><label>客户</label><fluent-text-field id="n-customer" placeholder="可选"></fluent-text-field></div>'
    + '<div class="nf-full"><label>管制/不良原因 *</label><textarea id="n-reason" rows="3" placeholder="描述不良现象、数量、批次等" required></textarea></div>'
    + '<div class="nf-full"><label>不良原因分析·外观</label><textarea id="n-bad_appearance" rows="2" placeholder="可选，外观缺陷描述"></textarea></div>'
    + '<div class="nf-full"><label>不良原因分析·功能</label><textarea id="n-bad_function" rows="2" placeholder="可选，功能异常描述"></textarea></div>'
    + '<div class="nf-full"><label>不良原因分析·尺寸</label><textarea id="n-bad_size" rows="2" placeholder="可选，尺寸超差描述"></textarea></div>'
    + '<div class="nf-full"><label>不良原因分析·设变</label><textarea id="n-bad_change" rows="2" placeholder="可选，设变描述"></textarea></div>'
    + '<div class="nf-full"><label>不良原因分析·其他</label><textarea id="n-bad_other" rows="2" placeholder="可选"></textarea></div>'
    + '</div>'
    + '<div class="nf-actions">'
    + '<span id="n-msg" class="muted"></span>'
    + '<fluent-button id="n-submit" appearance="accent" onclick="submitNewOrder()">创建管制申请</fluent-button>'
    + '</div></div>';
}

// 防重复提交：连续点击确认只会创建一次（提交中禁用按钮 + 标志位拦截）
var _ctlNewSubmitting = false;
async function submitNewOrder() {
  if (_ctlNewSubmitting) return;
  _ctlNewSubmitting = true;
  var btn = $('#n-submit');
  if (btn) btn.disabled = true;
  var msg = $('#n-msg');
  if (msg) msg.textContent = '';
  try {
    var payload = {
      part_no: $('#n-part_no').value,
      part_name: $('#n-part_name').value,
      sales_no: $('#n-sales_no').value,
      model: $('#n-model').value,
      qty: Number($('#n-qty').value),
      bad_type: $('#n-bad_type').value,
      reason: $('#n-reason').value,
      spray_date: $('#n-spray_date').value,
      customer: $('#n-customer').value,
      bad_appearance: $('#n-bad_appearance').value,
      bad_function: $('#n-bad_function').value,
      bad_size: $('#n-bad_size').value,
      bad_change: $('#n-bad_change').value,
      bad_other: $('#n-bad_other').value,
      apply_dept: $('#n-apply_dept').value
    };
    var err = ctlValidateNew(payload);
    if (err) throw new Error(err);
    var s = await api('POST', '/api/control/orders', payload);
    toast('已创建管制申请单 ' + (s.order_no || ''), 'ok');
    location.hash = '#/detail?id=' + s.id;
  } catch (e) {
    if (msg) msg.textContent = e.message;
  } finally {
    _ctlNewSubmitting = false;
    if (btn) btn.disabled = false;
  }
}

/** 客户端校验（与后端一致），返回错误文案或空串 */
function ctlValidateNew(p) {
  if (!p.part_no) return '请填写料号';
  if (!p.part_name) return '请填写品名';
  if (!p.qty || p.qty <= 0) return '请填写有效数量';
  if (!p.bad_type) return '请选择不良类型';
  if (!p.reason) return '请填写管制/不良原因';
  return '';
}
