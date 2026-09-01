// subsystems/workbench/db/workbench-queries.js
// 统一工作台查询：合并样品 + 治具 + 管制 active 数据，exclude 终态/作废
// 外层排序（dwell_hours DESC）后用 LIMIT/OFFSET 分页，避免服务端全量传输
// 注意：三条 UNION ALL 分支列名 / 顺序 / 类型 MUST 完全一致（24 列）

var unionSQL = `
  SELECT
    s.id AS id,
    s.sample_no AS item_no,
    s.name,
    'sample' AS item_type,
    '样品' AS item_type_cn,
    s.status,
    -- 呆滞天数：以 last activity(updated_at) 计，超过统一呆滞阈值返回天数，否则 NULL（与治具一致）
    CASE
      WHEN DATEDIFF(NOW(), s.updated_at) >= COALESCE((SELECT v FROM fixtures_settings WHERE k = 'dormant_days'), 60)
      THEN DATEDIFF(NOW(), s.updated_at)
      ELSE NULL
    END AS dormant_days,
    CASE s.status
      WHEN 'NEW' THEN '制样中'
      WHEN 'PRODUCED' THEN '待发行'
      WHEN 'RELEASED' THEN '保管中'
      WHEN 'IN_CUSTODY' THEN '保管中'
      WHEN 'RETURNING' THEN '退回审核中'
      WHEN 'RETIRED' THEN '已废弃'
    END AS stage_cn,
    CASE s.status
      WHEN 'NEW' THEN '研发部'
      WHEN 'PRODUCED' THEN '研发部'
      WHEN 'RELEASED' THEN COALESCE(s.custody_dept, '品保文管中心')
      WHEN 'IN_CUSTODY' THEN COALESCE(s.custody_dept, '-')
      WHEN 'RETURNING' THEN '品保文管中心'
      ELSE '-'
    END AS resp_dept,
    COALESCE(s.custody_dept, '-') AS apply_dept,
    s.spec,
    s.model,
    s.station,
    TIMESTAMPDIFF(HOUR, s.updated_at, NOW()) AS dwell_hours,
    s.next_inspect_at,
    s.release_cycle_days,
    NULL AS expected_return_at,
    NULL AS expected_finish_at,
    NULL AS next_maintenance_at,
    NULL AS transferred_at,
    NULL AS used_at,
    NULL AS repair_requested_at,
    s.created_at,
    s.updated_at
  FROM samples s
  WHERE s.status IN ('NEW','PRODUCED','RELEASED','IN_CUSTODY','RETURNING')

  UNION ALL

  SELECT
    f.id AS id,
    f.fixture_no AS item_no,
    f.name,
    'fixture' AS item_type,
    '治具' AS item_type_cn,
    f.status,
    -- 呆滞天数：超过 fixtures_settings.dormant_days 阈值返回天数，否则 NULL（非呆滞）
    CASE
      WHEN f.status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE','TRANSFERRED')
       AND DATEDIFF(NOW(), COALESCE(flg.last_log_at, f.created_at)) >= COALESCE((SELECT v FROM fixtures_settings WHERE k = 'dormant_days'), 60)
      THEN DATEDIFF(NOW(), COALESCE(flg.last_log_at, f.created_at))
      ELSE NULL
    END AS dormant_days,
    CASE f.status
      WHEN 'REQUESTED' THEN '待接收'
      WHEN 'ACCEPTED' THEN '制作中'
      WHEN 'VERIFY_PENDING' THEN '待验证'
      WHEN 'TRANSFERRED' THEN '可领用'
      WHEN 'IN_USE' THEN '领用中'
      WHEN 'IMPROVING' THEN '改善中'
      WHEN 'REPAIRING_ME' THEN 'ME维修中'
      WHEN 'REPAIRING_RD' THEN 'RD维修中'
      WHEN 'REPAIR_DONE' THEN '待确认维修'
      WHEN 'RETIRED' THEN '已报废'
    END AS stage_cn,
    CASE f.status
      WHEN 'REQUESTED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'ACCEPTED' THEN '研发部'
      WHEN 'VERIFY_PENDING' THEN COALESCE(f.requested_dept, '-')
      WHEN 'TRANSFERRED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IN_USE' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IMPROVING' THEN '研发部'
      WHEN 'REPAIRING_ME' THEN '生技部'
      WHEN 'REPAIRING_RD' THEN '研发部'
      WHEN 'REPAIR_DONE' THEN '生技部'
      ELSE '-'
    END AS resp_dept,
    COALESCE(f.requested_dept, '-') AS apply_dept,
    f.spec,
    f.model,
    f.station,
    CASE f.status
      WHEN 'REQUESTED' THEN TIMESTAMPDIFF(HOUR, f.created_at, NOW())
      WHEN 'IN_USE' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.used_at, f.updated_at), NOW())
      WHEN 'TRANSFERRED' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.transferred_at, f.updated_at), NOW())
      WHEN 'VERIFY_PENDING' THEN TIMESTAMPDIFF(HOUR, COALESCE(f.made_at, f.updated_at), NOW())
      ELSE TIMESTAMPDIFF(HOUR, f.updated_at, NOW())
    END AS dwell_hours,
    NULL AS next_inspect_at,
    NULL AS release_cycle_days,
    f.expected_return_at,
    f.expected_finish_at,
    f.next_maintenance_at,
    f.transferred_at,
    f.used_at,
    f.repair_requested_at,
    f.created_at,
    f.updated_at
  FROM fixtures f
  -- 子查询优化：治具最近活动时间由逐行相关子查询改为 LEFT JOIN 派生表（每治具一次聚合），避免随治具数线性执行
  LEFT JOIN (
    SELECT fixture_id, MAX(created_at) AS last_log_at
    FROM fixture_logs
    GROUP BY fixture_id
  ) flg ON flg.fixture_id = f.id
  WHERE f.status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','TRANSFERRED','IN_USE','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE')

  UNION ALL

  SELECT
    c.id AS id,
    c.order_no AS item_no,
    c.part_name AS name,
    'control' AS item_type,
    '管制' AS item_type_cn,
    c.status,
    -- 呆滞天数：以 last activity(updated_at) 计，超过统一呆滞阈值返回天数，否则 NULL（与样品/治具一致）
    CASE
      WHEN DATEDIFF(NOW(), c.updated_at) >= COALESCE((SELECT v FROM fixtures_settings WHERE k = 'dormant_days'), 60)
      THEN DATEDIFF(NOW(), c.updated_at)
      ELSE NULL
    END AS dormant_days,
    -- 阶段中文按《管制 5 阶段》映射（flow.js STAGE_OF_STATUS + STAGE_DEFS）
    CASE c.status
      WHEN 'DRAFT' THEN '申请与会签'
      WHEN 'SIGNING' THEN '申请与会签'
      WHEN 'LABELED' THEN '贴标与入仓'
      WHEN 'CONTROL_STORED' THEN '贴标与入仓'
      WHEN 'NCR_DONE' THEN 'NCR与处理会签'
      WHEN 'DISPOSAL_SIGNING' THEN 'NCR与处理会签'
      WHEN 'REWORK_OPENED' THEN '重工执行'
      WHEN 'REWORKING' THEN '重工执行'
      WHEN 'REWORK_REPORTED' THEN '重工执行'
      WHEN 'REIN_STOCK' THEN '入库出货'
      WHEN 'SHIPPED' THEN '入库出货'
      ELSE '-'
    END AS stage_cn,
    -- 负责部门 = 当前状态下一步动作的归属单位，无明确归属回退 apply_dept
    CASE c.status
      WHEN 'DRAFT' THEN COALESCE(c.apply_dept, '-')
      WHEN 'SIGNING' THEN '品保文管中心'
      WHEN 'LABELED' THEN COALESCE(c.apply_dept, '-')
      WHEN 'CONTROL_STORED' THEN '品保文管中心'
      WHEN 'NCR_DONE' THEN '品保文管中心'
      WHEN 'DISPOSAL_SIGNING' THEN '品保文管中心'
      WHEN 'REWORK_OPENED' THEN '生管'
      WHEN 'REWORKING' THEN '生产'
      WHEN 'REWORK_REPORTED' THEN '生产'
      WHEN 'REIN_STOCK' THEN '仓库'
      WHEN 'SHIPPED' THEN '仓库'
      ELSE COALESCE(c.apply_dept, '-')
    END AS resp_dept,
    COALESCE(c.apply_dept, '-') AS apply_dept,
    NULL AS spec,
    NULL AS model,
    NULL AS station,
    TIMESTAMPDIFF(HOUR, c.updated_at, NOW()) AS dwell_hours,
    NULL AS next_inspect_at,
    NULL AS release_cycle_days,
    NULL AS expected_return_at,
    NULL AS expected_finish_at,
    NULL AS next_maintenance_at,
    NULL AS transferred_at,
    NULL AS used_at,
    NULL AS repair_requested_at,
    c.created_at,
    c.updated_at
  FROM control_orders c
  -- 进行中单据：初态 DRAFT 至 SHIPPED（终态前），排除 RETIRED 作废
  WHERE c.status <> 'RETIRED'
`;

// 分页数据查询（停留时间降序，逾期项排最前）
var unifiedWorkbenchSQL = 'SELECT * FROM (' + unionSQL + ') AS wb ORDER BY dwell_hours DESC LIMIT ? OFFSET ?';

// 总数查询（用于分页器）
var unifiedWorkbenchCountSQL = 'SELECT COUNT(*) AS total FROM (' + unionSQL + ') AS wb';

// 动态拼装基础维度 WHERE（全部参数化防注入；level 为派生值由服务层 JS 计算后过滤，不走 SQL）
function buildWorkbenchSQL(f) {
  var where = [], params = [];
  f = f || {};
  if (f.type) { where.push('item_type = ?'); params.push(f.type); }
  if (f.dept) { where.push('resp_dept = ?'); params.push(f.dept); }
  if (f.apply_dept) { where.push('apply_dept = ?'); params.push(f.apply_dept); }
  if (f.keyword) {
    where.push('(item_no LIKE ? OR name LIKE ?)');
    var kw = '%' + f.keyword + '%';
    params.push(kw, kw);
  }
  if (f.stage) { where.push('stage_cn = ?'); params.push(f.stage); }
  if (f.dormant) { where.push('dormant_days IS NOT NULL'); }
  if (f.min_hours != null) { where.push('dwell_hours >= ?'); params.push(f.min_hours); }
  if (f.max_hours != null) { where.push('dwell_hours <= ?'); params.push(f.max_hours); }
  var whereSql = where.length ? ' WHERE ' + where.join(' AND ') : '';
  return { sql: 'SELECT * FROM (' + unionSQL + ') AS wb' + whereSql, params: params };
}

module.exports = { unifiedWorkbenchSQL, unifiedWorkbenchCountSQL, buildWorkbenchSQL };
