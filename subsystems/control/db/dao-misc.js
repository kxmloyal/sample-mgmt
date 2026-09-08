// subsystems/control/db/dao-misc.js — 管制其余域 DAO（2026-09-08 自 dao.js 按域拆分，对外接口不变）
// 覆盖：不良品委托单(NCR)/报工/留痕日志/系统设置/附件文件
const path = require('path');
const fs = require('fs');

// 附件上传物理目录：public/uploads/control_files（与 fixtures 的 fixture_files 同理，各子系统分目录）
const CONTROL_UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'control_files');
if (!fs.existsSync(CONTROL_UPLOAD_DIR)) fs.mkdirSync(CONTROL_UPLOAD_DIR, { recursive: true });

module.exports = function createDaoMisc(deps) {
  var q = deps.q, one = deps.one, run = deps.run;

  // ===== 不良品委托单（可多次开单）=====
  async function addNcrLog(n, conn) {
    n = n || {};
    var sql = 'INSERT INTO control_ncr_logs (order_id,ncr_no,inspect_dept,handle_dept,form_template,created_by) VALUES (?,?,?,?,?,?)';
    var params = [n.order_id, n.ncr_no || null, n.inspect_dept || null, n.handle_dept || null, n.form_template || null, n.created_by || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  // NCR 明细：左连 users 带回创建人姓名（created_by_name），供详情展开卡展示
  function listNcrLogsByOrder(order_id) {
    return q('SELECT n.*, u.display_name AS created_by_name FROM control_ncr_logs n LEFT JOIN users u ON n.created_by = u.id WHERE n.order_id = ? ORDER BY n.id DESC', [order_id]);
  }

  // NCR 聚合筛选条件构建：ncr_no/order_no/inspect_dept/handle_dept/created_by_name/创建时间区间
  function buildNcrWhere(opts) {
    var where = [], params = [];
    if (opts.ncr_no) { where.push('n.ncr_no LIKE ?'); params.push('%' + opts.ncr_no + '%'); }
    if (opts.order_no) { where.push('o.order_no LIKE ?'); params.push('%' + opts.order_no + '%'); }
    if (opts.order_ids) {
      var ids = String(opts.order_ids).split(',').map(function (s) { return parseInt(s, 10); }).filter(function (n) { return !isNaN(n); });
      if (ids.length === 1) { where.push('n.order_id = ?'); params.push(ids[0]); }
      else if (ids.length > 1) { where.push('n.order_id IN (' + ids.map(function () { return '?'; }).join(',') + ')'); params.push.apply(params, ids); }
    }
    if (opts.inspect_dept) { where.push('n.inspect_dept = ?'); params.push(opts.inspect_dept); }
    if (opts.handle_dept) { where.push('n.handle_dept = ?'); params.push(opts.handle_dept); }
    if (opts.created_by_name) { where.push('u.display_name LIKE ?'); params.push('%' + opts.created_by_name + '%'); }
    if (opts.date_from) { where.push('n.created_at >= ?'); params.push(opts.date_from); }
    if (opts.date_to) { where.push('n.created_at <= ?'); params.push(opts.date_to); }
    return { where: where, params: params };
  }

  // NCR 跨单聚合列表：左连管制单(order_no/part_no/part_name/status)与 users(created_by_name)，分页
  function listNcrAgg(opts) {
    opts = opts || {};
    var b = buildNcrWhere(opts);
    var sql = 'SELECT n.*, o.order_no, o.part_no, o.part_name, o.status, u.display_name AS created_by_name FROM control_ncr_logs n LEFT JOIN control_orders o ON n.order_id = o.id LEFT JOIN users u ON n.created_by = u.id' + (b.where.length ? ' WHERE ' + b.where.join(' AND ') : '') + ' ORDER BY n.id DESC';
    if (opts.limit != null) { sql += ' LIMIT ' + parseInt(opts.limit, 10); }
    if (opts.offset != null) { sql += ' OFFSET ' + parseInt(opts.offset, 10); }
    return q(sql, b.params);
  }

  function countNcrAgg(opts) {
    opts = opts || {};
    var b = buildNcrWhere(opts);
    var sql = 'SELECT COUNT(*) AS total FROM control_ncr_logs n LEFT JOIN control_orders o ON n.order_id = o.id LEFT JOIN users u ON n.created_by = u.id' + (b.where.length ? ' WHERE ' + b.where.join(' AND ') : '');
    return q(sql, b.params).then(function (rows) { return rows[0].total; });
  }

  // ===== 报工（可多次报工）=====
  async function addReworkLog(r, conn) {
    r = r || {};
    var sql = 'INSERT INTO control_rework_logs (order_id,work_date,good_qty,ng_qty,scrap_qty,scrap_reason,operator_id,operator_name,batch_no,pack_record,confirm_by,qty_consistent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
    var params = [r.order_id, r.work_date || null, r.good_qty ?? 0, r.ng_qty ?? 0, r.scrap_qty ?? 0, r.scrap_reason || null, r.operator_id || null, r.operator_name || null, r.batch_no || null, r.pack_record || null, r.confirm_by || null, r.qty_consistent != null ? (r.qty_consistent ? 1 : 0) : 0];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listReworkLogsByOrder(order_id) { return q('SELECT * FROM control_rework_logs WHERE order_id = ? ORDER BY id DESC', [order_id]); }

  // ===== 留痕时间轴（命名为 addControlLog 避免与 samples DAO 的 addLog 展平冲突）=====
  async function addControlLog(l, conn) {
    l = l || {};
    var sql = 'INSERT INTO control_logs (order_id,action,role,user_id,dept,comment) VALUES (?,?,?,?,?,?)';
    var params = [l.order_id, l.action, l.role || null, l.user_id || null, l.dept || null, l.comment || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listLogsByOrder(order_id) { return q('SELECT * FROM control_logs WHERE order_id = ? ORDER BY id DESC LIMIT 200', [order_id]); }

  // 全局留痕分页（日志页专用）：LEFT JOIN 主单带 order_no，按 id DESC 分页，limit/offset 白名单强转防注入
  function listLogsAll(pg) {
    pg = pg || {};
    var limit = Math.min(Math.max(parseInt(pg.limit, 10) || 20, 1), 100);
    var offset = Math.max(parseInt(pg.offset, 10) || 0, 0);
    return q('SELECT l.*, o.order_no, o.part_name FROM control_logs l LEFT JOIN control_orders o ON l.order_id = o.id ORDER BY l.id DESC LIMIT ' + limit + ' OFFSET ' + offset);
  }

  function countLogsAll() { return q('SELECT COUNT(*) AS total FROM control_logs').then(function (rows) { return rows[0].total; }); }

  // ===== 系统设置 =====
  // 读取：不存在返回 null，调用方按缺省值回退（如 overdue_hours 缺省 48）
  function getControlSetting(k) {
    return one('SELECT v FROM control_settings WHERE k = ?', [k]).then(function (r) { return r ? Number(r.v) : null; });
  }

  // 写入（UPSERT）：conn 存在走事务连接
  async function setControlSetting(k, v, conn) {
    var sql = 'INSERT INTO control_settings (k, v) VALUES (?,?) ON DUPLICATE KEY UPDATE v = VALUES(v)';
    var params = [k, v];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  // ===== 附件（文件/图片）=====
  // 列表：按 id 倒序，latest 在前
  function ctlListOrderFiles(order_id) { return q('SELECT * FROM control_files WHERE order_id = ? ORDER BY id DESC', [order_id]); }
  function ctlGetOrderFile(fileId) { return one('SELECT * FROM control_files WHERE id = ?', [fileId]); }

  // 新增文件记录：filename 为磁盘随机名（uuid），original_name 为原始文件名
  async function ctlAddOrderFile(f) {
    f = f || {};
    var sql = 'INSERT INTO control_files (order_id, filename, original_name, mime_type, file_size, uploaded_by) VALUES (?,?,?,?,?,?)';
    await run(sql, [f.order_id, f.filename, f.original_name || null, f.mime_type || null, f.file_size || 0, f.uploaded_by || null]);
    return one('SELECT * FROM control_files WHERE order_id = ? AND filename = ? ORDER BY id DESC LIMIT 1', [f.order_id, f.filename]);
  }

  // 删除文件：先取记录定位磁盘文件，物理删除后删库记录；记录不存在返回 false
  async function ctlDeleteOrderFile(fileId) {
    var f = await ctlGetOrderFile(fileId);
    if (!f) return false;
    var fp = path.join(CONTROL_UPLOAD_DIR, f.filename);
    fs.unlink(fp, function () {}); // 异步删除，忽略错误（文件可能已丢失）
    await run('DELETE FROM control_files WHERE id = ?', [fileId]);
    return true;
  }

  function getControlUploadDir() { return CONTROL_UPLOAD_DIR; }

  return { addNcrLog, listNcrLogsByOrder, listNcrAgg, countNcrAgg, addReworkLog, listReworkLogsByOrder, addControlLog, listLogsByOrder, listLogsAll, countLogsAll, getControlSetting, setControlSetting, ctlListOrderFiles, ctlGetOrderFile, ctlAddOrderFile, ctlDeleteOrderFile, getControlUploadDir };
};
