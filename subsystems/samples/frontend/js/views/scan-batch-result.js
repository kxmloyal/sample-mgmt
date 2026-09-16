// subsystems/samples/frontend/js/views/scan-batch-result.js — 批量结果面板渲染（2026-09-16 自 scan-batch.js 拆出）
// 拆分原因：scan-batch.js 加入结果面板后达 71.3%，越过 AGENTS §7.1 的 70% 预警线（须停止新增业务 + 输出拆分方案）；
// 且 §7.3 要求「页面复杂渲染逻辑 SHOULD 抽 hooks/helper 独立文件」——本文件只负责把 _sbResult 渲染成 HTML，
// 队列状态机与提交流程仍留在 scan-batch.js。
// 依赖均为 bundle 单作用域内的全局符号：e（shared/frontend/shared/utils.js）、STATUS（constants.js）、_sbResult（scan-batch.js）。
// 结果面板（设计 §4.3 三段式 IA）：结论条 + 成功/失败/跳过三组 + 底部动作条
// 底部动作条（T5）：重试全部可重试项 / 复制失败编号 / 导出失败清单 CSV（§21 列与格式约定）/ 清空并开始新一批
function sbResultHtml() {
  var R = _sbResult;
  if (!R) return '';
  var h = '<div class="sb-result">';
  if (R.kind === 'done') {
    h += '<div class="sb-concl"><b>已完成 ' + (R.ok.length + R.failed.length) + ' 件</b>：成功 ' + R.ok.length +
      ' · 失败 ' + R.failed.length + ' · 跳过 ' + R.skipped.length +
      '<div class="muted sb-sub">成功项已生效、不会回滚；失败项可修正后重试。</div></div>';
    if (R.failed.length) h += '<div class="sb-group"><div class="sb-group-h sb-bad">失败 ' + R.failed.length + '（需处理）</div>' +
      '<table class="sb-table"><thead><tr><th>编号</th><th>后端原文原因</th><th>可重试</th></tr></thead><tbody>' +
      R.failed.map(function (f) { return '<tr><td class="sb-mono">' + e(f.code) + '</td><td>' + e(f.reason || '') + '</td><td>' + (f.retryable ? '是' : '否') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    if (R.ok.length) h += '<div class="sb-group"><div class="sb-group-h sb-ok">成功 ' + R.ok.length + '</div>' +
      '<table class="sb-table"><thead><tr><th>编号</th><th>样品号</th><th>现状态</th></tr></thead><tbody>' +
      R.ok.map(function (o) { return '<tr><td class="sb-mono">' + e(o.code) + '</td><td class="sb-mono">' + e(o.sample_no || '') + '</td><td>' + e(STATUS[o.status] || o.status || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
    if (R.skipped.length) h += '<div class="sb-group"><div class="sb-group-h sb-muted">跳过 ' + R.skipped.length + '（不提供重试）</div>' +
      R.skipped.map(function (s) { return '<div class="muted sb-skip">' + e(s.code || '（空）') + ' — ' + e(s.reason || '') + '</div>'; }).join('') + '</div>';
  } else if (R.kind === 'rejected') {
    h += '<div class="sb-concl sb-bad"><b>整批未执行</b>：' + R.rejected.length +
      ' 件预校验未通过，已整批取消（零副作用，样品状态未变）<div class="muted sb-sub">修正不合格项后直接重新提交即可——本批未写入任何日志，幂等键仍可复用。</div></div>' +
      '<table class="sb-table"><thead><tr><th>编号</th><th>当前状态</th><th>原因</th></tr></thead><tbody>' +
      R.rejected.map(function (x) { return '<tr><td class="sb-mono">' + e(x.code) + '</td><td>' + e(STATUS[x.status] || x.status || '—') + '</td><td>' + e(x.reason || '') + '</td></tr>'; }).join('') +
      '</tbody></table>';
  } else {
    h += '<div class="sb-concl"><b>该批次此前已提交过（幂等命中）</b>：本次未执行任何操作' +
      '<div class="muted sb-sub">后端已生效编号：' + e((R.applied || []).join('、') || '—') +
      '；列表中已标「已生效」的项无需重交，其余项已被重置为待提交，可直接用新批次重交。</div></div>';
  }
  // 底部动作条：按结果种类给出可用动作（无失败项时不渲染空壳按钮）
  var canRetry = R.kind === 'done' && (R.failed || []).some(function (f) { return f.retryable; });
  var hasFailed = R.kind === 'done' && (R.failed || []).length > 0;
  h += '<div class="sb-foot">' +
    (canRetry ? '<fluent-button appearance="accent" size="small" onclick="sbRetryFailed(this)">重试全部可重试项</fluent-button>' : '') +
    (hasFailed ? '<fluent-button appearance="neutral" size="small" onclick="sbCopyFailed()">复制失败编号</fluent-button>' : '') +
    (hasFailed ? '<fluent-button appearance="neutral" size="small" onclick="sbExportFailed()">导出失败清单 CSV</fluent-button>' : '') +
    (R.kind === 'rejected' ? '<fluent-button appearance="accent" size="small" onclick="sbRetryRejected(this)">修正后重交整批</fluent-button>' : '') +
    '<fluent-button appearance="neutral" size="small" onclick="sbQueueOp(\'clear\')">清空并开始新一批</fluent-button></div></div>';
  return h;
}

// 重试全部可重试项（T5）：只把**可重试的失败项**退回待提交，成功/跳过/需人工项原样保留在队列中，
// 由 sbRetryQueue 负责换新幂等键后重新提交——已成功项绝不会被再次提交（防重复执行）
// 返回 Promise（透传 sbSubmit）：调用方/测试须 await 才能观察到重交结果
function sbRetryFailed(btn) {
  var keep = ( _sbResult && _sbResult.failed || []).filter(function (f) { return f.retryable; }).map(function (f) { return f.code; });
  if (!keep.length) { toast('没有可重试的失败项', 'err'); return; }
  return sbRetryQueue(keep, btn);
}

// 预校验整批被拒后重交（T5）：本批零副作用、batchId 未被占用，故**复用同一幂等键**重交整批（设计 §4.4）
function sbRetryRejected(btn) {
  var codes = _sbQueue.filter(function (x) { return x.state === 'failed' || x.state === 'pending'; }).map(function (x) { return x.code; });
  if (!codes.length) { toast('队列中无可重交项', 'err'); return; }
  return sbRetryQueue(codes, btn, true);
}

// 复制失败编号（T5）：优先 Clipboard API，非安全上下文（http 局域网常见）降级为临时 textarea + execCommand
function sbCopyFailed() {
  var txt = (_sbResult && _sbResult.failed || []).map(function (f) { return f.code; }).join('\n');
  if (!txt) return;
  function fallback() {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    toast(ok ? '失败编号已复制（' + txt.split('\n').length + ' 个）' : '复制失败，请手动选择表格中的编号', ok ? 'ok' : 'err');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () { toast('失败编号已复制（' + txt.split('\n').length + ' 个）', 'ok'); }, fallback);
  } else fallback();
}

// 导出失败清单 CSV（T5）：复用 AGENTS §21 的导出约定——BOM UTF-8（Excel 直接双击不乱码）、
// CRLF 行尾、含逗号/引号/换行的字段双引号转义；列 = 编号/样品号/现状态/原因/可重试（状态输出中文）
function sbExportFailed() {
  var R = _sbResult || {};
  var rows = (R.failed || []).map(function (f) {
    var st = '';
    var it = _sbQueue.filter(function (x) { return x.code === f.code; })[0];
    if (it && it.sample) st = STATUS[it.sample.status] || it.sample.status || '';
    return [f.code, (it && it.sample && it.sample.sample_no) || '', st, f.reason || '', f.retryable ? '是' : '否'];
  });
  if (!rows.length) { toast('没有失败项可导出', 'err'); return; }
  var esc = function (v) {
    var s = (v === null || v === undefined) ? '' : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  var csv = '\uFEFF' + ['编号,样品号,现状态,原因,可重试'].concat(rows.map(function (r) { return r.map(esc).join(','); })).join('\r\n') + '\r\n';
  var d = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var name = 'batch-failed-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.csv';
  var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  toast('已导出失败清单：' + name + '（' + rows.length + ' 行）', 'ok');
}
