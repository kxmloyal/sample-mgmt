// subsystems/projects/backend/routes-stats.js — 看板聚合/趋势/导出/工作流配置 + 子系统用户列表（Task 7 实现 + Task 10 补充）
const D = require('../../../db');
const wf = require('./workflow-config');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 看板统计
  app.get('/api/projects/stats', requireAuth, async (req, res) => {
    try {
      res.json(await D.statsDashboard());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 用户列表（ADMIN/PM；项目成员管理弹窗选择用户用；共享 /api/users 仅 ADMIN，故子系统提供）
  app.get('/api/projects/users', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (u.role !== 'ADMIN' && u.role !== 'PM') return res.status(403).json({ error: '无权限' });
      res.json(await D.fetchAll(null, 'SELECT id,username,display_name FROM users ORDER BY id'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 跨项目任务列表（筛选）
  app.get('/api/projects/tasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listAllTasks(null, {
        project_id: req.query.project_id, category: req.query.category,
        priority: req.query.priority, status: req.query.status, assignee_id: req.query.assignee_id
      });
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // CSV 导出（UTF-8 BOM；列：项目名称/任务名称/类别/优先级/责任人/状态/进度/计划日期/实际日期/描述/方案/备注）
  app.get('/api/projects/tasks/export', requireAuth, async (req, res) => {
    try {
      const rows = await D.listAllTasks(null, {});
      const head = ['项目名称', '任务名称', '类别', '优先级', '责任人', '状态', '进度(%)', '计划完成日期', '实际完成日期', '描述', '解决方案', '备注'];
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = [head.map(esc).join(',')];
      const STATE_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
      for (const r of rows) {
        lines.push([r.project_name, r.title, r.category, r.priority, r.assignee_name || '',
          STATE_CN[r.status] || r.status, r.progress, r.planned_date, r.actual_date,
          r.description, r.solution, r.notes].map(esc).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tasks-' + Date.now() + '.csv"');
      res.send('\uFEFF' + lines.join('\r\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 工作流配置读取
  app.get('/api/projects/workflow', requireAuth, async (req, res) => {
    try {
      res.json(await wf.loadWorkflow(null));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 工作流配置更新（ADMIN；行锁事务）
  app.put('/api/projects/workflow', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可修改状态机配置' });
      const body = req.body || {};
      // 拓扑固定校验：4 态 + 4 转移边
      const KEYS = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'OVERDUE'];
      if (!body.states || KEYS.some(k => !body.states[k]))
        return res.status(400).json({ error: '状态必须包含 NOT_STARTED/IN_PROGRESS/DONE/OVERDUE 四态' });
      if (!Array.isArray(body.transitions) || body.transitions.length === 0)
        return res.status(400).json({ error: 'transitions 必填' });
      await D.withTransaction(async conn => {
        // 行锁（9.3）
        await conn.execute("SELECT id FROM project_workflow WHERE flow_key='task' FOR UPDATE");
        await wf.saveWorkflow(conn, { initial: body.initial || 'NOT_STARTED', states: body.states, transitions: body.transitions }, u.id);
        await D.addProjectLog(conn, 'config', 1, 'CONFIG', JSON.stringify({ states: body.states, transitions: body.transitions }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
