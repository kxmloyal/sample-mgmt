// subsystems/projects/backend/routes-changes.js — OA 能力移植二期批次1：变更单 CRUD + 审批（CAS）
// 审批人范围（用户确认）：ADMIN/PM/项目 owner；TIME 类批准后仅记录、不自动顺延任务日期（保守方案）
// BUDGET 类批准后同事务联动 project_extras.budget（after_value 须为非负数字）
// 纯增量：新文件不改现有路由；注册顺序在 routes-projects 之前（/changes 静态前缀不被 /:id 抢占）
const D = require('../../../db');
const perm = require('./permissions');

const CHANGE_TYPES = ['SCOPE', 'TIME', 'RESOURCE', 'BUDGET'];
const CHANGE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 变更单列表（项目成员/登录用户可读，与里程碑/风险一致）
  app.get('/api/projects/:id/changes', requireAuth, async (req, res) => {
    try {
      const list = await D.listChanges(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 创建变更单（项目成员即可发起，与识别风险一致；编号 PC+日期+序列由 Redis INCR 保证并发唯一）
  app.post('/api/projects/:id/changes', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const changeType = String(req.body.change_type || '').trim();
      const description = String(req.body.description || '').trim();
      if (!CHANGE_TYPES.includes(changeType)) return res.status(400).json({ error: 'change_type 须为 SCOPE/TIME/RESOURCE/BUDGET' });
      if (!description) return res.status(400).json({ error: '变更内容描述必填' });
      if (req.body.change_type === 'BUDGET' && req.body.after_value !== undefined && req.body.after_value !== '') {
        const n = Number(req.body.after_value);
        if (!isFinite(n) || n < 0) return res.status(400).json({ error: 'BUDGET 变更的 after_value 须为非负数字（批准后将写入预算）' });
      }
      const r2 = await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return { status: 404, body: { error: '项目不存在' } };
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner && !acc.isMember)
          return { status: 403, body: { error: '非项目成员无权发起变更' } };
        // 变更编号：PC+yyyyMMdd+4位当日序列（Redis INCR 原子计数；与项目编号生成同风格）
        const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const seq = await D.nextChangeSeq('PC' + day);
        const c = await D.createChange({
          project_id: id, change_no: 'PC' + day + String(seq).padStart(4, '0'),
          change_type: changeType, description: description,
          before_value: req.body.before_value, after_value: req.body.after_value,
          reason: req.body.reason, applicant_id: u.id, created_by: u.id
        }, conn);
        await D.addProjectLog(conn, 'change', c.id, 'CREATE', JSON.stringify({ change_no: 'PC' + day + String(seq).padStart(4, '0'), change_type: changeType, project_id: id }), u.id);
        return { status: 201, body: { id: c.id, change_no: 'PC' + day + String(seq).padStart(4, '0') } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑变更单（仅 PENDING 可改；申请人本人或 ADMIN/PM/owner；CAS）
  app.put('/api/projects/changes/:cid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const cid = Number(req.params.cid);
      if (req.body.status !== undefined) return res.status(400).json({ error: '状态请通过审批操作变更' });
      if (req.body.change_type && !CHANGE_TYPES.includes(req.body.change_type))
        return res.status(400).json({ error: 'change_type 须为 SCOPE/TIME/RESOURCE/BUDGET' });
      const r2 = await D.withTransaction(async conn => {
        const c = await D.getChange(conn, cid);
        if (!c) return { status: 404, body: { error: '变更单不存在' } };
        const acc = await perm.getProjectAccess(conn, c.project_id, u.id);
        const canManage = perm.isGlobalManager(u.role) || acc.isOwner;
        if (!canManage && c.applicant_id !== u.id) return { status: 403, body: { error: '仅申请人或项目经理可编辑' } };
        const r = await D.updateChange(conn, cid, {
          change_type: req.body.change_type || c.change_type,
          description: req.body.description !== undefined ? String(req.body.description).trim() : c.description,
          before_value: req.body.before_value !== undefined ? req.body.before_value : c.before_value,
          after_value: req.body.after_value !== undefined ? req.body.after_value : c.after_value,
          reason: req.body.reason !== undefined ? req.body.reason : c.reason
        }, Number(req.body.version));
        if (r.changed === 0) {
          const fresh = await D.getChange(conn, cid);
          if (fresh && fresh.status !== 'PENDING') return { status: 400, body: { error: '变更单已审批，禁止编辑' } };
          return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        }
        await D.addProjectLog(conn, 'change', cid, 'UPDATE', JSON.stringify({ fields: Object.keys(req.body).filter(k => k !== 'version') }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 审批（通过/驳回；CAS：仅 PENDING；审批人=ADMIN/PM/owner；同事务留痕 + BUDGET 联动预算）
  app.post('/api/projects/changes/:cid/approve', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const cid = Number(req.params.cid);
      const decision = String((req.body && req.body.decision) || '').trim().toUpperCase();
      if (!['APPROVED', 'REJECTED'].includes(decision)) return res.status(400).json({ error: 'decision 须为 APPROVED/REJECTED' });
      const r2 = await D.withTransaction(async conn => {
        const c = await D.getChange(conn, cid);
        if (!c) return { status: 404, body: { error: '变更单不存在' } };
        const acc = await perm.getProjectAccess(conn, c.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无审批权限（仅管理员/项目经理/项目负责人）' } };
        // 回避规则（扁平，无豁免）：任何申请人不得审批本人发起的变更（ADMIN/PM/owner 一视同仁）
        if (c.applicant_id === u.id) return { status: 400, body: { error: '申请人不能审批本人发起的变更' } };
        const r = await D.approveChange(conn, cid, decision, u.id, Number(req.body && req.body.version));
        if (r.changed === 0) {
          const fresh = await D.getChange(conn, cid);
          if (fresh && fresh.status !== 'PENDING') return { status: 400, body: { error: '变更单已审批（当前状态 ' + fresh.status + '）' } };
          return { status: 409, body: { error: '数据已被他人修改，请刷新后重试' } };
        }
        // BUDGET 联动：批准后同事务写入预算（after_value 校验非负数字；写入失败整体回滚）
        if (decision === 'APPROVED' && c.change_type === 'BUDGET') {
          const after = String(c.after_value || '').trim();
          if (after === '' || !isFinite(Number(after)) || Number(after) < 0)
            return { status: 400, body: { error: 'BUDGET 变更的变更后值（after_value）须为非负数字，无法联动预算' } };
          await D.saveProjectExtras(conn, c.project_id, { budget: Number(after) }, u.id);
        }
        await D.addProjectLog(conn, 'change', cid, 'STATUS_CHANGE', JSON.stringify({ from: 'PENDING', to: decision, change_no: c.change_no, change_type: c.change_type }), u.id);
        const nc = await D.getChange(conn, cid);
        return { status: 200, body: nc };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除变更单（ADMIN/PM/owner；仅 PENDING 可删，已审批单留档不可删）
  app.delete('/api/projects/changes/:cid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const cid = Number(req.params.cid);
      const r2 = await D.withTransaction(async conn => {
        const c = await D.getChange(conn, cid);
        if (!c) return { status: 404, body: { error: '变更单不存在' } };
        const acc = await perm.getProjectAccess(conn, c.project_id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return { status: 403, body: { error: '无权删除变更单' } };
        if (c.status !== 'PENDING') return { status: 400, body: { error: '已审批的变更单留档，不可删除' } };
        await D.deleteChange(conn, cid);
        await D.addProjectLog(conn, 'change', cid, 'DELETE', JSON.stringify({ change_no: c.change_no }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r2.status).json(r2.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
