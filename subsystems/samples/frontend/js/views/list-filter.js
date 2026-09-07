// sample-filter.js — 样品筛选、chips、快捷过滤
// 2026-09-05 角色化：新增快捷筛选 保管中(custody)/超时未还(checkout_overdue)/我建的(mine)/本部门(dept)；ADMIN 待处理改真实口径
// 依赖：_quickFilterType/_sampleIsOverdue/_sampleBuildParams (samples.js), _fetchSamplePage/goSamplePage (sample-list-render.js)

/** 从当前筛选控件值构建查询参数字符串（含状态 f-status；修复状态下拉筛选/导出不携带 status 的既有缺陷） */
function _buildQueryParams(baseParams) {
  var q = $('#f-q').value, dept = $('#f-dept').value, sort = $('#f-sort').value;
  var st = $('#f-status').value;
  var tp = $('#f-type').value, li = $('#f-limit-item').value, src = $('#f-source').value;
  var mo = $('#f-model').value;
  var p = baseParams || '';
  if (q) p += '&q=' + encodeURIComponent(q);
  if (dept) p += '&dept=' + encodeURIComponent(dept);
  if (sort) p += '&sort=' + sort;
  if (st && p.indexOf('status=') === -1) p += '&status=' + st;
  if (tp) p += '&sample_type=' + tp;
  if (li) p += '&limit_item=' + li;
  if (src) p += '&source_type=' + src;
  if (mo) p += '&model=' + encodeURIComponent(mo);
  return p;
}

function loadSamplesWithStatus(statusStr) {
  _sampleIsOverdue = false;
  _sampleBuildParams = function() { return _buildQueryParams('status=' + statusStr); };
  _fetchSamplePage(true);
}

function quickFilter(type) {
  _quickFilterType = type;
  if (type === 'pending') {
    // ADMIN 真实口径：全部待办态（2026-09-05 修正，原为空串=全量误导）
    var st = me.role === 'RD' ? 'NEW' : me.role === 'QA' ? 'PRODUCED,RETURNING' : (me.role === 'CUSTODY' || me.role === 'ME') ? 'RELEASED' : 'NEW,PRODUCED,RELEASED,RETURNING';
    $('#f-status').value = ''; $('#f-dept').value = '';
    loadSamplesWithStatus(st);
    return;
  }
  if (type === 'custody') { $('#f-status').value = 'IN_CUSTODY'; loadSamplesWithStatus('IN_CUSTODY'); return; }
  if (type === 'checkout_overdue') {
    _sampleIsOverdue = false;
    $('#f-status').value = ''; $('#f-dept').value = '';
    _sampleBuildParams = function() { return _buildQueryParams('checkout_overdue=1'); };
    _fetchSamplePage(true);
    return;
  }
  if (type === 'mine') {
    _sampleIsOverdue = false;
    _sampleBuildParams = function() { return _buildQueryParams('mine=1&sort=mine'); };
    _fetchSamplePage(true);
    return;
  }
  if (type === 'dept') {
    if (!me.dept) { toast('当前账号未配置部门', 'err'); return; }
    $('#f-dept').value = me.dept; $('#f-status').value = '';
    _sampleIsOverdue = false;
    _sampleBuildParams = function() { return _buildQueryParams('dept=' + encodeURIComponent(me.dept)); };
    _fetchSamplePage(true);
    return;
  }
  if (type === 'overdue') { loadSamplesOverdue('1'); return; }
  if (type === 'soon') { loadSamplesOverdue('7'); return; }
}

function loadSamplesOverdue(v) {
  _quickFilterType = v === '1' ? 'overdue' : 'soon';
  _sampleIsOverdue = true;
  $('#f-status').value = ''; $('#f-dept').value = '';
  _sampleBuildParams = function() { return _buildQueryParams('overdue=' + v); };
  _fetchSamplePage(true);
}

function renderChips() {
  var chips = $('#f-chips'); if (!chips) return;
  var html = '', st = $('#f-status').value, dept = $('#f-dept').value, sort = $('#f-sort').value;
  var tp = $('#f-type').value, li = $('#f-limit-item').value, src = $('#f-source').value;
  var mo = $('#f-model').value;
  var stLabels = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中', RETIRED: '已作废' };
  if (st) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-status\').value=\'\';loadSamples()">' + e(stLabels[st] || st) + ' ✕</span>';
  if (dept) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-dept\').value=\'\';loadSamples()">' + e(dept) + ' ✕</span>';
  if (tp) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-type\').value=\'\';loadSamples()">' + e(sampleTypeLabel(tp)) + ' ✕</span>';
  if (li) { var liLabel = (LIMIT_ITEMS.find(function(x) { return x.code === li; }) || {}).label || li; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-limit-item\').value=\'\';loadSamples()">' + e(liLabel) + ' ✕</span>'; }
  if (src) { var srcLabel = { C: '客供', T: '元山', G: '塔岗' }[src] || src; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-source\').value=\'\';loadSamples()">' + e(srcLabel) + ' ✕</span>'; }
  if (mo) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-model\').value=\'\';loadSamples()">机型 ' + e(mo) + ' ✕</span>';
  if (sort && sort !== 'mine' && sort !== 'inspect' && sort !== 'status') html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-sort\').value=\'\';loadSamples()">排序 ✕</span>';
  var quickLabels = { pending: '待处理', overdue: '逾期', soon: '近7天', custody: '保管中', checkout_overdue: '超时未还', mine: '我建的', dept: '本部门' };
  if (_quickFilterType && quickLabels[_quickFilterType]) html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">' + quickLabels[_quickFilterType] + ' ✕</span>';
  chips.innerHTML = html;
}

function clearQuickFilter() {
  _quickFilterType = null;
  $('#f-status').value = ''; $('#f-dept').value = '';
  loadSamples();
}
