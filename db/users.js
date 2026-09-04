// db/users.js — 用户 CRUD（工厂模式：接收 { q, one, dbRef }）
// 2026-09-04 多角色架构（提交①）：新增 user_roles 关联表读写；
// users.role 单值列保留双写（主角色=角色列表首个），存量读路径行为零变化
module.exports = function({ q, one, dbRef }) {
  const ROLE_ENUM = ['RD', 'ME', 'QA', 'CUSTODY', 'PM', 'ADMIN'];
  // 角色规范化：去重、过滤非法枚举、保持传入顺序（首角色为主角色）
  function normalizeRoles(roles) {
    const arr = Array.isArray(roles) ? roles : (roles ? [roles] : []);
    const seen = {};
    const out = [];
    arr.forEach(function(r) {
      const v = String(r || '').trim();
      if (v && ROLE_ENUM.indexOf(v) !== -1 && !seen[v]) { seen[v] = 1; out.push(v); }
    });
    return out;
  }
  // 同步角色：重写 user_roles 行 + users.role 双写主角色（事务内传 conn）
  async function syncUserRoles(userId, roles, conn) {
    const list = normalizeRoles(roles);
    if (!list.length) throw new Error('至少保留一个角色');
    const run = conn ? function(sql, p) { return conn.execute(sql, p); } : function(sql, p) { return dbRef.run(sql, p); };
    await run('DELETE FROM user_roles WHERE user_id = ?', [userId]);
    for (var i = 0; i < list.length; i++) {
      await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [userId, list[i]]);
    }
    await run('UPDATE users SET role = ? WHERE id = ?', [list[0], userId]); // 双写主角色（兼容列）
    return list;
  }
  // 追加角色（幂等）：不覆盖既有授予，仅补缺失行 + 必要时双写主角色
  // 兼容防御（提交②修复）：users 行存在但 user_roles 无行（绕过 DAO 建号的存量/外部数据）
  // 时，先把 users.role 补入关联表作为基线，再做追加——避免并集丢主角色
  async function addUserRoles(userId, roles, conn) {
    const list = normalizeRoles(roles);
    const run = conn ? function(sql, p) { return conn.execute(sql, p); } : function(sql, p) { return dbRef.run(sql, p); };
    const existing = await getUserRoles(userId);
    if (!existing.length) {
      const row = await one('SELECT role FROM users WHERE id = ?', [userId]);
      if (row && row.role) {
        try { await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [userId, row.role]); }
        catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
      }
    }
    for (var i = 0; i < list.length; i++) {
      try { await run('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [userId, list[i]]); }
      catch (e) { if (e.code !== 'ER_DUP_ENTRY') throw e; }
    }
    const cur = await getUserRoles(userId);
    if (cur.length) await run('UPDATE users SET role = ? WHERE id = ?', [cur[0], userId]);
    return cur;
  }
  // 查角色列表（按授予顺序：id 升序，首行=主角色）
  async function getUserRoles(userId) {
    const rows = await q('SELECT role FROM user_roles WHERE user_id = ? ORDER BY id', [userId]);
    return rows.map(function(r) { return r.role; });
  }
  async function createUser({ username, password_hash, role, dept, display_name }) {
    await dbRef.run('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      [username, password_hash, role, dept || null, display_name || null]);
    // 提交①：新账号同步写 user_roles（单角色授予，与 users.role 双写一致）
    const row = await getUserByUsername(username);
    await syncUserRoles(row.id, [role]);
    // 返回安全字段（避免泄露 password_hash）
    return await getUserById(row.id);
  }
  // 安全字段查询（不含 password_hash）
  // 2026-09-04 提交①：附加 roles 聚合列——关联行为空时回退 [users.role]（IFNULL 兜底，
  // 修复 RIGHT JOIN 空行时 COUNT=1 误走 ELSE 返回 null 的缺陷）；既有调用方行为零变化
  function safeCols() {
    return 'id,username,role,dept,display_name,enabled,created_at,session_version,' +
      '(SELECT IFNULL(CAST(CONCAT("[", GROUP_CONCAT(JSON_QUOTE(ur.role) ORDER BY ur.id SEPARATOR ","), "]") AS JSON), JSON_ARRAY(users.role)) ' +
      'FROM user_roles ur WHERE ur.user_id = users.id) AS roles';
  }
  function getUserById(id) { return one('SELECT ' + safeCols() + ' FROM users WHERE id = ?', [id]); }
  // 登录查询：必须含 password_hash（供 bcrypt 校验），仅内部鉴权使用，不直接返回给前端
  function getUserByUsername(username) { return one('SELECT * FROM users WHERE username = ?', [username]); }
  function listUsers() { return q('SELECT ' + safeCols() + ' FROM users ORDER BY id'); }
  // 仅查询 RD 用户（供 /api/resolve 在 RETURNING 状态下按需调用，避免全量 listUsers 内存过滤）
  function listRdUsers() { return q("SELECT id,display_name,username,dept FROM users WHERE role='RD' ORDER BY id"); }
  // T12.2: 仅启用状态的 RD 用户（扫码台指派下拉专用；原 listRdUsers 保留不动，其余调用方不受影响）
  function listActiveRdUsers() { return q("SELECT id,display_name,username,dept FROM users WHERE role='RD' AND enabled=1 ORDER BY id"); }
  // 更新用户（仅 ADMIN 调用；display_name/password_hash/roles 按传入字段动态更新）
  // roles 变更走 syncUserRoles（重写关联表 + 双写主角色），事务由路由层 D.withTransaction 提供
  // 兼容说明：dbRef 无 withTransaction，roles 路径使用全局 D.withTransaction（通过 dbRef.tx 注入，见 db.js 装配）
  async function updateUser(id, fields) {
    if (fields.roles !== undefined) {
      const tx = dbRef.tx;
      if (!tx) throw new Error('roles 变更需事务支持（dbRef.tx 未注入）');
      return await tx(async function(conn) {
        await syncUserRoles(id, fields.roles, conn);
        const sets = [], vals = [];
        if (fields.display_name !== undefined) { sets.push('display_name=?'); vals.push(fields.display_name); }
        if (fields.password_hash !== undefined) { sets.push('password_hash=?'); vals.push(fields.password_hash); }
        if (sets.length) await conn.execute('UPDATE users SET ' + sets.join(',') + ' WHERE id=?', vals.concat(id));
        return await one('SELECT ' + safeCols() + ' FROM users WHERE id=?', [id]);
      });
    }
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

  // 批量物理删除：users 行删除后 user_roles 经外键 ON DELETE CASCADE 自动清理（2026-09-04 提交①）
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
  // 兼容说明（2026-09-04 提交①）：改 role 时同步重写 user_roles 为单角色（保持旧批量语义=单角色授予）；
  // 多角色精细管理走 PUT /api/users/:id（提交③ UI），批量路径行为不变
  async function updateUsers(ids, fields, conn) {
    const sets = [], vals = [];
    if (fields.role !== undefined) { sets.push('role=?'); vals.push(fields.role); }
    if (fields.dept !== undefined) { sets.push('dept=?'); vals.push(fields.dept); }
    if (!sets.length) return 0;
    await exec('UPDATE users SET ' + sets.join(',') + ' WHERE id IN (' + placeholders(ids) + ')', vals.concat(ids), conn);
    if (fields.role !== undefined) {
      await exec('DELETE FROM user_roles WHERE user_id IN (' + placeholders(ids) + ')', ids, conn);
      for (var i = 0; i < ids.length; i++) {
        await exec('INSERT INTO user_roles (user_id, role) VALUES (?, ?)', [ids[i], fields.role]);
      }
    }
    return ids.length;
  }
  // 批量重置密码
  async function resetPasswords(ids, passwordHash, conn) {
    await exec('UPDATE users SET password_hash=? WHERE id IN (' + placeholders(ids) + ')', [passwordHash].concat(ids), conn);
    return ids.length;
  }

  // 会话版本 +1：使该用户所有已登录会话失效（改密时调用，2026-09-01 安全专项）
  function bumpSessionVersion(userId, conn) {
    return exec('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [userId], conn);
  }
  return { createUser, getUserById, getUserByUsername, listUsers, listRdUsers, listActiveRdUsers, updateUser,
    deleteUsers, setUsersEnabled, updateUsers, resetPasswords, bumpSessionVersion,
    normalizeRoles, syncUserRoles, addUserRoles, getUserRoles, ROLE_ENUM };
};
