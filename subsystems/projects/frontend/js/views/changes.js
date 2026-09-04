// changes.js — OA 能力移植二期：变更管理（项目下拉 + 变更单列表 + 新建/编辑/审批/删除）
// 审批人：ADMIN/PM/项目 owner（后端校验）；申请人不能审批本人变更；BUDGET 批准后自动写入预算
// TIME 类批准后仅记录，不自动顺延任务日期（用户确认保守方案）
var CHG_TYPE_CN = { SCOPE: '范围', TIME: '时间', RESOURCE: '资源', BUDGET: '预算' };
var CHG_STATUS_CN = { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回' };
var CHG_STATUS_COLOR = { PENDING: '#92400e', APPROVED: '#065f46', REJECTED: '#b91c1c' };

async function renderChanges() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="cg-project" onchange="cgLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="cgCreate()">发起变更</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="cgLoad()">刷新</fluent-button></div>' +
    '<div id="cg-list"></div>';
  const projects = await api('GET', PApi.projects());
  $('#cg-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
}

async function cgLoad() {
  const pid = $('#cg-project').value;
  const box = $('#cg-list');
  if (!pid) { box.innerHTML = '<div class="empty-hint">请先选择项目</div>'; return; }
  const list = await api('GET', PApi.changes(pid));
  const canApprove = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="empty-hint">该项目暂无变更单</div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (c) {
    const pending = c.status === 'PENDING';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(c.change_no || ('#' + c.id)) + ' · ' + (CHG_TYPE_CN[c.change_type] || c.change_type) + '变更</span>' +
      '<span class="l">' + esc(c.description) + '</span>' +
      (c.before_value ? '<span class="l">变更前：' + esc(c.before_value) + ' → 变更后：' + esc(c.after_value || '—') + '</span>' : '') +
      (c.reason ? '<span class="l">原因：' + esc(c.reason) + '</span>' : '') +
      '<span class="l"><b style="color:' + CHG_STATUS_COLOR[c.status] + '">' + (CHG_STATUS_CN[c.status] || c.status) + '</b>' +
      ' · 申请人 ' + esc(c.applicant_name || ('#' + c.applicant_id)) +
      (pending ? '' : ' · 审批人 ' + esc(c.approver_name || ('#' + c.approver_id)) + ' ' + (c.approved_at || '').slice(0, 10)) + '</span>' +
      '<span class="kb-x">' +
      (pending && canApprove && c.applicant_id !== me.id
        ? '<fluent-button appearance="accent" size="small" onclick="cgApprove(' + c.id + ',' + c.version + ',\'APPROVED\')">批准</fluent-button> ' +
          '<fluent-button appearance="secondary" size="small" onclick="cgApprove(' + c.id + ',' + c.version + ',\'REJECTED\')">驳回</fluent-button> '
        : '') +
      (pending && (canApprove || c.applicant_id === me.id)
        ? '<fluent-button appearance="secondary" size="small" onclick="cgEdit(' + c.id + ')">编辑</fluent-button> ' : '') +
      (pending && (canApprove || c.applicant_id === me.id)
        ? '<fluent-button appearance="secondary" size="small" onclick="cgDel(' + c.id + ')">删除</fluent-button>' : '') +
      '</span></fluent-card>';
  }).join('') + '</div>';
}

function cgCreate() {
  const pid = $('#cg-project').value;
  if (!pid) return showToast('请先选择项目', 'err');
  cgForm('发起变更', { change_type: 'SCOPE' }, null, 0);
}
function cgEdit(id) {
  const pid = $('#cg-project').value;
  api('GET', PApi.changes(pid)).then(function (list) {
    const c = list.find(function (x) { return x.id === id; });
    if (!c) return showToast('变更单不存在', 'err');
    cgForm('编辑变更单 ' + (c.change_no || ''), c, id, c.version);
  });
}
// 变更单新建/编辑共用弹窗
function cgForm(title, c, cid, version) {
  const isBudget = c.change_type === 'BUDGET';
  openModal(title,
    '<div class="pk-form">' +
    '<label>变更类型 *</label><fluent-select id="cg-type">' +
    Object.keys(CHG_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '"' + (c.change_type === k ? ' selected' : '') + '>' + CHG_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>变更内容描述 *</label><fluent-text-area id="cg-desc">' + esc(c.description || '') + '</fluent-text-area>' +
    '<label>变更前</label><fluent-text-field id="cg-before" value="' + esc(c.before_value || '') + '"></fluent-text-field>' +
    '<label>变更后' + (isBudget ? '（数字，批准后写入项目预算）' : '') + '</label><fluent-text-field id="cg-after" value="' + esc(c.after_value || '') + '"></fluent-text-field>' +
    '<label>变更原因</label><fluent-text-area id="cg-reason">' + esc(c.reason || '') + '</fluent-text-area>' +
    '<div class="muted" style="font-size:12px;margin-top:6px">审批人：管理员/项目经理/项目负责人；申请人不能审批本人发起的变更；BUDGET 类批准后自动更新项目预算。</div></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="' + (cid ? 'cgEditSave(' + cid + ',' + version + ')' : 'cgCreateSave()') + '">提交</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
function cgReadForm() {
  return {
    change_type: $('#cg-type').value,
    description: $('#cg-desc').value.trim(),
    before_value: $('#cg-before').value,
    after_value: $('#cg-after').value,
    reason: $('#cg-reason').value
  };
}
async function cgCreateSave() {
  const pid = $('#cg-project').value;
  const d = cgReadForm();
  if (!d.description) return showToast('变更内容描述必填', 'err');
  try {
    const r = await api('POST', PApi.changes(pid), d);
    showToast('已发起 ' + (r.change_no || ''));
    pCloseModal(); cgLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
async function cgEditSave(cid, version) {
  const d = cgReadForm();
  if (!d.description) return showToast('变更内容描述必填', 'err');
  try {
    await api('PUT', PApi.change(cid), Object.assign({ version: version }, d));
    showToast('已保存'); pCloseModal(); cgLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
// 审批（decision=APPROVED/REJECTED；CAS version 防并发双审）
async function cgApprove(cid, version, decision) {
  const word = decision === 'APPROVED' ? '批准' : '驳回';
  if (!confirm('确认' + word + '该变更单？（BUDGET 类批准后自动更新项目预算）')) return;
  try {
    await api('POST', PApi.changeApprove(cid), { decision: decision, version: version });
    showToast('已' + word); cgLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
async function cgDel(cid) {
  if (!confirm('确认删除该变更单？（已审批单留档不可删）')) return;
  try { await api('DELETE', PApi.change(cid)); showToast('已删除'); cgLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
