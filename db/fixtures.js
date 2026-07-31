// db/fixtures.js — 治具 CRUD（工厂模式：接收 { q, one, dbRef, nowISO }）
module.exports = function({ q, one, dbRef, nowISO }) {
  // ISO 8601 → MySQL DATETIME 格式转换（nowISO() 返回 ISO 格式，但 fixtures 表用 DATETIME 列）
  function toDT(v) {
    if (v == null) return null;
    if (typeof v === 'string' && v.indexOf('T') !== -1) return v.slice(0, 19).replace('T', ' ');
    return v;
  }
  // 事务内单行查询：传 conn 用当前连接（可读未提交数据），否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      const [rows] = await conn.execute(sql, params || []);
      return rows.length ? Object.assign({}, rows[0]) : undefined;
    }
    return one(sql, params);
  }
  async function nextFixtureNo() {
    const row = await one('SELECT COALESCE(MAX(id), 0) AS m FROM fixtures');
    return 'FJ-' + String(row.m + 1).padStart(6, '0');
  }
  // createFixture: 并发场景下 fixture_no UNIQUE 冲突时重试 3 次
  async function createFixture({ name, spec, model, station, category, requested_by, requested_dept, request_note, request_image, notes }) {
    const sql = `INSERT INTO fixtures (fixture_no,name,spec,model,station,category,status,requested_by,requested_dept,request_note,request_image,notes)
      VALUES (?,?,?,?,?,?,'REQUESTED',?,?,?,?,?)`;
    let lastErr;
    for (let i = 0; i < 3; i++) {
      const ns = await nextFixtureNo();
      const params = [ns, name||null, spec||null, model||null, station||null, category||null, requested_by||null, requested_dept||null, request_note||null, request_image||null, notes||null];
      try {
        await dbRef.run(sql, params);
        return await getFixtureByNo(ns);
      } catch (e) {
        // ER_DUP_ENTRY(1062): fixture_no UNIQUE 冲突，重试
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) { lastErr = e; continue; }
        throw e;
      }
    }
    throw lastErr || new Error('createFixture 重试 3 次仍失败');
  }
  function getFixtureById(id) { return one('SELECT * FROM fixtures WHERE id = ?', [id]); }
  function getFixtureByNo(fixture_no) { return one('SELECT * FROM fixtures WHERE fixture_no = ?', [fixture_no]); }
  function listFixtures({ status, dept, search, overdue, sort, dir, limit = 100, offset = 0 } = {}) {
    const where = []; const params = [];
    if (status) { var statuses = status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (dept) { where.push('requested_dept = ?'); params.push(dept); }
    if (search) { where.push('(fixture_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
    if (overdue === '1') { where.push("status='IN_USE' AND expected_return_at IS NOT NULL AND expected_return_at < NOW()"); }
    var sql = 'SELECT * FROM fixtures' + (where.length ? ' WHERE ' + where.join(' AND ') : '');
    // 排序（白名单防注入）
    var ALLOWED_SORT = { fixture_no: 'fixture_no', name: 'name', updated_at: 'updated_at' };
    var sortCol = ALLOWED_SORT[sort] || 'id';
    var sortDir = (dir === 'asc' || dir === 'ASC') ? 'ASC' : 'DESC';
    sql += ' ORDER BY ' + sortCol + ' ' + sortDir;

    if (limit != null) { sql += ' LIMIT ' + parseInt(limit, 10); }
  if (offset != null) { sql += ' OFFSET ' + parseInt(offset, 10); }
    return q(sql, params);
  }
  function countAllFixtures({ status, dept, search, overdue } = {}) {
    var where = [], params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (dept) { where.push('requested_dept LIKE ?'); params.push('%' + dept + '%'); }
    if (search) { where.push('(fixture_no LIKE ? OR name LIKE ? OR spec LIKE ? OR model LIKE ?)');
      var kw = '%' + search + '%';
      params.push(kw, kw, kw, kw);
    }
    if (overdue === '1') { where.push('expected_return_at < NOW() AND status = ?'); params.push('IN_USE'); }
    var sql = 'SELECT COUNT(*) as total FROM fixtures';
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    return q(sql, params).then(function(rows) { return rows[0].total; });
  }
  // updateFixture 支持可选 conn 参数（事务内调用），不传则用连接池（向后兼容）
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
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i];
      if (updated[k] !== original[k]) {
        cols.push(k + '=?');
        if (['made_at','verified_rd_at','verified_me_at','transferred_at','used_at','expected_return_at',
             'repair_requested_at','repaired_at','repair_confirmed_at','retired_at','expected_finish_at','improved_at',
             'last_maintenance_at','next_maintenance_at'].includes(k)) {
          vals.push(toDT(updated[k]));
        } else {
          vals.push(updated[k] != null ? updated[k] : null);
        }
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
      else await dbRef.run(sql, vals);
    }
    return await fetchOne(conn, 'SELECT * FROM fixtures WHERE id = ?', [updated.id]);
  }
  // addFixtureLog 支持可选 conn 参数（事务内调用），不传则用连接池（向后兼容）
  async function addFixtureLog({ fixture_id, action, role, user_id, dept, note }, conn) {
    var sql = 'INSERT INTO fixture_logs (fixture_id,action,role,user_id,dept,note) VALUES (?,?,?,?,?,?)';
    var params = [fixture_id, action, role||null, user_id||null, dept||null, note||null];
    if (conn) await conn.execute(sql, params);
    else await dbRef.run(sql, params);
  }
  // 聚合统计：按状态计数（SQL GROUP BY，避免全量拉取到内存）
  function countFixturesByStatus() { return q('SELECT status, COUNT(*) AS cnt FROM fixtures GROUP BY status'); }
  // 逾期：领用中且超过预计归还时间
  function listOverdueFixtures() { return q("SELECT * FROM fixtures WHERE status='IN_USE' AND expected_return_at IS NOT NULL AND expected_return_at < NOW()"); }
  // 我的待办：按角色返回（SQL级别过滤，避免全量内存遍历）
  function listMyPendingFixtures(role, userId) {
    if (role === 'RD') return q("SELECT * FROM fixtures WHERE status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_ORG_OK','REPAIRING_RD','IMPROVING') ORDER BY id DESC LIMIT 50");
    if (role === 'ADMIN') return q("SELECT * FROM fixtures WHERE status != 'RETIRED' ORDER BY id DESC LIMIT 50");
    if (['ME','QA','CUSTODY'].includes(role)) return q("SELECT * FROM fixtures WHERE status IN ('VERIFY_PENDING','VERIFY_RD_OK','TRANSFERRED','REPAIRING_ME','REPAIR_DONE','IN_USE') ORDER BY id DESC LIMIT 50");
    return q('SELECT * FROM fixtures WHERE requested_by=? ORDER BY id DESC LIMIT 50', [userId]);
  }
  // 详情页用户信息联查（一条 SQL 替代 listUsers + 内存 join）
  function getFixtureDetailById(id) {
    return one(`SELECT f.*, rd.display_name AS verified_rd_name, me.display_name AS verified_me_name,
      md.display_name AS made_by_name, ub.display_name AS used_by_name, rb.display_name AS repaired_by_name,
      rc.display_name AS repair_confirmed_by_name, ret.display_name AS retired_by_name, imp.display_name AS improved_by_name
      FROM fixtures f
      LEFT JOIN users rd ON rd.id = f.verified_rd
      LEFT JOIN users me ON me.id = f.verified_me
      LEFT JOIN users md ON md.id = f.made_by
      LEFT JOIN users ub ON ub.id = f.used_by
      LEFT JOIN users rb ON rb.id = f.repaired_by
      LEFT JOIN users rc ON rc.id = f.repair_confirmed_by
      LEFT JOIN users ret ON ret.id = f.retired_by
      LEFT JOIN users imp ON imp.id = f.improved_by
      WHERE f.id=?`, [id]);
  }
  function listFixtureLogs() { return q('SELECT fl.*,u.username,u.display_name FROM fixture_logs fl LEFT JOIN users u ON u.id=fl.user_id ORDER BY fl.id DESC'); }
  function getFixtureLogsByFixtureId(fixtureId) { return q('SELECT fl.*,u.username,u.display_name FROM fixture_logs fl LEFT JOIN users u ON u.id=fl.user_id WHERE fl.fixture_id=? ORDER BY fl.id DESC', [fixtureId]); }
  // 查询逾期未保养的治具 (next_maintenance_at <= NOW)
  async function listOverdueMaintenanceFixtures() {
    return q('SELECT * FROM fixtures WHERE retired_at IS NULL AND next_maintenance_at IS NOT NULL AND next_maintenance_at <= NOW() ORDER BY next_maintenance_at ASC');
  }
  // 查询 7 日内将到保养期的治具
  async function listUpcomingMaintenanceFixtures() {
    return q('SELECT * FROM fixtures WHERE retired_at IS NULL AND next_maintenance_at IS NOT NULL AND next_maintenance_at > NOW() AND next_maintenance_at <= DATE_ADD(NOW(), INTERVAL 7 DAY) ORDER BY next_maintenance_at ASC');
  }
  // 批量查询治具图片数量
  async function getFixturePhotoCounts(ids) {
    if (!ids || !ids.length) return [];
    var placeholders = ids.map(function(){ return '?'; }).join(',');
    var params = ids.concat(['fixture_photo', 'maintenance_photo', 'site_photo']);
    return q('SELECT fixture_id, COUNT(*) as cnt FROM fixture_files WHERE fixture_id IN (' + placeholders + ') AND category IN (?,?,?) GROUP BY fixture_id', params);
  }
  // 批量查询每个治具的首张实物照片路径
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
  return { nextFixtureNo, createFixture, getFixtureById, getFixtureByNo, listFixtures, updateFixture, addFixtureLog, listFixtureLogs, getFixtureLogsByFixtureId, countFixturesByStatus, listOverdueFixtures, listMyPendingFixtures, getFixtureDetailById, listOverdueMaintenanceFixtures, listUpcomingMaintenanceFixtures, getFixturePhotoCounts, getFirstPhotoMap, countAllFixtures };
};
