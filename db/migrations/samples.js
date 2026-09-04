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

// 领用/归还流程底座：samples 借出六列（2026-09-05，幂等，全列可空兼容存量）
// 设计文档：docs/superpowers/specs/2026-09-05-samples-checkout-design.md
const CHECKOUT_COLUMNS = [
  ['checkout_user', 'VARCHAR(50) NULL DEFAULT NULL'],
  ['checkout_dept', 'VARCHAR(50) NULL DEFAULT NULL'],
  ['checkout_at', 'VARCHAR(24) NULL DEFAULT NULL'],
  ['expected_return_at', 'VARCHAR(24) NULL DEFAULT NULL'],
  ['returned_at', 'VARCHAR(24) NULL DEFAULT NULL'],
  ['checkout_note', 'VARCHAR(200) NULL DEFAULT NULL']
];

async function migrateSamplesCheckout(pool) {
  for (const [name, def] of CHECKOUT_COLUMNS) {
    try { await pool.execute('ALTER TABLE samples ADD COLUMN ' + name + ' ' + def); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

module.exports = { migrateSamplesOptimisticLock, migrateSamplesSoftDelete, migrateSamplesCheckout };
