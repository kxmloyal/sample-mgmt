// routes/fixture-actions-special.js — 改善/报废 action 执行器
var D = require('../db');

async function doImprove(updated, u, ts, f, note) {
  if (!note || !note.trim()) throw { status: 400, message: '请填写改善说明' };
  updated.improve_note = note.trim(); updated.status = 'IMPROVING';
  await D.addFixtureLog({ fixture_id: f.id, action: 'IMPROVE', role: u.role, user_id: u.id, dept: u.dept,
    note: note.trim() });
  return updated;
}

async function doImproveDone(updated, u, ts, f, note) {
  updated.improved_by = u.id; updated.improved_at = ts;
  updated.improvement_count = (f.improvement_count || 0) + 1;
  updated.status = 'VERIFY_PENDING';
  await D.addFixtureLog({ fixture_id: f.id, action: 'IMPROVE_DONE', role: u.role, user_id: u.id, dept: u.dept,
    note: note || ('改善完成，版次 V' + updated.improvement_count) });
  return updated;
}

async function doRetire(updated, u, ts, f, note) {
  updated.status = 'RETIRED'; updated.retired_by = u.id; updated.retired_at = ts; updated.retired_reason = note.trim();
  await D.addFixtureLog({ fixture_id: f.id, action: 'RETIRE', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
  return updated;
}

module.exports = { doImprove, doImproveDone, doRetire };
