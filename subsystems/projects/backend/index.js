// subsystems/projects/backend/index.js — 项目追踪子系统后端入口（插件协议标准接口）
// 注册顺序：静态子路径（/tasks、/workflow、/stats）先注册，/:id 参数路由最后，避免抢占
function register(app) {
  require('./routes-tasks').register(app);    // 含 /tasks 静态子路径（先注册，避免 /:id 抢占）
  require('./routes-stats').register(app);    // /workflow /stats（静态）
  require('./routes-projects').register(app); // 最后注册 /:id 参数路由
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
