// subsystems/control/backend/routes-scan-in.js — 扫码入库（2026-09-09）
// 场景：重工报工完成后（REWORK_REPORTED），仓库人员在扫码台扫管制标签 QR（内容=order_no）直接入库（REIN_STOCK）。
// 复用：入库业务语义与详情页「入库」按钮同源（in_stock_at + 状态 CAS + control_logs 留痕），纯新增通道，原按钮不受影响。
// 权限（本通道单独收紧，与详情页 flowPolicy 无关）：仅仓库人员（CUSTODY 且部门=仓库/资材部）或 ADMIN 兜底；
//       库位必填（扫码确认后弹库位输入，未填不入库）。
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');
const { deptEquals } = require('./flow');

// 仓库人员判定：CUSTODY 角色且部门命中「仓库」别名族（资材部），或 ADMIN 兜底。
// 单一来源仍挂 control-flow.json deptAliases：别名表调整时本判定自动跟随。
function isWarehouseUser(u) {
  if (u.role === 'ADMIN' || (u.roles || []).includes('ADMIN')) return true;
  const roles = u.roles || (u.role ? [u.role] : []);
  if (!roles.includes('CUSTODY')) return false;
  return deptEquals(u.dept, '仓库');
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 预扫：按单号查单并回显关键信息（不落库；权限同入库——避免未授权者借预扫探测单据）
  app.post('/api/control/scan-in/lookup', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    if (!isWarehouseUser(u)) return res.status(403).json({ error: '仅仓库人员可扫码入库（管理员兜底）' });
    const orderNo = String((req.body || {}).order_no || '').trim();
    if (!orderNo) return res.status(400).json({ error: '单号为空，请重新扫码' });
    const o = await D.getOrderByNo(orderNo);
    if (!o) return res.status(404).json({ error: '未找到该单号：' + orderNo });
    if (o.status !== 'REWORK_REPORTED') {
      return res.status(409).json({ error: '该单不在「已报工」状态，当前：' + (o.status || '') + '，无法扫码入库' });
    }
    res.json({ order_no: o.order_no, part_no: o.part_no, part_name: o.part_name, qty: o.qty, status: o.status, storage_location: o.storage_location || '' });
  }));

  // 确认入库：库位必填；事务内 CAS + in_stock_at + 留痕（与 transition IN_STOCK 同语义）
  app.post('/api/control/scan-in', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    if (!isWarehouseUser(u)) return res.status(403).json({ error: '仅仓库人员可扫码入库（管理员兜底）' });
    const body = req.body || {};
    const orderNo = String(body.order_no || '').trim();
    const loc = String(body.storage_location || '').trim();
    if (!orderNo) return res.status(400).json({ error: '单号为空，请重新扫码' });
    if (!loc) return res.status(400).json({ error: '请填写库位后再确认入库' });
    if (loc.length > 100) return res.status(400).json({ error: '库位过长（≤100 字符）' });
    try {
      const out = await D.withTransaction(async conn => {
        const o = await D.getOrderByNo(orderNo); // 事务内取行，保证判定与写入同口径
        if (!o) { const e = new Error('未找到该单号：' + orderNo); e.code = 'NOT_FOUND'; throw e; }
        if (o.status !== 'REWORK_REPORTED') {
          const e = new Error('该单不在「已报工」状态，当前：' + (o.status || '') + '，无法扫码入库');
          e.code = 'STATE'; throw e;
        }
        const updated = Object.assign({}, o, { status: 'REIN_STOCK', in_stock_at: D.nowISO(), storage_location: loc });
        const r = await D.updateOrder(updated, conn, o.version);
        await D.addControlLog({ order_id: o.id, action: 'IN_STOCK', role: u.role, user_id: u.id, dept: u.dept, comment: '扫码入库 · 库位:' + loc }, conn);
        return { order: r, from: o.status, to: 'REIN_STOCK' };
      });
      const o = out.order || {};
      res.json({ ok: 1, order_no: orderNo, part_no: o.part_no, part_name: o.part_name, qty: o.qty, status: 'REIN_STOCK', storage_location: loc });
    } catch (err) {
      if (err && err.code === 'CONFLICT') return res.status(409).json({ error: '该管制单刚被他人操作，请重新扫码后重试' });
      if (err && err.code === 'NOT_FOUND') return res.status(404).json({ error: err.message });
      if (err && err.code === 'STATE') return res.status(409).json({ error: err.message });
      logger.error('扫码入库失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '入库失败：' + (err.message || '服务器内部错误') });
    }
  }));
}

module.exports = { register, isWarehouseUser };
