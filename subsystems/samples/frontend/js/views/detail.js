// detail.js — 样品详情弹窗（信息/标示卡/日志/大图 四Tab）
// 重构: CSS Grid 卡片布局 + Tab 内联渲染，架构与 fixture-detail.js 对齐
var _detailSample = null;
var _detailTab = 'info';
var _detailReqSeq = 0;

async function viewDetail(id) {
  var seq = ++_detailReqSeq;
  var s = await api('GET', '/api/samples/' + id);
  if (seq !== _detailReqSeq) return; // 已有更新的详情请求，丢弃过期响应（防竞态）
  _detailSample = s;
  _detailTab = 'info';
  var head = '<b>' + e(s.sample_no) + '</b>' + statusBadge(s);
  var foot = '<a class="link" style="margin-right:14px;cursor:pointer" onclick="downloadQR(' + id + ')">下载二维码</a>' +
    '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>';
  // 内容 + Tab 栏都是 body 的一部分
  openModal('', _buildTabContent(s, id, 'info') + _buildTabsHTML(s, id, 'info'), { head: head, foot: foot });
}

function renderTab(tab, id) {
  var s = (_detailSample && _detailSample.id === id) ? _detailSample : null;
  if (!s) return;
  _detailTab = tab;
  var body = document.querySelector('.modal-body');
  if (!body) return;
  body.innerHTML = _buildTabContent(s, id, tab) + _buildTabsHTML(s, id, tab);
  // innerHTML 注入的 selected 属性在 FAST 下不生效，需显式回显下拉值
  if (tab === 'card') applyDetailCardValues(s);
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
  var h = '<div class="detail-tabs">';
  h += '<div class="detail-tab' + (activeTab === 'info' ? ' active' : '') + '" onclick="' + on + 'info\',' + id + ')">信息</div>';
  if (hasCrd) h += '<div class="detail-tab' + (activeTab === 'card' ? ' active' : '') + '" onclick="' + on + 'card\',' + id + ')">标示卡</div>';
  if (hasLog) h += '<div class="detail-tab' + (activeTab === 'logs' ? ' active' : '') + '" onclick="' + on + 'logs\',' + id + ')">全量日志 (' + s.logs.length + ')</div>';
  if (hasImg) h += '<div class="detail-tab' + (activeTab === 'image' ? ' active' : '') + '" onclick="' + on + 'image\',' + id + ')">大图</div>';
  h += '</div>';
  return h;
}

// ═══ 辅助：label/value ═══
function kv(label, val) { return '<span class="label">' + label + '</span><span>' + (val || '—') + '</span>'; }

// ═══ 概览 Tab（CSS Grid 卡片布局，与治具详情统一） ═══
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

// 历史照片区（T14 全量留痕）：进入大图 Tab 后异步拉取该样品全部制作/复检照片缩略图；
// 点击缩略图切换主图（点主图可全屏）；无历史时该区保持隐藏
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

// 历史缩略图点击：有主图则切换主图，无主图（样品无当前图）则直接全屏查看
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

// 标示卡 Tab 下拉回显（innerHTML 注入 selected 属性在 FAST upgrade 时序下失效，须显式设置 value）
function applyDetailCardValues(s){
  var el;
  el=document.getElementById('cd-type');if(el)el.value=s.sample_type||'';
  el=document.getElementById('cd-limit-item');if(el)el.value=s.limit_item||'';
  el=document.getElementById('cd-source');if(el)el.value=s.source_type||'';
}

// ═══ 标示卡 Tab（8字段编辑表单） ═══
function _buildCardTab(s, id) {
  var locked = ['RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'].indexOf(s.status) !== -1;
  var dis = locked ? ' disabled' : '';
  var to = '<fluent-option value="">不适用</fluent-option><fluent-option value="OK"' + (s.sample_type === 'OK' ? ' selected' : '') + '>OK样品</fluent-option><fluent-option value="NG"' + (s.sample_type === 'NG' ? ' selected' : '') + '>NG样品</fluent-option>';
  var lo = '<fluent-option value="">不适用</fluent-option>' + (typeof LIMIT_ITEMS !== 'undefined' ? LIMIT_ITEMS : []).map(function(x) { return '<fluent-option value="' + x.code + '"' + (s.limit_item === x.code ? ' selected' : '') + '>' + x.label + '</fluent-option>'; }).join('');
  var so = '<fluent-option value="">不适用</fluent-option><fluent-option value="C"' + (s.source_type === 'C' ? ' selected' : '') + '>客供(C)</fluent-option><fluent-option value="T"' + (s.source_type === 'T' ? ' selected' : '') + '>元山(T)</fluent-option><fluent-option value="G"' + (s.source_type === 'G' ? ' selected' : '') + '>塔岗(G)</fluent-option>';
  // 【口径】有效期/复检日一律按 UTC 日期（YYYY-MM-DD）显示，前后端三处一致（card-print-html.js / card-page.js / 本文件，toISOString 即 UTC）
  var exp = s.next_inspect_at ? new Date(s.next_inspect_at).toISOString().slice(0, 10) : '—';

  var h = '<div class="card" style="max-width:720px;margin:0 auto;overflow:hidden;padding:14px">';
  if (locked) h += '<div class="card-lock-banner">标示卡已锁定（样品已发行），仅可查看和打印</div>';
  h += '<div class="card-grid">' +
    '<div><label>样品类型</label><fluent-select id="cd-type"' + dis + '>' + to + '</fluent-select></div>' +
    '<div><label>限度项目</label><fluent-select id="cd-limit-item"' + dis + '>' + lo + '</fluent-select></div>' +
    '<div><label>来源</label><fluent-select id="cd-source"' + dis + '>' + so + '</fluent-select></div>' +
    '<div><label>有效期</label><span style="font-size:13px;color:#333">' + exp + '</span><span class="muted" style="font-size:11px"> (=复检日，自动同步)</span></div>' +
    '<div><label>版次</label><fluent-text-field id="cd-card-version" value="' + e(s.card_version || '') + '" placeholder="如 01"' + dis + '></fluent-text-field></div>' +
    '<div><label>制作</label><fluent-text-field id="cd-signed-rnd" value="' + e(s.signed_by_rd || '') + '"' + dis + '></fluent-text-field></div>' +
    '<div><label>确认</label><fluent-text-field id="cd-signed-qa" value="' + e(s.signed_by_qa || '') + '"' + dis + '></fluent-text-field></div>' +
    '<div class="full-row"><label>样品数值</label><textarea id="cd-test-data" rows="1" style="resize:none;min-height:32px"' + dis + '>' + e(s.test_data || '') + '</textarea></div>' +
    '<div class="full-row"><label>标准范围</label><textarea id="cd-test-standard" rows="2" style="resize:none;min-height:40px"' + dis + '>' + e(s.test_standard || '') + '</textarea></div>' +
    '</div>' +
    '<div style="margin-top:12px;display:flex;gap:8px">' +
    (locked ? '' : '<fluent-button appearance="accent" id="cd-save-btn" onclick="saveCard(' + id + ')">保存标示卡</fluent-button>') +
    '<fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'));printCard(' + id + ')">打印标示卡</fluent-button>' +
    '</div>' +
    '<div id="cd-msg" class="muted" style="margin-top:8px"></div></div>';
  return h;
}

async function saveCard(id) {
  await withSubmitLock(document.getElementById('cd-save-btn'), async function() {
    var msg = document.getElementById('cd-msg');
    if (msg) msg.textContent = '保存中...';
    try {
      var p = { sample_type: $('#cd-type').value, limit_item: $('#cd-limit-item').value, source_type: $('#cd-source').value, card_version: $('#cd-card-version').value, test_data: $('#cd-test-data').value, test_standard: $('#cd-test-standard').value, signed_by_rd: $('#cd-signed-rnd').value, signed_by_qa: $('#cd-signed-qa').value,
        // T6: 携带 CAS 版本号（T5 后端已支持）；undefined 时 JSON 序列化自动省略，行为同旧客户端
        version: (_detailSample && typeof _detailSample.version === 'number') ? _detailSample.version : undefined };
      await api('PUT', '/api/samples/' + id, p);
      // 保存成功后刷新缓存的样品对象（修复 _detailSample 缓存不刷新问题，同时更新 version）
      try { _detailSample = await api('GET', '/api/samples/' + id); } catch (_) {}
      toast('标示卡已保存', 'ok');
      if (msg && msg.isConnected) msg.textContent = '保存成功';
    } catch (e) {
      // 409 冲突：api 层已统一 toast 并触发 reloadDetail 重新加载详情，此处不再重复提示
      if (e && e.status === 409) return;
      if (msg && msg.isConnected) msg.textContent = e.message;
    }
  });
}

// T6: 原地刷新详情弹窗内容（409 冲突回调用，不重开弹窗避免遮罩层堆叠）
async function reloadDetail(id) {
  try {
    var s = await api('GET', '/api/samples/' + id);
    _detailSample = s;
    var body = document.querySelector('.modal-body');
    if (!body) return;
    body.innerHTML = _buildTabContent(s, id, _detailTab) + _buildTabsHTML(s, id, _detailTab);
    if (_detailTab === 'card') applyDetailCardValues(s);
  } catch (_) {}
}
// T6: 409 冲突时自动刷新详情（注册到 api.js 的统一冲突回调）
onConflictRefresh(function() {
  if (_detailSample && document.querySelector('.modal-mask')) reloadDetail(_detailSample.id);
});

function printCard(id) { window.open('/api/samples/' + id + '/card/print' + getPrintSizeQuery(), '_blank'); }
