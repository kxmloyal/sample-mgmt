// subsystems/control/backend/routes-orders-flow.js — 管制单流转域路由（2026-09-08 自 routes-orders.js 拆分）
// 覆盖：状态流转/会签签字/追加报工/作废；会签与门禁校验集中在 ./flow-ops.js
// 规范：requireAuth，asyncHandler 兜底，写操作走 D.withTransaction 事务 + CAS 乐观锁
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');
const {
  getStateMachine, findSignNode, buildSignTemplate,
  gateForAction, isGatePassed, resolveSignTarget, rejectTargetOf, targetOf
} = require('./flow-ops');
const { deptGateAllowed } = require('./flow');

// 会签退回闭环（2026-09-04 方案A）：退回归位签字接口，流转旁路封禁。
// 退回唯一入口 = POST /sign decision=REJECT（意见必填、留痕到 control_signs+control_logs）；
// 重提时 SUBMIT/DISPATCH 事务内清旧闸口行+重建模板，每轮会签独立、旧 AGREE 不带病生效。
const SIGN_REJECT_ACTIONS = ['SIGN_REJECT', 'DISPOSAL_REJECT'];
const SIGN_REJECT_HINT = '会签退回请在详情页「去会签」弹窗中选择「退回」（须填写退回意见），不在此处操作';

// 流转 action → 留痕备注文案（无法从 manifest 语义翻译的口径）
const ACTION_LOG = {
  SUBMIT: '提交会签', SIGN_OK: '闸口①会签通过/贴标', STORE: '入管制仓',
  CREATE_NCR: '开不良品委托单', DISPATCH: '发起处理方式会签', DISPOSAL_OK: '闸口②会签通过',
  START: '生产确认开工', REPORT: '报工', IN_STOCK: '入库', SHIP: '出货',
  SIGN_REJECT: '闸口①会签退回', DISPOSAL_REJECT: '闸口②会签退回', VOID: '作废'
};

/** 按 action 对各状态流转做业务字段派生修改（返回新对象，不改原 order）；无副作用字段则原样 */
function applyActionFields(order, action, body) {
  const o = Object.assign({}, order);
  const ts = D.nowISO();
  switch (action) {
    case 'SIGN_OK': if (!o.label_no) o.label_no = 'LB-' + o.order_no; break; // 贴标 → 生成管制标签号
    case 'STORE': o.storage_location = (body.storage_location || '').trim() || o.storage_location; o.stored_at = ts; break;
    case 'CREATE_NCR': if ((body.ncr_no || '').trim()) o.ncr_no = body.ncr_no.trim(); break; // 摘要与 ncr 子表保持一致
    case 'DISPOSAL_OK': if ((body.disposal_opinion || '').trim()) o.disposal_opinion = body.disposal_opinion.trim(); break;
    case 'START': if ((body.rework_no || '').trim()) o.rework_no = body.rework_no.trim(); break;
    case 'DISPATCH': // 发起处理方式会签：登记重工/全检标准（必填，校验见 transition 路由）+ 包装SOP（可选）
      if ((body.rework_sop || '').trim()) o.rework_sop = body.rework_sop.trim();
      if ((body.rework_guide || '').trim()) o.rework_guide = body.rework_guide.trim();
      if ((body.rework_other || '').trim()) o.rework_other = body.rework_other.trim();
      if ((body.pack_sop || '').trim()) o.pack_sop = body.pack_sop.trim();
      break;
    case 'IN_STOCK': o.in_stock_at = ts; break;
    default: break;
  }
  return o;
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 状态流转：canTransition 校验 + 对应会签闸口全通过校验 + 事务更新状态与留痕
  app.post('/api/control/orders/:id/transition', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    const action = ((req.body || {}).action || '').trim();
    if (!action) return res.status(400).json({ error: '请指定操作类型' });
    // 会签退回闭环（2026-09-04 方案A）：流转旁路不再受理退回类 action（前端已同步移除按钮，此处防直调）
    if (SIGN_REJECT_ACTIONS.includes(action)) return res.status(400).json({ error: SIGN_REJECT_HINT });
    const sm = getStateMachine();
    // 提交② 多角色角色关：任一角色命中即过（u.roles 并集，等价旧 u.role 单值判定）
    const rolesOk = (u.roles || [u.role]).some(r => sm.canTransition(r, order.status, action));
    if (!rolesOk) return res.status(403).json({ error: '当前状态/角色不允许该操作' });
    // 提交② 部门关下沉（策略源 control-flow.json flowPolicy）：CUSTODY 仓口动作须部门命中
    if (!deptGateAllowed(u, action)) return res.status(403).json({ error: '该操作由仓库口（' + ((require('../../../data/control-flow.json').flowPolicy || {})[action] || []).join('/') + '）执行，您所在部门无权操作' });
    const gate = gateForAction(action);
    if (gate && !isGatePassed(await D.listSignsByOrder(order.id), gate)) return res.status(400).json({ error: '该节点会签未完成' });
    const t = targetOf(action, order.status);
    if (!t) return res.status(400).json({ error: '该操作无对应流转' });
    if (action === 'SHIP') { // C4 出货前校验结余
      var remainQty = Number(order.qty) - (Number(order.good_qty) || 0) - (Number(order.ng_qty) || 0) - (Number(order.scrap_qty) || 0);
      if (order.qty != null && remainQty !== 0) return res.status(400).json({ error: '结余未清零（余 ' + remainQty + '），无法出货' });
    }
    if (action === 'REPORT') { // 2026-09-04 加固：报工确认前须已有报工记录且结余清零（杜绝零数量推进）
      var logs = await D.listReworkLogsByOrder(order.id);
      if (!logs.length) return res.status(400).json({ error: '请先追加报工记录（录入良品/不良/报废数量）后再确认报工' });
      var remainR = Number(order.qty) - (Number(order.good_qty) || 0) - (Number(order.ng_qty) || 0) - (Number(order.scrap_qty) || 0);
      if (order.qty != null && remainR !== 0) return res.status(400).json({ error: '结余未清零（余 ' + remainR + '），请继续报工后再确认' });
    }
    if (action === 'DISPATCH') { // 处理方式会签发起：重工/全检标准必填（SOP 必填 + 指导/其他至少一项）
      const rb = req.body || {};
      const sop = (rb.rework_sop || '').trim();
      const guide = (rb.rework_guide || '').trim();
      const other = (rb.rework_other || '').trim();
      if (!sop) return res.status(400).json({ error: '处理方式会签前必须填写重工/全检标准：重工SOP' });
      if (!guide && !other) return res.status(400).json({ error: '处理方式会签前必须填写重工/全检标准：现场指导或标准文件至少填一项' });
    }
    let result;
    try {
      result = await D.withTransaction(async conn => {
        const updated = applyActionFields(order, action, req.body || {});
        updated.status = t.to;
        const r = await D.updateOrder(updated, conn, order.version);
        if (action === 'SUBMIT') {
          // 会签退回闭环（2026-09-04 方案A）：重提即新一轮会签——清掉闸口①全部旧签字行
          //（含上轮 REJECT/AGREE 残留），重建空模板；旧轮次结论以 control_logs 留痕为准
          await D.deleteSignsByOrder(order.id, 'APPLY_SIGN', conn);
        }
        if (action === 'SUBMIT' || action === 'DISPATCH') { // 初始化对应闸口会签模板（空行，待签）
          for (const s of buildSignTemplate(order.id, action === 'SUBMIT' ? 'APPLY_SIGN' : 'DISPOSAL_SIGN')) await D.addSign(s, conn);
        }
        if (action === 'DISPATCH') {
          // 幂等兜底：DISPOSAL_SIGN 若有历史残留（异常路径产生），重建前先清
          await D.deleteSignsByOrder(order.id, 'DISPOSAL_SIGN', conn);
          for (const s of buildSignTemplate(order.id, 'DISPOSAL_SIGN')) await D.addSign(s, conn);
        }
        await D.addControlLog({ order_id: order.id, action, role: u.role, user_id: u.id, dept: u.dept, comment: (req.body || {}).comment || ACTION_LOG[action] || action }, conn);
        return r;
      });
    } catch (err) {
      if (err && err.code === 'CONFLICT') return res.status(409).json({ error: '该管制单刚被他人操作，请刷新后重试' });
      logger.error('管制单流转失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '流转失败：' + (err.message || '服务器内部错误') });
    }
    res.json({ order: result, from: order.status, to: t.to, action });
  }));

  // 会签签字（按 node role 顺序）：唯一键冲突→400「该节点已签字」；REJECT 记录 + 状态回退
  app.post('/api/control/orders/:id/sign', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    const body = req.body || {};
    const node_key = (body.node_key || '').trim();
    const node = findSignNode(node_key);
    if (!node) return res.status(400).json({ error: '会签节点不存在' });
    if (order.status !== node.trigger_status) return res.status(400).json({ error: '当前状态不可会签' });
    const decision = (body.decision || '').trim().toUpperCase();
    if (!['AGREE', 'REJECT', 'SKIP'].includes(decision)) return res.status(400).json({ error: '非法会签决定' });
    // 会签退回闭环（2026-09-04 方案A）：REJECT 为唯一退回入口，退回意见必填（整单回退，理由必须留档）
    if (decision === 'REJECT' && !(body.comment || '').trim()) return res.status(400).json({ error: '退回必须填写退回意见' });
    if (decision === 'SKIP' && u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可强制跳过会签' });
    const target = resolveSignTarget(node, await D.listSignsByOrder(order.id), u, null);
    if (target.code) return res.status(target.code).json({ error: target.error });
    let result;
    try {
      result = await D.withTransaction(async conn => {
        await D.addSign({ order_id: order.id, node_key, node_name: node.node_name, seq: target.seq, role: target.step.role, sign_dept: target.step.dept, signer_id: u.id, signer_name: u.display_name || u.username, decision, comment: body.comment || null, signed_at: D.nowISO() }, conn);
        let updated = Object.assign({}, order);
        if (decision === 'REJECT') { // 回退到会签前一业务节点
          const rb = rejectTargetOf(node_key);
          if (rb) { updated.status = rb.to; await D.updateOrder(updated, conn, order.version); }
        }
        await D.addControlLog({ order_id: order.id, action: 'SIGN_' + decision, role: u.role, user_id: u.id, dept: u.dept, comment: node.node_name + '·' + (body.comment || decision) }, conn);
        // 返回内存中的目标 order；事务未提交时 getOrderById(连接池) 读不到刚写入的状态，改用 updated
        return updated;
      });
    } catch (err) {
      if (err && err.code === 'CONFLICT') return res.status(409).json({ error: '该管制单刚被他人操作，请刷新后重试' });
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(400).json({ error: '该节点已签字' });
      logger.error('会签失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '会签失败：' + (err.message || '服务器内部错误') });
    }
    res.json({ order: result, sign: { node_key, seq: target.seq, decision } });
  }));

  // 追加报工记录（生产/CUSTODY，须处于可报工状态）：写子表 + 更新汇总（remain 自动算）+ 留痕
  app.post('/api/control/orders/:id/rework-log', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    if (!getStateMachine().canTransition(u.role, order.status, 'REPORT')) return res.status(403).json({ error: '当前状态/角色不允许报工' });
    const body = req.body || {};
    const g = Number(body.good_qty) || 0, n = Number(body.ng_qty) || 0, s = Number(body.scrap_qty) || 0;
    if (g + n + s <= 0) return res.status(400).json({ error: '请填写报工数量' });
    let result;
    try {
      result = await D.withTransaction(async conn => {
        const updated = Object.assign({}, order);
        updated.good_qty = (Number(order.good_qty) || 0) + g;
        updated.ng_qty = (Number(order.ng_qty) || 0) + n;
        updated.scrap_qty = (Number(order.scrap_qty) || 0) + s;
        if ((body.scrap_reason || '').trim()) updated.scrap_note = body.scrap_reason.trim();
        await D.addReworkLog({ order_id: order.id, work_date: body.work_date || D.nowISO(), good_qty: g, ng_qty: n, scrap_qty: s, scrap_reason: body.scrap_reason || null, operator_id: u.id, operator_name: u.display_name || u.username, batch_no: body.batch_no || null, pack_record: body.pack_record || null, confirm_by: body.confirm_by || null, qty_consistent: body.qty_consistent != null ? (body.qty_consistent === 1 || body.qty_consistent === '1' || body.qty_consistent === true ? 1 : 0) : 0 }, conn);
        const r = await D.updateOrder(updated, conn, order.version); // remain_qty = qty - good - ng - scrap 自动重算
        await D.addControlLog({ order_id: order.id, action: 'REWORK_LOG', role: u.role, user_id: u.id, dept: u.dept, comment: '报工 良品' + g + ' 不良' + n + ' 报废' + s }, conn);
        return r;
      });
    } catch (err) {
      if (err && err.code === 'CONFLICT') return res.status(409).json({ error: '该管制单刚被他人操作，请刷新后重试' });
      logger.error('报工失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '报工失败：' + (err.message || '服务器内部错误') });
    }
    res.json(result);
  }));

  // 作废（仅 ADMIN → RETIRED）
  app.post('/api/control/orders/:id/void', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '无权限：仅管理员可作废' });
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    if (order.status === 'RETIRED' || order.status === 'SHIPPED') return res.status(400).json({ error: '该单已作废或已出货，不可作废' });
    if (!getStateMachine().canTransition(u.role, order.status, 'VOID')) return res.status(403).json({ error: '当前状态不允许作废' });
    let result;
    try {
      result = await D.withTransaction(async conn => {
        const updated = Object.assign({}, order);
        updated.status = 'RETIRED';
        const r = await D.updateOrder(updated, conn, order.version);
        await D.addControlLog({ order_id: order.id, action: 'VOID', role: u.role, user_id: u.id, dept: u.dept, comment: (req.body || {}).comment || '作废' }, conn);
        return r;
      });
    } catch (err) {
      if (err && err.code === 'CONFLICT') return res.status(409).json({ error: '该管制单刚被他人操作，请刷新后重试' });
      logger.error('作废失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '作废失败：' + (err.message || '服务器内部错误') });
    }
    res.json(result);
  }));
}

module.exports = { register };
