// subsystems/projects/backend/routes-milestones.js — OA 能力移植：里程碑 CRUD + 达成（CAS）
// 方案A一期纯增量：新文件不改现有路由；注册顺序在 routes-projects 之前（静态前缀 /milestones 不被 /:id 抢占）
// 权限对齐 routes-projects.js：写 = ADMIN/PM 或项目 owner；读 = 所有登录用户（与项目列表一致）
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 里程碑列表
  app.get('/api/projects/:id/milestones', requireAuth, async (req, res) => {
    try {
      const list = await D.listMilestones(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 创建里程碑（ADMIN/PM/owner）
  app.post('/api/projects/:id/milestones', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '里程碑名称必填' });
      if (req.body.target_date && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.target_date))
        return res.status(400).json({ error: '目标日期格式须为 YYYY-MM-DD' });
      const r2 = await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return { status: 404, body: { error: '项目不存在' } };
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权创建里程碑' } };
        const m = await D.createMilestone({
          project_id: id, name: name, description: req.body.description,
          target_date: req.body.target_date || null, sort: Number(req.body.sort) || 0,
          created_by: u.id
        }, conn);
        await D.addProjectLog(conn, 'milestone', m.id, 'CREATE', JSON.stringify({ name, project_id: id }), u.id);
        return { status: 201, body: { id: m.id } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑里程碑（CAS 乐观锁；ADMIN/PM/owner）
  app.put('/api/projects/milestones/:mid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const mid = Number(req.params.mid);
      if (req.body.status !== undefined) return res.status(400).json({ error: '状态请通过达成操作变更' });
      if (req.body.target_date && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.target_date))
        return res.status(400).json({ error: '目标日期格式须为 YYYY-MM-DD' });
      const r2 = await D.withTransaction(async conn => {
        const m = await D.getMilestone(conn, mid);
        if (!m) return { status: 404, body: { error: '里程碑不存在' } };
        const acc = await perm.getProjectAccess(conn, m.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权编辑里程碑' } };
        const r = await D.updateMilestone(conn, mid, {
          name: (req.body.name || m.name).trim(), description: req.body.description,
          target_date: req.body.target_date !== undefined ? (req.body.target_date || null) : m.target_date,
          sort: req.body.sort !== undefined ? Number(req.body.sort) || 0 : m.sort
        }, Number(req.body.version));
        if (r.changed === 0) return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        await D.addProjectLog(conn, 'milestone', mid, 'UPDATE', JSON.stringify({ fields: Object.keys(req.body).filter(k => k !== 'version') }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 达成里程碑（CAS：仅 PENDING 可达成；自动延期判定；同事务留痕）
  app.post('/api/projects/milestones/:mid/achieve', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const mid = Number(req.params.mid);
      const r2 = await D.withTransaction(async conn => {
        const m = await D.getMilestone(conn, mid);
        if (!m) return { status: 404, body: { error: '里程碑不存在' } };
        const acc = await perm.getProjectAccess(conn, m.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权达成里程碑' } };
        const r = await D.achieveMilestone(conn, mid, Number(req.body && req.body.version));
        if (r.changed === 0) {
          // 区分冲突类型：已达成=400 语义提示；版本冲突=409
          const fresh = await D.getMilestone(conn, mid);
          if (fresh && fresh.status === 'ACHIEVED') return { status: 400, body: { error: '里程碑已达成' } };
          return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        }
        await D.addProjectLog(conn, 'milestone', mid, 'STATUS_CHANGE', JSON.stringify({ from: 'PENDING', to: 'ACHIEVED' }), u.id);
        const nm = await D.getMilestone(conn, mid);
        return { status: 200, body: nm };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除里程碑（ADMIN/PM/owner）
  app.delete('/api/projects/milestones/:mid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const mid = Number(req.params.mid);
      const r2 = await D.withTransaction(async conn => {
        const m = await D.getMilestone(conn, mid);
        if (!m) return { status: 404, body: { error: '里程碑不存在' } };
        const acc = await perm.getProjectAccess(conn, m.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权删除里程碑' } };
        await D.deleteMilestone(conn, mid);
        await D.addProjectLog(conn, 'milestone', mid, 'DELETE', JSON.stringify({ name: m.name }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
