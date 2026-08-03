-- subsystems/workbench/db/schema.sql
-- 全局工作台配置表：积压阈值（warn/bad），ADMIN 可修改，全局生效
-- db.js 启动时自动扫描执行（幂等：CREATE TABLE IF NOT EXISTS + INSERT IGNORE）

CREATE TABLE IF NOT EXISTS workbench_settings (
  k VARCHAR(32) PRIMARY KEY,
  v INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 默认阈值（小时）：warn=3天=72h, bad=7天=168h；用户已修改则 IGNORE 保留
INSERT IGNORE INTO workbench_settings (k, v) VALUES ('warn_hours', 72), ('bad_hours', 168);
