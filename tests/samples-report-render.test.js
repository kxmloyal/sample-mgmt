// tests/samples-report-render.test.js — 样品报表运行时渲染契约（2026-09-14｜方案甲）
// 与 samples-report.test.js 的分工：那个只做静态断言（证明「接了线」），本文件在 vm 沙箱内
// **真实执行 viewReport()** 并注入 2026-09-14 实测分布 fixture，证明「真能出数」：
// 无 undefined/NaN、零值状态不产生幽灵条段、组别全集补零、HTML 配平。
// 只读性：不连库、不发请求（api 为桩），零副作用。
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'subsystems/samples/frontend/js/views/report.js'), 'utf8');

// fixture = 2026-09-14 生产库只读实测真实分布
const FIX = {
  dash: {
    byStatus: { NEW: 1, PRODUCED: 17, RELEASED: 15, IN_CUSTODY: 57, CHECKED_OUT: 0, RETURNING: 8, RETIRED: 18 },
    total: 116,
    overdue: [], dueSoon: [], checkoutOverdue: [],
    myPending: [{ id: 1, sample_no: 'G-YD9015-Q-001-01', name: '壳体', status: 'NEW', station: '成品组', next_inspect_at: null }],
    role: 'ADMIN', dept: '系统', display_name: '管理员'
  },
  models: [
    { code: 'BD7620D', full_name: 'BD7620D 机种', sample_count: 78, overdue_count: 0, checkout_overdue_count: 0, status_stats: {}, cover: null },
    { code: 'BD9324N', full_name: 'BD9324N 机种', sample_count: 37, overdue_count: 0, checkout_overdue_count: 0, status_stats: {}, cover: null },
    { code: 'BD5315', full_name: 'BD5315 机种', sample_count: 1, overdue_count: 0, checkout_overdue_count: 0, status_stats: {}, cover: null }
  ],
  smap: {
    cabinets: [{ key: '1#样品柜', no: 1, cols: 3, rows: 9, configured: true, cells: [], summary: { total: 27, inCustody: 5, checkedOut: 0, returning: 1, reserved: 0, empty: 21 } }],
    uncabineted: [{ id: 9, sample_no: 'G-YD9015-Q-009-01' }],
    unknownLoc: []
  },
  stations: [
    { station: '马达组', total: 27 }, { station: '扇叶组', total: 35 }, { station: '成品组', total: 54 },
    { station: '品保部', total: 0 }, { station: 'SMT', total: 0 }, { station: '供应商', total: 0 }
  ]
};

/** 在最小沙箱内执行 viewReport()，返回渲染出的 HTML */
async function renderReport() {
  const holder = { innerHTML: '' };
  const flags = {};
  const sandbox = {
    console,
    STATIONS: ['马达组', '扇叶组', '成品组', '品保部', 'SMT', '供应商'],
    ROLE: { ADMIN: '系统管理员', RD: '研发', QA: '品保', CUSTODY: '保管', ME: '生技' },
    me: { role: 'ADMIN', id: 1 },
    e: function (s) {
      return String(s === null || s === undefined ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },
    fmt: function (v) { return String(v || ''); },
    statusBadge: function (s) { return '<span class="b-x">' + s.status + '</span>'; },
    viewDetail: function () {},
    $: function () { return holder; },
    // 复刻 kb-stats.js 的真实契约（含其硬约束：navigate 模式缺 href 的卡片点了没反应）
    KbStats: {
      wrap: function (h) { return '<div class="kb-stats">' + h + '</div>'; },
      render: function (cards, opts) {
        if (opts && opts.click === 'navigate') flags.navHrefAll = cards.every(function (c) { return !!c.href; });
        return cards.map(function (c) {
          return '<div class="kb-stat" data-n="' + c.n + '" title="' + c.title + '">' + c.l + '</div>';
        }).join('');
      }
    },
    api: async function (m, u) {
      if (u === '/api/dashboard') return FIX.dash;
      if (u === '/api/samples/models?view=wall') return FIX.models;
      if (u === '/api/samples/storage-map') return FIX.smap;
      if (u.indexOf('/api/samples?station=') === 0) {
        const st = decodeURIComponent(u.split('station=')[1].split('&')[0]);
        return { total: (FIX.stations.find(function (x) { return x.station === st; }) || {}).total || 0 };
      }
      throw new Error('报表只允许调用既有 4 组只读端点，未预期: ' + u);
    }
  };
  vm.createContext(sandbox);
  await vm.runInContext(src + '\nviewReport()', sandbox);
  return { html: holder.innerHTML, flags: flags };
}

describe('样品报表 运行时渲染契约（方案甲）', () => {
  let html, flags;
  beforeAll(async function () { const r = await renderReport(); html = r.html; flags = r.flags; });

  test('核心指标取自 byStatus/total，且「在管 = 存活 − 已作废」口径正确', function () {
    expect(html).toContain('存活样品总量');
    expect(html).toContain('data-n="116"');  // 存活总量
    expect(html).toContain('data-n="98"');   // 116 − 18 已作废
    expect(html).toContain('data-n="9"');    // RETURNING 8 + NEW 1
    expect(html).toContain('data-n="15"');   // 已发行·待接收
    expect(html).toContain('data-n="57"');   // 保管中
    expect(html).toContain('data-n="18"');   // 已作废
    expect(html).toContain('15.5%');         // 作废率 18/116
  });

  test('KbStats navigate 模式：每张卡都必须有 href，否则点击无响应', function () {
    expect(flags.navHrefAll).toBe(true);
  });

  test('零值状态不产生幽灵条段：CHECKED_OUT=0 → 堆叠条仅 6 段（状态总数仍 7 行）', function () {
    expect((html.match(/class="dash-bar-seg"/g) || []).length).toBe(6);
    expect((html.match(/<tr/g) || []).length).toBeGreaterThanOrEqual(7);
  });

  test('机型分布按样品数降序，占比与微条正常', function () {
    const i78 = html.indexOf('BD7620D'), i37 = html.indexOf('BD9324N'), i1 = html.indexOf('BD5315');
    expect(i78).toBeGreaterThan(-1);
    expect(i78).toBeLessThan(i37);
    expect(i37).toBeLessThan(i1);
    expect(html).toContain('>78<');
    expect(html).toContain('>37<');
    expect(html).toContain('rpt-bar-fill');
  });

  test('组别按 STATIONS 全集补零：6 行全出现，零值组别（品保部/SMT/供应商）保留', function () {
    ['马达组', '扇叶组', '成品组', '品保部', 'SMT', '供应商'].forEach(function (s) {
      expect(html).toContain('>' + s + '<');
    });
    expect((html.match(/<td>(马达组|扇叶组|成品组|品保部|SMT|供应商)<\/td>/g) || []).length).toBe(6);
  });

  test('柜位占用：在用 = 在柜+领走+退回+预占，占用率与未入柜告警正常', function () {
    expect(html).toContain('22.2%');        // (5+0+1+0)/27
    expect(html).toContain('未录入储位');    // 文案锁定
    expect(html).toContain('1#样品柜');
  });

  test('我的待办按角色待办渲染并可点击进详情', function () {
    expect((html.match(/class="rpt-todo"/g) || []).length).toBe(1);
    expect(html).toContain('viewDetail(1)');
    expect(html).toContain('G-YD9015-Q-001-01');
  });

  test('输出健壮性：无 undefined / NaN / [object Object]，div 完整配平', function () {
    expect(html.indexOf('undefined')).toBe(-1);
    expect(html.indexOf('NaN')).toBe(-1);
    expect(html.indexOf('[object Object]')).toBe(-1);
    expect((html.match(/<div/g) || []).length).toBe((html.match(/<\/div>/g) || []).length);
  });

  test('口径脚注存在（只读快照边界显式声明）', function () {
    expect(html).toContain('口径与数据说明');
    expect(html).toContain('方案甲');
  });
});
