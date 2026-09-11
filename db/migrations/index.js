// db/migrations/index.js — 迁移聚合入口（B3-T2 拆分，行为零变化）
// 各子系统迁移按原顺序执行；db/migrations.js 为薄转发，db.js 的 require 接口不变
const { migrateFixtureLifecycle, migrateFixtureFiles, migrateFixtureMaintenance, migratePerfIndexes, migrateFixtureSchemaAlign } = require('./fixtures');
const { migrateControlNcrDetail, migrateControlNcrForm, migrateControlOptimisticLock, migrateControlSignsCreatedAt } = require('./control');
const { migrateProjectTaskIndexes } = require('./projects');
const { migrateProjectOaExtras } = require('./projects-oa');
const { migrateProjectOaP2 } = require('./projects-oa-p2');
const { migrateProjectOaP2b } = require('./projects-oa-p2b');
const { migrateProjectNotifications } = require('./projects-notif');
const { migrateProjectTdUx } = require('./projects-td-ux');
const { migrateProjectPlm } = require('./projects-plm');
const { migrateSamplesOptimisticLock, migrateSamplesSoftDelete, migrateSamplesCheckout, migrateSamplesDeletedAtTz, migrateSamplesSampleNoRelease } = require('./samples');
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
  await migrateProjectNotifications(pool);
  await migrateProjectTdUx(pool);
  await migrateProjectPlm(pool);
  await migrateSamplesOptimisticLock(pool);
  await migrateSamplesSoftDelete(pool);
  await migrateSamplesCheckout(pool);
  await migrateSamplesDeletedAtTz(pool); // deleted_at 时区口径统一（2026-09-09，存量 -8h 校正，防重入）
  await migrateUsersSessionVersion(pool);
  await migrateSamplesSampleNoRelease(pool); // 编号占用口径（2026-09-11）：唯一索引改「仅存活行唯一」，使已取消的 NEW 号可复用
}

module.exports = { runMigrations };
