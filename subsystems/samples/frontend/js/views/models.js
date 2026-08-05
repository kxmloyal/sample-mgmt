// models.js — 机型列表管理（仅 RD/ADMIN 可见，后端 POST/DELETE 403 兜底）
function viewModels() {
  const v = $('#view');
  v.innerHTML = '<div class="filters">' +
    '<fluent-text-field id="m-code" placeholder="机型短码（≥6位，如 YD9015）" style="flex:1.5"></fluent-text-field>' +
    '<fluent-text-field id="m-full-name" placeholder="机型全称（如 YD9015 低噪声马达）" style="flex:2"></fluent-text-field>' +
    '<fluent-button appearance="accent" size="small" onclick="addModel()">新增机型</fluent-button>' +
    '</div><div id="m-list"></div>';
  loadModels();
}

async function loadModels() {
  const list = await api('GET', '/api/samples/models');
  $('#m-list').innerHTML = '<div class="card" style="padding:0"><table>' +
    '<tr><th>机型短码</th><th>机型全称</th><th>创建时间</th><th style="width:80px">操作</th></tr>' +
    (list.length ? list.map(function (m) {
      return '<tr><td><b>' + e(m.code) + '</b></td><td>' + e(m.full_name) + '</td><td class="muted">' + e((m.created_at || '').replace('T', ' ').slice(0, 19)) + '</td>' +
        '<td><a class="link" onclick="deleteModel(' + m.id + ',\'' + m.code + '\')">删除</a></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">暂无机型，请先新增</td></tr>') +
    '</table></div>';
}

async function addModel() {
  const code = $('#m-code').value.trim().toUpperCase();
  const full_name = $('#m-full-name').value.trim();
  if (!code || !full_name) { toast('请填写机型短码和全称', 'err'); return; }
  try {
    await api('POST', '/api/samples/models', { code: code, full_name: full_name });
    toast('机型已新增', 'ok');
    $('#m-code').value = ''; $('#m-full-name').value = '';
    loadModels();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteModel(id, code) {
  if (!confirm('确认删除机型 ' + code + ' ？')) return;
  try {
    await api('DELETE', '/api/samples/models/' + id);
    toast('机型已删除', 'ok');
    loadModels();
  } catch (e) { toast(e.message, 'err'); }
}
