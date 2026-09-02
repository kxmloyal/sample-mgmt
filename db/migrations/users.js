// db/migrations/users.js — 用户表迁移（B3-T2 拆分，行为零变化）
async function migrateUserEnabled(pool) {
  // 账号启用/禁用开关（2026-08-06 批量管理）：存量 users 表补列，幂等
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1');
  } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
}

// 会话版本失效底座：users.session_version 列（2026-09-01 安全专项，幂等）
async function migrateUsersSessionVersion(pool) {
  try { await pool.execute('ALTER TABLE users ADD COLUMN session_version INT NOT NULL DEFAULT 0'); }
  catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
}

module.exports = { migrateUserEnabled, migrateUsersSessionVersion };
