# P1:安全加固 + 工程化基础 设计文档

- **日期**: 2026-07-23
- **状态**: 待用户审查
- **所属迭代**: 全量优化 · 第 1 阶段(B+D 基础)
- **依赖**: 无(独立落地)
- **后续**: P2 体验提升、P3 架构重构

---

## 1. 背景与目标

### 1.1 全维度评估结果

| 维度 | 评分 | 关键问题 |
|---|---|---|
| 后端健康度 | 3.5/10 | server.js 无安全中间件,无测试,无日志框架 |
| 前端健康度 | 3.5/10 | index.html 单体混杂,无语义化/ARIA |
| 运维成熟度 | 2.7/10 | 无 CI/CD、无测试、无监控、无日志轮转 |
| **整体** | **3.2/10** | 功能可用但技术债高 |

### 1.2 P1 目标

在不动现有业务逻辑的前提下,完成安全加固 + 测试基础设施 + 工程化配置,为后续 P2(体验提升)和 P3(架构重构)提供安全网。

**硬性约束**:
- server.js 仅增量追加(224→264 行),不拆分路由/中间件
- db.js 仅 1 行改动(TEST_MODE 三元),接口签名不变
- 不修改 `public/index.html`(已达 89.5% 红线)
- 新增依赖固定版本号,不引入破坏性更新

### 1.3 核心技术决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 测试框架 | Jest 29.7 + supertest 7.0 | 零配置,supertest 直接测 Express,jsdom 可选 |
| 速率限制 | 宽松(登录 10/min、API 200/min) | 内部系统,防暴力破解为主 |
| CSRF 防护 | SameSite Cookie(strict) | 1 行配置,无需改前端 fetch |
| 日志 | Morgan + Winston(daily rotate) | Express 生态最成熟 |
| 输入校验 | 保持现有手动校验 | zod 留到 P3 架构重构 |

---

## 2. 架构设计

### 2.1 文件变更清单

```
新增:
├── logger.js              # Winston 业务日志 + Morgan HTTP 日志
├── tests/
│   ├── helpers/setup.js   # 测试辅助:启动服务/登录/重置 DB
│   ├── auth.test.js       # 6 条用例(登录/鉴权/登出)
│   └── samples.test.js    # 6 条用例(CRUD/状态机/权限)
├── jest.config.js         # Jest 配置(node 环境,50% 覆盖率阈值)
├── .eslintrc.json         # ESLint 配置(node,宽松规则)
├── .prettierrc            # Prettier 配置

修改:
├── server.js              # +40 行:中间件注册 + /health 端点 + 错误处理
├── db.js                  # +1 行:TEST_MODE 三元表达式
├── package.json           # 版本去 ^ + 新增 scripts + 8 依赖
└── .env.example           # +4 配置项(NODE_ENV/LOGIN_RATE/API_RATE/LOG_DIR/UPLOAD_MAX)
```

### 2.2 server.js 改动位置图

```
[server.js 当前 224 行]
第 1-4 行:  require 区  →  新增 require helmet/rate-limit/morgan + logger
第 14-17 行: 配置区     →  新增 UPLOAD_MAX_SIZE
第 19-26 行: 中间件区   →  穿插 helmet + rate-limit(login/api) + sameSite/httpOnly/secure
第 28 行后:             →  新增 morgan HTTP 日志
第 221 行前:            →  新增 GET /health
第 223 行后:            →  新增全局错误处理中间件
```

### 2.3 未来 PG/MySQL 适配预留

db.js 当前导出接口签名 `{ ready, db, nowISO, createUser, getUserById, ..., addLog, listLogsBySample, listLogs }` 已足够抽象。切换到 PG/MySQL 时保持签名不变,替换 sql.js 为 pg/mysql2 即可,server.js 路由完全不感知。

本次新增的测试覆盖所有 db.js 导出函数,为未来切换提供回归安全网。

---

## 3. 安全加固详细设计

### 3.1 Helmet 安全头

```js
const helmet = require('helmet');
app.use(helmet());
```

Helmet 默认启用 7 个中间件(XSS 过滤、MIME 嗅探保护、隐藏 X-Powered-By、HSTS 等)。不加 CSP(Content-Security-Policy),避免限制内联 style 和 onclick。

### 3.2 速率限制

```js
const rateLimit = require('express-rate-limit');

// 登录限流:10次/分钟/IP,超过等1分钟
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: '请求过于频繁,请1分钟后重试' })
});
app.use('/api/login', loginLimiter);

// API 限流:200次/分钟/IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: '请求过于频繁,请稍后重试' })
});
app.use('/api', apiLimiter);
```

**注意**:`/api/login` 的 loginLimiter 必须在 apiLimiter **之前**注册,Express 中间件 first-match-wins。

### 3.3 Session 加固

```js
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 8,
    httpOnly: true,      // JS 不可读,防 XSS 窃取
    sameSite: 'strict',  // 防 CSRF(同站提交,不影响 fetch)
    secure: process.env.NODE_ENV === 'production'  // HTTPS 时才发
  }
}));
```

改动:新增 `httpOnly`/`sameSite`/`secure`,其余与现有配置一致。

### 3.4 文件上传校验增强

```js
function saveSampleImage(dataUrl, sampleNo) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  let ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return null;  // 白名单拦截未知格式
  const size = Buffer.byteLength(m[2], 'base64');
  if (size > UPLOAD_MAX_SIZE) { logger.warn('图片过大:', size); return null; }  // 新增大小校验
  // --- 写文件逻辑不变 ---
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fname = sampleNo + '.' + ext;
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, fname), Buffer.from(m[2], 'base64'));
    return '/uploads/' + fname;
  } catch (e) { logger.error('保存图片失败:', e.message); return null; }
}
```

改动:Base64 解码后大小校验 `> UPLOAD_MAX_SIZE`(默认 5MB),console.error 改 logger.error。

### 3.5 全局错误处理(防栈泄露)

```js
// 在所有路由注册之后添加
app.use((err, req, res, next) => {
  logger.error('未捕获错误:', { message: err.message, stack: err.stack, url: req.url });
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});
```

生产环境不返回 `err.stack`,只返回固定文案。

---

## 4. 测试设计

### 4.1 Jest 配置(jest.config.js)

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  forceExit: true,
  detectOpenHandles: true,
  collectCoverageFrom: ['db.js', 'server.js'],
  coverageThreshold: {
    global: { branches: 50, functions: 50, lines: 50, statements: 50 }
  }
};
```

### 4.2 测试辅助(tests/helpers/setup.js)

```js
const request = require('supertest');
const path = require('path');
const fs = require('fs');
let app;

async function getApp() {
  if (!app) {
    const dbPath = path.join(__dirname, '../../data', 'test.db.sqlite');
    try { fs.unlinkSync(dbPath); } catch (_) {}
    process.env.TEST_MODE = '1';
    process.env.NODE_ENV = 'test';
    app = require('../../server');
    await require('../../db').ready;
  }
  return app;
}

async function login(username, password) {
  const agent = request.agent(await getApp());
  const res = await agent.post('/api/login').send({ username, password });
  if (res.status !== 200) throw new Error('登录失败: ' + (res.body && res.body.error));
  return agent;
}

module.exports = { getApp, login };
```

### 4.3 测试用例(12 条)

| 文件 | # | 用例 | HTTP | 预期 |
|---|---|---|---|---|
| **auth.test.js** | 1 | 正确账号登录 | POST /api/login | 200 + session cookie + 用户信息 |
| | 2 | 错误密码登录 | POST /api/login | 401 + 错误提示 |
| | 3 | 空账号密码 | POST /api/login | 400 + 校验提示 |
| | 4 | 未登录访问 /api/me | GET /api/me | 401 |
| | 5 | 登录后访问 /api/me | GET /api/me | 200 + 用户信息 |
| | 6 | 登出后访问 /api/me | GET /api/me | 401 |
| **samples.test.js** | 7 | 列出样品 | GET /api/samples | 200 + 数组 |
| | 8 | ADMIN 新建样品 | POST /api/samples | 200 + sample_no/qr_token |
| | 9 | 非 RND 角色新建 | POST /api/samples | 403 |
| | 10 | 研发扫码推进 | POST /api/scan | 200 + status=PRODUCED |
| | 11 | 品保扫码(需 cycleDays) | POST /api/scan | 200 + next_inspect_at |
| | 12 | 权限不足扫码 | POST /api/scan | 409 + 错误 |

### 4.4 db.js TEST_MODE 适配

```js
// 原(第 8 行):
const DB_FILE = path.join(DATA_DIR, 'sample.db.sqlite');

// 改:
const DB_FILE = path.join(DATA_DIR, process.env.TEST_MODE ? 'test.db.sqlite' : 'sample.db.sqlite');
```

**改动量**:1 行三元。测试设置 `process.env.TEST_MODE = '1'` 时用独立测试库,不影响生产数据。

---

## 5. 日志系统

### 5.1 logger.js

```js
const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const LOG_DIR = path.join(__dirname, process.env.LOG_DIR || 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
  transports: [
    new transports.DailyRotateFile({
      dirname: LOG_DIR, filename: 'app-%DATE%.log', datePattern: 'YYYY-MM-DD',
      maxFiles: '30d', maxSize: '20m'
    }),
    new transports.Console({
      format: format.combine(format.colorize(), format.simple())
    })
  ]
});

const morganStream = { write: (msg) => logger.info(msg.trim()) };

module.exports = { logger, morganStream };
```

### 5.2 server.js 集成

```js
const { logger, morganStream } = require('./logger');
const morgan = require('morgan');
app.use(morgan('short', { stream: morganStream }));
```

### 5.3 健康检查端点

```js
app.get('/health', (req, res) => {
  const dbReady = require('./db').db();
  res.json({
    status: dbReady ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage().rss,
    db: dbReady ? 'connected' : 'disconnected'
  });
});
```

---

## 6. ESLint + Prettier

### .eslintrc.json

```json
{
  "env": { "node": true, "es2021": true },
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

### .prettierrc

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "printWidth": 120,
  "trailingComma": "none"
}
```

---

## 7. package.json 变更

### 新增依赖(8 个,固定版本)

```json
"helmet": "7.1.0",
"express-rate-limit": "7.4.0",
"morgan": "1.10.0",
"winston": "3.14.0",
"winston-daily-rotate-file": "5.0.0",
"jest": "29.7.0",
"supertest": "7.0.0",
"eslint": "8.57.0",
"prettier": "3.3.0"
```

### 现有依赖版本去 `^`

```json
"bcryptjs": "2.4.3",
"dotenv": "16.4.5",
"express": "4.21.0",
"sql.js": "1.10.3",
"express-session": "1.18.0",
"qrcode": "1.5.4"
```

### 新增 scripts

```json
"test": "jest --forceExit --detectOpenHandles",
"test:watch": "jest --watch",
"test:coverage": "jest --coverage",
"lint": "eslint . --ext .js",
"lint:fix": "eslint . --ext .js --fix",
"format": "prettier --write \"**/*.js\""
```

---

## 8. .env.example 新增配置

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

---

## 9. 全链路影响分析

### 9.1 文件级影响

| 文件 | 操作 | 行数变化 | 风险等级 |
|---|---|---|---|
| server.js | 修改 | +40(224→264) | 低(仅增量) |
| db.js | 修改 | +1(168→169) | 极低 |
| package.json | 修改 | 去 ^ +6 scripts +8 deps | 低(锁版本) |
| .env.example | 修改 | +4 配置项 | 零 |
| logger.js | 新建 | 30 行 | 零 |
| tests/* | 新建 | 135 行 | 零 |
| .eslintrc.json | 新建 | 12 行 | 零 |
| .prettierrc | 新建 | 8 行 | 零 |
| jest.config.js | 新建 | 10 行 | 零 |

### 9.2 5 维度检索

| 维度 | 影响 | 处理 |
|---|---|---|
| 代码层 | 所有路由不变,仅追加中间件;db.js 接口签名不变 | 兼容 |
| DB 层 | 无新表/字段;测试用 test.db.sqlite 独立 | 无影响 |
| 配置层 | 新增环境变量均有兜底值 | 不配也能跑 |
| 接口层 | 新增 GET /health | 无冲突 |
| 前端层 | sameSite strict + httpOnly 不影响 fetch | 无影响 |
| 文档层 | README 启动与配置节需更新 | Task 完成时补充 |
| 部署层 | npm install 新依赖 + npm test | 标准流程 |

### 9.3 受影响业务场景

| 场景 | 改动 | 风险 |
|---|---|---|
| 登录 | 10/min 限流 | 正常操作不触发 |
| API 调用 | 200/min 限流 | 远超正常用量 |
| 文件上传 | 5MB 限制 | 可配置 |
| 浏览器 | Helmet 安全头 | 透明 |
| 扫码/看板/日志/用户 | 无改动 | 零风险 |

---

## 10. 验证方案(全部 browser_use 自动化)

### 10.1 自动化测试

```bash
npm test  # 期望 12 条用例 PASS
```

### 10.2 browser_use 回归验证(12 步自动化)

| # | 步骤 | 验证点 |
|---|---|---|
| 1 | GET /health | status:ok,含 uptime/memory/db |
| 2 | GET /health → db:connected | 非 disconnected |
| 3 | admin/admin123 登录 → /api/login POST | 200 + id/username/role |
| 4 | 连续 11 次错误密码 POST /api/login | 第 11 次 429 |
| 5 | 连续 201 次 GET /api/me | 第 201 次 429 |
| 6 | GET /api/me(已登录) | 200 + role |
| 7 | POST /api/logout → GET /api/me | 401 |
| 8 | GET /api/samples(ADMIN 登录) | 200 + 数组 |
| 9 | POST /api/samples(name 等,ADMIN 登录) | 200 + sample_no/qr_token |
| 10 | POST /api/users(ADMIN 新建用户) | 200 + 用户对象 |
| 11 | 检查 Set-Cookie: httpOnly=true | DevTools cookies 验证 |
| 12 | GET /api/dashboard(ADMIN 登录) | 200 + byStatus/overdue/dueSoon |

### 10.3 手动验证(仅 2 步,browser_use 无法覆盖)

| # | 场景 | 方法 |
|---|---|---|
| 13 | 日志落盘 | `ls logs/app-*.log` 文件存在 |
| 14 | 上传大图防崩溃 | Base64 >5MB 图片上传,返回 image:'' |

### 10.4 部署步骤

```bash
npm install      # 新依赖
npm test         # 12 PASS → 安全
npm start        # 重启
```

### 10.5 回滚方案

```bash
git revert <P1 第一个 commit>..HEAD
npm install bcryptjs@^2.4.3 dotenv@^16.4.5 express@^4.19.2 sql.js@^1.10.3 express-session@^1.18.0 qrcode@^1.5.4
npm start
```

---

## 11. 文件臃肿检测(修改后预估)

| 文件 | 修改前 | 修改后 | 上限 | 预警 |
|---|---|---|---|---|
| server.js | 224 行 | 264 行(+40) | 400(Service) | 66%,未触发 |
| db.js | 168 行 | 169 行(+1) | 200(工具) | 84.5%,**触发 70%** |
| logger.js | — | 30 行(新) | 200(工具) | 安全 |
| tests/auth.test.js | — | 50 行(新) | 1000(豁免) | — |
| tests/samples.test.js | — | 60 行(新) | 1000(豁免) | — |
| tests/helpers/setup.js | — | 25 行(新) | — | — |
| public/index.html | 537 行 | 不变 | 600(入口) | 89.5%,不增加 |

**db.js 预警**:169 行达 84.5%,但仅 +1 行(TEST_MODE),不新增业务逻辑。DB 层拆分(工具函数 vs DAO 业务)留到 P3。

### 冗余清单

- server.js:无废弃代码,无重复逻辑
- db.js:无废弃代码;`nextSampleNo()` 用 `COUNT(*)` 自增,并发下可能重复,留到 P3 加事务
- 旧 console.log 打印:server.js 仅第 222 行 1 处启动日志,改为 logger.info

### 瘦身方案(不在本次范围)

- server.js 中间件注册块可抽 `middleware/index.js`,留 P3
- db.js 可拆 `db.js`(核心:init/q/one) + `dao.js`(业务:createUser/updateSample 等),留 P3

---

## 12. 变更记录

| 类型 | 文件 | 变更 |
|---|---|---|
| 修改 | server.js | +helmet/+rateLimit/+sameSite/+morgan/+health/+全局错误处理 |
| 修改 | db.js | +1 行 TEST_MODE 三元 |
| 修改 | package.json | 版本去 ^;+scripts(test/lint/format);+8 deps(helmet/rate-limit/morgan/winston/winston-daily/jest/supertest/eslint/prettier) |
| 修改 | .env.example | +NODE_ENV/+LOGIN_RATE/+API_RATE/+LOG_DIR/+UPLOAD_MAX |
| 新增 | logger.js | Winston 业务日志 + Morgan HTTP 流 |
| 新增 | tests/helpers/setup.js | 测试辅助 |
| 新增 | tests/auth.test.js | 6 条用例 |
| 新增 | tests/samples.test.js | 6 条用例 |
| 新增 | jest.config.js | Jest 配置 |
| 新增 | .eslintrc.json | ESLint 配置 |
| 新增 | .prettierrc | Prettier 配置 |

### 兼容性影响

- **不受影响**:所有现有 API、前端页面、扫码流程、DB 数据
- **需调整**:无
- **部署**:`npm install` + `npm test` + `npm start`
- **回滚**:git revert 或手动降级依赖

### 上线后监控(1~3 周期)

- Winston 日志 grep "429" 检查速率限制触发频率
- /health 端点宝塔计划任务每 5 分钟 curl
- 日志文件大小(每日轮转,单文件 < 20MB)
- 浏览器 Console 无 Helmet/安全头报错

---

## 13. 不在本次范围

- server.js 中间件/路由拆分(P3)
- db.js 事务控制(P3)
- zod 输入校验(P3)
- ESLint auto-fix 全项目(P3)
- 测试覆盖率 > 80%(P3 后达标)
- public/index.html 任何修改(P2/P3)
