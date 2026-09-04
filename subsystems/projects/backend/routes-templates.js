// subsystems/projects/backend/routes-templates.js — OA 移植二期批次2：项目模板 CRUD + 实例化
// 实例化事务边界：建项目 → 创建人 owner → 批量任务(offset_days→planned_date) → 批量里程碑 → 挂引用机型 → 模板计数+1
// 任一步失败整体回滚；纯增量不改既有接口
const D = require('../../../db');

const CATEGORIES = ['equipment', 'quality', 'process', 'safety', 'other'];
const PRIORITIES = ['H', 'M', 'L'];
const REF_ROLES = ['TARGET', 'VERIFY', 'REF'];

// 校验并规范化任务清单 JSON
function parseTasksJson(raw) {
  const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  if (!Array.isArray(arr)) throw new Error('任务清单须为数组');
  return arr.map(function (t) {
    const title = String(t.title || '').trim();
    if (!title) throw new Error('任务清单存在缺少标题的项');
    const category = CATEGORIES.includes(t.category) ? t.category : 'other';
    const priority = PRIORITIES.includes(t.priority) ? t.priority : 'M';
    const offset = Number(t.offset_days || 0);
    const days = Number(t.planned_days || 0);
    if (!isFinite(offset) || offset < 0 || offset > 3650) throw new Error('offset_days 须为 0~3650 的数字');
    if (!isFinite(days) || days < 0 || days > 3650) throw new Error('planned_days 须为 0~3650 的数字');
    return { title: title.slice(0, 200), category: category, priority: priority, offset_days: offset, planned_days: days };
  });
}
// 校验并规范化里程碑清单 JSON
function parseMilestonesJson(raw) {
  const arr = typeof raw === 'string' ? JSON.parse(raw || '[]') : (raw || []);
  if (!Array.isArray(arr)) throw new Error('里程碑清单须为数组');
  return arr.map(function (m) {
    const name = String(m.name || '').trim();
    if (!name) throw new Error('里程碑清单存在缺少名称的项');
    const offset = Number(m.target_offset_days || 0);
    if (!isFinite(offset) || offset < 0 || offset > 3650) throw new Error('target_offset_days 须为 0~3650 的数字');
    return { name: name.slice(0, 200), target_offset_days: offset };
  });
}
// yyyy-mm-dd + n 天
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// JSON 列双态兼容：驱动可能返回对象（已解析）或字符串（未解析）
function parseJsonMaybe(v, fallback) {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(v || JSON.stringify(fallback)); } catch (e) { return fallback; }
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 模板列表（登录用户可读；含清单供前端预览）
  app.get('/api/projects/templates', requireAuth, async (req, res) => {
    try {
      const list = await D.listTemplates(null);
      res.json(list.map(function (t) {
        const tasks = parseJsonMaybe(t.tasks_json, []);
        const milestones = parseJsonMaybe(t.milestones_json, []);
        return { id: t.id, name: t.name, description: t.description, tasks: tasks, milestones: milestones, instance_count: t.instance_count, created_at: t.created_at };
      }));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 创建模板（ADMIN/PM）
  app.post('/api/projects/templates', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['ADMIN', 'PM'].includes(u.role)) return res.status(403).json({ error: '仅管理员或项目经理可维护模板' });
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '模板名称必填' });
      const tasks = parseTasksJson(req.body.tasks);
      const milestones = parseMilestonesJson(req.body.milestones);
      const r = await D.withTransaction(async conn => {
        const t = await D.createTemplate(conn, { name: name.slice(0, 100), description: req.body.description, tasks_json: JSON.stringify(tasks), milestones_json: JSON.stringify(milestones) }, u.id);
        await D.addProjectLog(conn, 'template', t.id, 'CREATE', JSON.stringify({ name, tasks: tasks.length, milestones: milestones.length }), u.id);
        return t;
      });
      res.status(201).json({ id: r.id });
    } catch (e) { res.status(e.message.indexOf('须为') >= 0 || e.message.indexOf('必填') >= 0 || e.message.indexOf('缺少') >= 0 ? 400 : 500).json({ error: e.message }); }
  });

  // 编辑模板（ADMIN/PM）
  app.put('/api/projects/templates/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['ADMIN', 'PM'].includes(u.role)) return res.status(403).json({ error: '仅管理员或项目经理可维护模板' });
      const tid = Number(req.params.tid);
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '模板名称必填' });
      const tasks = parseTasksJson(req.body.tasks);
      const milestones = parseMilestonesJson(req.body.milestones);
      const r = await D.withTransaction(async conn => {
        const t = await D.getTemplate(conn, tid);
        if (!t) return { status: 404, body: { error: '模板不存在或已停用' } };
        await D.updateTemplate(conn, tid, { name: name.slice(0, 100), description: req.body.description, tasks_json: JSON.stringify(tasks), milestones_json: JSON.stringify(milestones) });
        await D.addProjectLog(conn, 'template', tid, 'UPDATE', JSON.stringify({ name }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r.status).json(r.body);
    } catch (e) { res.status(e.message.indexOf('须为') >= 0 || e.message.indexOf('必填') >= 0 || e.message.indexOf('缺少') >= 0 ? 400 : 500).json({ error: e.message }); }
  });

  // 停用模板（ADMIN/PM；停用式删除，保留历史）
  app.delete('/api/projects/templates/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['ADMIN', 'PM'].includes(u.role)) return res.status(403).json({ error: '仅管理员或项目经理可维护模板' });
      const r = await D.withTransaction(async conn => {
        const t = await D.getTemplate(conn, Number(req.params.tid));
        if (!t) return { status: 404, body: { error: '模板不存在或已停用' } };
        await D.deleteTemplate(conn, t.id);
        await D.addProjectLog(conn, 'template', t.id, 'DELETE', JSON.stringify({ name: t.name }), u.id);
        return { status: 200, body: { ok: 1 } };
      });
      res.status(r.status).json(r.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 实例化（ADMIN/PM；单事务：项目+owner+任务+里程碑+机型引用+模板计数）
  app.post('/api/projects/templates/:tid/instantiate', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['ADMIN', 'PM'].includes(u.role)) return res.status(403).json({ error: '仅管理员或项目经理可从模板创建项目' });
      const name = String(req.body.name || '').trim();
      const startDate = String(req.body.start_date || '').trim();
      if (!name) return res.status(400).json({ error: '项目名称必填（独立命名，与机型解耦）' });
      if (name.length > 100) return res.status(400).json({ error: '项目名称过长（上限 100）' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return res.status(400).json({ error: 'start_date 须为 yyyy-mm-dd' });
      const modelIds = (Array.isArray(req.body.model_ids) ? req.body.model_ids : []).map(Number).filter(Boolean);
      const r = await D.withTransaction(async conn => {
        const tpl = await D.getTemplate(conn, Number(req.params.tid));
        if (!tpl) return { status: 404, body: { error: '模板不存在或已停用' } };
        // 同名查重（大小写不敏感；与项目命名规范一致）
        const dup = await D.fetchOne(conn, 'SELECT id FROM projects WHERE LOWER(name)=LOWER(?)', [name]);
        if (dup) return { status: 409, body: { error: '已存在同名项目：' + name } };
        const tasks = parseJsonMaybe(tpl.tasks_json, []);
        const milestones = parseJsonMaybe(tpl.milestones_json, []);
        if (modelIds.length) {
          for (const mid of modelIds) {
            const m = await D.getModelExists(conn, mid);
            if (!m) return { status: 404, body: { error: '引用机型不存在：#' + mid } };
          }
        }
        // 1) 建项目 + 2) 创建人 owner
        const p = await D.createProject({ name: name, description: '（模板实例化：' + tpl.name + '）' + (req.body.description || '') , created_by: u.id }, conn);
        await D.addMember(conn, p.id, u.id, 1);
        // 3) 批量任务（offset_days→planned_date；planned_days 记入描述尾部便于排期）
        let taskCount = 0;
        for (const t of tasks) {
          await D.createTask({
            project_id: p.id, title: t.title, description: t.planned_days > 0 ? '（预计工期 ' + t.planned_days + ' 天）' : '',
            category: t.category, priority: t.priority, planned_date: t.offset_days > 0 ? addDays(startDate, t.offset_days) : startDate,
            created_by: u.id
          }, conn);
          taskCount++;
        }
        // 4) 批量里程碑
        let msCount = 0;
        for (const m of milestones) {
          await D.createMilestone({ project_id: p.id, name: m.name, description: '（模板）', target_date: addDays(startDate, m.target_offset_days), created_by: u.id }, conn);
          msCount++;
        }
        // 5) 挂引用机型
        let refCount = 0;
        for (const mid of modelIds) {
          await D.addModelRef(conn, p.id, mid, 'TARGET', u.id);
          refCount++;
        }
        // 6) 模板计数 +1
        await D.incrTemplateInstance(conn, tpl.id);
        await D.addProjectLog(conn, 'project', p.id, 'CREATE', JSON.stringify({ name: name, from_template: tpl.id, tpl_name: tpl.name, tasks: taskCount, milestones: msCount, model_refs: refCount, start_date: startDate }), u.id);
        return { status: 201, body: { project_id: p.id, tasks: taskCount, milestones: msCount, model_refs: refCount } };
      });
      res.status(r.status).json(r.body);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
