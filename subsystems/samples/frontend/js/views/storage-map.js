// views/storage-map.js — 样品柜数字孪生视图（2026-09-09）
// 入口：#/storagemap（导航「柜位视图」+ 列表页按钮，与机型视图同款 hash 跳转）
// 数据：GET /api/samples/storage-map（聚合：在柜/领走=占用/退回审核/预占/空位/未入柜池）
// 交互：格位点击 → 弹该格样品清单 → 点样品 → viewSample 详情弹窗（详情头部可「📲扫码操作」直达流转）
// 配置：ADMIN 在页内配置每柜行列（PUT cabinets/:key，默认 3 列×9 行）
// 样式：写入本子系统 module.css（sm-cab-* 类），禁 app.css

async function viewStorageMap() {
  var v = $('#view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">孪生加载中…</div>';
  var data;
  try { data = await api('GET', '/api/samples/storage-map'); }
  catch (err) { v.innerHTML = '<div class="empty">加载失败：' + e(err.message) + '</div>'; return; }
  window._smMapData = data; // 缓存给格位点击用（smCellSamples 同步渲染，避免 async 竞态）

  var cabs = data.cabinets || [];
  var warnHtml = '';
  if ((data.uncabineted || []).length) {
    warnHtml = '<div class="sm-warn">⚠️ 未入柜样品 <b>' + data.uncabineted.length + '</b> 件（无储位，接收保管时请补录）' +
      '<a class="link" style="margin-left:10px" onclick="smToggleUncab()">查看清单</a>' +
      '<div id="sm-uncab-list" style="display:none;margin-top:8px">' +
      data.uncabineted.map(function (s) { return '<span class="sm-tag" onclick="viewDetail(' + s.id + ')" title="打开详情">' + e(s.sample_no) + '</span>'; }).join('') + '</div></div>';
  }
  var unknownHtml = (data.unknownLoc || []).length
    ? '<div class="sm-warn" style="background:#fffbeb">⚠️ ' + data.unknownLoc.length + ' 条储位格式不规范（须为 N#样品柜C-R）：<span class="sm-tag" style="background:#fff">' +
      data.unknownLoc.map(function (s) { return e(s.sample_no) + '(' + e(s.storage_location) + ')'; }).join('</span><span class="sm-tag" style="background:#fff">') + '</span></div>'
    : '';

  v.innerHTML =
    '<div class="pk-filters" style="align-items:center">' +
    '<b style="font-size:15px">样品柜数字孪生</b>' +
    smLegendHtml(true) +
    (me.role === 'ADMIN' ? '<fluent-button appearance="accent" size="small" onclick="smConfigCabinet(null,3,9)">➕ 新增柜</fluent-button>' : '') +
    '<fluent-button appearance="neutral" size="small" onclick="viewStorageMap()">刷新</fluent-button>' +
    '</div>' + warnHtml + unknownHtml +
    '<div class="sm-grid">' + cabs.map(smRenderCabinet).join('') + '</div>';
}

// 柜位图图例（2026-09-10 抽公共）：柜位视图顶栏与「储位选择弹窗」标题栏共用同一份标签，
// 保证两处颜色说明永不漂移（§15.2 禁复制粘贴；此前弹窗漏搬图例，新用户分不清 4 色含义）。
// 参数：withLabel=true 时前置「图例：」文案（柜位视图用）；弹窗标题栏空间紧，传 false。
// 返回：4 段 .sm-legend HTML（.sm-dot 配色定义见 module.css）；不依赖任何全局状态，可安全重复调用。
function smLegendHtml(withLabel) {
  return (withLabel ? '<span class="muted" style="font-size:12px">图例：</span>' : '') +
    '<span class="sm-legend"><span class="sm-dot sm-in"></span>在柜</span>' +
    '<span class="sm-legend"><span class="sm-dot sm-out"></span>被领走(占位)</span>' +
    '<span class="sm-legend"><span class="sm-dot sm-ret"></span>退回审核</span>' +
    '<span class="sm-legend"><span class="sm-dot sm-empty"></span>空位</span>';
}

// 渲染单柜：头部（柜名/统计/ADMIN 配置钮）+ 格位矩阵（列×行）
function smRenderCabinet(c) {
  var cellsHtml = '';
  for (var row = 1; row <= c.rows; row++) {
    for (var col = 1; col <= c.cols; col++) {
      var cell = c.cells.filter(function (x) { return x.col === col && x.row === row; })[0];
      cellsHtml += smRenderCell(c, cell || { col: col, row: row, empty: true, occupancy: { in: 0, out: 0, ret: 0, reserved: 0, samples: [] } });
    }
  }
  var cfgBtn = (me.role === 'ADMIN')
    ? '<a class="link" style="font-size:12px" onclick="smConfigCabinet(\'' + e(c.key) + '\',' + c.cols + ',' + c.rows + ')">配置行列</a>' : '';
  var cfgTag = c.configured ? '' : ' <span class="muted" style="font-size:11px">(未配置，按数据自适应)</span>';
  return '<div class="sm-cab"><div class="sm-cab-head"><b>' + e(c.key) + '</b>' +
    '<span class="muted" style="font-size:12px">' + c.cols + '列×' + c.rows + '行' + cfgTag + '</span>' + cfgBtn +
    '<span style="margin-left:auto;font-size:12px">' +
    '<span class="sm-legend"><span class="sm-dot sm-in"></span>' + c.summary.inCustody + '</span>' +
    '<span class="sm-legend"><span class="sm-dot sm-out"></span>' + c.summary.checkedOut + '</span>' +
    '<span class="sm-legend"><span class="sm-dot sm-ret"></span>' + c.summary.returning + '</span>' +
    '<span class="sm-legend"><span class="sm-dot sm-empty"></span>' + c.summary.empty + '</span></span></div>' +
    '<div class="sm-cells" style="grid-template-columns:repeat(' + c.cols + ',1fr)">' + cellsHtml + '</div></div>';
}

// 渲染单格位：空=虚框灰点；占用=状态色+数量角标；点击弹清单
function smRenderCell(cab, cell) {
  var occ = cell.occupancy;
  var total = occ.in + occ.out + occ.ret + occ.reserved;
  var cls = 'sm-empty';
  if (occ.in) cls = 'sm-in';
  if (occ.ret) cls = 'sm-ret';
  if (occ.out && !occ.in && !occ.ret) cls = 'sm-out';
  var badge = total ? '<span class="sm-badge">' + total + '</span>' : '';
  var sub = occ.out ? '<span class="sm-sub">领' + occ.out + '</span>' : (occ.ret ? '<span class="sm-sub">退' + occ.ret + '</span>' : '');
  return '<div class="sm-cell ' + cls + '" onclick="smCellSamples(' + JSON.stringify(cab.no) + ',' + cell.col + ',' + cell.row + ')" title="' + cell.label + '">' +
    '<span class="sm-pos">' + cell.label + '</span>' + badge + sub + '</div>';
}

// 格位点击：就地取孪生数据弹样品清单（轻弹窗复用 openModal）
// 2026-09-09：打开前剥离 dialog 上可能残留的详情密度类（d-high 等），保证清单窗恒为内容自适应小尺寸
function smCellSamples(cabNo, col, row) {
  var stale = document.querySelector('.modal-mask fluent-dialog');
  if (stale) { stale.classList.remove('d-high', 'd-mid', 'd-low', 'dm-modal'); }
  var data = window._smMapData || null;
  if (!data) return;
  var cab = (data.cabinets || []).filter(function (x) { return x.no === cabNo; })[0];
  if (!cab) return;
  var cell = cab.cells.filter(function (x) { return x.col === col && x.row === row; })[0];
  var occ = cell.occupancy;
  if (!occ.samples.length) { toast(col + '-' + row + ' 为空位', 'ok'); return; }
  var rows = occ.samples.map(function (s) {
    var stCn = { IN_CUSTODY: '在柜', CHECKED_OUT: '被领走', RETURNING: '退回审核' }[s.status] || s.status;
    return '<div class="co-cand-item"><b title="' + e(s.sample_no) + '" onclick="viewDetail(' + s.id + ')">' + e(s.sample_no) + '</b>' +
      '<span class="co-cand-dept"><span class="co-dept-name">' + e(s.name || '') + '</span><span class="co-badge">' + stCn + '</span></span></div>';
  }).join('');
  openModal(cab.key + ' · ' + col + '-' + row + '（' + occ.samples.length + ' 件）',
    '<div class="co-cand-panel" style="position:static;display:block;box-shadow:none;border:none;padding:0;width:auto;max-height:50vh;overflow-y:auto">' + rows + '</div>',
    { foot: '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>' });
}

// ADMIN 行列配置（默认 3 列×9 行；配置持久化 sample_storage_cabinets）
// 叠层防御：配置弹窗也须开在详情之上——详情开着时点「配置行列」会叠第三层，保存后
// viewStorageMap() 重建视图但 modal 挂 body 不随视图卸载，故保存/取消都显式关闭「自己这一层」
// 配置行列 / 新增柜（ADMIN）：key 为空 = 新增模式（多一个柜号字段，保存时拼成 N#样品柜）。
// 复用同一弹窗与同一个 PUT 接口，避免为「新增」再加一对函数（§7.2 顶层函数 ≤10）。
function smConfigCabinet(key, cols, rows) {
  var isNew = !key;
  var noHtml = '';
  if (isNew) {
    // 默认柜号 = 现有最大柜号 + 1（不猜最小空缺号，避免与「物理存在但尚无样品」的柜号撞车）
    var cabs = (window._smMapData && window._smMapData.cabinets) || [];
    var maxNo = cabs.reduce(function (m, c) { return Math.max(m, c.no || 0); }, 0);
    noHtml = '<label>柜号（数字，柜名 = 柜号 + #样品柜）</label>' +
      '<fluent-text-field id="sm-cfg-no" type="number" min="1" max="99" value="' + (maxNo + 1) + '"></fluent-text-field>';
  }
  var html = '<div class="pk-form">' + noHtml +
    '<label>列数（横向格位数）</label><fluent-text-field id="sm-cfg-cols" type="number" min="1" max="50" value="' + cols + '"></fluent-text-field>' +
    '<label>行数（纵向格位数）</label><fluent-text-field id="sm-cfg-rows" type="number" min="1" max="50" value="' + rows + '"></fluent-text-field>' +
    (isNew ? '<p class="muted" style="font-size:12px">创建后立即在柜位视图与扫码台「🗺 柜位图」中显示为空柜，可直接点选空位放样</p>' : '') +
    '</div>';
  window._smCfgKey = key || null;
  openModal(isNew ? '新增保管柜' : '配置 ' + key + ' 行列', html, { foot:
    '<fluent-button appearance="accent" size="small" onclick="smSaveCabinetCfg()">' + (isNew ? '创建' : '保存') + '</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="closeSmCfgModal()">取消</fluent-button>' });
}
async function smSaveCabinetCfg() {
  var cols = Number(document.getElementById('sm-cfg-cols').value);
  var rows = Number(document.getElementById('sm-cfg-rows').value);
  var key = window._smCfgKey;
  var isNew = !key;
  if (isNew) {
    var noEl = document.getElementById('sm-cfg-no');
    var no = Number(noEl && noEl.value);
    if (!Number.isInteger(no) || no < 1 || no > 99) return toast('柜号须为 1~99 的整数', 'err');
    key = no + '#样品柜';
    // 已存在的柜不允许经「新增」入口覆盖（改尺寸请用该柜的「配置行列」）
    var exists = ((window._smMapData && window._smMapData.cabinets) || []).filter(function (c) { return c.key === key; }).length;
    if (exists) return toast(key + ' 已存在，如需改尺寸请用该柜的「配置行列」', 'err');
  }
  try {
    await api('PUT', '/api/samples/storage-map/cabinets/' + encodeURIComponent(key), { columns: cols, rows: rows });
    toast(isNew ? '已新增 ' + key : '已保存');
    closeSmCfgModal();
    viewStorageMap();
  } catch (e) { toast(e.message, 'err'); }
}
// 关配置弹窗：取最上层 mask（叠层时不能误关底层的格位清单/详情窗）
function closeSmCfgModal() {
  var ms = document.querySelectorAll('.modal-mask');
  if (ms.length) closeModal(ms[ms.length - 1]);
}

// 未入柜清单折叠
function smToggleUncab() {
  var el = document.getElementById('sm-uncab-list');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
