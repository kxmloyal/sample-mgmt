const mysql = require('mysql2/promise');
const { runStartupDdl } = require('./db/migrations');
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
let initPromise = null; // ★ 单飞（2026-09-16）：并发调用共享同一次初始化，避免「两套并发 DDL + 两个连接池」

function nowISO() { return new Date().toISOString(); }

function getPool() {
  if (!pool) throw new Error('DB pool not initialized. Call init() first.');
  return pool;
}

// 单飞入口（2026-09-16 加固）：并发调用（server.js 的 await D.init() 与模块加载期 ready = init()）
// 返回同一 promise；失败后清空以便调用方重试。旧实现每次调用都新建连接池并重跑 schema + 全部迁移，
// 实测导致同进程两套并发 DDL（面板日志中每个子系统 schema 各打印 2 次），在 ALTER TABLE 上互锁致启动失败。
function init() {
  if (!initPromise) initPromise = _init().catch((e) => { initPromise = null; throw e; });
  return initPromise;
}

async function _init() {
  pool = mysql.createPool(dbConfig);
  // 启动期 DDL（框架表 → 子系统 schema.sql → 增量迁移）统一由 db/migrations 的启动入口执行：
  // 全程持 MySQL 命名锁串行 + 对瞬时锁冲突退避重试（2026-09-16 加固，见 docs/RELEASE-v2.0.9.md）
  await runStartupDdl(pool);
  return true;
}

function toObj(row) {
  if (!row) return undefined;
  if (Array.isArray(row)) return row;
  return Object.assign({}, row);
}

async function q(sql, params) {
  const pool = getPool();
  const res = await pool.execute(sql, params || []);
  const rows = res[0];
  // DML（INSERT/UPDATE/DELETE 等）execute 返回 ResultSetHeader 对象而非行数组，按空结果处理
  if (!Array.isArray(rows)) return [];
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
  },
  // 返回受影响行数（乐观锁 CAS 用，2026-09-02 治具修复）
  runAffected: async function(sql, params) {
    const pool = getPool();
    const [r] = await pool.execute(sql, params || []);
    return r.affectedRows;
  },
  // 事务入口（2026-09-04 提交③多角色：users.updateUser roles 路径需要事务支持）
  tx: function(fn) { return txWithTransaction(getPool(), fn); }
};
const users = require('./db/users')({ q, one, dbRef, tx: function(fn) { return dbRef.tx(fn); } });
const portalPrefs = require('./db/portal-prefs')({ q, one, dbRef });

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
      const deps = { q, one, run: dbRef.run, runAffected: dbRef.runAffected, nowISO };
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
  ...users, ...portalPrefs, ...allDaoExports, ...fixtureFiles
};
