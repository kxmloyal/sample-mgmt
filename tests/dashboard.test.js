const { getApp, login } = require('./helpers/setup');
const fs = require('fs');
const path = require('path');

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

// 2026-09-10 新增：看板卡片文案语义锁定（纯静态源码断言，不写库）。
// 背景：RELEASED 卡统计的是「当前状态仍为已发行」= 已发行但保管部尚未接收的待办滞留量，
// 与「累计发行量」不是一回事（实测同日：累计曾发行 released_at 非空 61 件，该卡显示 31 件），
// 故卡片与比例条图例统一改称「已发行·待接收」；状态名场景（列表筛选/导出）保持「已发行」。
describe('看板卡片文案（前端源码）', () => {
  const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
  it('RELEASED 卡片与比例条图例统一为「已发行·待接收」', () => {
    const src = read('subsystems/samples/frontend/js/views/dashboard.js');
    expect(src).toContain("{ label: '已发行·待接收', key: 'RELEASED'");
    expect(src).toContain("RELEASED: '已发行·待接收'");
  });
  it('状态名场景仍是「已发行」：列表筛选不改；帮助文案与实际卡片数一致', () => {
    expect(read('subsystems/samples/frontend/js/views/list-filter.js')).toContain("RELEASED: '已发行'");
    const help = read('subsystems/samples/frontend/js/views/help-data.js');
    expect(help).toContain('RELEASED=已发行·待接收');
    expect(help).toContain('总数 + 7 个状态'); // 原写「6个状态卡片」与实际 8 张卡不符，已同步
  });
});
