// shared/file-manager.js — 通用文件管理 DAO（子系统无关）
const path = require('path');
const fs = require('fs');

/**
 * 创建文件管理器工厂
 * @param {object} deps
 * @param {Function} deps.q - 数据库查询函数 (sql, params) => rows
 * @param {Function} deps.one - 单行查询函数
 * @param {Function} deps.run - 写操作函数
 * @param {string} deps.uploadDir - 物理上传目录绝对路径
 * @param {string} deps.filesTable - 文件表名（供子系统自定义）
 * @param {Array} deps.categories - 文件分类 [{key, label, extensions}]
 */
function createFileManager(deps) {
  var q = deps.q, one = deps.one, run = deps.run;
  var uploadDir = deps.uploadDir;
  var table = deps.filesTable || 'files';
  var categories = deps.categories || [];

  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  /** 新增文件记录 */
  async function addFile(record) {
    var sql = 'INSERT INTO ' + table + ' (target_id, category, filename, original_name, mime_type, file_size, file_path, created_by, note) VALUES (?,?,?,?,?,?,?,?,?)';
    var result = await run(sql, [record.target_id, record.category, record.filename, record.original_name, record.mime_type, record.file_size, record.file_path, record.created_by, record.note || '']);
    return result;
  }

  /** 列出目标对象的文件 */
  async function listFiles(targetId, category) {
    var sql = 'SELECT * FROM ' + table + ' WHERE target_id = ?';
    var params = [targetId];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY created_at DESC';
    return q(sql, params);
  }

  /** 删除文件记录及物理文件 */
  async function deleteFile(fileId) {
    var row = await one('SELECT * FROM ' + table + ' WHERE id = ?', [fileId]);
    if (!row) throw { status: 404, message: '文件不存在' };
    var fp = path.join(uploadDir, row.file_path || row.filename);
    try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (e) { /* 忽略物理删除失败 */ }
    await run('DELETE FROM ' + table + ' WHERE id = ?', [fileId]);
    return row;
  }

  /** 按分类统计文件数 */
  async function countByCategory(targetId, category) {
    var sql = 'SELECT COUNT(*) as cnt FROM ' + table + ' WHERE target_id = ?';
    var params = [targetId];
    if (category) { sql += ' AND category = ?'; params.push(category); }
    return one(sql, params);
  }

  return { addFile, listFiles, deleteFile, countByCategory, uploadDir, categories };
}

module.exports = { createFileManager };
