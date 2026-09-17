// list-inspect.js — 样品复检状态计算、展示文案与徽章渲染
// 展示态：ok 正常 / soon 近7天到期 / overdue 已逾期 / na 不适用（状态层面无复检语义）/ none 无计划（状态适用但字段为空）
// 阈值与列表快捷筛选「近7天」（overdue=7）保持一致
// 逾期天数统一 Math.ceil 向上取整（与治具看板/详情一致）：刚超期即显示 1 天
// 2026-09-16（用户确认方案 A）：新增「不适用」判定；RELEASED / CHECKED_OUT 保留文字但灰化，不出红色逾期徽章
//   —— 领用中样品复检日到期不再显示「逾期N天」（.b-overdue 带 1.5s 无限脉冲动画，持续红闪等于仍在报警）

var INSPECT_SOON_DAYS = 7;

// 不适用集合：状态层面不存在复检语义（未发行 / 退回审核中 / 已作废）
var INSPECT_NA_STATUSES = ['RETURNING', 'RETIRED', 'NEW', 'PRODUCED'];

// 灰化集合：有复检语义但不出红色徽章（已发行未接收保管 / 领用中计时暂停）
var INSPECT_GREY_STATUSES = ['RELEASED', 'CHECKED_OUT'];

/** 计算复检状态：'none'|'na'|'ok'|'soon'|'overdue'
 *  判定顺序：① s 为空 → none；② status 存在且属不适用集合 → na；③ 无 next_inspect_at → none；④ 三态。
 *  注意：守卫必须是「status 存在且不适用」，不可写成「无 status → na」——tests/inspect-state.test.js 锁定空对象 → none */
function inspectState(s) {
  if (!s) return 'none';
  if (s.status && INSPECT_NA_STATUSES.indexOf(s.status) >= 0) return 'na';
  if (!s.next_inspect_at) return 'none';
  var t = new Date(s.next_inspect_at).getTime();
  if (t < Date.now()) return 'overdue';
  if (t <= Date.now() + INSPECT_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 悬停说明 title：不适用态给状态原因、无计划态给「未设置复检计划」，其余态返回 ''（沿用徽章的复检日期提示）。
 *  2026-09-17 修复 P1-1：返回值语义已收紧为「只含字面量常量与安全文本，可直接进双引号属性」。
 *  原因值属非本函数产出的数据，在数据层先经 e() 中和 < > " ' &（§25.2.2-1），属性拼接处再兜一层 e()（§25.2.2-3）。
 *  双重转义不改变最终显示：属性值在解析时被解码一次，故页面显示仍是原始原因文本（& 显示为 &、< 显示为 <）。 */
function inspectReason(s) {
  if (!s) return '';
  if (s.status === 'RETIRED') return '已作废，复检计划不适用（原因：' + e(s.retired_reason || '—') + '）';
  if (s.status === 'RETURNING') return '退回审核中，复检计划已顺延';
  if (s.status === 'NEW' || s.status === 'PRODUCED') return '未发行，无复检计划';
  if (s.status === 'CHECKED_OUT') return '领用中，复检计划暂停';
  if (inspectState(s) === 'none') return '未设置复检计划';
  return '';
}

/** 展示文案：列表「复检状态」列 / 「复检到期」列 / 详情复检行 的唯一口径 */
function inspectText(s) {
  var st = inspectState(s);
  if (st === 'na') return '不适用';
  if (s && s.status === 'CHECKED_OUT') return '领用中·暂停复检';
  if (st === 'none') return '—';
  if (st === 'ok') return '正常';
  if (st === 'soon') return '近7天到期';
  return '逾期' + Math.ceil((Date.now() - new Date(s.next_inspect_at).getTime()) / 86400000) + '天';
}

/** 徽章色调：'grey' 灰字（不适用/无计划/领用中/已发行未接收保管）/ 'red' 红色逾期徽章 / '' 普通徽章（ok、soon） */
function inspectTone(s) {
  var st = inspectState(s);
  if (st === 'na' || st === 'none') return 'grey';
  if (s && INSPECT_GREY_STATUSES.indexOf(s.status) >= 0) return 'grey';
  return st === 'overdue' ? 'red' : '';
}

/** 渲染复检状态徽章 HTML（灰化态输出 .muted ＋ 原因 title；不适用态 MUST NOT 继承 .b-overdue 红脉冲） */
function inspectBadge(s) {
  var st = inspectState(s);
  var txt = inspectText(s);
  var reason = inspectReason(s);
  if (st === 'na' || st === 'none' || (s && s.status === 'CHECKED_OUT'))
    // title 为双引号属性上下文，reason 再经 e() 兜底（P1-1 第二层防御）；纯字面量 reason 不含 < > " ' 与 &，e() 为空操作
    return '<span class="muted"' + (reason ? ' title="' + e(reason) + '"' : '') + '>' + txt + '</span>';
  var tip = s.next_inspect_at ? ' title="复检日期：' + fmt(s.next_inspect_at) + '"' : '';
  if (inspectTone(s) === 'grey') return '<span class="muted"' + tip + '>' + txt + '</span>';
  if (st === 'ok') return '<span class="badge b-inspect-ok"' + tip + '>正常</span>';
  if (st === 'soon') return '<span class="badge b-inspect-soon"' + tip + '>近7天到期</span>';
  return '<span class="badge b-overdue"' + tip + '>' + txt + '</span>';
}
