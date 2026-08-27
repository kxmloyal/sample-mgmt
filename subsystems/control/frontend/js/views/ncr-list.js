// subsystems/control/frontend/js/views/ncr-list.js — 不良品委托单(NCR) 聚合列表
// 权威依据：docs/superpowers/specs/2026-08-26-control-ncr-interaction-design.md §3.2
// 数据源：GET /api/control/ncrs（跨单聚合，登录即可）；行点击回跳所属管制单详情并定位该张 NCR。
// 能力：筛选（单号/所属管制单/检验部门/处理部门/创建人/日期区间）+ 分页 + 导出 CSV（AGENTS.md §21）。

var _ncrPager = { limit: 20, offset: 0, total: 0 };
var _ncrQuery = { ncr_no: '', order_no: '', inspect_dept: '', handle_dept: '', created_by_name: '', date_from: '', date_to: '' };

async function renderNcrList() {
  var view = $('#view');
  // 详情卡「在委托单列表查看」跳来：用路由预填委托单号筛选
  if (currentNcrNoFilter) _ncrQuery.ncr_no = currentNcrNoFilter;
  view.innerHTML = ncrFilterHtml() + '<div id="ncr-sheet" class="ctl-sheet"></div>';
  $('#ncr-field-ncr_no').value = _ncrQuery.ncr_no;
  $('#ncr-field-order_no').value = _ncrQuery.order_no;
  $('#ncr-field-inspect_dept').value = _ncrQuery.inspect_dept;
  $('#ncr-field-handle_dept').value = _ncrQuery.handle_dept;
  $('#ncr-field-created_by_name').value = _ncrQuery.created_by_name;
  $('#ncr-field-date_from').value = _ncrQuery.date_from;
  $('#ncr-field-date_to').value = _ncrQuery.date_to;
  await ncrFetchList(0);
}

function ncrFilterHtml() {
  var deptOpts = function (label) {
    return '<option value="">' + label + '</option>' + CONTROL_DEPTS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
  };
  return '<div class="filters"><div class="filter-row">'
    + '<input id="ncr-field-ncr_no" class="input" placeholder="委托单号" />'
    + '<input id="ncr-field-order_no" class="input" placeholder="所属管制单" />'
    + '<select id="ncr-field-inspect_dept" class="input">' + deptOpts('检验部门') + '</select>'
    + '<select id="ncr-field-handle_dept" class="input">' + deptOpts('处理部门') + '</select>'
    + '<input id="ncr-field-created_by_name" class="input" placeholder="创建人" />'
    + '<input id="ncr-field-date_from" class="input" type="date" title="创建起始" />'
    + '<input id="ncr-field-date_to" class="input" type="date" title="创建截止" />'
    + '<button class="btn primary" onclick="ncrFetchList(0)">查询</button>'
    + '<button class="btn" onclick="ncrResetFilter()">清除</button>'
    + '<button class="btn" onclick="exportNcrCsv()">导出 CSV</button>'
    + '</div></div>';
}

/** 收集当前筛选到 _ncrQuery */
function ncrCollectQuery() {
  _ncrQuery.ncr_no = $('#ncr-field-ncr_no').value.trim();
  _ncrQuery.order_no = $('#ncr-field-order_no').value.trim();
  _ncrQuery.inspect_dept = $('#ncr-field-inspect_dept').value;
  _ncrQuery.handle_dept = $('#ncr-field-handle_dept').value;
  _ncrQuery.created_by_name = $('#ncr-field-created_by_name').value.trim();
  _ncrQuery.date_from = $('#ncr-field-date_from').value;
  _ncrQuery.date_to = $('#ncr-field-date_to').value;
}

/** 拼筛选 query string（空项过滤） */
function ncrQueryString() {
  var q = [];
  var map = _ncrQuery;
  for (var k in map) { if (map[k] !== '' && map[k] != null) q.push(k + '=' + encodeURIComponent(map[k])); }
  return q.length ? '&' + q.join('&') : '';
}

/** 拉取并渲染当前页（page 0 基） */
async function ncrFetchList(page) {
  ncrCollectQuery();
  var limit = _ncrPager.limit;
  var offset = Math.max(0, page) * limit;
  var url = '/api/control/ncrs?limit=' + limit + '&offset=' + offset + ncrQueryString();
  try {
    var res = await api('GET', url);
    _ncrPager.offset = offset;
    _ncrPager.total = res.total || 0;
    ncrRenderSheet(res.ncrs || [], Math.max(0, page));
  } catch (err) {
    $('#ncr-sheet').innerHTML = '<div class="empty">列表加载失败：' + e(err.message) + '</div>';
  }
}

/** 渲染表格 + 分页 */
function ncrRenderSheet(rows, page) {
  var total = _ncrPager.total;
  var sheet = $('#ncr-sheet');
  if (!rows.length) { sheet.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  var body = rows.map(function (n) {
    var od = n.order_no || '';
    var go = n.order_id ? "location.hash='#/detail?id=" + n.order_id + "&focusNcr=" + encodeURIComponent(n.ncr_no || '') + "'" : 'null';
    return '<tr class="row-click" onclick="' + go + '">'
      + '<td class="mono">' + e(n.ncr_no || '—') + '</td><td class="mono">' + e(od || '—') + '</td>'
      + '<td>' + e(n.part_no || '—') + '</td><td>' + e(n.part_name || '—') + '</td>'
      + '<td>' + (n.status ? '<span class="badge b-' + n.status + '">' + (CONTROL_STATUS_CN[n.status] || n.status) + '</span>' : '—') + '</td>'
      + '<td>' + e(n.inspect_dept || '—') + '</td><td>' + e(n.handle_dept || '—') + '</td>'
      + '<td class="muted">' + e(n.form_template || '—') + '</td><td>' + e(n.created_by_name || '—') + '</td>'
      + '<td class="mono">' + fmtTime(n.created_at) + '</td></tr>';
  }).join('');
  var maxPage = Math.max(0, Math.ceil(total / _ncrPager.limit) - 1);
  var pager = '<div class="pager"><span class="muted">共 ' + total + ' 条</span>'
    + '<button class="btn" ' + (page <= 0 ? 'disabled' : '') + ' onclick="ncrFetchList(' + (page - 1) + ')">上一页</button>'
    + '<span>' + (page + 1) + '/' + (maxPage + 1) + '</span>'
    + '<button class="btn" ' + (page >= maxPage ? 'disabled' : '') + ' onclick="ncrFetchList(' + (page + 1) + ')">下一页</button></div>';
  sheet.innerHTML = '<table class="grid"><thead><tr>'
    + '<th>委托单号</th><th>所属管制单</th><th>料号</th><th>品名</th><th>状态</th><th>检验部门</th><th>处理部门</th><th>表单版本</th><th>创建人</th><th>创建时间</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>' + pager;
}

/** 导出 CSV：复用当前筛选，忽略分页（location.href 触发下载） */
function exportNcrCsv() {
  ncrCollectQuery();
  location.href = '/api/control/ncrs/export?' + ncrQueryString().replace(/^&/, '');
}

/** 清除筛选并回第一页 */
function ncrResetFilter() {
  _ncrQuery = { ncr_no: '', order_no: '', inspect_dept: '', handle_dept: '', created_by_name: '', date_from: '', date_to: '' };
  renderNcrList();
}
