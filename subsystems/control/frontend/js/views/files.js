// subsystems/control/frontend/js/views/files.js — 管制单附件（文件/图片）前端模块
// 提供：上传（FormData）、列表、图片缩略图+新窗口预览、下载、删除。简化：不分类，统一为"附件"。
// api-base.js 的 api() 仅支持 JSON，此处附件上传走原生 fetch multipart。

/** 附件预览/下载 URL（后端 inline + Content-Type，图片浏览器原生预览） */
function ctlFileUrl(orderId, fileId) {
  return '/api/control/orders/' + orderId + '/files/' + fileId + '/download';
}

function ctlFileIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (/dwg|cad|step|iges|stl|sla/i.test(mimeType)) return '✏️';
  if (/zip|rar|compress/i.test(mimeType)) return '📦';
  return '📎';
}

function ctlFormatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** 上传单文件到指定管制单 */
async function ctlUploadOrderFile(orderId, file) {
  var formData = new FormData();
  formData.append('file', file);
  var resp = await fetch('/api/control/orders/' + orderId + '/files', { method: 'POST', body: formData, credentials: 'same-origin' });
  if (!resp.ok) {
    var err = await resp.json().catch(function () { return { error: '上传失败' }; });
    throw new Error(err.error || '上传失败');
  }
  return resp.json();
}

/** 批量上传（新建页提交成功后调用）：逐个上传，返回成功/失败计数 */
async function ctlUploadOrderFiles(orderId, fileList) {
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return { ok: 0, fail: 0 };
  var ok = 0, fail = 0;
  for (var i = 0; i < files.length; i++) {
    try { await ctlUploadOrderFile(orderId, files[i]); ok++; }
    catch (e) { fail++; }
  }
  return { ok: ok, fail: fail };
}

/** 删除附件 */
async function ctlDeleteOrderFile(orderId, fileId) {
  return await api('DELETE', '/api/control/orders/' + orderId + '/files/' + fileId);
}

/** 加载附件列表并渲染到容器（详情页）；容器 id 由调用方传 #ctl-files */
async function ctlLoadOrderFiles(orderId) {
  var el = document.getElementById('ctl-files-list');
  if (!el) return;
  try {
    var files = await api('GET', '/api/control/orders/' + orderId + '/files');
    if (!files || !files.length) {
      el.innerHTML = '<span class="muted">暂无附件，点击上方选择文件上传</span>';
      return;
    }
    el.innerHTML = files.map(function (f) { return ctlFileItemHtml(orderId, f); }).join('');
  } catch (e) {
    el.innerHTML = '<span style="color:var(--bad)">附件加载失败</span>';
  }
}

/** 单条附件渲染：图片缩略图 + 预览/下载/删除 */
function ctlFileItemHtml(orderId, f) {
  var isImage = f.mime_type && f.mime_type.startsWith('image/');
  var html = '<div class="ctl-file-item">';
  if (isImage) {
    html += '<img class="ctl-file-thumb" src="' + ctlFileUrl(orderId, f.id) + '" alt="" onclick="ctlPreviewOrderFile(' + orderId + ',' + f.id + ',\'' + (f.mime_type || '') + '\')" />';
  } else {
    html += '<span class="ctl-file-icon">' + ctlFileIcon(f.mime_type) + '</span>';
  }
  html += '<span class="ctl-file-meta"><span class="ctl-file-name">' + e(f.original_name) + '</span>'
    + '<br><small class="muted">' + ctlFormatFileSize(f.file_size) + ' · ' + fmt(f.created_at) + '</small></span>';
  html += '<span class="ctl-file-ops">';
  if (isImage) {
    html += '<a class="link ctl-file-op" onclick="ctlPreviewOrderFile(' + orderId + ',' + f.id + ',\'' + (f.mime_type || '') + '\')">预览</a>';
  }
  html += '<a class="link ctl-file-op" href="' + ctlFileUrl(orderId, f.id) + '" download>下载</a>';
  html += '<a class="link ctl-file-op danger" onclick="ctlDeleteOrderFilePrompt(' + orderId + ',' + f.id + ')">删除</a>';
  html += '</span></div>';
  return html;
}

/** 图片新窗口预览（用户确认：缩略图 + 新窗口预览） */
function ctlPreviewOrderFile(orderId, fileId, mimeType) {
  window.open(ctlFileUrl(orderId, fileId), '_blank');
}

/** 删除前置确认（避免误删），复用全局 confirm 弹窗 */
function ctlDeleteOrderFilePrompt(orderId, fileId) {
  if (!window.confirm('确定删除该附件？')) return;
  ctlDeleteOrderFile(orderId, fileId).then(function () {
    showToast('已删除');
    ctlLoadOrderFiles(orderId);
  }).catch(function (e) { showToast(e.message); });
}

/** 新建页「选择文件」后的提示文案 */
function ctlNewFilesInfo() {
  var input = document.getElementById('n-files');
  var el = document.getElementById('n-files-info');
  if (!input || !el) return;
  var n = input.files ? input.files.length : 0;
  el.textContent = n ? ('已选 ' + n + ' 个附件') : '';
}

/** 详情页附件区 HTML（新建页无需调用；供 renderDetailBody 直接拼接） */
function ctlFilesSectionHtml(orderId) {
  return '<div class="ctl-sec">附件</div><div class="card ctl-files-card">'
    + '<div class="ctl-files-toolbar">'
    + '<input type="file" class="ctl-file-input" id="ctl-file-input" multiple onchange="ctlDetailFilesSelected(' + orderId + ')" />'
    + '<span class="muted">支持图片/PDF/Office/压缩包/图纸，单个≤10MB</span>'
    + '</div>'
    + '<div id="ctl-files-list" class="ctl-files-list"></div></div>';
}

/** 详情页选择文件后上传并刷列表；禁用按钮防重复提交 */
var _ctlDetailUploading = false;
async function ctlDetailFilesSelected(orderId) {
  var input = document.getElementById('ctl-file-input');
  if (!input || !input.files || !input.files.length || _ctlDetailUploading) return;
  _ctlDetailUploading = true;
  try {
    var r = await ctlUploadOrderFiles(orderId, input.files);
    showToast(r.fail ? ('上传完成 ' + r.ok + ' 个，失败 ' + r.fail + ' 个') : ('已上传 ' + r.ok + ' 个附件'), r.fail ? 'warn' : 'ok');
    input.value = '';
    ctlLoadOrderFiles(orderId);
  } catch (e) {
    showToast(e.message);
  } finally {
    _ctlDetailUploading = false;
  }
}

// —— 详情页附件区注入 ——
// 说明：detail-card.js 的 renderDetailBody 由 www 属主持有、当前用户无写权限，
// 故在本模块（bundle 中位于 detail-card.js 之后加载）以「包裹原函数」方式追加附件区，
// 避免修改受保护文件。原函数每次重置 #view 后再追加一次，天然幂等。
var _ctlOrigRenderDetailBody = renderDetailBody;
renderDetailBody = function () {
  _ctlOrigRenderDetailBody();
  var view = $('#view');
  if (!view) return;
  if (view.querySelector('.ctl-files-card')) return; // 防御：防止重复追加
  view.insertAdjacentHTML('beforeend', ctlFilesSectionHtml(_ctlDetailId));
  ctlLoadOrderFiles(_ctlDetailId);
};
