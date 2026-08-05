// dashboard.js — 项目看板：统计卡（kb-stat 共享组件）+ 三维分布 + 近 8 周趋势
async function renderProjectDashboard() {
  const v = $('#view');
  v.innerHTML = '<div class="pk-stats" id="pk-stats"></div><div class="pk-panels" id="pk-panels"></div>';
  const s = await api('GET', PApi.stats);
  const stats = [
    { k: 'projects', n: s.project_count, l: '项目数', c: 'var(--brand)' },
    { k: 'total', n: s.total_tasks, l: '总任务', c: 'var(--brand)' },
    { k: 'done', n: s.done_count, l: '已完成', c: 'var(--ok)' },
    { k: 'doing', n: s.in_progress_count, l: '进行中', c: '#1d4ed8' },
    { k: 'overdue', n: s.overdue_count, l: '已延期', c: 'var(--bad)' }
  ];
  $('#pk-stats').innerHTML = stats.map(x =>
    '<fluent-card class="kb-stat"><span class="kb-bar" style="background:' + x.c + '"></span>' +
    '<span class="kb-n" style="color:' + x.c + '">' + x.n + '</span>' +
    '<span class="kb-l">' + x.l + '</span></fluent-card>').join('');
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
    '<div class="pk-panel"><h3>类别分布</h3>' + dist(s.category_dist, CATEGORY_CN, maxCat) + '</div>' +
    '<div class="pk-panel"><h3>优先级分布</h3>' + dist(s.priority_dist, PRIORITY_CN, maxPr) + '</div>' +
    '<div class="pk-panel"><h3>完成率</h3><div class="pk-row"><span class="pk-name">整体</span>' +
    '<div class="pk-bar"><i style="width:' + s.completion_rate + '%"></i></div>' +
    '<span class="pk-count">' + s.completion_rate + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">未开始</span><span class="pk-count">' + s.not_started_count + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">已延期</span><span class="pk-count">' + s.overdue_count + '</span></div></div>' +
    '<div class="pk-panel"><h3>近 8 周完成趋势</h3><div class="pk-trend">' +
    (trendHtml || '<span class="pk-name">暂无数据</span>') + '</div></div>';
}
