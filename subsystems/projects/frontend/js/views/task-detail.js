// task-detail.js — 任务详情：主信息卡 + 子任务（三态流转）+ 依赖 + 评论 + 附件 + 关联 + 留痕
let _tid = 0;
async function renderTaskDetail(tid) {
  _tid = tid;
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-panel" id="td-info">加载中…</div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>子任务</h3><div id="td-subs"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>依赖</h3><div id="td-deps"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>评论</h3><div id="td-comments"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>附件</h3><div id="td-files"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>关联对象</h3><div id="td-links"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>操作日志</h3><div id="td-logs"></div></div>';
  await tdLoad();
}

// 加载详情数据并渲染 6 区块（项目名/责任人姓名：详情接口无 JOIN，从项目列表/跨项目列表补查）
async function tdLoad() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  // 项目名称映射（详情接口仅含 project_id）
  let projName = t.project_id;
  try {
    const projs = await api('GET', PApi.projects());
    const pp = projs.find(p => p.id === t.project_id);
    if (pp) projName = pp.name;
  } catch (e) { /* 补查失败时显示项目 ID */ }
  let assigneeName = t.assignee_name;
  if (!assigneeName && t.assignee_id) {
    try {
      const all = await api('GET', '/api/projects/tasks');
      const row = all.find(x => x.id === _tid);
      if (row) assigneeName = row.assignee_name;
    } catch (e) { /* 补查失败时显示用户 ID */ }
  }
  const canEdit = ['ADMIN', 'PM'].includes(me.role);
  $('#td-info').innerHTML =
    '<h3>' + esc(t.title) + '</h3>' +
    '<div class="pk-row"><span class="pk-name">状态</span><span>' + (TASK_STATUS_CN[t.status] || t.status) +
    ' · 进度 ' + t.progress + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">项目</span><span>' + projName + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">类别</span><span>' + (CATEGORY_CN[t.category] || t.category) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">优先级</span><span>' + (PRIORITY_CN[t.priority] || t.priority) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">责任人</span><span>' + (assigneeName || '未指派') + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">计划日期</span><span>' + fmt(t.planned_date) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">实际日期</span><span>' + fmt(t.actual_date) + '</span></div>' +
    (t.description ? '<div class="pk-row"><span class="pk-name">描述</span><span>' + esc(t.description) + '</span></div>' : '') +
    (t.solution ? '<div class="pk-row"><span class="pk-name">方案</span><span>' + esc(t.solution) + '</span></div>' : '') +
    (t.notes ? '<div class="pk-row"><span class="pk-name">备注</span><span>' + esc(t.notes) + '</span></div>' : '') +
    (canEdit ? '<div class="pk-filters"><fluent-button appearance="secondary" size="small" onclick="tdEdit()">编辑</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddSub()">加子任务</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddDep()">加依赖</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddLink()">关联样品/治具</fluent-button></div>' : '');
  // 子任务（三态 + CAS 流转按钮：START/COMPLETE）
  $('#td-subs').innerHTML = d.subtasks.map(s =>
    '<div class="pk-row"><span class="pk-name">' + esc(s.title) + '</span>' +
    '<span>' + (SUBTASK_STATUS_CN[s.status] || s.status) + '</span>' +
    (s.status === 'NOT_STARTED' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'START\')">开始</fluent-button>' : '') +
    (s.status === 'IN_PROGRESS' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'COMPLETE\')">完成</fluent-button>' : '') +
    '</div>').join('') || '<span class="pk-name">无子任务</span>';
  // 依赖（前置任务列表）
  $('#td-deps').innerHTML = d.deps.map(x =>
    '<div class="pk-row"><span class="pk-name">↳ ' + esc(x.depends_on_title) + '</span></div>').join('') || '<span class="pk-name">无前置依赖</span>';
  // 评论（输入框 + 列表）
  $('#td-comments').innerHTML =
    '<div class="pk-filters"><input id="td-cmt" placeholder="写评论…" style="flex:1;min-width:180px">' +
    '<fluent-button appearance="accent" size="small" onclick="tdAddComment()">发送</fluent-button></div>' +
    d.comments.map(c => '<div class="pk-row"><span class="pk-name">' + (c.operator_name || '—') + '</span><span>' + esc(c.content) + '</span></div>').join('');
  // 附件（下载链接前缀 /uploads/projects/，静态服务挂载点）
  $('#td-files').innerHTML =
    '<div class="pk-filters"><input type="file" id="td-file"><fluent-button appearance="accent" size="small" onclick="tdUploadFile()">上传</fluent-button></div>' +
    d.files.map(f => '<div class="pk-row"><span class="pk-name"><a href="/uploads/projects/' + f.file_path + '" target="_blank">' + esc(f.file_name) + '</a></span></div>').join('');
  // 关联（样品/治具）
  $('#td-links').innerHTML = d.links.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.ref_type === 'sample' ? '样品' : '治具') + '</span>' +
    '<span>' + esc(l.ref_no || l.ref_id) + ' ' + esc(l.ref_name || '') + '</span></div>').join('') || '<span class="pk-name">未关联</span>';
  // 操作日志
  $('#td-logs').innerHTML = d.logs.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.operator_name || '—') + '</span><span>' + l.action + '</span><span>' + (l.detail || '') + '</span></div>').join('');
}

// 编辑任务（prompt 简化；MUST 回传 version 供乐观锁校验，否则后端 409）
async function tdEdit() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  const title = prompt('任务名称', t.title);
  if (title === null) return;
  const priority = prompt('优先级 H/M/L', t.priority || 'M');
  const body = { title, priority, version: t.version };
  try { await api('PUT', PApi.task(_tid), body); showToast('已保存'); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
// 子任务流转（CAS：后端按当前状态条件更新）
async function tdSubAction(sid, action) {
  try { await api('POST', PApi.taskSub(_tid, sid) + '/status', { action }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddSub() {
  const title = prompt('子任务名称');
  if (!title) return;
  try { await api('POST', PApi.taskSub(_tid), { title }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddDep() {
  const depId = prompt('前置任务 ID');
  if (!depId) return;
  try { await api('POST', PApi.taskDeps(_tid), { depends_on_id: Number(depId) }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddLink() {
  const refType = prompt('关联类型 sample/fixture', 'sample');
  const refId = prompt('对象 ID');
  if (!refId) return;
  try { await api('POST', PApi.taskLinks(_tid), { ref_type: refType, ref_id: Number(refId) }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddComment() {
  const content = $('#td-cmt').value.trim();
  if (!content) return;
  try { await api('POST', PApi.taskComments(_tid), { content }); $('#td-cmt').value = ''; tdLoad(); }
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
    showToast('上传成功'); tdLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
