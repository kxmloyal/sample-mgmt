// inspect-state.test.js — 复检状态三态计算单元测试（直接加载前端脚本纯函数）
const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '../subsystems/samples/frontend/js/views/list-inspect.js');

// 在 node 环境加载浏览器脚本（顶层 function/var 均入 new Function 作用域）
function loadInspect() {
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  return new Function(src + '\n;return { inspectState, inspectBadge, inspectText, inspectTone, inspectReason };')();
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

describe('inspectState 不适用态（2026-09-16 新增，验收 C1/C2）', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const { inspectState, inspectTone } = loadInspect();

  it('RETIRED/RETURNING/NEW/PRODUCED → na，无论日期在过去/未来/为空', () => {
    for (const status of ['RETIRED', 'RETURNING', 'NEW', 'PRODUCED']) {
      expect(inspectState({ status, next_inspect_at: iso(now - 30 * DAY) })).toBe('na');
      expect(inspectState({ status, next_inspect_at: iso(now + 30 * DAY) })).toBe('na');
      expect(inspectState({ status, next_inspect_at: null })).toBe('na');
      expect(inspectState({ status })).toBe('na');
      expect(inspectTone({ status, next_inspect_at: iso(now - 30 * DAY) })).toBe('grey');
    }
  });

  it('适用态（IN_CUSTODY/CHECKED_OUT/RELEASED）不受 na 守卫影响', () => {
    expect(inspectState({ status: 'IN_CUSTODY', next_inspect_at: iso(now + 30 * DAY) })).toBe('ok');
    expect(inspectState({ status: 'CHECKED_OUT', next_inspect_at: iso(now - DAY) })).toBe('overdue');
    expect(inspectState({ status: 'RELEASED', next_inspect_at: iso(now - DAY) })).toBe('overdue');
    expect(inspectTone({ status: 'IN_CUSTODY', next_inspect_at: iso(now - DAY) })).toBe('red');
    expect(inspectTone({ status: 'RELEASED', next_inspect_at: iso(now - DAY) })).toBe('grey');
    expect(inspectTone({ status: 'CHECKED_OUT', next_inspect_at: iso(now - DAY) })).toBe('grey');
  });

  it('空对象/缺 status 仍为 none（既有调用方行为不变）', () => {
    expect(inspectState({})).toBe('none');
    expect(inspectState({ next_inspect_at: iso(now - DAY) })).toBe('overdue');
  });
});

describe('inspectBadge 不适用态与灰化渲染（验收 C1/C2/C6）', () => {
  const DAY = 86400000;
  const now = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  const src = fs.readFileSync(SRC_PATH, 'utf8');
  const { inspectBadge, inspectText } = new Function(
    'var fmt = function(d){ return String(d).slice(0,10); };' + src + '\n;return { inspectBadge, inspectText };'
  )();

  it('RETIRED → 灰字「不适用」+ 作废原因 title，不出红徽章', () => {
    const h = inspectBadge({ status: 'RETIRED', retired_reason: '客户取消', next_inspect_at: iso(now - 30 * DAY) });
    expect(h).toContain('class="muted"');
    expect(h).toContain('不适用');
    expect(h).toContain('title="已作废，复检计划不适用（原因：客户取消）"');
    expect(h).not.toContain('b-overdue');
    expect(h).not.toMatch(/正常|近7天到期|逾期/);
  });

  it('RETURNING/NEW/PRODUCED → 「不适用」+ 各自原因 title', () => {
    expect(inspectBadge({ status: 'RETURNING', next_inspect_at: iso(now + DAY) })).toContain('title="退回审核中，复检计划已顺延"');
    expect(inspectBadge({ status: 'NEW' })).toContain('title="未发行，无复检计划"');
    expect(inspectBadge({ status: 'PRODUCED' })).toContain('title="未发行，无复检计划"');
  });

  it('CHECKED_OUT → 灰字「领用中·暂停复检」，即使复检日已过也不报逾期', () => {
    const h = inspectBadge({ status: 'CHECKED_OUT', next_inspect_at: iso(now - 10 * DAY) });
    expect(h).toContain('领用中·暂停复检');
    expect(h).toContain('class="muted"');
    expect(h).not.toContain('b-overdue');
    expect(h).toContain('title="领用中，复检计划暂停"');
  });

  it('RELEASED 逾期 → 保留「逾期N天」文字但灰化，不出 .b-overdue 红脉冲', () => {
    // +1 小时余量：函数内 Date.now() 晚于本行毫秒，紧贴整数天会被 Math.ceil 抬成 N+1 天
    const h = inspectBadge({ status: 'RELEASED', next_inspect_at: iso(now - 2 * DAY + 3600000) });
    expect(h).toContain('逾期2天');
    expect(h).toContain('class="muted"');
    expect(h).not.toContain('b-overdue');
  });

  it('IN_CUSTODY 逾期 → 仍为红徽章（零变化）', () => {
    const h = inspectBadge({ status: 'IN_CUSTODY', next_inspect_at: iso(now - 2 * DAY + 3600000) });
    expect(h).toContain('b-overdue');
    expect(h).toContain('逾期2天');
  });

  it('适用态无计划 → 仍为「—」并新增 title「未设置复检计划」', () => {
    const h = inspectBadge({ status: 'IN_CUSTODY' });
    expect(h).toContain('class="muted"');
    expect(h).toContain('—');
    expect(h).toContain('title="未设置复检计划"');
    expect(inspectText({ status: 'IN_CUSTODY' })).toBe('—');
  });
});
