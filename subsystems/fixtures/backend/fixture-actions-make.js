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
// 判定依据(2026-09-04 收紧)：谁申请谁验证（u.dept === requested_dept），ADMIN 兜底；
// 移除原 ME/QA/CUSTODY 治具管理方代验权限（避免"裁判运动员"责任归属问题，用户决策）
function canVerify(u, f) {
  return u.dept === f.requested_dept || u.role === 'ADMIN';
}
async function doVerify(updated, u, ts, f, note) {
  if (!canVerify(u, f)) throw { status: 403, message: '需要申请单位(' + f.requested_dept + ')执行验证（或管理员兜底）' };
  updated.verified_me = u.id; updated.verified_me_at = ts; updated.verify_note = note || '';
  updated.status = 'TRANSFERRED';
  updated.transferred_at = ts;
  await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY', role: u.role, user_id: u.id, dept: u.dept,
    note: '验证通过，已移交' });
  return updated;
}

// 验证不合格：单人验证未通过 → 退回重做（2026-09-03 用户需求）
// 回退目标逻辑：
//   - 该次 VERIFY_PENDING 由【改善复验】(IMPROVE_DONE) 进入(improvement_count>0) → 退回 IMPROVING 继续改善
//   - 其余（初次制作 MAKE 进入）→ 退回 ACCEPTED 由 RD 重做
// 登记验证不合格审计：verify_reject_by/at/note + 计数 verify_reject_count（可追溯次数与原因）
async function doVerifyReject(updated, u, ts, f, note) {
  if (!canVerify(u, f)) throw { status: 403, message: '需要申请单位(' + f.requested_dept + ')执行验证（或管理员兜底）' };
  if (!note || !note.trim()) throw { status: 400, message: '请填写验证不合格原因' };
  var returnTo = (f.improvement_count > 0) ? 'IMPROVING' : 'ACCEPTED';
  updated.status = returnTo;
  updated.verify_reject_by = u.id;
  updated.verify_reject_at = ts;
  updated.verify_reject_note = note.trim();
  updated.verify_reject_count = (f.verify_reject_count || 0) + 1;
  var fromImprove = (returnTo === 'IMPROVING');
  await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY_REJECT', role: u.role, user_id: u.id, dept: u.dept,
    note: (fromImprove ? '改善复验不合格，退回继续改善' : '验证不合格，退回重做') + '：' + note.trim() });
  return updated;
}

module.exports = { doMake, doVerify, doVerifyReject };
