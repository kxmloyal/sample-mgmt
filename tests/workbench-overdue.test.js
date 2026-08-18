// tests/workbench-overdue.test.js — 后端等级计算与前端 overdue.js 逻辑一致性
const { calcOverdue, tierLabels } = require('../subsystems/workbench/db/workbench-overdue');

const CFG = { warn: 72, bad: 168 }; // 3 天 / 7 天（默认阈值）

function sample(o) {
  return Object.assign({ item_type: 'sample', status: 'NEW', dwell_hours: 100, next_inspect_at: null, stage_cn: '制样中' }, o);
}
function fixture(o) {
  return Object.assign({ item_type: 'fixture', status: 'REQUESTED', dwell_hours: 100, expected_return_at: null, expected_finish_at: null, next_maintenance_at: null, repair_requested_at: null, stage_cn: '待接收' }, o);
}
function isoDaysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString(); }
function isoDaysAhead(n) { return new Date(Date.now() + n * 86400000).toISOString(); }

describe('workbench-overdue 等级计算（与前端 overdue.js 一致）', () => {
  test('tierLabels 随阈值生成三档标签', () => {
    expect(tierLabels(CFG)).toEqual({ 0: '≤3天', 1: '3~7天', 2: '>7天' });
  });
  test('样品 RETURNING → dwell_hours（100h > 72 → level 1）', () => {
    const r = calcOverdue(sample({ status: 'RETURNING', dwell_hours: 100 }), CFG);
    expect(r.level).toBe(1);
    expect(r.reason).toBe('退回审核中停留');
  });
  test('样品 RELEASED 复检未到期 → 0（不管 dwell）', () => {
    const r = calcOverdue(sample({ status: 'RELEASED', next_inspect_at: isoDaysAhead(1), dwell_hours: 500 }), CFG);
    expect(r.level).toBe(0);
  });
  test('样品 RELEASED 复检逾期 → 按到期时长（10 天 = 240h → level 2）', () => {
    const r = calcOverdue(sample({ status: 'RELEASED', next_inspect_at: isoDaysAgo(10) }), CFG);
    expect(r.level).toBe(2);
    expect(r.reason).toBe('复检逾期');
  });
  test('样品 NEW 阈值放大 3 倍（200/3=66h ≤72 → 0）', () => {
    expect(calcOverdue(sample({ status: 'NEW', dwell_hours: 200 }), CFG).level).toBe(0);
  });
  test('样品 NEW 放大后仍超（300/3=100h → 1）', () => {
    expect(calcOverdue(sample({ status: 'NEW', dwell_hours: 300 }), CFG).level).toBe(1);
  });
  test('治具 IN_USE 归还逾期（5 天=120h → 1）', () => {
    const r = calcOverdue(fixture({ status: 'IN_USE', expected_return_at: isoDaysAgo(5) }), CFG);
    expect(r.level).toBe(1);
    expect(r.reason).toBe('归还逾期');
  });
  test('治具 ACCEPTED 制作超期（10 天=240h → 2）', () => {
    const r = calcOverdue(fixture({ status: 'ACCEPTED', expected_finish_at: isoDaysAgo(10) }), CFG);
    expect(r.level).toBe(2);
    expect(r.reason).toBe('制作超期');
  });
  test('治具 REPAIRING_RD 无 expected_finish_at → repair_requested_at 兜底（6 天=144h → 1）', () => {
    const r = calcOverdue(fixture({ status: 'REPAIRING_RD', repair_requested_at: isoDaysAgo(6) }), CFG);
    expect(r.level).toBe(1);
    expect(r.reason).toBe('RD维修中');
  });
  test('治具 REPAIRING_ME 有 expected_finish_at 未超期 → 0', () => {
    const r = calcOverdue(fixture({ status: 'REPAIRING_ME', expected_finish_at: isoDaysAhead(2), repair_requested_at: isoDaysAgo(10) }), CFG);
    expect(r.level).toBe(0);
    expect(r.reason).toBe('');
  });
  test('治具 next_maintenance_at 保养逾期（5 天=120h → 1）', () => {
    const r = calcOverdue(fixture({ status: 'TRANSFERRED', next_maintenance_at: isoDaysAgo(5) }), CFG);
    expect(r.level).toBe(1);
    expect(r.reason).toBe('保养逾期');
  });
  test('治具 REQUESTED 无期停留（200h → 2）', () => {
    const r = calcOverdue(fixture({ status: 'REQUESTED', dwell_hours: 200 }), CFG);
    expect(r.level).toBe(2);
    expect(r.reason).toBe('待接收停留');
  });
});
