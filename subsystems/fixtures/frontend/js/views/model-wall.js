// model-wall.js — 治具清单「机型视图」卡片墙（方案A：机型卡片 + 点击跳该机型治具列表）
// 数据：GET /api/fixtures/models?view=wall（状态分布/呆滞数/封面图聚合）；跳转：#/list?model=<code>（router.js 深链）
// 卡片点击 → 列表视图并预选机型；列表视图标题栏提供「返回机型视图」。呆滞口径与清单 dormant=1 一致（后端聚合）。
async function renderFixtureModelWall() {
  var v = document.getElementById('view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
  var models;
  try {
    models = await api('GET', '/api/fixtures/models?view=wall');
  } catch (err) { v.innerHTML = '<div class="empty">加载失败：' + e(err.message) + '</div>'; return; }
  window._fxModels = models; // 供清单筛选下拉复用（与 loadFixtureList 的赋值口径一致）

  var totalFixtures = 0, dormantTotal = 0;
  models.forEach(function (m) { totalFixtures += (m.fixture_count || 0); dormantTotal += (m.dormant_count || 0); });

  // 卡片上展示的状态徽章：领用中/已移交/维修相关/待验证（其余状态不逐个罗列，保持信息密度）
  var WALL_STATUSES = ['IN_USE', 'TRANSFERRED', 'VERIFY_PENDING', 'REPAIRING_ME', 'REPAIRING_RD', 'IMPROVING'];
  var WALL_LABELS = { IN_USE: '领用中', TRANSFERRED: '在库', VERIFY_PENDING: '待验证', REPAIRING_ME: 'ME维修', REPAIRING_RD: 'RD维修', IMPROVING: '改善中' };

  var html = '<div class="filters" style="justify-content:space-between">' +
    '<span style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
    '<fluent-button appearance="accent" size="small" onclick="renderFixtureList()">列表视图</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="openFixtureModelsModal()" title="机型管理">机型管理</fluent-button>' +
    '<span class="muted">共 <b>' + models.length + '</b> 个机型 · <b>' + totalFixtures + '</b> 台治具' +
    (dormantTotal > 0 ? ' · <span style="color:var(--warn,#b45309)">呆滞 ' + dormantTotal + '</span>' : '') + '</span></span>' +
    '<fluent-text-field placeholder="搜索机型…" style="max-width:220px" oninput="fxwFilter(this.value)"></fluent-text-field></div>';
  html += '<div id="fx-wall-grid" class="fx-wall-grid"></div>';

  // 卡片模板（独立渲染函数便于搜索过滤局部重绘）
  window._fxwData = models;
  window._fxwKeyword = '';
  window.fxwCard = function (m) {
    var badges = WALL_STATUSES.filter(function (k) { return m.status_stats && m.status_stats[k]; })
      .map(function (k) { return '<span class="badge">' + (WALL_LABELS[k] || k) + ' ' + m.status_stats[k] + '</span>'; }).join('');
    var cover = m.cover_photo
      ? '<img src="/uploads/fixtures/' + e(m.cover_photo) + '" loading="lazy" onerror="this.remove()"/>'
      : '<div class="fx-wall-cover-empty">▦</div>';
    return '<div class="fx-wall-card' + (m.dormant_count > 0 ? ' has-dormant' : '') + '" onclick="location.hash=\'#/list?model=' + encodeURIComponent(m.code) + '\'">' +
      '<div class="fx-wall-cover">' + cover + '</div>' +
      '<div class="fx-wall-body"><div class="fx-wall-code"><b>' + e(m.code) + '</b>' +
      (m.dormant_count > 0 ? '<span class="badge-dormant">呆滞 ' + m.dormant_count + '</span>' : '') + '</div>' +
      '<div class="fx-wall-name" title="' + e(m.full_name) + '">' + e(m.full_name || '—') + '</div>' +
      '<div class="fx-wall-count">治具 <b>' + (m.fixture_count || 0) + '</b> 台</div>' +
      (badges ? '<div class="fx-wall-badges">' + badges + '</div>' : '') +
      '</div></div>';
  };
  window.fxwRender = function () {
    var kw = (window._fxwKeyword || '').toLowerCase();
    var list = window._fxwData.filter(function (m) {
      return !kw || (m.code + ' ' + (m.full_name || '')).toLowerCase().indexOf(kw) !== -1;
    });
    document.getElementById('fx-wall-grid').innerHTML = list.length
      ? list.map(window.fxwCard).join('')
      : '<div class="empty" style="grid-column:1/-1">未找到匹配机型</div>';
  };
  window.fxwFilter = function (val) {
    window._fxwKeyword = (val || '').trim();
    window.fxwRender();
  };

  v.innerHTML = html;
  window.fxwRender();
}
