// fixture-logs.js — 治具操作日志渲染

var _allFixtureLogs = [];

async function renderFixtureLogs() {
  try {
    _allFixtureLogs = await api('GET', '/api/fixtures/logs');
    renderFixtureLogsFiltered('');
  } catch (e) { document.getElementById('view').innerHTML = '<div class="hint">加载失败：' + e.message + '</div>'; }
}

function renderFixtureLogsFiltered(search) {
  var logs = _allFixtureLogs;
  if (search) {
    var s = search.toLowerCase();
    logs = logs.filter(function(l) {
      return (l.note && l.note.toLowerCase().indexOf(s) !== -1) || (ACTION_CN[l.action] || '').toLowerCase().indexOf(s) !== -1 || (l.dept || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  var html = '<div class="row" style="margin-bottom:12px">';
  html += '<fluent-text-field placeholder="搜索操作/部门/备注…" value="' + e(search) + '" oninput="renderFixtureLogsFiltered(this.value)" style="width:220px"></fluent-text-field>';
  html += '</div>';
  html += '<div class="card" style="padding:0">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">';
  html += '<span style="font-weight:600;font-size:14px">操作日志 (<b>' + logs.length + '</b>)</span></div>';
  html += '<table><thead><tr><th>时间</th><th>操作</th><th>用户</th><th>部门</th><th>备注</th></tr></thead><tbody>';
  logs.forEach(function (l) {
    html += '<tr><td><small>' + fmt(l.created_at) + '</small></td><td>' + (ACTION_CN[l.action] || l.action) + '</td><td>' + e(l.display_name || l.username || '—') + '</td><td>' + e(l.dept || '—') + '</td><td>' + e(l.note || '—') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  document.getElementById('view').innerHTML = html;
}
