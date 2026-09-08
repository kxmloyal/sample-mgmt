// risks.js — OA 能力移植：风险管理（项目下拉 + 风险列表 + 严重度×概率矩阵标记 + 新建/编辑/解决/删除）
// 权限：识别 = 项目成员（后端校验）；编辑/解决/删除 = ADMIN/PM（owner 后端二次校验）；只读角色仅浏览
// 方案三C：识别/编辑弹窗支持关联任务（task_id）；卡片显示关联任务并深链详情
async function renderRisks() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="rk-project" onchange="rkLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="rkCreate()">识别风险</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="rkLoad()">刷新</fluent-button></div>' +
    '<div id="rk-list"></div>';
  const projects = await api('GET', PApi.projects());
  $('#rk-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
}

// 严重度/概率中文与颜色（对齐 constants.js 优先级配色习惯）
var SEV_CN = { H: '高', M: '中', L: '低' };
var SEV_COLOR = { H: '#b91c1c', M: '#92400e', L: '#065f46' };
var RISK_TYPE_CN = { schedule: '进度', quality: '质量', resource: '资源', tech: '技术', other: '其他' };

async function rkLoad() {
  const pid = $('#rk-project').value;
  const box = $('#rk-list');
  if (!pid) { box.innerHTML = '<div class="pk-empty"><span class="pk-empty-icon">🗂</span>请先选择项目<span class="pk-empty-hint">选择项目后查看该项目的风险记录</span></div>'; return; }
  const list = await api('GET', PApi.risks(pid));
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="pk-empty"><span class="pk-empty-icon">🛡</span>该项目暂无风险记录<span class="pk-empty-hint">点击「识别风险」登记第一条风险</span></div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (r) {
    const resolved = r.status === 'RESOLVED';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(r.risk_name) + '</span>' +
      '<span class="l">' + (RISK_TYPE_CN[r.risk_type] || r.risk_type || '—') +
      ' · 严重度 <b style="color:' + SEV_COLOR[r.severity] + '">' + (SEV_CN[r.severity] || r.severity) + '</b>' +
      ' · 概率 <b style="color:' + SEV_COLOR[r.probability] + '">' + (SEV_CN[r.probability] || r.probability) + '</b></span>' +
      (r.impact ? '<span class="l">影响：' + esc(r.impact) + '</span>' : '') +
      (r.task_id ? '<span class="l">关联任务：<a href="#/tasks/' + r.task_id + '">' + esc(r.task_title || ('#' + r.task_id)) + '</a></span>' : '') +
      '<span class="l">' + (resolved
        ? '<span style="color:#065f46">✔ 已解决</span>' + (r.resolved_name ? '（' + esc(r.resolved_name) + ' ' + (r.resolved_at || '').slice(0, 10) + '）' : '')
        : '<span style="color:#b91c1c">● 开放</span>' + (r.identified_name ? '（' + esc(r.identified_name) + ' 识别）' : '')) + '</span>' +
      (canManage
        ? '<span class="kb-x">' +
          (resolved ? '' : '<fluent-button appearance="accent" size="small" onclick="rkResolve(' + r.id + ',' + r.version + ')">解决</fluent-button> ' +
          '<fluent-button appearance="secondary" size="small" onclick="rkEdit(' + r.id + ')">编辑</fluent-button> ') +
          '<fluent-button appearance="secondary" size="small" onclick="rkDel(' + r.id + ')">删除</fluent-button></span>'
        : '') +
      '</fluent-card>';
  }).join('') + '</div>';
}

function rkCreate() {
  const pid = $('#rk-project').value;
  if (!pid) return showToast('请先选择项目', 'err');
  rkOpenForm('识别风险', null, 'rkCreateSave()');
}
// 方案三C：识别/编辑共用表单渲染（含关联任务下拉；tasks 异步注入，失败静默降级为不关联）
async function rkTaskOptions(selElId, pid, currentTaskId) {
  try {
    const tasks = await api('GET', PApi.projectTasks(pid));
    $('#' + selElId).innerHTML = '<fluent-option value="">不关联任务</fluent-option>' +
      tasks.map(function (t) {
        return '<fluent-option value="' + t.id + '"' + (t.id === currentTaskId ? ' selected' : '') + '>' +
          esc(t.title) + ' · ' + (TASK_STATUS_CN[t.status_eff || t.status] || t.status) + '</fluent-option>';
      }).join('');
  } catch (e) { /* 保持「不关联任务」 */ }
}
function rkOpenForm(titleTxt, r, saveFn) {
  const pid = $('#rk-project').value;
  openModal(titleTxt,
    '<div class="pk-form">' +
    '<label>风险名称 *</label><fluent-text-field id="rk-name" value="' + (r ? esc(r.risk_name) : '') + '"></fluent-text-field>' +
    '<label>类型</label><fluent-select id="rk-type">' +
    Object.keys(RISK_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '"' + (r && r.risk_type === k ? ' selected' : '') + '>' + RISK_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>严重度</label><fluent-select id="rk-sev">' +
    ['H', 'M', 'L'].map(function (s) { return '<fluent-option value="' + s + '"' + ((r ? r.severity : 'M') === s ? ' selected' : '') + '>' + SEV_CN[s] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>发生概率</label><fluent-select id="rk-prob">' +
    ['H', 'M', 'L'].map(function (s) { return '<fluent-option value="' + s + '"' + ((r ? r.probability : 'M') === s ? ' selected' : '') + '>' + SEV_CN[s] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>关联任务</label><fluent-select id="rk-task"><fluent-option value="">不关联任务</fluent-option></fluent-select>' +
    '<label>影响说明</label><fluent-text-field id="rk-impact" value="' + (r ? esc(r.impact || '') : '') + '"></fluent-text-field>' +
    '<label>缓解措施</label><fluent-text-area id="rk-mit">' + (r ? esc(r.mitigation || '') : '') + '</fluent-text-area>' +
    '<label>描述</label><fluent-text-area id="rk-desc">' + (r ? esc(r.description || '') : '') + '</fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="' + saveFn + (r ? '(' + r.id + ',' + r.version + ')">保存' : '">提交') + '</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
  rkTaskOptions('rk-task', pid, r ? r.task_id : null);
}
async function rkCreateSave() {
  const pid = $('#rk-project').value;
  const name = $('#rk-name').value.trim();
  if (!name) return showToast('风险名称必填', 'err');
  try {
    await api('POST', PApi.risks(pid), {
      risk_name: name, risk_type: $('#rk-type').value,
      severity: $('#rk-sev').value, probability: $('#rk-prob').value,
      impact: $('#rk-impact').value, mitigation: $('#rk-mit').value, description: $('#rk-desc').value,
      task_id: Number($('#rk-task').value) || null
    });
    showToast('已识别'); pCloseModal(); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkEdit(id) {
  const pid = $('#rk-project').value;
  const list = await api('GET', PApi.risks(pid));
  const r = list.find(function (x) { return x.id === id; });
  if (!r) return showToast('风险不存在', 'err');
  if (r.status === 'RESOLVED') return showToast('已解决风险不可编辑', 'err');
  rkOpenForm('编辑风险', r, 'rkEditSave');
}
async function rkEditSave(id, version) {
  const name = $('#rk-name').value.trim();
  if (!name) return showToast('风险名称必填', 'err');
  try {
    await api('PUT', PApi.risk(id), {
      risk_name: name, risk_type: $('#rk-type').value,
      severity: $('#rk-sev').value, probability: $('#rk-prob').value,
      impact: $('#rk-impact').value, mitigation: $('#rk-mit').value,
      description: $('#rk-desc').value, task_id: Number($('#rk-task').value) || null,
      version: version
    });
    showToast('已保存'); pCloseModal(); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkResolve(id, version) {
  pkConfirm('确认标记该风险已解决？', 'rkResolveOk(id,version)');
}
async function rkResolveOk(id, version) {
  try {
    await api('POST', PApi.riskResolve(id), { version: version });
    showToast('已解决'); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkDel(id) {
  pkConfirm('确认删除该风险记录？', 'rkDelOk(id)');
}
async function rkDelOk(id) {
  try { await api('DELETE', PApi.risk(id)); showToast('已删除'); rkLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
