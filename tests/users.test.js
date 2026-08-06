// tests/users.test.js — 用户管理 PUT /api/users/:id（ADMIN 修改姓名/密码）+ 批量管理
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

  // 清理本 describe 创建的测试账号，避免测试残留（2026-08-06）
  afterAll(async () => {
    if (!createdId) return;
    const { agent } = await login('admin', 'admin123');
    await agent.post('/api/users/batch').send({ action: 'delete', ids: [createdId] });
  });
});

// —— 批量管理（2026-08-06）——
describe('POST /api/users/batch', () => {
  let adminAgent, batchIds, batchNames;
  const uniq = Date.now();

  beforeAll(async () => {
    ({ agent: adminAgent } = await login('admin', 'admin123'));
    batchNames = ['ub1_' + uniq, 'ub2_' + uniq];
    batchIds = [];
    for (const name of batchNames) {
      const res = await adminAgent.post('/api/users').send({ username: name, password: 'batch123', role: 'RD', dept: '测试部', display_name: '批量测试' });
      expect(res.status).toBe(200);
      batchIds.push(res.body.id);
    }
  });

  it('should reject non-admin', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/users/batch').send({ action: 'delete', ids: batchIds });
    expect(res.status).toBe(403);
  });

  it('should reject empty ids', async () => {
    const res = await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [] });
    expect(res.status).toBe(400);
  });

  it('should reject unknown action', async () => {
    const res = await adminAgent.post('/api/users/batch').send({ action: 'ban', ids: batchIds });
    expect(res.status).toBe(400);
  });

  it('should delete users in batch', async () => {
    const res = await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: batchIds });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.skipped).toBe(0);
    const list = await adminAgent.get('/api/users');
    const names = list.body.map(u => u.username);
    for (const n of batchNames) expect(names).not.toContain(n);
  });

  it('should protect admin from delete', async () => {
    const res = await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [1] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/受保护/);
  });

  it('should disable then enable users', async () => {
    const nm = 'ub3_' + uniq;
    const created = await adminAgent.post('/api/users').send({ username: nm, password: 'batch123', role: 'QA', dept: '测试部', display_name: '启停测试' });
    const uid = created.body.id;
    const dis = await adminAgent.post('/api/users/batch').send({ action: 'disable', ids: [uid] });
    expect(dis.status).toBe(200);
    expect(dis.body.count).toBe(1);
    const denied = await request(await getApp()).post('/api/login').send({ username: nm, password: 'batch123' });
    expect(denied.status).toBe(403);
    expect(denied.body.error).toMatch(/停用/);
    const en = await adminAgent.post('/api/users/batch').send({ action: 'enable', ids: [uid] });
    expect(en.status).toBe(200);
    const okLogin = await request(await getApp()).post('/api/login').send({ username: nm, password: 'batch123' });
    expect(okLogin.status).toBe(200);
    await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [uid] });
  });

  it('should reset passwords in batch', async () => {
    const nm = 'ub4_' + uniq;
    const created = await adminAgent.post('/api/users').send({ username: nm, password: 'oldpass1', role: 'ME', dept: '测试部', display_name: '重置测试' });
    const uid = created.body.id;
    const res = await adminAgent.post('/api/users/batch').send({ action: 'reset-password', ids: [uid], password: 'newpass9' });
    expect(res.status).toBe(200);
    const oldLogin = await request(await getApp()).post('/api/login').send({ username: nm, password: 'oldpass1' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(await getApp()).post('/api/login').send({ username: nm, password: 'newpass9' });
    expect(newLogin.status).toBe(200);
    await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [uid] });
  });

  it('should update role and dept in batch', async () => {
    const nm = 'ub5_' + uniq;
    const created = await adminAgent.post('/api/users').send({ username: nm, password: 'batch123', role: 'RD', dept: '旧部门', display_name: '角色测试' });
    const uid = created.body.id;
    const res = await adminAgent.post('/api/users/batch').send({ action: 'update', ids: [uid], role: 'QA', dept: '新部门' });
    expect(res.status).toBe(200);
    const list = await adminAgent.get('/api/users');
    const u = list.body.find(x => x.id === uid);
    expect(u.role).toBe('QA');
    expect(u.dept).toBe('新部门');
    await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [uid] });
  });

  it('should reject invalid role in batch update', async () => {
    const res = await adminAgent.post('/api/users/batch').send({ action: 'update', ids: batchIds, role: 'BOSS' });
    expect(res.status).toBe(400);
  });

  // —— PM 角色（2026-08-06，与项目追踪子系统 ADMIN/PM 权限对齐）——
  it('should create user with PM role', async () => {
    const nm = 'upm_' + uniq;
    const res = await adminAgent.post('/api/users').send({ username: nm, password: 'pm123', role: 'PM', dept: '项目部', display_name: 'PM测试' });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('PM');
    await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [res.body.id] });
  });

  it('should update role to PM in batch', async () => {
    const nm = 'upm2_' + uniq;
    const created = await adminAgent.post('/api/users').send({ username: nm, password: 'batch123', role: 'RD', dept: '测试部', display_name: 'PM批量' });
    const uid = created.body.id;
    const res = await adminAgent.post('/api/users/batch').send({ action: 'update', ids: [uid], role: 'PM' });
    expect(res.status).toBe(200);
    const list = await adminAgent.get('/api/users');
    const u = list.body.find(x => x.id === uid);
    expect(u.role).toBe('PM');
    await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: [uid] });
  });
});

// —— 批量导入（2026-08-06）：CSV 前端解析 → POST /api/users/import ——
describe('POST /api/users/import', () => {
  let adminAgent, impNames, impIds;
  const uniq = Date.now();

  beforeAll(async () => {
    ({ agent: adminAgent } = await login('admin', 'admin123'));
    impNames = ['ui1_' + uniq, 'ui2_' + uniq];
    impIds = [];
  });

  it('should reject non-admin', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/users/import').send({ users: [{ username: 'x', role: 'RD' }] });
    expect(res.status).toBe(403);
  });

  it('should reject empty data', async () => {
    const res = await adminAgent.post('/api/users/import').send({ users: [] });
    expect(res.status).toBe(400);
  });

  it('should import valid users (empty password defaults to 123456)', async () => {
    const res = await adminAgent.post('/api/users/import').send({ users: [
      { username: impNames[0], display_name: '导入一', role: 'RD', dept: '研发部', password: '' },
      { username: impNames[1], display_name: '导入二', role: 'QA', dept: '品保文管中心', password: 'initpass1' }
    ]});
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);
    expect(res.body.skipped).toBe(0);
    expect(res.body.errors).toHaveLength(0);
    const okLogin = await request(await getApp()).post('/api/login').send({ username: impNames[0], password: '123456' });
    expect(okLogin.status).toBe(200);
    const okLogin2 = await request(await getApp()).post('/api/login').send({ username: impNames[1], password: 'initpass1' });
    expect(okLogin2.status).toBe(200);
    const list = await adminAgent.get('/api/users');
    const u1 = list.body.find(x => x.username === impNames[0]);
    expect(u1.dept).toBe('研发部');
    impIds = list.body.filter(x => impNames.includes(x.username)).map(x => x.id);
  });

  it('should skip duplicate username', async () => {
    const extraName = 'ui_new_' + uniq;
    const res = await adminAgent.post('/api/users/import').send({ users: [
      { username: impNames[0], role: 'RD' },
      { username: extraName, role: 'ME', dept: '生技部' }
    ]});
    expect(res.status).toBe(200);
    expect(res.body.skipped).toBe(1);
    expect(res.body.created).toBe(1);
    const list = await adminAgent.get('/api/users');
    const extra = list.body.find(x => x.username === extraName);
    expect(extra).toBeTruthy();
    impIds.push(extra.id);
  });

  it('should collect invalid rows in errors', async () => {
    const res = await adminAgent.post('/api/users/import').send({ users: [
      { username: '', role: 'RD' },
      { username: 'ui_bad_' + uniq, role: 'BOSS' },
      { username: 'ui_bad2_' + uniq, role: 'RD', dept: '不存在部门' }
    ]});
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(0);
    expect(res.body.errors).toHaveLength(3);
    expect(res.body.errors[0].error).toMatch(/账号必填/);
    expect(res.body.errors[1].error).toMatch(/角色只能是/);
    expect(res.body.errors[2].error).toMatch(/部门/);
  });

  afterAll(async () => {
    if (impIds.length) await adminAgent.post('/api/users/batch').send({ action: 'delete', ids: impIds });
  });
});
