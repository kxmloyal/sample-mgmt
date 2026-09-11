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
// 设计文档：docs/archive/specs/2026-09-05-samples-checkout-design.md
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

// 编号占用口径修订（2026-09-11）：取消「建样未制作(NEW)」样品后应释放其流水号供新样品复用
// （占用口径见 subsystems/samples/db/sample-code.js 的 USED_SQL / RELEASABLE_ON_DELETE）。
// 阻塞点：samples.sample_no 的原唯一索引（索引名 sample_no）会把软删行继续锁死——取号器即便放出该号，
// 新样品 INSERT 也会撞唯一键。故改为「仅存活行唯一」的**函数唯一索引**：
//   UNIQUE ( IF(deleted_at IS NULL, sample_no, NULL) )   —— NULL 之间不互斥，软删行不再阻塞复用
// 实测（MySQL 8.0.45 + sample_mgmt_test）：软删行同号可共存、存活行可复用该号；两个存活行同号仍被
// ER_DUP_ENTRY(1062) 拒绝，唯一性未削弱。
// 前置：deleted_at 列由 migrateSamplesSoftDelete 添加，本迁移 MUST 在其之后执行（见 migrations/index.js 末位）。
// 幂等：先探测索引现状再改，兼容 db.js init() 双跑；存量无需数据订正——口径改后已取消的 NEW 行自然不再
// 占用序号（「回溯释放现存 6 条」即由此自动生效）。
// 回滚：ALTER TABLE samples DROP INDEX uk_sample_no_live, ADD UNIQUE KEY sample_no (sample_no)
// （回滚前须确认无同号并存行，否则因重复值失败）。
async function migrateSamplesSampleNoRelease(pool) {
  const [rows] = await pool.query(
    "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='samples' AND INDEX_NAME IN ('sample_no','uk_sample_no_live') GROUP BY INDEX_NAME");
  const has = new Set(rows.map(function (r) { return r.INDEX_NAME; }));
  if (has.has('uk_sample_no_live') && !has.has('sample_no')) return; // 已是目标形态，防重入
  const parts = [];
  if (has.has('sample_no')) parts.push('DROP INDEX sample_no');
  if (!has.has('uk_sample_no_live')) parts.push('ADD UNIQUE KEY uk_sample_no_live ((IF(deleted_at IS NULL, sample_no, NULL)))');
  if (!parts.length) return;
  await pool.execute('ALTER TABLE samples ' + parts.join(', '));
}

module.exports = { migrateSamplesOptimisticLock, migrateSamplesSoftDelete, migrateSamplesCheckout, migrateSamplesDeletedAtTz, migrateSamplesSampleNoRelease };
