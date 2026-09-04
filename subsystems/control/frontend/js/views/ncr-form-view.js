// subsystems/control/frontend/js/views/ncr-form-view.js — 不良品委托单电子表单视图
// 按 Word 表单 GYS-Q2-008_01(REV_1) 栏位渲染单张可打印表单，绑定详情页「电子表单」Tab。
// 数据源：_ctlDetailAgg（主单 + ncrLogs + reworkLogs，仅在 detail.js 生命周期内调用）。
// 无数据时渲染「暂无电子表单数据」占位；使用全局 e / fmtTime。

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
    + '<div class="ncr-head"><div class="ncr-title">不良品委托检验单</div>'
    // 2026-09-04：无纸化流转要求委托单号上表单（取最新一条 NCR 记录的单号，回退主单摘要）
    + '<div class="ncr-no">委托单号：<b>' + fv((nl && nl.ncr_no) || o.ncr_no) + '</b></div>'
    + '<div class="ncr-no">表单编号：GYS-Q2-008_01 REV_1</div></div>'
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
