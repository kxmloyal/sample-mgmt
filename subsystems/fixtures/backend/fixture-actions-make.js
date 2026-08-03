// routes/fixture-actions-make.js — 制作与单人验证 action 执行器
var D = require('../../../db');

async function doMake(updated, u, ts, f, note, req, conn) {
  var img = req.body.image;
  if (img && typeof img === 'string') {
    var url = await req.app.locals.saveSampleImage(img, f.fixture_no + '_made');
    if (url) updated.made_image = url;
  }
  updated.made_by = u.id; updated.made_at = ts;
  updated.status = 'VERIFY_PENDING';
  await D.addFixtureLog({ fixture_id: f.id, action: 'MAKE', role: u.role, user_id: u.id, dept: u.dept, note: note || '制作完成' }, conn);
  await D.addFixtureLog({ fixture_id: f.id, action: 'MAKE_DONE', role: u.role, user_id: u.id, dept: u.dept, note: '待申请单位验证' }, conn);
  return updated;
}

// 单人验证：仅需申请部门人员验证即可移交（移除 RD 双人验证环节）
async function doVerify(updated, u, ts, f, note) {
  var canVerify = u.dept === f.requested_dept || u.role === 'ME' || u.role === 'QA' || u.role === 'CUSTODY';
  if (!canVerify) throw { status: 403, message: '需要申请单位(' + f.requested_dept + ')或治具管理方(ME/QA/CUSTODY)执行验证' };
  updated.verified_me = u.id; updated.verified_me_at = ts; updated.verify_note = note || '';
  updated.status = 'TRANSFERRED';
  updated.transferred_at = ts;
  await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY', role: u.role, user_id: u.id, dept: u.dept,
    note: '验证通过，已移交' });
  return updated;
}

module.exports = { doMake, doVerify };
