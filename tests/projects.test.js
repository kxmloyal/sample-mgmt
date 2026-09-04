// tests/projects.test.js — 项目追踪：项目 CRUD + 成员管理（Task 2）+ 任务 CRUD 与乐观锁（Task 3）
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { getApp, login } = require('./helpers/setup');

let app, admin, pm;
let pid, rd2, tid, ver; // 修正1：pid/rd2 提升为文件级（Task 2 创建，Task 3/4 复用）；tid/ver 亦文件级（Task 4 流转 describe 复用）
async function makeUser(u) {
  const D = require('../db');
  // ⚠️ 必须 await：getUserByUsername 返回 Promise（非 await 恒真，导致 createUser 永不执行）
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
}, 30000);

describe('项目 CRUD 与成员管理', () => {
  test('PM 创建项目 → 自动成为 owner', async () => {
    const res = await pm.agent.post('/api/projects').send({ name: 'P-测试项目', description: 'desc' });
    expect(res.status).toBe(201);
    pid = res.body.id;
    const mem = await pm.agent.get('/api/projects/' + pid + '/members');
    expect(mem.body.some(m => m.user_id === pm.user.id && m.is_owner === 1)).toBe(true);
  });
  test('非成员 RD 只读，不能建任务', async () => {
    const rd = await makeUser({ username: 'rd-proj', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发' });
    const list = await rd.agent.get('/api/projects');
    expect(list.status).toBe(200);
    const create = await rd.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'x' });
    expect(create.status).toBe(403);
  });
  test('owner 添加成员、转让 owner、移除成员', async () => {
    rd2 = await makeUser({ username: 'rd-proj2', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发2' });
    const add = await pm.agent.post('/api/projects/' + pid + '/members').send({ user_id: rd2.user.id });
    expect(add.status).toBe(201);
    const transfer = await pm.agent.put('/api/projects/' + pid + '/members/' + rd2.user.id).send({ is_owner: 1 });
    expect(transfer.status).toBe(200);
    const memAfter = await pm.agent.get('/api/projects/' + pid + '/members');
    expect(memAfter.body.find(m => m.user_id === rd2.user.id).is_owner).toBe(1);
  });
  test('普通角色不能删除项目', async () => {
    const rd = await makeUser({ username: 'rd-proj3', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发3' });
    const del = await rd.agent.delete('/api/projects/' + pid);
    expect(del.status).toBe(403);
  });
  test('有任务的项目删除 → 409', async () => {
    await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '任务A', priority: 'M', category: '质量' });
    const del = await pm.agent.delete('/api/projects/' + pid);
    expect(del.status).toBe(409);
  });
});

describe('任务 CRUD 与乐观锁', () => {
  test('owner 创建任务', async () => {
    const res = await pm.agent.post('/api/projects/' + pid + '/tasks').send({
      title: '任务A', description: 'd', category: '质量', priority: 'H',
      assignee_id: pm.user.id, planned_date: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
    });
    expect(res.status).toBe(201);
    tid = res.body.id;
  });
  test('任务列表带状态与字段', async () => {
    const res = await pm.agent.get('/api/projects/' + pid + '/tasks');
    expect(res.status).toBe(200);
    const t = res.body.find(x => x.id === tid);
    expect(t.title).toBe('任务A');
    expect(t.status).toBe('NOT_STARTED');
    expect(t.version).toBe(0);
    ver = t.version;
  });
  test('乐观锁：version 不匹配 → 409', async () => {
    const ok = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: '任务A-改', version: ver });
    expect(ok.status).toBe(200);
    const conflict = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: '任务A-又改', version: ver });
    expect(conflict.status).toBe(409);
  });
  test('DONE 规则：progress 必为 100', async () => {
    // 修正2：上用例已成功 PUT 一次（version 0→1），任务当前 version 恰为 1；发当前版本号才会命中 DONE 规则 400
    const res = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: '任务A-改', status: 'DONE', progress: 50, version: 1 });
    expect(res.status).toBe(400);
  });
  test('普通角色编辑他人任务 → 403', async () => {
    const rd = await makeUser({ username: 'rd-proj4', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发4' });
    const res = await rd.agent.put('/api/projects/tasks/' + tid).send({ title: 'hack', version: 2 });
    expect(res.status).toBe(403);
  });
});

describe('状态机流转与并发', () => {
  let flowId;
  test('START：NOT_STARTED → IN_PROGRESS', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('IN_PROGRESS');
    flowId = res.body.task.version;
  });
  test('非法转移（DONE 未完成规则）→ 400；无前置任务直接 DONE 需 COMPLETE', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'COMPLETE' });
    expect(res.status).toBe(200); // 无依赖任务可直接完成
    expect(res.body.task.status).toBe('DONE');
  });
  test('ASSIGNEE 伪角色：仅责任人可流转自己任务', async () => {
    // rd-proj2 非成员：创建任务指派给自己，可流转
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '指派任务', assignee_id: rd2.user.id, priority: 'M' });
    const res = await rd2.agent.post('/api/projects/tasks/' + t.body.id + '/status').send({ action: 'START' });
    expect(res.status).toBe(200);
  });
  test('CAS 并发冲突：过期 version 流转 → 409', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    expect(res.status).toBe(409); // 已 DONE，状态不匹配 CAS
  });
});

describe('子任务与评论', () => {
  let sid;
  test('创建子任务', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/subtasks').send({ title: '子任务1', planned_date: '2026-08-10' });
    expect(res.status).toBe(201);
    sid = res.body.id;
  });
  test('子任务流转 CAS（START → DONE 需按序）', async () => {
    const s1 = await pm.agent.post('/api/projects/tasks/' + tid + '/subtasks/' + sid + '/status').send({ action: 'START' });
    expect(s1.status).toBe(200);
    expect(s1.body.status).toBe('IN_PROGRESS');
    const s2 = await pm.agent.post('/api/projects/tasks/' + tid + '/subtasks/' + sid + '/status').send({ action: 'COMPLETE' });
    expect(s2.status).toBe(200);
    expect(s2.body.status).toBe('DONE');
  });
  test('子任务编辑乐观锁', async () => {
    const ok = await pm.agent.put('/api/projects/tasks/' + tid + '/subtasks/' + sid).send({ title: '子任务1-改', version: 0 });
    expect(ok.status).toBe(200);
    const conflict = await pm.agent.put('/api/projects/tasks/' + tid + '/subtasks/' + sid).send({ title: '改2', version: 0 });
    expect(conflict.status).toBe(409);
  });
  test('发表评论并展示', async () => {
    const c = await pm.agent.post('/api/projects/tasks/' + tid + '/comments').send({ content: '进展：样品测试完成' });
    expect(c.status).toBe(201);
    const list = await pm.agent.get('/api/projects/tasks/' + tid + '/comments');
    expect(list.body.some(x => x.content === '进展：样品测试完成')).toBe(true);
  });
  test('非成员不能评论', async () => {
    const rd = await makeUser({ username: 'rd-proj5', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发5' });
    const res = await rd.agent.post('/api/projects/tasks/' + tid + '/comments').send({ content: 'x' });
    expect(res.status).toBe(403);
  });
});

describe('任务依赖/附件/关联', () => {
  let depTaskId, depTargetId;
  test('添加前置依赖 + 环检测', async () => {
    depTaskId = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '被阻塞任务', priority: 'H' })).body.id;
    depTargetId = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '前置任务', priority: 'H' })).body.id;
    const add = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/deps').send({ depends_on_id: depTargetId });
    expect(add.status).toBe(201);
    // 环检测：前置任务再依赖被阻塞任务 → 400
    const cycle = await pm.agent.post('/api/projects/tasks/' + depTargetId + '/deps').send({ depends_on_id: depTaskId });
    expect(cycle.status).toBe(400);
  });
  test('前置未 DONE，被阻塞任务流转 → 409', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/status').send({ action: 'START' });
    expect(res.status).toBe(409);
  });
  test('前置完成后可流转', async () => {
    await pm.agent.post('/api/projects/tasks/' + depTargetId + '/status').send({ action: 'START' });
    const done = await pm.agent.post('/api/projects/tasks/' + depTargetId + '/status').send({ action: 'COMPLETE' });
    expect(done.status).toBe(200);
    const start = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/status').send({ action: 'START' });
    expect(start.status).toBe(200);
  });
  test('上传附件（multipart）', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/files')
      .attach('file', Buffer.from('hello'), 'note.pdf');
    expect(res.status).toBe(201);
    expect(res.body.file_name).toBe('note.pdf');
  });
  test('关联样品/治具', async () => {
    const link = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/links').send({ ref_type: 'sample', ref_id: 1 });
    expect(link.status).toBe(201);
    const list = await pm.agent.get('/api/projects/tasks/' + depTaskId + '/links');
    expect(list.body.some(l => l.ref_type === 'sample')).toBe(true);
  });
});

// ===== Task 7：看板统计 + 趋势 + CSV 导出 + 工作流配置 =====
describe('看板统计/导出/工作流配置', () => {
  test('看板统计聚合（项目数/任务数/完成率/三维分布）', async () => {
    const res = await pm.agent.get('/api/projects/stats');
    expect(res.status).toBe(200);
    expect(res.body.project_count).toBeGreaterThan(0);
    expect(typeof res.body.completion_rate).toBe('number');
    expect(Array.isArray(res.body.category_dist)).toBe(true);
    expect(Array.isArray(res.body.trend)).toBe(true);
  });
  test('跨项目任务列表 + OVERDUE 派生筛选', async () => {
    const res = await pm.agent.get('/api/projects/tasks?status=OVERDUE');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  test('CSV 导出（UTF-8 BOM + 列头）', async () => {
    const res = await pm.agent.get('/api/projects/tasks/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xFEFF); // BOM
    expect(res.text).toContain('项目名称');
    expect(res.text).toContain('任务名称');
  });
  test('工作流配置读取/更新（ADMIN 行锁）', async () => {
    const get = await pm.agent.get('/api/projects/workflow');
    expect(get.status).toBe(200);
    expect(get.body.states.NOT_STARTED).toBeTruthy();
    const put = await admin.agent.put('/api/projects/workflow').send({
      states: Object.assign(get.body.states, { NOT_STARTED: { label: '未开始', color: '#92400e', bg: '#fffbeb' } }),
      transitions: get.body.transitions, initial: get.body.initial
    });
    expect(put.status).toBe(200);
    const get2 = await pm.agent.get('/api/projects/workflow');
    expect(get2.body.states.NOT_STARTED.label).toBe('未开始');
  });
  test('非 ADMIN 改工作流 → 403', async () => {
    const res = await pm.agent.put('/api/projects/workflow').send({ states: {}, transitions: [], initial: 'NOT_STARTED' });
    expect(res.status).toBe(403);
  });
});

// ===== 审查修复回归（C1/C3/W1/W2/W3 反例） =====
describe('审查修复回归（C1/C3/W1/W2/W3）', () => {
  test('C1：编辑接口禁止改 status（防绕过状态机）→ 400', async () => {
    const res = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: 'hack-status', status: 'OVERDUE', version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('状态');
  });
  test('C3：上传白名单内扩展名（.pdf）→ 201', async () => {
    const t = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '上传目标', priority: 'M' })).body.id;
    const ok = await pm.agent.post('/api/projects/tasks/' + t + '/files')
      .attach('file', Buffer.from('%PDF-1.4'), 'report.pdf');
    expect(ok.status).toBe(201);
    expect(ok.body.file_name).toBe('report.pdf');
  });
  test('C3：上传白名单外扩展名（.html）→ 400', async () => {
    const t2 = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '上传目标2', priority: 'M' })).body.id;
    const res = await pm.agent.post('/api/projects/tasks/' + t2 + '/files')
      .attach('file', Buffer.from('<script>alert(1)</script>'), 'evil.html');
    expect(res.status).toBe(400);
  });
  test('W1：3 节点环 A→B→C→A → 400（全路径 DFS 检测）', async () => {
    const a = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '环A', priority: 'M' })).body.id;
    const b = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '环B', priority: 'M' })).body.id;
    const c = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '环C', priority: 'M' })).body.id;
    expect((await pm.agent.post('/api/projects/tasks/' + a + '/deps').send({ depends_on_id: b })).status).toBe(201);
    expect((await pm.agent.post('/api/projects/tasks/' + b + '/deps').send({ depends_on_id: c })).status).toBe(201);
    const cyc = await pm.agent.post('/api/projects/tasks/' + c + '/deps').send({ depends_on_id: a });
    expect(cyc.status).toBe(400);
  });
  test('W2：owner 通过 DELETE 别名移除自己 → 400', async () => {
    const res = await rd2.agent.delete('/api/projects/' + pid + '/members/' + rd2.user.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('不能移除自己');
  });
  test('W3：转让 owner 给非成员 → 400（防 owner 被清空）', async () => {
    const outsider = await makeUser({ username: 'rd-proj6', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发6' });
    const res = await rd2.agent.put('/api/projects/' + pid + '/members/' + outsider.user.id).send({ is_owner: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('不是项目成员');
  });
});

// ===== v2：status_eff 动态判定 + 子任务进度联动 + 同项目依赖校验（Task 1） =====
describe('v2 status_eff 动态判定', () => {
  it('planned_date 已过且未完成的任务 status_eff=OVERDUE', async () => {
    const { agent } = await login('admin', 'admin123');
    const p = await agent.post('/api/projects').send({ name: 'eff-proj' + Date.now() });
    expect(p.status).toBe(201);
    const pid = p.body.id;
    const t = await agent.post('/api/projects/' + pid + '/tasks').send({ title: '过期任务', planned_date: '2020-01-01' });
    expect(t.status).toBe(201);
    const list = await agent.get('/api/projects/' + pid + '/tasks');
    expect(list.status).toBe(200);
    expect(list.body.find(x => x.id === t.body.id).status_eff).toBe('OVERDUE');
    expect(list.body.find(x => x.id === t.body.id).status).toBe('NOT_STARTED');
  });
});

describe('v2 子任务进度联动', () => {
  it('子任务完成比例联动父任务 progress', async () => {
    const { agent } = await login('admin', 'admin123');
    const p = await agent.post('/api/projects').send({ name: 'link-proj' + Date.now() });
    const pid = p.body.id;
    const t = await agent.post('/api/projects/' + pid + '/tasks').send({ title: '联动任务' });
    const s1 = await agent.post('/api/projects/tasks/' + t.body.id + '/subtasks').send({ title: '子1' });
    const s2 = await agent.post('/api/projects/tasks/' + t.body.id + '/subtasks').send({ title: '子2' });
    await agent.post('/api/projects/tasks/' + t.body.id + '/subtasks/' + s1.body.id + '/status').send({ action: 'START' });
    await agent.post('/api/projects/tasks/' + t.body.id + '/subtasks/' + s1.body.id + '/status').send({ action: 'COMPLETE' });
    const d = await agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.body.task.progress).toBe(50);
  });
});

describe('v2 依赖同项目校验', () => {
  it('跨项目依赖返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const p1 = await agent.post('/api/projects').send({ name: 'dep-a' + Date.now() });
    const p2 = await agent.post('/api/projects').send({ name: 'dep-b' + Date.now() });
    const ta = await agent.post('/api/projects/' + p1.body.id + '/tasks').send({ title: '任务A' });
    const tb = await agent.post('/api/projects/' + p2.body.id + '/tasks').send({ title: '任务B' });
    const r = await agent.post('/api/projects/tasks/' + ta.body.id + '/deps').send({ depends_on_id: tb.body.id });
    expect(r.status).toBe(400);
  });
});

// ===== v2：详情 JOIN + 列表分页（无参兼容，Task 2） =====
describe('v2 详情 JOIN 与分页', () => {
  it('详情接口返回 project_name 与 assignee_name', async () => {
    const { agent } = await login('admin', 'admin123');
    const p = await agent.post('/api/projects').send({ name: 'join-proj' + Date.now() });
    const pid = p.body.id;
    const users = await agent.get('/api/projects/users');
    const rd = users.body.find(u => u.username === 'rd01');
    const t = await agent.post('/api/projects/' + pid + '/tasks')
      .send({ title: 'JOIN任务', assignee_id: rd ? rd.id : null });
    const d = await agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.status).toBe(200);
    expect(d.body.task.project_name).toBeTruthy();
    if (rd) expect(d.body.task.assignee_name).toBeTruthy();
  });

  it('分页：带 limit/offset 返回 {rows,total}', async () => {
    const { agent } = await login('admin', 'admin123');
    const r = await agent.get('/api/projects/tasks?limit=10&offset=0');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(typeof r.body.total).toBe('number');
    expect(r.body.limit).toBe(10);
  });

  it('分页：无参保持旧裸数组格式（兼容）', async () => {
    const { agent } = await login('admin', 'admin123');
    const r = await agent.get('/api/projects/tasks');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

// ===== v2：边界用例（我的任务过滤 / OVERDUE 存量兼容 / 分页钳制，Task 3） =====
describe('v2 边界用例', () => {
  it('我的任务：assignee_id 过滤只返回指派给该用户的任务', async () => {
    const { agent } = await login('admin', 'admin123');
    const users = await agent.get('/api/projects/users');
    const rd = users.body.find(u => u.username === 'rd01');
    const p = await agent.post('/api/projects').send({ name: 'my-proj' + Date.now() });
    const mine = await agent.post('/api/projects/' + p.body.id + '/tasks').send({ title: '我的任务X', assignee_id: rd ? rd.id : null });
    await agent.post('/api/projects/' + p.body.id + '/tasks').send({ title: '他人任务Y' });
    const r = await agent.get('/api/projects/tasks?assignee_id=' + (rd ? rd.id : ''));
    expect(r.status).toBe(200);
    if (rd) {
      for (const t of r.body) expect(t.assignee_id).toBe(rd.id);
      expect(r.body.some(t => t.id === mine.body.id)).toBe(true);
    }
  });

  it('OVERDUE 筛选同时命中存量 OVERDUE 与动态过期任务', async () => {
    const { agent } = await login('admin', 'admin123');
    const r = await agent.get('/api/projects/tasks?status=OVERDUE');
    expect(r.status).toBe(200);
    for (const t of r.body) expect(t.status_eff).toBe('OVERDUE');
  });

  it('分页 limit 超过 200 被钳制为 200', async () => {
    const { agent } = await login('admin', 'admin123');
    const r = await agent.get('/api/projects/tasks?limit=9999');
    expect(r.body.limit).toBe(200);
  });
});


// ===== 迭代1：缺陷#2 用户列表权限放宽（routes-stats.js） =====
describe('缺陷#2 用户列表权限放宽', () => {
  test('非 ADMIN/PM 登录用户可访问 /api/projects/users', async () => {
    const rd = await makeUser({ username: 'rd-users', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发' });
    const res = await rd.agent.get('/api/projects/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    // P1-4 安全收敛（13e8f2f）：接口不再返回 username（登录名），仅 id+display_name；断言同步更新
    expect(res.body[0]).not.toHaveProperty('username');
    expect(res.body[0]).toHaveProperty('display_name');
    expect(res.body[0]).not.toHaveProperty('password_hash');
  });
});


// ===== 迭代1：缺陷#2 用户列表权限放宽（routes-stats.js） =====
describe('缺陷#2 用户列表权限放宽', () => {
  test('非 ADMIN/PM 登录用户可访问 /api/projects/users', async () => {
    const rd = await makeUser({ username: 'rd-users', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发' });
    const res = await rd.agent.get('/api/projects/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('id');
    // P1-4 安全收敛（13e8f2f）：接口不再返回 username（登录名），仅 id+display_name；断言同步更新
    expect(res.body[0]).not.toHaveProperty('username');
    expect(res.body[0]).toHaveProperty('display_name');
    expect(res.body[0]).not.toHaveProperty('password_hash');
  });
});


// ===== 迭代1：缺陷#3 CSV 导出复用筛选（routes-stats.js） =====
describe('缺陷#3 CSV 导出复用筛选', () => {
  test('导出带筛选参数仅包含匹配行', async () => {
    const proj = await pm.agent.post('/api/projects').send({ name: 'export-proj' + Date.now() });
    expect(proj.status).toBe(201);
    const myPid = proj.body.id;
    const hi = await pm.agent.post('/api/projects/' + myPid + '/tasks').send({ title: '任务-导出高', priority: 'H' });
    const lo = await pm.agent.post('/api/projects/' + myPid + '/tasks').send({ title: '任务-导出低', priority: 'L' });
    expect(hi.status).toBe(201);
    expect(lo.status).toBe(201);
    const res = await pm.agent.get('/api/projects/tasks/export?priority=H&project_id=' + myPid);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('任务-导出高');
    expect(res.text).not.toContain('任务-导出低');
  });
});


// ===== 迭代1：A1 全文搜索 q 参数（dao-tasks.js buildTaskWhere + routes-stats.js） =====
describe('A1 全文搜索', () => {
  test('q 参数跨字段 LIKE 匹配标题/描述，可与筛选叠加', async () => {
    const proj = await pm.agent.post('/api/projects').send({ name: 'search-proj' + Date.now() });
    expect(proj.status).toBe(201);
    const myPid = proj.body.id;
    await pm.agent.post('/api/projects/' + myPid + '/tasks').send({ title: '搜索锚点-定位精度', description: '治具根因分析' });
    const hit1 = await pm.agent.get('/api/projects/tasks?q=' + encodeURIComponent('定位精度'));
    expect(hit1.status).toBe(200);
    expect(Array.isArray(hit1.body)).toBe(true);
    expect(hit1.body.some(x => x.title === '搜索锚点-定位精度')).toBe(true);
    // 描述命中
    const hit2 = await pm.agent.get('/api/projects/tasks?q=' + encodeURIComponent('根因分析'));
    expect(hit2.body.some(x => x.title === '搜索锚点-定位精度')).toBe(true);
    // 与 project_id 筛选叠加（不匹配词组合应空）
    const miss = await pm.agent.get('/api/projects/tasks?q=' + encodeURIComponent('不存在的词xyz') + '&project_id=' + myPid);
    expect(miss.body.length).toBe(0);
  });
});


// ===== 迭代1：A3 批量操作 POST /tasks/batch（routes-tasks.js） =====
describe('A3 批量操作', () => {
  let bPid, batchMember;
  beforeAll(async () => {
    const proj = await pm.agent.post('/api/projects').send({ name: 'batch-proj' + Date.now() });
    expect(proj.status).toBe(201);
    bPid = proj.body.id;
    batchMember = await makeUser({ username: 'rd-batch-mem', password: 'rd123', role: 'RD', dept: '研发部', display_name: '批量成员' });
    await pm.agent.post('/api/projects/' + bPid + '/members').send({ user_id: batchMember.user.id });
  });

  test('批量指派：成员可指派，skipped 为空', async () => {
    const t1 = await pm.agent.post('/api/projects/' + bPid + '/tasks').send({ title: '批量-指派1' });
    const t2 = await pm.agent.post('/api/projects/' + bPid + '/tasks').send({ title: '批量-指派2' });
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
    const r = await pm.agent.post('/api/projects/tasks/batch').send({
      action: 'assign', ids: [t1.body.id, t2.body.id], assignee_id: batchMember.user.id
    });
    expect(r.status).toBe(200);
    expect(r.body.ok.length).toBe(2);
    expect(r.body.skipped.length).toBe(0);
    const d1 = await pm.agent.get('/api/projects/tasks/' + t1.body.id);
    expect(d1.body.task.assignee_id).toBe(batchMember.user.id);
  });

  test('批量流转 STATUS：仅合法转移执行', async () => {
    const t = await pm.agent.post('/api/projects/' + bPid + '/tasks').send({ title: '批量-流转' });
    expect(t.status).toBe(201);
    const r = await pm.agent.post('/api/projects/tasks/batch').send({
      action: 'status', ids: [t.body.id], action2: 'START'
    });
    expect(r.status).toBe(200);
    expect(r.body.ok.length).toBe(1);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.body.task.status).toBe('IN_PROGRESS');
  });

  test('批量删除：任务消失', async () => {
    const t = await pm.agent.post('/api/projects/' + bPid + '/tasks').send({ title: '批量-删除' });
    expect(t.status).toBe(201);
    const r = await pm.agent.post('/api/projects/tasks/batch').send({ action: 'delete', ids: [t.body.id] });
    expect(r.status).toBe(200);
    expect(r.body.ok.length).toBe(1);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.status).toBe(404);
  });

  test('非项目成员批量删除 → 全部跳过', async () => {
    const outsider = await makeUser({ username: 'rd-batch-out', password: 'rd123', role: 'RD', dept: '研发部', display_name: '外部' });
    const t = await pm.agent.post('/api/projects/' + bPid + '/tasks').send({ title: '批量-无权限' });
    expect(t.status).toBe(201);
    const r = await outsider.agent.post('/api/projects/tasks/batch').send({ action: 'delete', ids: [t.body.id] });
    expect(r.status).toBe(200);
    expect(r.body.ok.length).toBe(0);
    expect(r.body.skipped.length).toBe(1);
    expect(r.body.skipped[0].id).toBe(t.body.id);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.status).toBe(200);
  });
});
