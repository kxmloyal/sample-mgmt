// db/migrations/fixtures.js — 治具子系统迁移（B3-T2 拆分，行为零变化）
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


// F1/F2 治具修复（2026-09-02）：fixtures 加 version 乐观锁列；fixture_files 补 file_size/uploaded_at/外键（幂等）
// 2026-09-03 修复：DDL 在并发 init 下可能死锁（ER_LOCK_DEADLOCK），每个 ALTER 加重试
async function migrateFixtureSchemaAlign(pool) {
  var retry = async function (fn) {
    for (var i = 0; i < 3; i++) {
      try { return await fn(); }
      catch (e) {
        if (e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT') { await new Promise(r => setTimeout(r, 200 * (i + 1))); continue; }
        if (e.code !== 'ER_DUP_FIELDNAME') throw e;
        return; // 列已存在，幂等通过
      }
    }
  };
  await retry(function () { return pool.execute('ALTER TABLE fixtures ADD COLUMN version INT NOT NULL DEFAULT 1'); });
  await retry(function () { return pool.execute('ALTER TABLE fixtures ADD COLUMN verify_reject_by INT'); });
  await retry(function () { return pool.execute('ALTER TABLE fixtures ADD COLUMN verify_reject_at DATETIME'); });
  await retry(function () { return pool.execute('ALTER TABLE fixtures ADD COLUMN verify_reject_note TEXT'); });
  await retry(function () { return pool.execute('ALTER TABLE fixtures ADD COLUMN verify_reject_count INT DEFAULT 0'); });
  await retry(function () { return pool.execute('ALTER TABLE fixture_files ADD COLUMN file_size INT DEFAULT 0'); });
  await retry(function () { return pool.execute('ALTER TABLE fixture_files ADD COLUMN uploaded_at DATETIME'); });
  try {
    var [fk] = await pool.execute("SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='fixture_files' AND CONSTRAINT_TYPE='FOREIGN KEY'");
    if (!fk[0].c) await pool.execute('ALTER TABLE fixture_files ADD CONSTRAINT fk_ffiles_fixture FOREIGN KEY (fixture_id) REFERENCES fixtures(id) ON DELETE CASCADE');
  } catch (e) { /* 外键添加失败不阻断（如已存在/引擎限制） */ }
}

module.exports = { migrateFixtureLifecycle, migrateFixtureFiles, migrateFixtureMaintenance, migratePerfIndexes, migrateFixtureSchemaAlign };
