const request = require('supertest');
const bcrypt = require('bcryptjs');
const path = require('path');
const os = require('os');
// 测试进程日志隔离：重定向到系统临时目录，避免非 www 用户向生产 logs/ 写入时 EACCES（logs/app-*.log 归 www 所有）
// logger.js 用 path.join(__dirname(项目根), LOG_DIR) 解析日志目录，因此需传相对项目根的路径，否则绝对路径会被拼进项目 tmp/
const projectRoot = path.join(__dirname, '..', '..');
// 路径按运行者 uid 分目录（2026-09-11 加固）：同一 /tmp 目录被不同用户先后写入会导致后续运行 EACCES 无法写
// 测试日志（实测：先以 root 跑过一次，之后以 www 跑时全部套件 "Test suite failed to run"，且未捕获的日志流错误
// 会直接终止 jest 进程、连最终汇总都不打印），故按 uid 隔离目录。
if (!process.env.LOG_DIR) process.env.LOG_DIR = path.relative(projectRoot, path.join(os.tmpdir(), 'sample-mgmt-test-logs' + (typeof process.getuid === 'function' ? '-' + process.getuid() : '')));
let app;

async function getApp() {
  if (!app) {
    // P1 守卫（2026-09-11）：测试库名 MUST 以 _test 结尾，否则拒绝启动。
    // 原因：getApp() 会 require server.js → db.js init()，对**所连库**执行 schema.sql 与全部迁移；
    // 连错库（尤其 .env 的 DB_NAME=sample_mgmt 生产库）等于对生产执行迁移。正常路径下
    // jest.config.js 的 setupFiles（tests/setup-env.js）已把 DB_NAME 强制为 sample_mgmt_test；
    // 本断言用于拦截「setupFiles 被移除/绕过」的场景，失败即停，不降级继续。
    if (!/_test$/.test(process.env.DB_NAME || '')) {
      throw new Error('[tests] 已中止：DB_NAME="' + (process.env.DB_NAME || '(未设置，db.js 将回退生产库 sample_mgmt)') + '" 不是测试库。测试禁止连接生产库；请确认 jest.config.js 的 setupFiles 仍包含 tests/setup-env.js。');
    }
    if (!process.env.TEST_MODE) process.env.TEST_MODE = '1';
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') process.env.NODE_ENV = 'test';
    app = require('../../server');
    const D = require('../../db');
    await D.ready;
    // 种子测试账号（2026-09-05 修复存量 bug：getUserByUsername 为 async 返回 Promise，
    // 原写法 if(!Promise) 恒 false 导致缺号账号永不补种（qa01/mfg01/fqc01/me01 缺失即此因）；
    // 现改为 await 查询 + await 创建， createUser 内部含重复容错）
    const users = [
      { username: 'admin', password: 'admin123', role: 'ADMIN', dept: '系统', display_name: '系统管理员' },
      { username: 'rd01', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发工程师' },
      { username: 'qa01', password: 'qa123', role: 'QA', dept: '品保文管中心', display_name: '品保文管员' },
      { username: 'mfg01', password: 'mfg123', role: 'CUSTODY', dept: '制造部', display_name: '制造部保管员' },
      { username: 'fqc01', password: 'fqc123', role: 'CUSTODY', dept: 'FQC', display_name: 'FQC保管员' },
      { username: 'me01', password: 'me123', role: 'ME', dept: '生技部', display_name: '生技工程师' }
    ];
    for (const u of users) {
      const exist = await D.getUserByUsername(u.username);
      if (!exist) {
        await D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
      }
    }
  }
  return app;
}

async function login(username, password) {
  const agent = request.agent(await getApp());
  const res = await agent
    .post('/api/login')
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error('登录失败: ' + (res.body && res.body.error));
  }
  return { agent };
}

module.exports = { getApp, login };
