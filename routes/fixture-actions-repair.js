// routes/fixture-actions-repair.js — 维修 action 执行器
var D = require('../db');

async function doRepairME(updated, u, ts, f, note) {
  updated.repair_type = 'ME'; updated.repair_requested_by = u.id; updated.repair_requested_at = ts; updated.repair_note = note.trim();
  updated.status = 'REPAIRING_ME';
  await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_ME', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
  return updated;
}

async function doRepairRDReq(updated, u, ts, f, note) {
  updated.repair_type = 'RD'; updated.repair_requested_by = u.id; updated.repair_requested_at = ts; updated.repair_note = note.trim();
  updated.status = 'REPAIRING_RD';
  await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_RD_REQ', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
  return updated;
}

async function doRepairDone(updated, u, ts, f, note) {
  updated.repaired_by = u.id; updated.repaired_at = ts;
  updated.status = 'TRANSFERRED';
  await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_DONE', role: u.role, user_id: u.id, dept: u.dept, note: note || 'ME维修完成，已交回' });
  return updated;
}

async function doRepairRDDone(updated, u, ts, f, note, req) {
  var img2 = req.body.image;
  if (img2 && typeof img2 === 'string') {
    var url2 = await req.app.locals.saveSampleImage(img2, f.fixture_no + '_repair');
    if (url2) updated.repair_done_image = url2;
  }
  updated.repaired_by = u.id; updated.repaired_at = ts;
  updated.status = 'REPAIR_DONE';
  await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_RD_DONE', role: u.role, user_id: u.id, dept: u.dept, note: note || 'RD维修完成，待ME确认' });
  return updated;
}

async function doRepairConfirm(updated, u, ts, f, note, conn) {
  updated.repair_confirmed_by = u.id; updated.repair_confirmed_at = ts;
  updated.status = 'TRANSFERRED';
  updated.expected_return_days = null; updated.expected_return_at = null;
  await D.addFixtureLog({ fixture_id: f.id, action: 'REPAIR_CONFIRM', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() }, conn);
  return updated;
}

module.exports = { doRepairME, doRepairRDReq, doRepairDone, doRepairRDDone, doRepairConfirm };
