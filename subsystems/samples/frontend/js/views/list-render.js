// sample-list-render.js — 样品列表渲染（表头、行、分页、列宽拖拽）
// 2026-09-05 角色化：列集由 list-role.js 的 listActiveCols() 驱动（角色档/完整视图），列定义见 LIST_COL_DEFS
// 依赖：samplePager/_sampleBuildParams/_sampleIsOverdue (samples.js), renderChips/statusBadge/e/fmt/sampleTypeLabel/inspectBadge/list-role.js

/** 构建样品列表表头 HTML（列 key 驱动；逾期视图在 actions 前插入 due 列） */
function _sampleHeaderCols(isOverdue) {
  var cols = listActiveCols().slice();
  if (isOverdue && cols.indexOf('due') === -1) cols.splice(cols.indexOf('actions'), 0, 'due');
  var ths = cols.map(function (k) { return '<th>' + LIST_COL_DEFS[k].label + '<span class="col-rsz"></span></th>'; }).join('');
  var cg = '<colgroup>' + cols.map(function (k) { return '<col style="width:' + LIST_COL_DEFS[k].width + 'px">'; }).join('') + '</colgroup>';
  return cg + '<thead><tr>' + ths + '</tr></thead>';
}

/** 构建单行数据 HTML（列 key 驱动） */
function _sampleRowHtml(s, isOverdue, i) {
  var cols = listActiveCols().slice();
  if (isOverdue && cols.indexOf('due') === -1) cols.splice(cols.indexOf('actions'), 0, 'due');
  return '<tr>' + cols.map(function (k) { return LIST_COL_DEFS[k].cell(s, i); }).join('') + '</tr>';
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
  var active = listActiveCols();
  var extra = isOverdue && active.indexOf('due') === -1 ? 1 : 0;
  var minWidth = active.reduce(function (w, k) { return w + LIST_COL_DEFS[k].width; }, 0) + extra * 84;
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
