// db/migrations/control.js — 管制流程子系统迁移（B3-T2 拆分，行为零变化）
async function migrateControlNcrDetail(pool) {
  // NCR 详细内容：主表补喷码日期/重工标准；报工子表补处理结果（2026-08-26，spec §4，幂等）
  var orderAdds = [
    'ADD COLUMN spray_date VARCHAR(24)',
    'ADD COLUMN rework_guide TEXT',
    'ADD COLUMN rework_other TEXT'
  ];
  for (var i = 0; i < orderAdds.length; i++) {
    try { await pool.execute('ALTER TABLE control_orders ' + orderAdds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
  var reworkAdds = [
    'ADD COLUMN batch_no VARCHAR(50)',
    'ADD COLUMN pack_record VARCHAR(100)',
    'ADD COLUMN confirm_by VARCHAR(50)',
    'ADD COLUMN qty_consistent TINYINT(1) DEFAULT 0'
  ];
  for (var n = 0; n < reworkAdds.length; n++) {
    try { await pool.execute('ALTER TABLE control_rework_logs ' + reworkAdds[n]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

async function migrateControlNcrForm(pool) {
  // NCR 电子表单化：主表补客户/不良原因分析5分项/包装SOP编号（2026-08-27，spec §3，幂等）
  var adds = [
    'ADD COLUMN customer VARCHAR(100)',
    'ADD COLUMN bad_appearance TEXT',
    'ADD COLUMN bad_function TEXT',
    'ADD COLUMN bad_size TEXT',
    'ADD COLUMN bad_change TEXT',
    'ADD COLUMN bad_other TEXT',
    'ADD COLUMN pack_sop VARCHAR(100)'
  ];
  for (var i = 0; i < adds.length; i++) {
    try { await pool.execute('ALTER TABLE control_orders ' + adds[i]); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}

module.exports = { migrateControlNcrDetail, migrateControlNcrForm };
