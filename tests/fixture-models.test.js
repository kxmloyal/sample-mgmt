// tests/fixture-models.test.js — 治具机型主数据接口（复用 sample_models 表）
// fixtures 未上线（deployed 未置 true）可安全写入；测试自建临时账号与机型，afterAll 清理
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('治具机型主数据', () => {
  let adminAgent, rdAgent, qaAgent;
  let tempModelIds = [];

  beforeAll(async () => {
    await getApp();
    // 生产库非 ADMIN 账号均停用，创建临时账号（RD 用于权限测试，QA 用于 403 验证）
    const bcrypt = require('bcryptjs');
    const D = require('../db');
    for (const [u, role, dept] of [['dorm_rd', 'RD', '研发部'], ['dorm_qa', 'QA', '品保文管中心']]) {
      if (!(await D.getUserByUsername(u))) {
        await D.createUser({ username: u, password_hash: bcrypt.hashSync('test123', 10), role: role, dept: dept, display_name: '机型测试' + role });
      }
    }
    ({ agent: adminAgent } = await login('admin', 'admin123'));
    ({ agent: rdAgent } = await login('dorm_rd', 'test123'));
    ({ agent: qaAgent } = await login('dorm_qa', 'test123'));
  }, 30000);

  afterAll(async () => {
    const D = require('../db');
    for (const id of tempModelIds) {
      await D.pool().execute('DELETE FROM sample_models WHERE id = ?', [id]);
    }
    await D.pool().execute('DELETE FROM users WHERE username IN (?, ?)', ['dorm_rd', 'dorm_qa']);
  }, 30000);

  describe('GET /api/fixtures/models', () => {
    it('登录用户可读，返回含治具计数的机型列表', async () => {
      const res = await adminAgent.get('/api/fixtures/models');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const m of res.body) {
        expect(typeof m.code).toBe('string');
        expect(typeof m.full_name).toBe('string');
        expect(typeof m.fixture_count).toBe('number');
      }
    });
  });

  describe('POST /api/fixtures/models（新建机型）', () => {
    it('非 RD/ADMIN 应返回 403', async () => {
      const res = await qaAgent.post('/api/fixtures/models').send({ code: 'TEST123', full_name: '测试机型' });
      expect(res.status).toBe(403);
    });

    it('RD 创建成功并返回机型', async () => {
      const res = await rdAgent.post('/api/fixtures/models').send({ code: 'TEST001', full_name: '测试治具机型壹' });
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('TEST001');
      tempModelIds.push(res.body.id);
    });

    it('code 重复应返回 409', async () => {
      const res = await adminAgent.post('/api/fixtures/models').send({ code: 'TEST001', full_name: '不同全称' });
      expect(res.status).toBe(409);
    });

    it('code 含非法字符（<6 位或非字母数字）应返回 400', async () => {
      const res1 = await adminAgent.post('/api/fixtures/models').send({ code: 'A', full_name: '过短' });
      expect(res1.status).toBe(400);
      const res2 = await adminAgent.post('/api/fixtures/models').send({ code: 'ABC 123', full_name: '含空格' });
      expect(res2.status).toBe(400);
    });
  });

  describe('PUT /api/fixtures/models/:id（编辑）', () => {
    it('非 RD/ADMIN 应返回 403', async () => {
      const res = await qaAgent.put('/api/fixtures/models/' + tempModelIds[0]).send({ full_name: '篡改' });
      expect(res.status).toBe(403);
    });

    it('RD 可改 full_name，code 改动被忽略', async () => {
      const res = await rdAgent.put('/api/fixtures/models/' + tempModelIds[0]).send({ full_name: '测试治具机型壹改', code: 'HACKED' });
      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe('测试治具机型壹改');
      expect(res.body.code).toBe('TEST001');
    });

    it('不存在的 id 应返回 404', async () => {
      const res = await adminAgent.put('/api/fixtures/models/999999').send({ full_name: '不存在' });
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/fixtures?model=X 筛选', () => {
    it('model 筛选只返回该机型治具，且不筛选时全量更多', async () => {
      const all = await adminAgent.get('/api/fixtures?limit=200');
      const m = await adminAgent.get('/api/fixtures?model=TEST001&limit=200');
      expect(m.status).toBe(200);
      expect(Array.isArray(m.body.fixtures)).toBe(true);
      for (const f of m.body.fixtures) expect(f.model).toBe('TEST001');
      expect(all.body.total).toBeGreaterThanOrEqual(m.body.total);
    });
  });
});

}
