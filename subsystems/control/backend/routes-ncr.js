// subsystems/control/backend/routes-ncr.js — 不良品委托单(NCR) 子记录追加 + 聚合列表/导出
// 权威依据：追加写入见 docs/superpowers/specs/2026-08-24-control-flow-design.md §6.3/§10.3；聚合检索见 2026-08-26-control-ncr-interaction-design.md §3.1
// 职责：POST /api/control/orders/:id/ncr（QA/ADMIN）追加明细；GET /api/control/ncrs + /export 聚合检索（登录即可）
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');
const { toCsv, sendCsv } = require('../../../shared/csv');
const { statusLabel } = require('./flow-ops');

// NCR 追加权限与单据状态门槛：仅 QA/ADMIN，且未作废/未出货
function ncrGate(u, order) {
  if (u.role !== 'QA' && u.role !== 'ADMIN') return { code: 403, error: '无权限：仅品保(QA)或管理员可追加不良品委托单' };
  if (order.status === 'RETIRED') return { code: 400, error: '单据已作废，不可追加委托单' };
  if (order.status === 'SHIPPED') return { code: 409, error: '单据已出货，不可追加委托单' };
  if (order.status === 'DRAFT' || order.status === 'SIGNING') return { code: 409, error: '单据未进入管制阶段，不可开委托单' };
  return null;
}

/** 时间列格式化：mysql2 返回 Date/ISO 串统一转 YYYY-MM-DD HH:mm；null/空 → '' */
function fmtTime(v) {
  if (v == null || v === '') return '';
  const s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 16).replace('T', ' ');
}

// NCR 聚合列表筛选参数解析（与列表页/导出共用）
function buildNcrOpts(req) {
  const { ncr_no, order_no, order_ids, inspect_dept, handle_dept, created_by_name, date_from, date_to, sort, limit, offset } = req.query;
  return {
    ncr_no: ncr_no || undefined, order_no: order_no || undefined, order_ids: order_ids || undefined,
    inspect_dept: inspect_dept || undefined, handle_dept: handle_dept || undefined,
    created_by_name: created_by_name || undefined,
    date_from: date_from || undefined, date_to: date_to || undefined,
    sort: sort || undefined
  };
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 导出 NCR CSV：复用筛选、忽略分页取全量（AGENTS.md §21）；注册在通用列表前，避免未来 :id 路由覆盖 export
  app.get('/api/control/ncrs/export', requireAuth, asyncHandler(async (req, res) => {
    const ncrs = await D.listNcrAgg(buildNcrOpts(req));
    const cols = [
      { key: 'ncr_no', label: '委托单号' },
      { key: 'order_no', label: '所属管制单' },
      { key: 'part_no', label: '料号' },
      { key: 'part_name', label: '品名' },
      { key: 'status', label: '状态', fmt: v => statusLabel(v) },
      { key: 'inspect_dept', label: '检验部门' },
      { key: 'handle_dept', label: '处理部门' },
      { key: 'form_template', label: '表单版本' },
      { key: 'created_by_name', label: '创建人' },
      { key: 'created_at', label: '创建时间', fmt: v => fmtTime(v) }
    ];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    sendCsv(res, 'ncr-' + stamp + '.csv', toCsv(ncrs, cols));
  }));

  // NCR 聚合列表（登录可读，全部角色）：筛选/分页与列表页对齐
  app.get('/api/control/ncrs', requireAuth, asyncHandler(async (req, res) => {
    const pageLimit = Math.min(parseInt(req.query.limit || '20', 10) || 20, 200);
    const pageOffset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);
    const filterOpts = Object.assign({}, buildNcrOpts(req), { limit: pageLimit, offset: pageOffset });
    const [ncrs, total] = await Promise.all([D.listNcrAgg(filterOpts), D.countNcrAgg(buildNcrOpts(req))]);
    res.json({ ncrs, total, limit: pageLimit, offset: pageOffset });
  }));

  // 追加不良品委托单记录：写明细 + 更新摘要 + 留痕（QA）
  app.post('/api/control/orders/:id/ncr', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    const deny = ncrGate(u, order);
    if (deny) return res.status(deny.code).json({ error: deny.error });

    const body = req.body || {};
    const ncr_no = (body.ncr_no || '').trim() || order.ncr_no || ('NCR-' + order.order_no);
    const inspect_dept = (body.inspect_dept || '').trim();
    const handle_dept = (body.handle_dept || '').trim();
    const form_template = (body.form_template || '').trim() || 'GYS-Q2-008_01(REV_1)';
    if (!inspect_dept) return res.status(400).json({ error: '请填写检验部门' });
    if (!handle_dept) return res.status(400).json({ error: '请填写处理部门' });

    let result;
    try {
      result = await D.withTransaction(async conn => {
        await D.addNcrLog({ order_id: order.id, ncr_no, inspect_dept, handle_dept, form_template, created_by: u.id }, conn);
        if (order.ncr_no !== ncr_no) {
          await D.updateOrder(Object.assign({}, order, { ncr_no }), conn);
        }
        await D.addControlLog({ order_id: order.id, action: 'NCR', role: u.role, user_id: u.id, dept: u.dept, comment: '追加不良品委托单 ' + ncr_no + '（' + inspect_dept + '→' + handle_dept + '）' }, conn);
        // 返回内存中的目标 order；事务未提交时 getOrderById(连接池) 读不到刚写入的 ncr_no，改用手工合并
        return Object.assign({}, order, { ncr_no });
      });
    } catch (err) {
      logger.error('追加NCR失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '追加NCR失败：' + (err.message || '服务器内部错误') });
    }
    res.json(result);
  }));
}

module.exports = { register };
