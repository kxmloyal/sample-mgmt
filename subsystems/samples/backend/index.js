// subsystems/samples/backend/index.js — 样品子系统后端入口
// 插件协议标准接口：register / initDB / seed
// 当前阶段（Phase 2）：旧路由由 server.js 直接注册，此处仅提供协议接口桩
// Phase 4 自动发现后：框架将调用 register(app) 替代 server.js 中的直接注册

const path = require('path');
const fs = require('fs');

/**
 * 注册子系统的 Express 路由。
 * 当前阶段（Phase 2-3）：旧路由仍在 server.js 中直接注册，
 * 此处由旧路由委托确保兼容。Phase 4 切换后 server.js 不再直接注册。
 */
function register(app) {
  // Phase 2 过渡期：旧路由已在 server.js 注册，此处不重复注册
  // Phase 4 切换后：取消注释以下行，改为框架自动调用
  // require('../../../routes/samples').register(app);
  // require('../../../routes/scan').register(app);
  // require('../../../routes/cards').register(app);
}

/**
 * 初始化数据库表（幂等）。当前由 db.js init() 统一处理。
 * Phase 4 后：框架首次加载时自动调用。
 */
async function initDB() {
  // 当前由 db.js init() 处理，此处为协议接口保留
  return true;
}

/**
 * 填充种子数据。Phase 4 后：调用 subsystems/samples/seed/seed.js。
 */
async function seed() {
  try {
    const seedFn = require('../seed/seed');
    const { pool } = require('../../../db');
    await seedFn(pool());
  } catch (e) {
    console.error('[samples] 种子数据填充失败:', e.message);
    throw e;
  }
}

module.exports = { register, initDB, seed };
