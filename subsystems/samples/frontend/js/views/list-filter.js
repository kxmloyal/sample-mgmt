// sample-filter.js — 样品筛选、chips、快捷过滤
// 依赖：_quickFilterType/_sampleIsOverdue/_sampleBuildParams (samples.js), _fetchSamplePage/goSamplePage (sample-list-render.js)

/** 从当前筛选控件值构建查询参数字符串 */
function _buildQueryParams(baseParams) {
  var q = $('#f-q').value, dept = $('#f-dept').value, sort = $('#f-sort').value;
  var tp = $('#f-type').value, li = $('#f-limit-item').value, src = $('#f-source').value;
  var mo = $('#f-model').value;
  var p = baseParams || '';
  if (q) p += '&q=' + encodeURIComponent(q);
  if (dept) p += '&dept=' + encodeURIComponent(dept);
  if (sort) p += '&sort=' + sort;
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
    var st = me.role === 'RD' ? 'NEW' : me.role === 'QA' ? 'PRODUCED,RETURNING' : (me.role === 'CUSTODY' || me.role === 'ME') ? 'RELEASED' : '';
    $('#f-status').value = ''; $('#f-dept').value = '';
    loadSamplesWithStatus(st);
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
  var stLabels = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已作废' };
  if (st) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-status\').value=\'\';loadSamples()">' + (stLabels[st] || st) + ' ✕</span>';
  if (dept) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-dept\').value=\'\';loadSamples()">' + dept + ' ✕</span>';
  if (tp) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-type\').value=\'\';loadSamples()">' + sampleTypeLabel(tp) + ' ✕</span>';
  if (li) { var liLabel = (LIMIT_ITEMS.find(function(x) { return x.code === li; }) || {}).label || li; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-limit-item\').value=\'\';loadSamples()">' + liLabel + ' ✕</span>'; }
  if (src) { var srcLabel = { C: '客供', T: '元山', G: '塔岗' }[src] || src; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-source\').value=\'\';loadSamples()">' + srcLabel + ' ✕</span>'; }
  if (mo) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-model\').value=\'\';loadSamples()">机型 ' + e(mo) + ' ✕</span>';
  if (sort) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-sort\').value=\'\';loadSamples()">排序 ✕</span>';
  if (_quickFilterType === 'pending') html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">待处理 ✕</span>';
  if (_quickFilterType === 'overdue') html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">逾期 ✕</span>';
  if (_quickFilterType === 'soon') html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">近7天 ✕</span>';
  chips.innerHTML = html;
}

function clearQuickFilter() {
  _quickFilterType = null;
  $('#f-status').value = ''; $('#f-dept').value = '';
  loadSamples();
}
