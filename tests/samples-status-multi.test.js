// tests/samples-status-multi.test.js — 样品列表「状态多选」源码与口径锁定（2026-09-17）
// 背景：原 #f-status 是单值下拉，其「全部状态」含已作废，用户在确认「某机种正式发行了多少个样品」时无法排除
//       作废样品（实测 BD7620D 卡片 86 件，其中已作废 26 件，见 docs/RELEASE-v2.1.0.md §10）。
//       后端 /api/samples 早已支持多值（db/dao-list.js `_listWhere`：`status=A,B` → `status IN ('A','B')`），
//       本次只补前端入口，故本测试锁定四件事：(1) 控件/值载体结构；(2) 预设口径；
//       (3) 选中态单一事实来源；(4) 既有读写点（深链/导出/chips/组别筛选/看板文案依赖）未被破坏。
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
const BAR = 'subsystems/samples/frontend/js/views/list-status-bar.js';
const LIST = 'subsystems/samples/frontend/js/views/list.js';
const FILTER = 'subsystems/samples/frontend/js/views/list-filter.js';

describe('样品列表状态多选（前端源码）', () => {
  it('值载体 #f-status 为隐藏 input，容器 #f-status-bar 就位，原单选下拉已移除', () => {
    const src = read(LIST);
    expect(src).toContain('<input type="hidden" id="f-status" />');
    expect(src).toContain('id="f-status-bar"');
    expect(src).toContain('class="lsb"');
    expect(src).not.toContain('<fluent-select id="f-status"');
  });

  it('标签排含 7 个状态 + 「在用（不含已作废）」预设', () => {
    const src = read(BAR);
    expect(src).toContain("var _STATUS_LIST = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'CHECKED_OUT', 'RETURNING', 'RETIRED'];");
    expect(src).toContain('在用（不含已作废）');
    expect(src).toContain('smToggleStatus');
    expect(src).toContain('smToggleActivePreset');
  });

  it('预设口径 = 除 RETIRED 外的 6 个状态（与看板「在管总量」同口径）', () => {
    const src = read(BAR);
    expect(src).toContain("var _ACTIVE_STATUSES = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'CHECKED_OUT', 'RETURNING'];");
    // 防止后人误把 RETIRED 加进预设，导致「在用」口径失真。
    // 只校验预设行本身：_STATUS_LIST 全集本来就以 'RETIRED'] 结尾，用全文件 not.toContain 会误伤。
    const activeLine = src.split('\n').find(l => l.includes('var _ACTIVE_STATUSES'));
    expect(activeLine).toBeDefined();
    expect(activeLine).not.toContain('RETIRED');
  });

  it('选中态单一事实来源 = #f-status.value（深链/chips 清除/快捷筛选后自动同步）', () => {
    expect(read(BAR)).toContain("String((el && el.value) || '').split(',')");
    // renderChips 每次重绘后同步标签排（覆盖 chips 的 ✕ 清除）
    expect(read(FILTER)).toContain('smSyncStatusBar();');
    // viewSamples 首帧同步（覆盖深链 #/samples?status=... 赋值）
    expect(read(LIST)).toContain('smSyncStatusBar();');
  });

  it('既有读写点未被破坏：参数构建/导出/组别筛选/看板文案依赖仍在', () => {
    const f = read(FILTER);
    expect(f).toContain("var st = $('#f-status').value;");
    expect(f).toContain("p += '&status=' + st;");
    expect(f).toContain("'&station='");
    expect(f).toContain("组别 '");
    expect(f).toContain("RELEASED: '已发行'"); // tests/dashboard.test.js 依赖本行
    const l = read(LIST);
    expect(l).toContain("location.href = '/api/samples/export'");
    expect(l).toContain('id="f-station"');
    expect(l).toContain('STATIONS');
  });

  it('样式前缀 .lsb-* 与 batch.css 的 .sb-* 不冲突（批量领用样式仍在原处）', () => {
    const css = read('subsystems/samples/frontend/css/module.css');
    expect(css).toContain('.lsb-tag');
    expect(css).toContain('.lsb-preset');
    expect(read('subsystems/samples/frontend/css/batch.css')).toContain('.sb-panel');
  });

  it('bundle 已登记新文件，且顺序在 list-filter.js 之前（依赖顺序）', () => {
    const src = read('tools/bundle-sources.json');
    const iBar = src.indexOf('list-status-bar.js');
    const iFilter = src.indexOf('views/list-filter.js');
    expect(iBar).toBeGreaterThan(-1);
    expect(iFilter).toBeGreaterThan(-1);
    expect(iBar).toBeLessThan(iFilter);
  });
});
