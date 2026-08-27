// tests/workbench-control.test.js — 工作台聚合「管制流程管理」待办回归
// 验证：
//   1) calcOverdue 对 control 分支按 dwell_hours 复用统一阈值（warn/bad）
//   2) buildWorkbenchSQL 对 type=control 正确拼装 WHERE 并参数化
//   3) unifiedWorkbenchSQL 的 control UNION ALL 分支列映射 / 阶段 / 负责部门 / 排除 RETIRED
const { calcOverdue } = require('../subsystems/workbench/db/workbench-overdue');
const { buildWorkbenchSQL, unifiedWorkbenchSQL } = require('../subsystems/workbench/db/workbench-queries');

const CFG = { warn: 72, bad: 168 }; // 3 天 / 7 天（默认阈值）

function control(o) {
  return Object.assign({ item_type: 'control', status: 'SIGNING', dwell_hours: 100, stage_cn: '申请与会签' }, o);
}

describe('workbench-control 等级计算（calcOverdue 复用统一阈值）', () => {
  test('管制按 dwell_hours 分级：50h(≤72) → level 0', () => {
    const r = calcOverdue(control({ dwell_hours: 50 }), CFG);
    expect(r.level).toBe(0);
    expect(r.hours).toBe(50);
  });
  test('管制按 dwell_hours 分级：100h(72~168) → level 1', () => {
    const r = calcOverdue(control({ dwell_hours: 100 }), CFG);
    expect(r.level).toBe(1);
  });
  test('管制按 dwell_hours 分级：200h(>168) → level 2', () => {
    const r = calcOverdue(control({ dwell_hours: 200 }), CFG);
    expect(r.level).toBe(2);
  });
  test('管制原因 = 停留中(阶段中文)，dormant_days 恒 NULL 不参与', () => {
    const r = calcOverdue(control({ status: 'REWORKING', stage_cn: '重工执行' }), CFG);
    expect(r.reason).toBe('停留中(重工执行)');
  });
});

describe('workbench-control buildWorkbenchSQL（type=control 筛选）', () => {
  test('type=control → 外层 WHERE item_type = ?', () => {
    const { sql, params } = buildWorkbenchSQL({ type: 'control' });
    expect(sql).toMatch(/item_type = \?/);
    expect(params).toEqual(['control']);
  });
});

describe('workbench-control UNION 分支结构（24 列与样品/治具一致）', () => {
  test('列映射：item_no=order_no、name=part_name、item_type=control、item_type_cn=管制', () => {
    expect(unifiedWorkbenchSQL).toMatch(/c\.order_no AS item_no/);
    expect(unifiedWorkbenchSQL).toMatch(/c\.part_name AS name/);
    expect(unifiedWorkbenchSQL).toMatch(/'control' AS item_type/);
    expect(unifiedWorkbenchSQL).toMatch(/'管制' AS item_type_cn/);
  });
  test('排除终态：WHERE c.status <> RETIRED（仅保留进行中单据）', () => {
    expect(unifiedWorkbenchSQL).toMatch(/WHERE c\.status <> 'RETIRED'/);
  });
  test('阶段中文按 STAGE_OF_STATUS 映射（DRAFT→申请与会签、REWORKING→重工执行、SHIPPED→入库出货）', () => {
    expect(unifiedWorkbenchSQL).toMatch(/WHEN 'DRAFT' THEN '申请与会签'/);
    expect(unifiedWorkbenchSQL).toMatch(/WHEN 'REWORKING' THEN '重工执行'/);
    expect(unifiedWorkbenchSQL).toMatch(/WHEN 'SHIPPED' THEN '入库出货'/);
  });
  test('负责部门按状态映射（SIGNING→品保文管中心、REWORKING→生产、SHIPPED→仓库）', () => {
    expect(unifiedWorkbenchSQL).toMatch(/WHEN 'SIGNING' THEN '品保文管中心'/);
    expect(unifiedWorkbenchSQL).toMatch(/WHEN 'REWORKING' THEN '生产'/);
    expect(unifiedWorkbenchSQL).toMatch(/WHEN 'SHIPPED' THEN '仓库'/);
  });
  test('dwell_hours = updated_at 到现在的停留小时数，dormant_days 按统一阈值计算', () => {
    expect(unifiedWorkbenchSQL).toMatch(/TIMESTAMPDIFF\(HOUR, c\.updated_at, NOW\(\)\) AS dwell_hours/);
    expect(unifiedWorkbenchSQL).toMatch(/DATEDIFF\(NOW\(\), c\.updated_at\) >= COALESCE\(\(SELECT v FROM fixtures_settings WHERE k = 'dormant_days'\), 60\)/);
  });
  test('id 字段在首列（不破坏下钻分派）', () => {
    const sampleIdx = unifiedWorkbenchSQL.indexOf('s.id AS id');
    const itemNoIdx = unifiedWorkbenchSQL.indexOf('s.sample_no AS item_no');
    const controlIdx = unifiedWorkbenchSQL.indexOf('c.id AS id');
    const cItemNoIdx = unifiedWorkbenchSQL.indexOf('c.order_no AS item_no');
    expect(sampleIdx).toBeGreaterThan(-1);
    expect(itemNoIdx).toBeGreaterThan(-1);
    expect(controlIdx).toBeGreaterThan(-1);
    expect(cItemNoIdx).toBeGreaterThan(-1);
    expect(controlIdx).toBeLessThan(cItemNoIdx); // id 先于 item_no
  });
});
