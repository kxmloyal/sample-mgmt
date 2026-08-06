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
 * @param {string[]} opts.allowedExtensions - 允许的扩展名白名单（小写，不含点；未配置默认放行以兼容既有调用方）
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
      // C3 修复：扩展名白名单（配置后严格校验，防上传可执行 HTML 等至静态目录）
      if (opts.allowedExtensions && opts.allowedExtensions.length) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/^\./, '');
        if (!opts.allowedExtensions.includes(ext)) return cb(new Error('不支持的文件类型: ' + (file.originalname || '')));
      }
      if (opts.allowedMimes && opts.allowedMimes.length && !opts.allowedMimes.includes(file.mimetype)) {
        return cb(new Error('不支持的文件类型: ' + file.mimetype));
      }
      cb(null, true);
    }
  });
}

module.exports = { createUploader };
