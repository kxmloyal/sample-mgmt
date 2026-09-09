// views/checkout-user-picker.js — 领用人可搜索选择器（2026-09-09 方案A）
// 背景：扫码领用时操作员（保管/生技）不一定是领用人，纯手填易错写、部门口径不统一。
// 形态：输入框实时过滤系统用户候选（姓名+部门），点选自动带出部门（仍可手改，兼容代借他部门）；
//       输入不在用户表的名字 → 允许提交（手填兜底，兼容外来/供应商人员，保持旧行为）。
// 数据：GET /api/samples/checkout-users（登录即可，仅 id/display_name/dept）；加载失败静默降级为纯手填。
// 容量：独立文件避免 scan.js（74% 预警线）继续膨胀。

var _coUsers = null;   // 用户候选缓存 [{id,display_name,dept}]；null=未加载，[]=加载失败
var _coPick = null;    // 当前已点选的用户（用于提交时优先取其部门）

// 初始化领用人选择器：拉候选（每弹窗一次）并绑定过滤/点选
function initCheckoutUserPicker() {
  _coPick = null;
  var input = document.getElementById('scan-co-user');
  var panel = document.getElementById('scan-co-cand');
  if (!input || !panel) return;
  panel.innerHTML = '<div class="co-cand-item muted">候选加载中…</div>';
  api('GET', '/api/samples/checkout-users').then(function (rows) {
    _coUsers = Array.isArray(rows) ? rows : [];
    renderCoCandidates('');
  }).catch(function () { _coUsers = []; panel.innerHTML = ''; });
  input.oninput = function () { _coPick = null; renderCoCandidates(this.value || ''); };
  input.onfocus = function () { renderCoCandidates(this.value || ''); };
}

// 渲染候选列表：按输入前缀/包含过滤（最多 8 条）；空输入显示全部前 8 条便于直接点选
function renderCoCandidates(kw) {
  var panel = document.getElementById('scan-co-cand');
  if (!panel || !_coUsers) return;
  var k = String(kw || '').trim();
  var list = _coUsers.filter(function (u) {
    return !k || u.display_name.indexOf(k) === 0 || u.display_name.indexOf(k) > -1 || (u.dept || '').indexOf(k) > -1;
  }).slice(0, 8);
  if (!list.length) { panel.innerHTML = ''; return; }
  panel.innerHTML = list.map(function (u) {
    return '<div class="co-cand-item" onclick="pickCheckoutUser(' + u.id + ')">' + e(u.display_name) +
      '<span class="co-cand-dept">' + e(u.dept || '') + '</span></div>';
  }).join('');
}

// 点选候选：填入姓名 + 自动带出部门（可手改）；记录选中项供提交时使用
function pickCheckoutUser(id) {
  var u = (_coUsers || []).filter(function (x) { return x.id === id; })[0];
  if (!u) return;
  _coPick = u;
  var input = document.getElementById('scan-co-user');
  var dept = document.getElementById('scan-co-dept');
  if (input) input.value = u.display_name;
  if (dept && u.dept) dept.value = u.dept; // 部门自动带出但仍可手改
  var panel = document.getElementById('scan-co-cand');
  if (panel) panel.innerHTML = '';
}
