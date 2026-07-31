// routes/scan.js — 扫码台：解析 + 状态机
const D = require('../db');

const STATUS_LABEL = {
  NEW: '新建(待制作确认)', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已作废'
};

function allowedActions(role, status, next_inspect_at, retire_assigned_rd, currentUserId) {
  const actions = [];

  if (role === 'RD' && status === 'NEW') actions.push('PRODUCE');
  if (role === 'QA' && status === 'PRODUCED') actions.push('RELEASE');
  // 保管单位（CUSTODY + ME）扫已发行样品 → 接收保管
  if ((role === 'CUSTODY' || role === 'ME') && status === 'RELEASED') actions.push('CUSTODY');

  // QA 扫 RELEASED：复检（不限到期）+ 修正标示卡
  if (role === 'QA' && status === 'RELEASED') { actions.push('INSPECT'); actions.push('EDIT_CARD'); }

  // 保管单位扫 IN_CUSTODY：修改储位 + 申请退回
  if ((role === 'CUSTODY' || role === 'ME') && status === 'IN_CUSTODY') { actions.push('EDIT_STORAGE'); actions.push('RETURN_REQUEST'); }

  // 品保审核退回（4 分支）
  if (role === 'QA' && status === 'RETURNING') { actions.push('RE_RELEASE'); actions.push('RETIRE_RECREATE'); actions.push('RETIRE_ONLY'); actions.push('RETURN_REJECT'); }

  // RD 重做替代品（retire_assigned_rd 存用户 ID，用字符串比较兼容 int/string）
  if (role === 'RD' && status === 'RETURNING' && String(retire_assigned_rd) === String(currentUserId)) actions.push('RECREATE');

  return actions;
}

// 计算下一个版次号
// 规则：存储为字符串 "01"~"99"（两位整数，padStart 补零）
// 兼容旧格式 V1.0/A1 等取首个数字部分 +1；无数字时从 "01" 开始
// 上限 99，到达后保持 99 不再递增
function nextCardVersion(current) {
  const m = String(current||'').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return String(Math.min(n + 1, 99)).padStart(2, '0');
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  const saveSampleImage = app.locals.saveSampleImage;

  // 解析扫码内容
  app.get('/api/resolve', requireAuth, async (req, res) => {
    const code = (req.query.code || '').trim();
    if (!code) return res.status(400).json({ error: '无效码' });
    let s = await D.getSampleByNo(code) || await D.getSampleByToken(code);
    if (!s) return res.status(404).json({ error: '未找到对应样品：' + code });
    const u = await currentUser(req);
    const actions = allowedActions(u.role, s.status, s.next_inspect_at, s.retire_assigned_rd, String(u.id));
    // 仅 RETURNING 状态下按需加载 RD 用户（SQL WHERE 过滤，避免全量 listUsers 内存过滤）
    const rdUsers = s.status === 'RETURNING'
      ? (await D.listRdUsers()).map(x => ({ id: x.id, display_name: x.display_name || x.username, dept: x.dept }))
      : [];
    res.json({ sample: s, allowedActions: actions, rdUsers });
  });

  // 扫码状态机
  app.post('/api/scan', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const { code, location, cycleDays, note } = req.body || {};
    const bodyAction = (req.body.action || '').trim();
    const scanCode = (code || '').trim();
    if (!scanCode) return res.status(400).json({ error: '未提供扫码内容' });

    const s = await D.getSampleByNo(scanCode) || await D.getSampleByToken(scanCode);
    if (!s) return res.status(404).json({ error: '未找到对应样品：' + scanCode });

    const actions = allowedActions(u.role, s.status, s.next_inspect_at, s.retire_assigned_rd, String(u.id));
    const chosenAction = bodyAction || actions[0];
    if (!chosenAction || !actions.includes(chosenAction))
      return res.status(409).json({
        error: `当前角色(${u.role})无法对状态为「${STATUS_LABEL[s.status] || s.status}」的样品执行「${chosenAction}」操作`,
        sample: s
      });

    const ts = D.nowISO();
    const updated = { ...s, updated_at: ts };

    if (chosenAction === 'PRODUCE') {
      const img = req.body.image;
      if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传制作照片' });
      const prodImgUrl = await saveSampleImage(img, s.sample_no + '_prod');
      if (prodImgUrl) updated.produced_image = prodImgUrl;
      updated.status = 'PRODUCED';
      updated.produced_at = ts;
      updated.signed_by_rd = u.display_name || u.username;
      await D.addLog({ sample_id: s.id, action: 'PRODUCE', role: u.role, user_id: u.id, dept: u.dept, note: note || '研发确认制作完成' });
    } else if (chosenAction === 'RELEASE') {
      const cyc = Number(cycleDays);
      if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
      const { sample_type, limit_item, source_type, card_version, test_standard, test_data } = (req.body || {});
      if (!sample_type || !sample_type.trim()) return res.status(400).json({ error: '请选择样品类型（OK样品/NG样品）' });
      if (!limit_item || !limit_item.trim()) return res.status(400).json({ error: '请选择限度项目' });
      const d = new Date(ts); d.setDate(d.getDate() + cyc);
      updated.status = 'RELEASED';
      updated.released_at = ts;
      updated.release_cycle_days = cyc;
      updated.next_inspect_at = d.toISOString();
      updated.sample_type = sample_type.trim();
      updated.limit_item = limit_item.trim();
      if (source_type) updated.source_type = source_type.trim();
      updated.valid_until = updated.next_inspect_at;
      updated.card_version = (card_version && card_version.trim()) || '01';
      if (test_standard) updated.test_standard = test_standard.trim();
      if (test_data) updated.test_data = test_data.trim();
      updated.signed_by_qa = u.display_name || u.username;
      await D.addLog({ sample_id: s.id, action: 'RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: `正式发行，复检周期${cyc}天，标示卡已签署` });
    } else if (chosenAction === 'INSPECT') {
      const img = req.body.image;
      if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传复检照片' });
      const inspImgUrl = await saveSampleImage(img, s.sample_no + '_insp');
      const cyc = Number(cycleDays) || s.release_cycle_days || 90;
      const d = new Date(ts); d.setDate(d.getDate() + cyc);
      if (inspImgUrl) updated.inspect_image = inspImgUrl;
      updated.next_inspect_at = d.toISOString();
      updated.valid_until = updated.next_inspect_at;
      const { card_version, test_data } = req.body || {};
      if (card_version) updated.card_version = card_version;
      if (test_data) updated.test_data = test_data;
      const cardUpdated = (card_version||test_data)?'、「标示卡已更新」':'';
      const isEarly = s.next_inspect_at && new Date(s.next_inspect_at).getTime() > Date.now();
      await D.addLog({ sample_id: s.id, action: isEarly ? 'INSPECT_EARLY' : 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次周期' + cyc + '天' + cardUpdated) });
    } else if (chosenAction === 'CUSTODY') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写保管储位' });
      updated.status = 'IN_CUSTODY';
      updated.custody_dept = u.dept;
      updated.storage_location = location.trim();
      await D.addLog({ sample_id: s.id, action: 'CUSTODY', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '部门接收保管' });
    }
    // === 新增 Action ===
    else if (chosenAction === 'EDIT_CARD') {
      const { sample_type, limit_item, source_type, card_version, test_data } = req.body || {};
      if (sample_type) updated.sample_type = sample_type.trim();
      if (limit_item) updated.limit_item = limit_item.trim();
      if (source_type) updated.source_type = source_type.trim();
      if (card_version !== undefined) updated.card_version = card_version.trim();
      if (test_data !== undefined) updated.test_data = test_data.trim();
      updated.signed_by_qa = u.display_name || u.username;
      await D.addLog({ sample_id: s.id, action: 'EDIT_CARD', role: u.role, user_id: u.id, dept: u.dept, note: note || '修正标示卡' });
    } else if (chosenAction === 'EDIT_STORAGE') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写新储位' });
      updated.storage_location = location.trim();
      await D.addLog({ sample_id: s.id, action: 'EDIT_STORAGE', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '修改储位' });
    } else if (chosenAction === 'RETURN_REQUEST') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写退回原因' });
      updated.status = 'RETURNING';
      await D.addLog({ sample_id: s.id, action: 'RETURN_REQUEST', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    } else if (chosenAction === 'RE_RELEASE') {
      const cyc = Number(cycleDays);
      if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
      const { sample_type, limit_item, source_type, card_version, test_data } = req.body || {};
      if (!sample_type || !sample_type.trim()) return res.status(400).json({ error: '请选择样品类型' });
      if (!limit_item || !limit_item.trim()) return res.status(400).json({ error: '请选择限度项目' });
      const d = new Date(ts); d.setDate(d.getDate() + cyc);
      updated.status = 'RELEASED';
      updated.released_at = ts;
      updated.release_cycle_days = cyc;
      updated.next_inspect_at = d.toISOString();
      updated.valid_until = updated.next_inspect_at;
      updated.sample_type = sample_type.trim();
      updated.limit_item = limit_item.trim();
      if (source_type) updated.source_type = source_type.trim();
      updated.card_version = (card_version && card_version.trim()) || nextCardVersion(s.card_version);
      if (test_data) updated.test_data = test_data.trim();
      updated.signed_by_qa = u.display_name || u.username;
      updated.retire_assigned_rd = null;
      updated.retired_reason = null;
      await D.addLog({ sample_id: s.id, action: 'RE_RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: '品保确认重新发行，周期' + cyc + '天' });
    } else if (chosenAction === 'RETIRE_RECREATE') {
      const assignedRd = (req.body.retire_assigned_rd || '').trim();
      if (!assignedRd) return res.status(400).json({ error: '请选择指派重新制作的研发人员' });
      // 保持 RETURNING 状态，仅设置指派信息，等待 RD 扫码执行 RECREATE
      updated.retired_reason = note || '退回研发重新制作';
      updated.retire_assigned_rd = assignedRd;
      const assignedUser = await D.getUserById(Number(assignedRd));
      const assignedLabel = assignedUser ? (assignedUser.display_name || assignedUser.username) : assignedRd;
      await D.addLog({ sample_id: s.id, action: 'RETIRE_RECREATE', role: u.role, user_id: u.id, dept: u.dept, note: '退回研发重新制作，指派 ' + assignedLabel });
    } else if (chosenAction === 'RETIRE_ONLY') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写作废原因' });
      updated.status = 'RETIRED';
      updated.retired_reason = note.trim();
      await D.addLog({ sample_id: s.id, action: 'RETIRE_ONLY', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    } else if (chosenAction === 'RETURN_REJECT') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写拒绝理由' });
      updated.status = 'IN_CUSTODY';
      updated.retire_assigned_rd = null;
      updated.retired_reason = null;
      await D.addLog({ sample_id: s.id, action: 'RETURN_REJECT', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
    } else if (chosenAction === 'RECREATE') {
      // 4 步写事务：createSample(新) + updateSample(旧→RETIRED) + 2 addLog
      const newSample = await D.withTransaction(async conn => {
        const ns = await D.createSample({
          name: s.name, spec: s.spec, model: s.model, station: s.station,
          sample_type: s.sample_type, limit_item: s.limit_item, source_type: s.source_type,
          card_version: s.card_version, test_standard: s.test_standard, test_data: s.test_data,
          signed_by_rd: u.display_name || u.username, signed_by_qa: s.signed_by_qa,
          notes: '替代已作废样品 ' + s.sample_no, created_by: u.id, replaces: s.sample_no
        }, conn);
        const oldUpdated = { ...s, status: 'RETIRED', replaced_by: ns.sample_no, updated_at: ts };
        await D.updateSample(oldUpdated, conn);
        await D.addLog({ sample_id: s.id, action: 'RECREATE_REPLACED', role: u.role, user_id: u.id, dept: u.dept, note: '由 ' + ns.sample_no + ' 替代' }, conn);
        await D.addLog({ sample_id: ns.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '替代 ' + s.sample_no }, conn);
        return ns;
      });
      res.json({ sample: newSample, replaced: s.sample_no, action: 'RECREATE', message: '替代样品已创建：' + newSample.sample_no });
      return;
    }

    const result = await D.updateSample(updated);
    const printCard = (chosenAction === 'RELEASE' || chosenAction === 'RE_RELEASE' || chosenAction === 'EDIT_CARD');
    res.json({ sample: result, action: chosenAction, message: `操作成功：${chosenAction}`, printCard });
  });
}

module.exports = { register };
