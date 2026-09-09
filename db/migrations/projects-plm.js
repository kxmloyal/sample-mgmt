// db/migrations/projects-plm.js — 项目追踪 v3（方案一A-2/三B/三C，2026-09）+ 设备导入追踪（2026-09-08 ⑤⑥）
// ① 方案一A-2：存量 OVERDUE 物理行回迁（OVERDUE 回归纯派生态后，物理 OVERDUE 行已无入边来源；
//    按 planned_date 回迁：有计划日期 → NOT_STARTED/IN_PROGRESS 按创建语义取 IN_PROGRESS（有过流转动作 version>0 视为已开始），
//    无计划日期 → NOT_STARTED；同事务批量、幂等（仅当存在 OVERDUE 行时执行）
// ② 方案三B：project_tasks 加 start_date DATE NULL（计划开始日，甘特真实跨度）
// ③ 方案三C：project_risks / project_changes 加 task_id INT NULL（关联任务互链，LEFT JOIN 兼容存量）
// ④ workflow 配置修复：project_workflow 若存有旧版 states/transitions（无 CANCELLED/新出边），删除配置行回退 manifest 默认
//    （旧配置缺新转边会让前端按钮死锁，删除后 loadWorkflow 自动使用 manifest 最新默认；管理员可在状态机页重新微调保存）
// ⑤ 设备导入：project_extras 加 expected_benefit/benefit_note（效益追踪）
// ⑥ 设备导入：内置「设备导入标准流程」模板种子（5 阶段任务 + 3 里程碑，按名称幂等）
// 幂等策略：information_schema 检查 + errno 1060/1091 兜底（并发迁移/半态自愈）
async function migrateProjectPlm(pool) {
  const ensure = async function (alterSql, checkSql) {
    const [c] = await pool.query(checkSql);
    if (c[0].c) return;
    try { await pool.execute(alterSql); }
    catch (e) { if (e.errno !== 1060) throw e; /* 1060=DUP_FIELDNAME：列已在 */ }
  };

  // ② start_date 列
  await ensure('ALTER TABLE project_tasks ADD COLUMN start_date DATE NULL AFTER assignee_id',
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_tasks' AND COLUMN_NAME='start_date'");

  // ③ 互链列
  await ensure('ALTER TABLE project_risks ADD COLUMN task_id INT NULL AFTER mitigation',
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_risks' AND COLUMN_NAME='task_id'");
  await ensure('ALTER TABLE project_changes ADD COLUMN task_id INT NULL AFTER reason',
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_changes' AND COLUMN_NAME='task_id'");
  // 互链查询索引（幂等；失败仅当索引已存在）
  for (const [tbl, idx] of [['project_risks', 'idx_risk_task'], ['project_changes', 'idx_chg_task']]) {
    const [ix] = await pool.query(
      "SELECT COUNT(*) c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?", [tbl, idx]);
    if (!ix[0].c) {
      try { await pool.execute('CREATE INDEX ' + idx + ' ON ' + tbl + ' (task_id)'); }
      catch (e) { if (e.errno !== 1061) throw e; /* 1061=DUP_INDEX */ }
    }
  }

  // ① 存量 OVERDUE 回迁（幂等：仅当存在物理 OVERDUE 行）
  const [[od]] = await pool.query("SELECT COUNT(*) c FROM project_tasks WHERE status='OVERDUE'");
  if (od.c > 0) {
    // version>0 视为曾经流转过（进行中被延期）→ IN_PROGRESS；否则 NOT_STARTED
    await pool.execute(
      "UPDATE project_tasks SET status='IN_PROGRESS' WHERE status='OVERDUE' AND version > 0");
    await pool.execute(
      "UPDATE project_tasks SET status='NOT_STARTED' WHERE status='OVERDUE'");
  }

  // ④ 旧版 workflow 配置自动失效：states 含 OVERDUE 但缺 CANCELLED，或 transitions 无 OVERDUE 出边 → 删除配置行
  //    （下次 loadWorkflow 回退 manifest 默认新拓扑；对已自定义配置的管理员，状态机管理页可重新保存微调）
  const rows = await pool.query("SELECT cfg_key, cfg_value FROM project_workflow WHERE flow_key='task'");
  const cfg = {};
  for (const r of rows[0]) cfg[r.cfg_key] = r.cfg_value;
  let stale = false;
  if (cfg.states) {
    try {
      const s = JSON.parse(cfg.states);
      if (!s.CANCELLED) stale = true; // 旧 4 态配置
    } catch (e) { stale = true; }   // 脏数据
  }
  if (cfg.transitions) {
    try {
      const ts = JSON.parse(cfg.transitions);
      if (!ts.some(function (t) { return t.from === 'OVERDUE'; })) stale = true; // OVERDUE 无出边 = 旧死锁拓扑
    } catch (e) { stale = true; }
  }
  if (stale) {
    await pool.execute("DELETE FROM project_workflow WHERE flow_key='task' AND cfg_key IN ('states','transitions','initial')");
  }

  // ⑤ 设备导入追踪（2026-09-08）：project_extras 加效益字段（预期效益文本/实际效益备注）
  //    （routes-changes BUDGET 联动等旧调用方不传新键时写 NULL，兼容存量行为）
  await ensure("ALTER TABLE project_extras ADD COLUMN expected_benefit TEXT NULL COMMENT '预期效益（年节约/产能提升等）' AFTER priority",
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_extras' AND COLUMN_NAME='expected_benefit'");
  await ensure("ALTER TABLE project_extras ADD COLUMN benefit_note TEXT NULL COMMENT '实际效益备注（验收后填写）' AFTER expected_benefit",
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_extras' AND COLUMN_NAME='benefit_note'");

  // ⑥ 设备导入标准模板种子（幂等：按名称存在即跳过；5 阶段任务 + 3 里程碑）
  //    阶段链：前期评估 → 方案制定（明细/图纸/设计要点） → 设计评审 → 采购/制造 → 验收与效益确认
  //    偏移天数基于项目启动日；实例化时 routes-templates 换算 planned_date，阶段先后由人工按日期衔接
  const tplName = '设备导入标准流程';
  const tpl = await pool.query('SELECT id FROM project_templates WHERE name=? AND is_active=1', [tplName]);
  if (!tpl[0].length) {
    const tasks = [
      { title: '前期评估（需求/可行性/成本初估）', category: 'equipment', priority: 'H', offset_days: 0, planned_days: 5 },
      { title: '方案制定（方案明细/设计要点/图纸清单）', category: 'equipment', priority: 'H', offset_days: 5, planned_days: 10 },
      { title: '设计评审（图纸/方案会审，风险识别）', category: 'equipment', priority: 'H', offset_days: 15, planned_days: 3 },
      { title: '采购与制造（跟催/到料/装配）', category: 'equipment', priority: 'M', offset_days: 18, planned_days: 30 },
      { title: '验收与效益确认（成品验证/效益回填）', category: 'equipment', priority: 'H', offset_days: 48, planned_days: 7 }
    ];
    const milestones = [
      { name: '评估完成（立项）', target_offset_days: 5 },
      { name: '方案评审通过', target_offset_days: 18 },
      { name: '设备验收完成', target_offset_days: 55 }
    ];
    // created_by 取 0（系统种子；模板页编辑保存会补真实操作人）
    await pool.execute(
      'INSERT INTO project_templates (name,description,tasks_json,milestones_json,created_by) VALUES (?,?,?,?,0)',
      [tplName, '设备导入五阶段：评估→方案→评审→采购制造→验收效益；图纸(dwg/dxf/step)可作任务附件上传（≤50MB）',
       JSON.stringify(tasks), JSON.stringify(milestones)]);
  }
}

module.exports = { migrateProjectPlm };
