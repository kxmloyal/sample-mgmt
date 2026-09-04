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

// 用户-角色关联表：一人可并存多角色（2026-09-04 多角色架构，提交①）
// 兼容策略：users.role 单值列保留双写（主角色=首角色），读取以 user_roles 为准；迁移幂等
// 回滚：停用新判定逻辑即可（users.role 原样在，无损）
async function migrateUserRolesTable(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      role VARCHAR(20) NOT NULL,
      granted_by INT,
      granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_user_role (user_id, role),
      KEY idx_role (role),
      CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  // 存量回填：users.role → user_roles（只补缺失行，幂等；新角色写入走 DAO 双写）
  await pool.execute(`
    INSERT IGNORE INTO user_roles (user_id, role)
    SELECT id, role FROM users WHERE role IS NOT NULL AND role <> ''
  `);
}

module.exports = { migrateUserEnabled, migrateUsersSessionVersion, migrateUserRolesTable };
