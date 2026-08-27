// subsystems/control/backend/routes-label.js — 管制标签打印
// 权威依据：docs/superpowers/specs/2026-08-24-control-flow-design.md §9
// 职责：GET /api/control/orders/:id/label（登录，可打印 HTML）、/label/print（自动打印）、/label/download（仅 ADMIN/QA/RD）
// 原则：机制复用、文件自包含；标签实时派生自 control_orders，无独立存储/冗余快照；仅 QR LRU 缓存，缓存只依赖二维码内容
const D = require('../../../db');
const { logger } = require('../../../logger');
const QRCode = require('qrcode');
const { asyncHandler } = require('./async-handler');

// QR 内容 = 管制单号（control_orders 无 qr_token，复用 order_no）；键 = order_no + width
var qrCache = new Map();
var QR_CACHE_MAX = 200;
function cacheKey(orderNo, width) { return orderNo + '_' + width; }
function getCachedQR(orderNo, width) {
  var key = cacheKey(orderNo, width);
  if (qrCache.has(key)) { var v = qrCache.get(key); qrCache.delete(key); qrCache.set(key, v); return v; }
  return null;
}
function setCachedQR(orderNo, width, dataUrl) {
  var key = cacheKey(orderNo, width);
  if (qrCache.size >= QR_CACHE_MAX) { var oldest = qrCache.keys().next().value; qrCache.delete(oldest); }
  qrCache.set(key, dataUrl);
}

// 下载角色门槛：仅管理/品保/研发可下载标签文件（设计 §9）
var DOWNLOAD_ROLES = ['ADMIN', 'QA', 'RD'];

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function fmtDate(v) {
  if (v == null || v === '') return '';
  var s = v instanceof Date ? v.toISOString() : String(v);
  return s.slice(0, 10);
}

// 标签 HTML（左 QR + 管制信息）；autoPrint 控制是否 window.print()
function buildLabelHtml(o, qrDataUrl, autoPrint) {
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>管制标签 ' + esc(o.order_no) + '</title>'
    + '<style>body{font-family:sans-serif;margin:0;padding:12px}.label{display:flex;gap:12px;max-width:560px;border:2px solid #000;padding:10px;border-radius:4px}'
    + '.qr{flex:0 0 168px;text-align:center}.qr img{width:168px;height:168px;display:block}.qr .no{margin-top:4px;font-size:12px;word-break:break-all}'
    + '.info{flex:1;font-size:13px;line-height:1.7}.info h2{margin:2px 0 6px;font-size:16px}.info .row{display:flex}.info .row .k{color:#444;width:72px;flex:0 0 72px}'
    + '.info .row .v{flex:1;font-weight:600}'
    + (autoPrint ? '<script>window.onload=function(){window.print();}</script>' : '')
    + '</style></head><body>'
    + '<div class="label">'
    + '<div class="qr"><img src="' + qrDataUrl + '" alt="QR"><div class="no">' + esc(o.order_no) + '</div></div>'
    + '<div class="info"><h2>管制标签</h2>'
    + '<div class="row"><span class="k">管制单号</span><span class="v">' + esc(o.order_no) + '</span></div>'
    + '<div class="row"><span class="k">料号</span><span class="v">' + esc(o.part_no) + '</span></div>'
    + '<div class="row"><span class="k">品名</span><span class="v">' + esc(o.part_name) + '</span></div>'
    + '<div class="row"><span class="k">机型</span><span class="v">' + esc(o.model) + '</span></div>'
    + '<div class="row"><span class="k">不良类型</span><span class="v">' + esc(o.bad_type) + '</span></div>'
    + '<div class="row"><span class="k">数量</span><span class="v">' + esc(o.qty) + '</span></div>'
    + '<div class="row"><span class="k">原因</span><span class="v">' + esc(o.reason) + '</span></div>'
    + '<div class="row"><span class="k">申请日期</span><span class="v">' + esc(fmtDate(o.apply_at)) + '</span></div>'
    + '</div></div></body></html>';
  return html;
}

// 渲染标签：生成 QR（LRU 缓存）→ 拼 HTML → 发送；download=true 输出附件头，autoPrint 控制自动打印
async function renderLabel(o, req, res, opts) {
  opts = opts || {};
  var download = !!opts.download;
  var autoPrint = !!opts.autoPrint;
  var qrWidth = 168;
  var qrContent = o.order_no;
  var send = function (qrDataUrl) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    if (download) res.set('Content-Disposition', 'attachment; filename="' + o.order_no + '_label.html"');
    res.send(buildLabelHtml(o, qrDataUrl, autoPrint));
  };
  var cached = getCachedQR(qrContent, qrWidth);
  if (cached) return send(cached);
  try {
    var qrDataUrl = await QRCode.toDataURL(qrContent, { width: qrWidth, margin: 1, errorCorrectionLevel: 'M' });
    setCachedQR(qrContent, qrWidth, qrDataUrl);
    send(qrDataUrl);
  } catch (e) {
    logger.error('生成管制标签失败: ' + e.message);
    res.status(500).json({ error: '生成管制标签失败' });
  }
}

async function assertDownloadRole(app, req, res) {
  var u = await app.locals.currentUser(req);
  if (!DOWNLOAD_ROLES.includes(u.role)) {
    res.status(403).json({ error: '无权限下载，仅限管理员/品保/研发' });
    return false;
  }
  return true;
}

function register(app) {
  const requireAuth = app.locals.requireAuth;

  // 标签可打印 HTML（登录，预览不自动打印）
  app.get('/api/control/orders/:id/label', requireAuth, asyncHandler(async (req, res) => {
    var o = await D.getOrderById(Number(req.params.id));
    if (!o) return res.status(404).json({ error: '管制单不存在' });
    await renderLabel(o, req, res, { autoPrint: false });
  }));

  // 打印标签（登录，自动 window.print()）
  app.get('/api/control/orders/:id/label/print', requireAuth, asyncHandler(async (req, res) => {
    var o = await D.getOrderById(Number(req.params.id));
    if (!o) return res.status(404).json({ error: '管制单不存在' });
    await renderLabel(o, req, res, { autoPrint: true });
  }));

  // 下载标签（附件 HTML，仅 ADMIN/QA/RD）
  app.get('/api/control/orders/:id/label/download', requireAuth, asyncHandler(async (req, res) => {
    if (!(await assertDownloadRole(app, req, res))) return;
    var o = await D.getOrderById(Number(req.params.id));
    if (!o) return res.status(404).json({ error: '管制单不存在' });
    await renderLabel(o, req, res, { download: true });
  }));
}

module.exports = { register };
