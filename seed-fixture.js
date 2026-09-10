// seed-fixture.js — 治具种子兼容入口
// 实际数据源：subsystems/fixtures/seed/seed.js（2026-08-05 起转发，消除根目录重复实现）
require('dotenv').config();
const D = require('./db');
const seedFixture = require('./subsystems/fixtures/seed/seed');

async function main() {
  // 上线护栏（AGENTS.md §20）：治具子系统已上线（deployed:true）时拒绝注入测试数据。
  // 拦截的权威实现在 seed 模块内部的 assertSeedAllowed()（保证任何 require 路径都绕不过）；
  // 此处提前调用仅为「不建立数据库连接 + 错误信息更醒目」，与 seed-samples.js 的前置校验保持一致。
  try {
    seedFixture.assertSeedAllowed();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
  await D.ready;
  await seedFixture(D.pool());
  process.exit(0);
}
main().catch(function (e) { console.error(e); process.exit(1); });
