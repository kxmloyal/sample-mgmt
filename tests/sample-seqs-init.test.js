// tests/sample-seqs-init.test.js — 序列表初始化脚本逻辑单测
// 提取 initSampleSeqsSql / buildDryRunSql 为纯函数便于单测（不执行 DB）
const { initSampleSeqsSql, dryRunSeqsSql } = require('../subsystems/samples/db/init-sample-seqs-sql');

describe('init-sample-seqs SQL', () => {
  it('初始化 SQL 幂等：含 ON DUPLICATE KEY UPDATE + GREATEST 防覆盖', () => {
    const sql = initSampleSeqsSql();
    expect(sql).toContain('INSERT INTO sample_seqs');
    expect(sql).toContain('ON DUPLICATE KEY UPDATE cur_seq = GREATEST(cur_seq, VALUES(cur_seq))');
    expect(sql).toContain('GROUP BY SUBSTRING(sample_no, 3, 6)');
  });
  it('机型段提取：SUBSTRING(sample_no,3,6) 且含格式过滤正则', () => {
    const sql = initSampleSeqsSql();
    expect(sql).toContain('SUBSTRING(sample_no, 3, 6)');
    expect(sql).toContain('REGEXP');
  });
  it('dry-run 查询按机型分组取 MAX 流水号', () => {
    const sql = dryRunSeqsSql();
    expect(sql).toContain('MAX(CAST(SUBSTRING(sample_no, 12, 3) AS UNSIGNED))');
    expect(sql).toContain('GROUP BY SUBSTRING(sample_no, 3, 6)');
  });
});
