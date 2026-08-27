// subsystems/control/frontend/js/views/dashboard.js — 管制看板（列式看板 + 顶部概览）
// 数据来源：列表接口取卡片数据（limit=200，卡片仅作概览），列头准确数量来自 /api/control/orders/stats
//           （按状态分组计数，不依赖列表 limit 截断）。
// 布局：顶部汇总统计卡（.kb-stat，单击跳列表）+ 角色待办区 + 5 阶段列板。
//          超期滞留判定用全局 _ctlOverdueHours（admin 可调，缺省 48h），今日新增以 apply_at 为准。

// 各阶段颜色（列头色条 + 卡片数，语义：进行中/待办用深色系）
var CTL_STAGE_COLOR = { 1: '#92400e', 2: '#155e75', 3: '#1d4ed8', 4: '#3730a3', 5: '#065f46' };

// 阶段 → 状态列表（反转 CONTROL_STAGE_OF_STATUS，用于阶段列头单击按状态筛选）
var CONTROL_STAGE_OF_STATUS_INV = {};
Object.keys(CONTROL_STAGE_OF_STATUS).forEach(function (s) {
  var st = CONTROL_STAGE_OF_STATUS[s];
  (CONTROL_STAGE_OF_STATUS_INV[st] = CONTROL_STAGE_OF_STATUS_INV[st] || []).push(s);
});

async function renderDashboard() {
  var view = $('#view');
  view.innerHTML = '<div class="kb-wrap"></div>';
  var wrap = $('.kb-wrap', view);
  try {
    await ctlLoadSettings(); // 加载超期阈值（缺省 48），供统计与卡片高亮
    var pair = await Promise.all([
      api('GET', '/api/control/orders?limit=200'),
      api('GET', '/api/control/orders/stats')
    ]);
    var orders = (pair[0] && pair[0].orders) || [];
    var byStatus = (pair[1] && pair[1].byStatus) || {};
    wrap.innerHTML = ctlBoardHtml(orders, byStatus);
  } catch (err) {
    wrap.innerHTML = '<div class="empty"><p>看板加载失败：' + e(err.message) + '</p><button class="btn primary" onclick="renderDashboard()">重试</button></div>';
  }
}

// 列式看板：顶部统计卡 + 5 阶段列（列头计数 = stats 按状态聚合，列内管制单卡片 = 列表概览）
// 待办已移入独立「我的待办」页，看板仅保留统计卡（待我签发/待我流转点击跳待办页）+ 列板。
function ctlBoardHtml(orders, byStatus) {
  byStatus = byStatus || {};
  var todo = ctlTodoOf(orders, me.role);
  return '<h3 class="ctl-sec">管制看板</h3>'
    + ctlStatsHtml(orders, todo, _ctlOverdueHours)
    + '<div class="ctl-board">' +
    CONTROL_STAGE_DEFS.map(function (def) {
      var items = orders.filter(function (o) { return CONTROL_STAGE_OF_STATUS[o.status] === def.stage; });
      items.sort(function (a, b) { return ctlDwellOf(b) - ctlDwellOf(a); });
      var statuses = CONTROL_STAGE_OF_STATUS_INV[def.stage];
      var count = statuses.reduce(function (acc, s) { return acc + (byStatus[s] || 0); }, 0);
      return '<div class="ctl-board-col" style="--col-color:' + CTL_STAGE_COLOR[def.stage] + '">'
        + '<div class="ctl-board-head" onclick="ctlGotoOrders(\'' + statuses + '\')" ondblclick="ctlGotoOrders(\'\')" title="单击筛选·双击查看全部">'
        + '<span class="ctl-board-name">阶段' + def.stage + ' ' + def.name + '</span>'
        + '<span class="ctl-board-count">' + count + '</span></div>'
        + '<div class="ctl-board-cards">' + (items.length ? items.map(ctlBoardCardHtml).join('') : '<div class="ctl-board-empty">暂无单据</div>') + '</div>'
        + '</div>';
    }).join('') + '</div>';
}

// 顶部汇总统计卡（.kb-stat 协议）：进行中 / 今日新增 / 待我签核 / 待我流转 / 超期滞留；admin 加阈值入口
function ctlStatsHtml(orders, todo, overdueHours) {
  var active = orders.filter(ctlNotDone);
  var today = orders.filter(function (o) { return ctlIsTodayApply(o); }).length;
  var over = active.filter(function (o) { return ctlDwellOf(o) > overdueHours; }).length;
  var cards = [
    { n: active.length, l: '进行中', c: '#1d4ed8', hash: '#/orders', tip: '前往管制单列表' },
    { n: today, l: '今日新增', c: 'var(--brand)', hash: '#/orders', tip: '前往管制单列表' },
    { n: todo.signCount, l: '待我签核', c: 'var(--warn)', hash: '#/todo', tip: '前往我的待办' },
    { n: todo.flowCount, l: '待我流转', c: '#065f46', hash: '#/todo', tip: '前往我的待办' },
    { n: over, l: '超期滞留', c: 'var(--bad)', hash: '#/orders', tip: '前往管制单列表' }
  ];
  var html = '<div class="kb-stats">' + cards.map(function (cd) {
    return '<div class="kb-stat" style="--stat-color:' + cd.c + '" onclick="location.hash=\'' + cd.hash + '\'" title="' + cd.tip + '">'
      + '<div class="n">' + cd.n + '</div><div class="l">' + cd.l + '</div></div>';
  }).join('') + '</div>';
  if (me.role === 'ADMIN') {
    html += '<div class="ctl-th-gear"><button class="btn ghost sm" onclick="openControlThresholdModal()">⚙ 阈值 ' + overdueHours + 'h</button></div>';
  }
  return html;
}

// 否为完结（已出货/已作废）以外的进行中单据
function ctlNotDone(o) { return o.status !== 'SHIPPED' && o.status !== 'RETIRED'; }

// 今日新增：以 apply_at 为基准（当天零点后）
function ctlIsTodayApply(o) {
  var t = o.apply_at ? new Date(o.apply_at).getTime() : NaN;
  if (isNaN(t)) return false;
  var d = new Date(t), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// 单张管制卡：单号 + 品名 + 状态徽章 + 数量·不良类型 + 滞留时长(超期高亮) + 下一步提示（点击进详情）
function ctlBoardCardHtml(o) {
  var dwell = ctlDwellOf(o);
  var over = dwell > _ctlOverdueHours;
  var next = controlTransitionsOf(o.status, me.role);
  var hint = next.length ? next[0].label : '';
  var dwellHtml = '';
  if (dwell >= 24) {
    var days = Math.floor(dwell / 24), hrs = dwell % 24;
    dwellHtml = '<span class="ctl-dwell' + (over ? ' over' : '') + '">' + (days ? days + '天' : '') + hrs + 'h</span>';
  }
  return '<a class="ctl-board-card' + (over ? ' over' : '') + '" href="#/detail?id=' + o.id + '" title="点击查看详情">'
    + '<div class="ctl-board-no">' + e(o.order_no) + '</div>'
    + '<div class="ctl-board-part">' + e(o.part_name) + '</div>'
    + '<div class="ctl-board-meta">' + statusBadge(o) + dwellHtml + '</div>'
    + '<div class="ctl-board-tags">' + (o.qty != null ? o.qty : '—') + ' · ' + e(o.bad_type || '—') + '</div>'
    + (hint ? '<div class="ctl-board-next">下一步：' + e(hint) + '</div>' : '')
    + '</a>';
}

/** 滞留时长（小时）：以申请/创建时间为基准，未完结单返回小时数，完结单返回 0 */
function ctlDwellOf(o) {
  if (o.status === 'SHIPPED' || o.status === 'RETIRED') return 0;
  var base = o.apply_at || o.created_at;
  var t = base ? new Date(base).getTime() : NaN;
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 3600000);
}

/** 跳转列表：statuses 为空则全部；逗号分隔多状态（列表接口支持 status=a,b） */
function ctlGotoOrders(statuses) {
  location.hash = statuses ? '#/orders?status=' + statuses : '#/orders';
}
