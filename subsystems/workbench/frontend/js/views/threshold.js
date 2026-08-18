// subsystems/workbench/frontend/js/views/threshold.js
// 阈值设置弹窗（仅 ADMIN 可见入口）：天数输入 + 快捷预设 + 实时分布预览
// 依赖：overdue.js(OVERDUE_BOUNDS/calcOverdue)、dashboard.js(_wbItems/renderWorkbenchDashboard)、
//       shared modal.js(openModal/closeModal)、api-base.js(api/showToast)
// 后端：GET/PUT /api/workbench/settings（PUT 仅 ADMIN，写库全局生效）

// 打开阈值设置弹窗：先拉无筛选全量样本（≤500 条）供预览，避免被当前筛选/分页截断
async function openThresholdModal() {
  try {
    var fresh = await api('GET', '/api/workbench?limit=500&offset=0');
    if (fresh.items && fresh.items.length) _wbItems = fresh.items;
  } catch (err) { /* 拉取失败沿用现有缓存 */ }
  openThresholdModalInner();
}

// 原 openThresholdModal 函数体（弹窗渲染 + 打开），改名后保留
function openThresholdModalInner() {
  var wd = Math.round(OVERDUE_BOUNDS.warn / 24);
  var bd = Math.round(OVERDUE_BOUNDS.bad / 24);
  var html =
    '<div class="th-form">' +
      '<div class="th-presets">' +
        '<span class="th-preset-label">快捷预设</span>' +
        '<button type="button" class="btn ghost sm" onclick="applyPreset(3,7)">3 / 7 天</button>' +
        '<button type="button" class="btn ghost sm" onclick="applyPreset(5,10)">5 / 10 天</button>' +
        '<button type="button" class="btn ghost sm" onclick="applyPreset(7,14)">7 / 14 天</button>' +
        '<button type="button" class="btn ghost sm" onclick="applyPreset(10,30)">10 / 30 天</button>' +
      '</div>' +
      '<div class="th-fields">' +
        '<div class="th-field">' +
          '<label>3 天边界 <span class="th-sub">正常与「3~7天」分界</span></label>' +
          '<div class="th-input-row"><input id="th-warn" type="number" min="1" max="60" value="' + wd + '" oninput="refreshThresholdPreview()"><span class="th-unit">天</span></div>' +
          '<div class="th-hint">即 <b id="th-warn-h">' + (wd * 24) + '</b> 小时</div>' +
        '</div>' +
        '<div class="th-field">' +
          '<label>7 天边界 <span class="th-sub">「3~7天」与「7天以上」分界</span></label>' +
          '<div class="th-input-row"><input id="th-bad" type="number" min="1" max="60" value="' + bd + '" oninput="refreshThresholdPreview()"><span class="th-unit">天</span></div>' +
          '<div class="th-hint">即 <b id="th-bad-h">' + (bd * 24) + '</b> 小时</div>' +
        '</div>' +
      '</div>' +
      '<div class="th-preview">' +
        '<div class="th-preview-title">按当前阈值，当前活跃数据样本 ' + _wbItems.length + ' 条（≤500）的分布</div>' +
        '<div class="th-bars" id="th-bars"></div>' +
        '<div class="th-err" id="th-err"></div>' +
      '</div>' +
    '</div>';
  window._thresholdMask = openModal('积压阈值设置', html, {
    foot: '<fluent-button appearance="neutral" size="small" onclick="applyPreset(3,7)">恢复默认</fluent-button>' +
          '<fluent-button appearance="neutral" size="small" onclick="closeModal(window._thresholdMask)">取消</fluent-button>' +
          '<fluent-button appearance="accent" size="small" onclick="saveThreshold()">保存</fluent-button>'
  });
  refreshThresholdPreview();
}

// 快捷预设：填入天数并刷新预览
function applyPreset(wd, bd) {
  document.getElementById('th-warn').value = wd;
  document.getElementById('th-bad').value = bd;
  refreshThresholdPreview();
}

// 实时预览：按输入天数重算三档分布（仅本地计算，未保存）
function refreshThresholdPreview() {
  var wd = parseInt(document.getElementById('th-warn').value, 10);
  var bd = parseInt(document.getElementById('th-bad').value, 10);
  var err = document.getElementById('th-err');
  document.getElementById('th-warn-h').textContent = (wd * 24) || 0;
  document.getElementById('th-bad-h').textContent = (bd * 24) || 0;

  if (!wd || !bd || wd <= 0 || bd <= 0) {
    err.textContent = '请输入大于 0 的天数';
    document.getElementById('th-bars').innerHTML = '';
    return;
  }
  if (bd <= wd) {
    err.textContent = '7 天边界必须大于 3 天边界';
    document.getElementById('th-bars').innerHTML = '';
    return;
  }
  err.textContent = '';

  var cfg = { warn: wd * 24, bad: bd * 24 };
  var cnt = { 0: 0, 1: 0, 2: 0 };
  _wbItems.forEach(function(it) { cnt[calcOverdue(it, cfg).level]++; });
  var total = _wbItems.length || 1;
  var bars = [
    { level: 0, label: '正常', count: cnt[0], cls: 'th-bar-ok' },
    { level: 1, label: wd + '~' + bd + '天', count: cnt[1], cls: 'th-bar-warn' },
    { level: 2, label: bd + '天以上', count: cnt[2], cls: 'th-bar-bad' }
  ];
  document.getElementById('th-bars').innerHTML = bars.map(function(b) {
    var pct = Math.round(b.count / total * 100);
    return '<div class="th-bar">' +
      '<span class="th-bar-label">' + b.label + '</span>' +
      '<div class="th-bar-track"><div class="th-bar-fill ' + b.cls + '" style="width:' + pct + '%"></div></div>' +
      '<span class="th-bar-count">' + b.count + ' 条</span>' +
      '</div>';
  }).join('');
}

// 保存阈值：天数换算小时后写库，成功后重渲染（全局生效）
async function saveThreshold() {
  var wd = parseInt(document.getElementById('th-warn').value, 10);
  var bd = parseInt(document.getElementById('th-bad').value, 10);
  if (!wd || !bd || wd <= 0 || bd <= 0) { showToast('请输入大于 0 的天数', 'err'); return; }
  if (bd <= wd) { showToast('7 天边界必须大于 3 天边界', 'err'); return; }
  try {
    await api('PUT', '/api/workbench/settings', { warn: wd * 24, bad: bd * 24 });
    OVERDUE_BOUNDS = { warn: wd * 24, bad: bd * 24 };
    closeModal(window._thresholdMask);
    showToast('阈值已保存，全局生效', 'ok');
    renderWorkbenchDashboard(true);
  } catch (err) {
    showToast('保存失败：' + err.message, 'err');
  }
}
