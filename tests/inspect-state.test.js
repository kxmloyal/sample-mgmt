// inspect-state.test.js — 复检状态三态计算单元测试（直接加载前端脚本纯函数）
const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '../subsystems/samples/frontend/js/views/list-inspect.js');

// 在 node 环境加载浏览器脚本（顶层 function/var 均入 new Function 作用域）
function loadInspect() {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  return new Function(src + '\n;return { inspectState, inspectBadge };')();
}

describe('inspectState 复检状态三态计算', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const { inspectState } = loadInspect();

  it('无 next_inspect_at / 空对象 → none', () => {
    expect(inspectState()).toBe('none');
    expect(inspectState(null)).toBe('none');
    expect(inspectState({})).toBe('none');
    expect(inspectState({ next_inspect_at: null })).toBe('none');
    expect(inspectState({ next_inspect_at: '' })).toBe('none');
  });

  it('已过期 → overdue', () => {
    expect(inspectState({ next_inspect_at: iso(now - DAY) })).toBe('overdue');
    expect(inspectState({ next_inspect_at: iso(now - 30 * DAY) })).toBe('overdue');
  });

  it('7 天内（含今天）到期 → soon', () => {
    expect(inspectState({ next_inspect_at: iso(now + DAY) })).toBe('soon');
    expect(inspectState({ next_inspect_at: iso(now + 6 * DAY) })).toBe('soon');
  });

  it('超过 7 天 → ok', () => {
    expect(inspectState({ next_inspect_at: iso(now + 8 * DAY) })).toBe('ok');
    expect(inspectState({ next_inspect_at: iso(now + 100 * DAY) })).toBe('ok');
  });
});

describe('inspectBadge 徽章渲染', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  // 注入浏览器全局 fmt 占位，使 inspectBadge 可在 node 环境运行
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const { inspectBadge } = new Function(
    'var fmt = function(d){ return String(d).slice(0,10); };' + src + '\n;return { inspectBadge };'
  )();

  it('none → 灰色占位符', () => {
    expect(inspectBadge({})).toContain('class="muted"');
    expect(inspectBadge({})).toContain('—');
  });

  it('ok → b-inspect-ok 正常', () => {
    const h = inspectBadge({ next_inspect_at: iso(now + 30 * DAY) });
    expect(h).toContain('b-inspect-ok');
    expect(h).toContain('正常');
  });

  it('soon → b-inspect-soon 近7天到期', () => {
    const h = inspectBadge({ next_inspect_at: iso(now + 3 * DAY) });
    expect(h).toContain('b-inspect-soon');
    expect(h).toContain('近7天到期');
  });

  it('overdue → b-overdue 逾期N天', () => {
    const h = inspectBadge({ next_inspect_at: iso(now - 2 * DAY) });
    expect(h).toContain('b-overdue');
    expect(h).toMatch(/逾期\d+天/);
  });

  it('刚超期（毫秒级）→ ceil 向上取整显示 1 天', () => {
    expect(inspectBadge({ next_inspect_at: iso(now - 1) })).toMatch(/逾期1天/);
  });
});
