const { getApp, login } = require('./helpers/setup');
const request = require('supertest');

beforeAll(async () => { await getApp(); });

describe('POST /api/login', () => {
  it('should login with correct credentials', async () => {
    const res = await request(await getApp())
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBeDefined();
    expect(res.body.role).toBe('ADMIN');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should reject wrong password', async () => {
    const res = await request(await getApp())
      .post('/api/login')
      .send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it('should reject empty credentials', async () => {
    const res = await request(await getApp())
      .post('/api/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /api/me', () => {
  it('should reject unauthenticated request', async () => {
    const res = await request(await getApp()).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('should return user info when authenticated', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/me');
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('ADMIN');
  });
});

describe('POST /api/logout', () => {
  it('should invalidate session after logout', async () => {
    const { agent } = await login('admin', 'admin123');
    await agent.post('/api/logout');
    const res = await agent.get('/api/me');
    expect(res.status).toBe(401);
  });
});
