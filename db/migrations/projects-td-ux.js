// db/migrations/projects-td-ux.js — 任务详情交互强化（2026-09-08 方案A）
// ① project_subtasks 加 sort 列（拖拽排序持久化；INT NOT NULL DEFAULT 0，存量数据按 id 顺序回填）
// ② project_task_comments 加 mentions 列（JSON 数组字符串，存被 @ 的 user_id 列表；NULL=无提及，兼容存量）
// 幂等：information_schema 判断列存在性 + ER_DUP_FIELDNAME 兜底（并发迁移/残留半态自愈）
async function migrateProjectTdUx(pool) {
  const ensure = async function (alterSql, checkSql) {
    const [c] = await pool.query(checkSql);
    if (c[0].c) return;
    try { await pool.execute(alterSql); }
    catch (e) { if (e.errno !== 1060) throw e; /* 1060=DUP_FIELDNAME：列已在（半态自愈），忽略 */ }
  };
  await ensure('ALTER TABLE project_subtasks ADD COLUMN sort INT NOT NULL DEFAULT 0 AFTER status',
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_subtasks' AND COLUMN_NAME='sort'");
  // 存量回填：仅 sort 全 0 时执行（幂等）；按 task 分组、按现有 id 顺序编号（与默认展示顺序一致，行为零变化）
  const [[z]] = await pool.query('SELECT COUNT(*) c FROM project_subtasks WHERE sort=0');
  if (z.c > 0) {
    await pool.execute(
      'UPDATE project_subtasks ps JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY task_id ORDER BY id) rn FROM project_subtasks) t ON ps.id=t.id SET ps.sort=t.rn');
  }
  // 索引幂等
  const [idx] = await pool.query(
    "SELECT COUNT(*) c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_subtasks' AND INDEX_NAME='idx_ps_task_sort'");
  if (!idx[0].c) {
    try { await pool.execute('CREATE INDEX idx_ps_task_sort ON project_subtasks (task_id, sort)'); }
    catch (e) { if (e.errno !== 1061) throw e; /* 1061=DUP_INDEX */ }
  }
  await ensure("ALTER TABLE project_task_comments ADD COLUMN mentions VARCHAR(500) DEFAULT NULL AFTER content",
    "SELECT COUNT(*) c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='project_task_comments' AND COLUMN_NAME='mentions'");
}

module.exports = { migrateProjectTdUx };
