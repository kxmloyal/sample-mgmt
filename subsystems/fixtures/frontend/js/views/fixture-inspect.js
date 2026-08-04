// fixture-inspect.js — 治具到期状态计算与徽章渲染
// 两个到期维度：保养（next_maintenance_at，未报废即参与）+ 领用归还（expected_return_at，仅 IN_USE）
// 判定与后端 dao 一致：保养 listOverdue/UpcomingMaintenance；归还 listOverdueFixtures
// 逾期天数统一 Math.ceil 向上取整（与治具看板/详情一致）：刚超期即显示 1 天

var FIXTURE_SOON_DAYS = 7;

/** 保养状态：'none'|'ok'|'soon'|'overdue'（已报废或无保养计划返回 none） */
function maintState(f) {
  if (!f || f.retired_at || !f.next_maintenance_at) return 'none';
  var t = new Date(f.next_maintenance_at).getTime();
  if (t <= Date.now()) return 'overdue';
  if (t <= Date.now() + FIXTURE_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 归还状态：'none'|'ok'|'soon'|'overdue'（仅领用中且有归还期限时参与） */
function returnState(f) {
  if (!f || f.status !== 'IN_USE' || !f.expected_return_at) return 'none';
  var t = new Date(f.expected_return_at).getTime();
  if (t < Date.now()) return 'overdue';
  if (t <= Date.now() + FIXTURE_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 通用徽章渲染：none 灰色占位；ok/soon 用各自类；overdue 复用共享 .b-overdue */
function _dueBadge(st, date, okCls, soonCls, overdueLabel) {
  if (st === 'none') return '<span class="muted">—</span>';
  var tip = date ? ' title="到期日：' + fmt(date) + '"' : '';
  if (st === 'ok') return '<span class="badge ' + okCls + '"' + tip + '>正常</span>';
  if (st === 'soon') return '<span class="badge ' + soonCls + '"' + tip + '>近7天到期</span>';
  var days = Math.ceil((Date.now() - new Date(date).getTime()) / 86400000);
  return '<span class="badge b-overdue"' + tip + '>' + overdueLabel + days + '天</span>';
}

/** 保养状态徽章 HTML */
function maintBadge(f) {
  return _dueBadge(maintState(f), f && f.next_maintenance_at, 'b-maint-ok', 'b-maint-soon', '逾期');
}

/** 归还状态徽章 HTML */
function returnBadge(f) {
  return _dueBadge(returnState(f), f && f.expected_return_at, 'b-ret-ok', 'b-ret-soon', '超期');
}
