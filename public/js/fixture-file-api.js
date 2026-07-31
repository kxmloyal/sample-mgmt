// fixture-file-api.js — 治具文件管理前端常量与API函数
var FILE_CATEGORY_CN = { design_drawing: '设计图纸', purchase_order: '请购单', fixture_photo: '实物照片', maintenance_photo: '保养照片', site_photo: '现场照片', other: '其他' };
var PREVIEW_TYPES = ['image/png','image/jpeg','image/gif','image/webp','application/pdf'];

function fileIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('dwg') || mimeType.includes('cad') || mimeType.includes('step') || mimeType.includes('iges') || mimeType === 'model/stl' || mimeType === 'application/sla') return '✏️';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compress')) return '📦';
  return '📎';
}

function filePreviewUrl(fixtureId, fileId) {
  return '/api/fixtures/' + fixtureId + '/files/' + fileId + '/download';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function fetchFixtureFiles(fixtureId) {
  return await api('GET', '/api/fixtures/' + fixtureId + '/files');
}

async function uploadFixtureFile(fixtureId, file, category) {
  var formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  var resp = await fetch('/api/fixtures/' + fixtureId + '/files', { method: 'POST', body: formData, credentials: 'same-origin' });
  if (!resp.ok) {
    var err = await resp.json().catch(function() { return { error: '上传失败' }; });
    throw new Error(err.error || '上传失败');
  }
  return await resp.json();
}

async function deleteFixtureFile(fixtureId, fileId) {
  return await api('DELETE', '/api/fixtures/' + fixtureId + '/files/' + fileId);
}
