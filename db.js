const mysql = require('mysql2/promise');
const { runMigrations } = require('./db/migrations');
const { withTransaction: txWithTransaction } = require('./db/tx');
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'sample_mgmt',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sample_mgmt',
  charset: 'utf8mb4',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
};
let pool = null;

function nowISO() { return new Date().toISOString(); }

function getPool() {
  if (!pool) throw new Error('DB pool not initialized. Call init() first.');
  return pool;
}

async function init() {
  pool = mysql.createPool(dbConfig);
  const conn = await pool.getConnection();
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL,
        dept VARCHAR(50),
        display_name VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS samples (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sample_no VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(200),
        spec VARCHAR(200),
        model VARCHAR(100),
        station VARCHAR(50),
        image VARCHAR(500),
        produced_image VARCHAR(500),
        inspect_image VARCHAR(500),
        qr_token VARCHAR(64) UNIQUE NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'NEW',
        created_by INT,
        produced_at VARCHAR(24),
        released_at VARCHAR(24),
        release_cycle_days INT,
        next_inspect_at VARCHAR(24),
        custody_dept VARCHAR(50),
        storage_location VARCHAR(100),
        notes TEXT,
        sample_type VARCHAR(20),
        limit_item VARCHAR(50),
        source_type VARCHAR(10),
        valid_until VARCHAR(24),
        card_version VARCHAR(10),
        test_standard TEXT,
        test_data TEXT,
        signed_by_rnd VARCHAR(50), /* @deprecated: 旧字段，保留兼容，新逻辑请用 signed_by_rd */
        signed_by_rd VARCHAR(50),
        signed_by_qa VARCHAR(50),
        retired_reason TEXT,
        replaced_by VARCHAR(20),
        replaces VARCHAR(20),
        retire_assigned_rd VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_samples_status (status),
        INDEX idx_samples_retire_rd (retire_assigned_rd)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS scan_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sample_id INT NOT NULL,
        action VARCHAR(30) NOT NULL,
        role VARCHAR(20),
        user_id INT,
        dept VARCHAR(50),
        location VARCHAR(100),
        note TEXT,
        target_type VARCHAR(10) DEFAULT 'sample',
        target_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_logs_sample (sample_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS fixtures (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fixture_no VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(200) NOT NULL,
        spec VARCHAR(200),
        model VARCHAR(100),
        station VARCHAR(100),
        category VARCHAR(50),
        status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
        requested_by INT,
        requested_dept VARCHAR(50),
        request_note TEXT,
        request_image VARCHAR(300),
        made_by INT,
        made_at DATETIME,
        made_note TEXT,
        made_image VARCHAR(300),
        verified_rd INT,
        verified_rd_at DATETIME,
        verified_me INT,
        verified_me_at DATETIME,
        transferred_at DATETIME,
        verify_note TEXT,
        used_by INT,
        used_at DATETIME,
        use_location VARCHAR(100),
        expected_return_days INT DEFAULT NULL,
        expected_return_at DATETIME DEFAULT NULL,
        use_note TEXT,
        repair_type VARCHAR(10),
        repair_requested_by INT,
        repair_requested_at DATETIME,
        repair_note TEXT,
        repaired_by INT,
        repaired_at DATETIME,
        repair_done_image VARCHAR(300),
        repair_confirmed_by INT,
        repair_confirmed_at DATETIME,
        retired_by INT,
        retired_at DATETIME,
        retired_reason TEXT,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fixtures_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS fixture_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fixture_id INT NOT NULL,
        action VARCHAR(30) NOT NULL,
        role VARCHAR(20),
        user_id INT,
        dept VARCHAR(50),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_flogs_fixture (fixture_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    conn.release();
  }
  await runMigrations(pool);
  return true;
}

function toObj(row) {
  if (!row) return undefined;
  if (Array.isArray(row)) return row;
  return Object.assign({}, row);
}

async function q(sql, params) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params || []);
  return rows.map(toObj);
}

async function one(sql, params) {
  const pool = getPool();
  const [rows] = await pool.execute(sql, params || []);
  return rows.length ? toObj(rows[0]) : undefined;
}

const dbRef = {
  run: async function(sql, params) {
    const pool = getPool();
    await pool.execute(sql, params || []);
  }
};
const users = require('./db/users')({ q, one, dbRef });
const samples = require('./db/samples')({ q, one, dbRef, nowISO });
const logs = require('./db/logs')({ q, dbRef });
const fixtures = require('./db/fixtures')({ q, one, dbRef, nowISO });
const fixtureFiles = require('./db/fixture-files')({ q, one, dbRef, nowISO });

const ready = init(); // 兼容 server.js D.ready.then(...)
// withTransaction 包装：自动绑定 pool，routes 调用 D.withTransaction(async conn => {...})
function withTransaction(fn) { return txWithTransaction(getPool(), fn); }
module.exports = {
  init, ready, pool: getPool, nowISO, withTransaction,
  ...users, ...samples, ...logs, ...fixtures, ...fixtureFiles
};
