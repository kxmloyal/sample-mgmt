// db/tx.js — 事务工具（独立文件，避免 db.js 容量超限）
// 用法：await withTransaction(async conn => { await conn.execute(sql, params); ... });
// conn 为 mysql2 PoolConnection，已 beginTransaction，自动 commit/rollback
async function withTransaction(pool, fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    try { await conn.rollback(); } catch (_) { /* rollback 失败忽略，抛出原始错误 */ }
    throw e;
  } finally {
    conn.release();
  }
}
module.exports = { withTransaction };
