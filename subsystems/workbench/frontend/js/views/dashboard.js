// subsystems/workbench/frontend/js/views/dashboard.js
// 核心渲染函数（逾期判断逻辑见 overdue.js）

var _filterCache = null;
var _deptFilter = null;   // 部门卡筛选（null=全部），单击部门卡设置/取消
var _wbItems = [];        // 最近一次加载的工作台数据（阈值弹窗实时预览用）

async function renderWorkbenchDashboard(keepFilter) {
  var view = document.getElementById('view');
  view.textContent = '加载中…';
  view.style = 'padding:40px;text-align:center;color:var(--muted)';

  try {
    await loadOverdueBounds(); // 确保使用全局阈值（ADMIN 可改）后再计算
    var data = await api('GET', '/api/workbench');
    _wbItems = data.items; // 缓存数据供阈值弹窗实时预览

    // 单次遍历：计算逾期 + 部门分组 + 汇总统计（合并原 4 次遍历）
    var deptMap = {}, summary = { total: 0, d3in: 0, d37: 0, d7: 0, dormant: 0 };
    data.items.forEach(function(item) {
      var od = calcOverdue(item);
      item.overdue_level = od.level;
      item.overdue_label = od.label;
      item.overdue_hours = od.hours;
      item.overdue_reason = od.reason;

      // 呆滞治具计数（dormant_days 非空 = 呆滞）
      if (item.dormant_days != null) summary.dormant++;

      var dept = item.resp_dept || '-';
      if (!deptMap[dept]) deptMap[dept] = { dept: dept, total: 0, d3in: 0, d37: 0, d7: 0 };
      deptMap[dept].total++;
      // 互斥三档：0=正常(≤3天) 1=3~7天 2=7天以上
      if (item.overdue_level === 0) deptMap[dept].d3in++;
      if (item.overdue_level === 1) deptMap[dept].d37++;
      if (item.overdue_level === 2) deptMap[dept].d7++;

      summary.total++;
      if (item.overdue_level === 0) summary.d3in++;
      if (item.overdue_level === 1) summary.d37++;
      if (item.overdue_level === 2) summary.d7++;
    });

    // 按逾期等级 + 停留时长排序
    data.items.sort(function(a, b) {
      if (a.overdue_level !== b.overdue_level) return b.overdue_level - a.overdue_level;
      if (a.dwell_hours !== b.dwell_hours) return b.dwell_hours - a.dwell_hours;
      if (a.item_type !== b.item_type) return a.item_type > b.item_type ? 1 : -1;
      return a.item_no > b.item_no ? 1 : -1;
    });

    view.style = '';
    view.innerHTML =
      renderSummaryCards(Object.values(deptMap), summary) +
      renderFilterBar() +
      renderItemTable(data.items);

    // 恢复筛选状态（类型/等级下拉 + 部门卡）
    if (keepFilter && _filterCache) {
      var ft = document.getElementById('filter-type');
      var fl = document.getElementById('filter-level');
      if (ft) ft.value = _filterCache.type || '';
      if (fl) fl.value = _filterCache.level || '';
    }
    if (_deptFilter) {
      var dc = document.querySelector('.kb-stat[data-dept="' + _deptFilter + '"]');
      if (dc) dc.classList.add('active');
    }
    doFilter();
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

function renderFilterBar() {
  // 阈值设置按钮仅 ADMIN 可见（全局生效配置）
  var isAdmin = typeof me !== 'undefined' && me && me.role === 'ADMIN';
  var settingsBtn = isAdmin
    ? '<button class="btn btn-sm" onclick="openThresholdModal()" style="margin-left:8px">阈值设置</button>'
    : '';
  var tl = tierLabels(); // 筛选选项标签随当前阈值动态生成
  return '<div class="filters" style="margin:16px 0">' +
    '<select class="filter-select" id="filter-type" onchange="doFilter()">' +
      '<option value="">全部类型</option>' +
      '<option value="sample">样品</option>' +
      '<option value="fixture">治具</option>' +
    '</select>' +
    '<select class="filter-select" id="filter-level" onchange="doFilter()">' +
      '<option value="">全部积压等级</option>' +
      '<option value="0">' + tl[0] + '</option>' +
      '<option value="1">' + tl[1] + '</option>' +
      '<option value="2">' + tl[2] + '</option>' +
    '</select>' +
    '<button class="btn btn-sm" onclick="renderWorkbenchDashboard(true)" style="margin-left:8px">刷新</button>' +
    settingsBtn +
    '</div>';
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
      : '<span class="wb-type-tag fixture">治具</span>';

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

function doFilter() {
  var typeVal = document.getElementById('filter-type').value;
  var levelVal = document.getElementById('filter-level').value;
  _filterCache = { type: typeVal, level: levelVal };
  var rows = document.querySelectorAll('#wb-table tbody tr');
  var n = 0;
  rows.forEach(function(tr) {
    var show = true;
    if (typeVal && tr.getAttribute('data-type') !== typeVal) show = false;
    if (levelVal !== '' && tr.getAttribute('data-level') !== levelVal) show = false;
    if (_deptFilter && tr.getAttribute('data-dept') !== _deptFilter) show = false;
    tr.style.display = show ? '' : 'none';
    if (show) { n++; tr.cells[0].textContent = n; } // 可见行重新编号，保证筛选后序号连续
  });
}

// 部门卡交互：单击筛选该部门，再次点击取消
function filterByDept(el) {
  var dept = el.dataset.dept;
  _deptFilter = (_deptFilter === dept) ? null : dept;
  document.querySelectorAll('.kb-stat').forEach(function(c) {
    c.classList.toggle('active', c.dataset.dept ? c.dataset.dept === _deptFilter : !_deptFilter);
  });
  doFilter();
}

// 总计卡交互：清除部门筛选
function clearDeptFilter() {
  _deptFilter = null;
  document.querySelectorAll('.kb-stat').forEach(function(c) { c.classList.remove('active'); });
  var total = document.querySelector('.wb-card-total');
  if (total) total.classList.add('active');
  doFilter();
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
