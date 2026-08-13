-- subsystems/fixtures/db/schema.sql
-- 治具子系统数据库表定义（幂等：CREATE TABLE IF NOT EXISTS）

CREATE TABLE IF NOT EXISTS fixtures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_no VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(200),
  spec VARCHAR(200),
  model VARCHAR(100),
  station VARCHAR(50),
  category VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'REQUESTED',
  requested_by INT,
  requested_dept VARCHAR(100),
  request_note TEXT,
  request_image VARCHAR(500),
  made_by INT,
  made_at DATETIME,
  made_note TEXT,
  made_image VARCHAR(500),
  verified_rd INT,
  verified_rd_at DATETIME,
  verified_me INT,
  verified_me_at DATETIME,
  transferred_at DATETIME,
  verify_note TEXT,
  used_by INT,
  used_at DATETIME,
  use_location VARCHAR(200),
  expected_return_days INT,
  expected_return_at DATETIME,
  use_note TEXT,
  repair_type VARCHAR(20),
  repair_requested_by INT,
  repair_requested_at DATETIME,
  repair_note TEXT,
  repaired_by INT,
  repaired_at DATETIME,
  repair_done_image VARCHAR(500),
  repair_confirmed_by INT,
  repair_confirmed_at DATETIME,
  retired_by INT,
  retired_at DATETIME,
  retired_reason TEXT,
  expected_finish_at DATETIME,
  improve_note TEXT,
  improvement_count INT DEFAULT 0,
  improved_by INT,
  improved_at DATETIME,
  storage_location VARCHAR(200),
  maintenance_cycle_days INT,
  last_maintenance_at DATETIME,
  next_maintenance_at DATETIME,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fixtures_status (status),
  INDEX idx_fixtures_requested_by (requested_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fixture_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_id INT NOT NULL,
  action VARCHAR(40) NOT NULL,
  role VARCHAR(20),
  user_id INT,
  dept VARCHAR(50),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fixture_logs_fixture (fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fixture_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_id INT NOT NULL,
  category VARCHAR(40) NOT NULL,
  original_name VARCHAR(300),
  filename VARCHAR(300) NOT NULL,
  size INT,
  mime_type VARCHAR(100),
  uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fixture_files_fixture (fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 治具子系统配置表（呆滞阈值等），幂等 + 默认值
CREATE TABLE IF NOT EXISTS fixtures_settings (
  k VARCHAR(50) PRIMARY KEY,
  v VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO fixtures_settings (k, v) VALUES ('dormant_days', '60');
