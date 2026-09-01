// routes/cards.js — 标示卡：匿名查看 / 标签下载 / 二维码 / 打印
const D = require('../../../db');
const { logger } = require('../../../logger');
const QRCode = require('qrcode');
const { buildLabelHtml, buildCardPrintHtml, parseSize } = require('./card-html');
const { buildBatchCardPrintHtml } = require('./card-print-html');
const { cardPageHtml } = require('./card-page');
const { escapeHtml } = require('./html-utils');
const { asyncHandler } = require('./async-handler');

// QR码缓存：同一 sample_no+width 组合只生成一次，减少 CPU 消耗
// LRU 策略：命中时删除再 set（移到末尾=最新），淘汰时选 Map 迭代首个=最久未访问
var qrCache = new Map();
var QR_CACHE_MAX = 200;
function getCachedQR(sampleNo, width) {
  var key = sampleNo + '_' + width;
  if (qrCache.has(key)) { var v = qrCache.get(key); qrCache.delete(key); qrCache.set(key, v); return v; }
  return null;
}
function setCachedQR(sampleNo, width, dataUrl) {
  var key = sampleNo + '_' + width;
  if (qrCache.size >= QR_CACHE_MAX) { var oldest = qrCache.keys().next().value; qrCache.delete(oldest); }
  qrCache.set(key, dataUrl);
}

// 下载类接口角色门槛：仅 ADMIN/QA/RD（发行/制作环节）可下载标签与二维码文件
var DOWNLOAD_ROLES = ['ADMIN', 'QA', 'RD'];
async function assertDownloadRole(app, req, res) {
  const u = await app.locals.currentUser(req);
  if (!DOWNLOAD_ROLES.includes(u.role)) {
    res.status(403).json({ error: '无权限下载，仅限管理员/品保/研发' });
    return false;
  }
  return true;
}

// 标签 HTML 渲染（print/download 共用）：取样品 → 解析尺寸 → 生成 QR（LRU 缓存）→ 拼 HTML
// download=true 时输出附件下载头且不自动弹打印（autoPrint 分离）
async function renderLabel(s, req, res, download) {
  const { sizeKey, scale, cw, ch } = parseSize(req);
  var qrGenW = Math.round(132 * scale);
  // QR 直接编码样品编号 sample_no，扫码即显示编号（已弃用 qr_token 作为内容，用户明确取舍防枚举特性）
  var qrContent = s.sample_no;
  var sendHtml = function (qrDataUrl) {
    res.set('Content-Type', 'text/html; charset=utf-8');
    if (download) res.set('Content-Disposition', 'attachment; filename="' + s.sample_no + '_label.html"');
    res.send(buildLabelHtml(s, qrDataUrl, true, !download, scale, sizeKey, cw, ch));
  };
  var cached = getCachedQR(qrContent, qrGenW);
  if (cached) return sendHtml(cached);
  try {
    var qrDataUrl = await QRCode.toDataURL(qrContent, { width: qrGenW, margin: 1, errorCorrectionLevel: 'M' });
    setCachedQR(qrContent, qrGenW, qrDataUrl);
    sendHtml(qrDataUrl);
  } catch (e) {
    logger.error('生成标签失败: ' + e.message);
    res.status(500).json({ error: '生成标签失败' });
  }
}

function register(app) {
  const requireAuth = app.locals.requireAuth;

  // 匿名数字标示卡（无需登录，QR码扫码查看）
  app.get('/card/:sample_no', asyncHandler(async (req, res) => {
    const sampleNo = (req.params.sample_no || '').trim();
    if (!sampleNo) return res.status(400).send('无效样品编号');
    const s = await D.getSampleByNo(sampleNo);
    if (!s) {
      return res.status(404).send('<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>未找到</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f5;color:#999}</style></head><body><div style="text-align:center"><h1>404</h1><p>未找到样品: '+escapeHtml(sampleNo)+'</p></div></body></html>');
    }

    const html = await cardPageHtml(s);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }));

  // 批量打印标示卡（T17：单页多卡 + @page 分页，一次 window.print；替代前端循环 window.open 被浏览器拦截的方案）
  // 注意：必须注册在 /api/samples/:id/... 路由之前，避免被 :id 捕获
  app.get('/api/samples/cards/print', requireAuth, asyncHandler(async (req, res) => {
    // ids 解析：逗号分隔、去空白、剔除非数字、去重；空 → 400，超 50 → 400
    var raw = String(req.query.ids || '');
    var seen = {};
    var ids = [];
    raw.split(',').forEach(function (p) {
      var t = p.trim();
      if (!/^\d+$/.test(t)) return;
      if (!seen[t]) { seen[t] = true; ids.push(Number(t)); }
    });
    if (ids.length === 0) return res.status(400).json({ error: '请提供有效的样品ID列表' });
    if (ids.length > 50) return res.status(400).json({ error: '一次最多打印 50 张' });
    // 逐 id 实时查库（getSampleById 已过滤 deleted_at 软删），不存在/已删除 → 跳过并计数
    var samples = [];
    var skipped = 0;
    for (var i = 0; i < ids.length; i++) {
      var s = await D.getSampleById(ids[i]);
      if (s) samples.push(s); else skipped++;
    }
    if (samples.length === 0) return res.status(404).json({ error: '样品不存在或已删除' });
    const { sizeKey, cw, ch } = parseSize(req);
    const html = buildBatchCardPrintHtml(samples, sizeKey, cw, ch, skipped);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }));

  // 打印标示卡（无QR，仅标示卡内容，品保发行后贴入标签空白区，纸张=标签空白卡区尺寸）
  app.get('/api/samples/:id/card/print', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    const { sizeKey, cw, ch } = parseSize(req);
    const html = buildCardPrintHtml(s, sizeKey, cw, ch);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }));

  // 打印标签（2:3布局，左QR+基本信息，右空白标示卡区，自动打印）
  app.get('/api/samples/:id/label/print', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    await renderLabel(s, req, res, false);
  }));

  // 下载标签（HTML附件，2:3布局，不自动打印）
  app.get('/api/samples/:id/label/download', requireAuth, asyncHandler(async (req, res) => {
    if (!(await assertDownloadRole(app, req, res))) return;
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    await renderLabel(s, req, res, true);
  }));

  // 下载二维码（高分辨率 PNG，供条码打印软件导入）
  app.get('/api/samples/:id/qrcode/download', requireAuth, asyncHandler(async (req, res) => {
    if (!(await assertDownloadRole(app, req, res))) return;
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_QR.png"');
    // QR 直接编码 sample_no，扫码显示编号（旧 qr_token 内容已弃用，如需查旧码走 getSampleByToken）
    QRCode.toFileStream(res, s.sample_no, { width: 600, margin: 1, errorCorrectionLevel: 'M' });
  }));

  // 预览二维码（PNG流）
  app.get('/api/samples/:id/qrcode', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.set('Content-Type', 'image/png');
    QRCode.toFileStream(res, s.sample_no, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
  }));
}

module.exports = { register };
