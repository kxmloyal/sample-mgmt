// subsystems/samples/db/init-sample-seqs.js — 序列表初始化 CLI（幂等，可重复执行）
// 用法：node subsystems/samples/db/init-sample-seqs.js [--dry-run]
// 注意：samples 已上线（deployed:true），实际执行属生产迁移，须先备份 samples 表；
//       默认建议先 --dry-run 查看将初始化的机型序号，再决定是否执行
require('dotenv').config(); // CLI 独立运行时加载 .env（与 seed.js/seed-samples.js 一致）
const D = require('../../../db');
const { initSampleSeqsSql, dryRunSeqsSql } = require('./init-sample-seqs-sql');

const DRY = process.argv.includes('--dry-run');

async function main() {
  const pool = D.pool();
  if (DRY) {
    const rows = await pool.execute(dryRunSeqsSql());
    console.log('DRY-RUN：将初始化以下机型序号（共 ' + rows[0].length + ' 个）：');
    for (const r of rows[0]) console.log('  ' + r.prefix + ' → ' + r.cur_seq);
  } else {
    await pool.execute(initSampleSeqsSql());
    const n = (await pool.execute('SELECT COUNT(*) AS c FROM sample_seqs'))[0][0].c;
    console.log('sample_seqs 初始化完成，共 ' + n + ' 个机型序列');
  }
  await pool.end();
  process.exit(0);
}

main().catch(function (e) { console.error('初始化失败: ' + e.message); process.exit(1); });
