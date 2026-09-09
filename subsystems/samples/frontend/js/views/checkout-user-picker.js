// views/checkout-user-picker.js — 领用人可搜索选择器（2026-09-09 方案A）
// 背景：扫码领用时操作员（保管/生技）不一定是领用人，纯手填易错写、部门口径不统一。
// 形态：输入框实时过滤系统用户候选（姓名+部门），点选自动带出部门（仍可手改，兼容代借他部门）；
//       输入不在用户表的名字 → 允许提交（手填兜底，兼容外来/供应商人员，保持旧行为）。
// 数据：GET /api/samples/checkout-users（登录即可，仅 id/display_name/dept）；加载失败静默降级为纯手填。
// 容量：独立文件避免 scan.js（74% 预警线）继续膨胀。

var _coUsers = null;   // 用户候选缓存 [{id,display_name,dept}]；null=未加载，[]=加载失败
var _coPick = null;    // 当前已点选的用户（用于提交时优先取其部门）

// 初始化领用人选择器：拉候选（每弹窗一次）并绑定过滤/点选
// 面板挂 document.body + position:fixed（视口定位）：弹窗 modal-body 是滚动容器，absolute 面板
// 超出其右边界会触发整窗横向滚动条（2026-09-09 实证两轮）——fixed 元素不参与滚动容器布局，根治
function initCheckoutUserPicker() {
  _coPick = null;
  var input = document.getElementById('scan-co-user');
  var panel = document.getElementById('scan-co-cand');
  if (!input || !panel) return;
  // 清理上次弹窗遗留的 body 级面板（id 相同会干扰 getElementById），再把新面板移到 body
  var stale = document.querySelectorAll('body > #scan-co-cand');
  for (var i = 0; i < stale.length; i++) stale[i].remove();
  document.body.appendChild(panel);
  panel.style.display = 'none';
  panel.innerHTML = '<div class="co-cand-item muted">候选加载中…</div>';
  // 全局滚动跟随（capture=true 捕获任意元素的滚动，含 fluent-dialog shadow DOM 内部滚动容器——
  // 2026-09-09 实证：绑 .modal-body 收不到事件，弹窗内容滚动时面板钉在原地）；
  // resize 同样重新定位而非收起；处理器挂 window 便于重复初始化时先移除防叠加
  if (window._coScrollHandler) window.removeEventListener('scroll', window._coScrollHandler, true);
  window._coScrollHandler = positionCoPanel;
  window.addEventListener('scroll', window._coScrollHandler, true);
  if (window._coResizeHandler) window.removeEventListener('resize', window._coResizeHandler);
  window._coResizeHandler = positionCoPanel;
  window.addEventListener('resize', window._coResizeHandler);
  ensureCoOutsideClose();
  api('GET', '/api/samples/checkout-users').then(function (rows) {
    _coUsers = Array.isArray(rows) ? rows : [];
    // 时机评审补丁B：接口返回时若输入框已失焦/已销毁则不渲染（否则面板会在 200ms 失焦关闭后
    // 被迟到的响应重新弹开且无人再关——「候选框一直显示」的主因）
    if (input === document.getElementById('scan-co-user') && document.activeElement === input) renderCoCandidates('');
  }).catch(function () { _coUsers = []; panel.style.display = 'none'; });
  input.oninput = function () { if (window._coBlurTimer) { clearTimeout(window._coBlurTimer); window._coBlurTimer = null; } _coPick = null; renderCoCandidates(this.value || ''); };
  input.onfocus = function () { if (window._coBlurTimer) { clearTimeout(window._coBlurTimer); window._coBlurTimer = null; } renderCoCandidates(this.value || ''); };
  input.onblur = function () { window._coBlurTimer = setTimeout(hideCoCandidates, 200); }; // 评审修正：与 sm 同款延迟关（原来只靠点选关，点候选外区域失焦面板不收）
}

// 全局兜底：点击面板/输入框以外任意处即收起候选（覆盖切动作表单、点其他按钮等 blur 触发不到的路径；
// pointerdown capture 在候选 onmousedown 之前一拍，靠 closest 排除面板内部点击）
function ensureCoOutsideClose() {
  if (window._coOutsideHandler) return;
  window._coOutsideHandler = function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    if (t.closest('#scan-co-cand') || t.closest('#scan-co-user') || t.closest('#scan-loc-cand') || t.closest('#scan-loc')) return;
    hideCoCandidates();
    if (typeof hideSmCandidates === 'function') hideSmCandidates();
  };
  document.addEventListener('pointerdown', window._coOutsideHandler, true);
}

// 视口定位：贴输入框右侧；右缘越界收进屏内、下缘越界上移（不产生任何滚动条）
function positionCoPanel() {
  var panel = document.getElementById('scan-co-cand');
  var input = document.getElementById('scan-co-user');
  if (!panel || !input || panel.style.display === 'none') return;
  var r = input.getBoundingClientRect();
  var w = 260, h = panel.offsetHeight || 8;
  var left = r.right + 8;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  var top = r.top;
  if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

// 收起候选面板（失焦/点选/窗口缩放时调用；面板在 body 上，须隐藏整块而非清内容）
function hideCoCandidates() {
  var p = document.getElementById('scan-co-cand');
  if (p) p.style.display = 'none';
}

// 渲染候选列表：按输入前缀/包含过滤（最多 8 条）；空输入显示全部前 8 条便于直接点选。
// 后端已按「同部门优先→领用频率降序→姓名序」返回，前端按原顺序渲染，并为同部门/高频候选加徽标
function renderCoCandidates(kw) {
  var panel = document.getElementById('scan-co-cand');
  if (!panel || !_coUsers) return;
  var k = String(kw || '').trim();
  var list = _coUsers.filter(function (u) {
    return !k || u.display_name.indexOf(k) === 0 || u.display_name.indexOf(k) > -1 || (u.dept || '').indexOf(k) > -1;
  }).slice(0, 8);
  if (!list.length) { hideCoCandidates(); return; }
  var myDept = (me && me.dept) || '';
  panel.innerHTML = list.map(function (u) {
    var badge = '';
    if (u.dept && u.dept === myDept) badge = '<span class="co-badge co-badge-dept">同部门</span>';
    else if (u.freq > 0) badge = '<span class="co-badge">' + u.freq + '次</span>';
    return '<div class="co-cand-item"><b title="' + e(u.display_name) + '" onmousedown="pickCheckoutUser(' + u.id + ')">' + e(u.display_name) + '</b>' +
      '<span class="co-cand-dept"><span class="co-dept-name">' + e(u.dept || '') + '</span>' + badge + '</span></div>';
  }).join('');
  panel.style.display = 'block';
  positionCoPanel(); // 内容就绪后再定位（需面板实际高度）
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
  hideCoCandidates();
}
