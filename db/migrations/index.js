// db/migrations/index.js — 迁移聚合入口（B3-T2 拆分，行为零变化）
// 各子系统迁移按原顺序执行；db/migrations.js 为薄转发，db.js 的 require 接口不变
const { migrateFixtureLifecycle, migrateFixtureFiles, migrateFixtureMaintenance, migratePerfIndexes, migrateFixtureSchemaAlign } = require('./fixtures');
const { migrateControlNcrDetail, migrateControlNcrForm, migrateControlOptimisticLock, migrateControlSignsCreatedAt } = require('./control');
const { migrateProjectTaskIndexes } = require('./projects');
const { migrateProjectOaExtras } = require('./projects-oa');
const { migrateProjectOaP2 } = require('./projects-oa-p2');
const { migrateProjectOaP2b } = require('./projects-oa-p2b');
const { migrateSamplesOptimisticLock, migrateSamplesSoftDelete, migrateSamplesCheckout } = require('./samples');
const { migrateUserEnabled, migrateUsersSessionVersion } = require('./users');

async function runMigrations(pool) {
  await migrateFixtureLifecycle(pool);
  await migrateFixtureFiles(pool);
  await migrateFixtureMaintenance(pool);
  await migratePerfIndexes(pool);
  await migrateFixtureSchemaAlign(pool);
  await migrateUserEnabled(pool);
  await migrateControlNcrDetail(pool);
  await migrateControlNcrForm(pool);
  await migrateControlOptimisticLock(pool);
  await migrateControlSignsCreatedAt(pool);
  await migrateProjectTaskIndexes(pool);
  await migrateProjectOaExtras(pool);
  await migrateProjectOaP2(pool);
  await migrateProjectOaP2b(pool);
  await migrateSamplesOptimisticLock(pool);
  await migrateSamplesSoftDelete(pool);
  await migrateSamplesCheckout(pool);
  await migrateUsersSessionVersion(pool);
}

module.exports = { runMigrations };
