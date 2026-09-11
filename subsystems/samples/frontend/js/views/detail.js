// detail.js — 样品详情弹窗（信息/标示卡/日志/大图 四Tab）
// 重构: CSS Grid 卡片布局 + Tab 内联渲染，架构与 fixture-detail.js 对齐
// D1: 骨架屏/Tab置顶(detail-tabs-top)/头部操作组/锁定引导/dirty拦截/密度类
// 2026-09-11 DM-3：交互骨架（骨架屏/置顶Tab/密度自适应/dirty守卫/Tab 懒渲染）改为复用
//   shared/frontend/detail-modal.js 的 openDetailModal；本文件只保留业务渲染与回调。
//   约束：bundle 顺序必须让 shared/frontend/detail-modal.js 排在 detail.js 之前（tools/bundle-sources.json）。
var _detailSample = null;   // 当前弹窗的样品对象（标示卡保存/409 刷新/图片历史共用，detail-card.js 亦读取）
var _detailId = null;       // 当前弹窗的样品 id（生成 HTML 里的 onclick 回调需要）

var _sdm = openDetailModal({
  id: 'sample-detail',
  fetchData: async function (id) {
    var s = await api('GET', '/api/samples/' + id);
    _detailSample = s;
    return s;
  },
  // D1.3 头部：编号 + 徽章 + 操作组（标示卡/标签/二维码/扫码操作）
  buildHead: function (s) { return _buildHeadHTML(s, _detailId); },
  tabs: function (s) { return _detailTabs(s); },
  // D1.6 密度类：info→d-high / card→d-mid / logs·image→d-low（宽度样式在 app.css，D2 进 module.css）
  density: function (key) { return key === 'info' ? 'd-high' : key === 'card' ? 'd-mid' : 'd-low'; },
  buildTabContent: function (s, key) { return _buildTabContent(s, _detailId, key); },
  // D2.2 Tab 懒渲染：logs/image 先骨架一帧，下一帧再构建实际 DOM（先给视觉反馈）
  skeleton: function (key) { return _buildTabSkeleton(key); },
  lazyTabs: ['logs', 'image'],
  onTabRendered: function (key, s) {
    _detailDirty = false;                                  // D1.5 离开/重渲标示卡后重置未保存态
    if (key === 'card') applyDetailCardValues(s);          // 显式回显下拉值（selected 属性在 FAST 下不生效）
    else if (key === 'image') loadImageHistory(_detailId); // T14 大图 Tab 异步拉取历史照片
  },
  isDirty: function () { return _detailDirty; },           // 未保存态由标示卡表单托管（detail-card.js）
  // D1.5 未保存拦截文案（原文案保持，含「标示卡」限定词）
  dirtyMsg: { switch: '标示卡有未保存的修改，切换将丢失，继续？', close: '标示卡有未保存的修改，确定离开？' },
  footer: function () { return '<fluent-button appearance="neutral" size="small" onclick="_sdm.close()">关闭</fluent-button>'; },
  toast: function (m, t) { toast(m, t); },
  onClosed: function () { _detailDirty = false; }
});

// 详情入口（列表/看板/柜位视图/机型视图等多处 onclick 调用，签名保持 viewDetail(id)）
async function viewDetail(id) {
  _detailId = id;
  _detailDirty = false;
  _sdm.open(id);
}

// 生成 HTML 内的 Tab 跳转入口（概览卡片图 / 「查看全部 N 条」/「← 返回详情」的 onclick 仍指向本函数）：
// 转交共享组件切换，dirty 守卫与懒渲染由组件统一处理（id 参数保留兼容调用点）
function renderTab(tab, id) { _sdm.switchTab(tab); }

// D1.3 头部：编号 + 徽章 + 操作组
// 2026-09-09 方案A：追加「扫码操作」——关弹窗后跳扫码台深链 #/scan?no=编号（viewScan 已支持自动填码
// 触发 doScan 出动作表单），动作表单单一事实来源仍是扫码台，无双入口漂移；跳前先清标示卡未保存态
function goScanFromDetail(id) {
  var s = (_detailSample && _detailSample.id === id) ? _detailSample : null;
  if (!s || !s.sample_no) { toast('样品数据未就绪', 'err'); return; }
  _detailDirty = false;
  // 评审 P2 修复：querySelector 只取第一个（叠层时=底层清单窗，详情残留）；
  // 且 hash 跳转不清弹窗（modal 挂 body）→ 跳扫码台前关闭全部弹窗
  var ms = document.querySelectorAll('.modal-mask');
  for (var i = 0; i < ms.length; i++) closeModal(ms[i]);
  location.hash = '#/scan?no=' + encodeURIComponent(s.sample_no);
}
function _buildHeadHTML(s, id) {
  var acts = [['🖨 标示卡', '打印标示卡', 'printCard(' + id + ')'],
    ['🏷 标签', '打印标签', 'window.open(\'/api/samples/' + id + '/label/print\'+getPrintSizeQuery(),\'_blank\')'],
    ['⬇ 二维码', '下载二维码', 'downloadQR(' + id + ')'],
    ['📲 扫码操作', '去扫码台操作该样品（领用/归还/复检等）', 'goScanFromDetail(' + id + ')']];
  return '<b>' + e(s.sample_no) + '</b>' + statusBadge(s) + '<span class="pv-actions">' +
    acts.map(function(a) { return '<button class="pv-icon-btn" title="' + a[1] + '" onclick="' + a[2] + '">' + a[0] + '</button>'; }).join('') + '</span>';
}

// D2.2 懒渲染骨架占位块（logs 时间线条 / image 图块）；自带内边距，共享组件不再包 .dm-pad
function _buildTabSkeleton(tab) {
  if (tab === 'logs') {
    var row = '<div style="display:flex;gap:10px;margin-bottom:14px"><div class="sk" style="width:10px;height:10px;border-radius:50%;flex:none;margin-top:4px"></div><div style="flex:1"><div class="sk" style="height:13px;width:36%;margin-bottom:6px"></div><div class="sk" style="height:11px;width:64%"></div></div></div>';
    return '<div style="padding:14px 16px">' + row.repeat(5) + '</div>';
  }
  return '<div style="padding:16px"><div class="sk" style="height:240px;max-width:420px;margin:0 auto 12px"></div><div class="sk" style="height:14px;width:44%;margin:0 auto"></div></div>';
}

/** 构建 Tab 页面内容（不含 tab 栏，也不含 .dm-pad 外层——由共享组件统一包裹） */
function _buildTabContent(s, id, tab) {
  var t = tab || 'info'; // 无可用 Tab 时组件传 null，等价于信息 Tab（与原实现一致）
  var html = '';
  if (t === 'info') html = _buildOverview(s, id);
  else if (t === 'logs') html = _buildLogsTab(s, id);
  else if (t === 'card') html = _buildCardTab(s, id);
  else if (t === 'image') html = _buildImageTab(s, id);
  return html;
}

// Tab 清单（沿用原自建 Tab 栏的判定口径：信息/标示卡/全量日志/大图；三者皆无 → 无 Tab 栏，只显示信息页）
function _detailTabs(s) {
  var hasImg = !!(s.produced_image || s.image || s.inspect_image);
  var hasLog = s.logs && s.logs.length > 0;
  var hasCrd = !!(s.sample_type || s.limit_item || s.source_type || s.card_version || s.test_data || s.test_standard);
  if (!hasImg && !hasLog && !hasCrd) return [];
  var ts = [{ key: 'info', label: '信息' }];
  if (hasCrd) ts.push({ key: 'card', label: '标示卡' });
  if (hasLog) ts.push({ key: 'logs', label: '全量日志 (' + s.logs.length + ')' });
  if (hasImg) ts.push({ key: 'image', label: '大图' });
  return ts;
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
  // 领用/归还（2026-09-05）：领用中展示领用人/部门/应还时间（超时红色高亮），非领用态展示最近归还时间
  if (s.status === 'CHECKED_OUT') {
    var coLate = s.expected_return_at && new Date(s.expected_return_at).getTime() < Date.now();
    h += '<span class="label">领用</span><span class="' + (coLate ? 'b-overdue' : '') + '" style="font-weight:600">' + e(s.checkout_user || '—') + '（' + e(s.checkout_dept || '—') + '）· 应还 ' + fmt(s.expected_return_at) + (coLate ? '（已超时）' : '') + '</span>';
  } else if (s.returned_at) {
    h += kv('最近归还', fmt(s.returned_at));
  }
  var ov = overdue(s);
  h += '<span class="label">复检</span><span class="' + (ov ? 'b-overdue' : '') + '" style="font-weight:600">' + (s.release_cycle_days ? s.release_cycle_days + '天' : '—') + ' / ' + fmt(s.next_inspect_at) + '</span>';
  h += kv('备注', e(s.notes));
  var img = s.produced_image || s.image;
  if (img) h += '<div style="margin-top:8px;grid-column:1/-1"><img src="' + e(img) + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>';
  return h + '</div></div>';
}

function _cardProgress(s) {
  var steps = [['制作完成', s.produced_at], ['正式发行', s.released_at], ['分发保管', s.status === 'IN_CUSTODY' ? '储位 ' + e(s.storage_location) : null]];
  if (s.status === 'CHECKED_OUT') steps.push(['领用中（' + e(s.checkout_user || '—') + '）', s.expected_return_at]);
  if (s.returned_at) steps.push(['最近归还', s.returned_at]);
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

// ═══ 日志 Tab（D2.1 时间线：最新在上；API 按 id DESC 返回，无需 reverse） ═══
// 流向映射：action → '从状态 ➜ 到状态'；自环类（EDIT_CARD/EDIT_STORAGE/INSPECT*）标注自环
var _LOG_FLOW = {
  CREATE: '—',
  PRODUCE: '⬆ NEW ➜ 制作完成',
  RELEASE: '⬆ 制作完成 ➜ 已发行',
  CUSTODY: '⬆ 已发行 ➜ 保管中',
  CHECKOUT: '⬆ 保管中 ➜ 领用中', RETURN_OUT: '⬆ 领用中 ➜ 保管中',
  INSPECT: '⬆ 已发行（自环）', INSPECT_EARLY: '⬆ 已发行（自环）', INSPECT_CUSTODY: '⬆ 保管中（自环）',
  EDIT_CARD: '⬆ 修正标示卡（自环）', EDIT_STORAGE: '⬆ 修改储位（自环）',
  RETURN_REQUEST: '⬆ 保管中 ➜ 退回审核',
  RE_RELEASE: '⬆ 退回审核 ➜ 已发行',
  RETIRE_RECREATE: '⬆ 退回审核 ➜ 已作废',
  RETURN_REJECT: '⬆ 退回审核 ➜ 保管中',
  RETIRE_ONLY: '⬆ 已作废', RECREATE: '⬆ 已作废', FORCE_RETIRE: '⬆ 已作废',
  FORCE_REASSIGN: '⬆ 退回审核（改派）'
};

function _buildLogsTab(s, id) {
  var logs = s.logs || [];
  var h = '<div style="padding:12px 14px"><div style="margin-bottom:8px"><a class="link" onclick="renderTab(\'info\',' + id + ')">← 返回详情</a></div><div class="tl">';
  logs.forEach(function(l) {
    var note = (l.note || '').trim();
    var fold = note.length > 40; // 长备注默认折叠 1 行，点击切换展开/收起
    h += '<div class="tl-item">' +
      '<div><span class="tl-act">' + (ACTION_CN[l.action] || l.action) + '</span><span class="tl-flow">' + (_LOG_FLOW[l.action] || '') + '</span></div>' +
      '<div class="tl-meta">' + fmt(l.created_at) + ' · ' + e(l.role || '—') + (l.dept ? '/' + e(l.dept) : '') + (l.location ? ' · ' + e(l.location) : '') + '</div>' +
      (note ? '<div class="tl-note' + (fold ? ' can-fold folded' : '') + '"' + (fold ? ' title="点击展开/收起" onclick="this.classList.toggle(\'folded\')"' : '') + '>' + e(note) + '</div>' : '') +
      '</div>';
  });
  if (!logs.length) h += '<div class="muted">暂无日志</div>';
  return h + '</div></div>';
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
