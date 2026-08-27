// subsystems/control/frontend/js/router.js — 管制子系统导航菜单与哈希路由
// NAV 与 manifest.navigation 保持一致（单一事实来源见 AGENTS.md §17.3）；
// route() 解析 #/dashboard、#/orders、#/detail?id=3、#/label?id=3，并把 id/status 写入全局供各视图读取。

var NAV = [
  { k: 'dashboard', t: '管制看板', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'todo', t: '我的待办', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'orders', t: '管制单列表', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'ncr', t: '不良品委托单', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'new', t: '新建管制申请', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'detail', t: '单据详情', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'label', t: '管制标签打印', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'logs', t: '操作日志', roles: ['ADMIN'] }
];

var PAGE_TITLE = { dashboard: '管制看板', todo: '我的待办', orders: '管制单列表', ncr: '不良品委托单', new: '新建管制申请', detail: '单据详情', label: '管制标签打印', logs: '操作日志' };

// 路由参数：route() 哈希 query 解析后写入，供各视图读取
var currentControlId = null;
var currentStatusFilter = '';
var currentFocusNcr = '';   // 详情定位：聚合页行点击跳来，指示要展开高亮的委托单号
var currentNcrNoFilter = ''; // 聚合页预过滤：详情卡「在委托单列表查看」跳来时预填委托单号
var currentActiveFilter = false;  // 看板统计卡「进行中」联动筛选
var currentTodayFilter = false;   // 看板统计卡「今日新增」联动筛选
var currentOverdueFilter = false; // 看板统计卡「超期滞留」联动筛选

// 简易元素构造器（自包含，不依赖其它子系统的 helper）
function ctlEl(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function buildNav() {
  var nav = $('#nav');
  if (!nav) return;
  nav.innerHTML = '';
  NAV.filter(function (n) { return n.roles.indexOf(me.role) > -1; }).forEach(function (n) {
    var b = ctlEl('button');
    b.textContent = n.t;
    b.onclick = function () { location.hash = '#/' + n.k; };
    b.dataset.k = n.k;
    nav.appendChild(b);
  });
}

function setActive(k) {
  document.querySelectorAll('#nav button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.k === k);
  });
}

var VIEWS = {
  dashboard: renderDashboard, todo: renderTodo, orders: renderList, ncr: renderNcrList, new: renderNew,
  detail: renderDetail, label: renderLabel, logs: renderLogs
};

function route() {
  var hash = (location.hash.replace('#/', '') || 'dashboard');
  var parts = hash.split('?');
  var k = parts[0] || 'dashboard';
  var q = {};
  if (parts[1]) parts[1].split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || ''); });
  var navItem = NAV.find(function (n) { return n.k === k; });
  if (navItem && navItem.roles.indexOf(me.role) < 0) { location.hash = '#/dashboard'; return; }
  var view = VIEWS[k] || renderDashboard;
  setActive(k);
  $('#page-title').textContent = PAGE_TITLE[k] || (navItem ? navItem.t : '') || '';
  $('#page-actions').innerHTML = '';
  $('#view').innerHTML = '';
  currentControlId = q.id || null;
  currentStatusFilter = q.status || '';
  currentFocusNcr = q.focusNcr || '';
  currentNcrNoFilter = q.ncr_no || '';
  currentActiveFilter = q.active === '1' || q.active === 'true';
  currentTodayFilter = q.today === '1' || q.today === 'true';
  currentOverdueFilter = q.overdue === '1' || q.overdue === 'true';
  // 详情/标签打印需先选中单据；无 id 时引导去列表，避免「缺少单据编号」生硬报错
  if ((k === 'detail' || k === 'label') && !currentControlId) {
    toast('请先从管制单列表选择一张单据', 'info');
    location.hash = '#/orders';
    return;
  }
  if (k === 'detail' || k === 'label') { view(currentControlId); }
  else { view(); }
}
