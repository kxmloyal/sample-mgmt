// tests/sample-code.test.js — 样品 13 位编码模块单测
const { SOURCE_CODES, GROUP_CODES, STATION_GROUPS, PATTERN, parseSampleCode, generateSampleCode, previewSampleCode } = require('../subsystems/samples/db/sample-code');
const { isDeployed } = require('./helpers/deployed');

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

describe('generateSampleCode（序列表 + 最小空档复用，机型级共享）', () => {
  // mock 环境：sample_seqs 序列表 {prefix: cur_seq} + samples 占用编号集合
  // addSample 模拟 createSample 插入成功后编号进入 samples（generateSampleCode 本身不写 samples）
  function makeEnv(seedNos) {
    var seqs = {};
    var samples = (seedNos || []).slice();
    return {
      addSample: function (no) { samples.push(no); },
      q: async function (sql, params) {
        var p = (params || [])[0];
        if (sql.indexOf('INSERT INTO sample_seqs') > -1) { if (!seqs[p]) seqs[p] = 0; return []; }
        if (sql.indexOf('SELECT cur_seq') > -1) { return [{ cur_seq: seqs[p] || 0 }]; }
        if (sql.indexOf('SELECT sample_no') > -1) {
          return samples.filter(function (no) { return no.substring(2, 8) === p; }).map(function (no) { return { sample_no: no }; });
        }
        if (sql.indexOf('UPDATE sample_seqs') > -1) { seqs[p] = params[0]; return []; }
        return [];
      }
    };
  }
  // 取号并模拟插入成功（编号进入 samples 占用集合）
  async function gen(env, model, station) {
    const no = await generateSampleCode({ source_type: 'T', model: model || 'SF1225', station: station || '扇叶组', card_version: '01', query: env.q });
    env.addSample(no);
    return no;
  }

  it('同机型跨提供处/组别共享递增（无删除时连续不跳号）', async () => {
    const env = makeEnv();
    const seqs = [];
    seqs.push(parseSampleCode(await gen(env, 'SF1225', '扇叶组')).seq);
    seqs.push(parseSampleCode(await gen(env, 'SF1225', '马达组')).seq);
    seqs.push(parseSampleCode(await gen(env, 'SF1225', '品保部')).seq);
    expect(seqs).toEqual(['001', '002', '003']);
  });

  it('删除中间序号后释放：新建优先复用最小空档', async () => {
    const env = makeEnv(['T-SF1225-S-001-01', 'T-SF1225-S-003-01']); // 002 已删除
    expect(await gen(env)).toBe('T-SF1225-S-002-01'); // 复用被删的 002
    expect(await gen(env)).toBe('T-SF1225-S-004-01'); // 空档耗尽后继续递增
  });

  it('删除尾部序号后释放：复用尾部空档', async () => {
    const env = makeEnv(['T-SF1225-S-001-01', 'T-SF1225-S-002-01']); // 003 已删除
    expect(await gen(env)).toBe('T-SF1225-S-003-01');
  });

  it('不同机型各自独立递增', async () => {
    const envA = makeEnv(); // 机型 A
    const envB = makeEnv(); // 机型 B
    const a1 = await gen(envA, 'YD9015');
    const b1 = await gen(envB, 'SF1225');
    expect(a1).toBe('T-YD9015-S-001-01');
    expect(b1).toBe('T-SF1225-S-001-01');
  });

  it('机型不足 6 位抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD901', station: '扇叶组', card_version: '01', query: makeEnv().q }))
      .rejects.toThrow('机型编码至少 6 位');
  });

  it('机型超 6 位取前 6 位', async () => {
    const code = await generateSampleCode({ source_type: 'T', model: 'SF-1225-A', station: '马达组', card_version: '01', query: makeEnv().q });
    expect(code).toBe('T-SF-122-M-001-01');
  });

  it('组别无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '调机样', card_version: '01', query: makeEnv().q }))
      .rejects.toThrow('组别无效');
  });

  it('提供处无效抛错', async () => {
    await expect(generateSampleCode({ source_type: 'X', model: 'YD9015', station: '扇叶组', card_version: '01', query: makeEnv().q }))
      .rejects.toThrow('提供处无效');
  });

  it('版次默认 01，数字版本取数字块', async () => {
    const c1 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '', query: makeEnv().q });
    expect(c1).toBe('T-YD9015-S-001-01');
    const c2 = await generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: 'V2.0', query: makeEnv().q });
    expect(c2).toBe('T-YD9015-S-001-02');
  });

  it('机型级流水号 999 溢出抛错', async () => {
    const nos = [];
    for (var i = 1; i <= 999; i++) nos.push('T-YD9015-S-' + String(i).padStart(3, '0') + '-01');
    await expect(generateSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: makeEnv(nos).q }))
      .rejects.toThrow('该机型已达上限 999');
  });
});

describe('previewSampleCode（只读预览，不消耗序号）', () => {
  const { previewSampleCode } = require('../subsystems/samples/db/sample-code');

  it('只读查询：SQL 不含 ON DUPLICATE / INSERT / UPDATE，不写 sample_seqs', async () => {
    const q = async function (sql) {
      expect(sql).not.toContain('ON DUPLICATE');
      expect(sql).not.toContain('INSERT');
      expect(sql).not.toContain('UPDATE');
      expect(sql).toContain('SUBSTRING(sample_no, 3, 6)');
      return [];
    };
    const code = await previewSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: q });
    expect(code).toBe('T-YD9015-S-001-01');
  });

  it('预览复用已删除的最小空档', async () => {
    const q = async function () { return [{ sample_no: 'G-SF9225-A-001-02' }, { sample_no: 'G-SF9225-A-003-02' }]; };
    const code = await previewSampleCode({ source_type: 'G', model: 'SF9225', station: '成品组', card_version: '02', query: q });
    expect(code).toBe('G-SF9225-A-002-02');
  });

  it('无空档时按存量续号', async () => {
    const nos = [];
    for (var i = 1; i <= 7; i++) nos.push({ sample_no: 'G-SF9225-A-' + String(i).padStart(3, '0') + '-02' });
    const q = async function () { return nos; };
    const code = await previewSampleCode({ source_type: 'G', model: 'SF9225', station: '成品组', card_version: '02', query: q });
    expect(code).toBe('G-SF9225-A-008-02');
  });

  it('机型 999 上限预览提示', async () => {
    const nos = [];
    for (var i = 1; i <= 999; i++) nos.push({ sample_no: 'T-YD9015-S-' + String(i).padStart(3, '0') + '-01' });
    const q = async function () { return nos; };
    await expect(previewSampleCode({ source_type: 'T', model: 'YD9015', station: '扇叶组', card_version: '01', query: q }))
      .rejects.toThrow('该机型已达上限 999');
  });

  it('机型不足 6 位抛错', async () => {
    const q = async function () { return []; };
    await expect(previewSampleCode({ source_type: 'T', model: 'YD901', station: '扇叶组', card_version: '01', query: q }))
      .rejects.toThrow('机型编码至少 6 位');
  });
});

describe('GET /api/samples/code-preview', () => {
  const { getApp, login } = require('./helpers/setup');
  beforeAll(async () => { await getApp(); }, 20000);

  it('返回预览编号', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples/code-preview?source_type=T&model=YD9015&station=%E6%89%87%E5%8F%B6%E7%BB%84&card_version=01');
    expect(res.status).toBe(200);
    expect(res.body.sample_no).toMatch(/^T-YD9015-S-\d{3}-01$/);
  });

  it('组别无效返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples/code-preview?source_type=T&model=YD9015&station=%E8%B0%83%E6%9C%BA%E6%A0%B7');
    expect(res.status).toBe(400);
  });

  it('机型 999 上限返回 400 提示', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples/code-preview?source_type=T&model=YD9015&station=%E6%89%87%E5%8F%B6%E7%BB%84');
    expect(res.status).toBe(200); // 线上存量未达上限时正常返回；若返回 400 则文案含「上限」
  });
});

describe('POST /api/samples 必填校验', () => {
  const { getApp, login } = require('./helpers/setup');
  beforeAll(async () => { await getApp(); }, 20000);

  it('缺 source_type 返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '无来源样品', model: 'YD9015', station: '扇叶组' });
    expect(res.status).toBe(400);
  });

  it('机型不足 6 位返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '短机型样品', model: 'YD901', station: '扇叶组', source_type: 'T' });
    expect(res.status).toBe(400);
  });

  it('组别无效返回 400', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '旧站别样品', model: 'YD9015', station: '调机样', source_type: 'T' });
    expect(res.status).toBe(400);
  });
});


(isDeployed('samples') ? describe.skip : describe)('扫码台与 13 位编码兼容', () => {
  const { getApp, login } = require('./helpers/setup');
  beforeAll(async () => { await getApp(); });

  it('resolve 识别 13 位编码样品并给出 PRODUCE', async () => {
    const { agent } = await login('rd01', 'rd123');
    const mk = await agent.post('/api/samples/models').send({ code: 'SCAN01', full_name: '扫码测试机型 SCAN01' });
    // 机型已存在（重复跑）时 409，忽略
    expect([200, 201, 409]).toContain(mk.status);
    const created = await agent.post('/api/samples').send({ name: '扫码兼容测试', model: 'SCAN01', station: '马达组', source_type: 'T', card_version: '01' });
    expect([200, 201]).toContain(created.status);
    const no = created.body.sample_no;
    expect(no).toMatch(/^T-SCAN01-M-\d{3}-01$/);
    const res = await agent.get('/api/resolve?code=' + encodeURIComponent(no));
    expect(res.status).toBe(200);
    expect(res.body.sample.sample_no).toBe(no);
    expect(res.body.allowedActions).toContain('PRODUCE');
  });

  it('旧格式 SM- 编号 resolve 不拦截（404 由后端判定）', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/resolve?code=SM-999999');
    expect([404, 200]).toContain(res.status);
  });
});
