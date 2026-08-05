// subsystems/projects/backend/routes-tasks.js — 任务/子任务/评论/依赖/附件/关联/流转
// Task 2：POST 创建任务（支撑项目 CRUD 测试）；Task 3：列表/详情/编辑（乐观锁）/删除（级联）
// 详情中的子任务/依赖/评论/附件/关联/日志由 Task 5/6 补全，本 Task 仅返回任务对象，避免引用未定义函数。
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 校验任务操作权限：ADMIN/PM/项目 owner/member；assignee 对编辑（不含删除）放宽
  async function canEditTask(conn, u, task, allowAssigneeEdit) {
    if (perm.isGlobalManager(u.role)) return true;
    const acc = await perm.getProjectAccess(conn, task.project_id, u.id);
    if (acc.isMember) return true;
    if (allowAssigneeEdit && task.assignee_id === u.id) return true;
    return false;
  }

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

  // 项目任务列表
  app.get('/api/projects/:id/tasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listProjectTasks(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 任务详情（子任务/依赖/评论/附件/关联/日志由 Task 5/6 补全，本 Task 仅返回任务对象）
  app.get('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const tid = Number(req.params.tid);
      const t = await D.getTask(null, tid);
      if (!t) return res.status(404).json({ error: '任务不存在' });
      res.json({ task: t });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑任务（乐观锁 version 冲突 409；ADMIN/PM/成员/assignee）
  app.put('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权编辑该任务' });
        const body = req.body || {};
        // DONE 规则：progress 强制 100（设计文档 §4.10）
        if (body.status === 'DONE' && Number(body.progress) !== 100) return res.status(400).json({ error: '标记完成后进度必须为 100%' });
        const r = await D.updateTask(conn, tid, body, Number(body.version));
        if (r.changed === 0) return res.status(409).json({ error: '数据已被他人修改，请刷新后重试' });
        await D.addProjectLog(conn, 'task', tid, 'UPDATE', JSON.stringify({ fields: Object.keys(body).filter(k => k !== 'version') }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除任务（ADMIN/PM/成员；级联清理附属表 + 留痕，同事务）
  app.delete('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, false)) return res.status(403).json({ error: '无权删除该任务' });
        await D.deleteTaskCascade(conn, tid);
        await D.addProjectLog(conn, 'task', tid, 'DELETE', JSON.stringify({ title: t.title }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports = { register };
