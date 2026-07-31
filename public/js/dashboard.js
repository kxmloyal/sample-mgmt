// dashboard.js — 首页概览（统计卡片 + 比例条 + 预警区块 + 错误处理）
// 待办和快捷操作见 dashboard-todo.js（renderTodo 由本文件 viewDashboard 延迟调用）
var _dashOverduePager = { limit: 5, offset: 0, total: 0 };
var _dashDueSoonPager = { limit: 5, offset: 0, total: 0 };
var _dashOverdueData = [];
var _dashDueSoonData = [];

// 状态颜色映射（与 .dash-stat::before 的 --stat-color 配合）
var STAT_COLORS = {
  total: 'var(--brand)', NEW: 'var(--muted)', PRODUCED: 'var(--warn)',
  RELEASED: 'var(--ok)', IN_CUSTODY: 'var(--brand)',
  RETURNING: 'var(--bad)', RETIRED: 'var(--muted)'
};
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
    h += '<div id="dash-todo"></div>';
    h += _renderOverdue(d.overdue || []);
    h += _renderDueSoon(d.dueSoon || []);
    v.innerHTML = h;
    // 待办由 dashboard-todo.js 渲染（延迟调用确保 DOM 就绪）
    if (typeof renderTodo === 'function') renderTodo(d);
  } catch (err) {
    v.innerHTML = '<div class="empty">数据加载失败：' + e(err.message) + ' <a class="link" onclick="viewDashboard()">点击重试</a></div>';
  }
}

// 统计卡片组（1 总数 + 6 状态）+ CSS 比例条
function _renderStats(d) {
  var s = d.byStatus || {};
  var stats = [
    ['总数', d.total || 0, 'total'],
    ['新建·待制作', s.NEW || 0, 'NEW'],
    ['制作完成', s.PRODUCED || 0, 'PRODUCED'],
    ['已发行', s.RELEASED || 0, 'RELEASED'],
    ['保管中', s.IN_CUSTODY || 0, 'IN_CUSTODY'],
    ['退回审核中', s.RETURNING || 0, 'RETURNING'],
    ['已废弃', s.RETIRED || 0, 'RETIRED']
  ];
  // 按角色优先级排序卡片（STAT_ORDER 未定义角色用 ADMIN 顺序兜底）
  var order = STAT_ORDER[me.role] || STAT_ORDER.ADMIN;
  stats.sort(function(a, b) { return order.indexOf(a[2]) - order.indexOf(b[2]); });
  var cards = stats.map(function(x) {
    // 卡片单击筛选待办（不跳转），双击下钻样品列表（看该状态全部）
    var f = x[2] === 'total' ? '' : x[2];
    var href = x[2] === 'total' ? '#/samples' : '#/samples?status=' + x[2];
    return '<div class="dash-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterTodo(\'' + f + '\',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
  }).join('');
  var total = d.total || 0;
  var barHtml = '';
  if (total > 0) {
    var keys = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'];
    var segs = keys.map(function(k) {
      var pct = ((s[k] || 0) / total * 100);
      if (pct < 0.1) return '';
      return '<div class="dash-bar-seg" style="width:' + pct + '%;background:' + STAT_COLORS[k] + '" title="' + STAT_LABELS[k] + ': ' + (s[k] || 0) + ' (' + pct.toFixed(1) + '%)" onclick="location.hash=\'#/samples?status=' + k + '\'"></div>';
    }).join('');
    var legend = '<div class="dash-bar-legend">' + keys.map(function(k) {
      return '<span onclick="location.hash=\'#/samples?status=' + k + '\'"><i style="background:' + STAT_COLORS[k] + '"></i>' + STAT_LABELS[k] + ' ' + (s[k] || 0) + '</span>';
    }).join('') + '</div>';
    barHtml = '<div class="dash-bar">' + segs + '</div>' + legend;
  }
  return '<div class="dash-stats">' + cards + '</div><div style="margin-top:12px">' + barHtml + '</div>';
}

// 快捷操作 fallback（dashboard-todo.js 加载后由 renderTodo 覆盖为富样式）
function _renderQuickActions(actions) {
  if (!actions || !actions.length) return '';
  var btns = actions.map(function(a) {
    return '<button class="btn" onclick="location.hash=\'' + a.h + '\'">' + a.t + '</button>';
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
  if (box) box.outerHTML = _renderAlertBlock('overdue', '⚠ 复检逾期', _dashOverdueData, _dashOverduePager, 'goOverduePage', true);
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
  if (box) box.outerHTML = _renderAlertBlock('soon', '⏰ 即将到期·7天内', _dashDueSoonData, _dashDueSoonPager, 'goDueSoonPage', false);
}

// 预警区块通用渲染（isOverdue 控制红色/黄色样式与缓存目标）
function _renderAlertBlock(type, title, list, pager, pageFn, isOverdue) {
  if (isOverdue) { _dashOverdueData = list; } else { _dashDueSoonData = list; }
  if (!list.length) return '';
  var cls = type === 'overdue' ? 'dash-alert-overdue' : 'dash-alert-soon';
  var pageList = list.slice(pager.offset, pager.offset + pager.limit);
  var rows = pageList.map(function(s) {
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    var dateCls = isOverdue ? 'b-overdue' : 'muted';
    var dateStyle = isOverdue ? 'font-weight:700' : '';
    return '<tr><td>' + e(s.sample_no) + '</td><td>' + e(s.name || '—') + '</td><td>' + img + '</td><td>' + e(s.custody_dept || '—') + '</td><td>' + e(s.storage_location || '—') + '</td><td class="' + dateCls + '" style="' + dateStyle + '">' + fmt(s.next_inspect_at) + '</td><td><a class="link" onclick="goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(pager, pageFn);
  return '<div class="' + cls + '" id="dash-' + type + '"><h3>' + title + '（' + list.length + '）</h3><div style="overflow-x:auto"><table><tr><th>编号</th><th>名称</th><th>图片</th><th>保管部门</th><th>储位</th><th>' + (isOverdue ? '应复检日' : '到期日') + '</th><th>操作</th></tr>' + rows + '</table></div>' + pagerHtml + '</div>';
}

// 分页控件（总数不超过每页条数则不渲染）
function _renderPager(pager, pageFn) {
  if (pager.total <= pager.limit) return '';
  var totalPages = Math.ceil(pager.total / pager.limit);
  var currentPage = Math.floor(pager.offset / pager.limit) + 1;
  return '<div class="dash-pager"><button class="btn sm" ' + (pager.offset === 0 ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage - 1) + ')">← 上一页</button><span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + pager.total + '</b> 条</span><button class="btn sm" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage + 1) + ')">下一页 →</button></div>';
}
