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
    // 2026-09-17：总数卡口径改为「在管总量（存活 − 已废弃）」，帮助文案随之由「总数 + 7 个状态」同步
    expect(help).toContain('在管总量 + 7 个状态');
  });
});

// 2026-09-17 新增：样品统计「存活 / 在管 / 已废弃」口径可见性锁定（纯静态源码断言，不写库）。
// 背景：/api/dashboard 的 total 与机型视图的 sample_count 都只排软删、**含 RETIRED（已废弃）**，
// 而 UI 标签未说明口径——用户要确认「某机种正式发行了多少个样品」时按「在用」读取，误判为多算。
// 实测（生产库只读）：存活 135 = 在管 109 + 已废弃 26，26 件全部集中在 BD7620D；
// 机型卡显示 86，而当时状态徽章只渲染 3 个流转态（合计 60），数字与徽章不可对账，放大了困惑。
// 修正：看板总数卡显示「在管总量 = 存活 − 已废弃」；机型视图补齐 RETIRED 徽章并标注「含已废弃 N」。
// 术语与 report.js（存活样品总量 / 在管总量）及 help-data.js 既有口径保持同一套，避免一词两义。
describe('样品统计口径可见性（前端源码）', () => {
  const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');

  it('看板总数卡 = 在管总量（存活 − 已废弃），已废弃数随标签显示', () => {
    const src = read('subsystems/samples/frontend/js/views/dashboard.js');
    expect(src).toContain("{ label: '在管总量', key: 'total'");
    expect(src).toContain("var retired = s['RETIRED'] || 0;");
    expect(src).toContain('var active = total - retired;');
    expect(src).toContain("'（已废弃 ' + retired + '）'");
  });

  it('机型视图徽章含 RETIRED，卡片数字标注含已废弃', () => {
    const src = read('subsystems/samples/frontend/js/views/model-wall.js');
    expect(src).toContain("['IN_CUSTODY', 'CHECKED_OUT', 'RETURNING', 'RETIRED']");
    expect(src).toContain("RETIRED: '已废弃'");
    expect(src).toContain('（含已废弃 ');
    expect(src).toContain('retiredTotal');
  });

  it('帮助文档口径与卡片一致；报表既有「在管总量」术语未被改坏', () => {
    const help = read('subsystems/samples/frontend/js/views/help-data.js');
    expect(help).toContain('在管总量 + 7 个状态');
    expect(help).toContain('各徽章之和 = 卡片上的样品数');
    expect(help).toContain('在管总量 = 存活总量 − 已作废');
    const rpt = read('subsystems/samples/frontend/js/views/report.js');
    expect(rpt).toContain("l: '在管总量'");
  });
});
