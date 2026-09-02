// sample-images.js — 样品图片保存与魔数校验（B3-T1 自 routes-samples.js 拆分，行为零变化）
const path = require('path');
const fs = require('fs');
const { logger } = require('../../../logger');

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
const UPLOAD_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10);

// 图片魔数（文件头）校验（T14）：不信任 data URL 声明的 MIME，声明类型与实际内容不符时拒绝落盘
function matchImageMagic(buf, ext) {
  if (!buf || buf.length < 4) return false;
  if (ext === 'jpg') return buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF;
  if (ext === 'png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
  if (ext === 'gif') return buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38;
  if (ext === 'webp') return buf.length >= 12 && buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP';
  return false;
}

// 保存样品图片（同步落盘后再返回 URL，避免 DB 入库但文件未写入的脏数据）
async function saveSampleImage(dataUrl, sampleNo) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  let ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return null;
  const size = Buffer.byteLength(m[2], 'base64');
  if (size > UPLOAD_MAX_SIZE) { logger.warn('图片过大:' + size); return null; }
  const buf = Buffer.from(m[2], 'base64');
  if (!matchImageMagic(buf, ext)) { logger.warn('图片内容与声明类型不符(魔数校验失败): ' + sampleNo + '.' + ext); return null; }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fname = sampleNo + '.' + ext;
  const filePath = path.join(UPLOAD_DIR, fname);
  try {
    await fs.promises.writeFile(filePath, buf);
    return '/uploads/' + fname;
  } catch (e) { logger.error('保存图片失败: ' + e.message); return null; }
}

module.exports = { saveSampleImage, UPLOAD_DIR };
