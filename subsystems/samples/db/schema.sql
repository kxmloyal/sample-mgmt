-- subsystems/samples/db/schema.sql
-- 样品子系统数据库表定义（幂等：CREATE TABLE IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_no VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200),
  spec VARCHAR(200),
  model VARCHAR(100),
  station VARCHAR(50),
  image VARCHAR(500),
  produced_image VARCHAR(500),
  inspect_image VARCHAR(500),
  qr_token VARCHAR(64) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'NEW',
  created_by INT,
  produced_at VARCHAR(24),
  released_at VARCHAR(24),
  release_cycle_days INT,
  next_inspect_at VARCHAR(24),
  custody_dept VARCHAR(50),
  storage_location VARCHAR(100),
  notes TEXT,
  sample_type VARCHAR(20),
  limit_item VARCHAR(50),
  source_type VARCHAR(10),
  valid_until VARCHAR(24),
  card_version VARCHAR(10),
  test_standard TEXT,
  test_data TEXT,
  signed_by_rnd VARCHAR(50), /* @deprecated v2: 待物理删除，已全量迁移到 signed_by_rd */
  signed_by_rd VARCHAR(50),
  signed_by_qa VARCHAR(50),
  retired_reason TEXT,
  replaced_by VARCHAR(20),
  replaces VARCHAR(20),
  retire_assigned_rd VARCHAR(10),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_samples_status (status),
  INDEX idx_samples_retire_rd (retire_assigned_rd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scan_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_id INT NOT NULL,
  action VARCHAR(30) NOT NULL,
  role VARCHAR(20),
  user_id INT,
  dept VARCHAR(50),
  location VARCHAR(100),
  note TEXT,
  target_type VARCHAR(10) DEFAULT 'sample',
  target_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 机型主数据（2026-08-05）：新建样品规格/型号下拉数据源，仅 RD/ADMIN 维护
CREATE TABLE IF NOT EXISTS sample_models (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  full_name VARCHAR(200) NOT NULL,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_model_code (code),
  UNIQUE KEY uk_model_full_name (full_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
