// fixture-photo-upload.js — 治具照片上传
var _pendingPhotos = [];

function _handlePhotoSelected() {
  var input = document.getElementById('act-photo-input');
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  _pendingPhotos.push(file);
  var list = document.getElementById('act-photo-list');
  if (!list) return;
  list.innerHTML = _pendingPhotos.map(function(f, i) {
    return '<div style="padding:4px 0">' + f.name + ' <a class="link" onclick="_removePendingPhoto(' + i + ')" style="cursor:pointer">移除</a></div>';
  }).join('');
  input.value = '';
}

function _removePendingPhoto(idx) {
  _pendingPhotos.splice(idx, 1);
  var list = document.getElementById('act-photo-list');
  if (!list) return;
  list.innerHTML = _pendingPhotos.map(function(f, i) {
    return '<div style="padding:4px 0">' + f.name + ' <a class="link" onclick="_removePendingPhoto(' + i + ')" style="cursor:pointer">移除</a></div>';
  }).join('');
}

async function uploadPendingPhotos(fixtureId) {
  if (_pendingPhotos.length === 0) return;
  for (var i = 0; i < _pendingPhotos.length; i++) {
    try {
      await uploadFixtureFile(fixtureId, _pendingPhotos[i], 'fixture_photo');
    } catch (e) { /* 忽略单张失败 */ }
  }
  _pendingPhotos = [];
}
