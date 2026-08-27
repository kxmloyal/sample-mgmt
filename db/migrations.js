// db/migrations.js — 数据库迁移脚本
async function migrateFixtureLifecycle(pool) {
  var adds = [
    'ADD COLUMN expected_finish_at DATETIME',
    'ADD COLUMN improve_note TEXT',
    'ADD COLUMN improvement_count INT DEFAULT 0',
    'ADD COLUMN improved_by INT',
    'ADD COLUMN improved_at DATETIME'
  ];
  for (var i = 0; i < adds.length; i++) {
    try { await pool.execute('ALTER TABLE fixtures ' + adds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

async function migrateFixtureFiles(pool) {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS fixture_files (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fixture_id INT NOT NULL,
        category VARCHAR(30) NOT NULL DEFAULT 'other',
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(100),
        file_size INT DEFAULT 0,
        uploaded_by INT,
        uploaded_at DATETIME,
        FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE,
        INDEX idx_ffiles_fixture (fixture_id),
        INDEX idx_ffiles_category (category)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) { if (e.code !== 'ER_TABLE_EXISTS_ERROR') throw e; }
}

async function migrateFixtureMaintenance(pool) {
  var adds = [
    'ADD COLUMN storage_location VARCHAR(100)',
    'ADD COLUMN maintenance_cycle_days INT DEFAULT 0',
    'ADD COLUMN last_maintenance_at DATETIME',
    'ADD COLUMN next_maintenance_at DATETIME'
  ];
  for (var i = 0; i < adds.length; i++) {
    try { await pool.execute('ALTER TABLE fixtures ' + adds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

async function migratePerfIndexes(pool) {
  // P0 性能索引：消除全表扫描，优化 overdue/保养逾期/归还逾期查询
  var indexes = [
    'ALTER TABLE fixtures ADD INDEX idx_fixtures_next_maint (next_maintenance_at)',
    'ALTER TABLE fixtures ADD INDEX idx_fixtures_retired (retired_at)',
    'ALTER TABLE fixtures ADD INDEX idx_fixtures_status_return (status, expected_return_at)',
    'ALTER TABLE samples ADD INDEX idx_samples_status_inspect (status, next_inspect_at)'
  ];
  for (var i = 0; i < indexes.length; i++) {
    try { await pool.execute(indexes[i]); }
    catch (e) { if (e.code !== 'ER_DUP_KEYNAME' && e.code !== 'ER_DUP_INDEX') throw e; }
  }
}

async function migrateUserEnabled(pool) {
  // 账号启用/禁用开关（2026-08-06 批量管理）：存量 users 表补列，幂等
  try {
    await pool.execute('ALTER TABLE users ADD COLUMN enabled TINYINT(1) NOT NULL DEFAULT 1');
  } catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
}

async function migrateControlNcrDetail(pool) {
  // NCR 详细内容：主表补喷码日期/重工标准；报工子表补处理结果（2026-08-26，spec §4，幂等）
  var orderAdds = [
    'ADD COLUMN spray_date VARCHAR(24)',
    'ADD COLUMN rework_guide TEXT',
    'ADD COLUMN rework_other TEXT'
  ];
  for (var i = 0; i < orderAdds.length; i++) {
    try { await pool.execute('ALTER TABLE control_orders ' + orderAdds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
  var reworkAdds = [
    'ADD COLUMN batch_no VARCHAR(50)',
    'ADD COLUMN pack_record VARCHAR(100)',
    'ADD COLUMN confirm_by VARCHAR(50)',
    'ADD COLUMN qty_consistent TINYINT(1) DEFAULT 0'
  ];
  for (var n = 0; n < reworkAdds.length; n++) {
    try { await pool.execute('ALTER TABLE control_rework_logs ' + reworkAdds[n]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

async function migrateControlNcrForm(pool) {
  // NCR 电子表单化：主表补客户/不良原因分析5分项/包装SOP编号（2026-08-27，spec §3，幂等）
  var adds = [
    'ADD COLUMN customer VARCHAR(100)',
    'ADD COLUMN bad_appearance TEXT',
    'ADD COLUMN bad_function TEXT',
    'ADD COLUMN bad_size TEXT',
    'ADD COLUMN bad_change TEXT',
    'ADD COLUMN bad_other TEXT',
    'ADD COLUMN pack_sop VARCHAR(100)'
  ];
  for (var i = 0; i < adds.length; i++) {
    try { await pool.execute('ALTER TABLE control_orders ' + adds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

async function runMigrations(pool) {
  await migrateFixtureLifecycle(pool);
  await migrateFixtureFiles(pool);
  await migrateFixtureMaintenance(pool);
  await migratePerfIndexes(pool);
  await migrateUserEnabled(pool);
  await migrateControlNcrDetail(pool);
  await migrateControlNcrForm(pool);
}

module.exports = { runMigrations };
