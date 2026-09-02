// routes/fixtures.js — 治具路由：CRUD + 扫码状态机
var D = require('../../../db');
var H = require('./fixture-helpers');
var AM = require('./fixture-actions-make');
var { doAccept, doCancel, doReturn, doUse, doMaintenance } = require('./fixture-actions-cycle');
var AR = require('./fixture-actions-repair');
var AS = require('./fixture-actions-special');
var { toCsv, sendCsv } = require('../../../shared/csv');
var MD = require('../db/models-dao');
var cache = require('../../../shared/cache');

// 机型主数据为共享表(sample_models)：治具侧新增/编辑机型须失效样品侧机型/下拉缓存
var SHARED_MODEL_KEYS = ['sl_sample_models', 'sl_sample_model_options'];
function invalidateSharedModelCaches() { SHARED_MODEL_KEYS.forEach(function (k) { cache.del(k); }); }

function register(app) {
  var requireAuth = app.locals.requireAuth;
  var currentUser = app.locals.currentUser;
  MD.setPool(D.pool());
  // 启动即执行存量机型迁移（幂等 INSERT IGNORE，重复执行无副作用）
  MD.migrateFixtureModels().catch(function () { /* 迁移失败不影响启动，models 路由首次调用会重试 */ });

  // 治具解析（供扫码台查询）
  app.get('/api/fixtures/scan', requireAuth, async function(req, res) {
    var code = (req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: '无效码' });
    var f = await D.getFixtureByNo(code);
    if (!f) return res.status(404).json({ error: '未找到治具：' + code });
    var u = await currentUser(req);
    var actions = await H.allowedActions(u.role, f.status, f, u.id, u.dept);
    var hasDrawing = false;
    if (f.status === 'ACCEPTED') {
      var cnt = await D.countFilesByCategory(f.id, 'design_drawing');
      hasDrawing = cnt && cnt.cnt > 0;
    }
    res.json({ fixture: f, allowedActions: actions, hasDesignDrawing: hasDrawing });
  });

  // 清单
  app.get('/api/fixtures', requireAuth, async function(req, res) {
    var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search, overdue = _a.overdue, dormant = _a.dormant, model = _a.model,
        sort = _a.sort, dir = _a.dir, limit = parseInt(_a.limit) || 20, offset = parseInt(_a.offset) || 0;
    var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, dormant: dormant, model: model, sort: sort, dir: dir, limit: limit, offset: offset });
    var total = await D.countAllFixtures({ status: status, dept: dept, search: search, overdue: overdue, dormant: dormant, model: model });
    var ids = fixtures.map(function(f) { return f.id; });
    if (ids.length) {
      var rows = await D.getFixturePhotoCounts(ids);
      var map = {}; rows.forEach(function(r) { map[r.fixture_id] = r.cnt; });
      fixtures.forEach(function(f) { f.photo_count = map[f.id] || 0; });
      var photoMap = await D.getFirstPhotoMap(ids);
      fixtures.forEach(function(f) { f.first_photo = photoMap[f.id] || null; });
    }
    res.json({ fixtures: fixtures, total: total, limit: limit, offset: offset });
  });

  // 导出清单 CSV（复用列表筛选/排序参数，忽略分页取全量；AGENTS.md §21 列表导出标准）
  var FIXTURE_STATUS_CN = {
    REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待验证',
    VERIFY_RD_OK: 'RD验证通过', VERIFY_ORG_OK: '申请单位验证',
    TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
    REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成',
    RETIRED: '已废弃'
  };
  var FIXTURE_SOON_DAYS = 7;

  // 到期状态中文（与前端 fixture-inspect.js 判定一致）：statusField 限制状态（归还仅 IN_USE）
  function fixtureDueCn(statusField, dateField, overdueLabel) {
    return function (v, row) {
      if (row == null || !row[dateField]) return '—';
      if (statusField && row.status !== statusField) return '—';
      var t = new Date(row[dateField]).getTime();
      if (t < Date.now()) return overdueLabel + Math.ceil((Date.now() - t) / 86400000) + '天';
      if (t <= Date.now() + FIXTURE_SOON_DAYS * 86400000) return '近7天到期';
      return '正常';
    };
  }

  // 时间列格式化：兼容 mysql2 返回的 Date 对象与字符串，输出 YYYY-MM-DD HH:mm（与列表展示一致）
  function fmtDT(v) {
    if (v == null || v === '') return '';
    var d = (v instanceof Date) ? v : new Date(v);
    if (isNaN(d.getTime())) return '';
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  app.get('/api/fixtures/export', requireAuth, async function (req, res) {
    var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search,
        overdue = _a.overdue, dormant = _a.dormant, model = _a.model, sort = _a.sort, dir = _a.dir;
    var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, dormant: dormant, model: model, sort: sort, dir: dir });
    var cols = [
      { key: 'fixture_no', label: '编号' },
      { key: 'name', label: '名称' },
      { key: 'spec', label: '规格' },
      { key: 'requested_dept', label: '部门' },
      { key: 'storage_location', label: '储位' },
      { key: 'status', label: '状态', fmt: function (v) { return FIXTURE_STATUS_CN[v] || v; } },
      { key: 'expected_return_at', label: '归还状态', fmt: fixtureDueCn('IN_USE', 'expected_return_at', '超期') },
      { key: 'next_maintenance_at', label: '保养状态', fmt: fixtureDueCn(null, 'next_maintenance_at', '逾期') },
      { key: 'updated_at', label: '更新时间', fmt: fmtDT }
    ];
    var stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    sendCsv(res, 'fixtures-' + stamp + '.csv', toCsv(fixtures, cols));
  });

  // 新建申请
  app.post('/api/fixtures', requireAuth, async function(req, res) {
    try {
      var u = await currentUser(req);
      var _b = req.body || {}, name = _b.name, spec = _b.spec, model = _b.model, station = _b.station,
          category = _b.category, request_note = _b.request_note, notes = _b.notes, maintenance_cycle_days = _b.maintenance_cycle_days;
      if (!name || !name.trim()) return res.status(400).json({ error: '治具名称必填' });
      var f = await D.createFixture({
        name: name.trim(), spec: spec, model: model, station: station,
        category: category, requested_by: u.id, requested_dept: u.dept,
        request_note: request_note, notes: notes, maintenance_cycle_days: maintenance_cycle_days
      });
      await D.addFixtureLog({ fixture_id: f.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '新建申请' });
      res.json(f);
    } catch (err) {
      res.status(500).json({ error: '新建治具失败：' + (err.message || '服务器内部错误') });
    }
  });

  // 看板
  app.get('/api/fixtures/dashboard', requireAuth, async function(req, res) {
    var u = await currentUser(req);
    var dormantDays = Number(await D.getFixtureSetting('dormant_days', 60)) || 60;
    var [rows, overdue, myPending, overdueM, upcomingM, dormant] = await Promise.all([
      D.countFixturesByStatus(),
      D.listOverdueFixtures(),
      D.listMyPendingFixtures(u.role, u.id),
      D.listOverdueMaintenanceFixtures(),
      D.listUpcomingMaintenanceFixtures(),
      D.listDormantFixtures(dormantDays)
    ]);
    var byStatus = {}, i, r, total = 0;
    for (i = 0; i < rows.length; i++) { r = rows[i]; byStatus[r.status] = Number(r.cnt); total += Number(r.cnt); }
    res.json({ byStatus: byStatus, total: total, overdue: overdue, myPending: myPending, maintenanceOverdue: overdueM, maintenanceUpcoming: upcomingM, maintenanceOverdueCount: overdueM.length, maintenanceUpcomingCount: upcomingM.length, dormantDays: dormantDays, dormantCount: dormant.length, dormant: dormant, role: u.role, dept: u.dept });
  });

  // 治具配置：读取（登录即可）；settings 为固定路径，必须放在 :id 之前
  app.get('/api/fixtures/settings', requireAuth, async function(req, res) {
    // 字典缓存：阈值配置低变，TTL 60s（见 AGENTS.md 性能优化）
    var cached = cache.get('sl_fixture_settings');
    if (cached === undefined) {
      var dormantDays = Number(await D.getFixtureSetting('dormant_days', 60)) || 60;
      cached = { dormant_days: dormantDays };
      cache.set('sl_fixture_settings', cached);
    }
    res.json(cached);
  });

  // 治具配置：更新（仅 ADMIN，dormant_days 范围 1~365）
  app.put('/api/fixtures/settings', requireAuth, async function(req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可修改配置' });
    var days = Number(req.body && req.body.dormant_days);
    if (!days || days < 1 || days > 365) return res.status(400).json({ error: '呆滞阈值须为 1~365 天' });
    await D.setFixtureSetting('dormant_days', String(days));
    cache.del('sl_fixture_settings');
    res.json({ dormant_days: days });
  });

  // 批量新建治具：清单列表式（同一机型批量创建，事务保证全成或全回滚；settings 为固定路径，必须放在 :id 之前）
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

  // 机型列表（含治具计数）：登录可读
  app.get('/api/fixtures/models', requireAuth, async function(req, res) {
    res.json(await MD.listModelsWithCount());
  });

  // 新建机型：仅 RD/ADMIN；code 6~20 位字母数字，唯一冲突 409
  app.post('/api/fixtures/models', requireAuth, async function(req, res) {
    try {
      var u = await currentUser(req);
      if (['RD', 'ADMIN'].indexOf(u.role) === -1) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
      var code = ((req.body || {}).code || '').trim().toUpperCase();
      var full_name = ((req.body || {}).full_name || '').trim();
      if (!code) return res.status(400).json({ error: '请填写机型短码' });
      if (code.length < 6 || code.length > 20) return res.status(400).json({ error: '机型短码须为 6~20 位' });
      if (!/^[A-Za-z0-9]+$/.test(code)) return res.status(400).json({ error: '机型短码仅允许字母和数字' });
      if (!full_name) return res.status(400).json({ error: '请填写机型全称' });
      var m = await MD.createModel({ code: code, full_name: full_name, created_by: u.id });
      invalidateSharedModelCaches();
      res.json(m);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(409).json({ error: '机型短码或全称已存在' });
      res.status(500).json({ error: '新增机型失败：' + (err.message || '服务器内部错误') });
    }
  });

  // 编辑机型：仅 RD/ADMIN；仅允许改 full_name（code 只读防破坏已引用治具）
  app.put('/api/fixtures/models/:id', requireAuth, async function(req, res) {
    try {
      var u = await currentUser(req);
      if (['RD', 'ADMIN'].indexOf(u.role) === -1) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
      var m = await MD.getModelById(Number(req.params.id));
      if (!m) return res.status(404).json({ error: '机型不存在' });
      var full_name = ((req.body || {}).full_name || '').trim();
      if (!full_name) return res.status(400).json({ error: '请填写机型全称' });
      var updated = await MD.updateModelName(m.id, full_name);
      invalidateSharedModelCaches();
      res.json(updated);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(409).json({ error: '机型全称已存在' });
      res.status(500).json({ error: '编辑机型失败：' + (err.message || '服务器内部错误') });
    }
  });

  // 操作日志
  app.get('/api/fixtures/logs', requireAuth, async function(req, res) {
    res.json(await D.listFixtureLogs());
  });

  // 指定治具的操作日志（:id/logs 必须放在 :id 之前）
  app.get('/api/fixtures/:id/logs', requireAuth, async function(req, res) {
    var logs = await D.getFixtureLogsByFixtureId(Number(req.params.id));
    res.json(logs || []);
  });

  // 详情（:id 路由必须放在 logs/dashboard 等固定路径之后，避免被 :id 拦截）
  app.get('/api/fixtures/:id', requireAuth, async function(req, res) {
    var f = await D.getFixtureDetailById(Number(req.params.id));
    if (!f) return res.status(404).json({ error: '治具不存在' });
    res.json(f);
  });

  // 扫码状态机（统一入口）
  app.post('/api/fixtures/scan', requireAuth, async function(req, res) {
    try {
    var u = await currentUser(req);
    var _c = req.body || {}, code = _c.code, note = _c.note, location = _c.location, days = _c.days, expectedDays = _c.expectedDays;
    var fixtureNo = (code || '').trim();
    if (!fixtureNo) return res.status(400).json({ error: '未提供治具编号' });

    var f = await D.getFixtureByNo(fixtureNo);
    if (!f) return res.status(404).json({ error: '未找到治具：' + fixtureNo });

    var actions = await H.allowedActions(u.role, f.status, f, u.id, u.dept);
    var chosenAction = (req.body.action || '').trim() || actions[0];
    if (!chosenAction || actions.indexOf(chosenAction) === -1)
      return res.status(409).json({
        error: '当前角色(' + u.role + ')无法对状态「' + (H.STATUS_LABEL[f.status]||f.status) + '」执行「' + chosenAction + '」操作',
        fixture: f
      });

    var ts = D.nowISO();
    var updated = Object.assign({}, f);

    // 参数校验
    if (chosenAction === 'USE') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写使用位置' });
      var d = Number(days); if (!d || d <= 0) return res.status(400).json({ error: '请填写预计使用天数' });
    }
    if (['REPAIR_ME', 'REPAIR_RD_REQ', 'REPAIR_CONFIRM', 'RETIRE'].indexOf(chosenAction) !== -1) {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写说明' + (chosenAction === 'REPAIR_ME' ? '（维修说明）' : chosenAction === 'REPAIR_RD_REQ' ? '（故障说明）' : chosenAction === 'REPAIR_CONFIRM' ? '（确认说明）' : '（作废原因）') });
    }

    // Action 分发
    try {
      if (chosenAction === 'MAKE') {
        var cnt = await D.countFilesByCategory(f.id, 'design_drawing');
        if (!cnt || cnt.cnt === 0) return res.status(400).json({ error: '请先上传设计图纸后再制作' });
        // 事务：doMake(2 addFixtureLog) + updateFixture，保证制作日志与状态变更原子性
        var makeResult = await D.withTransaction(async conn => {
          var u1 = await AM.doMake(updated, u, ts, f, note, req, conn);
          return await D.updateFixture(u1, f, conn, f.version);
        });
        return res.json({ fixture: makeResult, action: chosenAction, message: '操作成功：' + chosenAction });
      }
      else if (chosenAction === 'VERIFY')  {
        if (!location || !location.trim()) return res.status(400).json({ error: '请填写存放位置' });
        if (location && location.trim()) updated.storage_location = location.trim();
        updated = await AM.doVerify(updated, u, ts, f, note);
      }
      else if (chosenAction === 'ACCEPT')       updated = await doAccept(updated, u, ts, f, note, Number(expectedDays || 0));
      else if (chosenAction === 'CANCEL')       updated = await doCancel(updated, u, ts, f, note);
      else if (chosenAction === 'RETURN')       updated = await doReturn(updated, u, ts, f, note);
      else if (chosenAction === 'USE')          updated = await doUse(updated, u, ts, f, location, days, note);
      else if (chosenAction === 'MAINTENANCE') {
        if (u.role !== 'ME') return res.status(403).json({ error: '仅限生技部(ME)操作' });
        if (!['TRANSFERRED', 'IN_USE'].includes(f.status)) return res.status(400).json({ error: '当前状态不允许保养操作' });
        var maintResult = await doMaintenance(updated, req.body, u);
        return res.json({ fixture: maintResult, action: chosenAction, message: '操作成功：' + chosenAction });
      }
      else if (chosenAction === 'REPAIR_ME')    updated = await AR.doRepairME(updated, u, ts, f, note);
      else if (chosenAction === 'REPAIR_RD_REQ') updated = await AR.doRepairRDReq(updated, u, ts, f, note);
      else if (chosenAction === 'REPAIR_DONE')   updated = await AR.doRepairDone(updated, u, ts, f, note);
      else if (chosenAction === 'REPAIR_RD_DONE') updated = await AR.doRepairRDDone(updated, u, ts, f, note, req);
      else if (chosenAction === 'REPAIR_CONFIRM') {
        // 事务：doRepairConfirm(addFixtureLog) + updateFixture，保证维修确认日志与状态变更原子性
        var confirmResult = await D.withTransaction(async conn => {
          var u2 = await AR.doRepairConfirm(updated, u, ts, f, note, conn);
          return await D.updateFixture(u2, f, conn, f.version);
        });
        return res.json({ fixture: confirmResult, action: chosenAction, message: '操作成功：' + chosenAction });
      }
      else if (chosenAction === 'FORCE_TRANSFER') {
        // 旧双人验证状态兜底（F5）：ADMIN 强制移交
        updated.status = 'TRANSFERRED'; updated.transferred_at = ts;
        await D.addFixtureLog({ fixture_id: f.id, action: 'FORCE_TRANSFER', role: u.role, user_id: u.id, dept: u.dept, note: note || '管理员强制移交（旧双人验证状态兜底）' });
      }
      else if (chosenAction === 'IMPROVE')      updated = await AS.doImprove(updated, u, ts, f, note);
      else if (chosenAction === 'IMPROVE_DONE') updated = await AS.doImproveDone(updated, u, ts, f, note);
      else if (chosenAction === 'RETIRE')       updated = await AS.doRetire(updated, u, ts, f, note);
    } catch (err) {
      if (err && err.code === 'CONFLICT')
        return res.status(409).json({ error: '该治具刚被他人操作，请刷新后重试' });
      var code = err.status || 500;
      var msg = err.message || String(err);
      return res.status(code).json({ error: msg });
    }

    var result = await D.updateFixture(updated, f, null, f.version);
    res.json({ fixture: result, action: chosenAction, message: '操作成功：' + chosenAction });
    } catch (err) {
      res.status(500).json({ error: '治具扫码操作失败：' + (err.message || '服务器内部错误') });
    }
  });
}

module.exports = { register: register };
