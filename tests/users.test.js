// tests/users.test.js — 用户管理 PUT /api/users/:id（ADMIN 修改姓名/密码）
const { getApp, login } = require('./helpers/setup');
const request = require('supertest');

beforeAll(async () => { await getApp(); });

describe('PUT /api/users/:id', () => {
  let createdId;
  let createdUsername;

  beforeAll(async () => {
    const { agent } = await login('admin', 'admin123');
    createdUsername = 'uput' + Date.now();
    const res = await agent.post('/api/users').send({
      username: createdUsername,
      password: 'init123',
      role: 'RD',
      dept: '测试部',
      display_name: '初始姓名'
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    createdId = res.body.id;
  });

  it('should reject non-admin', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.put('/api/users/' + createdId).send({ display_name: 'x' });
    expect(res.status).toBe(403);
  });

  it('should reject invalid id', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/abc').send({ display_name: 'x' });
    expect(res.status).toBe(400);
  });

  it('should return 404 for missing user', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/999999').send({ display_name: 'x' });
    expect(res.status).toBe(404);
  });

  it('should reject empty body', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/' + createdId).send({});
    expect(res.status).toBe(400);
  });

  it('should reject empty password', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/' + createdId).send({ password: '' });
    expect(res.status).toBe(400);
  });

  it('should reject overlong display_name', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/' + createdId).send({ display_name: 'x'.repeat(51) });
    expect(res.status).toBe(400);
  });

  it('should update display_name only', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/' + createdId).send({ display_name: '新姓名' });
    expect(res.status).toBe(200);
    expect(res.body.display_name).toBe('新姓名');
  });

  it('should update password and allow login with new password', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/users/' + createdId).send({ password: 'newpass789' });
    expect(res.status).toBe(200);
    const oldRes = await request(await getApp()).post('/api/login').send({ username: createdUsername, password: 'init123' });
    expect(oldRes.status).toBe(401);
    const newRes = await request(await getApp()).post('/api/login').send({ username: createdUsername, password: 'newpass789' });
    expect(newRes.status).toBe(200);
  });
});
