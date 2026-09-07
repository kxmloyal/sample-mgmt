// graph-cluster.js — 方案B-⑨ 图谱聚簇（路径2 借鉴 GraphVis 设计，原生实现零依赖）
// 簇模式：mega-node（聚合节点，尺寸=成员数+完成率环）→ 点击下钻展开成员 → 邻居高亮
// 簇算法（纯前端，数据全部来自现有 /api/projects/graph，无后端改动）：
//   ① 状态簇：按项目 status（ACTIVE/DONE）分组——看健康度
//   ② 连通分量簇：union-find 按 SHARES_MODEL（含 auto）+ 其它人工边连通——看机型族谱
var _grMode = 'flat';            // flat | status | component
var _grCluster = null;           // 聚簇结果缓存
var _grExpanded = new Set();     // 已下钻的簇 id
var _grHighlightId = null;       // 邻居高亮的项目 id

// === 簇计算（在 grDraw 前调用；_gr 已就绪） ===
function grComputeClusters() {
  const nodes = _gr.nodes, edges = _gr.edges;
  if (_grMode === 'status') {
    const by = {};
    nodes.forEach(function (n) { (by[n.status] = by[n.status] || []).push(n); });
    _grCluster = Object.keys(by).map(function (k) {
      const members = by[k];
      return { id: 'cs-' + k, label: k === 'ACTIVE' ? '进行中项目' : '已完成项目', members: members.map(m => m.id) };
    });
  } else if (_grMode === 'component') {
    // union-find 连通分量（所有边参与：共享机型边让同机型项目聚成族谱）
    const parent = {};
    nodes.forEach(function (n) { parent[n.id] = n.id; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    edges.forEach(function (e) {
      const a = find(e.from), b = find(e.to);
      if (a !== b) parent[a] = b;
    });
    const by = {};
    nodes.forEach(function (n) { (by[find(n.id)] = by[find(n.id)] || []).push(n); });
    const big = Object.keys(by).filter(function (k) { return by[k].length >= 2; }); // 单体不成簇
    _grCluster = big.map(function (k, i) {
      const members = by[k];
      // 簇名：取共享机型推导边 note 里的首个机型 code；找不到用「族谱 N」
      let label = '族谱 ' + (i + 1);
      for (const e of edges) {
        if (e.type === 'SHARES_MODEL' && (members.some(m => m.id === e.from) )) {
          const m = (e.note || '').match(/共享机型：([^、]+)/);
          if (m) { label = '机型 ' + m[1]; break; }
        }
      }
      return { id: 'cc-' + k, label: label, members: members.map(m => m.id) };
    });
  } else { _grCluster = null; }
}

// 成员是否属于已展开簇（展开的成员按普通节点绘制）
function grMemberOfExpanded(nid) {
  if (!_grCluster) return false;
  return _grCluster.some(function (c) { return _grExpanded.has(c.id) && c.members.indexOf(nid) >= 0; });
}

// 待绘制的 mega 节点（未展开的簇）
function grMegaNodes() {
  if (!_grCluster) return [];
  return _grCluster.filter(function (c) { return !_grExpanded.has(c.id); }).map(function (c) {
    const ms = c.members.map(function (id) { return _gr.nodes.find(function (n) { return n.id === id; }); }).filter(Boolean);
    const tasks = ms.reduce(function (s, m) { return s + (m.task_count || 0); }, 0);
    const done = ms.reduce(function (s, m) { return s + (m.done_count || 0); }, 0);
    const pct = tasks ? Math.round(done / tasks * 100) : 0;
    const activeN = ms.filter(function (m) { return m.status === 'ACTIVE'; }).length;
    return { id: c.id, label: c.label, size: ms.length, pct: pct, active: activeN, members: c.members };
  });
}
