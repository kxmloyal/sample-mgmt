// subsystems/projects/backend/routes-task-edit.js — 任务编辑/删除/批量操作域（方案一B 拆分）
// 拆分原因：routes-tasks.js 22.6k 字符超 20000 红线，将「编辑/删除/批量」域迁至本文件，
// routes-tasks.js 保留创建/列表/详情/流转/子任务/评论（对外路径与行为零变化）。
// 注册顺序：backend/index.js 中紧跟 routes-tasks.js 之后（本文件所有路径含 :tid 静态段，与 /tasks/export 无方法冲突）。
// 同步修复（方案一A①/②）：批量流转去除 OVERDUE 物理写回；流转查找改用 status_eff（派生延期任务可 RESUME/FINISH）。
const D = require('../../../db');
const perm = require('./permissions');
const wf = require('./workflow-config');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 校验任务操作权限：ADMIN/PM/项目 owner/member；assignee 对编辑（不含删除）放宽（与 routes-tasks.js 同源）
  async function canEditTask(conn, u, task, allowAssigneeEdit) {
    if (perm.isGlobalManager(u.role)) return true;
    const acc = await perm.getProjectAccess(conn, task.project_id, u.id);
    if (acc.isMember) return true;
    if (allowAssigneeEdit && task.assignee_id === u.id) return true;
    return false;
  }

  // 编辑任务（乐观锁 version 冲突 409；ADMIN/PM/成员/assignee）
  app.put('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      // 事务内读取与写入保持原子性；响应在事务外发送（事务内发响应会导致连接池状态异常，数据未持久化即返回假成功）
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权编辑该任务' } };
        const body = req.body || {};
        // C1 修复：状态只能通过 /status 流转接口变更，编辑接口禁止改 status（防绕过状态机/CAS/依赖校验/留痕）
        if (body.status !== undefined) return { status: 400, body: { error: '状态请通过状态流转操作变更' } };
        const r = await D.updateTask(conn, tid, body, Number(body.version));
        if (r.changed === 0) return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        await D.addProjectLog(conn, 'task', tid, 'UPDATE', JSON.stringify({ fields: Object.keys(body).filter(k => k !== 'version') }), u.id);
        // 通知触发点②：编辑改指派人 → 通知新指派人（旧指派人改派不通知，避免噪音）
        if (body.assignee_id !== undefined) {
          const na = Number(body.assignee_id) || null;
          if (na && na !== t.assignee_id && na !== u.id) {
            await D.addNotification(conn, { user_id: na, type: 'ASSIGN',
              title: '任务改派给你：' + t.title, body: (t.project_name || ''),
              link: '#/tasks/' + tid, ref_type: 'task', ref_id: tid });
          }
        }
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除任务（ADMIN/PM/成员；级联清理附属表 + 留痕，同事务）
  app.delete('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, false)) return { status: 403, body: { error: '无权删除该任务' } };
        await D.deleteTaskCascade(conn, tid);
        await D.addProjectLog(conn, 'task', tid, 'DELETE', JSON.stringify({ title: t.title }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // A3 批量操作（事务内逐条 canEditTask 校验 + 留痕；无权限/状态不允许条目跳过并统计；单批上限 100）
  // 返回 { ok:[tid], skipped:[{id,reason}] }；delete 走 deleteTaskCascade 级联清理；status 复用单任务流转约束（依赖校验）
  // 方案一A①：去除 OVERDUE 物理写回（延期为 status_eff 派生态）；流转匹配用 status_eff（CAS 仍按物理 status，并发冲突语义不变）
  app.post('/api/projects/tasks/batch', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const body = req.body || {};
      const action = body.action;
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
      if (!['assign', 'status', 'delete'].includes(action)) return res.status(400).json({ error: '非法批量操作' });
      if (ids.length === 0) return res.status(400).json({ error: 'ids 必填' });
      const ok = []; const skipped = [];
      await D.withTransaction(async conn => {
        for (const tid of ids) {
          const t = await D.getTask(conn, tid);
          if (!t) { skipped.push({ id: tid, reason: '任务不存在' }); continue; }
          if (!await canEditTask(conn, u, t, action !== 'delete')) {
            skipped.push({ id: tid, reason: '无权限' }); continue;
          }
          if (action === 'assign') {
            const assigneeId = Number(body.assignee_id) || null;
            await D.updateTask(conn, tid, { assignee_id: assigneeId, version: t.version }, t.version);
            await D.addProjectLog(conn, 'task', tid, 'BATCH_ASSIGN', JSON.stringify({ assignee_id: assigneeId }), u.id);
            // 通知触发点④：批量改派 → 通知新指派人
            if (assigneeId && assigneeId !== t.assignee_id && assigneeId !== u.id) {
              await D.addNotification(conn, { user_id: assigneeId, type: 'ASSIGN',
                title: '批量改派任务给你：' + t.title, body: '',
                link: '#/tasks/' + tid, ref_type: 'task', ref_id: tid });
            }
          } else if (action === 'status') {
            const act2 = String(body.action2 || '').trim();
            const cfg = await wf.loadWorkflow(conn);
            const cur = t.status_eff || t.status; // 派生延期任务按 OVERDUE 匹配转边（RESUME/FINISH/CANCEL）
            const tr = cfg.transitions.find(x => x.action === act2 && x.from === cur);
            if (!tr) { skipped.push({ id: tid, reason: '状态不允许该操作' }); continue; }
            // 依赖校验（与单任务流转一致）：进入 IN_PROGRESS/DONE 前前置须全部 DONE
            if (tr.to === 'IN_PROGRESS' || tr.to === 'DONE') {
              const pending = await D.fetchOne(conn,
                'SELECT COUNT(*) AS c FROM project_task_deps d JOIN project_tasks p ON p.id=d.depends_on_id ' +
                "WHERE d.task_id=? AND p.status<>'DONE'", [tid]);
              if (pending && pending.c > 0) { skipped.push({ id: tid, reason: '存在未完成前置任务' }); continue; }
            }
            // 手动流转 CAS（WHERE status=物理旧值，affectedRows=0 → 并发冲突；RESUME 派生延期为同值版本+1 留痕）
            const r = await conn.execute('UPDATE project_tasks SET status=?, version=version+1 WHERE id=? AND status=?',
              [tr.to, tid, t.status]);
            if (r[0].affectedRows === 0) { skipped.push({ id: tid, reason: '状态已变更' }); continue; }
            if (tr.to === 'DONE') {
              await conn.execute('UPDATE project_tasks SET progress=100, actual_date=COALESCE(actual_date,CURDATE()) WHERE id=?', [tid]);
            }
            await D.addProjectLog(conn, 'task', tid, 'STATUS_CHANGE', JSON.stringify({ from: cur, to: tr.to, action: act2, batch: 1 }), u.id);
            // 通知触发点⑤：批量完成/退回 → 通知创建人
            if ((tr.to === 'DONE' || tr.to === 'NOT_STARTED') && t.created_by && t.created_by !== u.id) {
              await D.addNotification(conn, { user_id: t.created_by,
                type: 'STATUS',
                title: (tr.to === 'DONE' ? '任务已完成：' : '任务被退回：') + t.title,
                body: '批量操作',
                link: '#/tasks/' + tid, ref_type: 'task', ref_id: tid });
            }
          } else if (action === 'delete') {
            await D.deleteTaskCascade(conn, tid);
            await D.addProjectLog(conn, 'task', tid, 'DELETE', JSON.stringify({ title: t.title, batch: 1 }), u.id);
          }
          ok.push(tid);
        }
      });
      res.json({ ok: ok, skipped: skipped });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
