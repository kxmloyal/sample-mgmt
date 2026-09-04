// db/migrations/index.js — 迁移聚合入口（B3-T2 拆分，行为零变化）
// 各子系统迁移按原顺序执行；db/migrations.js 为薄转发，db.js 的 require 接口不变
const { migrateFixtureLifecycle, migrateFixtureFiles, migrateFixtureMaintenance, migratePerfIndexes, migrateFixtureSchemaAlign } = require('./fixtures');
const { migrateControlNcrDetail, migrateControlNcrForm, migrateControlOptimisticLock, migrateControlSignsCreatedAt } = require('./control');
const { migrateProjectTaskIndexes } = require('./projects');
const { migrateProjectOaExtras } = require('./projects-oa');
const { migrateSamplesOptimisticLock, migrateSamplesSoftDelete } = require('./samples');
const { migrateUserEnabled, migrateUsersSessionVersion, migrateUserRolesTable } = require('./users');

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
  await migrateSamplesOptimisticLock(pool);
  await migrateSamplesSoftDelete(pool);
  await migrateUsersSessionVersion(pool);
  await migrateUserRolesTable(pool);
}

module.exports = { runMigrations };
