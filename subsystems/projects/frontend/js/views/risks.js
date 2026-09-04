// risks.js — OA 能力移植：风险管理（项目下拉 + 风险列表 + 严重度×概率矩阵标记 + 新建/编辑/解决/删除）
// 权限：识别 = 项目成员（后端校验）；编辑/解决/删除 = ADMIN/PM（owner 后端二次校验）；只读角色仅浏览
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
  if (!pid) { box.innerHTML = '<div class="empty-hint">请先选择项目</div>'; return; }
  const list = await api('GET', PApi.risks(pid));
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="empty-hint">该项目暂无风险记录</div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (r) {
    const resolved = r.status === 'RESOLVED';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(r.risk_name) + '</span>' +
      '<span class="l">' + (RISK_TYPE_CN[r.risk_type] || r.risk_type || '—') +
      ' · 严重度 <b style="color:' + SEV_COLOR[r.severity] + '">' + (SEV_CN[r.severity] || r.severity) + '</b>' +
      ' · 概率 <b style="color:' + SEV_COLOR[r.probability] + '">' + (SEV_CN[r.probability] || r.probability) + '</b></span>' +
      (r.impact ? '<span class="l">影响：' + esc(r.impact) + '</span>' : '') +
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
  openModal('识别风险',
    '<div class="pk-form">' +
    '<label>风险名称 *</label><fluent-text-field id="rk-name"></fluent-text-field>' +
    '<label>类型</label><fluent-select id="rk-type">' +
    Object.keys(RISK_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '">' + RISK_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>严重度</label><fluent-select id="rk-sev"><fluent-option value="H">高</fluent-option><fluent-option value="M" selected>中</fluent-option><fluent-option value="L">低</fluent-option></fluent-select>' +
    '<label>发生概率</label><fluent-select id="rk-prob"><fluent-option value="H">高</fluent-option><fluent-option value="M" selected>中</fluent-option><fluent-option value="L">低</fluent-option></fluent-select>' +
    '<label>影响说明</label><fluent-text-field id="rk-impact"></fluent-text-field>' +
    '<label>缓解措施</label><fluent-text-area id="rk-mit"></fluent-text-area>' +
    '<label>描述</label><fluent-text-area id="rk-desc"></fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="rkCreateSave()">提交</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function rkCreateSave() {
  const pid = $('#rk-project').value;
  const name = $('#rk-name').value.trim();
  if (!name) return showToast('风险名称必填', 'err');
  try {
    await api('POST', PApi.risks(pid), {
      risk_name: name, risk_type: $('#rk-type').value,
      severity: $('#rk-sev').value, probability: $('#rk-prob').value,
      impact: $('#rk-impact').value, mitigation: $('#rk-mit').value, description: $('#rk-desc').value
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
  openModal('编辑风险',
    '<div class="pk-form">' +
    '<label>风险名称 *</label><fluent-text-field id="rk-name" value="' + esc(r.risk_name) + '"></fluent-text-field>' +
    '<label>类型</label><fluent-select id="rk-type">' +
    Object.keys(RISK_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '"' + (r.risk_type === k ? ' selected' : '') + '>' + RISK_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>严重度</label><fluent-select id="rk-sev">' +
    ['H', 'M', 'L'].map(function (s) { return '<fluent-option value="' + s + '"' + (r.severity === s ? ' selected' : '') + '>' + SEV_CN[s] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>发生概率</label><fluent-select id="rk-prob">' +
    ['H', 'M', 'L'].map(function (s) { return '<fluent-option value="' + s + '"' + (r.probability === s ? ' selected' : '') + '>' + SEV_CN[s] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>影响说明</label><fluent-text-field id="rk-impact" value="' + esc(r.impact || '') + '"></fluent-text-field>' +
    '<label>缓解措施</label><fluent-text-area id="rk-mit">' + esc(r.mitigation || '') + '</fluent-text-area>' +
    '<label>描述</label><fluent-text-area id="rk-desc">' + esc(r.description || '') + '</fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="rkEditSave(' + id + ',' + r.version + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function rkEditSave(id, version) {
  const name = $('#rk-name').value.trim();
  if (!name) return showToast('风险名称必填', 'err');
  try {
    await api('PUT', PApi.risk(id), {
      risk_name: name, risk_type: $('#rk-type').value,
      severity: $('#rk-sev').value, probability: $('#rk-prob').value,
      impact: $('#rk-impact').value, mitigation: $('#rk-mit').value,
      description: $('#rk-desc').value, version: version
    });
    showToast('已保存'); pCloseModal(); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkResolve(id, version) {
  if (!confirm('确认标记该风险已解决？')) return;
  try {
    await api('POST', PApi.riskResolve(id), { version: version });
    showToast('已解决'); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkDel(id) {
  if (!confirm('确认删除该风险记录？')) return;
  try { await api('DELETE', PApi.risk(id)); showToast('已删除'); rkLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
