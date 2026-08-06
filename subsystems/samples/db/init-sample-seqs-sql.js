// subsystems/samples/db/init-sample-seqs-sql.js — 序列表初始化 SQL 纯函数（便于单测，不执行 DB）
// 迁移目标：把存量 samples 各机型最大流水号搬入 sample_seqs，新号从存量续号
// 幂等：ON DUPLICATE KEY UPDATE + GREATEST 防覆盖（MariaDB 兼容，VALUES() 可用）
// 机型段 = SUBSTRING(sample_no, 3, 6)（格式 提供处(1)-机型(6)-组别(1)-流水号(3)-版次(2)）

// 存量格式过滤：仅合法 13 位编号参与统计
const LEGACY_PATTERN = '^[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-[0-9]{3}-[0-9]{2}$';

function initSampleSeqsSql() {
  return 'INSERT INTO sample_seqs (prefix, cur_seq) ' +
    'SELECT SUBSTRING(sample_no, 3, 6), MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)) ' +
    'FROM samples WHERE sample_no REGEXP \'' + LEGACY_PATTERN + '\' ' +
    'GROUP BY SUBSTRING(sample_no, 3, 6) ' +
    'ON DUPLICATE KEY UPDATE cur_seq = GREATEST(cur_seq, VALUES(cur_seq))';
}

function dryRunSeqsSql() {
  return 'SELECT SUBSTRING(sample_no, 3, 6) AS prefix, ' +
    'MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED)) AS cur_seq ' +
    'FROM samples WHERE sample_no REGEXP \'' + LEGACY_PATTERN + '\' ' +
    'GROUP BY SUBSTRING(sample_no, 3, 6)';
}

module.exports = { initSampleSeqsSql, dryRunSeqsSql, LEGACY_PATTERN };
