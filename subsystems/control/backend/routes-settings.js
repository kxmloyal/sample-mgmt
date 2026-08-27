// subsystems/control/backend/routes-settings.js — 系统配置（超期滞留阈值）读写
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.1.2
// 职责：GET /api/control/settings（登录读，表/键缺失回退 48）；PUT /api/control/settings（仅 ADMIN，校验 1~720）
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');

const DEFAULT_OVERDUE_HOURS = 48;
const HD_MIN = 1;
const HD_MAX = 720;

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 读取超期滞留阈值（登录即可；表缺失或键缺失回退默认 48，保证未建表/未重置也能返回）
  app.get('/api/control/settings', requireAuth, asyncHandler(async (req, res) => {
    var v = null;
    try {
      v = await D.getControlSetting('overdue_hours');
    } catch (err) {
      logger.error('[control] 读取阈值失败(表缺失?): ' + (err.message || String(err)));
    }
    res.json({ overdue_hours: v != null ? v : DEFAULT_OVERDUE_HOURS });
  }));

  // 修改超期滞留阈值（仅 ADMIN，校验 1~720）
  app.put('/api/control/settings', requireAuth, asyncHandler(async (req, res) => {
    var u = await currentUser(req);
    if (!u || u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可修改阈值' });
    var h = parseInt(req.body && req.body.overdue_hours, 10);
    if (!Number.isFinite(h) || h < HD_MIN || h > HD_MAX) {
      return res.status(400).json({ error: '阈值无效：需为 ' + HD_MIN + '~' + HD_MAX + ' 之间的整数' });
    }
    try {
      await D.setControlSetting('overdue_hours', h);
    } catch (err) {
      logger.error('[control] 保存阈值失败: ' + (err.message || String(err)));
      return res.status(500).json({ error: '保存阈值失败：' + (err.message || '服务器内部错误') });
    }
    res.json({ overdue_hours: h });
  }));
}

module.exports = { register };
