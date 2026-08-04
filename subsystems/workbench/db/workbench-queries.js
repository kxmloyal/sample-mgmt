// subsystems/workbench/db/workbench-queries.js
// 统一工作台查询：合并样品 + 治具活跃数据，排除 RETIRED
// 外层排序（dwell_hours DESC）后用 LIMIT/OFFSET 分页，避免服务端全量传输

var unionSQL = `
  SELECT
    s.id AS id,
    s.sample_no AS item_no,
    s.name,
    'sample' AS item_type,
    '样品' AS item_type_cn,
    s.status,
    CASE s.status
      WHEN 'NEW' THEN '制样中'
      WHEN 'PRODUCED' THEN '待发行'
      WHEN 'RELEASED' THEN '保管中'
      WHEN 'IN_CUSTODY' THEN '保管中'
      WHEN 'RETURNING' THEN '退回审核中'
      WHEN 'RETIRED' THEN '已废弃'
    END AS stage_cn,
    CASE s.status
      WHEN 'NEW' THEN '研发中心'
      WHEN 'PRODUCED' THEN '研发中心'
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
  WHERE s.status NOT IN ('RETIRED')

  UNION ALL

  SELECT
    f.id AS id,
    f.fixture_no AS item_no,
    f.name,
    'fixture' AS item_type,
    '治具' AS item_type_cn,
    f.status,
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
      WHEN 'ACCEPTED' THEN '研发中心'
      WHEN 'VERIFY_PENDING' THEN COALESCE(f.requested_dept, '-')
      WHEN 'TRANSFERRED' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IN_USE' THEN COALESCE(f.requested_dept, '-')
      WHEN 'IMPROVING' THEN '研发中心'
      WHEN 'REPAIRING_ME' THEN '生技部'
      WHEN 'REPAIRING_RD' THEN '研发中心'
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
  WHERE f.status NOT IN ('RETIRED')
`;

// 分页数据查询（停留时间降序，逾期项排最前）
var unifiedWorkbenchSQL = 'SELECT * FROM (' + unionSQL + ') AS wb ORDER BY dwell_hours DESC LIMIT ? OFFSET ?';

// 总数查询（用于分页器）
var unifiedWorkbenchCountSQL = 'SELECT COUNT(*) AS total FROM (' + unionSQL + ') AS wb';

module.exports = { unifiedWorkbenchSQL, unifiedWorkbenchCountSQL };
