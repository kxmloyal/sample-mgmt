// subsystems/samples/frontend/js/views/scan-batch-result.js — 批量结果面板渲染（2026-09-16 自 scan-batch.js 拆出）
// 拆分原因：scan-batch.js 加入结果面板后达 71.3%，越过 AGENTS §7.1 的 70% 预警线（须停止新增业务 + 输出拆分方案）；
// 且 §7.3 要求「页面复杂渲染逻辑 SHOULD 抽 hooks/helper 独立文件」——本文件只负责把 _sbResult 渲染成 HTML，
// 队列状态机与提交流程仍留在 scan-batch.js。
// 依赖均为 bundle 单作用域内的全局符号：e（shared/frontend/shared/utils.js）、STATUS（constants.js）、_sbResult（scan-batch.js）。
// 结果面板（设计 §4.3 三段式 IA）：结论条 + 成功/失败/跳过三组 + 底部动作条
// 注：失败重试、复制编号、导出失败清单 CSV 属 T5 范围，本文件暂不提供对应按钮（避免空壳入口）
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
      ' 件预校验未通过，已整批取消（零副作用，样品状态未变）<div class="muted sb-sub">修正不合格项后重新提交；提交时请换用新的批次（本批已被后端记为未执行）。</div></div>' +
      '<table class="sb-table"><thead><tr><th>编号</th><th>当前状态</th><th>原因</th></tr></thead><tbody>' +
      R.rejected.map(function (x) { return '<tr><td class="sb-mono">' + e(x.code) + '</td><td>' + e(STATUS[x.status] || x.status || '—') + '</td><td>' + e(x.reason || '') + '</td></tr>'; }).join('') +
      '</tbody></table>';
  } else {
    h += '<div class="sb-concl"><b>该批次此前已提交过（幂等命中）</b>：本次未执行任何操作' +
      '<div class="muted sb-sub">后端已生效编号：' + e((R.applied || []).join('、') || '—') +
      '；列表中已标「已生效」的项无需重交，其余项可用新批次提交。</div></div>';
  }
  h += '<div class="sb-foot"><fluent-button appearance="neutral" size="small" onclick="sbQueueOp(\'clear\')">清空并开始新一批</fluent-button></div></div>';
  return h;
}
