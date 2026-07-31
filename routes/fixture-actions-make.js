// routes/fixture-actions-make.js — 制作与双人验证 action 执行器
var D = require('../db');

async function doMake(updated, u, ts, f, note, req, conn) {
  var img = req.body.image;
  if (img && typeof img === 'string') {
    var url = await req.app.locals.saveSampleImage(img, f.fixture_no + '_made');
    if (url) updated.made_image = url;
  }
  updated.made_by = u.id; updated.made_at = ts;
  updated.status = 'VERIFY_PENDING';
  await D.addFixtureLog({ fixture_id: f.id, action: 'MAKE', role: u.role, user_id: u.id, dept: u.dept, note: note || '制作完成' }, conn);
  await D.addFixtureLog({ fixture_id: f.id, action: 'MAKE_DONE', role: u.role, user_id: u.id, dept: u.dept, note: '进入双人验证' }, conn);
  return updated;
}

async function doVerifyRD(updated, u, ts, f, note) {
  updated.verified_rd = u.id; updated.verified_rd_at = ts; updated.verify_note = note || '';
  if (f.verified_me && f.verified_me === u.id) throw { status: 400, message: '您已完成申请单位确认，不能再次作为RD验证。请另一位RD同事操作' };
  updated.status = f.status === 'VERIFY_ORG_OK' ? 'TRANSFERRED' : 'VERIFY_RD_OK';
  if (updated.status === 'TRANSFERRED') updated.transferred_at = ts;
  await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY_RD', role: u.role, user_id: u.id, dept: u.dept,
    note: updated.status === 'TRANSFERRED' ? '双人验证完成，已移交' : 'RD验证通过，待申请单位验证' });
  return updated;
}

async function doVerifyOrg(updated, u, ts, f, note) {
  var canVerify = u.dept === f.requested_dept || u.role === 'ME' || u.role === 'QA' || u.role === 'CUSTODY';
  if (!canVerify) throw { status: 403, message: '需要申请单位(' + f.requested_dept + ')或治具管理方(ME/QA/CUSTODY)执行验证' };
  if (f.verified_rd && f.verified_rd === u.id) throw { status: 400, message: '您已完成RD验证，不能再次作为申请单位确认。请另一位同事操作' };
  updated.verified_me = u.id; updated.verified_me_at = ts; updated.verify_note = note || '';
  updated.status = f.status === 'VERIFY_RD_OK' ? 'TRANSFERRED' : 'VERIFY_ORG_OK';
  if (updated.status === 'TRANSFERRED') updated.transferred_at = ts;
  await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY_ORG', role: u.role, user_id: u.id, dept: u.dept,
    note: updated.status === 'TRANSFERRED' ? '双人验证完成，已移交' : '申请单位确认，待RD验证' });
  return updated;
}

module.exports = { doMake, doVerifyRD, doVerifyOrg };
