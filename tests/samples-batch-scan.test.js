// tests/samples-batch-scan.test.js — 批量领用/归还：参数解析、去重、幂等键与来源契约（2026-09-16）
// 纯函数/源码契约层：不连库（samples deployed:true 护栏兼容，生产只读原则）；
// DB 全链路（两阶段/幂等/CAS/权限）见 tests/samples-batch-scan-e2e.test.js。
const fs = require('fs');
const path = require('path');
const B = require('../subsystems/samples/backend/batch-scan');

const ROOT = path.join(__dirname, '..');
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const count = (s, needle) => s.split(needle).length - 1;

const goodId = 'b7f3c1a2-9d4e-4b6a-8c1f';

describe('批量入参解析（parseBatchBody）', () => {
  test('仅放行 CHECKOUT / RETURN_OUT，图片类动作一律 400', () => {
    ['PRODUCE', 'RELEASE', 'INSPECT', 'RETIRE_ONLY', 'RECREATE', ''].forEach(a => {
      const r = B.parseBatchBody({ action: a, batchId: goodId, codes: ['X'] }, true);
      expect(r.status).toBe(400);
      expect(r.err).toContain('仅支持 CHECKOUT');
    });
    expect(B.BATCH_ACTIONS).toEqual(['CHECKOUT', 'RETURN_OUT']);
  });

  test('batchId 必填且须为 8~40 位 [A-Za-z0-9_-]（缺失/过短/含非法字符均 400）', () => {
    expect(B.validateBatchId(goodId)).toBeNull();
    expect(B.validateBatchId('abcdefgh')).toBeNull();
    expect(B.validateBatchId('a'.repeat(40))).toBeNull();
    expect(B.validateBatchId('')).toContain('缺少批次标识');
    expect(B.validateBatchId(null)).toContain('缺少批次标识');
    expect(B.validateBatchId('a'.repeat(7))).toContain('格式非法');
    expect(B.validateBatchId('a'.repeat(41))).toContain('格式非法');
    expect(B.validateBatchId('abcdefg h')).toContain('格式非法');
    expect(B.validateBatchId('abcdefg!')).toContain('格式非法');
  });

  test('CHECKOUT 须带领用人 + 1~8760 整数时长，缺一即 400', () => {
    const base = { action: 'CHECKOUT', batchId: goodId, codes: ['X'] };
    expect(B.parseBatchBody(Object.assign({}, base, { checkout_user: '张三', durationHours: 24 }), true).err).toBeUndefined();
    expect(B.parseBatchBody(Object.assign({}, base, { durationHours: 24 }), true).err).toBe('请填写领用人');
    expect(B.parseBatchBody(Object.assign({}, base, { checkout_user: '  ', durationHours: 24 }), true).err).toBe('请填写领用人');
    [0, -1, 8761, 1.5, 'abc', null].forEach(d => {
      const r = B.parseBatchBody(Object.assign({}, base, { checkout_user: '张三', durationHours: d }), true);
      expect(r.err).toContain('领用时长须为 1~8760');
    });
    // 公共项落在 params 上，整批统一（Q2 统一领用人 + 统一时长）
    const ok = B.parseBatchBody(Object.assign({}, base, { checkout_user: ' 李四 ', checkout_dept: ' 品质部 ', durationHours: 8, note: '备注' }), true);
    expect(ok.params).toEqual({ note: '备注', checkout_user: '李四', checkout_dept: '品质部', durationHours: 8 });
  });

  test('RETURN_OUT 不要求领用人/时长（归还不改领用字段）', () => {
    const r = B.parseBatchBody({ action: 'RETURN_OUT', batchId: goodId, codes: ['X'], note: '批量归还' }, true);
    expect(r.err).toBeUndefined();
    expect(r.params).toEqual({ note: '批量归还' });
  });

  test('上限 50：第 51 件即 400（按输入长度拦截，先于去重）', () => {
    const mk = n => B.parseBatchBody({ action: 'RETURN_OUT', batchId: goodId, codes: new Array(n).fill('SM-000001') }, true);
    expect(mk(50).err).toBeUndefined();
    expect(mk(51).err).toContain('单批最多 50 件');
    expect(mk(51).status).toBe(400);
  });

  test('codes 为空或非数组 → 400（batch-action 必填）', () => {
    expect(B.parseBatchBody({ action: 'RETURN_OUT', batchId: goodId, codes: [] }, true).err).toBe('请至少提供一件样品编号');
    expect(B.parseBatchBody({ action: 'RETURN_OUT', batchId: goodId, codes: 'X' }, true).err).toBe('请至少提供一件样品编号');
    // needCodes=false（保留给只读预校验类调用）：空数组不拦
    expect(B.parseBatchBody({ action: 'RETURN_OUT', batchId: goodId, codes: [] }, false).err).toBeUndefined();
  });

  test('批次内去重：首件为准，重复项与空值进 skipped', () => {
    const d = B.dedupCodes(['A', 'B', 'A', '', '  ', 'B', 'C']);
    expect(d.list).toEqual(['A', 'B', 'C']);
    // 空串与纯空白各自独立成一条跳过项（都归一为 code:''），重复项记原编号
    expect(d.skipped.map(x => x.code)).toEqual(['A', '', '', 'B']);
    expect(d.skipped.map(x => x.reason)).toEqual([
      '本批队列内重复（首件为准）', '输入为空', '输入为空', '本批队列内重复（首件为准）'
    ]);
    // 前后空白归一后再判重
    expect(B.dedupCodes([' A ', 'A']).list).toEqual(['A']);
  });
});

describe('批量通道来源契约（防复制粘贴漂移）', () => {
  const src = readSrc('subsystems/samples/backend/batch-scan.js');

  test('复用 scan-actions.applyAction 与 scan-allowed 动作口径，不自建状态改写', () => {
    expect(src).toContain("require('./scan-actions')");
    expect(src).toContain("require('./scan-allowed')");
    expect(count(src, 'A.applyAction(')).toBe(1);      // 唯一执行入口
    expect(src).not.toContain('createStateMachine');   // 动作集只从 scan-allowed 取，不重复造状态机
  });

  test('幂等探测每批仅 1 次，且后缀格式固定为「 [batch:<id>]」', () => {
    expect(count(src, 'D.listBatchLogs(')).toBe(1);
    expect(src).toContain("' [batch:' + batchId + ']'");
  });

  test('CAS 提交走 D.withTransaction(updateSample + addLog) 原子，单件失败不回滚他件', () => {
    expect(src).toContain('D.withTransaction');
    expect(src).toContain('D.updateSample(updated, conn, s.version)');
    expect(src).toContain('D.addLog(');
    expect(src).toContain("err.code === 'CONFLICT'");
    expect(src).toContain('VERSION_CONFLICT');
  });

  test('batch 路由注册在 routes-samples 之前（否则 /api/samples/:id 会吞掉 batch-*）', () => {
    const idx = readSrc('subsystems/samples/backend/index.js');
    expect(idx.indexOf("require('./batch-scan')")).toBeGreaterThan(-1);
    expect(idx.indexOf("require('./batch-scan')")).toBeLessThan(idx.indexOf("require('./routes-samples')"));
  });

  test('单件扫码台 409 兼容增量：新增 code，原 error/sample 不动', () => {
    const scan = readSrc('subsystems/samples/backend/routes-scan.js');
    expect(scan).toContain("code: 'ACTION_NOT_ALLOWED'");
    expect(scan).toContain("code: 'VERSION_CONFLICT'");
    expect(scan).toContain('sample: s');
    expect(scan).toContain("error: '该样品刚被他人操作，请刷新后重试'");
    // 动作集已外迁，单件与批量共用同一份
    expect(scan).toContain("require('./scan-allowed')");
    expect(count(readSrc('subsystems/samples/backend/scan-allowed.js'), 'function allowedActions(')).toBe(1);
  });
});
