// subsystems/projects/backend/index.js — 项目追踪子系统后端入口（插件协议标准接口）
// 注册顺序（Task 7 修正）：stats 静态路径最先（/workflow /stats /tasks/export /tasks），
// 避免 GET /api/projects/tasks/export 被 routes-tasks 的 /tasks/:tid 参数路由抢占（tid='export' → 404）；
// routes-tasks 其次（/tasks/:tid 参数路由）；routes-task-extras 子路径路由（/tasks/:tid/deps|files|links）；
// routes-projects 最后（/:id 参数路由）
function register(app) {
  require('./routes-stats').register(app);        // 静态路径（/workflow /stats /tasks/export /tasks）最先，避免被 :tid 抢占
  require('./routes-tasks').register(app);        // 含 /tasks/:tid 参数路由
  require('./routes-task-extras').register(app);  // 子路径路由
  require('./routes-projects').register(app);     // 最后注册 /:id 参数路由
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
