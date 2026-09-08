// subsystems/samples/db/dao-list.js — 样品查询域 DAO（2026-09-07 自 dao.js 按域拆分；2026-09-05 首次拆分实现经 revert 后复用）
// 覆盖：列表筛选/计数/看板预警清单/我的待办/机型墙聚合；写入域（建样/状态机/日志/机型主数据写）仍在 dao.js
const { generateSampleCode } = require('./sample-code');

module.exports = function createDaoList(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  // 时区统一：ISO UTC 字符串列（next_inspect_at/expected_return_at）与 UTC_TIMESTAMP() 规范化比较
  var ISO_UTC = "LEFT(REPLACE(REPLACE(next_inspect_at,'T',' '),'Z',''),19)";
  var ISO_RET = "LEFT(REPLACE(REPLACE(expected_return_at,'T',' '),'Z',''),19)";
  var NOW_UTC = "LEFT(UTC_TIMESTAMP(),19)";
  var NOW_UTC_7D = "LEFT(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 7 DAY),19)";

  // 列表筛选 WHERE 构造（listSamples 与 countAllSamples 共用，保持两函数口径严格一致）
  function _listWhere(opts) {
    var where = ['deleted_at IS NULL'], params = [];
    if (opts.status) { var statuses = opts.status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (opts.dept) { where.push('custody_dept = ?'); params.push(opts.dept); }
    if (opts.search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + opts.search + '%', '%' + opts.search + '%', '%' + opts.search + '%'); }
    if (opts.overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND " + ISO_UTC + " < " + NOW_UTC); }
    else if (opts.overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND " + ISO_UTC + " >= " + NOW_UTC + " AND " + ISO_UTC + " < " + NOW_UTC_7D); }
    if (opts.sample_type) { where.push('sample_type = ?'); params.push(opts.sample_type); }
    if (opts.limit_item) { where.push('limit_item = ?'); params.push(opts.limit_item); }
    if (opts.source_type) { where.push('source_type = ?'); params.push(opts.source_type); }
    if (opts.model) { where.push('model = ?'); params.push(opts.model); }
    // mine_uid=当前用户 id → 只看「我创建的」（服务端派生，路由层注入，客户端不可伪造他人 uid）
    if (opts.mine_uid) { where.push('created_by = ?'); params.push(opts.mine_uid); }
    // 领出超时未归还（口径与 listCheckoutOverdue 一致）
    if (opts.checkout_overdue === '1') { where.push("status='CHECKED_OUT' AND expected_return_at IS NOT NULL AND " + ISO_RET + " < " + NOW_UTC); }
    // 角色待办（2026-09-08）：pending=role 由路由层注入，与看板「我的待办」同一 _roleTodoWhere 片段（uid 取会话不可伪造）
    if (opts.pending_role) { var todo = _roleTodoWhere(opts.pending_role, opts.pending_uid); if (todo) { where.push(todo.sql); params.push.apply(params, todo.params); } }
    return { where: where, params: params };
  }

  // 列表 ORDER BY（sort 白名单：默认最新/created_at/sample_no 为旧值；mine/inspect/status 为角色档新增）
  function _listOrderBy(opts) {
    if (opts.sort === 'created_at') return 'ORDER BY created_at ASC';
    if (opts.sort === '-created_at') return 'ORDER BY created_at DESC';
    if (opts.sort === 'sample_no') return 'ORDER BY sample_no ASC';
    if (opts.sort === '-sample_no') return 'ORDER BY sample_no DESC';
    // 我建的优先（无 uid 时降级为最新优先，保持无参调用方行为不变）
    if (opts.sort === 'mine') return opts.mine_uid ? 'ORDER BY (created_by = ' + parseInt(opts.mine_uid, 10) + ') DESC, id DESC' : 'ORDER BY id DESC';
    // 复检到期升序（无复检计划的行沉底，避免空值霸占前排）
    if (opts.sort === 'inspect') return 'ORDER BY (next_inspect_at IS NULL) ASC, next_inspect_at ASC, id DESC';
    // 状态优先（生命周期序：待制作→制作完成→已发行→保管中→领用中→退回审核→已作废）
    if (opts.sort === 'status') return "ORDER BY FIELD(status,'NEW','PRODUCED','RELEASED','IN_CUSTODY','CHECKED_OUT','RETURNING','RETIRED'), id DESC";
    // 角色相关置顶（2026-09-07 排序版，scope=role）：相关样品排前、其余按最新跟后，数据不隐藏无空态
    // 口径：RD→我建的置顶；QA→待发行/退回审核 或 在库复检7天内临期置顶；CUSTODY/ME→在库/借出/归还中置顶；ADMIN→不加
    if (opts.role_scope_role) {
      if (opts.role_scope_role === 'RD' && opts.role_scope_uid) return 'ORDER BY (created_by = ' + parseInt(opts.role_scope_uid, 10) + ') DESC, id DESC';
      if (opts.role_scope_role === 'QA') return "ORDER BY (status IN ('PRODUCED','RETURNING') OR (status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND " + ISO_UTC + " < " + NOW_UTC_7D + ")) DESC, id DESC";
      if (opts.role_scope_role === 'CUSTODY' || opts.role_scope_role === 'ME') return "ORDER BY (status IN ('IN_CUSTODY','CHECKED_OUT','RETURNING')) DESC, id DESC";
    }
    return 'ORDER BY id DESC';
  }

  function listSamples(opts) {
    opts = opts || {};
    var w = _listWhere(opts);
    var sql = 'SELECT * FROM samples' + (w.where.length ? ' WHERE ' + w.where.join(' AND ') : '') + ' ' + _listOrderBy(opts);
    if (opts.limit != null) { sql += ' LIMIT ' + parseInt(opts.limit, 10); }
    if (opts.offset != null) { sql += ' OFFSET ' + parseInt(opts.offset, 10); }
    return q(sql, w.params);
  }

  function countAllSamples(opts) {
    opts = opts || {};
    var w = _listWhere(opts);
    var sql = 'SELECT COUNT(*) as total FROM samples' + (w.where.length ? ' WHERE ' + w.where.join(' AND ') : '');
    return q(sql, w.params).then(function(rows) { return rows[0].total; });
  }

  function countSamplesByStatus() { return q('SELECT status, COUNT(*) AS cnt FROM samples WHERE deleted_at IS NULL GROUP BY status'); }
  function listOverdueSamples() { return q("SELECT * FROM samples WHERE deleted_at IS NULL AND status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND " + ISO_UTC + " < " + NOW_UTC); }
  function listDueSoonSamples() { return q("SELECT * FROM samples WHERE deleted_at IS NULL AND status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND " + ISO_UTC + " >= " + NOW_UTC + " AND " + ISO_UTC + " < " + NOW_UTC_7D); }
  // T12.4: RETURNING 停留超时（默认 72 小时）待办查询——供 QA/ADMIN 看板/工作台挂载兜底提醒
  // 口径：status=RETURNING 且 updated_at 早于 N 小时前（RETURNING 期间无其他写操作，updated_at 近似进入退回审核的时刻）
  function listReturningOverdue(hours) {
    var h = Math.floor(Number(hours));
    if (!h || h <= 0) h = 72;
    return q("SELECT * FROM samples WHERE deleted_at IS NULL AND status='RETURNING' AND updated_at < UTC_TIMESTAMP() - INTERVAL " + h + " HOUR ORDER BY updated_at ASC LIMIT 50");
  }

  // 领用/归还（2026-09-05）：领出超时未归还清单——纯查询计算，无定时任务
  // 口径：status=CHECKED_OUT 且 expected_return_at（ISO UTC 字符串，与复检字段同 ISO 规范化）早于当前 UTC 时间
  function listCheckoutOverdue() {
    return q("SELECT * FROM samples WHERE deleted_at IS NULL AND status='CHECKED_OUT' AND expected_return_at IS NOT NULL AND " + ISO_RET + " < " + NOW_UTC + " ORDER BY expected_return_at ASC LIMIT 50");
  }

  // 角色待办 WHERE 片段（2026-09-08 抽取共用）：看板「我的待办」(listMyPendingSamples) 与列表「待处理」快捷筛选
  // (pending=role，经 routes-samples.js 注入，uid 取会话不可伪造) 同一事实来源，消除两端口径漂移（历史缺陷：RD 列表待处理漏「指派给我的退回重做」）
  // 返回 {sql:'', params:[]}；ADMIN/未知角色返回 null（无角色待办语义，调用方自行决定降级行为）
  function _roleTodoWhere(role, userId) {
    if (role === 'RD') return { sql: "(status='NEW' OR (status='RETURNING' AND retire_assigned_rd=?))", params: [userId] };
    if (role === 'QA') return { sql: "status IN ('PRODUCED','RETURNING')", params: [] };
    if (role === 'CUSTODY' || role === 'ME') return { sql: "status='RELEASED'", params: [] };
    return null;
  }

  function listMyPendingSamples(role, userId) {
    // 2026-09-04：上限 50→200（评审问题2：NEW 积压 57 条被静默截断 7 条；workbench 我的待办与样品看板共用本 DAO）
    // 2026-09-08：WHERE 抽取为 _roleTodoWhere 共用片段（列表待处理快捷筛选同口径）；ADMIN 原语义保留（全部样品前 200，前端已改提示文案）
    var todo = _roleTodoWhere(role, userId);
    if (!todo) return q('SELECT * FROM samples WHERE deleted_at IS NULL ORDER BY id DESC LIMIT 200');
    return q('SELECT * FROM samples WHERE deleted_at IS NULL AND ' + todo.sql + ' ORDER BY id DESC LIMIT 200', todo.params);
  }

  // 机型视图聚合（2026-09-05 二期，只读）：每机型样品总数/复检逾期/领用超时/状态分布/封面图
  // 逾期口径与 listOverdueSamples / listCheckoutOverdue 一致：ISO UTC 字符串规范化后与当前 UTC 比较
  // 封面图取该机型最早样品的制作图（produced_image 优先，退 image——与前端列表缩略图取值口径相同），存完整 URL 路径可直接作 img src
  function aggregateModelsWall() {
    var ISO = function (col) { return "LEFT(REPLACE(REPLACE(" + col + ",'T',' '),'Z',''),19)"; };
    var NOW = "LEFT(UTC_TIMESTAMP(),19)";
    return Promise.all([
      q("SELECT model AS code, COUNT(*) AS sample_count, " +
        "SUM(CASE WHEN status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND " + ISO('next_inspect_at') + " < " + NOW + " THEN 1 ELSE 0 END) AS overdue_count, " +
        "SUM(CASE WHEN status='CHECKED_OUT' AND expected_return_at IS NOT NULL AND " + ISO('expected_return_at') + " < " + NOW + " THEN 1 ELSE 0 END) AS checkout_overdue_count, " +
        "MIN(CASE WHEN produced_image IS NOT NULL AND produced_image != '' THEN CONCAT(id,'|',produced_image) WHEN image IS NOT NULL AND image != '' THEN CONCAT(id,'|',image) END) AS cover_raw " +
        "FROM samples WHERE deleted_at IS NULL AND model IS NOT NULL AND model != '' GROUP BY model"),
      q("SELECT model AS code, status, COUNT(*) AS cnt FROM samples WHERE deleted_at IS NULL AND model IS NOT NULL AND model != '' GROUP BY model, status")
    ]).then(function (rs) {
      var byCode = {};
      (rs[0] || []).forEach(function (r) {
        var cover = null;
        if (r.cover_raw) { var p = String(r.cover_raw).split('|'); cover = { id: Number(p[0]) || 0, photo: p.slice(1).join('|') }; }
        byCode[r.code] = { sample_count: Number(r.sample_count) || 0, overdue_count: Number(r.overdue_count) || 0, checkout_overdue_count: Number(r.checkout_overdue_count) || 0, cover: cover };
      });
      var statusStats = {};
      (rs[1] || []).forEach(function (r) {
        if (!statusStats[r.code]) statusStats[r.code] = {};
        statusStats[r.code][r.status] = Number(r.cnt) || 0;
      });
      return Object.keys(byCode).map(function (code) {
        return Object.assign({ code: code, status_stats: statusStats[code] || {} }, byCode[code]);
      });
    });
  }

  return { listSamples, countAllSamples, countSamplesByStatus, listOverdueSamples, listDueSoonSamples, listReturningOverdue, listCheckoutOverdue, listMyPendingSamples, roleTodoWhere: _roleTodoWhere, aggregateModelsWall };
};
