// tests/change-password.test.js — 用户自助修改密码 API（全员可用，框架级）
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { getApp, login } = require('./helpers/setup');

let app;
let tmpUser; // { agent, user }

// 创建独立测试账号（避免影响演示账号），返回已登录 agent + 完整用户记录
async function makeUser(u) {
  const D = require('../db');
  if (!await D.getUserByUsername(u.username)) {
    await D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
  }
  const agent = request.agent(app);
  const res = await agent.post('/api/login').send({ username: u.username, password: u.password });
  if (res.status !== 200) throw new Error('登录失败: ' + (res.body && res.body.error));
  return { agent, user: await D.getUserByUsername(u.username) };
}

beforeAll(async () => {
  app = await getApp();
  tmpUser = await makeUser({ username: 'chgtest01', password: 'chg123', role: 'RD', dept: '研发部', display_name: '改密测试' });
}, 30000);

afterAll(async () => {
  // 清理测试账号（密码已被用例改过，直接按 id 删除）
  const D = require('../db');
  await D.deleteUsers([tmpUser.user.id]);
}, 30000);

describe('POST /api/change-password — 自助修改密码', () => {
  test('未登录返回 401', async () => {
    const res = await request(app).post('/api/change-password').send({ old_password: 'chg123', new_password: 'chg1234' });
    expect(res.status).toBe(401);
  });

  test('新密码长度不足 6 位 → 400', async () => {
    const res = await tmpUser.agent.post('/api/change-password').send({ old_password: 'chg123', new_password: 'abc12' });
    expect(res.status).toBe(400);
  });

  test('新密码与旧密码相同 → 400', async () => {
    const res = await tmpUser.agent.post('/api/change-password').send({ old_password: 'chg123', new_password: 'chg123' });
    expect(res.status).toBe(400);
  });

  test('旧密码错误 → 401', async () => {
    const res = await tmpUser.agent.post('/api/change-password').send({ old_password: 'wrong99', new_password: 'chg999' });
    expect(res.status).toBe(401);
  });

  test('改密成功后旧密码登录失败、新密码登录成功', async () => {
    const res = await tmpUser.agent.post('/api/change-password').send({ old_password: 'chg123', new_password: 'chg12345' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    // 旧密码无法登录
    const oldLogin = await request(app).post('/api/login').send({ username: 'chgtest01', password: 'chg123' });
    expect(oldLogin.status).toBe(401);
    // 新密码可登录
    const newLogin = await request(app).post('/api/login').send({ username: 'chgtest01', password: 'chg12345' });
    expect(newLogin.status).toBe(200);
  });

  test('改密后原 session 失效', async () => {
    // 重新用新密码登录，改密后原会话必须立即失效（/api/me → 401）
    const agent = request.agent(app);
    const loginRes = await agent.post('/api/login').send({ username: 'chgtest01', password: 'chg12345' });
    expect(loginRes.status).toBe(200);
    const chg = await agent.post('/api/change-password').send({ old_password: 'chg12345', new_password: 'chg99999' });
    expect(chg.status).toBe(200);
    const me = await agent.get('/api/me');
    expect(me.status).toBe(401);
  });

  test('ADMIN 角色也可自助改密（改后恢复原密码）', async () => {
    const { agent } = await login('admin', 'admin123');
    const chg = await agent.post('/api/change-password').send({ old_password: 'admin123', new_password: 'admin1234' });
    expect(chg.status).toBe(200);
    // 改密成功后会话已销毁，须用新密码重新登录后再改回（保持测试可重复执行）
    const { agent: agent2 } = await login('admin', 'admin1234');
    const back = await agent2.post('/api/change-password').send({ old_password: 'admin1234', new_password: 'admin123' });
    expect(back.status).toBe(200);
    const relogin = await request(app).post('/api/login').send({ username: 'admin', password: 'admin123' });
    expect(relogin.status).toBe(200);
  });
});
