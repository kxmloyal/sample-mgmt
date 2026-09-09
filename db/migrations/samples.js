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

// deleted_at 时区口径统一（2026-09-09）：软删除原用 UTC_TIMESTAMP()——该函数返回 UTC 真实时刻，
// 会话时区 +08 下 TIMESTAMP 列存储/展示为「UTC 值的墙钟直存」，比 NOW()（+08 墙钟）慢 8h。
// ① 存量一次性校正：deleted_at 整体 +8h 归位（方向实证：id=68 原值 03:32:06，实际软删动作发生在
//    updated_at 同刻的 11:32:06 → +8h 才是正确方向；2026-09-09 首跑误用 -8h 已在生产 +16h 复原，
//    本迁移仅服务未校正过的环境，标志表防重入）
// ② dao.js deleteSample 同步改写 NOW()（已一并修改）
// 注意：生产执行前需备份 samples 表（2026-09-09 已按用户要求先备份再操作）
async function migrateSamplesDeletedAtTz(pool) {
  const [[mk]] = await pool.query(
    "SELECT COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='_migr_sample_deleted_tz'");
  if (mk.c) return; // 已执行过，防重入
  await pool.execute("UPDATE samples SET deleted_at = DATE_ADD(deleted_at, INTERVAL 8 HOUR) WHERE deleted_at IS NOT NULL");
  await pool.execute("CREATE TABLE _migr_sample_deleted_tz (id INT PRIMARY KEY, done_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
  await pool.execute("INSERT INTO _migr_sample_deleted_tz (id) VALUES (1)");
}

module.exports = { migrateSamplesOptimisticLock, migrateSamplesSoftDelete, migrateSamplesCheckout, migrateSamplesDeletedAtTz };
