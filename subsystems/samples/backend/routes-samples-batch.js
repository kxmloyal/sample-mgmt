// subsystems/samples/backend/routes-samples-batch.js — 批量新建样品（2026-09-17 自 routes-samples.js 外迁）
// 外迁原因：该处理器是 routes-samples.js 内最大单块（3,437 字符 / 59 行），主文件已因写入口白名单与
//   多角色鉴权修复升至 92.1%（§7.1 的 90% 线之上）——外迁使其回到 75% 区间，符合「已达上限仅允许精简/重构」。
// 注册顺序（MUST，见 backend/index.js）：本文件须在 routes-samples 之前注册——/api/samples/:id 会贪婪捕获同前缀路径。
// 行级 sample_type 与建样/PUT/扫码入口共用同一白名单校验器（§25.3.3）。
const D = require('../../../db');
const { STATION_GROUPS } = require('../db/sample-code');
const { logger } = require('../../../logger');
const { isValidSampleType, primaryRole, SAMPLE_TYPE_MSG } = require('./sample-type');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  const hasRole = app.locals.hasRole;

  app.post('/api/samples/batch', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (!hasRole(u, ['RD', 'ADMIN']))
        return res.status(403).json({ error: '无权限：仅研发可新建样品' });
      const _b = req.body || {};
      const model = (_b.model || '').trim();
      const cardVersion = (_b.card_version || '').trim() || '01';
      const src = ((_b.source_type) || '').toUpperCase();
      const station = ((_b.station) || '').trim();
      const items = Array.isArray(_b.items) ? _b.items : [];
      if (!model || model.length < 6) return res.status(400).json({ error: '机型编码至少 6 位' });
      if (!['C', 'T', 'G'].includes(src)) return res.status(400).json({ error: '请选择有效的提供处（C/T/G）' });
      if (!STATION_GROUPS.includes(station)) return res.status(400).json({ error: '请选择有效的组别' });
      if (!items.length) return res.status(400).json({ error: '请至少填写一条样品' });
      if (items.length > 50) return res.status(400).json({ error: '单次最多创建 50 条样品' });
      const m = await D.getModelByCode(model);
      if (!m) return res.status(400).json({ error: '机型不存在，请先在机型列表添加该机型' });
      const cleaned = items.map((it, idx) => {
        const name = ((it || {}).name || '').trim();
        if (!name) { const e = new Error('第 ' + (idx + 1) + ' 行：样品名称必填'); e.status = 400; throw e; }
        const st = ((it || {}).sample_type || '').trim(); // 行级白名单：与建样/PUT/扫码入口同一校验器（§25.3.3）
        if (!isValidSampleType(st)) { const e = new Error('第 ' + (idx + 1) + ' 行：' + SAMPLE_TYPE_MSG); e.status = 400; throw e; }
        return {
          name,
          notes: ((it || {}).notes || '').trim(),
          sample_type: st,
          limit_item: ((it || {}).limit_item || '').trim(),
          test_standard: ((it || {}).test_standard || '').trim()
        };
      });
      const created = await D.withTransaction(async conn => {
        const out = [];
        for (let i = 0; i < cleaned.length; i++) {
          const ns = await D.createSample({
            name: cleaned[i].name, spec: m.full_name || '', model,
            station, notes: cleaned[i].notes, image: '',
            created_by: u.id,
            sample_type: cleaned[i].sample_type, limit_item: cleaned[i].limit_item,
            source_type: src,
            card_version: cardVersion, test_standard: cleaned[i].test_standard,
            test_data: '',
            signed_by_rd: u.display_name || u.username,
            signed_by_qa: ''
          }, conn);
          await D.addLog({ sample_id: ns.id, action: 'CREATE', role: primaryRole(u), user_id: u.id, dept: u.dept, note: '批量新建样品（第' + (i + 1) + '条/共' + cleaned.length + '条）' }, conn);
          out.push({ id: ns.id, sample_no: ns.sample_no, name: ns.name });
        }
        return out;
      });
      res.json({ created: created.length, samples: created });
    } catch (err) {
      // 业务态白名单：行级提示与流水号上限保留原文案（§25.2.3）
      const bizMsg = (err.status || (err.message && err.message.includes('上限'))) ? err.message : null;
      const status = err.status || (bizMsg ? 400 : 500);
      if (status >= 500) logger.error('批量新建样品失败: ' + (err.message || String(err)));
      res.status(status).json({ error: bizMsg || '批量创建失败，请联系管理员' });
    }
  });
}

module.exports = { register };
