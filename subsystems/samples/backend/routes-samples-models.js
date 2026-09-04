// routes-samples-models.js — 样品机型主数据路由（B3-T1 自 routes-samples.js 拆分，行为零变化）
const D = require('../../../db');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');
const cache = require('../../../shared/cache');

// 机型主数据为共享表(sample_models)：写入后须失效样品侧机型/下拉缓存（含机型视图聚合缓存，2026-09-05 二期）
const MODEL_CACHE_KEYS = ['sl_sample_models', 'sl_sample_model_options', 'sl_sample_models_wall'];
function invalidateModelCaches() { MODEL_CACHE_KEYS.forEach(function (k) { cache.del(k); }); }

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 机型列表：GET 所有登录角色可读（新建下拉/筛选数据源）；POST/DELETE 仅 RD/ADMIN（须注册在 /:id 之前）
  // 字典缓存：机型为低变数据，TTL 60s；写操作走 invalidateModelCaches 即时失效（见 AGENTS.md 性能优化）
  app.get('/api/samples/models', requireAuth, asyncHandler(async (req, res) => {
    // 机型视图聚合（2026-09-05 二期，增量分支）：view=wall → 主数据 + 样品数/复检逾期/领用超时/状态分布/封面图
    // 兼容：不带 view 参数的调用（models 管理/新建下拉/列表筛选）行为与返回结构不变
    if ((req.query || {}).view === 'wall') {
      const cachedWall = cache.get('sl_sample_models_wall');
      if (cachedWall !== undefined) return res.json(cachedWall);
      const [models, wall] = await Promise.all([D.listModels(), D.aggregateModelsWall()]);
      const byCode = {};
      (wall || []).forEach(function (r) { byCode[r.code] = r; });
      const merged = (models || []).map(function (m) {
        const s = byCode[m.code] || {};
        return {
          code: m.code, full_name: m.full_name,
          sample_count: s.sample_count || 0,
          overdue_count: s.overdue_count || 0,
          checkout_overdue_count: s.checkout_overdue_count || 0,
          status_stats: s.status_stats || {},
          cover: s.cover || null
        };
      });
      cache.set('sl_sample_models_wall', merged);
      return res.json(merged);
    }
    let cached = cache.get('sl_sample_models');
    if (cached === undefined) {
      cached = await D.listModels();
      cache.set('sl_sample_models', cached);
    }
    res.json(cached);
  }));

  // 下拉数据源：机型列表全称 + 存量样品 model 补集（历史值不丢，避免漏筛）
  app.get('/api/samples/model-options', requireAuth, asyncHandler(async (req, res) => {
    let cached = cache.get('sl_sample_model_options');
    if (cached === undefined) {
      const models = await D.listModels();
      const legacy = await D.listLegacyModels();
      const seen = {};
      const out = models.map(function (m) { seen[m.code] = 1; return { value: m.code, label: m.full_name }; });
      legacy.forEach(function (code) { if (!seen[code]) out.push({ value: code, label: code }); });
      cached = out;
      cache.set('sl_sample_model_options', cached);
    }
    res.json(cached);
  }));

  app.post('/api/samples/models', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['RD', 'ADMIN'].includes(u.role)) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
      const code = ((req.body || {}).code || '').trim().toUpperCase();
      const full_name = ((req.body || {}).full_name || '').trim();
      if (!code) return res.status(400).json({ error: '请填写机型短码' });
      if (code.length < 6) return res.status(400).json({ error: '机型短码至少 6 位' });
      if (code.length > 20) return res.status(400).json({ error: '机型短码最长 20 位' });
      if (!/^[A-Za-z0-9]+$/.test(code)) return res.status(400).json({ error: '机型短码仅允许字母和数字' });
      if (!full_name) return res.status(400).json({ error: '请填写机型全称' });
      const created = await D.createModel({ code: code, full_name: full_name, created_by: u.id });
      invalidateModelCaches();
      res.json(created);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return res.status(409).json({ error: '机型短码或全称已存在' });
      logger.error('新增机型失败: ' + (err.message || String(err)));
      res.status(500).json({ error: '新增机型失败：' + (err.message || '服务器内部错误') });
    }
  });

  app.delete('/api/samples/models/:id', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    if (!['RD', 'ADMIN'].includes(u.role)) return res.status(403).json({ error: '无权限：仅研发或管理员可维护机型' });
    const m = await D.getModelById(Number(req.params.id));
    if (!m) return res.status(404).json({ error: '机型不存在' });
    const used = await D.countSamplesByModel(m.code);
    if (used > 0) return res.status(409).json({ error: '该机型已被 ' + used + ' 个样品使用，禁止删除' });
    await D.deleteModel(m.id);
    invalidateModelCaches();
    res.json({ ok: true });
  }));
}

module.exports = { register };
