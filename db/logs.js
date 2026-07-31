// db/logs.js — 操作日志 CRUD（工厂模式：接收 { q, dbRef }）
module.exports = function({ q, dbRef }) {
  // addLog 支持可选 conn 参数（事务内调用），不传则用连接池（向后兼容）
  async function addLog({ sample_id, action, role, user_id, dept, location, note }, conn) {
    const sql = 'INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note) VALUES (?,?,?,?,?,?,?)';
    const params = [sample_id, action, role || null, user_id || null, dept || null, location || null, note || null];
    if (conn) await conn.execute(sql, params);
    else await dbRef.run(sql, params);
  }
  function listLogsBySample(sample_id) { return q('SELECT * FROM scan_logs WHERE sample_id = ? ORDER BY id', [sample_id]); }
  function listLogs() {
    return q(`SELECT l.*, s.sample_no, s.name AS sample_name
              FROM scan_logs l LEFT JOIN samples s ON s.id = l.sample_id ORDER BY l.id DESC LIMIT 500`);
  }
  return { addLog, listLogsBySample, listLogs };
};
