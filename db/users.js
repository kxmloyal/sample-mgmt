// db/users.js — 用户 CRUD（工厂模式：接收 { q, one, dbRef }）
module.exports = function({ q, one, dbRef }) {
  async function createUser({ username, password_hash, role, dept, display_name }) {
    await dbRef.run('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      [username, password_hash, role, dept || null, display_name || null]);
    return await getUserByUsername(username);
  }
  function getUserById(id) { return one('SELECT * FROM users WHERE id = ?', [id]); }
  function getUserByUsername(username) { return one('SELECT * FROM users WHERE username = ?', [username]); }
  function listUsers() { return q('SELECT id,username,role,dept,display_name,created_at FROM users ORDER BY id'); }
  // 仅查询 RD 用户（供 /api/resolve 在 RETURNING 状态下按需调用，避免全量 listUsers 内存过滤）
  function listRdUsers() { return q("SELECT id,display_name,username,dept FROM users WHERE role='RD' ORDER BY id"); }
  return { createUser, getUserById, getUserByUsername, listUsers, listRdUsers };
};
