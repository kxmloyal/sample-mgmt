// subsystems/control/frontend/js/settings.js — 超期滞留阈值设置（仅 ADMIN 可调整）
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.1.2
// 依赖：shared modal.js(openModal/closeModal)、api-base.js(api/showToast)、views/dashboard.js(renderDashboard 重渲染)
// 后端：GET/PUT /api/control/settings（PUT 仅 ADMIN，写 control_settings 全局生效）

var _ctlOverdueHours = 48; // 当前生效阈值（小时），缺省 48，加载/保存后更新

// 拉取当前阈值；失败（表未建/后端未重启）回退 48
async function ctlLoadSettings() {
  try {
    var res = await api('GET', '/api/control/settings');
    _ctlOverdueHours = res && res.overdue_hours != null ? Number(res.overdue_hours) : 48;
  } catch (err) {
    _ctlOverdueHours = 48;
  }
}

// 打开阈值设置弹窗（入口来自看板顶部 gear，仅 ADMIN 可见）
function openControlThresholdModal() {
  var html =
    '<div class="ctl-th">' +
      '<div class="ctl-th-presets">' +
        '<span class="ctl-th-label">快捷预设</span>' +
        '<button type="button" class="btn ghost sm" onclick="ctlApplyHours(24)">24h</button>' +
        '<button type="button" class="btn ghost sm" onclick="ctlApplyHours(48)">48h</button>' +
        '<button type="button" class="btn ghost sm" onclick="ctlApplyHours(72)">72h</button>' +
      '</div>' +
      '<div class="ctl-th-field">' +
        '<label>超期滞留阈值 <span class="ctl-th-sub">小时</span></label>' +
        '<div class="ctl-th-input-row"><input id="ctl-oh" type="number" min="1" max="720" value="' + _ctlOverdueHours + '"><span>小时</span></div>' +
        '<div class="ctl-th-hint">滞留超过该小时数即视为「超期滞留」，看板卡片高亮提醒</div>' +
      '</div>' +
    '</div>';
  window._ctlThresholdMask = openModal('超期滞留阈值设置', html, {
    foot: '<fluent-button appearance="neutral" size="small" onclick="ctlApplyHours(48)">恢复默认(48h)</fluent-button>'
      + '<fluent-button appearance="neutral" size="small" onclick="closeModal(window._ctlThresholdMask)">取消</fluent-button>'
      + '<fluent-button appearance="accent" size="small" onclick="ctlSaveThreshold()">保存</fluent-button>'
  });
}

// 快捷预设：填入小时数
function ctlApplyHours(h) {
  var el = document.getElementById('ctl-oh');
  if (el) el.value = h;
}

// 保存阈值：校验 1~720 后写库，成功后更新内存并重渲染看板
async function ctlSaveThreshold() {
  var el = document.getElementById('ctl-oh');
  var h = parseInt(el && el.value, 10);
  if (!Number.isFinite(h) || h < 1 || h > 720) { showToast('阈值需为 1~720 之间的整数', 'err'); return; }
  try {
    var res = await api('PUT', '/api/control/settings', { overdue_hours: h });
    _ctlOverdueHours = res && res.overdue_hours != null ? Number(res.overdue_hours) : h;
    closeModal(window._ctlThresholdMask);
    showToast('阈值已保存，全局生效', 'ok');
    if (typeof renderDashboard === 'function') renderDashboard();
  } catch (err) {
    showToast('保存失败：' + err.message, 'err');
  }
}
