// subsystems/samples/backend/html-utils.js — 服务端 HTML 转义工具
// 用途：标示卡/标签/匿名页渲染时对用户可控字段做实体转义，防止存储型 XSS
function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
module.exports = { escapeHtml };
