// tests/fixtures-dormant.test.js — 呆滞治具功能（settings 权限 / 列表 dormant 筛选 / dashboard 呆滞字段）
// fixtures 未上线（deployed 未置 true），可安全运行；上线后按 AGENTS.md §20 自动跳过
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('呆滞治具功能', () => {
  let adminAgent, rdAgent;
  let origDays = 60;

  beforeAll(async () => {
    await getApp();
    // 生产库非 ADMIN 账号均停用（enabled=0），创建临时 RD 账号验证 403，afterAll 清理
    const bcrypt = require('bcryptjs');
    const D = require('../db');
    const exist = await D.getUserByUsername('dormant_rd');
    if (!exist) {
      await D.createUser({ username: 'dormant_rd', password_hash: bcrypt.hashSync('test123', 10), role: 'RD', dept: '研发部', display_name: '呆滞测试RD' });
    }
    ({ agent: adminAgent } = await login('admin', 'admin123'));
    ({ agent: rdAgent } = await login('dormant_rd', 'test123'));
    // 记录原阈值，测试后恢复
    const s = await adminAgent.get('/api/fixtures/settings');
    if (s.status === 200 && s.body.dormant_days) origDays = s.body.dormant_days;
  });

  afterAll(async () => {
    // 恢复原阈值 + 删除临时测试账号，避免影响其他测试
    await adminAgent.put('/api/fixtures/settings').send({ dormant_days: origDays });
    const D = require('../db');
    await D.pool().execute('DELETE FROM users WHERE username = ?', ['dormant_rd']);
  });

  describe('GET /api/fixtures/settings', () => {
    it('未登录应返回 401', async () => {
      const res = await require('supertest')(await getApp()).get('/api/fixtures/settings');
      expect(res.status).toBe(401);
    });

    it('登录用户应返回 dormant_days（默认 60）', async () => {
      const res = await adminAgent.get('/api/fixtures/settings');
      expect(res.status).toBe(200);
      expect(res.body.dormant_days).toBeGreaterThan(0);
    });
  });

  describe('PUT /api/fixtures/settings', () => {
    it('非 ADMIN 应返回 403', async () => {
      const res = await rdAgent.put('/api/fixtures/settings').send({ dormant_days: 90 });
      expect(res.status).toBe(403);
    });

    it('ADMIN 传非法阈值（0/366/空）应返回 400', async () => {
      const res1 = await adminAgent.put('/api/fixtures/settings').send({ dormant_days: 0 });
      expect(res1.status).toBe(400);
      const res2 = await adminAgent.put('/api/fixtures/settings').send({ dormant_days: 366 });
      expect(res2.status).toBe(400);
      const res3 = await adminAgent.put('/api/fixtures/settings').send({});
      expect(res3.status).toBe(400);
    });

    it('ADMIN 应成功修改阈值并回读一致', async () => {
      const res = await adminAgent.put('/api/fixtures/settings').send({ dormant_days: 30 });
      expect(res.status).toBe(200);
      expect(res.body.dormant_days).toBe(30);
      const back = await adminAgent.get('/api/fixtures/settings');
      expect(back.body.dormant_days).toBe(30);
    });
  });

  describe('GET /api/fixtures/dashboard 呆滞字段', () => {
    it('应返回 dormantCount / dormant[] / dormantDays', async () => {
      const res = await adminAgent.get('/api/fixtures/dashboard');
      expect(res.status).toBe(200);
      expect(typeof res.body.dormantCount).toBe('number');
      expect(Array.isArray(res.body.dormant)).toBe(true);
      expect(res.body.dormantDays).toBeGreaterThan(0);
    });

    it('dormant 条目应含 dormant_days / dormant_reason', async () => {
      const res = await adminAgent.get('/api/fixtures/dashboard');
      if (res.body.dormant.length > 0) {
        const f = res.body.dormant[0];
        expect(f.dormant_days).toBeGreaterThanOrEqual(res.body.dormantDays);
        expect(['在库无人领用', '状态长期停滞']).toContain(f.dormant_reason);
      }
    });
  });

  describe('GET /api/fixtures?dormant=1 列表筛选', () => {
    it('dormant=1 行数应与 dashboard.dormantCount 一致且带呆滞字段', async () => {
      const dash = await adminAgent.get('/api/fixtures/dashboard');
      const list = await adminAgent.get('/api/fixtures?dormant=1&limit=200');
      expect(list.status).toBe(200);
      expect(list.body.total).toBe(dash.body.dormantCount);
      if (list.body.fixtures.length > 0) {
        expect(list.body.fixtures[0].dormant_days).toBeGreaterThanOrEqual(0);
        expect(list.body.fixtures[0].dormant_reason).toBeTruthy();
      }
    });

    it('dormant=1 与无筛选互斥：总列表数应 >= 呆滞数', async () => {
      const all = await adminAgent.get('/api/fixtures?limit=200');
      const dor = await adminAgent.get('/api/fixtures?dormant=1&limit=200');
      expect(all.body.total).toBeGreaterThanOrEqual(dor.body.total);
    });
  });
});

}
