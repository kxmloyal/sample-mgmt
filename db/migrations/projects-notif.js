// db/migrations/projects-notif.js — 项目子系统通知中心表（2026-09-08 方案B-②）
// 幂等 CREATE TABLE IF NOT EXISTS；子系统内自治，不触碰任何共享表
async function migrateProjectNotifications(pool) {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS project_notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL COMMENT '接收人',
      type VARCHAR(30) NOT NULL COMMENT 'ASSIGN/STATUS/OVERDUE/CHANGE_APPROVAL/MENTION',
      title VARCHAR(200) NOT NULL,
      body VARCHAR(500) DEFAULT '',
      link VARCHAR(300) DEFAULT '' COMMENT 'hash 深链，如 #/tasks/123',
      ref_type VARCHAR(20) DEFAULT '' COMMENT 'task/project/change',
      ref_id INT DEFAULT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_pn_user_unread (user_id, is_read),
      KEY idx_pn_user_time (user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目子系统站内通知'
  `);
}

module.exports = { migrateProjectNotifications };
