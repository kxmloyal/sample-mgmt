// seed-fixture.js — 治具种子兼容入口
// 实际数据源：subsystems/fixtures/seed/seed.js（2026-08-05 起转发，消除根目录重复实现）
require('dotenv').config();
const D = require('./db');
const seedFixture = require('./subsystems/fixtures/seed/seed');

async function main() {
  await D.ready;
  await seedFixture(D.pool());
  process.exit(0);
}
main().catch(function (e) { console.error(e); process.exit(1); });
