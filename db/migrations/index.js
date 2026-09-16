// db/migrations/index.js — 启动期 DDL 聚合入口（B3-T2 拆分；2026-09-16 增串行锁与退避重试）
// 各子系统迁移按原顺序执行；db/migrations.js 为薄转发，db.js 的 require 接口不变
// 2026-09-16：框架表建表、子系统 schema.sql 加载、DDL 串行锁与退避重试一并收归本模块（自 db.js 迁入）
const fs = require('fs');
const path = require('path');
const { migrateFixtureLifecycle, migrateFixtureFiles, migrateFixtureMaintenance, migratePerfIndexes, migrateFixtureSchemaAlign } = require('./fixtures');
const { migrateControlNcrDetail, migrateControlNcrForm, migrateControlOptimisticLock, migrateControlSignsCreatedAt } = require('./control');
const { migrateProjectTaskIndexes } = require('./projects');
const { migrateProjectOaExtras } = require('./projects-oa');
const { migrateProjectOaP2 } = require('./projects-oa-p2');
const { migrateProjectOaP2b } = require('./projects-oa-p2b');
const { migrateProjectNotifications } = require('./projects-notif');
const { migrateProjectTdUx } = require('./projects-td-ux');
const { migrateProjectPlm } = require('./projects-plm');
const { migrateSamplesOptimisticLock, migrateSamplesSoftDelete, migrateSamplesCheckout, migrateSamplesDeletedAtTz, migrateSamplesSampleNoRelease } = require('./samples');
const { migrateUserEnabled, migrateUsersSessionVersion } = require('./users');

async function runMigrations(pool) {
  await migrateFixtureLifecycle(pool);
  await migrateFixtureFiles(pool);
  await migrateFixtureMaintenance(pool);
  await migratePerfIndexes(pool);
  await migrateFixtureSchemaAlign(pool);
  await migrateUserEnabled(pool);
  await migrateControlNcrDetail(pool);
  await migrateControlNcrForm(pool);
  await migrateControlOptimisticLock(pool);
  await migrateControlSignsCreatedAt(pool);
  await migrateProjectTaskIndexes(pool);
  await migrateProjectOaExtras(pool);
  await migrateProjectOaP2(pool);
  await migrateProjectOaP2b(pool);
  await migrateProjectNotifications(pool);
  await migrateProjectTdUx(pool);
  await migrateProjectPlm(pool);
  await migrateSamplesOptimisticLock(pool);
  await migrateSamplesSoftDelete(pool);
  await migrateSamplesCheckout(pool);
  await migrateSamplesDeletedAtTz(pool); // deleted_at 时区口径统一（2026-09-09，存量 -8h 校正，防重入）
  await migrateUsersSessionVersion(pool);
  await migrateSamplesSampleNoRelease(pool); // 编号占用口径（2026-09-11）：唯一索引改「仅存活行唯一」，使已取消的 NEW 号可复用
}

// ---------------- 启动期 DDL 加固（2026-09-16，见 docs/RELEASE-v2.0.9.md） ----------------
// 历史故障：启动时两套 init() 并发（或停/启重叠的两进程）对同一批表并发 DDL，InnoDB 抛
// ER_LOCK_DEADLOCK（errno 1213）使进程未 listen 即退出。措施：① MySQL 命名锁把 DDL 阶段
// 串行化（锁由独立连接持有，GET_LOCK 为连接级）；② 对瞬时锁冲突做有界退避重试（官方建议即重试）。
const DDL_LOCK_NAME = 'sample_mgmt_ddl';
const DDL_LOCK_WAIT_SEC = 30;
const DDL_MAX_ATTEMPTS = 3;
const RETRYABLE_DDL_CODES = ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT', 'ER_TOO_MANY_USER_CONNECTIONS'];

// 仅「瞬时」错误可重试；DDL 语法/重复列等确定性错误必须立即抛出（由调用方决定是否中止启动）
function isRetryableDdlError(e) {
  return !!(e && RETRYABLE_DDL_CODES.indexOf(e.code) >= 0);
}

// 在命名锁内执行 fn；取锁失败/超时一律 fail-open（继续执行，仅记录），避免加固措施本身阻断启动
async function withDdlLock(pool, fn) {
  let conn = null;
  let held = false;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT GET_LOCK(?, ?) AS got', [DDL_LOCK_NAME, DDL_LOCK_WAIT_SEC]);
    held = !!(rows && rows[0] && Number(rows[0].got) === 1);
    if (!held) console.error('[db] DDL 锁等待 ' + DDL_LOCK_WAIT_SEC + 's 超时，继续执行（由重试兜底）');
  } catch (e) {
    console.error('[db] 获取 DDL 锁失败，退化为无锁执行: ' + (e && e.message ? e.message : e));
  }
  try {
    return await fn();
  } finally {
    if (conn) {
      if (held) { try { await conn.query('SELECT RELEASE_LOCK(?)', [DDL_LOCK_NAME]); } catch (e) { /* 连接归还时自动释放 */ } }
      conn.release();
    }
  }
}

// 有界退避重试：第 1 次失败后等 1s、第 2 次后等 2s，最多 DDL_MAX_ATTEMPTS 次
async function runDdlWithRetry(fn, maxAttempts) {
  const attempts = maxAttempts || DDL_MAX_ATTEMPTS;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = e && e.code ? e.code + ' — ' : '';
      console.error('[db] DDL 阶段失败（第 ' + i + '/' + attempts + ' 次）: ' + code + (e && e.message ? e.message : e));
      if (!isRetryableDdlError(e) || i === attempts) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1000 * i));
    }
  }
}

// 框架级表建表（不属于任何子系统，故不进 subsystems/*/db/schema.sql）
async function createFrameworkTables(pool) {
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
    // ★ 门户卡片排序偏好表（框架级，AGENTS.md §22 门户个性化）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_portal_prefs (
        user_id INT PRIMARY KEY,
        portal_order JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_portal_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } finally {
    conn.release();
  }
}

// 自动扫描 subsystems/*/db/schema.sql 并执行建表（幂等；单个子系统失败不阻断其余）
async function loadSubsystemSchemas(pool) {
  const subsystemsDir = path.join(__dirname, '..', '..', 'subsystems');
  if (!fs.existsSync(subsystemsDir)) return;
  for (const subEntry of fs.readdirSync(subsystemsDir, { withFileTypes: true })) {
    if (!subEntry.isDirectory()) continue;
    const schemaPath = path.join(subsystemsDir, subEntry.name, 'db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) continue;
    try {
      const statements = fs.readFileSync(schemaPath, 'utf8').split(';').filter((s) => s.trim());
      for (const stmt of statements) await pool.execute(stmt);
      console.log('[db] 子系统 schema 已加载: ' + subEntry.name);
    } catch (e) {
      console.error('[db] 加载子系统 schema 失败: ' + subEntry.name, e.message);
    }
  }
}

// 启动期 DDL 唯一入口：框架表 → 子系统 schema → 增量迁移
// 全程在 MySQL 命名锁内串行执行 + 瞬时锁冲突退避重试（唯一并发源已由 db.js 的初始化单飞消除）
async function runStartupDdl(pool) {
  return withDdlLock(pool, () => runDdlWithRetry(async () => {
    await createFrameworkTables(pool);
    await loadSubsystemSchemas(pool);
    await runMigrations(pool);
  }));
}

module.exports = { runMigrations, runStartupDdl, withDdlLock, runDdlWithRetry, isRetryableDdlError };
