# 全局工作台筛选功能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将全局工作台筛选从「前端 200 条内存过滤」升级为「服务端 SQL 过滤 + 等级后端计算 + 分页」，扩展筛选维度并增强交互。

**Architecture:** 后端新增 `workbench-overdue.js`（等级计算单一事实来源，迁移自前端 overdue.js）+ `buildWorkbenchSQL` 动态拼装基础维度 WHERE（全部参数化）+ 路由 `/api/workbench` 增加筛选参数并返回 `summary/deptStats` 统计；前端新增 `wb-filter.js`（筛选栏/分页/hash 持久化），dashboard.js 改为带参请求渲染（移除 DOM 内存过滤），threshold.js 弹窗预览改用全量样本。

**Tech Stack:** Node.js/Express 4（CommonJS）、MariaDB mysql2、Jest + supertest、原生前端单页 + `node tools/build-bundles.js` 构建 bundle。

**参考设计文档：** `docs/superpowers/specs/2026-08-13-workbench-filter-design.md`

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `subsystems/workbench/db/workbench-overdue.js` | 新建 | 等级计算 service（迁移自前端 overdue.js，权威版本） |
| `subsystems/workbench/db/workbench-queries.js` | 修改 | 新增 `buildWorkbenchSQL(filters)` 动态 WHERE |
| `subsystems/workbench/backend/index.js` | 修改 | `/api/workbench` 路由：参数校验→基础过滤→等级→统计→排序→分页 |
| `subsystems/workbench/frontend/js/views/wb-filter.js` | 新建 | 筛选栏渲染 / 分页渲染 / hash 解析序列化 |
| `subsystems/workbench/frontend/js/views/dashboard.js` | 修改 | 主流程带参请求渲染，移除 doFilter/renderFilterBar，统计卡用 summary/deptStats |
| `subsystems/workbench/frontend/js/views/threshold.js` | 修改 | 弹窗打开前拉全量样本（≤500）供预览 |
| `tests/workbench-overdue.test.js` | 新建 | overdue 迁移一致性单测 |
| `tests/workbench-filter.test.js` | 新建 | 接口测试 + buildWorkbenchSQL 单测 |
| `README.md` / `docs/operation-manual.md` | 修改 | `/api/workbench` 参数说明同步 |

**执行前置**：所有工作台 JS 变更后必须 `node tools/build-bundles.js` + 复制 `bundle-workbench.js` + 更新 `index.html?v=`（AGENTS.md §19）。后端变更后必须重启服务。文件 www 所有，编辑经 /tmp 中转 + `echo 'mnbvcxz123' | sudo -S -u www bash -c 'cp ...'`。重启命令：先 `sudo ss -tlnp | grep ':4000'` 精确取 PID kill，再 `echo 'mnbvcxz123' | sudo -S -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'`（重定向必须在 www 内层 bash 内完成）。禁止宽泛 pkill（勿伤 3500 端口项目）。

---

## Task 1: 后端等级计算 service（workbench-overdue.js）

**Files:**
- Create: `subsystems/workbench/db/workbench-overdue.js`
- Test: `tests/workbench-overdue.test.js`

- [ ] **Step 1: 写迁移一致性测试（先失败）**

创建 `tests/workbench-overdue.test.js`：

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/workbench-overdue.test.js --testTimeout=30000 --silent
```
Expected: FAIL（`Cannot find module '.../workbench-overdue'`）

- [ ] **Step 3: 实现 workbench-overdue.js（迁移自前端 overdue.js，逻辑等价）**

创建 `subsystems/workbench/db/workbench-overdue.js`：

```js
// subsystems/workbench/db/workbench-overdue.js
// 积压等级计算 service（单一事实来源，迁移自 frontend/js/views/overdue.js）
// 注意：前端 overdue.js 的 calcOverdue 仅保留给阈值弹窗临时预览用，修改此处 MUST 同步 overdue.js 保持一致

// 生成三档显示标签（随阈值动态变化）
function tierLabels(b) {
  b = b || { warn: 72, bad: 168 };
  var wd = Math.round(b.warn / 24), bd = Math.round(b.bad / 24);
  return { 0: '≤' + wd + '天', 1: wd + '~' + bd + '天', 2: '>' + bd + '天' };
}

/**
 * 计算积压等级（互斥三档）：0=正常(≤warn) 1=warn~bad 2=>bad
 * @param {Object} item 工作台行（含 item_type/status/dwell_hours/next_inspect_at 等）
 * @param {Object} cfg 阈值 { warn, bad }（小时），缺省 72/168
 * @returns {{level:number,label:string,hours:number,reason:string}}
 */
function calcOverdue(item, cfg) {
  var b = cfg || { warn: 72, bad: 168 };
  var hours = 0, reason = '';
  if (item.item_type === 'sample') {
    hours = sampleOverdueHours(item);
    reason = sampleOverdueReason(item);
    // NEW/PRODUCED 阈值放大 3 倍
    if (item.status === 'NEW' || item.status === 'PRODUCED') hours = hours / 3;
  } else if (item.item_type === 'fixture') {
    var fx = fixtureOverdue(item);
    hours = fx.hours;
    reason = fx.reason;
  }
  var level = 0;
  if (hours > b.bad) level = 2;
  else if (hours > b.warn) level = 1;
  return { level: level, label: tierLabels(b)[level], hours: Math.round(hours), reason: reason };
}

function sampleOverdueHours(item) {
  var s = item.status;
  if (s === 'RETURNING') return item.dwell_hours || 0;
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    var d = new Date(item.next_inspect_at).getTime();
    if (d < Date.now()) return Math.round((Date.now() - d) / 3600000);
    return 0;
  }
  return item.dwell_hours || 0;
}

function sampleOverdueReason(item) {
  var s = item.status;
  if (s === 'RETURNING') return '退回审核中停留';
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    if (new Date(item.next_inspect_at).getTime() < Date.now()) return '复检逾期';
    return '';
  }
  return '停留中(' + (item.stage_cn || '') + ')';
}

// 治具逾期判断：状态分支（expected_finish_at 优先、repair_requested_at 兜底）
function fixtureOverdue(item) {
  var s = item.status, now = Date.now(), hours = 0, reason = '';
  if (s === 'IN_USE' && item.expected_return_at) {
    var er = new Date(item.expected_return_at).getTime();
    if (er < now) { hours = Math.round((now - er) / 3600000); reason = '归还逾期'; }
  } else if (s === 'ACCEPTED' && item.expected_finish_at) {
    var ef = new Date(item.expected_finish_at).getTime();
    if (ef < now) { hours = Math.round((now - ef) / 3600000); reason = '制作超期'; }
  } else if (s === 'REPAIRING_ME' || s === 'REPAIRING_RD' || s === 'IMPROVING') {
    if (item.expected_finish_at) {
      var ef2 = new Date(item.expected_finish_at).getTime();
      if (ef2 < now) {
        hours = Math.round((now - ef2) / 3600000);
        if (s === 'REPAIRING_ME') reason = 'ME维修超期';
        else if (s === 'REPAIRING_RD') reason = 'RD维修超期';
        else reason = '改善超期';
      }
    } else if (item.repair_requested_at) {
      hours = Math.round((now - new Date(item.repair_requested_at).getTime()) / 3600000);
      if (s === 'REPAIRING_ME') reason = 'ME维修中';
      else if (s === 'REPAIRING_RD') reason = 'RD维修中';
      else reason = '改善中';
    } else {
      hours = item.dwell_hours || 0;
      if (s === 'REPAIRING_ME') reason = 'ME维修中';
      else if (s === 'REPAIRING_RD') reason = 'RD维修中';
      else reason = '改善中';
    }
  } else if (item.next_maintenance_at && new Date(item.next_maintenance_at).getTime() < now) {
    hours = Math.round((now - new Date(item.next_maintenance_at).getTime()) / 3600000);
    reason = '保养逾期';
  } else {
    hours = item.dwell_hours || 0;
    if (s === 'REQUESTED') reason = '待接收停留';
    else if (s === 'VERIFY_PENDING') reason = '待验证停留';
    else if (s === 'TRANSFERRED') reason = '待领用停留';
    else if (s === 'REPAIR_DONE') reason = '待确认维修停留';
    else reason = '停留中(' + (item.stage_cn || '') + ')';
  }
  return { hours: hours, reason: reason };
}

module.exports = { calcOverdue, tierLabels };
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/workbench-overdue.test.js --testTimeout=30000 --silent
```
Expected: PASS（11 tests）

- [ ] **Step 5: 提交**

```bash
cd /www/wwwroot/sample-mgmt && git add subsystems/workbench/db/workbench-overdue.js tests/workbench-overdue.test.js && git -c user.name='357346987' -c user.email='357346987@qq.com' commit -m "feat(workbench): 后端等级计算 service（迁移自前端 overdue.js，单一事实来源）"
```

---

## Task 2: buildWorkbenchSQL + /api/workbench 路由改造

**Files:**
- Modify: `subsystems/workbench/db/workbench-queries.js`
- Modify: `subsystems/workbench/backend/index.js`
- Test: `tests/workbench-filter.test.js`

- [ ] **Step 1: 写接口测试（先失败）**

创建 `tests/workbench-filter.test.js`：

```js
// tests/workbench-filter.test.js — /api/workbench 服务端筛选/统计/分页 + buildWorkbenchSQL 单测
const request = require('supertest');
const { getApp, login } = require('./helpers/setup');
const { buildWorkbenchSQL } = require('../subsystems/workbench/db/workbench-queries');

let app, agent;

beforeAll(async () => {
  app = await getApp();
  agent = request.agent(app);
  const res = await agent.post('/api/login').send({ username: 'admin', password: 'admin123' });
  expect(res.status).toBe(200);
}, 30000);

describe('buildWorkbenchSQL 单测', () => {
  test('无筛选 → 外层不追加 WHERE、无参数（unionSQL 内嵌 WHERE 不在此列）', () => {
    const { sql, params } = buildWorkbenchSQL({});
    expect(sql).not.toMatch(/\) AS wb WHERE/);
    expect(params).toEqual([]);
  });
  test('type+keyword → WHERE 拼接 + 参数化（LIKE 带 %）', () => {
    const { sql, params } = buildWorkbenchSQL({ type: 'sample', keyword: 'ABC' });
    expect(sql).toMatch(/item_type = \?/);
    expect(sql).toMatch(/\(item_no LIKE \? OR name LIKE \?\)/);
    expect(params).toEqual(['sample', '%ABC%', '%ABC%']);
  });
  test('dormant → 无参数条件', () => {
    const { sql, params } = buildWorkbenchSQL({ dormant: '1' });
    expect(sql).toMatch(/dormant_days IS NOT NULL/);
    expect(params).toEqual([]);
  });
  test('min/max_hours → 范围条件', () => {
    const { sql, params } = buildWorkbenchSQL({ min_hours: 10, max_hours: 100 });
    expect(params).toEqual([10, 100]);
  });
});

describe('GET /api/workbench 服务端筛选', () => {
  test('未登录 401', async () => {
    const res = await request(app).get('/api/workbench');
    expect(res.status).toBe(401);
  });
  test('默认返回分页结构 + summary/deptStats', async () => {
    const res = await agent.get('/api/workbench');
    expect(res.status).toBe(200);
    const b = res.body;
    expect(Array.isArray(b.items)).toBe(true);
    expect(typeof b.total).toBe('number');
    expect(typeof b.summary).toBe('object');
    expect(Array.isArray(b.deptStats)).toBe(true);
    expect(b.summary.total).toBe(b.total);
    if (b.items.length) {
      expect(typeof b.items[0].overdue_level).toBe('number');
      expect(typeof b.items[0].overdue_reason).toBe('string');
    }
  });
  test('type=sample 全部为样品', async () => {
    const res = await agent.get('/api/workbench?type=sample');
    expect(res.status).toBe(200);
    res.body.items.forEach((it) => expect(it.item_type).toBe('sample'));
  });
  test('level=2 全部为最高积压档', async () => {
    const res = await agent.get('/api/workbench?level=2');
    expect(res.status).toBe(200);
    res.body.items.forEach((it) => expect(it.overdue_level).toBe(2));
  });
  test('dormant=1 全部为呆滞治具', async () => {
    const res = await agent.get('/api/workbench?dormant=1');
    expect(res.status).toBe(200);
    res.body.items.forEach((it) => expect(it.dormant_days).not.toBeNull());
  });
  test('keyword 过滤编号', async () => {
    const all = await agent.get('/api/workbench');
    if (!all.body.items.length) return; // 无活跃数据跳过
    const no = all.body.items[0].item_no.slice(0, 4);
    const res = await agent.get('/api/workbench?keyword=' + encodeURIComponent(no));
    res.body.items.forEach((it) => {
      expect(it.item_no.indexOf(no) >= 0 || it.name.indexOf(no) >= 0).toBe(true);
    });
  });
  test('分页 offset 正确 + limit 钳制 ≤500', async () => {
    const res = await agent.get('/api/workbench?limit=99999&offset=0');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBeLessThanOrEqual(500);
    const res2 = await agent.get('/api/workbench?limit=10&offset=5');
    expect(res2.body.offset).toBe(5);
    expect(res2.body.items.length).toBeLessThanOrEqual(10);
  });
  test('非法 level 参数 → 400', async () => {
    const res = await agent.get('/api/workbench?level=9');
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/workbench-filter.test.js --testTimeout=30000 --silent
```
Expected: FAIL（buildWorkbenchSQL 不存在 / 响应缺 summary 字段）

- [ ] **Step 3: workbench-queries.js 新增 buildWorkbenchSQL**

在 `subsystems/workbench/db/workbench-queries.js` 末尾追加（并更新 module.exports 行，L119）：

```js
// 动态拼装基础维度 WHERE（全部参数化防注入；level 为派生值由服务层 JS 计算后过滤，不走 SQL）
function buildWorkbenchSQL(f) {
  var where = [], params = [];
  f = f || {};
  if (f.type) { where.push('item_type = ?'); params.push(f.type); }
  if (f.dept) { where.push('resp_dept = ?'); params.push(f.dept); }
  if (f.apply_dept) { where.push('apply_dept = ?'); params.push(f.apply_dept); }
  if (f.keyword) {
    where.push('(item_no LIKE ? OR name LIKE ?)');
    var kw = '%' + f.keyword + '%';
    params.push(kw, kw);
  }
  if (f.stage) { where.push('stage_cn = ?'); params.push(f.stage); }
  if (f.dormant) { where.push('dormant_days IS NOT NULL'); }
  if (f.min_hours != null) { where.push('dwell_hours >= ?'); params.push(f.min_hours); }
  if (f.max_hours != null) { where.push('dwell_hours <= ?'); params.push(f.max_hours); }
  var whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  return { sql: 'SELECT * FROM (' + unionSQL + ') AS wb' + whereSql, params: params };
}

module.exports = { unifiedWorkbenchSQL, unifiedWorkbenchCountSQL, buildWorkbenchSQL };
```

- [ ] **Step 4: 改造 /api/workbench 路由（backend/index.js）**

(1) 顶部 require（L4-6 区域）追加：

```js
const { buildWorkbenchSQL } = require('../db/workbench-queries');
const { calcOverdue } = require('../db/workbench-overdue');
```

(2) 将 `GET /api/workbench` 处理器（当前 L27-53）整体替换为：

```js
  // GET /api/workbench — 服务端筛选 + 等级计算 + 统计 + 分页
  // 筛选参数：type/level/dept/apply_dept/keyword/stage/dormant/min_hours/max_hours/limit/offset
  app.get('/api/workbench', requireAuth, async function(req, res) {
    try {
      var filters = parseWorkbenchFilters(req.query);
      if (filters.error) return res.status(400).json({ error: filters.error });
      var settings = await getSettings(); // {warn,bad} 小时，缺省 72/168
      var base = buildWorkbenchSQL(filters);
      var [rows] = await pool.query(base.sql, base.params);

      // 等级计算（后端权威版本）
      rows.forEach(function(r) {
        var od = calcOverdue(r, settings);
        r.overdue_level = od.level;
        r.overdue_label = od.label;
        r.overdue_hours = od.hours;
        r.overdue_reason = od.reason;
      });
      // 等级过滤（服务端，非前端内存）
      if (filters.level !== '') {
        var lv = Number(filters.level);
        rows = rows.filter(function(r) { return r.overdue_level === lv; });
      }
      // 排序：等级降序 + 停留时长降序 + 类型/编号稳定序
      rows.sort(function(a, b) {
        if (a.overdue_level !== b.overdue_level) return b.overdue_level - a.overdue_level;
        if (a.dwell_hours !== b.dwell_hours) return b.dwell_hours - a.dwell_hours;
        if (a.item_type !== b.item_type) return a.item_type > b.item_type ? 1 : -1;
        return a.item_no > b.item_no ? 1 : -1;
      });

      // 统计（基于过滤后全量，不受分页影响）
      var total = rows.length;
      var summary = { total: total, d3in: 0, d37: 0, d7: 0, dormant: 0 };
      var deptMap = {};
      rows.forEach(function(r) {
        if (r.overdue_level === 0) summary.d3in++;
        else if (r.overdue_level === 1) summary.d37++;
        else summary.d7++;
        if (r.dormant_days != null) summary.dormant++;
        var dept = r.resp_dept || '-';
        if (!deptMap[dept]) deptMap[dept] = { dept: dept, total: 0, d3in: 0, d37: 0, d7: 0 };
        deptMap[dept].total++;
        if (r.overdue_level === 0) deptMap[dept].d3in++;
        else if (r.overdue_level === 1) deptMap[dept].d37++;
        else deptMap[dept].d7++;
      });

      var page = rows.slice(filters.offset, filters.offset + filters.limit);
      res.json({ items: page, total: total, limit: filters.limit, offset: filters.offset, summary: summary, deptStats: Object.values(deptMap) });
    } catch (err) {
      console.error('[workbench] 查询失败:', err.message);
      res.status(500).json({ error: '获取工作台数据失败：' + err.message });
    }
  });
```

(3) 在 `module.exports`（L90）前新增 helper：

```js
// 解析并校验工作台筛选参数（非法返回 { error }）
function parseWorkbenchFilters(q) {
  var f = {};
  if (q.type && q.type !== 'sample' && q.type !== 'fixture') return { error: 'type 仅支持 sample/fixture' };
  f.type = q.type || '';
  if (q.level !== undefined && q.level !== '') {
    var lv = Number(q.level);
    if (lv !== 0 && lv !== 1 && lv !== 2) return { error: 'level 仅支持 0/1/2' };
    f.level = String(lv);
  } else f.level = '';
  f.dept = q.dept || '';
  f.apply_dept = q.apply_dept || '';
  var kw = (q.keyword || '').trim();
  f.keyword = kw.length > 50 ? kw.slice(0, 50) : kw;
  f.stage = q.stage || '';
  f.dormant = q.dormant === '1' ? '1' : '';
  if (q.min_hours !== undefined && q.min_hours !== '') {
    var min = Number(q.min_hours);
    if (!(min >= 0)) return { error: 'min_hours 需为非负整数' };
    f.min_hours = min;
  }
  if (q.max_hours !== undefined && q.max_hours !== '') {
    var max = Number(q.max_hours);
    if (!(max >= 0)) return { error: 'max_hours 需为非负整数' };
    f.max_hours = max;
  }
  f.limit = Math.min(parseInt(q.limit || '50', 10) || 50, 500);
  f.offset = Math.max(parseInt(q.offset || '0', 10) || 0, 0);
  return f;
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/workbench-filter.test.js tests/workbench-overdue.test.js --testTimeout=30000 --silent
```
Expected: PASS

- [ ] **Step 6: 重启服务（后端 require 新模块，必须重启）**

```bash
sudo ss -tlnp | grep ':4000'   # 记录 PID
# kill 上述 PID（精确，勿碰 3500）
echo 'mnbvcxz123' | sudo -S -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
sleep 6 && curl -s -o /dev/null -w 'portal HTTP=%{http_code}\n' http://localhost:4000/
```
Expected: portal HTTP=200

- [ ] **Step 7: 提交**

```bash
cd /www/wwwroot/sample-mgmt && git add subsystems/workbench/db/workbench-queries.js subsystems/workbench/backend/index.js tests/workbench-filter.test.js && git -c user.name='357346987' -c user.email='357346987@qq.com' commit -m "feat(workbench): 服务端筛选（buildWorkbenchSQL）+ 等级计算/统计/分页接口"
```

---

## Task 3: 前端筛选栏 / 分页 / hash 持久化（wb-filter.js + dashboard.js）

**Files:**
- Create: `subsystems/workbench/frontend/js/views/wb-filter.js`
- Modify: `subsystems/workbench/frontend/js/views/dashboard.js`

- [ ] **Step 1: 新建 wb-filter.js**

创建 `subsystems/workbench/frontend/js/views/wb-filter.js`：

```js
// subsystems/workbench/frontend/js/views/wb-filter.js
// 工作台筛选栏/分页/hash 持久化（依赖全局：_deptFilter/_wbItems/renderWorkbenchDashboard/tierLabels/me/e）

// 从 location.hash 解析筛选状态（#type=sample&level=2&dept=...&keyword=...&offset=...）
function parseWbHash() {
  var f = { type: '', level: '', dept: '', apply_dept: '', keyword: '', stage: '', dormant: '', min_hours: '', max_hours: '', limit: 50, offset: 0 };
  var h = (location.hash || '').replace(/^#/, '');
  if (!h) return f;
  h.split('&').forEach(function(kv) {
    var i = kv.indexOf('=');
    if (i < 0) return;
    var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
    if (v === '') return;
    if (k === 'offset') { f.offset = Math.max(parseInt(v, 10) || 0, 0); }
    else if (k === 'limit') { f.limit = parseInt(v, 10) || 50; }
    else if (k in f) f[k] = v;
  });
  return f;
}

// 序列化筛选状态为 hash 片段（空值跳过）
function serializeWbHash(f) {
  var parts = [];
  ['type', 'level', 'dept', 'apply_dept', 'keyword', 'stage', 'dormant', 'min_hours', 'max_hours'].forEach(function(k) {
    if (f[k]) parts.push(k + '=' + encodeURIComponent(f[k]));
  });
  if (f.offset > 0) parts.push('offset=' + f.offset);
  return parts.length ? '#' + parts.join('&') : '';
}

// 渲染筛选栏（含结果计数 + 清除按钮 + ADMIN 阈值入口）
function renderWbFilterBar(f, total, deptStats, applyDepts) {
  var tl = tierLabels();
  var deptOpts = '<option value="">全部负责部门</option>' + (deptStats || []).map(function(d) {
    return '<option value="' + d.dept + '"' + (f.dept === d.dept ? ' selected' : '') + '>' + d.dept + '</option>';
  }).join('');
  var applyOpts = '<option value="">全部申请部门</option>' + (applyDepts || []).map(function(d) {
    return '<option value="' + d + '"' + (f.apply_dept === d ? ' selected' : '') + '>' + d + '</option>';
  }).join('');
  var isAdmin = typeof me !== 'undefined' && me && me.role === 'ADMIN';
  var settingsBtn = isAdmin
    ? '<button class="btn btn-sm" onclick="openThresholdModal()" style="margin-left:8px">阈值设置</button>'
    : '';
  return '<div class="filters" style="margin:16px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
    '<input class="filter-select" id="wb-keyword" placeholder="编号/名称搜索" value="' + e(f.keyword) + '" style="max-width:150px" onkeydown="if(event.key===\'Enter\')wbSetFilter({keyword:this.value,offset:0})">' +
    '<select class="filter-select" id="wb-type" onchange="wbSetFilter({type:this.value,offset:0})">' +
      '<option value="">全部类型</option>' +
      '<option value="sample"' + (f.type === 'sample' ? ' selected' : '') + '>样品</option>' +
      '<option value="fixture"' + (f.type === 'fixture' ? ' selected' : '') + '>治具</option>' +
    '</select>' +
    '<select class="filter-select" id="wb-level" onchange="wbSetFilter({level:this.value,offset:0})">' +
      '<option value="">全部积压等级</option>' +
      '<option value="0"' + (f.level === '0' ? ' selected' : '') + '>' + tl[0] + '</option>' +
      '<option value="1"' + (f.level === '1' ? ' selected' : '') + '>' + tl[1] + '</option>' +
      '<option value="2"' + (f.level === '2' ? ' selected' : '') + '>' + tl[2] + '</option>' +
    '</select>' +
    '<select class="filter-select" id="wb-dept" onchange="wbSetFilter({dept:this.value,offset:0})">' + deptOpts + '</select>' +
    '<select class="filter-select" id="wb-apply-dept" onchange="wbSetFilter({apply_dept:this.value,offset:0})">' + applyOpts + '</select>' +
    '<label style="font-size:12px;color:var(--muted)">' +
      '<input type="checkbox" id="wb-dormant"' + (f.dormant ? ' checked' : '') + ' onchange="wbSetFilter({dormant:this.checked?\'1\':\'\',offset:0})"> 仅呆滞</label>' +
    '<span style="font-size:12px;color:var(--muted)">停留</span>' +
    '<input class="filter-select" id="wb-min-h" placeholder="≥小时" value="' + e(f.min_hours || '') + '" style="width:70px" onchange="wbSetFilter({min_hours:this.value,offset:0})">' +
    '<span style="color:var(--muted)">~</span>' +
    '<input class="filter-select" id="wb-max-h" placeholder="≤小时" value="' + e(f.max_hours || '') + '" style="width:70px" onchange="wbSetFilter({max_hours:this.value,offset:0})">' +
    '<button class="btn btn-sm" onclick="wbClearFilter()">清除筛选</button>' +
    '<span style="margin-left:4px;font-size:12px;color:var(--muted)">共 ' + total + ' 条</span>' +
    '<button class="btn btn-sm" onclick="renderWorkbenchDashboard(true)">刷新</button>' +
    settingsBtn +
    '</div>';
}

// 渲染分页控件（上一页/下一页 + 页码/总数；≤1 页不渲染）
function renderWbPager(f, total) {
  var pageSize = f.limit || 50;
  var pages = Math.max(Math.ceil(total / pageSize), 1);
  var cur = Math.floor((f.offset || 0) / pageSize) + 1;
  if (pages <= 1) return '';
  return '<div class="pager" style="margin:12px 0;display:flex;align-items:center;gap:8px">' +
    '<button class="btn btn-sm" ' + (cur <= 1 ? 'disabled' : 'onclick="wbSetFilter({offset:' + ((cur - 2) * pageSize) + '})"') + '>上一页</button>' +
    '<span style="font-size:12px;color:var(--muted)">' + cur + ' / ' + pages + ' 页</span>' +
    '<button class="btn btn-sm" ' + (cur >= pages ? 'disabled' : 'onclick="wbSetFilter({offset:' + (cur * pageSize) + '})"') + '>下一页</button>' +
    '</div>';
}

// 更新筛选状态：合并 patch → 写 hash → 重载看板
function wbSetFilter(patch) {
  var f = parseWbHash();
  Object.keys(patch).forEach(function(k) { f[k] = patch[k]; });
  var hash = serializeWbHash(f);
  if (hash !== location.hash) history.replaceState(null, '', hash);
  renderWorkbenchDashboard(true);
}

// 一键清除筛选（含部门卡 active 态复位）
function wbClearFilter() {
  history.replaceState(null, '', location.pathname + location.search);
  _deptFilter = null;
  renderWorkbenchDashboard(true);
}
```

- [ ] **Step 2: 重构 dashboard.js**

(1) 状态区（L4-6）：删除 `_filterCache`（doFilter 移除后不再使用），保留 `_deptFilter`/`_wbItems`。

(2) `renderWorkbenchDashboard`（L8-76）整体替换为：

```js
async function renderWorkbenchDashboard(keepFilter) {
  var view = document.getElementById('view');
  view.textContent = '加载中…';
  view.style = 'padding:40px;text-align:center;color:var(--muted)';

  try {
    await loadOverdueBounds(); // 确保使用全局阈值（ADMIN 可改）
    var f = parseWbHash();
    if (_deptFilter) f.dept = _deptFilter; // 部门卡筛选优先级高于下拉

    // 带筛选参数请求（服务端过滤 + 等级计算 + 统计 + 分页）
    var qs = [];
    if (f.type) qs.push('type=' + encodeURIComponent(f.type));
    if (f.level) qs.push('level=' + encodeURIComponent(f.level));
    if (f.dept) qs.push('dept=' + encodeURIComponent(f.dept));
    if (f.apply_dept) qs.push('apply_dept=' + encodeURIComponent(f.apply_dept));
    if (f.keyword) qs.push('keyword=' + encodeURIComponent(f.keyword));
    if (f.stage) qs.push('stage=' + encodeURIComponent(f.stage));
    if (f.dormant) qs.push('dormant=1');
    if (f.min_hours) qs.push('min_hours=' + encodeURIComponent(f.min_hours));
    if (f.max_hours) qs.push('max_hours=' + encodeURIComponent(f.max_hours));
    qs.push('limit=' + (f.limit || 50), 'offset=' + (f.offset || 0));
    var data = await api('GET', '/api/workbench?' + qs.join('&'));
    _wbItems = data.items; // 当前页数据（阈值弹窗打开时再拉全量样本）

    view.style = '';
    view.innerHTML =
      renderSummaryCards(data.deptStats, data.summary) +
      renderWbFilterBar(f, data.total, data.deptStats, deptNames(data.deptStats)) +
      renderItemTable(data.items) +
      renderWbPager(f, data.total);

    // 部门卡 active 态
    if (_deptFilter) {
      var dc = document.querySelector('.kb-stat[data-dept="' + _deptFilter + '"]');
      if (dc) dc.classList.add('active');
    } else {
      var totalCard = document.querySelector('.wb-card-total');
      if (totalCard) totalCard.classList.add('active');
    }
  } catch (err) {
    view.innerHTML = '<div style="padding:40px;text-align:center;color:#dc2626">' +
      '<div>加载失败：' + e(err.message) + '</div>' +
      '<button class="btn btn-sm" onclick="renderWorkbenchDashboard()" style="margin-top:12px">重试</button>' +
      '</div>';
  }
}

// 申请部门列表（来自部门统计去重；后续可扩展为独立字典接口）
function deptNames(deptStats) {
  var seen = {}, arr = [];
  (deptStats || []).forEach(function(d) {
    if (!seen[d.dept]) { seen[d.dept] = 1; arr.push(d.dept); }
  });
  return arr;
}
```

(3) **删除 `renderFilterBar`**（L108-130，被 `renderWbFilterBar` 取代）。

(4) **删除 `doFilter`**（L171-185，内存过滤已被服务端取代）。

(5) `filterByDept` / `clearDeptFilter`（L188-204）替换为：

```js
// 部门卡交互：单击筛选该部门（服务端过滤），再次点击取消
function filterByDept(el) {
  var dept = el.dataset.dept;
  _deptFilter = (_deptFilter === dept) ? null : dept;
  renderWorkbenchDashboard(true);
}

// 总计卡交互：清除部门筛选
function clearDeptFilter() {
  _deptFilter = null;
  renderWorkbenchDashboard(true);
}
```

(6) `renderSummaryCards`（L78-106）、`renderItemTable`（L134-169）、`formatHours`（L206-214）保持不变（入参结构由后端返回，签名一致）。

- [ ] **Step 3: 语法校验 + bundle 重建**

```bash
cd /www/wwwroot/sample-mgmt
node --check subsystems/workbench/frontend/js/views/wb-filter.js && node --check subsystems/workbench/frontend/js/views/dashboard.js
node tools/build-bundles.js
echo 'mnbvcxz123' | sudo -S -u www bash -c 'cp /tmp/bundle-workbench.js /www/wwwroot/sample-mgmt/subsystems/workbench/frontend/js/bundle.js && chown www:www /www/wwwroot/sample-mgmt/subsystems/workbench/frontend/js/bundle.js'
# 按构建脚本输出更新 subsystems/workbench/frontend/index.html 的 ?v= 版本号
```
Expected: 语法 OK；bundle 生成并复制；index.html 版本号更新

- [ ] **Step 4: 前端浏览器验证（browser_use）**

- 登录 admin → 门户 → 全局工作台
- 验证：类型/等级/负责部门/申请部门下拉筛选生效；搜索编号（回车）；仅呆滞；停留时长范围；「共 N 条」计数；清除筛选复位（含部门卡 active 复位）；分页翻页；刷新后 hash 恢复筛选
- 验证阈值弹窗（ADMIN）打开/预览/保存
- 部门卡单击筛选 → 表格与总计卡联动

- [ ] **Step 5: 提交**

```bash
cd /www/wwwroot/sample-mgmt && git add subsystems/workbench/frontend/js/views/wb-filter.js subsystems/workbench/frontend/js/views/dashboard.js subsystems/workbench/frontend/js/bundle.js subsystems/workbench/frontend/index.html && git -c user.name='357346987' -c user.email='357346987@qq.com' commit -m "feat(workbench): 前端服务端筛选（筛选栏/分页/hash 持久化，移除内存过滤）"
```

---

## Task 4: 阈值弹窗全量样本兼容

**Files:**
- Modify: `subsystems/workbench/frontend/js/views/threshold.js`

- [ ] **Step 1: 读 threshold.js 找到 `openThresholdModal` 定义与预览标题渲染处**

先读文件确认当前实现（约 L1-60），找到函数开头与「按当前阈值，当前 N 条活跃项目的分布」标题字符串。

- [ ] **Step 2: openThresholdModal 打开前拉全量样本**

将原 `openThresholdModal` 改名为 `openThresholdModalInner`，并新增同名 async 包装（置于改名函数之前）：

```js
// 打开阈值弹窗：先拉无筛选全量样本（≤500 条）供预览，避免被当前筛选/分页截断
async function openThresholdModal() {
  try {
    var fresh = await api('GET', '/api/workbench?limit=500&offset=0');
    if (fresh.items && fresh.items.length) _wbItems = fresh.items;
  } catch (err) { /* 拉取失败沿用现有缓存 */ }
  openThresholdModalInner();
}
function openThresholdModalInner() {
  // ...原 openThresholdModal 函数体原样保留
}
```

- [ ] **Step 3: 预览标题标注样本范围**

将原标题字符串 `按当前阈值，当前 ' + _wbItems.length + ' 条活跃项目的分布` 改为：

```js
'按当前阈值，当前活跃数据样本 ' + _wbItems.length + ' 条（≤500）的分布'
```

- [ ] **Step 4: bundle 重建 + 复制 + 版本号（同 Task 3 Step 3）**

- [ ] **Step 5: 浏览器验证**：ADMIN 打开阈值弹窗 → 预览条数 = 全量样本数；切换阈值实时变化；保存后看板重载

- [ ] **Step 6: 提交**

```bash
cd /www/wwwroot/sample-mgmt && git add subsystems/workbench/frontend/js/views/threshold.js subsystems/workbench/frontend/js/bundle.js subsystems/workbench/frontend/index.html && git -c user.name='357346987' -c user.email='357346987@qq.com' commit -m "fix(workbench): 阈值弹窗预览改用无筛选全量样本（避免被筛选/分页截断）"
```

---

## Task 5: 全量回归 + 文档同步

**Files:**
- Modify: `README.md`（`/api/workbench` 参数说明）
- Modify: `docs/operation-manual.md`（工作台筛选说明，如存在对应章节）

- [ ] **Step 1: 回归测试（分批，避免连接池耗尽）**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/workbench-filter.test.js tests/workbench-overdue.test.js tests/workbench-drilldown.test.js --testTimeout=30000 --silent
```
Expected: 全部 PASS

- [ ] **Step 2: 三入口回归（共享文件未改动，验证 bundle 后各入口正常）**

```bash
curl -s -o /dev/null -w 'portal=%{http_code} ' http://localhost:4000/
curl -s -o /dev/null -w 'samples=%{http_code} ' http://localhost:4000/subsystems/samples/frontend/index.html
curl -s -o /dev/null -w 'fixtures=%{http_code} ' http://localhost:4000/subsystems/fixtures/frontend/index.html
curl -s -o /dev/null -w 'workbench=%{http_code}\n' http://localhost:4000/subsystems/workbench/frontend/index.html
```
Expected: 全部 200

- [ ] **Step 3: 更新 README.md**：`/api/workbench` 行补筛选参数说明（type/level/dept/apply_dept/keyword/stage/dormant/min_hours/max_hours + limit/offset 分页，返回 summary/deptStats）

- [ ] **Step 4: 更新操作说明书**：工作台章节补充「筛选栏支持搜索编号/名称、按申请部门/阶段/呆滞/停留时长筛选、分页、刷新后筛选保留」

- [ ] **Step 5: 提交**

```bash
cd /www/wwwroot/sample-mgmt && git add README.md docs/operation-manual.md && git -c user.name='357346987' -c user.email='357346987@qq.com' commit -m "docs: 同步工作台服务端筛选参数说明"
```

- [ ] **Step 6: 输出修改完成强制报告（AGENTS.md §9）**：各改动文件行数/字符/函数数 + 冗余清单 + 上线后 1~3 周期监控提示（/api/workbench 响应时长、4xx 参数异常、seed/测试护栏）

---

## Self-Review

**Spec 覆盖对照**：
- 服务端筛选（buildWorkbenchSQL + 路由）→ Task 2 ✓
- 等级计算后端化（workbench-overdue.js + 返回 overdue_* 字段）→ Task 1 + 2 ✓
- 前端筛选栏/计数/清除/分页/hash 持久化 → Task 3 ✓
- 阈值弹窗全量样本 → Task 4 ✓
- 测试（overdue 一致性 + 接口筛选/分页/统计）→ Task 1/2 ✓
- 文档同步 + 回归 → Task 5 ✓
- bundle 重建/重启/提交：各 Task 内包含 ✓

**占位符扫描**：无 TBD/TODO；Task 4 Step 1 明确要求先读文件再改（因 threshold.js 现状需确认后精确替换）。

**类型/命名一致性**：`buildWorkbenchSQL`/`calcOverdue`/`renderWbFilterBar`/`renderWbPager`/`parseWbHash`/`serializeWbHash`/`wbSetFilter`/`wbClearFilter`/`deptNames` 在 Task 2/3 定义与调用一致；`summary`/`deptStats`/`overdue_level/overdue_label/overdue_hours/overdue_reason` 前后端字段名一致。
