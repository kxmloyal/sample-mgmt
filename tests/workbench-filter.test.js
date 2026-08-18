// tests/workbench-filter.test.js — /api/workbench 服务端筛选/统计/分页 + buildWorkbenchSQL 单测
const request = require('supertest');
const { getApp, login } = require('./helpers/setup');
const { buildWorkbenchSQL } = require('../subsystems/workbench/db/workbench-queries');

let app, agent;

beforeAll(async () => {
  app = await getApp();
  agent = request.agent(app);
  const res = await agent.post('/api/login').send({ username: 'admin', password: 'admin123' });
  expect(res.status).toBe(200);
}, 30000);

describe('buildWorkbenchSQL 单测', () => {
  test('无筛选 → 无 WHERE 无参数', () => {
    const { sql, params } = buildWorkbenchSQL({});
    expect(sql).not.toMatch(/ WHERE /);
    expect(params).toEqual([]);
  });
  test('type+keyword → WHERE 拼接 + 参数化（LIKE 带 %）', () => {
    const { sql, params } = buildWorkbenchSQL({ type: 'sample', keyword: 'ABC' });
    expect(sql).toMatch(/item_type = \?/);
    expect(sql).toMatch(/\(item_no LIKE \? OR name LIKE \?\)/);
    expect(params).toEqual(['sample', '%ABC%', '%ABC%']);
  });
  test('dormant → 无参数条件', () => {
    const { sql, params } = buildWorkbenchSQL({ dormant: '1' });
    expect(sql).toMatch(/dormant_days IS NOT NULL/);
    expect(params).toEqual([]);
  });
  test('min/max_hours → 范围条件', () => {
    const { sql, params } = buildWorkbenchSQL({ min_hours: 10, max_hours: 100 });
    expect(params).toEqual([10, 100]);
  });
});

describe('GET /api/workbench 服务端筛选', () => {
  test('未登录 401', async () => {
    const res = await request(app).get('/api/workbench');
    expect(res.status).toBe(401);
  });
  test('默认返回分页结构 + summary/deptStats', async () => {
    const res = await agent.get('/api/workbench');
    expect(res.status).toBe(200);
    const b = res.body;
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe('number');
    expect(typeof b.summary).toBe('object');
    expect(Array.isArray(b.deptStats)).toBe(true);
    expect(b.summary.total).toBe(b.total);
    if (b.items.length) {
      expect(typeof b.items[0].overdue_level).toBe('number');
      expect(typeof b.items[0].overdue_reason).toBe('string');
    }
  });
  test('type=sample 全部为样品', async () => {
    const res = await agent.get('/api/workbench?type=sample');
    expect(res.status).toBe(200);
    res.body.items.forEach((it) => expect(it.item_type).toBe('sample'));
  });
  test('level=2 全部为最高积压档', async () => {
    const res = await agent.get('/api/workbench?level=2');
    expect(res.status).toBe(200);
    res.body.items.forEach((it) => expect(it.overdue_level).toBe(2));
  });
  test('dormant=1 全部为呆滞治具', async () => {
    const res = await agent.get('/api/workbench?dormant=1');
    expect(res.status).toBe(200);
    res.body.items.forEach((it) => expect(it.dormant_days).not.toBeNull());
  });
  test('keyword 过滤编号', async () => {
    const all = await agent.get('/api/workbench');
    if (!all.body.items.length) return; // 无活跃数据跳过
    const no = all.body.items[0].item_no.slice(0, 4);
    const res = await agent.get('/api/workbench?keyword=' + encodeURIComponent(no));
    res.body.items.forEach((it) => {
      expect(it.item_no.indexOf(no) >= 0 || it.name.indexOf(no) >= 0).toBe(true);
    });
  });
  test('分页 offset 正确 + limit 钳制 ≤500', async () => {
    const res = await agent.get('/api/workbench?limit=99999&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(500);
    const res2 = await agent.get('/api/workbench?limit=10&offset=5');
    expect(res2.body.offset).toBe(5);
    expect(res2.body.items.length).toBeLessThanOrEqual(10);
  });
  test('非法 level 参数 → 400', async () => {
    const res = await agent.get('/api/workbench?level=9');
    expect(res.status).toBe(400);
  });
});
