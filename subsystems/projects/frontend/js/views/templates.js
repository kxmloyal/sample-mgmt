// templates.js — OA 移植二期批次2：项目模板（卡片列表 + 清单编辑 + 从模板创建项目向导）
// 仅 ADMIN/PM 可见此导航（router roles 控）；后端同权限校验兜底
var TPL_CATEGORY_CN = { equipment: '设备', quality: '质量', process: '流程', safety: '安全', other: '其他' };

async function renderTemplates() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="tplCreate()">新建模板</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="renderTemplates()">刷新</fluent-button></div>' +
    '<div id="tpl-list" class="pk-stats" style="margin-top:10px"></div>';
  const list = await api('GET', PApi.templates);
  if (!list.length) { $('#tpl-list').innerHTML = '<div class="empty-hint">暂无模板，点击「新建模板」创建</div>'; return; }
  $('#tpl-list').innerHTML = list.map(function (t) {
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px;color:var(--brand)">' + esc(t.name) + '</span>' +
      (t.description ? '<span class="l">' + esc(t.description) + '</span>' : '') +
      '<span class="l">任务 ' + t.tasks.length + ' · 里程碑 ' + t.milestones.length + ' · 已实例化 ' + t.instance_count + ' 次</span>' +
      '<span class="kb-x">' +
      '<fluent-button appearance="accent" size="small" onclick="tplWizard(' + t.id + ',\'' + esc(t.name).replace(/'/g, '') + '\')">从模板创建项目</fluent-button> ' +
      '<fluent-button appearance="secondary" size="small" onclick="tplEdit(' + t.id + ')">编辑</fluent-button> ' +
      '<fluent-button appearance="secondary" size="small" onclick="tplDel(' + t.id + ',\'' + esc(t.name).replace(/'/g, '') + '\')">停用</fluent-button></span>' +
      '</fluent-card>';
  }).join('');
}

// 模板新建/编辑弹窗（任务/里程碑清单按行编辑，行内 5 列/2 列）
function tplForm(title, t, tid) {
  t = t || { name: '', description: '', tasks: [], milestones: [] };
  const taskRows = t.tasks.map(function (x, i) { return tplTaskRow(i, x); }).join('') || tplTaskRow(0, {});
  const msRows = t.milestones.map(function (x, i) { return tplMsRow(i, x); }).join('') || tplMsRow(0, {});
  openModal(title,
    '<div class="pk-form">' +
    '<label>模板名称 *</label><fluent-text-field id="tf-name" value="' + esc(t.name) + '"></fluent-text-field>' +
    '<label>模板说明</label><fluent-text-area id="tf-desc">' + esc(t.description || '') + '</fluent-text-area>' +
    '<label style="margin-top:8px">任务清单（偏移天数=距项目启动日；工期天仅备注用）</label>' +
    '<div id="tf-tasks">' + taskRows + '</div>' +
    '<fluent-button appearance="neutral" size="small" onclick="tplAddTask()">+ 加任务</fluent-button>' +
    '<label style="margin-top:8px">里程碑清单（目标偏移天数=距项目启动日）</label>' +
    '<div id="tf-ms">' + msRows + '</div>' +
    '<fluent-button appearance="neutral" size="small" onclick="tplAddMs()">+ 加里程碑</fluent-button>' +
    '</div>',
    { wide: true, foot: '<fluent-button appearance="accent" size="small" onclick="' + (tid ? 'tplSave(' + tid + ')' : 'tplSave()') + '">保存</fluent-button>' +
        '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
function tplTaskRow(i, x) {
  return '<div class="pk-row" style="display:flex;gap:4px;margin:3px 0" data-tpl-task>' +
    '<input placeholder="任务标题" value="' + esc(x.title || '') + '" style="flex:3" data-k="title">' +
    '<select style="flex:1" data-k="category">' + Object.keys(TPL_CATEGORY_CN).map(function (k) { return '<option value="' + k + '"' + (x.category === k ? ' selected' : '') + '>' + TPL_CATEGORY_CN[k] + '</option>'; }).join('') + '</select>' +
    '<select style="flex:1" data-k="priority">' + ['H', 'M', 'L'].map(function (k) { return '<option value="' + k + '"' + (x.priority === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select>' +
    '<input type="number" placeholder="偏移天" min="0" value="' + (x.offset_days || 0) + '" style="flex:1" data-k="offset_days">' +
    '<input type="number" placeholder="工期天" min="0" value="' + (x.planned_days || 0) + '" style="flex:1" data-k="planned_days">' +
    '<fluent-button appearance="neutral" size="small" onclick="this.closest(\'[data-tpl-task]\').remove()">删</fluent-button></div>';
}
function tplMsRow(i, x) {
  return '<div class="pk-row" style="display:flex;gap:4px;margin:3px 0" data-tpl-ms>' +
    '<input placeholder="里程碑名称" value="' + esc(x.name || '') + '" style="flex:3" data-k="name">' +
    '<input type="number" placeholder="目标偏移天" min="0" value="' + (x.target_offset_days || 0) + '" style="flex:1" data-k="target_offset_days">' +
    '<fluent-button appearance="neutral" size="small" onclick="this.closest(\'[data-tpl-ms]\').remove()">删</fluent-button></div>';
}
function tplAddTask() { $('#tf-tasks').insertAdjacentHTML('beforeend', tplTaskRow(999, {})); }
function tplAddMs() { $('#tf-ms').insertAdjacentHTML('beforeend', tplMsRow(999, {})); }
function tplReadForm() {
  const tasks = [], milestones = [];
  document.querySelectorAll('#tf-tasks [data-tpl-task]').forEach(function (row) {
    const title = row.querySelector('[data-k="title"]').value.trim();
    if (title) tasks.push({
      title: title, category: row.querySelector('[data-k="category"]').value,
      priority: row.querySelector('[data-k="priority"]').value,
      offset_days: Number(row.querySelector('[data-k="offset_days"]').value) || 0,
      planned_days: Number(row.querySelector('[data-k="planned_days"]').value) || 0
    });
  });
  document.querySelectorAll('#tf-ms [data-tpl-ms]').forEach(function (row) {
    const name = row.querySelector('[data-k="name"]').value.trim();
    if (name) milestones.push({ name: name, target_offset_days: Number(row.querySelector('[data-k="target_offset_days"]').value) || 0 });
  });
  return { name: $('#tf-name').value.trim(), description: $('#tf-desc').value.trim(), tasks: tasks, milestones: milestones };
}
function tplCreate() { tplForm('新建模板', null, 0); }
async function tplEdit(id) {
  const list = await api('GET', PApi.templates);
  const t = list.find(function (x) { return x.id === id; });
  if (!t) return showToast('模板不存在', 'err');
  tplForm('编辑模板：' + t.name, t, id);
}
async function tplSave(tid) {
  const d = tplReadForm();
  if (!d.name) return showToast('模板名称必填', 'err');
  try {
    if (tid) await api('PUT', PApi.template(tid), d);
    else await api('POST', PApi.templates, d);
    showToast('已保存'); pCloseModal(); renderTemplates();
  } catch (e) { showToast(e.message, 'err'); }
}
async function tplDel(id, name) {
  if (!confirm('确认停用模板「' + name + '」？（已实例化的项目不受影响）')) return;
  try { await api('DELETE', PApi.template(id)); showToast('已停用'); renderTemplates(); }
  catch (e) { showToast(e.message, 'err'); }
}

// ===== 从模板创建项目向导（两步：填信息+选机型 → 预览 → 确认） =====
var _tplWiz = null;
async function tplWizard(id, name) {
  const list = await api('GET', PApi.templates);
  const t = list.find(function (x) { return x.id === id; });
  if (!t) return showToast('模板不存在', 'err');
  const models = await api('GET', PApi.modelOptions);
  _tplWiz = { id: id, name: name, tasks: t.tasks, milestones: t.milestones };
  openModal('从模板创建项目 — ' + name,
    '<div class="pk-form">' +
    '<label>项目名称 *（独立命名，与机型解耦）</label><fluent-text-field id="tw-name"></fluent-text-field>' +
    '<label>启动日期 *（任务/里程碑按此日 + 偏移天数推算）</label><input type="date" id="tw-start" style="padding:4px">' +
    '<label>引用机型（可多选，Ctrl+点击）</label><select id="tw-models" multiple size="5" style="width:100%">' +
    models.map(function (m) { return '<option value="' + m.id + '">' + esc(m.code) + '（' + esc(m.full_name) + '）</option>'; }).join('') + '</select>' +
    '<label style="margin-top:8px">项目描述</label><fluent-text-area id="tw-desc"></fluent-text-area>' +
    '<div class="muted" style="font-size:12px">将生成：任务 ' + t.tasks.length + ' 个 · 里程碑 ' + t.milestones.length + ' 个（下一步预览确认）</div></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tplWizPreview()">预览</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
function tplWizPreview() {
  const name = $('#tw-name').value.trim();
  const start = $('#tw-start').value;
  if (!name) return showToast('项目名称必填', 'err');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return showToast('请选择启动日期', 'err');
  const modelIds = Array.prototype.slice.call($('#tw-models').selectedOptions).map(function (o) { return Number(o.value); });
  const modelNames = Array.prototype.slice.call($('#tw-models').selectedOptions).map(function (o) { return o.textContent; });
  _tplWiz.req = { name: name, start_date: start, model_ids: modelIds, description: $('#tw-desc').value.trim() };
  const addD = function (ds, n) { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const taskLines = _tplWiz.tasks.map(function (x) { return '<div>· ' + esc(x.title) + '（' + TPL_CATEGORY_CN[x.category] + '/' + x.priority + ' → ' + addD(start, x.offset_days) + '）</div>'; }).join('');
  const msLines = _tplWiz.milestones.map(function (x) { return '<div>◆ ' + esc(x.name) + '（目标 ' + addD(start, x.target_offset_days) + '）</div>'; }).join('');
  openModal('预览 — ' + name,
    '<div class="pk-form" style="font-size:13px;line-height:1.7">' +
    '<b>启动日期：</b>' + start + '<br>' +
    (modelNames.length ? '<b>引用机型：</b>' + esc(modelNames.join('、')) + '<br>' : '') +
    '<b style="display:block;margin-top:6px">任务 ' + _tplWiz.tasks.length + ' 个：</b>' + taskLines +
    '<b style="display:block;margin-top:6px">里程碑 ' + _tplWiz.milestones.length + ' 个：</b>' + msLines +
    '<div class="muted" style="margin-top:8px;font-size:12px">确认后一次性创建（事务化，任一步失败整体回滚）</div></div>',
    { wide: true, foot: '<fluent-button appearance="accent" size="small" onclick="tplWizGo()">确认创建</fluent-button>' +
        '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">返回修改</fluent-button>' });
}
async function tplWizGo() {
  try {
    const r = await api('POST', PApi.templateInstantiate(_tplWiz.id), _tplWiz.req);
    showToast('项目已创建：生成任务 ' + r.tasks + ' · 里程碑 ' + r.milestones + (r.model_refs ? ' · 机型 ' + r.model_refs : ''));
    pCloseModal();
    location.hash = '#/projects';
  } catch (e) { showToast(e.message, 'err'); }
}
