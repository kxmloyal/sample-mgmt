// routes/scan.js — 扫码台：解析 + 状态机
const D = require('../../../db');
const { asyncHandler } = require('./async-handler');

// 保管中复检开放窗口口径：距下次复检日 ≤ 7 天（含已逾期）时，QA 扫 IN_CUSTODY 样品出现 INSPECT_CUSTODY 动作
var INSPECT_EARLY_DAYS = 7;

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

  // QA 扫 IN_CUSTODY 且临期/逾期（距复检日 ≤ INSPECT_EARLY_DAYS 天）：保管中复检（自环，样品不脱离保管）
  if (role === 'QA' && status === 'IN_CUSTODY' && next_inspect_at &&
      new Date(next_inspect_at).getTime() - Date.now() <= INSPECT_EARLY_DAYS * 86400000) {
    actions.push('INSPECT_CUSTODY');
  }

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

// 生成 YYYYMMDD-HHmmss 时间戳（本地时区），用于复检照片文件名时间戳化、避免多次复检互相覆盖
function tsStamp(d) {
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

// 解析复检周期：显式传入时须为 1~3650 的整数；未传沿用样品原周期；原周期也为空则提示必填
// （T3 起禁止 || 90 之类的静默兜底，避免错误周期悄悄入库）
function resolveCycleDays(cycleDays, fallback) {
  if (cycleDays !== undefined && cycleDays !== null && String(cycleDays).trim() !== '') {
    const n = Number(cycleDays);
    if (!Number.isInteger(n) || n < 1 || n > 3650) return { error: '复检周期须为 1~3650 天的整数' };
    return { cyc: n };
  }
  const f = Number(fallback);
  if (Number.isInteger(f) && f >= 1 && f <= 3650) return { cyc: f };
  return { error: '请填写复检周期（天）' };
}

// INSPECT / INSPECT_CUSTODY 共用复检逻辑（§15 禁止复制粘贴，差异点由 opts 注入）：
// 校验并保存复检照片 → 解析周期 → 顺延 next_inspect_at/valid_until → 可选版次自动 +1 → 可选状态自环
// opts: { photoName 照片文件名基名, bumpVersion 版次自动 +1, keepStatus 状态自环, saveImage 图片保存函数 }
// 返回 { status, error }（路由直接回 HTTP）或 { cyc }（成功，updated 已被就地改写）
async function applyInspect(req, s, updated, ts, opts) {
  const img = req.body.image;
  if (!img || typeof img !== 'string') return { status: 400, error: '请上传复检照片' };
  const inspImgUrl = await opts.saveImage(img, opts.photoName);
  if (!inspImgUrl) return { status: 500, error: '复检照片保存失败，请重试' };
  const r = resolveCycleDays(req.body.cycleDays, s.release_cycle_days);
  if (r.error) return { status: 400, error: r.error };
  const d = new Date(ts); d.setUTCDate(d.getUTCDate() + r.cyc);
  updated.inspect_image = inspImgUrl;
  updated.next_inspect_at = d.toISOString();
  updated.valid_until = updated.next_inspect_at;
  if (opts.keepStatus) updated.status = opts.keepStatus;
  const { card_version, test_data } = req.body || {};
  if (opts.bumpVersion) updated.card_version = nextCardVersion(s.card_version);
  else if (card_version) updated.card_version = card_version;
  if (test_data) updated.test_data = test_data;
  return { cyc: r.cyc };
}

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;
  const saveSampleImage = app.locals.saveSampleImage;

  // 解析扫码内容
  app.get('/api/resolve', requireAuth, asyncHandler(async (req, res) => {
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
  }));

  // 扫码状态机
  app.post('/api/scan', requireAuth, async (req, res) => {
    try {
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
    var logData = null;

    if (chosenAction === 'PRODUCE') {
      const img = req.body.image;
      if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传制作照片' });
      const prodImgUrl = await saveSampleImage(img, s.sample_no + '_prod');
      if (!prodImgUrl) return res.status(500).json({ error: '制作照片保存失败，请重试' });
      updated.produced_image = prodImgUrl;
      updated.status = 'PRODUCED';
      updated.produced_at = ts;
      updated.signed_by_rd = u.display_name || u.username;
      logData = { sample_id: s.id, action: 'PRODUCE', role: u.role, user_id: u.id, dept: u.dept, note: note || '研发确认制作完成' };
    } else if (chosenAction === 'RELEASE') {
      const cyc = Number(cycleDays);
      if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
      const { sample_type, limit_item, source_type, card_version, test_standard, test_data } = (req.body || {});
      if (!sample_type || !sample_type.trim()) return res.status(400).json({ error: '请选择样品类型（OK样品/NG样品）' });
      if (!limit_item || !limit_item.trim()) return res.status(400).json({ error: '请选择限度项目' });
      const d = new Date(ts); d.setUTCDate(d.getUTCDate() + cyc);
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
      logData = { sample_id: s.id, action: 'RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: `正式发行，复检周期${cyc}天，标示卡已签署` };
    } else if (chosenAction === 'INSPECT') {
      // 已发行样品复检：沿用旧文件名（_insp 固定名），版次不自动递增（由标示卡修正流程管理）
      const r = await applyInspect(req, s, updated, ts, { photoName: s.sample_no + '_insp', saveImage: saveSampleImage });
      if (r.error) return res.status(r.status).json({ error: r.error });
      const { card_version, test_data } = req.body || {};
      const cardUpdated = (card_version||test_data)?'、「标示卡已更新」':'';
      const isEarly = s.next_inspect_at && new Date(s.next_inspect_at).getTime() > Date.now();
      logData = { sample_id: s.id, action: isEarly ? 'INSPECT_EARLY' : 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次周期' + r.cyc + '天' + cardUpdated) };
    } else if (chosenAction === 'INSPECT_CUSTODY') {
      // 保管中复检：IN_CUSTODY 自环（样品不脱离保管）；照片文件名时间戳化防覆盖；标示卡版次自动 +1
      const r = await applyInspect(req, s, updated, ts, {
        photoName: s.sample_no + '_insp_' + tsStamp(new Date()),
        bumpVersion: true, keepStatus: 'IN_CUSTODY', saveImage: saveSampleImage
      });
      if (r.error) return res.status(r.status).json({ error: r.error });
      const oldVer = s.card_version || '01';
      logData = { sample_id: s.id, action: 'INSPECT_CUSTODY', role: u.role, user_id: u.id, dept: u.dept,
        note: note || ('保管中复检通过，标示卡版次 ' + oldVer + '→' + updated.card_version + '，周期' + r.cyc + '天') };
    } else if (chosenAction === 'CUSTODY') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写保管储位' });
      updated.status = 'IN_CUSTODY';
      updated.custody_dept = u.dept;
      updated.storage_location = location.trim();
      logData = { sample_id: s.id, action: 'CUSTODY', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '部门接收保管' };
    }
    // === 新增 Action ===
    else if (chosenAction === 'EDIT_CARD') {
      const { sample_type, limit_item, source_type, card_version, test_data, test_standard } = req.body || {};
      if (sample_type) updated.sample_type = sample_type.trim();
      if (limit_item) updated.limit_item = limit_item.trim();
      if (source_type) updated.source_type = source_type.trim();
      if (card_version !== undefined) updated.card_version = card_version.trim();
      if (test_data !== undefined) updated.test_data = test_data.trim();
      if (test_standard !== undefined) updated.test_standard = test_standard.trim();
      updated.signed_by_qa = u.display_name || u.username;
      logData = { sample_id: s.id, action: 'EDIT_CARD', role: u.role, user_id: u.id, dept: u.dept, note: note || '修正标示卡' };
    } else if (chosenAction === 'EDIT_STORAGE') {
      if (!location || !location.trim()) return res.status(400).json({ error: '请填写新储位' });
      updated.storage_location = location.trim();
      logData = { sample_id: s.id, action: 'EDIT_STORAGE', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '修改储位' };
    } else if (chosenAction === 'RETURN_REQUEST') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写退回原因' });
      updated.status = 'RETURNING';
      logData = { sample_id: s.id, action: 'RETURN_REQUEST', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() };
    } else if (chosenAction === 'RE_RELEASE') {
      const cyc = Number(cycleDays);
      if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
      const { sample_type, limit_item, source_type, card_version, test_data, test_standard } = req.body || {};
      if (!sample_type || !sample_type.trim()) return res.status(400).json({ error: '请选择样品类型' });
      if (!limit_item || !limit_item.trim()) return res.status(400).json({ error: '请选择限度项目' });
      const d = new Date(ts); d.setUTCDate(d.getUTCDate() + cyc);
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
      if (test_standard) updated.test_standard = test_standard.trim();
      updated.signed_by_qa = u.display_name || u.username;
      updated.retire_assigned_rd = null;
      updated.retired_reason = null;
      // 重新发行即脱离保管链路：清空保管部门与储位，等待保管单位重新接收
      updated.custody_dept = null;
      updated.storage_location = null;
      logData = { sample_id: s.id, action: 'RE_RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: '品保确认重新发行，周期' + cyc + '天' };
    } else if (chosenAction === 'RETIRE_RECREATE') {
      const assignedRd = (req.body.retire_assigned_rd || '').trim();
      if (!assignedRd) return res.status(400).json({ error: '请选择指派重新制作的研发人员' });
      // 保持 RETURNING 状态，仅设置指派信息，等待 RD 扫码执行 RECREATE
      updated.retired_reason = note || '退回研发重新制作';
      updated.retire_assigned_rd = assignedRd;
      const assignedUser = await D.getUserById(Number(assignedRd));
      const assignedLabel = assignedUser ? (assignedUser.display_name || assignedUser.username) : assignedRd;
      logData = { sample_id: s.id, action: 'RETIRE_RECREATE', role: u.role, user_id: u.id, dept: u.dept, note: '退回研发重新制作，指派 ' + assignedLabel };
    } else if (chosenAction === 'RETIRE_ONLY') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写作废原因' });
      updated.status = 'RETIRED';
      updated.retired_reason = note.trim();
      updated.retire_assigned_rd = null;
      logData = { sample_id: s.id, action: 'RETIRE_ONLY', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() };
    } else if (chosenAction === 'RETURN_REJECT') {
      if (!note || !note.trim()) return res.status(400).json({ error: '请填写拒绝理由' });
      updated.status = 'IN_CUSTODY';
      updated.retire_assigned_rd = null;
      updated.retired_reason = null;
      // 顺延复检时间：退回审核消耗的天数（最近一次 RETURN_REQUEST 日志至今的整天数）补回 next_inspect_at
      if (s.next_inspect_at) {
        const logs = await D.listLogsBySample(s.id);
        const rr = (logs || []).find(l => l.action === 'RETURN_REQUEST');
        if (rr && rr.created_at) {
          const days = Math.floor((Date.now() - new Date(rr.created_at).getTime()) / 86400000);
          if (days > 0) {
            const ni = new Date(s.next_inspect_at); ni.setUTCDate(ni.getUTCDate() + days);
            updated.next_inspect_at = ni.toISOString();
            updated.valid_until = updated.next_inspect_at;
          }
        }
      }
      logData = { sample_id: s.id, action: 'RETURN_REJECT', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() };
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
        await D.updateSample(oldUpdated, conn, s.version);
        await D.addLog({ sample_id: s.id, action: 'RECREATE_REPLACED', role: u.role, user_id: u.id, dept: u.dept, note: '由 ' + ns.sample_no + ' 替代' }, conn);
        await D.addLog({ sample_id: ns.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '替代 ' + s.sample_no }, conn);
        return ns;
      });
      res.json({ sample: newSample, replaced: s.sample_no, action: 'RECREATE', message: '替代样品已创建：' + newSample.sample_no });
      return;
    }

    // updateSample(CAS 乐观锁) + addLog 原子提交，防止状态变更与审计断链
    // 版本冲突（他人已抢先操作）时 updateSample 抛 code='CONFLICT'，由 catch 统一转 409
    const result = await D.withTransaction(async conn => {
      const r = await D.updateSample(updated, conn, s.version);
      if (logData) await D.addLog(logData, conn);
      return r;
    });
    const printCard = ['RELEASE', 'RE_RELEASE', 'EDIT_CARD', 'INSPECT', 'INSPECT_CUSTODY'].includes(chosenAction);
    res.json({ sample: result, action: chosenAction, message: `操作成功：${chosenAction}`, printCard });
    } catch (err) {
      if (err && err.code === 'CONFLICT')
        return res.status(409).json({ error: '该样品刚被他人操作，请刷新后重试' });
      res.status(500).json({ error: '扫码操作失败：' + (err.message || '服务器内部错误') });
    }
  });
}

module.exports = { register };
