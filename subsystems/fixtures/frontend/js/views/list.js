// 治具清单（核心：状态管理、渲染）
// 筛选/排序/分页 → fixture-list-filter.js

var fixtureListState = { status: '', dept: '', search: '', col: '', dir: 'desc', page: 20, pageNo: 1 };

function fixtureNoVersion(f) {
  return f.fixture_no ? f.fixture_no.replace(/-V\d+$/, '') : '—';
}

function isOverdue(f) {
  if (!f.expected_return_at) return false;
  return ['IN_USE', 'TRANSFERRED', 'VERIFY_PENDING'].indexOf(f.status) !== -1 && new Date(f.expected_return_at) <= new Date();
}

async function renderFixtureList() {
  try {
    fixtureListState.dept = '';
    fixtureListState.search = '';
    fixtureListState.status = '';
    fixtureListState.col = '';
    fixtureListState.dir = 'desc';
    fixtureListState.pageNo = 1;
    await loadFixtureList();
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

async function loadFixtureList() {
  try {
    document.getElementById('view').innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
    var parts = [];
    if (fixtureListState.status) parts.push('status=' + encodeURIComponent(fixtureListState.status));
    if (fixtureListState.dept) parts.push('dept=' + encodeURIComponent(fixtureListState.dept));
    if (fixtureListState.search) parts.push('search=' + encodeURIComponent(fixtureListState.search));
    if (fixtureListState.col) parts.push('col=' + encodeURIComponent(fixtureListState.col) + '&dir=' + fixtureListState.dir);
    var offset = (fixtureListState.pageNo - 1) * fixtureListState.page;
    parts.push('limit=' + fixtureListState.page + '&offset=' + offset);
    var qs = parts.join('&');
    var p = await api('GET', '/api/fixtures' + (qs ? '?' + qs : ''));
    var fixtures = p.fixtures || [];

    // 筛选栏
    var html = '<div class="filters">';
    html += '<fluent-text-field placeholder="搜索编号/名称…" value="' + e(fixtureListState.search) + '" oninput="debounceRenderFixtureList(this.value)"></fluent-text-field>';
    html += '<select onchange="filterFixtureListStatus(this.value)"><option value="">全部状态</option>' + Object.keys(STATUS).filter(function(k) { return ['NEW','PRODUCED','RELEASED','IN_CUSTODY','RETURNING'].indexOf(k) === -1; }).map(function(k) { return '<option value="' + k + '"' + (fixtureListState.status === k ? ' selected' : '') + '>' + (STATUS[k] || k) + '</option>'; }).join('') + '</select>';
    html += '<select onchange="filterFixtureListDept(this.value)"><option value="">全部部门</option>' + ['研发中心','品保文管中心','制造部','FQC','生技部'].map(function(d) { return '<option value="' + d + '"' + (fixtureListState.dept === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>';
    html += '<span style="display:flex;align-items:center;gap:4px;white-space:nowrap"><span class="muted">排序</span><select onchange="toggleFixtureSort(this.value)" style="min-width:80px;max-width:120px"><option value="">默认</option><option value="fixture_no"' + (fixtureListState.col === 'fixture_no' ? ' selected' : '') + '>编号</option><option value="name"' + (fixtureListState.col === 'name' ? ' selected' : '') + '>名称</option><option value="updated_at"' + (fixtureListState.col === 'updated_at' ? ' selected' : '') + '>更新时间</option></select></span>';
    html += '<select onchange="changeFixturePageSize(this.value)" style="max-width:110px"><option value="10"' + (fixtureListState.page === 10 ? ' selected' : '') + '>10条/页</option><option value="20"' + (fixtureListState.page === 20 ? ' selected' : '') + '>20条/页</option><option value="50"' + (fixtureListState.page === 50 ? ' selected' : '') + '>50条/页</option><option value="100"' + (fixtureListState.page === 100 ? ' selected' : '') + '>100条/页</option></select>';
    html += '<fluent-button appearance="accent" onclick="clearAllFilters()">清除</fluent-button></div>';

    // chips
    var chips = [];
    if (fixtureListState.status) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(0)">' + (STATUS[fixtureListState.status] || fixtureListState.status) + ' ✕</span>');
    if (fixtureListState.dept) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + (fixtureListState.status ? 1 : 0) + ')">' + fixtureListState.dept + ' ✕</span>');
    if (fixtureListState.search) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + (fixtureListState.status && fixtureListState.dept ? 2 : fixtureListState.status || fixtureListState.dept ? 1 : 0) + ')">"' + e(fixtureListState.search) + '" ✕</span>');
    if (chips.length > 0) html += '<div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap;align-items:center">' + chips.join('') + '</div>';

    function th(label, field) {
      var sortCol = fixtureListState.col, sortDir = fixtureListState.dir || 'desc';
      var arrow = sortCol === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th style="cursor:pointer;white-space:nowrap" onclick="toggleFixtureSort(\'' + field + '\')"><span class="col-rsz"></span>' + label + '<span style="font-size:10px">' + arrow + '</span></th>';
    }

    // 表格
    html += '<div class="card" style="padding:0">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)"><span style="font-weight:600;font-size:14px">全部治具 (<b>' + p.total + '</b>)</span></div>';
    if (fixtures.length === 0) {
      var hasFilter = fixtureListState.status || fixtureListState.dept || fixtureListState.search;
      html += '<div class="empty">' + (hasFilter ? '未找到匹配的治具，请调整筛选条件' : '暂无治具数据') + '</div>';
    } else {
      html += '<table class="fx-list-table"><colgroup>' +
        '<col style="width:42px"><col style="width:110px"><col style="width:130px"><col style="width:80px"><col style="width:90px"><col style="width:72px"><col style="width:60px"><col style="width:80px"><col style="width:84px"><col style="width:84px"><col style="width:100px"><col style="width:84px">' +
        '</colgroup>' +
        '<thead><tr><th>#<span class="col-rsz"></span></th>' + th('编号', 'fixture_no') + th('名称', 'name') + '<th>规格<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>储位<span class="col-rsz"></span></th><th>图片<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th><th>归还状态<span class="col-rsz"></span></th><th>保养状态<span class="col-rsz"></span></th>' + th('更新时间', 'updated_at') + '<th>操作<span class="col-rsz"></span></th></tr></thead><tbody>';
      fixtures.forEach(function (f, i) {
        var cls = isOverdue(f) ? 'overdue-row' : '';
        var photoHtml;
        if (f.first_photo) {
          photoHtml = '<img src="/uploads/fixtures/' + f.first_photo + '" width="32" height="32" style="object-fit:cover;border-radius:4px" onerror="this.style.display=\'none\'" />';
          if (f.photo_count > 1) photoHtml += ' <small class="muted">+' + (f.photo_count - 1) + '</small>';
        } else { photoHtml = '<span class="muted">—</span>'; }
        html += '<tr class="' + cls + '" onclick="showFixtureDetail(' + f.id + ')"><td class="muted" data-label="序号">' + (p.offset + i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td class="muted" data-label="储位">' + e(f.storage_location || '—') + '</td><td data-label="图片">' + photoHtml + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="归还状态">' + returnBadge(f) + '</td><td data-label="保养状态">' + maintBadge(f) + '</td><td data-label="更新时间"><small>' + fmt(f.updated_at) + '</small></td><td data-label="操作"><a class="link" onclick="event.stopPropagation();showFixtureDetail(' + f.id + ')">详情</a></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    // 分页
    var totalPages = Math.ceil(p.total / fixtureListState.page);
    var currentPage = fixtureListState.pageNo;
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage - 1) + ')">← 上一页</fluent-button>';
    html += '<span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + p.total + '</b> 条</span>';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage + 1) + ')">下一页 →</fluent-button>';
    html += '</div>';

    document.getElementById('view').innerHTML = html;
    setTimeout(function() { _initColResize(document.querySelector('.fx-list-table')); }, 0);
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}
