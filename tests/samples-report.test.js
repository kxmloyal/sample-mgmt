// tests/samples-report.test.js — 样品报表（2026-09-14｜方案甲：纯前端只读聚合）
// 契约：纯只读（零新增接口/零写操作）、bundle 单作用域安全、路由三处注册齐备、manifest+构建登记、版本三处一致
// 性质：全部为**静态断言**（读文件），不含 DB 运行时段 —— 符合 AGENTS §20.2「已上线子系统只读验证」
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const REPORT = 'subsystems/samples/frontend/js/views/report.js';

describe('样品报表 前端接线（方案甲 · 纯前端只读）', () => {
  test('只复用既有只读端点，不新增报表接口', () => {
    const src = read(REPORT);
    expect(src).toContain("'/api/dashboard'");
    expect(src).toContain("'/api/samples/models?view=wall'");
    expect(src).toContain("'/api/samples/storage-map'");
    expect(src).toContain("'/api/samples?station='");
    expect(src).not.toContain('/api/samples/report');
  });

  test('纯只读：不出现任何写方法', () => {
    const src = read(REPORT);
    ['POST', 'PUT', 'DELETE', 'PATCH'].forEach(function (m) {
      expect(src).not.toContain("'" + m + "'");
    });
  });

  test('bundle 单作用域安全：不以顶层 const/let 声明（重名 = SyntaxError 致全站白屏）', () => {
    const bad = read(REPORT).split('\n').filter(function (l) { return /^(const|let)\s/.test(l); });
    expect(bad).toEqual([]);
  });

  test('顶层标识符唯一：viewReport 与全部 rpt* 辅助函数在 bundle 中各自仅一处声明', () => {
    const bundle = read('subsystems/samples/frontend/js/bundle.js');
    ['viewReport', 'rptStations', 'rptNow', 'rptPct', 'rptPctText', 'rptMicroBar', 'rptFetchStations',
      'rptRenderToolbar', 'rptRenderKpi', 'rptRenderStatus', 'rptRenderModels', 'rptRenderStations',
      'rptRenderAlerts', 'rptRenderStorage', 'rptRenderTodos', 'rptRenderNotes'
    ].forEach(function (n) {
      const decls = bundle.split('function ' + n + '(').length - 1;
      expect([n, decls]).toEqual([n, 1]);
    });
    // 与既有视图函数名不得冲突
    expect(bundle.split('function viewStorageMap(').length - 1).toBe(1);
  });

  test('router.js 三处齐备：NAV + VIEWS + meta（漏一处即路由失效）', () => {
    const r = read('subsystems/samples/frontend/js/router.js');
    expect(r).toContain("{k:'report',t:'样品报表',roles:['ADMIN','RD','ME','QA','CUSTODY']},");
    expect(r).toContain('report:viewReport,');
    expect(r).toContain("report:'样品报表',");
  });

  test('构建登记：bundle-sources.json 含 report.js 且在 router.js 之前', () => {
    const srcs = JSON.parse(read('tools/bundle-sources.json')).samples;
    const iRep = srcs.indexOf(REPORT);
    const iRouter = srcs.indexOf('subsystems/samples/frontend/js/router.js');
    expect(iRep).toBeGreaterThan(-1);
    expect(iRep).toBeLessThan(iRouter);
  });

  test('manifest.navigation 登记报表项，且 deployed 上线标记未被改动', () => {
    const m = JSON.parse(read('subsystems/samples/manifest.json'));
    const nav = (m.navigation || []).filter(function (n) { return n.key === 'report'; });
    expect(nav.length).toBe(1);
    expect(nav[0].view).toBe('viewReport');
    expect(nav[0].roles).toEqual(['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME']);
    expect(m.deployed).toBe(true);
    // 报表不得被写进 navigation 之外改变状态机
    // 2026-09-15：17 → 18 —— 新增 RETIRED→RETIRED 的 CLEAR_STORAGE（清柜释放储位，经用户确认的「档2」），
    // 属有意变更；本守卫的作用就是拦住任何未申报的状态机改动，故随之更新计数。
    expect((m.stateMachine.transitions || []).length).toBe(18);
  });

  test('帮助接线：HELP_PAGE_MAP / HELP_PAGE_TIPS / HELP_DATA 三处均含 report', () => {
    const help = read('subsystems/samples/frontend/js/views/help.js');
    expect(help).toContain("report:'report'");
    expect(help).toContain("report:'样品报表");
    expect(read('subsystems/samples/frontend/js/views/help-data.js')).toContain("id:'report'");
  });

  test('样式归属：.rpt-* 只写本子系统 CSS（2026-09-15 外迁 report.css），禁写 app.css', () => {
    expect(read('subsystems/samples/frontend/css/report.css')).toContain('.rpt-card{');
    expect(read('subsystems/samples/frontend/css/report.css')).toContain('.rpt-bar{');
    expect(read('subsystems/samples/frontend/css/module.css')).not.toContain('.rpt-');
    expect(read('public/css/app.css')).not.toContain('.rpt-');
    // 拆分后 MUST 在 module.css 之后引入 report.css，否则层叠顺序变化会导致报表样式被覆盖
    const html = read('subsystems/samples/frontend/index.html');
    expect(html).toContain('report.css?v=');
    expect(html.indexOf('css/module.css')).toBeLessThan(html.indexOf('css/report.css'));
  });

  test('版本三处一致：bundle 头 = index.html 的 bundle.js?v= = module.css?v=，且文件数与构建清单一致', () => {
    const bundle = read('subsystems/samples/frontend/js/bundle.js');
    const m = bundle.match(/BUNDLE v([a-z0-9]+) — (\d+) files/);
    expect(m).toBeTruthy();
    const ver = m[1];
    const html = read('subsystems/samples/frontend/index.html');
    expect(html).toContain('js/bundle.js?v=' + ver);
    expect(html).toContain('module.css?v=' + ver);
    expect(Number(m[2])).toBe(JSON.parse(read('tools/bundle-sources.json')).samples.length);
  });

  test('跨子系统零副作用：samples 侧不得引用其它子系统的私有类名', () => {
    const src = read(REPORT);
    expect(src).not.toContain('pk-');
    expect(src).not.toContain('fx-');
    expect(src).not.toContain('dash-alert-'); // 看板私有告警样式不复用；共享 .dash-bar / .kb-stat 允许
    expect(src).not.toContain('sm-map-'); // 柜位视图私有样式不复用
  });
});
