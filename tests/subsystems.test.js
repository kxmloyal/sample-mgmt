// tests/subsystems.test.js — 子系统管理模块单元测试
// 覆盖：列表/新建/编辑/导出 + 权限分支（ADMIN/非ADMIN/未登录）
const { getApp, login } = require('./helpers/setup');
const request = require('supertest');
const fs = require('fs');
const path = require('path');

const TEST_ID = 'test-jest-subsystem';
const TEST_DIR = path.join(__dirname, '..', 'subsystems', TEST_ID);

// 测试结束后清理
afterAll(() => {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

beforeAll(async () => {
  await getApp();
  // 确保测试前清理残留
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ============================================================
// GET /api/subsystems — 获取子系统列表（登录后按角色过滤）
// ============================================================
describe('GET /api/subsystems', () => {
  it('未登录应返回空数组（不向匿名访问暴露子系统清单）', async () => {
    const res = await request(await getApp()).get('/api/subsystems');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('返回的每个子系统应包含必要字段（登录后）', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/subsystems');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const sub = res.body[0];
    expect(sub.id).toBeDefined();
    expect(sub.name).toBeDefined();
    expect(sub.icon).toBeDefined();
    expect(sub.route).toBeDefined();
    expect(sub.route.entry).toBeDefined();
    expect(typeof sub.stateCount).toBe('number');
    expect(typeof sub.navCount).toBe('number');
  });

  it('应包含样品管理子系统（登录后）', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/subsystems');
    const samples = res.body.find(function (s) { return s.id === 'samples'; });
    expect(samples).toBeDefined();
    expect(samples.name).toBe('样品管理');
  });

  it('应包含治具管理子系统（登录后）', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/subsystems');
    const fixtures = res.body.find(function (s) { return s.id === 'fixtures'; });
    expect(fixtures).toBeDefined();
    expect(fixtures.name).toBe('治具管理');
  });

  // 2026-08-07 角色过滤：已登录用户仅返回 manifest.roles.use 允许进入的子系统（projects 未完成仅 ADMIN 可见）
  it('已登录 ADMIN 应看到全部子系统（含 projects）', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/subsystems');
    expect(res.status).toBe(200);
    const projects = res.body.find(function (s) { return s.id === 'projects'; });
    expect(projects).toBeDefined();
  });

  it('已登录非 ADMIN（RD）应看不到 projects，但可见 samples/fixtures', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/subsystems');
    expect(res.status).toBe(200);
    const ids = res.body.map(function (s) { return s.id; });
    expect(ids).not.toContain('projects');
    expect(ids).toContain('samples');
    expect(ids).toContain('fixtures');
  });

  it('已登录非 ADMIN（QA）应看不到 projects', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent.get('/api/subsystems');
    const ids = res.body.map(function (s) { return s.id; });
    expect(ids).not.toContain('projects');
  });
});

// ============================================================
// GET /api/subsystems/:id — 获取单个子系统 manifest（公开端点）
// ============================================================
describe('GET /api/subsystems/:id', () => {
  it('应返回完整 manifest', async () => {
    const res = await request(await getApp()).get('/api/subsystems/samples');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('samples');
    expect(res.body.name).toBe('样品管理');
    expect(res.body.route).toBeDefined();
    expect(res.body.stateMachine).toBeDefined();
  });

  it('不存在的子系统应返回 404', async () => {
    const res = await request(await getApp()).get('/api/subsystems/nonexistent');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// POST /api/subsystems — 新建子系统（ADMIN 专属）
// ============================================================
describe('POST /api/subsystems', () => {
  it('未登录应返回 401', async () => {
    const res = await request(await getApp())
      .post('/api/subsystems')
      .send({ id: TEST_ID, name: '测试' });
    expect(res.status).toBe(401);
  });

  it('非 ADMIN (RD) 应返回 403', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: TEST_ID, name: '测试' });
    expect(res.status).toBe(403);
  });

  it('非 ADMIN (QA) 应返回 403', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: TEST_ID, name: '测试' });
    expect(res.status).toBe(403);
  });

  it('非 ADMIN (CUSTODY) 应返回 403', async () => {
    const { agent } = await login('mfg01', 'mfg123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: TEST_ID, name: '测试' });
    expect(res.status).toBe(403);
  });

  it('非 ADMIN (ME) 应返回 403', async () => {
    const { agent } = await login('me01', 'me123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: TEST_ID, name: '测试' });
    expect(res.status).toBe(403);
  });

  it('缺少 id 应返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/subsystems')
      .send({ name: '测试' });
    expect(res.status).toBe(400);
  });

  it('缺少 name 应返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: TEST_ID });
    expect(res.status).toBe(400);
  });

  it('id 包含大写字母应返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: 'BadId', name: '测试' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/kebab-case/);
  });

  it('id 以下划线开头应返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: '_bad', name: '测试' });
    expect(res.status).toBe(400);
  });

  it('ADMIN 应成功创建子系统并生成目录骨架', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .post('/api/subsystems')
      .send({ id: TEST_ID, name: 'Jest测试模块', description: '单元测试创建' });
    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.id).toBe(TEST_ID);

    // 验证磁盘文件
    expect(fs.existsSync(path.join(TEST_DIR, 'manifest.json'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DIR, 'backend', 'index.js'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DIR, 'db', 'schema.sql'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DIR, 'frontend', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_DIR, 'seed', 'seed.js'))).toBe(true);

    // 验证 manifest 内容
    const manifest = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'manifest.json'), 'utf8'));
    expect(manifest.id).toBe(TEST_ID);
    expect(manifest.name).toBe('Jest测试模块');
    expect(manifest.description).toBe('单元测试创建');

    // 清理
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('重复 id 应返回 409', async () => {
    // 先创建一个
    const { agent } = await login('admin', 'admin123');
    await agent.post('/api/subsystems').send({ id: TEST_ID, name: '第一次' });
    // 再创建同名
    const res = await agent.post('/api/subsystems').send({ id: TEST_ID, name: '第二次' });
    expect(res.status).toBe(409);

    // 清理
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('创建后子系统列表应包含新模块', async () => {
    const { agent } = await login('admin', 'admin123');
    await agent.post('/api/subsystems').send({ id: TEST_ID, name: '列表测试' });

    const res = await agent.get('/api/subsystems');
    const found = res.body.find(function (s) { return s.id === TEST_ID; });
    expect(found).toBeDefined();
    expect(found.name).toBe('列表测试');

    // 清理
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('删除子系统后列表应不再包含它', async () => {
    const { agent } = await login('admin', 'admin123');
    await agent.post('/api/subsystems').send({ id: TEST_ID, name: '删除测试' });

    // 删除目录
    fs.rmSync(TEST_DIR, { recursive: true, force: true });

    // 下次请求应刷新 registry（不再包含已删除的）
    const res = await agent.get('/api/subsystems');
    const found = res.body.find(function (s) { return s.id === TEST_ID; });
    expect(found).toBeUndefined();
  });
});

// ============================================================
// PUT /api/subsystems/:id/manifest — 编辑 manifest（ADMIN 专属）
// ============================================================
describe('PUT /api/subsystems/:id/manifest', () => {
  // 每个测试前确保有一个测试子系统
  beforeEach(async () => {
    const { agent } = await login('admin', 'admin123');
    if (!fs.existsSync(TEST_DIR)) {
      await agent.post('/api/subsystems').send({ id: TEST_ID, name: '编辑测试' });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('未登录应返回 401', async () => {
    const res = await request(await getApp())
      .put('/api/subsystems/' + TEST_ID + '/manifest')
      .send({ id: TEST_ID, name: 'x' });
    expect(res.status).toBe(401);
  });

  it('非 ADMIN 应返回 403', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .put('/api/subsystems/' + TEST_ID + '/manifest')
      .send({ id: TEST_ID, name: 'x' });
    expect(res.status).toBe(403);
  });

  it('不存在的子系统应返回 404', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .put('/api/subsystems/nonexistent/manifest')
      .send({ id: 'nonexistent', name: 'x' });
    expect(res.status).toBe(404);
  });

  it('manifest.id 与路径不匹配应返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent
      .put('/api/subsystems/' + TEST_ID + '/manifest')
      .send({ id: 'wrong-id', name: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/必须与路径一致/);
  });

  it('ADMIN 应成功更新 manifest', async () => {
    const { agent } = await login('admin', 'admin123');
    const updated = {
      id: TEST_ID,
      name: '已更新名称',
      description: '单元测试更新',
      version: '2.0.0',
      icon: 'chart',
      route: { prefix: '/api/' + TEST_ID, entry: '/subsystems/' + TEST_ID + '/frontend/index.html', hashBase: '/' + TEST_ID },
      database: { tables: [] },
      roles: { use: ['ADMIN', 'RD'] },
      navigation: [{ key: 'home', label: '首页', icon: 'chart', view: 'renderHome', roles: ['ADMIN', 'RD'] }]
    };
    const res = await agent
      .put('/api/subsystems/' + TEST_ID + '/manifest')
      .send(updated);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    // 验证磁盘文件已更新
    const disk = JSON.parse(fs.readFileSync(path.join(TEST_DIR, 'manifest.json'), 'utf8'));
    expect(disk.name).toBe('已更新名称');
    expect(disk.description).toBe('单元测试更新');
    expect(disk.version).toBe('2.0.0');
    expect(disk.roles.use).toEqual(['ADMIN', 'RD']);
  });
});

// ============================================================
// GET /api/subsystems/:id/export — 导出 manifest（ADMIN 专属）
// ============================================================
describe('GET /api/subsystems/:id/export', () => {
  beforeEach(async () => {
    const { agent } = await login('admin', 'admin123');
    if (!fs.existsSync(TEST_DIR)) {
      await agent.post('/api/subsystems').send({ id: TEST_ID, name: '导出测试' });
    }
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('未登录应返回 401', async () => {
    const res = await request(await getApp()).get('/api/subsystems/' + TEST_ID + '/export');
    expect(res.status).toBe(401);
  });

  it('非 ADMIN 应返回 403', async () => {
    const { agent } = await login('qa01', 'qa123');
    const res = await agent.get('/api/subsystems/' + TEST_ID + '/export');
    expect(res.status).toBe(403);
  });

  it('ADMIN 应成功下载 manifest.json', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/subsystems/' + TEST_ID + '/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.headers['content-disposition']).toContain(TEST_ID + '-manifest.json');
  });

  it('不存在的子系统导出应返回 404', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.get('/api/subsystems/nonexistent/export');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// 权限矩阵全覆盖
// ============================================================
describe('权限矩阵', () => {
  var roles = [
    { role: 'ADMIN',   user: 'admin', pass: 'admin123', canCreate: true,  canEdit: true,  canExport: true },
    { role: 'RD',      user: 'rd01',  pass: 'rd123',   canCreate: false, canEdit: false, canExport: false },
    { role: 'QA',      user: 'qa01',  pass: 'qa123',   canCreate: false, canEdit: false, canExport: false },
    { role: 'CUSTODY', user: 'mfg01', pass: 'mfg123',  canCreate: false, canEdit: false, canExport: false },
    { role: 'ME',      user: 'me01',  pass: 'me123',   canCreate: false, canEdit: false, canExport: false }
  ];

  roles.forEach(function (r) {
    describe(r.role + ' (' + r.user + ')', function () {
      it('POST /api/subsystems → ' + (r.canCreate ? '201' : '403'), async function () {
        const { agent } = await login(r.user, r.pass);
        const res = await agent.post('/api/subsystems').send({ id: 'perm-' + r.user, name: '权限测试' });
        if (r.canCreate) {
          expect(res.status).toBe(201);
          // 清理
          var d = path.join(__dirname, '..', 'subsystems', 'perm-' + r.user);
          if (fs.existsSync(d)) fs.rmSync(d, { recursive: true, force: true });
        } else {
          expect(res.status).toBe(403);
        }
      });

      it('PUT /api/subsystems/samples/manifest → ' + (r.canEdit ? '200' : '403'), async function () {
        var { agent } = await login(r.user, r.pass);
        // 先用 admin 获取完整 manifest
        var { agent: adminAgent } = await login('admin', 'admin123');
        var getRes = await adminAgent.get('/api/subsystems/samples');
        var manifest = getRes.body;

        var res = await agent.put('/api/subsystems/samples/manifest').send(manifest);
        if (r.canEdit) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      });

      it('GET /api/subsystems/samples/export → ' + (r.canExport ? '200' : '403'), async function () {
        var { agent } = await login(r.user, r.pass);
        var res = await agent.get('/api/subsystems/samples/export');
        if (r.canExport) {
          expect(res.status).toBe(200);
        } else {
          expect(res.status).toBe(403);
        }
      });
    });
  });
});
