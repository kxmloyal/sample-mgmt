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

async function runMigrations(pool) {
  await migrateFixtureLifecycle(pool);
  await migrateFixtureFiles(pool);
  await migrateFixtureMaintenance(pool);
}

module.exports = { runMigrations };
