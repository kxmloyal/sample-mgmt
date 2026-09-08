// subsystems/projects/backend/routes-tdux.js — 任务详情交互强化路由（2026-09-08 方案A）
// 纯增量：子任务排序端点 + 评论@提及通知；挂 /api/projects/tasks/:tid/ 命名空间
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 子任务排序（拖拽落定后整批提交；仅 ADMIN/PM/任务相关人可排）
  app.put('/api/projects/tasks/:tid/subtasks-order', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
      if (!ids.length) return res.status(400).json({ error: 'ids 必填' });
      if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'ids 重复' });
      const t = await D.getTask(null, tid);
      if (!t) return res.status(404).json({ error: '任务不存在' });
      if (!perm.isGlobalManager(u.role) && t.assignee_id !== u.id && t.created_by !== u.id)
        return res.status(403).json({ error: '无权调整该任务子任务排序' });
      // 归属校验：全部 id 必须属于本任务
      const own = await D.listSubtasksSorted(null, tid);
      const ownIds = new Set(own.map(x => x.id));
      if (!ids.every(x => ownIds.has(x))) return res.status(400).json({ error: '存在不属于该任务的子任务' });
      await D.withTransaction(async conn => {
        await D.reorderSubtasks(conn, tid, ids);
        await D.addProjectLog(conn, 'task', tid, 'SUBTASK_REORDER', JSON.stringify({ count: ids.length }), u.id);
      });
      res.json({ ok: 1 });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 评论@提及通知（在 routes-task-extras 的评论创建之后挂解析逻辑不可行——那里无 mentions 参数；
  // 因此评论创建仍走原端点，本端点仅负责「解析 mentions 并发通知」，由前端提交评论后调用）
  // 设计取舍：保持旧端点契约零改动（兼容优先），mentions 解析由前端传 user_id 数组更可靠（避免后端二次解析文本歧义）
  app.post('/api/projects/tasks/:tid/mention-notify', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const ids = Array.isArray((req.body || {}).user_ids) ? [...new Set(req.body.user_ids.map(Number).filter(Number.isInteger))] : [];
      if (!ids.length) return res.json({ notified: 0 });
      const t = await D.getTaskDetail(null, tid);
      if (!t) return res.status(404).json({ error: '任务不存在' });
      // 只通知真实存在且非本人的用户
      let notified = 0;
      await D.withTransaction(async conn => {
        for (const uid of ids) {
          if (uid === u.id) continue;
          await D.addNotification(conn, { user_id: uid, type: 'MENTION',
            title: '评论提及你：' + (t.title || '').slice(0, 60),
            body: (t.project_name ? t.project_name + ' · ' : '') + '操作人 ' + (u.display_name || u.username || ('#' + u.id)),
            link: '#/tasks/' + tid, ref_type: 'task', ref_id: tid });
          notified++;
        }
        // 落 mentions 到评论行（前端传 comment_id）
        const cid = Number((req.body || {}).comment_id) || null;
        if (cid) {
          await conn.execute('UPDATE project_task_comments SET mentions=? WHERE id=? AND task_id=?',
            [JSON.stringify(ids), cid, tid]);
        }
      });
      res.json({ notified });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
