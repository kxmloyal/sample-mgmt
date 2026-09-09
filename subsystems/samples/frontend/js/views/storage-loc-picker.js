// views/storage-loc-picker.js — 储位可搜索选择器（2026-09-09，孪生配套）
// 数据源：GET /api/samples/storage-map（柜/格位/占用聚合）——候选=已知格位，空位带「空」徽标置顶排序（空位优先→柜号→格位）
// 交互：与 checkout-user-picker 同款（body 级 fixed 面板，window capture 滚动跟随，铁律见该文件头注释）；
//       输入过滤 + 点选回填（onmousedown 先于 blur，杜绝 200ms 竞态）；自由输入保留（新格位首录场景），格式提示 N#样品柜C-R
// 时机评审修正（2026-09-09）：①候选 onmousedown 触发（移动端 blur 竞态）；②resize 监听去重（防累积）；
//       ③_smCache 由扫码成功回调失效（scan.js confirmSmScanOk），防格位占用态过期误导；④doScan 入口统一关面板
// 服务两处表单：CUSTODY 接收保管 / EDIT_STORAGE 修改储位（同一 input id=scan-loc）

var _smCache = null;      // storage-map 缓存（弹窗级）；扫码成功后置 null 强制重拉
var _smPanelFor = null;   // 当前面板服务的 input id

function initStorageLocPicker() {
  _smPanelFor = 'scan-loc';
  var input = document.getElementById('scan-loc');
  var panel = document.getElementById('scan-loc-cand');
  if (!input || !panel) return;
  var stale = document.querySelectorAll('body > #scan-loc-cand');
  for (var i = 0; i < stale.length; i++) stale[i].remove();
  document.body.appendChild(panel);
  panel.style.display = 'none';
  panel.innerHTML = '<div class="co-cand-item muted">格位加载中…</div>';
  if (window._smScrollHandler) window.removeEventListener('scroll', window._smScrollHandler, true);
  window._smScrollHandler = positionSmPanel;
  window.addEventListener('scroll', window._smScrollHandler, true);
  if (window._smResizeHandler) window.removeEventListener('resize', window._smResizeHandler);
  window._smResizeHandler = positionSmPanel;
  window.addEventListener('resize', window._smResizeHandler);
  var load = function (d) {
    _smCache = d;
    renderSmCandidates('');
  };
  if (_smCache) load(_smCache);
  else api('GET', '/api/samples/storage-map').then(load).catch(function () { _smCache = { cabinets: [] }; panel.style.display = 'none'; });
  input.oninput = function () { renderSmCandidates(this.value || ''); };
  input.onfocus = function () { renderSmCandidates(this.value || ''); };
  input.onblur = function () { setTimeout(hideSmCandidates, 200); };
}

// 候选排序：空位优先（方便接收保管直接拿空格）→ 柜号 → 列 → 行；输入时按包含过滤
function smSortedCells() {
  var out = [];
  (_smCache.cabinets || []).forEach(function (cab) {
    (cab.cells || []).forEach(function (cell) {
      out.push({ key: cab.key, no: cab.no, col: cell.col, row: cell.row, label: cab.key.replace(/\s+/g, '') + cell.col + '-' + cell.row, empty: cell.empty, occ: cell.occupancy });
    });
  });
  out.sort(function (a, b) {
    if (a.empty !== b.empty) return a.empty ? -1 : 1;
    if (a.no !== b.no) return a.no - b.no;
    if (a.col !== b.col) return a.col - b.col;
    return a.row - b.row;
  });
  return out;
}

function renderSmCandidates(kw) {
  var panel = document.getElementById('scan-loc-cand');
  if (!panel || !_smCache) return;
  var k = String(kw || '').replace(/\s+/g, '');
  var list = smSortedCells().filter(function (c) { return !k || c.label.indexOf(k) > -1 || c.key.indexOf(k) > -1; }).slice(0, 8);
  if (!list.length) { hideSmCandidates(); return; }
  panel.innerHTML = list.map(function (c) {
    var badge = c.empty ? '<span class="co-badge co-badge-dept">空</span>'
      : '<span class="co-badge">' + (c.occ.in + c.occ.out + c.occ.ret + c.occ.reserved) + '件</span>';
    return '<div class="co-cand-item"><b title="' + e(c.label) + '" onmousedown="pickStorageLoc(\'' + e(c.label) + '\')">' + e(c.label) + '</b>' +
      '<span class="co-cand-dept">' + badge + '</span></div>';
  }).join('');
  panel.style.display = 'block';
  positionSmPanel();
}

function positionSmPanel() {
  var panel = document.getElementById('scan-loc-cand');
  var input = document.getElementById(_smPanelFor);
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

function pickStorageLoc(label) {
  var input = document.getElementById('scan-loc');
  if (input) input.value = label;
  hideSmCandidates();
}

function hideSmCandidates() {
  var p = document.getElementById('scan-loc-cand');
  if (p) p.style.display = 'none';
}
