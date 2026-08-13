// fixture-dashboard.js — 治具看板
var _dashData = null, _dashFilter = 0; // 当前激活的统计卡索引，0=待处理（默认）
// 统计卡配置：[标签, 状态筛选键, 数据源键, 卡片状态色(对应 CSS 变量)]
var DASH_STATS = [
  { label: '待处理', status: null,             countKey: 'myPending', color: 'var(--brand)' },
  { label: '待验证', status: 'VERIFY_ALL', countByStatus: true,  color: 'var(--warn)' },
  { label: '领用中', status: 'IN_USE',          countByStatus: true,  color: '#1d4ed8' },
  { label: '已接收', status: 'ACCEPTED',       countByStatus: true,  color: '#065f46' },
  { label: '改善中', status: 'IMPROVING',       countByStatus: true,  color: '#92400e' },
  { label: '待保养', status: 'MAINTENANCE_DUE', countByStatus: true,  color: 'var(--bad)' },
  { label: '呆滞', status: 'DORMANT', dormantCount: true, color: '#b91c1c' }
];

async function renderFixtureDashboard() {
  try {
    document.getElementById('view').innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
    _dashData = await api('GET', '/api/fixtures/dashboard');
    _dashFilter = 0;
    _renderDashContent();
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

function filterDashStats(idx) {
  _dashFilter = (_dashFilter === idx) ? 0 : idx;
  _renderDashContent();
}

function esc(s) { return (s||'').replace(/'/g,"\\'"); }

// 渲染逾期未归还表
function _renderOverdueTable(items) {
  return '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="width:130px"><col style="width:100px"><col style="width:80px"><col style="width:100px"></colgroup><thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th><th>预计归还<span class="col-rsz"></span></th></tr></thead><tbody>' +
    items.map(function(f) {
      return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="编号"><b>' + e(f.fixture_no || '—') + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="预计归还" style="color:var(--bad);font-weight:600">' + fmt(f.expected_return_at) + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 渲染待保养治具表（逾期保养+即将到期保养共用）
function _renderMaintTable(items) {
  return '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="width:120px"><col style="width:90px"><col style="width:100px"><col style="width:100px"><col style="width:80px"></colgroup><thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>存放位置<span class="col-rsz"></span></th><th>上次保养<span class="col-rsz"></span></th><th>应保养日期<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th></tr></thead><tbody>' +
    items.map(function(f) {
      var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
      var overdueDays = isOverdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
      var label = isOverdue ? '<span style="color:var(--bad);font-weight:600">已逾期' + overdueDays + '天</span>' : '<span style="color:#d97706">即将到期</span>';
      var cls = isOverdue ? ' class="overdue-row"' : '';
      return '<tr' + cls + ' style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="编号"><b>' + e(f.fixture_no || '—') + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="存放位置" class="muted">' + e(f.storage_location || '—') + '</td><td data-label="上次保养">' + fmt(f.last_maintenance_at) + '</td><td data-label="应保养日期" style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + '</td><td data-label="状态">' + label + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 渲染呆滞治具表（状态停滞 / 在库无人领用）
function _renderDormantTable(items) {
  return '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="width:130px"><col style="width:90px"><col style="width:90px"><col style="width:110px"></colgroup><thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th><th>呆滞天数<span class="col-rsz"></span></th><th>原因<span class="col-rsz"></span></th></tr></thead><tbody>' +
    items.map(function(f) {
      return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="编号"><b>' + e(f.fixture_no || '—') + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="呆滞天数" style="color:var(--bad);font-weight:600">' + f.dormant_days + ' 天</td><td data-label="原因">' + e(f.dormant_reason || '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 呆滞阈值设置弹窗（仅 ADMIN 可见齿轮入口）
function openDormantSettings() {
  var cur = (_dashData && _dashData.dormantDays) || 60;
  openModal('呆滞阈值设置', '<div class="form-row"><label>呆滞判定阈值（天）</label><fluent-text-field id="dd-input" type="number" min="1" max="365" value="' + cur + '" style="width:100%"></fluent-text-field><p class="muted" style="margin:8px 0 0;font-size:12px">超过该天数未流转的治具将标记为呆滞（在库无人领用 / 状态长期停滞）</p></div>', {
    foot: '<fluent-button appearance="accent" onclick="saveDormantSettings()">保存</fluent-button><fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'))">取消</fluent-button>'
  });
}

async function saveDormantSettings() {
  var el = document.getElementById('dd-input');
  var days = parseInt(el ? el.value : '', 10);
  if (!days || days < 1 || days > 365) { showToast('阈值须为 1~365 天'); return; }
  try {
    var r = await api('PUT', '/api/fixtures/settings', { dormant_days: days });
    closeModal(document.querySelector('.modal-mask'));
    showToast('已保存：呆滞阈值 ' + r.dormant_days + ' 天');
    renderFixtureDashboard();
  } catch (e) { showToast(e.message); }
}

function _renderDashContent() {
  var d = _dashData;

  // 统计卡片（计数统一使用用户 myPending，而非全局 byStatus，确保点击前后数量一致）
  var html = '<div class="kb-stats">' + DASH_STATS.map(function(cfg, i) {
    var count;
    if (cfg.status === 'MAINTENANCE_DUE') {
      count = (d.maintenanceOverdueCount || 0) + (d.maintenanceUpcomingCount || 0);
    } else if (cfg.dormantCount) {
      count = d.dormantCount || 0;
    } else if (cfg.countByStatus) {
      // 按状态从 myPending 中统计当前用户可操作的条目数
      var statuses = cfg.status === 'VERIFY_ALL' ? ['VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK'] : [cfg.status];
      count = d.myPending.filter(function(f) { return statuses.indexOf(f.status) !== -1; }).length;
    } else {
      count = d.myPending.length;
    }
    var isActive = (_dashFilter === i);
    var cls = isActive ? ' active' : '';
    return '<fluent-card class="kb-stat' + cls + '" style="--stat-color:' + cfg.color + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></fluent-card>';
  }).join('') + '</div>';

  // 逾期表
  if (d.overdue.length > 0) {
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">逾期未归还 (' + d.overdue.length + ')</h3>' + _renderOverdueTable(d.overdue) + '</div>';
  }

  // 呆滞清单（标题右侧阈值齿轮，仅 ADMIN）
  if (d.dormant.length > 0) {
    var gear = (me && me.role === 'ADMIN') ? '<fluent-button appearance="lightweight" size="small" onclick="openDormantSettings()">⚙ 阈值 ' + d.dormantDays + ' 天</fluent-button>' : '<span class="muted" style="font-size:12px">阈值 ' + d.dormantDays + ' 天</span>';
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 12px"><h3 style="margin:0;color:var(--bad)">呆滞治具 (' + d.dormant.length + ')</h3>' + gear + '</div>' + _renderDormantTable(d.dormant) + '</div>';
  }

  // 逾期保养预警表
  var maintPending = (d.maintenanceOverdue || []).concat(d.maintenanceUpcoming || []);
  if (maintPending.length > 0) {
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">待保养治具 (' + maintPending.length + ')</h3>' + _renderMaintTable(maintPending) + '</div>';
  }

  // 待办表（根据筛选）
  var filterCfg = DASH_STATS[_dashFilter];

  if (filterCfg && filterCfg.status === 'MAINTENANCE_DUE') {
    if (maintPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (' + maintPending.length + ')</h3>' + _renderMaintTable(maintPending) + '</div>';
    } else {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (0)</h3><div class="empty" style="padding:16px">暂无待保养治具</div></div>';
    }
  } else if (filterCfg && filterCfg.status === 'VERIFY_ALL') {
    var verifyFiltered = d.myPending.filter(function(f) { return ['VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK'].indexOf(f.status) !== -1; });
    if (d.myPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）<span style="font-weight:400;color:var(--muted)"> · 待验证 (' + verifyFiltered.length + ')</span></h3>';
      if (verifyFiltered.length === 0) {
        html += '<div class="empty" style="padding:16px">暂无待验证的治具</div>';
      } else {
        html += '<table class="fx-dash-table"><colgroup><col style="width:36px"><col style="width:110px"><col style="width:130px"><col style="width:80px"><col style="width:90px"><col style="width:120px"><col style="width:80px"></colgroup><thead><tr><th>#<span class="col-rsz"></span></th><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>规格<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>待办类型<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th></tr></thead><tbody>' +
          verifyFiltered.map(function(f, i) {
            var pendingType = STATUS[f.status] || f.status;
            return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td class="muted" data-label="#">' + (i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格" class="muted">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="待办类型">' + pendingType + '</td><td data-label="状态">' + statusBadge(f) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      html += '</div>';
    }
  } else if (filterCfg && filterCfg.status === 'DORMANT') {
    // 呆滞清单已在常驻「呆滞治具」区块展示，此处仅处理无呆滞数据的空态，避免表格重复渲染
    if (d.dormant.length === 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">呆滞治具 (0)</h3><div class="empty" style="padding:16px">暂无呆滞治具</div></div>';
    }
  } else {
    var filtered = filterCfg.status ? d.myPending.filter(function(f) { return f.status === filterCfg.status; }) : d.myPending;
    var titleExtra = filterCfg.status ? ' · ' + (STATUS[filterCfg.status] || filterCfg.status) : '';
    if (d.myPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）<span style="font-weight:400;color:var(--muted)">' + titleExtra + ' (' + filtered.length + ')</span></h3>';
      if (filtered.length === 0) {
        html += '<div class="empty" style="padding:16px">暂无 ' + (filterCfg.status ? STATUS[filterCfg.status] || '' : '') + ' 状态的待办</div>';
      } else {
        html += '<table class="fx-dash-table"><colgroup><col style="width:36px"><col style="width:110px"><col style="width:130px"><col style="width:80px"><col style="width:90px"><col style="width:120px"><col style="width:80px"></colgroup><thead><tr><th>#<span class="col-rsz"></span></th><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>规格<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>待办类型<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th></tr></thead><tbody>' +
          filtered.map(function(f, i) {
            var pendingType = STATUS[f.status] || f.status;
            var extra = f.expected_finish_at ? ' | RD预计:' + fmt(f.expected_finish_at) : '';
            return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="#" class="muted">' + (i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格" class="muted">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="待办类型">' + pendingType + '<small class="muted">' + extra + '</small></td><td data-label="状态">' + statusBadge(f) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      html += '</div>';
    }
  }

  if (!d.overdue.length && !d.myPending.length && !d.total) {
    html += '<div class="empty">暂无治具数据，请先新建申请</div>';
  }
  document.getElementById('view').innerHTML = html;
  setTimeout(function() {
    document.querySelectorAll('.fx-dash-table').forEach(function(t) { _initColResize(t); });
  }, 0);
}
