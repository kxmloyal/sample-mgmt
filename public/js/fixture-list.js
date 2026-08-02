// fixture-list.js — 治具清单 + 新建申请
var fixtureListState = { status: '', dept: '', search: '' };
var fixtureListPager = { limit: 20, offset: 0, total: 0 };

async function renderFixtureList() {
  try {
    document.getElementById('view').innerHTML = '<div class="loading" style="text-align:center;padding:40px;color:var(--muted)">加载中...</div>';
    var p = fixtureListPager;
    fixtureListState.limit = String(p.limit);
    fixtureListState.offset = String(p.offset);
    var params = new URLSearchParams(fixtureListState).toString();
    var data = await api('GET', '/api/fixtures?' + params);
    var fixtures = data.fixtures;
    p.total = data.total;
    var html = '';

    // 筛选栏
    html += '<div class="row" style="margin-bottom:12px">';
    html += '<fluent-select onchange="fixtureListState.status=this.value;fixtureListPager.offset=0;renderFixtureList()" style="width:auto"><fluent-option value="">全部状态</fluent-option>';
    Object.keys(STATUS).forEach(function (k) {
      html += '<fluent-option value="' + k + '"' + (fixtureListState.status === k ? ' selected' : '') + '>' + STATUS[k] + '</fluent-option>';
    });
    html += '</fluent-select>';
    html += '<fluent-select onchange="fixtureListState.dept=this.value;fixtureListPager.offset=0;renderFixtureList()" style="width:auto"><fluent-option value="">全部部门</fluent-option>';
    var depts = ['研发中心', '品保文管中心', '制造部', 'FQC', '生技部'];
    depts.forEach(function (d) {
      html += '<fluent-option value="' + d + '"' + (fixtureListState.dept === d ? ' selected' : '') + '>' + d + '</fluent-option>';
    });
    html += '</fluent-select>';
    html += '<fluent-text-field placeholder="搜索编号/名称/规格" value="' + e(fixtureListState.search) + '" oninput="fixtureListState.search=this.value;fixtureListPager.offset=0;debounceRenderFixtureList()" style="width:200px"></fluent-text-field>';
    html += '</div>';

    // 筛选 chip
    var chips = [];
    if (fixtureListState.status) chips.push(STATUS[fixtureListState.status] || fixtureListState.status);
    if (fixtureListState.dept) chips.push(fixtureListState.dept);
    if (fixtureListState.search) chips.push('"' + e(fixtureListState.search) + '"');
    if (chips.length > 0) {
      html += '<div style="margin-bottom:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
      html += '<span class="muted" style="font-size:12px">已筛选：</span>';
      chips.forEach(function(c, i) {
        html += '<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + i + ')">' + c + ' ✕</span>';
      });
      html += '<a href="javascript:clearAllFilters()" class="muted" style="font-size:12px;margin-left:6px">清除全部</a>';
      html += '</div>';
    }

    // 排序表头构建函数
    var sortCol = fixtureListState.sort || 'id';
    var sortDir = fixtureListState.dir || 'desc';
    function th(label, field) {
      var arrow = '';
      if (sortCol === field) arrow = sortDir === 'asc' ? ' ▲' : ' ▼';
      return '<th style="cursor:pointer;white-space:nowrap" onclick="toggleFixtureSort(\'' + field + '\')">' + label + '<span style="font-size:10px">' + arrow + '</span></th>';
    }

    // 表格
    html += '<div class="card" style="padding:0">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">';
    html += '<span style="font-weight:600;font-size:14px">全部治具 (<b>' + p.total + '</b>)</span>';
    html += '</div>';
    if (fixtures.length === 0) {
      var hasFilter = fixtureListState.status || fixtureListState.dept || fixtureListState.search;
      html += '<div class="hint">' + (hasFilter ? '未找到匹配的治具，请调整筛选条件' : '暂无治具数据') + '</div>';
    }
    else {
      html += '<table class="fx-list-table"><thead><tr><th>#</th>' + th('编号', 'fixture_no') + th('名称', 'name') + '<th>规格</th><th>部门</th><th>储位</th><th>图片</th><th>状态</th>' + th('更新时间', 'updated_at') + '<th>操作</th></tr></thead><tbody>';
      fixtures.forEach(function (f, i) {
        var cls = isOverdue(f) ? ' class="overdue-row"' : '';
        var photoHtml;
        if (f.first_photo) {
          photoHtml = '<img src="/uploads/fixtures/' + f.first_photo + '" width="32" height="32" style="object-fit:cover;border-radius:4px" onerror="this.style.display=\'none\'" />';
          if (f.photo_count > 1) photoHtml += ' <small class="muted">+' + (f.photo_count - 1) + '</small>';
        } else {
          photoHtml = '<span class="muted">—</span>';
        }
        html += '<tr' + cls + ' onclick="showFixtureDetail(' + f.id + ')"><td data-label="序号" class="muted">' + (p.offset + i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="储位" class="muted">' + e(f.storage_location || '—') + '</td><td data-label="图片">' + photoHtml + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="更新时间"><small>' + fmt(f.updated_at) + '</small></td><td data-label="操作"><a class="link" onclick="event.stopPropagation();showFixtureDetail(' + f.id + ')">详情</a></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    // 分页控件
    var totalPages = Math.ceil(p.total / p.limit);
    var currentPage = Math.floor(p.offset / p.limit) + 1;
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html += '<fluent-button appearance="accent" size="small" ' + (p.offset === 0 ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage - 1) + ')">← 上一页</fluent-button>';
    html += '<span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + p.total + '</b> 条</span>';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage + 1) + ')">下一页 →</fluent-button>';
    html += '</div>';

    document.getElementById('view').innerHTML = html;
  } catch (e) { document.getElementById('view').innerHTML = '<div class="hint">加载失败：' + e.message + '</div>'; }
}

function clearFilterChip(idx) {
  var keys = [];
  if (fixtureListState.status) keys.push('status');
  if (fixtureListState.dept) keys.push('dept');
  if (fixtureListState.search) keys.push('search');
  if (idx >= 0 && idx < keys.length) {
    fixtureListState[keys[idx]] = '';
    fixtureListPager.offset = 0;
    renderFixtureList();
  }
}

function clearAllFilters() {
  fixtureListState = { status: '', dept: '', search: '' };
  fixtureListPager.offset = 0;
  renderFixtureList();
}

var _fldTimer = null;
function debounceRenderFixtureList() {
  clearTimeout(_fldTimer);
  _fldTimer = setTimeout(renderFixtureList, 300);
}

function goFixturePage(page) {
  fixtureListPager.offset = (page - 1) * fixtureListPager.limit;
  renderFixtureList();
}

function toggleFixtureSort(field) {
  if (fixtureListState.sort === field) {
    fixtureListState.dir = fixtureListState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    fixtureListState.sort = field;
    fixtureListState.dir = 'asc';
  }
  fixtureListPager.offset = 0;
  renderFixtureList();
}


