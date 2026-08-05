// subsystems/projects/db/dao.js — 项目追踪数据访问层（工厂模式，db.js 自动扫描加载）
module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  // 事务内单行查询：传 conn 用当前连接，否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].length ? Object.assign({}, rows[0][0]) : undefined;
    }
    return one(sql, params);
  }
  // 事务内多行查询
  async function fetchAll(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].map(function (r) { return Object.assign({}, r); });
    }
    return q(sql, params);
  }

  // ===== Task 2 起逐项实现：项目/成员/任务/子任务/评论/依赖/附件/关联/日志/工作流 =====
  return { fetchOne, fetchAll };
};
