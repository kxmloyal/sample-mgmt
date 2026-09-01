// seed-control.js — 管制流程管理种子兼容入口
// 实际数据源：subsystems/control/seed/seed.js（deployed:false 才可运行）
require('dotenv').config();
const D = require('./db');
const seedControl = require('./subsystems/control/seed/seed');

async function main() {
  await D.ready;
  // seed.js 未纳入附件表：重建订单会复用自增 id，先清空 control_files 避免残留附件挂上新单
  await D.pool().execute('DELETE FROM control_files');
  await seedControl(D.pool());
  process.exit(0);
}
main().catch(function (e) { console.error(e); process.exit(1); });
