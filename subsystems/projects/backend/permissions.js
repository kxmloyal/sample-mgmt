// subsystems/projects/backend/permissions.js — 项目权限判定（ADMIN/PM 全局，owner/member 项目内）
module.exports = {
  isGlobalManager(role) { return role === 'ADMIN' || role === 'PM'; },
  async getProjectAccess(conn, projectId, userId) {
    const D = require('../../../db');
    const row = await D.fetchOne(conn,
      'SELECT is_owner FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId]);
    return { isOwner: !!row && row.is_owner === 1, isMember: !!row };
  }
};
