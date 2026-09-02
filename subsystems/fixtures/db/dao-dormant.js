// subsystems/fixtures/db/dao-dormant.js — 治具呆滞/配置子模块（2026-08-13 从 dao.js 拆出，规避容量红线）
// 工厂模式：接收 deps{q,one,run}，返回配置读写与呆滞查询；db.js 不改动，由 dao.js 内部 require 展开
module.exports = function createDormantDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run;

  // 呆滞判定的活跃状态集（停滞 + 在库无人领用，排除 IN_USE 与 RETIRED）
  var DORMANT_STATUS = "('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE','TRANSFERRED')";

  // 读取治具配置项（fixtures_settings），无记录返回默认值
  async function getFixtureSetting(k, defaultVal) {
    var row = await one('SELECT v FROM fixtures_settings WHERE k = ?', [k]);
    return row ? row.v : (defaultVal != null ? defaultVal : null);
  }

  // 写入治具配置项（存在则更新，幂等）
  async function setFixtureSetting(k, v) {
    await run('INSERT INTO fixtures_settings (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)', [k, String(v)]);
  }

  // 呆滞治具列表：状态停滞 + 在库无人领用（F16 以 updated_at 为基准——状态变更即更新，避免文件上传/保养等非流转活动重置计时）
  function listDormantFixtures(threshold) {
    var days = Number(threshold) || 60;
    return q(
      "SELECT f.*, DATEDIFF(NOW(), f.updated_at) AS dormant_days, " +
      "CASE WHEN f.status='TRANSFERRED' THEN '在库无人领用' ELSE '状态长期停滞' END AS dormant_reason " +
      "FROM fixtures f " +
      "WHERE f.status IN " + DORMANT_STATUS + " " +
      "AND f.updated_at <= DATE_SUB(NOW(), INTERVAL ? DAY) " +
      "ORDER BY dormant_days DESC",
      [days]
    );
  }

  return { getFixtureSetting: getFixtureSetting, setFixtureSetting: setFixtureSetting, listDormantFixtures: listDormantFixtures, DORMANT_STATUS: DORMANT_STATUS };
};
