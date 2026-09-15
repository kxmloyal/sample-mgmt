// subsystems/samples/frontend/js/views/chain.js — 样品替代链 Tab（2026-09-14 新增）
// 数据来源：GET /api/samples/:id/chain（只读；后端沿 samples.replaces / replaced_by 双向递归，一次取回整链并按 ord 升序）
// 挂载方式：detail.js 把 'chain' 登记进 openDetailModal 的 lazyTabs，并在此 Tab 渲染完成后调 loadSampleChain 惰性拉取
// 依赖（bundle 顺序保证已定义）：e()（shared/utils.js）、api()（api-base.js）、statusBadge()（本子系统 api.js）、
//   _sdm / viewDetail() / _detailDirty（detail.js）。函数声明在拼接后的单一 bundle 内提升，故文件顺序不影响调用。
// 边界：length<2 显示「无替代关系」；truncated 显示截断提示；软删节点标「已删除」；请求失败显示失败态；Tab 已切走丢弃过期渲染

// 骨架（chain 已在 detail.js 的 lazyTabs 中，先给骨骼一帧再构建实际 DOM）
function _chainSkeleton() {
  var row = '<div style="display:flex;gap:10px;margin-bottom:12px"><div class="sk" style="width:22px;height:22px;border-radius:50%;flex:none"></div><div style="flex:1"><div class="sk" style="height:13px;width:42%;margin-bottom:6px"></div><div class="sk" style="height:11px;width:66%"></div></div></div>';
  return '<div style="padding:14px 16px">' + row.repeat(3) + '</div>';
}

// Tab 容器（内容由 loadSampleChain 异步填充）
function _buildChainTab(s, id) {
  return '<div id="detail-chain" class="sm-chain"><div class="muted">加载替代链…</div></div>';
}

// 单节点渲染：序号 + 编号（非当前节点可点击跳转）+ 状态徽标 + 标记 + 时间/原因
function _chainNode(n, idx) {
  var cls = 'sm-chain-node' + (n.isCurrent ? ' current' : '') + (n.soft_deleted ? ' gone' : '');
  var h = '<div class="' + cls + '"><span class="sm-chain-idx">' + idx + '</span><div class="sm-chain-main">';
  h += '<div class="sm-chain-head">';
  h += n.isCurrent ? '<b>' + e(n.sample_no) + '</b>'
    : '<a class="link" onclick="chainNodeJump(' + n.id + ')">' + e(n.sample_no) + '</a>';
  h += statusBadge(n);
  if (n.isCurrent) h += '<span class="sm-chain-cur">当前</span>';
  if (n.soft_deleted) h += '<span class="sm-chain-gone">已删除</span>';
  h += '</div><div class="sm-chain-meta">' + _chainMeta(n) + '</div></div></div>';
  return h;
}

// 节点副信息：优先「发行日期 + 作废原因」，二者皆无时退回创建日期
function _chainMeta(n) {
  var parts = [];
  if (n.released_at) parts.push('发行 ' + String(n.released_at).slice(0, 10));
  if (n.retired_reason) parts.push('作废原因：' + e(n.retired_reason));
  if (!parts.length && n.created_at) parts.push('创建 ' + String(n.created_at).slice(0, 10));
  return parts.length ? parts.join(' · ') : '—';
}

// 替代链加载与渲染（onTabRendered 触发）
async function loadSampleChain(id) {
  if (!document.getElementById('detail-chain')) return;
  var data = null, failed = false;
  try { data = await api('GET', '/api/samples/' + id + '/chain'); } catch (err) { failed = true; }
  var box = document.getElementById('detail-chain');
  if (!box) return;                                    // 响应到达时 Tab 已切换，丢弃过期渲染
  if (failed) { box.innerHTML = '<div class="muted">替代链加载失败</div>'; return; }
  var list = (data && data.chain) || [];
  if (list.length < 2) { box.innerHTML = '<div class="muted">该样品当前没有替代关系</div>'; return; }
  var h = data.truncated ? '<div class="sm-chain-warn">链条过长，仅显示前 20 节</div>' : '';
  for (var i = 0; i < list.length; i++) {
    if (i) h += '<div class="sm-chain-link"><span>被替代</span></div>';
    h += _chainNode(list[i], i + 1);
  }
  box.innerHTML = h;
}

// 链节点点击：先清未保存态并关掉当前弹窗（避免叠层，同 goScanFromDetail 的清栈思路），再开目标样品详情
function chainNodeJump(id) {
  _detailDirty = false;
  _sdm.close();
  viewDetail(id);
}
