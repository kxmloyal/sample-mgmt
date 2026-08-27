// subsystems/control/frontend/js/views/list.js — 管制单列表
// 筛选/排序/分页 + 导出 CSV（复用列表查询参数，忽略分页，见 AGENTS.md §21）。
// 读取 route() 写入的 currentStatusFilter 作为初始状态筛选（看板阶段卡单击跳转）。

var _ctlPager = { limit: 20, offset: 0, total: 0 };
var _ctlQuery = { q: '', status: '', apply_dept: '', bad_type: '', sort: '' };
var _ctlRows = [];            // 当前页已渲染行（委托单行内展开用，免重复请求）
var _ctlNcrMap = {};          // order_id → ncr[] 聚合映射（委托单号列行内展开数据源）
var _ctlExpandedOrder = null; // 当前行内展开的管制单 id

async function renderList() {
  var view = $('#view');
  view.innerHTML = sendFilterHtml() + '<div id="ctl-sheet" class="ctl-sheet"></div>';
  $('#ctl-field-q').value = _ctlQuery.q;
  var statusSel = $('#ctl-field-status');
  var initStatus = currentStatusFilter || _ctlQuery.status;
  if (initStatus) statusSel.value = initStatus;
  $('#ctl-field-apply_dept').value = _ctlQuery.apply_dept;
  $('#ctl-field-bad_type').value = _ctlQuery.bad_type;
  $('#ctl-field-sort').value = _ctlQuery.sort;
  await ctlFetchList(0);
}

function sendFilterHtml() {
  var statusOpts = ['<option value="">全部状态</option>'].concat(CONTROL_STATUS_ORDER.map(function (s) {
    return '<option value="' + s + '">' + (CONTROL_STATUS_CN[s] || s) + '</option>';
  })).join('') + '<option value="RETIRED">已作废</option>';
  var deptOpts = '<option value="">全部部门</option>' + CONTROL_DEPTS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
  var badOpts = '<option value="">全部类型</option>' + CONTROL_BAD_TYPES.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
  var sortOpts = '<option value="">默认（新→旧）</option>'
    + '<option value="order_no">单号升序</option><option value="-order_no">单号降序</option>'
    + '<option value="apply_at">申请时间升序</option><option value="-apply_at">申请时间降序</option>'
    + '<option value="created_at">创建时间升序</option><option value="-created_at">创建时间降序</option>';
  return '<div class="filters"><div class="filter-row">'
    + '<input id="ctl-field-q" class="input" placeholder="单号/料号/品名/申请人" />'
    + '<select id="ctl-field-status" class="input">' + statusOpts + '</select>'
    + '<select id="ctl-field-apply_dept" class="input">' + deptOpts + '</select>'
    + '<select id="ctl-field-bad_type" class="input">' + badOpts + '</select>'
    + '<select id="ctl-field-sort" class="input">' + sortOpts + '</select>'
    + '<button class="btn primary" onclick="ctlFetchList(0)">查询</button>'
    + '<button class="btn" onclick="ctlResetFilter()">清除</button>'
    + '<button class="btn" onclick="exportControlCsv()">导出 CSV</button>'
    + '</div></div>';
}

/** 收集当前筛选到 _ctlQuery；q 为空串时过滤请求参数 */
function ctlCollectQuery() {
  _ctlQuery.q = $('#ctl-field-q').value;
  _ctlQuery.status = $('#ctl-field-status').value;
  _ctlQuery.apply_dept = $('#ctl-field-apply_dept').value;
  _ctlQuery.bad_type = $('#ctl-field-bad_type').value;
  _ctlQuery.sort = $('#ctl-field-sort').value;
}

function ctlQueryString() {
  var q = [];
  var map = { q: _ctlQuery.q, status: _ctlQuery.status, apply_dept: _ctlQuery.apply_dept, bad_type: _ctlQuery.bad_type, sort: _ctlQuery.sort };
  for (var k in map) { if (map[k] !== '' && map[k] != null) q.push(k + '=' + encodeURIComponent(map[k])); }
  return q.length ? '&' + q.join('&') : '';
}

/**
 * 拉取列表并渲染当前页。
 * @param {number} page 页码（0 基），offset = page * limit
 */
async function ctlFetchList(page) {
  ctlCollectQuery();
  var limit = _ctlPager.limit;
  var offset = Math.max(0, page) * limit;
  var url = '/api/control/orders?limit=' + limit + '&offset=' + offset + ctlQueryString();
  try {
    var res = await api('GET', url);
    _ctlPager.offset = offset;
    _ctlPager.total = res.total || 0;
    _ctlRows = res.orders || [];
    await ctlLoadNcrMap(_ctlRows);
    renderListSheet(_ctlRows, Math.max(0, page));
  } catch (err) {
    $('#ctl-sheet').innerHTML = '<div class="empty">列表加载失败：' + e(err.message) + '</div>';
  }
}

/** 拉取当前页各管制单的 NCR 聚合（order_id → ncr[]），供委托单号列行内展开；失败置空不阻断列表 */
async function ctlLoadNcrMap(orders) {
  var ids = (orders || []).filter(function (o) { return o.id; }).map(function (o) { return o.id; }).join(',');
  if (!ids) { _ctlNcrMap = {}; return; }
  try {
    var res = await api('GET', '/api/control/ncrs?order_ids=' + encodeURIComponent(ids) + '&limit=1000');
    var map = {};
    (res.ncrs || []).forEach(function (n) { if (n.order_id) (map[n.order_id] = map[n.order_id] || []).push(n); });
    _ctlNcrMap = map;
  } catch (err) { _ctlNcrMap = {}; }
}

/** 切换某行的 NCR 展开/收起；免重新拉列表，用已缓存页数据直接重渲染 */
function ctlToggleNcr(id) {
  _ctlExpandedOrder = (_ctlExpandedOrder === id) ? null : id;
  renderListSheet(_ctlRows, Math.max(0, Math.floor(_ctlPager.offset / _ctlPager.limit)));
}

/** 渲染表格 + 分页（rows 为当前页数据，page 为 0 基页码）；委托单号列支持行内展开全部 NCR */
function renderListSheet(rows, page) {
  var total = _ctlPager.total;
  var sheet = $('#ctl-sheet');
  if (!rows.length) { sheet.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  var body = rows.map(function (o) {
    var ncrs = _ctlNcrMap[o.id] || [];
    var expanded = _ctlExpandedOrder === o.id;
    // 委托单号列：无 NCR 显示 —；单张直接显示单号；多张显示「首单号 +N」；点击行内展开/收起（阻止冒泡避免跳详情）
    var ncrCell;
    if (!ncrs.length) ncrCell = '<td class="muted">—</td>';
    else {
      var label = ncrs.length > 1 ? (ncrs[0].ncr_no + ' +' + (ncrs.length - 1)) : ncrs[0].ncr_no;
      ncrCell = '<td><span class="ncr-toggle" onclick="event.stopPropagation();ctlToggleNcr(' + o.id + ')">' + e(label) + '</span></td>';
    }
    var tr = '<tr onclick="location.hash=\'#/detail?id=' + o.id + '\'" class="row-click">'
      + '<td class="mono">' + e(o.order_no) + '</td><td>' + e(o.part_no) + '</td><td>' + e(o.part_name) + '</td>'
      + '<td>' + e(o.bad_type) + '</td><td>' + (o.qty || 0) + '</td><td>' + e(o.apply_dept) + '</td>'
      + '<td>' + e(o.applicant_name) + '</td>' + ncrCell
      + '<td>' + statusBadge(o) + '</td><td class="mono">' + fmtTime(o.apply_at) + '</td></tr>';
    // 展开态：追加一张跨列行内嵌 NCR 明细卡（复用 renderNcrTab）
    if (expanded && ncrs.length) {
      tr += '<tr class="ncr-expand-row"><td colspan="10" class="ncr-expand-cell">' + renderNcrTab(ncrs) + '</td></tr>';
    }
    return tr;
  }).join('');
  var maxPage = Math.max(0, Math.ceil(total / _ctlPager.limit) - 1);
  var pager = '<div class="pager"><span class="muted">共 ' + total + ' 条</span>'
    + '<button class="btn" ' + (page <= 0 ? 'disabled' : '') + ' onclick="ctlFetchList(' + (page - 1) + ')">上一页</button>'
    + '<span>' + (page + 1) + '/' + (maxPage + 1) + '</span>'
    + '<button class="btn" ' + (page >= maxPage ? 'disabled' : '') + ' onclick="ctlFetchList(' + (page + 1) + ')">下一页</button></div>';
  sheet.innerHTML = '<table class="grid"><thead><tr>'
    + '<th>管制单号</th><th>料号</th><th>品名</th><th>不良类型</th><th>数量</th><th>申请部门</th><th>申请人</th><th>委托单号</th><th>状态</th><th>申请时间</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>' + pager;
}

/** 导出 CSV：复用当前筛选参数，忽略分页；用 location.href 触发下载避免弹窗拦截（AGENTS.md §21.2） */
function exportControlCsv() {
  ctlCollectQuery();
  location.href = '/api/control/orders/export?' + ctlQueryString().replace(/^&/, '');
}

/** 清除筛选并回到第一页 */
function ctlResetFilter() {
  $('#ctl-field-q').value = '';
  $('#ctl-field-status').value = '';
  $('#ctl-field-apply_dept').value = '';
  $('#ctl-field-bad_type').value = '';
  $('#ctl-field-sort').value = '';
  ctlFetchList(0);
}
