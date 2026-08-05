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
  // 更新用户（仅 ADMIN 调用；display_name/password_hash 按传入字段动态更新）
  async function updateUser(id, fields) {
    const sets = [], vals = [];
    if (fields.display_name !== undefined) { sets.push('display_name=?'); vals.push(fields.display_name); }
    if (fields.password_hash !== undefined) { sets.push('password_hash=?'); vals.push(fields.password_hash); }
    if (!sets.length) return null;
    await dbRef.run('UPDATE users SET ' + sets.join(',') + ' WHERE id=?', vals.concat(id));
    // 返回安全字段（不含 password_hash）
    return await one('SELECT id,username,role,dept,display_name,created_at FROM users WHERE id=?', [id]);
  }
  return { createUser, getUserById, getUserByUsername, listUsers, listRdUsers, updateUser };
};
