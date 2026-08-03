// shared/middleware/upload.js — 通用文件上传中间件
const multer = require('multer');
const path = require('path');
const fs = require('fs');

/**
 * 创建 multer 上传实例
 * @param {object} opts
 * @param {string} opts.uploadDir - 上传目录（相对于项目根目录）
 * @param {number} opts.maxSize - 单文件最大字节数（默认 10MB）
 * @param {Function} opts.filename - 文件名生成函数 (req, file) => string
 * @param {string[]} opts.allowedMimes - 允许的 MIME 类型
 */
function createUploader(opts) {
  const dir = path.join(__dirname, '..', '..', opts.uploadDir || 'public/uploads');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: opts.filename || function (req, file, cb) {
        const ext = path.extname(file.originalname);
        cb(null, Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
      }
    }),
    limits: { fileSize: opts.maxSize || 10485760 },
    fileFilter: function (req, file, cb) {
      if (!opts.allowedMimes || opts.allowedMimes.length === 0) return cb(null, true);
      if (opts.allowedMimes.includes(file.mimetype)) return cb(null, true);
      cb(new Error('不支持的文件类型: ' + file.mimetype));
    }
  });
}

module.exports = { createUploader };
