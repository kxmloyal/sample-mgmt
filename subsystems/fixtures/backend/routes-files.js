// routes/fixture-files.js — 治具文件上传/列表/下载/删除
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const D = require('../../../db');
const { logger } = require('../../../logger');

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
    var dir = D.getUploadDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    var ext = path.extname(file.originalname);
    cb(null, crypto.randomUUID() + ext);
  }
});

var FILE_CATEGORY_CN = { design_drawing: '设计图纸', purchase_order: '请购单', fixture_photo: '实物照片', maintenance_photo: '保养照片', site_photo: '现场照片', other: '其他' };

var upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function(req, file, cb) {
    var cat = req.body.category || 'other';
    var allowed = {
      'design_drawing': ['application/pdf','image/vnd.dwg','image/vnd.dxf','application/x-dwf',
        'model/stl','application/zip',
        'application/vnd.ms-pki.stl','application/step','application/x-step',
        'model/step','application/iges','model/iges'],
      'purchase_order': ['application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg','image/png','image/webp'],
      'fixture_photo': ['image/jpeg','image/png','image/webp'],
      'maintenance_photo': ['image/jpeg','image/png','image/webp'],
      'site_photo': ['image/jpeg','image/png','image/webp'],
      'other': ['application/pdf','application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg','image/png','image/webp',
        'application/zip','model/stl','application/octet-stream']
    };
    var ext = (file.originalname || '').toLowerCase();
    if (cat === 'design_drawing') {
      var isStepLike = /\.(stp|step|stl|igs|iges|dwg|dxf|dwf|zip)$/i.test(ext);
      if (isStepLike) { cb(null, true); return; }
    }
    if (allowed[cat] && allowed[cat].indexOf(file.mimetype) !== -1) { cb(null, true); }
    else { cb(new Error('不支持的文件类型: ' + file.mimetype + ' (分类: ' + (FILE_CATEGORY_CN && FILE_CATEGORY_CN[cat] || cat) + ')')); }
  }
});

function register(app) {
  var requireAuth = app.locals.requireAuth;
  var currentUser = app.locals.currentUser;

  // 1. 获取文件列表
  app.get('/api/fixtures/:id/files', requireAuth, async function(req, res) {
    var fixtureId = Number(req.params.id);
    var f = await D.getFixtureById(fixtureId);
    if (!f) return res.status(404).json({ error: '治具不存在' });
    var files = await D.listFiles(fixtureId);
    res.json(files);
  });

  // 2. 上传文件
  app.post('/api/fixtures/:id/files', requireAuth, async function(req, res) {
    var fixtureId = Number(req.params.id);
    var u = await currentUser(req);
    if (u.role !== 'RD') return res.status(403).json({ error: '仅 RD 可上传文件' });

    var f = await D.getFixtureById(fixtureId);
    if (!f) return res.status(404).json({ error: '治具不存在' });
    if (f.status !== 'ACCEPTED') return res.status(400).json({ error: '仅「已接收」状态可上传文件' });

    upload.single('file')(req, res, async function(err) {
      if (err) return res.status(400).json({ error: '上传失败：' + err.message });
      if (!req.file) return res.status(400).json({ error: '请选择文件' });

      var category = req.body.category || 'other';
      if (['design_drawing','purchase_order','fixture_photo','maintenance_photo','site_photo','other'].indexOf(category) === -1)
        return res.status(400).json({ error: '无效的文件分类' });

      // 照片类别仅允许图片格式
      var photoCategories = ['fixture_photo', 'maintenance_photo', 'site_photo'];
      if (photoCategories.includes(category)) {
        if (!req.file.mimetype.startsWith('image/')) {
          return res.status(400).json({ error: '照片类别仅支持图片格式 (jpg/png/webp)' });
        }
      }

      try {
        var record = await D.addFile({
          fixture_id: fixtureId,
          category: category,
          filename: req.file.filename,
          original_name: req.file.originalname,
          mime_type: req.file.mimetype,
          file_size: req.file.size,
          uploaded_by: u.id
        });
        await D.addFixtureLog({ fixture_id: fixtureId, action: 'FILE_UPLOAD', role: u.role, user_id: u.id, dept: u.dept,
          note: '上传文件：' + category + ' - ' + req.file.originalname });
        res.json(record);
      } catch (e) {
        logger.error('保存文件记录失败: ' + e.message);
        res.status(500).json({ error: '保存文件记录失败' });
      }
    });
  });

  // 3. 下载/预览文件
  app.get('/api/fixtures/:id/files/:fileId/download', requireAuth, async function(req, res) {
    var file = await D.getFileById(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '文件不存在' });
    var filePath = path.join(D.getUploadDir(), file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件已从磁盘删除' });
    res.set('Content-Disposition', 'inline; filename="' + encodeURIComponent(file.original_name) + '"');
    res.set('Content-Type', file.mime_type || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  });

  // 4. 删除文件
  app.delete('/api/fixtures/:id/files/:fileId', requireAuth, async function(req, res) {
    var u = await currentUser(req);
    var file = await D.getFileById(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '文件不存在' });

    if (u.role !== 'ADMIN' && !(u.role === 'RD' && file.uploaded_by === u.id))
      return res.status(403).json({ error: '无权限删除此文件' });

    await D.deleteFile(file.id);
    res.json({ ok: true });
  });
}

module.exports = { register: register };
