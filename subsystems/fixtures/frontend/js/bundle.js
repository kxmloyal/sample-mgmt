/** BUNDLE vbmtbkaco2 — 17 files */
/* --- shared constants (data/*.json) --- */
var LIMIT_ITEMS = [{"code":"A","label":"成品震动(限度)"},{"code":"AI","label":"扇叶震动(限度)"},{"code":"A1","label":"MCU IC烧録器(限度)"},{"code":"A2","label":"平衡机测试(限度)"},{"code":"A3","label":"入充磁扇叶组立(限度)"},{"code":"B","label":"异音(限度)"},{"code":"C","label":"外观(限度)"},{"code":"D","label":"定子组绝缘耐压/阻抗"},{"code":"E","label":"马达组电测（波形、反转）"},{"code":"F","label":"层间测试"},{"code":"G","label":"定子组大小边"},{"code":"H","label":"AOI视觉/CCD检测"},{"code":"I","label":"压定子高度"},{"code":"J","label":"扣环检测"},{"code":"K","label":"PCB组与定子组结合焊锡"},{"code":"L","label":"自动化马达组组立"},{"code":"M","label":"马达组焊导线组"},{"code":"N","label":"导线焊点位置检测"},{"code":"O","label":"断电功能检测"},{"code":"P","label":"成品检测(转速、电流)"},{"code":"Q","label":"定子组自动绕、缠线"},{"code":"R","label":"铜轴承自动化"},{"code":"S","label":"CCD检测浸锡后定子组"},{"code":"T","label":"CCD检测外框组"},{"code":"U","label":"2Ball成品自动化组立"},{"code":"X","label":"特殊工站"}];
var SOURCE_TYPES = {"C":"客供","T":"元山","G":"元将五金塔岗分厂"};
var DEPTS = ["系统","研发部","品保文管中心","制造部","资材部","FQC","生技部","项目部"];

/* --- shared/frontend/shared/utils.js --- */
// shared/utils.js — 跨子系统公共工具函数

/** HTML 实体转义，防止 XSS */
function e(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/** 格式化文件大小 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0, size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

/** 修复 fluent-data-grid 列宽：Shadow DOM 仅 slot，row 本身是 grid 容器。
 *  fixGridColumns(el) 读取每个表头 cell 的 data-w 属性作为该列宽度，
 *  未设置 data-w 时回退 1fr（向后兼容：无 data-w 的表格行为不变）。
 *  data-w 取值示例：'120px' / 'min-content' / '2fr' / 'auto'。
 */
function fixGridColumns(container) {
  function apply() {
    (container || document).querySelectorAll('fluent-data-grid').forEach(function(grid) {
      try {
        var hdr = grid.querySelector('fluent-data-grid-row[row-type="header"]');
        if (!hdr) return;
        var cells = hdr.querySelectorAll('fluent-data-grid-cell');
        if (!cells.length) return;
        // 读取表头 cell 的 data-w 属性，未设置回退 1fr（保持向后兼容）
        var cols = Array.prototype.map.call(cells, function(c) {
          return c.getAttribute('data-w') || '1fr';
        }).join(' ');
        // grid 容器是 row（Shadow DOM 仅 slot），给每个 row 设 inline style
        grid.querySelectorAll('fluent-data-grid-row').forEach(function(row) {
          row.style.gridTemplateColumns = cols;
        });
      } catch(e) {}
    });
  }
  var TAG = 'fluent-data-grid';
  if (window.customElements) {
    customElements.whenDefined(TAG).then(function() { requestAnimationFrame(apply); });
  } else { apply(); }
}

/** 列宽拖拽调整 — 拖拽 th 右侧的 .col-rsz 把手修改对应 col 宽度（样品/治具共用） */
function _initColResize(table) {
  if (!table) return;
  var cols = table.querySelectorAll('colgroup col');
  var ths = table.querySelectorAll('thead th');
  ths.forEach(function(th, i) {
    var handle = th.querySelector('.col-rsz');
    if (!handle) return;
    var dragging = false, startX, startW;
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault(); e.stopPropagation();
      dragging = true; startX = e.pageX;
      startW = cols[i] ? parseInt(cols[i].style.width || getComputedStyle(cols[i]).width) : th.offsetWidth;
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var w = Math.max(36, startW + (e.pageX - startX));
      if (cols[i]) cols[i].style.width = w + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    });
  });
}

// 兼容别名：toast() → showToast()（从 public/js/ui.js 迁移）
function toast(msg, type) { showToast(msg, type); }


/* --- shared/frontend/api-base.js --- */
// shared/frontend/api-base.js — 框架共享前端基础
// 包含 ROLE/STATUS/ACTION_CN 常量 + 通用函数（两个子系统共用）

var $ = function (s, r) { return (r || document).querySelector(s); };

var ROLE = { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)', PM: '项目经理(PM)' };
var STATUS = {
  // 样品状态
  NEW: '新建·待制作确认', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', RETURNING: '退回审核中',
  // 治具状态
  REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待验证',
  VERIFY_RD_OK: 'RD验证通过', VERIFY_ORG_OK: '申请单位确认',
  TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
  REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成',
  // 共用
  RETIRED: '已废弃'
};
var ACTION_CN = {
  // 样品操作
  CREATE: '新建样品', PRODUCE: '确认制作完成', RELEASE: '正式发行', INSPECT: '复检完成', INSPECT_EARLY: '提前复检',
  CUSTODY: '接收保管', EDIT_CARD: '修正标示卡', EDIT_STORAGE: '修改储位',
  RETURN_REQUEST: '申请退回', RE_RELEASE: '重新发行', RETIRE_RECREATE: '退回研发重做', RETIRE_ONLY: '直接作废',
  RETURN_REJECT: '拒绝退回', RECREATE: '创建替代品', RECREATE_REPLACED: '被替代', UPDATE_CARD: '更新标示卡信息',
  // 治具操作
  ACCEPT: 'RD接收', MAKE: '制作完成', MAKE_DONE: '制作完成', CANCEL: '撤销申请',
  VERIFY: '验证移交',
  // 历史双人验证动作（存量数据兼容，当前流程已改为单人验证）
  VERIFY_RD: 'RD验证通过', VERIFY_ME: 'ME验证通过', VERIFY_ORG: '申请单位验证',
  TRANSFER: '移交',
  USE: '领用', RETURN: '归还', IMPROVE: '申请改善', IMPROVE_DONE: '改善完成',
  MAINTENANCE: '保养完成',
  REPAIR_ME: 'ME自行维修', REPAIR_RD_REQ: '退回RD维修',
  REPAIR_DONE: 'ME维修完成', REPAIR_RD_DONE: 'RD维修完成',
  REPAIR_CONFIRM: 'ME确认维修', RETIRE: '报废',
  FILE_UPLOAD: '上传文件'
};

async function api(method, url, body) {
  var opt = { method: method, credentials: 'include', headers: {} };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  var r = await fetch(url, opt);
  var text = await r.text();
  var data = {};
  try { data = JSON.parse(text); } catch (e) { data = {}; }
  if (!r.ok) throw new Error(data.error || ('错误 ' + r.status));
  return data;
}

async function doLogin() {
  var err = document.getElementById('lg-err');
  err.textContent = '';
  try {
    me = await api('POST', '/api/login', {
      username: document.getElementById('lg-user').value,
      password: document.getElementById('lg-pass').value
    });
    document.getElementById('login').style.display = 'none';
    showApp();
  } catch (e) { err.textContent = e.message; }
}

async function doLogout() {
  try { await api('POST', '/api/logout'); } catch (e) { }
  location.reload();
}

// 演示模式：登录页展示演示账号（由后端 /api/config 的 demoMode 控制，生产环境可关闭）
async function showDemoHint() {
  var el = document.getElementById('demo-hint');
  if (!el) return;
  try {
    var cfg = await api('GET', '/api/config');
    el.style.display = cfg.demoMode ? 'block' : 'none';
  } catch (e) { el.style.display = 'none'; }
}

async function boot(pageTitle) {
  showDemoHint();
  try {
    var res = await api('GET', '/api/me');
    me = res;
    document.title = pageTitle || '制造品质管理系统';
    showApp();
  } catch (e) { document.getElementById('login').style.display = 'flex'; }
}

function statusBadge(row) {
  var cls0 = row.status || 'NEW';
  var cls = 'b-' + cls0;
  var label = row._statusLabel || cls0;
  return '<fluent-badge class="badge ' + cls + '" appearance="filled">' + label + '</fluent-badge>';
}

// 日期显示：纯日期原样返回；ISO 日期时间按本地时区转日期（修复 UTC 截取导致 GMT+8 下差一天）
function fmt(d) {
  if (!d) return '—';
  var s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var m = String(dt.getMonth() + 1), day = String(dt.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return dt.getFullYear() + '-' + m + '-' + day;
  }
  return s.slice(0, 10);
}

function showToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(function() { el.className = 'toast'; }, 2500);
}

var me = null;


/* --- shared/frontend/modal.js --- */
// modal.js — 通用弹窗组件（零依赖，治具/样品共用）
function openModal(title,html,opts){opts=opts||{};document.body.style.overflow='hidden';var m=document.createElement('div');m.className='modal-mask';var headHTML=opts.head!=null?opts.head:'<h3>'+title+'</h3>';var footHTML=opts.foot!=null?opts.foot:'<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>';m.innerHTML='<fluent-dialog id="fluent-modal" modal="true" trap-focus="true"><div class="modal-head">'+headHTML+'</div><div class="modal-body">'+html+'</div><div class="modal-foot">'+footHTML+'</div></fluent-dialog>';m.addEventListener('click',function(e){if(e.target===m){closeModal(m);}});document.body.appendChild(m);return m;}
function closeModal(mask){mask.remove();var all=document.querySelectorAll('.modal-mask');if(all.length===0)document.body.style.overflow='';}


/* --- subsystems/fixtures/frontend/js/api.js --- */
// fixture-api.js — 治具 API 请求 + 鉴权（公共基础见 shared/api-base.js）
var me = null;

// ---- 治具专用工具 ----
function fixtureVersion(f) {
  if (!f.improvement_count || f.improvement_count <= 0) return '';
  return '-V' + f.improvement_count;
}
function fixtureNoVersion(f) {
  return (f.fixture_no || '') + fixtureVersion(f);
}

// ---- 鉴权覆盖（治具用 showFixtureApp 启动） ----
async function bootFixture() {
  showDemoHint();
  try {
    me = await api('GET', '/api/me');
    document.getElementById('me-name').textContent = me.display_name || me.username;
    document.getElementById('me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    buildFixtureNav(); routeFixture();
  } catch (e) { document.getElementById('login').style.display = 'flex'; }
}
async function doLogin() {
  document.getElementById('lg-err').textContent = '';
  try {
    me = await api('POST', '/api/login', { username: document.getElementById('lg-user').value, password: document.getElementById('lg-pass').value });
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('me-name').textContent = me.display_name || me.username;
    document.getElementById('me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
    buildFixtureNav(); routeFixture();
  } catch (e) { document.getElementById('lg-err').textContent = e.message; }
}

// ---- 导航 ----
function buildFixtureNav() {
  var nav = [
    { id: 'dashboard', label: '治具看板' },
    { id: 'list', label: '治具清单' },
    { id: 'new', label: '新建申请' },
    { id: 'scan', label: '扫码台' },
    { id: 'logs', label: '操作日志' }
  ];
  document.getElementById('nav').innerHTML = nav.map(function (n) {
    return '<button data-k="' + n.id + '" onclick="goFixture(\'' + n.id + '\')">' + n.label + '</button>';
  }).join('');
  setFixtureActive('dashboard');
}

function setFixtureActive(k) {
  document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.k === k); });
}

function goFixture(page) {
  location.hash = '#/' + page;
}

// ---- 治具专用 helpers ----
function isOverdue(f) { return f.status === 'IN_USE' && f.expected_return_at && new Date(f.expected_return_at).getTime() < Date.now(); }
// 覆盖 shared/api-base.js 的 statusBadge：治具逾期检测
function statusBadge(f) {
  var cls = 'b-' + (f.status === 'IN_USE' && isOverdue(f) ? 'overdue' : f.status);
  return '<fluent-badge class="badge ' + cls + '" appearance="filled">' + (STATUS[f.status] || f.status) + '</fluent-badge>';
}
function goFixScan(code) { location.hash = '#/scan'; setTimeout(function() { var el = document.getElementById('scan-code'); if (el && code) el.value = code; }, 50); }


/* --- subsystems/fixtures/frontend/js/views/fixture-inspect.js --- */
// fixture-inspect.js — 治具到期状态计算与徽章渲染
// 两个到期维度：保养（next_maintenance_at，未报废即参与）+ 领用归还（expected_return_at，仅 IN_USE）
// 判定与后端 dao 一致：保养 listOverdue/UpcomingMaintenance；归还 listOverdueFixtures
// 逾期天数统一 Math.ceil 向上取整（与治具看板/详情一致）：刚超期即显示 1 天

var FIXTURE_SOON_DAYS = 7;

/** 保养状态：'none'|'ok'|'soon'|'overdue'（已报废或无保养计划返回 none） */
function maintState(f) {
  if (!f || f.retired_at || !f.next_maintenance_at) return 'none';
  var t = new Date(f.next_maintenance_at).getTime();
  if (t <= Date.now()) return 'overdue';
  if (t <= Date.now() + FIXTURE_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 归还状态：'none'|'ok'|'soon'|'overdue'（仅领用中且有归还期限时参与） */
function returnState(f) {
  if (!f || f.status !== 'IN_USE' || !f.expected_return_at) return 'none';
  var t = new Date(f.expected_return_at).getTime();
  if (t < Date.now()) return 'overdue';
  if (t <= Date.now() + FIXTURE_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 通用徽章渲染：none 灰色占位；ok/soon 用各自类；overdue 复用共享 .b-overdue */
function _dueBadge(st, date, okCls, soonCls, overdueLabel) {
  if (st === 'none') return '<span class="muted">—</span>';
  var tip = date ? ' title="到期日：' + fmt(date) + '"' : '';
  if (st === 'ok') return '<span class="badge ' + okCls + '"' + tip + '>正常</span>';
  if (st === 'soon') return '<span class="badge ' + soonCls + '"' + tip + '>近7天到期</span>';
  var days = Math.ceil((Date.now() - new Date(date).getTime()) / 86400000);
  return '<span class="badge b-overdue"' + tip + '>' + overdueLabel + days + '天</span>';
}

/** 保养状态徽章 HTML */
function maintBadge(f) {
  return _dueBadge(maintState(f), f && f.next_maintenance_at, 'b-maint-ok', 'b-maint-soon', '逾期');
}

/** 归还状态徽章 HTML */
function returnBadge(f) {
  return _dueBadge(returnState(f), f && f.expected_return_at, 'b-ret-ok', 'b-ret-soon', '超期');
}


/* --- subsystems/fixtures/frontend/js/file-api.js --- */
// fixture-file-api.js — 治具文件管理前端常量与API函数
var FILE_CATEGORY_CN = { design_drawing: '设计图纸', purchase_order: '请购单', fixture_photo: '实物照片', maintenance_photo: '保养照片', site_photo: '现场照片', other: '其他' };
var PREVIEW_TYPES = ['image/png','image/jpeg','image/gif','image/webp','application/pdf'];

function fileIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (mimeType.includes('dwg') || mimeType.includes('cad') || mimeType.includes('step') || mimeType.includes('iges') || mimeType === 'model/stl' || mimeType === 'application/sla') return '✏️';
  if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('compress')) return '📦';
  return '📎';
}

function filePreviewUrl(fixtureId, fileId) {
  return '/api/fixtures/' + fixtureId + '/files/' + fileId + '/download';
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function fetchFixtureFiles(fixtureId) {
  return await api('GET', '/api/fixtures/' + fixtureId + '/files');
}

async function uploadFixtureFile(fixtureId, file, category) {
  var formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);
  var resp = await fetch('/api/fixtures/' + fixtureId + '/files', { method: 'POST', body: formData, credentials: 'same-origin' });
  if (!resp.ok) {
    var err = await resp.json().catch(function() { return { error: '上传失败' }; });
    throw new Error(err.error || '上传失败');
  }
  return await resp.json();
}

async function deleteFixtureFile(fixtureId, fileId) {
  return await api('DELETE', '/api/fixtures/' + fixtureId + '/files/' + fileId);
}


/* --- subsystems/fixtures/frontend/js/file-ui.js --- */
// fixture-file-ui.js — 治具文件管理 UI（上传/列表/预览/3D）

async function loadFixFiles(fixtureId) {
  try {
    var files = await fetchFixtureFiles(fixtureId);
    var el = document.getElementById('fix-files');
    if (!el) return;
    if (!files || !files.length) {
      el.innerHTML = '<span style="color:var(--bad)">⚠ 请先上传设计图纸（制作前必须）</span>';
      return;
    }
    el.innerHTML = files.map(function(file) { return renderFixFileItem(fixtureId, file); }).join('');
  } catch (e) { var el2 = document.getElementById('fix-files'); if (el2) el2.innerHTML = '加载失败'; }
}

function renderFixFileItem(fixtureId, file) {
  var isImage = file.mime_type && file.mime_type.startsWith('image/');
  var isPreview = PREVIEW_TYPES.indexOf(file.mime_type) !== -1;
  var is3D = file.mime_type === 'model/stl' || /step|iges|stp|igs|stl/i.test(file.original_name || '');
  var catLabel = FILE_CATEGORY_CN[file.category] || file.category;
  var html = '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line)">';
  if (isImage) {
    html += '<img src="' + filePreviewUrl(fixtureId, file.id) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="previewFixFile(event,' + fixtureId + ',' + file.id + ',\'' + (file.mime_type||'') + '\')" />';
  } else {
    html += '<span style="font-size:18px">' + fileIcon(file.mime_type) + '</span>';
  }
  html += '<span style="flex:1;min-width:0"><span style="font-size:13px">' + e(file.original_name) + '</span><br><small style="color:var(--muted)">' + catLabel + ' · ' + formatFileSize(file.file_size) + ' · ' + fmt(file.uploaded_at) + '</small></span>';
  if (isPreview || isImage) {
    html += '<a class="link" style="font-size:12px;white-space:nowrap" onclick="previewFixFile(event,' + fixtureId + ',' + file.id + ',\'' + (file.mime_type||'') + '\')">预览</a>';
  }
  if (!isPreview && !isImage && is3D) {
    html += '<a class="link" style="font-size:12px;white-space:nowrap" onclick="preview3DFile(event,' + fixtureId + ',' + file.id + ',\'' + e(file.original_name) + '\')">3D预览</a>';
  }
  html += '<a class="link" style="font-size:12px;white-space:nowrap;margin-left:4px" href="' + filePreviewUrl(fixtureId, file.id) + '" download>下载</a>';
  html += '<a class="link" style="font-size:12px;white-space:nowrap;color:var(--bad);margin-left:4px" onclick="deleteFixFile(event,' + fixtureId + ',' + file.id + ')">删除</a>';
  html += '</div>';
  return html;
}

function onFixFileSelected() {
  var input = document.getElementById('fx-file-input');
  var cat = document.getElementById('fx-file-cat');
  var fixtureId = Number(input.dataset.fixtureId);
  if (!fixtureId) { showToast('无法确定治具ID'); return; }
  if (!input.files || !input.files[0]) return;
  var file = input.files[0];
  uploadFixtureFile(fixtureId, file, cat.value).then(function() {
    showToast('上传成功');
    loadFixFiles(fixtureId);
    var codeEl = document.getElementById('scan-code');
    if (codeEl && codeEl.value) doScanFix();
  }).catch(function(e) { showToast(e.message); });
}

function previewFixFile(e, fixtureId, fileId, mimeType) {
  e.stopPropagation();
  var url = filePreviewUrl(fixtureId, fileId);
  if (mimeType.startsWith('image/')) {
    var overlay = document.createElement('div');
    overlay.className = 'modal-mask';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay.onclick = function(ev) { if (ev.target === overlay) overlay.remove(); };
    overlay.innerHTML = '<img src="' + url + '" style="max-width:90vw;max-height:90vh;border-radius:8px" /><button style="position:absolute;top:20px;right:20px;background:none;border:none;font-size:24px;color:#fff;cursor:pointer" onclick="this.closest(\'.modal-mask\').remove()">&times;</button>';
    document.body.appendChild(overlay);
  } else if (mimeType === 'application/pdf') {
    var overlay2 = document.createElement('div');
    overlay2.className = 'modal-mask';
    overlay2.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.7);z-index:2000;display:flex;align-items:center;justify-content:center';
    overlay2.onclick = function(ev) { if (ev.target === overlay2) overlay2.remove(); };
    overlay2.innerHTML = '<div style="position:relative;width:90vw;height:90vh"><button style="position:absolute;top:-30px;right:0;background:none;border:none;font-size:24px;color:#fff;cursor:pointer" onclick="this.closest(\'.modal-mask\').remove()">&times;</button><iframe src="' + url + '" style="width:100%;height:100%;border:none;border-radius:8px"></iframe></div>';
    document.body.appendChild(overlay2);
  }
}

function preview3DFile(e, fixtureId, fileId, fileName) {
  e.stopPropagation();
  var url = '/3d-viewer.html?url=' + encodeURIComponent('/api/fixtures/' + fixtureId + '/files/' + fileId + '/preview') + '&name=' + encodeURIComponent(fileName);
  window.open(url, '_blank', 'width=1200,height=800');
}

async function deleteFixFile(e, fixtureId, fileId) {
  e.stopPropagation();
  try {
    await deleteFixtureFile(fixtureId, fileId);
    showToast('已删除');
    loadFixFiles(fixtureId);
    var codeEl = document.getElementById('scan-code');
    if (codeEl && codeEl.value) doScanFix();
  } catch (err) { showToast(err.message); }
}


/* --- subsystems/fixtures/frontend/js/views/dashboard.js --- */
// fixture-dashboard.js — 治具看板
var _dashData = null, _dashFilter = 0; // 当前激活的统计卡索引，0=待处理（默认）
// 统计卡配置：[标签, 状态筛选键, 数据源键, 卡片状态色(对应 CSS 变量)]
var DASH_STATS = [
  { label: '待处理', status: null,             countKey: 'myPending', color: 'var(--brand)' },
  { label: '待验证', status: 'VERIFY_ALL', countByStatus: true,  color: 'var(--warn)' },
  { label: '领用中', status: 'IN_USE',          countByStatus: true,  color: '#1d4ed8' },
  { label: '已接收', status: 'ACCEPTED',       countByStatus: true,  color: '#065f46' },
  { label: '改善中', status: 'IMPROVING',       countByStatus: true,  color: '#92400e' },
  { label: '待保养', status: 'MAINTENANCE_DUE', countByStatus: true,  color: 'var(--bad)' },
  { label: '呆滞', status: 'DORMANT', dormantCount: true, color: '#b91c1c' }
];

async function renderFixtureDashboard() {
  try {
    document.getElementById('view').innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
    _dashData = await api('GET', '/api/fixtures/dashboard');
    _dashFilter = 0;
    _renderDashContent();
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

function filterDashStats(idx) {
  _dashFilter = (_dashFilter === idx) ? 0 : idx;
  _renderDashContent();
}

function esc(s) { return (s||'').replace(/'/g,"\\'"); }

// 渲染逾期未归还表
function _renderOverdueTable(items) {
  return '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="width:130px"><col style="width:100px"><col style="width:80px"><col style="width:100px"></colgroup><thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th><th>预计归还<span class="col-rsz"></span></th></tr></thead><tbody>' +
    items.map(function(f) {
      return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="编号"><b>' + e(f.fixture_no || '—') + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="预计归还" style="color:var(--bad);font-weight:600">' + fmt(f.expected_return_at) + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 渲染待保养治具表（逾期保养+即将到期保养共用）
function _renderMaintTable(items) {
  return '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="width:120px"><col style="width:90px"><col style="width:100px"><col style="width:100px"><col style="width:80px"></colgroup><thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>存放位置<span class="col-rsz"></span></th><th>上次保养<span class="col-rsz"></span></th><th>应保养日期<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th></tr></thead><tbody>' +
    items.map(function(f) {
      var isOverdue = f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date();
      var overdueDays = isOverdue ? Math.ceil((new Date() - new Date(f.next_maintenance_at)) / 86400000) : 0;
      var label = isOverdue ? '<span style="color:var(--bad);font-weight:600">已逾期' + overdueDays + '天</span>' : '<span style="color:#d97706">即将到期</span>';
      var cls = isOverdue ? ' class="overdue-row"' : '';
      return '<tr' + cls + ' style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="编号"><b>' + e(f.fixture_no || '—') + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="存放位置" class="muted">' + e(f.storage_location || '—') + '</td><td data-label="上次保养">' + fmt(f.last_maintenance_at) + '</td><td data-label="应保养日期" style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + '</td><td data-label="状态">' + label + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 渲染呆滞治具表（状态停滞 / 在库无人领用）
function _renderDormantTable(items) {
  return '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="width:130px"><col style="width:90px"><col style="width:90px"><col style="width:110px"></colgroup><thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th><th>呆滞天数<span class="col-rsz"></span></th><th>原因<span class="col-rsz"></span></th></tr></thead><tbody>' +
    items.map(function(f) {
      return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="编号"><b>' + e(f.fixture_no || '—') + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="状态">' + statusBadge(f) + '</td><td data-label="呆滞天数" style="color:var(--bad);font-weight:600">' + f.dormant_days + ' 天</td><td data-label="原因">' + e(f.dormant_reason || '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

// 呆滞阈值设置弹窗（仅 ADMIN 可见齿轮入口）
function openDormantSettings() {
  var cur = (_dashData && _dashData.dormantDays) || 60;
  openModal('呆滞阈值设置', '<div class="form-row"><label>呆滞判定阈值（天）</label><fluent-text-field id="dd-input" type="number" min="1" max="365" value="' + cur + '" style="width:100%"></fluent-text-field><p class="muted" style="margin:8px 0 0;font-size:12px">超过该天数未流转的治具将标记为呆滞（在库无人领用 / 状态长期停滞）</p></div>', {
    foot: '<fluent-button appearance="accent" onclick="saveDormantSettings()">保存</fluent-button><fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'))">取消</fluent-button>'
  });
}

async function saveDormantSettings() {
  var el = document.getElementById('dd-input');
  var days = parseInt(el ? el.value : '', 10);
  if (!days || days < 1 || days > 365) { showToast('阈值须为 1~365 天'); return; }
  try {
    var r = await api('PUT', '/api/fixtures/settings', { dormant_days: days });
    closeModal(document.querySelector('.modal-mask'));
    showToast('已保存：呆滞阈值 ' + r.dormant_days + ' 天');
    renderFixtureDashboard();
  } catch (e) { showToast(e.message); }
}

function _renderDashContent() {
  var d = _dashData;

  // 统计卡片（计数统一使用用户 myPending，而非全局 byStatus，确保点击前后数量一致）
  var html = '<div class="kb-stats">' + DASH_STATS.map(function(cfg, i) {
    var count;
    if (cfg.status === 'MAINTENANCE_DUE') {
      count = (d.maintenanceOverdueCount || 0) + (d.maintenanceUpcomingCount || 0);
    } else if (cfg.dormantCount) {
      count = d.dormantCount || 0;
    } else if (cfg.countByStatus) {
      // 按状态从 myPending 中统计当前用户可操作的条目数
      var statuses = cfg.status === 'VERIFY_ALL' ? ['VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK'] : [cfg.status];
      count = d.myPending.filter(function(f) { return statuses.indexOf(f.status) !== -1; }).length;
    } else {
      count = d.myPending.length;
    }
    var isActive = (_dashFilter === i);
    var cls = isActive ? ' active' : '';
    return '<fluent-card class="kb-stat' + cls + '" style="--stat-color:' + cfg.color + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></fluent-card>';
  }).join('') + '</div>';

  // 逾期表
  if (d.overdue.length > 0) {
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">逾期未归还 (' + d.overdue.length + ')</h3>' + _renderOverdueTable(d.overdue) + '</div>';
  }

  // 呆滞清单（标题右侧阈值齿轮，仅 ADMIN）
  if (d.dormant.length > 0) {
    var gear = (me && me.role === 'ADMIN') ? '<fluent-button appearance="lightweight" size="small" onclick="openDormantSettings()">⚙ 阈值 ' + d.dormantDays + ' 天</fluent-button>' : '<span class="muted" style="font-size:12px">阈值 ' + d.dormantDays + ' 天</span>';
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 12px"><h3 style="margin:0;color:var(--bad)">呆滞治具 (' + d.dormant.length + ')</h3>' + gear + '</div>' + _renderDormantTable(d.dormant) + '</div>';
  }

  // 逾期保养预警表
  var maintPending = (d.maintenanceOverdue || []).concat(d.maintenanceUpcoming || []);
  if (maintPending.length > 0) {
    html += '<div class="card" style="margin-top:18px;border-color:#fecaca"><h3 style="margin:0 0 12px;color:var(--bad)">待保养治具 (' + maintPending.length + ')</h3>' + _renderMaintTable(maintPending) + '</div>';
  }

  // 待办表（根据筛选）
  var filterCfg = DASH_STATS[_dashFilter];

  if (filterCfg && filterCfg.status === 'MAINTENANCE_DUE') {
    if (maintPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (' + maintPending.length + ')</h3>' + _renderMaintTable(maintPending) + '</div>';
    } else {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">待保养治具 (0)</h3><div class="empty" style="padding:16px">暂无待保养治具</div></div>';
    }
  } else if (filterCfg && filterCfg.status === 'VERIFY_ALL') {
    var verifyFiltered = d.myPending.filter(function(f) { return ['VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK'].indexOf(f.status) !== -1; });
    if (d.myPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）<span style="font-weight:400;color:var(--muted)"> · 待验证 (' + verifyFiltered.length + ')</span></h3>';
      if (verifyFiltered.length === 0) {
        html += '<div class="empty" style="padding:16px">暂无待验证的治具</div>';
      } else {
        html += '<table class="fx-dash-table"><colgroup><col style="width:36px"><col style="width:110px"><col style="width:130px"><col style="width:80px"><col style="width:90px"><col style="width:120px"><col style="width:80px"></colgroup><thead><tr><th>#<span class="col-rsz"></span></th><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>规格<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>待办类型<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th></tr></thead><tbody>' +
          verifyFiltered.map(function(f, i) {
            var pendingType = STATUS[f.status] || f.status;
            return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td class="muted" data-label="#">' + (i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格" class="muted">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="待办类型">' + pendingType + '</td><td data-label="状态">' + statusBadge(f) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      html += '</div>';
    }
  } else if (filterCfg && filterCfg.status === 'DORMANT') {
    // 呆滞清单已在常驻「呆滞治具」区块展示，此处仅处理无呆滞数据的空态，避免表格重复渲染
    if (d.dormant.length === 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">呆滞治具 (0)</h3><div class="empty" style="padding:16px">暂无呆滞治具</div></div>';
    }
  } else {
    var filtered = filterCfg.status ? d.myPending.filter(function(f) { return f.status === filterCfg.status; }) : d.myPending;
    var titleExtra = filterCfg.status ? ' · ' + (STATUS[filterCfg.status] || filterCfg.status) : '';
    if (d.myPending.length > 0) {
      html += '<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">我的待办（' + (ROLE[me.role] || me.role) + '）<span style="font-weight:400;color:var(--muted)">' + titleExtra + ' (' + filtered.length + ')</span></h3>';
      if (filtered.length === 0) {
        html += '<div class="empty" style="padding:16px">暂无 ' + (filterCfg.status ? STATUS[filterCfg.status] || '' : '') + ' 状态的待办</div>';
      } else {
        html += '<table class="fx-dash-table"><colgroup><col style="width:36px"><col style="width:110px"><col style="width:130px"><col style="width:80px"><col style="width:90px"><col style="width:120px"><col style="width:80px"></colgroup><thead><tr><th>#<span class="col-rsz"></span></th><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>规格<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>待办类型<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th></tr></thead><tbody>' +
          filtered.map(function(f, i) {
            var pendingType = STATUS[f.status] || f.status;
            var extra = f.expected_finish_at ? ' | RD预计:' + fmt(f.expected_finish_at) : '';
            return '<tr style="cursor:pointer" onclick="goFixScan(\'' + esc(f.fixture_no) + '\')"><td data-label="#" class="muted">' + (i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格" class="muted">' + e(f.spec || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td data-label="待办类型">' + pendingType + '<small class="muted">' + extra + '</small></td><td data-label="状态">' + statusBadge(f) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      html += '</div>';
    }
  }

  if (!d.overdue.length && !d.myPending.length && !d.total) {
    html += '<div class="empty">暂无治具数据，请先新建申请</div>';
  }
  document.getElementById('view').innerHTML = html;
  setTimeout(function() {
    document.querySelectorAll('.fx-dash-table').forEach(function(t) { _initColResize(t); });
  }, 0);
}


/* --- subsystems/fixtures/frontend/js/views/detail.js --- */
// fixture-detail.js — 治具详情弹窗（Tab 切换：概览/日志/附件）
var _fixDetail = null, _fixLogs = null, _fixFiles = null, _fixModalOpen = false, _fixId = null;
var _fixDormant = null; // 当前治具呆滞信息 {days, reason}，非呆滞为 null

async function showFixtureDetail(id) {
  _fixId = id; _fixModalOpen = false;
  try {
    var _a = await Promise.all([
      api('GET', '/api/fixtures/' + id),
      api('GET', '/api/fixtures/' + id + '/logs').catch(function(){ return []; }),
      fetchFixtureFiles(id).catch(function(){ return []; }),
      api('GET', '/api/fixtures/dashboard').catch(function(){ return { dormant: [] }; })
    ]);
    _fixDetail = _a[0]; _fixLogs = _a[1]; _fixFiles = _a[2];
    _fixDormant = null;
    var dormant = _a[3].dormant || [];
    for (var i = 0; i < dormant.length; i++) {
      if (dormant[i].id === id) { _fixDormant = { days: dormant[i].dormant_days, reason: dormant[i].dormant_reason }; break; }
    }
    renderFixTab('overview');
  } catch (e) { showToast(e.message); }
}

function renderFixTab(tab) {
  var f = _fixDetail; if (!f) return;
  var tabs = [
    { key: 'overview', label: '概览' },
    { key: 'logs', label: '操作日志' + (_fixLogs.length ? ' (' + _fixLogs.length + ')' : '') },
    { key: 'files', label: '附件' + (_fixFiles.length ? ' (' + _fixFiles.length + ')' : '') }
  ];

  var tbar = '<div class="detail-tabs">' +
    tabs.map(function(t) {
      return '<span class="detail-tab' + (tab === t.key ? ' active' : '') + '" onclick="renderFixTab(\'' + t.key + '\')">' + t.label + '</span>';
    }).join('') + '</div>';

  var content;
  if (tab === 'overview') content = buildOverview(f);
  else if (tab === 'logs') content = buildLogsTab();
  else content = buildFilesTab();

  if (!_fixModalOpen) {
    var head = '<div style="display:flex;justify-content:space-between;align-items:center;width:100%"><b style="font-size:16px">' + fixtureNoVersion(f) + '</b> ' + statusBadge(f) + '</div>';
    var foot = _buildActions(f) + '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>';
    openModal('', tbar + content, { head: head, foot: foot });
    _fixModalOpen = true;
  } else {
    var mb = document.querySelector('.modal-mask .modal-body');
    if (!mb) { _fixModalOpen = false; renderFixTab(tab); return; }
    mb.innerHTML = tbar + content;
  }
}

// ═══ 概览 Tab（Card Grid 布局 — CSS Grid auto-fill 自适应 1~3 列） ═══
function buildOverview(f) {
  var cards = [];
  cards.push(_cardInfo(f));
  var people = _cardPeople(f);
  if (people) cards.push(people);
  var note = _cardNote(f);
  if (note) cards.push(note);
  var timeline = _cardTimeline(f);
  if (timeline) cards.push(timeline);
  cards.push(_cardSummary());

  var body = '<div class="overview-cards">' + cards.join('') + '</div>';
  requestAnimationFrame(function() { renderMiniLogs(); renderMiniFiles(); });
  return body;
}

function _cardInfo(f) {
  var html = '<div class="overview-card"><div class="title">' + _icon('info') + ' 基础信息</div><div class="field-grid">';
  html += kv('名称', e(f.name)) + kv('规格', e(f.spec)) + kv('型号', e(f.model));
  html += kv('工站', e(f.station)) + kv('分类', e(f.category)) + kv('申请部门', e(f.requested_dept));
  if (f.request_note) html += kv('申请说明', e(f.request_note));
  if (f.storage_location) html += kv('存放位置', e(f.storage_location));
  if (f.maintenance_cycle_days > 0) {
    html += kv('保养周期', f.maintenance_cycle_days + ' 天');
    html += kv('上次保养', fmt(f.last_maintenance_at));
    var nextDate = f.next_maintenance_at ? new Date(f.next_maintenance_at) : null;
    var now = new Date();
    var nextOverdue = nextDate && nextDate <= now;
    var nextOverdueDays = nextOverdue ? Math.ceil((now - nextDate) / 86400000) : 0;
    var nextHtml = nextOverdue ? '<span style="color:var(--bad);font-weight:600">' + fmt(f.next_maintenance_at) + ' · 已逾期' + nextOverdueDays + '天</span>' : fmt(f.next_maintenance_at);
    html += '<span class="label">下次保养</span><span>' + nextHtml + '</span>';
  }
  if (f.retired_reason) html += '<span class="label" style="color:var(--bad)">报废原因</span><span style="color:var(--bad)">' + e(f.retired_reason) + '</span>';
  if (_fixDormant) html += '<span class="label" style="color:var(--bad)">呆滞</span><span style="color:var(--bad);font-weight:600">呆滞 ' + _fixDormant.days + ' 天 · ' + e(_fixDormant.reason) + '</span>';
  return html + '</div></div>';
}

function _cardPeople(f) {
  var pf = '';
  if (f.made_by) pf += kv('制作', (e(f.made_by_name||'') || 'ID:' + f.made_by) + ' · ' + fmt(f.made_at));
  if (f.verified_rd) pf += kv('RD验证', (e(f.verified_rd_name||'') || 'ID:' + f.verified_rd) + ' · ' + fmt(f.verified_rd_at));
  if (f.verified_me) pf += kv('申请单位验证', (e(f.verified_me_name||'') || 'ID:' + f.verified_me) + ' · ' + fmt(f.verified_me_at));
  if (f.used_by) pf += kv('领用', (e(f.used_by_name||'') || 'ID:' + f.used_by) + ' · ' + fmt(f.used_at) + ' · ' + e(f.use_location||''));
  if (f.expected_return_days) pf += kv('使用天数', f.expected_return_days + '天 · 预计' + fmt(f.expected_return_at));
  if (f.improved_by) pf += kv('改善', (e(f.improved_by_name||'') || 'ID:' + f.improved_by) + ' · 版次V' + f.improvement_count);
  if (f.repaired_by) pf += kv('维修', (e(f.repaired_by_name||'') || 'ID:' + f.repaired_by) + ' · ' + fmt(f.repaired_at));
  if (f.retired_by) pf += '<span class="label" style="color:var(--bad)">报废</span><span style="color:var(--bad)">' + (e(f.retired_by_name||'') || 'ID:' + f.retired_by) + ' · ' + fmt(f.retired_at) + '</span>';
  if (!pf) return '';
  return '<div class="overview-card"><div class="title">' + _icon('people') + ' 人员与时间</div><div class="field-grid">' + pf + '</div></div>';
}

function _cardNote(f) {
  if (!f.improve_note && !f.repair_note) return '';
  var rp = '';
  if (f.improve_note) rp += kv('改善说明', e(f.improve_note));
  if (f.repair_type) rp += kv('维修类型', f.repair_type === 'RD' ? '退回RD维修' : 'ME自行维修');
  if (f.repair_note) rp += kv('维修说明', e(f.repair_note));
  return '<div class="overview-card"><div class="title">' + _icon('repair') + ' 改善/维修</div><div class="field-grid">' + rp + '</div></div>';
}

function _cardTimeline(f) {
  var tl = buildTimeline(f);
  if (!tl.length) return '';
  return '<div class="overview-card"><div class="title">' + _icon('progress') + ' 流转进度</div><div class="progress-timeline">' + tl.join('') + '</div></div>';
}

function _cardSummary() {
  return '<div class="overview-card"><div class="title">' + _icon('file') + ' 附件</div><div id="fix-detail-files-mini" style="font-size:12px;color:var(--muted);min-height:20px"></div></div>' +
    '<div class="overview-card"><div class="title">' + _icon('log') + ' 操作日志</div><div id="fix-detail-logs-mini" style="font-size:12px;min-height:20px"></div></div>';
}

// ═══ 日志 Tab（响应式：桌面自适应列宽，窄屏转卡片 data-label） ═══
function buildLogsTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixLogs.length) { html += '<div class="empty" style="padding:24px">暂无操作日志</div>'; return html + '</div>'; }
  html += '<div class="detail-logs-wrap"><table class="detail-log-tab"><thead><tr><th>时间</th><th>操作</th><th>部门</th><th>备注</th></tr></thead><tbody>' +
    _fixLogs.map(function(l) {
      return '<tr><td data-label="时间"><small>' + fmt(l.created_at) + '</small></td><td data-label="操作">' + (ACTION_CN[l.action] || l.action) + '</td><td data-label="部门" class="muted">' + e(l.dept || '—') + '</td><td data-label="备注" class="muted">' + e(l.note || '—') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  return html + '</div>';
}

// ═══ 附件 Tab（按分类分组） ═══
var FILE_GROUP_LABELS = {
  'design_drawing': '设计图纸',
  'fixture_photo': '实物照片',
  'maintenance_photo': '保养照片',
  'site_photo': '现场照片',
  'purchase_order': '请购单',
  'other': '其他附件'
};

function buildFilesTab() {
  var html = '<div style="padding:8px 14px 0">';
  if (!_fixFiles.length) { html += '<div class="empty" style="padding:24px">暂无附件</div>'; return html + '</div>'; }

  var groups = {};
  _fixFiles.forEach(function(file) {
    var cat = file.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(file);
  });

  var order = ['design_drawing', 'fixture_photo', 'maintenance_photo', 'site_photo', 'purchase_order', 'other'];
  order.forEach(function(cat) {
    var files = groups[cat];
    if (!files || !files.length) return;
    html += '<div class="file-group-header">' + (FILE_GROUP_LABELS[cat] || cat) + ' (' + files.length + ')</div>';
    html += files.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  });

  return html + '</div>';
}

// ═══ 概览摘要填充 ═══
function renderMiniLogs() {
  var el = document.getElementById('fix-detail-logs-mini'); if (!el) return;
  if (!_fixLogs.length) { el.innerHTML = '<span class="muted">暂无日志</span>'; return; }
  var r = _fixLogs.slice(0, 2);
  el.innerHTML = '<div class="log-list">' + r.map(function(l) { return '<div style="font-size:12px"><span class="muted">' + fmt(l.created_at) + '</span> ' + (ACTION_CN[l.action] || l.action) + ' <span class="muted">' + (l.dept || '') + '</span></div>'; }).join('') + '</div>';
  if (_fixLogs.length > 2) el.innerHTML += '<div style="margin-top:4px"><a class="link" style="font-size:12px" onclick="renderFixTab(\'logs\')">查看全部 ' + _fixLogs.length + ' 条 →</a></div>';
}

function renderMiniFiles() {
  var el = document.getElementById('fix-detail-files-mini'); if (!el) return;
  if (!_fixFiles.length) { el.innerHTML = '<span class="muted">暂无附件</span>'; return; }
  var r = _fixFiles.slice(0, 2);
  el.innerHTML = r.map(function(file) { return renderFixFileItem(_fixId, file); }).join('');
  if (_fixFiles.length > 2) el.innerHTML += '<div style="margin-top:4px;font-size:12px"><a class="link" onclick="renderFixTab(\'files\')">查看全部 ' + _fixFiles.length + ' 个 →</a></div>';
}

// ═══ 操作按钮（根据状态动态生成,先关弹窗再跳转） ═══
var ACT_PRE = 'closeModal(this.closest(\'.modal-mask\'));';
function _buildActions(f) {
  var btns = '';
  var s = f.status;
  if (s !== 'RETIRED') btns += '<fluent-button appearance="accent" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">扫码操作</fluent-button>';
  if (s === 'TRANSFERRED') btns += '<fluent-button appearance="neutral" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">领用</fluent-button>';
  if (s === 'IN_USE') {
    btns += '<fluent-button appearance="neutral" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">归还</fluent-button>';
    btns += '<fluent-button appearance="neutral" size="small" onclick="' + ACT_PRE + 'goFixScan(\'' + e(f.fixture_no) + '\')">报修</fluent-button>';
  }
  return btns;
}

// ═══ 共享工具 ═══
function kv(label, val) { return '<span class="label">' + label + '</span><span>' + (val || '—') + '</span>'; }

/** 图标占位（CSS 类 + data 属性，后续可替换为 SVG） */
function _icon(type) {
  var map = { info: '\u2139', people: '\u263A', repair: '\u2692', progress: '\u21BB', file: '\u2630', log: '\u2630' };
  return '<span style="margin-right:2px">' + (map[type] || '') + '</span>';
}

function buildTimeline(f) {
  var s = [];
  if (f.expected_finish_at) s.push(['RD接收·预计' + fmt(f.expected_finish_at), true]);
  else if (f.status === 'ACCEPTED' || f.made_at || f.verified_rd_at) s.push(['RD接收', true]);
  if (f.made_at) s.push(['制作完成', true]);
  if (f.verified_rd_at) s.push(['RD验证', true]);
  if (f.verified_me_at) s.push(['申请单位验证', true]);
  if (f.used_at) s.push(['领用中', f.status === 'IN_USE']);
  if (f.improved_at) s.push(['改善·V' + f.improvement_count, true]);
  if (f.status === 'IMPROVING') s.push(['改善中', true]);
  if (f.repaired_at) s.push(['维修完成', true]);
  if (f.retired_at) s.push(['已报废', true]);
  return s.map(function(x) { return '<div class="progress-step ' + (x[1] ? 'done' : 'pending') + '"><span class="dot"></span>' + x[0] + '</div>'; });
}


/* --- subsystems/fixtures/frontend/js/views/list-filter.js --- */
// fixture-list-filter.js — 治具清单筛选、排序、分页控件
// 依赖：fixtureListState (fixture-list.js), loadFixtureList (fixture-list.js)

function clearFilterChip(idx) {
  var keys = [];
  if (fixtureListState.status) keys.push('status');
  if (fixtureListState.dept) keys.push('dept');
  if (fixtureListState.model) keys.push('model');
  if (fixtureListState.dormant) keys.push('dormant');
  if (fixtureListState.search) keys.push('search');
  if (idx >= 0 && idx < keys.length) {
    fixtureListState[keys[idx]] = '';
    fixtureListState.pageNo = 1;
  }
  loadFixtureList();
}

function clearAllFilters() {
  fixtureListState.status = '';
  fixtureListState.dept = '';
  fixtureListState.search = '';
  fixtureListState.dormant = '';
  fixtureListState.model = '';
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function filterFixtureListStatus(val) {
  fixtureListState.status = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function filterFixtureListDept(val) {
  fixtureListState.dept = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function filterFixtureListDormant(val) {
  fixtureListState.dormant = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

// 机型筛选：写入 state.model 并刷新列表（筛选栏下拉 onchange 调用）
function filterFixtureListModel(val) {
  fixtureListState.model = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function debounceRenderFixtureList(val) {
  clearTimeout(fixtureListState._t);
  fixtureListState._t = setTimeout(function() {
    fixtureListState.search = val;
    fixtureListState.pageNo = 1;
    loadFixtureList();
  }, 300);
}

function toggleFixtureSort(val) {
  if (fixtureListState.col === val) {
    fixtureListState.dir = fixtureListState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    fixtureListState.col = val;
    fixtureListState.dir = 'asc';
  }
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function changeFixturePageSize(val) {
  fixtureListState.page = parseInt(val) || 20;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function goFixturePage(n) {
  fixtureListState.pageNo = n;
  loadFixtureList();
}


/* --- subsystems/fixtures/frontend/js/views/list.js --- */
// 治具清单（核心：状态管理、渲染）
// 筛选/排序/分页 → fixture-list-filter.js

var fixtureListState = { status: '', dept: '', search: '', dormant: '', model: '', col: '', dir: 'desc', page: 20, pageNo: 1 };

function fixtureNoVersion(f) {
  return f.fixture_no ? f.fixture_no.replace(/-V\d+$/, '') : '—';
}

function isOverdue(f) {
  if (!f.expected_return_at) return false;
  return ['IN_USE', 'TRANSFERRED', 'VERIFY_PENDING'].indexOf(f.status) !== -1 && new Date(f.expected_return_at) <= new Date();
}

async function renderFixtureList() {
  try {
    fixtureListState.dept = '';
    fixtureListState.search = '';
    fixtureListState.status = '';
    fixtureListState.dormant = '';
    fixtureListState.model = '';
    fixtureListState.col = '';
    fixtureListState.dir = 'desc';
    fixtureListState.pageNo = 1;
    await loadFixtureList();
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

async function loadFixtureList() {
  try {
    document.getElementById('view').innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
    var parts = [];
    if (fixtureListState.status) parts.push('status=' + encodeURIComponent(fixtureListState.status));
    if (fixtureListState.dept) parts.push('dept=' + encodeURIComponent(fixtureListState.dept));
    if (fixtureListState.search) parts.push('search=' + encodeURIComponent(fixtureListState.search));
    if (fixtureListState.dormant) parts.push('dormant=' + fixtureListState.dormant);
    if (fixtureListState.model) parts.push('model=' + encodeURIComponent(fixtureListState.model));
    if (fixtureListState.col) parts.push('sort=' + encodeURIComponent(fixtureListState.col) + '&dir=' + fixtureListState.dir);
    var offset = (fixtureListState.pageNo - 1) * fixtureListState.page;
    parts.push('limit=' + fixtureListState.page + '&offset=' + offset);
    var qs = parts.join('&');
    var p = await Promise.all([
      api('GET', '/api/fixtures' + (qs ? '?' + qs : '')),
      api('GET', '/api/fixtures/models').catch(function(){ return []; })
    ]).then(function(a){ window._fxModels = a[1] || []; return a[0]; });
    var fixtures = p.fixtures || [];

    // 筛选栏
    var html = '<div class="filters">';
    html += '<fluent-text-field placeholder="搜索编号/名称…" value="' + e(fixtureListState.search) + '" oninput="debounceRenderFixtureList(this.value)"></fluent-text-field>';
    html += '<select onchange="filterFixtureListStatus(this.value)"><option value="">全部状态</option>' + Object.keys(STATUS).filter(function(k) { return ['NEW','PRODUCED','RELEASED','IN_CUSTODY','RETURNING'].indexOf(k) === -1; }).map(function(k) { return '<option value="' + k + '"' + (fixtureListState.status === k ? ' selected' : '') + '>' + (STATUS[k] || k) + '</option>'; }).join('') + '</select>';
    var deptList = typeof DEPTS !== 'undefined' ? DEPTS : ['研发部','品保文管中心','制造部','资材部','FQC','生技部','项目部','系统'];
    html += '<select onchange="filterFixtureListDept(this.value)"><option value="">全部部门</option>' + deptList.map(function(d) { return '<option value="' + d + '"' + (fixtureListState.dept === d ? ' selected' : '') + '>' + d + '</option>'; }).join('') + '</select>';
    html += '<select onchange="filterFixtureListDormant(this.value)"><option value="">全部(含呆滞)</option><option value="1"' + (fixtureListState.dormant === '1' ? ' selected' : '') + '>仅看呆滞</option></select>';
    html += '<select id="fx-model-filter" onchange="filterFixtureListModel(this.value)"><option value="">全部机型</option>' + (window._fxModels || []).map(function(m) { return '<option value="' + e(m.code) + '"' + (fixtureListState.model === m.code ? ' selected' : '') + '>' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + ')' : '') + '</option>'; }).join('') + '</select>';
    html += '<fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()" title="机型管理">机型</fluent-button>';
    html += '<span style="display:flex;align-items:center;gap:4px;white-space:nowrap"><span class="muted">排序</span><select onchange="toggleFixtureSort(this.value)" style="min-width:80px;max-width:120px"><option value="">默认</option><option value="fixture_no"' + (fixtureListState.col === 'fixture_no' ? ' selected' : '') + '>编号</option><option value="name"' + (fixtureListState.col === 'name' ? ' selected' : '') + '>名称</option><option value="updated_at"' + (fixtureListState.col === 'updated_at' ? ' selected' : '') + '>更新时间</option></select></span>';
    html += '<select onchange="changeFixturePageSize(this.value)" style="max-width:110px"><option value="10"' + (fixtureListState.page === 10 ? ' selected' : '') + '>10条/页</option><option value="20"' + (fixtureListState.page === 20 ? ' selected' : '') + '>20条/页</option><option value="50"' + (fixtureListState.page === 50 ? ' selected' : '') + '>50条/页</option><option value="100"' + (fixtureListState.page === 100 ? ' selected' : '') + '>100条/页</option></select>';
    html += '<fluent-button appearance="accent" onclick="clearAllFilters()">清除</fluent-button>';
    html += '<fluent-button appearance="neutral" onclick="exportFixturesCsv()">导出 CSV</fluent-button></div>';

    // chips（索引与 list-filter.js clearFilterChip 的 keys 顺序一致：[status, dept, model, dormant, search]，逐项累加）
    var chips = [];
    if (fixtureListState.status) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(0)">' + (STATUS[fixtureListState.status] || fixtureListState.status) + ' ✕</span>');
    if (fixtureListState.dept) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + (fixtureListState.status ? 1 : 0) + ')">' + fixtureListState.dept + ' ✕</span>');
    if (fixtureListState.model) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + ((fixtureListState.status ? 1 : 0) + (fixtureListState.dept ? 1 : 0)) + ')">机型 ' + e(fixtureListState.model) + ' ✕</span>');
    if (fixtureListState.dormant) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--bad);color:var(--bad)" onclick="clearFilterChip(' + ((fixtureListState.status ? 1 : 0) + (fixtureListState.dept ? 1 : 0) + (fixtureListState.model ? 1 : 0)) + ')">仅看呆滞 ✕</span>');
    if (fixtureListState.search) chips.push('<span class="badge" style="cursor:pointer;border:1px solid var(--line)" onclick="clearFilterChip(' + ((fixtureListState.status ? 1 : 0) + (fixtureListState.dept ? 1 : 0) + (fixtureListState.model ? 1 : 0) + (fixtureListState.dormant ? 1 : 0)) + ')">"' + e(fixtureListState.search) + '" ✕</span>');
    if (chips.length > 0) html += '<div style="display:flex;gap:6px;margin-bottom:4px;flex-wrap:wrap;align-items:center">' + chips.join('') + '</div>';

    function th(label, field) {
      var sortCol = fixtureListState.col, sortDir = fixtureListState.dir || 'desc';
      var arrow = sortCol === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th style="cursor:pointer;white-space:nowrap" onclick="toggleFixtureSort(\'' + field + '\')"><span class="col-rsz"></span>' + label + '<span style="font-size:10px">' + arrow + '</span></th>';
    }

    // 表格
    html += '<div class="card" style="padding:0">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)"><span style="font-weight:600;font-size:14px">全部治具 (<b>' + p.total + '</b>)</span></div>';
    if (fixtures.length === 0) {
      var hasFilter = fixtureListState.status || fixtureListState.dept || fixtureListState.search || fixtureListState.dormant || fixtureListState.model;
      html += '<div class="empty">' + (hasFilter ? '未找到匹配的治具，请调整筛选条件' : '暂无治具数据') + '</div>';
    } else {
      html += '<table class="fx-list-table"><colgroup>' +
        '<col style="width:42px"><col style="width:110px"><col style="width:130px"><col style="width:80px"><col style="width:90px"><col style="width:90px"><col style="width:72px"><col style="width:60px"><col style="width:80px"><col style="width:84px"><col style="width:84px"><col style="width:100px"><col style="width:84px">' +
        '</colgroup>' +
        '<thead><tr><th>#<span class="col-rsz"></span></th>' + th('编号', 'fixture_no') + th('名称', 'name') + '<th>规格<span class="col-rsz"></span></th><th>机型<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>储位<span class="col-rsz"></span></th><th>图片<span class="col-rsz"></span></th><th>状态<span class="col-rsz"></span></th><th>归还状态<span class="col-rsz"></span></th><th>保养状态<span class="col-rsz"></span></th>' + th('更新时间', 'updated_at') + '<th>操作<span class="col-rsz"></span></th></tr></thead><tbody>';
      fixtures.forEach(function (f, i) {
        var cls = isOverdue(f) ? 'overdue-row' : (f.dormant_days != null ? 'dormant-row' : '');
        var dormantBadge = f.dormant_days != null ? ' <span class="badge-dormant">呆滞 ' + f.dormant_days + '天</span>' : '';
        var photoHtml;
        if (f.first_photo) {
          photoHtml = '<img src="/uploads/fixtures/' + f.first_photo + '" width="32" height="32" style="object-fit:cover;border-radius:4px" onerror="this.style.display=\'none\'" />';
          if (f.photo_count > 1) photoHtml += ' <small class="muted">+' + (f.photo_count - 1) + '</small>';
        } else { photoHtml = '<span class="muted">—</span>'; }
        html += '<tr class="' + cls + '" onclick="showFixtureDetail(' + f.id + ')"><td class="muted" data-label="序号">' + (p.offset + i + 1) + '</td><td data-label="编号"><b>' + fixtureNoVersion(f) + '</b></td><td data-label="名称">' + e(f.name || '—') + '</td><td data-label="规格">' + e(f.spec || '—') + '</td><td data-label="机型">' + e(f.model || '—') + '</td><td data-label="部门">' + e(f.requested_dept || '—') + '</td><td class="muted" data-label="储位">' + e(f.storage_location || '—') + '</td><td data-label="图片">' + photoHtml + '</td><td data-label="状态">' + statusBadge(f) + dormantBadge + '</td><td data-label="归还状态">' + returnBadge(f) + '</td><td data-label="保养状态">' + maintBadge(f) + '</td><td data-label="更新时间"><small>' + fmt(f.updated_at) + '</small></td><td data-label="操作"><a class="link" onclick="event.stopPropagation();showFixtureDetail(' + f.id + ')">详情</a></td></tr>';
      });
      html += '</tbody></table>';
    }
    html += '</div>';

    // 分页
    var totalPages = Math.ceil(p.total / fixtureListState.page);
    var currentPage = fixtureListState.pageNo;
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage === 1 ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage - 1) + ')">← 上一页</fluent-button>';
    html += '<span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + p.total + '</b> 条</span>';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goFixturePage(' + (currentPage + 1) + ')">下一页 →</fluent-button>';
    html += '</div>';

    document.getElementById('view').innerHTML = html;
    setTimeout(function() { _initColResize(document.querySelector('.fx-list-table')); }, 0);
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

// 导出当前筛选/排序结果 CSV（复用列表筛选参数，忽略分页；AGENTS.md §21 列表导出标准）
function exportFixturesCsv() {
  var parts = [];
  if (fixtureListState.status) parts.push('status=' + encodeURIComponent(fixtureListState.status));
  if (fixtureListState.dept) parts.push('dept=' + encodeURIComponent(fixtureListState.dept));
  if (fixtureListState.search) parts.push('search=' + encodeURIComponent(fixtureListState.search));
  if (fixtureListState.dormant) parts.push('dormant=' + fixtureListState.dormant);
  if (fixtureListState.model) parts.push('model=' + encodeURIComponent(fixtureListState.model));
  if (fixtureListState.col) parts.push('sort=' + encodeURIComponent(fixtureListState.col) + '&dir=' + fixtureListState.dir);
  location.href = '/api/fixtures/export?' + parts.join('&');
}


/* --- subsystems/fixtures/frontend/js/views/models.js --- */
// fixture-models.js — 治具机型管理弹窗（仅 RD/ADMIN 可见入口；后端 POST/PUT 403 兜底）
// 与样品共享 sample_models 表；code 只读，仅可编辑 full_name；本期不做删除（引用风险）
async function openFixtureModelsModal() {
  var list;
  try { list = await api('GET', '/api/fixtures/models'); } catch (e) { showToast(e.message); return; }
  var rows = list.map(function(m) {
    return '<tr><td><b>' + e(m.code) + '</b></td><td id="fxm-name-' + m.id + '">' + e(m.full_name) + '</td><td>' + (m.fixture_count || 0) + '</td><td><a class="link" onclick="fxmEditName(' + m.id + ',\'' + e(m.full_name) + '\')">编辑全称</a></td></tr>';
  }).join('') || '<tr><td colspan="4" class="empty">暂无机型，请先新增</td></tr>';
  var body = '<div style="max-height:60vh;overflow:auto">' +
    '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
    '<thead><tr><th style="text-align:left;padding:6px">机型短码</th><th style="text-align:left;padding:6px">机型全称</th><th style="text-align:left;padding:6px">治具数</th><th style="width:90px"></th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>';
  openModal('机型管理（共享机型主数据）', body, {
    foot: '<fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>'
  });
}

function fxmEditName(id, oldName) {
  var cur = document.getElementById('fxm-name-' + id);
  if (!cur) return;
  cur.innerHTML = '<input id="fxm-input-' + id + '" style="width:180px" value="' + oldName + '"/> ' +
    '<a class="link" onclick="fxmSaveName(' + id + ')">保存</a> <a class="link" onclick="openFixtureModelsModal()">取消</a>';
  document.getElementById('fxm-input-' + id).focus();
}

async function fxmSaveName(id) {
  var input = document.getElementById('fxm-input-' + id);
  var full_name = (input ? input.value : '').trim();
  if (!full_name) { showToast('机型全称必填'); return; }
  try {
    await api('PUT', '/api/fixtures/models/' + id, { full_name: full_name });
    showToast('机型全称已更新');
    openFixtureModelsModal();
    if (typeof loadFixtureList === 'function') loadFixtureList();
  } catch (e) { showToast(e.message); }
}


/* --- subsystems/fixtures/frontend/js/views/fixture-photo-upload.js --- */
// fixture-photo-upload.js — 治具照片上传
var _pendingPhotos = [];

function _handlePhotoSelected() {
  var input = document.getElementById('act-photo-input');
  if (!input || !input.files || !input.files[0]) return;
  var file = input.files[0];
  _pendingPhotos.push(file);
  var list = document.getElementById('act-photo-list');
  if (!list) return;
  list.innerHTML = _pendingPhotos.map(function(f, i) {
    return '<div style="padding:4px 0">' + f.name + ' <a class="link" onclick="_removePendingPhoto(' + i + ')" style="cursor:pointer">移除</a></div>';
  }).join('');
  input.value = '';
}

function _removePendingPhoto(idx) {
  _pendingPhotos.splice(idx, 1);
  var list = document.getElementById('act-photo-list');
  if (!list) return;
  list.innerHTML = _pendingPhotos.map(function(f, i) {
    return '<div style="padding:4px 0">' + f.name + ' <a class="link" onclick="_removePendingPhoto(' + i + ')" style="cursor:pointer">移除</a></div>';
  }).join('');
}

async function uploadPendingPhotos(fixtureId) {
  if (_pendingPhotos.length === 0) return;
  for (var i = 0; i < _pendingPhotos.length; i++) {
    try {
      await uploadFixtureFile(fixtureId, _pendingPhotos[i], 'fixture_photo');
    } catch (e) { /* 忽略单张失败 */ }
  }
  _pendingPhotos = [];
}


/* --- subsystems/fixtures/frontend/js/views/scan.js --- */
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
    var labelMap = { ACCEPT: '接收治具', MAKE: '制作完成', CANCEL: '撤销申请', VERIFY: '验证移交', USE: '领用', RETURN: '归还', IMPROVE: '申请改善', IMPROVE_DONE: '改善完成', REPAIR_ME: '自行维修', REPAIR_RD_REQ: '退回RD维修', REPAIR_DONE: '维修完成', REPAIR_RD_DONE: 'RD维修完成', REPAIR_CONFIRM: '确认维修', RETIRE: '报废', MAINTENANCE: '保养' };
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

async function submitFixAction(fixtureNo, action) {
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
}



/* --- subsystems/fixtures/frontend/js/views/logs.js --- */
// fixture-logs.js — 治具操作日志渲染

var _allFixtureLogs = [];

async function renderFixtureLogs() {
  try {
    document.getElementById('view').innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
    _allFixtureLogs = await api('GET', '/api/fixtures/logs');
    renderFixtureLogsFiltered('');
  } catch (e) { document.getElementById('view').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; }
}

function renderFixtureLogsFiltered(search) {
  var logs = _allFixtureLogs;
  if (search) {
    var s = search.toLowerCase();
    logs = logs.filter(function(l) {
      return (l.note && l.note.toLowerCase().indexOf(s) !== -1) || (ACTION_CN[l.action] || '').toLowerCase().indexOf(s) !== -1 || (l.dept || '').toLowerCase().indexOf(s) !== -1;
    });
  }
  var html = '<div class="row fx-log-toolbar">';
  html += '<fluent-text-field placeholder="搜索操作/部门/备注…" value="' + e(search) + '" oninput="renderFixtureLogsFiltered(this.value)" style="width:min(220px,100%)"></fluent-text-field>';
  html += '</div>';
  html += '<div class="card" style="padding:0">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line)">';
  html += '<span style="font-weight:600;font-size:14px">操作日志 (<b>' + logs.length + '</b>)</span></div>';
  // 列宽自适应：时间/操作/用户/部门按内容（min-width 兜底），备注列弹性占余量（col-rsz 拖拽仍可用）
  html += '<table class="fx-dash-table"><colgroup><col style="width:110px"><col style="min-width:90px"><col style="min-width:80px"><col style="min-width:90px"><col style="width:auto;min-width:180px"></colgroup><thead><tr><th>时间<span class="col-rsz"></span></th><th>操作<span class="col-rsz"></span></th><th>用户<span class="col-rsz"></span></th><th>部门<span class="col-rsz"></span></th><th>备注<span class="col-rsz"></span></th></tr></thead><tbody>';
  logs.forEach(function (l) {
    html += '<tr><td data-label="时间"><small>' + fmt(l.created_at) + '</small></td><td data-label="操作">' + (ACTION_CN[l.action] || l.action) + '</td><td data-label="用户">' + e(l.display_name || l.username || '—') + '</td><td data-label="部门">' + e(l.dept || '—') + '</td><td data-label="备注">' + e(l.note || '—') + '</td></tr>';
  });
  html += '</tbody></table></div>';
  document.getElementById('view').innerHTML = html;
  setTimeout(function() { _initColResize(document.querySelector('.fx-dash-table')); }, 0);
}


/* --- subsystems/fixtures/frontend/js/views/new.js --- */
// fixture-new.js — 治具新建申请（清单列表式批量录入：① 选择机型 → ② 动态行表格，一次提交 N 条）
var _fnModel = '';        // 当前选中机型 code
var _fnModelFull = '';    // 当前选中机型全称（显示用）
var _fnModels = [];       // 机型下拉数据
var _fnRows = [];         // 治具清单行 [{name,spec,station,category,cycle}]
var _fnSubmitting = false; // 提交防抖（双击/连点防护）

// 入口视图：渲染「① 选择机型 → ② 行式清单」，加载机型下拉并渲染首行
async function renderFixtureNew() {
  _fnModel = ''; _fnModelFull = ''; _fnModels = []; _fnRows = []; _fnSubmitting = false;
  _fnRows.push({ name: '', spec: '', station: '', category: '', cycle: 90 });
  var html = '<div class="card fn-card">';
  html += '<h3 style="margin:0 0 16px">新建治具申请（批量）</h3>';

  // ① 选择机型
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px">';
  html += '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 选择机型 <span style="color:var(--bad)">*</span></div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<select id="fn-model" onchange="fnPickModel(this.value)" style="flex:1;min-width:180px"><option value="">请选择机型…</option></select>';
  html += '<span id="fn-model-new-zone" style="display:none;gap:8px;align-items:center;flex-wrap:wrap;width:100%">';
  html += '<fluent-text-field id="fn-model-code" placeholder="机型短码(6~20位字母数字)"></fluent-text-field>';
  html += '<fluent-text-field id="fn-model-name" placeholder="机型全称(必填)" style="flex:1"></fluent-text-field>';
  html += '<fluent-button appearance="accent" size="small" onclick="fnCreateModel()">保存机型</fluent-button>';
  html += '<fluent-button appearance="neutral" size="small" onclick="fnToggleModelNew(false)">取消</fluent-button>';
  html += '</span></div>';
  html += '<div style="margin-top:8px" id="fn-model-actions"></div>';
  html += '<div id="fn-model-picked" style="margin-top:8px;display:none;font-size:13px;color:var(--brand);font-weight:600"></div>';
  html += '</div>';

  // ② 治具清单（行式表格）
  html += '<div style="background:var(--bg-card,#fff);border:1px solid var(--line);border-radius:8px;padding:14px 16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">';
  html += '<div style="font-weight:600;font-size:13px">② 治具清单 <span class="muted" style="font-weight:400">（同一机型批量创建，每次最多 50 条）</span></div>';
  html += '<fluent-button appearance="lightweight" size="small" onclick="fnAddRow()">＋ 添加一行</fluent-button>';
  html += '</div>';
  html += '<div id="fn-rows"></div>';
  html += '<div style="margin-top:14px">';
  html += '<fluent-button id="fn-submit" appearance="accent" onclick="submitFixtureBatch(event)">提交申请</fluent-button>';
  html += '</div></div></div>';
  document.getElementById('view').innerHTML = html;
  await fnLoadModels();
  fnRenderRows();
}

// 加载机型下拉（含治具计数）；仅 RD/ADMIN 显示「新建机型」「管理机型」
async function fnLoadModels() {
  try {
    var list = await api('GET', '/api/fixtures/models');
    _fnModels = list || [];
    var sel = document.getElementById('fn-model');
    if (!sel) return;
    sel.innerHTML = '<option value="">请选择机型…</option>' + _fnModels.map(function(m) {
      return '<option value="' + e(m.code) + '">' + e(m.code) + ' · ' + e(m.full_name) + (m.fixture_count ? ' (' + m.fixture_count + '治具)' : '') + '</option>';
    }).join('');
    if (_fnModel) { sel.value = _fnModel; fnPickModel(_fnModel); }
    var canManage = typeof me !== 'undefined' && me && ['ADMIN', 'RD'].indexOf(me.role) !== -1;
    var zone = document.getElementById('fn-model-actions');
    if (zone) {
      zone.innerHTML = canManage
        ? '<fluent-button appearance="lightweight" size="small" onclick="fnToggleModelNew(true)">＋ 新建机型</fluent-button><fluent-button appearance="lightweight" size="small" onclick="openFixtureModelsModal()">管理机型</fluent-button>'
        : '<span class="muted" style="font-size:12px">机型由研发/管理员维护，如需新机型请联系研发</span>';
    }
  } catch (e) { showToast(e.message); }
}

// 选择机型：记录 code+全称，显示「已选机型：code · 全称」
function fnPickModel(val) {
  _fnModel = val;
  var m = _fnModels.filter(function(x) { return x.code === val; })[0];
  _fnModelFull = m ? m.full_name : '';
  var picked = document.getElementById('fn-model-picked');
  if (picked) { picked.style.display = val ? 'block' : 'none'; picked.textContent = val ? '已选机型：' + val + ' · ' + _fnModelFull : ''; }
}

// 新建机型区展开/收起：true=展开输入区；false=收起并清空输入
function fnToggleModelNew(open) {
  var z = document.getElementById('fn-model-new-zone');
  if (!z) return;
  z.style.display = open ? 'flex' : 'none';
  if (!open) {
    var code = document.getElementById('fn-model-code');
    var name = document.getElementById('fn-model-name');
    if (code) code.value = '';
    if (name) name.value = '';
  }
}

// 内联新建机型：校验 → POST → 自动选中并同步机型显示
async function fnCreateModel() {
  var code = document.getElementById('fn-model-code').value.trim().toUpperCase();
  var full_name = document.getElementById('fn-model-name').value.trim();
  if (!code || !full_name) { showToast('请填写机型短码和全称'); return; }
  try {
    await api('POST', '/api/fixtures/models', { code: code, full_name: full_name });
    _fnModel = code;
    fnToggleModelNew(false);
    await fnLoadModels(); // 内部已同步 fnPickModel：新建后自动选中并显示
    showToast('机型已新建并选中');
  } catch (e) { showToast(e.message); }
}

// 行式表格渲染（名称行首、保养周期列、删除按钮；仅剩 1 行时禁用删除）
function fnRenderRows() {
  var box = document.getElementById('fn-rows');
  if (!box) return;
  // 表头行（列宽与输入框对齐：名称 flex:2，其余 flex:1，周期/删除定宽）
  var head = '<div class="fn-row fn-head">' +
    '<span class="fn-cell fn-name">治具名称 <em style="color:var(--bad);font-style:normal">*</em></span>' +
    '<span class="fn-cell">规格</span>' +
    '<span class="fn-cell">工站</span>' +
    '<span class="fn-cell">分类</span>' +
    '<span class="fn-cell fn-cycle">保养(天)</span>' +
    '<span class="fn-head-del">删除</span>' +
    '</div>';
  box.innerHTML = head + _fnRows.map(function(r, i) {
    return '<div class="fn-row" data-i="' + i + '">' +
      '<input class="fn-cell fn-name" value="' + e(r.name) + '" placeholder="治具名称*" oninput="fnRowCell(' + i + ',\'name\',this.value)" onblur="fnRowCell(' + i + ',\'mark\')"/>' +
      '<input class="fn-cell" value="' + e(r.spec) + '" placeholder="规格" oninput="fnRowCell(' + i + ',\'spec\',this.value)"/>' +
      '<input class="fn-cell" value="' + e(r.station) + '" placeholder="工站" oninput="fnRowCell(' + i + ',\'station\',this.value)"/>' +
      '<input class="fn-cell" value="' + e(r.category) + '" placeholder="分类" oninput="fnRowCell(' + i + ',\'category\',this.value)"/>' +
      '<input class="fn-cell fn-cycle" type="number" min="0" value="' + (r.cycle != null ? r.cycle : '') + '" placeholder="保养(天)" oninput="fnRowCell(' + i + ',\'cycle\',this.value)"/>' +
      '<button type="button" class="fn-del" onclick="fnDelRow(' + i + ')" ' + (_fnRows.length <= 1 ? 'disabled' : '') + '>删除</button>' +
      '</div>';
  }).join('');
}

// 行单元格回调：key='mark' 仅刷新名称红框；其余写入行数据，名称变化时同步标记
function fnRowCell(i, key, val) {
  if (key === 'mark') {
    var el = document.querySelector('.fn-row[data-i="' + i + '"] .fn-name');
    if (el) el.style.borderColor = (_fnRows[i] && _fnRows[i].name && _fnRows[i].name.trim()) ? '' : 'var(--bad)';
    return;
  }
  if (_fnRows[i]) _fnRows[i][key] = val;
  if (key === 'name') fnRowCell(i, 'mark');
}

// 添加一行（上限 50）
function fnAddRow() {
  if (_fnRows.length >= 50) { showToast('单次最多 50 条'); return; }
  _fnRows.push({ name: '', spec: '', station: '', category: '', cycle: 90 });
  fnRenderRows();
}

// 删除一行（至少保留一行）
function fnDelRow(i) {
  if (_fnRows.length <= 1) { showToast('至少保留一行'); return; }
  _fnRows.splice(i, 1);
  fnRenderRows();
}

// 批量提交：行校验（空名称标红拦截）→ POST /api/fixtures/batch → 防抖
async function submitFixtureBatch(e) {
  e.preventDefault();
  if (_fnSubmitting) return;
  var model = _fnModel;
  if (!model) { showToast('请先选择机型'); return; }
  var valid = true;
  _fnRows.forEach(function(r, i) {
    if (!r.name || !r.name.trim()) { valid = false; fnRowCell(i, 'mark'); }
  });
  if (!valid) { showToast('存在名称为空的治具行，请补全后再提交'); return; }
  var items = _fnRows.map(function(r) {
    var it = { name: r.name.trim(), spec: r.spec, station: r.station, category: r.category };
    if (r.cycle != null && r.cycle !== '') it.maintenance_cycle_days = parseInt(r.cycle, 10);
    return it;
  });
  _fnSubmitting = true;
  var btn = document.getElementById('fn-submit');
  if (btn) btn.setAttribute('disabled', '');
  try {
    var res = await api('POST', '/api/fixtures/batch', { model: model, items: items });
    showToast('成功创建 ' + res.created + ' 条治具');
    location.hash = '#/list';
  } catch (err) {
    showToast(err.message);
    _fnSubmitting = false;
    if (btn) btn.removeAttribute('disabled');
  }
}


/* --- subsystems/fixtures/frontend/js/router.js --- */
// fixture-router.js — 治具页面路由
var VIEWS = {
  dashboard: function () {
    document.getElementById('page-title').textContent = '治具看板';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureDashboard();
  },
  list: function () {
    document.getElementById('page-title').textContent = '治具清单';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureList();
  },
  'new': function () {
    document.getElementById('page-title').textContent = '新建申请';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureNew();
  },
  scan: function () {
    document.getElementById('page-title').textContent = '治具扫码台';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureScan();
  },
  logs: function () {
    document.getElementById('page-title').textContent = '操作日志';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureLogs();
  }
};
function routeFixture() {
  var h = location.hash || '#/dashboard';
  var page = h.replace('#/', '').split('?')[0];
  if (!VIEWS[page]) page = 'dashboard';
  var fn = VIEWS[page];
  if (fn) fn();
  setFixtureActive(page);
}


// bundle init
window.addEventListener('hashchange',routeFixture);bootFixture();
