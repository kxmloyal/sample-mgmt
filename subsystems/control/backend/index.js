// subsystems/control/backend/index.js — 管制流程管理子系统后端入口
// 插件协议标准接口：register / initDB / seed
function register(app) {
  require('./routes-orders').register(app);
  require('./routes-ncr').register(app);
  require('./routes-label').register(app);
  require('./routes-settings').register(app);
}

/**
 * 初始化数据库表（幂等）。当前由 db.js init() 统一处理，此处为协议接口保留。
 * @returns {Promise<boolean>}
 */
async function initDB() {
  return true;
}

/**
 * 填充种子数据。调用 subsystems/control/seed/seed.js。
 * @returns {Promise<void>}
 */
async function seed() {
  try {
    const seedFn = require('../seed/seed');
    const { pool } = require('../../../db');
    await seedFn(pool());
  } catch (e) {
    console.error('[control] 种子数据填充失败:', e.message);
    throw e;
  }
}

module.exports = { register, initDB, seed };
