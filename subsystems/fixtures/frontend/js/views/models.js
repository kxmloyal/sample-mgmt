// fixture-models.js — 治具机型管理弹窗（仅 RD/ADMIN 可见入口；后端 POST/PUT 403 兜底）
// 与样品共享 sample_models 表；code 只读，仅可编辑 full_name；本期不做删除（引用风险）
async function openFixtureModelsModal() {
  var list;
  try { list = await api('GET', '/api/fixtures/models'); } catch (e) { showToast(e.message); return; }
  var rows = list.map(function(m) {
    return '<tr><td><b>' + e(m.code) + '</b></td><td id="fxm-name-' + m.id + '">' + e(m.full_name) + '</td><td>' + (m.fixture_count || 0) + '</td><td><a class="link" onclick="fxmEditName(' + m.id + ',\'' + e(m.full_name) + '\')">编辑全称</a></td></tr>';
  }).join('') || '<tr><td colspan="4" class="empty">暂无机型，请先新增</td></tr>';
  var body = '<div style="max-height:60vh;overflow:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr><th style="text-align:left;padding:6px">机型短码</th><th style="text-align:left;padding:6px">机型全称</th><th style="text-align:left;padding:6px">治具数</th><th style="width:90px"></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
  openModal('机型管理（共享机型主数据）', body, {
    foot: '<fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>'
  });
}

function fxmEditName(id, oldName) {
  var cur = document.getElementById('fxm-name-' + id);
  if (!cur) return;
  cur.innerHTML = '<input id="fxm-input-' + id + '" style="width:180px" value="' + oldName + '"/> ' +
    '<a class="link" onclick="fxmSaveName(' + id + ')">保存</a> <a class="link" onclick="openFixtureModelsModal()">取消</a>';
  document.getElementById('fxm-input-' + id).focus();
}

async function fxmSaveName(id) {
  var input = document.getElementById('fxm-input-' + id);
  var full_name = (input ? input.value : '').trim();
  if (!full_name) { showToast('机型全称必填'); return; }
  try {
    await api('PUT', '/api/fixtures/models/' + id, { full_name: full_name });
    showToast('机型全称已更新');
    openFixtureModelsModal();
    // 机型视图打开时刷新卡片墙，否则刷新清单（两视图数据均含机型全称）
    if (typeof renderFixtureModelWall === 'function' && document.getElementById('fx-wall-grid')) renderFixtureModelWall();
    else if (typeof loadFixtureList === 'function') loadFixtureList();
  } catch (err) { showToast(err.message); }
}
