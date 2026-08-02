// fixture-dashboard.js — 治具看板
var _dashData = null, _dashFilter = 0; // 当前激活的统计卡索引，0=待处理（默认）
// 统计卡配置：[标签, 状态筛选键, 数据源键]
var DASH_STATS = [
  { label: '待处理', status: null,   countKey: 'myPending' },
  { label: '待验证', status: 'VERIFY_PENDING', countByStatus: true },
  { label: '领用中', status: 'IN_USE',         countByStatus: true },
  { label: '已接收', status: 'ACCEPTED',       countByStatus: true },
  { label: '改善中', status: 'IMPROVING',       countByStatus: true },
  { label: '待保养', status: 'MAINTENANCE_DUE', countByStatus: true }
];

async function renderFixtureDashboard() {
  try {
    _dashData = await api('GET', '/api/fixtures/dashboard');
    _dashFilter = 0;
    _renderDashContent();
  } catch (e) { document.getElementById('view').innerHTML = '<div class="hint">加载失败：' + e.message + '</div>'; }
}

function filterDashStats(idx) {
  // 索引式 toggle：点击同一卡片回退到默认（待处理），否则切换到目标卡片
  _dashFilter = (_dashFilter === idx) ? 0 : idx;
  _renderDashContent();
}

function esc(s) { return (s||'').replace(/'/g,"\\'"); }

function _renderDashContent() {
  var d = _dashData, s = d.byStatus;

  // 统计卡片
  var html = '<div class="row">' + DASH_STATS.map(function(cfg, i) {
    var count = cfg.countByStatus ? (cfg.status === 'MAINTENANCE_DUE' ? (d.maintenanceOverdueCount || 0) + (d.maintenanceUpcomingCount || 0) : (s[cfg.status] || 0)) : (cfg.countKey === 'total' ? d.total : d.myPending.length);
    var isActive = (_dashFilter === i);
    var cls = isActive ? ' active' : '';
    return '<fluent-card class="kb-stat' + cls + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></fluent-card>';
  }).join('') + '</div>';

  // 逾期表
  if (d.overdue.length > 0) {
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">逾期未归还 (' + d.overdue.length + ')</h3>';
    html += '<fluent-data-grid><fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">编号</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">名称</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">部门</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">状态</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">预计归还</fluent-data-grid-cell></fluent-data-grid-row>';
    html += d.overdue.map(function(f) {
      return '<fluent-data-grid-row style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><fluent-data-grid-cell><b>' + e(f.fixture_no || '—') + '</b></fluent-data-grid-cell><fluent-data-grid-cell>' + e(f.name || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + e(f.requested_dept || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + statusBadge(f) + '</fluent-data-grid-cell><fluent-data-grid-cell style="color:var(--bad);font-weight:600">' + fmt(f.expected_return_at) + '</fluent-data-grid-cell></fluent-data-grid-row>';
    }).join('');
    html += '</fluent-data-grid></div>';
  }

  // 逾期保养预警表
  var maintPending = (d.maintenanceOverdue || []).concat(d.maintenanceUpcoming || []);
  if (maintPending.length > 0) {
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">待保养治具 (' + maintPending.length + ')</h3>';
    html += '<fluent-data-grid><fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">编号</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">名称</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">存放位置</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">上次保养</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">应保养日期</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">状态</fluent-data-grid-cell></fluent-data-grid-row>';
    html += maintPending.map(function(f) {
      var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
      var overdueDays = isOverdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
      var label = isOverdue ? '<span style="color:var(--bad);font-weight:600">已逾期' + overdueDays + '天</span>' : '<span style="color:#d97706">即将到期</span>';
      var cls = isOverdue ? 'overdue-row' : '';
      return '<fluent-data-grid-row class="' + cls + '" style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><fluent-data-grid-cell><b>' + e(f.fixture_no || '—') + '</b></fluent-data-grid-cell><fluent-data-grid-cell>' + e(f.name || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell class="muted">' + e(f.storage_location || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + fmt(f.last_maintenance_at) + '</fluent-data-grid-cell><fluent-data-grid-cell style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + '</fluent-data-grid-cell><fluent-data-grid-cell>' + label + '</fluent-data-grid-cell></fluent-data-grid-row>';
    }).join('');
    html += '</fluent-data-grid></div>';
  }

  // 待办表（根据筛选）
  var filterCfg = DASH_STATS[_dashFilter];

  // MAINTENANCE_DUE 筛选：显示保养到期列表
  if (filterCfg && filterCfg.status === 'MAINTENANCE_DUE') {
    if (maintPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (' + maintPending.length + ')</h3>';
      html += '<fluent-data-grid><fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">编号</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">名称</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">存放位置</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">上次保养</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">应保养日期</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">状态</fluent-data-grid-cell></fluent-data-grid-row>';
      html += maintPending.map(function(f) {
        var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
        var overdueDays = isOverdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
        var label = isOverdue ? '<span style="color:var(--bad);font-weight:600">已逾期' + overdueDays + '天</span>' : '<span style="color:#d97706">即将到期</span>';
        var cls = isOverdue ? 'overdue-row' : '';
        return '<fluent-data-grid-row class="' + cls + '" style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><fluent-data-grid-cell><b>' + e(f.fixture_no || '—') + '</b></fluent-data-grid-cell><fluent-data-grid-cell>' + e(f.name || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell class="muted">' + e(f.storage_location || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + fmt(f.last_maintenance_at) + '</fluent-data-grid-cell><fluent-data-grid-cell style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + '</fluent-data-grid-cell><fluent-data-grid-cell>' + label + '</fluent-data-grid-cell></fluent-data-grid-row>';
      }).join('');
      html += '</fluent-data-grid></div>';
    } else {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (0)</h3><div class="empty" style="padding:16px">暂无待保养治具</div></div>';
    }
    // 跳过常规待办表渲染
  } else {
  var filtered = filterCfg.status ? d.myPending.filter(function(f) { return f.status === filterCfg.status; }) : d.myPending;
  var titleExtra = filterCfg.status ? ' · ' + (STATUS[filterCfg.status] || filterCfg.status) : '';
  if (d.myPending.length > 0) {
    html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）<span style="font-weight:400;color:var(--muted)">' + titleExtra + ' (' + filtered.length + ')</span></h3>';
    if (filtered.length === 0) {
      html += '<div class="empty" style="padding:16px">暂无 ' + (filterCfg.status ? STATUS[filterCfg.status] || '' : '') + ' 状态的待办</div>';
    } else {
      html += '<fluent-data-grid><fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">#</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">编号</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">名称</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">规格</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">部门</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">待办类型</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">状态</fluent-data-grid-cell></fluent-data-grid-row>';
      html += filtered.map(function(f, i) {
        var pendingType = STATUS[f.status] || f.status;
        var extra = f.expected_finish_at ? ' | RD预计:' + fmt(f.expected_finish_at) : '';
        return '<fluent-data-grid-row style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><fluent-data-grid-cell class="muted">' + (i + 1) + '</fluent-data-grid-cell><fluent-data-grid-cell><b>' + fixtureNoVersion(f) + '</b></fluent-data-grid-cell><fluent-data-grid-cell>' + e(f.name || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell class="muted">' + e(f.spec || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + e(f.requested_dept || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + pendingType + '<small class="muted">' + extra + '</small></fluent-data-grid-cell><fluent-data-grid-cell>' + statusBadge(f) + '</fluent-data-grid-cell></fluent-data-grid-row>';
      }).join('');
      html += '</fluent-data-grid>';
    }
    html += '</div>';
  }
  }

  if (!d.overdue.length && !d.myPending.length && !d.total) {
    html += '<div class="empty">暂无治具数据，请先新建申请</div>';
  }
  document.getElementById('view').innerHTML = html;
  fixGridColumns(document.getElementById('view'));
}
