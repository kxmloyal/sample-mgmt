-- subsystems/control/db/schema.sql
-- 管制流程管理子系统数据库表定义（幂等：CREATE TABLE IF NOT EXISTS）

-- 主表：管制流程单（唯一事实来源，瘦身：只存汇总/核心字段，明细拆各子表）
CREATE TABLE IF NOT EXISTS control_orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_no VARCHAR(20) UNIQUE NOT NULL,        -- 单据流水号
  part_no VARCHAR(50),                         -- 料号
  part_name VARCHAR(200),                      -- 品名
  sales_no VARCHAR(50),                        -- 销货单号（不良品委托检验单 GYS-Q2-008_01）
  model VARCHAR(100),                          -- 机型/规格
  qty INT,                                     -- 申请/不良数量
  bad_type VARCHAR(50),                        -- 不良类型
  reason TEXT,                                 -- 管制/不良原因
  applicant_id INT,
  applicant_name VARCHAR(50),
  apply_dept VARCHAR(50),                      -- 申请部门（CUSTODY/ME/RD/QA 下具体单位）
  apply_at VARCHAR(24),                        -- 申请时间 ISO
  label_no VARCHAR(50),                        -- 管制标签号（②③ 记录）
  storage_location VARCHAR(100),               -- 管制仓储位（④ 记录）
  stored_at VARCHAR(24),
  ncr_no VARCHAR(50),                          -- 不良品委托单号（⑤ 摘要，明细见 control_ncr_logs）
  disposal_opinion TEXT,                       -- 品保+研发会签处理方式结论（闸口②）
  rework_no VARCHAR(50),                       -- 重工工单号（⑦）
  rework_sop TEXT,                             -- 重工 SOP（⑧）
  spray_date VARCHAR(24),                      -- 喷码日期（基本信息）
  rework_guide TEXT,                           -- 现场指导（重工/全检标准之一）
  rework_other TEXT,                           -- 其他标准文件（重工/全检标准之一）
  customer VARCHAR(100),                       -- 客户（不良品委托检验单·基本信息）
  bad_appearance TEXT,                         -- 不良原因分析·外观
  bad_function TEXT,                           -- 不良原因分析·功能
  bad_size TEXT,                               -- 不良原因分析·尺寸
  bad_change TEXT,                             -- 不良原因分析·设变
  bad_other TEXT,                              -- 不良原因分析·其他
  pack_sop VARCHAR(100),                       -- 包装SOP编号（不良品委托检验单·解决方案）
  good_qty INT,                                -- 良品数（⑨ 汇总）
  ng_qty INT,                                  -- 不良品数（⑨ 汇总）
  scrap_qty INT,                               -- 报废数（⑨ 汇总）
  remain_qty INT,                              -- 结余数（自动算：qty-good-ng-scrap）
  scrap_note TEXT,                             -- 物料报废申请说明（⑨）
  in_stock_at VARCHAR(24),                     -- 入库时间（⑩）
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT', -- 状态机状态（阶段）
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_control_status (status),
  INDEX idx_control_order_no (order_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 会签子表：2 个关键闸口（APPLY_SIGN 申请管制会签 / DISPOSAL_SIGN 处理方式会签）
CREATE TABLE IF NOT EXISTS control_signs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  node_key VARCHAR(30) NOT NULL,               -- APPLY_SIGN / DISPOSAL_SIGN
  node_name VARCHAR(50),
  seq INT NOT NULL,                            -- 会签顺序
  role VARCHAR(20),
  sign_dept VARCHAR(50),                       -- 会签单位（部门）
  signer_id INT,
  signer_name VARCHAR(50),
  decision VARCHAR(10) DEFAULT '',             -- AGREE/REJECT/空(待签)
  comment TEXT,
  signed_at VARCHAR(24),
  UNIQUE KEY uk_sign (order_id, node_key, seq),
  INDEX idx_sign_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 不良品委托单子表：明细（⑥，可多次开单）
CREATE TABLE IF NOT EXISTS control_ncr_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  ncr_no VARCHAR(50),                          -- 委托单号
  inspect_dept VARCHAR(50),                    -- 检验部门
  handle_dept VARCHAR(50),                     -- 处理部门
  form_template VARCHAR(50),                   -- 表单版本 GYS-Q2-008_01(REV_1)
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ncr_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 报工子表：生产报工记录（⑨，可多次报工）
CREATE TABLE IF NOT EXISTS control_rework_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  work_date VARCHAR(24),
  good_qty INT,                                -- 良品数（本次）
  ng_qty INT,                                  -- 不良品数（本次）
  scrap_qty INT,                               -- 报废数（本次）
  scrap_reason TEXT,
  operator_id INT,
  operator_name VARCHAR(50),
  batch_no VARCHAR(50),                        -- 批次号（处理结果）
  pack_record VARCHAR(100),                    -- 包装称重记录（处理结果）
  confirm_by VARCHAR(50),                      -- 确认人（处理结果）
  qty_consistent TINYINT(1) DEFAULT 0,         -- 确认数量是否一致（1=一致，0=不一致）
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rework_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 留痕表：操作日志时间轴
CREATE TABLE IF NOT EXISTS control_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  action VARCHAR(30) NOT NULL,                 -- SUBMIT/SIGN_OK/STORE/CREATE_NCR/DISPOSAL_OK/OPEN_REWORK/START/REPORT/IN_STOCK/SHIP/VOID/EDIT...
  role VARCHAR(20),
  user_id INT,
  dept VARCHAR(50),
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 编号序列表：order_no 取号（前缀 CTL + 年月），原子自增
-- 取号：INSERT ... ON DUPLICATE KEY UPDATE cur_seq=cur_seq+1，随后 SELECT cur_seq
CREATE TABLE IF NOT EXISTS control_seqs (
  prefix VARCHAR(16) PRIMARY KEY,
  cur_seq INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 系统配置表：键值对（仿 workbench workbench_settings），当前用于「超期滞留阈值」
-- overdue_hours：超期滞留判定阈值（小时），admin 可在界面调整，缺省回退 48
CREATE TABLE IF NOT EXISTS control_settings (
  k VARCHAR(32) PRIMARY KEY,
  v INT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO control_settings (k, v) VALUES ('overdue_hours', 48);
