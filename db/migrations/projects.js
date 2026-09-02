// db/migrations/projects.js — 项目追踪子系统迁移（B3-T2 拆分，行为零变化）
async function migrateProjectTaskIndexes(pool) {
  // C：看板统计索引，消除 overdue 与近 8 周趋势查询全扫描（MySQL 8.0 兼容，幂等）
  var indexes = [
    'ALTER TABLE project_tasks ADD INDEX idx_status_planned (status, planned_date)',
    'ALTER TABLE project_tasks ADD INDEX idx_status_created (status, created_at)'
  ];
  for (var i = 0; i < indexes.length; i++) {
    try { await pool.execute(indexes[i]); }
    catch (e) { if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_INDEX') throw e; }
  }
}

module.exports = { migrateProjectTaskIndexes };
