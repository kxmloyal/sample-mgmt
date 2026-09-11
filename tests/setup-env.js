// tests/setup-env.js — 测试环境隔离（P1 修复，2026-09-11；AGENTS.md §20.2 测试策略 / CONTRIBUTING.md）
//
// 背景（修复前实测）：jest.config.js 既无 setupFiles 也无 globalSetup，而 .env 是
//   DB_NAME=sample_mgmt（生产库）；tests/helpers/setup.js 的 getApp() 会 require server.js →
//   db.js init() → runMigrations(pool)，于是 `npm test` / `npx jest` 会对**生产库**执行
//   schema.sql 与全部迁移（含每次启动即 DELETE project_workflow 的 migrateProjectPlm）。
//   各测试文件里的 describe.skip 守卫只跳过「测试主体」，完全不阻止 init() 的迁移副作用。
//
// 机制：jest 的 setupFiles 在每个测试文件的模块加载**之前**、于该测试文件所在 worker 内执行；
//   而 db.js（第 9 行）与 server.js（第 59 行，会话存储）都在模块加载时捕获 process.env.DB_NAME。
//   因此这里的赋值必然先于两者生效。且 dotenv 默认 override=false，部分测试文件顶层的
//   require('dotenv').config() 不会覆盖本值——这正是选用 setupFiles 而非 globalSetup 的原因。
//
// 兜底：tests/helpers/setup.js 另有「DB_NAME MUST 以 _test 结尾」的失败即停断言。
// 多测试库并行：可用 TEST_DB_NAME 指定，但仍必须是 _test 结尾的库名。

// ★ 顺序关键：先加载 .env（提供 DB_HOST/DB_USER/DB_PASSWORD/DB_PORT 等），再强制改写 DB_NAME。
// 原因：部分套件（samples-storage-map / samples-checkout-e2e）在顶层直接 require db 与 DAO，
// 而 db.js 在**模块加载时**就捕获了整个 DB_*；若此刻 .env 尚未加载，DB_PASSWORD 为空，
// db.js 会以空密码建池，连库即 Access denied（实测报错 "using password: NO"）。
require('dotenv').config();

const TEST_DB_NAME = process.env.TEST_DB_NAME || 'sample_mgmt_test';
if (!/_test$/.test(TEST_DB_NAME)) {
  throw new Error('[tests/setup-env] TEST_DB_NAME="' + TEST_DB_NAME + '" 非法：测试库名 MUST 以 _test 结尾（禁止指向生产库）');
}
const prev = process.env.DB_NAME;
process.env.DB_NAME = TEST_DB_NAME;
process.env.NODE_ENV = 'test';
process.env.TEST_MODE = '1';
if (prev && prev !== TEST_DB_NAME) {
  // 醒目提示：用于在 CI/终端日志中追溯「原值被强制改写」，也是「测试不再连生产库」的可观测证据
  console.warn('[tests/setup-env] DB_NAME 由 "' + prev + '" 强制改写为测试库 "' + TEST_DB_NAME + '"（禁止测试连生产库）');
}
