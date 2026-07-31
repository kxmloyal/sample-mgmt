// fixture-detail.js — 治具详情弹窗（Tab 切换：概览/日志/附件）
var _fixDetail = null, _fixLogs = null, _fixFiles = null, _fixModalOpen = false, _fixId = null;
var FD_GAP = '8px';
var FD_TITLE = 'font-weight:600;font-size:12px;color:var(--muted);margin-bottom:6px';

async function showFixtureDetail(id) {
  _fixId = id; _fixModalOpen = false;
  try {
    // 并行加载三路数据，全部就绪后再渲染
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
    { key: 'logs', label: '操作日志' + (_fixLogs && _fixLogs.length ? ' (' + _fixLogs.length + ')' : '') },
    { key: 'files', label: '附件' + (_fixFiles && _fixFiles.length ? ' (' + _fixFiles.length + ')' : '') }
  ];

  var tbar = '<div class="detail-tabs" style="padding:4px 14px 0">' +
    tabs.map(function(t) {
      return '<span class="detail-tab' + (tab === t.key ? ' active' : '') + '" onclick="renderFixTab(\'' + t.key + '\')">' + t.label + '</span>';
    }).join('') + '</div>';

  if (tab === 'overview') var content = buildOverview(f);
  else if (tab === 'logs') var content = buildLogsTab();
  else var content = buildFilesTab();

  if (!_fixModalOpen) {
    var head = '<div style="display:flex;justify-content:space-between;align-items:center;width:100%"><b style="font-size:16px">' + fixtureNoVersion(f) + '</b> ' + statusBadge(f) + '</div>';
    openModal('', tbar + content, { head: head });
    _fixModalOpen = true;
  } else {
    var mb = document.querySelector('.modal-mask .modal-body');
    if (mb) mb.innerHTML = tbar + content;
  }
}

// ═══ 概览 Tab（Card Flex 流式 — 自适应 1~3 列） ═══
function buildOverview(f) {
  var cards = [], T = '<div style="' + FD_TITLE + '">';
  var S = ' style="flex:1 1 240px"'; // 卡片最小宽度

  // 基础信息
  var info = T + '📋 基础信息</div><div class="field-grid">';
  info += kv('名称', e(f.name)) + kv('规格', e(f.spec)) + kv('型号', e(f.model)) + kv('工站', e(f.station)) + kv('分类', e(f.category)) + kv('申请部门', e(f.requested_dept));
  if (f.request_note) info += kv('申请说明', e(f.request_note));
  // 存放位置 + 保养信息
  if (f.storage_location) info += kv('存放位置', e(f.storage_location));
  if (f.maintenance_cycle_days > 0) {
    info += kv('保养周期', f.maintenance_cycle_days + ' 天');
    info += kv('上次保养', fmt(f.last_maintenance_at));
    var overdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
    var overdueDays = overdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
    var nextHtml = overdue ? '<span style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + ' · 已逾期' + overdueDays + '天</span>' : fmt(f.next_maintenance_at);
    info += '<span class="label">下次保养</span><span>' + nextHtml + '</span>';
  }
  if (f.retired_reason) info += '<span class="label" style="color:var(--bad)">报废原因</span><span style="color:var(--bad)">' + e(f.retired_reason) + '</span>';
  cards.push('<div class="card"' + S + '>' + info + '</div>');

  // 人员与时间
  var pf = '';
  if (f.made_by) pf += kv('制作', (e(f.made_by_name||'') || 'ID:' + f.made_by) + ' · ' + fmt(f.made_at));
  if (f.verified_rd) pf += kv('RD验证', (e(f.verified_rd_name||'') || 'ID:' + f.verified_rd) + ' · ' + fmt(f.verified_rd_at));
  if (f.verified_me) pf += kv('申请单位验证', (e(f.verified_me_name||'') || 'ID:' + f.verified_me) + ' · ' + fmt(f.verified_me_at));
  if (f.used_by) pf += kv('领用', (e(f.used_by_name||'') || 'ID:' + f.used_by) + ' · ' + fmt(f.used_at) + ' · ' + e(f.use_location||''));
  if (f.expected_return_days) pf += kv('使用天数', f.expected_return_days + '天 · 预计' + fmt(f.expected_return_at));
  if (f.improved_by) pf += kv('改善', (e(f.improved_by_name||'') || 'ID:' + f.improved_by) + ' · 版次V' + f.improvement_count);
  if (f.repaired_by) pf += kv('维修', (e(f.repaired_by_name||'') || 'ID:' + f.repaired_by) + ' · ' + fmt(f.repaired_at));
  if (f.retired_by) pf += '<span class="label" style="color:var(--bad)">报废</span><span style="color:var(--bad)">' + (e(f.retired_by_name||'') || 'ID:' + f.retired_by) + ' · ' + fmt(f.retired_at) + '</span>';
  if (pf) cards.push('<div class="card"' + S + '>' + T + '👤 人员与时间</div><div class="field-grid">' + pf + '</div></div>');

  // 改善/维修
  if (f.improve_note || f.repair_note) {
    var rp = '';
    if (f.improve_note) rp += kv('改善说明', e(f.improve_note));
    if (f.repair_type) rp += kv('维修类型', f.repair_type === 'RD' ? '退回RD维修' : 'ME自行维修');
    if (f.repair_note) rp += kv('维修说明', e(f.repair_note));
    cards.push('<div class="card"' + S + '>' + T + '🔧 改善/维修</div><div class="field-grid">' + rp + '</div></div>');
  }

  // 流转进度
  var tl = buildTimeline(f);
  if (tl.length) cards.push('<div class="card"' + S + '>' + T + '🔄 流转进度</div><div class="progress-timeline">' + tl.join('') + '</div></div>');

  // 附件 + 日志摘要
  cards.push('<div class="card"' + S + '>' + T + '📂 附件</div><div id="fix-detail-files-mini" style="font-size:12px;color:var(--muted);min-height:20px"></div></div>');
  cards.push('<div class="card"' + S + '>' + T + '📝 操作日志</div><div id="fix-detail-logs-mini" style="font-size:12px;min-height:20px"></div></div>');

  var body = '<div style="display:flex;flex-wrap:wrap;gap:8px;padding-top:8px">' + cards.join('') + '</div>';
  setTimeout(function() { renderMiniLogs(); renderMiniFiles(); }, 0);
  return body;
}

// ═══ 日志 Tab ═══
function buildLogsTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixLogs || !_fixLogs.length) { html += '<div class="empty" style="padding:24px">暂无操作日志</div>'; return html + '</div>'; }
  html += '<table style="font-size:12px"><tr><th>时间</th><th>操作</th><th>部门</th><th>备注</th></tr>' +
    _fixLogs.map(function(l) {
      return '<tr><td class="muted">' + fmt(l.created_at) + '</td><td>' + (ACTION_CN[l.action] || l.action) + '</td><td class="muted">' + e(l.dept || '—') + '</td><td class="muted">' + e(l.note || '—') + '</td></tr>';
    }).join('') + '</table>';
  return html + '</div>';
}

// ═══ 附件 Tab（按分类分组） ═══
var FILE_GROUP_LABELS = {
  'design_drawing': '📐 设计图纸',
  'fixture_photo': '📸 实物照片',
  'maintenance_photo': '🔧 保养照片',
  'site_photo': '🏭 现场照片',
  'purchase_order': '📋 请购单',
  'other': '📄 其他附件'
};

function buildFilesTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixFiles || !_fixFiles.length) { html += '<div class="empty" style="padding:24px">暂无附件</div>'; return html + '</div>'; }

  // 按 category 分组
  var groups = {};
  _fixFiles.forEach(function(file) {
    var cat = file.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(file);
  });

  // 按固定顺序渲染
  var order = ['design_drawing', 'fixture_photo', 'maintenance_photo', 'site_photo', 'purchase_order', 'other'];
  order.forEach(function(cat) {
    var files = groups[cat];
    if (!files || !files.length) return;
    html += '<div style="font-weight:600;font-size:12px;color:var(--muted);padding:8px 0 4px;border-bottom:1px solid var(--line)">' + (FILE_GROUP_LABELS[cat] || cat) + ' (' + files.length + ')</div>';
    html += files.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  });

  return html + '</div>';
}

// ═══ 概览摘要填充 ═══
function renderMiniLogs() {
  var el = document.getElementById('fix-detail-logs-mini'); if (!el) return;
  if (!_fixLogs || !_fixLogs.length) { el.innerHTML = '<span class="muted">暂无日志</span>'; return; }
  var r = _fixLogs.slice(0, 2);
  el.innerHTML = '<div class="log-list">' + r.map(function(l) { return '<div style="font-size:12px"><span class="muted">' + fmt(l.created_at) + '</span> ' + (ACTION_CN[l.action] || l.action) + ' <span class="muted">' + (l.dept || '') + '</span></div>'; }).join('') + '</div>';
  if (_fixLogs.length > 2) el.innerHTML += '<div style="margin-top:4px"><a class="link" style="font-size:12px" onclick="renderFixTab(\'logs\')">查看全部 ' + _fixLogs.length + ' 条 →</a></div>';
}

function renderMiniFiles() {
  var el = document.getElementById('fix-detail-files-mini'); if (!el) return;
  if (!_fixFiles || !_fixFiles.length) { el.innerHTML = '<span class="muted">暂无附件</span>'; return; }
  var r = _fixFiles.slice(0, 2);
  el.innerHTML = r.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  if (_fixFiles.length > 2) el.innerHTML += '<div style="margin-top:4px;font-size:12px"><a class="link" onclick="renderFixTab(\'files\')">查看全部 ' + _fixFiles.length + ' 个 →</a></div>';
}

// ═══ 共享工具 ═══
function kv(label, val) { return '<span class="label">' + label + '</span><span>' + (val || '—') + '</span>'; }

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
