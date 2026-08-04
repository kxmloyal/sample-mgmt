// sample-list-render.js — 样品列表渲染（表头、行、分页、列宽拖拽）
// 依赖：samplePager/_sampleBuildParams/_sampleIsOverdue (samples.js), renderChips/statusBadge/e/fmt/sampleTypeLabel/inspectBadge

/** 构建样品列表表头 HTML（含 colgroup 列宽定义） */
function _sampleHeaderCols(isOverdue) {
  var cols = ['#','编号', '名称', '机型/站别', '图片', '规格', '类型', '状态', '复检状态', '制作', '发行', '保管部门/储位'];
  if (isOverdue) cols.push('复检到期');
  cols.push('操作');
  var ths = cols.map(function(c) { return '<th>' + c + '<span class="col-rsz"></span></th>'; }).join('');
  var cg = '<colgroup>' +
    '<col style="width:42px">' +
    '<col style="width:100px">' + '<col style="width:130px">' + '<col style="width:90px">' +
    '<col style="width:52px">' + '<col style="width:80px">' + '<col style="width:70px">' +
    '<col style="width:84px">' + '<col style="width:84px">' +
    '<col style="width:78px">' + '<col style="width:78px">' +
    '<col style="width:110px">' + (isOverdue ? '<col style="width:84px">' : '') +
    '<col style="width:120px">' + '</colgroup>';
  return cg + '<thead><tr>' + ths + '</tr></thead>';
}

/** 构建单行数据 HTML */
function _sampleRowHtml(s, isOverdue, i) {
  var img = s.produced_image || s.image
    ? '<img src="' + e(s.produced_image || s.image) + '" width="40" style="border-radius:4px"/>' : '—';
  var typeCell = s.sample_type
    ? '<span class="badge" style="background:' + (s.sample_type === 'OK' ? '#16a34a' : '#dc2626') + ';color:#fff">' + sampleTypeLabel(s.sample_type) + '</span>'
    : '—';
  var actions = '<a class="link" onclick="viewDetail(' + s.id + ')">详情</a>';
  if (s.status === 'NEW')
    actions = '<a class="link" style="margin-right:8px" onclick="event.stopPropagation();printSampleLabel(' + s.id + ')">打印</a>' + actions;
  actions = '<a class="link" style="margin-right:8px" onclick="event.stopPropagation();downloadQR(' + s.id + ')">下载QR</a>' + actions;
  if ((s.status === 'NEW' || s.status === 'PRODUCED') && (me.role === 'ADMIN' || me.role === 'RD' || s.created_by === me.id))
    actions = '<a class="link" style="margin-right:8px;color:var(--bad)" onclick="event.stopPropagation();deleteSample(' + s.id + ')">取消</a>' + actions;
  var overdueCell = '';
  if (isOverdue) {
    var overdue = s.next_inspect_at && new Date(s.next_inspect_at).getTime() < Date.now();
    overdueCell = '<td data-label="复检到期" class="' + (overdue ? 'b-overdue' : 'muted') + '">' + fmt(s.next_inspect_at) + '</td>';
  }
  return '<tr>' +
    '<td data-label="序号" class="muted">' + (typeof i !== 'undefined' ? (samplePager.offset + i + 1) : '') + '</td>' +
    '<td data-label="编号">' + e(s.sample_no) + '</td>' +
    '<td data-label="名称">' + e(s.name || '—') + '</td>' +
    '<td data-label="机型/站别" class="muted">' + e(s.model || '—') + (s.station ? ' · ' + e(s.station) : '') + '</td>' +
    '<td data-label="图片">' + img + '</td>' +
    '<td data-label="规格" class="muted">' + e(s.spec || '—') + '</td>' +
    '<td data-label="类型">' + typeCell + '</td>' +
    '<td data-label="状态">' + statusBadge(s) + '</td>' +
    '<td data-label="复检状态">' + inspectBadge(s) + '</td>' +
    '<td data-label="制作" class="muted">' + fmt(s.produced_at) + '</td>' +
    '<td data-label="发行" class="muted">' + fmt(s.released_at) + '</td>' +
    '<td data-label="保管/储位" class="muted">' + e(s.custody_dept || '—') + '/' + e(s.storage_location || '—') + '</td>' +
    overdueCell +
    '<td data-label="操作" style="white-space:nowrap">' + actions + '</td>' +
    '</tr>';
}

/** 拉取一页样品数据 */
function _fetchSamplePage(resetOffset) {
  if (resetOffset) samplePager.offset = 0;
  if (!_sampleBuildParams) return;
  var params = _sampleBuildParams();
  params += (params ? '&' : '') + 'limit=' + samplePager.limit + '&offset=' + samplePager.offset;
  api('GET', '/api/samples?' + params).then(function(data) {
    samplePager.total = data.total || 0;
    _renderSampleList(data.samples || [], _sampleIsOverdue, samplePager);
    renderChips();
  }).catch(function(e) { $('#s-list').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; });
}

function goSamplePage(page) {
  samplePager.offset = (page - 1) * samplePager.limit;
  _fetchSamplePage(false);
}

/** 渲染样品列表到 #s-list */
function _renderSampleList(list, isOverdue, pager) {
  var box = $('#s-list');
  if (!list.length) { box.innerHTML = '<div class="empty">' + (isOverdue ? '无逾期/即将到期样品' : '无样品') + '</div>'; return; }
  var cols = _sampleHeaderCols(isOverdue);
  var rows = list.map(function(s, i) { return _sampleRowHtml(s, isOverdue, i); }).join('');
  var minWidth = isOverdue ? 1150 : 1050;
  var html = '<div class="card" style="padding:0"><table class="samples-table" style="min-width:' + minWidth + 'px">' + cols + '<tbody>' + rows + '</tbody></table></div>';
  if (pager && pager.total > pager.limit) {
    var totalPages = Math.ceil(pager.total / pager.limit);
    var currentPage = Math.floor(pager.offset / pager.limit) + 1;
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html += '<fluent-button appearance="accent" size="small" ' + (pager.offset === 0 ? 'disabled' : '') + ' onclick="goSamplePage(' + (currentPage - 1) + ')">← 上一页</fluent-button>';
    html += '<span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + pager.total + '</b> 条</span>';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goSamplePage(' + (currentPage + 1) + ')">下一页 →</fluent-button>';
    html += '</div>';
  }
  box.innerHTML = html;
  setTimeout(function() { _initColResize(box.querySelector('.samples-table')); }, 0);
}
