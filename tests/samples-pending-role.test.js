// tests/samples-pending-role.test.js — 列表「待处理」与看板「我的待办」口径一致性（2026-09-08 方案A+B）
// 背景：RD 列表待处理旧实现仅 status=NEW，漏掉「指派给我的退回重做」；现改为 pending=role 服务端派生（DAO roleTodoWhere 单一事实来源）
// 说明：仅独立测试库 sample_mgmt_test 运行（samples 已上线，§20.2 生产库禁止造数）
require('dotenv').config();
const { pool } = require('../db');
const { getApp, login } = require('./helpers/setup');
const request = require('supertest');

const TEST_MARK = 'PENDINGROLE-' + Date.now(); // 名称打标，套件内精确清理本用例数据
const createdIds = [];
const ts = String(Date.now()); // sample_no VARCHAR(20)：短前缀+时间戳后 8 位

async function insertSample(pre, status, createdBy, retireRd) {
  const p = pool();
  const no = pre + ts.slice(-8); // 例：P1-12345678（11 字符）
  const [r] = await p.execute(
    'INSERT INTO samples (sample_no, name, qr_token, status, created_by, retire_assigned_rd) VALUES (?,?,?,?,?,?)',
    [no, TEST_MARK, 'qrt-' + pre + ts.slice(-8), status, createdBy, retireRd || null]
  );
  createdIds.push(r.insertId);
  return no;
}

async function getUserRole(username) {
  const p = pool();
  const [rows] = await p.execute('SELECT id, role FROM users WHERE username = ?', [username]);
  return rows[0];
}

afterAll(async () => {
  const p = pool();
  if (createdIds.length) {
    await p.execute('DELETE FROM samples WHERE id IN (' + createdIds.map(() => '?').join(',') + ')', createdIds);
    await p.execute('DELETE FROM scan_logs WHERE sample_id IN (' + createdIds.map(() => '?').join(',') + ')', createdIds).catch(() => {});
  }
  // 注意：不调用 p.end()——本套件运行极快，提前关池会打断 db.js 迁移链的后续 await（触发 Pool is closed 未处理异常）；进程退出交给 jest forceExit
});

describe('列表 pending=role 与看板待办同口径', () => {
  let rd, qa, mfg;
  let noNew, noRet, noRetn, noCust, noPro, noRel;

  beforeAll(async () => {
    rd = await getUserRole('rd01');
    qa = await getUserRole('qa01');
    mfg = await getUserRole('mfg01');
    // RD 待办 = NEW（任何人建）+ RETURNING 且指派给 rd01
    noNew = await insertSample('P1-', 'NEW', qa.id);
    noRet = await insertSample('P2-', 'RETURNING', qa.id, String(rd.id)); // 修复点：旧列表实现漏此类
    noRetn = await insertSample('P3-', 'RETURNING', qa.id, null);          // 未指派→不属 RD 待办
    noCust = await insertSample('P4-', 'IN_CUSTODY', qa.id);               // 非 RD 待办
    // QA 待办 = PRODUCED + RETURNING（含未指派）
    noPro = await insertSample('P5-', 'PRODUCED', rd.id);
    // 保管待办 = RELEASED
    noRel = await insertSample('P6-', 'RELEASED', rd.id);
  }, 30000);

  const fetchList = async (agent, qs) => {
    const res = await agent.get('/api/samples' + (qs ? '?' + qs : '') + (qs ? '&' : '?') + 'q=' + encodeURIComponent(TEST_MARK) + '&limit=200');
    expect(res.status).toBe(200);
    return res.body.samples.map(s => s.sample_no);
  };

  it('RD 待处理应含 NEW + 指给我的 RETURNING，不含未指派 RETURNING', async () => {
    const { agent } = await login('rd01', 'rd123');
    const nos = await fetchList(agent, 'pending=role');
    expect(nos).toContain(noNew);
    expect(nos).toContain(noRet);
    expect(nos).not.toContain(noRetn);
    expect(nos).not.toContain(noCust);
  });

  it('QA 待处理应含 PRODUCED + RETURNING（含未指派）', async () => {
    const { agent } = await login('qa01', 'qa123');
    const nos = await fetchList(agent, 'pending=role');
    expect(nos).toContain(noPro);
    expect(nos).toContain(noRetn);
    expect(nos).not.toContain(noRel);
  });

  it('保管（CUSTODY）待处理应仅含 RELEASED', async () => {
    const { agent } = await login('mfg01', 'mfg123');
    const nos = await fetchList(agent, 'pending=role');
    expect(nos).toContain(noRel);
    expect(nos).not.toContain(noNew);
    expect(nos).not.toContain(noRet);
  });

  it('ADMIN 传 pending=role 不生效（无角色待办语义，返回全量检索结果）', async () => {
    const { agent } = await login('admin', 'admin123');
    const nos = await fetchList(agent, 'pending=role');
    expect(nos.length).toBeGreaterThanOrEqual(6); // 全量可见（未按待办过滤）
  });

  it('看板待办与列表 pending=role 口径一致（RD：指派退回重做两侧均含）', async () => {
    const { agent } = await login('rd01', 'rd123');
    const dash = await agent.get('/api/dashboard');
    expect(dash.status).toBe(200);
    const list = await agent.get('/api/samples?pending=role&limit=200');
    const todoNos = dash.body.myPending.map(s => s.sample_no);
    expect(todoNos).toContain(noRet);                                  // 看板侧含
    expect(list.body.samples.map(s => s.sample_no)).toContain(noRet); // 列表侧含（同口径）
  });
});
