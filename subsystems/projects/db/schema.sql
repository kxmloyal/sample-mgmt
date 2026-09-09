CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '项目名称（必填）',
  description TEXT COMMENT '项目描述',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE进行中/DONE已完成',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目 → projects.id',
  title VARCHAR(200) NOT NULL COMMENT '问题/任务名称（必填）',
  description TEXT COMMENT '详细描述',
  category VARCHAR(20) NOT NULL DEFAULT 'other' COMMENT '设备/质量/流程/安全/其他',
  priority VARCHAR(10) NOT NULL DEFAULT 'M' COMMENT '高H/中M/低L',
  assignee_id INT COMMENT '责任人 → users.id',
  start_date DATE COMMENT '计划开始日期（方案三B，甘特真实跨度；可空）',
  planned_date DATE COMMENT '计划完成日期',
  actual_date DATE COMMENT '实际完成日期',
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' COMMENT '状态机状态',
  progress INT NOT NULL DEFAULT 0 COMMENT '进度 0~100',
  solution TEXT COMMENT '改善措施/解决方案',
  notes TEXT COMMENT '备注',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_project (project_id), KEY idx_status (status), KEY idx_assignee (assignee_id),
  KEY idx_status_planned (status, planned_date), KEY idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_subtasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  assignee_id INT,
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' COMMENT 'NOT_STARTED/IN_PROGRESS/DONE',
  planned_date DATE,
  done_at TIMESTAMP NULL,
  version INT NOT NULL DEFAULT 0,
  created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  content TEXT NOT NULL,
  operator_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_deps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL COMMENT '被阻塞任务',
  depends_on_id INT NOT NULL COMMENT '前置任务',
  created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dep (task_id, depends_on_id),
  KEY idx_depends (depends_on_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  is_owner TINYINT NOT NULL DEFAULT 0 COMMENT '1=项目负责人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member (project_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL, file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL, size INT, uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL, ref_type VARCHAR(10) NOT NULL COMMENT 'sample/fixture',
  ref_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_link (task_id, ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(10) NOT NULL COMMENT 'project/task/subtask/comment/member/config',
  entity_id INT NOT NULL,
  action VARCHAR(30) NOT NULL COMMENT 'CREATE/UPDATE/DELETE/STATUS_CHANGE/CONFIG/LINK/COMMENT',
  detail TEXT COMMENT '变更摘要（JSON）',
  operator_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_workflow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  flow_key VARCHAR(30) NOT NULL DEFAULT 'task',
  cfg_key VARCHAR(50) NOT NULL COMMENT 'states/transitions/initial',
  cfg_value TEXT NOT NULL COMMENT 'JSON 配置',
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_flow_key (flow_key, cfg_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ===== OA 能力移植（方案A一期/二期；与 db/migrations/projects-oa*.js 同源，schema 仅用于全新环境初始化） =====

CREATE TABLE IF NOT EXISTS project_milestones (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目里程碑(OA移植)';

CREATE TABLE IF NOT EXISTS project_risks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目风险(OA移植)';

-- 预算/成本用 1:1 扩展表而非 ALTER 在线 projects 表（零锁表、零影响；读取 LEFT JOIN）
CREATE TABLE IF NOT EXISTS project_extras (
  project_id INT PRIMARY KEY COMMENT '→ projects.id',
  budget DECIMAL(18,2) COMMENT '预算',
  actual_cost DECIMAL(18,2) COMMENT '实际成本',
  project_type VARCHAR(32) COMMENT '项目类型',
  priority VARCHAR(10) NOT NULL DEFAULT 'M' COMMENT '优先级 H/M/L',
  expected_benefit TEXT NULL COMMENT '预期效益（年节约/产能提升等，2026-09-08 设备导入）',
  benefit_note TEXT NULL COMMENT '实际效益备注（验收后填写，2026-09-08 设备导入）',
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目扩展信息-预算/成本/效益(OA移植+设备导入)';

CREATE TABLE IF NOT EXISTS project_changes (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目变更单(OA移植二期)';

-- 项目引用机型（只读关联 sample_models，不写 fixtures 子系统任何表）
CREATE TABLE IF NOT EXISTS project_model_refs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目 → projects.id',
  model_id INT NOT NULL COMMENT '引用机型 → sample_models.id（只读引用）',
  role VARCHAR(20) NOT NULL DEFAULT 'TARGET' COMMENT 'TARGET试产对象/VERIFY验证对象/REF参考机型',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pm (project_id, model_id),
  KEY idx_pm_project (project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目引用机型(二期)';

-- 业务编号序列（变更单 PC+日期前缀按日轮转；MySQL LAST_INSERT_ID 技巧原子自增）
CREATE TABLE IF NOT EXISTS project_seq (
  seq_key VARCHAR(40) PRIMARY KEY,
  seq_val INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='业务编号序列(变更单PC等)';

-- 项目模板（任务/里程碑清单 JSON 化）
CREATE TABLE IF NOT EXISTS project_templates (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目模板(二期批次2)';

-- 项目关系（图谱数据源；custom_type 在 relation_type=CUSTOM 时必填）
CREATE TABLE IF NOT EXISTS project_relations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  from_project_id INT NOT NULL COMMENT '源项目 → projects.id',
  to_project_id INT NOT NULL COMMENT '目标项目 → projects.id',
  relation_type VARCHAR(20) NOT NULL COMMENT 'DEPENDS_ON/DERIVED_FROM/SHARES_MODEL/REPLACES/RELATES/SAME_CUSTOMER/CUSTOM',
  custom_type VARCHAR(50) NOT NULL DEFAULT '' COMMENT '自定义关系名（CUSTOM 时使用；NOT NULL 空串保证唯一索引对预置类型生效）',
  note VARCHAR(200) DEFAULT NULL COMMENT '关系说明',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_rel (from_project_id, to_project_id, relation_type, custom_type),
  KEY idx_rel_from (from_project_id),
  KEY idx_rel_to (to_project_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目关系图谱(二期批次3)';

CREATE TABLE IF NOT EXISTS project_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL COMMENT '接收人',
  type VARCHAR(30) NOT NULL COMMENT 'ASSIGN/STATUS/OVERDUE/CHANGE_APPROVAL/MENTION',
  title VARCHAR(200) NOT NULL,
  body VARCHAR(500) DEFAULT '',
  link VARCHAR(300) DEFAULT '' COMMENT 'hash 深链，如 #/tasks/123',
  ref_type VARCHAR(20) DEFAULT '' COMMENT 'task/project/change',
  ref_id INT DEFAULT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pn_user_unread (user_id, is_read),
  KEY idx_pn_user_time (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='项目子系统站内通知';
