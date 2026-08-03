// db/samples.js — 样品 CRUD（工厂模式：接收 { q, one, dbRef, nowISO }）
const crypto = require('crypto');

module.exports = function({ q, one, dbRef, nowISO }) {
  // 事务内单行查询：传 conn 用当前连接（可读未提交数据），否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      const [rows] = await conn.execute(sql, params || []);
      return rows.length ? Object.assign({}, rows[0]) : undefined;
    }
    return one(sql, params);
  }
  async function nextSampleNo(conn) {
    const row = await fetchOne(conn, 'SELECT COALESCE(MAX(id), 0) AS m FROM samples');
    return 'SM-' + String(row.m + 1).padStart(6, '0');
  }
  // createSample 支持可选 conn 参数（事务内调用），不传则用连接池（向后兼容）
  // 并发场景下 sample_no UNIQUE 冲突时重试 3 次（事务内用 SAVEPOINT 隔离失败 INSERT）
  async function createSample({ name, spec, model, station, image, notes, created_by,
    sample_type, limit_item, source_type, valid_until, card_version,
    test_standard, test_data, signed_by_rd, signed_by_qa,
    replaces }, conn) {
    const token = crypto.randomBytes(8).toString('hex');
    const sbRd = signed_by_rd || '';
    const sql = `INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,
      sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rd,signed_by_qa,
      replaces)
      VALUES (?,?,?,?,?,?,?,'NEW',?,?,?,?,?,?,?,?,?,?,?,?)`;
    let lastErr;
    for (let i = 0; i < 3; i++) {
      const ns = await nextSampleNo(conn);
      const params = [ns, name || null, spec || null, model || null, station || null, image || null,
         token, created_by || null, notes || null,
         sample_type || '', limit_item || '', source_type || '', valid_until || '',
         card_version || '', test_standard || '', test_data || '',
         sbRd, signed_by_qa || '',
         replaces || null];
      try {
        if (conn) {
          await conn.execute('SAVEPOINT sp_create_sample');
          await conn.execute(sql, params);
          await conn.execute('RELEASE SAVEPOINT sp_create_sample');
        } else {
          await dbRef.run(sql, params);
        }
        return await fetchOne(conn, 'SELECT * FROM samples WHERE sample_no = ?', [ns]);
      } catch (e) {
        // ER_DUP_ENTRY(1062): sample_no UNIQUE 冲突，回滚 SAVEPOINT 后重试
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
  function listSamples({ status, dept, search, sort, overdue, sample_type, limit_item, source_type, limit = 100, offset = 0 } = {}) {
    const where = []; const params = [];
    if (status) { var statuses = status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (dept) { where.push('custody_dept = ?'); params.push(dept); }
    if (search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)');
      params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
    if (overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
    else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }
    if (sample_type) { where.push('sample_type = ?'); params.push(sample_type); }
    if (limit_item) { where.push('limit_item = ?'); params.push(limit_item); }
    if (source_type) { where.push('source_type = ?'); params.push(source_type); }
    let orderBy = 'ORDER BY id DESC';
    if (sort === 'created_at') orderBy = 'ORDER BY created_at ASC';
    else if (sort === '-created_at') orderBy = 'ORDER BY created_at DESC';
    else if (sort === 'sample_no') orderBy = 'ORDER BY sample_no ASC';
    else if (sort === '-sample_no') orderBy = 'ORDER BY sample_no DESC';
    var sql = 'SELECT * FROM samples' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ' + orderBy;
    if (limit != null) { sql += ' LIMIT ' + parseInt(limit, 10); }
  if (offset != null) { sql += ' OFFSET ' + parseInt(offset, 10); }
    return q(sql, params);
  }
  // 计数（与 listSamples 同 WHERE 条件，不含 sort/limit/offset），用于分页 total
  function countAllSamples({ status, dept, search, overdue, sample_type, limit_item, source_type } = {}) {
    var where = [], params = [];
    if (status) { var statuses = status.split(',').filter(function(s){return s;}); if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); } else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); } }
    if (dept) { where.push('custody_dept = ?'); params.push(dept); }
    if (search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)'); params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
    if (overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
    else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }
    if (sample_type) { where.push('sample_type = ?'); params.push(sample_type); }
    if (limit_item) { where.push('limit_item = ?'); params.push(limit_item); }
    if (source_type) { where.push('source_type = ?'); params.push(source_type); }
    var sql = 'SELECT COUNT(*) as total FROM samples' + (where.length ? ' WHERE ' + where.join(' AND ') : '');
    return q(sql, params).then(function(rows) { return rows[0].total; });
  }
  // updateSample 支持可选 conn 参数（事务内调用），不传则用连接池（向后兼容）
  async function updateSample(s, conn) {
    const sql = `UPDATE samples SET status=?, produced_at=?, released_at=?, release_cycle_days=?,
      next_inspect_at=?, custody_dept=?, storage_location=?, model=?, station=?, image=?,
      produced_image=?, inspect_image=?, notes=?,
      sample_type=?, limit_item=?, source_type=?, valid_until=?, card_version=?,
      test_standard=?, test_data=?, signed_by_rd=?, signed_by_qa=?,
      retired_reason=?, replaced_by=?, replaces=?, retire_assigned_rd=?
      WHERE id=?`;
    const params = [s.status, s.produced_at || null, s.released_at || null, s.release_cycle_days ?? null,
       s.next_inspect_at || null, s.custody_dept || null, s.storage_location || null,
       s.model ?? null, s.station ?? null, s.image ?? null,
       s.produced_image ?? null, s.inspect_image ?? null, s.notes || null,
       s.sample_type ?? '', s.limit_item ?? '', s.source_type ?? '', s.valid_until ?? null,
       s.card_version ?? '', s.test_standard ?? '', s.test_data ?? '',
       s.signed_by_rd ?? '',
       s.signed_by_qa ?? '',
       s.retired_reason ?? null, s.replaced_by ?? null, s.replaces ?? null, s.retire_assigned_rd ?? null,
       s.id];
    if (conn) await conn.execute(sql, params);
    else await dbRef.run(sql, params);
    return await fetchOne(conn, 'SELECT * FROM samples WHERE id = ?', [s.id]);
  }
  async function deleteSample(id) {
    await dbRef.run('DELETE FROM scan_logs WHERE sample_id=?', [id]);
    await dbRef.run('DELETE FROM samples WHERE id=?', [id]);
  }
  // 聚合统计：按状态计数（SQL GROUP BY，避免全量拉取到内存）
  function countSamplesByStatus() { return q('SELECT status, COUNT(*) AS cnt FROM samples GROUP BY status'); }
  // 逾期
  function listOverdueSamples() { return q("SELECT * FROM samples WHERE status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < NOW()"); }
  // 即将到期（7天内）
  function listDueSoonSamples() { return q("SELECT * FROM samples WHERE status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= NOW() AND next_inspect_at < DATE_ADD(NOW(), INTERVAL 7 DAY)"); }
  // 我的待办（SQL级别过滤）
  function listMyPendingSamples(role, userId) {
    if (role === 'RD') return q("SELECT * FROM samples WHERE status='NEW' OR (status='RETURNING' AND retire_assigned_rd=?) ORDER BY id DESC LIMIT 50", [userId]);
    if (role === 'QA') return q("SELECT * FROM samples WHERE status IN ('PRODUCED','RETURNING') ORDER BY id DESC LIMIT 50");
    if (['CUSTODY','ME'].includes(role)) return q("SELECT * FROM samples WHERE status='RELEASED' ORDER BY id DESC LIMIT 50");
    return q('SELECT * FROM samples ORDER BY id DESC LIMIT 50');
  }
  return { nextSampleNo, createSample, getSampleById, getSampleByNo, getSampleByToken, listSamples, countAllSamples, updateSample, deleteSample, countSamplesByStatus, listOverdueSamples, listDueSoonSamples, listMyPendingSamples };
};
