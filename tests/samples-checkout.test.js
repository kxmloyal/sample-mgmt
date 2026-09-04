// tests/samples-checkout.test.js — 样品领用/归还流程单元校验（2026-09-05）
// 纯函数/声明校验：不注入样品数据（samples 子系统 deployed:true 护栏兼容，生产库只读原则）
const A = require('../subsystems/samples/backend/scan-actions');
const manifest = require('../subsystems/samples/manifest.json');

describe('样品领用/归还 状态机声明（manifest 唯一真相源）', () => {
  test('新增 CHECKED_OUT 状态且标签为「领用中」', () => {
    expect(manifest.stateMachine.states.CHECKED_OUT).toBeDefined();
    expect(manifest.stateMachine.states.CHECKED_OUT.label).toBe('领用中');
  });
  test('IN_CUSTODY --CHECKOUT--> CHECKED_OUT（CUSTODY/ME）', () => {
    const t = manifest.stateMachine.transitions.find(x => x.action === 'CHECKOUT');
    expect(t).toBeDefined();
    expect(t.from).toBe('IN_CUSTODY');
    expect(t.to).toBe('CHECKED_OUT');
    expect(t.role).toEqual(expect.arrayContaining(['CUSTODY', 'ME']));
  });
  test('CHECKED_OUT --RETURN_OUT--> IN_CUSTODY（CUSTODY/ME）', () => {
    const t = manifest.stateMachine.transitions.find(x => x.action === 'RETURN_OUT');
    expect(t).toBeDefined();
    expect(t.from).toBe('CHECKED_OUT');
    expect(t.to).toBe('IN_CUSTODY');
    expect(t.role).toEqual(expect.arrayContaining(['CUSTODY', 'ME']));
  });
  test('RETURN_REQUEST 仅从 IN_CUSTODY 出发（领用中天然禁退回）', () => {
    const t = manifest.stateMachine.transitions.find(x => x.action === 'RETURN_REQUEST');
    expect(t.from).toBe('IN_CUSTODY');
  });
});

describe('CHECKOUT 动作校验（scan-actions 执行器）', () => {
  const baseCtx = overrides => ({
    req: { body: Object.assign({ checkout_user: '张三', checkout_dept: '制造部', durationHours: 24 }, overrides) },
    s: { id: 1, sample_no: 'SM-000001', status: 'IN_CUSTODY', storage_location: 'A区-1架', version: 3 },
    updated: { status: 'IN_CUSTODY' },
    ts: '2026-09-05T02:00:00.000Z',
    u: { id: 9, role: 'CUSTODY', dept: '制造部', display_name: '保管员甲' },
    D: {}, saveSampleImage: null
  });

  test('合法领出：写全借出字段、应还时间=+24h、returned_at 清空、储位不动', async () => {
    const ctx = baseCtx();
    const r = await A.applyAction('CHECKOUT', ctx);
    expect(r.error).toBeUndefined();
    expect(ctx.updated.status).toBe('CHECKED_OUT');
    expect(ctx.updated.checkout_user).toBe('张三');
    expect(ctx.updated.checkout_dept).toBe('制造部');
    expect(ctx.updated.checkout_at).toBe('2026-09-05T02:00:00.000Z');
    expect(ctx.updated.expected_return_at).toBe('2026-09-06T02:00:00.000Z');
    expect(ctx.updated.returned_at).toBeNull();
    expect(ctx.updated.storage_location).toBeUndefined(); // 执行器不改储位（CAS 全量覆盖用 s 的原值）
    expect(r.logData.action).toBe('CHECKOUT');
    expect(r.logData.note).toContain('张三');
  });
  test('缺领用人 → 400', async () => {
    const ctx = baseCtx({ checkout_user: '' });
    const r = await A.applyAction('CHECKOUT', ctx);
    expect(r.status).toBe(400);
  });
  test('时长非整数/越界 → 400（0、负数、8761、小数）', async () => {
    for (const h of [0, -5, 8761, 1.5]) {
      const ctx = baseCtx({ durationHours: h });
      const r = await A.applyAction('CHECKOUT', ctx);
      expect(r.status).toBe(400);
    }
  });
  test('部门留空回退操作人部门', async () => {
    const ctx = baseCtx({ checkout_dept: '' });
    const r = await A.applyAction('CHECKOUT', ctx);
    expect(r.error).toBeUndefined();
    expect(ctx.updated.checkout_dept).toBe('制造部');
  });
});

describe('RETURN_OUT 动作校验', () => {
  test('归还：回 IN_CUSTODY、写归还时间、清借出字段、日志含借出时长', async () => {
    const ctx = {
      req: { body: { note: '外观无异常' } },
      s: { id: 1, status: 'CHECKED_OUT', checkout_user: '张三', checkout_at: '2026-09-04T02:00:00.000Z' },
      updated: { status: 'CHECKED_OUT' },
      ts: '2026-09-05T08:00:00.000Z',
      u: { id: 9, role: 'CUSTODY', dept: '制造部' },
      D: {}, saveSampleImage: null
    };
    const r = await A.applyAction('RETURN_OUT', ctx);
    expect(r.error).toBeUndefined();
    expect(ctx.updated.status).toBe('IN_CUSTODY');
    expect(ctx.updated.returned_at).toBe('2026-09-05T08:00:00.000Z');
    expect(ctx.updated.checkout_user).toBeNull();
    expect(ctx.updated.expected_return_at).toBeNull();
    expect(r.logData.note).toContain('30 小时');
    expect(r.logData.note).toContain('张三');
  });
});
