// subsystems/projects/seed/seed.js — 项目追踪种子数据（幂等：项目名/任务标题存在则跳过）
// 测试数据：2 项目、6 任务（4 态覆盖）、子任务/依赖/评论/关联/日志
const bcrypt = require('bcryptjs');

async function seed(pool) {
  const q = async (sql, params) => (await pool.execute(sql, params || []))[0];
  const one = async (sql, params) => {
    const rows = await q(sql, params);
    return rows.length ? rows[0] : undefined;
  };

  // 用户（复用/创建：pm01 项目经理）
  let pm = await one('SELECT * FROM users WHERE username=?', ['pm01']);
  if (!pm) {
    await q('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      ['pm01', bcrypt.hashSync('pm123', 10), 'PM', '项目部', '项目经理']);
    pm = await one('SELECT * FROM users WHERE username=?', ['pm01']);
  }
  const rd = await one('SELECT * FROM users WHERE username=?', ['rd01']);
  const qa = await one('SELECT * FROM users WHERE username=?', ['qa01']);
  const me = await one('SELECT * FROM users WHERE username=?', ['me01']);
  const admin = await one('SELECT * FROM users WHERE username=?', ['admin']);

  // 项目 P1（含任务 + 成员）
  let p1 = await one('SELECT * FROM projects WHERE name=?', ['P1-新品导入']);
  if (!p1) {
    const r = await q('INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)',
      ['P1-新品导入', '样品 A 量产导入', 'ACTIVE', pm.id]);
    p1 = { id: r.insertId };
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,1)', [p1.id, pm.id]);
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,0)', [p1.id, rd.id]);
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,0)', [p1.id, qa.id]);
  }

  // 项目 P2（成员：pm01 owner + me01）
  let p2 = await one('SELECT * FROM projects WHERE name=?', ['P2-治具改善']);
  if (!p2) {
    const r = await q('INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)',
      ['P2-治具改善', '治具寿命提升改善', 'ACTIVE', pm.id]);
    p2 = { id: r.insertId };
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,1)', [p2.id, pm.id]);
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,0)', [p2.id, me.id]);
  }

  // 任务：4 态全覆盖（NOT_STARTED / IN_PROGRESS / DONE / OVERDUE）
  const tasks = [
    { project_id: p1.id, title: 'T1-样品A测试验证', category: 'quality', priority: 'H', assignee_id: qa.id, planned_date: '2026-08-20', status: 'IN_PROGRESS', progress: 60, solution: '已完成首轮测试' },
    { project_id: p1.id, title: 'T2-产线SOP编制', category: 'process', priority: 'M', assignee_id: rd.id, planned_date: '2026-08-25', status: 'NOT_STARTED', progress: 0, solution: '' },
    { project_id: p1.id, title: 'T3-物料确认', category: 'device', priority: 'L', assignee_id: rd.id, planned_date: '2026-07-20', status: 'DONE', progress: 100, actual_date: '2026-07-18' },
    { project_id: p1.id, title: 'T4-安全评估', category: 'safety', priority: 'H', assignee_id: me.id, planned_date: '2026-06-30', status: 'OVERDUE', progress: 30, solution: '延期，等待产线评估' },
    { project_id: p1.id, title: 'T5-样品B关联任务', category: 'other', priority: 'M', assignee_id: qa.id, planned_date: '2026-09-01', status: 'NOT_STARTED', progress: 0 },
    { project_id: p2.id, title: 'T6-治具寿命测试', category: 'quality', priority: 'M', assignee_id: me.id, planned_date: '2026-09-10', status: 'NOT_STARTED', progress: 0 }
  ];
  const taskIds = {};
  for (const t of tasks) {
    const exist = await one('SELECT * FROM project_tasks WHERE title=?', [t.title]);
    if (exist) { taskIds[t.title] = exist.id; continue; }
    const r = await q(
      'INSERT INTO project_tasks (project_id,title,category,priority,assignee_id,planned_date,actual_date,status,progress,solution,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [t.project_id, t.title, t.category, t.priority, t.assignee_id, t.planned_date, t.actual_date || null, t.status, t.progress, t.solution || null, pm.id]);
    taskIds[t.title] = r.insertId;
    await q('INSERT INTO project_logs (entity_type,entity_id,action,detail,operator_id) VALUES (?,?,?,?,?)',
      ['task', r.insertId, 'CREATE', JSON.stringify({ title: t.title }), pm.id]);
  }

  // T1 附加：子任务 + 依赖 + 评论 + 关联样品
  const t1 = taskIds['T1-样品A测试验证'];
  const sub = await one('SELECT * FROM project_subtasks WHERE task_id=? AND title=?', [t1, '功能测试']);
  if (!sub) {
    await q('INSERT INTO project_subtasks (task_id,title,assignee_id,status,planned_date,created_by) VALUES (?,?,?,?,?,?)',
      [t1, '功能测试', qa.id, 'IN_PROGRESS', '2026-08-15', pm.id]);
  }
  const dep = await one('SELECT * FROM project_task_deps WHERE task_id=? AND depends_on_id=?', [t1, taskIds['T3-物料确认']]);
  if (!dep) {
    await q('INSERT INTO project_task_deps (task_id,depends_on_id,created_by) VALUES (?,?,?)',
      [t1, taskIds['T3-物料确认'], pm.id]);
  }
  const cmt = await one('SELECT * FROM project_task_comments WHERE task_id=?', [t1]);
  if (!cmt) {
    await q('INSERT INTO project_task_comments (task_id,content,operator_id) VALUES (?,?,?)',
      [t1, '首轮测试完成，等待物料确认', qa.id]);
  }
  const link = await one('SELECT * FROM project_task_links WHERE task_id=? AND ref_type=?', [t1, 'sample']);
  if (!link) {
    const s = await one('SELECT id FROM samples ORDER BY id LIMIT 1');
    if (s) await q('INSERT INTO project_task_links (task_id,ref_type,ref_id) VALUES (?,?,?)', [t1, 'sample', s.id]);
  }

  console.log('[projects-seed] 完成: 2 项目 / 6 任务 / 子任务+依赖+评论+关联');
}

module.exports = seed;
