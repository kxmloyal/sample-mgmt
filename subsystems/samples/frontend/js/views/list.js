// samples.js — 样品列表：状态管理、导航、删除
// 渲染逻辑 → sample-list-render.js | 筛选逻辑 → sample-filter.js

/** 样品类型标签（OK/NG） */
function sampleTypeLabel(v) { return v==='OK'?'OK样品':v==='NG'?'NG样品':v; }

var _debounceTimer = null;
var _quickFilterType = null;  // pending|overdue|soon，快捷筛选状态
var samplePager = { limit: 20, offset: 0, total: 0 };
var _sampleBuildParams = null;
var _sampleIsOverdue = false;

function debounceSearch() { clearTimeout(_debounceTimer); _debounceTimer = setTimeout(loadSamples, 300); }

async function viewSamples() {
  var v = $('#view');
  var modelOpts = '<fluent-option value="">全部机型</fluent-option>';
  try {
    (await api('GET', '/api/samples/model-options')).forEach(function (o) { modelOpts += '<fluent-option value="' + e(o.value) + '">' + e(o.label) + '</fluent-option>'; });
  } catch (_) {}
  var stOpts = '<fluent-option value="">全部状态</fluent-option><fluent-option value="NEW">待制作</fluent-option><fluent-option value="PRODUCED">制作完成</fluent-option><fluent-option value="RELEASED">已发行</fluent-option><fluent-option value="IN_CUSTODY">保管中</fluent-option><fluent-option value="RETURNING">退回审核中</fluent-option><fluent-option value="RETIRED">已作废</fluent-option>';
  var deptOpts = '<fluent-option value="">保管部门</fluent-option>' + (typeof DEPTS !== 'undefined' ? DEPTS : ['研发部','品保文管中心','制造部','FQC','生技部','项目部','系统']).map(function(d) { return '<fluent-option value="' + d + '">' + d + '</fluent-option>'; }).join('');
  var sortOpts = '<fluent-option value="">排序：最新优先</fluent-option><fluent-option value="created_at">最早优先</fluent-option><fluent-option value="sample_no">编号升序</fluent-option><fluent-option value="-sample_no">编号降序</fluent-option>';
  v.innerHTML = '<div class="filters"><fluent-text-field id="f-q" placeholder="搜索编号/名称/规格" oninput="debounceSearch()"></fluent-text-field>' +
    '<fluent-select id="f-status" onchange="loadSamples()">' + stOpts + '</fluent-select>' +
    '<fluent-select id="f-dept" onchange="loadSamples()">' + deptOpts + '</fluent-select>' +
    '<fluent-select id="f-type" onchange="loadSamples()"><fluent-option value="">全部类型</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>' +
    '<fluent-select id="f-limit-item" onchange="loadSamples()"><fluent-option value="">全部项目</fluent-option>' + (typeof LIMIT_ITEMS !== 'undefined' ? LIMIT_ITEMS : []).map(function(x) { return '<fluent-option value="' + x.code + '">' + x.label + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<fluent-select id="f-source" onchange="loadSamples()"><fluent-option value="">全部来源</fluent-option><fluent-option value="C">客供</fluent-option><fluent-option value="T">元山</fluent-option><fluent-option value="G">塔岗</fluent-option></fluent-select>' +
    '<fluent-select id="f-model" onchange="loadSamples()">' + modelOpts + '</fluent-select>' +
    '<fluent-select id="f-sort" onchange="loadSamples()">' + sortOpts + '</fluent-select>' +
    '<fluent-button appearance="accent" size="small" onclick="loadSamples()">查询</fluent-button></div>' +
    '<div class="filters" style="margin-bottom:14px;align-items:center">' +
    '<span style="font-size:12px;color:var(--muted)">快捷：</span>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'pending\')">待处理</a>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'overdue\')">逾期</a>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'soon\')">近7天</a>' +
    '<span id="f-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:10px"></span></div>' +
    '<div id="s-list"></div>';
  var stMatch = location.hash.match(/[?&]status=([^&]+)/);
  if (stMatch) { var stBox = $('#f-status'); if (stBox) stBox.value = decodeURIComponent(stMatch[1]); loadSamplesWithStatus(decodeURIComponent(stMatch[1])); }
  else loadSamples();
}

async function loadSamples() {
  _quickFilterType = null;
  _sampleIsOverdue = false;
  _sampleBuildParams = function() { return _buildQueryParams(''); };
  _fetchSamplePage(true);
}

async function deleteSample(id) {
  if (!confirm('确认取消该样品？此操作不可撤销，将同时删除关联日志。')) return;
  try {
    await api('DELETE', '/api/samples/' + id);
    toast('样品已取消', 'ok');
    loadSamples();
  } catch (e) { toast(e.message, 'err'); }
}
