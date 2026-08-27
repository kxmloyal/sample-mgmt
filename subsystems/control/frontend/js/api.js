// subsystems/control/frontend/js/api.js — 管制子系统入口（鉴权/登录/API 基础见 shared/api-base.js）
// fmt/e/toast 由 shared 提供（api-base.js 的 fmt/showToast，shared/utils.js 的 e/toast），此处另补管制专用时间格式。

var me = null;

function showApp() {
  $('#app').style.display = 'flex';
  $('#me-name').textContent = me.display_name || me.username;
  $('#me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
  buildNav(); route();
}

// ISO 时间串 → YYYY-MM-DD HH:mm（管制单时间列显示，与后端 fmtTime 口径一致）
function fmtTime(d) {
  if (!d) return '—';
  var s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var M = String(dt.getMonth() + 1), D = String(dt.getDate()), h = String(dt.getHours()), mi = String(dt.getMinutes());
    if (M.length < 2) M = '0' + M; if (D.length < 2) D = '0' + D;
    if (h.length < 2) h = '0' + h; if (mi.length < 2) mi = '0' + mi;
    return dt.getFullYear() + '-' + M + '-' + D + ' ' + h + ':' + mi;
  }
  return s.replace('T', ' ').slice(0, 16);
}

// 覆盖 shared/api-base.js 的 statusBadge：管制状态中文 + .b-<status> class（颜色见 module.css）
function statusBadge(row) {
  var st = row.status || 'DRAFT';
  return '<fluent-badge class="badge b-' + st + '" appearance="filled">' + (CONTROL_STATUS_CN[st] || st) + '</fluent-badge>';
}
