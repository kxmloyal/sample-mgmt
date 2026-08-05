// fixture-logs.js — 治具操作日志渲染

var _allFixtureLogs = [];

async function renderFixtureLogs() {
  try {
    document.getElementById('view').innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
    _allFixtureLogs = await api('GET', '/api/fixtures/logs');
    renderFixtureLogsFiltered('');
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

function renderFixtureLogsFiltered(search) {
  var logs = _allFixtureLogs;
  if (search) {
    var s = search.toLowerCase();
    logs = logs.filter(function(l) {
      return (l.note && l.note.toLowerCase().indexOf(s) !== -1) || (ACTION_CN[l.action] || '').toLowerCase().indexOf(s) !== -1 || (l.dept || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  var html = '<div class="row fx-log-toolbar">';
  html += '<fluent-text-field placeholder="搜索操作/部门/备注…" value="' + e(search) + '" oninput="renderFixtureLogsFiltered(this.value)" style="width:min(220px,100%)"></fluent-text-field>';
  html += '</div>';
  html += '<div class="card" style="padding:0">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">';
  html += '<span style="font-weight:600;font-size:14px">操作日志 (<b>' + logs.length + '</b>)</span></div>';
  // 列宽自适应：时间/操作/用户/部门按内容（min-width 兜底），备注列弹性占余量（col-rsz 拖拽仍可用）
  html += '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="min-width:90px"><col style="min-width:80px"><col style="min-width:90px"><col style="width:auto;min-width:180px"></colgroup><thead><tr><th>时间<span class="col-rsz"></span></th><th>操作<span class="col-rsz"></span></th><th>用户<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>备注<span class="col-rsz"></span></th></tr></thead><tbody>';
  logs.forEach(function (l) {
    html += '<tr><td data-label="时间"><small>' + fmt(l.created_at) + '</small></td><td data-label="操作">' + (ACTION_CN[l.action] || l.action) + '</td><td data-label="用户">' + e(l.display_name || l.username || '—') + '</td><td data-label="部门">' + e(l.dept || '—') + '</td><td data-label="备注">' + e(l.note || '—') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  document.getElementById('view').innerHTML = html;
  setTimeout(function() { _initColResize(document.querySelector('.fx-dash-table')); }, 0);
}
