// routes/cards.js — 标示卡：匿名查看 / 标签下载 / 二维码 / 打印
const D = require('../../../db');
const { logger } = require('../../../logger');
const QRCode = require('qrcode');
const { buildLabelHtml, buildCardPrintHtml, parseSize } = require('./card-html');
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

  // 打印标示卡（无QR，仅标示卡内容，品保发行后贴入标签空白区）
  app.get('/api/samples/:id/card/print', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    const { sizeKey, scale } = parseSize(req);
    const html = buildCardPrintHtml(s, scale, sizeKey);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }));

  // 打印标签（2:3布局，左QR+基本信息，右空白标示卡区，自动打印）
  app.get('/api/samples/:id/label/print', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    const { sizeKey, scale } = parseSize(req);
    var qrGenW = Math.round(132 * scale);
    // QR 内容用不可枚举的 qr_token（兼容存量 qr_token 为空的历史数据回落 sample_no）
    var qrContent = s.qr_token || s.sample_no;
    var cached = getCachedQR(qrContent, qrGenW);
    if (cached) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      return res.send(buildLabelHtml(s, cached, true, scale, sizeKey));
    }
    QRCode.toDataURL(qrContent, { width: qrGenW, margin: 1, errorCorrectionLevel: 'M' })
      .then(qrDataUrl => {
        setCachedQR(qrContent, qrGenW, qrDataUrl);
        const html = buildLabelHtml(s, qrDataUrl, true, scale, sizeKey);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      })
      .catch(e => {
        logger.error('生成标签失败: '+e.message);
        res.status(500).json({ error: '生成标签失败' });
      });
  }));

  // 下载标签（HTML附件，2:3布局）
  app.get('/api/samples/:id/label/download', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    const { sizeKey, scale } = parseSize(req);
    var qrGenW = Math.round(132 * scale);
    var qrContent = s.qr_token || s.sample_no;
    var cached = getCachedQR(qrContent, qrGenW);
    if (cached) {
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_label.html"');
      return res.send(buildLabelHtml(s, cached, true, scale, sizeKey));
    }
    QRCode.toDataURL(qrContent, { width: qrGenW, margin: 1, errorCorrectionLevel: 'M' })
      .then(qrDataUrl => {
        setCachedQR(qrContent, qrGenW, qrDataUrl);
        const html = buildLabelHtml(s, qrDataUrl, true, scale, sizeKey);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_label.html"');
        res.send(html);
      })
      .catch(e => {
        logger.error('生成标签失败: '+e.message);
        res.status(500).json({ error: '生成标签失败' });
      });
  }));

  // 下载二维码（高分辨率 PNG，供条码打印软件导入）
  app.get('/api/samples/:id/qrcode/download', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.set('Content-Type', 'image/png');
    res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_QR.png"');
    QRCode.toFileStream(res, s.qr_token || s.sample_no, { width: 600, margin: 1, errorCorrectionLevel: 'M' });
  }));

  // 预览二维码（PNG流）
  app.get('/api/samples/:id/qrcode', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.set('Content-Type', 'image/png');
    QRCode.toFileStream(res, s.qr_token || s.sample_no, { width: 320, margin: 1, errorCorrectionLevel: 'M' });
  }));
}

module.exports = { register };
