// subsystems/fixtures/db/models-dao.js — 治具侧机型主数据 DAO（复用样品共享表 sample_models）
// 职责：机型列表（含治具计数/状态分布/呆滞数/封面图）/ 新建 / 改全称 / 存量 model 迁移导入
// 权限在路由层校验（仅 RD/ADMIN）；code 创建后只读，编辑仅允许改 full_name
var pool = null;

function setPool(p) { pool = p; }

function q(sql, params) { return pool.execute(sql, params).then(function (r) { return r[0]; }); }
function one(sql, params) { return q(sql, params).then(function (rows) { return rows[0] || null; }); }

// 全部机型 + 各机型治具计数（LEFT JOIN fixtures 按 model=code 聚合，按 code 排序）
function listModelsWithCount() {
  return q('SELECT m.id, m.code, m.full_name, m.created_by, m.created_at, COUNT(f.id) AS fixture_count FROM sample_models m LEFT JOIN fixtures f ON f.model = m.code GROUP BY m.id, m.code, m.full_name, m.created_by, m.created_at ORDER BY m.code ASC');
}

// 机型视图增强聚合（机型卡片墙用）：状态分布 / 呆滞数 / 封面图，一次查询合并进机型列表
// 呆滞口径与清单筛选一致（dao.js F16）：updated_at ≤ NOW()-阈值日 且状态属非领用停滞集合
async function listModelsForWall(dormantDays) {
  var models = await listModelsWithCount();
  var threshold = Number(dormantDays) || 60;
  var stats = await q(
    "SELECT model, status, COUNT(*) AS c FROM fixtures WHERE model IS NOT NULL AND model <> '' GROUP BY model, status");
  var covers = await q(
    'SELECT f.model, ff.filename AS cover_photo FROM fixtures f JOIN (' +
    '  SELECT fixture_id, MIN(id) AS min_id FROM fixture_files' +
    "  WHERE category IN ('verify_photo','repair_photo','other') GROUP BY fixture_id" +
    ') first_ff ON first_ff.fixture_id = f.id JOIN fixture_files ff ON ff.id = first_ff.min_id ' +
    "WHERE f.model IS NOT NULL AND f.model <> '' GROUP BY f.model");
  var dormant = await q(
    "SELECT model, COUNT(*) AS c FROM fixtures WHERE updated_at <= DATE_SUB(NOW(), INTERVAL ? DAY) " +
    "AND status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE','TRANSFERRED') " +
    "GROUP BY model", [threshold]);
  var statMap = {}, dormantMap = {}, coverMap = {};
  stats.forEach(function (r) {
    if (!statMap[r.model]) statMap[r.model] = {};
    statMap[r.model][r.status] = r.c;
  });
  dormant.forEach(function (r) { dormantMap[r.model] = r.c; });
  covers.forEach(function (r) { if (!coverMap[r.model]) coverMap[r.model] = r.cover_photo; });
  models.forEach(function (m) {
    m.status_stats = statMap[m.code] || {};
    m.dormant_count = dormantMap[m.code] || 0;
    m.cover_photo = coverMap[m.code] || null;
  });
  return models;
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

module.exports = { setPool: setPool, listModelsWithCount: listModelsWithCount, listModelsForWall: listModelsForWall, getModelById: getModelById, getModelByCode: getModelByCode, createModel: createModel, updateModelName: updateModelName, migrateFixtureModels: migrateFixtureModels };
