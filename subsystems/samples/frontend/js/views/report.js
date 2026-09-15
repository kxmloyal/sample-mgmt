// views/report.js — 样品报表（2026-09-14｜方案甲：纯前端只读聚合）
// 入口：#/report（左侧导航「样品报表」）
// 数据来源：全部复用既有只读端点，本视图**不新增任何接口、不写入任何数据、不触达状态机**：
//   GET /api/dashboard                  → byStatus(7态) / total / overdue / dueSoon / myPending / checkoutOverdue
//   GET /api/samples/models?view=wall   → 机型维度（样品数 / 复检逾期 / 领用超时 / 状态分布）
//   GET /api/samples/storage-map        → 柜位占用（summary: total/inCustody/checkedOut/returning/reserved/gone/empty）
//   GET /api/samples?station=X&limit=1  → 组别维度（仅取 total 计数，忽略分页）
// 样式：复用 app.css 共享 .filters / .kb-stats / .dash-bar；本页专属 .rpt-* 只写本子系统 module.css（AGENTS §18.5）
// 命名：一律 RPT_ / rpt 前缀——bundle 为经典 script 拼接的**单一全局作用域**，顶层重名 = SyntaxError 致全站白屏
// 口径声明见页面底部「口径与数据说明」区块（只读快照，与样品看板同源）

// 状态展示元数据：顺序 = 生命周期顺序。
// **禁止按数量降序排列**——18/17/15 的相邻差异落在人眼可辨阈以下，数量排序会被读成「大小关系」。
var RPT_STATUS_META = [
  { key: 'NEW',         label: '新建·待制作',   color: '#94a3b8' },
  { key: 'PRODUCED',    label: '制作完成',      color: 'var(--warn)' },
  { key: 'RELEASED',    label: '已发行·待接收', color: '#ca8a04' },
  { key: 'IN_CUSTODY',  label: '保管中',        color: 'var(--brand)' },
  { key: 'CHECKED_OUT', label: '领用中',        color: '#1d4ed8' },
  { key: 'RETURNING',   label: '退回审核中',    color: 'var(--bad)' },
  { key: 'RETIRED',     label: '已作废',        color: '#cbd5e1' }
];

// 组别全集：唯一事实来源为 constants.js 的 STATIONS（bundle 顺序保证 constants.js 先于本文件求值）。
// 兜底数组仅在极端重排时生效——放在函数内延迟取值，避免顶层 TDZ 抛错导致整页白屏。
function rptStations() {
  return (typeof STATIONS !== 'undefined' && STATIONS && STATIONS.length)
    ? STATIONS
    : ['马达组', '扇叶组', '成品组', '品保部', 'SMT', '供应商'];
}

/** 统计时刻（浏览器本地时间 YYYY-MM-DD HH:mm） */
function rptNow() {
  var d = new Date();
  var p = function (n) { return (n < 10 ? '0' : '') + n; };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 百分比数值（分母 0 → 0，避免 NaN 渲染） */
function rptPct(n, total) { return total > 0 ? (Number(n) || 0) / total * 100 : 0; }

/** 百分比文本：分母 0 → '—'；否则固定一位小数 */
function rptPctText(n, total) { return total > 0 ? rptPct(n, total).toFixed(1) + '%' : '—'; }

/** 行内占比微条（纯 CSS，零图表库；宽度以行内最大值为基准，小样本下仍可读） */
function rptMicroBar(n, max, color) {
  var w = max > 0 ? Math.min(rptPct(n, max), 100) : 0;
  if (n > 0 && w < 2) w = 2; // 极小值保底可见，避免「非零但看不见」
  return '<span class="rpt-bar"><span class="rpt-bar-fill" style="width:' + w.toFixed(1) + '%;background:' + (color || 'var(--brand)') + '"></span></span>';
}

// 组别维度：逐组别取总量（?station=X&limit=1 只读计数）。单组失败降级为 0，不阻断整页
async function rptFetchStations() {
  return Promise.all(rptStations().map(function (st) {
    return api('GET', '/api/samples?station=' + encodeURIComponent(st) + '&limit=1')
      .then(function (r) { return { station: st, total: Number(r.total) || 0 }; })
      .catch(function () { return { station: st, total: 0 }; });
  }));
}

// 主入口：并发拉取 4 组只读数据 → 渲染全部区块；失败给可点重试
async function viewReport() {
  var v = $('#view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">报表统计中…</div>';
  var res;
  try {
    res = await Promise.all([
      api('GET', '/api/dashboard'),
      api('GET', '/api/samples/models?view=wall'),
      api('GET', '/api/samples/storage-map'),
      rptFetchStations()
    ]);
  } catch (err) {
    v.innerHTML = '<div class="empty">报表加载失败：' + e(err.message) +
      ' <a class="link" onclick="viewReport()">点击重试</a></div>';
    return;
  }
  var dash = res[0] || {}, models = res[1] || [], smap = res[2] || {}, stations = res[3] || [];
  var bs = dash.byStatus || {};
  var total = Number(dash.total) || 0;
  var retired = Number(bs.RETIRED) || 0;
  var R = {
    bs: bs,
    total: total,
    retired: retired,
    inManage: Math.max(total - retired, 0),
    pending: (Number(bs.RETURNING) || 0) + (Number(bs.NEW) || 0),
    overdue: (dash.overdue || []).length,
    dueSoon: (dash.dueSoon || []).length,
    coOverdue: (dash.checkoutOverdue || []).length,
    todos: dash.myPending || [],
    models: models,
    smap: smap,
    stations: stations
  };
  var h = '';
  h += rptRenderToolbar(R);
  h += rptRenderKpi(R);
  h += rptRenderStatus(R);
  h += '<div class="rpt-grid">' + rptRenderModels(R) + rptRenderStations(R) + '</div>';
  h += rptRenderAlerts(R);
  h += rptRenderStorage(R);
  h += rptRenderTodos(R);
  h += rptRenderNotes(R);
  v.innerHTML = h;
}

// 工具栏：复用共享 .filters 容器（同柜位视图），左信息组 + 右操作组
function rptRenderToolbar(R) {
  return '<div class="filters" style="align-items:center">' +
    '<div class="rpt-tb-info">' +
      '<b style="font-size:15px">样品报表</b>' +
      '<span class="muted" style="font-size:12px">只读聚合 · 统计时刻 ' + rptNow() + '</span>' +
    '</div>' +
    '<div class="rpt-tb-ops">' +
      '<fluent-button appearance="neutral" size="small" onclick="viewReport()">刷新</fluent-button>' +
    '</div>' +
  '</div>';
}

// 核心指标卡（复用共享 KbStats + .kb-stat 视觉协议；单击跳样品列表）
function rptRenderKpi(R) {
  var bs = R.bs;
  var cards = [
    { n: R.total, l: '存活样品总量', color: 'var(--brand)', href: '#/samples', title: '未取消的样品总数（含已作废）' },
    { n: R.inManage, l: '在管总量', color: 'var(--ok)', href: '#/samples', title: '存活总量 − 已作废 = ' + R.total + ' − ' + R.retired },
    { n: R.pending, l: '待处理异常', color: 'var(--bad)', href: '#/samples', title: '退回审核中 ' + (Number(bs.RETURNING) || 0) + ' + 新建待制作 ' + (Number(bs.NEW) || 0) },
    { n: Number(bs.RELEASED) || 0, l: '已发行·待接收', color: '#ca8a04', href: '#/samples?status=RELEASED', title: '当前仍停留在已发行（保管部尚未接收）的滞留量，非累计发行量' },
    { n: Number(bs.IN_CUSTODY) || 0, l: '保管中', color: 'var(--brand)', href: '#/samples?status=IN_CUSTODY', title: '当前在库保管' },
    { n: R.retired, l: '已作废', color: '#94a3b8', href: '#/samples?status=RETIRED', title: '作废率 ' + rptPctText(R.retired, R.total) }
  ];
  return '<div class="rpt-sec"><h3 class="rpt-h3">核心指标<span class="rpt-note">单击卡片跳转样品列表</span></h3>' +
    KbStats.wrap(KbStats.render(cards, { click: 'navigate' })) + '</div>';
}

// 状态分布：100% 堆叠比例条（复用共享 .dash-bar 协议）+ 图例 + 明细表
// 零值状态不渲染条段（避免 0 宽度幽灵段），但**保留在图例与表中**（缺失比 0 更容易被误读）
function rptRenderStatus(R) {
  var bs = R.bs, total = R.total;
  var segs = '', legend = '', rows = '';
  RPT_STATUS_META.forEach(function (m) {
    var n = Number(bs[m.key]) || 0;
    var pct = rptPct(n, total);
    var go = 'location.hash=\'#/samples?status=' + m.key + '\'';
    if (pct > 0) {
      segs += '<div class="dash-bar-seg" style="width:' + pct.toFixed(3) + '%;background:' + m.color + '" title="' +
        e(m.label) + ' ' + n + ' 件（' + pct.toFixed(1) + '%）" onclick="' + go + '"></div>';
    }
    legend += '<span onclick="' + go + '"><i style="background:' + m.color + '"></i>' + e(m.label) + ' ' + n + '</span>';
    rows += '<tr class="' + (n === 0 ? 'rpt-zero' : '') + '" style="cursor:pointer" onclick="' + go + '">' +
      '<td>' + e(m.label) + '</td>' +
      '<td class="num">' + n + '</td>' +
      '<td class="num">' + rptPctText(n, total) + '</td>' +
      '<td style="width:130px">' + (n > 0 ? rptMicroBar(n, total, m.color) : '') + '</td>' +
    '</tr>';
  });
  return '<div class="rpt-sec"><h3 class="rpt-h3">状态分布<span class="rpt-note">按生命周期顺序排列（非数量排序）· 合计 ' + total + ' 件</span></h3>' +
    '<div class="rpt-card">' +
      '<div class="dash-bar">' + segs + '</div>' +
      '<div class="dash-bar-legend">' + legend + '</div>' +
      '<table class="rpt-table" style="margin-top:12px"><thead><tr>' +
        '<th>状态</th><th class="num">数量</th><th class="num">占比</th><th>分布</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '</div></div>';
}

// 机型分布：表格 + 行内微条（基数会随业务增长，禁用对基数敏感的饼图）
function rptRenderModels(R) {
  var list = (R.models || []).slice().sort(function (a, b) {
    return (Number(b.sample_count) || 0) - (Number(a.sample_count) || 0);
  });
  var sum = list.reduce(function (m, x) { return m + (Number(x.sample_count) || 0); }, 0);
  var maxN = list.reduce(function (m, x) { return Math.max(m, Number(x.sample_count) || 0); }, 0);
  var rows = list.map(function (m) {
    var n = Number(m.sample_count) || 0;
    return '<tr style="cursor:pointer" onclick="location.hash=\'#/samples?model=' + encodeURIComponent(m.code) + '\'">' +
      '<td><b>' + e(m.code) + '</b><div class="muted" style="font-size:11px">' + e(m.full_name || '') + '</div></td>' +
      '<td class="num">' + n + '</td>' +
      '<td class="num">' + rptPctText(n, sum) + '</td>' +
      '<td style="width:110px">' + (n > 0 ? rptMicroBar(n, maxN, 'var(--brand)') : '') + '</td>' +
    '</tr>';
  }).join('');
  if (!rows) rows = '<tr><td colspan="4" class="muted">无机型主数据</td></tr>';
  return '<div class="rpt-card"><h3 class="rpt-h3">机型分布<span class="rpt-note">' + list.length +
    ' 个机型 · 合计 ' + sum + ' 件</span></h3>' +
    '<table class="rpt-table"><thead><tr><th>机型</th><th class="num">样品数</th><th class="num">占比</th><th>分布</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
}

// 组别分布：按 STATIONS 全集**补零**展示（0 件组别消失会让人误以为该组别不存在）
// 注：样品列表当前只解析 hash 的 status/model 参数，不支持 station 深链，故本表行不可点（避免跳转到未筛选列表的误导）
function rptRenderStations(R) {
  var list = R.stations || [];
  var sum = list.reduce(function (m, x) { return m + (Number(x.total) || 0); }, 0);
  var maxN = list.reduce(function (m, x) { return Math.max(m, Number(x.total) || 0); }, 0);
  var rows = list.map(function (x) {
    var n = Number(x.total) || 0;
    return '<tr class="' + (n === 0 ? 'rpt-zero' : '') + '">' +
      '<td>' + e(x.station) + '</td>' +
      '<td class="num">' + n + '</td>' +
      '<td class="num">' + rptPctText(n, sum) + '</td>' +
      '<td style="width:110px">' + (n > 0 ? rptMicroBar(n, maxN, 'var(--ok)') : '') + '</td>' +
    '</tr>';
  }).join('');
  return '<div class="rpt-card"><h3 class="rpt-h3">组别分布<span class="rpt-note">' + list.length +
    ' 个组别（全集，零值保留）· 合计 ' + sum + ' 件</span></h3>' +
    '<table class="rpt-table"><thead><tr><th>组别</th><th class="num">样品数</th><th class="num">占比</th><th>分布</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>' +
    '<div class="muted" style="font-size:11px;margin-top:8px">组别再按「提供处」拆分无意义：当前数据 source_type 单一取值。</div>' +
    '</div>';
}

// 预警：与样品看板预警区块同源口径（复检逾期 / 近 7 天到期 / 领用超时）
function rptRenderAlerts(R) {
  var items = [
    { l: '复检逾期', n: R.overdue, color: 'var(--bad)', hint: '已过复检日期仍未复检。当前 release_cycle_days 统一为 365 天，复检到期集中在一年后，逾期恒为 0 属预期而非异常。' },
    { l: '近 7 天待复检', n: R.dueSoon, color: 'var(--warn)', hint: '未来 7 天内到达复检日期' },
    { l: '领用超时未归还', n: R.coOverdue, color: '#1d4ed8', hint: '已过应还时间仍未归还' }
  ];
  return '<div class="rpt-sec"><h3 class="rpt-h3">预警<span class="rpt-note">与样品看板预警区块同源</span></h3>' +
    '<div class="rpt-card"><table class="rpt-table"><thead><tr><th>项目</th><th class="num">数量</th><th>口径说明</th></tr></thead><tbody>' +
    items.map(function (x) {
      return '<tr><td><span style="color:' + x.color + ';font-weight:600">' + e(x.l) + '</span></td>' +
        '<td class="num">' + x.n + '</td>' +
        '<td class="muted" style="font-size:12px">' + e(x.hint) + '</td></tr>';
    }).join('') + '</tbody></table></div></div>';
}

// 柜位占用：每柜总格位 / 在用 / 空位 / 占用率；在用 = 在柜 + 领走(占位) + 退回审核 + 预占 + 作废残留(待清柜)
// 2026-09-15 拆桶：作废残留（gone）从「预占」中分离单列——它仍占用格位（计入在用/不计数为空位），
// 但语义是「实物已离柜、储位待清柜释放」，与提前占位防冲突的「预占」混计会让占用率口径含混。
function rptRenderStorage(R) {
  var cabs = (R.smap.cabinets || []).slice().sort(function (a, b) { return (a.no || 0) - (b.no || 0); });
  var acc = { total: 0, used: 0, empty: 0, inCustody: 0, checkedOut: 0, returning: 0, reserved: 0, gone: 0 };
  cabs.forEach(function (c) {
    var s = c.summary || {};
    var used = (Number(s.inCustody) || 0) + (Number(s.checkedOut) || 0) + (Number(s.returning) || 0) + (Number(s.reserved) || 0) + (Number(s.gone) || 0);
    acc.total += Number(s.total) || 0;
    acc.used += used;
    acc.empty += Number(s.empty) || 0;
    acc.inCustody += Number(s.inCustody) || 0;
    acc.checkedOut += Number(s.checkedOut) || 0;
    acc.returning += Number(s.returning) || 0;
    acc.reserved += Number(s.reserved) || 0;
    acc.gone += Number(s.gone) || 0;
  });
  var uncab = (R.smap.uncabineted || []).length;
  var unknown = (R.smap.unknownLoc || []).length;
  var rows = cabs.map(function (c) {
    var s = c.summary || {};
    var used = (Number(s.inCustody) || 0) + (Number(s.checkedOut) || 0) + (Number(s.returning) || 0) + (Number(s.reserved) || 0) + (Number(s.gone) || 0);
    var t = Number(s.total) || 0;
    return '<tr>' +
      '<td><b>' + e(c.key) + '</b>' + (c.configured ? '' : ' <span class="muted" style="font-size:11px">(未配置行列)</span>') + '</td>' +
      '<td class="num">' + t + '</td>' +
      '<td class="num">' + used + '</td>' +
      '<td class="num">' + (Number(s.empty) || 0) + '</td>' +
      '<td class="num">' + rptPctText(used, t) + '</td>' +
      '<td style="width:110px">' + (t > 0 ? rptMicroBar(used, t, 'var(--brand)') : '') + '</td>' +
    '</tr>';
  }).join('');
  if (!rows) rows = '<tr><td colspan="6" class="muted">暂未配置保管柜</td></tr>';
  var warn = '';
  if (uncab) warn += '<div class="sm-warn" style="margin-top:10px">⚠️ 已在保管/领用/退回审核但未录入储位的样品 <b>' + uncab + '</b> 件（<a class="link" onclick="location.hash=\'#/storagemap\'">去柜位视图查看</a>）</div>';
  if (unknown) warn += '<div class="sm-warn" style="margin-top:10px;background:#fffbeb">⚠️ 储位格式不规范 <b>' + unknown + '</b> 条（须为 N#样品柜C-R）</div>';
  return '<div class="rpt-sec"><h3 class="rpt-h3">柜位占用<span class="rpt-note">共 ' + cabs.length +
    ' 柜 · 总格位 ' + acc.total + ' · 在用 ' + acc.used + ' · 空位 ' + acc.empty + ' · 占用率 ' + rptPctText(acc.used, acc.total) + '</span></h3>' +
    '<div class="rpt-card"><table class="rpt-table"><thead><tr>' +
      '<th>保管柜</th><th class="num">总格位</th><th class="num">在用</th><th class="num">空位</th><th class="num">占用率</th><th>占用</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table>' +
    '<div class="muted" style="font-size:11px;margin-top:8px">在用构成：在柜 ' + acc.inCustody + ' · 被领走(占位) ' + acc.checkedOut +
      ' · 退回审核 ' + acc.returning + ' · 预占 ' + acc.reserved + ' · 作废残留 ' + acc.gone + '（待清柜）。领走不释放格位（用户 2026-09-09 确认）。</div>' +
    warn + '</div></div>';
}

// 我的待办：按当前登录角色（服务端按会话派生，客户端不可伪造），最多展示前 8 件
function rptRenderTodos(R) {
  var list = R.todos || [];
  var roleCn = (typeof ROLE !== 'undefined' && ROLE[me.role]) ? ROLE[me.role] : me.role;
  var h = '<div class="rpt-sec"><h3 class="rpt-h3">我的待办<span class="rpt-note">角色：' + e(roleCn) +
    ' · 共 ' + list.length + ' 件（服务端上限 200）</span></h3>';
  if (!list.length) return h + '<div class="rpt-card muted">当前角色暂无待办</div></div>';
  h += '<div class="rpt-card">' + list.slice(0, 8).map(function (s) {
    var extra = [];
    if (s.station) extra.push(s.station);
    if (s.next_inspect_at) extra.push('复检 ' + fmt(s.next_inspect_at));
    return '<div class="rpt-todo" onclick="viewDetail(' + s.id + ')">' +
      '<span class="rpt-no">' + e(s.sample_no) + '</span>' +
      '<span>' + e(s.name || '') + '</span>' +
      statusBadge(s) +
      '<span class="muted" style="margin-left:auto;font-size:12px">' + e(extra.join(' · ')) + '</span>' +
    '</div>';
  }).join('') +
    (list.length > 8 ? '<div class="muted" style="font-size:12px;margin-top:6px">仅显示前 8 件；其余请在样品列表用「待处理」快捷筛选查看。</div>' : '') +
    '</div></div>';
  return h;
}

// 口径与数据说明（只读快照的边界必须显式声明，避免各区块数字被读者误当成同一时刻的强一致快照）
function rptRenderNotes(R) {
  return '<div class="rpt-foot">' +
    '<b>口径与数据说明</b><br>' +
    '· 数据源：全部复用既有只读接口 <code>/api/dashboard</code>、<code>/api/samples/models?view=wall</code>、' +
      '<code>/api/samples/storage-map</code>、<code>/api/samples?station=…&amp;limit=1</code>。本页不新增接口、不写入任何数据。<br>' +
    '· 只读快照：多个接口并发读取，两次读取之间若有人建样/流转，各区块间可能存在极短暂的不一致。<br>' +
    '· 「存活样品总量」含已作废；「在管总量」= 存活总量 − 已作废（' + R.total + ' − ' + R.retired + ' = ' + R.inManage + '）。<br>' +
    '· 「已发行·待接收」是<b>当前仍停留在该状态</b>的滞留量，不是累计发行量（累计发行需按 released_at 统计）。<br>' +
    '· 复检预警：逾期 ' + R.overdue + ' / 近 7 天到期 ' + R.dueSoon + ' / 领用超时 ' + R.coOverdue + '。<br>' +
    '· 本期（方案甲）不含：时间趋势、退回重做率、数据质量缺口、聚合 CSV 导出 —— 需后端聚合端点（方案乙/丙）。' +
  '</div>';
}
