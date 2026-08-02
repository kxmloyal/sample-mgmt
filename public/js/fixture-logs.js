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
  html += '<fluent-data-grid><fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">时间</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">操作</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">用户</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">部门</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">备注</fluent-data-grid-cell></fluent-data-grid-row>';
  logs.forEach(function (l) {
    html += '<fluent-data-grid-row><fluent-data-grid-cell><small>' + fmt(l.created_at) + '</small></fluent-data-grid-cell><fluent-data-grid-cell>' + (ACTION_CN[l.action] || l.action) + '</fluent-data-grid-cell><fluent-data-grid-cell>' + e(l.display_name || l.username || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + e(l.dept || '—') + '</fluent-data-grid-cell><fluent-data-grid-cell>' + e(l.note || '—') + '</fluent-data-grid-cell></fluent-data-grid-row>';
  });
  html += '</fluent-data-grid></div>';
  document.getElementById('view').innerHTML = html;
  fixGridColumns(document.getElementById('view'));
}
