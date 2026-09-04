// model-wall.js — 样品「机型视图」卡片墙（2026-09-05 一期落地 + 二期聚合升级）
// 二期：优先 GET /api/samples/models?view=wall（后端聚合：样品数/复检逾期/领用超时/状态分布/封面图，60s 字典缓存，
//       机型写操作即时失效）；旧后端（未重启、忽略 view 参数）返回纯主数据数组 → 自动回退一期并发计数渲染，行为兼容
// 跳转：#/samples?model=<code>（viewSamples 深链预选 f-model 下拉，chips 自动出现机型筛选）
// 入口：样品列表页「机型视图」按钮 + 导航（hash 路由切换，勿直调本函数——直调不改 hash 会导致后续切换失效，与治具同款坑）
// 状态徽章口径：IN_CUSTODY 保管中 / CHECKED_OUT 领用中 / RETURNING 退回审核中（流转态）；逾期红标与看板/列表逾期口径一致
async function viewSampleModelWall() {
  var v = $('#view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';

  // 二期聚合数据（后端就绪时使用；结构：{code,full_name,sample_count,overdue_count,checkout_overdue_count,status_stats,cover}）
  var wall = null;
  try {
    var wr = await api('GET', '/api/samples/models?view=wall');
    // 旧后端忽略 view 参数 → 返回 [{code,full_name}]（无 sample_count）→ 视为不可用，走一期回退
    if (Array.isArray(wr) && wr.length && wr[0] && typeof wr[0].sample_count === 'number') wall = wr;
  } catch (_) {}

  var models;
  var rich = !!wall;
  if (rich) {
    models = wall;
  } else {
    // 一期回退：主数据 + 并发轻量计数（失败显示 — 不阻断）
    try {
      models = await api('GET', '/api/samples/models');
    } catch (err) { v.innerHTML = '<div class="empty">加载失败：' + e(err.message) + '</div>'; return; }
    await Promise.all(models.map(function (m) {
      return api('GET', '/api/samples?model=' + encodeURIComponent(m.code) + '&limit=1')
        .then(function (r) { m.sample_count = (r && r.total != null) ? r.total : 0; })
        .catch(function () { m.sample_count = null; });
    }));
  }

  // 深链幂等：#/wall?kw=X 支持搜索态直达（预留；当前入口仅 #/wall）
  var kw = '';
  var kwMatch = (location.hash || '').match(/[?&]kw=([^&]+)/);
  if (kwMatch) kw = decodeURIComponent(kwMatch[1]);

  var totalSamples = 0, unknown = 0, overdueTotal = 0, checkoutOverdueTotal = 0;
  models.forEach(function (m) {
    if (m.sample_count === null || m.sample_count === undefined) unknown++;
    else totalSamples += m.sample_count;
    overdueTotal += (m.overdue_count || 0);
    checkoutOverdueTotal += (m.checkout_overdue_count || 0);
  });

  var WALL_STATUSES = ['IN_CUSTODY', 'CHECKED_OUT', 'RETURNING'];
  var WALL_LABELS = { IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中' };

  var html = '<div class="filters" style="justify-content:space-between">' +
    '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<fluent-button appearance="accent" size="small" onclick="location.hash=\'#/samples\'">列表视图</fluent-button>' +
    '<span class="muted">共 <b>' + models.length + '</b> 个机型 · <b>' + totalSamples + '</b> 件样品' +
    (overdueTotal > 0 ? ' · <span style="color:#b91c1c">复检逾期 ' + overdueTotal + '</span>' : '') +
    (checkoutOverdueTotal > 0 ? ' · <span style="color:#c2410c">领用超时 ' + checkoutOverdueTotal + '</span>' : '') +
    (unknown > 0 ? ' · <span title="部分机型计数查询失败">' + unknown + ' 个机型计数不可用</span>' : '') + '</span></span>' +
    '<fluent-text-field placeholder="搜索机型…" style="max-width:220px" oninput="smwFilter(this.value)"></fluent-text-field></div>';
  html += '<div id="smw-grid" class="smw-grid"></div>';

  if (!models.length) {
    v.innerHTML = '<div class="empty">暂无机型' +
      ((me.role === 'RD' || me.role === 'ADMIN') ? '，请先到「机型列表」新增' : '') + '</div>';
    return;
  }

  // 卡片渲染 + 搜索过滤（独立函数便于局部重绘，命名 smw* 避免与治具 fxw* 混淆）
  window._smwData = models;
  window._smwKeyword = kw;
  window.smwCard = rich ? function (m) {
    var badges = WALL_STATUSES.filter(function (k) { return m.status_stats && m.status_stats[k]; })
      .map(function (k) { return '<span class="smw-badge">' + WALL_LABELS[k] + ' ' + m.status_stats[k] + '</span>'; }).join('');
    var cover = m.cover
      ? '<img src="' + e(m.cover.photo) + '" loading="lazy" onerror="this.remove()"/>'
      : '▦';
    return '<div class="smw-card' + (m.overdue_count > 0 ? ' has-overdue' : '') + '" onclick="location.hash=\'#/samples?model=' + encodeURIComponent(m.code) + '\'" title="查看该机型全部样品">' +
      '<div class="smw-cover">' + cover +
      (m.overdue_count > 0 ? '<span class="smw-flag">复检逾期 ' + m.overdue_count + '</span>' : '') + '</div>' +
      '<div class="smw-body"><div class="smw-code"><b>' + e(m.code) + '</b>' +
      (m.checkout_overdue_count > 0 ? '<span class="smw-flag-inline">超时未还 ' + m.checkout_overdue_count + '</span>' : '') + '</div>' +
      '<div class="smw-name" title="' + e(m.full_name) + '">' + e(m.full_name || '—') + '</div>' +
      '<div class="smw-count">样品 <b>' + (m.sample_count || 0) + '</b> 件</div>' +
      (badges ? '<div class="smw-badges">' + badges + '</div>' : '') +
      '</div></div>';
  } : function (m) {
    var count = (m.sample_count === null) ? '—' : m.sample_count;
    return '<div class="smw-card" onclick="location.hash=\'#/samples?model=' + encodeURIComponent(m.code) + '\'" title="查看该机型全部样品">' +
      '<div class="smw-cover">▦</div>' +
      '<div class="smw-body"><div class="smw-code"><b>' + e(m.code) + '</b></div>' +
      '<div class="smw-name" title="' + e(m.full_name) + '">' + e(m.full_name || '—') + '</div>' +
      '<div class="smw-count">样品 <b>' + count + '</b> 件</div>' +
      '</div></div>';
  };
  window.smwRender = function () {
    var kw = (window._smwKeyword || '').toLowerCase();
    var list = window._smwData.filter(function (m) {
      return !kw || (m.code + ' ' + (m.full_name || '')).toLowerCase().indexOf(kw) !== -1;
    });
    document.getElementById('smw-grid').innerHTML = list.length
      ? list.map(window.smwCard).join('')
      : '<div class="empty" style="grid-column:1/-1">未找到匹配机型</div>';
  };
  window.smwFilter = function (val) {
    window._smwKeyword = (val || '').trim();
    window.smwRender();
  };

  v.innerHTML = html;
  if (window._smwKeyword) {
    var box = v.querySelector('fluent-text-field');
    if (box) box.value = window._smwKeyword;
  }
  window.smwRender();
}
