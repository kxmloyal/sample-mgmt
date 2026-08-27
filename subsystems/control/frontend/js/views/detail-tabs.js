// subsystems/control/frontend/js/views/detail-tabs.js — 管制单详情·明细 Tab 渲染与切换
// 职责：Tab 栏（会签闸口/不良品委托单/报工/操作日志/电子表单）渲染、Tab 内容渲染与切换。
// 数据源：_ctlDetailAgg（signs/ncrLogs/reworkLogs）与 _ctlDetail.logs；
//         会签/流转/追加委托单/报工/作废统一经 detail-modal.js 的 ctlOpen→ctlSubmit 提交。
// 拆分来源：原 detail.js（_ctlTabSheet + ctlTabBarHTML + ctlRenderTab + ctlSwitchTab）。

// 各明细 Tab 渲染函数（sign/ncr/rework/logs/form）
var _ctlTabSheet = {
  sign: function () {
    return CONTROL_SIGN_NODES.map(function (node) {
      var nodeSigns = (_ctlDetailAgg.signs || []).filter(function (s) { return s.node_key === node.node_key; });
      var steps = node.steps.map(function (st) {
        var rec = nodeSigns.find(function (s) { return s.seq === st.seq; });
        return '<div class="ctl-sign"><span class="sign-seq">' + st.seq + '</span>'
          + '<span class="sign-name">' + st.dept + '</span><span class="sign-dept">(' + st.role + ')</span>'
          + (rec ? _ctlUtil.signState(rec) : '<span class="sign-state muted">待签</span>') + '</div>';
      }).join('');
      var btn = _ctlUtil.canSign(node) ? '<button class="btn primary" onclick="ctlOpen(\'sign\',\'' + node.node_key + '\')">去会签</button>' : '';
      return '<div class="ctl-sec">' + node.node_name + '</div><div class="card">' + steps
        + (btn ? '<div style="margin-top:10px">' + btn + '</div>' : '') + '</div>';
    }).join('');
  },
  ncr: function () {
    return renderNcrTab((_ctlDetailAgg && _ctlDetailAgg.ncrLogs) || []);
  },
  rework: function () {
    var rows = _ctlDetailAgg.reworkLogs || [];
    if (!rows.length) return '<div class="empty">暂无报工记录</div>';
    return '<table class="grid"><thead><tr><th>报工日期</th><th>良品</th><th>不良</th><th>报废</th><th>报废原因</th><th>批次号</th><th>包装称重</th><th>确认人</th><th>数量一致</th><th>操作人</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><td class="mono">' + fmtTime(r.work_date) + '</td><td>' + (r.good_qty || 0) + '</td>'
          + '<td>' + (r.ng_qty || 0) + '</td><td>' + (r.scrap_qty || 0) + '</td>'
          + '<td class="muted">' + e(r.scrap_reason || '—') + '</td>'
          + '<td class="muted">' + e(r.batch_no || '—') + '</td><td class="muted">' + e(r.pack_record || '—') + '</td>'
          + '<td class="muted">' + e(r.confirm_by || '—') + '</td><td>' + (r.qty_consistent ? '是' : '否') + '</td>'
          + '<td>' + e(r.operator_name || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  },
  logs: function () {
    var rows = (_ctlDetail && _ctlDetail.logs) || [];
    if (!rows.length) return '<div class="empty">暂无日志</div>';
    return '<table class="grid"><thead><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>备注</th></tr></thead><tbody>'
      + rows.map(function (l) {
        return '<tr><td class="mono">' + fmtTime(l.created_at) + '</td>'
          + '<td>' + e(CONTROL_ACTION_CN[l.action] || l.action) + '</td>'
          + '<td class="muted">' + e(l.role || '—') + '/' + e(l.dept || '—') + '</td>'
          + '<td class="muted">' + e(l.comment || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  },
  form: function () {
    return renderNcrFormTab();
  }
};

function ctlTabBarHTML() {
  var tabs = [['sign', '会签闸口'], ['ncr', '不良品委托单'], ['rework', '报工'], ['logs', '操作日志'], ['form', '电子表单']];
  return tabs.map(function (t) {
    return '<div class="detail-tab ' + (_ctlDetailTab === t[0] ? 'active' : '') + '" onclick="ctlSwitchTab(\'' + t[0] + '\')">' + t[1] + '</div>';
  }).join('');
}

function ctlRenderTab() {
  var body = $('#ctl-tab-body');
  if (!body) return;
  var pad = _ctlDetailTab === 'sign' ? '' : '<div class="ctl-tab-pad">';
  body.innerHTML = pad + (_ctlTabSheet[_ctlDetailTab] ? _ctlTabSheet[_ctlDetailTab]() : '<div class="empty">无内容</div>') + (pad ? '</div>' : '');
}

function ctlSwitchTab(tab) {
  _ctlDetailTab = tab;
  var bar = $('#ctl-tabbar');
  if (bar) bar.innerHTML = ctlTabBarHTML();
  ctlRenderTab();
}
