// subsystems/fixtures/db/models-dao.js — 治具侧机型主数据 DAO（复用样品共享表 sample_models）
// 职责：机型列表（含治具计数）/ 新建 / 改全称 / 存量 model 迁移导入
// 权限在路由层校验（仅 RD/ADMIN）；code 创建后只读，编辑仅允许改 full_name
var pool = null;

function setPool(p) { pool = p; }

function q(sql, params) { return pool.execute(sql, params).then(function (r) { return r[0]; }); }
function one(sql, params) { return q(sql, params).then(function (rows) { return rows[0] || null; }); }

// 全部机型 + 各机型治具计数（LEFT JOIN fixtures 按 model=code 聚合，按 code 排序）
function listModelsWithCount() {
  return q('SELECT m.id, m.code, m.full_name, m.created_by, m.created_at, COUNT(f.id) AS fixture_count FROM sample_models m LEFT JOIN fixtures f ON f.model = m.code GROUP BY m.id, m.code, m.full_name, m.created_by, m.created_at ORDER BY m.code ASC');
}

function getModelById(id) { return one('SELECT * FROM sample_models WHERE id = ?', [id]); }
function getModelByCode(code) { return one('SELECT * FROM sample_models WHERE code = ?', [code]); }

// 新建机型；code/full_name 唯一冲突由 DB 约束抛 ER_DUP_ENTRY，路由层转 409
function createModel(data) {
  return q('INSERT INTO sample_models (code, full_name, created_by) VALUES (?, ?, ?)', [data.code, data.full_name, data.created_by || null])
    .then(function () { return getModelByCode(data.code); });
}

// 仅更新 full_name（code 只读）；返回更新后的机型
function updateModelName(id, full_name) {
  return q('UPDATE sample_models SET full_name = ? WHERE id = ?', [full_name, id])
    .then(function () { return getModelById(id); });
}

// 存量兼容迁移：fixtures.model 自由文本去重导入 sample_models（code=full_name=原值），幂等可重复执行
function migrateFixtureModels() {
  return q("INSERT IGNORE INTO sample_models (code, full_name) SELECT DISTINCT model, model FROM fixtures WHERE model IS NOT NULL AND model <> ''");
}

module.exports = { setPool: setPool, listModelsWithCount: listModelsWithCount, getModelById: getModelById, getModelByCode: getModelByCode, createModel: createModel, updateModelName: updateModelName, migrateFixtureModels: migrateFixtureModels };
