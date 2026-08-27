// subsystems/workbench/db/workbench-overdue.js
// 积压等级计算 service（单一事实来源，迁移自 frontend/js/views/overdue.js）
// 注意：前端 overdue.js 的 calcOverdue 仅保留给阈值弹窗临时预览用，修改此处 MUST 同步 overdue.js 保持一致

// 生成三档显示标签（随阈值动态变化）
function tierLabels(b) {
  b = b || { warn: 72, bad: 168 };
  var wd = Math.round(b.warn / 24), bd = Math.round(b.bad / 24);
  return { 0: '≤' + wd + '天', 1: wd + '~' + bd + '天', 2: '>' + bd + '天' };
}

/**
 * 计算积压等级（互斥三档）：0=正常(≤warn) 1=warn~bad 2=>bad
 * @param {Object} item 工作台行（含 item_type/status/dwell_hours/next_inspect_at 等）
 * @param {Object} cfg 阈值 { warn, bad }（小时），缺省 72/168
 * @returns {{level:number,label:string,hours:number,reason:string}}
 */
function calcOverdue(item, cfg) {
  var b = cfg || { warn: 72, bad: 168 };
  var hours = 0, reason = '';
  if (item.item_type === 'sample') {
    hours = sampleOverdueHours(item);
    reason = sampleOverdueReason(item);
    // NEW/PRODUCED 阈值放大 3 倍
    if (item.status === 'NEW' || item.status === 'PRODUCED') hours = hours / 3;
  } else if (item.item_type === 'fixture') {
    var fx = fixtureOverdue(item);
    hours = fx.hours;
    reason = fx.reason;
  } else if (item.item_type === 'control') {
    // 管制无呆滞/预期时限概念：按停留时长复用统一阈值（dormant_days 恒 NULL）
    hours = item.dwell_hours || 0;
    reason = '停留中(' + (item.stage_cn || '') + ')';
  }
  var level = 0;
  if (hours > b.bad) level = 2;
  else if (hours > b.warn) level = 1;
  return { level: level, label: tierLabels(b)[level], hours: Math.round(hours), reason: reason };
}

function sampleOverdueHours(item) {
  var s = item.status;
  if (s === 'RETURNING') return item.dwell_hours || 0;
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    var d = new Date(item.next_inspect_at).getTime();
    if (d < Date.now()) return Math.round((Date.now() - d) / 3600000);
    return 0;
  }
  return item.dwell_hours || 0;
}

function sampleOverdueReason(item) {
  var s = item.status;
  if (s === 'RETURNING') return '退回审核中停留';
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    if (new Date(item.next_inspect_at).getTime() < Date.now()) return '复检逾期';
    return '';
  }
  return '停留中(' + (item.stage_cn || '') + ')';
}

// 治具逾期判断：状态分支（expected_finish_at 优先、repair_requested_at 兜底）
function fixtureOverdue(item) {
  var s = item.status, now = Date.now(), hours = 0, reason = '';
  if (s === 'IN_USE' && item.expected_return_at) {
    var er = new Date(item.expected_return_at).getTime();
    if (er < now) { hours = Math.round((now - er) / 3600000); reason = '归还逾期'; }
  } else if (s === 'ACCEPTED' && item.expected_finish_at) {
    var ef = new Date(item.expected_finish_at).getTime();
    if (ef < now) { hours = Math.round((now - ef) / 3600000); reason = '制作超期'; }
  } else if (s === 'REPAIRING_ME' || s === 'REPAIRING_RD' || s === 'IMPROVING') {
    if (item.expected_finish_at) {
      var ef2 = new Date(item.expected_finish_at).getTime();
      if (ef2 < now) {
        hours = Math.round((now - ef2) / 3600000);
        if (s === 'REPAIRING_ME') reason = 'ME维修超期';
        else if (s === 'REPAIRING_RD') reason = 'RD维修超期';
        else reason = '改善超期';
      }
    } else if (item.repair_requested_at) {
      hours = Math.round((now - new Date(item.repair_requested_at).getTime()) / 3600000);
      if (s === 'REPAIRING_ME') reason = 'ME维修中';
      else if (s === 'REPAIRING_RD') reason = 'RD维修中';
      else reason = '改善中';
    } else {
      hours = item.dwell_hours || 0;
      if (s === 'REPAIRING_ME') reason = 'ME维修中';
      else if (s === 'REPAIRING_RD') reason = 'RD维修中';
      else reason = '改善中';
    }
  } else if (item.next_maintenance_at && new Date(item.next_maintenance_at).getTime() < now) {
    hours = Math.round((now - new Date(item.next_maintenance_at).getTime()) / 3600000);
    reason = '保养逾期';
  } else {
    hours = item.dwell_hours || 0;
    if (s === 'REQUESTED') reason = '待接收停留';
    else if (s === 'VERIFY_PENDING') reason = '待验证停留';
    else if (s === 'TRANSFERRED') reason = '待领用停留';
    else if (s === 'REPAIR_DONE') reason = '待确认维修停留';
    else reason = '停留中(' + (item.stage_cn || '') + ')';
  }
  return { hours: hours, reason: reason };
}

module.exports = { calcOverdue, tierLabels };
