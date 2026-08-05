// subsystems/projects/backend/routes-tasks.js — 任务/子任务/评论/依赖/附件/关联/流转
// Task 2：POST 创建任务（支撑项目 CRUD 测试）；Task 3：列表/详情/编辑（乐观锁）/删除（级联）
// Task 4：POST /status 状态流转（CAS + 状态机 + 伪角色 ASSIGNEE/MEMBER + 依赖校验 + OVERDUE 自动延期互斥）
// 详情中的子任务/依赖/评论/附件/关联/日志由 Task 5/6 补全，本 Task 仅返回任务对象，避免引用未定义函数。
const D = require('../../../db');
const perm = require('./permissions');
const wf = require('./workflow-config');

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

  // 状态流转（CAS 条件更新 + 状态机配置 + 依赖校验 + 同事务留痕 + 触发 OVERDUE 自动延期互斥）
  app.post('/api/projects/tasks/:tid/status', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const action = (req.body.action || '').trim();
      if (!action) return res.status(400).json({ error: 'action 必填' });
      await D.withTransaction(async conn => {
        // 事务内读取最新配置（缓解新旧混合）
        const cfg = await wf.loadWorkflow(conn);
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        const tr = cfg.transitions.find(x => x.action === action && x.from === t.status);
        if (!tr) {
          // CAS 语义：action 合法但当前状态不匹配 = 状态已并发变更 → 409；action 不存在 → 400
          const any = cfg.transitions.find(x => x.action === action);
          return res.status(any ? 409 : 400).json({ error: any ? '任务状态已变更，请刷新后重试' : '当前状态不允许该操作' });
        }
        if (!await wf.resolveRole(conn, tr.role, u, t))
          return res.status(403).json({ error: '无权限执行该操作' });
        // 依赖校验：进入 IN_PROGRESS/DONE 前，前置任务须全部 DONE
        if (tr.to === 'IN_PROGRESS' || tr.to === 'DONE') {
          const pending = await D.fetchOne(conn,
            'SELECT COUNT(*) AS c FROM project_task_deps d JOIN project_tasks p ON p.id=d.depends_on_id ' +
            'WHERE d.task_id=? AND p.status<>\'DONE\'', [tid]);
          if (pending && pending.c > 0) return res.status(409).json({ error: '存在未完成的前置任务，禁止流转' });
        }
        // 自动延期批量（与手动流转同事务，CAS 保证互斥：已超期则手动流转必然 409）
        await conn.execute(
          "UPDATE project_tasks SET status='OVERDUE', version=version+1 WHERE id=? AND status IN ('NOT_STARTED','IN_PROGRESS') AND planned_date < CURDATE()",
          [tid]);
        // 手动流转 CAS（WHERE status=读取时的旧值，affectedRows=0 → 并发冲突）
        const r = await conn.execute('UPDATE project_tasks SET status=?, version=version+1 WHERE id=? AND status=?',
          [tr.to, tid, t.status]);
        if (r[0].affectedRows === 0) return res.status(409).json({ error: '任务状态已变更，请刷新后重试' });
        // DONE 附加：progress=100 + actual_date 回写（首次完成记录）
        if (tr.to === 'DONE') {
          await conn.execute('UPDATE project_tasks SET progress=100, actual_date=COALESCE(actual_date,CURDATE()) WHERE id=?', [tid]);
        }
        await D.addProjectLog(conn, 'task', tid, 'STATUS_CHANGE', JSON.stringify({ from: t.status, to: tr.to, action }), u.id);
        const nt = await D.getTask(conn, tid);
        res.json({ task: nt, message: tr.label });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports = { register };
