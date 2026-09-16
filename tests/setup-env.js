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

const path = require('path');

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

// ── mysql2 握手编码预热（2026-09-16；见 docs/RELEASE-v2.0.9.md §9.1）──────────────
// 现象：多测试文件的全量 jest 运行中，数据库连接握手抛
//   "Encoding not recognized: 'cesu8'"（iconv-lite getCodec 的 default 分支）；该异常发生在
//   socket 数据回调内且无外层 try/catch，直接终止 jest 进程（表现为不打印 Tests 汇总行，
//   单个套件则表现为连接失败/锁等待超时，极易误判为数据库故障）。
// 根因：mysql2 以硬编码 'cesu8' 解析握手版本串（mysql2/lib/packets/handshake.js:63），而
//   iconv-lite 首次用到某编码时才惰性载入编码表（iconv-lite/lib/index.js:63：
//   `if (!iconv.encodings) iconv.encodings = require("../encodings");`）；该惰性载入在连接
//   回调期取到不完整编码表时 'cesu8' 查不到，即落到 default 分支抛出上述错误——真实加载
//   异常被伪装成「编码不支持」。故锁定 iconv-lite 版本无法消除（0.6.3 / 0.7.3 均复现）。
// 处理：在 setupFiles（每个测试文件模块加载之前、其模块注册表存活期内）显式触发一次编码表载入。
// 实测：预热后全量套件 cesu8 出现次数 3 → 0，且首次打印 Tests 汇总（§9.1）。
// 影响面：仅测试进程；生产为纯 node 运行，不经此路径；依赖缺失或结构变化时静默跳过。
['iconv-lite', 'mysql2/node_modules/iconv-lite', 'express-mysql-session/node_modules/iconv-lite'].forEach((rel) => {
  try {
    require(path.join(__dirname, '..', 'node_modules', rel)).getCodec('cesu8');
  } catch (e) { /* 不影响测试主体 */ }
});
