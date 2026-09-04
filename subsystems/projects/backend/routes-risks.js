// subsystems/projects/backend/routes-risks.js — OA 能力移植：风险 CRUD + 解决闭环（CAS）
// 方案A一期纯增量：新文件不改现有路由；注册顺序在 routes-projects 之前
// 权限对齐：写 = ADMIN/PM 或项目 owner（风险识别放宽到项目成员，与建任务一致）
const D = require('../../../db');
const perm = require('./permissions');

// 风险枚举校验（severity/probability 仅 H/M/L；risk_type 白名单）
const SEVERITY = ['H', 'M', 'L'];
const RISK_TYPES = ['schedule', 'quality', 'resource', 'tech', 'other'];

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 风险列表
  app.get('/api/projects/:id/risks', requireAuth, async (req, res) => {
    try {
      const list = await D.listRisks(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 识别风险（ADMIN/PM/owner/项目成员；identified_by=当前用户，防伪造）
  app.post('/api/projects/:id/risks', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const riskName = (req.body.risk_name || '').trim();
      if (!riskName) return res.status(400).json({ error: '风险名称必填' });
      if (req.body.severity && !SEVERITY.includes(req.body.severity))
        return res.status(400).json({ error: 'severity 仅允许 H/M/L' });
      if (req.body.probability && !SEVERITY.includes(req.body.probability))
        return res.status(400).json({ error: 'probability 仅允许 H/M/L' });
      if (req.body.risk_type && !RISK_TYPES.includes(req.body.risk_type))
        return res.status(400).json({ error: 'risk_type 非法' });
      const r2 = await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return { status: 404, body: { error: '项目不存在' } };
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner && !acc.isMember)
          return { status: 403, body: { error: '非项目成员无权识别风险' } };
        const r = await D.createRisk({
          project_id: id, risk_name: riskName, description: req.body.description,
          risk_type: req.body.risk_type, severity: req.body.severity, probability: req.body.probability,
          impact: req.body.impact, mitigation: req.body.mitigation,
          identified_by: u.id, created_by: u.id
        }, conn);
        await D.addProjectLog(conn, 'risk', r.id, 'CREATE', JSON.stringify({ risk_name: riskName, project_id: id }), u.id);
        return { status: 201, body: { id: r.id } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑风险（仅 OPEN 可编辑；CAS；ADMIN/PM/owner）
  app.put('/api/projects/risks/:rid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const rid = Number(req.params.rid);
      if (req.body.status !== undefined) return res.status(400).json({ error: '状态请通过解决操作变更' });
      if (req.body.severity && !SEVERITY.includes(req.body.severity))
        return res.status(400).json({ error: 'severity 仅允许 H/M/L' });
      if (req.body.probability && !SEVERITY.includes(req.body.probability))
        return res.status(400).json({ error: 'probability 仅允许 H/M/L' });
      if (req.body.risk_type && !RISK_TYPES.includes(req.body.risk_type))
        return res.status(400).json({ error: 'risk_type 非法' });
      const r2 = await D.withTransaction(async conn => {
        const r0 = await D.getRisk(conn, rid);
        if (!r0) return { status: 404, body: { error: '风险不存在' } };
        const acc = await perm.getProjectAccess(conn, r0.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权编辑风险' } };
        const r = await D.updateRisk(conn, rid, {
          risk_name: (req.body.risk_name || r0.risk_name).trim(),
          description: req.body.description !== undefined ? req.body.description : r0.description,
          risk_type: req.body.risk_type || r0.risk_type,
          severity: req.body.severity || r0.severity,
          probability: req.body.probability || r0.probability,
          impact: req.body.impact !== undefined ? req.body.impact : r0.impact,
          mitigation: req.body.mitigation !== undefined ? req.body.mitigation : r0.mitigation
        }, Number(req.body.version));
        if (r.changed === 0) {
          const fresh = await D.getRisk(conn, rid);
          if (fresh && fresh.status === 'RESOLVED') return { status: 400, body: { error: '风险已解决，禁止编辑' } };
          return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        }
        await D.addProjectLog(conn, 'risk', rid, 'UPDATE', JSON.stringify({ fields: Object.keys(req.body).filter(k => k !== 'version') }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 解决风险（CAS：仅 OPEN 可解决；resolved_by=当前用户）
  app.post('/api/projects/risks/:rid/resolve', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const rid = Number(req.params.rid);
      const r2 = await D.withTransaction(async conn => {
        const r0 = await D.getRisk(conn, rid);
        if (!r0) return { status: 404, body: { error: '风险不存在' } };
        const acc = await perm.getProjectAccess(conn, r0.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权解决风险' } };
        const r = await D.resolveRisk(conn, rid, u.id, Number(req.body && req.body.version));
        if (r.changed === 0) {
          const fresh = await D.getRisk(conn, rid);
          if (fresh && fresh.status === 'RESOLVED') return { status: 400, body: { error: '风险已解决' } };
          return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        }
        await D.addProjectLog(conn, 'risk', rid, 'STATUS_CHANGE', JSON.stringify({ from: 'OPEN', to: 'RESOLVED' }), u.id);
        const nr = await D.getRisk(conn, rid);
        return { status: 200, body: nr };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除风险（ADMIN/PM/owner）
  app.delete('/api/projects/risks/:rid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const rid = Number(req.params.rid);
      const r2 = await D.withTransaction(async conn => {
        const r0 = await D.getRisk(conn, rid);
        if (!r0) return { status: 404, body: { error: '风险不存在' } };
        const acc = await perm.getProjectAccess(conn, r0.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权删除风险' } };
        await D.deleteRisk(conn, rid);
        await D.addProjectLog(conn, 'risk', rid, 'DELETE', JSON.stringify({ risk_name: r0.risk_name }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
