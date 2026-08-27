const request = require('supertest');
const bcrypt = require('bcryptjs');
const path = require('path');
const os = require('os');
// 测试进程日志隔离：重定向到系统临时目录，避免非 www 用户向生产 logs/ 写入时 EACCES（logs/app-*.log 归 www 所有）
// logger.js 用 path.join(__dirname(项目根), LOG_DIR) 解析日志目录，因此需传相对项目根的路径，否则绝对路径会被拼进项目 tmp/
const projectRoot = path.join(__dirname, '..', '..');
if (!process.env.LOG_DIR) process.env.LOG_DIR = path.relative(projectRoot, path.join(os.tmpdir(), 'sample-mgmt-test-logs'));
let app;

async function getApp() {
  if (!app) {
    if (!process.env.TEST_MODE) process.env.TEST_MODE = '1';
    if (!process.env.NODE_ENV || process.env.NODE_ENV !== 'test') process.env.NODE_ENV = 'test';
    app = require('../../server');
    const D = require('../../db');
    await D.ready;
    // 种子测试账号
    const users = [
      { username: 'admin', password: 'admin123', role: 'ADMIN', dept: '系统', display_name: '系统管理员' },
      { username: 'rd01', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发工程师' },
      { username: 'qa01', password: 'qa123', role: 'QA', dept: '品保文管中心', display_name: '品保文管员' },
      { username: 'mfg01', password: 'mfg123', role: 'CUSTODY', dept: '制造部', display_name: '制造部保管员' },
      { username: 'fqc01', password: 'fqc123', role: 'CUSTODY', dept: 'FQC', display_name: 'FQC保管员' },
      { username: 'me01', password: 'me123', role: 'ME', dept: '生技部', display_name: '生技工程师' }
    ];
    for (const u of users) {
      if (!D.getUserByUsername(u.username)) {
        D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
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
