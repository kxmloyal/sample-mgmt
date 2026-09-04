// subsystems/projects/backend/routes-graph.js — OA 移植二期批次3：项目关系 + 图谱聚合
// 关系类型枚举（用户确认 5+1+自定义预留）：DEPENDS_ON/DERIVED_FROM/SHARES_MODEL/REPLACES/RELATES/SAME_CUSTOMER/CUSTOM
// SHARES_MODEL 由系统按 project_model_refs 自动推导（虚线边），人工添加的实线边优先展示
const D = require('../../../db');
const perm = require('./permissions');

const RELATION_TYPES = ['DEPENDS_ON', 'DERIVED_FROM', 'SHARES_MODEL', 'REPLACES', 'RELATES', 'SAME_CUSTOMER', 'CUSTOM'];

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 关系列表（登录用户可读）
  app.get('/api/projects/relations', requireAuth, async (req, res) => {
    try { res.json(await D.listRelations(null)); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 添加关系（ADMIN/PM/相关项目 owner/成员均可标注；双方项目须存在且不同）
  app.post('/api/projects/relations', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const fromId = Number(req.body.from_project_id), toId = Number(req.body.to_project_id);
      const relType = String(req.body.relation_type || '').trim().toUpperCase();
      const customType = String(req.body.custom_type || '').trim().slice(0, 50);
      if (!RELATION_TYPES.includes(relType)) return res.status(400).json({ error: 'relation_type 须为 ' + RELATION_TYPES.join('/') });
      if (relType === 'CUSTOM' && !customType) return res.status(400).json({ error: '自定义关系须填 custom_type 名称' });
      if (relType !== 'CUSTOM') { /* 预置类型不接受 custom_type，忽略之 */ }
      if (!fromId || !toId) return res.status(400).json({ error: 'from/to 项目必填' });
      if (fromId === toId) return res.status(400).json({ error: '不能与自身建立关系' });
      const r = await D.withTransaction(async conn => {
        const a = await D.getProject(conn, fromId), b = await D.getProject(conn, toId);
        if (!a || !b) return { status: 404, body: { error: '项目不存在' } };
        // 权限：ADMIN/PM 全局；否则需为 from 或 to 项目的 owner/成员
        if (!perm.isGlobalManager(u.role)) {
          const accA = await perm.getProjectAccess(conn, fromId, u.id);
          const accB = await perm.getProjectAccess(conn, toId, u.id);
          if (!(accA.isOwner || accA.isMember || accB.isOwner || accB.isMember))
            return { status: 403, body: { error: '须为关系双方项目的成员才可标注关系' } };
        }
        const r = await D.addRelation(conn, { from_project_id: fromId, to_project_id: toId, relation_type: relType, custom_type: relType === 'CUSTOM' ? customType : null, note: req.body.note }, u.id);
        await D.addProjectLog(conn, 'relation', fromId, 'CREATE', JSON.stringify({ from: fromId, to: toId, type: relType, custom: customType || undefined, duplicate: r.changed === 0 }), u.id);
        return { status: r.changed > 0 ? 201 : 200, body: { ok: 1, duplicate: r.changed === 0 } };
      });
      res.status(r.status).json(r.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除关系（ADMIN/PM 或关系录入者本人；关系行无 version，按存在性删除）
  app.delete('/api/projects/relations/:rid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const rid = Number(req.params.rid);
      const r = await D.withTransaction(async conn => {
        const rel = await D.getRelation(conn, rid);
        if (!rel) return { status: 404, body: { error: '关系不存在' } };
        if (!perm.isGlobalManager(u.role) && rel.created_by !== u.id)
          return { status: 403, body: { error: '仅管理员/项目经理/关系录入者可删除' } };
        await D.removeRelation(conn, rid);
        await D.addProjectLog(conn, 'relation', rid, 'DELETE', JSON.stringify({ from: rel.from_project_id, to: rel.to_project_id, type: rel.relation_type }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r.status).json(r.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 图谱聚合（一次请求返回全部节点+边；只读无状态；SHARES_MODEL 自动推导）
  app.get('/api/projects/graph', requireAuth, async (req, res) => {
    try {
      const projects = await D.listProjects(null);           // 节点：含 task_count/done_count
      const rels = await D.listRelations(null);              // 人工边
      // 自动推导 SHARES_MODEL：同一机型的项目对（≥1 共享机型即连边）
      const refs = await D.listAllModelRefPairs();
      const byModel = {};
      for (const r of refs) {
        (byModel[r.model_id] = byModel[r.model_id] || []).push(r.project_id);
      }
      const autoPairs = {};
      for (const mid of Object.keys(byModel)) {
        const ps = byModel[mid].sort(function (x, y) { return x - y; });
        for (let i = 0; i < ps.length; i++)
          for (let j = i + 1; j < ps.length; j++) {
            const k = ps[i] + '-' + ps[j];
            if (!autoPairs[k]) autoPairs[k] = { from: ps[i], to: ps[j], models: [] };
            autoPairs[k].models.push(r2m(refs, ps[i], ps[j], mid));
          }
      }
      // 人工 SHARES_MODEL 边优先：已有人工边（任意类型）的节点对，跳过自动推导
      const manualPairKeys = new Set(rels.map(function (r) { return Math.min(r.from_project_id, r.to_project_id) + '-' + Math.max(r.from_project_id, r.to_project_id); }));
      const edges = rels.map(function (r) {
        return { id: r.id, from: r.from_project_id, to: r.to_project_id, type: r.relation_type, custom_type: r.custom_type, note: r.note, auto: false, created_by: r.created_by };
      });
      for (const k of Object.keys(autoPairs)) {
        if (manualPairKeys.has(k)) continue;
        const p = autoPairs[k];
        edges.push({ id: 'auto-' + k, from: p.from, to: p.to, type: 'SHARES_MODEL', custom_type: null, note: '共享机型：' + p.models.join('、'), auto: true });
      }
      res.json({
        nodes: projects.map(function (p) {
          return { id: p.id, name: p.name, status: p.status, task_count: p.task_count, done_count: p.done_count };
        }),
        edges: edges
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

// 从引用对列表取机型 code（helper；找不到时回退 #id）
function r2m(refs, a, b, mid) {
  for (const r of refs) {
    if ((r.project_id === a || r.project_id === b) && r.model_id === Number(mid) && r.model_code) return r.model_code;
  }
  return '#' + mid;
}

module.exports = { register };
