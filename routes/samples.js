// routes/samples.js — 样品 CRUD（列表/详情/新建/删除/更新 + saveSampleImage）
const path = require('path');
const fs = require('fs');
const D = require('../db');
const { logger } = require('../logger');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
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

  app.get('/api/samples', requireAuth, async (req, res) => {
    const { status, dept, q, sort, overdue, sample_type, limit_item, source_type, limit, offset } = req.query;
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
      source_type: source_type || undefined
    };
    const [samples, total] = await Promise.all([
      D.listSamples({ ...filterOpts, limit: pageLimit, offset: pageOffset }),
      D.countAllSamples(filterOpts)
    ]);
    res.json({ samples, total, limit: pageLimit, offset: pageOffset });
  });

  app.get('/api/samples/:id', requireAuth, async (req, res) => {
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    res.json({ ...s, logs: await D.listLogsBySample(s.id) });
  });

  // 新建样品（研发或管理员）
  app.post('/api/samples', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    if (!['RD', 'ADMIN'].includes(u.role))
      return res.status(403).json({ error: '无权限：仅研发可新建样品' });
    const { name, spec, model, station, notes,
      sample_type, limit_item, source_type, valid_until, card_version,
      test_standard, test_data } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
    const s = await D.createSample({
      name: name.trim(), spec: spec || '', model: model || '', station: station || '',
      notes: notes || '', image: '', created_by: u.id,
      sample_type: sample_type || '', limit_item: limit_item || '',
      source_type: source_type || '', valid_until: valid_until || '',
      card_version: card_version || '', test_standard: test_standard || '',
      test_data: test_data || '',
      signed_by_rd: u.display_name || u.username,
      signed_by_qa: ''
    });
    await D.addLog({ sample_id: s.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '新建样品' });
    res.json(s);
  });

  // 删除样品（仅NEW/PRODUCED，ADMIN或创建者或RD可删）
  app.delete('/api/samples/:id', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const s = await D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '样品不存在' });
    if (!['NEW', 'PRODUCED'].includes(s.status))
      return res.status(400).json({ error: '仅允许取消NEW或PRODUCED状态的样品' });
    if (u.role !== 'ADMIN' && u.role !== 'RD' && s.created_by !== u.id)
      return res.status(403).json({ error: '无权限：仅ADMIN、研发或创建者可取消' });
    await D.deleteSample(s.id);
    logger.info('样品已取消: '+s.sample_no+' by '+u.username);
    res.json({ ok: true });
  });

  // 更新样品限度信息（RD/QA/ADMIN）
  app.put('/api/samples/:id', requireAuth, async (req, res) => {
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
      test_standard, test_data, signed_by_rd, signed_by_qa } = req.body || {};

    let qaSigner = signed_by_qa;
    if (u.role === 'QA') qaSigner = u.display_name || u.username;

    const updated = { ...s,
      sample_type: sample_type !== undefined ? sample_type : s.sample_type,
      limit_item: limit_item !== undefined ? limit_item : s.limit_item,
      source_type: source_type !== undefined ? source_type : s.source_type,
      card_version: card_version !== undefined ? card_version : s.card_version,
      test_standard: test_standard !== undefined ? test_standard : s.test_standard,
      test_data: test_data !== undefined ? test_data : s.test_data,
      signed_by_rd: signed_by_rd !== undefined ? signed_by_rd : s.signed_by_rd,
      signed_by_qa: qaSigner !== undefined ? qaSigner : s.signed_by_qa
    };

    const result = await D.updateSample(updated);
    await D.addLog({ sample_id: s.id, action: 'UPDATE_CARD', role: u.role, user_id: u.id, dept: u.dept, note: '更新标示卡信息' });
    res.json({ ...result, logs: await D.listLogsBySample(s.id) });
  });

  // 导出 saveSampleImage 供 scan 路由复用
  app.locals.saveSampleImage = saveSampleImage;
}

module.exports = { register };
