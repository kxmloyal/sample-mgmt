// tests/projects-v3.test.js — 项目追踪 v3 迭代（方案一A/三A/三B/三C/二A 回归）
// 覆盖：新转边（BACK/REOPEN/RESUME/FINISH/CANCEL）+ OVERDUE 派生态可流转 + CANCELLED 终态
//      + start_date 全链路 + 风险/变更↔任务互链 + 附件受控下载 + 详情 risks/changes 注入
// projects 未上线（manifest 无 deployed），测试库可自由造数
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { getApp } = require('./helpers/setup');

let app, admin, pm, member;
let pid;

async function makeUser(u) {
  const D = require('../db');
  if (!await D.getUserByUsername(u.username)) {
    await D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
  }
  const agent = request.agent(app);
  await agent.post('/api/login').send({ username: u.username, password: u.password });
  return { agent, user: await D.getUserByUsername(u.username) };
}

beforeAll(async () => {
  app = await getApp();
  admin = await makeUser({ username: 'admin', password: 'admin123', role: 'ADMIN', dept: '系统', display_name: '系统管理员' });
  pm = await makeUser({ username: 'pm01', password: 'pm123', role: 'PM', dept: '项目部', display_name: '项目经理' });
  const p = await pm.agent.post('/api/projects').send({ name: 'v3-proj' + Date.now() });
  expect(p.status).toBe(201);
  pid = p.body.id;
  member = await makeUser({ username: 'rd-v3-mem', password: 'rd123', role: 'RD', dept: '研发部', display_name: 'v3成员' });
  await pm.agent.post('/api/projects/' + pid + '/members').send({ user_id: member.user.id });
}, 30000);

// ===== 方案一A②：新转边 BACK/REOPEN =====
describe('方案一A② 新转边 BACK/REOPEN', () => {
  let tid;
  beforeAll(async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-转边任务' });
    tid = t.body.id;
  });
  test('IN_PROGRESS → BACK → NOT_STARTED', async () => {
    await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    const r = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'BACK' });
    expect(r.status).toBe(200);
    expect(r.body.task.status).toBe('NOT_STARTED');
  });
  test('DONE → REOPEN → IN_PROGRESS', async () => {
    await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'COMPLETE' });
    const r = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'REOPEN' });
    expect(r.status).toBe(200);
    expect(r.body.task.status).toBe('IN_PROGRESS');
    // REOPEN 后 version 已增，但重新完成不应再报状态不匹配
    const done = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'COMPLETE' });
    expect(done.status).toBe(200);
  });
});

// ===== 方案一A①：OVERDUE 派生态可流转（旧死锁场景） =====
describe('方案一A① 派生 OVERDUE 可 RESUME/FINISH/CANCEL', () => {
  let tid;
  beforeAll(async () => {
    // planned_date 在过去 → status_eff=OVERDUE（物理 status=NOT_STARTED，无任何写回）
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks')
      .send({ title: 'V3-过期任务', planned_date: '2020-01-01' });
    tid = t.body.id;
  });
  test('物理 status 保持 NOT_STARTED（不再写回 OVERDUE）', async () => {
    const d = await pm.agent.get('/api/projects/tasks/' + tid);
    expect(d.body.task.status).toBe('NOT_STARTED');
    expect(d.body.task.status_eff).toBe('OVERDUE');
  });
  test('OVERDUE → RESUME → IN_PROGRESS（且 planned_date 已过仍可继续）', async () => {
    const r = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'RESUME' });
    expect(r.status).toBe(200);
    expect(r.body.task.status).toBe('IN_PROGRESS');
  });
  test('完成后的过期任务可从 DONE REOPEN', async () => {
    await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'FINISH' });
    const d = await pm.agent.get('/api/projects/tasks/' + tid);
    expect(d.body.task.status).toBe('DONE');
  });
  test('过期未开始任务可直接 CANCEL（NOT_STARTED → CANCELLED）', async () => {
    const t2 = await pm.agent.post('/api/projects/' + pid + '/tasks')
      .send({ title: 'V3-过期取消', planned_date: '2020-01-01' });
    const r = await pm.agent.post('/api/projects/tasks/' + t2.body.id + '/status').send({ action: 'CANCEL' });
    expect(r.status).toBe(200);
    expect(r.body.task.status).toBe('CANCELLED');
  });
});

// ===== 方案三A：CANCELLED 终态 =====
describe('方案三A CANCELLED 终态', () => {
  let tid;
  beforeAll(async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-取消任务' });
    tid = t.body.id;
  });
  test('进行中任务可 CANCEL', async () => {
    await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    const r = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'CANCEL' });
    expect(r.status).toBe(200);
    expect(r.body.task.status).toBe('CANCELLED');
  });
  test('CANCELLED 为终态：任何流转动作 → 400', async () => {
    for (const act of ['START', 'COMPLETE', 'BACK', 'REOPEN', 'RESUME', 'FINISH', 'CANCEL']) {
      const r = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: act });
      expect([400, 409]).toContain(r.status);
    }
  });
  test('成员（非 PM/ADMIN）CANCEL → 403', async () => {
    const t2 = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-成员不可取消' });
    await member.agent.post('/api/projects/tasks/' + t2.body.id + '/status').send({ action: 'START' });
    const r = await member.agent.post('/api/projects/tasks/' + t2.body.id + '/status').send({ action: 'CANCEL' });
    expect(r.status).toBe(403);
  });
  test('stats 返回 cancelled_count', async () => {
    const s = await pm.agent.get('/api/projects/stats');
    expect(s.status).toBe(200);
    expect(s.body.cancelled_count).toBeGreaterThanOrEqual(1);
    expect(s.body.overdue_count).toBeGreaterThanOrEqual(0);
  });
  test('workflow 配置含 CANCELLED 五态与 OVERDUE 出边', async () => {
    const w = await pm.agent.get('/api/projects/workflow');
    expect(Object.keys(w.body.states)).toContain('CANCELLED');
    const froms = w.body.transitions.filter(t => t.from === 'OVERDUE').map(t => t.to);
    expect(froms).toEqual(expect.arrayContaining(['IN_PROGRESS', 'DONE', 'CANCELLED']));
  });
});

// ===== 方案三B：start_date 全链路 =====
// 注：DATE 列经 JSON 序列化为 UTC ISO 串（本地时区零点，如 2026-01-04T16:00:00.000Z = +08 的 01-05），
// 与存量 planned_date 行为一致；前端 fmt() 转本地显示。测试断言用同款「本地转日期」口径 d10()
const d10 = v => {
  const s = String(v || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? s : dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
};
describe('方案三B start_date 全链路', () => {
  test('创建带 start_date → 详情返回', async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks')
      .send({ title: 'V3-跨度任务', start_date: '2026-01-05', planned_date: '2026-01-20' });
    expect(t.status).toBe(201);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d10(d.body.task.start_date)).toBe('2026-01-05');
  });
  test('编辑修改 start_date（乐观锁链路）', async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-跨度编辑' });
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    const r = await pm.agent.put('/api/projects/tasks/' + t.body.id)
      .send({ start_date: '2026-02-01', version: d.body.task.version });
    expect(r.status).toBe(200);
    const d2 = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d10(d2.body.task.start_date)).toBe('2026-02-01');
  });
  test('项目任务列表返回 start_date 字段（甘特数据源）', async () => {
    const list = await pm.agent.get('/api/projects/' + pid + '/tasks');
    const hit = list.body.find(x => d10(x.start_date) === '2026-01-05');
    expect(hit).toBeTruthy();
  });
});

// ===== 方案三C：风险/变更↔任务互链 =====
describe('方案三C 风险/变更↔任务互链', () => {
  let tid;
  beforeAll(async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-互链任务' });
    tid = t.body.id;
  });
  test('识别风险带 task_id → 列表带 task_title', async () => {
    const r = await pm.agent.post('/api/projects/' + pid + '/risks')
      .send({ risk_name: 'V3-互链风险', severity: 'H', probability: 'M', task_id: tid });
    expect(r.status).toBe(201);
    const list = await pm.agent.get('/api/projects/' + pid + '/risks');
    const hit = list.body.find(x => x.id === r.body.id);
    expect(hit.task_id).toBe(tid);
    expect(hit.task_title).toBe('V3-互链任务');
  });
  test('跨项目任务关联风险 → 400', async () => {
    const p2 = await pm.agent.post('/api/projects').send({ name: 'v3-other' + Date.now() });
    const t2 = await pm.agent.post('/api/projects/' + p2.body.id + '/tasks').send({ title: '别项目任务' });
    const r = await pm.agent.post('/api/projects/' + pid + '/risks')
      .send({ risk_name: 'V3-跨项目', task_id: t2.body.id });
    expect(r.status).toBe(400);
  });
  test('编辑风险可改/清 task_id', async () => {
    const mk = await pm.agent.post('/api/projects/' + pid + '/risks').send({ risk_name: 'V3-编辑互链' });
    const list = await pm.agent.get('/api/projects/' + pid + '/risks');
    const r0 = list.body.find(x => x.id === mk.body.id);
    const set = await pm.agent.put('/api/projects/risks/' + mk.body.id)
      .send({ risk_name: 'V3-编辑互链', task_id: tid, version: r0.version });
    expect(set.status).toBe(200);
    const clear = await pm.agent.put('/api/projects/risks/' + mk.body.id)
      .send({ risk_name: 'V3-编辑互链', task_id: null, version: r0.version + 1 });
    expect(clear.status).toBe(200);
  });
  test('发起变更带 task_id → 列表带 task_title；详情注入互链', async () => {
    const c = await pm.agent.post('/api/projects/' + pid + '/changes')
      .send({ change_type: 'SCOPE', description: 'V3-互链变更', task_id: tid });
    expect(c.status).toBe(201);
    const list = await pm.agent.get('/api/projects/' + pid + '/changes');
    const hit = list.body.find(x => x.id === c.body.id);
    expect(hit.task_id).toBe(tid);
    expect(hit.task_title).toBe('V3-互链任务');
    // 详情注入 risks/changes
    const d = await pm.agent.get('/api/projects/tasks/' + tid);
    expect(Array.isArray(d.body.risks)).toBe(true);
    expect(d.body.risks.some(x => x.risk_name === 'V3-互链风险')).toBe(true);
    expect(d.body.changes.some(x => x.description === 'V3-互链变更')).toBe(true);
  });
});

// ===== 方案二A：附件受控下载 =====
describe('方案二A 附件受控下载', () => {
  let tid, fid;
  beforeAll(async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-下载任务' });
    tid = t.body.id;
    const up = await pm.agent.post('/api/projects/tasks/' + tid + '/files')
      .attach('file', Buffer.from('v3 download content'), 'v3-note.pdf');
    expect(up.status).toBe(201);
    fid = up.body.id;
  });
  test('登录 + 相关人下载 → 200 且内容一致', async () => {
    const r = await pm.agent.get('/api/projects/tasks/' + tid + '/files/' + fid + '/download')
      .buffer().parse(function (res, cb) { const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(r.status).toBe(200);
    expect(r.body.toString('utf8')).toContain('v3 download content');
  });
  test('非项目成员下载 → 403', async () => {
    const outsider = await makeUser({ username: 'rd-v3-out', password: 'rd123', role: 'RD', dept: '研发部', display_name: 'v3外部' });
    const r = await outsider.agent.get('/api/projects/tasks/' + tid + '/files/' + fid + '/download');
    expect(r.status).toBe(403);
  });
  test('未登录下载 → 401/302', async () => {
    const r = await request(app).get('/api/projects/tasks/' + tid + '/files/' + fid + '/download');
    expect([401, 302]).toContain(r.status);
  });
  test('fid 不存在 → 404', async () => {
    const r = await pm.agent.get('/api/projects/tasks/' + tid + '/files/999999/download');
    expect(r.status).toBe(404);
  });
});

// ===== 方案一B：拆分后路由契约（编辑/删除/批量行为不变） =====
describe('方案一B 拆分后契约回归', () => {
  let tid;
  beforeAll(async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'V3-拆分回归' });
    tid = t.body.id;
  });
  test('PUT 编辑 + C1 反例（status → 400）', async () => {
    const d = await pm.agent.get('/api/projects/tasks/' + tid);
    const ok = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: 'V3-拆分回归-改', version: d.body.task.version });
    expect(ok.status).toBe(200);
    const bad = await pm.agent.put('/api/projects/tasks/' + tid).send({ status: 'DONE', version: d.body.task.version + 1 });
    expect(bad.status).toBe(400);
  });
  test('批量流转走 status_eff 匹配（过期任务 action2=RESUME）', async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks')
      .send({ title: 'V3-批量过期', planned_date: '2020-01-01' });
    const r = await pm.agent.post('/api/projects/tasks/batch')
      .send({ action: 'status', ids: [t.body.id], action2: 'RESUME' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toContain(t.body.id);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.body.task.status).toBe('IN_PROGRESS');
  });
});
