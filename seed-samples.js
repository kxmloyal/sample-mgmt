// seed-samples.js — 样品种子兼容入口
// 实际数据源：subsystems/samples/seed/seed.js（2026-08-05 起转发，消除根目录重复实现）
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const D = require('./db');
const seedSamples = require('./subsystems/samples/seed/seed');

async function main() {
  // 上线护栏（AGENTS.md §20）：样品子系统已上线（deployed:true）时拒绝注入测试数据
  var manifestPath = path.join(__dirname, 'subsystems', 'samples', 'manifest.json');
  var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  if (manifest.deployed === true) {
    console.error('[护栏] 样品管理（samples）已正式上线（deployed:true），按 AGENTS.md §20 禁止注入测试数据，seed 中止。');
    process.exit(1);
  }
  await D.ready;
  await seedSamples(D.pool());
  process.exit(0);
}
main().catch(function (e) { console.error(e); process.exit(1); });
