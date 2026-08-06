// projects.js — 项目列表：卡片式展示 + 新建/编辑/删除 + 成员管理弹窗
// 权限：新建/编辑/删除/成员管理仅 ADMIN/PM（后端再校验 owner）；其他角色只读浏览
async function renderProjects() {
  const v = $('#view');
  v.innerHTML = '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="projCreate()">新建项目</fluent-button></div>' +
    '<div class="pk-stats" id="proj-list"></div>';
  const list = await api('GET', PApi.projects());
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  $('#proj-list').innerHTML = list.map(p =>
    '<fluent-card class="kb-stat" data-k="' + p.id + '">' +
    '<span class="n" style="font-size:16px;color:var(--brand)">' + esc(p.name) + '</span>' +
    '<span class="l">任务 ' + p.task_count + ' · 完成 ' + p.done_count + '</span>' +
    (canManage
      ? '<span class="kb-x"><fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projEdit(' + p.id + ')">编辑</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projMembers(' + p.id + ')">成员</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projDel(' + p.id + ')">删除</fluent-button></span>'
      : '') +
    '</fluent-card>').join('');
  // 单击项目卡 → 跳任务列表并筛选该项目
  document.querySelectorAll('#proj-list .kb-stat').forEach(el => {
    el.onclick = () => location.hash = '#/list?project=' + el.dataset.k;
  });
}

// v2：新建项目弹窗
function projCreate() {
  openModal('新建项目',
    '<div class="pk-form">' +
    '<label>项目名称 *</label><fluent-text-field id="pj-name"></fluent-text-field>' +
    '<label>项目描述</label><fluent-text-area id="pj-desc"></fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="projCreateSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function projCreateSave() {
  const name = $('#pj-name').value.trim();
  if (!name) return showToast('项目名称必填', 'err');
  try { await api('POST', PApi.projects(), { name: name, description: $('#pj-desc').value }); showToast('创建成功'); pCloseModal(); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function projEdit(id) {
  const p = await api('GET', PApi.projects(id));
  openModal('编辑项目',
    '<div class="pk-form">' +
    '<label>项目名称 *</label><fluent-text-field id="pj-name" value="' + esc(p.name) + '"></fluent-text-field>' +
    '<label>项目描述</label><fluent-text-area id="pj-desc">' + esc(p.description || '') + '</fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="projEditSave(' + id + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function projEditSave(id) {
  const name = $('#pj-name').value.trim();
  if (!name) return showToast('项目名称必填', 'err');
  try { await api('PUT', PApi.projects(id), { name: name, description: $('#pj-desc').value }); showToast('已保存'); pCloseModal(); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 删除项目（有任务时后端 409 保护）
async function projDel(id) {
  if (!confirm('确认删除该项目？（项目下有任务时将被拒绝）')) return;
  try { await api('DELETE', PApi.projects(id)); showToast('已删除'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 成员管理弹窗（成员列表 + 搜索过滤添加下拉 + 转让 owner + 移除）
// 用户列表走子系统接口 /api/projects/users（共享 /api/users 仅 ADMIN，PM 无权）
async function projMembers(id) {
  const [mem, users] = await Promise.all([
    api('GET', PApi.projects(id) + '/members'),
    api('GET', '/api/projects/users')
  ]);
  const lines = mem.map(m =>
    '<div class="pk-row"><span class="pk-name">' + esc(m.display_name || m.username) + '</span>' +
    '<span>' + (m.is_owner ? '负责人' : '成员') + '</span>' +
    (m.is_owner
      ? ''
      : '<fluent-button appearance="secondary" size="small" onclick="memTransfer(' + id + ',' + m.user_id + ')">转让</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="memRemove(' + id + ',' + m.user_id + ')">移除</fluent-button>') +
    '</div>').join('');
  openModal('成员管理', lines +
    '<div class="pk-filters" style="margin-top:10px">' +
    '<fluent-text-field id="mem-q" placeholder="搜索用户…" onchange="memRenderOpts(' + id + ')"></fluent-text-field>' +
    '<fluent-select id="mem-user"></fluent-select>' +
    '<fluent-button appearance="accent" onclick="memAdd(' + id + ')">添加</fluent-button></div>');
  memRenderOpts(id);
}
// v2：按关键字过滤可添加用户下拉
async function memRenderOpts(id) {
  const q = $('#mem-q').value || '';
  const [mem, users] = await Promise.all([
    api('GET', PApi.projects(id) + '/members'),
    api('GET', '/api/projects/users')
  ]);
  const opts = users.filter(function (u) {
    return !mem.some(function (m) { return m.user_id === u.id; }) &&
      (!q || (u.display_name || u.username).indexOf(q) >= 0);
  }).map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('');
  $('#mem-user').innerHTML = opts || '<fluent-option value="">无匹配用户</fluent-option>';
}
async function memAdd(id) {
  const uid = $('#mem-user').value;
  if (!uid) return showToast('请选择用户');
  try { await api('POST', PApi.projects(id) + '/members', { user_id: Number(uid) }); showToast('已添加'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memTransfer(id, uid) {
  try { await api('PUT', PApi.projects(id) + '/members/' + uid, { is_owner: 1 }); showToast('已转让'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memRemove(id, uid) {
  if (!confirm('确认移除该成员？')) return;
  try { await api('DELETE', PApi.projects(id) + '/members/' + uid); showToast('已移除'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
