// subsystems/workbench/backend/index.js
// 全局工作台后端 — 合并查询 + 积压阈值配置（ADMIN 可修改，全局生效）

var D = require('../../../db');
var { unifiedWorkbenchSQL, unifiedWorkbenchCountSQL } = require('../db/workbench-queries');
var pool = D.pool();

// 默认阈值（小时）：3天边界 warn=72h，7天边界 bad=168h
var DEFAULT_SETTINGS = { warn: 72, bad: 168 };

/** 读取全局阈值（表缺失或键缺失时回退默认值） */
async function getSettings() {
  var [rows] = await pool.execute('SELECT k, v FROM workbench_settings');
  var map = {};
  rows.forEach(function(r) { map[r.k] = r.v; });
  return {
    warn: map.warn_hours != null ? Number(map.warn_hours) : DEFAULT_SETTINGS.warn,
    bad: map.bad_hours != null ? Number(map.bad_hours) : DEFAULT_SETTINGS.bad
  };
}

function register(app) {
  var requireAuth = app.locals.requireAuth;
  var currentUser = app.locals.currentUser;

  // GET /api/workbench — 合并样品+治具活跃数据（分页，默认200条，上限500）
  app.get('/api/workbench', requireAuth, async function(req, res) {
    try {
      var limit = Math.min(parseInt(req.query.limit || '200', 10) || 200, 500);
      var offset = Math.max(parseInt(req.query.offset || '0', 10) || 0, 0);

      // 用 pool.query() 代替 execute()，因为 UNION 子查询与 prepared statement 不兼容
      var [[rows], [countRow]] = await Promise.all([
        pool.query(unifiedWorkbenchSQL, [limit, offset]),
        pool.query(unifiedWorkbenchCountSQL)
      ]);
      var items = rows;
      var total = countRow[0] ? countRow[0].total : 0;

      // 后端支持按 item_type / dept 预筛选
      if (req.query.item_type) {
        items = items.filter(function(r) { return r.item_type === req.query.item_type; });
      }
      if (req.query.dept) {
        items = items.filter(function(r) { return r.resp_dept === req.query.dept; });
      }

      res.json({ items: items, total: total, limit: limit, offset: offset });
    } catch (err) {
      console.error('[workbench] 查询失败:', err.message);
      res.status(500).json({ error: '获取工作台数据失败：' + err.message });
    }
  });

  // GET /api/workbench/settings — 全局积压阈值（所有登录用户可读，前端渲染依据）
  app.get('/api/workbench/settings', requireAuth, async function(req, res) {
    try {
      res.json(await getSettings());
    } catch (err) {
      console.error('[workbench] 读取阈值失败:', err.message);
      res.status(500).json({ error: '获取阈值失败：' + err.message });
    }
  });

  // PUT /api/workbench/settings — 仅 ADMIN 可修改，保存后全局生效
  app.put('/api/workbench/settings', requireAuth, async function(req, res) {
    try {
      var user = await currentUser(req);
      if (!user || user.role !== 'ADMIN') {
        return res.status(403).json({ error: '仅管理员可修改阈值' });
      }
      var warn = parseInt(req.body && req.body.warn, 10);
      var bad = parseInt(req.body && req.body.bad, 10);
      if (!warn || !bad || warn <= 0 || bad <= 0 || bad <= warn) {
        return res.status(400).json({ error: '阈值无效：需为正整数，且 7天边界必须大于 3天边界' });
      }
      await pool.execute("REPLACE INTO workbench_settings (k, v) VALUES ('warn_hours', ?)", [warn]);
      await pool.execute("REPLACE INTO workbench_settings (k, v) VALUES ('bad_hours', ?)", [bad]);
      res.json(await getSettings());
    } catch (err) {
      console.error('[workbench] 保存阈值失败:', err.message);
      res.status(500).json({ error: '保存阈值失败：' + err.message });
    }
  });
}

function initDB() { return Promise.resolve(); }
function seed() { return Promise.resolve(); }

module.exports = { register, initDB, seed };
