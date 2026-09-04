// dashboard.js — 项目看板：统计卡（KbStats 共享组件，navigate 单击跳列表）+ 三维分布 + 近 8 周趋势
async function renderProjectDashboard() {
  const v = $('#view');
  if (!v) return;
  v.innerHTML = '<div class="pk-stats" id="pk-stats"></div><div class="pk-panels" id="pk-panels"></div>';
  const s = await api('GET', PApi.stats);
  // 竞态守卫：await 期间视图可能已被切换，节点脱离 document 后直接返回
  if (!v.isConnected) return;
  // 统计卡：KbStats navigate 语义（单击跳任务列表并预选状态；项目卡跳项目列表）
  // 跳转目标复用 list.js 既有 A4 深链（#/list?status= 由 lkRestoreFromHash 恢复），后端零改动
  const stats = [
    { k: 'projects', n: s.project_count, l: '项目数', c: 'var(--brand)', href: '#/projects', title: '查看项目列表' },
    { k: 'total', n: s.total_tasks, l: '总任务', c: 'var(--brand)', href: '#/list', title: '查看任务列表（全部）' },
    { k: 'done', n: s.done_count, l: '已完成', c: 'var(--ok)', href: '#/list?status=DONE', title: '查看已完成任务' },
    { k: 'doing', n: s.in_progress_count, l: '进行中', c: '#1d4ed8', href: '#/list?status=IN_PROGRESS', title: '查看进行中任务' },
    { k: 'overdue', n: s.overdue_count, l: '已延期', c: 'var(--bad)', href: '#/list?status=OVERDUE', title: '查看已延期任务' }
  ];
  // KbStats 共享组件（kb-stat 规范：fluent-card + .n/.l + --stat-color 竖色条，样式见 /css/app.css）
  $('#pk-stats').innerHTML = KbStats.render(stats, { click: 'navigate' });
  // 三维分布（类别/优先级）+ 完成率 + 趋势
  const dist = (arr, cn, base) => arr.map(x =>
    '<div class="pk-row"><span class="pk-name">' + (cn[x.category || x.priority] || x.category || x.priority) + '</span>' +
    '<div class="pk-bar"><i style="width:' + Math.round(x.c / Math.max(base, 1) * 100) + '%"></i></div>' +
    '<span class="pk-count">' + x.c + '</span></div>').join('');
  const maxCat = Math.max.apply(null, s.category_dist.map(x => x.c).concat([1]));
  const maxPr = Math.max.apply(null, s.priority_dist.map(x => x.c).concat([1]));
  const maxTrend = Math.max.apply(null, s.trend.map(x => x.c).concat([1]));
  const trendHtml = s.trend.map(x =>
    '<div class="col"><span class="bar" style="height:' + Math.max(4, Math.round(x.c / maxTrend * 90)) + 'px"></span>' +
    '<span class="num">' + x.c + '</span><span class="wk">' + x.wk.slice(5) + '</span></div>').join('');
  $('#pk-panels').innerHTML =
    '<div class="pk-panel"><h3>类别分布</h3>' + (dist(s.category_dist, CATEGORY_CN, maxCat) || '<span class="pk-name">暂无数据</span>') + '</div>' +
    '<div class="pk-panel"><h3>优先级分布</h3>' + (dist(s.priority_dist, PRIORITY_CN, maxPr) || '<span class="pk-name">暂无数据</span>') + '</div>' +
    '<div class="pk-panel"><h3>完成率</h3><div class="pk-row"><span class="pk-name">整体</span>' +
    '<div class="pk-bar"><i style="width:' + s.completion_rate + '%"></i></div>' +
    '<span class="pk-count">' + s.completion_rate + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">未开始</span><span class="pk-count">' + s.not_started_count + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">已延期</span><span class="pk-count">' + s.overdue_count + '</span></div></div>' +
    '<div class="pk-panel"><h3>近 8 周完成趋势</h3><div class="pk-trend">' +
    (trendHtml || '<span class="pk-name">暂无数据</span>') + '</div></div>';
}
