// subsystems/workbench/frontend/js/views/overdue.js
// 逾期判断逻辑（独立模块，dashboard.js 渲染层调用）

// ===== 积压阈值配置（单位：小时，默认值；启动时从 /api/workbench/settings 覆盖，ADMIN 可改，全局生效）=====
// warn：正常与「3~7天」档的边界（默认 3 天 = 72h）
// bad ：「3~7天」与「7天以上」档的边界（默认 7 天 = 168h）
var OVERDUE_BOUNDS = { warn: 72, bad: 168 };
var _boundsLoaded = false;

// 从后端加载全局阈值（每个页面会话只拉取一次；失败时保留默认值不阻断渲染）
async function loadOverdueBounds() {
  if (_boundsLoaded) return;
  try {
    var data = await api('GET', '/api/workbench/settings');
    if (data && data.warn > 0 && data.bad > 0) {
      OVERDUE_BOUNDS = { warn: Number(data.warn), bad: Number(data.bad) };
    }
  } catch (err) {
    // 拉取失败保留默认值
  } finally {
    _boundsLoaded = true;
  }
}

var OVERDUE_STYLES = {
  0: { color: '#16a34a', bg: '#f0fdf4' },   // 正常（3天内）
  1: { color: '#ea580c', bg: '#fff7ed' },   // 3~7天
  2: { color: '#dc2626', bg: '#fef2f2' }    // 7天以上
};

// 根据阈值边界生成三档显示标签（随配置动态变化，改阈值后卡片/表格立即体现）
function tierLabels(b) {
  b = b || OVERDUE_BOUNDS;
  var wd = Math.round(b.warn / 24), bd = Math.round(b.bad / 24);
  return { 0: '≤' + wd + '天', 1: wd + '~' + bd + '天', 2: '>' + bd + '天' };
}

/**
 * 计算积压等级（互斥三档）
 * level: 0=正常(≤warn) 1=warn~bad 2=>bad；标签随阈值动态生成
 */
function calcOverdue(item, cfg) {
  var b = cfg || OVERDUE_BOUNDS;
  var hours = 0, reason = '';

  if (item.item_type === 'sample') {
    hours = _sampleOverdueHours(item);
    reason = _sampleOverdueReason(item);
    // P2 fix: NEW/PRODUCED 阈值放大 3 倍
    if (item.status === 'NEW' || item.status === 'PRODUCED') hours = hours / 3;
  } else if (item.item_type === 'fixture') {
    var fixt = _fixtureOverdue(item);
    hours = fixt.hours;
    reason = fixt.reason;
  }

  var level = 0;
  if (hours > b.bad) level = 2;
  else if (hours > b.warn) level = 1;

  return { level: level, label: tierLabels(b)[level], hours: Math.round(hours), reason: reason };
}

function _sampleOverdueHours(item) {
  var s = item.status;
  if (s === 'RETURNING') return item.dwell_hours || 0;
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    var d = new Date(item.next_inspect_at).getTime();
    if (d < Date.now()) return Math.round((Date.now() - d) / 3600000);
    return 0;
  }
  return item.dwell_hours || 0;
}

function _sampleOverdueReason(item) {
  var s = item.status;
  if (s === 'RETURNING') return '退回审核中停留';
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    if (new Date(item.next_inspect_at).getTime() < Date.now()) return '复检逾期';
    return '';
  }
  return '停留中(' + (item.stage_cn || '') + ')';
}

/**
 * 治具逾期判断（合并原 _fixtureOverdueHours + _fixtureOverdueReason 两次状态分支为一次）
 * 消除 ~20 行重复的状态条件链
 */
function _fixtureOverdue(item) {
  var s = item.status, now = Date.now(), hours = 0, reason = '';

  if (s === 'IN_USE' && item.expected_return_at) {
    var er = new Date(item.expected_return_at).getTime();
    if (er < now) { hours = Math.round((now - er) / 3600000); reason = '归还逾期'; }
    // else: 未到期，hours=0, reason=''
  } else if (s === 'ACCEPTED' && item.expected_finish_at) {
    var ef = new Date(item.expected_finish_at).getTime();
    if (ef < now) { hours = Math.round((now - ef) / 3600000); reason = '制作超期'; }
  } else if (s === 'REPAIRING_ME' || s === 'REPAIRING_RD' || s === 'IMPROVING') {
    // 维修/改善优先检查 expected_finish_at，未超期则不算积压
    if (item.expected_finish_at) {
      var ef2 = new Date(item.expected_finish_at).getTime();
      if (ef2 < now) {
        hours = Math.round((now - ef2) / 3600000);
        if (s === 'REPAIRING_ME') reason = 'ME维修超期';
        else if (s === 'REPAIRING_RD') reason = 'RD维修超期';
        else reason = '改善超期';
      }
      // else: 未超期，hours=0, reason='' — 正常
    } else {
      // 无预计完成时间则按报修时间作为兜底
      if (item.repair_requested_at) {
        hours = Math.round((now - new Date(item.repair_requested_at).getTime()) / 3600000);
      } else {
        hours = item.dwell_hours || 0;
      }
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
