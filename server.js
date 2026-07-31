// 加载 .env 文件中的环境变量（须在其他模块 require 之前）
// 兼容说明：默认 override:false，已存在的 process.env 变量优先生效，
// 因此 PM2/宝塔启动命令注入的环境变量仍可用，.env 仅作兜底配置
require('dotenv').config();
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { logger, morganStream } = require('./logger');

const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const D = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'sample-mgmt-dev-secret-change-me';

if (process.env.NODE_ENV === 'production' && SESSION_SECRET === 'sample-mgmt-dev-secret-change-me') {
  console.error('[FATAL] 生产环境必须设置 SESSION_SECRET 环境变量，当前使用不安全的默认值');
  process.exit(1);
}

app.use(compression()); // gzip/brotli 响应压缩，减少带宽 70-80%
app.use(express.json({ limit: '8mb' }));
app.use(helmet({
  contentSecurityPolicy: false, // 单体HTML内联脚本，CSP由前端自行控制
  crossOriginOpenerPolicy: false // 内网HTTP环境，关闭COOP避免浏览器警告
}));
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
if (!process.env.TEST_MODE) {
  app.use('/api/login', loginLimiter);
  app.use('/api', apiLimiter);
}

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
// 根路径 → 门户首页（必须在 express.static 之前注册）
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'portal.html')));
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
  etag: true,
  setHeaders: function(res, filePath) {
    if (/\.(js|css|png|jpg|gif|svg|ico|woff2?)$/.test(filePath)) {
      res.set('Cache-Control', 'public, max-age=604800, immutable');
    } else if (/\.html?$/.test(filePath)) {
      res.set('Cache-Control', 'no-cache');
    }
  }
}));
app.use(morgan('short', { stream: morganStream }));

// 路由注册（顺序：auth 必须先注册——requireAuth/currentUser 挂在 app.locals 上供其他模块复用）
require('./routes/auth').register(app);
require('./routes/samples').register(app);
require('./routes/scan').register(app);
require('./routes/cards').register(app);
require('./routes/misc').register(app);
require('./routes/fixtures').register(app);
require('./routes/fixture-files').register(app);
require('./routes/fixture-preview').register(app);

// ---------------- 全局错误处理 ----------------
app.use((err, req, res, next) => {
  logger.error('未捕获错误', { message: err.message, stack: err.stack, url: req.url });
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message
  });
});

// 测试模式下不自动 listen（由 supertest 接管端口），生产/开发模式正常启动
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

module.exports = app;
