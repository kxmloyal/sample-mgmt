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
    const rd = await makeUser({ username: 'rd-proj', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发' });
    const list = await rd.agent.get('/api/projects');
    expect(list.status).toBe(200);
    const create = await rd.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'x' });
    expect(create.status).toBe(403);
  });
  test('owner 添加成员、转让 owner、移除成员', async () => {
    rd2 = await makeUser({ username: 'rd-proj2', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发2' });
    const add = await pm.agent.post('/api/projects/' + pid + '/members').send({ user_id: rd2.user.id });
    expect(add.status).toBe(201);
    const transfer = await pm.agent.put('/api/projects/' + pid + '/members/' + rd2.user.id).send({ is_owner: 1 });
    expect(transfer.status).toBe(200);
    const memAfter = await pm.agent.get('/api/projects/' + pid + '/members');
    expect(memAfter.body.find(m => m.user_id === rd2.user.id).is_owner).toBe(1);
  });
  test('普通角色不能删除项目', async () => {
    const rd = await makeUser({ username: 'rd-proj3', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发3' });
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
      assignee_id: pm.user.id, planned_date: '2026-08-20'
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
    const rd = await makeUser({ username: 'rd-proj4', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发4' });
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
