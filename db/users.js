// db/users.js — 用户 CRUD（工厂模式：接收 { q, one, dbRef }）
module.exports = function({ q, one, dbRef }) {
  async function createUser({ username, password_hash, role, dept, display_name }) {
    await dbRef.run('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      [username, password_hash, role, dept || null, display_name || null]);
    // 返回安全字段（避免泄露 password_hash）
    const row = await getUserByUsername(username);
    return await getUserById(row.id);
  }
  // 安全字段查询（不含 password_hash）
  function safeCols() { return 'id,username,role,dept,display_name,enabled,created_at'; }
  function getUserById(id) { return one('SELECT ' + safeCols() + ' FROM users WHERE id = ?', [id]); }
  // 登录查询：必须含 password_hash（供 bcrypt 校验），仅内部鉴权使用，不直接返回给前端
  function getUserByUsername(username) { return one('SELECT * FROM users WHERE username = ?', [username]); }
  function listUsers() { return q('SELECT ' + safeCols() + ' FROM users ORDER BY id'); }
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
    return await one('SELECT ' + safeCols() + ' FROM users WHERE id=?', [id]);
  }
  // —— 批量管理（2026-08-06，仅 ADMIN 调用）——
  // 执行器：传入事务 conn 时用 conn（事务内），否则用默认 dbRef（独立语句）
  function exec(sql, params, conn) {
    return conn ? conn.execute(sql, params) : dbRef.run(sql, params);
  }
  function placeholders(ids) { return ids.map(function(){ return '?'; }).join(','); }

  // 批量物理删除（users 无外键引用，孤儿日志 ID 由前端展示容忍）
  async function deleteUsers(ids, conn) {
    await exec('DELETE FROM users WHERE id IN (' + placeholders(ids) + ')', ids, conn);
    return ids.length;
  }
  // 批量启用/禁用
  async function setUsersEnabled(ids, enabled, conn) {
    const n = enabled === 0 || enabled === false || enabled === '0' ? 0 : 1;
    await exec('UPDATE users SET enabled=? WHERE id IN (' + placeholders(ids) + ')', [n].concat(ids), conn);
    return ids.length;
  }
  // 批量改角色/部门（fields: { role?, dept? }，至少一项）
  async function updateUsers(ids, fields, conn) {
    const sets = [], vals = [];
    if (fields.role !== undefined) { sets.push('role=?'); vals.push(fields.role); }
    if (fields.dept !== undefined) { sets.push('dept=?'); vals.push(fields.dept); }
    if (!sets.length) return 0;
    await exec('UPDATE users SET ' + sets.join(',') + ' WHERE id IN (' + placeholders(ids) + ')', vals.concat(ids), conn);
    return ids.length;
  }
  // 批量重置密码
  async function resetPasswords(ids, passwordHash, conn) {
    await exec('UPDATE users SET password_hash=? WHERE id IN (' + placeholders(ids) + ')', [passwordHash].concat(ids), conn);
    return ids.length;
  }
  return { createUser, getUserById, getUserByUsername, listUsers, listRdUsers, updateUser,
    deleteUsers, setUsersEnabled, updateUsers, resetPasswords };
};
