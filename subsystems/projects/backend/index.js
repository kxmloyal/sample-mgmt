// subsystems/projects/backend/index.js — 项目追踪子系统后端入口（插件协议标准接口）
function register(app) {
  require('./routes-projects').register(app);
  require('./routes-tasks').register(app);
  require('./routes-stats').register(app);
}

async function initDB() { return true; }

async function seed() {
  try {
    const seedFn = require('../seed/seed');
    const { pool } = require('../../../db');
    await seedFn(pool());
  } catch (e) {
    console.error('[projects] 种子数据填充失败:', e.message);
    throw e;
  }
}

module.exports = { register, initDB, seed };
