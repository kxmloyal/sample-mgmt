// subsystems/samples/db/dao.js — 样品数据访问层（工厂模式）
const crypto = require('crypto');

module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  // 事务内单行查询：传 conn 用当前连接，否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].length ? Object.assign({}, rows[0][0]) : undefined;
    }
    return one(sql, params);
  }

  async function nextSampleNo(conn) {
    var row = await fetchOne(conn, 'SELECT COALESCE(MAX(id), 0) AS m FROM samples');
    return 'SM-' + String(row.m + 1).padStart(6, '0');
  }

  // createSample: SAVEPOINT 重试解决并发 UNIQUE 冲突
  async function createSample(data, conn) {
    var token = crypto.randomBytes(8).toString('hex');
    var sbRd = data.signed_by_rd || '';
    var sql = 'INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rd,signed_by_qa,replaces) VALUES (?,?,?,?,?,?,?,\'NEW\',?,?,?,?,?,?,?,?,?,?,?,?)';
    var lastErr;
    for (var i = 0; i < 3; i++) {
      var ns = await nextSampleNo(conn);
      var params = [ns, data.name || null, data.spec || null, data.model || null, data.station || null, data.image || null, token, data.created_by || null, data.notes || null, data.sample_type || '', data.limit_item || '', data.source_type || '', data.valid_until || '', data.card_version || '', data.test_standard || '', data.test_data || '', sbRd, data.signed_by_qa || '', data.replaces || null];
      try {
        if (conn) {
          await conn.execute('SAVEPOINT sp_create_sample');
          await conn.execute(sql, params);
          await conn.execute('RELEASE SAVEPOINT sp_create_sample');
        } else {
          await run(sql, params);
        }
        return await fetchOne(conn, 'SELECT * FROM samples WHERE sample_no = ?', [ns]);
      } catch (e) {
        if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
          if (conn) { try { await conn.execute('ROLLBACK TO SAVEPOINT sp_create_sample'); } catch (_) {} }
          lastErr = e; continue;
        }
        throw e;
      }
    }
    throw lastErr || new Error('createSample 重试 3 次仍失败');
  }

  function getSampleById(id) { return one('SELECT * FROM samples WHERE id = ?', [id]); }
  function getSampleByNo(sample_no) { return one('SELECT * FROM samples WHERE sample_no = ?', [sample_no]); }
  function getSampleByToken(qr_token) { return one('SELECT * FROM samples WHERE qr_token = ?', [qr_token]); }

  function listSamples(opts) {
    opts = opts || {};
    var where = [], params = [];
    if (opts.status) { var statuses = opts.status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (opts.dept) { where.push('custody_dept = ?'); params.push(opts.dept); }
    if (opts.search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + opts.search + '%', '%' + opts.search + '%', '%' + opts.search + '%'); }
    if (opts.overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
    else if (opts.overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }
    if (opts.sample_type) { where.push('sample_type = ?'); params.push(opts.sample_type); }
    if (opts.limit_item) { where.push('limit_item = ?'); params.push(opts.limit_item); }
    if (opts.source_type) { where.push('source_type = ?'); params.push(opts.source_type); }
    var orderBy = 'ORDER BY id DESC';
    if (opts.sort === 'created_at') orderBy = 'ORDER BY created_at ASC';
    else if (opts.sort === '-created_at') orderBy = 'ORDER BY created_at DESC';
    else if (opts.sort === 'sample_no') orderBy = 'ORDER BY sample_no ASC';
    else if (opts.sort === '-sample_no') orderBy = 'ORDER BY sample_no DESC';
    var sql = 'SELECT * FROM samples' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ' + orderBy;
    if (opts.limit != null) { sql += ' LIMIT ' + parseInt(opts.limit, 10); }
    if (opts.offset != null) { sql += ' OFFSET ' + parseInt(opts.offset, 10); }
    return q(sql, params);
  }

  function countAllSamples(opts) {
    opts = opts || {};
    var where = [], params = [];
    if (opts.status) { var statuses = opts.status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (opts.dept) { where.push('custody_dept = ?'); params.push(opts.dept); }
    if (opts.search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + opts.search + '%', '%' + opts.search + '%', '%' + opts.search + '%'); }
    if (opts.overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
    else if (opts.overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }
    if (opts.sample_type) { where.push('sample_type = ?'); params.push(opts.sample_type); }
    if (opts.limit_item) { where.push('limit_item = ?'); params.push(opts.limit_item); }
    if (opts.source_type) { where.push('source_type = ?'); params.push(opts.source_type); }
    var sql = 'SELECT COUNT(*) as total FROM samples' + (where.length ? ' WHERE ' + where.join(' AND ') : '');
    return q(sql, params).then(function(rows) { return rows[0].total; });
  }

  async function updateSample(s, conn) {
    var sql = 'UPDATE samples SET status=?, produced_at=?, released_at=?, release_cycle_days=?, next_inspect_at=?, custody_dept=?, storage_location=?, model=?, station=?, image=?, produced_image=?, inspect_image=?, notes=?, sample_type=?, limit_item=?, source_type=?, valid_until=?, card_version=?, test_standard=?, test_data=?, signed_by_rd=?, signed_by_qa=?, retired_reason=?, replaced_by=?, replaces=?, retire_assigned_rd=? WHERE id=?';
    var params = [s.status, s.produced_at || null, s.released_at || null, s.release_cycle_days ?? null, s.next_inspect_at || null, s.custody_dept || null, s.storage_location || null, s.model ?? null, s.station ?? null, s.image ?? null, s.produced_image ?? null, s.inspect_image ?? null, s.notes || null, s.sample_type ?? '', s.limit_item ?? '', s.source_type ?? '', s.valid_until ?? null, s.card_version ?? '', s.test_standard ?? '', s.test_data ?? '', s.signed_by_rd ?? '', s.signed_by_qa ?? '', s.retired_reason ?? null, s.replaced_by ?? null, s.replaces ?? null, s.retire_assigned_rd ?? null, s.id];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
    return await fetchOne(conn, 'SELECT * FROM samples WHERE id = ?', [s.id]);
  }

  async function deleteSample(id) {
    await run('DELETE FROM scan_logs WHERE sample_id=?', [id]);
    await run('DELETE FROM samples WHERE id=?', [id]);
  }

  function countSamplesByStatus() { return q('SELECT status, COUNT(*) AS cnt FROM samples GROUP BY status'); }
  function listOverdueSamples() { return q("SELECT * FROM samples WHERE status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
  function listDueSoonSamples() { return q("SELECT * FROM samples WHERE status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }

  function listMyPendingSamples(role, userId) {
    if (role === 'RD') return q("SELECT * FROM samples WHERE status='NEW' OR (status='RETURNING' AND retire_assigned_rd=?) ORDER BY id DESC LIMIT 50", [userId]);
    if (role === 'QA') return q("SELECT * FROM samples WHERE status IN ('PRODUCED','RETURNING') ORDER BY id DESC LIMIT 50");
    if (['CUSTODY','ME'].includes(role)) return q("SELECT * FROM samples WHERE status='RELEASED' ORDER BY id DESC LIMIT 50");
    return q('SELECT * FROM samples ORDER BY id DESC LIMIT 50');
  }

  // 日志
  async function addLog(log, conn) {
    var sql = 'INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note) VALUES (?,?,?,?,?,?,?)';
    var params = [log.sample_id, log.action, log.role || null, log.user_id || null, log.dept || null, log.location || null, log.note || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listLogsBySample(sample_id) { return q('SELECT * FROM scan_logs WHERE sample_id = ? ORDER BY id DESC LIMIT 100', [sample_id]); }
  function listLogs() {
    return q('SELECT l.*, s.sample_no, s.name AS sample_name FROM scan_logs l LEFT JOIN samples s ON s.id = l.sample_id ORDER BY l.id DESC LIMIT 500');
  }

  return { nextSampleNo, createSample, getSampleById, getSampleByNo, getSampleByToken, listSamples, countAllSamples, updateSample, deleteSample, countSamplesByStatus, listOverdueSamples, listDueSoonSamples, listMyPendingSamples, addLog, listLogsBySample, listLogs };
};
