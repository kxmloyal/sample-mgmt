// list-inspect.js — 样品复检状态计算与徽章渲染
// 三态：ok 正常 / soon 近7天到期 / overdue 已逾期；无复检计划显示占位符（none）
// 阈值与列表快捷筛选「近7天」（overdue=7）保持一致
// 逾期天数统一 Math.ceil 向上取整（与治具看板/详情一致）：刚超期即显示 1 天

var INSPECT_SOON_DAYS = 7;

/** 计算复检状态：'none'|'ok'|'soon'|'overdue'（s 为空或无 next_inspect_at 返回 none） */
function inspectState(s) {
  if (!s || !s.next_inspect_at) return 'none';
  var t = new Date(s.next_inspect_at).getTime();
  if (t < Date.now()) return 'overdue';
  if (t <= Date.now() + INSPECT_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 渲染复检状态徽章 HTML（none 显示灰色占位符，徽章带复检日期悬停提示） */
function inspectBadge(s) {
  var st = inspectState(s);
  if (st === 'none') return '<span class="muted">—</span>';
  var tip = s.next_inspect_at ? ' title="复检日期：' + fmt(s.next_inspect_at) + '"' : '';
  if (st === 'ok') return '<span class="badge b-inspect-ok"' + tip + '>正常</span>';
  if (st === 'soon') return '<span class="badge b-inspect-soon"' + tip + '>近7天到期</span>';
  var days = Math.ceil((Date.now() - new Date(s.next_inspect_at).getTime()) / 86400000);
  return '<span class="badge b-overdue"' + tip + '>逾期' + days + '天</span>';
}
