// fixture-inspect.test.js — 治具到期状态（保养/归还）三态计算单元测试
const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '../subsystems/fixtures/frontend/js/views/fixture-inspect.js');

function loadInspect() {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  return new Function(src + '\n;return { maintState, returnState, maintBadge, returnBadge };')();
}

describe('maintState 保养状态三态计算', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const { maintState } = loadInspect();

  it('无保养计划 / 已报废 → none', () => {
    expect(maintState()).toBe('none');
    expect(maintState({})).toBe('none');
    expect(maintState({ next_maintenance_at: null })).toBe('none');
    expect(maintState({ next_maintenance_at: iso(now + 30 * DAY), retired_at: '2026-01-01' })).toBe('none');
  });

  it('已到期 → overdue', () => {
    expect(maintState({ next_maintenance_at: iso(now - DAY) })).toBe('overdue');
    expect(maintState({ next_maintenance_at: iso(now - 30 * DAY) })).toBe('overdue');
  });

  it('7 天内到期 → soon', () => {
    expect(maintState({ next_maintenance_at: iso(now + 3 * DAY) })).toBe('soon');
    expect(maintState({ next_maintenance_at: iso(now + 6 * DAY) })).toBe('soon');
  });

  it('超过 7 天 → ok', () => {
    expect(maintState({ next_maintenance_at: iso(now + 8 * DAY) })).toBe('ok');
    expect(maintState({ next_maintenance_at: iso(now + 100 * DAY) })).toBe('ok');
  });
});

describe('returnState 归还状态三态计算', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const { returnState } = loadInspect();

  it('非领用中 / 无归还期限 → none', () => {
    expect(returnState()).toBe('none');
    expect(returnState({ status: 'TRANSFERRED', expected_return_at: iso(now + 30 * DAY) })).toBe('none');
    expect(returnState({ status: 'IN_USE', expected_return_at: null })).toBe('none');
  });

  it('领用中已超期 → overdue', () => {
    expect(returnState({ status: 'IN_USE', expected_return_at: iso(now - DAY) })).toBe('overdue');
    expect(returnState({ status: 'IN_USE', expected_return_at: iso(now - 30 * DAY) })).toBe('overdue');
  });

  it('7 天内到期 → soon', () => {
    expect(returnState({ status: 'IN_USE', expected_return_at: iso(now + 3 * DAY) })).toBe('soon');
    expect(returnState({ status: 'IN_USE', expected_return_at: iso(now + 6 * DAY) })).toBe('soon');
  });

  it('超过 7 天 → ok', () => {
    expect(returnState({ status: 'IN_USE', expected_return_at: iso(now + 8 * DAY) })).toBe('ok');
  });
});

describe('maintBadge / returnBadge 徽章渲染', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const { maintBadge, returnBadge } = new Function(
    'var fmt = function(d){ return String(d).slice(0,10); };' + src + '\n;return { maintBadge, returnBadge };'
  )();

  it('maintBadge：none 灰色占位 / ok / soon / overdue', () => {
    expect(maintBadge({})).toContain('class="muted"');
    expect(maintBadge({ next_maintenance_at: iso(now + 30 * DAY) })).toContain('b-maint-ok');
    expect(maintBadge({ next_maintenance_at: iso(now + 3 * DAY) })).toContain('b-maint-soon');
    const h = maintBadge({ next_maintenance_at: iso(now - 2 * DAY) });
    expect(h).toContain('b-overdue');
    expect(h).toMatch(/逾期\d+天/);
  });

  it('returnBadge：none 灰色占位 / ok / soon / overdue', () => {
    expect(returnBadge({})).toContain('class="muted"');
    expect(returnBadge({ status: 'IN_USE', expected_return_at: iso(now + 30 * DAY) })).toContain('b-ret-ok');
    expect(returnBadge({ status: 'IN_USE', expected_return_at: iso(now + 3 * DAY) })).toContain('b-ret-soon');
    const h = returnBadge({ status: 'IN_USE', expected_return_at: iso(now - 2 * DAY) });
    expect(h).toContain('b-overdue');
    expect(h).toMatch(/超期\d+天/);
  });

  it('刚超期（毫秒级）→ ceil 向上取整显示 1 天', () => {
    expect(maintBadge({ next_maintenance_at: iso(now - 1) })).toMatch(/逾期1天/);
    expect(returnBadge({ status: 'IN_USE', expected_return_at: iso(now - 1) })).toMatch(/超期1天/);
  });
});
