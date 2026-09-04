// subsystems/projects/backend/index.js — 项目追踪子系统后端入口（插件协议标准接口）
// 注册顺序（Task 7 修正）：stats 静态路径最先（/workflow /stats /tasks/export /tasks），
// 避免 GET /api/projects/tasks/export 被 routes-tasks 的 /tasks/:tid 参数路由抢占（tid='export' → 404）；
// routes-tasks 其次（/tasks/:tid 参数路由）；routes-task-extras 子路径路由（/tasks/:tid/deps|files|links）；
// routes-milestones/routes-risks/routes-extras（OA 能力移植，静态前缀，须在 :id 之前）；
// routes-projects 最后（/:id 参数路由）
function register(app) {
  require('./routes-stats').register(app);        // 静态路径（/workflow /stats /tasks/export /tasks）最先，避免被 :tid 抢占
  require('./routes-tasks').register(app);        // 含 /tasks/:tid 参数路由
  require('./routes-task-extras').register(app);  // 子路径路由
  require('./routes-milestones').register(app);   // OA 移植：里程碑（/milestones 静态前缀 + /:id/milestones 列表）
  require('./routes-risks').register(app);        // OA 移植：风险（/risks 静态前缀 + /:id/risks 列表）
  require('./routes-modelrefs').register(app);    // OA 移植二期：机型引用（/model-options 静态 + /:id/models）
  require('./routes-changes').register(app);      // OA 移植二期：变更单（/changes 静态前缀 + /:id/changes 列表）
  require('./routes-templates').register(app);    // OA 移植二期批次2：项目模板（/templates 静态前缀）
  require('./routes-graph').register(app);        // OA 移植二期批次3：关系+图谱聚合（/relations /graph 静态前缀）
  require('./routes-extras').register(app);       // OA 移植：预算/成本扩展（/:id/extras）
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
