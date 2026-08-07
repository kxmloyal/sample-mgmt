const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

// 样品子系统已上线（manifest deployed:true）：按 AGENTS.md §20 保护规则跳过全部测试（禁止数据注入）
if (isDeployed('samples')) {
  describe.skip('样品子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过全部测试', () => {}); });
} else {

beforeAll(async () => { await getApp(); });

const R = 'M' + Date.now().toString(36).toUpperCase(); // 随机后缀，保证重复跑幂等

describe('GET /api/samples/models', () => {
  it('should list models as any login role', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent.get('/api/samples/models');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /api/samples/models', () => {
  it('should create model as RD', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples/models').send({ code: R + '01', full_name: R + ' 低噪马达' });
    expect(res.status).toBe(200);
    expect(res.body.code).toBe(R + '01');
  });

  it('should reject code shorter than 6', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples/models').send({ code: 'AB1', full_name: 'x' });
    expect(res.status).toBe(400);
  });

  it('should reject code with illegal characters', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples/models').send({ code: 'ABC-123', full_name: 'x' });
    expect(res.status).toBe(400);
  });

  it('should reject duplicate code or full_name', async () => {
    const { agent } = await login('rd01', 'rd123');
    await agent.post('/api/samples/models').send({ code: R + '02', full_name: R + ' 重复A' });
    const dupCode = await agent.post('/api/samples/models').send({ code: R + '02', full_name: R + ' 重复B' });
    expect(dupCode.status).toBe(409);
    const dupName = await agent.post('/api/samples/models').send({ code: R + '03', full_name: R + ' 重复A' });
    expect(dupName.status).toBe(409);
  });

  it('should reject POST by non-RD/ADMIN', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent.post('/api/samples/models').send({ code: R + '04', full_name: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/samples/models/:id', () => {
  it('should delete unused model', async () => {
    const { agent } = await login('rd01', 'rd123');
    const created = await agent.post('/api/samples/models').send({ code: R + '05', full_name: '待删机型 ' + R });
    const res = await agent.delete('/api/samples/models/' + created.body.id);
    expect(res.status).toBe(200);
  });

  it('should reject delete of referenced model', async () => {
    const { agent } = await login('rd01', 'rd123');
    const created = await agent.post('/api/samples/models').send({ code: R + '06', full_name: '被引用机型 ' + R });
    await agent.post('/api/samples').send({ name: '引用样品' + R, spec: 'S', model: R + '06', station: '马达组', source_type: 'T' });
    const res = await agent.delete('/api/samples/models/' + created.body.id);
    expect(res.status).toBe(409);
  });
});

describe('GET /api/samples?model=', () => {
  it('should filter samples by model', async () => {
    const { agent } = await login('rd01', 'rd123');
    await agent.post('/api/samples/models').send({ code: R + '07', full_name: '筛选机型 ' + R });
    await agent.post('/api/samples').send({ name: '机型A样品' + R, spec: 'S', model: R + '07', station: '马达组', source_type: 'T' });
    const res = await agent.get('/api/samples?model=' + R + '07');
    expect(res.status).toBe(200);
    expect(res.body.samples.length).toBeGreaterThan(0);
    res.body.samples.forEach(function (s) { expect(s.model).toBe(R + '07'); });
  });
});
}
