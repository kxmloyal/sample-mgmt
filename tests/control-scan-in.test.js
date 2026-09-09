// tests/control-scan-in.test.js — 管制扫码入库（2026-09-09）
// 守卫：control 已上线（manifest deployed:true），按 AGENTS.md §20 跳过全部数据写入用例；
// 本文件保留：a) 纯函数权限判定单测（无 DB 写入，不受 §20 限制）b) 接口用例（上线解除/测试环境时自动启用）。
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { getApp } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

// ── 纯函数单测（无数据写入，任何环境可跑）──
describe('扫码入库权限判定 isWarehouseUser（纯函数）', () => {
  const mod = require('../subsystems/control/backend/routes-scan-in');
  test('仓库保管（CUSTODY + 资材部）→ 允许', () => {
    expect(mod.isWarehouseUser({ role: 'CUSTODY', roles: ['CUSTODY'], dept: '资材部' })).toBe(true);
  });
  test('仓库别名（CUSTODY + 仓库）→ 允许', () => {
    expect(mod.isWarehouseUser({ role: 'CUSTODY', roles: ['CUSTODY'], dept: '仓库' })).toBe(true);
  });
  test('非仓库部门保管（CUSTODY + 制造部）→ 拒绝', () => {
    expect(mod.isWarehouseUser({ role: 'CUSTODY', roles: ['CUSTODY'], dept: '制造部' })).toBe(false);
  });
  test('无部门保管 → 拒绝', () => {
    expect(mod.isWarehouseUser({ role: 'CUSTODY', roles: ['CUSTODY'], dept: '' })).toBe(false);
  });
  test('ADMIN 兜底 → 允许', () => {
    expect(mod.isWarehouseUser({ role: 'ADMIN', roles: ['ADMIN'], dept: '系统' })).toBe(true);
  });
  test('ME/QA/RD → 拒绝（扫码通道不放开）', () => {
    expect(mod.isWarehouseUser({ role: 'ME', roles: ['ME'], dept: '生技部' })).toBe(false);
    expect(mod.isWarehouseUser({ role: 'QA', roles: ['QA'], dept: '品保文管中心' })).toBe(false);
    expect(mod.isWarehouseUser({ role: 'RD', roles: ['RD'], dept: '研发部' })).toBe(false);
  });
});

// ── 接口用例（含数据写入：仅测试库；control 上线期间按 §20 自动跳过）──
if (isDeployed('control')) {
  describe.skip('管制已上线（deployed:true）——接口用例按 §20 跳过，仅保留上方纯函数单测', () => {
    it('占位', () => {});
  });
} else {
  let app, admin, custodyWh, custodyOther, me;

  async function makeUser(u) {
    const D = require('../db');
    if (!await D.getUserByUsername(u.username)) {
      await D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
    }
    const agent = request.agent(app);
    await agent.post('/api/login').send({ username: u.username, password: u.password });
    return agent;
  }

  beforeAll(async () => {
    app = await getApp();
    admin = await makeUser({ username: 'admin', password: 'admin123', role: 'ADMIN', dept: '系统', display_name: '系统管理员' });
    custodyWh = await makeUser({ username: 'wh01', password: 'wh123', role: 'CUSTODY', dept: '资材部', display_name: '仓库保管' });
    custodyOther = await makeUser({ username: 'mfg01', password: 'mfg123', role: 'CUSTODY', dept: '制造部', display_name: '制造保管' });
    me = await makeUser({ username: 'me01', password: 'me123', role: 'ME', dept: '生技部', display_name: '生技工程师' });
  }, 30000);

  test('lookup：未登录 → 401/302', async () => {
    const r = await request(app).post('/api/control/scan-in/lookup').send({ order_no: 'CTL-DEMO-001' });
    expect([401, 302]).toContain(r.status);
  });
  test('lookup：非仓库人员 → 403', async () => {
    expect((await me.post('/api/control/scan-in/lookup').send({ order_no: 'X' })).status).toBe(403);
    expect((await custodyOther.post('/api/control/scan-in/lookup').send({ order_no: 'X' })).status).toBe(403);
  });
  test('lookup：ADMIN 兜底可查，单号不存在 → 404', async () => {
    const r = await admin.post('/api/control/scan-in/lookup').send({ order_no: 'CTL-NOPE-404' });
    expect(r.status).toBe(404);
  });
  test('confirm：库位缺失 → 400（ADMIN 兜底路径）', async () => {
    const r = await admin.post('/api/control/scan-in').send({ order_no: 'CTL-NOPE-404', storage_location: '' });
    expect(r.status).toBe(400);
  });
  // 全链路入库用例（造单→lookup→confirm→状态/库位/留痕断言）在守卫解除后补充执行
  test('全链路：造单(已报工)→扫码入库→REIN_STOCK+库位+留痕', async () => {
    const D = require('../db');
    // createOrder 自身经 control_seqs 原子取号（order_no 无法外部指定），以返回值真实单号为准
    const created = await D.createOrder({
      part_no: 'P-SI', part_name: '扫码入库测试件', sales_no: 'S-SI', model: 'M-SI', qty: 10,
      bad_type: '外观', reason: '测试', applicant_id: 1,
      applicant_name: '系统管理员', apply_dept: '系统', apply_at: D.nowISO(), status: 'REWORK_REPORTED',
      good_qty: 10, ng_qty: 0, scrap_qty: 0, created_by: 1
    });
    const realNo = created.order_no;
    const lk = await custodyWh.post('/api/control/scan-in/lookup').send({ order_no: realNo });
    expect(lk.status).toBe(200);
    expect(lk.body.status).toBe('REWORK_REPORTED');
    const cf = await custodyWh.post('/api/control/scan-in').send({ order_no: realNo, storage_location: 'A-01-03' });
    expect(cf.status).toBe(200);
    expect(cf.body.status).toBe('REIN_STOCK');
    const back = await D.getOrderByNo(realNo);
    expect(back.status).toBe('REIN_STOCK');
    expect(back.storage_location).toBe('A-01-03');
    expect(back.in_stock_at).toBeTruthy();
    const logs = await D.listLogsByOrder(back.id);
    expect(logs.some(l => l.action === 'IN_STOCK' && String(l.comment || '').includes('扫码入库'))).toBe(true);
  });
  test('重复入库：已 REIN_STOCK 再扫 → 409', async () => {
    const D = require('../db');
    const created = await D.createOrder({
      part_no: 'P-SI2', part_name: '重复入库件', qty: 5, bad_type: '外观', reason: '测试',
      applicant_id: 1, applicant_name: '系统管理员', apply_dept: '系统', apply_at: D.nowISO(),
      status: 'REWORK_REPORTED', good_qty: 5, ng_qty: 0, scrap_qty: 0, created_by: 1
    });
    const realNo = created.order_no;
    const first = await custodyWh.post('/api/control/scan-in').send({ order_no: realNo, storage_location: 'B-02' });
    expect(first.status).toBe(200);
    const again = await custodyWh.post('/api/control/scan-in').send({ order_no: realNo, storage_location: 'B-02' });
    expect(again.status).toBe(409);
  });
}
