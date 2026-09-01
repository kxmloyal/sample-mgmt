// subsystems/workbench/backend/index.js
// 全局工作台后端 — 合并查询 + 积压阈值配置（ADMIN 可修改，全局生效）

var D = require('../../../db');
var { unifiedWorkbenchSQL, unifiedWorkbenchCountSQL } = require('../db/workbench-queries');
var pool = D.pool();
var { buildWorkbenchSQL } = require('../db/workbench-queries');
var { calcOverdue } = require('../db/workbench-overdue');

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

  // GET /api/workbench — 服务端筛选 + 等级计算 + 统计 + 分页
  // 筛选参数：type/level/dept/apply_dept/keyword/stage/dormant/min_hours/max_hours/limit/offset
  app.get('/api/workbench', requireAuth, async function(req, res) {
    try {
      var filters = parseWorkbenchFilters(req.query);
      if (filters.error) return res.status(400).json({ error: filters.error });
      var settings = await getSettings(); // {warn,bad} 小时，缺省 72/168
      // 卡片统计基于「未按部门筛选」的全量：避免点击部门卡后其它部门卡消失（对齐 samples/fixtures 卡片交互协议）
      var cardFilters = Object.assign({}, filters);
      delete cardFilters.dept;
      var cardBase = buildWorkbenchSQL(cardFilters);
      var [cardRows] = await pool.query(cardBase.sql, cardBase.params);

      // 等级计算（后端权威版本）
      var applySet = {}; // 申请部门去重列表（apply_dept 下拉数据源）
      cardRows.forEach(function(r) {
        var od = calcOverdue(r, settings);
        r.overdue_level = od.level;
        r.overdue_label = od.label;
        r.overdue_hours = od.hours;
        r.overdue_reason = od.reason;
        if (r.apply_dept) applySet[r.apply_dept] = 1;
      });
      // 等级过滤（服务端，非前端内存）
      if (filters.level !== '') {
        var lv = Number(filters.level);
        cardRows = cardRows.filter(function(r) { return r.overdue_level === lv; });
      }
      // 排序：等级降序 + 停留时长降序 + 类型/编号稳定序
      cardRows.sort(function(a, b) {
        if (a.overdue_level !== b.overdue_level) return b.overdue_level - a.overdue_level;
        if (a.dwell_hours !== b.dwell_hours) return b.dwell_hours - a.dwell_hours;
        if (a.item_type !== b.item_type) return a.item_type > b.item_type ? 1 : -1;
        return a.item_no > b.item_no ? 1 : -1;
      });

      // 明细列表：在卡片全量基础上按部门内存过滤（仅影响 items/total，不影响卡片统计）
      var rows = cardRows;
      if (filters.dept) rows = cardRows.filter(function(r) { return r.resp_dept === filters.dept; });

      // 统计（基于卡片全量，不受部门筛选/分页影响；deptStats 保留全部部门卡）
      var total = rows.length;
      var summary = { total: cardRows.length, d3in: 0, d37: 0, d7: 0, dormant: 0 };
      var deptMap = {};
      cardRows.forEach(function(r) {
        if (r.overdue_level === 0) summary.d3in++;
        else if (r.overdue_level === 1) summary.d37++;
        else summary.d7++;
        if (r.dormant_days != null) summary.dormant++;
        var dept = r.resp_dept || '-';
        if (!deptMap[dept]) deptMap[dept] = { dept: dept, total: 0, d3in: 0, d37: 0, d7: 0 };
        deptMap[dept].total++;
        if (r.overdue_level === 0) deptMap[dept].d3in++;
        else if (r.overdue_level === 1) deptMap[dept].d37++;
        else deptMap[dept].d7++;
      });

      // offset 超界钳制（total 已在上方算出，避免前端 cur>pages 显示异常）
      filters.offset = Math.min(filters.offset, Math.max(total - filters.limit, 0));
      var page = rows.slice(filters.offset, filters.offset + filters.limit);
      res.json({ items: page, total: total, limit: filters.limit, offset: filters.offset, summary: summary, deptStats: Object.values(deptMap), applyDepts: Object.keys(applySet) });
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

// 解析并校验工作台筛选参数（非法返回 { error }）
function parseWorkbenchFilters(q) {
  var f = {};
  var typeRaw = q.type || q.item_type || ''; // 兼容旧参数 item_type（tests/test-workbench-api.sh 仍使用）
  if (typeRaw && typeRaw !== 'sample' && typeRaw !== 'fixture' && typeRaw !== 'control') return { error: 'type 仅支持 sample/fixture/control' };
  f.type = typeRaw;
  if (q.level !== undefined && q.level !== '') {
    var lv = Number(q.level);
    if (lv !== 0 && lv !== 1 && lv !== 2) return { error: 'level 仅支持 0/1/2' };
    f.level = String(lv);
  } else f.level = '';
  f.dept = q.dept || '';
  f.apply_dept = q.apply_dept || '';
  var kw = (q.keyword || '').trim();
  f.keyword = kw.length > 50 ? kw.slice(0, 50) : kw;
  f.stage = q.stage || '';
  f.dormant = q.dormant === '1' ? '1' : '';
  if (q.min_hours !== undefined && q.min_hours !== '') {
    var min = Number(q.min_hours);
    if (!(min >= 0)) return { error: 'min_hours 需为非负整数' };
    f.min_hours = min;
  }
  if (q.max_hours !== undefined && q.max_hours !== '') {
    var max = Number(q.max_hours);
    if (!(max >= 0)) return { error: 'max_hours 需为非负整数' };
    f.max_hours = max;
  }
  f.limit = Math.min(Math.max(parseInt(q.limit || '50', 10) || 50, 1), 500);
  f.offset = Math.max(parseInt(q.offset || '0', 10) || 0, 0);
  return f;
}

module.exports = { register, initDB, seed };
