// tests/fixtures-export.test.js — GET /api/fixtures/export 导出接口（只读验证）
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

// 治具子系统上线保护：deployed:true 时跳过（AGENTS.md §20）；导出为只读接口，实际始终可安全运行
if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('GET /api/fixtures/export', () => {
  let adminAgent;

  beforeAll(async () => {
    await getApp();
    ({ agent: adminAgent } = await login('admin', 'admin123'));
  }, 30000);

  it('should reject unauthenticated', async () => {
    const res = await require('supertest')(await getApp()).get('/api/fixtures/export');
    expect(res.status).toBe(401);
  });

  it('should return CSV with BOM, Chinese header and status mapping', async () => {
    const res = await adminAgent.get('/api/fixtures/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    const text = res.text;
    expect(text.startsWith('\uFEFF')).toBe(true);
    const lines = text.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toContain('编号');
    expect(lines[0]).toContain('归还状态');
    expect(lines[0]).toContain('保养状态');
  });

  it('should export same count as unfiltered list total (full export)', async () => {
    const exp = await adminAgent.get('/api/fixtures/export');
    const dataLines = exp.text.replace('\uFEFF', '').split('\r\n').slice(1).filter(l => l.trim());
    const list = await adminAgent.get('/api/fixtures');
    expect(dataLines.length).toBe(list.body.total);
  });

  it('should respect status filter', async () => {
    const res = await adminAgent.get('/api/fixtures/export?status=IN_USE');
    const lines = res.text.replace('\uFEFF', '').split('\r\n').slice(1).filter(l => l.trim());
    const list = await adminAgent.get('/api/fixtures?status=IN_USE');
    expect(lines.length).toBe(list.body.total);
  });
});

}
