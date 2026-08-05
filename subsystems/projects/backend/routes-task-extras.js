// subsystems/projects/backend/routes-task-extras.js — 任务依赖/附件/关联子路径路由
// 拆分原因：routes-tasks.js 超 20000 字符硬红线，依赖/附件/关联 7 条路由移至本文件（Task 7 重构）
// 注册顺序：本文件在 routes-tasks.js 之后注册（所有路径均含 :tid 静态段，不与 /tasks/export 冲突）
const D = require('../../../db');
const perm = require('./permissions');
const { createUploader } = require('../../../shared/middleware/upload');

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

  // ===== 依赖（Task 6） =====
  // 添加前置依赖（环检测在事务内；重复 → 409）
  app.post('/api/projects/tasks/:tid/deps', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const depId = Number(req.body.depends_on_id);
      if (!depId) return res.status(400).json({ error: 'depends_on_id 必填' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        if (depId === tid) return res.status(400).json({ error: '不能依赖自己' });
        if (await D.hasCycle(conn, tid, depId)) return res.status(400).json({ error: '存在循环依赖，禁止添加' });
        const r = await D.addTaskDep(conn, tid, depId, u.id);
        if (r.changed === 0) return res.status(409).json({ error: '该依赖已存在' });
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ dep: depId }), u.id);
        res.status(201).json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 移除依赖
  app.delete('/api/projects/tasks/:tid/deps/:depId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const depId = Number(req.params.depId);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        await D.removeTaskDep(conn, tid, depId);
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ unlink: depId }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ===== 附件（Task 6） =====
  // 上传附件（multer 单文件，事务内落库 + 留痕）
  app.post('/api/projects/tasks/:tid/files', requireAuth,
    createUploader({ uploadDir: 'public/uploads/projects', maxSize: 10485760 }).single('file'),
    async (req, res) => {
      try {
        const u = await currentUser(req);
        const tid = Number(req.params.tid);
        if (!req.file) return res.status(400).json({ error: '未收到文件' });
        await D.withTransaction(async conn => {
          const t = await D.getTask(conn, tid);
          if (!t) return res.status(404).json({ error: '任务不存在' });
          if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
          const f = await D.createTaskFile(conn, tid, { file_name: req.file.originalname, file_path: req.file.filename, size: req.file.size }, u.id);
          await D.addProjectLog(conn, 'task', tid, 'FILE_UPLOAD', JSON.stringify({ file_name: req.file.originalname }), u.id);
          res.status(201).json({ id: f.id, file_name: req.file.originalname, url: '/uploads/projects/' + req.file.filename });
        });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  // 删除附件
  app.delete('/api/projects/tasks/:tid/files/:fid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const fid = Number(req.params.fid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        await D.deleteTaskFile(conn, fid);
        await D.addProjectLog(conn, 'task', tid, 'FILE_DELETE', JSON.stringify({ fid }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ===== 关联（Task 6） =====
  // 关联列表
  app.get('/api/projects/tasks/:tid/links', requireAuth, async (req, res) => {
    try {
      const list = await D.listTaskLinks(null, Number(req.params.tid));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 关联样品/治具（ref_type 校验；重复 → 409）
  app.post('/api/projects/tasks/:tid/links', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const refType = req.body.ref_type;
      const refId = Number(req.body.ref_id);
      if (!['sample', 'fixture'].includes(refType) || !refId)
        return res.status(400).json({ error: 'ref_type(sample/fixture) 与 ref_id 必填' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        const r = await D.addTaskLink(conn, tid, refType, refId);
        if (r.changed === 0) return res.status(409).json({ error: '已关联该对象' });
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ ref_type: refType, ref_id: refId }), u.id);
        res.status(201).json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 取消关联
  app.delete('/api/projects/tasks/:tid/links/:refType/:refId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const refType = req.params.refType;
      const refId = Number(req.params.refId);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        await D.removeTaskLink(conn, tid, refType, refId);
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ unlink: refType + ':' + refId }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports = { register };
