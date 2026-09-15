// subsystems/samples/backend/routes-chain.js — 样品替代链只读接口（2026-09-14 新增）
// GET /api/samples/:id/chain：一次返回该样品所在的整条替代链（链首 → 链尾），供详情弹窗「替代链」Tab 渲染
//   数据来源：samples.replaces / samples.replaced_by —— 仅由 RECREATE 动作成对写入（scan-actions.js 的 RECREATE 分支），
//   故链路数据完整性由既有写流程保证，本接口不做任何写入与订正
//   权限：登录即可（与 GET /api/samples/:id 同口径；链上信息与详情弹窗「全量日志」Tab 同源，不新增信息暴露面）
//   注册顺序：路径为三段 /api/samples/:id/chain，不会被两段的 GET /api/samples/:id 捕获，
//   故注册顺序无约束（区别于一段路径的 storage-map / checkout-users，后者必须先注册）
const D = require('../../../db');
const { asyncHandler } = require('./async-handler');

// 链节点字段白名单：只下发展示所需字段，避免把 samples 全列（含 version/内部字段）直接暴露给前端
const NODE_FIELDS = ['id', 'sample_no', 'name', 'model', 'station', 'status', 'created_at', 'released_at',
  'retired_reason', 'next_inspect_at', 'expected_return_at', 'replaces', 'replaced_by'];

// 截断判定：DAO 侧以 |ord| ≤ 20 收敛；若边界节点仍存在下一跳（ord=20 且有 replaced_by / ord=-20 且有 replaces），
// 说明链更长而被截断（精确判定，不会把「刚好 20 节的完整链」误报为截断）
function isTruncated(nodes) {
  return nodes.some(function (n) {
    return (n.ord === 20 && n.replaced_by) || (n.ord === -20 && n.replaces);
  });
}

function register(app) {
  const requireAuth = app.locals.requireAuth;

  app.get('/api/samples/:id/chain', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    const rows = await D.listSampleChain(s.sample_no);
    const chain = rows.map(function (r) {
      const node = { ord: r.ord, isCurrent: r.id === s.id, soft_deleted: !r.deleted_at ? false : true };
      NODE_FIELDS.forEach(function (k) { node[k] = r[k]; });
      return node;
    });
    res.json({
      current: { id: s.id, sample_no: s.sample_no },
      length: chain.length,
      truncated: isTruncated(chain),
      chain: chain
    });
  }));
}

module.exports = { register };
