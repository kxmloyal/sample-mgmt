# P1 安全加固 + 工程化基础 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不动现有业务逻辑的前提下,为样品管理系统增加安全防护(Helmet/速率限制/SameSite/文件校验/错误处理)和工程化基础(测试/Jest+supertest/日志/ESLint/Prettier/健康检查)。

**Architecture:** 修改 `server.js`(增量 +40 行)和 `db.js`(+1 行),新建 `logger.js`、`tests/` 目录(3 文件)、`jest.config.js`、`.eslintrc.json`、`.prettierrc`。不修改 `public/index.html`(已 89.5% 红线),不拆分文件。

**Tech Stack:** Node.js + Express 4.x, Jest 29.7, supertest 7.0, helmet 7.1, express-rate-limit 7.4, morgan 1.10, winston 3.14, winston-daily-rotate-file 5.0, ESLint 8.57, Prettier 3.3

**Spec:** [docs/superpowers/specs/2026-07-23-p1-security-engineering-design.md](file:///www/wwwroot/sample-mgmt/docs/superpowers/specs/2026-07-23-p1-security-engineering-design.md)

---

## 文件结构

| 文件 | 路径 | 操作 | 职责 |
|---|---|---|---|
| server.js | `server.js` | 修改 | +helmet/+rateLimit/+sameSite/+morgan/+logger/+health/+errorHandler |
| db.js | `db.js` | 修改 | +1 行 TEST_MODE 三元 |
| package.json | `package.json` | 修改 | 版本去 ^ +6 scripts +8 deps |
| .env.example | `.env.example` | 修改 | +5 配置项 |
| logger.js | `logger.js` | 新建 | Winston 业务日志 + Morgan 流 |
| setup.js | `tests/helpers/setup.js` | 新建 | 测试辅助:启动/登录/重置 DB |
| auth.test.js | `tests/auth.test.js` | 新建 | 6 条鉴权用例 |
| samples.test.js | `tests/samples.test.js` | 新建 | 6 条 API 用例 |
| jest.config.js | `jest.config.js` | 新建 | Jest 配置 |
| .eslintrc.json | `.eslintrc.json` | 新建 | ESLint 配置 |
| .prettierrc | `.prettierrc` | 新建 | Prettier 配置 |
| .gitignore | `.gitignore` | 修改 | +logs/ 忽略(确保已存在则追加) |

**无文件删除.**

---

## 前置准备

- [ ] **Step 0.1: 备份关键文件**

```bash
cd /www/wwwroot/sample-mgmt
cp server.js server.js.bak.p1
cp db.js db.js.bak.p1
cp package.json package.json.bak.p1
cp .env.example .env.example.bak.p1
```

- [ ] **Step 0.2: 记录基线**

```bash
echo "server.js: $(wc -l < server.js) 行, $(wc -c < server.js) 字符"
echo "db.js: $(wc -l < db.js) 行, $(wc -c < db.js) 字符"
```

预期:server.js 224 行,db.js 168 行

- [ ] **Step 0.3: 确保服务运行 + 权限**

```bash
sudo chmod 666 server.js db.js package.json .env.example
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/
```

预期:200

---

### Task N: 依赖安装与版本锁定

**Files:**
- Modify: `package.json:1-19`

- [ ] **Step 1.1: 修改 package.json — 锁定现有依赖版本 + 新增 scripts + 新增 deps**

读取 `package.json`,将整个文件内容替换为:

```json
{
  "name": "sample-management",
  "version": "0.1.0",
  "description": "样品发行/确认/生命周期管理/分发 系统",
  "type": "commonjs",
  "main": "server.js",
  "scripts": {
    "start": "node server.js",
    "seed": "node seed.js",
    "test": "jest --forceExit --detectOpenHandles",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint . --ext .js",
    "lint:fix": "eslint . --ext .js --fix",
    "format": "prettier --write \"**/*.js\""
  },
  "dependencies": {
    "bcryptjs": "2.4.3",
    "dotenv": "16.4.5",
    "express": "4.21.0",
    "sql.js": "1.10.3",
    "express-session": "1.18.0",
    "qrcode": "1.5.4",
    "helmet": "7.1.0",
    "express-rate-limit": "7.4.0",
    "morgan": "1.10.0",
    "winston": "3.14.0",
    "winston-daily-rotate-file": "5.0.0"
  },
  "devDependencies": {
    "jest": "29.7.0",
    "supertest": "7.0.0",
    "eslint": "8.57.0",
    "prettier": "3.3.0"
  }
}
```

**关键变化:**
- 去 `^`/`~`,锁定精确版本
- 新增 `scripts`:test/test:watch/test:coverage/lint/lint:fix/format
- 新增 `dependencies`:helmet/rate-limit/morgan/winston/winston-daily
- 新增 `devDependencies`:jest/supertest/eslint/prettier

- [ ] **Step 1.2: 安装依赖**

```bash
cd /www/wwwroot/sample-mgmt
npm install
```

预期:无报错,安装完成。

- [ ] **Step 1.3: 验证依赖安装**

```bash
cd /www/wwwroot/sample-mgmt
node -e "require('helmet');require('express-rate-limit');require('morgan');require('winston');require('jest');require('supertest');console.log('OK')"
```

预期:`OK`

- [ ] **Step 1.4: 验证服务仍可启动**

```bash
cd /www/wwwroot/sample-mgmt && timeout 3 node server.js 2>&1 || true
```

预期:输出 `样品管理系统已启动: http://localhost:4000`(或 PORT 配置的端口)

- [ ] **Step 1.5: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add package.json
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "chore(deps): lock versions, add test/lint/security deps

- remove ^/~ from all dependency versions
- add scripts: test, test:watch, test:coverage, lint, lint:fix, format
- add deps: helmet 7.1, rate-limit 7.4, morgan 1.10, winston 3.14, winston-daily 5.0
- add devDeps: jest 29.7, supertest 7.0, eslint 8.57, prettier 3.3"
```

---

### Task 2: 更新 .env.example

**Files:**
- Modify: `.env.example:1-11`

- [ ] **Step 2.1: 追加新配置项**

读取 `.env.example`,在 `SESSION_SECRET=sample-mgmt-dev-secret-change-me` 行之后追加:

```env
# 环境标识:development / production
NODE_ENV=development

# 速率限制(生产可调)
LOGIN_RATE_LIMIT_MAX=10
API_RATE_LIMIT_MAX=200

# 日志目录
LOG_DIR=logs

# 上传文件大小限制(字节,默认 5MB)
UPLOAD_MAX_SIZE=5242880
```

使用 `Read` 读取文件,`Edit` 在 SESSION_SECRET 行后追加。

- [ ] **Step 2.2: 验证**

```bash
cd /www/wwwroot/sample-mgmt
grep "NODE_ENV\|LOGIN_RATE\|LOG_DIR\|UPLOAD_MAX" .env.example
```

预期:5 行匹配

- [ ] **Step 2.3: 提交**

```bash
git add .env.example
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "chore(config): add NODE_ENV/RATE_LIMIT/LOG_DIR/UPLOAD_MAX env vars"
```

---

### Task 3: db.js TEST_MODE 适配

**Files:**
- Modify: `db.js:8`

- [ ] **Step 3.1: 修改 DB_FILE 路径(1 行三元)**

读取 `db.js` 第 7-8 行:

```js
const DB_FILE = path.join(DATA_DIR, 'sample.db.sqlite');
```

改为:

```js
const DB_FILE = path.join(DATA_DIR, process.env.TEST_MODE ? 'test.db.sqlite' : 'sample.db.sqlite');
```

- [ ] **Step 3.2: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt
node -e "require('./db.js').ready.then(() => { console.log('OK'); process.exit(0); })"
```

预期:`OK`

- [ ] **Step 3.3: 验证服务仍可用**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/
```

预期:200

- [ ] **Step 3.4: 提交**

```bash
git add db.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(db): add TEST_MODE for isolated test database

- when TEST_MODE env is set, use data/test.db.sqlite instead of sample.db.sqlite
- zero impact on production (1 line change, ternary expression)"
```

---

### Task 4: 新建 logger.js

**Files:**
- Create: `logger.js`

- [ ] **Step 4.1: 创建 logger.js**

```js
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, process.env.LOG_DIR || 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.DailyRotateFile({
      dirname: LOG_DIR,
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '30d',
      maxSize: '20m'
    }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ timestamp, level, message, stack }) => {
          const base = `${timestamp} [${level}] ${message}`;
          return stack ? base + '\n' + stack : base;
        })
      )
    })
  ]
});

const morganStream = {
  write: (msg) => logger.info(msg.trim())
};

module.exports = { logger, morganStream };
```

- [ ] **Step 4.2: 验证**

```bash
cd /www/wwwroot/sample-mgmt
node -e "const { logger } = require('./logger'); logger.info('test'); console.log('OK')"
```

预期:`OK`(同时输出带时间戳的日志行)

- [ ] **Step 4.3: 提交**

```bash
git add logger.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(logger): add winston+morgan logging with daily rotation

- winston: JSON structured logs, daily rotate (30d retention, 20MB max)
- morganStream: HTTP request logging via morgan
- console transport with colorize for development
- LOG_DIR env var (default: logs/)"
```

---

### Task 5: 新建 jest/.eslint/.prettier 配置文件

**Files:**
- Create: `jest.config.js`
- Create: `.eslintrc.json`
- Create: `.prettierrc`
- Modify: `.gitignore`(追加 logs/)

- [ ] **Step 5.1: 创建 jest.config.js**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  forceExit: true,
  detectOpenHandles: true,
  collectCoverageFrom: ['db.js', 'server.js'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  }
};
```

- [ ] **Step 5.2: 创建 .eslintrc.json**

```json
{
  "env": { "node": true, "es2021": true, "jest": true },
  "extends": "eslint:recommended",
  "parserOptions": { "ecmaVersion": 2021 },
  "rules": {
    "no-unused-vars": "warn",
    "no-undef": "error",
    "no-console": "warn",
    "no-var": "warn",
    "prefer-const": "warn",
    "eqeqeq": "warn"
  }
}
```

- [ ] **Step 5.3: 创建 .prettierrc**

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "printWidth": 120,
  "trailingComma": "none"
}
```

- [ ] **Step 5.4: .gitignore 追加 logs/**

读取 `.gitignore`,在末尾追加一行 `logs/`。确认已存在则跳过。

- [ ] **Step 5.5: 验证 Jest 配置**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --showConfig 2>&1 | head -5
```

预期:显示 Jest 配置摘要,无报错

- [ ] **Step 5.6: 提交**

```bash
git add jest.config.js .eslintrc.json .prettierrc .gitignore
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(engineering): add jest/eslint/prettier configs

- jest: node env, tests/*.test.js pattern, 50% coverage threshold
- eslint: node/es2021/jest, recommended base, warn-level rules
- prettier: semicolons, single quotes, 120 print width
- gitignore: add logs/ directory"
```

---

### Task 6: 安全加固 server.js(helmet + rate-limit + sameSite + errorHandler)

**Files:**
- Modify: `server.js:1-224`

- [ ] **Step 6.1: 读取 server.js 当前状态**

读取 `server.js` 全部内容(224 行),确保了解当前结构后再做修改。

- [ ] **Step 6.2: 修改 require 区(第 4 行后插入)**

在第 4 行 `require('dotenv').config();` 与第 5 行 `const path` 之间插入:

```js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { logger, morganStream } = require('./logger');
```

- [ ] **Step 6.3: 修改配置区(第 15 行附近,新增 UPLOAD_MAX_SIZE)**

找到 `const PORT = process.env.PORT || 3000;` 行后,追加:

```js
const UPLOAD_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10);
```

- [ ] **Step 6.4: 修改中间件区 — 在 express.json 之后插入 helmet**

找到 `app.use(express.json({ limit: '15mb' }));` 行后,追加:

```js
app.use(helmet());
```

- [ ] **Step 6.5: 插入速率限制 — 在 session 配置之前**

找到 `app.use(session({` 行之前,插入 loginLimiter + apiLimiter:

```js
// 登录限流:10次/分钟/IP
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: '请求过于频繁,请1分钟后重试' })
});
// API 限流:200次/分钟/IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: '请求过于频繁,请稍后重试' })
});
app.use('/api/login', loginLimiter);
app.use('/api', apiLimiter);
```

**注意**:`/api/login` 的 loginLimiter 必须在 `/api` 的 apiLimiter **之前**。

- [ ] **Step 6.6: 修改 session 配置 — 加固 cookie**

找到 `app.use(session({` 开始的 session 配置块,将 `cookie: { maxAge: 1000 * 60 * 60 * 8 }` 改为:

```js
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production'
  }
```

- [ ] **Step 6.7: 在 express.static 之后插入 morgan**

找到 `app.use(express.static(path.join(__dirname, 'public')));` 行后,追加:

```js
app.use(morgan('short', { stream: morganStream }));
```

- [ ] **Step 6.8: 修改文件上传校验 — 增加大小检查**

找到 `saveSampleImage` 函数中 `let ext = m[1] === 'jpeg' ? 'jpg' : m[1];` 行之后的 `if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) ext = 'jpg';`,

将其改为:

```js
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return null;
  const size = Buffer.byteLength(m[2], 'base64');
  if (size > UPLOAD_MAX_SIZE) { logger.warn('图片过大:' + size); return null; }
```

同时将函数内 `console.error` 改为 `logger.error`:

```js
  } catch (e) { logger.error('保存图片失败: ' + e.message); return null; }
```

- [ ] **Step 6.9: 在所有路由之后追加 /health + 全局错误处理**

找到 `D.ready.then(() => {` 行之前(第 220 行附近),追加:

```js
// ---------------- 健康检查 ----------------
app.get('/health', (req, res) => {
  const dbReady = D.db();
  res.json({
    status: dbReady ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage().rss,
    db: dbReady ? 'connected' : 'disconnected'
  });
});

// ---------------- 全局错误处理 ----------------
app.use((err, req, res, next) => {
  logger.error('未捕获错误', { message: err.message, stack: err.stack, url: req.url });
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});
```

- [ ] **Step 6.10: 修改 server.js 最后的 console.log 为 logger.info**

找到 `console.log('样品管理系统已启动:...')`,改为:

```js
logger.info('样品管理系统已启动: http://localhost:' + PORT);
```

- [ ] **Step 6.11: 验证服务可启动**

```bash
cd /www/wwwroot/sample-mgmt && timeout 3 node server.js 2>&1 || true
```

预期:输出含时间戳的日志行,服务正常启动

- [ ] **Step 6.12: 验证 /health 端点**

```bash
curl -s http://localhost:4000/health | head -c 200
```

预期:JSON 含 status/uptime/timestamp/memory/db

- [ ] **Step 6.13: 提交**

```bash
git add server.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(security): add helmet/rate-limit/sameSite/morgan/health/errorHandler

- helmet: XSS/MIME/clickjack/HSTS headers
- rate-limit: login 10/min, API 200/min
- session: httpOnly + sameSite=strict + secure(production)
- morgan: HTTP request logging via winston
- file upload: 5MB size check + whitelist MIME
- /health: uptime/memory/db status
- global error handler: log stack, hide from prod
- console.log -> logger.info"
```

---

### Task 7: 新建测试辅助文件

**Files:**
- Create: `tests/helpers/setup.js`

- [ ] **Step 7.1: 创建目录 + setup.js**

```bash
mkdir -p /www/wwwroot/sample-mgmt/tests/helpers
```

创建 `tests/helpers/setup.js`:

```js
const request = require('supertest');
const path = require('path');
const fs = require('fs');
let app;

async function getApp() {
  if (!app) {
    const dbPath = path.join(__dirname, '../../data', 'test.db.sqlite');
    try { fs.unlinkSync(dbPath); } catch (_) {}
    if (!process.env.TEST_MODE) process.env.TEST_MODE = '1';
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') process.env.NODE_ENV = 'test';
    app = require('../../server');
    await require('../../db').ready;
  }
  return app;
}

async function login(username, password) {
  const res = await request(await getApp())
    .post('/api/login')
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error('登录失败: ' + (res.body && res.body.error));
  }
  const cookie = res.headers['set-cookie'];
  const sessionCookie = Array.isArray(cookie)
    ? cookie.find(c => c.includes('connect.sid'))
    : cookie;
  return { agent: request.agent(await getApp()), cookie: sessionCookie };
}

module.exports = { getApp, login };
```

- [ ] **Step 7.2: 验证 setup.js 无语法错误**

```bash
node -e "require('./tests/helpers/setup'); console.log('OK')"
```

预期:`OK`

- [ ] **Step 7.3: 提交**

```bash
git add tests/
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "test(setup): add test helper with isolated DB and login

- getApp(): start app with test.db.sqlite (auto-clean before each run)
- login(): authenticate and return agent+cookie
- TEST_MODE=1 ensures test DB isolation from production data"
```

---

### Task 8: 编写鉴权测试(tests/auth.test.js)

**Files:**
- Create: `tests/auth.test.js`

- [ ] **Step 8.1: 创建 tests/auth.test.js**

```js
const { getApp, login } = require('./helpers/setup');
const request = require('supertest');

beforeAll(async () => { await getApp(); });

describe('POST /api/login', () => {
  it('should login with correct credentials', async () => {
    const res = await request(await getApp())
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should reject wrong password', async () => {
    const res = await request(await getApp())
      .post('/api/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('should reject empty credentials', async () => {
    const res = await request(await getApp())
      .post('/api/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/me', () => {
  it('should reject unauthenticated request', async () => {
    const res = await request(await getApp()).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('should return user info when authenticated', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('ADMIN');
  });
});

describe('POST /api/logout', () => {
  it('should invalidate session after logout', async () => {
    const { agent } = await login('admin', 'admin123');
    await agent.post('/api/logout');
    const res = await agent.get('/api/me');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 8.2: 运行测试**

```bash
cd /www/wwwroot/sample-mgmt
npx jest tests/auth.test.js --forceExit
```

预期:6 条 PASS

- [ ] **Step 8.3: 验证覆盖率**

```bash
npx jest tests/auth.test.js --coverage --collectCoverageFrom='server.js' --forceExit 2>&1 | tail -10
```

预期:server.js 覆盖率 >0%

- [ ] **Step 8.4: 提交**

```bash
git add tests/auth.test.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "test(auth): add 6 auth test cases (login/me/logout)

- correct login returns 200 + user info + session cookie
- wrong password returns 401
- empty credentials returns 400
- unauthenticated /api/me returns 401
- authenticated /api/me returns user info
- logout invalidates session"
```

---

### Task 9: 编写样品 API 测试(tests/samples.test.js)

**Files:**
- Create: `tests/samples.test.js`

- [ ] **Step 9.1: 创建 tests/samples.test.js**

```js
const { getApp, login } = require('./helpers/setup');
const request = require('supertest');

beforeAll(async () => { await getApp(); });

async function seedSample() {
  const { agent } = await login('admin', 'admin123');
  const res = await agent
    .post('/api/samples')
    .send({ name: '测试样品', spec: '规格A', model: 'M1', station: '站1', notes: 'test' });
  expect(res.status).toBe(200);
  return { agent, sample: res.body };
}

describe('GET /api/samples', () => {
  it('should list samples', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/samples');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/samples', () => {
  it('should create sample as ADMIN', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '新建样品1', spec: '规格X', model: 'MX', station: 'SX', notes: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.sample_no).toBeDefined();
    expect(res.body.qr_token).toBeDefined();
    expect(res.body.status).toBe('NEW');
  });

  it('should create sample as RND', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '新建样品2', spec: '规格Y', model: 'MY', station: 'SY', notes: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NEW');
  });

  it('should reject creation by non-RND role', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '新建样品3', spec: '规格Z', note: 'test' });
    expect(res.status).toBe(403);
  });

  it('should reject empty name', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.post('/api/samples').send({ name: '', spec: 'X' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/scan', () => {
  it('should advance NEW to PRODUCED (RND scan)', async () => {
    const { agent, sample } = await seedSample();
    const res = await agent
      .post('/api/scan')
      .send({ code: sample.sample_no, note: '制作完成' });
    expect(res.status).toBe(200);
    expect(res.body.sample.status).toBe('PRODUCED');
    expect(res.body.action).toBe('PRODUCE');
  });

  it('should require cycleDays for RELEASE action', async () => {
    const { agent, sample } = await seedSample();
    // 第一步:研发确认制作完成
    await agent.post('/api/scan').send({ code: sample.sample_no, note: 'done' });
    // 第二步:品保登录,扫描时缺 cycleDays
    const { agent: qaAgent } = await login('qa01', 'qa123');
    const res = await qaAgent.post('/api/scan').send({ code: sample.sample_no });
    expect(res.status).toBe(400);
  });

  it('should reject scan with wrong role/status', async () => {
    const { agent, sample } = await seedSample();
    const { agent: qaAgent } = await login('qa01', 'qa123');
    const res = await qaAgent
      .post('/api/scan')
      .send({ code: sample.sample_no, note: 'test' });
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 9.2: 运行全部测试**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit
```

预期:所有测试 PASS(auth 6 条 + samples 6 条 = 12 条)

- [ ] **Step 9.3: 运行覆盖率检查**

```bash
npx jest --coverage --forceExit
```

预期:覆盖率 >50%(针对 db.js 和 server.js),未达阈值时报错

- [ ] **Step 9.4: 验证测试 DB 不影响生产**

```bash
ls /www/wwwroot/sample-mgmt/data/
```

预期:应有 `sample.db.sqlite`(生产库)和 `test.db.sqlite`(测试库,测试结束后残留是正常的,每次测试前会删除)

- [ ] **Step 9.5: 提交**

```bash
git add tests/samples.test.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "test(samples): add 6 API test cases (CRUD/scan/permissions)

- list samples returns array
- ADMIN/RND can create samples
- non-RND role denied (403)
- empty name rejected (400)
- RND scan advances NEW->PRODUCED
- QA RELEASE requires cycleDays (400)
- wrong role/status scan rejected (409)"
```

---

### Task 10: browser_use 回归验证

**Files:**
- 无文件修改,仅浏览器自动化验证

- [ ] **Step 10.1: 派发 browser_use subagent**

派发 `browser_use` subagent,执行以下验证脚本:

```
Navigate to http://localhost:4000.

STEP 1: GET /health endpoint
  Navigate to http://localhost:4000/health
  Verify response contains status:ok, uptime (number), timestamp, memory, db:connected

STEP 2: Login with correct credentials
  Navigate to http://localhost:4000
  Fill username: admin, password: admin123
  Click login/提交
  Verify redirect to dashboard (URL not /login, page shows "待办" or stats)

STEP 3: Test rate limiting - login brute force
  For 11 times: POST to /api/login with wrong password via fetch in console
  Verify the 11th request returns 429 status

STEP 4: Authenticated API access
  After login, GET /api/me
  Verify 200 response with role:ADMIN

STEP 5: Logout invalidates session
  POST /api/logout
  GET /api/me - verify 401

STEP 6: List samples
  Login as admin, GET /api/samples
  Verify 200 + array response

STEP 7: Cookie security
  Open DevTools > Application > Cookies
  Verify session cookie has httpOnly=true, sameSite=strict

STEP 8: GET /api/dashboard after login
  Verify 200 + byStatus/overdue/dueSoon fields

STEP 9: Check console errors
  Scan all console messages for "error" level
  Report any found (skip http://localhost:54749 ERR_ABORTED)

Final summary: PASS if all checks pass, FAIL with details otherwise.
```

- [ ] **Step 10.2: 根据 browser_use 结果,修复发现的问题**

若有 FAIL,修改代码后重新运行 `npx jest --forceExit` + browser_use 验证。

- [ ] **Step 10.3: 提交(无代码改动,跳过)**

回 browser_use 验证通过后:

```bash
echo "browser_use 回归验证完成: $(date)" >> /tmp/p1-regression.log
```

---

### Task 11: 臃肿检测 + 文档更新

**Files:**
- 无代码修改,仅报告

- [ ] **Step 11.1: 收集修改后指标**

```bash
f=server.js; echo "server.js: $(wc -l < $f) 行, $(wc -c < $f) 字符"
f=db.js; echo "db.js: $(wc -l < $f) 行, $(wc -c < $f) 字符"
echo "logger.js: $(wc -l < logger.js) 行, $(wc -c < logger.js) 字符"
echo "tests/auth.test.js: $(wc -l < tests/auth.test.js) 行"
echo "tests/samples.test.js: $(wc -l < tests/samples.test.js) 行"
```

- [ ] **Step 11.2: 对照上限输出检测报告**

| 文件 | 预估行数 | 上限 | 预警 |
|---|---|---|---|
| server.js | ~264 | 400 (Service) | 66%,安全 |
| db.js | ~169 | 200 (工具) | 84.5%,**触发 70%** |

**db.js 预警**:仅 +1 行,不新增业务逻辑,安全可接受。P3 架构重构时解决。

- [ ] **Step 11.3: 更新 README.md(启动与配置节)**

读取 `README.md`,在「启动与运行」或配置说明区域追加:

```markdown
### 健康检查
GET /health 返回服务状态,含 uptime/memory/db 连接状态。

### 日志
日志存储在 `logs/` 目录,按天轮转(保留 30 天)。
应用日志 JSON 格式,访问日志 short 格式。

### 速率限制
- 登录:10 次/分钟/IP (可配 LOGIN_RATE_LIMIT_MAX)
- API:200 次/分钟/IP (可配 API_RATE_LIMIT_MAX)

### 环境变量
参考 .env.example 完整配置项。
```

- [ ] **Step 11.4: 提交(文档)**

```bash
git add README.md
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "docs: update README with health/logs/rate-limit/env info"
```

---

### 完成标准

- [ ] 12 条测试全部 PASS(npx jest --forceExit)
- [ ] 覆盖率 >50%(npx jest --coverage)
- [ ] browser_use 回归验证全部 PASS
- [ ] server.js < 400 行(预估 264)
- [ ] db.js < 200 行(预估 169)
- [ ] npm start 正常启动
- [ ] 文件臃肿检测报告已输出
- [ ] 所有 commit 已提交(未 push)

## 回滚方案

```bash
cd /www/wwwroot/sample-mgmt
# 方案1: git revert
git revert <P1 第一个 commit>..HEAD
# 方案2: 备份恢复
cp server.js.bak.p1 server.js
cp db.js.bak.p1 db.js
cp package.json.bak.p1 package.json
cp .env.example.bak.p1 .env.example
rm -f logger.js jest.config.js .eslintrc.json .prettierrc
rm -rf tests/
npm install bcryptjs@^2.4.3 dotenv@^16.4.5 express@^4.19.2 sql.js@^1.10.3 express-session@^1.18.0 qrcode@^1.5.4
npm start
```
