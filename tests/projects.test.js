// tests/projects.test.js — 项目追踪：项目 CRUD + 成员管理（Task 2）
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { getApp, login } = require('./helpers/setup');

let app, admin, pm;
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
  let pid;
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
    const rd2 = await makeUser({ username: 'rd-proj2', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发2' });
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
