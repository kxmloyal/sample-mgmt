// fixture-scan.js — 治具扫码台
async function renderFixtureScan() {
  var html = '<div class="card" style="max-width:560px;margin:0 auto">';
  html += '<div class="scan-box" style="border:2px dashed var(--line);border-radius:12px;padding:32px 24px;text-align:center;background:var(--bg)">';
  html += '<div style="font-size:15px;color:var(--muted);margin-bottom:12px">扫描或输入治具编号（支持扫码枪自动回车）</div>';
  html += '<input id="scan-code" placeholder="FJ-000001" onkeydown="if(event.key===\'Enter\')doScanFix()" style="width:100%;max-width:380px;text-align:center;font-size:18px;box-sizing:border-box" autofocus />';
  html += '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="doScanFix()" style="min-width:120px">查询</fluent-button></div>';
  html += '<div id="scan-status" style="margin-top:12px;font-size:13px;color:var(--ok)">● 已就绪，等待扫码枪输入…</div>';
  html += '<details style="margin-top:12px;font-size:13px"><summary style="cursor:pointer;color:var(--muted)">摄像头扫码（实验性）</summary>';
  html += '<div style="margin-top:8px"><video id="cam-video" style="width:100%;max-width:400px;border-radius:8px;display:none" autoplay></video></div>';
  html += '<div><fluent-button appearance="neutral" size="small" onclick="startFxCamea()" style="margin-top:8px">开启摄像头</fluent-button>';
  html += '<fluent-button appearance="neutral" size="small" onclick="stopFxCamea()" style="margin-left:4px">关闭</fluent-button></div></details>';
  html += '<label style="margin-top:10px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:13px;cursor:pointer">';
  html += '<input type="checkbox" id="fx-continuous" onchange="toggleFxContinuous(this.checked)" />连续扫码模式</label>';
  html += '</div>';
  html += '<div id="scan-result"></div></div>';
  document.getElementById('view').innerHTML = html;
  document.getElementById('scan-code').focus();
  // 支持 #/scan?no=FJ-000011 直达预填（工作台下钻跳转用）
  var m = (location.hash || '').match(/[?&]no=([^&]+)/);
  if (m) { document.getElementById('scan-code').value = decodeURIComponent(m[1]); doScanFix(); }
}

var _fxContinuous = false;
function toggleFxContinuous(on) { _fxContinuous = on; }

function startFxCamea() {
  var v = document.getElementById('cam-video');
  if (!v) return;
  v.style.display = 'block';
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function(s) {
    v.srcObject = s; v.play();
  }).catch(function() { showToast('无法访问摄像头'); });
}
function stopFxCamea() {
  var v = document.getElementById('cam-video');
  if (v && v.srcObject) { v.srcObject.getTracks().forEach(function(t) { t.stop(); }); v.style.display = 'none'; }
}

async function doScanFix() {
  var el = document.getElementById('scan-code');
  var code = el.value.trim(); if (!code) return showToast('请输入治具编号');
  document.getElementById('scan-status').textContent = '● 查询中…';
  document.getElementById('scan-status').style.color = 'var(--muted)';
  try {
    var r = await api('GET', '/api/fixtures/scan?code=' + encodeURIComponent(code));
    document.getElementById('scan-status').textContent = '● 已就绪';
    document.getElementById('scan-status').style.color = 'var(--ok)';
    showFixActions(r);
  } catch (e) {
    document.getElementById('scan-status').textContent = '✕ ' + e.message;
    document.getElementById('scan-status').style.color = 'var(--bad)';
    document.getElementById('scan-result').innerHTML = '';
  }
  if (_fxContinuous) { el.value = ''; el.focus(); }
}

function addFxField(label, value) {
  _fxFieldsHtml += '<div class="field"><span class="lbl">' + label + '</span><span class="val">' + value + '</span></div>';
}

var _fxFieldsHtml = '';
function showFixActions(result) {
  _fixScanResult = result;
  var f = result.fixture, actions = result.allowedActions;
  _fxFieldsHtml = '';
  addFxField('状态', statusBadge(f));
  if (f.spec) addFxField('规格', e(f.spec));
  if (f.model) addFxField('型号', e(f.model));
  if (f.station) addFxField('工站', e(f.station));
  if (f.category) addFxField('分类', e(f.category));
  if (f.requested_dept) addFxField('申请部门', e(f.requested_dept));
  if (f.expected_finish_at) addFxField('RD预计完成', fmt(f.expected_finish_at));
  if (f.expected_return_at) addFxField('预计归还', fmt(f.expected_return_at));
  if (f.request_note) addFxField('申请说明', e(f.request_note));
  if (f.improvement_count > 0) addFxField('改善版次', 'V' + f.improvement_count);

  var html = '<div class="card" style="margin-top:16px;border-color:var(--line)">';
  html += '<h3 style="margin:0 0 12px">' + fixtureNoVersion(f) + ' ' + e(f.name || '—') + '</h3>';
  html += '<div class="field-grid">' + _fxFieldsHtml + '</div></div>';

  // 保养信息
  if (f.maintenance_cycle_days > 0) {
    html += '<div class="field"><span class="label">保养周期</span><span>' + f.maintenance_cycle_days + ' 天</span></div>';
    html += '<div class="field"><span class="label">上次保养</span><span>' + fmt(f.last_maintenance_at) + '</span></div>';
    var maintOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
    var nextLabel = maintOverdue ? '<span style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + ' (已逾期)</span>' : fmt(f.next_maintenance_at);
    html += '<div class="field"><span class="label">下次保养</span><span>' + nextLabel + '</span></div>';
  }
  // 存放位置（无论是否有保养周期都显示）
  if (f.storage_location) {
    html += '<div class="field"><span class="label">存放位置</span><span>' + e(f.storage_location) + '</span></div>';
  }

  // ACCEPTED 状态：显示文件管理区域
  if (f.status === 'ACCEPTED') {
    html += '<div class="card" style="margin-top:12px;padding:12px"><div style="font-weight:600;font-size:13px;color:var(--muted);margin-bottom:8px">📂 文件管理</div>';
    html += '<div id="fix-files" style="font-size:13px;color:var(--muted)">加载中…</div>';
    html += '<div style="margin-top:8px;display:flex;gap:8px;align-items:center">';
    html += '<fluent-select id="fx-file-cat" style="width:auto"><fluent-option value="design_drawing">设计图纸</fluent-option><fluent-option value="purchase_order">请购单</fluent-option><fluent-option value="other">其他</fluent-option></fluent-select>';
    html += '<input type="file" id="fx-file-input" data-fixture-id="' + f.id + '" style="display:none" onchange="onFixFileSelected()" />';
    html += '<fluent-button appearance="accent" size="small" onclick="document.getElementById(\'fx-file-input\').click()">上传文件</fluent-button></div></div>';
  }

  if (actions.length === 0) { html += '<p style="margin-top:12px;color:var(--muted);text-align:center">当前角色无可执行操作</p>'; }
  else {
    html += '<div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">';
    var labelMap = { ACCEPT: '接收治具', MAKE: '制作完成', CANCEL: '撤销申请', VERIFY: '验证移交', VERIFY_REJECT: '验证不合格退回', USE: '领用', RETURN: '归还', IMPROVE: '申请改善', IMPROVE_DONE: '改善完成', REPAIR_ME: '自行维修', REPAIR_RD_REQ: '退回RD维修', REPAIR_DONE: '维修完成', REPAIR_RD_DONE: 'RD维修完成', REPAIR_CONFIRM: '确认维修', RETIRE: '报废', MAINTENANCE: '保养' };
    actions.forEach(function (a) {
      html += '<fluent-button appearance="accent" onclick="execFixAction(\'' + f.fixture_no + '\',\'' + a + '\')">' + (labelMap[a] || a) + '</fluent-button>';
    });
    html += '</div>';
    html += '<div id="fix-action-form" style="margin-top:12px;max-width:400px"></div>';
  }
  document.getElementById('scan-result').innerHTML = html;
  if (f.status === 'ACCEPTED') loadFixFiles(f.id);
}

function execFixAction(fixtureNo, action) {
  var f = _fixScanResult.fixture;
  var formHtml = '<div class="card" style="margin-top:8px;padding:16px">';
  formHtml += '<div style="font-size:14px;font-weight:600;margin-bottom:12px">' + (ACTION_CN[action] || action) + '</div>';
  if (['USE'].includes(action)) {
    formHtml += '<label>使用位置<span style="color:var(--bad)">*</span></label><fluent-text-field id="fx-location" placeholder="生产线/工位"></fluent-text-field>';
    formHtml += '<label>预计使用天数<span style="color:var(--bad)">*</span></label><fluent-text-field id="fx-days" type="number" min="1" value="30" placeholder="如 30"></fluent-text-field>';
  }
  if (['REPAIR_DONE', 'REPAIR_RD_DONE'].includes(action)) {
    formHtml += '<label>备注说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'MAKE') {
    formHtml += '<label>备注说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
    formHtml += '<div class="field"><label>治具实物照片 <small>(必填，至少1张)</small></label>';
    formHtml += '<input type="file" id="act-photo-input" accept="image/*" style="width:100%;box-sizing:border-box" onchange="_handlePhotoSelected()" />';
    formHtml += '<div id="act-photo-list" style="margin-top:6px;font-size:12px"></div></div>';
  }
  if (['REPAIR_ME', 'REPAIR_RD_REQ', 'REPAIR_CONFIRM', 'RETIRE'].includes(action)) {
    formHtml += '<label>说明<span style="color:var(--bad)">*</span></label><textarea id="fx-note" rows="2" placeholder="请填写说明"></textarea>';
  }
  if (action === 'VERIFY') {
    formHtml += '<label>存放位置<span style="color:var(--bad)">*</span></label><fluent-text-field id="fx-location" placeholder="如：A-3-12 / 线边1号工位" value="' + e(f.storage_location || '') + '"></fluent-text-field>';
    formHtml += '<label>验证备注</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'VERIFY_REJECT') {
    var rejectTarget = (f.improvement_count > 0) ? '退回改善继续整改' : '退回 RD 重做';
    formHtml += '<div style="font-size:12px;color:var(--muted);margin-bottom:8px">将' + rejectTarget + '。请填写验证不合格的具体原因，便于整改。</div>';
    formHtml += '<label>验证不合格原因<span style="color:var(--bad)">*</span></label><textarea id="fx-note" rows="3" placeholder="请描述不合格/不合适的原因"></textarea>';
  }
  if (action === 'ACCEPT') {
    formHtml += '<label>预计完成天数<span style="color:var(--bad)">*</span></label><fluent-text-field id="fx-days" type="number" min="1" value="7"></fluent-text-field>';
    formHtml += '<label>备注说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'IMPROVE') {
    formHtml += '<label>改善说明<span style="color:var(--bad)">*</span></label><textarea id="fx-note" rows="2" placeholder="请填写改善内容"></textarea>';
  }
  if (action === 'IMPROVE_DONE') {
    formHtml += '<label>改善结果说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'RETURN') {
    formHtml += '<label>归还说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'MAINTENANCE') {
    var nextDate = '';
    var fixture = _fixScanResult ? _fixScanResult.fixture || _fixScanResult : null;
    if (fixture && fixture.next_maintenance_at) {
      nextDate = new Date(fixture.next_maintenance_at).toISOString().slice(0,10);
    }
    if (!nextDate && fixture && fixture.maintenance_cycle_days > 0) {
      var d = new Date(); d.setDate(d.getDate() + fixture.maintenance_cycle_days);
      nextDate = d.toISOString().slice(0,10);
    }
    formHtml += '<div class="field"><label>保养内容 <small>(必填)</small></label><textarea id="act-note" rows="3" required></textarea></div>';
    formHtml += '<div class="field"><label>保养日期</label><input type="date" id="act-maint-date" value="' + new Date().toISOString().slice(0,10) + '" /></div>';
    formHtml += '<div class="field"><label>下次保养</label><input type="date" id="act-next-date" value="' + nextDate + '" /></div>';
  }
  formHtml += '<fluent-button appearance="accent" style="margin-top:8px" onclick="submitFixAction(\'' + fixtureNo + '\',\'' + action + '\')">确认执行</fluent-button>';
  formHtml += '</div>';
  document.getElementById('fix-action-form').innerHTML = formHtml;
}

var _fxSubmitting = false;
async function submitFixAction(fixtureNo, action) {
  if (_fxSubmitting) return; _fxSubmitting = true; // F17 防重
  var body = { code: fixtureNo, action: action };
  var locEl = document.getElementById('fx-location');
  var daysEl = document.getElementById('fx-days');
  var noteEl = document.getElementById('fx-note');
  if (locEl) body.location = locEl.value;
  if (daysEl) { body.days = Number(daysEl.value); if (action === 'ACCEPT') body.expectedDays = Number(daysEl.value); }
  if (noteEl) body.note = noteEl.value;
  if (action === 'MAINTENANCE') {
    var md = document.getElementById('act-maint-date');
    if (md && md.value) body.maintenance_date = md.value;
    var nd = document.getElementById('act-next-date');
    if (nd && nd.value) body.next_maintenance_at = nd.value;
    var an = document.getElementById('act-note'); // F15 保养内容
    if (an && an.value) body.note = an.value;
  }
  if (action === 'MAKE') {
    var fixtureId = _fixScanResult ? (_fixScanResult.id || (_fixScanResult.fixture && _fixScanResult.fixture.id)) : null;
    if (fixtureId) await uploadPendingPhotos(fixtureId);
  }
  try {
    var r = await api('POST', '/api/fixtures/scan', body);
    showToast(r.message || '操作成功');
    document.getElementById('scan-result').innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 8px">' + fixtureNoVersion(r.fixture) + ' ' + e(r.fixture.name || '—') + '</h3><p>操作：<b>' + (ACTION_CN[action] || action) + '</b> | 当前状态：' + statusBadge(r.fixture) + '</p></div>';
    document.getElementById('fix-action-form').innerHTML = '';
    var el = document.getElementById('scan-code'); el.value = '';
    if (_fxContinuous) el.focus(); else el.focus();
  } catch (e) { showToast(e.message); }
  _fxSubmitting = false;
}

