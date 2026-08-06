const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

// 样品子系统已上线（manifest deployed:true）：按 AGENTS.md §20 保护规则跳过全部测试（禁止数据注入）
if (isDeployed('samples')) {
  describe.skip('样品子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过全部测试', () => {}); });
} else {

beforeAll(async () => {
  await getApp();
  // 新增强制校验：预置测试用机型（幂等：409 已存在也接受）
  const { agent } = await login('rd01', 'rd123');
  const codes = ['SF1225', 'SF9225', 'MX1234', 'MY1234'];
  for (const code of codes) {
    const r = await agent.post('/api/samples/models').send({ code: code, full_name: '测试机型 ' + code });
    if (r.status !== 200 && r.status !== 409) throw new Error('预置机型失败: ' + code + ' → ' + r.body.error);
  }
}, 30000);

async function seedSample() {
  const { agent } = await login('rd01', 'rd123');
  const res = await agent
    .post('/api/samples')
    .send({ name: '测试样品', spec: '规格A', model: 'SF1225', station: '马达组', source_type: 'T', notes: 'test' });
  expect(res.status).toBe(200);
  return { agent, sample: res.body };
}

async function seedSampleWithLimit() {
  const { agent } = await login('rd01', 'rd123');
  const res = await agent
    .post('/api/samples')
    .send({
      name: '限度测试样', spec: 'T-SPEC', model: 'SF9225', station: '成品组',
      sample_type: 'OK', limit_item: 'A', source_type: 'T',
      valid_until: '2027-06-01', card_version: 'A1',
      test_standard: '标准V1', test_data: ''
    });
  expect(res.status).toBe(200);
  return { agent, sample: res.body };
}

describe('GET /api/samples', () => {
  it('should list samples', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/samples');
    expect(res.status).toBe(200);
    expect(res.body.samples).toBeDefined();
    expect(typeof res.body.total).toBe('number');
  });
});

describe('POST /api/samples', () => {
  it('should create sample as ADMIN', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '新建样品1', spec: '规格X', model: 'MX1234', station: '马达组', source_type: 'T', notes: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.sample_no).toBeDefined();
    expect(res.body.qr_token).toBeDefined();
    expect(res.body.status).toBe('NEW');
  });

  it('should create sample as RD', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '新建样品2', spec: '规格Y', model: 'MY1234', station: '马达组', source_type: 'T', notes: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('NEW');
  });

  it('should reject creation by non-RD role', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '新建样品3', spec: '规格Z', notes: 'test' });
    expect(res.status).toBe(403);
  });

  it('should reject empty name', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.post('/api/samples').send({ name: '', spec: 'X' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/scan', () => {
  it('should advance NEW to PRODUCED with image (RD scan)', async () => {
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    const res = await rndAgent
      .post('/api/scan')
      .send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=', note: '制作完成' });
    expect(res.status).toBe(200);
    expect(res.body.sample.status).toBe('PRODUCED');
    expect(res.body.action).toBe('PRODUCE');
  });

  it('should require cycleDays for RELEASE action', async () => {
    const { sample } = await seedSample();
    // 第一步：研发确认制作完成
    const { agent: rndAgent } = await login('rd01', 'rd123');
    await rndAgent.post('/api/scan').send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=', note: 'done' });
    // 第二步：品保登录，扫描时缺 cycleDays
    const { agent: qaAgent } = await login('qa01', 'qa123');
    const res = await qaAgent.post('/api/scan').send({ code: sample.sample_no });
    expect(res.status).toBe(400);
  });

  it('should reject scan with wrong role/status', async () => {
    const { sample } = await seedSample();
    const { agent: qaAgent } = await login('qa01', 'qa123');
    const res = await qaAgent
      .post('/api/scan')
      .send({ code: sample.sample_no, note: 'test' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/scan - PRODUCE requires image', () => {
  it('should reject PRODUCE without image', async () => {
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    const res = await rndAgent
      .post('/api/scan')
      .send({ code: sample.sample_no, note: 'no image' });
    expect(res.status).toBe(400);
  });

  it('should accept PRODUCE with image and store produced_image', async () => {
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    const res = await rndAgent
      .post('/api/scan')
      .send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=', note: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.sample.status).toBe('PRODUCED');
  });
});

describe('DELETE /api/samples/:id', () => {
  it('should delete NEW sample by creator (RD)', async () => {
    const { agent, sample } = await seedSample();
    const res = await agent.delete('/api/samples/' + sample.id);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    const res2 = await agent.get('/api/samples/' + sample.id);
    expect(res2.status).toBe(404);
  });

  it('should delete NEW sample by ADMIN', async () => {
    const { sample } = await seedSample();
    const { agent: adminAgent } = await login('admin', 'admin123');
    const res = await adminAgent.delete('/api/samples/' + sample.id);
    expect(res.status).toBe(200);
  });

  it('should not delete by non-creator CUSTODY', async () => {
    const { sample } = await seedSample();
    const { agent: sAgent } = await login('mfg01', 'mfg123');
    const res = await sAgent.delete('/api/samples/' + sample.id);
    expect(res.status).toBe(403);
  });

  it('should not delete PRODUCED sample by QA', async () => {
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    await rndAgent.post('/api/scan').send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=' });
    const { agent: qaAgent } = await login('qa01', 'qa123');
    const res = await qaAgent.delete('/api/samples/' + sample.id);
    expect(res.status).toBe(403);
  });

  it('should not delete RELEASED sample', async () => {
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    await rndAgent.post('/api/scan').send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=' });
    const { agent: qaAgent } = await login('qa01', 'qa123');
    await qaAgent.post('/api/scan').send({ code: sample.sample_no, cycleDays: 30, sample_type: 'OK', limit_item: 'A' });
    const res = await rndAgent.delete('/api/samples/' + sample.id);
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent sample', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.delete('/api/samples/99999');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/scan - INSPECT action', () => {
  it('should allow QA to inspect overdue sample', async () => {
    // 建样 → RD扫码 → QA发行
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    await rndAgent.post('/api/scan').send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=' });
    const { agent: qaAgent } = await login('qa01', 'qa123');
    await qaAgent.post('/api/scan').send({ code: sample.sample_no, cycleDays: 30, sample_type: 'OK', limit_item: 'A' });
    // 强制设 next_inspect_at 为过去（MariaDB 直连 UPDATE）
    const { pool } = require('../db');
    await pool().execute('UPDATE samples SET next_inspect_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', sample.id]);
    // QA 扫码复检
    const res = await qaAgent
      .post('/api/scan')
      .send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=', note: '复检通过' });
    expect(res.status).toBe(200);
    expect(res.body.action).toBe('INSPECT');
  }, 15000);

  it('should reject INSPECT without image', async () => {
    const { sample } = await seedSample();
    const { agent: rndAgent } = await login('rd01', 'rd123');
    await rndAgent.post('/api/scan').send({ code: sample.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=' });
    const { agent: qaAgent } = await login('qa01', 'qa123');
    await qaAgent.post('/api/scan').send({ code: sample.sample_no, cycleDays: 30, sample_type: 'OK', limit_item: 'A' });
    // 强制设 next_inspect_at 为过去（MariaDB 直连 UPDATE）
    const { pool } = require('../db');
    await pool().execute('UPDATE samples SET next_inspect_at = ? WHERE id = ?', ['2020-01-01T00:00:00.000Z', sample.id]);
    // 不带 image 应该报 400
    const res = await qaAgent.post('/api/scan').send({ code: sample.sample_no, note: 'no photo' });
    expect(res.status).toBe(400);
  }, 15000);
});

describe('GET /api/samples — filtering & sorting', () => {
  it('should filter by department', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?dept=' + encodeURIComponent('制造部'));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.samples)).toBe(true);
    for (const s of res.body.samples) expect(s.custody_dept).toBe('制造部');
  });

  it('should sort by sample_no ascending', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?sort=sample_no');
    expect(res.status).toBe(200);
    for (let i = 1; i < res.body.samples.length; i++)
      expect(res.body.samples[i].sample_no >= res.body.samples[i-1].sample_no).toBe(true);
  });

  it('should sort by created_at descending', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?sort=-created_at');
    expect(res.status).toBe(200);
    for (let i = 1; i < res.body.samples.length; i++)
      expect(new Date(res.body.samples[i].created_at) <= new Date(res.body.samples[i-1].created_at)).toBe(true);
  });

  it('should return overdue samples (overdue=1)', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?overdue=1');
    expect(res.status).toBe(200);
    const now = new Date().toISOString();
    for (const s of res.body.samples) {
      expect(s.status).toBe('IN_CUSTODY');
      expect(new Date(s.next_inspect_at).toISOString() < now).toBe(true);
    }
  });

  it('should filter overdue within 7 days (overdue=7)', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?overdue=7');
    expect(res.status).toBe(200);
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString();
    for (const s of res.body.samples) {
      expect(s.status).toBe('IN_CUSTODY');
      expect(new Date(s.next_inspect_at).toISOString() < in7Days).toBe(true);
    }
  });

  it('should combine search, status, sort', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?q=SM&status=NEW&sort=-created_at');
    expect(res.status).toBe(200);
    for (const s of res.body.samples) expect(s.status).toBe('NEW');
    for (const s of res.body.samples) expect(s.sample_no.includes('SM')).toBe(true);
    for (let i = 1; i < res.body.samples.length; i++)
      expect(new Date(res.body.samples[i].created_at) <= new Date(res.body.samples[i-1].created_at)).toBe(true);
  });
});

describe('POST /api/samples — with limit fields', () => {
  it('should create sample with limit fields', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({
        name: '限度样品OK', spec: 'OK-SPEC', model: 'MX1234', station: '马达组',
        notes: 'test limit sample',
        sample_type: 'OK', limit_item: 'A', source_type: 'T',
        valid_until: '2027-01-01', card_version: 'A1',
        test_standard: '震动≤0.5mm', test_data: ''
      });
    expect(res.status).toBe(200);
    expect(res.body.sample_type).toBe('OK');
    expect(res.body.limit_item).toBe('A');
    expect(res.body.source_type).toBe('T');
    expect(res.body.card_version).toBe('A1');
    expect(res.body.test_standard).toBe('震动≤0.5mm');
    expect(res.body.signed_by_rd).toBeDefined();
  });

  it('should create sample without limit fields (backward compat)', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '普通样品', spec: 'ordinary', model: 'SF1225', station: '马达组', source_type: 'T', notes: 'no limit' });
    expect(res.status).toBe(200);
    expect(res.body.sample_type).toBe('');
    expect(res.body.limit_item).toBe('');
  });
});

describe('PUT /api/samples/:id — update card', () => {
  it('should update limit fields via PUT', async () => {
    const { agent, sample } = await seedSampleWithLimit();
    const res = await agent
      .put('/api/samples/' + sample.id)
      .send({ sample_type: 'NG', limit_item: 'B', card_version: 'B2', test_standard: '异音≤30dB' });
    expect(res.status).toBe(200);
    expect(res.body.sample_type).toBe('NG');
    expect(res.body.limit_item).toBe('B');
    expect(res.body.card_version).toBe('B2');
    expect(res.body.test_standard).toBe('异音≤30dB');
  });

  it('should reject PUT by CUSTODY role', async () => {
    const { sample } = await seedSampleWithLimit();
    const { agent: sAgent } = await login('mfg01', 'mfg123');
    const res = await sAgent
      .put('/api/samples/' + sample.id)
      .send({ sample_type: 'OK' });
    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent sample', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/samples/99999').send({ sample_type: 'OK' });
    expect(res.status).toBe(404);
  });
});

describe('GET /card/:sample_no — anonymous card', () => {
  it('should return card HTML for valid sample_no', async () => {
    const app = await getApp();
    const { sample } = await seedSampleWithLimit();
    const request = require('supertest');
    const res = await request(app).get('/card/' + sample.sample_no);
    expect(res.status).toBe(200);
    expect(res.text).toContain(sample.sample_no);
    expect(res.text).toContain('OK');
  });

  it('should return 404 HTML for non-existent sample_no', async () => {
    const app = await getApp();
    const request = require('supertest');
    const res = await request(app).get('/card/NONEXIST-999999');
    expect(res.status).toBe(404);
    expect(res.text).toContain('404');
  });
});

describe('GET /api/samples — limit filters', () => {
  it('should filter by sample_type', async () => {
    await seedSampleWithLimit();
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?sample_type=OK');
    expect(res.status).toBe(200);
    for (const s of res.body.samples) expect(s.sample_type).toBe('OK');
  });

  it('should filter by limit_item', async () => {
    await seedSampleWithLimit();
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?limit_item=A');
    expect(res.status).toBe(200);
    for (const s of res.body.samples) expect(s.limit_item).toBe('A');
  });

  it('should filter by source_type', async () => {
    await seedSampleWithLimit();
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/samples?source_type=T');
    expect(res.status).toBe(200);
    for (const s of res.body.samples) expect(s.source_type).toBe('T');
  });
});
}
