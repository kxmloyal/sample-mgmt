// routes/fixture-helpers.js — 治具状态机辅助：标签/权限/可用操作
var D = require('../../../db');

var STATUS_LABEL = {
  REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待验证',
  VERIFY_RD_OK: 'RD验证通过', VERIFY_ORG_OK: '申请单位确认',
  TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
  REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成(待确认)', RETIRED: '已报废'
};

function isMECustodyQA(role) { return role === 'ME' || role === 'QA' || role === 'CUSTODY'; }

async function allowedActions(role, status, fixture, userId, userDept) {
  var actions = [];
  if (role === 'RD' && status === 'REQUESTED') actions.push('ACCEPT');
  if (status === 'REQUESTED' && fixture.requested_by === userId) actions.push('CANCEL');
  if (role === 'RD' && status === 'ACCEPTED') {
    var pool = D.pool();
    var [rows] = await pool.execute(
      "SELECT category, COUNT(*) AS cnt FROM fixture_files WHERE fixture_id=? AND category IN ('design_drawing','fixture_photo') GROUP BY category",
      [fixture.id]
    );
    var hasDrawing = false, hasPhoto = false;
    rows.forEach(function(r) { if (r.category === 'design_drawing' && r.cnt > 0) hasDrawing = true; if (r.category === 'fixture_photo' && r.cnt > 0) hasPhoto = true; });
    if (hasDrawing && hasPhoto) actions.push('MAKE');
  }
  if ((isMECustodyQA(role) || userDept === fixture.requested_dept) && status === 'VERIFY_PENDING') actions.push('VERIFY');
  if (isMECustodyQA(role) && status === 'TRANSFERRED') actions.push('USE');
  if (status === 'TRANSFERRED') actions.push('IMPROVE');
  if (isMECustodyQA(role) && status === 'IN_USE') { actions.push('RETURN'); actions.push('REPAIR_ME'); actions.push('REPAIR_RD_REQ'); }
  if (role === 'ME' && (status === 'TRANSFERRED' || status === 'IN_USE')) actions.push('MAINTENANCE');
  if ((role === 'RD' || isMECustodyQA(role)) && status === 'IMPROVING') actions.push('IMPROVE_DONE');
  if (isMECustodyQA(role) && status === 'REPAIRING_ME') actions.push('REPAIR_DONE');
  if (role === 'RD' && status === 'REPAIRING_RD') actions.push('REPAIR_RD_DONE');
  if (isMECustodyQA(role) && status === 'REPAIR_DONE') actions.push('REPAIR_CONFIRM');
  if (role === 'ADMIN' && ['IN_USE','TRANSFERRED','IMPROVING','ACCEPTED','VERIFY_PENDING'].indexOf(status) !== -1) actions.push('RETIRE');
  return actions;
}

module.exports = { STATUS_LABEL, isMECustodyQA, allowedActions };
