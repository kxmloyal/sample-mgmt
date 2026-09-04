// subsystems/projects/backend/routes-extras.js — OA 能力移植：项目预算/成本扩展（1:1 扩展表）
// 方案A一期纯增量：不动在线 projects 表，预算存 project_extras；GET 项目详情时可 LEFT JOIN 透出
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 读取项目预算/成本（登录用户可读，与项目详情一致；无配置行返回空对象）
  app.get('/api/projects/:id/extras', requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const p = await D.getProject(null, id);
      if (!p) return res.status(404).json({ error: '项目不存在' });
      const extras = await D.getProjectExtras(null, id);
      res.json(extras || { project_id: id, budget: null, actual_cost: null, project_type: '', priority: 'M' });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 保存预算/成本（ADMIN/PM/owner；金额非负数校验；幂等 upsert）
  app.put('/api/projects/:id/extras', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const body = req.body || {};
      for (const k of ['budget', 'actual_cost']) {
        if (body[k] !== undefined && body[k] !== null && body[k] !== '') {
          const n = Number(body[k]);
          if (!isFinite(n) || n < 0) return res.status(400).json({ error: k + ' 须为非负数字' });
          body[k] = n;
        }
      }
      if (body.priority && !['H', 'M', 'L'].includes(body.priority))
        return res.status(400).json({ error: 'priority 仅允许 H/M/L' });
      const r2 = await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return { status: 404, body: { error: '项目不存在' } };
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权编辑预算' } };
        await D.saveProjectExtras(conn, id, body, u.id);
        await D.addProjectLog(conn, 'project', id, 'UPDATE_EXTRAS', JSON.stringify({
          budget: body.budget !== undefined ? body.budget : null,
          actual_cost: body.actual_cost !== undefined ? body.actual_cost : null
        }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
