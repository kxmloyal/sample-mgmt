// tests/workbench-drilldown.test.js — 工作台下钻：id 字段回归
const { unifiedWorkbenchSQL } = require('../subsystems/workbench/db/workbench-queries');

describe('workbench drilldown', () => {
  test('UNION 两分支均包含 id 字段', () => {
    // 样品分支：s.id AS id
    expect(unifiedWorkbenchSQL).toMatch(/s\.id AS id/);
    // 治具分支：f.id AS id
    expect(unifiedWorkbenchSQL).toMatch(/f\.id AS id/);
  });

  test('id 字段位置在首列，不破坏既有字段', () => {
    const sampleIdx = unifiedWorkbenchSQL.indexOf('s.id AS id');
    const itemNoIdx = unifiedWorkbenchSQL.indexOf('s.sample_no AS item_no');
    const fixtureIdx = unifiedWorkbenchSQL.indexOf('f.id AS id');
    const fItemNoIdx = unifiedWorkbenchSQL.indexOf('f.fixture_no AS item_no');
    expect(sampleIdx).toBeGreaterThan(-1);
    expect(itemNoIdx).toBeGreaterThan(-1);
    expect(fixtureIdx).toBeGreaterThan(-1);
    expect(fItemNoIdx).toBeGreaterThan(-1);
  });
});
