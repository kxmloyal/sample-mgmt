// fixture-detail.js — 治具详情弹窗（Tab 切换：概览/日志/附件）
var _fixDetail = null, _fixLogs = null, _fixFiles = null, _fixModalOpen = false, _fixId = null;

async function showFixtureDetail(id) {
  _fixId = id; _fixModalOpen = false;
  try {
    var _a = await Promise.all([
      api('GET', '/api/fixtures/' + id),
      api('GET', '/api/fixtures/' + id + '/logs').catch(function(){ return []; }),
      fetchFixtureFiles(id).catch(function(){ return []; })
    ]);
    _fixDetail = _a[0]; _fixLogs = _a[1]; _fixFiles = _a[2];
    renderFixTab('overview');
  } catch (e) { showToast(e.message); }
}

function renderFixTab(tab) {
  var f = _fixDetail; if (!f) return;
  var tabs = [
    { key: 'overview', label: '概览' },
    { key: 'logs', label: '操作日志' + (_fixLogs.length ? ' (' + _fixLogs.length + ')' : '') },
    { key: 'files', label: '附件' + (_fixFiles.length ? ' (' + _fixFiles.length + ')' : '') }
  ];

  var tbar = '<div class="detail-tabs">' +
    tabs.map(function(t) {
      return '<span class="detail-tab' + (tab === t.key ? ' active' : '') + '" onclick="renderFixTab(\'' + t.key + '\')">' + t.label + '</span>';
    }).join('') + '</div>';

  var content;
  if (tab === 'overview') content = buildOverview(f);
  else if (tab === 'logs') content = buildLogsTab();
  else content = buildFilesTab();

  if (!_fixModalOpen) {
    var head = '<div style="display:flex;justify-content:space-between;align-items:center;width:100%"><b style="font-size:16px">' + fixtureNoVersion(f) + '</b> ' + statusBadge(f) + '</div>';
    var foot = _buildActions(f) + '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>';
    openModal('', tbar + content, { head: head, foot: foot });
    _fixModalOpen = true;
  } else {
    var mb = document.querySelector('.modal-mask .modal-body');
    if (!mb) { _fixModalOpen = false; renderFixTab(tab); return; }
    mb.innerHTML = tbar + content;
  }
}

// ═══ 概览 Tab（Card Grid 布局 — CSS Grid auto-fill 自适应 1~3 列） ═══
function buildOverview(f) {
  var cards = [];
  cards.push(_cardInfo(f));
  var people = _cardPeople(f);
  if (people) cards.push(people);
  var note = _cardNote(f);
  if (note) cards.push(note);
  var timeline = _cardTimeline(f);
  if (timeline) cards.push(timeline);
  cards.push(_cardSummary());

  var body = '<div class="overview-cards">' + cards.join('') + '</div>';
  requestAnimationFrame(function() { renderMiniLogs(); renderMiniFiles(); });
  return body;
}

function _cardInfo(f) {
  var html = '<div class="overview-card"><div class="title">' + _icon('info') + ' 基础信息</div><div class="field-grid">';
  html += kv('名称', e(f.name)) + kv('规格', e(f.spec)) + kv('型号', e(f.model));
  html += kv('工站', e(f.station)) + kv('分类', e(f.category)) + kv('申请部门', e(f.requested_dept));
  if (f.request_note) html += kv('申请说明', e(f.request_note));
  if (f.storage_location) html += kv('存放位置', e(f.storage_location));
  if (f.maintenance_cycle_days > 0) {
    html += kv('保养周期', f.maintenance_cycle_days + ' 天');
    html += kv('上次保养', fmt(f.last_maintenance_at));
    var nextDate = f.next_maintenance_at ? new Date(f.next_maintenance_at) : null;
    var now = new Date();
    var nextOverdue = nextDate && nextDate <= now;
    var nextOverdueDays = nextOverdue ? Math.ceil((now - nextDate) / 86400000) : 0;
    var nextHtml = nextOverdue ? '<span style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + ' · 已逾期' + nextOverdueDays + '天</span>' : fmt(f.next_maintenance_at);
    html += '<span class="label">下次保养</span><span>' + nextHtml + '</span>';
  }
  if (f.retired_reason) html += '<span class="label" style="color:var(--bad)">报废原因</span><span style="color:var(--bad)">' + e(f.retired_reason) + '</span>';
  return html + '</div></div>';
}

function _cardPeople(f) {
  var pf = '';
  if (f.made_by) pf += kv('制作', (e(f.made_by_name||'') || 'ID:' + f.made_by) + ' · ' + fmt(f.made_at));
  if (f.verified_rd) pf += kv('RD验证', (e(f.verified_rd_name||'') || 'ID:' + f.verified_rd) + ' · ' + fmt(f.verified_rd_at));
  if (f.verified_me) pf += kv('申请单位验证', (e(f.verified_me_name||'') || 'ID:' + f.verified_me) + ' · ' + fmt(f.verified_me_at));
  if (f.used_by) pf += kv('领用', (e(f.used_by_name||'') || 'ID:' + f.used_by) + ' · ' + fmt(f.used_at) + ' · ' + e(f.use_location||''));
  if (f.expected_return_days) pf += kv('使用天数', f.expected_return_days + '天 · 预计' + fmt(f.expected_return_at));
  if (f.improved_by) pf += kv('改善', (e(f.improved_by_name||'') || 'ID:' + f.improved_by) + ' · 版次V' + f.improvement_count);
  if (f.repaired_by) pf += kv('维修', (e(f.repaired_by_name||'') || 'ID:' + f.repaired_by) + ' · ' + fmt(f.repaired_at));
  if (f.retired_by) pf += '<span class="label" style="color:var(--bad)">报废</span><span style="color:var(--bad)">' + (e(f.retired_by_name||'') || 'ID:' + f.retired_by) + ' · ' + fmt(f.retired_at) + '</span>';
  if (!pf) return '';
  return '<div class="overview-card"><div class="title">' + _icon('people') + ' 人员与时间</div><div class="field-grid">' + pf + '</div></div>';
}

function _cardNote(f) {
  if (!f.improve_note && !f.repair_note) return '';
  var rp = '';
  if (f.improve_note) rp += kv('改善说明', e(f.improve_note));
  if (f.repair_type) rp += kv('维修类型', f.repair_type === 'RD' ? '退回RD维修' : 'ME自行维修');
  if (f.repair_note) rp += kv('维修说明', e(f.repair_note));
  return '<div class="overview-card"><div class="title">' + _icon('repair') + ' 改善/维修</div><div class="field-grid">' + rp + '</div></div>';
}

function _cardTimeline(f) {
  var tl = buildTimeline(f);
  if (!tl.length) return '';
  return '<div class="overview-card"><div class="title">' + _icon('progress') + ' 流转进度</div><div class="progress-timeline">' + tl.join('') + '</div></div>';
}

function _cardSummary() {
  return '<div class="overview-card"><div class="title">' + _icon('file') + ' 附件</div><div id="fix-detail-files-mini" style="font-size:12px;color:var(--muted);min-height:20px"></div></div>' +
    '<div class="overview-card"><div class="title">' + _icon('log') + ' 操作日志</div><div id="fix-detail-logs-mini" style="font-size:12px;min-height:20px"></div></div>';
}

// ═══ 日志 Tab ═══
function buildLogsTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixLogs.length) { html += '<div class="empty" style="padding:24px">暂无操作日志</div>'; return html + '</div>'; }
  html += '<div class="detail-logs-wrap"><table style="font-size:12px"><thead><tr><th>时间</th><th>操作</th><th>部门</th><th>备注</th></tr></thead><tbody>' +
    _fixLogs.map(function(l) {
      return '<tr><td class="muted">' + fmt(l.created_at) + '</td><td>' + (ACTION_CN[l.action] || l.action) + '</td><td class="muted">' + e(l.dept || '—') + '</td><td class="muted">' + e(l.note || '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  return html + '</div>';
}

// ═══ 附件 Tab（按分类分组） ═══
var FILE_GROUP_LABELS = {
  'design_drawing': '设计图纸',
  'fixture_photo': '实物照片',
  'maintenance_photo': '保养照片',
  'site_photo': '现场照片',
  'purchase_order': '请购单',
  'other': '其他附件'
};

function buildFilesTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixFiles.length) { html += '<div class="empty" style="padding:24px">暂无附件</div>'; return html + '</div>'; }

  var groups = {};
  _fixFiles.forEach(function(file) {
    var cat = file.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(file);
  });

  var order = ['design_drawing', 'fixture_photo', 'maintenance_photo', 'site_photo', 'purchase_order', 'other'];
  order.forEach(function(cat) {
    var files = groups[cat];
    if (!files || !files.length) return;
    html += '<div class="file-group-header">' + (FILE_GROUP_LABELS[cat] || cat) + ' (' + files.length + ')</div>';
    html += files.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  });

  return html + '</div>';
}

// ═══ 概览摘要填充 ═══
function renderMiniLogs() {
  var el = document.getElementById('fix-detail-logs-mini'); if (!el) return;
  if (!_fixLogs.length) { el.innerHTML = '<span class="muted">暂无日志</span>'; return; }
  var r = _fixLogs.slice(0, 2);
  el.innerHTML = '<div class="log-list">' + r.map(function(l) { return '<div style="font-size:12px"><span class="muted">' + fmt(l.created_at) + '</span> ' + (ACTION_CN[l.action] || l.action) + ' <span class="muted">' + (l.dept || '') + '</span></div>'; }).join('') + '</div>';
  if (_fixLogs.length > 2) el.innerHTML += '<div style="margin-top:4px"><a class="link" style="font-size:12px" onclick="renderFixTab(\'logs\')">查看全部 ' + _fixLogs.length + ' 条 →</a></div>';
}

function renderMiniFiles() {
  var el = document.getElementById('fix-detail-files-mini'); if (!el) return;
  if (!_fixFiles.length) { el.innerHTML = '<span class="muted">暂无附件</span>'; return; }
  var r = _fixFiles.slice(0, 2);
  el.innerHTML = r.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  if (_fixFiles.length > 2) el.innerHTML += '<div style="margin-top:4px;font-size:12px"><a class="link" onclick="renderFixTab(\'files\')">查看全部 ' + _fixFiles.length + ' 个 →</a></div>';
}

// ═══ 操作按钮（根据状态动态生成,先关弹窗再跳转） ═══
var ACT_PRE = 'closeModal(this.closest(\'.modal-mask\'));';
function _buildActions(f) {
  var btns = '';
  var s = f.status;
  if (s !== 'RETIRED') btns += '<fluent-button appearance="accent" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">扫码操作</fluent-button>';
  if (s === 'TRANSFERRED') btns += '<fluent-button appearance="neutral" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">领用</fluent-button>';
  if (s === 'IN_USE') {
    btns += '<fluent-button appearance="neutral" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">归还</fluent-button>';
    btns += '<fluent-button appearance="neutral" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">报修</fluent-button>';
  }
  return btns;
}

// ═══ 共享工具 ═══
function kv(label, val) { return '<span class="label">' + label + '</span><span>' + (val || '—') + '</span>'; }

/** 图标占位（CSS 类 + data 属性，后续可替换为 SVG） */
function _icon(type) {
  var map = { info: '\u2139', people: '\u263A', repair: '\u2692', progress: '\u21BB', file: '\u2630', log: '\u2630' };
  return '<span style="margin-right:2px">' + (map[type] || '') + '</span>';
}

function buildTimeline(f) {
  var s = [];
  if (f.expected_finish_at) s.push(['RD接收·预计' + fmt(f.expected_finish_at), true]);
  else if (f.status === 'ACCEPTED' || f.made_at || f.verified_rd_at) s.push(['RD接收', true]);
  if (f.made_at) s.push(['制作完成', true]);
  if (f.verified_rd_at) s.push(['RD验证', true]);
  if (f.verified_me_at) s.push(['申请单位验证', true]);
  if (f.used_at) s.push(['领用中', f.status === 'IN_USE']);
  if (f.improved_at) s.push(['改善·V' + f.improvement_count, true]);
  if (f.status === 'IMPROVING') s.push(['改善中', true]);
  if (f.repaired_at) s.push(['维修完成', true]);
  if (f.retired_at) s.push(['已报废', true]);
  return s.map(function(x) { return '<div class="progress-step ' + (x[1] ? 'done' : 'pending') + '"><span class="dot"></span>' + x[0] + '</div>'; });
}
