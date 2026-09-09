// subsystems/samples/backend/routes-checkout-users.js — 领用人候选接口（2026-09-09 方案A）
// GET /api/samples/checkout-users：登录即可（保管/生技扫码领用是日常主路径，与领用权限同口径）；
// 仅暴露 id/display_name/dept 三字段（projects 子系统 P1-4 同款收敛，不泄漏 username 登录名）；
// 仅返回 enabled=1 且有显示名的账号；供扫码领用弹窗「从系统用户选择」下拉使用。
// 独立文件原因：routes-samples.js 已达 92% 字符红线（2026-09-09），禁止追加新功能
const D = require('../../../db');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  app.get('/api/samples/checkout-users', requireAuth, async (req, res) => {
    try {
      const rows = await D.fetchAll(null,
        "SELECT id, display_name, dept FROM users WHERE enabled=1 AND display_name IS NOT NULL AND display_name<>'' ORDER BY display_name ASC");
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
