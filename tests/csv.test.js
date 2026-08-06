// tests/csv.test.js — shared/csv.js 单元测试（纯函数，无 DB 依赖）
const { toCsv, sendCsv } = require('../shared/csv');

describe('shared/csv', () => {
  it('should prepend BOM and write header + data rows', () => {
    const csv = toCsv([{ a: 'x', b: 1 }], [{ key: 'a', label: '甲' }, { key: 'b', label: '乙' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const lines = csv.replace('\uFEFF', '').split('\r\n');
    expect(lines[0]).toBe('甲,乙');
    expect(lines[1]).toBe('x,1');
  });

  it('should quote values containing comma / quote / newline', () => {
    const csv = toCsv([{ a: 'he said "hi", ok\nline2' }], [{ key: 'a', label: 'A' }]);
    const body = csv.replace('\uFEFF', '').split('\r\n')[1];
    expect(body).toBe('"he said ""hi"", ok\nline2"');
  });

  it('should treat null / undefined as empty string', () => {
    const csv = toCsv([{ a: null, b: undefined }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]);
    expect(csv.replace('\uFEFF', '').split('\r\n')[1]).toBe(',');
  });

  it('should apply fmt formatter with (value, row)', () => {
    const csv = toCsv([{ st: 'RELEASED' }], [{ key: 'st', label: '状态', fmt: v => (v === 'RELEASED' ? '已发行' : v) }]);
    expect(csv.replace('\uFEFF', '').split('\r\n')[1]).toBe('已发行');
  });

  it('sendCsv should set headers and send body', () => {
    const res = { setHeader: jest.fn(), send: jest.fn() };
    sendCsv(res, 'samples-20260806.csv', '\uFEFFa');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('samples-20260806.csv'));
    expect(res.send).toHaveBeenCalledWith('\uFEFFa');
  });
});
