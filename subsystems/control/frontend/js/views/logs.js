// subsystems/control/frontend/js/views/logs.js — 管制操作日志（ADMIN 全量审计视图）
// 后端端点 GET /api/control/logs 已按日志条数分页返回（LEFT JOIN 主单带 order_no/part_name）。
// 仅 ADMIN 可进入（router.js NAV.roles=['ADMIN']），列表行按 created_at 倒序。

var _ctlLogPage = 0;        // 分页游标（0 基）
var _ctlLogPageSize = 50;   // 每页日志条数

async function renderLogs() {
  var view = $('#view');
  view.innerHTML = '<div class="muted">加载中…</div>';
  try {
    var res = await api('GET', '/api/control/logs?limit=' + _ctlLogPageSize + '&offset=' + (_ctlLogPage * _ctlLogPageSize));
    var items = (res && res.items) || [];
    renderLogsSheet(items, res.total || 0);
  } catch (err) {
    view.innerHTML = '<div class="empty">日志加载失败：' + e((err && err.message) || err) + '</div>';
  }
}

/** 渲染日志表格 + 分页 */
function renderLogsSheet(rows, total) {
  var view = $('#view');
  if (!rows.length) { view.innerHTML = '<div class="empty">暂无日志记录</div>'; return; }
  var body = rows.map(function (l) {
    return '<tr><td class="mono">' + fmtTime(l.created_at) + '</td>'
      + '<td class="mono">' + e(l.order_no || '—') + '</td>'
      + '<td>' + e(CONTROL_ACTION_CN[l.action] || l.action) + '</td>'
      + '<td class="muted">' + e(l.role || '—') + '/' + e(l.dept || '—') + '</td>'
      + '<td class="muted">' + e(l.comment || '—') + '</td></tr>';
  }).join('');
  var maxPage = Math.max(0, Math.ceil((total || 0) / _ctlLogPageSize) - 1);
  var pager = '<div class="pager"><span class="muted">共 ' + (total || 0) + ' 条</span>'
    + '<button class="btn" ' + (_ctlLogPage <= 0 ? 'disabled' : '') + ' onclick="ctlLogPage(' + (_ctlLogPage - 1) + ')">上一页</button>'
    + '<span>' + (_ctlLogPage + 1) + '/' + (maxPage + 1) + '</span>'
    + '<button class="btn" ' + (_ctlLogPage >= maxPage ? 'disabled' : '') + ' onclick="ctlLogPage(' + (_ctlLogPage + 1) + ')">下一页</button></div>';
  view.innerHTML = '<div class="card" style="padding:0"><table class="grid"><thead><tr>'
    + '<th>时间</th><th>管制单号</th><th>动作</th><th>角色/部门</th><th>备注</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager;
}

/** 分页翻页：更新游标后重刷 */
function ctlLogPage(page) {
  _ctlLogPage = Math.max(0, page);
  renderLogs();
}
