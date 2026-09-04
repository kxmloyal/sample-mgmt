// milestones.js — OA 能力移植：里程碑管理（项目下拉 + 里程碑列表 + 新建/编辑/达成/删除）
// 权限：新建/编辑/达成/删除 = ADMIN/PM（owner 由后端二次校验）；其他角色只读
async function renderMilestones() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="ms-project" onchange="msLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="msCreate()">新建里程碑</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="msLoad()">刷新</fluent-button></div>' +
    '<div id="ms-list"></div>';
  const projects = await api('GET', PApi.projects());
  $('#ms-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
}

async function msLoad() {
  const pid = $('#ms-project').value;
  const box = $('#ms-list');
  if (!pid) { box.innerHTML = '<div class="empty-hint">请先选择项目</div>'; return; }
  const list = await api('GET', PApi.milestones(pid));
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="empty-hint">该项目暂无里程碑</div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (m) {
    const done = m.status === 'ACHIEVED';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(m.name) + '</span>' +
      '<span class="l">目标 ' + (m.target_date || '—') +
      (done ? ' · 达成 ' + (m.actual_date || '') + (m.is_delayed ? ' <b style="color:#b91c1c">（延期）</b>' : '') : '') + '</span>' +
      '<span class="l">' + (done
        ? '<span style="color:#065f46">✔ 已达成</span>'
        : '待达成' + (m.target_date && m.target_date < new Date().toISOString().slice(0, 10) ? ' <b style="color:#b91c1c">（已超期）</b>' : '')) + '</span>' +
      (canManage
        ? '<span class="kb-x">' +
          (done ? '' : '<fluent-button appearance="accent" size="small" onclick="msAchieve(' + m.id + ',' + m.version + ')">达成</fluent-button> ') +
          '<fluent-button appearance="secondary" size="small" onclick="msEdit(' + m.id + ')">编辑</fluent-button> ' +
          '<fluent-button appearance="secondary" size="small" onclick="msDel(' + m.id + ')">删除</fluent-button></span>'
        : '') +
      '</fluent-card>';
  }).join('') + '</div>';
}

function msCreate() {
  const pid = $('#ms-project').value;
  if (!pid) return showToast('请先选择项目', 'err');
  openModal('新建里程碑',
    '<div class="pk-form">' +
    '<label>里程碑名称 *</label><fluent-text-field id="ms-name"></fluent-text-field>' +
    '<label>目标日期</label><fluent-text-field id="ms-date" type="date"></fluent-text-field>' +
    '<label>排序（小在前）</label><fluent-text-field id="ms-sort" type="number" value="0"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="ms-desc"></fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="msCreateSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function msCreateSave() {
  const pid = $('#ms-project').value;
  const name = $('#ms-name').value.trim();
  if (!name) return showToast('里程碑名称必填', 'err');
  try {
    await api('POST', PApi.milestones(pid), {
      name: name, target_date: $('#ms-date').value || null,
      sort: Number($('#ms-sort').value) || 0, description: $('#ms-desc').value
    });
    showToast('创建成功'); pCloseModal(); msLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function msEdit(id) {
  const pid = $('#ms-project').value;
  const list = await api('GET', PApi.milestones(pid));
  const m = list.find(function (x) { return x.id === id; });
  if (!m) return showToast('里程碑不存在', 'err');
  if (m.status === 'ACHIEVED') return showToast('已达成里程碑不可编辑', 'err');
  openModal('编辑里程碑',
    '<div class="pk-form">' +
    '<label>里程碑名称 *</label><fluent-text-field id="ms-name" value="' + esc(m.name) + '"></fluent-text-field>' +
    '<label>目标日期</label><fluent-text-field id="ms-date" type="date" value="' + (m.target_date || '') + '"></fluent-text-field>' +
    '<label>排序</label><fluent-text-field id="ms-sort" type="number" value="' + (m.sort || 0) + '"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="ms-desc">' + esc(m.description || '') + '</fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="msEditSave(' + id + ',' + m.version + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function msEditSave(id, version) {
  const name = $('#ms-name').value.trim();
  if (!name) return showToast('里程碑名称必填', 'err');
  try {
    await api('PUT', PApi.milestone(id), {
      name: name, target_date: $('#ms-date').value || null,
      sort: Number($('#ms-sort').value) || 0, description: $('#ms-desc').value, version: version
    });
    showToast('已保存'); pCloseModal(); msLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

// 达成里程碑（CAS：传读取时 version；409 时提示刷新）
async function msAchieve(id, version) {
  if (!confirm('确认标记该里程碑已达成？（若已超过目标日期将自动标记延期）')) return;
  try {
    await api('POST', PApi.milestoneAchieve(id), { version: version });
    showToast('已达成'); msLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function msDel(id) {
  if (!confirm('确认删除该里程碑？')) return;
  try { await api('DELETE', PApi.milestone(id)); showToast('已删除'); msLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
