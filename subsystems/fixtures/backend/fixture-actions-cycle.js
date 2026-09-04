// routes/fixture-actions-cycle.js — 接收/撤销/归还/领用 action 执行器
// 2026-09-04 提交②：RETURN 归还借用关系校验（"行动主体才看待办"口径的授权层下沉）：
// 归还人 = 借用人本人 / 借用人同部门（管理方代办） / ME(设备管理口) / ADMIN；其他部门 CUSTODY/QA 不再放行
// （旧行为：任何 ME/QA/CUSTODY 均可归还，FQC 借的治具可被制造部"代还"，借用关系被无声清除）
var D = require('../../../db');

function canReturnFixture(u, f) {
  if (u.role === 'ME' || u.role === 'ADMIN') return true;
  if (String(f.used_by) === String(u.id)) return true;          // 借用人本人
  if (f.used_by_dept && f.used_by_dept === u.dept) return true; // 借用人同部门代办
  return false;
}

async function doAccept(updated, u, ts, f, note, expectedDays) {
  if (!expectedDays || expectedDays <= 0) throw { status: 400, message: '请填写预计完成天数' };
  var ed = new Date(ts); ed.setDate(ed.getDate() + expectedDays);
  updated.expected_finish_at = ed.toISOString();
  updated.status = 'ACCEPTED';
  await D.addFixtureLog({ fixture_id: f.id, action: 'ACCEPT', role: u.role, user_id: u.id, dept: u.dept,
    note: 'RD已接收，预计' + expectedDays + '天后完成' });
  return updated;
}

async function doCancel(updated, u, ts, f, note) {
  if (f.requested_by !== u.id) throw { status: 403, message: '仅申请人可撤销自己的申请' };
  updated.status = 'RETIRED'; updated.retired_reason = note || '申请人撤销';
  updated.retired_by = u.id; updated.retired_at = ts;
  await D.addFixtureLog({ fixture_id: f.id, action: 'CANCEL', role: u.role, user_id: u.id, dept: u.dept,
    note: note || '申请人撤销申请' });
  return updated;
}

async function doReturn(updated, u, ts, f, note) {
  if (!canReturnFixture(u, f)) {
    throw { status: 403, message: '归还须由借用人（本人或同部门）或生技/管理员执行' };
  }
  updated.status = 'TRANSFERRED';
  updated.expected_return_days = null; updated.expected_return_at = null;
  await D.addFixtureLog({ fixture_id: f.id, action: 'RETURN', role: u.role, user_id: u.id, dept: u.dept,
    note: note || '使用完毕归还' });
  return updated;
}

async function doUse(updated, u, ts, f, location, days, note) {
  var d = Number(days);
  updated.used_by = u.id; updated.used_at = ts; updated.use_location = location.trim();
  updated.expected_return_days = d;
  var ed = new Date(ts); ed.setDate(ed.getDate() + d);
  updated.expected_return_at = ed.toISOString(); updated.use_note = note || '';
  updated.status = 'IN_USE';
  await D.addFixtureLog({ fixture_id: f.id, action: 'USE', role: u.role, user_id: u.id, dept: u.dept, note: '领用，预计' + d + '天后归还' });
  return updated;
}

async function doMaintenance(fixture, body, user) {
  var maintDate = body.maintenance_date ? new Date(body.maintenance_date) : new Date();
  var updated = { ...fixture, last_maintenance_at: maintDate.toISOString() };

  // 计算下次保养时间
  var cycle = fixture.maintenance_cycle_days || 0;
  if (body.next_maintenance_at) {
    updated.next_maintenance_at = body.next_maintenance_at;
  } else if (cycle > 0) {
    var next = new Date(maintDate);
    next.setDate(next.getDate() + cycle);
    updated.next_maintenance_at = next.toISOString();
  } else {
    updated.next_maintenance_at = null;
  }

  // 更新数据库: 传完整 updated（部分对象会把未含字段置 NULL，2026-09-02 修复）
  await D.updateFixture(updated, fixture, null, fixture.version);

  // 写日志: addFixtureLog 签名为 ({ fixture_id, action, role, user_id, dept, note })
  await D.addFixtureLog({ fixture_id: fixture.id, action: 'MAINTENANCE', role: user.role, user_id: user.id, dept: user.dept, note: body.note || '' });

  return updated;
}

module.exports = { doAccept, doCancel, doReturn, doUse, doMaintenance };
