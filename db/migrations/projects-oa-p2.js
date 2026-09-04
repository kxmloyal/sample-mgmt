// db/migrations/projects-oa-p2.js — OA 能力移植二期批次1：变更单 + 项目机型引用
// 纯增量迁移：仅 CREATE TABLE IF NOT EXISTS，不改任何现有表；幂等可重复执行
// 回滚：DROP TABLE IF EXISTS project_changes/project_model_refs
async function migrateProjectOaP2(pool) {
  const tables = [
    // 变更单（审批人固定 ADMIN/PM/项目 owner；TIME 类批准后仅记录不自动顺延——用户确认保守方案）
    `CREATE TABLE IF NOT EXISTS project_changes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL COMMENT '所属项目 → projects.id',
      change_no VARCHAR(32) COMMENT '变更编号 PC+yyyyMMdd+4位序列',
      change_type VARCHAR(20) NOT NULL COMMENT 'SCOPE范围/TIME时间/RESOURCE资源/BUDGET预算',
      description TEXT NOT NULL COMMENT '变更内容描述',
      before_value TEXT COMMENT '变更前',
      after_value TEXT COMMENT '变更后',
      reason TEXT COMMENT '变更原因',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING待审批/APPROVED已批准/REJECTED已驳回',
      applicant_id INT COMMENT '申请人 → users.id',
      approver_id INT COMMENT '审批人 → users.id',
      approved_at TIMESTAMP NULL DEFAULT NULL,
      version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_chg_project (project_id),
      KEY idx_chg_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目变更单(OA移植二期)'`,
    // 项目引用机型（只读关联 sample_models，不写 fixtures 子系统任何表）
    `CREATE TABLE IF NOT EXISTS project_model_refs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL COMMENT '所属项目 → projects.id',
      model_id INT NOT NULL COMMENT '引用机型 → sample_models.id（只读引用）',
      role VARCHAR(20) NOT NULL DEFAULT 'TARGET' COMMENT 'TARGET试产对象/VERIFY验证对象/REF参考机型',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pm (project_id, model_id),
      KEY idx_pm_project (project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目引用机型(二期)'`,
    // 变更编号序列辅助表（MySQL LAST_INSERT_ID 技巧实现原子自增；按 PC+日期 前缀按日轮转）
    `CREATE TABLE IF NOT EXISTS project_seq (
      seq_key VARCHAR(40) PRIMARY KEY,
      seq_val INT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务编号序列(变更单PC等)'`
  ];
  for (const sql of tables) {
    try { await pool.execute(sql); }
    catch (e) { throw e; }
  }
}

module.exports = { migrateProjectOaP2 };
