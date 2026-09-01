// detail.js — 样品详情弹窗（信息/标示卡/日志/大图 四Tab）
// 重构: CSS Grid 卡片布局 + Tab 内联渲染，架构与 fixture-detail.js 对齐
// D1: 骨架屏/Tab置顶(detail-tabs-top)/头部操作组/锁定引导/dirty拦截/密度类
var _detailSample = null;
var _detailTab = 'info';
var _detailReqSeq = 0;

async function viewDetail(id) {
  var seq = ++_detailReqSeq;
  _detailTab = 'info'; _detailDirty = false;
  // D1.1 先开骨架屏（标题条 + 4 卡片占位），数据到达后替换；失败 toast + 关窗
  var foot = '<fluent-button appearance="neutral" size="small" onclick="tryCloseDetail(this.closest(\'.modal-mask\'))">关闭</fluent-button>';
  var sk = '<div class="sk" style="height:20px;width:42%"></div><div class="overview-cards">' + '<div class="overview-card sk" style="height:130px"></div>'.repeat(4) + '</div>';
  var mask = openModal('', sk, { head: '<b>加载中…</b>', foot: foot });
  _applyDetailDensity('info');
  var s;
  try { s = await api('GET', '/api/samples/' + id); }
  catch (err) { if (seq === _detailReqSeq) { toast('详情加载失败', 'err'); closeModal(mask); } return; }
  if (seq !== _detailReqSeq) { closeModal(mask); return; } // 防竞态：回收过期骨架弹窗
  _detailSample = s;
  mask.querySelector('.modal-head').innerHTML = _buildHeadHTML(s, id);
  mask.querySelector('.modal-body').innerHTML = _buildTabsHTML(s, id, 'info') + _buildTabContent(s, id, 'info');
}

// D1.3 头部：编号 + 徽章 + 操作组
function _buildHeadHTML(s, id) {
  var acts = [['🖨', '打印标示卡', 'printCard(' + id + ')'],
    ['🏷', '打印标签', 'window.open(\'/api/samples/' + id + '/label/print\'+getPrintSizeQuery(),\'_blank\')'],
    ['⬇', '下载二维码', 'downloadQR(' + id + ')']];
  return '<b>' + e(s.sample_no) + '</b>' + statusBadge(s) + '<span class="pv-actions">' +
    acts.map(function(a) { return '<button class="pv-icon-btn" title="' + a[1] + '" onclick="' + a[2] + '">' + a[0] + '</button>'; }).join('') + '</span>';
}

// D1.6 密度类：info→d-high / card→d-mid / logs·image→d-low（宽度样式 D2 进 module.css）
function _applyDetailDensity(tab) {
  var d = document.querySelector('.modal-mask fluent-dialog');
  if (d) { d.classList.remove('d-high', 'd-mid', 'd-low'); d.classList.add(tab === 'info' ? 'd-high' : tab === 'card' ? 'd-mid' : 'd-low'); }
}

function renderTab(tab, id) {
  var s = (_detailSample && _detailSample.id === id) ? _detailSample : null;
  if (!s) return;
  if (_detailTab === 'card' && _detailDirty && !confirm('标示卡有未保存的修改，切换将丢失，继续？')) return; // D1.5 切Tab拦截
  _detailDirty = false; // 离开/重渲标示卡后重置
  _detailTab = tab;
  var body = document.querySelector('.modal-body');
  if (!body) return;
  body.innerHTML = _buildTabsHTML(s, id, tab) + _buildTabContent(s, id, tab);
  _applyDetailDensity(tab);
  if (tab === 'card') applyDetailCardValues(s); // 显式回显下拉值（selected 属性在 FAST 下不生效）
  if (tab === 'image') loadImageHistory(id); // 大图 Tab 异步加载历史照片区（T14）
}

/** 构建 Tab 页面内容（不含 tab 栏） */
function _buildTabContent(s, id, tab) {
  var html = '';
  if (tab === 'info') html = _buildOverview(s, id);
  else if (tab === 'logs') html = _buildLogsTab(s, id);
  else if (tab === 'card') html = _buildCardTab(s, id);
  else if (tab === 'image') html = _buildImageTab(s, id);
  return html;
}

function _buildTabsHTML(s, id, activeTab) {
  var hasImg = !!(s.produced_image || s.image || s.inspect_image);
  var hasLog = s.logs && s.logs.length > 0;
  var hasCrd = !!(s.sample_type || s.limit_item || s.source_type || s.card_version || s.test_data || s.test_standard);
  if (!hasImg && !hasLog && !hasCrd) return '';

  var on = 'renderTab(\'';
  var h = '<div class="detail-tabs-top">';
  h += '<div class="detail-tab' + (activeTab === 'info' ? ' active' : '') + '" onclick="' + on + 'info\',' + id + ')">信息</div>';
  if (hasCrd) h += '<div class="detail-tab' + (activeTab === 'card' ? ' active' : '') + '" onclick="' + on + 'card\',' + id + ')">标示卡</div>';
  if (hasLog) h += '<div class="detail-tab' + (activeTab === 'logs' ? ' active' : '') + '" onclick="' + on + 'logs\',' + id + ')">全量日志 (' + s.logs.length + ')</div>';
  if (hasImg) h += '<div class="detail-tab' + (activeTab === 'image' ? ' active' : '') + '" onclick="' + on + 'image\',' + id + ')">大图</div>';
  h += '</div>';
  return h;
}

// ═══ 辅助：label/value ═══
function kv(label, val) { return '<span class="label">' + label + '</span><span>' + (val || '—') + '</span>'; }

// ═══ 概览 Tab（CSS Grid 卡片布局） ═══
function _buildOverview(s, id) {
  return '<div class="overview-cards">' +
    _cardInfo(s) + _cardProgress(s) + _cardImages(s, id) + _cardLogs(s, id) +
    '</div>';
}

function _cardInfo(s) {
  var h = '<div class="overview-card"><div class="title">基础信息</div><div class="field-grid">';
  h += kv('名称', e(s.name)) + kv('机型', e(s.model)) + kv('站别', e(s.station));
  h += kv('规格', e(s.spec)) + kv('保管', e(s.custody_dept)) + kv('储位', e(s.storage_location));
  var ov = overdue(s);
  h += '<span class="label">复检</span><span class="' + (ov ? 'b-overdue' : '') + '" style="font-weight:600">' + (s.release_cycle_days ? s.release_cycle_days + '天' : '—') + ' / ' + fmt(s.next_inspect_at) + '</span>';
  h += kv('备注', e(s.notes));
  var img = s.produced_image || s.image;
  if (img) h += '<div style="margin-top:8px;grid-column:1/-1"><img src="' + e(img) + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>';
  return h + '</div></div>';
}

function _cardProgress(s) {
  var steps = [['制作完成', s.produced_at], ['正式发行', s.released_at], ['分发保管', s.status === 'IN_CUSTODY' ? '储位 ' + e(s.storage_location) : null]];
  if (s.status === 'RETURNING' || s.status === 'RETIRED') steps.push(['退回审核', s.retired_reason || '']);
  if (s.status === 'RETIRED') steps.push(['已作废', s.retired_reason || '']);
  return '<div class="overview-card"><div class="title">流转进度</div><div class="progress-timeline">' +
    steps.map(function(x) { return '<div class="progress-step ' + (x[1] ? 'done' : 'pending') + '"><span class="dot"></span>' + x[0] + (x[1] ? ' · ' + e(fmt(x[1])) : '') + '</div>'; }).join('') +
    '</div></div>';
}

function _cardImages(s, id) {
  var h = '';
  var img = s.produced_image || s.image;
  if (img) h += '<div class="overview-card" style="cursor:pointer;text-align:center;padding:8px" onclick="renderTab(\'image\',' + id + ')"><img src="' + e(img) + '" alt="样品图片" style="width:100px;height:100px;object-fit:cover;border-radius:6px"/></div>';
  if (s.inspect_image) h += '<div class="overview-card" style="cursor:pointer;text-align:center;padding:8px" onclick="renderTab(\'image\',' + id + ')"><div class="title">复检照片</div><img src="' + e(s.inspect_image) + '" alt="复检照片" style="width:100px;height:100px;object-fit:cover;border-radius:6px"/></div>';
  return h;
}

function _cardLogs(s, id) {
  var logs = s.logs || [];
  var h = '<div class="overview-card"><div class="title">操作日志</div>';
  if (logs.length) {
    h += '<div class="log-list">' + logs.slice(0, 2).map(function(l) { return '<div><span class="muted">' + fmt(l.created_at) + '</span> · ' + (ACTION_CN[l.action] || l.action) + ' · ' + (l.role || '') + '/' + (l.dept || '') + '</div>'; }).join('') + '</div>';
  } else {
    h += '<div class="muted">暂无日志</div>';
  }
  if (logs.length > 2) h += '<div style="margin-top:4px"><a class="link" onclick="renderTab(\'logs\',' + id + ')">查看全部 ' + logs.length + ' 条 →</a></div>';
  return h + '</div>';
}

// ═══ 日志 Tab ═══
function _buildLogsTab(s, id) {
  var h = '<div style="padding:12px 14px"><div style="margin-bottom:8px"><a class="link" onclick="renderTab(\'info\',' + id + ')">← 返回详情</a></div>' +
    '<div class="detail-logs-wrap"><table><thead><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr></thead><tbody>';
  (s.logs || []).forEach(function(l) {
    h += '<tr><td class="muted">' + fmt(l.created_at) + '</td><td>' + (ACTION_CN[l.action] || l.action) + '</td><td class="muted">' + e(l.role || '') + '/' + e(l.dept || '') + '</td><td class="muted">' + e(l.location || '—') + '</td><td class="muted">' + e(l.note || '—') + '</td></tr>';
  });
  return h + '</tbody></table></div></div>';
}

// ═══ 大图 Tab（弹窗内展示，点击可全屏） ═══
function _buildImageTab(s, id) {
  var mainImg = s.produced_image || s.image;
  var h = '<div style="text-align:center;padding:16px">';
  if (mainImg) h += '<div style="margin-bottom:12px"><img id="detail-main-img" src="' + e(mainImg) + '" style="max-width:100%;max-height:40vh;border-radius:8px;cursor:pointer" onclick="showImageView(this.src)" alt="样品图片"/></div>';
  if (s.inspect_image) h += '<div style="margin-bottom:12px"><div class="label">复检照片</div><img src="' + e(s.inspect_image) + '" style="max-width:100%;max-height:40vh;border-radius:8px;cursor:pointer" onclick="showImageView(\'' + e(s.inspect_image) + '\')" alt="复检照片"/></div>';
  if (!mainImg && !s.inspect_image) h += '<div class="muted">暂无图片</div>';
  h += '<div id="detail-img-history" style="display:none;margin-top:12px"></div>';
  return h + '<div style="margin-top:12px"><a class="link" onclick="renderTab(\'info\',' + id + ')">← 返回详情</a></div></div>';
}

// 历史照片区（T14）：大图 Tab 异步拉取缩略图；点击切主图，无历史则隐藏
async function loadImageHistory(id) {
  var box = document.getElementById('detail-img-history');
  if (!box) return;
  var list = [];
  try { list = await api('GET', '/api/samples/' + id + '/images'); } catch (err) { return; }
  box = document.getElementById('detail-img-history');
  if (!box) return; // 响应到达时 Tab 已切换，丢弃过期渲染
  if (!list || !list.length) return;
  var KIND_CN = { produce: '制作', inspect: '复检' };
  var h = '<div class="label" style="margin-bottom:6px">历史照片</div><div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
  list.forEach(function (it) {
    var tip = (KIND_CN[it.kind] || it.kind) + (it.ts ? ' ' + it.ts : '');
    h += '<img src="' + e(it.url) + '" title="' + e(tip) + '" alt="' + e(tip) + '"' +
      ' style="width:72px;height:72px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #ddd"' +
      ' onclick="switchMainImage(\'' + e(it.url) + '\')"/>';
  });
  box.innerHTML = h + '</div>';
  box.style.display = '';
}

// 历史缩略图点击：有主图则切换，无主图则直接全屏查看
function switchMainImage(url) {
  var m = document.getElementById('detail-main-img');
  if (m) m.src = url;
  else showImageView(url);
}

function showImageView(src) {
  var o = document.createElement('div');
  o.className = 'img-overlay';
  o.innerHTML = '<img src="' + e(src) + '" onclick="event.stopPropagation()" alt="样品图片"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:28px;cursor:pointer" onclick="this.parentElement.remove()">×</span>';
  o.onclick = function() { o.remove(); };
  document.body.appendChild(o);
}

function printCard(id) { window.open('/api/samples/' + id + '/card/print' + getPrintSizeQuery(), '_blank'); }
