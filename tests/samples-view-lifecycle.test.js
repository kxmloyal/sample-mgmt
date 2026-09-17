// tests/samples-view-lifecycle.test.js — SPA 视图生命周期、共享监听器与提示条容器（2026-09-17）
// 背景（docs/samples-review-2026-09-17.md）：
//   P1-8 `shared/frontend/shared/utils.js` 的 _initColResize 按「每个含 .col-rsz 的表头」各注册一组
//        document mousemove/mouseup（12 列 = 每次渲染 +24 个监听器），全文件 removeEventListener 0 次，
//        闭包持有 cols/ths 导致旧表格 DOM 无法回收；
//   P1-9 摄像头与 rAF 在切页后不回收（stopCamera 仅检测成功时触发），router.js 无卸载协议（§25.6.1）；
//   P1-6 上下文提示条写在 #view 内，被 6 个视图 await 后的整体 innerHTML 重写静默清除；
//   P3-16 HELP_PAGE_MAP 仍含已移除的 users、缺 models。
// 本测试只做静态断言（读源码/HTML + 正则），不连数据库、不起服务，故对 deployed:true 的 samples 亦安全。
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
const count = (s, re) => (s.match(re) || []).length;
const block = (src, head) => src.slice(src.indexOf(head), src.indexOf('};', src.indexOf(head)));
const keys = t => (t.match(/[A-Za-z_]+\s*:/g) || []).map(s => s.replace(/\s*:/, '')).sort();

const UTILS = 'shared/frontend/shared/utils.js';
const ROUTER = 'subsystems/samples/frontend/js/router.js';
const CAMERA = 'subsystems/samples/frontend/js/views/scan-camera.js';
const HELP = 'subsystems/samples/frontend/js/views/help.js';
const HTML = 'subsystems/samples/frontend/index.html';

describe('P1-8 共享 _initColResize 的 document 监听器泄漏（shared/frontend/shared/utils.js）', () => {
  it('document 级 mousemove/mouseup 为常数级（各 1 个，与表格列数无关）', () => {
    const src = read(UTILS);
    expect(count(src, /document\.addEventListener\(/g)).toBe(2);
    expect(count(src, /addEventListener\('mousemove'/g)).toBe(1);
    expect(count(src, /addEventListener\('mouseup'/g)).toBe(1);
  });

  it('不再按表头逐个注册（ths.forEach 已移除），改为表格内事件委托 + 单例守卫', () => {
    const src = read(UTILS);
    expect(src).not.toContain('ths.forEach');
    expect(src).not.toContain("th.querySelector('.col-rsz')");
    expect(src).toContain('_colRszBound'); // 单例守卫：全页只注册一次
    expect(src).toContain("classList.contains('col-rsz')"); // 委托命中 .col-rsz 把手
  });

  it('拖动状态在 mouseup 清空（不再永久持有表格 DOM）', () => {
    expect(read(UTILS)).toContain('_colRszState = null');
  });

  it('函数名与签名 _initColResize(table) 不变，既有调用点无需改动', () => {
    expect(read(UTILS)).toContain('function _initColResize(table)');
    // samples 5 个调用点（list-render.js ×1 / dashboard.js ×4）与 fixtures 3 个调用点（logs/list/dashboard）
    const callers = [
      'subsystems/samples/frontend/js/views/list-render.js',
      'subsystems/samples/frontend/js/views/dashboard.js',
      'subsystems/fixtures/frontend/js/views/logs.js',
      'subsystems/fixtures/frontend/js/views/list.js',
      'subsystems/fixtures/frontend/js/views/dashboard.js',
    ];
    callers.forEach(p => expect(read(p)).toContain('_initColResize('));
  });
});

describe('P1-9 / §25.6.1 视图卸载协议（router.js + scan-camera.js）', () => {
  it('route() 在覆写 #view 之前调用上一个视图的 leave 钩子', () => {
    const src = read(ROUTER);
    const iLeave = src.indexOf('_prevView.leave()');
    const iRender = src.indexOf('  v();');
    expect(iLeave).toBeGreaterThan(-1);
    expect(iRender).toBeGreaterThan(iLeave);
    expect(src).toContain('typeof _prevView.leave===');
  });

  it('VIEWS 同时支持裸函数（原行为）与 {render,leave} 对象（兼容优先，逐步迁移）', () => {
    const src = read(ROUTER);
    expect(src).toContain("typeof entry==='function'?entry:entry.render");
    expect(src).toContain('dashboard:viewDashboard'); // 既有裸函数项保持原样
  });

  it('scan 视图以对象字面量登记 leave，并在其中带守卫调用 stopCamera（未改 scan.js）', () => {
    const m = read(ROUTER).match(/scan:\{render:viewScan,leave:function\(\)\{([^}]*)\}\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toContain("typeof stopCamera==='function'");
    expect(m[1]).toContain('stopCamera()');
  });

  it('stopCamera 做全四件事：取消 rAF / track.stop / 清 srcObject / 置空 _camStream，且幂等不抛错', () => {
    const src = read(CAMERA);
    const body = src.slice(src.indexOf('function stopCamera()'), src.indexOf('function renderCameraSection'));
    expect(body).toContain('cancelAnimationFrame(_camRaf)');
    expect(body).toContain('t.stop()');
    expect(body).toContain('_camStream=null');
    expect(body).toContain('v.srcObject=null');
    expect(body).toContain("var v=$('#cam');if(v){"); // #cam 不在页面时也不抛错（重复调用安全）
  });

  it('检测循环持有 rAF 句柄，并在流停止后自终止（杜绝循环残留）', () => {
    const src = read(CAMERA);
    expect(src).toContain('_camRaf=requestAnimationFrame(tick)');
    expect(src).toContain('if(!_camStream)return;');
  });

  it('路由令牌 _routeSeq 由 route() 自增（在途请求写已卸载 DOM 的判定依据）', () => {
    const src = read(ROUTER);
    expect(src).toContain('var _routeSeq=0');
    const iSeq = src.indexOf('_routeSeq++;');
    expect(iSeq).toBeGreaterThan(-1);
    expect(iSeq).toBeLessThan(src.indexOf('  v();'));
  });
});

describe('P1-6 提示条容器与 #view 平级（index.html + router.js）', () => {
  it('#page-hint 位于 #view 之前，且 #view 仍为空容器（提示条不可能是它的子元素）', () => {
    const html = read(HTML);
    const iHint = html.indexOf('id="page-hint"');
    const iView = html.indexOf('id="view"');
    expect(iHint).toBeGreaterThan(-1);
    expect(iView).toBeGreaterThan(iHint);
    expect(html).toContain('<div id="page-hint"></div>');
    expect(html).toContain('<div id="view"></div>');
  });

  it('router.js 把提示条渲染进 #page-hint，且不再 insertAdjacentHTML 进 #view', () => {
    const src = read(ROUTER);
    expect(src).toContain('hintBox.innerHTML=renderContextHint(k)');
    expect(src).toContain("$('#page-hint')");
    expect(src).not.toContain("insertAdjacentHTML('afterbegin'");
  });

  it('未新增/删除 script 标签（仍为 fluentui module + 单 bundle defer）', () => {
    expect(count(read(HTML), /<script /g)).toBe(2);
  });
});

describe('P3-16 帮助页映射表维护（help.js）', () => {
  it('HELP_PAGE_MAP 含 models、不含已移除的 users', () => {
    const map = block(read(HELP), 'var HELP_PAGE_MAP={');
    expect(map).toMatch(/models\s*:/);
    expect(map).not.toMatch(/users/);
  });

  it('上下文提示文案同步补 models（否则 renderContextHint 仍返回空，提示条不显示）', () => {
    const tips = block(read(HELP), 'var HELP_PAGE_TIPS={');
    expect(tips).toMatch(/models\s*:/);
    expect(tips).not.toMatch(/users\s*:/);
  });

  it('映射表/文案键集合与 router.js 的 NAV 键集合一致（防再次漂移）', () => {
    const navKeys = (read(ROUTER).match(/\{k:'[a-z]+'/g) || []).map(s => s.slice(4, -1)).sort();
    expect(keys(block(read(HELP), 'var HELP_PAGE_MAP={'))).toEqual(navKeys);
    expect(keys(block(read(HELP), 'var HELP_PAGE_TIPS={'))).toEqual(navKeys);
  });
});
