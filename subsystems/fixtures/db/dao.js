// subsystems/fixtures/db/dao.js — 治具数据访问层（工厂模式）
module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  function toDT(v) {
    if (v == null) return null;
    if (typeof v === 'string' && v.indexOf('T') !== -1) return v.slice(0, 19).replace('T', ' ');
    return v;
  }

  async function fetchOne(conn, sql, params) {
    if (conn) { var rows = await conn.execute(sql, params || []); return rows[0].length ? Object.assign({}, rows[0][0]) : undefined; }
    return one(sql, params);
  }

  async function nextFixtureNo() {
    var row = await one('SELECT COALESCE(MAX(id), 0) AS m FROM fixtures');
    return 'FJ-' + String(row.m + 1).padStart(6, '0');
  }

  async function createFixture(data) {
    var { name, spec, model, station, category, requested_by, requested_dept, request_note, request_image, notes } = data;
    var sql = 'INSERT INTO fixtures (fixture_no,name,spec,model,station,category,status,requested_by,requested_dept,request_note,request_image,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
    var lastErr;
    for (var i = 0; i < 3; i++) {
      var ns = await nextFixtureNo();
      var params = [ns, name||null, spec||null, model||null, station||null, category||null, 'REQUESTED', requested_by||null, requested_dept||null, request_note||null, request_image||null, notes||null];
      try {
        await run(sql, params);
        return await getFixtureByNo(ns);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || new Error('createFixture 重试 3 次仍失败');
  }

  function getFixtureById(id) { return one('SELECT * FROM fixtures WHERE id = ?', [id]); }
  function getFixtureByNo(fixture_no) { return one('SELECT * FROM fixtures WHERE fixture_no = ?', [fixture_no]); }

  function listFixtures(opts) {
    opts = opts || {};
    var where = [], params = [];
    if (opts.status) { var statuses = opts.status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (opts.dept) { where.push('requested_dept = ?'); params.push(opts.dept); }
    if (opts.search) { where.push('(fixture_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + opts.search + '%', '%' + opts.search + '%', '%' + opts.search + '%'); }
    if (opts.overdue === '1') { where.push("status='IN_USE' AND expected_return_at IS NOT NULL AND expected_return_at < NOW()"); }
    var sql = 'SELECT * FROM fixtures' + (where.length ? ' WHERE ' + where.join(' AND ') : '');
    var ALLOWED_SORT = { fixture_no: 'fixture_no', name: 'name', updated_at: 'updated_at' };
    var sortCol = ALLOWED_SORT[opts.sort] || 'id';
    var sortDir = (opts.dir === 'asc' || opts.dir === 'ASC') ? 'ASC' : 'DESC';
    sql += ' ORDER BY ' + sortCol + ' ' + sortDir;
    if (opts.limit != null) { sql += ' LIMIT ' + parseInt(opts.limit, 10); }
    if (opts.offset != null) { sql += ' OFFSET ' + parseInt(opts.offset, 10); }
    return q(sql, params);
  }

  function countAllFixtures(opts) {
    opts = opts || {};
    var where = [], params = [];
    if (opts.status) { where.push('status = ?'); params.push(opts.status); }
    if (opts.dept) { where.push('requested_dept LIKE ?'); params.push('%' + opts.dept + '%'); }
    if (opts.search) { where.push('(fixture_no LIKE ? OR name LIKE ? OR spec LIKE ? OR model LIKE ?)'); var kw = '%' + opts.search + '%'; params.push(kw, kw, kw, kw); }
    if (opts.overdue === '1') { where.push('expected_return_at < NOW() AND status = ?'); params.push('IN_USE'); }
    var sql = 'SELECT COUNT(*) as total FROM fixtures';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    return q(sql, params).then(function(rows) { return rows[0].total; });
  }

  async function updateFixture(updated, original, conn) {
    var cols = [], vals = [];
    var fields = ['name','spec','model','station','category','status','requested_by','requested_dept',
      'request_note','request_image','made_by','made_at','made_note','made_image',
      'verified_rd','verified_rd_at','verified_me','verified_me_at','transferred_at','verify_note',
      'used_by','used_at','use_location','expected_return_days','expected_return_at','use_note',
      'repair_type','repair_requested_by','repair_requested_at','repair_note','repaired_by','repaired_at',
      'repair_done_image','repair_confirmed_by','repair_confirmed_at','retired_by','retired_at','retired_reason',
      'expected_finish_at','improve_note','improvement_count','improved_by','improved_at',
      'storage_location','maintenance_cycle_days','last_maintenance_at','next_maintenance_at','notes'];
    var dateFields = ['made_at','verified_rd_at','verified_me_at','transferred_at','used_at','expected_return_at',
      'repair_requested_at','repaired_at','repair_confirmed_at','retired_at','expected_finish_at','improved_at',
      'last_maintenance_at','next_maintenance_at'];
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i];
      if (updated[k] !== original[k]) {
        cols.push(k + '=?');
        vals.push(dateFields.includes(k) ? toDT(updated[k]) : (updated[k] != null ? updated[k] : null));
      }
    }
    if (updated._recalc_maintenance && updated.maintenance_cycle_days > 0) {
      cols.push('next_maintenance_at = DATE_ADD(IFNULL(last_maintenance_at, NOW()), INTERVAL ? DAY)');
      vals.push(updated.maintenance_cycle_days);
    }
    cols.push('updated_at=NOW()');
    vals.push(updated.id);
    if (cols.length > 1) {
      var sql = 'UPDATE fixtures SET ' + cols.join(',') + ' WHERE id=?';
      if (conn) await conn.execute(sql, vals);
      else await run(sql, vals);
    }
    return await fetchOne(conn, 'SELECT * FROM fixtures WHERE id = ?', [updated.id]);
  }

  async function addFixtureLog(log, conn) {
    var { fixture_id, action, role, user_id, dept, note } = log;
    var sql = 'INSERT INTO fixture_logs (fixture_id,action,role,user_id,dept,note) VALUES (?,?,?,?,?,?)';
    var params = [fixture_id, action, role||null, user_id||null, dept||null, note||null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function countFixturesByStatus() { return q('SELECT status, COUNT(*) AS cnt FROM fixtures GROUP BY status'); }
  function listOverdueFixtures() { return q("SELECT * FROM fixtures WHERE status='IN_USE' AND expected_return_at IS NOT NULL AND expected_return_at < NOW()"); }

  function listMyPendingFixtures(role, userId) {
    if (role === 'RD') return q("SELECT * FROM fixtures WHERE status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_ORG_OK','REPAIRING_RD','IMPROVING') ORDER BY id DESC LIMIT 50");
    if (role === 'ADMIN') return q("SELECT * FROM fixtures WHERE status != 'RETIRED' ORDER BY id DESC LIMIT 50");
    if (['ME','QA','CUSTODY'].includes(role)) return q("SELECT * FROM fixtures WHERE status IN ('VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','TRANSFERRED','REPAIRING_ME','REPAIR_DONE','IN_USE') ORDER BY id DESC LIMIT 50");
    return q('SELECT * FROM fixtures WHERE requested_by=? ORDER BY id DESC LIMIT 50', [userId]);
  }

  function getFixtureDetailById(id) {
    return one('SELECT f.*, rd.display_name AS verified_rd_name, me.display_name AS verified_me_name, md.display_name AS made_by_name, ub.display_name AS used_by_name, rb.display_name AS repaired_by_name, rc.display_name AS repair_confirmed_by_name, ret.display_name AS retired_by_name, imp.display_name AS improved_by_name FROM fixtures f LEFT JOIN users rd ON rd.id = f.verified_rd LEFT JOIN users me ON me.id = f.verified_me LEFT JOIN users md ON md.id = f.made_by LEFT JOIN users ub ON ub.id = f.used_by LEFT JOIN users rb ON rb.id = f.repaired_by LEFT JOIN users rc ON rc.id = f.repair_confirmed_by LEFT JOIN users ret ON ret.id = f.retired_by LEFT JOIN users imp ON imp.id = f.improved_by WHERE f.id=?', [id]);
  }

  function listFixtureLogs() { return q('SELECT fl.*,u.username,u.display_name FROM fixture_logs fl LEFT JOIN users u ON u.id=fl.user_id ORDER BY fl.id DESC'); }
  function getFixtureLogsByFixtureId(fixtureId) { return q('SELECT fl.*,u.username,u.display_name FROM fixture_logs fl LEFT JOIN users u ON u.id=fl.user_id WHERE fl.fixture_id=? ORDER BY fl.id DESC', [fixtureId]); }
  function listOverdueMaintenanceFixtures() { return q('SELECT * FROM fixtures WHERE retired_at IS NULL AND next_maintenance_at IS NOT NULL AND next_maintenance_at <= NOW() ORDER BY next_maintenance_at ASC'); }
  function listUpcomingMaintenanceFixtures() { return q('SELECT * FROM fixtures WHERE retired_at IS NULL AND next_maintenance_at IS NOT NULL AND next_maintenance_at > NOW() AND next_maintenance_at <= DATE_ADD(NOW(), INTERVAL 7 DAY) ORDER BY next_maintenance_at ASC'); }

  function getFixturePhotoCounts(ids) {
    if (!ids || !ids.length) return [];
    var placeholders = ids.map(function(){ return '?'; }).join(',');
    var params = ids.concat(['fixture_photo', 'maintenance_photo', 'site_photo']);
    return q('SELECT fixture_id, COUNT(*) as cnt FROM fixture_files WHERE fixture_id IN (' + placeholders + ') AND category IN (?,?,?) GROUP BY fixture_id', params);
  }

  async function getFirstPhotoMap(ids) {
    if (!ids || !ids.length) return {};
    var placeholders = ids.map(function(){ return '?'; }).join(',');
    var params = ids.concat(['fixture_photo', 'maintenance_photo', 'site_photo']);
    var sql = 'SELECT ff.fixture_id, ff.filename FROM fixture_files ff INNER JOIN (SELECT fixture_id, MIN(id) as min_id FROM fixture_files WHERE fixture_id IN (' + placeholders + ') AND category IN (?,?,?) GROUP BY fixture_id) sub ON ff.id = sub.min_id';
    var rows = await q(sql, params);
    var map = {};
    rows.forEach(function(r) { map[r.fixture_id] = r.filename; });
    return map;
  }

  return { nextFixtureNo, createFixture, getFixtureById, getFixtureByNo, listFixtures, countAllFixtures, updateFixture, addFixtureLog, countFixturesByStatus, listOverdueFixtures, listMyPendingFixtures, getFixtureDetailById, listFixtureLogs, getFixtureLogsByFixtureId, listOverdueMaintenanceFixtures, listUpcomingMaintenanceFixtures, getFixturePhotoCounts, getFirstPhotoMap };
};
