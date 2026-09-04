/** BUNDLE vbmtmmwwmu — 10 files */
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
  VERIFY: '验证移交', VERIFY_REJECT: '验证不合格退回',
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
function closeModal(mask){if(!mask)return;mask.remove();var all=document.querySelectorAll('.modal-mask');if(all.length===0)document.body.style.overflow='';}


/* --- subsystems/workbench/frontend/js/views/overdue.js --- */
// subsystems/workbench/frontend/js/views/overdue.js
// 逾期判断逻辑（独立模块，dashboard.js 渲染层调用）

// ===== 积压阈值配置（单位：小时，默认值；启动时从 /api/workbench/settings 覆盖，ADMIN 可改，全局生效）=====
// warn：正常与「3~7天」档的边界（默认 3 天 = 72h）
// bad ：「3~7天」与「7天以上」档的边界（默认 7 天 = 168h）
var OVERDUE_BOUNDS = { warn: 72, bad: 168 };
var _boundsLoaded = false;

// 从后端加载全局阈值（每个页面会话只拉取一次；失败时保留默认值不阻断渲染）
async function loadOverdueBounds() {
  if (_boundsLoaded) return;
  try {
    var data = await api('GET', '/api/workbench/settings');
    if (data && data.warn > 0 && data.bad > 0) {
      OVERDUE_BOUNDS = { warn: Number(data.warn), bad: Number(data.bad) };
    }
  } catch (err) {
    // 拉取失败保留默认值
  } finally {
    _boundsLoaded = true;
  }
}

var OVERDUE_STYLES = {
  0: { color: '#16a34a', bg: '#f0fdf4' },   // 正常（3天内）
  1: { color: '#ea580c', bg: '#fff7ed' },   // 3~7天
  2: { color: '#dc2626', bg: '#fef2f2' }    // 7天以上
};

// 根据阈值边界生成三档显示标签（随配置动态变化，改阈值后卡片/表格立即体现）
function tierLabels(b) {
  b = b || OVERDUE_BOUNDS;
  var wd = Math.round(b.warn / 24), bd = Math.round(b.bad / 24);
  return { 0: '≤' + wd + '天', 1: wd + '~' + bd + '天', 2: '>' + bd + '天' };
}

/**
 * 计算积压等级（互斥三档）
 * level: 0=正常(≤warn) 1=warn~bad 2=>bad；标签随阈值动态生成
 */
function calcOverdue(item, cfg) {
  var b = cfg || OVERDUE_BOUNDS;
  var hours = 0, reason = '';

  if (item.item_type === 'sample') {
    hours = _sampleOverdueHours(item);
    reason = _sampleOverdueReason(item);
  } else if (item.item_type === 'fixture') {
    var fixt = _fixtureOverdue(item);
    hours = fixt.hours;
    reason = fixt.reason;
  } else if (item.item_type === 'control') {
    // 管制无预期时限概念：按停留时长复用统一阈值
    hours = item.dwell_hours || 0;
    reason = '停留中(' + (item.stage_cn || '') + ')';
  }

  var level = 0;
  if (hours > b.bad) level = 2;
  else if (hours > b.warn) level = 1;

  return { level: level, label: tierLabels(b)[level], hours: Math.round(hours), reason: reason };
}

function _sampleOverdueHours(item) {
  var s = item.status;
  if (s === 'RETURNING') return item.dwell_hours || 0;
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    var d = new Date(item.next_inspect_at).getTime();
    if (d < Date.now()) return Math.round((Date.now() - d) / 3600000);
    return 0;
  }
  return item.dwell_hours || 0;
}

function _sampleOverdueReason(item) {
  var s = item.status;
  if (s === 'RETURNING') return '退回审核中停留';
  if ((s === 'RELEASED' || s === 'IN_CUSTODY') && item.next_inspect_at) {
    if (new Date(item.next_inspect_at).getTime() < Date.now()) return '复检逾期';
    return '';
  }
  return '停留中(' + (item.stage_cn || '') + ')';
}

/**
 * 治具逾期判断（合并原 _fixtureOverdueHours + _fixtureOverdueReason 两次状态分支为一次）
 * 消除 ~20 行重复的状态条件链
 */
function _fixtureOverdue(item) {
  var s = item.status, now = Date.now(), hours = 0, reason = '';

  if (s === 'IN_USE' && item.expected_return_at) {
    var er = new Date(item.expected_return_at).getTime();
    if (er < now) { hours = Math.round((now - er) / 3600000); reason = '归还逾期'; }
    // else: 未到期，hours=0, reason=''
  } else if (s === 'ACCEPTED' && item.expected_finish_at) {
    var ef = new Date(item.expected_finish_at).getTime();
    if (ef < now) { hours = Math.round((now - ef) / 3600000); reason = '制作超期'; }
  } else if (s === 'REPAIRING_ME' || s === 'REPAIRING_RD' || s === 'IMPROVING') {
    // 维修/改善优先检查 expected_finish_at，未超期则不算积压
    if (item.expected_finish_at) {
      var ef2 = new Date(item.expected_finish_at).getTime();
      if (ef2 < now) {
        hours = Math.round((now - ef2) / 3600000);
        if (s === 'REPAIRING_ME') reason = 'ME维修超期';
        else if (s === 'REPAIRING_RD') reason = 'RD维修超期';
        else reason = '改善超期';
      }
      // else: 未超期，hours=0, reason='' — 正常
    } else {
      // 无预计完成时间则按报修时间作为兜底
      if (item.repair_requested_at) {
        hours = Math.round((now - new Date(item.repair_requested_at).getTime()) / 3600000);
      } else {
        hours = item.dwell_hours || 0;
      }
      if (s === 'REPAIRING_ME') reason = 'ME维修中';
      else if (s === 'REPAIRING_RD') reason = 'RD维修中';
      else reason = '改善中';
    }
  } else if (item.next_maintenance_at && new Date(item.next_maintenance_at).getTime() < now) {
    hours = Math.round((now - new Date(item.next_maintenance_at).getTime()) / 3600000);
    reason = '保养逾期';
  } else {
    hours = item.dwell_hours || 0;
    if (s === 'REQUESTED') reason = '待接收停留';
    else if (s === 'VERIFY_PENDING') reason = '待验证停留';
    else if (s === 'TRANSFERRED') reason = '待领用停留';
    else if (s === 'REPAIR_DONE') reason = '待确认维修停留';
    else reason = '停留中(' + (item.stage_cn || '') + ')';
  }

  return { hours: hours, reason: reason };
}


/* --- subsystems/workbench/frontend/js/views/wb-filter.js --- */
// subsystems/workbench/frontend/js/views/wb-filter.js
// 工作台筛选栏/分页/hash 持久化（依赖全局：_deptFilter/_wbItems/renderWorkbenchDashboard/tierLabels/me/e）

// 从 location.hash 解析筛选状态（#type=sample&level=2&dept=...&keyword=...&offset=...）
function parseWbHash() {
  var f = { type: '', level: '', dept: '', apply_dept: '', keyword: '', stage: '', dormant: '', min_hours: '', max_hours: '', limit: 50, offset: 0 };
  var h = (location.hash || '').replace(/^#/, '');
  if (!h) return f;
  h.split('&').forEach(function(kv) {
    var i = kv.indexOf('=');
    if (i < 0) return;
    var k = kv.slice(0, i), v;
    try { v = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; } // 非法编码跳过该 kv，避免页面加载死循环
    if (v === '') return;
    if (k === 'offset') { f.offset = Math.max(parseInt(v, 10) || 0, 0); }
    else if (k === 'limit') { f.limit = parseInt(v, 10) || 50; }
    else if (k in f) f[k] = v;
  });
  return f;
}

// 序列化筛选状态为 hash 片段（空值跳过）
function serializeWbHash(f) {
  var parts = [];
  ['type', 'level', 'dept', 'apply_dept', 'keyword', 'stage', 'dormant', 'min_hours', 'max_hours'].forEach(function(k) {
    if (f[k]) parts.push(k + '=' + encodeURIComponent(f[k]));
  });
  if (f.offset > 0) parts.push('offset=' + f.offset);
  return parts.length ? '#/dashboard&' + parts.join('&') : '';
}

// 渲染筛选栏（含结果计数 + 清除按钮 + ADMIN 阈值入口）
function renderWbFilterBar(f, total, deptStats, applyDepts) {
  var tl = tierLabels();
  var deptOpts = '<option value="">全部负责部门</option>' + (deptStats || []).map(function(d) {
    return '<option value="' + d.dept + '"' + (f.dept === d.dept ? ' selected' : '') + '>' + d.dept + '</option>';
  }).join('');
  var applyOpts = '<option value="">全部申请部门</option>' + (applyDepts || []).map(function(d) {
    return '<option value="' + d + '"' + (f.apply_dept === d ? ' selected' : '') + '>' + d + '</option>';
  }).join('');
  var isAdmin = typeof me !== 'undefined' && me && me.role === 'ADMIN';
  var settingsBtn = isAdmin
    ? '<button class="btn btn-sm" onclick="openThresholdModal()" style="margin-left:8px">阈值设置</button>'
    : '';
  return '<div class="filters" style="margin:16px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
    '<input class="filter-select" id="wb-keyword" placeholder="编号/名称搜索" value="' + e(f.keyword) + '" style="max-width:150px" onkeydown="if(event.key===\'Enter\')wbSetFilter({keyword:this.value,offset:0})">' +
    '<select class="filter-select" id="wb-type" onchange="wbSetFilter({type:this.value,offset:0})">' +
      '<option value="">全部类型</option>' +
      '<option value="sample"' + (f.type === 'sample' ? ' selected' : '') + '>样品</option>' +
      '<option value="fixture"' + (f.type === 'fixture' ? ' selected' : '') + '>治具</option>' +
      '<option value="control"' + (f.type === 'control' ? ' selected' : '') + '>管制</option>' +
    '</select>' +
    '<select class="filter-select" id="wb-level" onchange="wbSetFilter({level:this.value,offset:0})">' +
      '<option value="">全部积压等级</option>' +
      '<option value="0"' + (f.level === '0' ? ' selected' : '') + '>' + tl[0] + '</option>' +
      '<option value="1"' + (f.level === '1' ? ' selected' : '') + '>' + tl[1] + '</option>' +
      '<option value="2"' + (f.level === '2' ? ' selected' : '') + '>' + tl[2] + '</option>' +
    '</select>' +
    '<select class="filter-select" id="wb-dept" onchange="wbSetFilter({dept:this.value,offset:0})">' + deptOpts + '</select>' +
    '<select class="filter-select" id="wb-apply-dept" onchange="wbSetFilter({apply_dept:this.value,offset:0})">' + applyOpts + '</select>' +
    '<span class="filter-group">' +
      '<label class="filter-check" title="仅显示无任何流转/移动记录的积压项目">' +
        '<input type="checkbox" id="wb-dormant"' + (f.dormant ? ' checked' : '') + ' onchange="wbSetFilter({dormant:this.checked?\'1\':\'\',offset:0})">仅呆滞</label>' +
      '<span style="font-size:12px;color:var(--muted)">停留</span>' +
      '<input class="filter-select" id="wb-min-h" placeholder="≥小时" value="' + e(f.min_hours || '') + '" style="width:70px" onchange="wbSetFilter({min_hours:this.value,offset:0})">' +
      '<span style="color:var(--muted)">~</span>' +
      '<input class="filter-select" id="wb-max-h" placeholder="≤小时" value="' + e(f.max_hours || '') + '" style="width:70px" onchange="wbSetFilter({max_hours:this.value,offset:0})">' +
    '</span>' +
    '<button class="btn btn-sm" onclick="wbClearFilter()">清除筛选</button>' +
    '<span style="margin-left:4px;font-size:12px;color:var(--muted)">共 ' + total + ' 条</span>' +
    '<button class="btn btn-sm" onclick="renderWorkbenchDashboard(true)">刷新</button>' +
    settingsBtn +
    '</div>';
}

// 渲染分页控件（上一页/下一页 + 页码/总数；≤1 页不渲染）
function renderWbPager(f, total) {
  var pageSize = f.limit || 50;
  var pages = Math.max(Math.ceil(total / pageSize), 1);
  var cur = Math.floor((f.offset || 0) / pageSize) + 1;
  if (pages <= 1) return '';
  return '<div class="pager" style="margin:12px 0;display:flex;align-items:center;gap:8px">' +
    '<button class="btn btn-sm" ' + (cur <= 1 ? 'disabled' : 'onclick="wbSetFilter({offset:' + ((cur - 2) * pageSize) + '})"') + '>上一页</button>' +
    '<span style="font-size:12px;color:var(--muted)">' + cur + ' / ' + pages + ' 页</span>' +
    '<button class="btn btn-sm" ' + (cur >= pages ? 'disabled' : 'onclick="wbSetFilter({offset:' + (cur * pageSize) + '})"') + '>下一页</button>' +
    '</div>';
}

// 更新筛选状态：合并 patch → 写 hash → 重载看板
function wbSetFilter(patch) {
  var f = parseWbHash();
  Object.keys(patch).forEach(function(k) { f[k] = patch[k]; });
  var hash = serializeWbHash(f);
  if (hash !== location.hash) history.replaceState(null, '', hash);
  renderWorkbenchDashboard(true);
}

// 一键清除筛选（含部门卡 active 态复位）
function wbClearFilter() {
  history.replaceState(null, '', location.pathname + location.search);
  _deptFilter = null;
  renderWorkbenchDashboard(true);
}


/* --- subsystems/workbench/frontend/js/views/dashboard.js --- */
// subsystems/workbench/frontend/js/views/dashboard.js
// 核心渲染函数（逾期判断逻辑见 overdue.js）

var _deptFilter = null;   // 部门卡筛选（null=全部），单击部门卡设置/取消
var _wbItems = [];        // 最近一次加载的工作台数据（阈值弹窗实时预览用）

async function renderWorkbenchDashboard(keepFilter) {
  var view = document.getElementById('view');
  view.textContent = '加载中…';
  view.style = 'padding:40px;text-align:center;color:var(--muted)';

  try {
    await loadOverdueBounds(); // 确保使用全局阈值（ADMIN 可改）
    var f = parseWbHash();
    if (_deptFilter) f.dept = _deptFilter; // 部门卡筛选优先级高于下拉

    // 带筛选参数请求（服务端过滤 + 等级计算 + 统计 + 分页）
    var qs = [];
    if (f.type) qs.push('type=' + encodeURIComponent(f.type));
    if (f.level) qs.push('level=' + encodeURIComponent(f.level));
    if (f.dept) qs.push('dept=' + encodeURIComponent(f.dept));
    if (f.apply_dept) qs.push('apply_dept=' + encodeURIComponent(f.apply_dept));
    if (f.keyword) qs.push('keyword=' + encodeURIComponent(f.keyword));
    if (f.stage) qs.push('stage=' + encodeURIComponent(f.stage));
    if (f.dormant) qs.push('dormant=1');
    if (f.min_hours !== '' && f.min_hours != null) qs.push('min_hours=' + encodeURIComponent(f.min_hours));
    if (f.max_hours !== '' && f.max_hours != null) qs.push('max_hours=' + encodeURIComponent(f.max_hours));
    qs.push('limit=' + (f.limit || 50), 'offset=' + (f.offset || 0));
    var data = await api('GET', '/api/workbench?' + qs.join('&'));
    _wbItems = data.items; // 当前页数据（阈值弹窗打开时再拉全量样本）

    view.style = '';
    view.innerHTML =
      renderSummaryCards(data.deptStats, data.summary) +
      renderWbFilterBar(f, data.total, data.deptStats, data.applyDepts) +
      renderItemTable(data.items) +
      renderWbPager(f, data.total);

    // 部门卡 active 态
    if (_deptFilter) {
      var dc = document.querySelector('.kb-stat[data-dept="' + _deptFilter + '"]');
      if (dc) dc.classList.add('active');
    } else {
      var totalCard = document.querySelector('.wb-card-total');
      if (totalCard) totalCard.classList.add('active');
    }
  } catch (err) {
    view.innerHTML = '<div style="padding:40px;text-align:center;color:#dc2626">' +
      '<div>加载失败：' + e(err.message) + '</div>' +
      '<button class="btn btn-sm" onclick="renderWorkbenchDashboard()" style="margin-top:12px">重试</button>' +
      '</div>';
  }
}

function renderSummaryCards(depts, summary) {
  var tl = tierLabels(); // 标签随当前阈值动态生成
  function tags(o) {
    var t = '';
    if (o.d3in) t += '<span class="wb-tag wb-tag-1">' + tl[0] + ' ' + o.d3in + '</span>';
    if (o.d37) t += '<span class="wb-tag wb-tag-2">' + tl[1] + ' ' + o.d37 + '</span>';
    if (o.d7) t += '<span class="wb-tag wb-tag-3">' + tl[2] + ' ' + o.d7 + '</span>';
    return t;
  }
  var html = '<div class="kb-stats">';
  // 总计卡：单击清除部门筛选（组件规范见 2026-08-04-card-design-system.md）
  var dormantTag = summary.dormant > 0 ? '<span class="wb-tag wb-tag-dormant">呆滞 ' + summary.dormant + '</span>' : '';
  html += '<fluent-card class="kb-stat wb-card-total' + (_deptFilter ? '' : ' active') + '" style="--stat-color:var(--brand)" onclick="clearDeptFilter()">' +
    '<div class="n">' + summary.total + '</div>' +
    '<div class="l">总计</div>' +
    (tags(summary) || dormantTag ? '<div class="wb-card-tags">' + tags(summary) + dormantTag + '</div>' : '') +
    '</fluent-card>';
  // 部门卡：单击筛选该部门，再次点击取消
  depts.forEach(function(d) {
    var color = d.d7 ? 'var(--bad)' : (d.d37 ? '#ea580c' : 'var(--brand)');
    html += '<fluent-card class="kb-stat' + (_deptFilter === d.dept ? ' active' : '') + '" data-dept="' + d.dept + '" style="--stat-color:' + color + '" onclick="filterByDept(this)">' +
      '<div class="n">' + d.total + '</div>' +
      '<div class="l">' + d.dept + '</div>' +
      (tags(d) ? '<div class="wb-card-tags">' + tags(d) + '</div>' : '') +
      '</fluent-card>';
  });
  html += '</div>';
  return html;
}

// 阈值设置弹窗逻辑见 views/threshold.js（openThresholdModal/applyPreset/refreshThresholdPreview/saveThreshold）

function renderItemTable(items) {
  var rows = items.map(function(item, idx) {
    var style = OVERDUE_STYLES[item.overdue_level] || OVERDUE_STYLES[0];
    var badgeHtml = item.overdue_level > 0
      ? '<span class="wb-badge" style="color:' + style.color + ';background:' + style.bg + '">' + item.overdue_label + '·' + item.overdue_reason + '</span>'
      : '<span style="color:var(--muted)">正常</span>';
    if (item.dormant_days != null) {
      badgeHtml += ' <span class="wb-badge wb-badge-dormant">呆滞 ' + item.dormant_days + '天</span>';
    }
    var typeBadge = item.item_type === 'sample'
      ? '<span class="wb-type-tag sample">样品</span>'
      : item.item_type === 'fixture'
        ? '<span class="wb-type-tag fixture">治具</span>'
        : '<span class="wb-type-tag control">管制</span>';

    return '<tr class="wb-row" data-type="' + item.item_type + '" data-level="' + item.overdue_level + '" data-dept="' + item.resp_dept + '" style="cursor:pointer" onclick="openWbDetail(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')">' +
      '<td class="muted">' + (idx + 1) + '</td>' +
      '<td>' + e(item.item_no) + '</td>' +
      '<td>' + e(item.name) + '</td>' +
      '<td>' + typeBadge + '</td>' +
      '<td>' + (item.stage_cn || '-') + '</td>' +
      '<td>' + e(item.resp_dept || '-') + '</td>' +
      '<td>' + e(item.apply_dept || '-') + '</td>' +
      '<td>' + formatHours(item.dwell_hours) + '</td>' +
      '<td>' + badgeHtml + '</td>' +
      '</tr>';
  }).join('');

  var bodyHtml = rows || '<tr><td colspan="9" style="text-align:center;color:var(--muted);padding:40px">暂无活跃项目</td></tr>';

  return '<div class="table-wrap">' +
    '<table class="data-table" id="wb-table">' +
    '<thead><tr>' +
    '<th>#</th><th>编号</th><th>名称</th><th>类型</th><th>阶段</th><th>负责部门</th><th>申请部门</th><th>停留</th><th>积压状态</th>' +
    '</tr></thead>' +
    '<tbody>' + bodyHtml + '</tbody>' +
    '</table></div>';
}

// 部门卡交互：单击筛选该部门（服务端过滤），再次点击取消
function filterByDept(el) {
  var dept = el.dataset.dept;
  _deptFilter = (_deptFilter === dept) ? null : dept;
  renderWorkbenchDashboard(true);
}

// 总计卡交互：清除部门筛选
function clearDeptFilter() {
  _deptFilter = null;
  renderWorkbenchDashboard(true);
}

function formatHours(h) {
  if (!h && h !== 0) return '-';
  h = Math.round(h);
  if (h < 1) return '<1h';
  var days = Math.floor(h / 24);
  var remaining = h % 24;
  if (days >= 1) return days + '天' + (remaining > 0 ? remaining + 'h' : '');
  return h + 'h';
}


/* --- subsystems/workbench/frontend/js/views/wb-detail.js --- */
// subsystems/workbench/frontend/js/views/wb-detail.js
// 工作台下钻：点击表格行 → 弹窗展示基本信息 + 完整流转日志时间线
// 依赖：openModal/closeModal（modal.js）、api()（api-base.js）、ACTION_CN、e()
// 详情数据来自子系统既有接口：样品 /api/samples/:id（含 logs）、治具 /api/fixtures/:id + /api/fixtures/:id/logs

// 日志折叠状态（默认全部展开，可手动收起为最近 6 条）
var _wbTlExpanded = true;
var _wbTlMax = 6;
var _wbTlAllLogs = [];
var _wbTlItem = null; // 当前详情 item（用于按类型解析流转动作中文）

// 管制流转/留痕动作中文（workbench 未加载 control 子系统 constants，本地隔离映射）
var _CTL_ACTION_CN = {
  CREATE: '新建管制申请', EDIT: '编辑草稿', SUBMIT: '提交会签',
  SIGN_OK: '闸口①会签通过/贴标', STORE: '入管制仓', CREATE_NCR: '开不良品委托单',
  DISPATCH: '发起处理方式会签', DISPOSAL_OK: '闸口②会签通过', START: '生产确认开工',
  REPORT: '报工', IN_STOCK: '入库', SHIP: '出货',
  SIGN_REJECT: '闸口①会签退回', DISPOSAL_REJECT: '闸口②会签退回',
  VOID: '作废', NCR: '追加不良品委托单', REWORK_LOG: '报工',
  SIGN_AGREE: '会签同意', SIGN_REJECT2: '会签退回', SIGN_SKIP: '会签强制跳过'
};

// 各类型关键时间点字段（按存在性展示）
var _KEY_DATES = {
  sample: [
    { k: 'created_at', l: '创建时间' },
    { k: 'released_at', l: '发行时间' },
    { k: 'next_inspect_at', l: '下次复检' },
    { k: 'updated_at', l: '最后更新' }
  ],
  fixture: [
    { k: 'created_at', l: '创建时间' },
    { k: 'expected_finish_at', l: '预计完成' },
    { k: 'transferred_at', l: '移交时间' },
    { k: 'used_at', l: '领用时间' },
    { k: 'next_maintenance_at', l: '下次保养' },
    { k: 'repair_requested_at', l: '报修时间' }
  ],
  control: [
    { k: 'apply_at', l: '申请时间' },
    { k: 'stored_at', l: '入仓时间' },
    { k: 'in_stock_at', l: '入库时间' },
    { k: 'updated_at', l: '最后更新' }
  ]
};

// 入口：按类型分派详情 API，成功后渲染弹窗
async function openWbDetail(item) {
  if (!item || !item.id) {
    return openModal('详细信息', '<div style="padding:20px;color:var(--bad)">数据版本过旧，缺少 id，请刷新页面后重试</div>');
  }
  try {
    var detail, logs;
    if (item.item_type === 'sample') {
      detail = await api('GET', '/api/samples/' + item.id);
      logs = detail.logs || [];
      delete detail.logs; // 与治具结构对齐，统一传 logs 参数
    } else if (item.item_type === 'fixture') {
      detail = await api('GET', '/api/fixtures/' + item.id);
      logs = await api('GET', '/api/fixtures/' + item.id + '/logs');
    } else { // control
      detail = await api('GET', '/api/control/orders/' + item.id);
      logs = detail.logs || [];
      delete detail.logs; // 与样品结构对齐，统一传 logs 参数
    }
    // 后端按 id DESC（最新在上），时间线倒序展示（最新 #N 在最上），直接使用无需反转
    _renderWbDetail(detail, logs || [], item);
  } catch (err) {
    openModal('详细信息', '<div style="padding:20px">' +
      '<div style="color:var(--bad);margin-bottom:12px">加载失败：' + e(err.message) + '</div>' +
      '<fluent-button appearance="accent" size="small" onclick="closeModal(this.closest(\'.modal-mask\'));openWbDetail(' + JSON.stringify(item).replace(/"/g, '&quot;') + ')">重试</fluent-button>' +
      '</div>');
  }
}

// 自适应窗口宽（信息密度驱动）：960~1280px
function _wbWidth(fieldCount, logCount) {
  var w = 960 + fieldCount * 24 + Math.min(logCount, 20) * 3;
  return Math.min(1280, Math.max(960, w));
}

// 左栏（基本信息）占比：随字段数 34%~50%
function _wbLeftPct(fieldCount) {
  return Math.min(50, Math.max(34, 34 + fieldCount * 2));
}

// 统计实际渲染的基本信息字段数（用于宽度自适应）
function _countWbFields(detail, item) {
  var n = 0;
  if (detail.order_no || detail.sample_no || detail.fixture_no || item.item_no) n++;
  if (detail.name || item.name) n++;
  n += 2; // 类型 + 阶段（恒有值）
  if (detail.spec) n++;
  if (detail.model) n++;
  if (item.resp_dept) n++;
  if (item.apply_dept) n++;
  (_KEY_DATES[item.item_type] || []).forEach(function(f) { if (detail[f.k]) n++; });
  return n;
}

// 组装弹窗 HTML：左右分栏（左=基本信息，右=流转日志）+ 内容密度自适应
function _renderWbDetail(detail, logs, item) {
  var typeLabel = item.item_type === 'sample' ? '样品' : (item.item_type === 'fixture' ? '治具' : '管制');
  // 管制状态未在全局 STATUS 中：阶段用工作台派生的 stage_cn，其余子系统用全局状态中文
  var stageLabel = item.item_type === 'control'
    ? (item.stage_cn || detail.status || '-')
    : (STATUS[detail.status] || detail.status || '-');
  _wbTlAllLogs = logs; // 供折叠/展开切换使用
  _wbTlItem = item;

  var fields = _countWbFields(detail, item);
  var leftHtml = '<div class="wb-detail-info">' +
    _kv('编号', detail.sample_no || detail.fixture_no || item.item_no) +
    _kv('名称', detail.name || item.name) +
    _kv('类型', typeLabel) +
    _kv('阶段', stageLabel) +
    _kv('规格', detail.spec) +
    _kv('型号', detail.model) +
    _kv('负责部门', item.resp_dept) +
    _kv('申请部门', item.apply_dept) +
    _keyDates(detail, item.item_type) +
    '</div>';
  var rightHtml = '<h4 class="wb-detail-tl-title">流转日志</h4>' +
    _renderTimeline(logs, item);

  var html = '<div class="wb-detail-split">' +
    '<div class="wb-detail-left">' + leftHtml + '</div>' +
    '<div class="wb-detail-right">' + rightHtml + '</div>' +
    '</div>';

  var foot = '<div style="display:flex;gap:8px">' +
    '<fluent-button appearance="accent" size="small" onclick="' + _openWbScanJs(item) + '">前往处理 →</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>' +
    '</div>';

  var mask = openModal('详细信息 · ' + (detail.order_no || detail.sample_no || detail.fixture_no || item.item_no), html, { foot: foot });
  // 自适应：通过 fluent-dialog 的 CSS 变量控制面板尺寸（style.width 进不了 shadow DOM）
  var dlg = mask.querySelector('fluent-dialog');
  var w = _wbWidth(fields, logs.length);
  if (dlg) {
    dlg.setAttribute('data-wb-detail', '1'); // 触发 module.css 专用尺寸覆盖（max-width 1280px）
    dlg.style.setProperty('--dialog-width', 'min(96vw,' + w + 'px)');
  }
  // 左栏占比随字段数自适应
  var split = mask.querySelector('.wb-detail-split');
  if (split) split.style.gridTemplateColumns = _wbLeftPct(fields) + '% 1fr';
  // 高度自适应：先 auto 测量内容自然高度，再封顶 82vh（内容少时弹窗矮，多时左右栏内部滚动）
  requestAnimationFrame(function() {
    if (!dlg || !split) return;
    dlg.style.setProperty('--dialog-height', 'auto');
    requestAnimationFrame(function() {
      // 左右栏各自内容高度取 max（左栏是嵌套滚动容器，scrollHeight 才含溢出内容），再留 head/foot 余量
      var l = split.querySelector('.wb-detail-left');
      var r = split.querySelector('.wb-detail-right');
      var contentH = Math.max(l ? l.scrollHeight : 0, r ? r.scrollHeight : 0, split.scrollHeight || 0);
      var maxH = Math.round(window.innerHeight * 0.82);
      dlg.style.setProperty('--dialog-height', Math.min(contentH + 130, maxH) + 'px');
    });
  });
}

// 键值行
function _kv(k, v) {
  if (v === null || v === undefined || v === '') return '';
  return '<div class="wb-detail-kv"><span class="wb-detail-k">' + k + '</span><span class="wb-detail-v">' + e(String(v)) + '</span></div>';
}

// 关键时间点区（按类型字段，存在才显示）
function _keyDates(detail, type) {
  var list = _KEY_DATES[type] || [];
  var html = '';
  list.forEach(function(f) {
    if (detail[f.k]) html += _kv(f.l, String(detail[f.k]).slice(0, 16).replace('T', ' '));
  });
  return html;
}

// 流转日志时间线（两列紧凑布局 + 折叠；倒序：最新在上，行间箭头标注流转方向）
function _renderTimeline(logs, item) {
  if (!logs || !logs.length) {
    return '<div class="wb-detail-empty">暂无流转记录</div>';
  }
  var html = '<div class="wb-timeline">' + _buildTimelineRows(logs) + '</div>';
  if (logs.length > _wbTlMax) {
    html += '<div class="wb-tl-more"><button class="btn sm ghost" onclick="toggleWbTimeline()" style="margin:4px 18px 12px">' +
      (_wbTlExpanded ? '收起日志' : '查看全部 ' + logs.length + ' 条') + '</button></div>';
  }
  return html;
}

// 生成时间线行（倒序：最新在上；受折叠状态控制，默认最近 _wbTlMax 条）
// 序号 = 该记录在完整流程中的步骤号（#0 为最早/第一步），倒序显示下从上到下递减，折叠不重编号
function _buildTimelineRows(logs) {
  var shown = _wbTlExpanded ? logs : logs.slice(0, _wbTlMax);
  var total = _wbTlAllLogs.length || shown.length;
  var html = '';
  shown.forEach(function(l, i) {
    // 管制动作中文走本地映射（_CTL_ACTION_CN），其余子系统沿用全局 ACTION_CN
    var action = _wbTlItem && _wbTlItem.item_type === 'control'
      ? (_CTL_ACTION_CN[l.action] || l.action || '-')
      : (ACTION_CN[l.action] || l.action || '-');
    var who = l.display_name || l.username || (ROLE[l.role] || l.role || '') + (l.dept ? ' · ' + l.dept : '');
    var time = l.created_at ? String(l.created_at).slice(0, 16).replace('T', ' ') : '';
    var note = l.note ? '<span class="wb-tl-note" title="' + e(l.note) + '">' + e(l.note) + '</span>' : '';
    html += '<div class="wb-tl-item">' +
      '<span class="wb-tl-idx">#' + (total - 1 - i) + '</span>' +
      '<span class="wb-tl-dot"></span>' +
      '<span class="wb-tl-action">' + e(action) + '</span>' +
      '<span class="wb-tl-who">' + e(who) + '</span>' +
      '<span class="wb-tl-time">' + time + '</span>' +
      note +
      '</div>';
    // 行间垂直箭头（左侧轴线对齐圆点）：倒序下流转方向向上，指向更新记录（最后一行不画）
    if (i < shown.length - 1) html += '<div class="wb-tl-flow">⬆</div>';
  });
  return html;
}

// 折叠/展开切换（仅重绘时间线区，不重建整个弹窗）
function toggleWbTimeline() {
  _wbTlExpanded = !_wbTlExpanded;
  var tl = document.querySelector('.wb-timeline');
  var more = document.querySelector('.wb-tl-more');
  if (!tl) return;
  var logs = _wbTlExpanded ? _wbTlAllLogs : (_wbTlAllLogs || []).slice(0, _wbTlMax);
  tl.innerHTML = _buildTimelineRows(logs || []);
  if (more) {
    var btn = more.querySelector('button');
    if (btn) btn.textContent = _wbTlExpanded ? '收起日志' : '查看全部 ' + _wbTlAllLogs.length + ' 条';
  }
}

// 跳转按钮 onclick 表达式（内联 JSON 转义，防止引号破坏 onclick）
function _openWbScanJs(item) {
  // 管制详情走 control 子系统详情页（#/detail?id=...），样品/治具走扫码页（#/scan?no=...）
  if (item.item_type === 'control') {
    return "window.open('/subsystems/control/frontend/index.html#/detail?id=" + item.id + "','_blank')";
  }
  var entry = item.item_type === 'sample'
    ? '/subsystems/samples/frontend/index.html'
    : '/subsystems/fixtures/frontend/index.html';
  var no = item.item_no || '';
  return "window.open('" + entry + "#/scan?no=" + no + "','_blank')";
}


/* --- subsystems/workbench/frontend/js/views/my-todos.js --- */
// subsystems/workbench/frontend/js/views/my-todos.js — 我的待办（跨子系统聚合视图）
// 数据：GET /api/workbench/my-todos（后端按 角色/部门/个人 三维实时聚合，口径见后端 db/my-todos.js）
// 下钻：样品/治具/管制 复用 openWbDetail 弹窗（wb-detail.js）；项目任务新标签页跳 projects 子系统深链 #/tasks/:id
// 依赖：api()/e()/fmt()（api-base.js/utils.js）、openWbDetail（wb-detail.js，bundle 顺序须在其后）

// 待办项注册表：groupKey → items（点击时按索引取原始对象，避免把数据拼进 onclick 引号地狱/XSS）
var _wbTodoItems = {};

// 分组 → 子系统入口（分组头部「前往」链接）
var _WB_TODO_SUBSYS = {
  sample: '/subsystems/samples/frontend/index.html',
  fixture: '/subsystems/fixtures/frontend/index.html',
  control: '/subsystems/control/frontend/index.html',
  project: '/subsystems/projects/frontend/index.html'
};

// 入口：渲染我的待办页（汇总卡 + 按子系统分组列表）
async function renderMyTodos() {
  var v = document.getElementById('view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
  document.getElementById('page-actions').innerHTML =
    '<fluent-button appearance="lightweight" size="small" onclick="renderMyTodos()">刷新</fluent-button>';
  var d;
  try {
    d = await api('GET', '/api/workbench/my-todos');
  } catch (err) {
    v.innerHTML = '<div class="empty">加载失败：' + e(err.message) + '</div>';
    return;
  }
  var groups = d.groups || [];
  var total = d.total || 0;
  var urgentTotal = 0;
  _wbTodoItems = {};
  groups.forEach(function (g) {
    _wbTodoItems[g.key] = g.items;
    g.items.forEach(function (it) { if (it.urgent) urgentTotal++; });
  });

  // 汇总条：总数 + 各子系统计数徽章（点击滚动定位）+ 口径说明
  var html = '<div class="filters" style="align-items:center;gap:12px;flex-wrap:wrap">' +
    '<span style="font-size:14px">我的待办共 <b>' + total + '</b> 项' +
    (urgentTotal ? ' · <span style="color:var(--bad);font-weight:600">紧急/逾期 ' + urgentTotal + '</span>' : '') + '</span>' +
    groups.map(function (g) {
      return '<span class="badge" style="cursor:pointer" onclick="wbTodoJump(\'' + g.key + '\')">' + g.name + ' ' + g.items.length + '</span>';
    }).join('') +
    '<span class="muted" style="font-size:12px">口径：我角色/部门可处理 + 指派给我 · ' + e(d.display_name || '') + '（' + e(d.dept || '未设部门') + '）</span></div>';

  if (!total) {
    html += '<div class="card"><div class="empty" style="padding:40px">🎉 暂无待办事项</div></div>';
    v.innerHTML = html;
    return;
  }

  // 分组卡片
  groups.forEach(function (g) {
    html += '<div class="card" style="padding:0;margin-bottom:14px" id="wb-todo-' + g.key + '">' +
      '<div style="padding:12px 16px;border-bottom:1px solid var(--line);font-weight:600;font-size:14px;display:flex;justify-content:space-between;align-items:center">' +
      '<span>' + g.name + ' <span class="badge">' + g.items.length + '</span></span>' +
      '<a class="link" style="font-weight:400;font-size:12px" href="' + (_WB_TODO_SUBSYS[g.key] || '#') + '" target="_blank">前往' + g.name + '子系统 →</a></div>';
    if (!g.items.length) {
      html += '<div class="empty" style="padding:16px">暂无待办</div></div>';
      return;
    }
    html += g.items.map(function (it, i) { return _wbTodoRow(g.key, it, i); }).join('') + '</div>';
  });
  v.innerHTML = html;
}

// 单行待办：待办类型徽章 + 编号 + 名称 + 状态 + 提示 + 更新时间；紧急/逾期红左边框
function _wbTodoRow(groupKey, it, idx) {
  return '<div class="wb-todo-row" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;' +
    (idx > 0 ? 'border-top:1px solid var(--line);' : '') +
    (it.urgent ? 'border-left:3px solid var(--bad);' : 'border-left:3px solid transparent;') +
    '" onclick="wbTodoOpen(\'' + groupKey + '\',' + idx + ')">' +
    '<span class="badge" style="flex:none;' + (it.urgent ? 'border:1px solid var(--bad);color:var(--bad)' : '') + '">' + e(it.todo) + '</span>' +
    '<b style="flex:none">' + e(it.item_no || '—') + '</b>' +
    '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(it.name || '—') + '</span>' +
    '<span class="muted" style="flex:none;font-size:12px">' + e(it.status_cn || it.status || '') + '</span>' +
    (it.hint ? '<span class="muted" style="flex:none;font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(it.hint) + '</span>' : '') +
    '<span class="muted" style="flex:none;font-size:12px">' + fmt(it.updated_at) + '</span></div>';
}

// 行点击：project 新标签页跳子系统深链；其余复用 openWbDetail 弹窗
function wbTodoOpen(groupKey, idx) {
  var it = (_wbTodoItems[groupKey] || [])[idx];
  if (!it) return;
  if (it.item_type === 'project') {
    window.open(it.link || '/subsystems/projects/frontend/index.html', '_blank');
    return;
  }
  openWbDetail({ id: it.id, item_type: it.item_type, item_no: it.item_no, name: it.name });
}

// 汇总徽章点击 → 滚动定位到对应分组
function wbTodoJump(key) {
  var el = document.getElementById('wb-todo-' + key);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* --- subsystems/workbench/frontend/js/views/threshold.js --- */
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


/* --- subsystems/workbench/frontend/js/router.js --- */
// subsystems/workbench/frontend/js/router.js — 前端路由
// 统一为侧边栏布局模式（与 samples/fixtures 一致）

function buildNav() {
  var nav = document.getElementById('nav');
  nav.innerHTML =
    '<button data-k="dashboard" class="active" onclick="location.hash=\'#/dashboard\'">工作台</button>' +
    '<button data-k="todos" onclick="location.hash=\'#/todos\'">我的待办</button>';
}

function setActive(k) {
  document.querySelectorAll('#nav button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.k === k);
  });
}

function route() {
  var h = location.hash.replace('#/', '') || 'dashboard';
  if (h.indexOf('todos') === 0) {
    setActive('todos');
    document.getElementById('page-title').textContent = '我的待办';
    document.getElementById('page-actions').innerHTML = '';
    renderMyTodos();
    return;
  }
  if (h.indexOf('dashboard') === 0) {
    setActive('dashboard');
    document.getElementById('page-title').textContent = '全局工作台';
    document.getElementById('page-actions').innerHTML = '';
    renderWorkbenchDashboard();
  }
}

// 覆盖 api-base.js 的 boot()，使用工作台专用初始化流程
async function boot() {
  showDemoHint();
  try {
    me = await api('GET', '/api/me');
    document.title = '制造品质管理系统 - 全局工作台';
    fillMe();
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    buildNav();
    route();
  } catch (e) {
    document.getElementById('login').style.display = 'flex';
  }
}

// api-base.js 的 doLogin() 会调用 showApp()，必须提供实现
function showApp() {
  fillMe();
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  buildNav();
  route();
}

function fillMe() {
  document.getElementById('me-name').textContent = me.display_name || me.username;
  // 多角色（2026-09-04 提交③）：显示全部角色（roles 并集，斜杠分隔）；单角色显示不变
  var roles = (me.roles && me.roles.length ? me.roles : [me.role]);
  var rolesText = roles.map(function (r) { return ROLE[r] || r; }).join(' / ');
  document.getElementById('me-role').textContent = rolesText + ' · ' + (me.dept || '');
}


// bundle init
window.addEventListener('hashchange',route);boot();
