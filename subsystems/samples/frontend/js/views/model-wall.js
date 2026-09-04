// model-wall.js — 样品「机型视图」卡片墙（2026-09-05 一期：模式同治具 model-wall，纯前端零后端改动）
// 数据：GET /api/samples/models（机型主数据 code/full_name）
//       + GET /api/samples?model=X&limit=1（现有列表接口取 total 作样品数；机型量级为几十，并发轻量可行，失败显示 — 不阻断）
// 跳转：#/samples?model=<code>（viewSamples 深链预选 f-model 下拉，chips 自动出现机型筛选）
// 入口：样品列表页「机型视图」按钮（hash 路由切换，勿直调本函数——直调不改 hash 会导致后续切换失效，与治具同款坑）
async function viewSampleModelWall() {
  var v = $('#view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
  var models;
  try {
    models = await api('GET', '/api/samples/models');
  } catch (err) { v.innerHTML = '<div class="empty">加载失败：' + e(err.message) + '</div>'; return; }

  // 深链幂等：#/wall?kw=X 支持搜索态直达（预留；当前入口仅 #/wall）
  var kw = '';
  var kwMatch = (location.hash || '').match(/[?&]kw=([^&]+)/);
  if (kwMatch) kw = decodeURIComponent(kwMatch[1]);

  // 并发取每机型样品总数（mutate m.sample_count；null=查询失败）
  await Promise.all(models.map(function (m) {
    return api('GET', '/api/samples?model=' + encodeURIComponent(m.code) + '&limit=1')
      .then(function (r) { m.sample_count = (r && r.total != null) ? r.total : 0; })
      .catch(function () { m.sample_count = null; });
  }));

  var totalSamples = 0, unknown = 0;
  models.forEach(function (m) {
    if (m.sample_count === null) unknown++;
    else totalSamples += m.sample_count;
  });

  var html = '<div class="filters" style="justify-content:space-between">' +
    '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<fluent-button appearance="accent" size="small" onclick="location.hash=\'#/samples\'">列表视图</fluent-button>' +
    '<span class="muted">共 <b>' + models.length + '</b> 个机型 · <b>' + totalSamples + '</b> 件样品' +
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
  window.smwCard = function (m) {
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
