# Phase 1: 数据库迁移 SQLite → MariaDB 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将样品管理系统从 SQLite(sql.js) 迁移到 MariaDB(mysql2)，保持所有 API 与前端不变。

**Architecture:** 用 mysql2 连接池替换 sql.js WASM，`persist()` 变为 no-op。SQL 方言差异仅影响 `datetime()` 函数调用和 DDL 语法。使用 `express-mysql-session` 替换内存 session store，服务重启不丢失登录态。

**Tech Stack:** mysql2, express-mysql-session, bcryptjs(不变)

---

## Phase 1 文件结构总览

```
wwwroot/sample-mgmt/
├── db.js              ★ 重写：连接池 + 工厂模式适配
├── db/
│   ├── samples.js     ★ 改：datetime() → NOW()/DATE_ADD()
│   ├── users.js       轻改：移除 persist() 调用
│   └── logs.js        轻改：移除 persist() 调用，加 target_type
├── server.js          ★ 改：express-mysql-session
├── routes/
│   └── misc.js        轻改：listLogs() 适配 target_type
├── seed.js            轻改：适配 async db
├── seed-rich.js       轻改：适配 async db
├── test_flow.js       轻改：BASE 端口适配
├── .env               改：新增 DB_* 环境变量
├── .env.example       改：新增 DB_* 示例
├── package.json       改：新增依赖
└── data/              不动：SQLite 文件保留为备份
```

---

### Task 0: 宝塔面板创建数据库

**说明:** 在宝塔面板手动操作，创建 MariaDB 数据库和用户。

- [ ] **Step 1: 宝塔面板 → 数据库 → 添加数据库**

```
数据库名: sample_mgmt
用户名:   sample_mgmt
密码:     (生成随机16位密码)
字符集:   utf8mb4
访问权限: 本地服务器
```

- [ ] **Step 2: 记录连接信息，写入 `.env`**

```bash
# .env 新增（实际密码替换为宝塔生成的）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=sample_mgmt
DB_PASSWORD=<宝塔生成的密码>
DB_NAME=sample_mgmt
```

- [ ] **Step 3: 同步更新 `.env.example`**

在 `.env.example` 末尾追加：

```
# MariaDB 数据库连接（必填，迁移 SQLite 后启用）
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=sample_mgmt
DB_PASSWORD=your-db-password-here
DB_NAME=sample_mgmt
```

- [ ] **Step 4: 安装新依赖**

```bash
cd /www/wwwroot/sample-mgmt && npm install mysql2 express-mysql-session
```

验证: `npm ls mysql2 express-mysql-session` 显示已安装。

---

### Task 1: 重写 db.js — 连接池 + 工厂模式

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/db.js` (83行 → 约100行)
- 关联影响：所有 `require('./db')` 的调用方（server.js, seed.js, seed-rich.js, test_flow.js, 所有 routes/*.js）

- [ ] **Step 1: 备份当前 db.js**

```bash
cp /www/wwwroot/sample-mgmt/db.js /www/wwwroot/sample-mgmt/db.js.sqlite.bak
```

- [ ] **Step 2: 重写 db.js**

```js
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 环境变量读取数据库配置
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

function persist() { /* MariaDB 自动持久化，no-op */ }
function nowISO() { return new Date().toISOString(); }

// 同步获取 pool（启动时必须已初始化）
function getPool() {
  if (!pool) throw new Error('DB pool not initialized. Call init() first.');
  return pool;
}

// 异步初始化：创建连接池 + 建表
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
        signed_by_rnd VARCHAR(50),
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
  } finally {
    conn.release();
  }
  return true;
}

// 辅助函数：将 mysql2 RowDataPacket 转为普通对象
function toObj(row) {
  if (!row) return undefined;
  if (Array.isArray(row)) return row;
  return Object.assign({}, row);
}

// SELECT many → array of objects
async function q(sql, params) {
  const [rows] = await pool.execute(sql, params || []);
  return rows.map(toObj);
}

// SELECT one → object or undefined
async function one(sql, params) {
  const [rows] = await pool.execute(sql, params || []);
  return rows.length ? toObj(rows[0]) : undefined;
}

// 工厂组装实体模块
const dbRef = {
  run: async function(sql, params) {
    await pool.execute(sql, params || []);
  }
};
const users = require('./db/users')({ q, one, dbRef, persist });
const samples = require('./db/samples')({ q, one, dbRef, persist, nowISO });
const logs = require('./db/logs')({ q, dbRef, persist });

module.exports = {
  init, pool: getPool, nowISO,
  ...users, ...samples, ...logs
};
```

- [ ] **Step 3: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c db.js && echo "OK"
```

Expected: `OK`

---

### Task 2: 适配 db/samples.js — SQL 方言修复

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/db/samples.js:41-42` (2处 datetime 函数)

- [ ] **Step 1: 修改逾期筛选 SQL（L41）**

```js
// 当前
if (overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now')"); }
// 改为
if (overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
```

- [ ] **Step 2: 修改近7天筛选 SQL（L42）**

```js
// 当前
else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= datetime('now') AND next_inspect_at < datetime('now','+7 days')"); }
// 改为
else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }
```

- [ ] **Step 3: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c db/samples.js && echo "OK"
```

Expected: `OK`

---

### Task 3: 适配 db/users.js + db/logs.js — async 连锁改造

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/db/users.js:3-8` (`createUser` 加 async/await)
- Modify: `/www/wwwroot/sample-mgmt/db/logs.js:3-7` (`addLog` 加 async/await)

**说明:** `db.js` 中 `dbRef.run` 改为 async 后，所有调用它的写函数都必须是 async。

- [ ] **Step 1: 修改 db/users.js — createUser 改为 async**

```js
// 当前
function createUser({ username, password_hash, role, dept, display_name }) {
  dbRef.run('INSERT INTO users ...', [...]);
  persist();
  return getUserByUsername(username);
}

// 改为
async function createUser({ username, password_hash, role, dept, display_name }) {
  await dbRef.run('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
    [username, password_hash, role, dept || null, display_name || null]);
  persist();
  return await getUserByUsername(username);
}
```

- [ ] **Step 2: 修改 db/logs.js — addLog 改为 async**

```js
// 当前
function addLog({ sample_id, action, role, user_id, dept, location, note }) {
  dbRef.run('INSERT INTO scan_logs ...', [...]);
  persist();
}

// 改为
async function addLog({ sample_id, action, role, user_id, dept, location, note }) {
  await dbRef.run('INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note) VALUES (?,?,?,?,?,?,?)',
    [sample_id, action, role || null, user_id || null, dept || null, location || null, note || null]);
  persist();
}
```

- [ ] **Step 3: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c db/users.js && node -c db/logs.js && echo "OK"
```

Expected: `OK`

---

### Task 4: 改造 server.js — session + 启动流程

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/server.js:44-54` (session store), `:55` (static), `:74-91` (启动)

- [ ] **Step 1: 在 server.js 顶部添加依赖**

```js
// server.js 第5行后面追加
const MySQLStoreFactory = require('express-mysql-session');
const session = require('express-session');
```

注意：`express-session` 已在第12行引入，只需新增 `MySQLStoreFactory`。

- [ ] **Step 2: 修改 session 配置（L44-54）**

```js
// 当前
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { ... }
}));

// 改为
const sessionStore = new (MySQLStoreFactory(session))({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'sample_mgmt',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'sample_mgmt',
  createDatabaseTable: true,
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires',
      data: 'data'
    }
  }
});
app.use(session({
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  }
}));
```

- [ ] **Step 3: 修改启动流程（L74-91）**

```js
// 当前
if (!process.env.TEST_MODE) {
  D.ready.then(() => {
    const server = app.listen(PORT, () => { ... });
    ...
  });
}

// 改为（使用 async IIFE）
if (!process.env.TEST_MODE) {
  (async () => {
    await D.init();
    logger.info('数据库已连接: MariaDB @ ' + (process.env.DB_HOST || '127.0.0.1'));
    const server = app.listen(PORT, () => {
      logger.info('制造品质管理系统已启动: http://localhost:' + PORT);
    });
    const shutdown = (signal) => {
      logger.info('收到 ' + signal + '，正在关闭服务...');
      server.close(() => {
        logger.info('服务已关闭');
        process.exit(0);
      });
      setTimeout(() => { logger.error('强制退出超时'); process.exit(1); }, 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  })();
}
```

- [ ] **Step 4: 修改测试模式下的 D 初始化**

在 `module.exports = app;` 之前，确认 TEST_MODE 下仍然导出 app，但需要调用方手动 `D.init()`。test_flow.js 改为：

```js
// test_flow.js 顶部
const D = require('./db');
// 在 self-executing async 函数内第一行：
await D.init();
```

- [ ] **Step 5: 修改服务器启动提示文字**

`server.js:78` 将 `'样品管理系统已启动'` 改为 `'制造品质管理系统已启动'`。

- [ ] **Step 6: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c server.js && echo "OK"
```

Expected: `OK`

---

### Task 5: 适配 db/samples.js — async + 调用方传导

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/db/samples.js:5-7,32-79` (`createSample`/`updateSample`/`deleteSample` 加 async/await)
- Modify: `/www/wwwroot/sample-mgmt/routes/scan.js:86-201` (所有 `D.addLog()` 加 await，handler 加 async)
- Modify: `/www/wwwroot/sample-mgmt/routes/misc.js` (如有调用 write 函数)
- Modify: `/www/wwwroot/sample-mgmt/seed.js` / `seed-rich.js` / `test_flow.js`

**说明:** `dbRef.run` → async 导致 `createSample`/`updateSample`/`addLog` 返回 Promise。所有调用方必须加 await。

- [ ] **Step 1: 修改 db/samples.js — 3 个写函数改为 async**

```js
// nextSampleNo 加 await
async function nextSampleNo() {
  const row = await one('SELECT COALESCE(MAX(id), 0) AS m FROM samples');
  return 'SM-' + String(row.m + 1).padStart(6, '0');
}

// createSample 加 async/await
async function createSample({ name, spec, model, station, image, notes, created_by,
  sample_type, limit_item, source_type, valid_until, card_version,
  test_standard, test_data, signed_by_rd, signed_by_rnd, signed_by_qa,
  replaces }) {
  const ts = nowISO();
  const ns = await nextSampleNo();
  const token = crypto.randomBytes(8).toString('hex');
  const sbRd = signed_by_rd || signed_by_rnd || '';
  await dbRef.run('INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rd,signed_by_qa,replaces,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [ns, name || null, spec || null, model || null, station || null, image || null,
     token, created_by || null, notes || null,
     sample_type || '', limit_item || '', source_type || '', valid_until || '',
     card_version || '', test_standard || '', test_data || '',
     sbRd, signed_by_qa || '',
     replaces || null, ts, ts]);
  persist();
  return await getSampleByNo(ns);
}

// updateSample 加 async/await
async function updateSample(s) {
  await dbRef.run('UPDATE samples SET status=?,produced_at=?,released_at=?,... WHERE id=?', [...]);
  persist();
  return await getSampleById(s.id);
}
```

- [ ] **Step 2: 修改 routes/scan.js — handler 改为 async + 所有 addLog 加 await**

```js
// 原: app.post('/api/scan', requireAuth, (req, res) => {
// 改: 
app.post('/api/scan', requireAuth, async (req, res) => {
  // ... 所有 D.addLog(...) → await D.addLog(...)
  // ... D.updateSample(...) → await D.updateSample(...)
});
```

约15处 `D.addLog`、2处 `D.updateSample`、1处 `D.createSample` 加 await。

- [ ] **Step 3: 修改 seed.js / seed-rich.js — 所有写调用加 await**

```js
// seed.js
async function seed() {
  await D.init();
  for (const u of users) {
    if (!D.getUserByUsername(u.username)) {  // 读函数不变
      await D.createUser({ ... });  // 加 await
    }
  }
  const s = await D.createSample({ ... });  // 加 await
  await D.addLog({ ... });  // 加 await
}
```

同样修改 `seed-rich.js`。

- [ ] **Step 4: 修改 test_flow.js**

```js
// 顶部加
require('dotenv').config();
const D = require('./db');
// async IIFE 内第一行：
await D.init();
// BASE 改为:
const BASE = 'http://localhost:' + (process.env.PORT || '3000');
```

- [ ] **Step 5: 验证所有文件语法**

```bash
cd /www/wwwroot/sample-mgmt
for f in db.js db/users.js db/samples.js db/logs.js server.js seed.js test_flow.js routes/scan.js routes/misc.js; do
  node -c "$f" && echo "$f OK" || echo "$f FAIL"
done
```

Expected: All OK

---

### Task 6: 数据迁移 + 端到端验证

**Files:**
- Create: `/www/wwwroot/sample-mgmt/scripts/migrate-to-mariadb.js` (迁移脚本)
- Test: 运行 `test_flow.js` 验证全流程

- [ ] **Step 1: 编写数据迁移脚本**

```bash
# 如果 SQLite 有数据，从 SQLite 导出 JSON，再导入 MariaDB
# 由于 sql.js + mysql2 不能在同一进程共存，分两步走：
```

```js
// scripts/export-sqlite-to-json.js — 第一步：从 SQLite 导出 JSON
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

(async () => {
  const SQL = await initSqlJs();
  const dbFile = path.join(__dirname, '..', 'data', 'sample.db.sqlite');
  if (!fs.existsSync(dbFile)) { console.log('无 SQLite 数据文件，跳过'); process.exit(0); }
  
  const db = new SQL.Database(fs.readFileSync(dbFile));
  
  const users = []; db.exec('SELECT * FROM users')[0]?.values.forEach(r => {
    users.push({ id: r[0], username: r[1], password_hash: r[2], role: r[3], dept: r[4], display_name: r[5], created_at: r[6] });
  });
  
  const samples = []; const cols = db.exec('PRAGMA table_info(samples)')[0].values.map(r => r[1]);
  db.exec('SELECT * FROM samples')[0]?.values.forEach(r => {
    const o = {}; cols.forEach((c, i) => { o[c] = r[i]; });
    samples.push(o);
  });
  
  const logs = []; const logCols = db.exec('PRAGMA table_info(scan_logs)')[0].values.map(r => r[1]);
  db.exec('SELECT * FROM scan_logs')[0]?.values.forEach(r => {
    const o = {}; logCols.forEach((c, i) => { o[c] = r[i]; });
    logs.push(o);
  });
  
  const data = { users, samples, logs };
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'sqlite-export.json'), JSON.stringify(data, null, 2));
  console.log('导出完成: users=' + users.length + ' samples=' + samples.length + ' logs=' + logs.length);
})();
```

- [ ] **Step 2: 导入 MariaDB**

```js
// scripts/import-to-mariadb.js — 第二步：导入 JSON 到 MariaDB
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'sample_mgmt',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sample_mgmt'
  });
  
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sqlite-export.json'), 'utf-8'));
  
  // 清空现有数据
  await pool.execute('SET FOREIGN_KEY_CHECKS=0');
  await pool.execute('TRUNCATE TABLE scan_logs');
  await pool.execute('TRUNCATE TABLE samples');
  await pool.execute('TRUNCATE TABLE users');
  
  // 导入 users
  for (const u of data.users) {
    await pool.execute(
      'INSERT INTO users (id, username, password_hash, role, dept, display_name, created_at) VALUES (?,?,?,?,?,?,?)',
      [u.id, u.username, u.password_hash, u.role, u.dept, u.display_name, u.created_at]
    );
  }
  
  // 导入 samples
  const sampleCols = ['id','sample_no','name','spec','model','station','image','produced_image','inspect_image',
    'qr_token','status','created_by','produced_at','released_at','release_cycle_days','next_inspect_at',
    'custody_dept','storage_location','notes','sample_type','limit_item','source_type','valid_until',
    'card_version','test_standard','test_data','signed_by_rnd','signed_by_rd','signed_by_qa',
    'retired_reason','replaced_by','replaces','retire_assigned_rd','created_at','updated_at'];
  for (const s of data.samples) {
    const vals = sampleCols.map(c => s[c] ?? null);
    const placeholders = sampleCols.map(() => '?').join(',');
    await pool.execute('INSERT INTO samples (' + sampleCols.join(',') + ') VALUES (' + placeholders + ')', vals);
  }
  
  // 导入 scan_logs
  for (const l of data.logs) {
    await pool.execute(
      'INSERT INTO scan_logs (id, sample_id, action, role, user_id, dept, location, note, created_at) VALUES (?,?,?,?,?,?,?,?,?)',
      [l.id, l.sample_id, l.action, l.role, l.user_id, l.dept, l.location, l.note, l.created_at]
    );
    // 设置 target_type='sample', target_id=sample_id
    await pool.execute('UPDATE scan_logs SET target_type=?, target_id=? WHERE id=?', ['sample', l.sample_id, l.id]);
  }
  
  await pool.execute('SET FOREIGN_KEY_CHECKS=1');
  console.log('导入完成');
  await pool.end();
})();
```

- [ ] **Step 3: 运行迁移**

```bash
cd /www/wwwroot/sample-mgmt
node scripts/export-sqlite-to-json.js
node scripts/import-to-mariadb.js
node seed.js  # 确保 6 个账号存在
```

- [ ] **Step 4: 启动服务并运行端到端测试**

```bash
# 终端1：启动服务
PORT=3000 node server.js

# 终端2：运行测试
PORT=3000 node test_flow.js
```

Expected: 所有 assert 通过（✓），无 FAIL。

- [ ] **Step 5: 浏览器验证**

1. 登录 http://192.168.90.163:4000/
2. 验证：样品列表、扫码台、看板、日志、标示卡均正常
3. 验证：登录后刷新页面不会 401（session 存在 MariaDB）

---

### Task 7: 文档同步

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/README.md`
- Modify: `/www/wwwroot/sample-mgmt/AGENTS.md`
- Modify: `/www/wwwroot/sample-mgmt/CLAUDE.md`

- [ ] **Step 1: 更新 README.md 技术栈**

```markdown
| 后端 | Node.js + Express 4.x(CommonJS) |
| 数据库 | MariaDB via mysql2（原 SQLite/sql.js 架构已迁移） |
```

- [ ] **Step 2: 移除 sql.js 安装注意事项**

删除 README.md 中关于 sql.js 编译问题的备注（如有）。

- [ ] **Step 3: 更新 AGENTS.md 第2节技术栈**

```markdown
| 数据库 | MariaDB via mysql2（宝塔面板管理） |
```

- [ ] **Step 4: 更新 CLAUDE.md 第1节**

```markdown
样品管理系统: Node.js + Express + MariaDB + 原生 HTML 单页
```

- [ ] **Step 5: 更新 .env.example 完整内容**

追加数据库配置项到 `.env.example`（同 Task 0 Step 3）。

---

### 臃肿检测报告（迁移后）

| 文件 | 类型 | 预计行数 | 上限 | 状态 |
|---|---|---|---|---|
| `db.js` | 工具入口 | ~100 | 200行 | 安全 |
| `db/samples.js` | DAO | ~83(+async) | 300行 | 安全 |
| `db/users.js` | DAO | ~14(+async) | 300行 | 安全 |
| `db/logs.js` | DAO | ~15(+async) | 300行 | 安全 |
| `server.js` | 入口 | ~105(+session store) | 600行 | 安全 |
| `routes/scan.js` | API | ~211(+await) | 400行 | 安全 |
| `seed.js` | 脚本 | ~48 | 300行 | 安全 |

**影响范围**: 6个文件必需修改 + 3个文档文件 + 2个迁移脚本（新建）
