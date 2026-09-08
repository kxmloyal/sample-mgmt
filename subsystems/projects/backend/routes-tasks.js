// subsystems/projects/backend/routes-tasks.js — 任务创建/列表/详情/流转/子任务/评论
// Task 2：POST 创建任务（支撑项目 CRUD 测试）；Task 3：列表/详情；Task 4：POST /status 状态流转（CAS + 状态机 + 伪角色 ASSIGNEE/MEMBER + 依赖校验）
// Task 5：子任务（三态 CAS 流转）+ 评论（作者/ADMIN/PM 可删，同事务留痕）；详情补全 subtasks/comments 字段
// Task 6：依赖/附件/关联路由已拆分至 routes-task-extras.js（本文件超 20000 字符红线重构，Task 7）
// 方案一B（2026-09）：编辑/删除/批量操作域拆分至 routes-task-edit.js（本文件曾达 22.6k 字符红线）
// 方案一A（2026-09）：OVERDUE 回归纯派生态（去除流转事务内物理写回）；流转匹配改用 status_eff，新增 OVERDUE/DONE/IN_PROGRESS 出边
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
      // 读取校验在事务外执行；事务内仅写入，响应在提交后发送（事务内发响应会导致连接池状态异常，数据未持久化即返回假 201）
      const p = await D.getProject(null, pid);
      if (!p) return res.status(404).json({ error: '项目不存在' });
      const acc = await perm.getProjectAccess(null, pid, u.id);
      if (!perm.isGlobalManager(u.role) && !acc.isMember) return res.status(403).json({ error: '非项目成员无权创建任务' });
      const t = await D.withTransaction(async conn => {
        const task = await D.createTask({ project_id: pid, title, description: req.body.description,
          category: req.body.category, priority: req.body.priority, assignee_id: req.body.assignee_id || null,
          start_date: req.body.start_date || null, planned_date: req.body.planned_date || null, created_by: u.id }, conn);
        await D.addProjectLog(conn, 'task', task.id, 'CREATE', JSON.stringify({ title }), u.id);
        // 通知触发点①：新建任务带指派人 → 通知被指派人（自己创建给自己不发）
        // 注：createTask 仅返回 {id}，assignee 从请求体取（兼容 DAO 契约不变）
        const newAssignee = Number(req.body.assignee_id) || null;
        if (newAssignee && newAssignee !== u.id) {
          await D.addNotification(conn, { user_id: newAssignee, type: 'ASSIGN',
            title: '新任务指派：' + title, body: (p.name || '') + ' · 优先级 ' + (task.priority || req.body.priority || 'M'),
            link: '#/tasks/' + task.id, ref_type: 'task', ref_id: task.id });
        }
        return task;
      });
      res.status(201).json({ id: t.id });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 项目任务列表
  app.get('/api/projects/:id/tasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listProjectTasks(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 任务详情（Task 6 补全 deps/files/links/logs，Promise.all 并行；v2 改调 getTaskDetail JOIN 项目名/责任人）
  // 方案三C：并行补拉本项目关联到本任务的风险/变更互链数据（量级小；无关联返回空数组，前端 tab 显示空态）
  app.get('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const tid = Number(req.params.tid);
      const t = await D.getTaskDetail(null, tid);
      if (!t) return res.status(404).json({ error: '任务不存在' });
      const [subtasks, comments, deps, files, links, logs, risks, changes] = await Promise.all([
        D.listSubtasks(null, tid),
        D.listTaskComments(null, tid),
        D.listTaskDeps(null, tid),
        D.listTaskFiles(null, tid),
        D.listTaskLinks(null, tid),
        D.listTaskLogs(null, tid),
        D.fetchAll(null, 'SELECT id,project_id,risk_name,severity,probability,status,task_id FROM project_risks WHERE task_id=?', [tid]),
        D.fetchAll(null, 'SELECT id,project_id,change_no,change_type,description,status,task_id FROM project_changes WHERE task_id=?', [tid])
      ]);
      res.json({ task: t, subtasks, deps, comments, files, links, logs, risks, changes });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑/删除/批量操作域已拆分至 routes-task-edit.js（方案一B，2026-09；对外路径与行为零变化）

  // 状态流转（CAS 条件更新 + 状态机配置 + 依赖校验 + 同事务留痕）
  app.post('/api/projects/tasks/:tid/status', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const action = (req.body.action || '').trim();
      if (!action) return res.status(400).json({ error: 'action 必填' });
      const r2 = await D.withTransaction(async conn => {
        // 事务内读取最新配置（缓解新旧混合）
        const cfg = await wf.loadWorkflow(conn);
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        // 方案一A②：流转匹配用 status_eff（planned_date 已过且未完成 → 派生 OVERDUE），
        // 延期任务可走 OVERDUE 出边继续处理/补录完成/取消；CAS 落库仍按物理 status
        const cur = t.status_eff || t.status;
        const tr = cfg.transitions.find(x => x.action === action && x.from === cur);
        if (!tr) {
          // CAS 语义：action 合法但当前状态不匹配 = 状态已并发变更 → 409；action 不存在 → 400
          const any = cfg.transitions.find(x => x.action === action);
          return { status: any ? 409 : 400, body: { error: any ? '任务状态已变更，请刷新后重试' : '当前状态不允许该操作' } };
        }
        if (!await wf.resolveRole(conn, tr.role, u, t))
          return { status: 403, body: { error: '无权限执行该操作' } };
        // 依赖校验：进入 IN_PROGRESS/DONE 前，前置任务须全部 DONE
        if (tr.to === 'IN_PROGRESS' || tr.to === 'DONE') {
          const pending = await D.fetchOne(conn,
            'SELECT COUNT(*) AS c FROM project_task_deps d JOIN project_tasks p ON p.id=d.depends_on_id ' +
            'WHERE d.task_id=? AND p.status<>\'DONE\'', [tid]);
          if (pending && pending.c > 0) return { status: 409, body: { error: '存在未完成的前置任务，禁止流转' } };
        }
        // 方案一A①：OVERDUE 回归纯派生态，取消物理写回（此前先 UPDATE 写 OVERDUE 再流转，导致延期任务永久锁死于 OVERDUE）；
        // 派生延期任务走 OVERDUE 出边（RESUME→IN_PROGRESS / FINISH→DONE / CANCEL→CANCELLED），CAS 按物理 status 匹配
        // 手动流转 CAS（WHERE status=读取时的物理旧值，affectedRows=0 → 并发冲突）
        const r = await conn.execute('UPDATE project_tasks SET status=?, version=version+1 WHERE id=? AND status=?',
          [tr.to, tid, t.status]);
        if (r[0].affectedRows === 0) return { status: 409, body: { error: '任务状态已变更，请刷新后重试' } };
        // DONE 附加：progress=100 + actual_date 回写（首次完成记录）
        if (tr.to === 'DONE') {
          await conn.execute('UPDATE project_tasks SET progress=100, actual_date=COALESCE(actual_date,CURDATE()) WHERE id=?', [tid]);
        }
        await D.addProjectLog(conn, 'task', tid, 'STATUS_CHANGE', JSON.stringify({ from: t.status, to: tr.to, action }), u.id);
        // 通知触发点③：任务完成/退回/取消 → 通知创建人（操作人是创建人自己则不通知）
        if (tr.to === 'DONE' || tr.to === 'NOT_STARTED' || tr.to === 'CANCELLED') {
          if (t.created_by && t.created_by !== u.id) {
            const CN = { DONE: '任务已完成：', NOT_STARTED: '任务被退回：', CANCELLED: '任务被取消：' };
            await D.addNotification(conn, { user_id: t.created_by,
              type: 'STATUS',
              title: CN[tr.to] + t.title,
              body: '操作人 ' + (u.display_name || u.username || ('#' + u.id)),
              link: '#/tasks/' + tid, ref_type: 'task', ref_id: tid });
          }
        }
        const nt = await D.getTask(conn, tid);
        return { status: 200, body: { task: nt, message: tr.label, status_eff: nt.status_eff || nt.status } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ===== 子任务（Task 5） =====
  // 子任务列表/创建
  app.get('/api/projects/tasks/:tid/subtasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listSubtasks(null, Number(req.params.tid));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/projects/tasks/:tid/subtasks', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const title = (req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: '子任务名称必填' });
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        const s = await D.createSubtask({ task_id: tid, title, assignee_id: req.body.assignee_id, planned_date: req.body.planned_date, created_by: u.id }, conn);
        await D.addProjectLog(conn, 'subtask', s.id, 'CREATE', JSON.stringify({ title }), u.id);
        return { status: 201, body: { id: s.id } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 子任务编辑（乐观锁）
  app.put('/api/projects/tasks/:tid/subtasks/:sid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const sid = Number(req.params.sid);
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        const r = await D.updateSubtask(conn, sid, req.body, Number(req.body.version));
        if (r.changed === 0) return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        await D.addProjectLog(conn, 'subtask', sid, 'UPDATE', '', u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 子任务删除
  app.delete('/api/projects/tasks/:tid/subtasks/:sid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const sid = Number(req.params.sid);
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, false)) return { status: 403, body: { error: '无权操作该任务' } };
        await D.deleteSubtask(conn, sid);
        await D.addProjectLog(conn, 'subtask', sid, 'DELETE', '', u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 子任务状态流转（CAS，三态）
  app.post('/api/projects/tasks/:tid/subtasks/:sid/status', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const sid = Number(req.params.sid);
      const action = (req.body.action || '').trim();
      const MAP = { START: { from: 'NOT_STARTED', to: 'IN_PROGRESS' }, COMPLETE: { from: 'IN_PROGRESS', to: 'DONE' } };
      const m = MAP[action];
      if (!m) return res.status(400).json({ error: '非法子任务操作' });
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        const r = await D.casSubtaskStatus(conn, sid, m.from, m.to);
        if (r.changed === 0) return { status: 409, body: { error: '子任务状态已变更，请刷新后重试' } };
        // v2：COMPLETE 后联动父任务进度（同事务）
        if (action === 'COMPLETE') await D.syncSubtaskProgress(conn, tid);
        await D.addProjectLog(conn, 'subtask', sid, 'STATUS_CHANGE', JSON.stringify(m), u.id);
        const s = await D.fetchOne(conn, 'SELECT * FROM project_subtasks WHERE id=?', [sid]);
        return { status: 200, body: s };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 评论列表/发表/删除（作者/ADMIN/PM 可删）
  app.get('/api/projects/tasks/:tid/comments', requireAuth, async (req, res) => {
    try {
      const list = await D.listTaskComments(null, Number(req.params.tid));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/projects/tasks/:tid/comments', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const content = (req.body.content || '').trim();
      if (!content) return res.status(400).json({ error: '评论内容必填' });
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        const c = await D.createComment(conn, tid, content, u.id);
        await D.addProjectLog(conn, 'comment', c.id, 'COMMENT', JSON.stringify({ content }), u.id);
        return { status: 201, body: { id: c.id } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/projects/tasks/:tid/comments/:cid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const cid = Number(req.params.cid);
      const r2 = await D.withTransaction(async conn => {
        const c = await D.fetchOne(conn, 'SELECT * FROM project_task_comments WHERE id=?', [cid]);
        if (!c) return { status: 404, body: { error: '评论不存在' } };
        if (u.role !== 'ADMIN' && u.role !== 'PM' && c.operator_id !== u.id)
          return { status: 403, body: { error: '仅作者或管理员可删除' } };
        await D.deleteComment(conn, cid);
        await D.addProjectLog(conn, 'comment', cid, 'DELETE', '', u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports = { register };
