// workflow.js — 状态机管理：读取/保存 4 态 + 转移规则（仅 ADMIN；PUT 后端校验角色）
async function renderWorkflow() {
  const v = $('#view');
  if (me.role !== 'ADMIN') { v.innerHTML = '<p>仅管理员可访问</p>'; return; }
  const wf = await api('GET', PApi.workflow);
  const stateHtml = Object.keys(wf.states).map(k => {
    const s = wf.states[k];
    return '<div class="pk-row"><span class="pk-name">' + k + '</span>' +
      '<input id="wf-st-' + k + '" value="' + s.label + '" style="flex:1;min-width:120px">' +
      '<input type="color" id="wf-c-' + k + '" value="' + (s.color || '#000000') + '"></div>';
  }).join('');
  const trHtml = wf.transitions.map((t, i) =>
    '<div class="pk-row"><span class="pk-name">' + (t.from || '') + ' → ' + (t.to || '') + '</span>' +
    '<input id="wf-tr-' + i + '" value="' + (t.label || '') + '" style="flex:1;min-width:120px"></div>').join('');
  v.innerHTML =
    '<div class="pk-panel"><h3>状态定义</h3>' + stateHtml + '</div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>转移规则</h3>' + trHtml + '</div>' +
    '<div class="pk-filters" style="margin-top:14px"><fluent-button appearance="accent" onclick="wfSave()">保存配置</fluent-button></div>';
  window._wf = wf; // 暂存当前配置供 wfSave 读取（仅标签/颜色可改，拓扑与角色不可变）
}

// 保存配置：汇总 4 态 label/color + 转移 label，PUT 后端持久化（initial 一并回传）
async function wfSave() {
  const wf = window._wf;
  const states = {};
  for (const k of Object.keys(wf.states)) {
    states[k] = { label: $('#wf-st-' + k).value, color: $('#wf-c-' + k).value, bg: wf.states[k].bg };
  }
  const transitions = wf.transitions.map((t, i) =>
    Object.assign({}, t, { label: $('#wf-tr-' + i).value }));
  try {
    await api('PUT', PApi.workflow, { states, transitions, initial: wf.initial });
    showToast('配置已保存并生效'); renderWorkflow();
  } catch (e) { showToast(e.message, 'err'); }
}
