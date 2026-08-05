// tests/sample-code.test.js — 样品 13 位编码模块单测
const { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode } = require('../subsystems/samples/db/sample-code');

describe('SOURCE_CODES / GROUP_CODES', () => {
  it('提供处映射 C/T/G', () => {
    expect(SOURCE_CODES).toEqual({ C: '客供', T: '元山', G: '元将五金塔岗分厂' });
  });
  it('组别映射 6 项全覆盖', () => {
    expect(GROUP_CODES).toEqual({ 扇叶组: 'S', 马达组: 'M', 成品组: 'A', 品保部: 'Q', SMT: 'E', 供应商: 'I' });
    expect(STATION_GROUPS).toEqual(['扇叶组', '马达组', '成品组', '品保部', 'SMT', '供应商']);
  });
});

describe('PATTERN 格式校验', () => {
  it('合法编号通过', () => {
    expect(PATTERN.test('G-YD9015-Q-001-01')).toBe(true);
    expect(PATTERN.test('C-ABCDEF-S-999-99')).toBe(true);
    expect(PATTERN.test('T-SF1225-M-001-01')).toBe(true);
  });
  it('非法编号拒绝', () => {
    expect(PATTERN.test('SM-000001')).toBe(false);          // 旧格式
    expect(PATTERN.test('G-YD9015-X-001-01')).toBe(false);  // 组别不在 S/M/A/Q/E/I
    expect(PATTERN.test('G-YD901-Q-001-01')).toBe(false);   // 机型仅 5 位
    expect(PATTERN.test('G-YD9015-Q-1000-01')).toBe(false); // 流水号超 3 位
    expect(PATTERN.test('G-YD9015-Q-001-100')).toBe(false); // 版次超 2 位
  });
});

describe('parseSampleCode', () => {
  it('解析各段', () => {
    expect(parseSampleCode('G-YD9015-Q-001-01'))
      .toEqual({ source_type: 'G', model: 'YD9015', group: 'Q', seq: '001', version: '01' });
  });
  it('非法编号返回 null', () => {
    expect(parseSampleCode('SM-000001')).toBeNull();
    expect(parseSampleCode(null)).toBeNull();
  });
});

describe('generateSampleCode', () => {
  const fakeQuery = (max) => async () => [{ m: max }];

  it('同组合流水号递增', async () => {
    const seqs = [];
    async function dbQuery() {
      const max = seqs.length ? Math.max(...seqs.map(Number)) : 0;
      return [{ m: max }];
    }
    for (let i = 0; i < 3; i++) {
      const code = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: dbQuery });
      seqs.push(parseSampleCode(code).seq);
    }
    expect(seqs).toEqual(['001', '002', '003']);
  });

  it('机型不足 6 位抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD901', station: '扇叶组', card_version: '01', query: fakeQuery(0) }))
      .rejects.toThrow('机型编码至少 6 位');
  });

  it('机型超 6 位取前 6 位', async () => {
    const code = await generateSampleCode({ source_type: 'T', model: 'SF-1225-A', station: '马达组', card_version: '01', query: fakeQuery(0) });
    expect(code).toBe('T-SF-122-M-001-01');
  });

  it('组别无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '调机样', card_version: '01', query: fakeQuery(0) }))
      .rejects.toThrow('组别无效');
  });

  it('提供处无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'X', model: 'YD9015', station: '扇叶组', card_version: '01', query: fakeQuery(0) }))
      .rejects.toThrow('提供处无效');
  });

  it('版次默认 01，数字版本取数字块', async () => {
    const c1 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '', query: fakeQuery(0) });
    expect(c1).toBe('T-YD9015-S-001-01');
    const c2 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: 'V2.0', query: fakeQuery(0) });
    expect(c2).toBe('T-YD9015-S-001-02');
  });

  it('流水号 999 溢出抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: fakeQuery(999) }))
      .rejects.toThrow('已达上限');
  });
});
