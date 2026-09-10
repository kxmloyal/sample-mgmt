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
    // 补丁B（sm 同款）：接口返回时若输入框已失焦/已销毁则不渲染（防迟到响应把已关面板重新弹开）
    if (input === document.getElementById('scan-loc') && document.activeElement === input) renderSmCandidates('');
  };
  if (_smCache) load(_smCache);
  else api('GET', '/api/samples/storage-map').then(load).catch(function () { _smCache = { cabinets: [] }; panel.style.display = 'none'; });
  input.oninput = function () { if (window._smBlurTimer) { clearTimeout(window._smBlurTimer); window._smBlurTimer = null; } renderSmCandidates(this.value || ''); };
  input.onfocus = function () { if (window._smBlurTimer) { clearTimeout(window._smBlurTimer); window._smBlurTimer = null; } renderSmCandidates(this.value || ''); };
  input.onblur = function () { window._smBlurTimer = setTimeout(hideSmCandidates, 200); };
  // 全局兜底与领用人 picker 同款（ensureCoOutsideClose 统一注册，收起时双 picker 一起收）
  if (typeof ensureCoOutsideClose === 'function') ensureCoOutsideClose();
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

// ═══ 柜位图选择弹窗（方案B，2026-09-10）═══
// 交互：点「🗺 柜位图」→ 弹窗（左柜列表 + 右数字孪生矩阵）→ 点格位回填储位
// 柜多时：柜列表按「空位多→少」排序 + 可滚动；记住上次选的柜（接收保管连续放同一柜）
// 叠层安全：关闭用 _topMask 顶层（柜位图弹窗可能叠在详情/清单之上）
var _smMapLastCab = null; // 记住上次选的柜号

function openSmMapPicker() {
  if (!_smCache || !_smCache.cabinets || !_smCache.cabinets.length) { toast('柜位数据未就绪', 'err'); return; }
  var cabs = _smCache.cabinets.slice().sort(function (a, b) { return (b.summary.empty - a.summary.empty) || (a.no - b.no); });
  var cur = _smMapLastCab || cabs[0].no;
  var listHtml = cabs.map(function (c) {
    return '<div class="sm-map-cabitem' + (c.no === cur ? ' active' : '') + '" data-no="' + c.no + '" onclick="smMapSelectCab(' + c.no + ')">' +
      '<span>' + e(c.key) + '</span><span class="muted" style="font-size:11px">空' + c.summary.empty + '</span></div>';
  }).join('');
  openModal('选择储位（柜位图）',
    '<div class="sm-map-picker"><div class="sm-map-cablist">' + listHtml + '</div><div class="sm-map-matrix" id="sm-map-matrix"></div></div>',
    { foot: '<fluent-button appearance="neutral" size="small" onclick="closeSmMapPicker()">取消</fluent-button>' });
  // 2026-09-10 自适应：给 dialog 加 sm-map-dialog 类（max-height:90vh + 弹窗整体滚动兜底，常规柜一眼看全无滚动条）
  var dlg = document.querySelectorAll('.modal-mask fluent-dialog');
  if (dlg.length) dlg[dlg.length - 1].classList.add('sm-map-dialog');
  smMapSelectCab(cur);
}

function smMapSelectCab(no) {
  _smMapLastCab = no;
  var cab = (_smCache.cabinets || []).filter(function (c) { return c.no === no; })[0];
  if (!cab) return;
  var items = document.querySelectorAll('.sm-map-cabitem');
  for (var i = 0; i < items.length; i++) items[i].classList.toggle('active', Number(items[i].getAttribute('data-no')) === no);
  var cellsHtml = '';
  for (var row = 1; row <= cab.rows; row++) {
    for (var col = 1; col <= cab.cols; col++) {
      var cell = cab.cells.filter(function (x) { return x.col === col && x.row === row; })[0] ||
        { col: col, row: row, empty: true, occupancy: { in: 0, out: 0, ret: 0, reserved: 0, samples: [] } };
      cellsHtml += smMapRenderCell(cab, cell);
    }
  }
  var m = document.getElementById('sm-map-matrix');
  if (m) m.innerHTML = '<div class="sm-cab"><div class="sm-cab-head"><b>' + e(cab.key) + '</b>' +
    '<span class="muted" style="font-size:12px">' + cab.cols + '列×' + cab.rows + '行</span></div>' +
    '<div class="sm-cells" style="grid-template-columns:repeat(' + cab.cols + ',1fr)">' + cellsHtml + '</div></div>';
}

// 储位选择场景的格位渲染：点格位直接选储位（与柜位视图的 smRenderCell 交互不同，不复用）
function smMapRenderCell(cab, cell) {
  var occ = cell.occupancy;
  var total = occ.in + occ.out + occ.ret + occ.reserved;
  var cls = 'sm-empty';
  if (occ.in) cls = 'sm-in';
  if (occ.ret) cls = 'sm-ret';
  if (occ.out && !occ.in && !occ.ret) cls = 'sm-out';
  var badge = total ? '<span class="sm-badge">' + total + '</span>' : '';
  var sub = occ.out ? '<span class="sm-sub">领' + occ.out + '</span>' : (occ.ret ? '<span class="sm-sub">退' + occ.ret + '</span>' : '');
  return '<div class="sm-cell ' + cls + '" onclick="smMapPick(' + JSON.stringify(cab.no) + ',' + cell.col + ',' + cell.row + ')" title="' + cell.label + '">' +
    '<span class="sm-pos">' + cell.label + '</span>' + badge + sub + '</div>';
}

function smMapPick(cabNo, col, row) {
  var cab = (_smCache.cabinets || []).filter(function (c) { return c.no === cabNo; })[0];
  if (!cab) return;
  var label = cab.key.replace(/\s+/g, '') + col + '-' + row;
  var input = document.getElementById('scan-loc');
  if (input) input.value = label;
  closeSmMapPicker();
}

// 顶层关闭（叠层安全：柜位图弹窗可能叠在详情/清单之上，不能误关底层）
function closeSmMapPicker() {
  var ms = document.querySelectorAll('.modal-mask');
  if (ms.length) closeModal(ms[ms.length - 1]);
}
