// subsystems/control/backend/routes-orders.js — 管制单 CRUD + 流转 + 会签 + 报工 + 作废 + 导出
// 权威依据：docs/superpowers/specs/2026-08-24-control-flow-design.md §8/§10.3/§12
// 规范：前缀 /api/control，requireAuth，asyncHandler 兜底，写操作走 D.withTransaction 事务
// 会签/门禁校验集中在 ./flow-ops.js（本文件仅转发，控制行数 ≤400）
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');
const { toCsv, sendCsv } = require('../../../shared/csv');
const {
  getStateMachine, statusLabel, findSignNode, buildSignTemplate,
  gateForAction, isGatePassed, resolveSignTarget, rejectTargetOf, targetOf
} = require('./flow-ops');

// 流转 action → 留痕备注文案（无法从 manifest 语义翻译的口径）
const ACTION_LOG = {
  SUBMIT: '提交会签', SIGN_OK: '闸口①会签通过/贴标', STORE: '入管制仓',
  CREATE_NCR: '开不良品委托单', DISPATCH: '发起处理方式会签', DISPOSAL_OK: '闸口②会签通过',
  START: '生产确认开工', REPORT: '报工', IN_STOCK: '入库', SHIP: '出货',
  SIGN_REJECT: '闸口①会签退回', DISPOSAL_REJECT: '闸口②会签退回', VOID: '作废'
};

/** 时间列格式化：mysql2 返回 Date/ISO 串统一转 YYYY-MM-DD HH:mm；null/空 → '' */
function fmtTime(v) {
  if (v == null || v === '') return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 16).replace('T', ' ');
}

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

// 列表筛选条件（与导出共用）；active/today/overdue 为看板统计卡联动快速筛选
function buildListOpts(req) {
  const { status, apply_dept, bad_type, model, q, sort, limit, offset, active, today, overdue, label_ready } = req.query;
  const yes = v => v === '1' || v === 'true' ? true : undefined;
  return {
    status: status || undefined, apply_dept: apply_dept || undefined,
    bad_type: bad_type || undefined, model: model || undefined, search: q || undefined,
    sort: sort || undefined,
    active: yes(active), today: yes(today), overdue: yes(overdue),
    label_ready: yes(label_ready)
  };
}

// overdue 需按系统阈值判定：注入 overdue_hours（缺省 48，与看板 _ctlOverdueHours 同一数据源）
async function withOverdueHours(opts) {
  if (!opts.overdue) return opts;
  opts.overdue_hours = (await D.getControlSetting('overdue_hours')) || 48;
  return opts;
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 列表（登录可读，筛选/排序/分页）
  app.get('/api/control/orders', requireAuth, asyncHandler(async (req, res) => {
    const pageLimit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 200);
    const pageOffset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
    const baseOpts = await withOverdueHours(buildListOpts(req));
    const filterOpts = Object.assign({}, baseOpts, { limit: pageLimit, offset: pageOffset });
    const [orders, total, pendingRows] = await Promise.all([
      D.listOrders(filterOpts), D.countAllOrders(baseOpts),
      // 各单待签行（decision 空，含角色+部门短名；前端「待我签核」按 role+dept 精准判定，
      // 与 resolveSignTarget 的会签按部门区分同口径；deptAliases 展开在前端 todo.js 完成）
      D.listPendingSignRoles()
    ]);
    const pendingMap = {};
    (pendingRows || []).forEach(function (r) {
      (pendingMap[r.id] = pendingMap[r.id] || []).push({ role: r.role, dept: r.sign_dept });
    });
    res.json({
      orders: (orders || []).map(function (o) {
        return Object.assign({}, o, { pending_roles: pendingMap[o.id] || [] });
      }),
      total, limit: pageLimit, offset: pageOffset
    });
  }));

  // 全局留痕日志分页（登录可读）：单查 control_logs JOIN 主单带 order_no/part_name，按 id DESC 分页
  app.get('/api/control/logs', requireAuth, asyncHandler(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
    const [items, total] = await Promise.all([D.listLogsAll({ limit, offset }), D.countLogsAll()]);
    res.json({ items, total, limit, offset });
  }));

  // 导出列表 CSV：复用列表筛选、忽略分页取全量；须注册在 GET /api/control/orders/:id 之前（避免 'export' 被 :id 捕获）
  app.get('/api/control/orders/export', requireAuth, asyncHandler(async (req, res) => {
    const orders = await D.listOrders(await withOverdueHours(buildListOpts(req)));
    const cols = [
      { key: 'order_no', label: '管制单号' },
      { key: 'part_no', label: '料号' },
      { key: 'part_name', label: '品名' },
      { key: 'sales_no', label: '销货单号' },
      { key: 'spray_date', label: '喷码日期' },
      { key: 'model', label: '机型' },
      { key: 'qty', label: '数量' },
      { key: 'bad_type', label: '不良类型' },
      { key: 'reason', label: '原因' },
      { key: 'apply_dept', label: '申请部门' },
      { key: 'applicant_name', label: '申请人' },
      { key: 'apply_at', label: '申请时间', fmt: v => fmtTime(v) },
      { key: 'label_no', label: '管制标签号' },
      { key: 'storage_location', label: '储位' },
      { key: 'ncr_no', label: '委托单号' },
      { key: 'disposal_opinion', label: '处理方式' },
      { key: 'rework_no', label: '重工工单号' },
      { key: 'rework_sop', label: '重工SOP' },
      { key: 'rework_guide', label: '现场指导' },
      { key: 'rework_other', label: '其他标准' },
      { key: 'good_qty', label: '良品数' },
      { key: 'ng_qty', label: '不良数' },
      { key: 'scrap_qty', label: '报废数' },
      { key: 'remain_qty', label: '结余数' },
      { key: 'status', label: '状态', fmt: v => statusLabel(v) },
      { key: 'created_at', label: '创建时间', fmt: v => fmtTime(v) },
      { key: 'updated_at', label: '更新时间', fmt: v => fmtTime(v) }
    ];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    sendCsv(res, 'control-' + stamp + '.csv', toCsv(orders, cols));
  }));

  // 看板统计：按状态分组计数（供看板列头显示准确数量，不依赖列表 limit=200 截断）
  // 注册在 GET /api/control/orders/:id 之前（避免 'stats' 被 :id 捕获）
  app.get('/api/control/orders/stats', requireAuth, asyncHandler(async (req, res) => {
    const rows = await D.countOrdersByStatus();
    const byStatus = {};
    rows.forEach(function (r) { byStatus[r.status] = r.cnt; });
    res.json({ byStatus });
  }));

  // 详情聚合：主卡 + 会签 + 委托单 + 报工 + 日志（进度由前端 progress.js 派生，后端不下发避免冗余）
  app.get('/api/control/orders/:id', requireAuth, asyncHandler(async (req, res) => {
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    const [signs, ncrLogs, reworkLogs, logs] = await Promise.all([
      D.listSignsByOrder(order.id), D.listNcrLogsByOrder(order.id),
      D.listReworkLogsByOrder(order.id), D.listLogsByOrder(order.id)
    ]);
    res.json({ ...order, signs, ncrLogs, reworkLogs, logs });
  }));

  // 创建管制申请单（登录）：写主单 + 初始化闸口① 会签模板 + CREATE 留痕
  app.post('/api/control/orders', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const body = req.body || {};
    const part_no = (body.part_no || '').trim(), part_name = (body.part_name || '').trim();
    const qty = Number(body.qty), bad_type = (body.bad_type || '').trim(), reason = (body.reason || '').trim();
    if (!part_no || !part_name) return res.status(400).json({ error: '请填写料号与品名' });
    if (!qty || qty <= 0) return res.status(400).json({ error: '请填写有效数量' });
    if (!bad_type) return res.status(400).json({ error: '请选择不良类型' });
    if (!reason) return res.status(400).json({ error: '请填写管制/不良原因' });
    const order = await D.withTransaction(async conn => {
      const no = await D.createOrder({
        part_no, part_name, sales_no: (body.sales_no || '').trim(), model: (body.model || '').trim(),
        qty, bad_type, reason, spray_date: (body.spray_date || '').trim(), customer: (body.customer || '').trim(),
        bad_appearance: (body.bad_appearance || '').trim(), bad_function: (body.bad_function || '').trim(),
        bad_size: (body.bad_size || '').trim(), bad_change: (body.bad_change || '').trim(), bad_other: (body.bad_other || '').trim(),
        applicant_id: u.id, applicant_name: u.display_name || u.username,
        apply_dept: (body.apply_dept || '').trim() || u.dept, apply_at: D.nowISO(), status: 'DRAFT', created_by: u.id
      }, conn);
      const tmpl = buildSignTemplate(no.id, 'APPLY_SIGN');
      for (const s of tmpl) await D.addSign(s, conn);
      await D.addControlLog({ order_id: no.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, comment: '新建管制申请单' }, conn);
      return no;
    });
    res.json(order);
  }));

  // 编辑草稿（仅 DRAFT，申请人/ADMIN）
  app.put('/api/control/orders/:id', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    if (order.status !== 'DRAFT') return res.status(409).json({ error: '仅草稿状态可编辑' });
    if (u.role !== 'ADMIN' && order.applicant_id !== u.id) return res.status(403).json({ error: '无权限：仅申请人或管理员可编辑' });
    const body = req.body || {};
    const updated = Object.assign({}, order);
    ['part_no', 'part_name', 'sales_no', 'model', 'qty', 'bad_type', 'reason', 'apply_dept', 'spray_date', 'customer', 'bad_appearance', 'bad_function', 'bad_size', 'bad_change', 'bad_other', 'pack_sop'].forEach(k => { if (body[k] !== undefined) updated[k] = body[k]; });
    if (body.qty !== undefined && (Number(updated.qty) <= 0)) return res.status(400).json({ error: '数量必须为正数' });
    let result;
    try {
      result = await D.withTransaction(async conn => {
        const r = await D.updateOrder(updated, conn, order.version);
        await D.addControlLog({ order_id: order.id, action: 'EDIT', role: u.role, user_id: u.id, dept: u.dept, comment: '编辑草稿' }, conn);
        return r;
      });
    } catch (err) {
      if (err && err.code === 'CONFLICT') return res.status(409).json({ error: '该管制单刚被他人操作，请刷新后重试' });
      throw err;
    }
    res.json(result);
  }));

  // 状态流转：canTransition 校验 + 对应会签闸口全通过校验 + 事务更新状态与留痕
  app.post('/api/control/orders/:id/transition', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    const action = ((req.body || {}).action || '').trim();
    if (!action) return res.status(400).json({ error: '请指定操作类型' });
    const sm = getStateMachine();
    if (!sm.canTransition(u.role, order.status, action)) return res.status(403).json({ error: '当前状态/角色不允许该操作' });
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
        if (action === 'DISPATCH') { // 初始化闸口② 会签模板
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
