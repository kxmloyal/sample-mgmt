// db/migrations/projects-oa-p2b.js — OA 移植二期批次2/3：项目模板 + 项目关系
// 纯增量迁移：仅 CREATE TABLE IF NOT EXISTS，不改任何现有表；幂等可重复执行
// 回滚：DROP TABLE IF EXISTS project_templates/project_relations
async function migrateProjectOaP2b(pool) {
  const tables = [
    // 项目模板（任务/里程碑清单 JSON 化；instance_count 记录实例化次数，只增不改业务语义）
    `CREATE TABLE IF NOT EXISTS project_templates (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL COMMENT '模板名',
      description TEXT COMMENT '模板说明',
      tasks_json JSON COMMENT '任务清单 [{title,category,priority,offset_days,planned_days}]',
      milestones_json JSON COMMENT '里程碑清单 [{name,target_offset_days}]',
      is_active TINYINT NOT NULL DEFAULT 1 COMMENT '1启用/0停用',
      instance_count INT NOT NULL DEFAULT 0 COMMENT '累计实例化次数',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目模板(二期批次2)'`,
    // 项目关系（批次3图谱数据源；custom_type 在 relation_type=CUSTOM 时必填）
    `CREATE TABLE IF NOT EXISTS project_relations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      from_project_id INT NOT NULL COMMENT '源项目 → projects.id',
      to_project_id INT NOT NULL COMMENT '目标项目 → projects.id',
      relation_type VARCHAR(20) NOT NULL COMMENT 'DEPENDS_ON/DERIVED_FROM/SHARES_MODEL/REPLACES/RELATES/SAME_CUSTOMER/CUSTOM',
      custom_type VARCHAR(50) NOT NULL DEFAULT '' COMMENT '自定义关系名（CUSTOM 时使用；NOT NULL 空串保证唯一索引对预置类型生效——MySQL 唯一索引不约束 NULL）',
      note VARCHAR(200) DEFAULT NULL COMMENT '关系说明',
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_rel (from_project_id, to_project_id, relation_type, custom_type),
      KEY idx_rel_from (from_project_id),
      KEY idx_rel_to (to_project_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目关系图谱(二期批次3)'`
  ];
  for (const sql of tables) {
    try { await pool.execute(sql); }
    catch (e) { throw e; }
  }
}

module.exports = { migrateProjectOaP2b };
