// subsystems/workbench/frontend/js/views/dashboard.js
// 核心渲染函数（逾期判断逻辑见 overdue.js）

var _deptFilter = null;   // 部门卡筛选（null=全部），单击部门卡设置/取消
var _wbItems = [];        // 最近一次加载的工作台数据（阈值弹窗实时预览用）

async function renderWorkbenchDashboard(keepFilter) {
  var view = document.getElementById('view');
  view.textContent = '加载中…';
  view.style = 'padding:40px;text-align:center;color:var(--muted)';

  try {
    await loadOverdueBounds(); // 确保使用全局阈值（ADMIN 可改）
    var f = parseWbHash();
    if (_deptFilter) f.dept = _deptFilter; // 部门卡筛选优先级高于下拉

    // 带筛选参数请求（服务端过滤 + 等级计算 + 统计 + 分页）
    var qs = [];
    if (f.type) qs.push('type=' + encodeURIComponent(f.type));
    if (f.level) qs.push('level=' + encodeURIComponent(f.level));
    if (f.dept) qs.push('dept=' + encodeURIComponent(f.dept));
    if (f.apply_dept) qs.push('apply_dept=' + encodeURIComponent(f.apply_dept));
    if (f.keyword) qs.push('keyword=' + encodeURIComponent(f.keyword));
    if (f.stage) qs.push('stage=' + encodeURIComponent(f.stage));
    if (f.dormant) qs.push('dormant=1');
    if (f.min_hours !== '' && f.min_hours != null) qs.push('min_hours=' + encodeURIComponent(f.min_hours));
    if (f.max_hours !== '' && f.max_hours != null) qs.push('max_hours=' + encodeURIComponent(f.max_hours));
    qs.push('limit=' + (f.limit || 50), 'offset=' + (f.offset || 0));
    var data = await api('GET', '/api/workbench?' + qs.join('&'));
    _wbItems = data.items; // 当前页数据（阈值弹窗打开时再拉全量样本）

    view.style = '';
    view.innerHTML =
      renderSummaryCards(data.deptStats, data.summary) +
      renderWbFilterBar(f, data.total, data.deptStats, data.applyDepts) +
      renderItemTable(data.items) +
      renderWbPager(f, data.total);

    // 部门卡 active 态
    if (_deptFilter) {
      var dc = document.querySelector('.kb-stat[data-dept="' + _deptFilter + '"]');
      if (dc) dc.classList.add('active');
    } else {
      var totalCard = document.querySelector('.wb-card-total');
      if (totalCard) totalCard.classList.add('active');
    }
  } catch (err) {
    view.innerHTML = '<div style="padding:40px;text-align:center;color:#dc2626">' +
      '<div>加载失败：' + e(err.message) + '</div>' +
      '<button class="btn btn-sm" onclick="renderWorkbenchDashboard()" style="margin-top:12px">重试</button>' +
      '</div>';
  }
}

function renderSummaryCards(depts, summary) {
  var tl = tierLabels(); // 标签随当前阈值动态生成
  function tags(o) {
    var t = '';
    if (o.d3in) t += '<span class="wb-tag wb-tag-1">' + tl[0] + ' ' + o.d3in + '</span>';
    if (o.d37) t += '<span class="wb-tag wb-tag-2">' + tl[1] + ' ' + o.d37 + '</span>';
    if (o.d7) t += '<span class="wb-tag wb-tag-3">' + tl[2] + ' ' + o.d7 + '</span>';
    return t;
  }
  var html = '<div class="kb-stats">';
  // 总计卡：单击清除部门筛选（组件规范见 2026-08-04-card-design-system.md）
  var dormantTag = summary.dormant > 0 ? '<span class="wb-tag wb-tag-dormant">呆滞 ' + summary.dormant + '</span>' : '';
  html += '<fluent-card class="kb-stat wb-card-total' + (_deptFilter ? '' : ' active') + '" style="--stat-color:var(--brand)" onclick="clearDeptFilter()">' +
    '<div class="n">' + summary.total + '</div>' +
    '<div class="l">总计</div>' +
    (tags(summary) || dormantTag ? '<div class="wb-card-tags">' + tags(summary) + dormantTag + '</div>' : '') +
    '</fluent-card>';
  // 部门卡：单击筛选该部门，再次点击取消
  depts.forEach(function(d) {
    var color = d.d7 ? 'var(--bad)' : (d.d37 ? '#ea580c' : 'var(--brand)');
    html += '<fluent-card class="kb-stat' + (_deptFilter === d.dept ? ' active' : '') + '" data-dept="' + d.dept + '" style="--stat-color:' + color + '" onclick="filterByDept(this)">' +
      '<div class="n">' + d.total + '</div>' +
      '<div class="l">' + d.dept + '</div>' +
      (tags(d) ? '<div class="wb-card-tags">' + tags(d) + '</div>' : '') +
      '</fluent-card>';
  });
  html += '</div>';
  return html;
}

// 阈值设置弹窗逻辑见 views/threshold.js（openThresholdModal/applyPreset/refreshThresholdPreview/saveThreshold）

function renderItemTable(items) {
  var rows = items.map(function(item, idx) {
    var style = OVERDUE_STYLES[item.overdue_level] || OVERDUE_STYLES[0];
    var badgeHtml = item.overdue_level > 0
      ? '<span class="wb-badge" style="color:' + style.color + ';background:' + style.bg + '">' + item.overdue_label + '·' + item.overdue_reason + '</span>'
      : '<span style="color:var(--muted)">正常</span>';
    if (item.dormant_days != null) {
      badgeHtml += ' <span class="wb-badge wb-badge-dormant">呆滞 ' + item.dormant_days + '天</span>';
    }
    var typeBadge = item.item_type === 'sample'
      ? '<span class="wb-type-tag sample">样品</span>'
      : item.item_type === 'fixture'
        ? '<span class="wb-type-tag fixture">治具</span>'
        : '<span class="wb-type-tag control">管制</span>';

    return '<tr class="wb-row" data-type="' + item.item_type + '" data-level="' + item.overdue_level + '" data-dept="' + item.resp_dept + '" style="cursor:pointer" onclick="openWbDetail(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')">' +
      '<td class="muted">' + (idx + 1) + '</td>' +
      '<td>' + e(item.item_no) + '</td>' +
      '<td>' + e(item.name) + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td>' + (item.stage_cn || '-') + '</td>' +
      '<td>' + e(item.resp_dept || '-') + '</td>' +
      '<td>' + e(item.apply_dept || '-') + '</td>' +
      '<td>' + formatHours(item.dwell_hours) + '</td>' +
      '<td>' + badgeHtml + '</td>' +
      '</tr>';
  }).join('');

  var bodyHtml = rows || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">暂无活跃项目</td></tr>';

  return '<div class="table-wrap">' +
    '<table class="data-table" id="wb-table">' +
    '<thead><tr>' +
    '<th>#</th><th>编号</th><th>名称</th><th>类型</th><th>阶段</th><th>负责部门</th><th>申请部门</th><th>停留</th><th>积压状态</th>' +
    '</tr></thead>' +
    '<tbody>' + bodyHtml + '</tbody>' +
    '</table></div>';
}

// 部门卡交互：单击筛选该部门（服务端过滤），再次点击取消
function filterByDept(el) {
  var dept = el.dataset.dept;
  _deptFilter = (_deptFilter === dept) ? null : dept;
  renderWorkbenchDashboard(true);
}

// 总计卡交互：清除部门筛选
function clearDeptFilter() {
  _deptFilter = null;
  renderWorkbenchDashboard(true);
}

function formatHours(h) {
  if (!h && h !== 0) return '-';
  h = Math.round(h);
  if (h < 1) return '<1h';
  var days = Math.floor(h / 24);
  var remaining = h % 24;
  if (days >= 1) return days + '天' + (remaining > 0 ? remaining + 'h' : '');
  return h + 'h';
}
