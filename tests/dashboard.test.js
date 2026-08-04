const { getApp, login } = require('./helpers/setup');

beforeAll(async () => { await getApp(); });

describe('GET /api/dashboard', () => {
  it('should return base stats for ADMIN', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.byStatus).toBeDefined();
    expect(typeof res.body.total).toBe('number');
    expect(Array.isArray(res.body.overdue)).toBe(true);
    expect(Array.isArray(res.body.dueSoon)).toBe(true);
    expect(Array.isArray(res.body.myPending)).toBe(true);
    expect(res.body.role).toBe('ADMIN');
    // 快捷操作已移除（2026-08-04），响应不再含 roleActions
    expect(res.body.roleActions).toBeUndefined();
  });

  it('should return dashboard for RD', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('RD');
    expect(typeof res.body.total).toBe('number');
  });

  it('should return dashboard for CUSTODY', async () => {
    const { agent } = await login('mfg01', 'mfg123');
    const res = await agent.get('/api/dashboard');
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('CUSTODY');
    expect(res.body.byStatus).toBeDefined();
  });
});
