// tests/samples-storage-map.test.js — 样品柜数字孪生（2026-09-09）
// 契约：端点注册顺序/聚合口径/格位解析/柜配置表/前端接线/manifest+router 注册
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('storage-map 端点（routes-storage-map.js）', () => {
  const src = read('subsystems/samples/backend/routes-storage-map.js');
  test('路由 GET /api/samples/storage-map 登录即可，且注册在 routes-samples 之前（/:id 捕获教训）', () => {
    expect(src).toContain("'/api/samples/storage-map'");
    expect(src).toContain('requireAuth');
    const idx = read('subsystems/samples/backend/index.js');
    expect(idx.indexOf('routes-storage-map')).toBeGreaterThan(-1);
    expect(idx.indexOf('routes-storage-map')).toBeLessThan(idx.indexOf("require('./routes-samples')"));
  });
  test('聚合口径：deleted_at IS NULL；CHECKED_OUT/RETURNING 占位（用户确认领走算占用）', () => {
    expect(src).toContain('deleted_at IS NULL');
    expect(src).toContain("status === 'CHECKED_OUT'");
    expect(src).toContain("status === 'RETURNING'");
  });
  test('格位解析 N#样品柜C-R（含空格脏数据兼容）', () => {
    const { parseLoc, stateOf } = require('../subsystems/samples/backend/routes-storage-map');
    expect(parseLoc('4#样品柜3-7')).toEqual({ key: '4#样品柜', no: 4, col: 3, row: 7 });
    expect(parseLoc('1#样品柜 3-7')).toEqual({ key: '1#样品柜', no: 1, col: 3, row: 7 });
    expect(parseLoc('A区-3架')).toBeNull();
    expect(parseLoc(null)).toBeNull();
    expect(stateOf('IN_CUSTODY')).toBe('in');
    expect(stateOf('CHECKED_OUT')).toBe('out');
    expect(stateOf('NEW')).toBeNull();
  });
  test('柜配置表幂等建表：rows/columns 可配置，ADMIN PUT 端点存在', () => {
    expect(src).toMatch(/CREATE TABLE IF NOT EXISTS sample_storage_cabinets/);
    expect(src).toContain("'/api/samples/storage-map/cabinets/:key'");
    expect(src).toContain("u.role !== 'ADMIN'");
    // 2026-09-09 修复：全局 db.js 无 D.run（臆造接口致「D.run is not a function」）——写操作统一走 D.pool().query
    expect(src).toContain('await D.pool().query(');
    expect(src).not.toContain('D.run(');
  });
});

describe('孪生视图接线（前端/manifest/router）', () => {
  test('视图文件：viewStorageMap 存在且走 hash 路由（列表页按钮 onclick 跳 #/storagemap）', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    expect(view).toContain('function viewStorageMap');
    expect(view).toContain('/api/samples/storage-map');
    const list = read('subsystems/samples/frontend/js/views/list.js');
    expect(list).toContain('#/storagemap');
  });
  test('router VIEWS/NAV/meta 三处注册 storagemap，manifest navigation 有柜位视图', () => {
    const router = read('subsystems/samples/frontend/js/router.js');
    expect(router).toContain('storagemap:viewStorageMap');
    expect(router).toContain("k:'storagemap'");
    const manifest = JSON.parse(read('subsystems/samples/manifest.json'));
    const nav = manifest.navigation.find(n => n.key === 'storagemap');
    expect(nav).toBeTruthy();
    expect(nav.view).toBe('viewStorageMap');
    expect(nav.roles).toContain('CUSTODY');
  });
  test('bundle 源清单登记 storage-map.js', () => {
    const sources = JSON.parse(read('tools/bundle-sources.json'));
    expect(sources.samples).toContain('subsystems/samples/frontend/js/views/storage-map.js');
  });
  test('弹窗关闭用共享 closeModal（禁 projects 域 pCloseModal——跨域臆造致关不掉）', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    // 源码里 \\' 转义后的字面是 closeModal(this.closest(\\'.modal-mask\\'))，断言取稳定子串
    expect(view).toContain("closeModal(this.closest(");
    expect(view).toContain("if (m) closeModal(m);");
    expect(view).not.toContain('pCloseModal');
  });
});
