// db/migrations/samples.js — 样品子系统迁移（B3-T2 拆分，行为零变化）
async function migrateSamplesOptimisticLock(pool) {
  // 样品乐观锁底座：version 列（2026-09-01，幂等）
  try { await pool.execute('ALTER TABLE samples ADD COLUMN version INT NOT NULL DEFAULT 1'); }
  catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
}

async function migrateSamplesSoftDelete(pool) {
  // 样品软删除底座：deleted_at 列（2026-09-01，幂等）
  try { await pool.execute('ALTER TABLE samples ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL'); }
  catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
}

module.exports = { migrateSamplesOptimisticLock, migrateSamplesSoftDelete };
