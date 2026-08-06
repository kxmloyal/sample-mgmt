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
  connectionLimit: parseInt(process.env.DB_POOL_LIMIT || '20', 10),
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
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // ★ 子系统 DDL 已迁移至 subsystems/*/db/schema.sql，由下方自动扫描加载
  } finally {
    conn.release();
  }

  // ★ Phase 4: 自动扫描 subsystems/*/db/schema.sql 并执行建表（幂等，追加到已有表之后）
  const fs = require('fs');
  const path = require('path');
  const subsystemsDir = path.join(__dirname, 'subsystems');
  if (fs.existsSync(subsystemsDir)) {
    const subEntries = fs.readdirSync(subsystemsDir, { withFileTypes: true });
    for (const subEntry of subEntries) {
      if (!subEntry.isDirectory()) continue;
      const schemaPath = path.join(subsystemsDir, subEntry.name, 'db', 'schema.sql');
      if (!fs.existsSync(schemaPath)) continue;
      try {
        const sql = fs.readFileSync(schemaPath, 'utf8');
        const statements = sql.split(';').filter(s => s.trim());
        for (const stmt of statements) {
          await pool.execute(stmt);
        }
        console.log('[db] 子系统 schema 已加载: ' + subEntry.name);
      } catch (e) {
        console.error('[db] 加载子系统 schema 失败: ' + subEntry.name, e.message);
      }
    }
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

// ★ Phase 6: 自动扫描 subsystems/*/db/dao.js 工厂函数并实例化
// 各子系统 DAO 接受 { q, one, run, nowISO } 参数，通过展平暴露给 D.fnName()
const allDaoExports = {};
(function scanDao() {
  const fs = require('fs');
  const path = require('path');
  const subsystemsDir = path.join(__dirname, 'subsystems');
  if (!fs.existsSync(subsystemsDir)) return;
  const subEntries = fs.readdirSync(subsystemsDir, { withFileTypes: true });
  for (const subEntry of subEntries) {
    if (!subEntry.isDirectory()) continue;
    const daoPath = path.join(subsystemsDir, subEntry.name, 'db', 'dao.js');
    if (!fs.existsSync(daoPath)) continue;
    try {
      const createDao = require(daoPath);
      const deps = { q, one, run: dbRef.run, nowISO };
      const dao = createDao(deps);
      // 展平：同名函数冲突时加子系统前缀
      for (const key of Object.keys(dao)) {
        if (allDaoExports[key] !== undefined) {
          allDaoExports[subEntry.name + '_' + key] = dao[key];
          console.log('[db] DAO 函数名冲突，已重命名: ' + key + ' → ' + subEntry.name + '_' + key);
        } else {
          allDaoExports[key] = dao[key];
        }
      }
      console.log('[db] 子系统 DAO 已加载: ' + subEntry.name);
    } catch (e) {
      console.error('[db] 加载子系统 DAO 失败: ' + subEntry.name, e.message);
    }
  }
})();

// 治具文件管理 DAO（尚未迁移到 subsystems/fixtures/db/，保留手动加载）
const fixtureFiles = require('./db/fixture-files')({ q, one, dbRef, nowISO });

const ready = init(); // 兼容 server.js D.ready.then(...)
// withTransaction 包装：自动绑定 pool，routes 调用 D.withTransaction(async conn => {...})
function withTransaction(fn) { return txWithTransaction(getPool(), fn); }
module.exports = {
  init, ready, pool: getPool, nowISO, withTransaction,
  ...users, ...allDaoExports, ...fixtureFiles
};
