module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  // P1 修复（2026-09-11）：测试进程强制指向独立测试库 sample_mgmt_test，禁止连生产库。
  // setupFiles 在每个测试文件加载前执行（先于 db.js/server.js 捕获 DB_NAME 的时机），
  // 且早于测试文件顶层的 dotenv.config()；详见 tests/setup-env.js
  setupFiles: ['<rootDir>/tests/setup-env.js'],
  // 集成测试直连 MariaDB + 每个套件启动 in-process server；新增子系统后启动扫描变慢，默认 5s 易超时，统一放宽
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
  collectCoverageFrom: ['db.js', 'server.js'],
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  }
};
