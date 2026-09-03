// subsystems/control/db/dao.js — 管制流程数据访问层（工厂模式）
const path = require('path');
const fs = require('fs');
const { generateControlCode } = require('./control-code');

// 附件上传物理目录：public/uploads/control_files（与 fixtures 的 fixture_files 同理，各子系统分目录）
const CONTROL_UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'control_files');
if (!fs.existsSync(CONTROL_UPLOAD_DIR)) fs.mkdirSync(CONTROL_UPLOAD_DIR, { recursive: true });

module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, runAffected = deps.runAffected, nowISO = deps.nowISO;

  // 事务内单行查询：传 conn 用当前连接（可见未提交数据），否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) { var rows = await conn.execute(sql, params || []); return rows[0].length ? Object.assign({}, rows[0][0]) : undefined; }
    return one(sql, params);
  }

  // 生成管制单号：conn 存在走事务连接（序号随事务回滚），否则连接池（独立提交，失败跳号但安全）
  async function nextOrderNo(conn) {
    return await generateControlCode({ conn: conn, query: q });
  }

  // 结余 = qty - good - ng - scrap（自动算，单一来源）
  function remainOf(d) {
    return Number(d.qty || 0) - Number(d.good_qty || 0) - Number(d.ng_qty || 0) - Number(d.scrap_qty || 0);
  }

  // 创建管制流程单；data 含核心/汇总字段，order_no 由 control_seqs 原子取号；conn 存在走事务连接
  async function createOrder(data, conn) {
    data = data || {};
    var orderNo = await nextOrderNo(conn);
    var sql = 'INSERT INTO control_orders (order_no,part_no,part_name,sales_no,model,qty,bad_type,reason,applicant_id,applicant_name,apply_dept,apply_at,label_no,storage_location,stored_at,ncr_no,disposal_opinion,rework_no,rework_sop,spray_date,rework_guide,rework_other,customer,bad_appearance,bad_function,bad_size,bad_change,bad_other,pack_sop,good_qty,ng_qty,scrap_qty,remain_qty,scrap_note,in_stock_at,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)';
    var params = [orderNo, data.part_no || null, data.part_name || null, data.sales_no || null, data.model || null, data.qty != null ? data.qty : null, data.bad_type || null, data.reason || null, data.applicant_id || null, data.applicant_name || null, data.apply_dept || null, data.apply_at || nowISO(), data.label_no || null, data.storage_location || null, data.stored_at || null, data.ncr_no || null, data.disposal_opinion || null, data.rework_no || null, data.rework_sop || null, data.spray_date || null, data.rework_guide || null, data.rework_other || null, data.customer || null, data.bad_appearance || null, data.bad_function || null, data.bad_size || null, data.bad_change || null, data.bad_other || null, data.pack_sop || null, data.good_qty || 0, data.ng_qty || 0, data.scrap_qty || 0, remainOf(data), data.scrap_note || null, data.in_stock_at || null, data.status || 'DRAFT', data.created_by || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
    return await fetchOne(conn, 'SELECT * FROM control_orders WHERE order_no = ?', [orderNo]);
  }

  function getOrderById(id) { return one('SELECT * FROM control_orders WHERE id = ?', [id]); }
  function getOrderByNo(order_no) { return one('SELECT * FROM control_orders WHERE order_no = ?', [order_no]); }

  // UTC+8 时区「今天」在 UTC ISO 下的 [起, 止) 边界（apply_at 为 UTC ISO 串，字典序比较自洽）
  function todayRangeIso() {
    var nowPlus8 = Date.now() + 8 * 3600000;
    var d = new Date(nowPlus8);
    var fromMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 8 * 3600000;
    return { from: new Date(fromMs).toISOString(), to: new Date(fromMs + 86400000).toISOString() };
  }

  // 列表/计数共用筛选条件（筛选维度：状态/申请部门/不良类型/机型/关键词/快速筛选 active/today/overdue）
  function buildOrderWhere(opts) {
    var where = [], params = [];
    if (opts.status) {
      var statuses = opts.status.split(',').filter(function (s) { return s; });
      if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); }
      else { where.push('status IN (' + statuses.map(function () { return '?'; }).join(',') + ')'); params.push.apply(params, statuses); }
    }
    if (opts.apply_dept) { where.push('apply_dept = ?'); params.push(opts.apply_dept); }
    if (opts.bad_type) { where.push('bad_type = ?'); params.push(opts.bad_type); }
    if (opts.model) { where.push('model = ?'); params.push(opts.model); }
    if (opts.search) { where.push('(order_no LIKE ? OR part_no LIKE ? OR part_name LIKE ? OR applicant_name LIKE ?)'); params.push('%' + opts.search + '%', '%' + opts.search + '%', '%' + opts.search + '%', '%' + opts.search + '%'); }
    // 看板统计卡联动：进行中 / 今日新增 / 超期滞留（与 dashboard.js 判定口径一致）
    if (opts.active) { where.push("status NOT IN ('SHIPPED','RETIRED')"); }
    if (opts.today) {
      var r = todayRangeIso();
      where.push('apply_at IS NOT NULL AND apply_at >= ? AND apply_at < ?');
      params.push(r.from, r.to);
    }
    if (opts.overdue) {
      var oh = Number(opts.overdue_hours) || 48;
      where.push("status NOT IN ('SHIPPED','RETIRED') AND apply_at IS NOT NULL AND apply_at < ?");
      params.push(new Date(Date.now() - oh * 3600000).toISOString());
    }
    return { where: where, params: params };
  }

  // 排序白名单映射：sort 参数(前缀 '-' 表示 DESC) → 安全排序子句（默认按 id DESC），白名单防注入
  var SORT_MAP = {
    'id': 'ORDER BY id ASC', 'order_no': 'ORDER BY order_no ASC', '-order_no': 'ORDER BY order_no DESC',
    'apply_at': 'ORDER BY apply_at ASC', '-apply_at': 'ORDER BY apply_at DESC',
    'created_at': 'ORDER BY created_at ASC', '-created_at': 'ORDER BY created_at DESC'
  };

  function listOrders(opts) {
    opts = opts || {};
    var b = buildOrderWhere(opts);
    var orderBy = SORT_MAP[opts.sort] || 'ORDER BY id DESC';
    var sql = 'SELECT * FROM control_orders' + (b.where.length ? ' WHERE ' + b.where.join(' AND ') : '') + ' ' + orderBy;
    if (opts.limit != null) { sql += ' LIMIT ' + parseInt(opts.limit, 10); }
    if (opts.offset != null) { sql += ' OFFSET ' + parseInt(opts.offset, 10); }
    return q(sql, b.params);
  }

  function countAllOrders(opts) {
    opts = opts || {};
    var b = buildOrderWhere(opts);
    var sql = 'SELECT COUNT(*) AS total FROM control_orders' + (b.where.length ? ' WHERE ' + b.where.join(' AND ') : '');
    return q(sql, b.params).then(function (rows) { return rows[0].total; });
  }

  // 全字段更新主单（结余自动重算）；调用方须传入完整对象，conn 存在走事务连接
  async function updateOrder(o, conn, expectedVersion) {
    o = o || {};
    var sql = 'UPDATE control_orders SET part_no=?, part_name=?, sales_no=?, model=?, qty=?, bad_type=?, reason=?, applicant_id=?, applicant_name=?, apply_dept=?, apply_at=?, label_no=?, storage_location=?, stored_at=?, ncr_no=?, disposal_opinion=?, rework_no=?, rework_sop=?, spray_date=?, rework_guide=?, rework_other=?, customer=?, bad_appearance=?, bad_function=?, bad_size=?, bad_change=?, bad_other=?, pack_sop=?, good_qty=?, ng_qty=?, scrap_qty=?, remain_qty=?, scrap_note=?, in_stock_at=?, status=? WHERE id=?';
    var params = [o.part_no ?? null, o.part_name ?? null, o.sales_no ?? null, o.model ?? null, o.qty != null ? o.qty : null, o.bad_type ?? null, o.reason ?? null, o.applicant_id ?? null, o.applicant_name ?? null, o.apply_dept ?? null, o.apply_at ?? null, o.label_no ?? null, o.storage_location ?? null, o.stored_at ?? null, o.ncr_no ?? null, o.disposal_opinion ?? null, o.rework_no ?? null, o.rework_sop ?? null, o.spray_date ?? null, o.rework_guide ?? null, o.rework_other ?? null, o.customer ?? null, o.bad_appearance ?? null, o.bad_function ?? null, o.bad_size ?? null, o.bad_change ?? null, o.bad_other ?? null, o.pack_sop ?? null, o.good_qty ?? 0, o.ng_qty ?? 0, o.scrap_qty ?? 0, remainOf(o), o.scrap_note ?? null, o.in_stock_at ?? null, o.status ?? null, o.id];
    // C1 乐观锁：传 expectedVersion 时 SET 加 version=version+1、WHERE 加 version 条件，冲突抛 CONFLICT
    var where = 'id=?';
    if (expectedVersion !== undefined && expectedVersion !== null) {
      where = 'id=? AND version=?';
      sql = sql.replace('UPDATE control_orders SET ', 'UPDATE control_orders SET version=version+1, ');
      params.push(expectedVersion);
    }
    sql = sql.replace('WHERE id=?', 'WHERE ' + where);
    var affected;
    if (conn) { var [r] = await conn.execute(sql, params); affected = r.affectedRows; }
    else affected = await runAffected(sql, params);
    if (expectedVersion !== undefined && expectedVersion !== null && affected === 0) {
      var e = new Error('VERSION_CONFLICT'); e.code = 'CONFLICT'; throw e;
    }
    return await fetchOne(conn, 'SELECT * FROM control_orders WHERE id = ?', [o.id]);
  }

  // 各状态单数统计（看板/列表状态分组）
  function countOrdersByStatus() { return q('SELECT status, COUNT(*) AS cnt FROM control_orders GROUP BY status'); }

  // 会签子表（2 个闸口：APPLY_SIGN / DISPOSAL_SIGN），唯一键 (order_id,node_key,seq)
  // 写入采用 UPSERT：创建时初始化待签槽(decision='')用 INSERT，签署时命中同 (order_id,node_key,seq) 槽改 UPDATE，
  //   与 routes-orders 的「建单/发起会签时预建模板槽 + 签署时填充」一致，避免重复签字冲突。
  async function addSign(s, conn) {
    s = s || {};
    var sql = 'INSERT INTO control_signs (order_id,node_key,node_name,`seq`,role,sign_dept,signer_id,signer_name,decision,comment,signed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE node_name=VALUES(node_name), role=VALUES(role), sign_dept=VALUES(sign_dept), signer_id=VALUES(signer_id), signer_name=VALUES(signer_name), decision=VALUES(decision), comment=VALUES(comment), signed_at=VALUES(signed_at)';
    var params = [s.order_id, s.node_key, s.node_name || null, s.seq, s.role || null, s.sign_dept || null, s.signer_id || null, s.signer_name || null, s.decision || '', s.comment || null, s.signed_at || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listSignsByOrder(order_id) { return q('SELECT * FROM control_signs WHERE order_id = ? ORDER BY `seq` ASC', [order_id]); }

  // C3 会签超时：创建后超过阈值未签的会签记录
  function listOverdueSigns(hours) {
    return q("SELECT cs.*, co.order_no, co.status AS order_status FROM control_signs cs JOIN control_orders co ON cs.order_id = co.id WHERE (cs.decision IS NULL OR cs.decision = '') AND cs.signed_at IS NULL AND cs.created_at < DATE_SUB(NOW(), INTERVAL ? HOUR) ORDER BY cs.created_at ASC", [hours || 48]);
  }

  // 不良品委托单子表（可多次开单）
  async function addNcrLog(n, conn) {
    n = n || {};
    var sql = 'INSERT INTO control_ncr_logs (order_id,ncr_no,inspect_dept,handle_dept,form_template,created_by) VALUES (?,?,?,?,?,?)';
    var params = [n.order_id, n.ncr_no || null, n.inspect_dept || null, n.handle_dept || null, n.form_template || null, n.created_by || null];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  // NCR 明细：左连 users 带回创建人姓名（created_by_name），供详情展开卡展示
  function listNcrLogsByOrder(order_id) {
    return q('SELECT n.\*, u.display_name AS created_by_name FROM control_ncr_logs n LEFT JOIN users u ON n.created_by = u.id WHERE n.order_id = ? ORDER BY n.id DESC', [order_id]);
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

  // 报工子表（⑨ 可多次报工）
  async function addReworkLog(r, conn) {
    r = r || {};
    var sql = 'INSERT INTO control_rework_logs (order_id,work_date,good_qty,ng_qty,scrap_qty,scrap_reason,operator_id,operator_name,batch_no,pack_record,confirm_by,qty_consistent) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)';
    var params = [r.order_id, r.work_date || null, r.good_qty ?? 0, r.ng_qty ?? 0, r.scrap_qty ?? 0, r.scrap_reason || null, r.operator_id || null, r.operator_name || null, r.batch_no || null, r.pack_record || null, r.confirm_by || null, r.qty_consistent != null ? (r.qty_consistent ? 1 : 0) : 0];
    if (conn) await conn.execute(sql, params);
    else await run(sql, params);
  }

  function listReworkLogsByOrder(order_id) { return q('SELECT * FROM control_rework_logs WHERE order_id = ? ORDER BY id DESC', [order_id]); }

  // 留痕时间轴（命名为 addControlLog 避免与 samples DAO 的 addLog 展平冲突）
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

  // 系统配置读取：不存在返回 null，调用方按缺省值回退（如 overdue_hours 缺省 48）
  function getControlSetting(k) {
    return one('SELECT v FROM control_settings WHERE k = ?', [k]).then(function (r) { return r ? Number(r.v) : null; });
  }

  // 系统配置写入（UPSERT）：conn 存在走事务连接
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

  return { createOrder, getOrderById, getOrderByNo, listOrders, countAllOrders, updateOrder, countOrdersByStatus, addSign, listSignsByOrder, listOverdueSigns, addNcrLog, listNcrLogsByOrder, listNcrAgg, countNcrAgg, addReworkLog, listReworkLogsByOrder, addControlLog, listLogsByOrder, listLogsAll, countLogsAll, getControlSetting, setControlSetting, ctlListOrderFiles, ctlGetOrderFile, ctlAddOrderFile, ctlDeleteOrderFile, getControlUploadDir };
};
