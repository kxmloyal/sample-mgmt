// subsystems/projects/backend/routes-projects.js — 项目 CRUD + 成员管理
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 项目列表（所有登录用户可见，含任务统计）
  app.get('/api/projects', requireAuth, async (req, res) => {
    try {
      const list = await D.listProjects();
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 创建项目（ADMIN/PM 可建；创建人自动成为 owner）
  app.post('/api/projects', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (u.role !== 'ADMIN' && u.role !== 'PM') return res.status(403).json({ error: '仅管理员或项目经理可创建项目' });
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '项目名称必填' });
      await D.withTransaction(async conn => {
        const p = await D.createProject({ name, description: req.body.description, created_by: u.id }, conn);
        await D.addMember(conn, p.id, u.id, 1);
        await D.addProjectLog(conn, 'project', p.id, 'CREATE', JSON.stringify({ name }), u.id);
        res.status(201).json({ id: p.id, name });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 项目详情
  app.get('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const p = await D.getProject(null, Number(req.params.id));
      if (!p) return res.status(404).json({ error: '项目不存在' });
      res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑项目（ADMIN/PM/owner）
  app.put('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const p = await D.getProject(null, id);
      if (!p) return res.status(404).json({ error: '项目不存在' });
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '项目名称必填' });
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权编辑该项目' });
        await D.updateProject(conn, id, { name, description: req.body.description });
        await D.addProjectLog(conn, 'project', id, 'UPDATE', JSON.stringify({ name }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除项目（ADMIN/PM/owner；有任务 409 保护）
  app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return res.status(404).json({ error: '项目不存在' });
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权删除该项目' });
        const c = await D.countProjectTasks(conn, id);
        if (c > 0) return res.status(409).json({ error: '项目下存在任务，禁止删除' });
        await D.deleteProject(conn, id);
        await D.addProjectLog(conn, 'project', id, 'DELETE', JSON.stringify({ name: p.name }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 成员列表
  app.get('/api/projects/:id/members', requireAuth, async (req, res) => {
    try {
      const list = await D.listMembers(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 添加成员（ADMIN/PM/owner）
  app.post('/api/projects/:id/members', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const userId = Number(req.body.user_id);
      if (!userId) return res.status(400).json({ error: 'user_id 必填' });
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权管理成员' });
        const target = await D.getUserById(userId);
        if (!target) return res.status(404).json({ error: '用户不存在' });
        await D.addMember(conn, id, userId, 0);
        await D.addProjectLog(conn, 'member', id, 'CREATE', JSON.stringify({ user_id: userId }), u.id);
        res.status(201).json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 转让 owner / 移除成员（ADMIN/PM/owner；owner 不可移除自己）
  app.put('/api/projects/:id/members/:uid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const uid = Number(req.params.uid);
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权管理成员' });
        if (req.body.is_owner) {
          // W3 修复：目标必须是项目成员，防 setOwner 的 clear 生效 + set 0 行导致项目 owner 被清空
          const tgt = await D.fetchOne(conn, 'SELECT 1 AS x FROM project_members WHERE project_id=? AND user_id=?', [id, uid]);
          if (!tgt) return res.status(400).json({ error: '目标用户不是项目成员' });
          await D.setOwner(conn, id, uid);
          await D.addProjectLog(conn, 'member', id, 'UPDATE', JSON.stringify({ owner: uid }), u.id);
        } else {
          if (acc.isOwner && u.id === uid) return res.status(400).json({ error: '不能移除自己（负责人）' });
          await D.removeMember(conn, id, uid);
          await D.addProjectLog(conn, 'member', id, 'DELETE', JSON.stringify({ user_id: uid }), u.id);
        }
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除成员（DELETE 语义，走 PUT 兼容；额外提供 DELETE 别名）
  app.delete('/api/projects/:id/members/:uid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const uid = Number(req.params.uid);
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权管理成员' });
        // W2 修复：与 PUT 一致，owner 不可移除自己（防 DELETE 别名绕过保护）
        if (acc.isOwner && u.id === uid) return res.status(400).json({ error: '不能移除自己（负责人）' });
        await D.removeMember(conn, id, uid);
        await D.addProjectLog(conn, 'member', id, 'DELETE', JSON.stringify({ user_id: uid }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
