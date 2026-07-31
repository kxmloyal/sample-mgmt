const { getApp, login } = require('./helpers/setup');

beforeAll(async () => { await getApp(); });

describe('GET /api/dashboard — roleActions', () => {
  it('should return roleActions for ADMIN', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.roleActions)).toBe(true);
    expect(res.body.roleActions.length).toBeGreaterThan(0);
    expect(res.body.roleActions[0]).toHaveProperty('t');
    expect(res.body.roleActions[0]).toHaveProperty('h');
  });

  it('should return roleActions for RD with new+scan', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    var labels = res.body.roleActions.map(a => a.t);
    expect(labels).toContain('新建样品');
    expect(labels).toContain('扫码台');
  });

  it('should return roleActions for CUSTODY with only scan', async () => {
    const { agent } = await login('mfg01', 'mfg123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    var labels = res.body.roleActions.map(a => a.t);
    expect(labels).toEqual(['扫码台']);
  });
});
