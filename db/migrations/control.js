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


// C1 乐观锁：control_orders.version 列（2026-09-03，幂等；带死锁重试——参照治具修复 d8ee80c 教训）
async function migrateControlOptimisticLock(pool) {
  for (var i = 0; i < 3; i++) {
    try { await pool.execute('ALTER TABLE control_orders ADD COLUMN version INT NOT NULL DEFAULT 1'); return; }
    catch (e) {
      if (e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT') { await new Promise(r => setTimeout(r, 200 * (i + 1))); continue; }
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      return; // 列已存在，幂等通过
    }
  }
}


// C3 会签超时：control_signs.created_at 列（2026-09-03，幂等，死锁重试）
async function migrateControlSignsCreatedAt(pool) {
  for (var i = 0; i < 3; i++) {
    try { await pool.execute('ALTER TABLE control_signs ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'); return; }
    catch (e) {
      if (e.code === 'ER_LOCK_DEADLOCK' || e.code === 'ER_LOCK_WAIT_TIMEOUT') { await new Promise(r => setTimeout(r, 200 * (i + 1))); continue; }
      if (e.code !== 'ER_DUP_FIELDNAME') throw e;
      return;
    }
  }
}

module.exports = { migrateControlNcrDetail, migrateControlNcrForm, migrateControlOptimisticLock, migrateControlSignsCreatedAt };
