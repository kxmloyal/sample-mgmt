// subsystems/control/backend/routes-orders-crud.js — 管制单 CRUD 域路由（2026-09-08 自 routes-orders.js 拆分）
// 覆盖：列表/全局日志/导出 CSV/状态统计/详情聚合/新建/编辑草稿
// 规范：前缀 /api/control，requireAuth，asyncHandler 兜底，写操作走 D.withTransaction 事务
const D = require('../../../db');
const { asyncHandler } = require('./async-handler');
const { toCsv, sendCsv } = require('../../../shared/csv');
const { statusLabel } = require('./flow-ops');

/** 时间列格式化：mysql2 返回 Date/ISO 串统一转 YYYY-MM-DD HH:mm；null/空 → '' */
function fmtTime(v) {
  if (v == null || v === '') return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 16).replace('T', ' ');
}

// 列表筛选条件（与导出共用）；active/today/overdue 为看板统计卡联动快速筛选
function buildListOpts(req) {
  const { status, apply_dept, bad_type, model, q, sort, limit, offset, active, today, overdue, label_ready, sign_overdue } = req.query;
  const yes = v => v === '1' || v === 'true' ? true : undefined;
  return {
    status: status || undefined, apply_dept: apply_dept || undefined,
    bad_type: bad_type || undefined, model: model || undefined, search: q || undefined,
    sort: sort || undefined,
    active: yes(active), today: yes(today), overdue: yes(overdue),
    label_ready: yes(label_ready), sign_overdue: yes(sign_overdue)
  };
}

// overdue/sign_overdue 需按系统阈值判定：注入 overdue_hours（缺省 48，与看板 _ctlOverdueHours 同一数据源）
async function withOverdueHours(opts) {
  if (!opts.overdue && !opts.sign_overdue) return opts;
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
  // 2026-09-08 增补 signOverdue：会签步骤级超时计数（listOverdueSigns DAO 激活消费，阈值同 overdue_hours）
  // 注册在 GET /api/control/orders/:id 之前（避免 'stats' 被 :id 捕获）
  app.get('/api/control/orders/stats', requireAuth, asyncHandler(async (req, res) => {
    const hours = (await D.getControlSetting('overdue_hours')) || 48;
    const [rows, signOverdue] = await Promise.all([D.countOrdersByStatus(), D.countOverdueSigns(hours)]);
    const byStatus = {};
    rows.forEach(function (r) { byStatus[r.status] = r.cnt; });
    res.json({ byStatus, signOverdue, overdueHours: hours });
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
      const tmpl = require('./flow-ops').buildSignTemplate(no.id, 'APPLY_SIGN');
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
}

module.exports = { register };
