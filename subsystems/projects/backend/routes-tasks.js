// subsystems/projects/backend/routes-tasks.js — 任务/子任务/评论/依赖/附件/关联/流转
// Task 2：为支撑项目 CRUD 测试（非成员建任务 403 / 有任务项目删除 409），先实现 POST 创建任务；
// 完整任务 CRUD（列表/详情/编辑/删除等）见 Task 3，本文件继续扩展。
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 创建任务（ADMIN/PM/项目成员；非成员 403）
  app.post('/api/projects/:id/tasks', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const pid = Number(req.params.id);
      const title = (req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: '任务名称必填' });
      await D.withTransaction(async conn => {
        const p = await D.getProject(conn, pid);
        if (!p) return res.status(404).json({ error: '项目不存在' });
        const acc = await perm.getProjectAccess(conn, pid, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isMember) return res.status(403).json({ error: '非项目成员无权创建任务' });
        const t = await D.createTask({ project_id: pid, title, description: req.body.description,
          category: req.body.category, priority: req.body.priority, assignee_id: req.body.assignee_id || null,
          planned_date: req.body.planned_date || null, created_by: u.id }, conn);
        await D.addProjectLog(conn, 'task', t.id, 'CREATE', JSON.stringify({ title }), u.id);
        res.status(201).json({ id: t.id });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
