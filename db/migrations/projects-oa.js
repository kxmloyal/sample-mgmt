// db/migrations/projects-oa.js — OA 能力移植（方案A一期）：里程碑/风险/项目扩展表
// 纯增量迁移：仅 CREATE TABLE IF NOT EXISTS，不改任何现有表；幂等可重复执行
// 回滚：DROP TABLE IF EXISTS project_milestones/project_risks/project_extras（见 docs 回滚方案）
async function migrateProjectOaExtras(pool) {
  const tables = [
    `CREATE TABLE IF NOT EXISTS project_milestones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL COMMENT '所属项目 → projects.id',
      name VARCHAR(200) NOT NULL COMMENT '里程碑名称',
      description TEXT,
      target_date DATE COMMENT '目标日期',
      actual_date DATE COMMENT '实际达成日期',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING待达成/ACHIEVED已达成',
      is_delayed TINYINT NOT NULL DEFAULT 0 COMMENT '是否延期达成(达成日晚于目标日)',
      sort INT NOT NULL DEFAULT 0,
      version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_ms_project (project_id),
      KEY idx_ms_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目里程碑(OA移植)'`,
    `CREATE TABLE IF NOT EXISTS project_risks (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL COMMENT '所属项目 → projects.id',
      risk_name VARCHAR(200) NOT NULL COMMENT '风险名称',
      description TEXT,
      risk_type VARCHAR(32) COMMENT 'schedule/quality/resource/tech/other',
      severity VARCHAR(10) NOT NULL DEFAULT 'M' COMMENT '严重度 H/M/L',
      probability VARCHAR(10) NOT NULL DEFAULT 'M' COMMENT '概率 H/M/L',
      impact VARCHAR(255) COMMENT '影响说明',
      mitigation TEXT COMMENT '缓解措施',
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN开放/RESOLVED已解决',
      identified_by INT COMMENT '识别人 → users.id',
      resolved_by INT COMMENT '解决人 → users.id',
      resolved_at TIMESTAMP NULL DEFAULT NULL,
      version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_risk_project (project_id),
      KEY idx_risk_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目风险(OA移植)'`,
    // 预算/成本用 1:1 扩展表而非 ALTER 在线 projects 表（零锁表、零影响；读取 LEFT JOIN）
    `CREATE TABLE IF NOT EXISTS project_extras (
      project_id INT PRIMARY KEY COMMENT '→ projects.id',
      budget DECIMAL(18,2) COMMENT '预算',
      actual_cost DECIMAL(18,2) COMMENT '实际成本',
      project_type VARCHAR(32) COMMENT '项目类型',
      priority VARCHAR(10) NOT NULL DEFAULT 'M' COMMENT '优先级 H/M/L',
      updated_by INT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目扩展信息-预算/成本(OA移植)'`
  ];
  for (const sql of tables) {
    try { await pool.execute(sql); }
    catch (e) { throw e; }
  }
}

module.exports = { migrateProjectOaExtras };
