// fixture-file-ui.js — 治具文件管理 UI（上传/列表/预览/3D）

async function loadFixFiles(fixtureId) {
  try {
    var files = await fetchFixtureFiles(fixtureId);
    var el = document.getElementById('fix-files');
    if (!el) return;
    if (!files || !files.length) {
      el.innerHTML = '<span style="color:var(--bad)">⚠ 请先上传设计图纸（制作前必须）</span>';
      return;
    }
    el.innerHTML = files.map(function(file) { return renderFixFileItem(fixtureId, file); }).join('');
  } catch (e) { var el2 = document.getElementById('fix-files'); if (el2) el2.innerHTML = '加载失败'; }
}

function renderFixFileItem(fixtureId, file) {
  var isImage = file.mime_type && file.mime_type.startsWith('image/');
  var isPreview = PREVIEW_TYPES.indexOf(file.mime_type) !== -1;
  var is3D = file.mime_type === 'model/stl' || /step|iges|stp|igs|stl/i.test(file.original_name || '');
  var catLabel = FILE_CATEGORY_CN[file.category] || file.category;
  var html = '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">';
  if (isImage) {
    html += '<img src="' + filePreviewUrl(fixtureId, file.id) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="previewFixFile(event,' + fixtureId + ',' + file.id + ',\'' + (file.mime_type||'') + '\')" />';
  } else {
    html += '<span style="font-size:18px">' + fileIcon(file.mime_type) + '</span>';
  }
  html += '<span style="flex:1;min-width:0"><span style="font-size:13px">' + e(file.original_name) + '</span><br><small style="color:var(--muted)">' + catLabel + ' · ' + formatFileSize(file.file_size) + ' · ' + fmt(file.uploaded_at) + '</small></span>';
  if (isPreview || isImage) {
    html += '<a class="link" style="font-size:12px;white-space:nowrap" onclick="previewFixFile(event,' + fixtureId + ',' + file.id + ',\'' + (file.mime_type||'') + '\')">预览</a>';
  }
  if (!isPreview && !isImage && is3D) {
    html += '<a class="link" style="font-size:12px;white-space:nowrap" onclick="preview3DFile(event,' + fixtureId + ',' + file.id + ',\'' + e(file.original_name) + '\')">3D预览</a>';
  }
  html += '<a class="link" style="font-size:12px;white-space:nowrap;margin-left:4px" href="' + filePreviewUrl(fixtureId, file.id) + '" download>下载</a>';
  html += '<a class="link" style="font-size:12px;white-space:nowrap;color:var(--bad);margin-left:4px" onclick="deleteFixFile(event,' + fixtureId + ',' + file.id + ')">删除</a>';
  html += '</div>';
  return html;
}

function onFixFileSelected() {
  var input = document.getElementById('fx-file-input');
  var cat = document.getElementById('fx-file-cat');
  var fixtureId = Number(input.dataset.fixtureId);
  if (!fixtureId) { showToast('无法确定治具ID'); return; }
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  uploadFixtureFile(fixtureId, file, cat.value).then(function() {
    showToast('上传成功');
    loadFixFiles(fixtureId);
    var codeEl = document.getElementById('scan-code');
    if (codeEl && codeEl.value) doScanFix();
  }).catch(function(e) { showToast(e.message); });
}

function previewFixFile(e, fixtureId, fileId, mimeType) {
  e.stopPropagation();
  var url = filePreviewUrl(fixtureId, fileId);
  if (mimeType.startsWith('image/')) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<img src="' + url + '" style="max-width:90vw;max-height:90vh;border-radius:8px" /><button style="position:absolute;top:20px;right:20px;background:none;border:none;font-size:24px;color:#fff;cursor:pointer" onclick="this.closest(\'.modal-mask\').remove()">&times;</button>';
    document.body.appendChild(overlay);
  } else if (mimeType === 'application/pdf') {
    var overlay2 = document.createElement('div');
    overlay2.className = 'modal-mask';
    overlay2.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay2.onclick = function(ev) { if (ev.target === overlay2) overlay2.remove(); };
    overlay2.innerHTML = '<div style="position:relative;width:90vw;height:90vh"><button style="position:absolute;top:-30px;right:0;background:none;border:none;font-size:24px;color:#fff;cursor:pointer" onclick="this.closest(\'.modal-mask\').remove()">&times;</button><iframe src="' + url + '" style="width:100%;height:100%;border:none;border-radius:8px"></iframe></div>';
    document.body.appendChild(overlay2);
  }
}

function preview3DFile(e, fixtureId, fileId, fileName) {
  e.stopPropagation();
  var url = '/3d-viewer.html?url=' + encodeURIComponent('/api/fixtures/' + fixtureId + '/files/' + fileId + '/preview') + '&name=' + encodeURIComponent(fileName);
  window.open(url, '_blank', 'width=1200,height=800');
}

async function deleteFixFile(e, fixtureId, fileId) {
  e.stopPropagation();
  try {
    await deleteFixtureFile(fixtureId, fileId);
    showToast('已删除');
    loadFixFiles(fixtureId);
    var codeEl = document.getElementById('scan-code');
    if (codeEl && codeEl.value) doScanFix();
  } catch (err) { showToast(err.message); }
}
