// db/migrations/projects-plm.js — 项目追踪 v3（方案一A-2/三B/三C，2026-09）
// ① 方案一A-2：存量 OVERDUE 物理行回迁（OVERDUE 回归纯派生态后，物理 OVERDUE 行已无入边来源；
//    按 planned_date 回迁：有计划日期 → NOT_STARTED/IN_PROGRESS 按创建语义取 IN_PROGRESS（有过流转动作 version>0 视为已开始），
//    无计划日期 → NOT_STARTED；同事务批量、幂等（仅当存在 OVERDUE 行时执行）
// ② 方案三B：project_tasks 加 start_date DATE NULL（计划开始日，甘特真实跨度）
// ③ 方案三C：project_risks / project_changes 加 task_id INT NULL（关联任务互链，LEFT JOIN 兼容存量）
// ④ workflow 配置修复：project_workflow 若存有旧版 states/transitions（无 CANCELLED/新出边），删除配置行回退 manifest 默认
//    （旧配置缺新转边会让前端按钮死锁，删除后 loadWorkflow 自动使用 manifest 最新默认；管理员可在状态机页重新微调保存）
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
}

module.exports = { migrateProjectPlm };
