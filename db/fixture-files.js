// db/fixture-files.js — 治具文件 CRUD（工厂模式）
module.exports = function({ q, one, dbRef, nowISO }) {
  var path = require('path');
  var fs = require('fs');
  var UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'fixture_files');
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  function listFiles(fixtureId) {
    return q('SELECT * FROM fixture_files WHERE fixture_id=? ORDER BY uploaded_at DESC', [fixtureId]);
  }

  function getFileById(fileId) {
    return one('SELECT * FROM fixture_files WHERE id=?', [fileId]);
  }

  function nowMySQL() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

  async function addFile({ fixture_id, category, filename, original_name, mime_type, file_size, uploaded_by }) {
    var ts = nowMySQL();
    await dbRef.run(
      'INSERT INTO fixture_files (fixture_id,category,filename,original_name,mime_type,file_size,uploaded_by,uploaded_at) VALUES (?,?,?,?,?,?,?,?)',
      [fixture_id, category||'other', filename, original_name, mime_type||null, file_size||0, uploaded_by||null, ts]
    );
    return one('SELECT * FROM fixture_files WHERE fixture_id=? AND filename=? ORDER BY id DESC LIMIT 1', [fixture_id, filename]);
  }

  async function deleteFile(fileId) {
    var f = await getFileById(fileId);
    if (!f) return false;
    var filePath = path.join(UPLOAD_DIR, f.filename);
    fs.unlink(filePath, function(){}); // 异步删除，忽略错误
    await dbRef.run('DELETE FROM fixture_files WHERE id=?', [fileId]);
    return true;
  }

  function countFilesByCategory(fixtureId, category) {
    return one('SELECT COUNT(*) AS cnt FROM fixture_files WHERE fixture_id=? AND category=?', [fixtureId, category]);
  }

  function getUploadDir() { return UPLOAD_DIR; }

  return { listFiles, getFileById, addFile, deleteFile, countFilesByCategory, getUploadDir };
};
