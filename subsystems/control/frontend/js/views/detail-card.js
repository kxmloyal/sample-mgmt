// subsystems/control/frontend/js/views/detail-card.js — 管制单详情·数据入口与主卡渲染
// 数据：GET /api/control/orders/:id 返回「主单字段平铺 + signs + ncrLogs + reworkLogs + logs」。
// 注意：progress.js 的 controlRenderProgress/controlRenderStageCards 期望 agg = { order, signs, ncrLogs, reworkLogs }，
// 故此处将平铺响应再包一层 order（复用 progress 派生逻辑，勿重复实现）。
// 职责：详情加载（renderDetail）+ 主单字段卡/11步进度/5阶段卡/操作按钮渲染。
// 拆分来源：原 detail.js（主卡与入口部分）；Tab 相关见 detail-tabs.js，模态提交见 detail-modal.js。

var _ctlDetailId = null;      // 当前详情单 id
var _ctlDetailTab = 'sign';   // 当前 Tab：sign/ncr/rework/logs/form
var _ctlDetail = null;        // 详情平铺响应
var _ctlDetailAgg = null;     // 包装后的聚合 { order, signs, ncrLogs, reworkLogs }
var _ctlModal = { kind: null, action: null, node: null }; // 当前模态上下文
// 方案 D：已开委托单的后续阶段，详情页默认定位「电子表单」Tab；其余默认「会签闸口」
var _CTL_FORM_STATES = ['NCR_DONE', 'DISPOSAL_SIGNING', 'REWORK_OPENED', 'REWORKING', 'REWORK_REPORTED', 'REIN_STOCK', 'SHIPPED'];

async function renderDetail(id) {
  var view = $('#view');
  var oid = Number(id) || Number(currentControlId);
  if (!oid) { view.innerHTML = '<div class="empty"><p>请先从管制单列表选择一张单据</p><button class="btn primary" onclick="location.hash=\'#/orders\'">去管制单列表</button></div>'; return; }
  _ctlDetailId = oid;
  view.innerHTML = '<div class="empty">加载中...</div>';
  try {
    var res = await api('GET', '/api/control/orders/' + oid);
    _ctlDetail = res;
    renderDetailBody();
  } catch (err) {
    view.innerHTML = '<div class="empty">详情加载失败：' + e(err.message) + '</div>';
  }
}

function renderDetailBody() {
  var o = _ctlDetail, view = $('#view');
  if (!o) return;
  // 方案 D：按状态自动定位 Tab —— 已开委托单的后续阶段默认「电子表单」，其余默认「会签闸口」
  _ctlDetailTab = (_CTL_FORM_STATES.indexOf(o.status) >= 0) ? 'form' : 'sign';
  _ctlDetailAgg = { order: o, signs: o.signs || [], ncrLogs: o.ncrLogs || [], reworkLogs: o.reworkLogs || [] };
  view.innerHTML = ctlCardHtml(_ctlDetailAgg)
    + '<div class="ctl-sec">明细记录</div><div class="card">'
    + '<div class="detail-tabs" id="ctl-tabbar">' + ctlTabBarHTML() + '</div>'
    + '<div id="ctl-tab-body"></div></div>';
  ctlRenderTab();
  // 从聚合页行跳来：自动切到「不良品委托单」Tab 并展开高亮目标卡（极小接线）
  if (currentFocusNcr) { ctlSwitchTab('ncr'); ctlFocusNcrCard(currentFocusNcr); }
}

/** 主单字段分组卡片网格（仿样品/治具 overview-cards，横向铺满） */
function ctlFieldGrid(o) {
  var groups = [
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
    ['执行结果', [
      ['良品数', o.good_qty], ['不良数', o.ng_qty], ['报废数', o.scrap_qty],
      ['结余数', controlCalcRemain(o.qty, o.good_qty, o.ng_qty, o.scrap_qty)]
    ]],
    ['备注', [['管制原因', o.reason]]]
  ];
  return '<div class="overview-cards">' + groups.map(function (g) {
    return '<div class="overview-card' + (g[0] === '备注' ? ' full' : '') + '"><div class="title">' + g[0]
      + '</div><div class="field-grid">' + g[1].map(function (f) { return _ctlUtil.kv(f[0], f[1]); }).join('') + '</div></div>';
  }).join('') + '</div>';
}

/** 主卡：单号/状态 + 字段 + 11步进度 + 5阶段卡 + 操作按钮 */
function ctlCardHtml(agg) {
  var o = agg.order;
  return '<div class="card"><div class="ctl-carat"><span class="mono">' + e(o.order_no) + '</span> '
    + statusBadge(o) + '</div>' + ctlFieldGrid(o)
    + '<div class="ctl-sec">流程进度</div>' + controlRenderProgress(agg)
    + '<div class="ctl-sec">阶段</div><div class="ctl-stage-grid">' + controlRenderStageCards(agg) + '</div>'
    + '<div class="ctl-sec">操作</div><div class="ctl-actions">' + ctlActionButtons(o) + '</div>'
    + ctlLabelBtn(o) + '</div>';
}

/** 可执行流转按钮（含作废，仅 ADMIN），点击统一走 ctlOpen('trans'/'void') */
function ctlActionButtons(o) {
  var ts = controlTransitionsOf(o.status, me.role);
  var btns = ts.map(function (t) {
    return '<button class="btn primary" onclick="ctlOpen(\'trans\',\'' + t.action + '\')">' + e(t.label) + '</button>';
  }).join('');
  if (me.role === 'ADMIN' && o.status !== 'SHIPPED' && o.status !== 'RETIRED') {
    btns += '<button class="btn danger" onclick="ctlOpen(\'void\')">作废</button>';
  }
  return btns || '<span class="muted">当前状态/角色无可执行操作</span>';
}

/** 已贴标签（label_no 已生成）时显示「查看管制标签」按钮，跳标签打印视图 */
function ctlLabelBtn(o) {
  if (!o.label_no) return '';
  return '<div style="margin-top:8px"><button class="btn" onclick="location.hash=\'#/label?id=' + o.id + '\'">🖨 查看管制标签</button></div>';
}
