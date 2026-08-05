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
  KEY idx_project (project_id), KEY idx_status (status), KEY idx_assignee (assignee_id)
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
