// dashboard.js — 样品看板（统计卡片 + 比例条 + 预警区块 + 错误处理）
// 待办和快捷操作见 dashboard-todo.js（renderTodo 由本文件 viewDashboard 延迟调用）
var _kbFilter = 0;   // 卡片筛选索引：0=总数(默认全部待办)，1..6=STAT_ORDER 排序后各状态
var _kbStats = [];   // _renderStats 填充排序后 [[label,count,key],...]，供 dashboard-todo.js 查索引→状态键
var _dashOverduePager = { limit: 5, offset: 0, total: 0 };
var _dashDueSoonPager = { limit: 5, offset: 0, total: 0 };
var _dashOverdueData = [];
var _dashDueSoonData = [];

// 统计卡配置（对齐治具 DASH_STATS 模式，配置驱动 + 角色排序）
var DASH_STATS = [
  { label: '总数', key: 'total', color: 'var(--brand)', countByStatus: false },
  { label: '新建·待制作', key: 'NEW', color: 'var(--muted)', countByStatus: true },
  { label: '制作完成', key: 'PRODUCED', color: 'var(--warn)', countByStatus: true },
  { label: '已发行', key: 'RELEASED', color: 'var(--ok)', countByStatus: true },
  { label: '保管中', key: 'IN_CUSTODY', color: 'var(--brand)', countByStatus: true },
  { label: '退回审核中', key: 'RETURNING', color: 'var(--bad)', countByStatus: true },
  { label: '已废弃', key: 'RETIRED', color: 'var(--muted)', countByStatus: true }
];
// 按 key 快速查找颜色的辅助映射（比例条、dashboard-todo.js 复合需要）
var STAT_COLORS = {};
DASH_STATS.forEach(function(c) { STAT_COLORS[c.key] = c.color; });
// 角色优先级排序：高优先级状态前置（RD制作优先/QA发行优先/CUSTODY接收优先）
var STAT_ORDER = {
  ADMIN:   ['total','NEW','PRODUCED','RELEASED','IN_CUSTODY','RETURNING','RETIRED'],
  RD:      ['total','NEW','PRODUCED','RETURNING','RELEASED','IN_CUSTODY','RETIRED'],
  QA:      ['total','PRODUCED','RETURNING','RELEASED','NEW','IN_CUSTODY','RETIRED'],
  ME:      ['total','RELEASED','IN_CUSTODY','NEW','PRODUCED','RETURNING','RETIRED'],
  CUSTODY: ['total','RELEASED','IN_CUSTODY','NEW','PRODUCED','RETURNING','RETIRED']
};
var STAT_LABELS = {
  NEW: '新建·待制作', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已废弃'
};

// 主入口：拉取 /api/dashboard 并渲染全部区块，失败显示点击重试
async function viewDashboard() {
  var v = $('#view');
  v.innerHTML = '<div class="muted">加载中…</div>';
  try {
    var d = await api('GET', '/api/dashboard');
    var h = '';
    h += _renderStats(d);
    h += _renderQuickActions(d.roleActions || []);
    h += _renderOverdue(d.overdue || []);
    h += _renderDueSoon(d.dueSoon || []);
    h += '<div id="dash-todo"></div>';
    v.innerHTML = h;
    // 预警表格列宽拖拽
    setTimeout(function() {
      document.querySelectorAll('.dash-alert-table').forEach(function(t) { if (typeof _initColResize === 'function') _initColResize(t); });
    }, 0);
    // 待办由 dashboard-todo.js 渲染（延迟调用确保 DOM 就绪）
    if (typeof renderTodo === 'function') renderTodo(d);
  } catch (err) {
    v.innerHTML = '<div class="empty">数据加载失败：' + e(err.message) + ' <a class="link" onclick="viewDashboard()">点击重试</a></div>';
  }
}

// 统计卡片组 + CSS 比例条（DASH_STATS 配置驱动，按角色优先级排序）
function _renderStats(d) {
  var s = d.byStatus || {}, total = d.total || 0;
  var order = STAT_ORDER[me.role] || STAT_ORDER.ADMIN;
  var sorted = DASH_STATS.slice().sort(function(a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
  // 构建 _kbStats 供 dashboard-todo.js 兼容 [[label, count, key], ...]
  _kbStats = sorted.map(function(cfg) { return [cfg.label, cfg.key === 'total' ? total : (s[cfg.key] || 0), cfg.key]; });
  var cards = sorted.map(function(cfg, idx) {
    var count = cfg.key === 'total' ? total : (s[cfg.key] || 0);
    var href = cfg.key === 'total' ? '#/samples' : '#/samples?status=' + cfg.key;
    return '<fluent-card class="kb-stat" style="--stat-color:' + cfg.color + '" onclick="filterKbStat(' + idx + ',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></fluent-card>';
  }).join('');
  // 比例条
  var barHtml = '';
  if (total > 0) {
    var keys = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'];
    var segs = keys.map(function(k) {
      var pct = ((s[k] || 0) / total * 100);
      if (pct < 0.1) return '';
      return '<div class="dash-bar-seg" style="width:' + pct + '%;background:' + STAT_COLORS[k] + '" title="' + STAT_LABELS[k] + ': ' + (s[k] || 0) + ' (' + pct.toFixed(1) + '%)" onclick="barDrill(\'' + k + '\',this)"></div>';
    }).join('');
    var legend = '<div class="dash-bar-legend">' + keys.map(function(k) {
      return '<span class="dash-legend" onclick="barDrill(\'' + k + '\',this)"><i style="background:' + STAT_COLORS[k] + '"></i>' + STAT_LABELS[k] + ' ' + (s[k] || 0) + '</span>';
    }).join('') + '</div>';
    barHtml = '<div class="dash-bar">' + segs + '</div>' + legend;
  }
  return '<div class="kb-stats">' + cards + '</div><div style="margin-top:12px">' + barHtml + '</div>';
}

// 比例条下钻：切换 active 高亮 + 跳转样品列表（保留原跳转行为，向后兼容）
function barDrill(key, el) {
  document.querySelectorAll('.dash-bar-seg.active,.dash-legend.active').forEach(function(n){ n.classList.remove('active'); });
  if (el) el.classList.add('active');
  location.hash = key === 'total' ? '#/samples' : '#/samples?status=' + key;
}

// filterKbStat 定义在 dashboard-todo.js（与 _renderTodoTable 同文件，原 filterTodo 位置）
// _kbFilter/_kbStats 由本文件定义（_renderStats 填充），filterKbStat 跨文件读写

// 快捷操作 fallback（dashboard-todo.js 加载后由 renderTodo 覆盖为富样式）
function _renderQuickActions(actions) {
  if (!actions || !actions.length) return '';
  var btns = actions.map(function(a) {
    return '<fluent-button appearance="accent" onclick="location.hash=\'' + a.h + '\'">' + a.t + '</fluent-button>';
  }).join('');
  return '<div class="dash-actions" style="margin-top:16px">' + btns + '</div>';
}

// 复检逾期预警（红色区块，5 条/页）
function _renderOverdue(list) {
  _dashOverduePager.total = list.length;
  _dashOverduePager.offset = 0;
  return _renderAlertBlock('overdue', '⚠ 复检逾期', list, _dashOverduePager, 'goOverduePage', true);
}
function goOverduePage(page) {
  _dashOverduePager.offset = (page - 1) * _dashOverduePager.limit;
  var box = $('#dash-overdue');
  if (box) { box.outerHTML = _renderAlertBlock('overdue', '⚠ 复检逾期', _dashOverdueData, _dashOverduePager, 'goOverduePage', true); setTimeout(function() { var t = document.querySelector('#dash-overdue .dash-alert-table'); if (t && typeof _initColResize === 'function') _initColResize(t); }, 0); }
}

// 即将到期预警（黄色区块，5 条/页）
function _renderDueSoon(list) {
  _dashDueSoonPager.total = list.length;
  _dashDueSoonPager.offset = 0;
  return _renderAlertBlock('soon', '⏰ 即将到期·7天内', list, _dashDueSoonPager, 'goDueSoonPage', false);
}
function goDueSoonPage(page) {
  _dashDueSoonPager.offset = (page - 1) * _dashDueSoonPager.limit;
  var box = $('#dash-soon');
  if (box) { box.outerHTML = _renderAlertBlock('soon', '⏰ 即将到期·7天内', _dashDueSoonData, _dashDueSoonPager, 'goDueSoonPage', false); setTimeout(function() { var t = document.querySelector('#dash-soon .dash-alert-table'); if (t && typeof _initColResize === 'function') _initColResize(t); }, 0); }
}

// 预警区块通用渲染（isOverdue 控制红色/黄色样式与缓存目标）
function _renderAlertBlock(type, title, list, pager, pageFn, isOverdue) {
  if (isOverdue) { _dashOverdueData = list; } else { _dashDueSoonData = list; }
  if (!list.length) return '';
  var cls = type === 'overdue' ? 'dash-alert-overdue' : 'dash-alert-soon';
  var pageList = list.slice(pager.offset, pager.offset + pager.limit);
  var dateLabel = isOverdue ? '应复检日' : '到期日';
  var colgroup = '<colgroup><col style="width:100px"><col style="width:130px"><col style="width:52px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:70px"></colgroup>';
  var thead = '<thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>图片<span class="col-rsz"></span></th><th>保管部门<span class="col-rsz"></span></th><th>储位<span class="col-rsz"></span></th><th>' + dateLabel + '<span class="col-rsz"></span></th><th>操作<span class="col-rsz"></span></th></tr></thead>';
  var rows = pageList.map(function(s) {
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    var dateCls = isOverdue ? 'b-overdue' : 'muted';
    var dateStyle = isOverdue ? 'font-weight:700' : '';
    return '<tr class="dash-alert-row" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer"><td data-label="编号">' + e(s.sample_no) + '</td><td data-label="名称">' + e(s.name || '—') + '</td><td data-label="图片">' + img + '</td><td data-label="保管部门">' + e(s.custody_dept || '—') + '</td><td data-label="储位">' + e(s.storage_location || '—') + '</td><td data-label="' + dateLabel + '" class="' + dateCls + '" style="' + dateStyle + '">' + fmt(s.next_inspect_at) + '</td><td data-label="操作"><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(pager, pageFn);
  return '<div class="' + cls + '" id="dash-' + type + '"><h3>' + title + '（' + list.length + '）</h3><div style="overflow-x:auto"><table class="dash-alert-table">' + colgroup + thead + '<tbody>' + rows + '</tbody></table></div>' + pagerHtml + '</div>';
}

// 分页控件（总数不超过每页条数则不渲染）
function _renderPager(pager, pageFn) {
  if (pager.total <= pager.limit) return '';
  var totalPages = Math.ceil(pager.total / pager.limit);
  var currentPage = Math.floor(pager.offset / pager.limit) + 1;
  return '<div class="dash-pager"><fluent-button appearance="accent" size="small" ' + (pager.offset === 0 ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage - 1) + ')">← 上一页</fluent-button><span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + pager.total + '</b> 条</span><fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage + 1) + ')">下一页 →</fluent-button></div>';
}
