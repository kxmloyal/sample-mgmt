// subsystems/projects/backend/routes-modelrefs.js — OA 能力移植二期批次1：项目引用机型（sample_models 只读关联）
// 只读引用：不写 fixtures 子系统任何表；项目成员可挂/可摘，留痕；UNIQUE(project_id,model_id) 防重复
const D = require('../../../db');
const perm = require('./permissions');

const REF_ROLES = ['TARGET', 'VERIFY', 'REF'];

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 在册机型列表（登录用户可读；引用下拉用；只读 sample_models）
  app.get('/api/projects/model-options', requireAuth, async (req, res) => {
    try {
      res.json(await D.listAllModels(null));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 项目机型引用列表
  app.get('/api/projects/:id/models', requireAuth, async (req, res) => {
    try {
      const list = await D.listModelRefs(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 添加机型引用（ADMIN/PM/owner/项目成员；机型号须在册；重复引用幂等 200）
  app.post('/api/projects/:id/models', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const modelId = Number(req.body.model_id);
      const role = String(req.body.role || 'TARGET').trim().toUpperCase();
      if (!modelId) return res.status(400).json({ error: 'model_id 必填' });
      if (!REF_ROLES.includes(role)) return res.status(400).json({ error: 'role 须为 TARGET/VERIFY/REF' });
      const r2 = await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return { status: 404, body: { error: '项目不存在' } };
        // 权限先行（信息泄露防护）：非成员一律 403，不得借「机型不存在 404」探测机型库
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner && !acc.isMember)
          return { status: 403, body: { error: '非项目成员无权引用机型' } };
        const model = await D.getModelExists(conn, modelId);
        if (!model) return { status: 404, body: { error: '机型号不存在（sample_models 无此 ID）' } };
        const r = await D.addModelRef(conn, id, modelId, role, u.id);
        if (r.changed > 0) {
          await D.addProjectLog(conn, 'model_ref', id, 'LINK', JSON.stringify({ model_id: modelId, model_code: model.code, role }), u.id);
          return { status: 201, body: { ok: 1, model_code: model.code, model_name: model.full_name } };
        }
        return { status: 200, body: { ok: 1, duplicate: true, model_code: model.code } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 移除机型引用（ADMIN/PM/owner/项目成员）
  app.delete('/api/projects/:id/models/:modelId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const modelId = Number(req.params.modelId);
      const r2 = await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return { status: 404, body: { error: '项目不存在' } };
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner && !acc.isMember)
          return { status: 403, body: { error: '非项目成员无权移除机型引用' } };
        const r = await D.removeModelRef(conn, id, modelId);
        if (r.changed === 0) return { status: 404, body: { error: '该项目未引用此机型' } };
        await D.addProjectLog(conn, 'model_ref', id, 'LINK', JSON.stringify({ unlink: modelId }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
