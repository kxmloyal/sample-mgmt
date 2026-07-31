// routes/fixture-preview.js — 3D CAD 文件预览服务（gmsh STEP/IGES → STL 转换，不可用时回退原始下载）
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const D = require('../db');
const { logger } = require('../logger');

// 检测 gmsh 是否可用
var gmshPath = null;
try { exec('which gmsh', function(err, stdout) { if (!err && stdout.trim()) gmshPath = stdout.trim(); }); } catch(e) {}

// 临时缓存目录（转换后的 STL）
var CACHE_DIR = path.join(require('os').tmpdir(), 'fixture_preview');

function getConvertCmd(filePath, mimeType) {
  var ext = path.extname(filePath).toLowerCase();
  if (gmshPath && ['.step','.stp','.iges','.igs'].indexOf(ext) !== -1) {
    var stlPath = filePath.replace(new RegExp(ext.replace('.','\\.') + '$'), '.stl');
    return { cmd: gmshPath + ' "' + filePath + '" -2 -o "' + stlPath + '" -format stl', outputFile: stlPath, mimeType: 'model/stl' };
  }
  if (ext === '.stl') return { cmd: null, outputFile: filePath, mimeType: 'model/stl' };
  return null;
}

function register(app) {
  var requireAuth = app.locals.requireAuth;

  // 获取预览数据（STL 直接返回，STEP/IGES 需 gmsh 转换，不可用时返回提示）
  app.get('/api/fixtures/:id/files/:fileId/preview', requireAuth, async function(req, res) {
    var file = await D.getFileById(Number(req.params.fileId));
    if (!file) return res.status(404).json({ error: '文件不存在' });
    var filePath = path.join(D.getUploadDir(), file.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: '文件已从磁盘删除' });

    var convert = getConvertCmd(filePath, file.mime_type);
    if (!convert) {
      // 不支持 3D 预览，返回提示
      return res.status(400).json({ error: '此文件格式不支持 3D 预览（支持的格式：STL, STEP, IGES）' });
    }

    if (convert.cmd === null) {
      // STL 直接返回
      res.set('Content-Type', 'model/stl');
      res.set('Access-Control-Allow-Origin', '*');
      return fs.createReadStream(filePath).pipe(res);
    }

    // STEP/IGES 需要 gmsh 转换
    // 检查缓存
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    var cacheKey = file.filename + '.stl';
    var cachePath = path.join(CACHE_DIR, cacheKey);
    if (fs.existsSync(cachePath)) {
      res.set('Content-Type', 'model/stl');
      res.set('Access-Control-Allow-Origin', '*');
      return fs.createReadStream(cachePath).pipe(res);
    }

    // 执行转换
    exec(convert.cmd, { timeout: 30000 }, function(err) {
      if (err) {
        logger.error('3D转换失败: ' + err.message);
        return res.status(500).json({ error: '3D格式转换失败，请下载源文件查看' });
      }
      try {
        if (fs.existsSync(convert.outputFile)) {
          fs.copyFileSync(convert.outputFile, cachePath);
          res.set('Content-Type', 'model/stl');
          res.set('Access-Control-Allow-Origin', '*');
          fs.createReadStream(cachePath).pipe(res);
        } else {
          res.status(500).json({ error: '转换输出文件不存在' });
        }
      } catch(e) {
        logger.error('缓存3D文件失败: ' + e.message);
        res.status(500).json({ error: '预览失败' });
      }
    });
  });
}

module.exports = { register: register };
