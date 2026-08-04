// subsystems/workbench/frontend/js/views/wb-detail.js
// 工作台下钻：点击表格行 → 弹窗展示基本信息 + 完整流转日志时间线
// 依赖：openModal/closeModal（modal.js）、api()（api-base.js）、ACTION_CN、e()
// 详情数据来自子系统既有接口：样品 /api/samples/:id（含 logs）、治具 /api/fixtures/:id + /api/fixtures/:id/logs

// 日志折叠状态（默认显示最近 6 条，超出折叠）
var _wbTlExpanded = false;
var _wbTlMax = 6;
var _wbTlAllLogs = [];

// 各类型关键时间点字段（按存在性展示）
var _KEY_DATES = {
  sample: [
    { k: 'created_at', l: '创建时间' },
    { k: 'released_at', l: '发行时间' },
    { k: 'next_inspect_at', l: '下次复检' },
    { k: 'updated_at', l: '最后更新' }
  ],
  fixture: [
    { k: 'created_at', l: '创建时间' },
    { k: 'expected_finish_at', l: '预计完成' },
    { k: 'transferred_at', l: '移交时间' },
    { k: 'used_at', l: '领用时间' },
    { k: 'next_maintenance_at', l: '下次保养' },
    { k: 'repair_requested_at', l: '报修时间' }
  ]
};

// 入口：按类型分派详情 API，成功后渲染弹窗
async function openWbDetail(item) {
  if (!item || !item.id) {
    return openModal('详细信息', '<div style="padding:20px;color:var(--bad)">数据版本过旧，缺少 id，请刷新页面后重试</div>');
  }
  try {
    var detail, logs;
    if (item.item_type === 'sample') {
      detail = await api('GET', '/api/samples/' + item.id);
      logs = detail.logs || [];
      delete detail.logs; // 与治具结构对齐，统一传 logs 参数
    } else {
      detail = await api('GET', '/api/fixtures/' + item.id);
      logs = await api('GET', '/api/fixtures/' + item.id + '/logs');
    }
    _renderWbDetail(detail, logs, item);
  } catch (err) {
    openModal('详细信息', '<div style="padding:20px">' +
      '<div style="color:var(--bad);margin-bottom:12px">加载失败：' + e(err.message) + '</div>' +
      '<fluent-button appearance="accent" size="small" onclick="closeModal(this.closest(\'.modal-mask\'));openWbDetail(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')">重试</fluent-button>' +
      '</div>');
  }
}

// 自适应窗口宽（信息密度驱动）：960~1280px
function _wbWidth(fieldCount, logCount) {
  var w = 960 + fieldCount * 24 + Math.min(logCount, 20) * 3;
  return Math.min(1280, Math.max(960, w));
}

// 左栏（基本信息）占比：随字段数 34%~50%
function _wbLeftPct(fieldCount) {
  return Math.min(50, Math.max(34, 34 + fieldCount * 2));
}

// 统计实际渲染的基本信息字段数（用于宽度自适应）
function _countWbFields(detail, item) {
  var n = 0;
  if (detail.sample_no || detail.fixture_no || item.item_no) n++;
  if (detail.name) n++;
  n += 2; // 类型 + 阶段（恒有值）
  if (detail.spec) n++;
  if (detail.model) n++;
  if (item.resp_dept) n++;
  if (item.apply_dept) n++;
  (_KEY_DATES[item.item_type] || []).forEach(function(f) { if (detail[f.k]) n++; });
  return n;
}

// 组装弹窗 HTML：左右分栏（左=基本信息，右=流转日志）+ 内容密度自适应
function _renderWbDetail(detail, logs, item) {
  var typeLabel = item.item_type === 'sample' ? '样品' : '治具';
  var stageLabel = STATUS[detail.status] || detail.status || '-';
  _wbTlAllLogs = logs; // 供折叠/展开切换使用

  var fields = _countWbFields(detail, item);
  var leftHtml = '<div class="wb-detail-info">' +
    _kv('编号', detail.sample_no || detail.fixture_no || item.item_no) +
    _kv('名称', detail.name) +
    _kv('类型', typeLabel) +
    _kv('阶段', stageLabel) +
    _kv('规格', detail.spec) +
    _kv('型号', detail.model) +
    _kv('负责部门', item.resp_dept) +
    _kv('申请部门', item.apply_dept) +
    _keyDates(detail, item.item_type) +
    '</div>';
  var rightHtml = '<h4 class="wb-detail-tl-title">流转日志</h4>' +
    _renderTimeline(logs, item);

  var html = '<div class="wb-detail-split">' +
    '<div class="wb-detail-left">' + leftHtml + '</div>' +
    '<div class="wb-detail-right">' + rightHtml + '</div>' +
    '</div>';

  var foot = '<div style="display:flex;gap:8px">' +
    '<fluent-button appearance="accent" size="small" onclick="' + _openWbScanJs(item) + '">前往处理 →</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>' +
    '</div>';

  var mask = openModal('详细信息 · ' + (detail.sample_no || detail.fixture_no || item.item_no), html, { foot: foot });
  // 自适应：通过 fluent-dialog 的 CSS 变量控制面板尺寸（style.width 进不了 shadow DOM）
  var dlg = mask.querySelector('fluent-dialog');
  var w = _wbWidth(fields, logs.length);
  if (dlg) {
    dlg.setAttribute('data-wb-detail', '1'); // 触发 module.css 专用尺寸覆盖（max-width 1280px）
    dlg.style.setProperty('--dialog-width', 'min(96vw,' + w + 'px)');
    dlg.style.setProperty('--dialog-height', 'min(82vh, 680px)'); // 固定高度，左右栏内部各自滚动
  }
  // 左栏占比随字段数自适应
  var split = mask.querySelector('.wb-detail-split');
  if (split) split.style.gridTemplateColumns = _wbLeftPct(fields) + '% 1fr';
}

// 键值行
function _kv(k, v) {
  if (v === null || v === undefined || v === '') return '';
  return '<div class="wb-detail-kv"><span class="wb-detail-k">' + k + '</span><span class="wb-detail-v">' + e(String(v)) + '</span></div>';
}

// 关键时间点区（按类型字段，存在才显示）
function _keyDates(detail, type) {
  var list = _KEY_DATES[type] || [];
  var html = '';
  list.forEach(function(f) {
    if (detail[f.k]) html += _kv(f.l, String(detail[f.k]).slice(0, 16).replace('T', ' '));
  });
  return html;
}

// 流转日志时间线（两列紧凑布局 + 折叠；按时间倒序，数据已按 id DESC 排序）
function _renderTimeline(logs, item) {
  if (!logs || !logs.length) {
    return '<div class="wb-detail-empty">暂无流转记录</div>';
  }
  var html = '<div class="wb-timeline">' + _buildTimelineRows(logs) + '</div>';
  if (logs.length > _wbTlMax) {
    html += '<div class="wb-tl-more"><button class="btn sm ghost" onclick="toggleWbTimeline()" style="margin:4px 18px 12px">' +
      (_wbTlExpanded ? '收起日志' : '查看全部 ' + logs.length + ' 条') + '</button></div>';
  }
  return html;
}

// 生成时间线行（受折叠状态控制：默认最近 _wbTlMax 条）
function _buildTimelineRows(logs) {
  var shown = _wbTlExpanded ? logs : logs.slice(0, _wbTlMax);
  var html = '';
  shown.forEach(function(l) {
    var action = ACTION_CN[l.action] || l.action || '-';
    var who = l.display_name || l.username || (ROLE[l.role] || l.role || '') + (l.dept ? ' · ' + l.dept : '');
    var time = l.created_at ? String(l.created_at).slice(0, 16).replace('T', ' ') : '';
    var note = l.note ? '<span class="wb-tl-note" title="' + e(l.note) + '">' + e(l.note) + '</span>' : '';
    html += '<div class="wb-tl-item">' +
      '<span class="wb-tl-dot"></span>' +
      '<span class="wb-tl-action">' + e(action) + '</span>' +
      '<span class="wb-tl-who">' + e(who) + '</span>' +
      '<span class="wb-tl-time">' + time + '</span>' +
      note +
      '</div>';
  });
  return html;
}

// 折叠/展开切换（仅重绘时间线区，不重建整个弹窗）
function toggleWbTimeline() {
  _wbTlExpanded = !_wbTlExpanded;
  var tl = document.querySelector('.wb-timeline');
  var more = document.querySelector('.wb-tl-more');
  if (!tl) return;
  var logs = _wbTlExpanded ? _wbTlAllLogs : (_wbTlAllLogs || []).slice(0, _wbTlMax);
  tl.innerHTML = _buildTimelineRows(logs || []);
  if (more) {
    var btn = more.querySelector('button');
    if (btn) btn.textContent = _wbTlExpanded ? '收起日志' : '查看全部 ' + _wbTlAllLogs.length + ' 条';
  }
}

// 跳转按钮 onclick 表达式（内联 JSON 转义，防止引号破坏 onclick）
function _openWbScanJs(item) {
  var entry = item.item_type === 'sample'
    ? '/subsystems/samples/frontend/index.html'
    : '/subsystems/fixtures/frontend/index.html';
  var no = item.item_no || '';
  return "window.open('" + entry + "#/scan?no=" + no + "','_blank')";
}
