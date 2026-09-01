// routes/samples.js — 样品 CRUD（列表/详情/新建/删除/更新 + saveSampleImage）
const path = require('path');
const fs = require('fs');
const D = require('../../../db');
const { STATION_GROUPS, generateSampleCode, previewSampleCode } = require('../db/sample-code');
const { logger } = require('../../../logger');
const { asyncHandler } = require('./async-handler');
const { toCsv, sendCsv } = require('../../../shared/csv');
const cache = require('../../../shared/cache');

// 机型主数据为共享表(sample_models)：写入后须失效样品侧机型/下拉缓存
const MODEL_CACHE_KEYS = ['sl_sample_models', 'sl_sample_model_options'];
function invalidateModelCaches() { MODEL_CACHE_KEYS.forEach(function (k) { cache.del(k); }); }

const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
const UPLOAD_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '5242880', 10);

// 保存样品图片（同步落盘后再返回 URL，避免 DB 入库但文件未写入的脏数据）
async function saveSampleImage(dataUrl, sampleNo) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const m = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!m) return null;
  let ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  if (!['jpg', 'png', 'gif', 'webp'].includes(ext)) return null;
  const size = Buffer.byteLength(m[2], 'base64');
  if (size > UPLOAD_MAX_SIZE) { logger.warn('图片过大:' + size); return null; }
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fname = sampleNo + '.' + ext;
  const filePath = path.join(UPLOAD_DIR, fname);
  try {
    await fs.promises.writeFile(filePath, Buffer.from(m[2], 'base64'));
    return '/uploads/' + fname;
  } catch (e) { logger.error('保存图片失败: ' + e.message); return null; }
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  app.get('/api/samples', requireAuth, asyncHandler(async (req, res) => {
    const { status, dept, q, sort, overdue, sample_type, limit_item, source_type, model, limit, offset } = req.query;
    const pageLimit = Math.min(parseInt(limit || '20', 10) || 20, 200);
    const pageOffset = Math.max(parseInt(offset || '0', 10) || 0, 0);
    const filterOpts = {
      status: status || undefined,
      dept: dept || undefined,
      search: q || undefined,
      sort: sort || undefined,
      overdue: overdue || undefined,
      sample_type: sample_type || undefined,
      limit_item: limit_item || undefined,
      source_type: source_type || undefined,
      model: model || undefined
    };
    const [samples, total] = await Promise.all([
      D.listSamples({ ...filterOpts, limit: pageLimit, offset: pageOffset }),
      D.countAllSamples(filterOpts)
    ]);
    res.json({ samples, total, limit: pageLimit, offset: pageOffset });
  }));

  // 导出列表 CSV（复用列表筛选参数，忽略分页取全量；AGENTS.md §21 列表导出标准）
  // 注意：须注册在 GET /api/samples/:id 之前，避免 'export' 被 :id 捕获
  const SAMPLE_STATUS_CN = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已作废' };
  const INSPECT_SOON_DAYS = 7;

  /** 时间列格式化：mysql2 默认将 TIMESTAMP 列返回 Date 对象，统一转 ISO 后取 YYYY-MM-DD HH:mm；null/空 → '' */
  function fmtTime(v) {
    if (v == null || v === '') return '';
    const s = v instanceof Date ? v.toISOString() : String(v);
    return s.slice(0, 16).replace('T', ' ');
  }

  /** 复检状态中文（与前端 list-inspect.js 判定一致：正常/近7天到期/逾期N天/—） */
  function inspectStateCn(row) {
    if (!row || !row.next_inspect_at) return '—';
    const t = new Date(row.next_inspect_at).getTime();
    if (t < Date.now()) return '逾期' + Math.ceil((Date.now() - t) / 86400000) + '天';
    if (t <= Date.now() + INSPECT_SOON_DAYS * 86400000) return '近7天到期';
    return '正常';
  }

  app.get('/api/samples/export', requireAuth, asyncHandler(async (req, res) => {
    const { status, dept, q, sort, overdue, sample_type, limit_item, source_type, model } = req.query;
    const filterOpts = {
      status: status || undefined, dept: dept || undefined, search: q || undefined,
      sort: sort || undefined, overdue: overdue || undefined,
      sample_type: sample_type || undefined, limit_item: limit_item || undefined,
      source_type: source_type || undefined, model: model || undefined
    };
    const samples = await D.listSamples(filterOpts); // 不传 limit/offset → 全量（与列表同排序）
    const cols = [
      { key: 'sample_no', label: '编号' },
      { key: 'name', label: '名称' },
      { key: 'model', label: '机型' },
      { key: 'station', label: '站别' },
      { key: 'spec', label: '规格' },
      { key: 'sample_type', label: '类型', fmt: v => (v === 'OK' ? 'OK样品' : v === 'NG' ? 'NG样品' : (v || '')) },
      { key: 'status', label: '状态', fmt: v => SAMPLE_STATUS_CN[v] || v },
      { key: 'next_inspect_at', label: '复检状态', fmt: (v, row) => inspectStateCn(row) },
      { key: 'produced_at', label: '制作时间', fmt: v => fmtTime(v) },
      { key: 'released_at', label: '发行时间', fmt: v => fmtTime(v) },
      { key: 'custody_dept', label: '保管部门' },
      { key: 'storage_location', label: '储位' },
      { key: 'next_inspect_at', label: '复检到期', fmt: v => fmtTime(v) },
      { key: 'updated_at', label: '更新时间', fmt: v => fmtTime(v) }
    ];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    sendCsv(res, 'samples-' + stamp + '.csv', toCsv(samples, cols));
  }));

  // 编号预览（只读，不落库、不消耗序号；须注册在 /:id 之前）——生成后编号以提交实际结果为准
  app.get('/api/samples/code-preview', requireAuth, async (req, res) => {
    const { source_type, model, station, card_version } = req.query;
    try {
      const sample_no = await previewSampleCode({
        source_type, model, station, card_version,
        query: async (sql, params) => (await D.pool().execute(sql, params || []))[0]
      });
      res.json({ sample_no });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  // 机型列表：GET 所有登录角色可读（新建下拉/筛选数据源）；POST/DELETE 仅 RD/ADMIN（须注册在 /:id 之前）
  // 字典缓存：机型为低变数据，TTL 60s；写操作走 invalidateModelCaches 即时失效（见 AGENTS.md 性能优化）
  app.get('/api/samples/models', requireAuth, asyncHandler(async (req, res) => {
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

  app.get('/api/samples/:id', requireAuth, asyncHandler(async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.json({ ...s, logs: await D.listLogsBySample(s.id) });
  }));

  // 新建样品（研发或管理员）
  app.post('/api/samples', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!['RD', 'ADMIN'].includes(u.role))
        return res.status(403).json({ error: '无权限：仅研发可新建样品' });
      const { name, spec, model, station, notes,
        sample_type, limit_item, source_type, valid_until, card_version,
        test_standard, test_data } = req.body || {};
      if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
      const src = (source_type || '').toUpperCase();
      if (!['C', 'T', 'G'].includes(src)) return res.status(400).json({ error: '请选择有效的提供处（C/T/G）' });
      if (!model || model.trim().length < 6) return res.status(400).json({ error: '机型编码至少 6 位' });
      const m = await D.getModelByCode(model.trim());
      if (!m) return res.status(400).json({ error: '机型不存在，请先在机型列表添加该机型' });
      if (!STATION_GROUPS.includes(station)) return res.status(400).json({ error: '请选择有效的组别' });
      const s = await D.withTransaction(async conn => {
        const ns = await D.createSample({
          name: name.trim(), spec: spec || '', model: model.trim(), station,
          notes: notes || '', image: '', created_by: u.id,
          sample_type: sample_type || '', limit_item: limit_item || '',
          source_type: src, valid_until: valid_until || '',
          card_version: (card_version || '').trim() || '01', test_standard: test_standard || '',
          test_data: test_data || '',
          signed_by_rd: u.display_name || u.username,
          signed_by_qa: ''
        }, conn);
        await D.addLog({ sample_id: ns.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '新建样品' }, conn);
        return ns;
      });
      res.json(s);
    } catch (err) {
      // 流水号达 999 上限等运行时编码错误降级为 400
      if (err.message && err.message.includes('上限')) return res.status(400).json({ error: err.message });
      logger.error('新建样品失败: ' + (err.message || String(err)));
      res.status(500).json({ error: '新建样品失败：' + (err.message || '服务器内部错误') });
    }
  });

  // 删除样品（仅NEW/PRODUCED，仅ADMIN或创建者可删；2026-08-06 P2-2 收紧：RD 不再无条件放行）
  app.delete('/api/samples/:id', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    if (!['NEW', 'PRODUCED'].includes(s.status))
      return res.status(400).json({ error: '仅允许取消NEW或PRODUCED状态的样品' });
    if (u.role !== 'ADMIN' && s.created_by !== u.id)
      return res.status(403).json({ error: '无权限：仅管理员或创建者可取消' });
    await D.deleteSample(s.id);
    logger.info('样品已取消: '+s.sample_no+' by '+u.username);
    res.json({ ok: true });
  }));

  // 更新样品限度信息（RD/QA/ADMIN）
  app.put('/api/samples/:id', requireAuth, asyncHandler(async (req, res) => {
    const u = await currentUser(req);
    if (!['RD', 'QA', 'ADMIN'].includes(u.role))
      return res.status(403).json({ error: '无权限：仅研发/品保/管理员可编辑' });
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    // 标示卡锁定：RELEASED/IN_CUSTODY/RETURNING/RETIRED 状态不允许修改
    const lockedStatuses = ['RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'];
    if (lockedStatuses.includes(s.status))
      return res.status(409).json({ error: '标示卡已锁定：样品已发行，不可修改。如需修改请联系管理员' });

    const { sample_type, limit_item, source_type, card_version,
      test_standard, test_data, version } = req.body || {};

    // 乐观锁 CAS（T5）：version 可选——旧客户端不传则行为完全不变（§11 出入参兼容）；
    // 传入时必须是非负整数，否则 400
    if (version !== undefined && version !== null &&
        (typeof version !== 'number' || !Number.isInteger(version) || version < 0))
      return res.status(400).json({ error: 'version 必须是非负整数' });

    const updated = { ...s,
      sample_type: sample_type !== undefined ? sample_type : s.sample_type,
      limit_item: limit_item !== undefined ? limit_item : s.limit_item,
      source_type: source_type !== undefined ? source_type : s.source_type,
      card_version: card_version !== undefined ? card_version : s.card_version,
      test_standard: test_standard !== undefined ? test_standard : s.test_standard,
      test_data: test_data !== undefined ? test_data : s.test_data,
      // 签名字段服务端派生：仅对应角色可签名，禁止客户端伪造他人签名
      signed_by_rd: u.role === 'RD' ? (u.display_name || u.username) : s.signed_by_rd,
      signed_by_qa: u.role === 'QA' ? (u.display_name || u.username) : s.signed_by_qa
    };

    // 更新 + 审计日志原子提交；携带 version 时走 CAS 乐观锁，
    // 版本冲突（他人已抢先修改）时 updateSample 抛 code='CONFLICT'，此处转 409
    try {
      const result = await D.withTransaction(async conn => {
        const r = await D.updateSample(updated, conn, version);
        await D.addLog({ sample_id: s.id, action: 'UPDATE_CARD', role: u.role, user_id: u.id, dept: u.dept, note: '更新标示卡信息' }, conn);
        return r;
      });
      res.json({ ...result, logs: await D.listLogsBySample(s.id) });
    } catch (err) {
      if (err && err.code === 'CONFLICT')
        return res.status(409).json({ error: '该样品刚被他人修改，请刷新后重试' });
      throw err;
    }
  }));

  // 导出 saveSampleImage 供 scan 路由复用
  app.locals.saveSampleImage = saveSampleImage;
}

module.exports = { register };
