// tests/subsystem-scaffold.test.js — 子系统脚手架模板单元测试
const { generateSubsystem, tplManifest } = require('../tools/subsystem-templates');

const ctx = { id: 'mymod', name: '我的模块', description: '测试模块', icon: 'chart', version: '1.0.0',
  withStateMachine: true, withFiles: true, states: ['DRAFT', 'ACTIVE', 'CLOSED'] };

describe('generateSubsystem', () => {
  it('应生成 9 个文件', () => {
    const { files } = generateSubsystem(ctx);
    expect(Object.keys(files)).toHaveLength(9);
  });

  it('manifest 可解析且 id/route/database 正确', () => {
    const { files } = generateSubsystem(ctx);
    const m = JSON.parse(files['manifest.json']);
    expect(m.id).toBe('mymod');
    expect(m.route.prefix).toBe('/api/mymod');
    expect(m.route.entry).toBe('/subsystems/mymod/frontend/index.html');
    expect(m.database.tables).toHaveLength(2);
    expect(m.navigation).toHaveLength(2);
  });

  it('含状态机时 manifest 含 stateMachine（初始态 + 全部状态）', () => {
    const { files } = generateSubsystem(ctx);
    const m = JSON.parse(files['manifest.json']);
    expect(m.stateMachine.initial).toBe('DRAFT');
    expect(Object.keys(m.stateMachine.states)).toEqual(['DRAFT', 'ACTIVE', 'CLOSED']);
  });

  it('含文件管理时 manifest 含 files 配置', () => {
    const { files } = generateSubsystem(ctx);
    const m = JSON.parse(files['manifest.json']);
    expect(m.files.enabled).toBe(true);
    expect(m.files.categories.length).toBeGreaterThan(0);
  });

  it('无状态机时 manifest 不含 stateMachine 键', () => {
    const { files } = generateSubsystem({ ...ctx, withStateMachine: false, states: [] });
    const m = JSON.parse(files['manifest.json']);
    expect(m.stateMachine).toBeUndefined();
  });

  it('schema.sql 幂等（CREATE TABLE IF NOT EXISTS）且含索引', () => {
    const { files } = generateSubsystem(ctx);
    const sql = files['db/schema.sql'];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mymod_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mymod_logs');
    expect(sql).toContain('INDEX idx_mymod_status');
  });

  it('backend 含 ping 与 list 路由，且导出协议三接口', () => {
    const { files } = generateSubsystem(ctx);
    const b = files['backend/index.js'];
    expect(b).toContain("'/api/mymod/ping'");
    expect(b).toContain("'/api/mymod/list'");
    expect(b).toContain('module.exports = { register, initDB, seed }');
  });

  it('前端含 router 与两个 view 文件', () => {
    const { files } = generateSubsystem(ctx);
    expect(files['frontend/js/router.js']).toContain('VIEWS={dashboard:viewDashboard,list:viewList}');
    expect(files['frontend/js/views/dashboard.js']).toContain('function viewDashboard');
    expect(files['frontend/js/views/list.js']).toContain('async function viewList');
    expect(files['frontend/index.html']).toContain('/subsystems/mymod/frontend/js/bundle.js');
  });
});
