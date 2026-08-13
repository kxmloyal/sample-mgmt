// tests/fixture-batch.test.js — 治具批量新建（清单列表式）+ 保养周期透传
// fixtures 未上线可安全写入；测试自建数据 afterAll 清理（先删日志再删治具）
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');
// dotenv 必须先于 require('../db')：db.js 模块加载时捕获 DB_*（AGENTS.md §7.7），
// jest 收集阶段 describe 顶层已 require db，而 server.js 的 dotenv 加载在 getApp() 才触发
require('dotenv').config();

if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('治具批量新建', () => {
  let adminAgent;
  let createdIds = [];
  const D = require('../db');

  beforeAll(async () => {
    await getApp();
    ({ agent: adminAgent } = await login('admin', 'admin123'));
  }, 30000);

  afterAll(async () => {
    if (!createdIds.length) return;
    const placeholders = createdIds.map(() => '?').join(',');
    await D.pool().execute('DELETE FROM fixture_logs WHERE fixture_id IN (' + placeholders + ')', createdIds);
    await D.pool().execute('DELETE FROM fixtures WHERE id IN (' + placeholders + ')', createdIds);
  });

  describe('POST /api/fixtures/batch', () => {
    it('批量创建 N 条：编号连续、状态 REQUESTED、保养周期落库、CREATE 日志', async () => {
      const res = await adminAgent.post('/api/fixtures/batch').send({
        model: 'AGING-8',
        items: [
          { name: '批量测试治具A', spec: 'DC-12V', station: 'SMT1', category: '测试治具', maintenance_cycle_days: 45 },
          { name: '批量测试治具B', maintenance_cycle_days: 0 }
        ]
      });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      expect(res.body.fixtures.length).toBe(2);
      res.body.fixtures.forEach((f, i) => {
        expect(f.status).toBe('REQUESTED');
        expect(f.model).toBe('AGING-8');
        expect(f.fixture_no).toMatch(/^FJ-\d{6}$/);
        createdIds.push(f.id);
      });
      expect(res.body.fixtures[0].maintenance_cycle_days).toBe(45);
      expect(res.body.fixtures[1].maintenance_cycle_days).toBe(0);
      const logs = await D.pool().execute('SELECT COUNT(*) AS c FROM fixture_logs WHERE fixture_id = ? AND action = ?', [res.body.fixtures[0].id, 'CREATE']);
      expect(logs[0][0].c).toBe(1);
    });

    it('含空名称行 → 400 且无任何落库（事务回滚）', async () => {
      const before = await D.pool().execute('SELECT COUNT(*) AS c FROM fixtures');
      const totalBefore = before[0][0].c;
      const res = await adminAgent.post('/api/fixtures/batch').send({
        model: 'AGING-8',
        items: [{ name: '正常行' }, { name: '  ' }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('第 2 行');
      const after = await D.pool().execute('SELECT COUNT(*) AS c FROM fixtures');
      expect(after[0][0].c).toBe(totalBefore);
    });

    it('model 缺失 / items 空数组 / 超 50 条 → 400', async () => {
      const r1 = await adminAgent.post('/api/fixtures/batch').send({ items: [{ name: 'x' }] });
      expect(r1.status).toBe(400);
      const r2 = await adminAgent.post('/api/fixtures/batch').send({ model: 'AGING-8', items: [] });
      expect(r2.status).toBe(400);
      const r3 = await adminAgent.post('/api/fixtures/batch').send({ model: 'AGING-8', items: Array.from({ length: 51 }, () => ({ name: 'x' })) });
      expect(r3.status).toBe(400);
    });
  });

  describe('单条 POST /api/fixtures 保养周期透传（L1）', () => {
    it('带 maintenance_cycle_days → 落库生效', async () => {
      const res = await adminAgent.post('/api/fixtures').send({ name: '单条周期测试', model: 'AGING-8', maintenance_cycle_days: 30 });
      expect(res.status).toBe(200);
      expect(res.body.maintenance_cycle_days).toBe(30);
      createdIds.push(res.body.id);
    });

    it('不带 → 落库为 NULL（兼容旧行为）', async () => {
      const res = await adminAgent.post('/api/fixtures').send({ name: '单条无周期测试', model: 'AGING-8' });
      expect(res.status).toBe(200);
      expect(res.body.maintenance_cycle_days).toBeNull();
      createdIds.push(res.body.id);
    });
  });
});

}
