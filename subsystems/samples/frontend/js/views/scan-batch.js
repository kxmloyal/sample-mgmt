// subsystems/samples/frontend/js/views/scan-batch.js — 扫码台批量领用/归还（2026-09-16，需求 1；设计文档 §4）
// 三段式：① 公共设置（整批一次）→ ② 连扫入队（每件一次扫码、0 次确认）→ ③ 一次提交 + 结果面板
// 后端：POST /api/samples/batch-resolve（只读预校验）/ POST /api/samples/batch-action（两阶段全或无 + batchId 幂等）
//
// 开关语义（与设计 §4.2 的落地取舍，2026-09-16）：设计要求「不新增第二个同屏连扫开关」，本文件沿用该约束
// ——同屏仍只有既有 `#scan-cont`（连续扫码）一个开关。**未**把 `#scan-cont` 本身改造成批量开关，原因（实证）：
// 该开关同时驱动标示卡打印队列的累积（scan-camera.js:84-90 的 enqueuePrintCard(contChecked)），
// 改造它会让单件扫码的打印队列行为静默改变（AGENTS §6「兼容优先、禁止单点修改」）→ 故批量模式用独立开关 opt-in。
// 命名空间 sb*：避免与 print-queue / checkout-user-picker 等既有全局符号冲突。
var _sbMode = false;         // 批量模式开关
var _sbAction = 'CHECKOUT';  // 当前批量动作（仅 CHECKOUT / RETURN_OUT）
var _sbQueue = [];           // [{code, sample, state}] state: pending/submitting/ok/failed/skipped
var _sbBatchId = null;       // 本次提交的幂等键：首次提交生成，网络异常重试复用同一值；落库成功后置空
var _sbResult = null;        // 上一次提交结果（渲染结果面板）
var SB_LIMIT = 50;           // 单批上限（与后端 BATCH_LIMIT、批量新建/打印三处先例一致）
var SB_LS = 'sample_batch_queue';
var SB_STATE_CN = { pending: '待提交', submitting: '提交中', ok: '已生效', failed: '失败', skipped: '跳过' };
var _sbLoaded = false;       // 是否已通过首次班次校验（载入期 me 为 null，无法判操作人，故推迟到首次渲染）

// 队列持久化恢复（设计 §4.2）：载入只解析，操作人/时效/动作的班次校验推迟到 sbQueueHtml 首次执行
var _sbRestore = (function () {
  try {
    var raw = JSON.parse(localStorage.getItem(SB_LS) || 'null');
    if (raw && Array.isArray(raw.items)) {
      _sbAction = (raw.action === 'RETURN_OUT') ? 'RETURN_OUT' : 'CHECKOUT';
      _sbQueue = raw.items.filter(function (x) { return x && x.code; }).slice(0, SB_LIMIT)
        .map(function (x) { return { code: x.code, sample: x.sample, acts: x.acts || null, state: 'pending' }; });
      window._sbOwned = true;   // 本次确有「从上次作业继承来的载荷」——只有它才需要班次校验
    }
    window._sbRawAt = (raw && raw.at) || 0;
    window._sbRawUid = raw && raw.uid;
  } catch (e) { _sbQueue = []; }
  return true;
})();

// 打开/关闭批量模式（on 省略即取反）
function sbToggleMode(on) {
  var box = document.getElementById('scan-batch');
  if (!box) return;
  _sbMode = (on === undefined) ? !_sbMode : !!on;
  box.style.display = _sbMode ? '' : 'none';
  var btn = document.getElementById('sb-mode-btn');
  if (btn) btn.setAttribute('appearance', _sbMode ? 'accent' : 'neutral');
  if (_sbMode) { sbRender(); toast('批量模式已开启：设置公共项后连续扫码，样品逐件入队，最后一次提交'); }
  else { box.innerHTML = ''; toast('批量模式已关闭'); }
}

// 切换批量动作（领出 / 归还入库）。队列保留：动作不匹配的样品由后端阶段 1 预校验整批拦下（零副作用）
function sbSetAction(a) {
  if (a !== 'CHECKOUT' && a !== 'RETURN_OUT') return;
  if (_sbAction === a) return;
  _sbAction = a; _sbBatchId = null; _sbResult = null;
  sbRender();
}

// 整块渲染：公共设置表单 + 队列 + 结果。仅在「进入批量模式 / 切换动作 / 视图重挂载」时调用——
// 队列变动只走 sbPaint()，避免重渲染把用户已填的领用人输入框清空并重置领用人选择器
function sbRender() {
  var box = document.getElementById('scan-batch');
  if (!box) return;
  var isCo = _sbAction === 'CHECKOUT';
  var form = isCo ? (
    '<label>领用人 *</label><div class="co-wrap"><fluent-text-field id="scan-co-user" placeholder="必填：点选候选或直接输入" onfocus="renderCoCandidates(this.value||\'\')" oninput="_coPick=null;renderCoCandidates(this.value||\'\')" onblur="setTimeout(function(){hideCoCandidates();},200)"></fluent-text-field><div id="scan-co-cand" class="co-cand-panel co-cand-fixed"></div></div>' +
    '<label>领用部门</label><fluent-text-field id="scan-co-dept" placeholder="选系统用户自动带出，或手填"></fluent-text-field>' +
    '<label>领用时长（小时）*</label><fluent-text-field id="scan-co-hours" type="number" min="1" max="8760" placeholder="如 24" oninput="previewCheckoutDue()"></fluent-text-field>' +
    '<p class="muted" id="scan-co-due" style="font-size:12px;min-height:16px"></p>'
  ) : '<p class="muted" style="font-size:12px">归还入库只需备注：本批样品将各自归还到原储位，领用字段按单件口径清空。</p>';
  box.innerHTML =
    '<div class="sb-panel">' +
      '<div class="sb-head"><b>' + (isCo ? '批量领出' : '批量归还入库') + '</b>' +
        '<span class="muted sb-hint">① 填公共项 → ② 连续扫码入队 → ③ 一次提交（上限 ' + SB_LIMIT + ' 件）</span>' +
        '<span class="sb-spacer"></span>' +
        '<fluent-button appearance="' + (isCo ? 'accent' : 'neutral') + '" size="small" onclick="sbSetAction(\'CHECKOUT\')">领出</fluent-button>' +
        '<fluent-button appearance="' + (isCo ? 'neutral' : 'accent') + '" size="small" onclick="sbSetAction(\'RETURN_OUT\')">归还入库</fluent-button>' +
      '</div>' +
      '<div class="sb-form">' + form +
        '<label>' + (isCo ? '领用备注' : '归还备注') + '</label><fluent-text-field id="sb-note" placeholder="选填，整批共用"></fluent-text-field>' +
      '</div>' +
      '<div id="sb-queue"></div>' +
    '</div>' +
    '<div id="sb-result"></div>';
  sbPaint();
  // 领用人候选复用单件路径的选择器（checkout-user-picker.js，同一 DOM id）
  if (isCo && typeof initCheckoutUserPicker === 'function') initCheckoutUserPicker();
}

// 局部重绘队列 + 结果（不清空公共设置表单）
function sbPaint() {
  var q = document.getElementById('sb-queue');
  if (q) q.innerHTML = sbQueueHtml();
  var r = document.getElementById('sb-result');
  if (r) r.innerHTML = sbResultHtml();
}

// 队列 chips + 提交条。副作用说明：本函数是队列变更的**唯一出口**（入队/移出/清空/提交前后都会重绘），
// 故把 localStorage 持久化收敛在此处一处，避免多份复制粘贴；班次校验也在此处首次执行一次。
function sbQueueHtml() {
  if (!_sbLoaded) {
    _sbLoaded = true;
    // 班次隔离（设计 §4.2）：操作人变化 / 超过 8 小时 → 丢弃继承来的队列，跨班次不继承他人队列。
    // 关键：**仅当本次确有从 localStorage 恢复的载荷时才判定**（window._sbOwned）——否则「无历史记录」
    // 会被误判为跨班次，从而把本次刚扫入的第一件静默清掉（2026-09-16 本地预跑实测发现，已由本标志修复）
    if (window._sbOwned) {
      var stale = (String(window._sbRawUid) !== String((me && me.id) || 0)) ||
        (!window._sbRawAt) || (Date.now() - window._sbRawAt > 8 * 3600000);
      if (stale) _sbQueue = [];
    }
    window._sbRawUid = (me && me.id) || 0; window._sbRawAt = Date.now();
  }
  try {
    localStorage.setItem(SB_LS, JSON.stringify({
      uid: (me && me.id) || 0, at: Date.now(), action: _sbAction,
      items: _sbQueue.map(function (x) { return { code: x.code, sample: x.sample, acts: x.acts }; })
    }));
  } catch (e) { /* 隐私模式/配额满：持久化失败不影响本次作业 */ }
  if (!_sbQueue.length)
    return '<p class="muted sb-empty">队列为空：在下方扫码框连续扫码即自动入队（每件只需扫一次，无需确认）</p>';
  // 设计 §4.2「入队时只调只读 resolve」：把该件当前的 allowedActions 一并留住，队首据此提前提示不适用件
  //（真正裁定仍在提交时的后端阶段 1；此处只是让作业员在入队阶段就看到「这件本动作做不了」）
  var manual = 0;
  var chips = _sbQueue.map(function (x) {
    var bad = !!(x.acts && x.acts.indexOf(_sbAction) < 0);
    if (bad && (x.state === 'pending' || x.state === 'failed')) manual++;
    return '<span class="sb-chip sb-chip-' + x.state + (bad ? ' sb-chip-manual' : '') + '" title="' + e((x.sample && x.sample.name) || '') + (bad ? '（当前状态不适用本动作）' : '') + '">' +
      e(x.code) + '<span class="sb-chip-st">' + SB_STATE_CN[x.state] + '</span>' +
      '<a href="javascript:void(0)" class="sb-chip-x" title="移出队列" onclick="sbQueueOp(\'remove\',\'' + e(x.code) + '\')">✕</a></span>';
  }).join(' ');
  var pend = _sbQueue.filter(function (x) { return x.state === 'pending' || x.state === 'failed'; }).length;
  return '<div class="sb-queue"><div class="sb-queue-head">已入队 <b>' + _sbQueue.length + '</b>/' + SB_LIMIT +
    ' 件 · 待提交 ' + pend + ' 件' + (manual ? '<span class="sb-warn">其中 ' + manual + ' 件当前状态不适用本动作，提交会被整批拦下</span>' : '') +
    '<span class="sb-spacer"></span>' +
    '<fluent-button appearance="accent" size="small" onclick="sbSubmit(this)">提交 ' + pend + ' 件</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="sbQueueOp(\'clear\')">清空队列</fluent-button></div>' +
    '<div class="sb-chips">' + chips + '</div></div>';
}

// 结果面板渲染 sbResultHtml 已于 2026-09-16 拆至 scan-batch-result.js
// 原因：本文件加入结果面板后达 71.3%，越 §7.1 的 70% 预警线；§7.3 亦要求复杂渲染抽独立文件

// 入队（扫码后由 scan.js 的 doScan 调用）：按 sample_no 去重 + 上限 50，与打印队列同款口径
// acts：可选，/api/resolve 返回的 allowedActions（只读提示用，不作为入队门槛——裁定权在后端阶段 1）
function sbEnqueue(sample, acts) {
  var code = sample && sample.sample_no;
  if (!code) return false;
  if (_sbQueue.some(function (x) { return x.code === code; })) { toast('该样品已在队列中：' + code, 'err'); return false; }
  if (_sbQueue.length >= SB_LIMIT) { toast('队列已满（' + SB_LIMIT + ' 件），请先提交或清空', 'err'); return false; }
  _sbQueue.push({ code: code, sample: sample, acts: acts || null, state: 'pending' });
  sbPaint();
  toast('已入队（' + _sbQueue.length + '/' + SB_LIMIT + '）：' + code, 'ok');
  return true;
}

// 队列操作：remove（按编号移出一件）/ clear（清空队列与结果，并作废幂等键）
function sbQueueOp(op, code) {
  if (op === 'remove') _sbQueue = _sbQueue.filter(function (x) { return x.code !== code; });
  else { _sbQueue = []; _sbResult = null; }
  _sbBatchId = null;
  sbPaint();
}

// 重试入口（T5，由结果面板的 sbRetryFailed / sbRetryRejected 调用）：
// 把指定编号的失败项退回 pending（仅这些件），换新幂等键后重新提交。
// keepKey=true 用于「预校验整批被拒」——该情形后端零副作用、旧键未被占用，复用旧键即可（设计 §4.4）
function sbRetryQueue(codes, btn, keepKey) {
  codes.forEach(function (c) { _sbQueue.forEach(function (x) { if (x.code === c) x.state = 'pending'; }); });
  _sbResult = null;
  sbPaint();
  return sbSubmit(btn, codes, !keepKey);
}

// 提交：① 复用 collectCheckoutPayload 收集公共项（与单件路径同一份校验）→ ② 生成/复用 batchId →
//      ③ 静默调用批量接口（silent：不弹全局 toast、不触发单件刷新，逐件错误由结果面板承载）→ ④ 按 HTTP 语义分流
// only（可选，T5 重试用）：仅提交这些编号（其余件保持原状态位不被触碰，故已成功项绝不会被再次提交）
// freshKey（可选，T5 重试用）：强制换新幂等键——上次提交已落库时旧键会被判 BATCH_DUPLICATE，
//   但预校验被拒（零副作用）情形必须**复用**旧键，故由调用方显式决定
async function sbSubmit(btn, only, freshKey) {
  var pool = _sbQueue.filter(function (x) { return !only || only.indexOf(x.code) > -1; });
  var codes = pool.filter(function (x) { return x.state === 'pending' || x.state === 'failed'; }).map(function (x) { return x.code; });
  if (!codes.length) { toast('队列中无可提交项', 'err'); return; }
  var body = { action: _sbAction, codes: codes };
  if (_sbAction === 'CHECKOUT' && !collectCheckoutPayload(body)) return; // scan-payload.js：领用人必填 + 时长 1~8760 软校验
  var noteEl = document.getElementById('sb-note');
  if (noteEl && noteEl.value.trim()) body.note = noteEl.value.trim();
  // 幂等键：本次提交首次生成后固定；网络异常（未知态）重试复用同一值，后端据此判 BATCH_DUPLICATE 防重复执行
  if (freshKey) _sbBatchId = null;
  if (!_sbBatchId) _sbBatchId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : ('b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  body.batchId = _sbBatchId;
  await withSubmitLock(btn || null, async function () {
    codes.forEach(function (c) { _sbQueue.forEach(function (x) { if (x.code === c) x.state = 'submitting'; }); });
    sbPaint();
    try {
      _sbResult = null;
      var res = await api('POST', '/api/samples/batch-action', body, { silent: true });
      var byCode = {};
      (res.ok || []).forEach(function (o) { byCode[o.code] = 'ok'; });
      (res.failed || []).forEach(function (f) { byCode[f.code] = 'failed'; });
      codes.forEach(function (c) { _sbQueue.forEach(function (x) { if (x.code === c) x.state = byCode[c] || 'failed'; }); });
      _sbResult = { kind: 'done', action: res.action, batchId: res.batchId, ok: res.ok || [], failed: res.failed || [], skipped: res.skipped || [] };
      _sbBatchId = null; // 批次已落库：下一次提交必须换新 batchId
    } catch (err) {
      var d = (err && err.data) || {};
      if (err && err.status === 422) {
        // 阶段 1 预校验未通过：后端保证整批零执行；逐件原因进结果面板（需人工）
        codes.forEach(function (c) { _sbQueue.forEach(function (x) { if (x.code === c) x.state = 'failed'; }); });
        _sbResult = { kind: 'rejected', action: _sbAction, rejected: d.rejected || [], skipped: d.skipped || [] };
        toast('预校验未通过，整批未执行（' + (d.rejected || []).length + ' 件不合格）', 'err');
      } else if (err && err.status === 409 && d.code === 'BATCH_DUPLICATE') {
        _sbBatchId = null;
        await sbReviewDuplicate(body, d);
      } else {
        // 网络中断 / 500：状态未知 → 保留队列与同一 batchId，恢复后重试（幂等键保证不会重复执行）
        codes.forEach(function (c) { _sbQueue.forEach(function (x) { if (x.code === c) x.state = 'failed'; }); });
        toast((err && err.message) || '批量提交失败，请检查网络后重试（队列已保留）', 'err');
      }
    }
    sbPaint();
  });
}

// BATCH_DUPLICATE 分流（设计 §4.3 第 6 条）：逐件 batch-resolve 复核——已生效件标「已生效（无需重试）」，
// 其余件回「待提交」由用户换新 batchId 重交，避免重复执行已生效件
async function sbReviewDuplicate(body, d) {
  var applied = {};
  (d.applied || []).forEach(function (no) { applied[no] = 1; });
  try {
    var chk = await api('POST', '/api/samples/batch-resolve', { codes: body.codes, action: body.action }, { silent: true });
    (chk.items || []).forEach(function (it) {
      var done = applied[it.code] || (it.ok && it.allowedActions && it.allowedActions.indexOf(body.action) < 0);
      _sbQueue.forEach(function (x) { if (x.code === it.code) x.state = done ? 'ok' : 'pending'; });
    });
  } catch (e) {
    // 复核失败退化为「按后端已生效编号标注」，其余件仍可人工重交（只读复核，不写库）
    body.codes.forEach(function (c) { _sbQueue.forEach(function (x) { if (x.code === c) x.state = applied[c] ? 'ok' : 'pending'; }); });
  }
  _sbResult = { kind: 'duplicate', action: body.action, applied: d.applied || [], batchId: d.batchId };
  toast('该批次此前已提交过：已生效项已标注，其余项可用新批次重交', 'err');
}
