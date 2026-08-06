// task-detail.js — 任务详情：主信息卡 + 分区 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
let _tid = 0;
// v2：详情页 = 主信息卡 + 下方 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
var _tdTab = 'subs';
const TD_TABS = [
  { k: 'subs', t: '子任务' }, { k: 'comments', t: '评论' },
  { k: 'files', t: '附件' }, { k: 'links', t: '关联' }, { k: 'logs', t: '日志' }
];
async function renderTaskDetail(tid) {
  _tid = tid;
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-panel" id="td-info">加载中…</div>' +
    '<div class="pk-panel" style="margin-top:14px">' +
    '<div class="pk-tabs" id="td-tabs"></div>' +
    '<div id="td-body"></div></div>';
  await tdLoadSection('info');
  tdSwitchTab('subs');
}
function tdSwitchTab(k) {
  _tdTab = k;
  $('#td-tabs').innerHTML = TD_TABS.map(function (x) {
    return '<fluent-button appearance="' + (x.k === k ? 'accent' : 'neutral') + '" size="small" onclick="tdSwitchTab(\'' + x.k + '\')">' + x.t + '</fluent-button>';
  }).join('');
  tdLoadSection(k);
}
// v2：分区加载（info 渲染主卡；其余按当前 tab 渲染对应区块，不再全量）
async function tdLoadSection(kind) {
  const d = await api('GET', PApi.task(_tid));
  if (kind === 'info') { renderTdInfo(d); return; }
  const body = $('#td-body');
  if (kind === 'subs') body.innerHTML = renderTdSubs(d);
  else if (kind === 'comments') body.innerHTML = renderTdComments(d);
  else if (kind === 'files') body.innerHTML = renderTdFiles(d);
  else if (kind === 'links') body.innerHTML = renderTdLinks(d);
  else if (kind === 'logs') body.innerHTML = renderTdLogs(d);
}
// v2：详情局部刷新（info 主卡 + 当前 tab，替代全量重渲染）
function tdRefresh() { tdLoadSection('info'); tdSwitchTab(_tdTab); }
// v2：主信息卡（project_name/assignee_name 来自详情 JOIN，无前端补查；含进度条 + 编辑/子任务/依赖/关联/删除按钮区）
function renderTdInfo(d) {
  const t = d.task;
  const st = t.status_eff || t.status;
  const canEdit = ['ADMIN', 'PM'].includes(me.role);
  $('#td-info').innerHTML =
    '<h3>' + esc(t.title) + '</h3>' +
    '<div class="pk-row"><span class="pk-name">状态</span><span>' + (TASK_STATUS_CN[st] || st) +
    ' · 进度 ' + t.progress + '%</span>' +
    '<span class="pk-progress" style="flex:1"><span class="pk-progress-bar" style="width:' + Math.min(t.progress || 0, 100) + '%"></span></span></div>' +
    '<div class="pk-row"><span class="pk-name">项目</span><span>' + esc(t.project_name || t.project_id) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">类别</span><span>' + (CATEGORY_CN[t.category] || t.category) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">优先级</span><span>' + (PRIORITY_CN[t.priority] || t.priority) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">责任人</span><span>' + esc(t.assignee_name || '未指派') + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">计划日期</span><span>' + fmt(t.planned_date) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">实际日期</span><span>' + fmt(t.actual_date) + '</span></div>' +
    (t.description ? '<div class="pk-row"><span class="pk-name">描述</span><span>' + esc(t.description) + '</span></div>' : '') +
    (t.solution ? '<div class="pk-row"><span class="pk-name">方案</span><span>' + esc(t.solution) + '</span></div>' : '') +
    (t.notes ? '<div class="pk-row"><span class="pk-name">备注</span><span>' + esc(t.notes) + '</span></div>' : '') +
    (d.deps && d.deps.length ? '<div class="pk-row"><span class="pk-name">前置依赖</span><span>' +
      d.deps.map(x => esc(x.depends_on_title) + (canEdit ? ' <fluent-button size="small" appearance="neutral" onclick="tdDepDel(' + x.depends_on_id + ')">移除</fluent-button>' : '')).join('；') + '</span></div>' : '') +
    (canEdit ? '<div class="pk-filters"><fluent-button appearance="secondary" size="small" onclick="tdEdit()">编辑</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddSub()">加子任务</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddDep()">加依赖</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddLink()">关联样品/治具</fluent-button>' +
      '<fluent-button appearance="neutral" size="small" onclick="pConfirm(\'确认删除该任务？（子任务/评论/附件/日志将一并删除）\',\'tdDel()\')">删除任务</fluent-button></div>' : '');
}
// v2：子任务分区（三态 + CAS 流转按钮：START/COMPLETE）
function renderTdSubs(d) {
  return d.subtasks.map(s =>
    '<div class="pk-row"><span class="pk-name">' + esc(s.title) + '</span>' +
    '<span>' + (SUBTASK_STATUS_CN[s.status] || s.status) + '</span>' +
    (s.status === 'NOT_STARTED' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'START\')">开始</fluent-button>' : '') +
    (s.status === 'IN_PROGRESS' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'COMPLETE\')">完成</fluent-button>' : '') +
    '<fluent-button size="small" appearance="neutral" onclick="tdSubEdit(' + s.id + ')">编辑</fluent-button>' +
    '<fluent-button size="small" appearance="neutral" onclick="pConfirm(\'确认删除该子任务？\',\'tdSubDel(' + s.id + ')\')">删除</fluent-button>' +
    '</div>').join('') || '<span class="pk-name">无子任务</span>';
}
// v2：评论分区（输入框 + 列表，含删除按钮）
function renderTdComments(d) {
  return '<div class="pk-filters"><input id="td-cmt" placeholder="写评论…" style="flex:1;min-width:180px">' +
    '<fluent-button appearance="accent" size="small" onclick="tdAddComment()">发送</fluent-button></div>' +
    d.comments.map(c => '<div class="pk-row"><span class="pk-name">' + (c.operator_name || '—') + '</span><span>' + esc(c.content) + '</span>' +
      (c.operator_id === me.id || me.role === 'ADMIN' || me.role === 'PM'
        ? '<fluent-button size="small" appearance="neutral" onclick="tdCmtDel(' + c.id + ')">删除</fluent-button>' : '') + '</div>').join('');
}
// v2：附件分区（上传区 + 列表，含删除按钮；下载链接前缀 /uploads/projects/）
function renderTdFiles(d) {
  return '<div class="pk-filters"><input type="file" id="td-file"><fluent-button appearance="accent" size="small" onclick="tdUploadFile()">上传</fluent-button></div>' +
    d.files.map(f => '<div class="pk-row"><span class="pk-name"><a href="/uploads/projects/' + f.file_path + '" target="_blank">' + esc(f.file_name) + '</a></span>' +
      '<fluent-button size="small" appearance="neutral" onclick="tdFileDel(' + f.id + ')">删除</fluent-button></div>').join('');
}
// v2：关联分区（样品/治具）
function renderTdLinks(d) {
  return d.links.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.ref_type === 'sample' ? '样品' : '治具') + '</span>' +
    '<span>' + esc(l.ref_no || l.ref_id) + ' ' + esc(l.ref_name || '') + '</span></div>').join('') || '<span class="pk-name">未关联</span>';
}
// v2：操作日志分区
function renderTdLogs(d) {
  return d.logs.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.operator_name || '—') + '</span><span>' + l.action + '</span><span>' + (l.detail || '') + '</span></div>').join('');
}

// v2：弹窗关闭 helper（shared closeModal 需 mask 参数，统一封装）
function pCloseModal() {
  document.querySelectorAll('.modal-mask').forEach(function (m) { m.remove(); });
  document.body.style.overflow = '';
}
// v2：模态确认（替代 confirm()）；onOk 为函数名字符串，执行后关闭
function pConfirm(msg, onOk) {
  openModal('确认', '<div class="pk-name">' + esc(msg) + '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="' + onOk + ';pCloseModal()">确定</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
// v2：任务编辑弹窗（全字段；责任人下拉仅 ADMIN/PM 显示，其余角色只读）
async function tdEdit() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  const canPickUser = me.role === 'ADMIN' || me.role === 'PM';
  const assigneeField = canPickUser
    ? '<label>责任人</label><fluent-select id="te-assignee"><fluent-option value="">未指派</fluent-option>' +
      users.map(function (u) { return '<fluent-option value="' + u.id + '"' + (u.id === t.assignee_id ? ' selected' : '') + '>' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>'
    : '<label>责任人</label><div class="pk-name">' + esc(t.assignee_name || '未指派') + '</div>';
  openModal('编辑任务',
    '<div class="pk-form">' +
    '<label>任务名称 *</label><fluent-text-field id="te-title" value="' + esc(t.title) + '"></fluent-text-field>' +
    '<label>类别</label><fluent-select id="te-category">' + CATEGORY_KEYS.map(function (k) { return '<fluent-option value="' + k + '"' + (t.category === k ? ' selected' : '') + '>' + CATEGORY_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>优先级</label><fluent-select id="te-priority">' + PRIORITY_KEYS.map(function (k) { return '<fluent-option value="' + k + '"' + (t.priority === k ? ' selected' : '') + '>' + PRIORITY_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    assigneeField +
    '<label>计划完成日期</label><fluent-text-field id="te-date" type="date" value="' + (t.planned_date || '') + '"></fluent-text-field>' +
    '<label>进度(%)</label><fluent-text-field id="te-progress" type="number" min="0" max="100" value="' + (t.progress || 0) + '"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="te-desc">' + esc(t.description || '') + '</fluent-text-area>' +
    '<label>解决方案</label><fluent-text-area id="te-solution">' + esc(t.solution || '') + '</fluent-text-area>' +
    '<label>备注</label><fluent-text-area id="te-notes">' + esc(t.notes || '') + '</fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdEditSave(' + t.version + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdEditSave(version) {
  const title = $('#te-title').value.trim();
  if (!title) return showToast('任务名称必填', 'err');
  const body = {
    title: title, category: $('#te-category').value, priority: $('#te-priority').value,
    assignee_id: $('#te-assignee') ? (Number($('#te-assignee').value) || null) : null,
    planned_date: $('#te-date').value || null, progress: Number($('#te-progress').value) || 0,
    description: $('#te-desc').value, solution: $('#te-solution').value, notes: $('#te-notes').value,
    version: version
  };
  try { await api('PUT', PApi.task(_tid), body); showToast('已保存'); pCloseModal(); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// v2：加子任务弹窗（标题 + 责任人 + 日期）
async function tdAddSub() {
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  openModal('加子任务',
    '<div class="pk-form">' +
    '<label>子任务名称 *</label><fluent-text-field id="ts-title"></fluent-text-field>' +
    '<label>责任人</label><fluent-select id="ts-assignee"><fluent-option value="">未指派</fluent-option>' +
    users.map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>计划日期</label><fluent-text-field id="ts-date" type="date"></fluent-text-field>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdAddSubSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdAddSubSave() {
  const title = $('#ts-title').value.trim();
  if (!title) return showToast('子任务名称必填', 'err');
  try {
    await api('POST', PApi.taskSub(_tid), { title: title, assignee_id: Number($('#ts-assignee').value) || null, planned_date: $('#ts-date').value || null });
    showToast('已创建'); pCloseModal(); tdRefresh();
  } catch (e) { showToast(e.message, 'err'); }
}
// v2：加依赖弹窗（同项目任务下拉，显示标题+状态，禁选自己与已依赖项）
async function tdAddDep() {
  const [d, projs] = await Promise.all([api('GET', PApi.task(_tid)), api('GET', PApi.projects())]);
  const t = d.task;
  const proj = projs.find(function (p) { return p.id === t.project_id; });
  if (!proj) return showToast('任务项目不存在', 'err');
  const tasks = await api('GET', PApi.projectTasks(t.project_id));
  const excludes = d.deps.map(function (x) { return x.depends_on_id; });
  const opts = tasks.filter(function (x) { return x.id !== _tid && excludes.indexOf(x.id) < 0; })
    .map(function (x) { return '<fluent-option value="' + x.id + '">' + esc(x.title) + ' · ' + (TASK_STATUS_CN[x.status_eff || x.status] || x.status) + '</fluent-option>'; }).join('');
  if (!opts) return showToast('该项目内无可添加的前置任务', 'err');
  openModal('添加前置依赖',
    '<div class="pk-form"><label>前置任务</label><fluent-select id="td-dep">' + opts + '</fluent-select></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdAddDepSave()">添加</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdAddDepSave() {
  try { await api('POST', PApi.taskDeps(_tid), { depends_on_id: Number($('#td-dep').value) }); showToast('已添加'); pCloseModal(); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// v2：关联样品/治具弹窗（类型下拉 + 编号关键字搜索，结果 ≤10 条）
async function tdAddLink() {
  openModal('关联样品/治具',
    '<div class="pk-form">' +
    '<label>类型</label><fluent-select id="tl-type" onchange="tdLinkSearch()"><fluent-option value="sample">样品</fluent-option><fluent-option value="fixture">治具</fluent-option></fluent-select>' +
    '<label>搜索（输入编号关键字）</label><fluent-text-field id="tl-q" placeholder="如 SM2026 或 FIX-001" onchange="tdLinkSearch()"></fluent-text-field>' +
    '<fluent-select id="tl-target"></fluent-select>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdAddLinkSave()">关联</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
  tdLinkSearch();
}
async function tdLinkSearch() {
  const type = $('#tl-type').value;
  const q = encodeURIComponent($('#tl-q').value || '');
  const url = type === 'sample' ? '/api/samples?q=' + q : '/api/fixtures?search=' + q;
  try {
    const r = await api('GET', url);
    const list = (type === 'sample' ? (r.samples || []) : (r.fixtures || [])).slice(0, 10);
    $('#tl-target').innerHTML = list.map(function (x) {
      return '<fluent-option value="' + x.id + '">' + esc(x.sample_no || x.fixture_no || x.name) + ' ' + esc(x.name || '') + '</fluent-option>';
    }).join('') || '<fluent-option value="">无匹配结果</fluent-option>';
  } catch (e) { $('#tl-target').innerHTML = '<fluent-option value="">搜索失败</fluent-option>'; }
}
async function tdAddLinkSave() {
  const refId = Number($('#tl-target').value);
  if (!refId) return showToast('请先选择对象', 'err');
  try { await api('POST', PApi.taskLinks(_tid), { ref_type: $('#tl-type').value, ref_id: refId }); showToast('已关联'); pCloseModal(); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// 子任务流转（CAS：后端按当前状态条件更新）
async function tdSubAction(sid, action) {
  try { await api('POST', PApi.taskSub(_tid, sid) + '/status', { action }); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// v2：子任务编辑弹窗（标题 + 责任人 + 日期）
async function tdSubEdit(sid) {
  const d = await api('GET', PApi.task(_tid));
  const s = d.subtasks.find(function (x) { return x.id === sid; });
  if (!s) return;
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  openModal('编辑子任务',
    '<div class="pk-form">' +
    '<label>子任务名称 *</label><fluent-text-field id="tse-title" value="' + esc(s.title) + '"></fluent-text-field>' +
    '<label>责任人</label><fluent-select id="tse-assignee"><fluent-option value="">未指派</fluent-option>' +
    users.map(function (u) { return '<fluent-option value="' + u.id + '"' + (u.id === s.assignee_id ? ' selected' : '') + '>' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>计划日期</label><fluent-text-field id="tse-date" type="date" value="' + (s.planned_date || '') + '"></fluent-text-field>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdSubEditSave(' + sid + ',' + (s.version || 0) + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdSubEditSave(sid, version) {
  const title = $('#tse-title').value.trim();
  if (!title) return showToast('子任务名称必填', 'err');
  try {
    await api('PUT', PApi.taskSub(_tid, sid), { title: title, assignee_id: Number($('#tse-assignee').value) || null, planned_date: $('#tse-date').value || null, version: version });
    showToast('已保存'); pCloseModal(); tdRefresh();
  } catch (e) { showToast(e.message, 'err'); }
}
async function tdSubDel(sid) {
  try { await api('DELETE', PApi.taskSub(_tid, sid)); showToast('已删除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdDepDel(depId) {
  try { await api('DELETE', PApi.taskDeps(_tid, depId)); showToast('已移除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdCmtDel(cid) {
  try { await api('DELETE', PApi.taskComments(_tid) + '/' + cid); showToast('已删除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdFileDel(fid) {
  try { await api('DELETE', PApi.taskFiles(_tid, fid)); showToast('已删除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddComment() {
  const content = $('#td-cmt').value.trim();
  if (!content) return;
  try { await api('POST', PApi.taskComments(_tid), { content }); $('#td-cmt').value = ''; tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// 附件上传：FormData + fetch（credentials 带 session cookie），校验响应状态码
async function tdUploadFile() {
  const f = $('#td-file').files[0];
  if (!f) return showToast('请选择文件');
  const fd = new FormData();
  fd.append('file', f);
  try {
    const r = await fetch(PApi.taskFiles(_tid), { method: 'POST', credentials: 'include', body: fd });
    if (!r.ok) { let d = {}; try { d = await r.json(); } catch (e) {} throw new Error(d.error || ('上传失败 ' + r.status)); }
    showToast('上传成功'); tdRefresh();
  } catch (e) { showToast(e.message, 'err'); }
}
// v2：删除任务（ADMIN/PM/成员；级联）
async function tdDel() {
  try {
    await api('DELETE', PApi.task(_tid));
    showToast('已删除');
    location.hash = '#/kanban';
  } catch (e) { showToast(e.message, 'err'); }
}
