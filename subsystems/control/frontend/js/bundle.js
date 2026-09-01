/** BUNDLE vbmtbkeeii — 24 files */
/* --- shared constants (data/*.json) --- */
var LIMIT_ITEMS = [{"code":"A","label":"成品震动(限度)"},{"code":"AI","label":"扇叶震动(限度)"},{"code":"A1","label":"MCU IC烧録器(限度)"},{"code":"A2","label":"平衡机测试(限度)"},{"code":"A3","label":"入充磁扇叶组立(限度)"},{"code":"B","label":"异音(限度)"},{"code":"C","label":"外观(限度)"},{"code":"D","label":"定子组绝缘耐压/阻抗"},{"code":"E","label":"马达组电测（波形、反转）"},{"code":"F","label":"层间测试"},{"code":"G","label":"定子组大小边"},{"code":"H","label":"AOI视觉/CCD检测"},{"code":"I","label":"压定子高度"},{"code":"J","label":"扣环检测"},{"code":"K","label":"PCB组与定子组结合焊锡"},{"code":"L","label":"自动化马达组组立"},{"code":"M","label":"马达组焊导线组"},{"code":"N","label":"导线焊点位置检测"},{"code":"O","label":"断电功能检测"},{"code":"P","label":"成品检测(转速、电流)"},{"code":"Q","label":"定子组自动绕、缠线"},{"code":"R","label":"铜轴承自动化"},{"code":"S","label":"CCD检测浸锡后定子组"},{"code":"T","label":"CCD检测外框组"},{"code":"U","label":"2Ball成品自动化组立"},{"code":"X","label":"特殊工站"}];
var SOURCE_TYPES = {"C":"客供","T":"元山","G":"元将五金塔岗分厂"};
var DEPTS = ["系统","研发部","品保文管中心","制造部","资材部","FQC","生技部","项目部"];
var CONTROL_FLOW = {"statusOrder":["DRAFT","SIGNING","LABELED","CONTROL_STORED","NCR_DONE","DISPOSAL_SIGNING","REWORK_OPENED","REWORKING","REWORK_REPORTED","REIN_STOCK","SHIPPED"],"stageOfStatus":{"DRAFT":1,"SIGNING":1,"LABELED":2,"CONTROL_STORED":2,"NCR_DONE":3,"DISPOSAL_SIGNING":3,"REWORK_OPENED":4,"REWORKING":4,"REWORK_REPORTED":4,"REIN_STOCK":5,"SHIPPED":5},"signNodes":[{"node_key":"APPLY_SIGN","node_name":"申请管制会签","trigger_status":"SIGNING","steps":[{"seq":1,"role":"QA","dept":"品保"},{"seq":2,"role":"RD","dept":"研发"},{"seq":3,"role":"CUSTODY","dept":"生管"},{"seq":4,"role":"CUSTODY","dept":"制造部"},{"seq":5,"role":"CUSTODY","dept":"仓库"}]},{"node_key":"DISPOSAL_SIGN","node_name":"处理方式会签","trigger_status":"DISPOSAL_SIGNING","steps":[{"seq":1,"role":"QA","dept":"品保"},{"seq":2,"role":"RD","dept":"研发"}]}],"stepDefs":[{"seq":1,"key":"apply","label":"申请","stage":1},{"seq":2,"key":"sign1","label":"会签(闸口①)","stage":1},{"seq":3,"key":"label","label":"贴标","stage":2},{"seq":4,"key":"store","label":"入仓","stage":2},{"seq":5,"key":"ncr","label":"开NCR","stage":3},{"seq":6,"key":"sign2","label":"处理会签(闸口②)","stage":3},{"seq":7,"key":"rework_open","label":"开重工单","stage":4},{"seq":8,"key":"schedule","label":"排产","stage":4},{"seq":9,"key":"report","label":"报工","stage":4},{"seq":10,"key":"in_stock","label":"入库","stage":5},{"seq":11,"key":"ship","label":"出货","stage":5}],"stageDefs":[{"stage":1,"key":"apply_sign","name":"申请与会签","dept":["品保","研发","生管","制造部","仓库"]},{"stage":2,"key":"label_store","name":"贴标与入仓","dept":["品保","仓库"]},{"stage":3,"key":"ncr_disposal","name":"NCR与处理会签","dept":["品保","研发"]},{"stage":4,"key":"rework","name":"重工执行","dept":["生管","制造部","仓库"]},{"stage":5,"key":"in_stock_ship","name":"入库出货","dept":["仓库","制造部"]}]};

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


/* --- subsystems/control/frontend/js/constants.js --- */
// subsystems/control/frontend/js/constants.js — 管制流程管理子系统前端常量
// 来源：manifest.json（状态/动作中文）、后端 ACTION_LOG、设计规格。ROLE/STATUS/$/api 等由 shared/api-base.js 提供。

// 状态 → 中文（取自 manifest.stateMachine.states.label）
var CONTROL_STATUS_CN = {
  DRAFT: '申请草稿', SIGNING: '管制会签中', LABELED: '已贴管制标签',
  CONTROL_STORED: '已入管制仓', NCR_DONE: '不良品委托单已开',
  DISPOSAL_SIGNING: '处理方式会签中', REWORK_OPENED: '重工工单已开',
  REWORKING: '重工执行中', REWORK_REPORTED: '已报工', REIN_STOCK: '已入库',
  SHIPPED: '已出货', RETIRED: '已作废'
};

// 流转/留痕动作 → 中文（与后端 ACTION_LOG 对齐，新增补充 CREATE/EDIT/NCR/REWORK_LOG 及会签动作）
var CONTROL_ACTION_CN = {
  CREATE: '新建管制申请', EDIT: '编辑草稿', SUBMIT: '提交会签',
  SIGN_OK: '闸口①会签通过/贴标', STORE: '入管制仓', CREATE_NCR: '开不良品委托单',
  DISPATCH: '发起处理方式会签', DISPOSAL_OK: '闸口②会签通过', START: '生产确认开工',
  REPORT: '报工', IN_STOCK: '入库', SHIP: '出货',
  SIGN_REJECT: '闸口①会签退回', DISPOSAL_REJECT: '闸口②会签退回',
  VOID: '作废', NCR: '追加不良品委托单', REWORK_LOG: '报工',
  SIGN_AGREE: '会签同意', SIGN_REJECT2: '会签退回', SIGN_SKIP: '会签强制跳过'
};

// 不良类型（新建时下拉）
var CONTROL_BAD_TYPES = ['外观不良', '功能不良', '尺寸不良', '性能不良', '包装不良', '其它'];

// 申请部门（新建时下拉，缺省覆盖常见单位）
var CONTROL_DEPTS = ['品保文管中心', '研发部', '生管', '仓库', '制造部', 'FQC', '生技部'];

// 状态流转规则（前端动作按钮过滤：与 manifest.stateMachine.transitions 保持一致；VOID 作废仅 ADMIN，由详情页单独处理）
var CONTROL_TRANSITIONS = [
  { from: 'DRAFT', to: 'SIGNING', action: 'SUBMIT', role: ['CUSTODY', 'ME'], label: '提交会签' },
  { from: 'SIGNING', to: 'LABELED', action: 'SIGN_OK', role: ['QA'], label: '闸口①会签通过/贴标' },
  { from: 'LABELED', to: 'CONTROL_STORED', action: 'STORE', role: ['CUSTODY'], label: '入管制仓' },
  { from: 'CONTROL_STORED', to: 'NCR_DONE', action: 'CREATE_NCR', role: ['QA'], label: '开不良品委托单' },
  { from: 'NCR_DONE', to: 'DISPOSAL_SIGNING', action: 'DISPATCH', role: ['QA'], label: '发起处理方式会签' },
  { from: 'DISPOSAL_SIGNING', to: 'REWORK_OPENED', action: 'DISPOSAL_OK', role: ['QA', 'RD'], label: '闸口②会签通过' },
  { from: 'REWORK_OPENED', to: 'REWORKING', action: 'START', role: ['ME'], label: '生产确认开工' },
  { from: 'REWORKING', to: 'REWORK_REPORTED', action: 'REPORT', role: ['CUSTODY', 'ME'], label: '报工' },
  { from: 'REWORK_REPORTED', to: 'REIN_STOCK', action: 'IN_STOCK', role: ['CUSTODY', 'ME'], label: '入库' },
  { from: 'REIN_STOCK', to: 'SHIPPED', action: 'SHIP', role: ['CUSTODY', 'ME'], label: '出货' },
  { from: 'SIGNING', to: 'DRAFT', action: 'SIGN_REJECT', role: ['QA', 'RD', 'ME', 'CUSTODY'], label: '闸口①会签退回' },
  { from: 'DISPOSAL_SIGNING', to: 'NCR_DONE', action: 'DISPOSAL_REJECT', role: ['QA', 'RD'], label: '闸口②会签退回' }
];

// 按当前状态 + 角色返回可执行的流转按钮列表（不含 VOID 作废）
function controlTransitionsOf(status, role) {
  return CONTROL_TRANSITIONS.filter(function (t) {
    return t.from === status && t.role.indexOf(role) > -1;
  });
}


/* --- subsystems/control/frontend/js/constants/label.js --- */
// subsystems/control/frontend/js/constants/label.js — 管制标签纸尺寸常量与 contain 缩放
// 尺寸单位 mm（毫米），与后端标签 HTML 渲染保持语义一致；仅前端预览/打印排版用。

// 预设标签纸尺寸（s/m/l 三档），与文档 ± 标准口径一致
var PRESET_MM = {
  small: { key: 'small', label: '小（37×18mm）', w: 37, h: 18 },
  medium: { key: 'medium', label: '中（52×25mm）', w: 52, h: 25 },
  large: { key: 'large', label: '大（60×40mm）', w: 60, h: 40 }
};

// 自定义区间 30~150mm（超出则取边界）
function controlClampMm(v) { return Math.min(150, Math.max(30, Number(v) || 30)); }

// 预览基准显示框（px）：容器最大宽 / 高，用于计算 contain 缩放
var CONTOL_LABEL_BOX = { w: 300, h: 340 };

/**
 * contain 缩放：在基准显示框内等比缩放标签纸，返回 { scale, width, height }。
 * 超小尺寸按 1:1 显示（scale 最小 1），宽高单位换算 px（1mm ≈ 3.78px）。
 * @param {number} w 标签宽（mm）
 * @param {number} h 标签高（mm）
 */
function controlCalcLabelRatio(w, h) {
  w = Number(w) || 0; h = Number(h) || 0;
  if (!w || !h) return { scale: 1, width: 0, height: 0 };
  var ratio = Math.min(CONTOL_LABEL_BOX.w / w, CONTOL_LABEL_BOX.h / h, 4);
  return { scale: ratio, width: Math.round(w * ratio * 3.78), height: Math.round(h * ratio * 3.78) };
}


/* --- subsystems/control/frontend/js/api.js --- */
// subsystems/control/frontend/js/api.js — 管制子系统入口（鉴权/登录/API 基础见 shared/api-base.js）
// fmt/e/toast 由 shared 提供（api-base.js 的 fmt/showToast，shared/utils.js 的 e/toast），此处另补管制专用时间格式。

var me = null;

function showApp() {
  $('#app').style.display = 'flex';
  $('#me-name').textContent = me.display_name || me.username;
  $('#me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
  buildNav(); route();
}

// ISO 时间串 → YYYY-MM-DD HH:mm（管制单时间列显示，与后端 fmtTime 口径一致）
function fmtTime(d) {
  if (!d) return '—';
  var s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    var M = String(dt.getMonth() + 1), D = String(dt.getDate()), h = String(dt.getHours()), mi = String(dt.getMinutes());
    if (M.length < 2) M = '0' + M; if (D.length < 2) D = '0' + D;
    if (h.length < 2) h = '0' + h; if (mi.length < 2) mi = '0' + mi;
    return dt.getFullYear() + '-' + M + '-' + D + ' ' + h + ':' + mi;
  }
  return s.replace('T', ' ').slice(0, 16);
}

// 覆盖 shared/api-base.js 的 statusBadge：管制状态中文 + .b-<status> class（颜色见 module.css）
function statusBadge(row) {
  var st = row.status || 'DRAFT';
  return '<fluent-badge class="badge b-' + st + '" appearance="filled">' + (CONTROL_STATUS_CN[st] || st) + '</fluent-badge>';
}


/* --- subsystems/control/frontend/js/progress.js --- */
// subsystems/control/frontend/js/progress.js — 管制详情页进度可视化
// 由详情聚合响应 agg = GET /api/control/orders/:id 会话 { order, signs, ncrLogs, reworkLogs }
// 派生 11 步进度条 + 5 阶段卡。与 backend/flow.js 的 deriveProgress 保持单一来源同步（AGENTS.md §16 风险提示）。
// 暴露（浏览器全局）：controlDeriveProgress / controlRenderProgress / controlRenderStageCards / controlCalcRemain

// 单一事实来源 = data/control-flow.json（§5.1 阶段映射 / §5.2 步定义 / §8 会签模板）。
// 由 tools/build-bundles.js 注入全局 var CONTROL_FLOW，与后端 flow.js 的 require 同源，避免两处漂移。
// 兜底空对象仅防未构建时 ReferenceError，业务数据以 JSON 为准。
const CF = (typeof CONTROL_FLOW !== 'undefined' && CONTROL_FLOW) || { statusOrder: [], stageOfStatus: {}, signNodes: [], stepDefs: [], stageDefs: [] };
const CONTROL_STATUS_ORDER = CF.statusOrder;
const CONTROL_STATUS_IDX = {};
CONTROL_STATUS_ORDER.forEach(function (s, i) { CONTROL_STATUS_IDX[s] = i + 1; });

const CONTROL_STAGE_OF_STATUS = CF.stageOfStatus;

const CONTROL_SIGN_NODES = CF.signNodes;

const CONTROL_STEP_DEFS = CF.stepDefs;

const CONTROL_STAGE_DEFS = CF.stageDefs;

function controlGetStageOf(status) { return CONTROL_STAGE_OF_STATUS[status] || 0; }

function controlStatusAtLeast(status, min) {
  const idx = CONTROL_STATUS_IDX[status];
  return !!idx && idx >= CONTROL_STATUS_IDX[min];
}

function controlSignPassed(signs, nodeKey) {
  const node = CONTROL_SIGN_NODES.find(function (n) { return n.node_key === nodeKey; });
  if (!node) return false;
  const list = (signs || []).filter(function (s) { return s.node_key === nodeKey; });
  if (list.length < node.steps.length) return false;
  return list.every(function (s) { return s.decision === 'AGREE'; });
}

function controlStepDone(order, bonus, key) {
  switch (key) {
    case 'apply': return !!CONTROL_STATUS_IDX[order.status];
    case 'sign1': return controlSignPassed(bonus.signs, 'APPLY_SIGN');
    case 'label': return !!order.label_no;
    case 'store': return !!order.storage_location;
    case 'ncr': return !!(bonus.ncrLogs && bonus.ncrLogs.length);
    case 'sign2': return controlSignPassed(bonus.signs, 'DISPOSAL_SIGN');
    case 'rework_open': return !!order.rework_no;
    case 'schedule': return !!order.rework_sop && controlStatusAtLeast(order.status, 'REWORKING');
    case 'report': return !!(bonus.reworkLogs && bonus.reworkLogs.length);
    case 'in_stock': return controlStatusAtLeast(order.status, 'REIN_STOCK') || !!order.in_stock_at;
    case 'ship': return order.status === 'SHIPPED';
    default: return false;
  }
}

// 报工结余（§6）：remain = qty - good - ng - scrap
function controlCalcRemain(qty, good, ng, scrap) {
  return (Number(qty) || 0) - (Number(good) || 0) - (Number(ng) || 0) - (Number(scrap) || 0);
}

/**
 * 派生 11 步 + 5 阶段完成状态（§5.2，同 backend/flow.js deriveProgress）。
 * @param {Object} agg 详情聚合 { order, signs, ncrLogs, reworkLogs }
 */
function controlDeriveProgress(agg) {
  const order = (agg && agg.order) || {};
  const b = {
    signs: (agg && agg.signs) || [],
    ncrLogs: (agg && agg.ncrLogs) || [],
    reworkLogs: (agg && agg.reworkLogs) || []
  };
  const steps = CONTROL_STEP_DEFS.map(function (def) {
    return { seq: def.seq, key: def.key, label: def.label, stage: def.stage, done: controlStepDone(order, b, def.key), current: false };
  });
  let curSeq = 0;
  for (let i = 0; i < steps.length; i++) { if (!steps[i].done) { curSeq = steps[i].seq; break; } }
  steps.forEach(function (st) { st.current = st.seq === curSeq; });
  const allDone = curSeq === 0;

  const stages = CONTROL_STAGE_DEFS.map(function (def) {
    const sts = steps.filter(function (s) { return s.stage === def.stage; });
    const doneCount = sts.filter(function (s) { return s.done; }).length;
    return {
      stage: def.stage, key: def.key, name: def.name, dept: def.dept || [],
      steps: sts.map(function (s) { return s.seq; }), stepCount: sts.length,
      doneCount, done: doneCount === sts.length, current: sts.some(function (s) { return s.current; })
    };
  });

  return { steps: steps, stages: stages, currentStage: controlGetStageOf(order.status), allDone: allDone };
}

/**
 * 渲染 11 步进度步骤条 HTML。
 * @param {Object} agg 详情聚合
 * @returns {string} <ol class="ctl-progress"> 步骤条
 */
function controlRenderProgress(agg) {
  const d = controlDeriveProgress(agg);
  const items = d.steps.map(function (s) {
    const cls = s.done ? 'ctl-step done' : (s.current ? 'ctl-step current' : 'ctl-step');
    const dot = s.done ? '\u2713' : String(s.seq);
    return '<li class="' + cls + '"><span class="ctl-step-dot">' + dot + '</span><span class="ctl-step-label">' + s.label + '</span></li>';
  }).join('');
  return '<ol class="ctl-progress">' + items + '</ol>';
}

/**
 * 渲染 5 阶段卡 HTML。
 * @param {Object} agg 详情聚合
 * @returns {string} 阶段卡片片段
 */
function controlRenderStageCards(agg) {
  const d = controlDeriveProgress(agg);
  return d.stages.map(function (st) {
    const cls = st.done ? 'ctl-stage done' : (st.current ? 'ctl-stage current' : 'ctl-stage');
    return '<div class="' + cls + '" data-stage="' + st.stage + '">'
      + '<div class="ctl-stage-name">阶段' + st.stage + ' ' + st.name
      + (st.dept && st.dept.length ? '<span class="ctl-stage-dept">' + st.dept.join(' / ') + '</span>' : '')
      + '</div>'
      + '<div class="ctl-stage-count">' + st.doneCount + '/' + st.stepCount + '</div>'
      + '</div>';
  }).join('');
}


/* --- subsystems/control/frontend/js/todo.js --- */
// subsystems/control/frontend/js/todo.js — 角色待办派生与渲染（看板顶部待办区）
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.3
// 纯前端派生，复用 constants.js 的 controlTransitionsOf（待我流转）与 progress.js 的 CONTROL_SIGN_NODES（待我签核）
// 说明：看板列表接口不含会签 signs，待我签核按「状态命中会签节点 + 该节点首步角色匹配当前角色/管理员」近似圈定。

// 派生当前角色待办：toFlow=待我流转, toSign=待我签核（各返回单据数组 + 计数）
function ctlTodoOf(orders, role) {
  var list = orders || [];
  var toFlow = [];
  var toSign = [];
  list.forEach(function (o) {
    if (controlTransitionsOf(o.status, role).length) toFlow.push(o);
    var node = CONTROL_SIGN_NODES.find(function (n) { return n.trigger_status === o.status; });
    if (node && node.steps && node.steps.length && (node.steps[0].role === role || role === 'ADMIN')) {
      toSign.push(o);
    }
  });
  return { toFlow: toFlow, toSign: toSign, flowCount: toFlow.length, signCount: toSign.length };
}

// 单条待办项 HTML：单号 + 品名 + 状态徽章 + 下一动作提示（点击跳详情）
function ctlTodoItemHtml(o) {
  var next = controlTransitionsOf(o.status, me.role);
  var hint = next.length ? next[0].label : '查看详情';
  return '<a class="todo-item" href="#/detail?id=' + o.id + '">'
    + '<span class="mono">' + e(o.order_no) + '</span>'
    + '<span>' + e(o.part_name || '—') + '</span>'
    + statusBadge(o)
    + '<span class="todo-hint">' + e(hint) + '</span></a>';
}

// 待办区 HTML：有待办分「待我流转 / 待我签核」两栏，无待办显示空态
function ctlTodoHtml(orders, role) {
  var t = ctlTodoOf(orders, role);
  if (!t.flowCount && !t.signCount) return '<div class="empty">当前角色暂无待办</div>';
  var sec = function (title, list) {
    if (!list.length) return '';
    return '<div class="todo-sec"><div class="todo-title">' + title + ' <span class="n">' + list.length + '</span></div>'
      + list.map(ctlTodoItemHtml).join('') + '</div>';
  };
  return '<div class="ctl-todo">' + sec('待我流转', t.toFlow) + sec('待我签核', t.toSign) + '</div>';
}


/* --- subsystems/control/frontend/js/settings.js --- */
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


/* --- subsystems/control/frontend/js/views/dashboard.js --- */
// subsystems/control/frontend/js/views/dashboard.js — 管制看板（列式看板 + 顶部概览）
// 数据来源：列表接口取卡片数据（limit=200，卡片仅作概览），列头准确数量来自 /api/control/orders/stats
//           （按状态分组计数，不依赖列表 limit 截断）。
// 布局：顶部汇总统计卡（.kb-stat，单击跳列表）+ 角色待办区 + 5 阶段列板。
//          超期滞留判定用全局 _ctlOverdueHours（admin 可调，缺省 48h），今日新增以 apply_at 为准。

// 各阶段颜色（列头色条 + 卡片数，语义：进行中/待办用深色系）
var CTL_STAGE_COLOR = { 1: '#92400e', 2: '#155e75', 3: '#1d4ed8', 4: '#3730a3', 5: '#065f46' };

// 阶段 → 状态列表（反转 CONTROL_STAGE_OF_STATUS，用于阶段列头单击按状态筛选）
var CONTROL_STAGE_OF_STATUS_INV = {};
Object.keys(CONTROL_STAGE_OF_STATUS).forEach(function (s) {
  var st = CONTROL_STAGE_OF_STATUS[s];
  (CONTROL_STAGE_OF_STATUS_INV[st] = CONTROL_STAGE_OF_STATUS_INV[st] || []).push(s);
});

async function renderDashboard() {
  var view = $('#view');
  view.innerHTML = '<div class="kb-wrap"></div>';
  var wrap = $('.kb-wrap', view);
  try {
    await ctlLoadSettings(); // 加载超期阈值（缺省 48），供统计与卡片高亮
    var pair = await Promise.all([
      api('GET', '/api/control/orders?limit=200'),
      api('GET', '/api/control/orders/stats')
    ]);
    var orders = (pair[0] && pair[0].orders) || [];
    var byStatus = (pair[1] && pair[1].byStatus) || {};
    wrap.innerHTML = ctlBoardHtml(orders, byStatus);
  } catch (err) {
    wrap.innerHTML = '<div class="empty"><p>看板加载失败：' + e(err.message) + '</p><button class="btn primary" onclick="renderDashboard()">重试</button></div>';
  }
}

// 列式看板：顶部统计卡 + 5 阶段列（列头计数 = stats 按状态聚合，列内管制单卡片 = 列表概览）
// 待办已移入独立「我的待办」页，看板仅保留统计卡（待我签发/待我流转点击跳待办页）+ 列板。
function ctlBoardHtml(orders, byStatus) {
  byStatus = byStatus || {};
  var todo = ctlTodoOf(orders, me.role);
  return '<h3 class="ctl-sec">管制看板</h3>'
    + ctlStatsHtml(orders, todo, _ctlOverdueHours)
    + '<div class="ctl-board">' +
    CONTROL_STAGE_DEFS.map(function (def) {
      var items = orders.filter(function (o) { return CONTROL_STAGE_OF_STATUS[o.status] === def.stage; });
      items.sort(function (a, b) { return ctlDwellOf(b) - ctlDwellOf(a); });
      var statuses = CONTROL_STAGE_OF_STATUS_INV[def.stage];
      var count = statuses.reduce(function (acc, s) { return acc + (byStatus[s] || 0); }, 0);
      return '<div class="ctl-board-col" style="--col-color:' + CTL_STAGE_COLOR[def.stage] + '">'
        + '<div class="ctl-board-head" onclick="ctlGotoOrders(\'' + statuses + '\')" ondblclick="ctlGotoOrders(\'\')" title="单击筛选·双击查看全部">'
        + '<span class="ctl-board-name">阶段' + def.stage + ' ' + def.name + '</span>'
        + '<span class="ctl-board-count">' + count + '</span></div>'
        + '<div class="ctl-board-cards">' + (items.length ? items.map(ctlBoardCardHtml).join('') : '<div class="ctl-board-empty">暂无单据</div>') + '</div>'
        + '</div>';
    }).join('') + '</div>';
}

// 顶部汇总统计卡（.kb-stat 协议）：进行中 / 今日新增 / 待我签核 / 待我流转 / 超期滞留；admin 加阈值入口
function ctlStatsHtml(orders, todo, overdueHours) {
  var active = orders.filter(ctlNotDone);
  var today = orders.filter(function (o) { return ctlIsTodayApply(o); }).length;
  var over = active.filter(function (o) { return ctlDwellOf(o) > overdueHours; }).length;
  var cards = [
    { n: active.length, l: '进行中', c: '#1d4ed8', hash: '#/orders?active=1', tip: '前往管制单列表（进行中）' },
    { n: today, l: '今日新增', c: 'var(--brand)', hash: '#/orders?today=1', tip: '前往管制单列表（今日新增）' },
    { n: todo.signCount, l: '待我签核', c: 'var(--warn)', hash: '#/todo', tip: '前往我的待办' },
    { n: todo.flowCount, l: '待我流转', c: '#065f46', hash: '#/todo', tip: '前往我的待办' },
    { n: over, l: '超期滞留', c: 'var(--bad)', hash: '#/orders?overdue=1', tip: '前往管制单列表（超期滞留）' }
  ];
  var html = '<div class="kb-stats">' + cards.map(function (cd) {
    return '<div class="kb-stat" style="--stat-color:' + cd.c + '" onclick="location.hash=\'' + cd.hash + '\'" title="' + cd.tip + '">'
      + '<div class="n">' + cd.n + '</div><div class="l">' + cd.l + '</div></div>';
  }).join('') + '</div>';
  if (me.role === 'ADMIN') {
    html += '<div class="ctl-th-gear"><button class="btn ghost sm" onclick="openControlThresholdModal()">⚙ 阈值 ' + overdueHours + 'h</button></div>';
  }
  return html;
}

// 否为完结（已出货/已作废）以外的进行中单据
function ctlNotDone(o) { return o.status !== 'SHIPPED' && o.status !== 'RETIRED'; }

// 今日新增：以 apply_at 为基准（当天零点后）
function ctlIsTodayApply(o) {
  var t = o.apply_at ? new Date(o.apply_at).getTime() : NaN;
  if (isNaN(t)) return false;
  var d = new Date(t), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// 单张管制卡：单号 + 品名 + 状态徽章 + 数量·不良类型 + 滞留时长(超期高亮) + 下一步提示（点击进详情）
function ctlBoardCardHtml(o) {
  var dwell = ctlDwellOf(o);
  var over = dwell > _ctlOverdueHours;
  var next = controlTransitionsOf(o.status, me.role);
  var hint = next.length ? next[0].label : '';
  var dwellHtml = '';
  if (dwell >= 24) {
    var days = Math.floor(dwell / 24), hrs = dwell % 24;
    dwellHtml = '<span class="ctl-dwell' + (over ? ' over' : '') + '">' + (days ? days + '天' : '') + hrs + 'h</span>';
  }
  return '<a class="ctl-board-card' + (over ? ' over' : '') + '" href="#/detail?id=' + o.id + '" title="点击查看详情">'
    + '<div class="ctl-board-no">' + e(o.order_no) + '</div>'
    + '<div class="ctl-board-part">' + e(o.part_name) + '</div>'
    + '<div class="ctl-board-meta">' + statusBadge(o) + dwellHtml + '</div>'
    + '<div class="ctl-board-tags">' + (o.qty != null ? o.qty : '—') + ' · ' + e(o.bad_type || '—') + '</div>'
    + (hint ? '<div class="ctl-board-next">下一步：' + e(hint) + '</div>' : '')
    + '</a>';
}

/** 滞留时长（小时）：以申请/创建时间为基准，未完结单返回小时数，完结单返回 0 */
function ctlDwellOf(o) {
  if (o.status === 'SHIPPED' || o.status === 'RETIRED') return 0;
  var base = o.apply_at || o.created_at;
  var t = base ? new Date(base).getTime() : NaN;
  if (isNaN(t)) return 0;
  return Math.floor((Date.now() - t) / 3600000);
}

/** 跳转列表：statuses 为空则全部；逗号分隔多状态（列表接口支持 status=a,b） */
function ctlGotoOrders(statuses) {
  location.hash = statuses ? '#/orders?status=' + statuses : '#/orders';
}


/* --- subsystems/control/frontend/js/views/list.js --- */
// subsystems/control/frontend/js/views/list.js — 管制单列表
// 筛选/排序/分页 + 导出 CSV（复用列表查询参数，忽略分页，见 AGENTS.md §21）。
// 读取 route() 写入的 currentStatusFilter 作为初始状态筛选（看板阶段卡单击跳转）。

var _ctlPager = { limit: 20, offset: 0, total: 0 };
var _ctlQuery = { q: '', status: '', apply_dept: '', bad_type: '', sort: '', active: false, today: false, overdue: false };
var _ctlRows = [];            // 当前页已渲染行（委托单行内展开用，免重复请求）
var _ctlNcrMap = {};          // order_id → ncr[] 聚合映射（委托单号列行内展开数据源）
var _ctlExpandedOrder = null; // 当前行内展开的管制单 id

async function renderList() {
  var view = $('#view');
  view.innerHTML = sendFilterHtml() + '<div id="ctl-sheet" class="ctl-sheet"></div>';
  $('#ctl-field-q').value = _ctlQuery.q;
  var statusSel = $('#ctl-field-status');
  var initStatus = currentStatusFilter || _ctlQuery.status;
  if (initStatus) statusSel.value = initStatus;
  $('#ctl-field-apply_dept').value = _ctlQuery.apply_dept;
  $('#ctl-field-bad_type').value = _ctlQuery.bad_type;
  $('#ctl-field-sort').value = _ctlQuery.sort;
  // 看板统计卡联动：进行中/今日新增/超期滞留（router.js 写入的哈希 query 筛选）
  _ctlQuery.active = currentActiveFilter;
  _ctlQuery.today = currentTodayFilter;
  _ctlQuery.overdue = currentOverdueFilter;
  await ctlFetchList(0);
}

function sendFilterHtml() {
  var statusOpts = ['<option value="">全部状态</option>'].concat(CONTROL_STATUS_ORDER.map(function (s) {
    return '<option value="' + s + '">' + (CONTROL_STATUS_CN[s] || s) + '</option>';
  })).join('') + '<option value="RETIRED">已作废</option>';
  var deptOpts = '<option value="">全部部门</option>' + CONTROL_DEPTS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
  var badOpts = '<option value="">全部类型</option>' + CONTROL_BAD_TYPES.map(function (b) { return '<option value="' + b + '">' + b + '</option>'; }).join('');
  var sortOpts = '<option value="">默认（新→旧）</option>'
    + '<option value="order_no">单号升序</option><option value="-order_no">单号降序</option>'
    + '<option value="apply_at">申请时间升序</option><option value="-apply_at">申请时间降序</option>'
    + '<option value="created_at">创建时间升序</option><option value="-created_at">创建时间降序</option>';
  return '<div class="filters"><div class="filter-row">'
    + '<input id="ctl-field-q" class="input" placeholder="单号/料号/品名/申请人" />'
    + '<select id="ctl-field-status" class="input">' + statusOpts + '</select>'
    + '<select id="ctl-field-apply_dept" class="input">' + deptOpts + '</select>'
    + '<select id="ctl-field-bad_type" class="input">' + badOpts + '</select>'
    + '<select id="ctl-field-sort" class="input">' + sortOpts + '</select>'
    + '<button class="btn primary" onclick="ctlFetchList(0)">查询</button>'
    + '<button class="btn" onclick="ctlResetFilter()">清除</button>'
    + '<button class="btn" onclick="exportControlCsv()">导出 CSV</button>'
    + '</div></div>';
}

/** 收集当前筛选到 _ctlQuery；q 为空串时过滤请求参数 */
function ctlCollectQuery() {
  _ctlQuery.q = $('#ctl-field-q').value;
  _ctlQuery.status = $('#ctl-field-status').value;
  _ctlQuery.apply_dept = $('#ctl-field-apply_dept').value;
  _ctlQuery.bad_type = $('#ctl-field-bad_type').value;
  _ctlQuery.sort = $('#ctl-field-sort').value;
}

function ctlQueryString() {
  var q = [];
  var map = { q: _ctlQuery.q, status: _ctlQuery.status, apply_dept: _ctlQuery.apply_dept, bad_type: _ctlQuery.bad_type, sort: _ctlQuery.sort };
  for (var k in map) { if (map[k] !== '' && map[k] != null) q.push(k + '=' + encodeURIComponent(map[k])); }
  // 看板统计卡联动 quick filter：为 true 时输出 active=1/today=1/overdue=1
  if (_ctlQuery.active) q.push('active=1');
  if (_ctlQuery.today) q.push('today=1');
  if (_ctlQuery.overdue) q.push('overdue=1');
  return q.length ? '&' + q.join('&') : '';
}

/**
 * 拉取列表并渲染当前页。
 * @param {number} page 页码（0 基），offset = page * limit
 */
async function ctlFetchList(page) {
  ctlCollectQuery();
  var limit = _ctlPager.limit;
  var offset = Math.max(0, page) * limit;
  var url = '/api/control/orders?limit=' + limit + '&offset=' + offset + ctlQueryString();
  try {
    var res = await api('GET', url);
    _ctlPager.offset = offset;
    _ctlPager.total = res.total || 0;
    _ctlRows = res.orders || [];
    await ctlLoadNcrMap(_ctlRows);
    renderListSheet(_ctlRows, Math.max(0, page));
  } catch (err) {
    $('#ctl-sheet').innerHTML = '<div class="empty">列表加载失败：' + e(err.message) + '</div>';
  }
}

/** 拉取当前页各管制单的 NCR 聚合（order_id → ncr[]），供委托单号列行内展开；失败置空不阻断列表 */
async function ctlLoadNcrMap(orders) {
  var ids = (orders || []).filter(function (o) { return o.id; }).map(function (o) { return o.id; }).join(',');
  if (!ids) { _ctlNcrMap = {}; return; }
  try {
    var res = await api('GET', '/api/control/ncrs?order_ids=' + encodeURIComponent(ids) + '&limit=1000');
    var map = {};
    (res.ncrs || []).forEach(function (n) { if (n.order_id) (map[n.order_id] = map[n.order_id] || []).push(n); });
    _ctlNcrMap = map;
  } catch (err) { _ctlNcrMap = {}; }
}

/** 切换某行的 NCR 展开/收起；免重新拉列表，用已缓存页数据直接重渲染 */
function ctlToggleNcr(id) {
  _ctlExpandedOrder = (_ctlExpandedOrder === id) ? null : id;
  renderListSheet(_ctlRows, Math.max(0, Math.floor(_ctlPager.offset / _ctlPager.limit)));
}

/** 渲染表格 + 分页（rows 为当前页数据，page 为 0 基页码）；委托单号列支持行内展开全部 NCR */
function renderListSheet(rows, page) {
  var total = _ctlPager.total;
  var sheet = $('#ctl-sheet');
  if (!rows.length) { sheet.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  var body = rows.map(function (o) {
    var ncrs = _ctlNcrMap[o.id] || [];
    var expanded = _ctlExpandedOrder === o.id;
    // 委托单号列：无 NCR 显示 —；单张直接显示单号；多张显示「首单号 +N」；点击行内展开/收起（阻止冒泡避免跳详情）
    var ncrCell;
    if (!ncrs.length) ncrCell = '<td class="muted">—</td>';
    else {
      var label = ncrs.length > 1 ? (ncrs[0].ncr_no + ' +' + (ncrs.length - 1)) : ncrs[0].ncr_no;
      ncrCell = '<td><span class="ncr-toggle" onclick="event.stopPropagation();ctlToggleNcr(' + o.id + ')">' + e(label) + '</span></td>';
    }
    var tr = '<tr onclick="location.hash=\'#/detail?id=' + o.id + '\'" class="row-click">'
      + '<td class="mono">' + e(o.order_no) + '</td><td>' + e(o.part_no) + '</td><td>' + e(o.part_name) + '</td>'
      + '<td>' + e(o.bad_type) + '</td><td>' + (o.qty || 0) + '</td><td>' + e(o.apply_dept) + '</td>'
      + '<td>' + e(o.applicant_name) + '</td>' + ncrCell
      + '<td>' + statusBadge(o) + '</td><td class="mono">' + fmtTime(o.apply_at) + '</td></tr>';
    // 展开态：追加一张跨列行内嵌 NCR 明细卡（复用 renderNcrTab）
    if (expanded && ncrs.length) {
      tr += '<tr class="ncr-expand-row"><td colspan="10" class="ncr-expand-cell">' + renderNcrTab(ncrs) + '</td></tr>';
    }
    return tr;
  }).join('');
  var maxPage = Math.max(0, Math.ceil(total / _ctlPager.limit) - 1);
  var pager = '<div class="pager"><span class="muted">共 ' + total + ' 条</span>'
    + '<button class="btn" ' + (page <= 0 ? 'disabled' : '') + ' onclick="ctlFetchList(' + (page - 1) + ')">上一页</button>'
    + '<span>' + (page + 1) + '/' + (maxPage + 1) + '</span>'
    + '<button class="btn" ' + (page >= maxPage ? 'disabled' : '') + ' onclick="ctlFetchList(' + (page + 1) + ')">下一页</button></div>';
  sheet.innerHTML = '<table class="grid"><thead><tr>'
    + '<th>管制单号</th><th>料号</th><th>品名</th><th>不良类型</th><th>数量</th><th>申请部门</th><th>申请人</th><th>委托单号</th><th>状态</th><th>申请时间</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>' + pager;
}

/** 导出 CSV：复用当前筛选参数，忽略分页；用 location.href 触发下载避免弹窗拦截（AGENTS.md §21.2） */
function exportControlCsv() {
  ctlCollectQuery();
  location.href = '/api/control/orders/export?' + ctlQueryString().replace(/^&/, '');
}

/** 清除筛选并回到第一页 */
function ctlResetFilter() {
  $('#ctl-field-q').value = '';
  $('#ctl-field-status').value = '';
  $('#ctl-field-apply_dept').value = '';
  $('#ctl-field-bad_type').value = '';
  $('#ctl-field-sort').value = '';
  _ctlQuery.active = _ctlQuery.today = _ctlQuery.overdue = false;
  currentActiveFilter = currentTodayFilter = currentOverdueFilter = false;
  ctlFetchList(0);
}


/* --- subsystems/control/frontend/js/views/new.js --- */
// subsystems/control/frontend/js/views/new.js — 新建管制申请
// 表单字段与后端 POST /api/control/orders 校验对齐（part_no/part_name/qty/bad_type/reason 必填）。
// 成功后跳转详情页（返回值 id），防重复提交：提交中禁用按钮 + _ctlNewSubmitting 标志位拦截。

function renderNew() {
  var view = $('#view');
  var badOpts = ['<fluent-option value="">请选择不良类型</fluent-option>']
    .concat(CONTROL_BAD_TYPES.map(function (b) { return '<fluent-option value="' + b + '">' + b + '</fluent-option>'; })).join('');
  var deptOpts = ['<fluent-option value="">请选择申请部门</fluent-option>']
    .concat(CONTROL_DEPTS.map(function (d) { return '<fluent-option value="' + d + '">' + d + '</fluent-option>'; })).join('');
  view.innerHTML = '<div class="card n-new-card">'
    // 左右两栏：左=基本信息，右=不良原因分析（字段 id 与提交校验保持一致）
    + '<div class="n-new-grid">'
    + '<div class="n-new-side">'
    + '<div class="n-new-sec">基本信息</div>'
    + '<div class="n-new-field"><label>料号 *</label><fluent-text-field id="n-part_no" placeholder="如 SN-1001" required></fluent-text-field></div>'
    + '<div class="n-new-field"><label>品名 *</label><fluent-text-field id="n-part_name" placeholder="不良品名称" required></fluent-text-field></div>'
    + '<div class="n-new-field"><label>销货单号</label><fluent-text-field id="n-sales_no" placeholder="可选"></fluent-text-field></div>'
    + '<div class="n-new-field"><label>机型</label><fluent-text-field id="n-model" placeholder="可选"></fluent-text-field></div>'
    + '<div class="n-new-field"><label>数量 *</label><fluent-text-field id="n-qty" type="number" min="1" placeholder="如 100" required></fluent-text-field></div>'
    + '<div class="n-new-field"><label>不良类型 *</label><fluent-select id="n-bad_type" required>' + badOpts + '</fluent-select></div>'
    + '<div class="n-new-field"><label>申请部门</label><fluent-select id="n-apply_dept">' + deptOpts + '</fluent-select></div>'
    + '<div class="n-new-field"><label>喷码日期</label><fluent-text-field id="n-spray_date" placeholder="可选"></fluent-text-field></div>'
    + '<div class="n-new-field"><label>客户</label><fluent-text-field id="n-customer" placeholder="可选"></fluent-text-field></div>'
    + '</div>'
    + '<div class="n-new-side">'
    + '<div class="n-new-sec">不良原因分析</div>'
    + '<div class="n-new-field"><label>管制/不良原因 *</label><textarea id="n-reason" rows="3" placeholder="描述不良现象、数量、批次等" required></textarea></div>'
    + '<div class="n-new-field"><label>不良原因分析·外观</label><textarea id="n-bad_appearance" rows="2" placeholder="可选，外观缺陷描述"></textarea></div>'
    + '<div class="n-new-field"><label>不良原因分析·功能</label><textarea id="n-bad_function" rows="2" placeholder="可选，功能异常描述"></textarea></div>'
    + '<div class="n-new-field"><label>不良原因分析·尺寸</label><textarea id="n-bad_size" rows="2" placeholder="可选，尺寸超差描述"></textarea></div>'
    + '<div class="n-new-field"><label>不良原因分析·设变</label><textarea id="n-bad_change" rows="2" placeholder="可选，设变描述"></textarea></div>'
    + '<div class="n-new-field"><label>不良原因分析·其他</label><textarea id="n-bad_other" rows="2" placeholder="可选"></textarea></div>'
    + '</div>'
    + '</div>'
    + '<div class="n-new-sec">附件</div>'
    + '<div class="n-new-files">'
    + '<input type="file" class="ctl-file-input" id="n-files" multiple onchange="ctlNewFilesInfo()" />'
    + '<span id="n-files-info" class="muted">支持图片/PDF/Office/压缩包/图纸，单个≤10MB，创建后自动上传</span>'
    + '</div>'
    + '<div class="nf-actions">'
    + '<span id="n-msg" class="muted"></span>'
    + '<fluent-button id="n-submit" appearance="accent" onclick="submitNewOrder()">创建管制申请</fluent-button>'
    + '</div></div>';
}

// 防重复提交：连续点击确认只会创建一次（提交中禁用按钮 + 标志位拦截）
var _ctlNewSubmitting = false;
async function submitNewOrder() {
  if (_ctlNewSubmitting) return;
  _ctlNewSubmitting = true;
  var btn = $('#n-submit');
  if (btn) btn.disabled = true;
  var msg = $('#n-msg');
  if (msg) msg.textContent = '';
  try {
    var payload = {
      part_no: $('#n-part_no').value,
      part_name: $('#n-part_name').value,
      sales_no: $('#n-sales_no').value,
      model: $('#n-model').value,
      qty: Number($('#n-qty').value),
      bad_type: $('#n-bad_type').value,
      reason: $('#n-reason').value,
      spray_date: $('#n-spray_date').value,
      customer: $('#n-customer').value,
      bad_appearance: $('#n-bad_appearance').value,
      bad_function: $('#n-bad_function').value,
      bad_size: $('#n-bad_size').value,
      bad_change: $('#n-bad_change').value,
      bad_other: $('#n-bad_other').value,
      apply_dept: $('#n-apply_dept').value
    };
    var err = ctlValidateNew(payload);
    if (err) throw new Error(err);
    var s = await api('POST', '/api/control/orders', payload);
    // 创建成功后，上传所选附件（如有）。附件上传失败不影响建单成功。
    var filesInput = $('#n-files');
    if (filesInput && filesInput.files && filesInput.files.length) {
      var r = await ctlUploadOrderFiles(s.id, filesInput.files);
      if (r.fail) toast('已上传 ' + r.ok + ' 个附件，失败 ' + r.fail + ' 个', 'warn');
    }
    toast('已创建管制申请单 ' + (s.order_no || ''), 'ok');
    location.hash = '#/detail?id=' + s.id;
  } catch (e) {
    if (msg) msg.textContent = e.message;
  } finally {
    _ctlNewSubmitting = false;
    if (btn) btn.disabled = false;
  }
}

/** 客户端校验（与后端一致），返回错误文案或空串 */
function ctlValidateNew(p) {
  if (!p.part_no) return '请填写料号';
  if (!p.part_name) return '请填写品名';
  if (!p.qty || p.qty <= 0) return '请填写有效数量';
  if (!p.bad_type) return '请选择不良类型';
  if (!p.reason) return '请填写管制/不良原因';
  return '';
}


/* --- subsystems/control/frontend/js/views/ncr-tab.js --- */
// subsystems/control/frontend/js/views/ncr-tab.js — 不良品委托单明细「可展开记录卡」
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.2
// 数据源：_ctlDetailAgg.ncrLogs（每条含 ncr_no/inspect_dept/handle_dept/form_template/created_by_name/created_at）
// 展示：<details>/<summary> 展开卡，呈现比纯表格更全的字段；创建人姓名来自后端 users 左连返回的 created_by_name
function renderNcrTab(rows) {
  if (!rows || !rows.length) return '<div class="empty">暂无不良品委托单</div>';
  return '<div class="ncr-list">' + rows.map(function (n) {
    return '<details class="ncr-item"><summary>'
      + '<span class="ncr-no mono">' + e(n.ncr_no || '—') + '</span>'
      + '<span class="ncr-route">' + e(n.inspect_dept || '—') + ' → ' + e(n.handle_dept || '—') + '</span>'
      + '<span class="ncr-time mono">' + fmtTime(n.created_at) + '</span></summary>'
      + '<div class="ncr-detail field-grid">'
      + '<span class="label">委托单号</span><span>' + e(n.ncr_no || '—') + '</span>'
      + '<span class="label">检验部门</span><span>' + e(n.inspect_dept || '—') + '</span>'
      + '<span class="label">处理部门</span><span>' + e(n.handle_dept || '—') + '</span>'
      + '<span class="label">表单版本</span><span>' + e(n.form_template || '—') + '</span>'
      + '<span class="label">创建人</span><span>' + e(n.created_by_name || '—') + '</span>'
      + '<span class="label">创建时间</span><span>' + fmtTime(n.created_at) + '</span>'
      + '</div>'
      + '<div class="ncr-foot"><a href="#/ncr?ncr_no=' + encodeURIComponent(n.ncr_no || '') + '">在委托单列表查看</a></div>'
      + '</details>';
  }).join('') + '</div>';
}

/** 定位并展开/高亮目标委托单卡（聚合页行点击跳详情 focusNcr 用）：命中返回 true，并滚动到可视区 */
function ctlFocusNcrCard(ncrNo) {
  if (!ncrNo) return false;
  var target = null;
  document.querySelectorAll('#ctl-tab-body .ncr-item').forEach(function (d) {
    var no = d.querySelector('.ncr-no');
    var hit = no && no.textContent.trim() === String(ncrNo);
    d.classList.toggle('ncr-focus', !!hit);
    if (hit) { d.open = true; target = d; }
  });
  if (target && target.scrollIntoView) { try { target.scrollIntoView({ block: 'center' }); } catch (e) {} }
  return !!target;
}


/* --- subsystems/control/frontend/js/views/ncr-list.js --- */
// subsystems/control/frontend/js/views/ncr-list.js — 不良品委托单(NCR) 聚合列表
// 权威依据：docs/superpowers/specs/2026-08-26-control-ncr-interaction-design.md §3.2
// 数据源：GET /api/control/ncrs（跨单聚合，登录即可）；行点击回跳所属管制单详情并定位该张 NCR。
// 能力：筛选（单号/所属管制单/检验部门/处理部门/创建人/日期区间）+ 分页 + 导出 CSV（AGENTS.md §21）。

var _ncrPager = { limit: 20, offset: 0, total: 0 };
var _ncrQuery = { ncr_no: '', order_no: '', inspect_dept: '', handle_dept: '', created_by_name: '', date_from: '', date_to: '' };

async function renderNcrList() {
  var view = $('#view');
  // 详情卡「在委托单列表查看」跳来：用路由预填委托单号筛选
  if (currentNcrNoFilter) _ncrQuery.ncr_no = currentNcrNoFilter;
  view.innerHTML = ncrFilterHtml() + '<div id="ncr-sheet" class="ctl-sheet"></div>';
  $('#ncr-field-ncr_no').value = _ncrQuery.ncr_no;
  $('#ncr-field-order_no').value = _ncrQuery.order_no;
  $('#ncr-field-inspect_dept').value = _ncrQuery.inspect_dept;
  $('#ncr-field-handle_dept').value = _ncrQuery.handle_dept;
  $('#ncr-field-created_by_name').value = _ncrQuery.created_by_name;
  $('#ncr-field-date_from').value = _ncrQuery.date_from;
  $('#ncr-field-date_to').value = _ncrQuery.date_to;
  await ncrFetchList(0);
}

function ncrFilterHtml() {
  var deptOpts = function (label) {
    return '<option value="">' + label + '</option>' + CONTROL_DEPTS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
  };
  return '<div class="filters"><div class="filter-row">'
    + '<input id="ncr-field-ncr_no" class="input" placeholder="委托单号" />'
    + '<input id="ncr-field-order_no" class="input" placeholder="所属管制单" />'
    + '<select id="ncr-field-inspect_dept" class="input">' + deptOpts('检验部门') + '</select>'
    + '<select id="ncr-field-handle_dept" class="input">' + deptOpts('处理部门') + '</select>'
    + '<input id="ncr-field-created_by_name" class="input" placeholder="创建人" />'
    + '<input id="ncr-field-date_from" class="input" type="date" title="创建起始" />'
    + '<input id="ncr-field-date_to" class="input" type="date" title="创建截止" />'
    + '<button class="btn primary" onclick="ncrFetchList(0)">查询</button>'
    + '<button class="btn" onclick="ncrResetFilter()">清除</button>'
    + '<button class="btn" onclick="exportNcrCsv()">导出 CSV</button>'
    + '</div></div>';
}

/** 收集当前筛选到 _ncrQuery */
function ncrCollectQuery() {
  _ncrQuery.ncr_no = $('#ncr-field-ncr_no').value.trim();
  _ncrQuery.order_no = $('#ncr-field-order_no').value.trim();
  _ncrQuery.inspect_dept = $('#ncr-field-inspect_dept').value;
  _ncrQuery.handle_dept = $('#ncr-field-handle_dept').value;
  _ncrQuery.created_by_name = $('#ncr-field-created_by_name').value.trim();
  _ncrQuery.date_from = $('#ncr-field-date_from').value;
  _ncrQuery.date_to = $('#ncr-field-date_to').value;
}

/** 拼筛选 query string（空项过滤） */
function ncrQueryString() {
  var q = [];
  var map = _ncrQuery;
  for (var k in map) { if (map[k] !== '' && map[k] != null) q.push(k + '=' + encodeURIComponent(map[k])); }
  return q.length ? '&' + q.join('&') : '';
}

/** 拉取并渲染当前页（page 0 基） */
async function ncrFetchList(page) {
  ncrCollectQuery();
  var limit = _ncrPager.limit;
  var offset = Math.max(0, page) * limit;
  var url = '/api/control/ncrs?limit=' + limit + '&offset=' + offset + ncrQueryString();
  try {
    var res = await api('GET', url);
    _ncrPager.offset = offset;
    _ncrPager.total = res.total || 0;
    ncrRenderSheet(res.ncrs || [], Math.max(0, page));
  } catch (err) {
    $('#ncr-sheet').innerHTML = '<div class="empty">列表加载失败：' + e(err.message) + '</div>';
  }
}

/** 渲染表格 + 分页 */
function ncrRenderSheet(rows, page) {
  var total = _ncrPager.total;
  var sheet = $('#ncr-sheet');
  if (!rows.length) { sheet.innerHTML = '<div class="empty">暂无数据</div>'; return; }
  var body = rows.map(function (n) {
    var od = n.order_no || '';
    var go = n.order_id ? "location.hash='#/detail?id=" + n.order_id + "&focusNcr=" + encodeURIComponent(n.ncr_no || '') + "'" : 'null';
    return '<tr class="row-click" onclick="' + go + '">'
      + '<td class="mono">' + e(n.ncr_no || '—') + '</td><td class="mono">' + e(od || '—') + '</td>'
      + '<td>' + e(n.part_no || '—') + '</td><td>' + e(n.part_name || '—') + '</td>'
      + '<td>' + (n.status ? '<span class="badge b-' + n.status + '">' + (CONTROL_STATUS_CN[n.status] || n.status) + '</span>' : '—') + '</td>'
      + '<td>' + e(n.inspect_dept || '—') + '</td><td>' + e(n.handle_dept || '—') + '</td>'
      + '<td class="muted">' + e(n.form_template || '—') + '</td><td>' + e(n.created_by_name || '—') + '</td>'
      + '<td class="mono">' + fmtTime(n.created_at) + '</td></tr>';
  }).join('');
  var maxPage = Math.max(0, Math.ceil(total / _ncrPager.limit) - 1);
  var pager = '<div class="pager"><span class="muted">共 ' + total + ' 条</span>'
    + '<button class="btn" ' + (page <= 0 ? 'disabled' : '') + ' onclick="ncrFetchList(' + (page - 1) + ')">上一页</button>'
    + '<span>' + (page + 1) + '/' + (maxPage + 1) + '</span>'
    + '<button class="btn" ' + (page >= maxPage ? 'disabled' : '') + ' onclick="ncrFetchList(' + (page + 1) + ')">下一页</button></div>';
  sheet.innerHTML = '<table class="grid"><thead><tr>'
    + '<th>委托单号</th><th>所属管制单</th><th>料号</th><th>品名</th><th>状态</th><th>检验部门</th><th>处理部门</th><th>表单版本</th><th>创建人</th><th>创建时间</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table>' + pager;
}

/** 导出 CSV：复用当前筛选，忽略分页（location.href 触发下载） */
function exportNcrCsv() {
  ncrCollectQuery();
  location.href = '/api/control/ncrs/export?' + ncrQueryString().replace(/^&/, '');
}

/** 清除筛选并回第一页 */
function ncrResetFilter() {
  _ncrQuery = { ncr_no: '', order_no: '', inspect_dept: '', handle_dept: '', created_by_name: '', date_from: '', date_to: '' };
  renderNcrList();
}


/* --- subsystems/control/frontend/js/views/ncr-form.js --- */
// subsystems/control/frontend/js/views/ncr-form.js — NCR 详细内容：流转需填字段 + 必填校验（纯逻辑，供 detail.js 引用）
// 拆分目的：detail.js 已 287 行超 70% 红线(280)，将「流转额外字段定义 + DISPATCH 必填校验」抽离至此。
// 约定：detail.js 的 _ctlUtil.fieldHtml 会按 f.type 渲染 textarea；_ctlSubmit 提交前调 ncrRequiredCheck。

// 需要额外字段输入的流转 action（其余流转仅确认即提交）
// 变更：START 不再收集 rework_sop（已在 DISPATCH 会签时登记）；新增 DISPATCH 收集重工/全检标准
var _CTL_TRANS_FIELDS = {
  STORE: [{ k: 'storage_location', label: '管制仓储位' }],
  CREATE_NCR: [{ k: 'ncr_no', label: '不良品委托单号' }],
  DISPOSAL_OK: [{ k: 'disposal_opinion', label: '处理方式结论' }],
  START: [{ k: 'rework_no', label: '重工工单号' }],
  DISPATCH: [
    { k: 'rework_sop', label: '重工 SOP', type: 'textarea', required: true },
    { k: 'rework_guide', label: '现场指导' },
    { k: 'rework_other', label: '其他标准文件' },
    { k: 'pack_sop', label: '包装SOP编号' }
  ]
};

/**
 * 处理方式会签(DISPATCH)必填校验：SOP 必填 + 现场指导/其他标准文件至少一项。
 * 与后端 routes-orders.js §8.3 校验口径一致。
 * @param {string} action 流转 action
 * @param {Object} body 已收集的字段对象
 * @returns {string} 错误文案（合法返回空串）
 */
function ncrRequiredCheck(action, body) {
  if (action !== 'DISPATCH') return '';
  var sop = (body.rework_sop || '').trim();
  var guide = (body.rework_guide || '').trim();
  var other = (body.rework_other || '').trim();
  if (!sop) return '处理方式会签前必须填写重工/全检标准：重工SOP';
  if (!guide && !other) return '处理方式会签前必须填写重工/全检标准：现场指导或标准文件至少填一项';
  return '';
}


/* --- subsystems/control/frontend/js/views/ncr-form-view.js --- */
// subsystems/control/frontend/js/views/ncr-form-view.js — 不良品委托单电子表单视图
// 按 Word 表单 GYS-Q2-008_01(REV_1) 栏位渲染单张可打印表单，绑定详情页「电子表单」Tab。
// 数据源：_ctlDetailAgg（主单 + ncrLogs + reworkLogs，仅在 detail.js 生命周期内调用）。
// 无数据时渲染「暂无电子表单数据」占位；使用全局 e / fmtTime。

function renderNcrFormTab() {
  var agg = _ctlDetailAgg;
  if (!agg || !agg.order) return '<div class="empty">暂无电子表单数据</div>';
  var o = agg.order;

  // 报工子表最新一条（id 最大）作为处理结果；无则回退主表 good/ng/scrap
  var rl = null;
  (agg.reworkLogs || []).forEach(function (r) { if (!rl || r.id > rl.id) rl = r; });
  // NCR 子表最新一条作为签核部门；无则空
  var nl = null;
  (agg.ncrLogs || []).forEach(function (n) { if (!nl || n.id > nl.id) nl = n; });

  var good = rl ? rl.good_qty : o.good_qty;
  var ng = rl ? rl.ng_qty : o.ng_qty;
  var scrap = rl ? rl.scrap_qty : o.scrap_qty;
  var batch = rl ? rl.batch_no : '';
  var packRec = rl ? rl.pack_record : '';
  var confirmBy = rl ? rl.confirm_by : '';
  var qtyOk = rl ? (rl.qty_consistent ? '是' : '否') : '';

  function fv(v) { return v == null || v === '' ? '—' : e(String(v)); }
  function row4(cells) { return '<div class="ncr-row ncr-c4">' + cells.join('') + '</div>'; }
  function cell(label, val) { return '<div class="ncr-cell"><span class="ncr-f">' + label + '</span><span class="ncr-v">' + val + '</span></div>'; }

  var html = '<div class="ctl-ncr-form">'
    + '<div class="ncr-toolbar"><button class="btn primary" onclick="window.print()">打印</button></div>'
    + '<div class="ncr-head"><div class="ncr-title">不良品委托检验单</div><div class="ncr-no">表单编号：GYS-Q2-008_01 REV_1</div></div>'
    // 基本信息
    + '<div class="ncr-sec">基本信息</div>'
    + row4([cell('销货单号', fv(o.sales_no)), cell('料号', fv(o.part_no)), cell('品名', fv(o.part_name)), cell('机种', fv(o.model))])
    + row4([cell('客户', fv(o.customer)), cell('喷码日期', fv(o.spray_date)), cell('数量', fv(o.qty)), cell('不良类型', fv(o.bad_type))])
    // 不良原因分析
    + '<div class="ncr-sec">不良原因分析</div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">管制/不良原因</span><span class="ncr-v">' + fv(o.reason) + '</span></div>'
    + row4([cell('外观', fv(o.bad_appearance)), cell('功能', fv(o.bad_function)), cell('尺寸', fv(o.bad_size))])
    + row4([cell('设变', fv(o.bad_change)), cell('其他', fv(o.bad_other))])
    // 解决方案
    + '<div class="ncr-sec">解决方案（处理方式）</div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">处理方式结论</span><span class="ncr-v">' + fv(o.disposal_opinion) + '</span></div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">包装SOP编号</span><span class="ncr-v">' + fv(o.pack_sop) + '</span></div>'
    // 重工/全检标准
    + '<div class="ncr-sec">重工/全检标准文件</div>'
    + '<div class="ncr-row ncr-full"><span class="ncr-f">重工SOP</span><span class="ncr-v">' + fv(o.rework_sop) + '</span></div>'
    + row4([cell('现场指导', fv(o.rework_guide)), cell('其他标准文件', fv(o.rework_other))])
    // 处理结果
    + '<div class="ncr-sec">处理结果</div>'
    + row4([cell('全检/重工数量', fv(qtyOf(agg))), cell('不良品数', fv(ng)), cell('合格品数', fv(good)), cell('报废数', fv(scrap))])
    + '<div class="ncr-row ncr-full"><span class="ncr-f">批次号</span><span class="ncr-v">' + fv(batch) + '</span></div>'
    + row4([cell('包装称重记录', fv(packRec)), cell('确认人', fv(confirmBy)), cell('确认数量是否一致', fv(qtyOk))])
    // 签署栏
    + '<div class="ncr-sec">签署栏</div>'
    + row4([cell('检验部门', fv(nl ? nl.inspect_dept : '')), cell('处理部门', fv(nl ? nl.handle_dept : '')), cell('委托部门', fv(o.apply_dept)), cell('经办', fv(o.applicant_name))])
    + '</div>';

  return html;
}

// 处理结果「全检/重工数量」：报工子表为空时回退主表数量
function qtyOf(agg) {
  var o = agg.order || {};
  var rl = (agg.reworkLogs || [])[0];
  if (rl) return (Number(rl.good_qty || 0) + Number(rl.ng_qty || 0) + Number(rl.scrap_qty || 0));
  return Number(o.qty || 0);
}


/* --- subsystems/control/frontend/js/views/detail-card.js --- */
// subsystems/control/frontend/js/views/detail-card.js — 管制单详情·数据入口与主卡渲染
// 数据：GET /api/control/orders/:id 返回「主单字段平铺 + signs + ncrLogs + reworkLogs + logs」。
// 注意：progress.js 的 controlRenderProgress/controlRenderStageCards 期望 agg = { order, signs, ncrLogs, reworkLogs }，
// 故此处将平铺响应再包一层 order（复用 progress 派生逻辑，勿重复实现）。
// 职责：详情加载（renderDetail）+ 主单字段卡/11步进度/5阶段卡/操作按钮渲染。
// 拆分来源：原 detail.js（主卡与入口部分）；Tab 相关见 detail-tabs.js，模态提交见 detail-modal.js。

var _ctlDetailId = null;      // 当前详情单 id
var _ctlDetailTab = 'sign';   // 当前 Tab：sign/ncr/rework/logs/form
var _ctlDetail = null;        // 详情平铺响应
var _ctlDetailAgg = null;     // 包装后的聚合 { order, signs, ncrLogs, reworkLogs }
var _ctlModal = { kind: null, action: null, node: null }; // 当前模态上下文
// 方案 D：已开委托单的后续阶段，详情页默认定位「电子表单」Tab；其余默认「会签闸口」
var _CTL_FORM_STATES = ['NCR_DONE', 'DISPOSAL_SIGNING', 'REWORK_OPENED', 'REWORKING', 'REWORK_REPORTED', 'REIN_STOCK', 'SHIPPED'];

async function renderDetail(id) {
  var view = $('#view');
  var oid = Number(id) || Number(currentControlId);
  if (!oid) { view.innerHTML = '<div class="empty"><p>请先从管制单列表选择一张单据</p><button class="btn primary" onclick="location.hash=\'#/orders\'">去管制单列表</button></div>'; return; }
  _ctlDetailId = oid;
  view.innerHTML = '<div class="empty">加载中...</div>';
  try {
    var res = await api('GET', '/api/control/orders/' + oid);
    _ctlDetail = res;
    renderDetailBody();
  } catch (err) {
    view.innerHTML = '<div class="empty">详情加载失败：' + e(err.message) + '</div>';
  }
}

function renderDetailBody() {
  var o = _ctlDetail, view = $('#view');
  if (!o) return;
  // 方案 D：按状态自动定位 Tab —— 已开委托单的后续阶段默认「电子表单」，其余默认「会签闸口」
  _ctlDetailTab = (_CTL_FORM_STATES.indexOf(o.status) >= 0) ? 'form' : 'sign';
  _ctlDetailAgg = { order: o, signs: o.signs || [], ncrLogs: o.ncrLogs || [], reworkLogs: o.reworkLogs || [] };
  view.innerHTML = ctlCardHtml(_ctlDetailAgg)
    + '<div class="ctl-sec">明细记录</div><div class="card">'
    + '<div class="detail-tabs" id="ctl-tabbar">' + ctlTabBarHTML() + '</div>'
    + '<div id="ctl-tab-body"></div></div>';
  ctlRenderTab();
  // 从聚合页行跳来：自动切到「不良品委托单」Tab 并展开高亮目标卡（极小接线）
  if (currentFocusNcr) { ctlSwitchTab('ncr'); ctlFocusNcrCard(currentFocusNcr); }
}

/** 主单字段分组卡片网格（仿样品/治具 overview-cards，横向铺满） */
function ctlFieldGrid(o) {
  var groups = [
    ['基本信息', [
      ['料号', o.part_no], ['品名', o.part_name], ['机型', o.model], ['数量', o.qty],
      ['喷码日期', o.spray_date], ['不良类型', o.bad_type], ['申请部门', o.apply_dept],
      ['申请人', o.applicant_name], ['申请时间', fmtTime(o.apply_at)]
    ]],
    ['管制信息', [
      ['管制标签号', o.label_no], ['储位', o.storage_location], ['委托单号', o.ncr_no],
      ['处理方式', o.disposal_opinion], ['重工工单号', o.rework_no],
      ['重工SOP', o.rework_sop], ['现场指导', o.rework_guide], ['其他标准', o.rework_other]
    ]],
    ['执行结果', [
      ['良品数', o.good_qty], ['不良数', o.ng_qty], ['报废数', o.scrap_qty],
      ['结余数', controlCalcRemain(o.qty, o.good_qty, o.ng_qty, o.scrap_qty)]
    ]],
    ['备注', [['管制原因', o.reason]]]
  ];
  return '<div class="overview-cards">' + groups.map(function (g) {
    return '<div class="overview-card' + (g[0] === '备注' ? ' full' : '') + '"><div class="title">' + g[0]
      + '</div><div class="field-grid">' + g[1].map(function (f) { return _ctlUtil.kv(f[0], f[1]); }).join('') + '</div></div>';
  }).join('') + '</div>';
}

/** 主卡：单号/状态 + 字段 + 11步进度 + 5阶段卡 + 操作按钮 */
function ctlCardHtml(agg) {
  var o = agg.order;
  return '<div class="card"><div class="ctl-carat"><span class="mono">' + e(o.order_no) + '</span> '
    + statusBadge(o) + '</div>' + ctlFieldGrid(o)
    + '<div class="ctl-sec">流程进度</div>' + controlRenderProgress(agg)
    + '<div class="ctl-sec">阶段</div><div class="ctl-stage-grid">' + controlRenderStageCards(agg) + '</div>'
    + '<div class="ctl-sec">操作</div><div class="ctl-actions">' + ctlActionButtons(o) + '</div></div>';
}

/** 可执行流转按钮（含作废，仅 ADMIN），点击统一走 ctlOpen('trans'/'void') */
function ctlActionButtons(o) {
  var ts = controlTransitionsOf(o.status, me.role);
  var btns = ts.map(function (t) {
    return '<button class="btn primary" onclick="ctlOpen(\'trans\',\'' + t.action + '\')">' + e(t.label) + '</button>';
  }).join('');
  if (me.role === 'ADMIN' && o.status !== 'SHIPPED' && o.status !== 'RETIRED') {
    btns += '<button class="btn danger" onclick="ctlOpen(\'void\')">作废</button>';
  }
  return btns || '<span class="muted">当前状态/角色无可执行操作</span>';
}


/* --- subsystems/control/frontend/js/views/detail-tabs.js --- */
// subsystems/control/frontend/js/views/detail-tabs.js — 管制单详情·明细 Tab 渲染与切换
// 职责：Tab 栏（会签闸口/不良品委托单/报工/操作日志/电子表单）渲染、Tab 内容渲染与切换。
// 数据源：_ctlDetailAgg（signs/ncrLogs/reworkLogs）与 _ctlDetail.logs；
//         会签/流转/追加委托单/报工/作废统一经 detail-modal.js 的 ctlOpen→ctlSubmit 提交。
// 拆分来源：原 detail.js（_ctlTabSheet + ctlTabBarHTML + ctlRenderTab + ctlSwitchTab）。

// 各明细 Tab 渲染函数（sign/ncr/rework/logs/form）
var _ctlTabSheet = {
  sign: function () {
    return CONTROL_SIGN_NODES.map(function (node) {
      var nodeSigns = (_ctlDetailAgg.signs || []).filter(function (s) { return s.node_key === node.node_key; });
      var steps = node.steps.map(function (st) {
        var rec = nodeSigns.find(function (s) { return s.seq === st.seq; });
        return '<div class="ctl-sign"><span class="sign-seq">' + st.seq + '</span>'
          + '<span class="sign-name">' + st.dept + '</span><span class="sign-dept">(' + st.role + ')</span>'
          + (rec ? _ctlUtil.signState(rec) : '<span class="sign-state muted">待签</span>') + '</div>';
      }).join('');
      var btn = _ctlUtil.canSign(node) ? '<button class="btn primary" onclick="ctlOpen(\'sign\',\'' + node.node_key + '\')">去会签</button>' : '';
      return '<div class="ctl-sec">' + node.node_name + '</div><div class="card">' + steps
        + (btn ? '<div style="margin-top:10px">' + btn + '</div>' : '') + '</div>';
    }).join('');
  },
  ncr: function () {
    return renderNcrTab((_ctlDetailAgg && _ctlDetailAgg.ncrLogs) || []);
  },
  rework: function () {
    var rows = _ctlDetailAgg.reworkLogs || [];
    if (!rows.length) return '<div class="empty">暂无报工记录</div>';
    return '<table class="grid"><thead><tr><th>报工日期</th><th>良品</th><th>不良</th><th>报废</th><th>报废原因</th><th>批次号</th><th>包装称重</th><th>确认人</th><th>数量一致</th><th>操作人</th></tr></thead><tbody>'
      + rows.map(function (r) {
        return '<tr><td class="mono">' + fmtTime(r.work_date) + '</td><td>' + (r.good_qty || 0) + '</td>'
          + '<td>' + (r.ng_qty || 0) + '</td><td>' + (r.scrap_qty || 0) + '</td>'
          + '<td class="muted">' + e(r.scrap_reason || '—') + '</td>'
          + '<td class="muted">' + e(r.batch_no || '—') + '</td><td class="muted">' + e(r.pack_record || '—') + '</td>'
          + '<td class="muted">' + e(r.confirm_by || '—') + '</td><td>' + (r.qty_consistent ? '是' : '否') + '</td>'
          + '<td>' + e(r.operator_name || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  },
  logs: function () {
    var rows = (_ctlDetail && _ctlDetail.logs) || [];
    if (!rows.length) return '<div class="empty">暂无日志</div>';
    return '<table class="grid"><thead><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>备注</th></tr></thead><tbody>'
      + rows.map(function (l) {
        return '<tr><td class="mono">' + fmtTime(l.created_at) + '</td>'
          + '<td>' + e(CONTROL_ACTION_CN[l.action] || l.action) + '</td>'
          + '<td class="muted">' + e(l.role || '—') + '/' + e(l.dept || '—') + '</td>'
          + '<td class="muted">' + e(l.comment || '—') + '</td></tr>';
      }).join('') + '</tbody></table>';
  },
  form: function () {
    return renderNcrFormTab();
  }
};

function ctlTabBarHTML() {
  var tabs = [['sign', '会签闸口'], ['ncr', '不良品委托单'], ['rework', '报工'], ['logs', '操作日志'], ['form', '电子表单']];
  return tabs.map(function (t) {
    return '<div class="detail-tab ' + (_ctlDetailTab === t[0] ? 'active' : '') + '" onclick="ctlSwitchTab(\'' + t[0] + '\')">' + t[1] + '</div>';
  }).join('');
}

function ctlRenderTab() {
  var body = $('#ctl-tab-body');
  if (!body) return;
  var pad = _ctlDetailTab === 'sign' ? '' : '<div class="ctl-tab-pad">';
  body.innerHTML = pad + (_ctlTabSheet[_ctlDetailTab] ? _ctlTabSheet[_ctlDetailTab]() : '<div class="empty">无内容</div>') + (pad ? '</div>' : '');
}

function ctlSwitchTab(tab) {
  _ctlDetailTab = tab;
  var bar = $('#ctl-tabbar');
  if (bar) bar.innerHTML = ctlTabBarHTML();
  ctlRenderTab();
}


/* --- subsystems/control/frontend/js/views/files.js --- */
// subsystems/control/frontend/js/views/files.js — 管制单附件（文件/图片）前端模块
// 提供：上传（FormData）、列表、图片缩略图+新窗口预览、下载、删除。简化：不分类，统一为"附件"。
// api-base.js 的 api() 仅支持 JSON，此处附件上传走原生 fetch multipart。

/** 附件预览/下载 URL（后端 inline + Content-Type，图片浏览器原生预览） */
function ctlFileUrl(orderId, fileId) {
  return '/api/control/orders/' + orderId + '/files/' + fileId + '/download';
}

function ctlFileIcon(mimeType) {
  if (!mimeType) return '📎';
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType === 'application/pdf') return '📄';
  if (/dwg|cad|step|iges|stl|sla/i.test(mimeType)) return '✏️';
  if (/zip|rar|compress/i.test(mimeType)) return '📦';
  return '📎';
}

function ctlFormatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

/** 上传单文件到指定管制单 */
async function ctlUploadOrderFile(orderId, file) {
  var formData = new FormData();
  formData.append('file', file);
  var resp = await fetch('/api/control/orders/' + orderId + '/files', { method: 'POST', body: formData, credentials: 'same-origin' });
  if (!resp.ok) {
    var err = await resp.json().catch(function () { return { error: '上传失败' }; });
    throw new Error(err.error || '上传失败');
  }
  return resp.json();
}

/** 批量上传（新建页提交成功后调用）：逐个上传，返回成功/失败计数 */
async function ctlUploadOrderFiles(orderId, fileList) {
  var files = Array.prototype.slice.call(fileList || []);
  if (!files.length) return { ok: 0, fail: 0 };
  var ok = 0, fail = 0;
  for (var i = 0; i < files.length; i++) {
    try { await ctlUploadOrderFile(orderId, files[i]); ok++; }
    catch (e) { fail++; }
  }
  return { ok: ok, fail: fail };
}

/** 删除附件 */
async function ctlDeleteOrderFile(orderId, fileId) {
  return await api('DELETE', '/api/control/orders/' + orderId + '/files/' + fileId);
}

/** 加载附件列表并渲染到容器（详情页）；容器 id 由调用方传 #ctl-files */
async function ctlLoadOrderFiles(orderId) {
  var el = document.getElementById('ctl-files-list');
  if (!el) return;
  try {
    var files = await api('GET', '/api/control/orders/' + orderId + '/files');
    if (!files || !files.length) {
      el.innerHTML = '<span class="muted">暂无附件，点击上方选择文件上传</span>';
      return;
    }
    el.innerHTML = files.map(function (f) { return ctlFileItemHtml(orderId, f); }).join('');
  } catch (e) {
    el.innerHTML = '<span style="color:var(--bad)">附件加载失败</span>';
  }
}

/** 单条附件渲染：图片缩略图 + 预览/下载/删除 */
function ctlFileItemHtml(orderId, f) {
  var isImage = f.mime_type && f.mime_type.startsWith('image/');
  var html = '<div class="ctl-file-item">';
  if (isImage) {
    html += '<img class="ctl-file-thumb" src="' + ctlFileUrl(orderId, f.id) + '" alt="" onclick="ctlPreviewOrderFile(' + orderId + ',' + f.id + ',\'' + (f.mime_type || '') + '\')" />';
  } else {
    html += '<span class="ctl-file-icon">' + ctlFileIcon(f.mime_type) + '</span>';
  }
  html += '<span class="ctl-file-meta"><span class="ctl-file-name">' + e(f.original_name) + '</span>'
    + '<br><small class="muted">' + ctlFormatFileSize(f.file_size) + ' · ' + fmt(f.created_at) + '</small></span>';
  html += '<span class="ctl-file-ops">';
  if (isImage) {
    html += '<a class="link ctl-file-op" onclick="ctlPreviewOrderFile(' + orderId + ',' + f.id + ',\'' + (f.mime_type || '') + '\')">预览</a>';
  }
  html += '<a class="link ctl-file-op" href="' + ctlFileUrl(orderId, f.id) + '" download>下载</a>';
  html += '<a class="link ctl-file-op danger" onclick="ctlDeleteOrderFilePrompt(' + orderId + ',' + f.id + ')">删除</a>';
  html += '</span></div>';
  return html;
}

/** 图片新窗口预览（用户确认：缩略图 + 新窗口预览） */
function ctlPreviewOrderFile(orderId, fileId, mimeType) {
  window.open(ctlFileUrl(orderId, fileId), '_blank');
}

/** 删除前置确认（避免误删），复用全局 confirm 弹窗 */
function ctlDeleteOrderFilePrompt(orderId, fileId) {
  if (!window.confirm('确定删除该附件？')) return;
  ctlDeleteOrderFile(orderId, fileId).then(function () {
    showToast('已删除');
    ctlLoadOrderFiles(orderId);
  }).catch(function (e) { showToast(e.message); });
}

/** 新建页「选择文件」后的提示文案 */
function ctlNewFilesInfo() {
  var input = document.getElementById('n-files');
  var el = document.getElementById('n-files-info');
  if (!input || !el) return;
  var n = input.files ? input.files.length : 0;
  el.textContent = n ? ('已选 ' + n + ' 个附件') : '';
}

/** 详情页附件区 HTML（新建页无需调用；供 renderDetailBody 直接拼接） */
function ctlFilesSectionHtml(orderId) {
  return '<div class="ctl-sec">附件</div><div class="card ctl-files-card">'
    + '<div class="ctl-files-toolbar">'
    + '<input type="file" class="ctl-file-input" id="ctl-file-input" multiple onchange="ctlDetailFilesSelected(' + orderId + ')" />'
    + '<span class="muted">支持图片/PDF/Office/压缩包/图纸，单个≤10MB</span>'
    + '</div>'
    + '<div id="ctl-files-list" class="ctl-files-list"></div></div>';
}

/** 详情页选择文件后上传并刷列表；禁用按钮防重复提交 */
var _ctlDetailUploading = false;
async function ctlDetailFilesSelected(orderId) {
  var input = document.getElementById('ctl-file-input');
  if (!input || !input.files || !input.files.length || _ctlDetailUploading) return;
  _ctlDetailUploading = true;
  try {
    var r = await ctlUploadOrderFiles(orderId, input.files);
    showToast(r.fail ? ('上传完成 ' + r.ok + ' 个，失败 ' + r.fail + ' 个') : ('已上传 ' + r.ok + ' 个附件'), r.fail ? 'warn' : 'ok');
    input.value = '';
    ctlLoadOrderFiles(orderId);
  } catch (e) {
    showToast(e.message);
  } finally {
    _ctlDetailUploading = false;
  }
}

// —— 详情页附件区注入 ——
// 说明：detail-card.js 的 renderDetailBody 由 www 属主持有、当前用户无写权限，
// 故在本模块（bundle 中位于 detail-card.js 之后加载）以「包裹原函数」方式追加附件区，
// 避免修改受保护文件。原函数每次重置 #view 后再追加一次，天然幂等。
var _ctlOrigRenderDetailBody = renderDetailBody;
renderDetailBody = function () {
  _ctlOrigRenderDetailBody();
  var view = $('#view');
  if (!view) return;
  if (view.querySelector('.ctl-files-card')) return; // 防御：防止重复追加
  view.insertAdjacentHTML('beforeend', ctlFilesSectionHtml(_ctlDetailId));
  ctlLoadOrderFiles(_ctlDetailId);
};


/* --- subsystems/control/frontend/js/views/detail-modal.js --- */
// subsystems/control/frontend/js/views/detail-modal.js — 管制单详情·操作模态与统一提交
// 职责：模态配置（_ctlUtil._modalCfg）、统一打开（_ctlOpen）、统一提交（_ctlSubmit，trans/sign/ncr/rework/void）。
// 流转 action 需要的额外字段定义与必填校验已抽离至 ncr-form.js（_CTL_TRANS_FIELDS + ncrRequiredCheck）。
// 拆分来源：原 detail.js（_ctlUtil + ctlOpen + ctlSubmit）。

// 模态/校验/渲染小工具集合（方法化以控制顶层函数数量 ≤10）
var _ctlUtil = {
  /** 指定流转 action 需要的额外字段数组 */
  transFields: function (action) { return _CTL_TRANS_FIELDS[action] || []; },
  /** 读取输入框值（不存在返回空串） */
  val: function (sel) { var el = $(sel); return el ? el.value : ''; },
  /** 表单字段输入 HTML（id = cf-<key>；type='textarea' 渲染多行） */
  fieldHtml: function (k, label, type) {
    if (type === 'textarea') return '<div><label>' + label + '</label><textarea id="cf-' + k + '" rows="2"></textarea></div>';
    return '<div><label>' + label + '</label><input id="cf-' + k + '" type="' + (type || 'text') + '"></div>';
  },
  /** 模态底部按钮：提交（品牌主色）+ 取消（中性描边灰色），统一 .btn 体系保证等高等对齐 */
  foot: function (kind) {
    return '<button class="btn" onclick="ctlSubmit(\'' + kind + '\')">提交</button>'
      + '<button class="btn cancel" onclick="closeModal(document.querySelector(\'.modal-mask\'))">取消</button>';
  },
  /** 会签记录状态标签 */
  signState: function (rec) {
    var map = { AGREE: ['会签通过', 'ok'], REJECT: ['退回', 'err'], SKIP: ['强制跳过', 'warn'] };
    var m = map[rec.decision] || ['待签', 'muted'];
    return '<span class="sign-state ' + m[1] + '">' + m[0] + (rec.signer_name ? ' · ' + rec.signer_name : '') + '</span>';
  },
  /** 当前角色是否可对某会签节点发起签字（预约节点 + 状态匹配 + 轮到本角色/管理员） */
  canSign: function (node) {
    var order = _ctlDetailAgg.order || {};
    if (!order || order.status !== node.trigger_status) return false;
    var signs = (_ctlDetailAgg.signs || []).filter(function (s) { return s.node_key === node.node_key; });
    for (var i = 0; i < node.steps.length; i++) {
      var st = node.steps[i];
      var rec = signs.find(function (s) { return s.seq === st.seq; });
      if (!rec || !rec.decision) return st.role === me.role || me.role === 'ADMIN';
      if (rec.decision !== 'AGREE') return false;
    }
    return false;
  },
  /** 打开操作模态的配置：head（标题）/body（表单）/foot（按钮），字段 id 与 ctlSubmit 一致 */
  modalCfg: function (kind, action) {
    if (kind === 'sign') {
      var node = CONTROL_SIGN_NODES.find(function (n) { return n.node_key === action; });
      var opts = '<option value="">请选择</option><option value="AGREE">同意</option><option value="REJECT">退回</option>'
        + (me.role === 'ADMIN' ? '<option value="SKIP">强制跳过(仅管理员)</option>' : '');
      return {
        head: '会签 · ' + (node ? node.node_name : action),
        body: '<div class="ctl-form-grid">'
          + '<div><label>会签决定</label><select id="cf-decision">' + opts + '</select></div>'
          + '<div class="nf-full"><label class="req">会签意见</label><textarea id="cf-comment" rows="2" placeholder="填写意见或原因"></textarea></div></div>',
        foot: _ctlUtil.foot('sign')
      };
    }
    if (kind === 'trans') {
      var fb = _ctlUtil.transFields(action).map(function (f) { return _ctlUtil.fieldHtml(f.k, f.label, f.type); }).join('');
      return {
        head: '确认操作 · ' + (CONTROL_ACTION_CN[action] || action),
        body: '<div class="ctl-form-grid">' + fb
          + '<div class="nf-full"><label>备注</label><textarea id="cf-comment" rows="2" placeholder="可选"></textarea></div></div>',
        foot: _ctlUtil.foot('trans')
      };
    }
    if (kind === 'ncr') {
      var deptOpts = CONTROL_DEPTS.map(function (d) { return '<option value="' + d + '">' + d + '</option>'; }).join('');
      return {
        head: '追加不良品委托单',
        body: '<div class="ctl-form-grid">'
          + '<div><label class="req">委托单号</label><input id="cf-ncr_no"></div>'
          + '<div><label>检验部门</label><select id="cf-inspect_dept"><option value="">请选择</option>' + deptOpts + '</select></div>'
          + '<div><label>处理部门</label><select id="cf-handle_dept"><option value="">请选择</option>' + deptOpts + '</select></div></div>',
        foot: _ctlUtil.foot('ncr')
      };
    }
    if (kind === 'rework') {
      return {
        head: '报工',
        body: '<div class="ctl-form-grid">'
          + '<div><label>良品数</label><input id="cf-good_qty" type="number" min="0"></div>'
          + '<div><label>不良数</label><input id="cf-ng_qty" type="number" min="0"></div>'
          + '<div><label>报废数</label><input id="cf-scrap_qty" type="number" min="0"></div>'
          + '<div><label>报废原因</label><input id="cf-scrap_reason"></div>'
          + '<div><label>批次号</label><input id="cf-batch_no" placeholder="可选"></div>'
          + '<div><label>包装称重记录</label><input id="cf-pack_record" placeholder="可选"></div>'
          + '<div><label>确认人</label><input id="cf-confirm_by" placeholder="可选"></div>'
          + '<div><label>数量一致</label><select id="cf-qty_consistent"><option value="0">否</option><option value="1">是</option></select></div></div>',
        foot: _ctlUtil.foot('rework')
      };
    }
    if (kind === 'void') {
      return {
        head: '作废管制单',
        body: '<div class="ctl-form-grid"><div class="nf-full"><label class="req">作废原因</label><textarea id="cf-comment" rows="2" placeholder="请说明作废原因"></textarea></div></div>',
        foot: _ctlUtil.foot('void')
      };
    }
    return { head: '操作', body: '', foot: '' };
  },
  /** 字段键值对（label auto + value 1fr，空值占位 —，转义） */
  kv: function (label, val) {
    return '<span class="label">' + label + '</span><span>' + (val == null || val === '' ? '—' : e(String(val))) + '</span>';
  }
};

/** 打开操作模态：trans 无字段时直接确认提交；有字段 / sign / ncr / rework / void 弹窗收集字段后 ctlSubmit */
function ctlOpen(kind, action) {
  _ctlModal = { kind: kind, action: kind === 'trans' ? action : null, node: kind === 'sign' ? action : null };
  if (kind === 'trans' && !_ctlUtil.transFields(action).length) {
    if (confirm('确认执行「' + (CONTROL_ACTION_CN[action] || action) + '」？')) ctlSubmit('trans');
    return;
  }
  var m = _ctlUtil.modalCfg(kind, action);
  var mask = openModal(m.head, m.body, { foot: m.foot });
  if (mask) mask.classList.add('ctl-modal');
}

/** 统一提交入口：按模态上下文读取字段并调用对应 API */
async function ctlSubmit(kind) {
  var m = _ctlModal || {};
  try {
    if (kind === 'trans') {
      var body = { comment: _ctlUtil.val('#cf-comment') || '' };
      _ctlUtil.transFields(m.action).forEach(function (f) { var v = _ctlUtil.val('#cf-' + f.k); if (v) body[f.k] = v; });
      var err = ncrRequiredCheck(m.action, body);
      if (err) { toast(err, 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/transition', Object.assign({ action: m.action }, body));
    } else if (kind === 'sign') {
      var decision = $('#cf-decision') ? $('#cf-decision').value : '';
      var c = _ctlUtil.val('#cf-comment');
      if (!decision) { toast('请先选择会签决定', 'err'); return; }
      if (!c.trim()) { toast('请填写会签意见', 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/sign', { node_key: m.node, decision: decision, comment: c });
    } else if (kind === 'ncr') {
      if (!_ctlUtil.val('#cf-ncr_no').trim()) { toast('请填写委托单号', 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/ncr', { ncr_no: _ctlUtil.val('#cf-ncr_no'), inspect_dept: _ctlUtil.val('#cf-inspect_dept'), handle_dept: _ctlUtil.val('#cf-handle_dept') });
    } else if (kind === 'rework') {
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/rework-log', { good_qty: Number(_ctlUtil.val('#cf-good_qty')) || 0, ng_qty: Number(_ctlUtil.val('#cf-ng_qty')) || 0, scrap_qty: Number(_ctlUtil.val('#cf-scrap_qty')) || 0, scrap_reason: _ctlUtil.val('#cf-scrap_reason'), batch_no: _ctlUtil.val('#cf-batch_no'), pack_record: _ctlUtil.val('#cf-pack_record'), confirm_by: _ctlUtil.val('#cf-confirm_by'), qty_consistent: $('#cf-qty_consistent') ? ($('#cf-qty_consistent').value === '1' ? 1 : 0) : 0 });
    } else if (kind === 'void') {
      if (!_ctlUtil.val('#cf-comment').trim()) { toast('请填写作废原因', 'err'); return; }
      await api('POST', '/api/control/orders/' + _ctlDetailId + '/void', { comment: _ctlUtil.val('#cf-comment') });
    }
    closeModal(document.querySelector('.modal-mask'));
    toast('操作成功', 'ok');
    var res = await api('GET', '/api/control/orders/' + _ctlDetailId);
    _ctlDetail = res;
    renderDetailBody();
  } catch (err) {
    toast('操作失败：' + err.message, 'err');
  }
}


/* --- subsystems/control/frontend/js/views/label.js --- */
// subsystems/control/frontend/js/views/label.js — 管制标签预览/打印/下载
// 数据：GET /api/control/orders/:id/label 返回可打印 HTML（预览不自动打印）；
//  /label/print 自动打印、/label/download 附件下载（仅 ADMIN/QA/RD）。
// 尺寸：PRESET_MM（constants/label.js）选择器 + controlCalcLabelRatio 做 contain 等比缩放预览框。
// 下载按钮仅对 ADMIN/QA/RD 渲染（与后端 assertDownloadRole 口径一致）。

function renderLabel(id) {
  var view = $('#view');
  var oid = Number(id) || Number(currentControlId);
  if (!oid) { view.innerHTML = '<div class="empty"><p>请先从管制单列表选择一张单据</p><button class="btn primary" onclick="location.hash=\'#/orders\'">去管制单列表</button></div>'; return; }
  var canDownload = ['ADMIN', 'QA', 'RD'].indexOf(me.role) > -1;
  var sizeOpts = ['<option value="">自动</option>'].concat(Object.keys(PRESET_MM).map(function (k) {
    return '<option value="' + PRESET_MM[k].key + '">' + PRESET_MM[k].label + '</option>';
  })).join('');
  view.innerHTML = '<div class="card"><div class="label-toolbar">'
    + '<label class="muted">标签纸 <select id="label-size" class="input" onchange="renderLabelPreview()">' + sizeOpts + '</select></label>'
    + '<span id="label-info" class="muted"></span>'
    + '<div class="label-tools">'
    + '<button class="btn primary" onclick="window.open(\'/api/control/orders/' + oid + '/label/print\')">打印</button>'
    + '<button class="btn" onclick="window.open(\'/api/control/orders/' + oid + '/label\')">新窗口预览</button>'
    + (canDownload ? '<button class="btn" onclick="window.open(\'/api/control/orders/' + oid + '/label/download\')">下载 HTML</button>' : '')
    + '</div></div>'
    + '<div class="label-stage">'
    + '<div class="label-swatch"><div id="label-box"></div><div id="label-box-label" class="muted"></div></div>'
    + '<iframe class="label-frame" id="label-frame" src="/api/control/orders/' + oid + '/label"></iframe>'
    + '</div></div>';
  renderLabelPreview();
}

/** 预览框随选中纸张尺寸 contain 缩放（1mm ≈ 3.78px，见 constants/label.js） */
function renderLabelPreview() {
  var key = $('#label-size').value;
  var info = $('#label-info'), box = $('#label-box'), tag = $('#label-box-label');
  if (!box) return;
  var preset = PRESET_MM[key];
  if (preset) {
    var r = controlCalcLabelRatio(preset.w, preset.h);
    box.style.width = r.width + 'px';
    box.style.height = r.height + 'px';
    if (info) info.textContent = preset.label;
    if (tag) tag.textContent = preset.w + '×' + preset.h + 'mm';
  } else {
    box.style.width = CONTOL_LABEL_BOX.w + 'px';
    box.style.height = CONTOL_LABEL_BOX.h + 'px';
    if (info) info.textContent = '自动（后端默认排版）';
    if (tag) tag.textContent = '预览';
  }
}


/* --- subsystems/control/frontend/js/views/logs.js --- */
// subsystems/control/frontend/js/views/logs.js — 管制操作日志（ADMIN 全量审计视图）
// 后端端点 GET /api/control/logs 已按日志条数分页返回（LEFT JOIN 主单带 order_no/part_name）。
// 仅 ADMIN 可进入（router.js NAV.roles=['ADMIN']），列表行按 created_at 倒序。

var _ctlLogPage = 0;        // 分页游标（0 基）
var _ctlLogPageSize = 50;   // 每页日志条数

async function renderLogs() {
  var view = $('#view');
  view.innerHTML = '<div class="muted">加载中…</div>';
  try {
    var res = await api('GET', '/api/control/logs?limit=' + _ctlLogPageSize + '&offset=' + (_ctlLogPage * _ctlLogPageSize));
    var items = (res && res.items) || [];
    renderLogsSheet(items, res.total || 0);
  } catch (err) {
    view.innerHTML = '<div class="empty">日志加载失败：' + e((err && err.message) || err) + '</div>';
  }
}

/** 渲染日志表格 + 分页 */
function renderLogsSheet(rows, total) {
  var view = $('#view');
  if (!rows.length) { view.innerHTML = '<div class="empty">暂无日志记录</div>'; return; }
  var body = rows.map(function (l) {
    return '<tr><td class="mono">' + fmtTime(l.created_at) + '</td>'
      + '<td class="mono">' + e(l.order_no || '—') + '</td>'
      + '<td>' + e(CONTROL_ACTION_CN[l.action] || l.action) + '</td>'
      + '<td class="muted">' + e(l.role || '—') + '/' + e(l.dept || '—') + '</td>'
      + '<td class="muted">' + e(l.comment || '—') + '</td></tr>';
  }).join('');
  var maxPage = Math.max(0, Math.ceil((total || 0) / _ctlLogPageSize) - 1);
  var pager = '<div class="pager"><span class="muted">共 ' + (total || 0) + ' 条</span>'
    + '<button class="btn" ' + (_ctlLogPage <= 0 ? 'disabled' : '') + ' onclick="ctlLogPage(' + (_ctlLogPage - 1) + ')">上一页</button>'
    + '<span>' + (_ctlLogPage + 1) + '/' + (maxPage + 1) + '</span>'
    + '<button class="btn" ' + (_ctlLogPage >= maxPage ? 'disabled' : '') + ' onclick="ctlLogPage(' + (_ctlLogPage + 1) + ')">下一页</button></div>';
  view.innerHTML = '<div class="card" style="padding:0"><table class="grid"><thead><tr>'
    + '<th>时间</th><th>管制单号</th><th>动作</th><th>角色/部门</th><th>备注</th>'
    + '</tr></thead><tbody>' + body + '</tbody></table></div>' + pager;
}

/** 分页翻页：更新游标后重刷 */
function ctlLogPage(page) {
  _ctlLogPage = Math.max(0, page);
  renderLogs();
}


/* --- subsystems/control/frontend/js/views/todo.js --- */
// subsystems/control/frontend/js/views/todo.js — 我的待办独立页
// 职责：加载当前角色的待办（待我流转 + 待我签核），独立页面展示，单击单据进详情。
// 复用 js/todo.js 的 ctlTodoOf / ctlTodoHtml 派生逻辑，与看板统计卡「待我签核/待我流转」联动。

async function renderTodo() {
  var view = $('#view');
  view.innerHTML = '<h3 class="ctl-sec">我的待办</h3><div class="ctl-todo" id="ctl-todo-body"><div class="empty">加载中…</div></div>';
  var body = $('#ctl-todo-body');
  try {
    var res = await api('GET', '/api/control/orders?limit=200');
    var orders = (res && res.orders) || [];
    body.innerHTML = ctlTodoHtml(orders, me.role);
  } catch (err) {
    body.innerHTML = '<div class="empty">待办加载失败：' + e(err.message) + '</div>';
  }
}


/* --- subsystems/control/frontend/js/router.js --- */
// subsystems/control/frontend/js/router.js — 管制子系统导航菜单与哈希路由
// NAV 与 manifest.navigation 保持一致（单一事实来源见 AGENTS.md §17.3）；
// route() 解析 #/dashboard、#/orders、#/detail?id=3、#/label?id=3，并把 id/status 写入全局供各视图读取。

var NAV = [
  { k: 'dashboard', t: '管制看板', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'todo', t: '我的待办', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'orders', t: '管制单列表', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'ncr', t: '不良品委托单', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'new', t: '新建管制申请', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'detail', t: '单据详情', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'label', t: '管制标签打印', roles: ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'] },
  { k: 'logs', t: '操作日志', roles: ['ADMIN'] }
];

var PAGE_TITLE = { dashboard: '管制看板', todo: '我的待办', orders: '管制单列表', ncr: '不良品委托单', new: '新建管制申请', detail: '单据详情', label: '管制标签打印', logs: '操作日志' };

// 路由参数：route() 哈希 query 解析后写入，供各视图读取
var currentControlId = null;
var currentStatusFilter = '';
var currentFocusNcr = '';   // 详情定位：聚合页行点击跳来，指示要展开高亮的委托单号
var currentNcrNoFilter = ''; // 聚合页预过滤：详情卡「在委托单列表查看」跳来时预填委托单号
var currentActiveFilter = false;  // 看板统计卡「进行中」联动筛选
var currentTodayFilter = false;   // 看板统计卡「今日新增」联动筛选
var currentOverdueFilter = false; // 看板统计卡「超期滞留」联动筛选

// 简易元素构造器（自包含，不依赖其它子系统的 helper）
function ctlEl(tag, cls, html) {
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

function buildNav() {
  var nav = $('#nav');
  if (!nav) return;
  nav.innerHTML = '';
  NAV.filter(function (n) { return n.roles.indexOf(me.role) > -1; }).forEach(function (n) {
    var b = ctlEl('button');
    b.textContent = n.t;
    b.onclick = function () { location.hash = '#/' + n.k; };
    b.dataset.k = n.k;
    nav.appendChild(b);
  });
}

function setActive(k) {
  document.querySelectorAll('#nav button').forEach(function (b) {
    b.classList.toggle('active', b.dataset.k === k);
  });
}

var VIEWS = {
  dashboard: renderDashboard, todo: renderTodo, orders: renderList, ncr: renderNcrList, new: renderNew,
  detail: renderDetail, label: renderLabel, logs: renderLogs
};

function route() {
  var hash = (location.hash.replace('#/', '') || 'dashboard');
  var parts = hash.split('?');
  var k = parts[0] || 'dashboard';
  var q = {};
  if (parts[1]) parts[1].split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[kv[0]] = decodeURIComponent(kv[1] || ''); });
  var navItem = NAV.find(function (n) { return n.k === k; });
  if (navItem && navItem.roles.indexOf(me.role) < 0) { location.hash = '#/dashboard'; return; }
  var view = VIEWS[k] || renderDashboard;
  setActive(k);
  $('#page-title').textContent = PAGE_TITLE[k] || (navItem ? navItem.t : '') || '';
  $('#page-actions').innerHTML = '';
  $('#view').innerHTML = '';
  currentControlId = q.id || null;
  currentStatusFilter = q.status || '';
  currentFocusNcr = q.focusNcr || '';
  currentNcrNoFilter = q.ncr_no || '';
  currentActiveFilter = q.active === '1' || q.active === 'true';
  currentTodayFilter = q.today === '1' || q.today === 'true';
  currentOverdueFilter = q.overdue === '1' || q.overdue === 'true';
  // 详情/标签打印需先选中单据；无 id 时引导去列表，避免「缺少单据编号」生硬报错
  if ((k === 'detail' || k === 'label') && !currentControlId) {
    toast('请先从管制单列表选择一张单据', 'info');
    location.hash = '#/orders';
    return;
  }
  if (k === 'detail' || k === 'label') { view(currentControlId); }
  else { view(); }
}


// bundle init
window.addEventListener('hashchange',route);boot('管制流程管理');
