// sample-filter.js — 样品筛选、chips、快捷过滤
// 依赖：_quickFilterType/_sampleIsOverdue/_sampleBuildParams (samples.js), _fetchSamplePage/goSamplePage (sample-list-render.js)
// 2026-09-07 排序版：角色置顶由后端 scope=role 派生排序实现，本文件无角色范围逻辑（仅保留 _roleStatusLabel 供多状态芯片显示）

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

/** 状态值（可含逗号多值）→ 中文标签串（2026-09-07：多状态/角色默认共用） */
function _roleStatusLabel(v) {
  var M = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中', RETIRED: '已作废' };
  return String(v || '').split(',').map(function (s) { return M[s] || s; }).join('、');
}

function loadSamplesWithStatus(statusStr) {
  _sampleIsOverdue = false;
  _sampleBuildParams = function() { return _buildQueryParams(statusStr ? 'status=' + statusStr : ''); };
  _fetchSamplePage(true);
}

function quickFilter(type) {
  _quickFilterType = type;
  _roleScopeApplied = false; // 用户主动点快捷筛选 = 明确意图，覆盖角色范围
  if (type === 'pending') {
    // 2026-09-08：pending=role 交由服务端按会话角色派生待办条件（与看板「我的待办」同口径，单一事实来源）；
    // 修复历史缺陷：RD 旧实现仅 status=NEW，漏掉「指派给我的退回重做」；ADMIN 无角色待办语义（入口已隐藏，防御性回退全量）
    if (me.role === 'ADMIN') { loadSamples(); return; }
    _sampleIsOverdue = false;
    _sampleBuildParams = function() { return _buildQueryParams('pending=role'); };
    _fetchSamplePage(true);
    return;
  }
  if (type === 'overdue') { loadSamplesOverdue('1'); return; }
  if (type === 'soon') { loadSamplesOverdue('7'); return; }
}

function loadSamplesOverdue(v) {
  _quickFilterType = v === '1' ? 'overdue' : 'soon';
  _sampleIsOverdue = true;
  _roleScopeApplied = false;
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
  if (st) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-status\').value=\'\';loadSamples()">' + e(stLabels[st] || _roleStatusLabel(st)) + ' ✕</span>';
  if (dept) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-dept\').value=\'\';loadSamples()">' + e(dept) + ' ✕</span>';
  if (tp) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-type\').value=\'\';loadSamples()">' + e(sampleTypeLabel(tp)) + ' ✕</span>';
  if (li) { var liLabel = (LIMIT_ITEMS.find(function(x) { return x.code === li; }) || {}).label || li; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-limit-item\').value=\'\';loadSamples()">' + e(liLabel) + ' ✕</span>'; }
  if (src) { var srcLabel = { C: '客供', T: '元山', G: '塔岗' }[src] || src; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-source\').value=\'\';loadSamples()">' + e(srcLabel) + ' ✕</span>'; }
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
