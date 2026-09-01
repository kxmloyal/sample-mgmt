// routes/scan.js — 扫码台：解析 + 状态机（action 执行逻辑已拆至 scan-actions.js，T11b）
const D = require('../../../db');
const { asyncHandler } = require('./async-handler');
const A = require('./scan-actions');

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
      const { code } = req.body || {};
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

      // action 执行器（scan-actions.js）：就地改写 updated，返回 {status,error} 回错 / {respond} 自行响应 / {logData} 走主事务
      const ar = await A.applyAction(chosenAction, { req, s, updated, ts, u, D, saveSampleImage });
      if (ar && ar.error) return res.status(ar.status).json({ error: ar.error });
      if (ar && ar.respond) return res.json(ar.respond);

      // updateSample(CAS 乐观锁) + addLog 原子提交，防止状态变更与审计断链
      // 版本冲突（他人已抢先操作）时 updateSample 抛 code='CONFLICT'，由 catch 统一转 409
      const result = await D.withTransaction(async conn => {
        const r = await D.updateSample(updated, conn, s.version);
        if (ar && ar.logData) await D.addLog(ar.logData, conn);
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
