// graph.js — OA 移植二期批次3：项目关系图谱（力导向布局自实现 + SVG，无第三方依赖）
// 节点=项目（状态色 + 完成率环），边=关系（颜色/虚实区分）；SHARES_MODEL 自动推导边为虚线灰
// 交互：拖拽节点 / 点击节点摘要卡 / 点击边说明 / 类型过滤 / PNG 导出
var GR_TYPE_CN = { DEPENDS_ON: '依赖', DERIVED_FROM: '衍生', SHARES_MODEL: '共享机型', REPLACES: '替代', RELATES: '关联', SAME_CUSTOMER: '同一客户', CUSTOM: '自定义' };
var GR_TYPE_COLOR = { DEPENDS_ON: '#dc2626', DERIVED_FROM: '#7c3aed', SHARES_MODEL: '#94a3b8', REPLACES: '#ea580c', RELATES: '#0891b2', SAME_CUSTOMER: '#16a34a', CUSTOM: '#6366f1' };
var GR_STATUS_COLOR = { ACTIVE: '#2563eb', DONE: '#059669' };
var _gr = null; // 图数据缓存 {nodes, edges, pos, fixed}

async function renderGraph() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="grAddRel()">标注关系</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="renderGraph()">刷新</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="grExport()">导出 PNG</fluent-button>' +
    '<span id="gr-filters" style="margin-left:8px"></span></div>' +
    '<div style="position:relative">' +
    '<div id="gr-svg-box" style="border:1px solid var(--border,#e2e8f0);border-radius:8px;background:#fff;overflow:hidden"></div>' +
    '<div id="gr-card" style="display:none;position:absolute;right:12px;top:12px;width:260px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.1);padding:12px;font-size:13px;z-index:5"></div></div>';
  const g = await api('GET', PApi.graph);
  _gr = g;
  _gr.pos = {};
  // 初始布局：环形（力导向从此收敛）
  const R = Math.min(280, 120 + g.nodes.length * 6), cx = 420, cy = 300;
  g.nodes.forEach(function (n, i) {
    const a = (2 * Math.PI * i) / Math.max(1, g.nodes.length) - Math.PI / 2;
    _gr.pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), vx: 0, vy: 0 };
  });
  // 类型过滤器
  const types = [];
  g.edges.forEach(function (e) { if (types.indexOf(e.type) < 0) types.push(e.type); });
  $('#gr-filters').innerHTML = types.map(function (t) {
    return '<label style="font-size:12px;margin-right:10px;color:' + GR_TYPE_COLOR[t] + '"><input type="checkbox" checked onchange="grDraw()" data-gr-type="' + t + '"> ' + (GR_TYPE_CN[t] || t) + '</label>';
  }).join('');
  grSimulate();
  grDraw();
  _bindGraphClicks();
}

// 力导向模拟（斥力 + 弹簧 + 向心，60 轮收敛；仅初始计算，拖拽后局部不重算）
function grSimulate() {
  const nodes = _gr.nodes, pos = _gr.pos, edges = _gr.edges;
  for (let it = 0; it < 60; it++) {
    nodes.forEach(function (n) {
      const p = pos[n.id];
      // 向心
      p.vx += (420 - p.x) * 0.002; p.vy += (300 - p.y) * 0.002;
      // 斥力
      nodes.forEach(function (m) {
        if (m.id === n.id) return;
        const q = pos[m.id];
        let dx = p.x - q.x, dy = p.y - q.y;
        let d2 = dx * dx + dy * dy || 1;
        if (d2 < 40000) { const f = 3000 / d2; p.vx += dx / Math.sqrt(d2) * f; p.vy += dy / Math.sqrt(d2) * f; }
      });
    });
    // 弹簧
    edges.forEach(function (e) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 150) * 0.01;
      a.vx += dx / d * f; a.vy += dy / d * f;
      b.vx -= dx / d * f; b.vy -= dy / d * f;
    });
    nodes.forEach(function (n) {
      const p = pos[n.id];
      p.x += Math.max(-8, Math.min(8, p.vx)); p.y += Math.max(-8, Math.min(8, p.vy));
      p.vx *= 0.85; p.vy *= 0.85;
      p.x = Math.max(40, Math.min(800, p.x)); p.y = Math.max(40, Math.min(560, p.y));
    });
  }
}

function grActiveTypes() {
  return new Set(Array.prototype.slice.call(document.querySelectorAll('[data-gr-type]')).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.grType; }));
}

function grDraw() {
  if (!_gr) return;
  const box = $('#gr-svg-box');
  const W = 840, H = 600;
  const active = grActiveTypes();
  let edges = '', nodes = '';
  _gr.edges.forEach(function (e) {
    if (!active.has(e.type)) return;
    const a = _gr.pos[e.from], b = _gr.pos[e.to];
    if (!a || !b) return;
    const color = GR_TYPE_COLOR[e.type] || '#6366f1';
    const dash = e.type === 'SHARES_MODEL' ? 'stroke-dasharray="6,4"' : '';
    edges += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + color + '" stroke-width="' + (e.auto ? 1.2 : 2) + '" ' + dash + ' opacity="' + (e.auto ? .5 : .8) + '" style="cursor:pointer" ' +
      'data-gr-edge="' + e.id + '" data-gr-edge-info="' + esc((GR_TYPE_CN[e.type] || e.type) + (e.custom_type ? '：' + e.custom_type : '') + '（' + (e.note || '无备注') + '）') + '" />';
  });
  _gr.nodes.forEach(function (n) {
    const p = _gr.pos[n.id];
    if (!p) return;
    const pct = n.task_count ? Math.round((n.done_count / n.task_count) * 100) : 0;
    const color = GR_STATUS_COLOR[n.status] || '#64748b';
    // 节点：圆 + 完成率环（简化为底部弧线粗细）+ 名称
    nodes += '<g transform="translate(' + p.x + ',' + p.y + ')" style="cursor:grab" data-gr-node="' + n.id + '">' +
      '<circle r="26" fill="#fff" stroke="' + color + '" stroke-width="2.5"/>' +
      '<circle r="26" fill="' + color + '" fill-opacity="' + (0.08 + pct / 200) + '"/>' +
      '<text text-anchor="middle" dy="4" font-size="10" fill="' + color + '" font-weight="bold">' + pct + '%</text>' +
      '<text text-anchor="middle" y="44" font-size="12" fill="#334155">' + esc(n.name.length > 10 ? n.name.slice(0, 10) + '…' : n.name) + '</text>' +
      '<title>' + esc(n.name) + ' · ' + (n.status === 'ACTIVE' ? '进行中' : '已完成') + ' · 任务 ' + n.done_count + '/' + n.task_count + '</title></g>';
  });
  box.innerHTML = '<svg id="gr-svg" width="' + W + '" height="' + H + '" viewBox="0 0 840 600">' + edges + nodes + '</svg>' +
    (_gr.nodes.length ? '' : '<div style="padding:24px;color:#94a3b8">暂无项目</div>');
  _bindGraphClicks();
}

function _bindGraphClicks() {
  const svg = $('#gr-svg');
  if (!svg) return;
  // 节点点击 → 摘要卡
  svg.querySelectorAll('[data-gr-node]').forEach(function (gEl) {
    let moved = false;
    gEl.addEventListener('mousedown', function () { moved = false; });
    gEl.addEventListener('mousemove', function () { moved = true; });
    gEl.addEventListener('click', function () { if (!moved) grNodeCard(Number(gEl.dataset.grNode)); });
    // 拖拽
    gEl.addEventListener('mousedown', function (ev) {
      const id = Number(gEl.dataset.grNode);
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / 840;
      function mm(e) {
        const p = _gr.pos[id];
        p.x = (e.clientX - svgRect.left) / scale;
        p.y = (e.clientY - svgRect.top) / scale;
        grDraw();
      }
      function mu() { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  });
  // 边点击 → 说明
  svg.querySelectorAll('[data-gr-edge]').forEach(function (l) {
    l.addEventListener('click', function () {
      const card = $('#gr-card');
      card.innerHTML = '<b>关系</b><div style="margin-top:6px;color:#475569">' + l.dataset.grEdgeInfo + '</div>' +
        (l.dataset.grEdge.indexOf('auto-') !== 0 ? '<button style="margin-top:8px;font-size:12px" onclick="grDelRel(' + Number(l.dataset.grEdge) + ')">删除此关系</button>' : '<div class="muted" style="font-size:11px;margin-top:6px">系统自动推导边，无需删除</div>');
      card.style.display = 'block';
    });
  });
}

function grNodeCard(id) {
  const n = _gr.nodes.find(function (x) { return x.id === id; });
  if (!n) return;
  const rels = _gr.edges.filter(function (e) { return e.from === id || e.to === id; });
  const card = $('#gr-card');
  card.innerHTML = '<b style="color:var(--brand,#2563eb)">' + esc(n.name) + '</b>' +
    '<div style="margin:6px 0;color:#64748b">' + (n.status === 'ACTIVE' ? '进行中' : '已完成') + ' · 任务 ' + n.done_count + '/' + n.task_count + '（' + (n.task_count ? Math.round(n.done_count / n.task_count * 100) : 0) + '%）</div>' +
    (rels.length ? '<div style="border-top:1px solid #f1f5f9;padding-top:6px">' + rels.map(function (e) {
      const other = _gr.nodes.find(function (x) { return x.id === (e.from === id ? e.to : e.from); });
      return '<div style="font-size:12px;margin:2px 0"><span style="color:' + (GR_TYPE_COLOR[e.type] || '#666') + '">●</span> ' + (GR_TYPE_CN[e.type] || e.type) + (e.custom_type ? '：' + esc(e.custom_type) : '') + ' → ' + esc(other ? other.name : '#' + (e.from === id ? e.to : e.from)) + (e.note ? ' <span class="muted">(' + esc(e.note) + ')</span>' : '') + '</div>';
    }).join('') + '</div>' : '') +
    '<div style="margin-top:8px"><button style="font-size:12px" onclick="location.hash=\'#/list?project=' + id + '\'">查看任务</button> ' +
    '<button style="font-size:12px" onclick="grAddRel(' + id + ')">标注关系</button> ' +
    '<button style="font-size:12px" onclick="$(\'#gr-card\').style.display=\'none\'">关闭</button></div>';
  card.style.display = 'block';
}

async function grAddRel(fromPid) {
  const projects = await api('GET', PApi.projects());
  const opt = function (sel) {
    return projects.map(function (p) { return '<fluent-option value="' + p.id + '"' + (p.id === fromPid ? ' selected' : '') + '>' + esc(p.name) + '</fluent-option>'; }).join('');
  };
  openModal('标注项目关系',
    '<div class="pk-form">' +
    '<label>源项目 *</label><fluent-select id="gr-from">' + opt(fromPid) + '</fluent-select>' +
    '<label>目标项目 *（关系方向：源 → 目标）</label><fluent-select id="gr-to">' + opt() + '</fluent-select>' +
    '<label>关系类型 *</label><fluent-select id="gr-type">' + Object.keys(GR_TYPE_CN).map(function (k) {
      return '<fluent-option value="' + k + '"' + (k === 'DEPENDS_ON' ? ' selected' : '') + '>' + (k === 'CUSTOM' ? '自定义…' : GR_TYPE_CN[k]) + '</fluent-option>';
    }).join('') + '</fluent-select>' +
    '<div id="gr-custom-box" style="display:none"><label>自定义关系名称 *</label><fluent-text-field id="gr-custom" placeholder="如：同一产线"></fluent-text-field></div>' +
    '<label>备注</label><fluent-text-field id="gr-note"></fluent-text-field>' +
    '<div class="muted" style="font-size:12px">「共享机型」通常由系统按引用机型自动推导，无需手工标注；双方项目成员均可标注。</div></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="grAddRelSave()">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
  $('#gr-type').addEventListener('change', function () {
    $('#gr-custom-box').style.display = this.value === 'CUSTOM' ? 'block' : 'none';
  });
}
async function grAddRelSave() {
  const d = {
    from_project_id: Number($('#gr-from').value), to_project_id: Number($('#gr-to').value),
    relation_type: $('#gr-type').value, custom_type: $('#gr-custom') ? $('#gr-custom').value : '', note: $('#gr-note').value.trim()
  };
  if (d.from_project_id === d.to_project_id) return showToast('不能与自身建立关系', 'err');
  if (d.relation_type === 'CUSTOM' && !d.custom_type.trim()) return showToast('请填写自定义关系名称', 'err');
  try {
    const r = await api('POST', PApi.relations, d);
    showToast(r.duplicate ? '该关系已存在' : '已标注');
    pCloseModal(); renderGraph();
  } catch (e) { showToast(e.message, 'err'); }
}
async function grDelRel(rid) {
  if (!confirm('确认删除该关系？')) return;
  try { await api('DELETE', PApi.relation(rid)); showToast('已删除'); $('#gr-card').style.display = 'none'; renderGraph(); }
  catch (e) { showToast(e.message, 'err'); }
}
// PNG 导出（SVG 序列化 → canvas → 下载）
function grExport() {
  const svg = $('#gr-svg');
  if (!svg) return showToast('无图可导出', 'err');
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = function () {
    const c = document.createElement('canvas');
    c.width = 840; c.height = 600;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 840, 600);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.download = 'project-graph-' + new Date().toISOString().slice(0, 10) + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}
