// tests/samples-station-filter.test.js — 样品列表组别筛选（2026-09-09）
// 纯校验：DAO WHERE 构造用 mock 连接断言 SQL/参数；路由/前端为源码契约断言（deployed:true 只读兼容）
const fs = require('fs');
const path = require('path');
const createDaoList = require('../subsystems/samples/db/dao-list');

// mock 查询依赖：捕获 SQL 与参数；COUNT 查询返回 {total} 行，其余返回空集
function mockDeps() {
  const captured = [];
  const q = (sql, params) => {
    captured.push({ sql, params });
    return Promise.resolve(/COUNT\(\*\)/.test(sql) ? [{ total: 0 }] : []);
  };
  return { deps: { q, one: q, run: q, nowISO: () => '2026-09-09T00:00:00.000Z' }, captured };
}

describe('组别筛选 DAO 层（station 条件，列表/计数同口径）', () => {
  test('listSamples 传 station → WHERE 追加 station = ? 且参数为组别中文', async () => {
    const { deps, captured } = mockDeps();
    const dao = createDaoList(deps);
    await dao.listSamples({ station: '马达组' });
    const { sql, params } = captured[0];
    expect(sql).toContain('station = ?');
    expect(params).toContain('马达组');
  });
  test('countAllSamples 同口径（列表与计数一致，分页总数不漂移）', async () => {
    const { deps, captured } = mockDeps();
    const dao = createDaoList(deps);
    await dao.countAllSamples({ station: '扇叶组' });
    const { sql, params } = captured[0];
    expect(sql).toContain('station = ?');
    expect(params).toContain('扇叶组');
  });
  test('不传 station → 不追加条件（旧调用/看板下钻完全兼容）', async () => {
    const { deps, captured } = mockDeps();
    const dao = createDaoList(deps);
    await dao.listSamples({ status: 'IN_CUSTODY' });
    expect(captured[0].sql).not.toContain('station');
  });
  test('station 可与其他筛选组合（AND 语义）', async () => {
    const { deps, captured } = mockDeps();
    const dao = createDaoList(deps);
    await dao.listSamples({ station: '成品组', sample_type: 'OK', model: 'YD9015' });
    const { sql, params } = captured[0];
    expect(sql).toContain('station = ?');
    expect(sql).toContain('sample_type = ?');
    expect(sql).toContain('model = ?');
    expect(params).toEqual(expect.arrayContaining(['成品组', 'OK', 'YD9015']));
  });
});

describe('组别筛选 链路契约（路由透传 + 前端控件/参数构建）', () => {
  const root = path.join(__dirname, '..');
  const read = f => fs.readFileSync(path.join(root, f), 'utf8');
  test('路由 _sampleFilterOpts 透传 station（列表与导出共用同一构造）', () => {
    expect(read('subsystems/samples/backend/routes-samples.js')).toContain('station: query.station || undefined');
  });
  test('列表视图含组别下拉 f-station（选项源自 STATIONS 常量）', () => {
    const src = read('subsystems/samples/frontend/js/views/list.js');
    expect(src).toContain('id="f-station"');
    expect(src).toContain('STATIONS');
  });
  test('筛选参数构建携带 station 参数 + chips 可清除', () => {
    const src = read('subsystems/samples/frontend/js/views/list-filter.js');
    expect(src).toContain("'&station='");
    expect(src).toContain("组别 '");
  });
});
