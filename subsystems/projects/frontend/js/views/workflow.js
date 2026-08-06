// workflow.js — 状态机管理：表单化配置（状态 label/color + 流转角色/标签），保存校验
async function renderWorkflow() {
  const v = $('#view');
  const cfg = await api('GET', PApi.workflow);
  const states = Object.keys(cfg.states).map(s =>
    '<div class="pk-row"><span class="pk-name">' + esc(s) + '</span>' +
    '<fluent-text-field id="wf-slabel-' + s + '" value="' + esc(cfg.states[s].label) + '" style="flex:1"></fluent-text-field>' +
    '<input id="wf-scolor-' + s + '" type="color" value="' + esc(cfg.states[s].color) + '"></div>').join('');
  const trs = cfg.transitions.map(function (tr, i) {
    return '<div class="pk-row"><span class="pk-name">' + esc(tr.from) + ' → ' + esc(tr.to) + '（' + esc(tr.action) + '）</span>' +
      '<fluent-text-field id="wf-trole-' + i + '" value="' + esc((tr.role || []).join(',')) + '" placeholder="如 ADMIN,ASSIGNEE,MEMBER" style="flex:1"></fluent-text-field>' +
      '<fluent-text-field id="wf-tlabel-' + i + '" value="' + esc(tr.label) + '"></fluent-text-field></div>';
  }).join('');
  v.innerHTML = '<div class="pk-panel"><h3>状态配置（名称 / 标签 / 颜色）</h3>' + states +
    '<h3 style="margin-top:16px">流转配置（源 → 目标 / 角色逗号分隔 / 动作标签）</h3>' + trs +
    '<div class="pk-filters" style="margin-top:12px"><fluent-button appearance="accent" onclick="wfSave()">保存配置</fluent-button></div></div>';
}
async function wfSave() {
  const cfg = await api('GET', PApi.workflow);
  const states = {};
  Object.keys(cfg.states).forEach(function (s) {
    const label = $('#wf-slabel-' + s).value.trim();
    if (!label) { showToast('状态 ' + s + ' 缺少标签', 'err'); return; }
    states[s] = { label: label, color: $('#wf-scolor-' + s).value, bg: cfg.states[s].bg || '#f8fafc' };
  });
  if (Object.keys(states).length !== Object.keys(cfg.states).length) return;
  const transitions = cfg.transitions.map(function (tr, i) {
    const label = $('#wf-tlabel-' + i).value.trim();
    const role = ($('#wf-trole-' + i).value || '').split(',').map(function (r) { return r.trim(); }).filter(Boolean);
    if (!label || !role.length) { showToast('流转 ' + (tr.from + '→' + tr.to) + ' 需填写角色与标签', 'err'); return null; }
    return { from: tr.from, to: tr.to, action: tr.action, role: role, label: label };
  });
  if (!transitions || transitions.some(function (x) { return x === null; })) return;
  try {
    await api('PUT', PApi.workflow, { initial: cfg.initial, states: states, transitions: transitions });
    showToast('已保存');
    renderWorkflow();
  } catch (e) { showToast(e.message, 'err'); }
}
