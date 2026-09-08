// subsystems/control/db/dao-signs.js — 会签子表域 DAO（2026-09-08 自 dao.js 按域拆分，对外接口不变）
// 覆盖：签字 UPSERT / 按单查询 / 退回清行 / 待签行集合 / 会签超时（供看板预警消费）
module.exports = function createDaoSigns(deps) {
  var q = deps.q, run = deps.run;

  // 会签子表（2 个闸口：APPLY_SIGN / DISPOSAL_SIGN），唯一键 (order_id,node_key,seq)
  // 写入采用 UPSERT：创建时初始化待签槽(decision='')用 INSERT，签署时命中同 (order_id,node_key,seq) 槽改 UPDATE，
  //   与 routes-orders 的「建单/发起会签时预建模板槽 + 签署时填充」一致，避免重复签字冲突。
  async function addSign(s, conn) {
    s = s || {};
    var sql = 'INSERT INTO control_signs (order_id,node_key,node_name,`seq`,role,sign_dept,signer_id,signer_name,decision,comment,signed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE node_name=VALUES(node_name), role=VALUES(role), sign_dept=VALUES(sign_dept), signer_id=VALUES(signer_id), signer_name=VALUES(signer_name), decision=VALUES(decision), comment=VALUES(comment), signed_at=VALUES(signed_at)';
    var params = [s.order_id, s.node_key, s.node_name || null, s.seq, s.role || null, s.sign_dept || null, s.signer_id || null, s.signer_name || null, s.decision || '', s.comment || null, s.signed_at || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listSignsByOrder(order_id) { return q('SELECT * FROM control_signs WHERE order_id = ? ORDER BY `seq` ASC', [order_id]); }

  // 删除某单某闸口的全部会签行（2026-09-04 会签退回闭环：REJECT 回退后旧签字行必须作废，
  // 由 SUBMIT/DISPATCH 重提时在事务内清行+重建模板，杜绝旧 AGREE 带病生效/重签被锁死）。
  // node_key 可选：缺省清该单全部闸口行。仅限事务内 conn 调用，历史留痕以 control_logs 为准。
  function deleteSignsByOrder(order_id, node_key, conn) {
    const sql = node_key
      ? 'DELETE FROM control_signs WHERE order_id = ? AND node_key = ?'
      : 'DELETE FROM control_signs WHERE order_id = ?';
    const params = node_key ? [order_id, node_key] : [order_id];
    if (conn) return conn.execute(sql, params);
    return run(sql, params);
  }

  // 各会签中单据的待签行集合（decision 空行，含 role+sign_dept；供列表接口注入 pending 行，
  // 前端「待我签核」按角色+部门精准判定，与会签按部门区分同口径）
  function listPendingSignRoles() {
    return q(
      "SELECT DISTINCT o.id, s.role, s.sign_dept FROM control_signs s JOIN control_orders o ON o.id = s.order_id " +
      "WHERE (s.decision IS NULL OR s.decision = '') AND o.status IN ('SIGNING','DISPOSAL_SIGNING')");
  }

  // C3 会签超时：创建后超过阈值未签的会签记录（2026-09-08 接入看板「会签超时」统计卡，原死代码激活）
  function listOverdueSigns(hours) {
    return q("SELECT cs.*, co.order_no, co.status AS order_status FROM control_signs cs JOIN control_orders co ON cs.order_id = co.id WHERE (cs.decision IS NULL OR cs.decision = '') AND cs.signed_at IS NULL AND cs.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY cs.created_at ASC", [hours || 48]);
  }

  // 会签超时计数（stats 接口用，避免全行返回）：同一阈值口径
  function countOverdueSigns(hours) {
    return q("SELECT COUNT(*) AS total FROM control_signs cs JOIN control_orders co ON cs.order_id = co.id WHERE (cs.decision IS NULL OR cs.decision = '') AND cs.signed_at IS NULL AND cs.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR) AND co.status IN ('SIGNING','DISPOSAL_SIGNING')", [hours || 48]).then(function (rows) { return rows[0].total; });
  }

  return { addSign, listSignsByOrder, deleteSignsByOrder, listPendingSignRoles, listOverdueSigns, countOverdueSigns };
};
