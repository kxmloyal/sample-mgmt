# 治具新建申请清单列表式批量录入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 治具新建申请页（#/new）改造为「清单列表式批量录入」：选机型（可新建）→ 动态行表格录入 N 条 → 事务批量创建；同时修复保养周期失效（P1）、新建机型显示不同步（P2）、机型只读显示全称（P3）、前端必填校验（P5）、提交防抖（L2）、窄屏堆叠。

**Architecture:** 后端新增 `POST /api/fixtures/batch`（事务，全成或全回滚）；`createFixture` 支持事务连接 + `maintenance_cycle_days`（P1/L1 根治）；单条 `POST /api/fixtures` 同步透传保养周期（L1）。前置步骤拆分 dao.js（98.5% 红线）→ 新建 `dao-dormant.js` 子模块，db.js 零改动。前端 new.js 重写为行式表格。

**Tech Stack:** Node.js + Express 4（CommonJS）、MariaDB（mysql2）、原生前端（bundle）、Jest + supertest。

**设计依据:** `docs/superpowers/specs/2026-08-13-fixture-new-batch-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
|---|---|---|
| `subsystems/fixtures/db/dao-dormant.js` | 呆滞/设置子模块（getFixtureSetting/setFixtureSetting/listDormantFixtures + DORMANT_STATUS 常量） | 新建（Task 1） |
| `subsystems/fixtures/db/dao.js` | 拆分引用 dao-dormant；createFixture 支持 conn + maintenance_cycle_days | 修改（Task 1+3） |
| `subsystems/fixtures/backend/routes-fixtures.js` | 新增 batch 路由；单条接口透传 maintenance_cycle_days | 修改（Task 3） |
| `tests/fixture-batch.test.js` | 批量/单条保养周期/事务回滚测试 | 新建（Task 2） |
| `subsystems/fixtures/frontend/js/views/new.js` | 清单列表式批量录入重写 | 修改（Task 5） |
| `subsystems/fixtures/frontend/css/module.css` | 窄屏行堆叠 | 修改（Task 6） |
| `subsystems/fixtures/frontend/js/bundle.js` + `index.html` | 构建产物 + 版本号 | 修改（Task 7） |

**关键既有代码锚点：**
- dao.js 为工厂 `module.exports = function createDao(deps)`，db.js（L108-131）扫描 `subsystems/*/db/dao.js` 单文件实例化后展开到 `allDaoExports`——**新增 dao 文件必须由 dao.js 内部 require，禁止改 db.js**
- dao.js L196 return 展开全部 23 个函数；L91-115 为待迁出（getFixtureSetting/setFixtureSetting/listDormantFixtures）
- dao.js L52/L81（listFixtures/countAllFixtures 呆滞分支）调用 getFixtureSetting——迁移后改 `DORM.getFixtureSetting`
- dao.js 已有 `fetchOne(conn, sql, params)`（L11-14）与 `updateFixture` 的 conn 事务模式（L117-149）可参照
- routes-fixtures.js 路由顺序约束：固定路径（settings/models/logs/dashboard）必须在 `:id` 之前；batch 插在 settings 之后、models 之前

---

## Task 1: dao.js 拆分（前置步骤，强制）

**Files:**
- Create: `subsystems/fixtures/db/dao-dormant.js`
- Modify: `subsystems/fixtures/db/dao.js`

- [ ] **Step 1: 创建 dao-dormant.js**

```js
// subsystems/fixtures/db/dao-dormant.js — 治具呆滞/配置子模块（2026-08-13 从 dao.js 拆出，规避容量红线）
// 工厂模式：接收 deps{q,one,run}，返回配置读写与呆滞查询；db.js 不改动，由 dao.js 内部 require 展开
module.exports = function createDormantDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run;

  // 呆滞判定的活跃状态集（停滞 + 在库无人领用，排除 IN_USE 与 RETIRED）
  var DORMANT_STATUS = "('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE','TRANSFERRED')";

  // 读取治具配置项（fixtures_settings），无记录返回默认值
  async function getFixtureSetting(k, defaultVal) {
    var row = await one('SELECT v FROM fixtures_settings WHERE k = ?', [k]);
    return row ? row.v : (defaultVal != null ? defaultVal : null);
  }

  // 写入治具配置项（存在则更新，幂等）
  async function setFixtureSetting(k, v) {
    await run('INSERT INTO fixtures_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);
  }

  // 呆滞治具列表：状态停滞 + 在库无人领用（按最近状态变更时间判定），返回 dormant_days/dormant_reason
  function listDormantFixtures(threshold) {
    var days = Number(threshold) || 60;
    return q(
      "SELECT f.*, DATEDIFF(NOW(), COALESCE(l.last_at, f.created_at)) AS dormant_days, " +
      "CASE WHEN f.status='TRANSFERRED' THEN '在库无人领用' ELSE '状态长期停滞' END AS dormant_reason " +
      "FROM fixtures f " +
      "LEFT JOIN (SELECT fixture_id, MAX(created_at) AS last_at FROM fixture_logs GROUP BY fixture_id) l ON l.fixture_id = f.id " +
      "WHERE f.status IN " + DORMANT_STATUS + " " +
      "AND DATEDIFF(NOW(), COALESCE(l.last_at, f.created_at)) >= ? " +
      "ORDER BY dormant_days DESC",
      [days]
    );
  }

  return { getFixtureSetting: getFixtureSetting, setFixtureSetting: setFixtureSetting, listDormantFixtures: listDormantFixtures, DORMANT_STATUS: DORMANT_STATUS };
};
```

- [ ] **Step 2: dao.js 顶部引入子模块**

在 dao.js L3（`var q = deps.q, ...`）之后插入：

```js
  // 呆滞/配置子模块（2026-08-13 拆分，规避 dao.js 容量红线；db.js 无需改动）
  var DORM = require('./dao-dormant')(deps);
```

- [ ] **Step 3: dao.js 删除 L91-115 三个函数（getFixtureSetting/setFixtureSetting/listDormantFixtures 整段删除）**

删除 `// 读取治具配置项...` 至 `listDormantFixtures` 结束的全部行（原 L91-115）。

- [ ] **Step 4: dao.js 呆滞分支调用改 DORM 前缀**

L52 与 L81 的 `Number(await getFixtureSetting('dormant_days', 60))` → `Number(await DORM.getFixtureSetting('dormant_days', 60))`（两处）；L55 与 L84 的状态 IN 字符串可保留字面量（行为不变，Task 1 不重构 SQL）。

- [ ] **Step 5: dao.js 返回对象展开 DORM**

L196 改为：

```js
  return Object.assign({ nextFixtureNo: nextFixtureNo, createFixture: createFixture, getFixtureById: getFixtureById, getFixtureByNo: getFixtureByNo, listFixtures: listFixtures, countAllFixtures: countAllFixtures, updateFixture: updateFixture, addFixtureLog: addFixtureLog, countFixturesByStatus: countFixturesByStatus, listOverdueFixtures: listOverdueFixtures, listMyPendingFixtures: listMyPendingFixtures, getFixtureDetailById: getFixtureDetailById, listFixtureLogs: listFixtureLogs, getFixtureLogsByFixtureId: getFixtureLogsByFixtureId, listOverdueMaintenanceFixtures: listOverdueMaintenanceFixtures, listUpcomingMaintenanceFixtures: listUpcomingMaintenanceFixtures, getFixturePhotoCounts: getFixturePhotoCounts, getFirstPhotoMap: getFirstPhotoMap }, DORM);
```

- [ ] **Step 6: 语法检查**

Run: `node -c subsystems/fixtures/db/dao-dormant.js && node -c subsystems/fixtures/db/dao.js`
Expected: 均无输出

- [ ] **Step 7: 拆分无损回归（既有测试必须全过）**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixtures-dormant.test.js tests/fixture-models.test.js tests/fixtures-export.test.js 2>&1 | grep -E "Tests:|Suites:"`
Expected: 三个套件全部 PASS（拆分纯搬移，行为不变；若 fixtures-dormant 因 hook 超时失败，属环境既存，需在报告中与改动前 baseline 对比说明）

- [ ] **Step 8: 提交**

```bash
git add subsystems/fixtures/db/dao-dormant.js subsystems/fixtures/db/dao.js
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "refactor(fixtures): 拆分 dao.js 呆滞/配置子模块至 dao-dormant.js

- dao.js 98.5% 容量红线，迁出 getFixtureSetting/setFixtureSetting/listDormantFixtures
- db.js 零改动，dao.js 内部 require 并展开导出，外部 D.xxx 接口不变
- 呆滞状态常量收敛至 DORMANT_STATUS"
```

---

## Task 2: 写批量接口测试（先失败）

**Files:**
- Create: `tests/fixture-batch.test.js`

- [ ] **Step 1: 创建测试文件**

```js
// tests/fixture-batch.test.js — 治具批量新建（清单列表式）+ 保养周期透传
// fixtures 未上线可安全写入；测试自建数据 afterAll 清理（先删日志再删治具）
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

if (isDeployed('fixtures')) {
  describe.skip('治具子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过', () => {}); });
} else {

describe('治具批量新建', () => {
  let adminAgent;
  let createdIds = [];
  const D = require('../db');

  beforeAll(async () => {
    await getApp();
    ({ agent: adminAgent } = await login('admin', 'admin123'));
  }, 30000);

  afterAll(async () => {
    if (!createdIds.length) return;
    const placeholders = createdIds.map(() => '?').join(',');
    await D.pool().execute('DELETE FROM fixture_logs WHERE fixture_id IN (' + placeholders + ')', createdIds);
    await D.pool().execute('DELETE FROM fixtures WHERE id IN (' + placeholders + ')', createdIds);
  });

  describe('POST /api/fixtures/batch', () => {
    it('批量创建 N 条：编号连续、状态 REQUESTED、保养周期落库、CREATE 日志', async () => {
      const res = await adminAgent.post('/api/fixtures/batch').send({
        model: 'AGING-8',
        items: [
          { name: '批量测试治具A', spec: 'DC-12V', station: 'SMT1', category: '测试治具', maintenance_cycle_days: 45 },
          { name: '批量测试治具B', maintenance_cycle_days: 0 }
        ]
      });
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(2);
      expect(res.body.fixtures.length).toBe(2);
      res.body.fixtures.forEach((f, i) => {
        expect(f.status).toBe('REQUESTED');
        expect(f.model).toBe('AGING-8');
        expect(f.fixture_no).toMatch(/^FJ-\d{6}$/);
        createdIds.push(f.id);
      });
      expect(res.body.fixtures[0].maintenance_cycle_days).toBe(45);
      expect(res.body.fixtures[1].maintenance_cycle_days).toBe(0);
      const logs = await D.pool().execute('SELECT COUNT(*) AS c FROM fixture_logs WHERE fixture_id = ? AND action = ?', [res.body.fixtures[0].id, 'CREATE']);
      expect(logs[0][0].c).toBe(1);
    });

    it('含空名称行 → 400 且无任何落库（事务回滚）', async () => {
      const before = await D.pool().execute('SELECT COUNT(*) AS c FROM fixtures');
      const totalBefore = before[0][0].c;
      const res = await adminAgent.post('/api/fixtures/batch').send({
        model: 'AGING-8',
        items: [{ name: '正常行' }, { name: '  ' }]
      });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('第 2 行');
      const after = await D.pool().execute('SELECT COUNT(*) AS c FROM fixtures');
      expect(after[0][0].c).toBe(totalBefore);
    });

    it('model 缺失 / items 空数组 / 超 50 条 → 400', async () => {
      const r1 = await adminAgent.post('/api/fixtures/batch').send({ items: [{ name: 'x' }] });
      expect(r1.status).toBe(400);
      const r2 = await adminAgent.post('/api/fixtures/batch').send({ model: 'AGING-8', items: [] });
      expect(r2.status).toBe(400);
      const r3 = await adminAgent.post('/api/fixtures/batch').send({ model: 'AGING-8', items: Array.from({ length: 51 }, () => ({ name: 'x' })) });
      expect(r3.status).toBe(400);
    });
  });

  describe('单条 POST /api/fixtures 保养周期透传（L1）', () => {
    it('带 maintenance_cycle_days → 落库生效', async () => {
      const res = await adminAgent.post('/api/fixtures').send({ name: '单条周期测试', model: 'AGING-8', maintenance_cycle_days: 30 });
      expect(res.status).toBe(200);
      expect(res.body.maintenance_cycle_days).toBe(30);
      createdIds.push(res.body.id);
    });

    it('不带 → 落库为 NULL（兼容旧行为）', async () => {
      const res = await adminAgent.post('/api/fixtures').send({ name: '单条无周期测试', model: 'AGING-8' });
      expect(res.status).toBe(200);
      expect(res.body.maintenance_cycle_days).toBeNull();
      createdIds.push(res.body.id);
    });
  });
});

}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixture-batch.test.js 2>&1 | grep -E "Tests:|Cannot POST /api/fixtures/batch|✕" | head -20`
Expected: FAIL（`Cannot POST /api/fixtures/batch` 404；单条透传用例失败因 maintenance_cycle_days 未落库）

---

## Task 3: 后端实现（createFixture 事务化 + batch 路由 + 单条透传）

**Files:**
- Modify: `subsystems/fixtures/db/dao.js`
- Modify: `subsystems/fixtures/backend/routes-fixtures.js`

- [ ] **Step 1: dao.js createFixture 支持事务连接 + maintenance_cycle_days**

将 dao.js L21-37 整段替换为：

```js
  async function createFixture(data, conn) {
    var { name, spec, model, station, category, requested_by, requested_dept, request_note, request_image, notes, maintenance_cycle_days } = data;
    var sql = 'INSERT INTO fixtures (fixture_no,name,spec,model,station,category,status,requested_by,requested_dept,request_note,request_image,notes,maintenance_cycle_days) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)';
    var lastErr;
    for (var i = 0; i < 3; i++) {
      var ns = await nextFixtureNo();
      var params = [ns, name||null, spec||null, model||null, station||null, category||null, 'REQUESTED', requested_by||null, requested_dept||null, request_note||null, request_image||null, notes||null, maintenance_cycle_days != null ? maintenance_cycle_days : null];
      try {
        if (conn) await conn.execute(sql, params);
        else await run(sql, params);
        return await fetchOne(conn, 'SELECT * FROM fixtures WHERE fixture_no = ?', [ns]);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || new Error('createFixture 重试 3 次仍失败');
  }
```

> ⚠️ 事务内必须用 `fetchOne(conn, ...)` 读取（全局 one() 查不到未提交数据）。fetchOne 已在 dao.js L11-14 存在。

- [ ] **Step 2: routes-fixtures.js 单条接口透传 maintenance_cycle_days（L1）**

L105-108 修改为：

```js
      var _b = req.body || {}, name = _b.name, spec = _b.spec, model = _b.model, station = _b.station,
          category = _b.category, request_note = _b.request_note, notes = _b.notes, maintenance_cycle_days = _b.maintenance_cycle_days;
      if (!name || !name.trim()) return res.status(400).json({ error: '治具名称必填' });
      var f = await D.createFixture({
        name: name.trim(), spec: spec, model: model, station: station,
        category: category, requested_by: u.id, requested_dept: u.dept,
        request_note: request_note, notes: notes, maintenance_cycle_days: maintenance_cycle_days
      });
```

- [ ] **Step 3: routes-fixtures.js 新增 batch 路由（settings 路由之后、models 路由之前插入）**

```js
  // 批量新建治具：清单列表式（同一机型批量创建，事务保证全成或全回滚）
  app.post('/api/fixtures/batch', requireAuth, async function(req, res) {
    var conn;
    try {
      var u = await currentUser(req);
      var _b = req.body || {}, model = (_b.model || '').trim(), items = Array.isArray(_b.items) ? _b.items : [];
      if (!model) return res.status(400).json({ error: '请选择机型' });
      if (!items.length) return res.status(400).json({ error: '请至少填写一条治具' });
      if (items.length > 50) return res.status(400).json({ error: '单次最多创建 50 条治具' });
      var cleaned = items.map(function(it, idx) {
        var name = ((it || {}).name || '').trim();
        if (!name) { var e = new Error('第 ' + (idx + 1) + ' 行：治具名称必填'); e.status = 400; throw e; }
        return { name: name, spec: ((it.spec) || '').trim(), station: ((it.station) || '').trim(), category: ((it.category) || '').trim(), maintenance_cycle_days: it.maintenance_cycle_days };
      });
      conn = await D.pool().getConnection();
      await conn.beginTransaction();
      var fixtures = [];
      for (var i = 0; i < cleaned.length; i++) {
        var f = await D.createFixture(Object.assign({ model: model, requested_by: u.id, requested_dept: u.dept }, cleaned[i]), conn);
        await D.addFixtureLog({ fixture_id: f.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '批量新建申请' }, conn);
        fixtures.push(f);
      }
      await conn.commit();
      res.json({ created: fixtures.length, fixtures: fixtures });
    } catch (err) {
      if (conn) { try { await conn.rollback(); } catch (e) {} }
      var status = err.status || 500;
      res.status(status).json({ error: err.message || '批量创建失败' });
    } finally {
      if (conn) { try { conn.release(); } catch (e) {} }
    }
  });
```

> ⚠️ `D.addFixtureLog(log, conn)` 已支持 conn（dao.js L151-157）。`D.pool()` 由 db.js 暴露（routes 已用）。

- [ ] **Step 4: 语法检查**

Run: `node -c subsystems/fixtures/db/dao.js && node -c subsystems/fixtures/backend/routes-fixtures.js`
Expected: 均无输出

---

## Task 4: 测试通过 + 回归 + 提交

- [ ] **Step 1: 运行批量测试**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixture-batch.test.js 2>&1 | grep -E "Tests:|✕"`
Expected: `Tests: 6 passed, 6 total`

- [ ] **Step 2: 全量回归（含拆分无损确认）**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www env TEST_MODE=1 npx jest tests/fixture-batch.test.js tests/fixtures-dormant.test.js tests/fixture-models.test.js tests/fixtures-export.test.js tests/subsystems.test.js 2>&1 | grep -E "Tests:|Suites:|✕" | head -20`
Expected: 新增套件全过；既有套件与 Task 1 baseline 一致（fixtures-dormant/subsystems 若存在环境既存失败需对比说明，不得新增失败）

- [ ] **Step 3: 提交**

```bash
git add subsystems/fixtures/db/dao.js subsystems/fixtures/backend/routes-fixtures.js tests/fixture-batch.test.js
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(fixtures): 批量新建治具接口 + 保养周期透传

- POST /api/fixtures/batch：清单列表式批量创建（事务全成或全回滚，1~50 条行号校验）
- createFixture 支持事务连接参数 + maintenance_cycle_days 落库
- 单条 POST /api/fixtures 同步透传保养周期（L1，消除批量/单条分歧）
- 测试 6 用例：批量成功/空行回滚/参数边界/单条透传/兼容 NULL"
```

---

## Task 5: 前端 new.js 重写（清单列表式 + P2/P3/P5/L2）

**Files:**
- Modify: `subsystems/fixtures/frontend/js/views/new.js`

- [ ] **Step 1: 整文件重写为行式表格批量录入**

```js
// fixture-new.js — 治具新建申请（清单列表式批量录入：① 选择机型 → ② 动态行表格，一次提交 N 条）
var _fnModel = '';        // 当前选中机型 code
var _fnModelFull = '';    // 当前选中机型全称（显示用）
var _fnModels = [];       // 机型下拉数据
var _fnRows = [];         // 治具清单行 [{name,spec,station,category,cycle}]
var _fnSubmitting = false; // 提交防抖（L2）

async function renderFixtureNew() {
  _fnModel = ''; _fnModelFull = ''; _fnModels = []; _fnRows = []; _fnSubmitting = false;
  _fnRows.push({ name: '', spec: '', station: '', category: '', cycle: 90 });
  var html = '<div class="card" style="max-width:860px">';
  html += '<h3 style="margin:0 0 16px">新建治具申请（批量）</h3>';

  // ① 选择机型
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 选择机型 <span style="color:var(--bad)">*</span></div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<select id="fn-model" onchange="fnPickModel(this.value)" style="flex:1;min-width:180px"><option value="">请选择机型…</option></select>';
  html += '<span id="fn-model-new-zone" style="display:none;gap:8px;align-items:center;flex-wrap:wrap;width:100%">';
  html += '<fluent-text-field id="fn-model-code" placeholder="机型短码(6~20位字母数字)"></fluent-text-field>';
  html += '<fluent-text-field id="fn-model-name" placeholder="机型全称(必填)" style="flex:1"></fluent-text-field>';
  html += '<fluent-button appearance="accent" size="small" onclick="fnCreateModel()">保存机型</fluent-button>';
  html += '<fluent-button appearance="neutral" size="small" onclick="fnCancelNewModel()">取消</fluent-button>';
  html += '</span></div>';
  html += '<div style="margin-top:8px" id="fn-model-actions"></div>';
  html += '<div id="fn-model-picked" style="margin-top:8px;display:none;font-size:13px;color:var(--brand);font-weight:600"></div>';
  html += '</div>';

  // ② 治具清单（行式表格）
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  html += '<div style="font-weight:600;font-size:13px">② 治具清单 <span class="muted" style="font-weight:400">（同一机型批量创建，每次最多 50 条）</span></div>';
  html += '<fluent-button appearance="lightweight" size="small" onclick="fnAddRow()">＋ 添加一行</fluent-button>';
  html += '</div>';
  html += '<div id="fn-rows"></div>';
  html += '<div style="margin-top:14px">';
  html += '<fluent-button id="fn-submit" appearance="accent" onclick="submitFixtureBatch(event)">提交申请</fluent-button>';
  html += '</div></div></div>';
  document.getElementById('view').innerHTML = html;
  await fnLoadModels();
  fnRenderRows();
}

// 加载机型下拉（含治具计数）；仅 RD/ADMIN 显示「新建机型」「管理机型」
async function fnLoadModels() {
  try {
    var list = await api('GET', '/api/fixtures/models');
    _fnModels = list || [];
    var sel = document.getElementById('fn-model');
    if (!sel) return;
    sel.innerHTML = '<option value="">请选择机型…</option>' + _fnModels.map(function(m) {
      return '<option value="' + e(m.code) + '">' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + '治具)' : '') + '</option>';
    }).join('');
    if (_fnModel) { sel.value = _fnModel; fnPickModel(_fnModel); }
    var canManage = typeof me !== 'undefined' && me && ['ADMIN', 'RD'].indexOf(me.role) !== -1;
    var zone = document.getElementById('fn-model-actions');
    if (zone) {
      zone.innerHTML = canManage
        ? '<fluent-button appearance="lightweight" size="small" onclick="fnShowNewModel()">＋ 新建机型</fluent-button><fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()">管理机型</fluent-button>'
        : '<span class="muted" style="font-size:12px">机型由研发/管理员维护，如需新机型请联系研发</span>';
    }
  } catch (e) { showToast(e.message); }
}

// 选择机型：记录 code+全称，②区顶部显示「机型：code · 全称」（P3）
function fnPickModel(val) {
  _fnModel = val;
  var m = _fnModels.filter(function(x) { return x.code === val; })[0];
  _fnModelFull = m ? m.full_name : '';
  var picked = document.getElementById('fn-model-picked');
  if (picked) { picked.style.display = val ? 'block' : 'none'; picked.textContent = val ? '已选机型：' + val + ' · ' + _fnModelFull : ''; }
}

function fnShowNewModel() { var z = document.getElementById('fn-model-new-zone'); if (z) z.style.display = 'flex'; }
function fnCancelNewModel() {
  var z = document.getElementById('fn-model-new-zone'); if (z) z.style.display = 'none';
  document.getElementById('fn-model-code').value = ''; document.getElementById('fn-model-name').value = '';
}

// 内联新建机型：校验 → POST → 自动选中并同步机型显示（P2 修复）
async function fnCreateModel() {
  var code = document.getElementById('fn-model-code').value.trim().toUpperCase();
  var full_name = document.getElementById('fn-model-name').value.trim();
  if (!code || !full_name) { showToast('请填写机型短码和全称'); return; }
  try {
    await api('POST', '/api/fixtures/models', { code: code, full_name: full_name });
    _fnModel = code;
    fnCancelNewModel();
    await fnLoadModels(); // 内部会 fnPickModel 同步显示（P2）
    showToast('机型已新建并选中');
  } catch (e) { showToast(e.message); }
}

// 行式表格渲染
function fnRenderRows() {
  var box = document.getElementById('fn-rows');
  if (!box) return;
  box.innerHTML = _fnRows.map(function(r, i) {
    return '<div class="fn-row" data-i="' + i + '">' +
      '<input class="fn-cell fn-name" value="' + e(r.name) + '" placeholder="治具名称*" oninput="fnSetRow(' + i + ',\'name\',this.value)" onblur="fnMarkName(' + i + ')"/>' +
      '<input class="fn-cell" value="' + e(r.spec) + '" placeholder="规格" oninput="fnSetRow(' + i + ',\'spec\',this.value)"/>' +
      '<input class="fn-cell" value="' + e(r.station) + '" placeholder="工站" oninput="fnSetRow(' + i + ',\'station\',this.value)"/>' +
      '<input class="fn-cell" value="' + e(r.category) + '" placeholder="分类" oninput="fnSetRow(' + i + ',\'category\',this.value)"/>' +
      '<input class="fn-cell fn-cycle" type="number" min="0" value="' + (r.cycle != null ? r.cycle : '') + '" placeholder="保养(天)" oninput="fnSetRow(' + i + ',\'cycle\',this.value)"/>' +
      '<button type="button" class="fn-del" onclick="fnDelRow(' + i + ')" ' + (_fnRows.length <= 1 ? 'disabled' : '') + '>删除</button>' +
      '</div>';
  }).join('');
}

function fnSetRow(i, key, val) { if (_fnRows[i]) _fnRows[i][key] = val; }
function fnMarkName(i) {
  var row = document.querySelector('.fn-row[data-i="' + i + '"] .fn-name');
  if (row) row.style.borderColor = (_fnRows[i] && _fnRows[i].name && _fnRows[i].name.trim()) ? '' : 'var(--bad)';
}
function fnAddRow() {
  if (_fnRows.length >= 50) { showToast('单次最多 50 条'); return; }
  _fnRows.push({ name: '', spec: '', station: '', category: '', cycle: 90 });
  fnRenderRows();
}
function fnDelRow(i) {
  if (_fnRows.length <= 1) { showToast('至少保留一行'); return; }
  _fnRows.splice(i, 1);
  fnRenderRows();
}

// 批量提交：行校验（P5）→ POST /api/fixtures/batch → 防抖（L2）
async function submitFixtureBatch(e) {
  e.preventDefault();
  if (_fnSubmitting) return;
  var model = _fnModel;
  if (!model) { showToast('请先选择机型'); return; }
  var valid = true;
  _fnRows.forEach(function(r, i) {
    if (!r.name || !r.name.trim()) { valid = false; fnMarkName(i); }
  });
  if (!valid) { showToast('存在名称为空的治具行，请补全后再提交'); return; }
  var items = _fnRows.map(function(r) {
    var it = { name: r.name.trim(), spec: r.spec, station: r.station, category: r.category };
    if (r.cycle != null && r.cycle !== '') it.maintenance_cycle_days = parseInt(r.cycle, 10);
    return it;
  });
  _fnSubmitting = true;
  var btn = document.getElementById('fn-submit');
  if (btn) btn.setAttribute('disabled', '');
  try {
    var res = await api('POST', '/api/fixtures/batch', { model: model, items: items });
    showToast('成功创建 ' + res.created + ' 条治具');
    location.hash = '#/list';
  } catch (err) {
    showToast(err.message);
    _fnSubmitting = false;
    if (btn) btn.removeAttribute('disabled');
  }
}
```

> 说明：行单元格用原生 `<input>` 而非 fluent 组件，便于动态行管理；oninput 实时写 _fnRows。

- [ ] **Step 2: 语法检查**

Run: `node -c /tmp/new.js`（写回前在 /tmp 校验）
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
git add subsystems/fixtures/frontend/js/views/new.js
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(fixtures): 新建申请改清单列表式批量录入

- 行式表格动态增删（1~50 行），机型区显示 code·全称（P3）
- 新建机型成功自动选中并同步显示（P2）；空名称行标红拦截（P5）
- 提交防抖 + loading 禁用（L2）；批量成功后跳列表"
```

---

## Task 6: module.css 窄屏行堆叠

**Files:**
- Modify: `subsystems/fixtures/frontend/css/module.css`

- [ ] **Step 1: 追加行表格样式（含窄屏堆叠）**

文件末尾追加：

```css
/* 批量新建治具行式表格（2026-08-13） */
.fn-row { display:flex; gap:6px; align-items:center; margin-bottom:8px; flex-wrap:wrap; }
.fn-row .fn-cell { flex:1; min-width:90px; border:1px solid var(--line); border-radius:4px; padding:6px 8px; font-size:13px; }
.fn-row .fn-name { flex:2; }
.fn-row .fn-cycle { max-width:90px; }
.fn-row .fn-del { border:1px solid var(--line); border-radius:4px; background:transparent; color:var(--bad); cursor:pointer; padding:6px 10px; font-size:12px; }
.fn-row .fn-del:disabled { color:#bbb; cursor:not-allowed; }
@media (max-width: 576px) {
  .fn-row { flex-direction:column; align-items:stretch; }
  .fn-row .fn-name, .fn-row .fn-cell, .fn-row .fn-cycle { max-width:none; width:100%; }
}
```

- [ ] **Step 2: 提交**

```bash
git add subsystems/fixtures/frontend/css/module.css
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "style(fixtures): 批量新建行表格样式与窄屏堆叠"
```

---

## Task 7: 部署与浏览器回归

**Files:**
- 构建产物：`subsystems/fixtures/frontend/js/bundle.js`
- Modify: 4 个子系统 `index.html`（版本号）

- [ ] **Step 1: 重建 bundle**

Run: `cd /www/wwwroot/sample-mgmt && sudo -u www node tools/build-bundles.js 2>&1 | tail -12`
Expected: 取 VER（如 bxxxxxx），fixtures `files=17`，new.js 已并入

- [ ] **Step 2: 复制 4 个 bundle + 更新 4 个 index.html 版本号**

Run（VER 替换为 Step 1 实际值）:

```bash
echo 'mnbvcxz123' | sudo -S -u www bash -c 'cp /tmp/bundle-fixtures.js /www/wwwroot/sample-mgmt/subsystems/fixtures/frontend/js/bundle.js && cp /tmp/bundle-samples.js /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/bundle.js && cp /tmp/bundle-projects.js /www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/bundle.js && cp /tmp/bundle-workbench.js /www/wwwroot/sample-mgmt/subsystems/workbench/frontend/js/bundle.js && cd /www/wwwroot/sample-mgmt && sed -i "s/bundle.js?v=[a-z0-9]*/bundle.js?v=VER/g" subsystems/fixtures/frontend/index.html subsystems/samples/frontend/index.html subsystems/projects/frontend/index.html subsystems/workbench/frontend/index.html'
```

- [ ] **Step 3: 重启服务（精确 kill 4000 端口 PID）**

```bash
sudo ss -tlnp | grep ':4000'   # 记录 PID
sudo kill <PID> && sleep 1
sudo -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
sleep 3 && sudo ss -tlnp | grep ':4000'   # 确认新 PID
```

- [ ] **Step 4: 后端接口冒烟**

```bash
curl -s -c /tmp/cj2.txt -X POST http://localhost:4000/api/login -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' -o /dev/null -w "login:%{http_code}\n"
curl -s -b /tmp/cj2.txt -X POST http://localhost:4000/api/fixtures/batch -H 'Content-Type: application/json' -d '{"model":"AGING-8","items":[{"name":"冒烟测试A","maintenance_cycle_days":60}]}'
```
Expected: login:200；batch 返回 `{"created":1,...}`（记录该治具 id，浏览器回归后清理）

- [ ] **Step 5: 浏览器回归（browser_use 子代理）**

验证清单：
1. #/new 页面：①选机型 ②行式表格（默认 1 行，列=名称/规格/工站/分类/保养/删除）
2. 选机型后「已选机型：code · 全称」显示（P3）
3. 空名称行提交 → toast「存在名称为空的治具行」+ 行标红（P5）
4. 未选机型提交 → toast「请先选择机型」
5. 「＋添加一行」至 2 行 → 填 2 条 → 提交 → toast「成功创建 2 条治具」→ 跳列表；列表可见 2 条该机型治具（记录 id，回归后清理）
6. 删除行：2 行时删 1 行正常；1 行时删除键禁用
7. 窄屏（浏览器 viewport 400px）行堆叠为纵向
8. 保养周期：提交行填 45 → 详情页基础信息卡「保养周期 45 天」（P1 验证）
9. 双系统回归：治具扫码台单条创建仍正常（POST /api/fixtures 仅增字段）；样品系统不受影响
10. 页面控制台无 JS 错误
11. 清理冒烟/回归产生的测试治具（DELETE 通过 SQL 或直接说明留待清理，fixtures 未上线）

- [ ] **Step 6: 提交**

```bash
git add subsystems/fixtures/frontend/js/bundle.js subsystems/fixtures/frontend/index.html subsystems/samples/frontend/index.html subsystems/samples/frontend/js/bundle.js subsystems/projects/frontend/index.html subsystems/projects/frontend/js/bundle.js subsystems/workbench/frontend/index.html subsystems/workbench/frontend/js/bundle.js
git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(fixtures): 批量新建部署——bundle 重建与版本号更新"
```

---

## 自审（Self-Review）

**Spec 覆盖：**
- §3 行式表格交互（增删/校验/防抖）→ Task 5 ✅
- §4.1 batch 端点（事务/行号校验/1~50）→ Task 3 ✅
- §4.2 createFixture 加字段（P1）→ Task 3 ✅
- §4.3 单条透传（L1）→ Task 3 ✅
- §5 dao.js 拆分（前置）→ Task 1 ✅
- §6 测试（批量成功/回滚/边界/透传/NULL）→ Task 2+4 ✅
- L2 防抖 → Task 5 `_fnSubmitting` ✅
- 窄屏堆叠 → Task 6 ✅
- P2 同步显示 → Task 5 `fnLoadModels` 内 `fnPickModel` 调用 ✅
- P3 机型显示 code·全称 → Task 5 `fn-model-picked` ✅
- P5 行校验 → Task 5 `submitFixtureBatch` ✅

**占位符扫描：** 无 TBD/TODO；Task 7 Step 2 `VER` 明确标注为 Step 1 实际输出。

**类型一致性：**
- `createFixture(data, conn)` 签名 Task 3 定义，routes-fixtures.js 单条/batch 两处调用一致 ✅
- `fetchOne(conn, sql, params)` 复用 dao.js 既有函数 ✅
- `DORM.getFixtureSetting` 与 `DORMANT_STATUS` 在 dao-dormant.js 定义、dao.js 引用一致 ✅
- 前端 `_fnModel/_fnModelFull/_fnModels/_fnRows/_fnSubmitting` 与 `fnRenderRows/fnSetRow/fnMarkName/fnAddRow/fnDelRow/submitFixtureBatch/fnPickModel/fnCreateModel/fnLoadModels` 均在 Task 5 定义并被引用 ✅
- `.fn-row/.fn-cell/.fn-name/.fn-cycle/.fn-del` Task 5 使用、Task 6 定义 ✅
