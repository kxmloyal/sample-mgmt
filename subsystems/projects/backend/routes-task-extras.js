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
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        if (depId === tid) return { status: 400, body: { error: '不能依赖自己' } };
        // v2：加依赖同项目校验（depends_on_id 的 project_id 必须与当前任务一致，否则 400；不存在 404）
        const depTask = await D.fetchOne(conn, 'SELECT project_id FROM project_tasks WHERE id=?', [depId]);
        if (!depTask) return { status: 404, body: { error: '前置任务不存在' } };
        if (depTask.project_id !== t.project_id) return { status: 400, body: { error: '只能依赖同一项目内的任务' } };
        if (await D.hasCycle(conn, tid, depId)) return { status: 400, body: { error: '存在循环依赖，禁止添加' } };
        const r = await D.addTaskDep(conn, tid, depId, u.id);
        if (r.changed === 0) return { status: 409, body: { error: '该依赖已存在' } };
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ dep: depId }), u.id);
        return { status: 201, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 移除依赖
  app.delete('/api/projects/tasks/:tid/deps/:depId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const depId = Number(req.params.depId);
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        await D.removeTaskDep(conn, tid, depId);
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ unlink: depId }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ===== 附件（Task 6） =====
  // C3 修复：扩展名白名单（与 manifest files.categories 一致）+ multer 错误 JSON 化（类型/大小超限 400 而非 500 HTML）
  const projUploader = createUploader({
    uploadDir: 'public/uploads/projects', maxSize: 10485760,
    allowedExtensions: ['pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx', 'xls', 'xlsx', 'zip']
  });
  // 上传附件（multer 单文件，事务内落库 + 留痕；multer 错误经回调转 JSON 400）
  app.post('/api/projects/tasks/:tid/files', requireAuth, (req, res, next) => {
    projUploader.single('file')(req, res, function (err) {
      if (err) return res.status(400).json({ error: err.message });
      next();
    });
  }, async (req, res) => {
      try {
        const u = await currentUser(req);
        const tid = Number(req.params.tid);
        if (!req.file) return res.status(400).json({ error: '未收到文件' });
        const r2 = await D.withTransaction(async conn => {
          const t = await D.getTask(conn, tid);
          if (!t) return { status: 404, body: { error: '任务不存在' } };
          if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
          const f = await D.createTaskFile(conn, tid, { file_name: req.file.originalname, file_path: req.file.filename, size: req.file.size }, u.id);
          await D.addProjectLog(conn, 'task', tid, 'FILE_UPLOAD', JSON.stringify({ file_name: req.file.originalname }), u.id);
          return { status: 201, body: { id: f.id, file_name: req.file.originalname, url: '/uploads/projects/' + req.file.filename } };
        });
        res.status(r2.status).json(r2.body);
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  // 删除附件
  app.delete('/api/projects/tasks/:tid/files/:fid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const fid = Number(req.params.fid);
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        await D.deleteTaskFile(conn, fid);
        await D.addProjectLog(conn, 'task', tid, 'FILE_DELETE', JSON.stringify({ fid }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
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
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        const r = await D.addTaskLink(conn, tid, refType, refId);
        if (r.changed === 0) return { status: 409, body: { error: '已关联该对象' } };
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ ref_type: refType, ref_id: refId }), u.id);
        return { status: 201, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 取消关联
  app.delete('/api/projects/tasks/:tid/links/:refType/:refId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const refType = req.params.refType;
      const refId = Number(req.params.refId);
      const r2 = await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return { status: 404, body: { error: '任务不存在' } };
        if (!await canEditTask(conn, u, t, true)) return { status: 403, body: { error: '无权操作该任务' } };
        await D.removeTaskLink(conn, tid, refType, refId);
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ unlink: refType + ':' + refId }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports = { register };
