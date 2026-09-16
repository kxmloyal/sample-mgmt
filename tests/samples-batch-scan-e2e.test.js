// tests/samples-batch-scan-e2e.test.js — 批量领用/归还 全链路（2026-09-16，仅测试库 sample_mgmt_test）
// 覆盖：两阶段全或无(B3) / 批量领出与归还(B1,B2) / 与单件同口径(B5) / 上限与去重(B8) /
//       幂等 BATCH_DUPLICATE(B10) / CAS 并发拒绝(B11) / 角色不允许(B7) / 单件通道兼容增量(B9)
// samples 子系统 deployed:true（生产库受保护）：本套件所有读写均发生在 DB_NAME 指向的测试库；
// 非测试库环境下整组跳过（与 samples-checkout-e2e.test.js 同一护栏写法）。
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');
const D = require('../db');

const deployedGuard = isDeployed('samples');
const suite = (deployedGuard && process.env.DB_NAME !== 'sample_mgmt_test') ? describe.skip : describe;
const E2E_MODEL = 'BTCH15';
let createdIds = [];
let createdModelId = null;

async function ensureModel() {
  const rd = await login('rd01', 'rd123');
  const list = await rd.agent.get('/api/samples/models');
  const rows = Array.isArray(list.body) ? list.body : (list.body.models || []);
  const exist = rows.find(m => m.code === E2E_MODEL);
  if (exist) { createdModelId = exist.id; return; }
  const mc = await rd.agent.post('/api/samples/models').send({ code: E2E_MODEL, full_name: '批量E2E机型' });
  if (mc.status === 200) createdModelId = mc.body.id;
}

// 直接在测试库造「保管中」样品：本套件只关心批量通道，不必走完 4 步扫码链路（省时且与既有 e2e 同思路）
async function makeCustody(n, tag) {
  await ensureModel();
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = await D.createSample({ name: '批量E2E-' + tag, model: E2E_MODEL, station: '马达组', source_type: 'T', created_by: 1 });
    await D.pool().execute("UPDATE samples SET status='IN_CUSTODY', custody_dept='制造部', storage_location='E2E-批量储位', next_inspect_at=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY) WHERE id=?", [s.id]);
    createdIds.push(s.id);
    out.push(await D.getSampleById(s.id));
  }
  return out;
}

async function logCount(id) {
  const [rows] = await D.pool().execute('SELECT COUNT(*) AS c FROM scan_logs WHERE sample_id=?', [id]);
  return rows[0].c;
}
const newBatchId = tag => 'b' + tag + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const suffix = id => ' [batch:' + id + ']';

suite('批量领用/归还（测试库）', () => {
  test('B3/B7 预校验全或无：状态不合法或角色无权 → 422 整批零执行', async () => {
    const [a, b, c] = await makeCustody(3, 'B3');
    const mfg = await login('mfg01', 'mfg123');
    // 先把 c 单独领出，使 CHECKOUT 的前置状态不成立
    const co = await mfg.agent.post('/api/scan').send({ code: c.sample_no, action: 'CHECKOUT', checkout_user: '先领出', durationHours: 4 });
    expect(co.status).toBe(200);
    const before = [await logCount(a.id), await logCount(b.id)];
    const res = await mfg.agent.post('/api/samples/batch-action').send({
      action: 'CHECKOUT', codes: [a.sample_no, b.sample_no, c.sample_no],
      batchId: newBatchId('b3'), checkout_user: '批量甲', durationHours: 24
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PRECHECK_FAILED');
    expect(res.body.executed).toBe(0);
    expect(res.body.rejected.length).toBe(1);
    expect(res.body.rejected[0].code).toBe(c.sample_no);
    expect(res.body.rejected[0].code_).toBe('ACTION_NOT_ALLOWED');
    expect(res.body.rejected[0].status).toBe('CHECKED_OUT');
    // 零副作用：合格的两件未被顺带执行
    expect((await D.getSampleById(a.id)).status).toBe('IN_CUSTODY');
    expect((await D.getSampleById(b.id)).status).toBe('IN_CUSTODY');
    expect([await logCount(a.id), await logCount(b.id)]).toEqual(before);

    // B7 角色不允许：QA 对 IN_CUSTODY 样品无 CHECKOUT 权限 → 同样整批零执行
    const qa = await login('qa01', 'qa123');
    const r2 = await qa.agent.post('/api/samples/batch-action').send({
      action: 'CHECKOUT', codes: [a.sample_no], batchId: newBatchId('b7'), checkout_user: '批量乙', durationHours: 24
    });
    expect(r2.status).toBe(422);
    expect(r2.body.executed).toBe(0);
    expect(r2.body.rejected[0].code_).toBe('ACTION_NOT_ALLOWED');
    expect(r2.body.rejected[0].reason).toContain('QA');
    expect((await D.getSampleById(a.id)).status).toBe('IN_CUSTODY');
    expect(await logCount(a.id)).toBe(before[0]);
  }, 90000);

  test('B1/B2/B5 批量领出与归还：公共项整批统一，日志 note 与单件逐字段同口径', async () => {
    const [a, b] = await makeCustody(2, 'B1');
    const mfg = await login('mfg01', 'mfg123');
    const bid = newBatchId('co');
    const res = await mfg.agent.post('/api/samples/batch-action').send({
      action: 'CHECKOUT', codes: [a.sample_no, b.sample_no], batchId: bid,
      checkout_user: '批量领用人', checkout_dept: '批量部', durationHours: 24, note: '批量备注'
    });
    expect(res.status).toBe(200);
    expect(res.body.executed).toBe(2);
    expect(res.body.ok.length).toBe(2);
    expect(res.body.failed).toEqual([]);
    expect(typeof res.body.probeMs).toBe('number');
    const dues = [];
    for (const no of [a.sample_no, b.sample_no]) {
      const row = await D.getSampleByNo(no);
      expect(row.status).toBe('CHECKED_OUT');
      expect(row.checkout_user).toBe('批量领用人');   // Q2：统一领用人
      expect(row.checkout_dept).toBe('批量部');
      expect(row.checkout_note).toBe('批量备注');
      expect(row.storage_location).toBe('E2E-批量储位'); // 领出不释放储位
      dues.push(new Date(row.expected_return_at).getTime());
      const log = (await D.listLogsBySample(row.id)).find(l => l.action === 'CHECKOUT');
      expect(log.note.endsWith(suffix(bid))).toBe(true);
      // 去后缀后必须与单件路径的拼接模板逐字符相同（防两条路径文案漂移）
      expect(log.note.slice(0, -suffix(bid).length))
        .toBe('样品领出：领用人 批量领用人（批量部），领用 24 小时，应还 ' + row.expected_return_at + '，备注：批量备注');
    }
    expect(Math.abs(dues[0] - dues[1])).toBeLessThanOrEqual(1000); // Q2：同一批同一时刻起算

    const bid2 = newBatchId('rt');
    const ret = await mfg.agent.post('/api/samples/batch-action').send({
      action: 'RETURN_OUT', codes: [a.sample_no, b.sample_no], batchId: bid2, note: '批量归还'
    });
    expect(ret.status).toBe(200);
    expect(ret.body.executed).toBe(2);
    for (const no of [a.sample_no, b.sample_no]) {
      const row = await D.getSampleByNo(no);
      expect(row.status).toBe('IN_CUSTODY');
      expect(row.checkout_user).toBeNull();
      expect(row.checkout_dept).toBeNull();
      expect(row.expected_return_at).toBeNull();
      expect(row.storage_location).toBe('E2E-批量储位'); // 归还回原储位
      const log = (await D.listLogsBySample(row.id)).find(l => l.action === 'RETURN_OUT');
      expect(log.note.endsWith(suffix(bid2))).toBe(true);
      expect(log.note).toContain('备注：批量归还');
    }
  }, 90000);

  test('B8 上限 50 与批次内去重：第 51 件 400；重复编号只执行首件', async () => {
    const [a, b] = await makeCustody(2, 'B8');
    const mfg = await login('mfg01', 'mfg123');
    const over = await mfg.agent.post('/api/samples/batch-action').send({
      action: 'CHECKOUT', codes: new Array(51).fill(a.sample_no), batchId: newBatchId('ov'), checkout_user: 'X', durationHours: 1
    });
    expect(over.status).toBe(400);
    expect(over.body.error).toContain('单批最多 50 件');
    const res = await mfg.agent.post('/api/samples/batch-action').send({
      action: 'CHECKOUT', codes: [a.sample_no, a.sample_no, b.sample_no], batchId: newBatchId('dd'), checkout_user: '去重甲', durationHours: 3
    });
    expect(res.status).toBe(200);
    expect(res.body.executed).toBe(2);
    expect(res.body.skipped.length).toBe(1);
    expect(res.body.skipped[0].code).toBe(a.sample_no);
    expect(await logCount(a.id)).toBe(1); // 首件为准，不会领出两次
    expect((await D.getSampleById(a.id)).status).toBe('CHECKED_OUT');
  }, 90000);

  test('B10 同 batchId 重复提交 → 409 BATCH_DUPLICATE，scan_logs 与状态零变化', async () => {
    const [a, b] = await makeCustody(2, 'B10');
    const mfg = await login('mfg01', 'mfg123');
    const bid = newBatchId('idem');
    const payload = { action: 'CHECKOUT', codes: [a.sample_no, b.sample_no], batchId: bid, checkout_user: '幂等甲', durationHours: 8 };
    const first = await mfg.agent.post('/api/samples/batch-action').send(payload);
    expect(first.status).toBe(200);
    const logs1 = [await logCount(a.id), await logCount(b.id)];
    const due1 = (await D.getSampleById(a.id)).expected_return_at;
    const second = await mfg.agent.post('/api/samples/batch-action').send(payload);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('BATCH_DUPLICATE');
    expect(second.body.executed).toBe(0);
    expect(second.body.applied.slice().sort()).toEqual([a.sample_no, b.sample_no].slice().sort());
    expect(typeof second.body.probeMs).toBe('number');
    expect([await logCount(a.id), await logCount(b.id)]).toEqual(logs1);
    // 未二次领出：应还时间仍是第一次的值（若被重复执行会被刷新 +8h）
    expect((await D.getSampleById(a.id)).expected_return_at).toBe(due1);
  }, 90000);

  test('B11 预校验后、执行前版本被他人推进 → 该件 CAS 拒绝并明确回 VERSION_CONFLICT（无静默覆盖）', async () => {
    const [a] = await makeCustody(1, 'B11');
    const mfg = await login('mfg01', 'mfg123');
    const real = D.getSampleByNo.bind(D);
    let calls = 0;
    const spy = jest.spyOn(D, 'getSampleByNo').mockImplementation(async no => {
      const row = await real(no);
      calls++;
      // 第 1 次 = 阶段 1 预校验；第 2 次 = 阶段 2 执行前重读。
      // 在重读「返回快照之后」立刻推进版本，使快照版本过期（确定性模拟并发写入抢占）
      if (calls === 2) await D.pool().execute('UPDATE samples SET version=version+1 WHERE id=?', [row.id]);
      return row;
    });
    try {
      const res = await mfg.agent.post('/api/samples/batch-action').send({
        action: 'CHECKOUT', codes: [a.sample_no], batchId: newBatchId('cas'), checkout_user: '并发甲', durationHours: 5
      });
      expect(res.status).toBe(200);
      expect(res.body.executed).toBe(1);
      expect(res.body.ok).toEqual([]);
      expect(res.body.failed.length).toBe(1);
      expect(res.body.failed[0].code_).toBe('VERSION_CONFLICT');
      expect(res.body.failed[0].retryable).toBe(true);
      expect(res.body.failed[0].reason).toContain('刷新');
    } finally { spy.mockRestore(); }
    const row = await D.getSampleById(a.id);
    expect(row.status).toBe('IN_CUSTODY'); // 未被静默覆盖
    expect(row.checkout_user).toBeNull();
    expect(await logCount(a.id)).toBe(0);  // 也未被覆盖写日志
  }, 90000);

  test('batch-resolve 只读预校验：逐件回 allowedActions，未知编号不致命，全程零副作用', async () => {
    const [a, b] = await makeCustody(2, 'RS');
    const mfg = await login('mfg01', 'mfg123');
    const before = [await logCount(a.id), await logCount(b.id)];
    const res = await mfg.agent.post('/api/samples/batch-resolve').send({
      codes: [a.sample_no, b.sample_no, 'SM-999999'], action: 'CHECKOUT'
    });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(3);
    const ok = res.body.items.filter(x => x.ok);
    expect(ok.length).toBe(2);
    ok.forEach(x => {
      expect(x.allowedActions).toContain('CHECKOUT');
      expect(x.allowedActions).toContain('RETURN_REQUEST');
      expect(x.reason).toBeNull();
    });
    const miss = res.body.items.find(x => x.code === 'SM-999999');
    expect(miss.ok).toBe(false);
    expect(miss.reason).toBe('未找到对应样品');
    expect((await D.getSampleById(a.id)).status).toBe('IN_CUSTODY');
    expect([await logCount(a.id), await logCount(b.id)]).toEqual(before);
    // 超限 400
    const over = await mfg.agent.post('/api/samples/batch-resolve').send({ codes: new Array(51).fill(a.sample_no) });
    expect(over.status).toBe(400);
  }, 90000);

  test('B9 单件扫码台兼容增量：409 仍带原 error/sample，并新增 code', async () => {
    const [a] = await makeCustody(1, 'B9');
    const mfg = await login('mfg01', 'mfg123');
    // 保管中样品直接归还 → 状态机无 IN_CUSTODY→IN_CUSTODY(RETURN_OUT) 转移 → 409
    const r = await mfg.agent.post('/api/scan').send({ code: a.sample_no, action: 'RETURN_OUT' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('ACTION_NOT_ALLOWED');
    expect(r.body.status).toBe('IN_CUSTODY');
    expect(typeof r.body.error).toBe('string');
    expect(r.body.sample).toBeTruthy();
    expect(r.body.sample.sample_no).toBe(a.sample_no);
  }, 60000);
});

afterAll(async () => {
  // 测试数据清理（仅测试库）：删除本套件创建的样品日志、样品与机型
  for (const id of createdIds) {
    try { await D.pool().execute('DELETE FROM scan_logs WHERE sample_id=?', [id]); } catch (_) {}
    try { await D.pool().execute('DELETE FROM samples WHERE id=?', [id]); } catch (_) {}
  }
  if (createdModelId) {
    try { await D.pool().execute('DELETE FROM sample_models WHERE id=?', [createdModelId]); } catch (_) {}
  }
});
