// routes/fixtures.js — 治具路由：CRUD + 扫码状态机
var D = require('../db');
var H = require('./fixture-helpers');
var AM = require('./fixture-actions-make');
var { doAccept, doCancel, doReturn, doUse, doMaintenance } = require('./fixture-actions-cycle');
var AR = require('./fixture-actions-repair');
var AS = require('./fixture-actions-special');

function register(app) {
  var requireAuth = app.locals.requireAuth;
  var currentUser = app.locals.currentUser;

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
    var _a = req.query, status = _a.status, dept = _a.dept, search = _a.search, overdue = _a.overdue,
        sort = _a.sort, dir = _a.dir, limit = parseInt(_a.limit) || 20, offset = parseInt(_a.offset) || 0;
    var fixtures = await D.listFixtures({ status: status, dept: dept, search: search, overdue: overdue, sort: sort, dir: dir, limit: limit, offset: offset });
    var total = await D.countAllFixtures({ status: status, dept: dept, search: search, overdue: overdue });
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

  // 新建申请
  app.post('/api/fixtures', requireAuth, async function(req, res) {
    try {
      var u = await currentUser(req);
      var _b = req.body || {}, name = _b.name, spec = _b.spec, model = _b.model, station = _b.station,
          category = _b.category, request_note = _b.request_note, notes = _b.notes;
      if (!name || !name.trim()) return res.status(400).json({ error: '治具名称必填' });
      var f = await D.createFixture({
        name: name.trim(), spec: spec, model: model, station: station,
        category: category, requested_by: u.id, requested_dept: u.dept,
        request_note: request_note, notes: notes
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
    var [rows, overdue, myPending, overdueM, upcomingM] = await Promise.all([
      D.countFixturesByStatus(),
      D.listOverdueFixtures(),
      D.listMyPendingFixtures(u.role, u.id),
      D.listOverdueMaintenanceFixtures(),
      D.listUpcomingMaintenanceFixtures()
    ]);
    var byStatus = {}, i, r, total = 0;
    for (i = 0; i < rows.length; i++) { r = rows[i]; byStatus[r.status] = Number(r.cnt); total += Number(r.cnt); }
    res.json({ byStatus: byStatus, total: total, overdue: overdue, myPending: myPending, maintenanceOverdue: overdueM, maintenanceUpcoming: upcomingM, maintenanceOverdueCount: overdueM.length, maintenanceUpcomingCount: upcomingM.length, role: u.role, dept: u.dept });
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
          return await D.updateFixture(u1, f, conn);
        });
        return res.json({ fixture: makeResult, action: chosenAction, message: '操作成功：' + chosenAction });
      }
      else if (chosenAction === 'VERIFY_RD')  {
        var willTransfer = f.status === 'VERIFY_ORG_OK';
        if (willTransfer && (!location || !location.trim())) return res.status(400).json({ error: '请填写存放位置' });
        if (location && location.trim()) updated.storage_location = location.trim();
        updated = await AM.doVerifyRD(updated, u, ts, f, note);
      }
      else if (chosenAction === 'VERIFY_ORG')  {
        var willTransfer = f.status === 'VERIFY_RD_OK';
        if (willTransfer && (!location || !location.trim())) return res.status(400).json({ error: '请填写存放位置' });
        if (location && location.trim()) updated.storage_location = location.trim();
        updated = await AM.doVerifyOrg(updated, u, ts, f, note);
      }
      else if (chosenAction === 'ACCEPT')       updated = await doAccept(updated, u, ts, f, note, Number(expectedDays || 0));
      else if (chosenAction === 'CANCEL')       updated = await doCancel(updated, u, ts, f, note);
      else if (chosenAction === 'RETURN')       updated = await doReturn(updated, u, ts, f, note);
      else if (chosenAction === 'USE')          updated = await doUse(updated, u, ts, f, location, days, note);
      else if (chosenAction === 'MAINTENANCE') {
        if (u.role !== 'ME') return res.status(403).json({ error: '仅限生技部(ME)操作' });
        if (!['TRANSFERRED', 'IN_USE'].includes(f.status)) return res.status(400).json({ error: '当前状态不允许保养操作' });
        var maintResult = await doMaintenance(updated, req.body, u);
        return res.json({ success: true, result: maintResult });
      }
      else if (chosenAction === 'REPAIR_ME')    updated = await AR.doRepairME(updated, u, ts, f, note);
      else if (chosenAction === 'REPAIR_RD_REQ') updated = await AR.doRepairRDReq(updated, u, ts, f, note);
      else if (chosenAction === 'REPAIR_DONE')   updated = await AR.doRepairDone(updated, u, ts, f, note);
      else if (chosenAction === 'REPAIR_RD_DONE') updated = await AR.doRepairRDDone(updated, u, ts, f, note, req);
      else if (chosenAction === 'REPAIR_CONFIRM') {
        // 事务：doRepairConfirm(addFixtureLog) + updateFixture，保证维修确认日志与状态变更原子性
        var confirmResult = await D.withTransaction(async conn => {
          var u2 = await AR.doRepairConfirm(updated, u, ts, f, note, conn);
          return await D.updateFixture(u2, f, conn);
        });
        return res.json({ fixture: confirmResult, action: chosenAction, message: '操作成功：' + chosenAction });
      }
      else if (chosenAction === 'IMPROVE')      updated = await AS.doImprove(updated, u, ts, f, note);
      else if (chosenAction === 'IMPROVE_DONE') updated = await AS.doImproveDone(updated, u, ts, f, note);
      else if (chosenAction === 'RETIRE')       updated = await AS.doRetire(updated, u, ts, f, note);
    } catch (err) {
      var code = err.status || 500;
      var msg = err.message || String(err);
      return res.status(code).json({ error: msg });
    }

    var result = await D.updateFixture(updated, f);
    res.json({ fixture: result, action: chosenAction, message: '操作成功：' + chosenAction });
    } catch (err) {
      res.status(500).json({ error: '治具扫码操作失败：' + (err.message || '服务器内部错误') });
    }
  });
}

module.exports = { register: register };
