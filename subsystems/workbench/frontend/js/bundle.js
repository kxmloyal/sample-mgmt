/** BUNDLE vbmshc8nj0 — 8 files */
/* --- shared constants (data/*.json) --- */
var LIMIT_ITEMS = [{"code":"A","label":"成品震动(限度)"},{"code":"AI","label":"扇叶震动(限度)"},{"code":"A1","label":"MCU IC烧録器(限度)"},{"code":"A2","label":"平衡机测试(限度)"},{"code":"A3","label":"入充磁扇叶组立(限度)"},{"code":"B","label":"异音(限度)"},{"code":"C","label":"外观(限度)"},{"code":"D","label":"定子组绝缘耐压/阻抗"},{"code":"E","label":"马达组电测（波形、反转）"},{"code":"F","label":"层间测试"},{"code":"G","label":"定子组大小边"},{"code":"H","label":"AOI视觉/CCD检测"},{"code":"I","label":"压定子高度"},{"code":"J","label":"扣环检测"},{"code":"K","label":"PCB组与定子组结合焊锡"},{"code":"L","label":"自动化马达组组立"},{"code":"M","label":"马达组焊导线组"},{"code":"N","label":"导线焊点位置检测"},{"code":"O","label":"断电功能检测"},{"code":"P","label":"成品检测(转速、电流)"},{"code":"Q","label":"定子组自动绕、缠线"},{"code":"R","label":"铜轴承自动化"},{"code":"S","label":"CCD检测浸锡后定子组"},{"code":"T","label":"CCD检测外框组"},{"code":"U","label":"2Ball成品自动化组立"},{"code":"X","label":"特殊工站"}];
var SOURCE_TYPES = {"C":"客供","T":"元山","G":"元将五金塔岗分厂"};
var DEPTS = ["系统","研发部","品保文管中心","制造部","FQC","生技部","项目部"];

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

function fmt(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
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
    // P2 fix: NEW/PRODUCED 阈值放大 3 倍
    if (item.status === 'NEW' || item.status === 'PRODUCED') hours = hours / 3;
  } else if (item.item_type === 'fixture') {
    var fixt = _fixtureOverdue(item);
    hours = fixt.hours;
    reason = fixt.reason;
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


/* --- subsystems/workbench/frontend/js/views/dashboard.js --- */
// subsystems/workbench/frontend/js/views/dashboard.js
// 核心渲染函数（逾期判断逻辑见 overdue.js）

var _filterCache = null;
var _deptFilter = null;   // 部门卡筛选（null=全部），单击部门卡设置/取消
var _wbItems = [];        // 最近一次加载的工作台数据（阈值弹窗实时预览用）

async function renderWorkbenchDashboard(keepFilter) {
  var view = document.getElementById('view');
  view.textContent = '加载中…';
  view.style = 'padding:40px;text-align:center;color:var(--muted)';

  try {
    await loadOverdueBounds(); // 确保使用全局阈值（ADMIN 可改）后再计算
    var data = await api('GET', '/api/workbench');
    _wbItems = data.items; // 缓存数据供阈值弹窗实时预览

    // 单次遍历：计算逾期 + 部门分组 + 汇总统计（合并原 4 次遍历）
    var deptMap = {}, summary = { total: 0, d3in: 0, d37: 0, d7: 0 };
    data.items.forEach(function(item) {
      var od = calcOverdue(item);
      item.overdue_level = od.level;
      item.overdue_label = od.label;
      item.overdue_hours = od.hours;
      item.overdue_reason = od.reason;

      var dept = item.resp_dept || '-';
      if (!deptMap[dept]) deptMap[dept] = { dept: dept, total: 0, d3in: 0, d37: 0, d7: 0 };
      deptMap[dept].total++;
      // 互斥三档：0=正常(≤3天) 1=3~7天 2=7天以上
      if (item.overdue_level === 0) deptMap[dept].d3in++;
      if (item.overdue_level === 1) deptMap[dept].d37++;
      if (item.overdue_level === 2) deptMap[dept].d7++;

      summary.total++;
      if (item.overdue_level === 0) summary.d3in++;
      if (item.overdue_level === 1) summary.d37++;
      if (item.overdue_level === 2) summary.d7++;
    });

    // 按逾期等级 + 停留时长排序
    data.items.sort(function(a, b) {
      if (a.overdue_level !== b.overdue_level) return b.overdue_level - a.overdue_level;
      if (a.dwell_hours !== b.dwell_hours) return b.dwell_hours - a.dwell_hours;
      if (a.item_type !== b.item_type) return a.item_type > b.item_type ? 1 : -1;
      return a.item_no > b.item_no ? 1 : -1;
    });

    view.style = '';
    view.innerHTML =
      renderSummaryCards(Object.values(deptMap), summary) +
      renderFilterBar() +
      renderItemTable(data.items);

    // 恢复筛选状态（类型/等级下拉 + 部门卡）
    if (keepFilter && _filterCache) {
      var ft = document.getElementById('filter-type');
      var fl = document.getElementById('filter-level');
      if (ft) ft.value = _filterCache.type || '';
      if (fl) fl.value = _filterCache.level || '';
    }
    if (_deptFilter) {
      var dc = document.querySelector('.kb-stat[data-dept="' + _deptFilter + '"]');
      if (dc) dc.classList.add('active');
    }
    doFilter();
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
  html += '<fluent-card class="kb-stat wb-card-total' + (_deptFilter ? '' : ' active') + '" style="--stat-color:var(--brand)" onclick="clearDeptFilter()">' +
    '<div class="n">' + summary.total + '</div>' +
    '<div class="l">总计</div>' +
    (tags(summary) ? '<div class="wb-card-tags">' + tags(summary) + '</div>' : '') +
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

function renderFilterBar() {
  // 阈值设置按钮仅 ADMIN 可见（全局生效配置）
  var isAdmin = typeof me !== 'undefined' && me && me.role === 'ADMIN';
  var settingsBtn = isAdmin
    ? '<button class="btn btn-sm" onclick="openThresholdModal()" style="margin-left:8px">阈值设置</button>'
    : '';
  var tl = tierLabels(); // 筛选选项标签随当前阈值动态生成
  return '<div class="filters" style="margin:16px 0">' +
    '<select class="filter-select" id="filter-type" onchange="doFilter()">' +
      '<option value="">全部类型</option>' +
      '<option value="sample">样品</option>' +
      '<option value="fixture">治具</option>' +
    '</select>' +
    '<select class="filter-select" id="filter-level" onchange="doFilter()">' +
      '<option value="">全部积压等级</option>' +
      '<option value="0">' + tl[0] + '</option>' +
      '<option value="1">' + tl[1] + '</option>' +
      '<option value="2">' + tl[2] + '</option>' +
    '</select>' +
    '<button class="btn btn-sm" onclick="renderWorkbenchDashboard(true)" style="margin-left:8px">刷新</button>' +
    settingsBtn +
    '</div>';
}

// 阈值设置弹窗逻辑见 views/threshold.js（openThresholdModal/applyPreset/refreshThresholdPreview/saveThreshold）

function renderItemTable(items) {
  var rows = items.map(function(item, idx) {
    var style = OVERDUE_STYLES[item.overdue_level] || OVERDUE_STYLES[0];
    var badgeHtml = item.overdue_level > 0
      ? '<span class="wb-badge" style="color:' + style.color + ';background:' + style.bg + '">' + item.overdue_label + '·' + item.overdue_reason + '</span>'
      : '<span style="color:var(--muted)">正常</span>';
    var typeBadge = item.item_type === 'sample'
      ? '<span class="wb-type-tag sample">样品</span>'
      : '<span class="wb-type-tag fixture">治具</span>';

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

function doFilter() {
  var typeVal = document.getElementById('filter-type').value;
  var levelVal = document.getElementById('filter-level').value;
  _filterCache = { type: typeVal, level: levelVal };
  var rows = document.querySelectorAll('#wb-table tbody tr');
  var n = 0;
  rows.forEach(function(tr) {
    var show = true;
    if (typeVal && tr.getAttribute('data-type') !== typeVal) show = false;
    if (levelVal !== '' && tr.getAttribute('data-level') !== levelVal) show = false;
    if (_deptFilter && tr.getAttribute('data-dept') !== _deptFilter) show = false;
    tr.style.display = show ? '' : 'none';
    if (show) { n++; tr.cells[0].textContent = n; } // 可见行重新编号，保证筛选后序号连续
  });
}

// 部门卡交互：单击筛选该部门，再次点击取消
function filterByDept(el) {
  var dept = el.dataset.dept;
  _deptFilter = (_deptFilter === dept) ? null : dept;
  document.querySelectorAll('.kb-stat').forEach(function(c) {
    c.classList.toggle('active', c.dataset.dept ? c.dataset.dept === _deptFilter : !_deptFilter);
  });
  doFilter();
}

// 总计卡交互：清除部门筛选
function clearDeptFilter() {
  _deptFilter = null;
  document.querySelectorAll('.kb-stat').forEach(function(c) { c.classList.remove('active'); });
  var total = document.querySelector('.wb-card-total');
  if (total) total.classList.add('active');
  doFilter();
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
    } else {
      detail = await api('GET', '/api/fixtures/' + item.id);
      logs = await api('GET', '/api/fixtures/' + item.id + '/logs');
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
  if (detail.sample_no || detail.fixture_no || item.item_no) n++;
  if (detail.name) n++;
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
  var typeLabel = item.item_type === 'sample' ? '样品' : '治具';
  var stageLabel = STATUS[detail.status] || detail.status || '-';
  _wbTlAllLogs = logs; // 供折叠/展开切换使用

  var fields = _countWbFields(detail, item);
  var leftHtml = '<div class="wb-detail-info">' +
    _kv('编号', detail.sample_no || detail.fixture_no || item.item_no) +
    _kv('名称', detail.name) +
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

  var mask = openModal('详细信息 · ' + (detail.sample_no || detail.fixture_no || item.item_no), html, { foot: foot });
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
    var action = ACTION_CN[l.action] || l.action || '-';
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
  var entry = item.item_type === 'sample'
    ? '/subsystems/samples/frontend/index.html'
    : '/subsystems/fixtures/frontend/index.html';
  var no = item.item_no || '';
  return "window.open('" + entry + "#/scan?no=" + no + "','_blank')";
}


/* --- subsystems/workbench/frontend/js/views/threshold.js --- */
// subsystems/workbench/frontend/js/views/threshold.js
// 阈值设置弹窗（仅 ADMIN 可见入口）：天数输入 + 快捷预设 + 实时分布预览
// 依赖：overdue.js(OVERDUE_BOUNDS/calcOverdue)、dashboard.js(_wbItems/renderWorkbenchDashboard)、
//       shared modal.js(openModal/closeModal)、api-base.js(api/showToast)
// 后端：GET/PUT /api/workbench/settings（PUT 仅 ADMIN，写库全局生效）

// 打开阈值设置弹窗
function openThresholdModal() {
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
        '<div class="th-preview-title">按当前阈值，当前 ' + _wbItems.length + ' 条活跃项目的分布</div>' +
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
    '<button data-k="dashboard" class="active" onclick="location.hash=\'#/dashboard\'">工作台</button>';
}

function setActive(k) {
  document.querySelectorAll('#nav button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.k === k);
  });
}

function route() {
  var h = location.hash.replace('#/', '') || 'dashboard';
  if (h === 'dashboard') {
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
  document.getElementById('me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
}


// bundle init
window.addEventListener('hashchange',route);boot();
