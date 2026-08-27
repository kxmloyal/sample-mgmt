// subsystems/control/backend/routes-files.js — 管制单附件（文件/图片）上传/列表/下载/删除
// 规范：前缀 /api/control，requireAuth，登录即可上传，删除仅上传者或 ADMIN，图片走 inline 预览
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');

// 存储：磁盘随机文件名（uuid + 原扩展名），避免路径穿越与重名
var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    var dir = D.getControlUploadDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});

// 简化：不分类，按扩展名白名单放行常见图片/文档/压缩包/3D 图纸
var ALLOWED_EXT = /\.(jpg|jpeg|png|webp|gif|bmp|pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv|zip|rar|7z|step|stp|stl|igs|iges|dwg|dxf)$/i;

var upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    var ext = (file.originalname || '').toLowerCase();
    if (ALLOWED_EXT.test(ext)) cb(null, true);
    else cb(new Error('不支持的文件类型: ' + ext));
  }
});

function register(app) {
  var requireAuth = app.locals.requireAuth;
  var currentUser = app.locals.currentUser;

  // 1. 附件列表
  app.get('/api/control/orders/:id/files', requireAuth, asyncHandler(async (req, res) => {
    var order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    var files = await D.ctlListOrderFiles(order.id);
    res.json(files);
  }));

  // 2. 上传附件（multer single('file')）；登录即可，写留痕
  app.post('/api/control/orders/:id/files', requireAuth, asyncHandler(async (req, res) => {
    var u = await currentUser(req);
    var order = await D.getOrderById(Number(req.params.id));
    if (!order) return res.status(404).json({ error: '管制单不存在' });
    upload.single('file')(req, res, async function (err) {
      if (err) return res.status(400).json({ error: '上传失败：' + err.message });
      if (!req.file) return res.status(400).json({ error: '请选择文件' });
      try {
        var record = await D.ctlAddOrderFile({
          order_id: order.id,
          filename: req.file.filename,
          original_name: req.file.originalname,
          mime_type: req.file.mimetype,
          file_size: req.file.size,
          uploaded_by: u.id
        });
        await D.addControlLog({ order_id: order.id, action: 'FILE_UPLOAD', role: u.role, user_id: u.id, dept: u.dept, comment: '上传附件：' + req.file.originalname });
        res.json(record);
      } catch (e) {
        logger.error('保存附件记录失败: ' + e.message);
        res.status(500).json({ error: '保存附件记录失败' });
      }
    });
  }));

  // 3. 下载/预览附件：图片 inline 预览，其余 inline 下载
  app.get('/api/control/orders/:id/files/:fileId/download', requireAuth, asyncHandler(async (req, res) => {
    var file = await D.ctlGetOrderFile(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '附件不存在' });
    var filePath = path.join(D.getControlUploadDir(), file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '附件已从磁盘删除' });
    res.set('Content-Disposition', 'inline; filename="' + encodeURIComponent(file.original_name) + '"');
    res.set('Content-Type', file.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  }));

  // 4. 删除附件：仅上传者本人或 ADMIN；写留痕
  app.delete('/api/control/orders/:id/files/:fileId', requireAuth, asyncHandler(async (req, res) => {
    var u = await currentUser(req);
    var file = await D.ctlGetOrderFile(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '附件不存在' });
    if (u.role !== 'ADMIN' && file.uploaded_by !== u.id)
      return res.status(403).json({ error: '无权限删除此附件' });
    await D.ctlDeleteOrderFile(file.id);
    await D.addControlLog({ order_id: file.order_id, action: 'FILE_DELETE', role: u.role, user_id: u.id, dept: u.dept, comment: '删除附件：' + file.original_name });
    res.json({ ok: true });
  }));
}

module.exports = { register };
