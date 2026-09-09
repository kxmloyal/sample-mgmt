// views/scan-in.js — 管制扫码入库台（2026-09-09）
// 流程：扫标签 QR（内容=order_no）→ lookup 回显单据 → 弹库位输入（必填）→ 确认入库 → 成功提示并继续连扫。
// 入口权限（前端 NAV roles 同源）：CUSTODY/ME/ADMIN；后端再收紧「CUSTODY 须仓库部门 + ADMIN 兜底」。
// 摄像头扫码为自包含实现（BarcodeDetector，仅 HTTPS），不跨子系统引用；扫码枪走输入框 Enter。
var _siCamStream = null;
var _siHistory = []; // 连扫记录（最近 10 条，仅前端展示）

function renderScanIn() {
  var v = $('#view');
  v.innerHTML =
    '<div class="ctl-sec"><h3>扫码入库</h3>' +
    '<div class="muted" style="font-size:13px">扫管制标签二维码（或手动输入单号）→ 填库位 → 入库。仅仓库人员可用（管理员兜底）；仅「已报工」状态的单可入。</div></div>' +
    '<div class="card" style="margin-top:10px;padding:14px 16px">' +
    '<label style="font-weight:600">管制单号</label>' +
    '<div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">' +
    '<input id="si-no" placeholder="扫码枪扫描或输入单号后回车" style="flex:1;min-width:220px" autocomplete="off">' +
    '<fluent-button appearance="accent" onclick="siLookup()">查询</fluent-button></div>' +
    '<div id="si-msg" class="muted" style="font-size:12px;margin-top:6px">● 已就绪，等待扫码枪…</div>' +
    '<details style="margin-top:8px"><summary style="cursor:pointer" class="muted">或用摄像头扫码 ' +
    (location.protocol === 'https:' ? '<span style="color:var(--ok)">HTTPS ✓</span>' : '<span style="color:var(--bad)">HTTP ✗（摄像头不可用）</span>') +
    '</summary><div style="margin-top:8px">' +
    '<fluent-button appearance="neutral" size="small" onclick="siStartCamera()">开启摄像头</fluent-button>' +
    '<video id="si-cam" playsinline style="display:none;margin-top:8px;border-radius:8px;max-width:100%"></video>' +
    '<div id="si-cam-msg" class="muted" style="font-size:12px;margin-top:6px"></div></div></details>' +
    '</div>' +
    '<div id="si-result" style="margin-top:10px"></div>' +
    '<div class="ctl-sec" style="margin-top:14px"><h4>本次会话已入库 <span id="si-count">0</span> 笔</h4></div>' +
    '<div id="si-history"></div>';
  var inp = $('#si-no');
  inp.onkeydown = function (e) { if (e.key === 'Enter' || e.key === 'NumpadEnter') { e.preventDefault(); siLookup(); } };
  inp.onfocus = function () { $('#si-msg').textContent = '● 已就绪，等待扫码枪…'; };
  inp.onblur = function () { $('#si-msg').textContent = '⚠ 输入框未聚焦，扫码枪无法输入 — 点击输入框恢复'; };
  inp.focus();
}

// 预扫回显 → 弹库位输入
async function siLookup() {
  var no = $('#si-no').value.trim();
  if (!no) return;
  var box = $('#si-result');
  try {
    var r = await api('POST', '/api/control/scan-in/lookup', { order_no: no });
    box.innerHTML = '<div class="card" style="padding:14px 16px;border-color:#86efac">' +
      '<b>' + esc(r.order_no) + '</b> · ' + esc(r.part_name || '') + '（' + esc(r.part_no || '') + '）× ' + esc(String(r.qty != null ? r.qty : '—')) +
      '<div class="muted" style="font-size:12px;margin-top:2px">状态：已报工，可入库' + (r.storage_location ? ' · 原库位：' + esc(r.storage_location) : '') + '</div>' +
      '<label style="display:block;font-weight:600;margin-top:10px">库位 *</label>' +
      '<div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">' +
      '<input id="si-loc" placeholder="如 A-01-03（必填）" style="flex:1;min-width:200px" value="' + esc(r.storage_location || '') + '">' +
      '<fluent-button appearance="accent" onclick="siConfirm()">确认入库</fluent-button>' +
      '<fluent-button appearance="neutral" onclick="siReset()">取消</fluent-button></div>' +
      '<div id="si-loc-msg" class="muted" style="font-size:12px;margin-top:4px"></div></div>';
    var loc = $('#si-loc');
    loc.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); siConfirm(); } };
    loc.focus();
  } catch (err) {
    box.innerHTML = '<div class="card" style="padding:12px 16px;border-color:#fecaca"><span style="color:var(--bad)">✗ ' + esc(err.message) + '</span></div>';
    siResetInput();
  }
}

// 确认入库
async function siConfirm() {
  var no = $('#si-no').value.trim();
  var loc = ($('#si-loc') && $('#si-loc').value.trim()) || '';
  if (!loc) { $('#si-loc-msg').textContent = '✗ 库位必填，请填写后再入库'; $('#si-loc').focus(); return; }
  var box = $('#si-result');
  try {
    var r = await api('POST', '/api/control/scan-in', { order_no: no, storage_location: loc });
    box.innerHTML = '<div class="card" style="padding:14px 16px;border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ 入库成功</h3>' +
      '<p>' + esc(r.order_no) + ' · ' + esc(r.part_name || '') + ' × ' + esc(String(r.qty != null ? r.qty : '—')) + ' · 库位 <b>' + esc(r.storage_location) + '</b></p>' +
      '<fluent-button appearance="accent" size="small" onclick="siReset()">继续扫码</fluent-button></div>';
    _siHistory.unshift({ no: r.order_no, name: r.part_name || '', loc: r.storage_location, at: new Date() });
    if (_siHistory.length > 10) _siHistory.length = 10;
    siRenderHistory();
    siResetInput();
  } catch (err) {
    box.innerHTML = '<div class="card" style="padding:12px 16px;border-color:#fecaca"><span style="color:var(--bad)">✗ ' + esc(err.message) + '</span>' +
      '<div style="margin-top:8px"><fluent-button appearance="neutral" size="small" onclick="siLookup()">重试</fluent-button> ' +
      '<fluent-button appearance="neutral" size="small" onclick="siReset()">重新扫码</fluent-button></div></div>';
  }
}

function siRenderHistory() {
  $('#si-count').textContent = String(_siHistory.length);
  $('#si-history').innerHTML = _siHistory.map(function (h) {
    return '<div class="pk-row"><span class="pk-name">' + esc(h.no) + '</span><span>' + esc(h.name) + '</span>' +
      '<span>库位 ' + esc(h.loc) + '</span><span class="muted">' + h.at.toTimeString().slice(0, 5) + '</span></div>';
  }).join('') || '<div class="muted" style="padding:8px 0">暂无记录</div>';
}

function siResetInput() { $('#si-no').value = ''; $('#si-no').focus(); }
function siReset() {
  $('#si-result').innerHTML = '';
  siStopCamera();
  siResetInput();
}

// 摄像头扫码（自包含；仅 HTTPS + BarcodeDetector 支持的浏览器）
function siCamOk() { return location.protocol === 'https:' && 'BarcodeDetector' in window; }
async function siStartCamera() {
  var msg = $('#si-cam-msg'), video = $('#si-cam');
  if (!siCamOk()) {
    msg.textContent = location.protocol !== 'https:'
      ? '摄像头仅 HTTPS 可用，当前为 HTTP。请使用扫码枪或手动输入。'
      : '当前浏览器不支持摄像头识别，请使用 Chrome/Edge 或扫码枪。';
    return;
  }
  try {
    _siCamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = _siCamStream; video.style.display = 'block'; await video.play();
    var bd = new BarcodeDetector({ formats: ['qr_code'] });
    msg.textContent = '摄像头已开启，对准管制标签二维码…';
    var tick = async function () {
      if (!video.isConnected) return;
      if (video.readyState >= 2) {
        try {
          var cs = await bd.detect(video);
          if (cs.length) { siStopCamera(); $('#si-no').value = cs[0].rawValue.trim(); siLookup(); return; }
        } catch (e) { /* 单帧识别失败忽略 */ }
      }
      requestAnimationFrame(tick);
    };
    tick();
  } catch (e) {
    if (e.name === 'NotAllowedError') msg.textContent = '摄像头权限被拒绝，请在浏览器设置中允许。';
    else if (e.name === 'NotFoundError') msg.textContent = '未检测到摄像头设备。';
    else msg.textContent = '摄像头启动失败：' + e.message;
  }
}
function siStopCamera() {
  if (_siCamStream) { _siCamStream.getTracks().forEach(function (t) { t.stop(); }); _siCamStream = null; }
  var video = $('#si-cam');
  if (video) video.style.display = 'none';
}
