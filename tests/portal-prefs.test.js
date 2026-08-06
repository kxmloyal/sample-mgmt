// tests/portal-prefs.test.js — 门户卡片排序偏好 API（框架级，不受子系统上线保护限制）
const request = require('supertest');
const { getApp, login } = require('./helpers/setup');

describe('GET/PUT /api/portal/prefs — 门户卡片排序偏好', () => {
  beforeAll(async () => { await getApp(); }, 30000);

  it('未登录 GET 返回 401', async () => {
    const res = await request(await getApp()).get('/api/portal/prefs');
    expect(res.status).toBe(401);
  });

  it('未登录 PUT 返回 401', async () => {
    const res = await request(await getApp()).put('/api/portal/prefs').send({ order: ['samples'] });
    expect(res.status).toBe(401);
  });

  it('GET 无记录返回空数组', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/portal/prefs');
    expect(res.status).toBe(200);
    expect(res.body.order).toEqual([]);
  });

  it('PUT 保存后 GET 返回一致顺序', async () => {
    const { agent } = await login('rd01', 'rd123');
    const order = ['workbench', 'fixtures', 'samples', 'projects'];
    const put = await agent.put('/api/portal/prefs').send({ order });
    expect(put.status).toBe(200);
    expect(put.body.order).toEqual(order);
    const get = await agent.get('/api/portal/prefs');
    expect(get.body.order).toEqual(order);
  });

  it('PUT 非法 id（未注册子系统）返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/portal/prefs').send({ order: ['not-exist-subsystem'] });
    expect(res.status).toBe(400);
  });

  it('PUT 重复 id 去重（保序）', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/portal/prefs').send({ order: ['samples', 'samples', 'fixtures'] });
    expect(res.status).toBe(200);
    expect(res.body.order).toEqual(['samples', 'fixtures']);
  });

  it('PUT 空数组清除偏好', async () => {
    const { agent } = await login('rd01', 'rd123');
    await agent.put('/api/portal/prefs').send({ order: ['samples', 'fixtures'] });
    const res = await agent.put('/api/portal/prefs').send({ order: [] });
    expect(res.status).toBe(200);
    const get = await agent.get('/api/portal/prefs');
    expect(get.body.order).toEqual([]);
  });

  it('PUT order=null 清除偏好', async () => {
    const { agent } = await login('qa01', 'qa123');
    await agent.put('/api/portal/prefs').send({ order: ['samples'] });
    const res = await agent.put('/api/portal/prefs').send({ order: null });
    expect(res.status).toBe(200);
    const get = await agent.get('/api/portal/prefs');
    expect(get.body.order).toEqual([]);
  });

  it('用户 A 与用户 B 偏好隔离', async () => {
    const { agent: a } = await login('rd01', 'rd123');
    const { agent: b } = await login('qa01', 'qa123');
    await a.put('/api/portal/prefs').send({ order: ['fixtures', 'samples'] });
    await b.put('/api/portal/prefs').send({ order: ['projects'] });
    const ga = await a.get('/api/portal/prefs');
    const gb = await b.get('/api/portal/prefs');
    expect(ga.body.order).toEqual(['fixtures', 'samples']);
    expect(gb.body.order).toEqual(['projects']);
  });

  it('PUT 非数组返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/portal/prefs').send({ order: 'samples' });
    expect(res.status).toBe(400);
  });
});
