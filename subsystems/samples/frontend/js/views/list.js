// samples.js — 样品列表：状态管理、导航、删除
// 渲染逻辑 → sample-list-render.js | 筛选逻辑 → sample-filter.js

/** 样品类型标签（OK/NG） */
function sampleTypeLabel(v) { return v==='OK'?'OK样品':v==='NG'?'NG样品':v; }

/** 角色相关置顶（2026-09-07 排序版）：scope=role 时后端按会话角色把相关样品排前（数据全可见、无空态），默认即全量无需提示/清除 */
var _roleScopeApplied = false; // 兼容保留：标记本次进入是否带 scope（无 UI 含义）

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
  var stOpts = '<fluent-option value="">全部状态</fluent-option><fluent-option value="NEW">待制作</fluent-option><fluent-option value="PRODUCED">制作完成</fluent-option><fluent-option value="RELEASED">已发行</fluent-option><fluent-option value="IN_CUSTODY">保管中</fluent-option><fluent-option value="CHECKED_OUT">领用中</fluent-option><fluent-option value="RETURNING">退回审核中</fluent-option><fluent-option value="RETIRED">已作废</fluent-option>';
  var deptOpts = '<fluent-option value="">保管部门</fluent-option>' + (typeof DEPTS !== 'undefined' ? DEPTS : ['研发部','品保文管中心','制造部','资材部','FQC','生技部','项目部','系统']).map(function(d) { return '<fluent-option value="' + d + '">' + d + '</fluent-option>'; }).join('');
  var sortOpts = '<fluent-option value="">排序：最新优先</fluent-option><fluent-option value="created_at">最早优先</fluent-option><fluent-option value="sample_no">编号升序</fluent-option><fluent-option value="-sample_no">编号降序</fluent-option>';
  v.innerHTML = '<div class="filters"><fluent-text-field id="f-q" placeholder="搜索编号/名称/规格" oninput="debounceSearch()"></fluent-text-field>' +
    '<fluent-select id="f-status" onchange="loadSamples()">' + stOpts + '</fluent-select>' +
    '<fluent-select id="f-dept" onchange="loadSamples()">' + deptOpts + '</fluent-select>' +
    '<fluent-select id="f-type" onchange="loadSamples()"><fluent-option value="">全部类型</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>' +
    '<fluent-select id="f-limit-item" onchange="loadSamples()"><fluent-option value="">全部项目</fluent-option>' + (typeof LIMIT_ITEMS !== 'undefined' ? LIMIT_ITEMS : []).map(function(x) { return '<fluent-option value="' + x.code + '">' + x.label + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<fluent-select id="f-source" onchange="loadSamples()"><fluent-option value="">全部来源</fluent-option><fluent-option value="C">客供</fluent-option><fluent-option value="T">元山</fluent-option><fluent-option value="G">塔岗</fluent-option></fluent-select>' +
    '<fluent-select id="f-model" onchange="loadSamples()">' + modelOpts + '</fluent-select>' +
    '<fluent-select id="f-sort" onchange="loadSamples()">' + sortOpts + '</fluent-select>' +
    '<fluent-button appearance="accent" size="small" onclick="loadSamples()">查询</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="exportSamplesCsv()">导出 CSV</fluent-button>' +
    // 机型视图切换入口（hash 路由切换；勿直调 viewSampleModelWall——直调不改 hash 会导致再点导航时切换失效，治具同款坑）
    '<fluent-button appearance="neutral" size="small" onclick="location.hash=\'#/wall\'">机型视图</fluent-button></div>' +
    '<div class="filters" style="margin-bottom:14px;align-items:center">' +
    '<span style="font-size:12px;color:var(--muted)">快捷：</span>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'pending\')">待处理</a>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'overdue\')">逾期</a>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'soon\')">近7天</a>' +
    '<span id="f-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:10px"></span></div>' +
    '<div id="s-list"></div>';
  var stMatch = location.hash.match(/[?&]status=([^&]+)/);
  var moMatch = location.hash.match(/[?&]model=([^&]+)/);
  if (stMatch) { var stBox = $('#f-status'); if (stBox) stBox.value = decodeURIComponent(stMatch[1]); loadSamplesWithStatus(decodeURIComponent(stMatch[1])); }
  else if (moMatch) {
    // 机型视图深链：#/samples?model=X 预选机型下拉（fluent-select 选项异步注册，重试赋值直到生效，模式同 projects list 预选项目）
    var moVal = decodeURIComponent(moMatch[1]);
    var moSel = $('#f-model');
    var tries = 0;
    (function attempt() {
      moSel.value = moVal;
      if (moSel.value === moVal || ++tries >= 10) loadSamples();
      else setTimeout(attempt, 60);
    })();
  }
  else if (me.role !== 'ADMIN') {
    // 角色相关置顶（2026-09-07 排序版）：scope=role 由后端按会话角色把相关样品排前，其余最新跟后（数据全可见）
    _roleScopeApplied = true;
    loadSamplesWithScope();
  }
  else loadSamples();
}

/** 角色置顶加载：scope=role 交由服务端按会话角色派生排序（RD→我建的 / QA→待办+复检临期 / 保管生技→在库借出归还中 置顶） */
function loadSamplesWithScope() {
  _sampleIsOverdue = false;
  _sampleBuildParams = function() { return _buildQueryParams('scope=role'); };
  _fetchSamplePage(true);
}

async function loadSamples() {
  _quickFilterType = null;
  _roleScopeApplied = false; // 用户主动加载 = 回默认最新优先（排序置顶仅进入列表首次生效）
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

// 导出当前筛选结果 CSV（复用列表筛选参数，忽略分页；AGENTS.md §21 列表导出标准）
function exportSamplesCsv() {
  var qs = (_sampleBuildParams ? _sampleBuildParams() : _buildQueryParams('')).replace(/^&/, '');
  location.href = '/api/samples/export' + (qs ? '?' + qs : '');
}
