// tests/samples-checkout-e2e.test.js — 样品领用/归还 E2E（2026-09-05，仅测试库 sample_mgmt_test）
// 全链路：建样→制作→发行→接收保管→领出→超时判定→归还，含角色权限与动态门校验
const request = require('supertest');
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');
const D = require('../db');

// samples 子系统 deployed:true（生产库受保护）；本套件所有读写均发生在 DB_NAME 指向的测试库
const deployedGuard = isDeployed('samples');

let createdSampleIds = [];
let createdModelId = null;
const E2E_MODEL = 'E2EM15';

async function ensureE2EModel() {
  // 测试库缺机型主数据会导致建样 400：用例内自建（RD 权限），afterAll 清理
  const rd = await login('rd01', 'rd123');
  const list = await rd.agent.get('/api/samples/models');
  const rows = Array.isArray(list.body) ? list.body : (list.body.models || []);
  const exist = rows.find(m => m.code === E2E_MODEL);
  if (exist) { createdModelId = exist.id; return; }
  const mc = await rd.agent.post('/api/samples/models').send({ code: E2E_MODEL, full_name: '领用E2E机型' });
  if (mc.status === 200) createdModelId = mc.body.id;
}

async function makeSampleToCustody(agentFactory) {
  await ensureE2EModel();
  // 研发建样
  const rd = await login('rd01', 'rd123');
  const created = await rd.agent.post('/api/samples').send({
    name: '领用E2E-自动清理', model: E2E_MODEL, station: '马达组', source_type: 'T'
  });
  if (created.status !== 201 && created.status !== 200) throw new Error('建样失败: ' + JSON.stringify(created.body));
  const s0 = created.body.sample || created.body;
  createdSampleIds.push(s0.id);
  // 研发制作完成（需照片 dataURL）
  const prod = await rd.agent.post('/api/scan').send({ code: s0.sample_no, action: 'PRODUCE', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' });
  if (prod.status !== 200) throw new Error('制作失败: ' + JSON.stringify(prod.body));
  // QA 发行（周期 30 天）
  const qa = await login('qa01', 'qa123');
  const rel = await qa.agent.post('/api/scan').send({ code: s0.sample_no, action: 'RELEASE', cycleDays: '30', sample_type: 'OK', limit_item: 'LIMIT-DEFAULT' });
  if (rel.status !== 200) throw new Error('发行失败: ' + JSON.stringify(rel.body));
  // 保管接收
  const mfg = await login('mfg01', 'mfg123');
  const cus = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'CUSTODY', location: 'E2E-储位-领用' });
  if (cus.status !== 200) throw new Error('接收保管失败: ' + JSON.stringify(cus.body));
  return s0;
}

// Jest 29 无 describe.skipIf：非测试库环境整组跳过（护栏兜底，正常运行恒为 describe）
const suite = (deployedGuard && process.env.DB_NAME !== 'sample_mgmt_test') ? describe.skip : describe;
suite('样品领用/归还 E2E（测试库）', () => {
  test('领出→超时→归还 全链路', async () => {
    const s0 = await makeSampleToCustody();
    const mfg = await login('mfg01', 'mfg123');

    // 1) 保管扫码可见动作：申请退回 + 领出（+ 临近复检窗口的复检动作由动态门控制）
    const r1 = await mfg.agent.get('/api/resolve?code=' + encodeURIComponent(s0.sample_no));
    expect(r1.status).toBe(200);
    expect(r1.body.allowedActions).toContain('CHECKOUT');
    expect(r1.body.allowedActions).toContain('RETURN_REQUEST');

    // 2) 领出（24 小时）
    const co = await mfg.agent.post('/api/scan').send({
      code: s0.sample_no, action: 'CHECKOUT', checkout_user: '李四', checkout_dept: '品质部', durationHours: 24, note: 'E2E 领出'
    });
    expect(co.status).toBe(200);
    expect(co.body.sample.status).toBe('CHECKED_OUT');
    expect(co.body.sample.checkout_user).toBe('李四');
    expect(co.body.sample.checkout_dept).toBe('品质部');
    expect(co.body.sample.expected_return_at).toBeTruthy();
    expect(co.body.sample.storage_location).toBe('E2E-储位-领用'); // 储位保留

    // 3) 领用中：保管角色动作仅剩归还入库（RETURN_REQUEST 状态机天然不可达）
    const r3 = await mfg.agent.get('/api/resolve?code=' + encodeURIComponent(s0.sample_no));
    expect(r3.body.allowedActions).toEqual(['RETURN_OUT']);
    // 试图直接申请退回 → 409（角色/状态不允许）
    const rr = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'RETURN_REQUEST', note: '应被拒绝' });
    expect(rr.status).toBe(409);

    // 4) 超时判定：直接把应还时间改到过去（测试库直改，仅本样品）
    const past = new Date(Date.now() - 3600000).toISOString();
    await D.pool().execute('UPDATE samples SET expected_return_at=? WHERE id=?', [past, s0.id]);
    // 看板出现逾期未归还清单
    const qa = await login('qa01', 'qa123');
    const dash = await qa.agent.get('/api/dashboard');
    expect(dash.status).toBe(200);
    const coOverdue = (dash.body.checkoutOverdue || []).find(x => x.id === s0.id);
    expect(coOverdue).toBeTruthy();
    expect(coOverdue.checkout_user).toBe('李四');

    // 5) 归还入库
    const ro = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'RETURN_OUT', note: 'E2E 归还' });
    expect(ro.status).toBe(200);
    expect(ro.body.sample.status).toBe('IN_CUSTODY');
    expect(ro.body.sample.returned_at).toBeTruthy();
    expect(ro.body.sample.checkout_user).toBeNull();
    expect(ro.body.sample.expected_return_at).toBeNull();
    expect(ro.body.sample.storage_location).toBe('E2E-储位-领用'); // 归还回原储位

    // 6) 归还后重新可见申请退回/领出
    const r6 = await mfg.agent.get('/api/resolve?code=' + encodeURIComponent(s0.sample_no));
    expect(r6.body.allowedActions).toContain('RETURN_REQUEST');
    expect(r6.body.allowedActions).toContain('CHECKOUT');
    // 看板逾期清单不再包含该样品
    const dash2 = await qa.agent.get('/api/dashboard');
    expect((dash2.body.checkoutOverdue || []).find(x => x.id === s0.id)).toBeUndefined();
  }, 60000);

  test('CHECKOUT 参数校验：缺领用人 400 / 时长越界 400 / 领出后重复领出 409', async () => {
    const s0 = await makeSampleToCustody();
    const mfg = await login('mfg01', 'mfg123');
    // 缺领用人
    const bad1 = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'CHECKOUT', durationHours: 24 });
    expect(bad1.status).toBe(400);
    // 时长越界
    const bad2 = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'CHECKOUT', checkout_user: '王五', durationHours: 99999 });
    expect(bad2.status).toBe(400);
    // 合法领出后，再次领出 → 409（状态机无 CHECKED_OUT→CHECKED_OUT 转移）
    const ok = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'CHECKOUT', checkout_user: '王五', durationHours: 2 });
    expect(ok.status).toBe(200);
    const dup = await mfg.agent.post('/api/scan').send({ code: s0.sample_no, action: 'CHECKOUT', checkout_user: '王五', durationHours: 2 });
    expect(dup.status).toBe(409);
  }, 60000);
});

afterAll(async () => {
  // 测试数据清理（仅测试库）：删除本套件创建的样品、日志与机型
  for (const id of createdSampleIds) {
    try { await D.pool().execute('DELETE FROM scan_logs WHERE sample_id=?', [id]); } catch (_) {}
    try { await D.pool().execute('DELETE FROM samples WHERE id=?', [id]); } catch (_) {}
  }
  if (createdModelId) {
    try { await D.pool().execute('DELETE FROM sample_models WHERE id=?', [createdModelId]); } catch (_) {}
  }
});
