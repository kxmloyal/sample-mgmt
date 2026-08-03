// subsystems/fixtures/backend/index.js — 治具子系统后端入口
// 插件协议标准接口：register / initDB / seed
// Phase 3 过渡期：旧路由由 server.js 直接注册，此处仅提供协议接口桩

/**
 * 注册子系统的 Express 路由。
 * Phase 3 过渡期：旧路由已在 server.js 注册，此处不重复注册。
 * Phase 4 切换后：取消注释以下行，改为框架自动调用。
 */
function register(app) {
  // Phase 3 过渡期：旧路由已在 server.js 注册，此处不重复注册
  // Phase 4 切换后：取消注释以下行
  // require('../../../routes/fixtures').register(app);
  // require('../../../routes/fixture-files').register(app);
  // require('../../../routes/fixture-preview').register(app);
}

/**
 * 初始化数据库表（幂等）。当前由 db.js init() 统一处理。
 */
async function initDB() {
  return true;
}

/**
 * 填充种子数据。
 */
async function seed() {
  try {
    const seedFn = require('../seed/seed');
    const { pool } = require('../../../db');
    await seedFn(pool());
  } catch (e) {
    console.error('[fixtures] 种子数据填充失败:', e.message);
    throw e;
  }
}

module.exports = { register, initDB, seed };
