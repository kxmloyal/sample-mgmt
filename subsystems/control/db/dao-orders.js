// subsystems/control/db/dao-orders.js — 管制单主表域 DAO（2026-09-08 自 dao.js 按域拆分，对外接口不变）
// 覆盖：建单/查询/列表/计数/全字段更新（CAS）；dao.js 为薄入口合并导出，调用方 D.fnName() 无感
const { generateControlCode } = require('./control-code');

module.exports = function createDaoOrders(deps) {
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
    // 标签清单：已贴标（label_no 已生成）且未作废
    if (opts.label_ready) {
      where.push("label_no IS NOT NULL AND label_no <> '' AND status <> 'RETIRED'");
    }
    // 会签超时（2026-09-08 激活 listOverdueSigns 口径）：存在滞留超阈值的待签行，且单据仍在会签中
    if (opts.sign_overdue) {
      var soh = Number(opts.overdue_hours) || 48;
      where.push("status IN ('SIGNING','DISPOSAL_SIGNING') AND id IN (SELECT order_id FROM control_signs WHERE (decision IS NULL OR decision = '') AND signed_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL ? HOUR))");
      params.push(soh);
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

  return { createOrder, getOrderById, getOrderByNo, listOrders, countAllOrders, updateOrder, countOrdersByStatus };
};
