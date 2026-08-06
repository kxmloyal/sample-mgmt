// db/portal-prefs.js — 门户卡片个性化排序偏好 DAO（框架级）
// 表：user_portal_prefs（user_id PK, portal_order JSON, updated_at）
module.exports = function ({ q, one, dbRef }) {

  /**
   * 获取用户门户排序偏好；无记录返回 []
   * @param {number} userId - 用户 ID
   * @returns {Promise<string[]>} 子系统 id 有序数组
   */
  async function getPortalPrefs(userId) {
    const row = await one('SELECT portal_order FROM user_portal_prefs WHERE user_id = ?', [userId]);
    if (!row || row.portal_order == null) return [];
    // MariaDB 的 JSON 列可能返回字符串或已解析对象，双兼容
    if (Array.isArray(row.portal_order)) return row.portal_order;
    if (typeof row.portal_order === 'string') {
      try { return JSON.parse(row.portal_order); } catch (e) { return []; }
    }
    return [];
  }

  /**
   * upsert 用户门户排序偏好（幂等，存在即覆盖）
   * @param {number} userId - 用户 ID
   * @param {string[]} order - 子系统 id 有序数组
   */
  async function upsertPortalPrefs(userId, order) {
    await dbRef.run(
      'INSERT INTO user_portal_prefs (user_id, portal_order) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE portal_order = VALUES(portal_order)',
      [userId, JSON.stringify(order)]
    );
  }

  /** 清除用户门户排序偏好（恢复默认顺序） */
  async function deletePortalPrefs(userId) {
    await dbRef.run('DELETE FROM user_portal_prefs WHERE user_id = ?', [userId]);
  }

  return { getPortalPrefs, upsertPortalPrefs, deletePortalPrefs };
};
