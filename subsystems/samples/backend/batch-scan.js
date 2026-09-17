// subsystems/samples/backend/batch-scan.js — 批量领用 / 批量归还（2026-09-16，需求 1）
// 设计依据：docs/superpowers/specs/2026-09-16-samples-batch-checkout-and-inspect-display-design.md §4/§5
// 两阶段语义（§5.2，本次核心决策）：
//   阶段 1 预校验「全或无」：逐件解析 + allowedActions 角色校验 + 状态校验；任一件不合格 → 422 {rejected, executed:0}，
//                            整批不执行（零副作用）。产品要「任一件失败则整批不生效」，用零副作用预校验满足。
//   阶段 2 逐件独立事务：applyAction → withTransaction(updateSample CAS + addLog)。实物一旦领出/归还，
//                        数据库回滚无法撤销物理事实，故执行期必须件级事务；同时避免单事务 50 件的长事务与死锁。
// 幂等（§5.5）：batchId 必填，落库时追加到 scan_logs.note 尾部 ' [batch:<id>]'（零 DDL）；同 batchId 重复提交 →
//               409 {code:'BATCH_DUPLICATE', executed:0, applied:[...]}，零副作用，前端逐件 resolve 复核后换新 batchId 重交。
// 权限：与单件扫码台同口径（manifest 状态机 + 逐件按当前角色算 allowedActions），不新增跨部门门槛（Q6）。
// 顺序约束：本路由 MUST 在 routes-samples 之前注册（否则 /api/samples/:id 会把 batch-* 当 :id 捕获）。
const D = require('../../../db');
const { asyncHandler } = require('./async-handler');
const A = require('./scan-actions');
// 动作可用集与状态标签：与单件扫码台共用同一份口径（scan-allowed.js），避免复制粘贴漂移（§15）
const { allowedActions, STATUS_LABEL } = require('./scan-allowed');
const { primaryRole } = require('./sample-type'); // 提示/审计取单角色（多角色不作 join）

const BATCH_LIMIT = 50;                                                   // 上限 50 件/批（与批量新建/批量打印/打印队列三处先例一致）
const BATCH_ACTIONS = ['CHECKOUT', 'RETURN_OUT'];                         // 仅领出/归还；图片类动作与批量不兼容
const BATCH_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;                              // batchId 字符集与长度（§5.1）

// 校验批次标识（幂等键）。合法返回 null，非法返回错误文案。
// 参数 batchId：客户端每次点「提交」生成的随机串；同一次提交的**重试复用同一值**——这是幂等键的全部意义。
function validateBatchId(batchId) {
  var v = String(batchId == null ? '' : batchId).trim();
  if (!v) return '缺少批次标识 batchId（用于防重复提交）';
  if (!BATCH_ID_RE.test(v)) return '批次标识格式非法（须为 8~40 位字母/数字/下划线/连字符）';
  return null;
}

// 解析并校验批量公共入参。返回 { err, status } 或 { action, codes, batchId, params }。
// 参数类错误一律 400（前端回公共项修正后整批重交，§4.4）；codes 仅在 needCodes 时必填。
function parseBatchBody(body, needCodes) {
  const b = body || {};
  const action = String(b.action || '').trim();
  if (BATCH_ACTIONS.indexOf(action) < 0) return { err: '批量通道仅支持 CHECKOUT（领出）与 RETURN_OUT（归还入库）', status: 400 };
  const verr = validateBatchId(b.batchId);
  if (verr) return { err: verr, status: 400 };
  const codes = Array.isArray(b.codes) ? b.codes : null;
  if (needCodes && (!codes || !codes.length)) return { err: '请至少提供一件样品编号', status: 400 };
  if (codes && codes.length > BATCH_LIMIT) return { err: '单批最多 ' + BATCH_LIMIT + ' 件，当前 ' + codes.length + ' 件', status: 400 };
  const params = { note: b.note };
  if (action === 'CHECKOUT') {
    const cu = String(b.checkout_user == null ? '' : b.checkout_user).trim();
    if (!cu) return { err: '请填写领用人', status: 400 };
    const dur = Number(b.durationHours);
    if (!Number.isInteger(dur) || dur < 1 || dur > 8760) return { err: '领用时长须为 1~8760 小时的整数', status: 400 };
    params.checkout_user = cu;
    params.checkout_dept = String(b.checkout_dept == null ? '' : b.checkout_dept).trim();
    params.durationHours = dur;
  }
  return { action: action, codes: codes || [], batchId: String(b.batchId).trim(), params: params };
}

// 批次内去重（首件为准，§5.1）+ 去空白。重复项与空值进「跳过」组（不提供重试，§4.3）。
function dedupCodes(codes) {
  const seen = {}, list = [], skipped = [];
  for (const raw of codes) {
    const c = String(raw == null ? '' : raw).trim();
    if (!c) { skipped.push({ code: '', reason: '输入为空' }); continue; }
    if (seen[c]) { skipped.push({ code: c, reason: '本批队列内重复（首件为准）' }); continue; }
    seen[c] = 1; list.push(c);
  }
  return { list: list, skipped: skipped };
}

// 阶段 1：逐件解析 + 角色/状态预校验（只读，零副作用）。
// 返回 { items:[{code,sample}] , rejected:[{code,sample_no,status,code_,reason}] }；rejected 非空时调用方直接 422 整批取消。
// rejected[].code_ 取值 NOT_FOUND / ACTION_NOT_ALLOWED，供前端把该件归入「需人工」组（§4.4 异常矩阵）。
async function precheckAll(codes, action, u) {
  const items = [], rejected = [];
  for (const code of codes) {
    const s = await D.getSampleByNo(code) || await D.getSampleByToken(code);
    if (!s) { rejected.push({ code: code, code_: 'NOT_FOUND', status: null, reason: '未找到对应样品' }); continue; }
    const acts = allowedActions(u, s.status, s.next_inspect_at, s.retire_assigned_rd, String(u.id));
    if (acts.indexOf(action) < 0) {
      rejected.push({ code: code, id: s.id, sample_no: s.sample_no, code_: 'ACTION_NOT_ALLOWED', status: s.status,
        reason: '当前状态「' + (STATUS_LABEL[s.status] || s.status) + '」下你的角色（' + primaryRole(u) + '）不可执行「' + action + '」' });
      continue;
    }
    items.push({ code: code, sample: s });
  }
  return { items: items, rejected: rejected };
}

// 阶段 2 单件：重新读取样品（预校验与执行之间状态可能已被他人改变）→ 复算动作集 → applyAction →
// 独立事务提交（updateSample CAS + addLog 原子）。返回 { code, ok:true, sample } 或 { code, ok:false, code_, reason, retryable }。
// 不抛异常：单件失败只进 failed 组，绝不回滚已成功的其它件（§5.2）。
async function runOne(item, action, params, batchId, u, saveSampleImage) {
  const s = await D.getSampleByNo(item.code) || await D.getSampleByToken(item.code);
  if (!s) return { code: item.code, ok: false, code_: 'NOT_FOUND', reason: '未找到对应样品', retryable: false };
  const acts = allowedActions(u, s.status, s.next_inspect_at, s.retire_assigned_rd, String(u.id));
  if (acts.indexOf(action) < 0)
    return { code: item.code, ok: false, code_: 'ACTION_NOT_ALLOWED', status: s.status, retryable: false,
      reason: '状态已变更为「' + (STATUS_LABEL[s.status] || s.status) + '」，不可执行「' + action + '」' };
  const ts = D.nowISO(), updated = { ...s };
  const ar = await A.applyAction(action, { req: { body: Object.assign({}, params) }, s, updated, ts, u, D, saveSampleImage });
  if (ar && ar.error) return { code: item.code, ok: false, code_: 'PARAM_INVALID', status: ar.status, reason: ar.error, retryable: true };
  if (ar && ar.respond) return { code: item.code, ok: true, sample: ar.respond.sample };
  // 幂等留痕：批次标识只追加到审计日志 note 尾部（checkout_note 是用户业务备注，不掺入机器串）
  if (ar && ar.logData) ar.logData.note = (ar.logData.note || '') + ' [batch:' + batchId + ']';
  try {
    const result = await D.withTransaction(async conn => {
      const r = await D.updateSample(updated, conn, s.version);
      if (ar && ar.logData) await D.addLog(ar.logData, conn);
      return r;
    });
    return { code: item.code, ok: true, sample: result };
  } catch (err) {
    if (err && err.code === 'CONFLICT')
      return { code: item.code, ok: false, code_: 'VERSION_CONFLICT', reason: '该样品刚被他人操作，请刷新后重试', retryable: true };
    // §25.2.3：固定文案，原为 err.message（会回显库表/列名；单件失败不中断整批）
    return { code: item.code, ok: false, code_: 'SERVER_ERROR', reason: '服务器内部错误', retryable: true };
  }
}

// POST /api/samples/batch-resolve —— 批量只读预校验。入队前/提交前/失败重试前均可调用（零副作用）。
// body { codes:[...], action? }；action 缺省时只回 allowedActions，由前端自行判定适用性。
function resolveRoute(app) {
  const requireAuth = app.locals.requireAuth;
  app.post('/api/samples/batch-resolve', requireAuth, asyncHandler(async (req, res) => {
    const u = await app.locals.currentUser(req);
    const b = req.body || {};
    const codes = Array.isArray(b.codes) ? b.codes : null;
    if (!codes || !codes.length) return res.status(400).json({ error: '请至少提供一件样品编号' });
    if (codes.length > BATCH_LIMIT) return res.status(400).json({ error: '单批最多 ' + BATCH_LIMIT + ' 件，当前 ' + codes.length + ' 件' });
    const d = dedupCodes(codes);
    const want = String(b.action || '').trim();
    const items = [];
    for (const c of d.list) {
      const s = await D.getSampleByNo(c) || await D.getSampleByToken(c);
      if (!s) { items.push({ code: c, ok: false, reason: '未找到对应样品' }); continue; }
      const acts = allowedActions(u, s.status, s.next_inspect_at, s.retire_assigned_rd, String(u.id));
      items.push({ code: c, ok: true, id: s.id, status: s.status, name: s.name,
        checkout_user: s.checkout_user || null, expected_return_at: s.expected_return_at || null,
        allowedActions: acts, reason: (want && acts.indexOf(want) < 0) ? '当前状态不可执行「' + want + '」' : null });
    }
    res.json({ items: items, skipped: d.skipped });
  }));
}

// POST /api/samples/batch-action —— 批量执行（两阶段）。body { action, codes, batchId, checkout_user?, checkout_dept?, durationHours?, note? }
function actionRoute(app) {
  const requireAuth = app.locals.requireAuth;
  app.post('/api/samples/batch-action', requireAuth, asyncHandler(async (req, res) => {
    const u = await app.locals.currentUser(req);
    const p = parseBatchBody(req.body, true);
    if (p.err) return res.status(p.status).json({ error: p.err });
    const d = dedupCodes(p.codes);
    if (!d.list.length) return res.status(400).json({ error: '请至少提供一件有效样品编号' });
    // 幂等探测（§5.5）：同 batchId 已有落库日志 → 409 BATCH_DUPLICATE，本次零副作用，回已生效编号供前端复核。
    // note 前置通配符走全表扫描，故每批仅调用 1 次；probeMs 回传用于观测该 LIKE 的实际代价。
    const t0 = Date.now();
    const applied = await D.listBatchLogs(p.batchId);
    const probeMs = Date.now() - t0;
    if (applied.length) return res.status(409).json({ code: 'BATCH_DUPLICATE', executed: 0, probeMs: probeMs,
      error: '该批次已提交过（batchId 重复），本次未执行任何操作',
      applied: Array.from(new Set(applied.map(r => r.sample_no).filter(Boolean))) });
    const pre = await precheckAll(d.list, p.action, u);
    if (pre.rejected.length) return res.status(422).json({ code: 'PRECHECK_FAILED', executed: 0, probeMs: probeMs,
      error: '预校验未通过，整批已取消（未执行任何操作）', rejected: pre.rejected, skipped: d.skipped });
    const ok = [], failed = [];
    for (const it of pre.items) {
      const r = await runOne(it, p.action, p.params, p.batchId, u, app.locals.saveSampleImage);
      if (r.ok) ok.push({ code: r.code, id: r.sample && r.sample.id, sample_no: (r.sample && r.sample.sample_no) || r.code,
        status: r.sample && r.sample.status, at: D.nowISO() });
      else failed.push(r);
    }
    res.json({ action: p.action, batchId: p.batchId, executed: ok.length + failed.length,
      ok: ok, failed: failed, skipped: d.skipped, probeMs: probeMs });
  }));
}

function register(app) {
  resolveRoute(app);
  actionRoute(app);
}

module.exports = { register, BATCH_LIMIT, BATCH_ACTIONS, validateBatchId, parseBatchBody, dedupCodes };
