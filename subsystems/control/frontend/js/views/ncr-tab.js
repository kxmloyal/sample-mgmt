// subsystems/control/frontend/js/views/ncr-tab.js — 不良品委托单明细「可展开记录卡」
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.2
// 数据源：_ctlDetailAgg.ncrLogs（每条含 ncr_no/inspect_dept/handle_dept/form_template/created_by_name/created_at）
// 展示：<details>/<summary> 展开卡，呈现比纯表格更全的字段；创建人姓名来自后端 users 左连返回的 created_by_name
function renderNcrTab(rows) {
  if (!rows || !rows.length) return '<div class="empty">暂无不良品委托单</div>';
  return '<div class="ncr-list">' + rows.map(function (n) {
    return '<details class="ncr-item"><summary>'
      + '<span class="ncr-no mono">' + e(n.ncr_no || '—') + '</span>'
      + '<span class="ncr-route">' + e(n.inspect_dept || '—') + ' → ' + e(n.handle_dept || '—') + '</span>'
      + '<span class="ncr-time mono">' + fmtTime(n.created_at) + '</span></summary>'
      + '<div class="ncr-detail field-grid">'
      + '<span class="label">委托单号</span><span>' + e(n.ncr_no || '—') + '</span>'
      + '<span class="label">检验部门</span><span>' + e(n.inspect_dept || '—') + '</span>'
      + '<span class="label">处理部门</span><span>' + e(n.handle_dept || '—') + '</span>'
      + '<span class="label">表单版本</span><span>' + e(n.form_template || '—') + '</span>'
      + '<span class="label">创建人</span><span>' + e(n.created_by_name || '—') + '</span>'
      + '<span class="label">创建时间</span><span>' + fmtTime(n.created_at) + '</span>'
      + '</div>'
      + '<div class="ncr-foot"><a href="#/ncr?ncr_no=' + encodeURIComponent(n.ncr_no || '') + '">在委托单列表查看</a></div>'
      + '</details>';
  }).join('') + '</div>';
}

/** 定位并展开/高亮目标委托单卡（聚合页行点击跳详情 focusNcr 用）：命中返回 true，并滚动到可视区 */
function ctlFocusNcrCard(ncrNo) {
  if (!ncrNo) return false;
  var target = null;
  document.querySelectorAll('#ctl-tab-body .ncr-item').forEach(function (d) {
    var no = d.querySelector('.ncr-no');
    var hit = no && no.textContent.trim() === String(ncrNo);
    d.classList.toggle('ncr-focus', !!hit);
    if (hit) { d.open = true; target = d; }
  });
  if (target && target.scrollIntoView) { try { target.scrollIntoView({ block: 'center' }); } catch (e) {} }
  return !!target;
}
