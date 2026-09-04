/** BUNDLE vbmtmpf6rz — 26 files */
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
  NEW: '新建·待制作确认', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中',
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
  CUSTODY: '接收保管', CHECKOUT: '领出', RETURN_OUT: '归还入库', EDIT_CARD: '修正标示卡', EDIT_STORAGE: '修改储位',
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


/* --- shared/frontend/kb-stats.js --- */
// kb-stats.js — 看板统计卡共享渲染组件（kb-stat 视觉协议见 public/css/app.css L228-235）
// 单击/双击双语义协议（参数注入，各看板按需选用）：
//   click:'filter'   单击 toggle 筛选（调用方提供全局筛选函数名，如 filterKbStat/filterDashStats）
//                    可叠加 href → 双击跳列表（samples 双语义卡协议：单击筛选待办·双击查看列表）
//   click:'navigate' 单击直接 location.hash 跳转（projects 统计卡跳列表）
//   click:'none'     仅展示（纯统计卡）
// 首用顺序：projects（试点）→ fixtures → samples（deployed 等价迁移）。样式统一走 /css/app.css，本文件不写样式。
(function () {
  /**
   * 渲染统计卡组 innerHTML（不含 .kb-stats 网格外壳，配 wrap 使用）
   * @param {Array} cards 卡片配置数组：{ n:数量, l:标签, color:CSS色值, href:跳转hash(可选), title:悬浮提示(可选) }
   * @param {Object} opts { click:'filter'|'navigate'|'none', filterHandler:'全局函数名(filter模式必填)',
   *                        activeIndex:number|null 高亮卡索引（null/0 视语义由调用方决定） }
   * @returns {string} 卡组 HTML（调用方用 KbStats.wrap() 包裹或并入更大片段）
   */
  function render(cards, opts) {
    opts = opts || {};
    var click = opts.click || 'none';
    return (cards || []).map(function (cfg, idx) {
      var attrs = '';
      if (cfg.title) attrs += ' title="' + cfg.title + '"';
      if (click === 'filter' && opts.filterHandler)
        attrs += ' onclick="' + opts.filterHandler + '(' + idx + ',this)"';
      else if (click === 'navigate' && cfg.href)
        attrs += ' onclick="location.hash=\'' + cfg.href + '\'"';
      // 双击跳列表：仅 filter 模式且卡片配置 href 时叠加（与单击 toggle 自洽：双击前两次 click 恰好复位筛选）
      if (click === 'filter' && cfg.href)
        attrs += ' ondblclick="location.hash=\'' + cfg.href + '\'"';
      var cls = 'kb-stat' + (opts.activeIndex === idx ? ' active' : '');
      return '<fluent-card class="' + cls + '" style="--stat-color:' + (cfg.color || 'var(--brand)') + '"' + attrs +
        '><div class="n">' + cfg.n + '</div><div class="l">' + cfg.l + '</div></fluent-card>';
    }).join('');
  }

  /** 包裹 .kb-stats 网格外壳（grid 布局定义在 /css/app.css） */
  function wrap(inner) { return '<div class="kb-stats">' + inner + '</div>'; }

  /**
   * active 高亮管理：容器内第 idx 张卡加 active、其余移除
   * @param {Element|string} container 卡组容器（.kb-stats 元素或选择器）；null 安全
   * @param {number|null} idx 高亮索引；null/负值清除全部高亮
   */
  function setActive(container, idx) {
    var el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    var cards = el.querySelectorAll('.kb-stat');
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('active', idx != null && idx >= 0 && i === idx);
  }

  window.KbStats = { render: render, wrap: wrap, setActive: setActive };
})();


/* --- subsystems/samples/frontend/js/constants.js --- */
// constants.js — 样品子系统常量
// ROLE/STATUS/ACTION_CN/$ 在 shared/frontend/api-base.js 中定义
const CONFIRM_ACTIONS=new Set(['RELEASE','INSPECT','CUSTODY']);
const STATIONS=['马达组','扇叶组','成品组','品保部','SMT','供应商'];
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
// 读取用户首选打印尺寸，默认中标（52×25mm；尺寸唯一来源：后端 card-constants.js PRESET_MM）
function getPrintSize(){
  try{return localStorage.getItem('printSize')||'medium';}catch(e){return 'medium';}
}
// 拼接打印 URL 尺寸参数：custom 档携带真实宽高，保证标示卡打印跟随标签纸尺寸
function getPrintSizeQuery(){
  var sz=getPrintSize();
  if(sz==='custom'){
    try{
      var w=localStorage.getItem('printCustomW'),h=localStorage.getItem('printCustomH');
      if(w&&h)return '?size=custom&customW='+w+'&customH='+h;
    }catch(e){}
  }
  return '?size='+sz;
}


/* --- subsystems/samples/frontend/js/api.js --- */
// api.js — 样品子系统入口（鉴权/登录/API 基础见 shared/api-base.js）
var me = null;
function showApp(){
  $('#app').style.display='flex';
  $('#me-name').textContent=me.display_name||me.username;
  $('#me-role').textContent=(ROLE[me.role]||me.role)+' · '+(me.dept||'');
  buildNav(); renderHelpButton(); route();
}

// ---- 样品专用 helpers ----
function overdue(s){return s.status==='IN_CUSTODY'&&s.next_inspect_at&&new Date(s.next_inspect_at).getTime()<Date.now();}
// 领用超时未归还（2026-09-05）：领用中且已过应还时间 → 与复检逾期同款 b-overdue 高亮
function checkoutOverdue(s){return s.status==='CHECKED_OUT'&&s.expected_return_at&&new Date(s.expected_return_at).getTime()<Date.now();}
// 覆盖 shared/api-base.js 的 statusBadge：样品逾期检测（复检逾期 + 领用超时）
function statusBadge(s){var hot=(s.status==='IN_CUSTODY'&&overdue(s))||checkoutOverdue(s);var cls='b-'+(hot?'overdue':s.status);return '<fluent-badge class="badge '+cls+'" appearance="filled">'+(STATUS[s.status]||s.status)+'</fluent-badge>';}
function goScan(code){location.hash='#/scan';setTimeout(()=>{if(code)$('#scan-code').value=code;},50);}

// ---- T6: 统一防重提交 / 409 / 401 / 请求序号 helpers ----
// 防重提交锁：执行期禁用按钮并加加载态，fn 结束（含异常）后自动释放；btn 为空时仅执行 fn
function withSubmitLock(btn, fn){
  if(!btn) return Promise.resolve().then(fn);
  if(btn.disabled) return Promise.resolve();
  var orig=btn.textContent;
  btn.disabled=true;btn.classList.add('btn-loading');btn.textContent='处理中\u2026';
  function release(){btn.disabled=false;btn.classList.remove('btn-loading');btn.textContent=orig;}
  return Promise.resolve().then(fn).then(function(v){release();return v;},function(err){release();throw err;});
}

// 409 冲突刷新回调注册表：各视图注册自己的数据刷新函数
var _conflictRefreshFns=[];
function onConflictRefresh(fn){if(typeof fn==='function')_conflictRefreshFns.push(fn);}
function _notifyConflict(){_conflictRefreshFns.forEach(function(fn){try{fn();}catch(_){}});}

// 401 统一跳登录：沿用 boot() 既有惯例——隐藏 app、显示同页登录层（登录层缺失时刷新页面兜底）
function _gotoLogin(){
  var lg=document.getElementById('login'),app=document.getElementById('app');
  if(lg){if(app)app.style.display='none';lg.style.display='flex';}
  else location.reload();
}

// 状态码感知的请求封装（行为与 shared/api-base.js 的 api() 一致，额外携带 err.status 供统一错误处理）
async function _apiFetch(method,url,body){
  var opt={method:method,credentials:'include',headers:{}};
  if(body){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  var r=await fetch(url,opt);
  var text=await r.text();
  var data={};
  try{data=JSON.parse(text);}catch(e){data={};}
  if(!r.ok){var err=new Error(data.error||('错误 '+r.status));err.status=r.status;throw err;}
  return data;
}
// 包装 shared/api-base.js 的 api()（不动共享层，仅本子系统 bundle 生效）：
// 409 → toast 后端冲突文案 + 触发各视图注册的刷新回调；401 → 统一跳登录；其余错误原样抛出，不破坏现有处理路径
api=async function(method,url,body){
  try{return await _apiFetch(method,url,body);}
  catch(err){
    if(err&&err.status===409){showToast(err.message||'数据已被他人修改，请刷新后重试','err');_notifyConflict();}
    else if(err&&err.status===401){_gotoLogin();}
    throw err;
  }
};


/* --- subsystems/samples/frontend/js/views/list-inspect.js --- */
// list-inspect.js — 样品复检状态计算与徽章渲染
// 三态：ok 正常 / soon 近7天到期 / overdue 已逾期；无复检计划显示占位符（none）
// 阈值与列表快捷筛选「近7天」（overdue=7）保持一致
// 逾期天数统一 Math.ceil 向上取整（与治具看板/详情一致）：刚超期即显示 1 天

var INSPECT_SOON_DAYS = 7;

/** 计算复检状态：'none'|'ok'|'soon'|'overdue'（s 为空或无 next_inspect_at 返回 none） */
function inspectState(s) {
  if (!s || !s.next_inspect_at) return 'none';
  var t = new Date(s.next_inspect_at).getTime();
  if (t < Date.now()) return 'overdue';
  if (t <= Date.now() + INSPECT_SOON_DAYS * 86400000) return 'soon';
  return 'ok';
}

/** 渲染复检状态徽章 HTML（none 显示灰色占位符，徽章带复检日期悬停提示） */
function inspectBadge(s) {
  var st = inspectState(s);
  if (st === 'none') return '<span class="muted">—</span>';
  var tip = s.next_inspect_at ? ' title="复检日期：' + fmt(s.next_inspect_at) + '"' : '';
  if (st === 'ok') return '<span class="badge b-inspect-ok"' + tip + '>正常</span>';
  if (st === 'soon') return '<span class="badge b-inspect-soon"' + tip + '>近7天到期</span>';
  var days = Math.ceil((Date.now() - new Date(s.next_inspect_at).getTime()) / 86400000);
  return '<span class="badge b-overdue"' + tip + '>逾期' + days + '天</span>';
}


/* --- subsystems/samples/frontend/js/views/dashboard.js --- */
// dashboard.js — 样品看板（统计卡片 + 比例条 + 预警区块 + 错误处理）
// 待办见 dashboard-todo.js（renderTodo 由本文件 viewDashboard 延迟调用）
var _kbFilter = 0;   // 卡片筛选索引：0=总数(默认全部待办)，1..6=STAT_ORDER 排序后各状态
var _kbStats = [];   // _renderStats 填充排序后 [[label,count,key],...]，供 dashboard-todo.js 查索引→状态键
var _dashOverduePager = { limit: 5, offset: 0, total: 0 };
var _dashDueSoonPager = { limit: 5, offset: 0, total: 0 };
var _dashOverdueData = [];
var _dashDueSoonData = [];
var _dashCheckoutPager = { limit: 5, offset: 0, total: 0 };
var _dashCheckoutData = [];

// 统计卡配置（对齐治具 DASH_STATS 模式，配置驱动 + 角色排序）
var DASH_STATS = [
  { label: '总数', key: 'total', color: 'var(--brand)', countByStatus: false },
  { label: '新建·待制作', key: 'NEW', color: 'var(--muted)', countByStatus: true },
  { label: '制作完成', key: 'PRODUCED', color: 'var(--warn)', countByStatus: true },
  { label: '已发行', key: 'RELEASED', color: 'var(--ok)', countByStatus: true },
  { label: '保管中', key: 'IN_CUSTODY', color: 'var(--brand)', countByStatus: true },
  { label: '领用中', key: 'CHECKED_OUT', color: '#1d4ed8', countByStatus: true },
  { label: '退回审核中', key: 'RETURNING', color: 'var(--bad)', countByStatus: true },
  { label: '已废弃', key: 'RETIRED', color: 'var(--muted)', countByStatus: true }
];
// 按 key 快速查找颜色的辅助映射（比例条、dashboard-todo.js 复合需要）
var STAT_COLORS = {};
DASH_STATS.forEach(function(c) { STAT_COLORS[c.key] = c.color; });
// 角色优先级排序：高优先级状态前置（RD制作优先/QA发行优先/CUSTODY接收优先）
var STAT_ORDER = {
  ADMIN:   ['total','NEW','PRODUCED','RELEASED','IN_CUSTODY','CHECKED_OUT','RETURNING','RETIRED'],
  RD:      ['total','NEW','PRODUCED','RETURNING','RELEASED','IN_CUSTODY','CHECKED_OUT','RETIRED'],
  QA:      ['total','PRODUCED','RETURNING','RELEASED','NEW','IN_CUSTODY','CHECKED_OUT','RETIRED'],
  ME:      ['total','RELEASED','IN_CUSTODY','CHECKED_OUT','NEW','PRODUCED','RETURNING','RETIRED'],
  CUSTODY: ['total','RELEASED','IN_CUSTODY','CHECKED_OUT','NEW','PRODUCED','RETURNING','RETIRED']
};
var STAT_LABELS = {
  NEW: '新建·待制作', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中', RETIRED: '已废弃'
};

// 主入口：拉取 /api/dashboard 并渲染全部区块，失败显示点击重试
async function viewDashboard() {
  var v = $('#view');
  v.innerHTML = '<div class="muted">加载中…</div>';
  try {
    var d = await api('GET', '/api/dashboard');
    var h = '';
    h += _renderStats(d);
    h += _renderOverdue(d.overdue || []);
    h += _renderDueSoon(d.dueSoon || []);
    h += _renderCheckoutOverdue(d.checkoutOverdue || []);
    h += '<div id="dash-todo"></div>';
    v.innerHTML = h;
    // 预警表格列宽拖拽
    setTimeout(function() {
      document.querySelectorAll('.dash-alert-table').forEach(function(t) { if (typeof _initColResize === 'function') _initColResize(t); });
    }, 0);
    // 待办由 dashboard-todo.js 渲染（延迟调用确保 DOM 就绪）
    if (typeof renderTodo === 'function') renderTodo(d);
  } catch (err) {
    v.innerHTML = '<div class="empty">数据加载失败：' + e(err.message) + ' <a class="link" onclick="viewDashboard()">点击重试</a></div>';
  }
}

// 统计卡片组 + CSS 比例条（DASH_STATS 配置驱动，按角色优先级排序）
function _renderStats(d) {
  var s = d.byStatus || {}, total = d.total || 0;
  var order = STAT_ORDER[me.role] || STAT_ORDER.ADMIN;
  var sorted = DASH_STATS.slice().sort(function(a, b) { return order.indexOf(a.key) - order.indexOf(b.key); });
  // 构建 _kbStats 供 dashboard-todo.js 兼容 [[label, count, key], ...]
  _kbStats = sorted.map(function(cfg) { return [cfg.label, cfg.key === 'total' ? total : (s[cfg.key] || 0), cfg.key]; });
  var cards = sorted.map(function(cfg, idx) {
    var count = cfg.key === 'total' ? total : (s[cfg.key] || 0);
    var href = cfg.key === 'total' ? '#/samples' : '#/samples?status=' + cfg.key;
    return '<fluent-card class="kb-stat" style="--stat-color:' + cfg.color + '" onclick="filterKbStat(' + idx + ',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></fluent-card>';
  }).join('');
  // 比例条
  var barHtml = '';
  if (total > 0) {
    var keys = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'CHECKED_OUT', 'RETURNING', 'RETIRED'];
    var segs = keys.map(function(k) {
      var pct = ((s[k] || 0) / total * 100);
      if (pct < 0.1) return '';
      return '<div class="dash-bar-seg" style="width:' + pct + '%;background:' + STAT_COLORS[k] + '" title="' + STAT_LABELS[k] + ': ' + (s[k] || 0) + ' (' + pct.toFixed(1) + '%)" onclick="barDrill(\'' + k + '\',this)"></div>';
    }).join('');
    var legend = '<div class="dash-bar-legend">' + keys.map(function(k) {
      return '<span class="dash-legend" onclick="barDrill(\'' + k + '\',this)"><i style="background:' + STAT_COLORS[k] + '"></i>' + STAT_LABELS[k] + ' ' + (s[k] || 0) + '</span>';
    }).join('') + '</div>';
    barHtml = '<div class="dash-bar">' + segs + '</div>' + legend;
  }
  return '<div class="kb-stats">' + cards + '</div><div style="margin-top:12px">' + barHtml + '</div>';
}

// 比例条下钻：切换 active 高亮 + 跳转样品列表（保留原跳转行为，向后兼容）
function barDrill(key, el) {
  document.querySelectorAll('.dash-bar-seg.active,.dash-legend.active').forEach(function(n){ n.classList.remove('active'); });
  if (el) el.classList.add('active');
  location.hash = key === 'total' ? '#/samples' : '#/samples?status=' + key;
}

// filterKbStat 定义在 dashboard-todo.js（与 _renderTodoTable 同文件，原 filterTodo 位置）
// _kbFilter/_kbStats 由本文件定义（_renderStats 填充），filterKbStat 跨文件读写

// 复检逾期预警（红色区块，5 条/页）
function _renderOverdue(list) {
  _dashOverduePager.total = list.length;
  _dashOverduePager.offset = 0;
  return _renderAlertBlock('overdue', '⚠ 复检逾期', list, _dashOverduePager, 'goOverduePage', true);
}
function goOverduePage(page) {
  _dashOverduePager.offset = (page - 1) * _dashOverduePager.limit;
  var box = $('#dash-overdue');
  if (box) { box.outerHTML = _renderAlertBlock('overdue', '⚠ 复检逾期', _dashOverdueData, _dashOverduePager, 'goOverduePage', true); setTimeout(function() { var t = document.querySelector('#dash-overdue .dash-alert-table'); if (t && typeof _initColResize === 'function') _initColResize(t); }, 0); }
}

// 即将到期预警（黄色区块，5 条/页）
function _renderDueSoon(list) {
  _dashDueSoonPager.total = list.length;
  _dashDueSoonPager.offset = 0;
  return _renderAlertBlock('soon', '⏰ 即将到期·7天内', list, _dashDueSoonPager, 'goDueSoonPage', false);
}
function goDueSoonPage(page) {
  _dashDueSoonPager.offset = (page - 1) * _dashDueSoonPager.limit;
  var box = $('#dash-soon');
  if (box) { box.outerHTML = _renderAlertBlock('soon', '⏰ 即将到期·7天内', _dashDueSoonData, _dashDueSoonPager, 'goDueSoonPage', false); setTimeout(function() { var t = document.querySelector('#dash-soon .dash-alert-table'); if (t && typeof _initColResize === 'function') _initColResize(t); }, 0); }
}

// 领用超时未归还预警（2026-09-05，蓝色区块区分复检预警，5 条/页；空列表不渲染与既有区块一致）
function _renderCheckoutOverdue(list) {
  _dashCheckoutPager.total = list.length;
  _dashCheckoutPager.offset = 0;
  return _renderCheckoutBlock(list, _dashCheckoutPager);
}
function goCheckoutPage(page) {
  _dashCheckoutPager.offset = (page - 1) * _dashCheckoutPager.limit;
  var box = $('#dash-checkout');
  if (box) { box.outerHTML = _renderCheckoutBlock(_dashCheckoutData, _dashCheckoutPager); setTimeout(function() { var t = document.querySelector('#dash-checkout .dash-alert-table'); if (t && typeof _initColResize === 'function') _initColResize(t); }, 0); }
}
function _renderCheckoutBlock(list, pager) {
  _dashCheckoutData = list;
  if (!list.length) return '';
  var pageList = list.slice(pager.offset, pager.offset + pager.limit);
  var colgroup = '<colgroup><col style="width:100px"><col style="width:130px"><col style="width:52px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:70px"></colgroup>';
  var thead = '<thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>图片<span class="col-rsz"></span></th><th>领用人<span class="col-rsz"></span></th><th>领用部门<span class="col-rsz"></span></th><th>领出时间<span class="col-rsz"></span></th><th>应还时间<span class="col-rsz"></span></th><th>操作<span class="col-rsz"></span></th></tr></thead>';
  var rows = pageList.map(function(s) {
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    var lateDays = Math.ceil((Date.now() - new Date(s.expected_return_at).getTime()) / 86400000);
    return '<tr class="dash-alert-row" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer"><td data-label="编号">' + e(s.sample_no) + '</td><td data-label="名称">' + e(s.name || '—') + '</td><td data-label="图片">' + img + '</td><td data-label="领用人">' + e(s.checkout_user || '—') + '</td><td data-label="领用部门">' + e(s.checkout_dept || '—') + '</td><td data-label="领出时间" class="muted">' + fmt(s.checkout_at) + '</td><td data-label="应还时间" class="b-overdue" style="font-weight:700">' + fmt(s.expected_return_at) + '（超' + lateDays + '天）</td><td data-label="操作"><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去催还</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(pager, 'goCheckoutPage');
  return '<div class="dash-alert-checkout" id="dash-checkout"><h3>📤 领用超时未归还（' + list.length + '）</h3><div style="overflow-x:auto"><table class="dash-alert-table">' + colgroup + thead + '<tbody>' + rows + '</tbody></table></div>' + pagerHtml + '</div>';
}

// 预警区块通用渲染（isOverdue 控制红色/黄色样式与缓存目标）
function _renderAlertBlock(type, title, list, pager, pageFn, isOverdue) {
  if (isOverdue) { _dashOverdueData = list; } else { _dashDueSoonData = list; }
  if (!list.length) return '';
  var cls = type === 'overdue' ? 'dash-alert-overdue' : 'dash-alert-soon';
  var pageList = list.slice(pager.offset, pager.offset + pager.limit);
  var dateLabel = isOverdue ? '应复检日' : '到期日';
  var colgroup = '<colgroup><col style="width:100px"><col style="width:130px"><col style="width:52px"><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:70px"></colgroup>';
  var thead = '<thead><tr><th>编号<span class="col-rsz"></span></th><th>名称<span class="col-rsz"></span></th><th>图片<span class="col-rsz"></span></th><th>保管部门<span class="col-rsz"></span></th><th>储位<span class="col-rsz"></span></th><th>' + dateLabel + '<span class="col-rsz"></span></th><th>操作<span class="col-rsz"></span></th></tr></thead>';
  var rows = pageList.map(function(s) {
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    var dateCls = isOverdue ? 'b-overdue' : 'muted';
    var dateStyle = isOverdue ? 'font-weight:700' : '';
    return '<tr class="dash-alert-row" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer"><td data-label="编号">' + e(s.sample_no) + '</td><td data-label="名称">' + e(s.name || '—') + '</td><td data-label="图片">' + img + '</td><td data-label="保管部门">' + e(s.custody_dept || '—') + '</td><td data-label="储位">' + e(s.storage_location || '—') + '</td><td data-label="' + dateLabel + '" class="' + dateCls + '" style="' + dateStyle + '">' + fmt(s.next_inspect_at) + '</td><td data-label="操作"><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(pager, pageFn);
  return '<div class="' + cls + '" id="dash-' + type + '"><h3>' + title + '（' + list.length + '）</h3><div style="overflow-x:auto"><table class="dash-alert-table">' + colgroup + thead + '<tbody>' + rows + '</tbody></table></div>' + pagerHtml + '</div>';
}

// 分页控件（总数不超过每页条数则不渲染）
function _renderPager(pager, pageFn) {
  if (pager.total <= pager.limit) return '';
  var totalPages = Math.ceil(pager.total / pager.limit);
  var currentPage = Math.floor(pager.offset / pager.limit) + 1;
  return '<div class="dash-pager"><fluent-button appearance="accent" size="small" ' + (pager.offset === 0 ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage - 1) + ')">← 上一页</fluent-button><span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + pager.total + '</b> 条</span><fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="' + pageFn + '(' + (currentPage + 1) + ')">下一页 →</fluent-button></div>';
}


/* --- subsystems/samples/frontend/js/views/dashboard-todo.js --- */
// dashboard-todo.js — Dashboard 待办列表（角色定制优先级 + 分页 + 卡片筛选）
// renderTodo(d) 由 dashboard.js 的 viewDashboard 延迟调用（确保 #dash-todo DOM 就绪）
// 依赖：statusBadge/inspectBadge（list-inspect.js）
var _todoPager = { limit: 10, offset: 0, total: 0 };
var _todoData = [];

// 入口：填充待办数据并首次渲染（分页 10 条/页，清除筛选）
function renderTodo(d) {
  _todoData = d.myPending || [];
  _kbFilter = 0; // 跨文件重置 dashboard.js 的筛选状态，确保每次 dashboard 加载清空旧筛选
  _todoPager.offset = 0;
  _renderTodoTable();
}

// 卡片单击索引式 toggle：点击同一卡片回退到默认(0=总数=全部待办)，否则切换到目标卡片
// 跨文件：_kbFilter/_kbStats 由 dashboard.js 定义（_renderStats 填充），本函数读写筛选状态
function filterKbStat(idx, el) {
  _kbFilter = (_kbFilter === idx) ? 0 : idx;
  _todoPager.offset = 0;
  document.querySelectorAll('.kb-stat.active').forEach(function(n){ n.classList.remove('active'); });
  if (el && _kbFilter !== 0) el.classList.add('active');
  _renderTodoTable();
}

// 渲染待办表格（按 filterKey 过滤，空数据显示提示，复用 dashboard.js 的 _renderPager）
function _renderTodoTable() {
  var box = $('#dash-todo');
  if (!box) return;
  var filterKey = _kbStats[_kbFilter] ? _kbStats[_kbFilter][2] : '';
  if (filterKey === 'total') filterKey = '';
  var title = '我的待办（' + (ROLE[me.role] || me.role) + '）' + (filterKey ? ' · ' + (STAT_LABELS[filterKey] || filterKey) : '');
  var filtered = filterKey ? _todoData.filter(function(s){ return s.status === filterKey; }) : _todoData;
  _todoPager.total = filtered.length;
  if (!filtered.length) {
    box.innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">' + title + '</h3><div class="empty">' + (_todoData.length ? '该状态暂无待办' : '暂无待办') + '</div></div>';
    return;
  }
  var pageList = filtered.slice(_todoPager.offset, _todoPager.offset + _todoPager.limit);
  var rows = pageList.map(function(s, i) {
    var info = _getTodoInfo(s);
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    // 待办行单击进详情(viewDetail),"去处理"按钮 stopPropagation 防冒泡;info.cls 优先级样式从 td 移到 tr(Task4 CSS 配合调整)
    return '<tr class="dash-todo-row ' + info.cls + '" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer"><td class="muted">' + (_todoPager.offset + i + 1) + '</td><td>' + e(s.sample_no) + '</td><td>' + e(s.name || '—') + '</td><td>' + img + '</td><td class="muted">' + e(s.spec || '—') + '</td><td>' + info.type + '</td><td>' + statusBadge(s) + '</td><td>' + inspectBadge(s) + '</td><td><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(_todoPager, 'goTodoPage');
  box.innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">' + title + '</h3><div style="overflow-x:auto"><table><tr><th>#</th><th>编号</th><th>名称</th><th>图片</th><th>规格</th><th>待办类型</th><th>状态</th><th>复检状态</th><th>操作</th></tr>' + rows + '</table></div>' + pagerHtml + '</div>';
}

// 待办分页跳转（由 _renderPager 的 onclick 调用）
function goTodoPage(page) {
  _todoPager.offset = (page - 1) * _todoPager.limit;
  _renderTodoTable();
}

// 根据角色+状态获取待办类型与优先级样式（红 dash-todo-pri-high=紧急/黄 dash-todo-pri-normal=常规）
function _getTodoInfo(s) {
  var type = '', cls = 'dash-todo-pri-normal';
  if (s.status === 'NEW') { type = '待制作确认'; if (me.role === 'RD' || me.role === 'ADMIN') cls = 'dash-todo-pri-high'; }
  else if (s.status === 'PRODUCED') { type = '待发行'; if (me.role === 'QA' || me.role === 'ADMIN') cls = 'dash-todo-pri-high'; }
  else if (s.status === 'RELEASED') { type = '待接收'; cls = 'dash-todo-pri-normal'; }
  else if (s.status === 'RETURNING') {
    if (me.role === 'RD' && String(s.retire_assigned_rd) === String(me.id)) { type = '待重做'; cls = 'dash-todo-pri-high'; }
    else if (me.role === 'QA') { type = '待审核退回'; cls = 'dash-todo-pri-high'; }
    else { type = '退回审核中'; cls = 'dash-todo-pri-normal'; }
  }
  return { type: type, cls: cls };
}


/* --- subsystems/samples/frontend/js/views/new.js --- */
// new.js — 新建样品、打印标签、下载二维码、删除样品
async function viewNew(){
  const v=$('#view');
  const groupOpts='<fluent-option value="">请选择组别</fluent-option>'+STATIONS.map(x=>'<fluent-option value="'+x+'">'+x+'</fluent-option>').join('');
  const sourceOpts='<fluent-option value="">请选择提供处</fluent-option><fluent-option value="C">客供(C)</fluent-option><fluent-option value="T">元山(T)</fluent-option><fluent-option value="G">塔岗(G)</fluent-option>';
  const limitOpts='<fluent-option value="">不适用</fluent-option>'+(typeof LIMIT_ITEMS!=='undefined'?LIMIT_ITEMS:[]).map(x=>'<fluent-option value="'+x.code+'">'+x.label+'</fluent-option>').join('');
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<div class="nf-grid">'+
    '<div><label>规格/型号 *</label><fluent-select id="n-spec"><fluent-option value="">请选择机型</fluent-option></fluent-select></div>'+
    '<div><label>样品名称 *</label><fluent-text-field id="n-name" placeholder="如 1225震动样"></fluent-text-field></div>'+
    '<div class="nf-full"><label>机型编码（选择规格/型号后自动填入）</label><fluent-text-field id="n-model" disabled placeholder="选择机型后自动填入"></fluent-text-field></div>'+
    '<div><label>提供处 *</label><fluent-select id="n-source">'+sourceOpts+'</fluent-select></div>'+
    '<div><label>组别 *</label><fluent-select id="n-station">'+groupOpts+'</fluent-select></div>'+
    '<div class="nf-full"><label>备注</label><textarea id="n-notes" rows="3"></textarea></div>'+
    '</div>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<div class="nf-grid">'+
    '<div><label>样品类型</label><fluent-select id="n-type"><fluent-option value="">不适用</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select></div>'+
    '<div><label>限度项目</label><fluent-select id="n-limit-item">'+limitOpts+'</fluent-select></div>'+
    '<div><label>版次（01~99，默认01）</label><fluent-text-field id="n-card-version" value="01" maxlength="2"></fluent-text-field></div>'+
    '<div><span class="muted" style="font-size:11px;display:block;margin-top:10px">样品编号生成后固定，不再随版次变化</span></div>'+
    '<div class="nf-full"><label>标准范围</label><textarea id="n-test-standard" rows="3"></textarea></div>'+
    '</div>'+
    '</div>'+
    '</div>'+
    '<div class="nf-actions">'+
    '<div id="n-preview" class="muted" style="font-size:13px"></div>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
    '<fluent-button id="n-submit" appearance="accent" onclick="submitNew()">创建样品并生成条码</fluent-button>'+
    '<span id="n-msg" class="muted"></span>'+
    '</div></div></div>';
  try {
    // 新建下拉仅用机型主数据（不含补集），已删除机型不会出现在此处，杜绝误选
    const opts = await api('GET', '/api/samples/models');
    const sel = $('#n-spec');
    if (!opts.length) {
      sel.innerHTML = '<fluent-option value="">暂无机型，请先到机型列表添加</fluent-option>';
    } else {
      sel.innerHTML = '<fluent-option value="">请选择机型</fluent-option>' + opts.map(function (o) { return '<fluent-option value="' + e(o.code) + '">' + e(o.full_name) + '</fluent-option>'; }).join('');
      sel.addEventListener('change', function () {
        $('#n-model').value = sel.value;
        _schedulePreview();
      });
    }
  } catch (_) { /* 下拉加载失败保持仅提示项 */ }
  _bindPreview();
}

// ═══ 编号实时预览（防抖 300ms，只读接口，不落库）═══
var _previewTimer=null;
function _bindPreview(){
  ['n-source','n-station'].forEach(function(id){
    const el=$('#'+id);
    if(el) el.addEventListener('change',_schedulePreview);
  });
  const m=$('#n-model');
  if(m) m.addEventListener('input',_schedulePreview);
}
function _schedulePreview(){
  clearTimeout(_previewTimer);
  _previewTimer=setTimeout(_refreshPreview,300);
}
var _previewReqSeq=0;
async function _refreshPreview(){
  const seq=++_previewReqSeq;
  const box=$('#n-preview');
  if(!box) return;
  const src=$('#n-source').value, model=$('#n-model').value, station=$('#n-station').value;
  if(!src||!station){ box.textContent=''; return; }
  if(model.length>0&&model.length<6){ box.textContent='机型编码至少 6 位'; return; }
  try{
    const r=await api('GET','/api/samples/code-preview?source_type='+encodeURIComponent(src)+'&model='+encodeURIComponent(model)+'&station='+encodeURIComponent(station));
    if(seq!==_previewReqSeq)return; // 已有更新的预览请求，丢弃过期响应（防竞态）
    box.textContent='编号预览：'+r.sample_no;
  }catch(e){ if(seq===_previewReqSeq)box.textContent=''; }
}
// 防重复提交：withSubmitLock 统一实现（提交中禁用按钮 + 加载态，见 api.js）
async function submitNew(){
  await withSubmitLock($('#n-submit'),async function(){
    $('#n-msg').textContent='';
    // T18.1 占位页模式：点击提交的手势内（transient activation 窗口内）同步开占位页，
    // POST 完成后填打印地址，规避慢网超手势窗口期被拦截
    var printWin=openPrintPlaceholder();
    if(!printWin)toast('浏览器拦截了打印窗口，请允许弹出窗口；创建后可到样品列表补打条码','err');
    try{
    const payload={
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      source_type:$('#n-source').value,
      card_version:$('#n-card-version').value||'01',
      spec: $('#n-spec').selectedOptions && $('#n-spec').selectedOptions.length ? $('#n-spec').selectedOptions[0].text : '',
      notes:$('#n-notes').value,
      sample_type:$('#n-type').value,
      limit_item:$('#n-limit-item').value,
      test_standard:$('#n-test-standard').value
    };
    const s=await api('POST','/api/samples',payload);
    if(printWin)printWin.location.href='/api/samples/'+s.id+'/label/print'+getPrintSizeQuery();
    toast('已创建 '+s.sample_no+'，可到样品列表补打条码','ok');
    }catch(e){
      if(printWin)try{printWin.close();}catch(_){}
      const m=$('#n-msg');if(m)m.textContent=e.message;}
  });
}
// 列表/详情补打标签：真实点击手势内直接 window.open，无需占位页
function openPrintLabel(s){
  window.open('/api/samples/'+s.id+'/label/print'+getPrintSizeQuery(),'_blank');
}
async function printSampleLabel(id){
  const s=await api('GET','/api/samples/'+id);
  openPrintLabel(s);
}
function downloadQR(id){
  var a=document.createElement('a');
  a.href='/api/samples/'+id+'/label/download';
  a.download='';
  a.click();
}


/* --- subsystems/samples/frontend/js/views/list.js --- */
// samples.js — 样品列表：状态管理、导航、删除
// 渲染逻辑 → sample-list-render.js | 筛选逻辑 → sample-filter.js

/** 样品类型标签（OK/NG） */
function sampleTypeLabel(v) { return v==='OK'?'OK样品':v==='NG'?'NG样品':v; }

var _debounceTimer = null;
var _quickFilterType = null;  // pending|overdue|soon，快捷筛选状态
var samplePager = { limit: 20, offset: 0, total: 0 };
var _sampleBuildParams = null;
var _sampleIsOverdue = false;

function debounceSearch() { clearTimeout(_debounceTimer); _debounceTimer = setTimeout(loadSamples, 300); }

async function viewSamples() {
  var v = $('#view');
  var modelOpts = '<fluent-option value="">全部机型</fluent-option>';
  try {
    (await api('GET', '/api/samples/model-options')).forEach(function (o) { modelOpts += '<fluent-option value="' + e(o.value) + '">' + e(o.label) + '</fluent-option>'; });
  } catch (_) {}
  var stOpts = '<fluent-option value="">全部状态</fluent-option><fluent-option value="NEW">待制作</fluent-option><fluent-option value="PRODUCED">制作完成</fluent-option><fluent-option value="RELEASED">已发行</fluent-option><fluent-option value="IN_CUSTODY">保管中</fluent-option><fluent-option value="CHECKED_OUT">领用中</fluent-option><fluent-option value="RETURNING">退回审核中</fluent-option><fluent-option value="RETIRED">已作废</fluent-option>';
  var deptOpts = '<fluent-option value="">保管部门</fluent-option>' + (typeof DEPTS !== 'undefined' ? DEPTS : ['研发部','品保文管中心','制造部','资材部','FQC','生技部','项目部','系统']).map(function(d) { return '<fluent-option value="' + d + '">' + d + '</fluent-option>'; }).join('');
  var sortOpts = '<fluent-option value="">排序：最新优先</fluent-option><fluent-option value="created_at">最早优先</fluent-option><fluent-option value="sample_no">编号升序</fluent-option><fluent-option value="-sample_no">编号降序</fluent-option>';
  v.innerHTML = '<div class="filters"><fluent-text-field id="f-q" placeholder="搜索编号/名称/规格" oninput="debounceSearch()"></fluent-text-field>' +
    '<fluent-select id="f-status" onchange="loadSamples()">' + stOpts + '</fluent-select>' +
    '<fluent-select id="f-dept" onchange="loadSamples()">' + deptOpts + '</fluent-select>' +
    '<fluent-select id="f-type" onchange="loadSamples()"><fluent-option value="">全部类型</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>' +
    '<fluent-select id="f-limit-item" onchange="loadSamples()"><fluent-option value="">全部项目</fluent-option>' + (typeof LIMIT_ITEMS !== 'undefined' ? LIMIT_ITEMS : []).map(function(x) { return '<fluent-option value="' + x.code + '">' + x.label + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<fluent-select id="f-source" onchange="loadSamples()"><fluent-option value="">全部来源</fluent-option><fluent-option value="C">客供</fluent-option><fluent-option value="T">元山</fluent-option><fluent-option value="G">塔岗</fluent-option></fluent-select>' +
    '<fluent-select id="f-model" onchange="loadSamples()">' + modelOpts + '</fluent-select>' +
    '<fluent-select id="f-sort" onchange="loadSamples()">' + sortOpts + '</fluent-select>' +
    '<fluent-button appearance="accent" size="small" onclick="loadSamples()">查询</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="exportSamplesCsv()">导出 CSV</fluent-button></div>' +
    '<div class="filters" style="margin-bottom:14px;align-items:center">' +
    '<span style="font-size:12px;color:var(--muted)">快捷：</span>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'pending\')">待处理</a>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'overdue\')">逾期</a>' +
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'soon\')">近7天</a>' +
    '<span id="f-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:10px"></span></div>' +
    '<div id="s-list"></div>';
  var stMatch = location.hash.match(/[?&]status=([^&]+)/);
  if (stMatch) { var stBox = $('#f-status'); if (stBox) stBox.value = decodeURIComponent(stMatch[1]); loadSamplesWithStatus(decodeURIComponent(stMatch[1])); }
  else loadSamples();
}

async function loadSamples() {
  _quickFilterType = null;
  _sampleIsOverdue = false;
  _sampleBuildParams = function() { return _buildQueryParams(''); };
  _fetchSamplePage(true);
}

async function deleteSample(id) {
  if (!confirm('确认取消该样品？此操作不可撤销，将同时删除关联日志。')) return;
  try {
    await api('DELETE', '/api/samples/' + id);
    toast('样品已取消', 'ok');
    loadSamples();
  } catch (e) { toast(e.message, 'err'); }
}

// 导出当前筛选结果 CSV（复用列表筛选参数，忽略分页；AGENTS.md §21 列表导出标准）
function exportSamplesCsv() {
  var qs = (_sampleBuildParams ? _sampleBuildParams() : _buildQueryParams('')).replace(/^&/, '');
  location.href = '/api/samples/export' + (qs ? '?' + qs : '');
}


/* --- subsystems/samples/frontend/js/views/list-filter.js --- */
// sample-filter.js — 样品筛选、chips、快捷过滤
// 依赖：_quickFilterType/_sampleIsOverdue/_sampleBuildParams (samples.js), _fetchSamplePage/goSamplePage (sample-list-render.js)

/** 从当前筛选控件值构建查询参数字符串（含状态 f-status；修复状态下拉筛选/导出不携带 status 的既有缺陷） */
function _buildQueryParams(baseParams) {
  var q = $('#f-q').value, dept = $('#f-dept').value, sort = $('#f-sort').value;
  var st = $('#f-status').value;
  var tp = $('#f-type').value, li = $('#f-limit-item').value, src = $('#f-source').value;
  var mo = $('#f-model').value;
  var p = baseParams || '';
  if (q) p += '&q=' + encodeURIComponent(q);
  if (dept) p += '&dept=' + encodeURIComponent(dept);
  if (sort) p += '&sort=' + sort;
  if (st && p.indexOf('status=') === -1) p += '&status=' + st;
  if (tp) p += '&sample_type=' + tp;
  if (li) p += '&limit_item=' + li;
  if (src) p += '&source_type=' + src;
  if (mo) p += '&model=' + encodeURIComponent(mo);
  return p;
}

function loadSamplesWithStatus(statusStr) {
  _sampleIsOverdue = false;
  _sampleBuildParams = function() { return _buildQueryParams('status=' + statusStr); };
  _fetchSamplePage(true);
}

function quickFilter(type) {
  _quickFilterType = type;
  if (type === 'pending') {
    var st = me.role === 'RD' ? 'NEW' : me.role === 'QA' ? 'PRODUCED,RETURNING' : (me.role === 'CUSTODY' || me.role === 'ME') ? 'RELEASED' : '';
    $('#f-status').value = ''; $('#f-dept').value = '';
    loadSamplesWithStatus(st);
    return;
  }
  if (type === 'overdue') { loadSamplesOverdue('1'); return; }
  if (type === 'soon') { loadSamplesOverdue('7'); return; }
}

function loadSamplesOverdue(v) {
  _quickFilterType = v === '1' ? 'overdue' : 'soon';
  _sampleIsOverdue = true;
  $('#f-status').value = ''; $('#f-dept').value = '';
  _sampleBuildParams = function() { return _buildQueryParams('overdue=' + v); };
  _fetchSamplePage(true);
}

function renderChips() {
  var chips = $('#f-chips'); if (!chips) return;
  var html = '', st = $('#f-status').value, dept = $('#f-dept').value, sort = $('#f-sort').value;
  var tp = $('#f-type').value, li = $('#f-limit-item').value, src = $('#f-source').value;
  var mo = $('#f-model').value;
  var stLabels = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中', RETIRED: '已作废' };
  if (st) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-status\').value=\'\';loadSamples()">' + e(stLabels[st] || st) + ' ✕</span>';
  if (dept) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-dept\').value=\'\';loadSamples()">' + e(dept) + ' ✕</span>';
  if (tp) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-type\').value=\'\';loadSamples()">' + e(sampleTypeLabel(tp)) + ' ✕</span>';
  if (li) { var liLabel = (LIMIT_ITEMS.find(function(x) { return x.code === li; }) || {}).label || li; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-limit-item\').value=\'\';loadSamples()">' + e(liLabel) + ' ✕</span>'; }
  if (src) { var srcLabel = { C: '客供', T: '元山', G: '塔岗' }[src] || src; html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-source\').value=\'\';loadSamples()">' + e(srcLabel) + ' ✕</span>'; }
  if (mo) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-model\').value=\'\';loadSamples()">机型 ' + e(mo) + ' ✕</span>';
  if (sort) html += '<span class="chip done" style="cursor:pointer" onclick="$(\'#f-sort\').value=\'\';loadSamples()">排序 ✕</span>';
  if (_quickFilterType === 'pending') html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">待处理 ✕</span>';
  if (_quickFilterType === 'overdue') html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">逾期 ✕</span>';
  if (_quickFilterType === 'soon') html += '<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">近7天 ✕</span>';
  chips.innerHTML = html;
}

function clearQuickFilter() {
  _quickFilterType = null;
  $('#f-status').value = ''; $('#f-dept').value = '';
  loadSamples();
}


/* --- subsystems/samples/frontend/js/views/list-render.js --- */
// sample-list-render.js — 样品列表渲染（表头、行、分页、列宽拖拽）
// 依赖：samplePager/_sampleBuildParams/_sampleIsOverdue (samples.js), renderChips/statusBadge/e/fmt/sampleTypeLabel/inspectBadge

/** 构建样品列表表头 HTML（含 colgroup 列宽定义） */
function _sampleHeaderCols(isOverdue) {
  var cols = ['#','编号', '名称', '机型/站别', '图片', '规格', '类型', '状态', '复检状态', '制作', '发行', '保管部门/储位'];
  if (isOverdue) cols.push('复检到期');
  cols.push('操作');
  var ths = cols.map(function(c) { return '<th>' + c + '<span class="col-rsz"></span></th>'; }).join('');
  var cg = '<colgroup>' +
    '<col style="width:42px">' +
    '<col style="width:100px">' + '<col style="width:130px">' + '<col style="width:90px">' +
    '<col style="width:52px">' + '<col style="width:80px">' + '<col style="width:70px">' +
    '<col style="width:84px">' + '<col style="width:84px">' +
    '<col style="width:78px">' + '<col style="width:78px">' +
    '<col style="width:110px">' + (isOverdue ? '<col style="width:84px">' : '') +
    '<col style="width:120px">' + '</colgroup>';
  return cg + '<thead><tr>' + ths + '</tr></thead>';
}

/** 构建单行数据 HTML */
function _sampleRowHtml(s, isOverdue, i) {
  var img = s.produced_image || s.image
    ? '<img src="' + e(s.produced_image || s.image) + '" width="40" style="border-radius:4px"/>' : '—';
  var typeCell = s.sample_type
    ? '<span class="badge" style="background:' + (s.sample_type === 'OK' ? '#16a34a' : '#dc2626') + ';color:#fff">' + sampleTypeLabel(s.sample_type) + '</span>'
    : '—';
  var actions = '<a class="link" onclick="viewDetail(' + s.id + ')">详情</a>';
  if (s.status === 'NEW')
    actions = '<a class="link" style="margin-right:8px" onclick="event.stopPropagation();printSampleLabel(' + s.id + ')">打印</a>' + actions;
  actions = '<a class="link" style="margin-right:8px" onclick="event.stopPropagation();downloadQR(' + s.id + ')">下载QR</a>' + actions;
  if ((s.status === 'NEW' || s.status === 'PRODUCED') && (me.role === 'ADMIN' || s.created_by === me.id))
    actions = '<a class="link" style="margin-right:8px;color:var(--bad)" onclick="event.stopPropagation();deleteSample(' + s.id + ')">取消</a>' + actions;
  var overdueCell = '';
  if (isOverdue) {
    var overdue = s.next_inspect_at && new Date(s.next_inspect_at).getTime() < Date.now();
    overdueCell = '<td data-label="复检到期" class="' + (overdue ? 'b-overdue' : 'muted') + '">' + fmt(s.next_inspect_at) + '</td>';
  }
  return '<tr>' +
    '<td data-label="序号" class="muted">' + (typeof i !== 'undefined' ? (samplePager.offset + i + 1) : '') + '</td>' +
    '<td data-label="编号">' + e(s.sample_no) + '</td>' +
    '<td data-label="名称">' + e(s.name || '—') + '</td>' +
    '<td data-label="机型/站别" class="muted">' + e(s.model || '—') + (s.station ? ' · ' + e(s.station) : '') + '</td>' +
    '<td data-label="图片">' + img + '</td>' +
    '<td data-label="规格" class="muted">' + e(s.spec || '—') + '</td>' +
    '<td data-label="类型">' + typeCell + '</td>' +
    '<td data-label="状态">' + statusBadge(s) + '</td>' +
    '<td data-label="复检状态">' + inspectBadge(s) + '</td>' +
    '<td data-label="制作" class="muted">' + fmt(s.produced_at) + '</td>' +
    '<td data-label="发行" class="muted">' + fmt(s.released_at) + '</td>' +
    '<td data-label="保管/储位" class="muted">' + e(s.custody_dept || '—') + '/' + e(s.storage_location || '—') + '</td>' +
    overdueCell +
    '<td data-label="操作" style="white-space:nowrap">' + actions + '</td>' +
    '</tr>';
}

/** 拉取一页样品数据 */
function _fetchSamplePage(resetOffset) {
  if (resetOffset) samplePager.offset = 0;
  if (!_sampleBuildParams) return;
  var params = _sampleBuildParams();
  params += (params ? '&' : '') + 'limit=' + samplePager.limit + '&offset=' + samplePager.offset;
  api('GET', '/api/samples?' + params).then(function(data) {
    samplePager.total = data.total || 0;
    _renderSampleList(data.samples || [], _sampleIsOverdue, samplePager);
    renderChips();
  }).catch(function(e) { $('#s-list').innerHTML = '<div class="empty">加载失败：' + e.message + '</div>'; });
}

function goSamplePage(page) {
  samplePager.offset = (page - 1) * samplePager.limit;
  _fetchSamplePage(false);
}

/** 渲染样品列表到 #s-list */
function _renderSampleList(list, isOverdue, pager) {
  var box = $('#s-list');
  if (!list.length) { box.innerHTML = '<div class="empty">' + (isOverdue ? '无逾期/即将到期样品' : '无样品') + '</div>'; return; }
  var cols = _sampleHeaderCols(isOverdue);
  var rows = list.map(function(s, i) { return _sampleRowHtml(s, isOverdue, i); }).join('');
  var minWidth = isOverdue ? 1150 : 1050;
  var html = '<div class="card" style="padding:0"><table class="samples-table" style="min-width:' + minWidth + 'px">' + cols + '<tbody>' + rows + '</tbody></table></div>';
  if (pager && pager.total > pager.limit) {
    var totalPages = Math.ceil(pager.total / pager.limit);
    var currentPage = Math.floor(pager.offset / pager.limit) + 1;
    html += '<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html += '<fluent-button appearance="accent" size="small" ' + (pager.offset === 0 ? 'disabled' : '') + ' onclick="goSamplePage(' + (currentPage - 1) + ')">← 上一页</fluent-button>';
    html += '<span class="muted">第 <b>' + currentPage + '</b>/<b>' + totalPages + '</b> 页 · 共 <b>' + pager.total + '</b> 条</span>';
    html += '<fluent-button appearance="accent" size="small" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="goSamplePage(' + (currentPage + 1) + ')">下一页 →</fluent-button>';
    html += '</div>';
  }
  box.innerHTML = html;
  setTimeout(function() { _initColResize(box.querySelector('.samples-table')); }, 0);
}


/* --- subsystems/samples/frontend/js/views/detail.js --- */
// detail.js — 样品详情弹窗（信息/标示卡/日志/大图 四Tab）
// 重构: CSS Grid 卡片布局 + Tab 内联渲染，架构与 fixture-detail.js 对齐
// D1: 骨架屏/Tab置顶(detail-tabs-top)/头部操作组/锁定引导/dirty拦截/密度类
var _detailSample = null;
var _detailTab = 'info';
var _detailReqSeq = 0;

async function viewDetail(id) {
  var seq = ++_detailReqSeq;
  _detailTab = 'info'; _detailDirty = false;
  // D1.1 先开骨架屏（标题条 + 4 卡片占位），数据到达后替换；失败 toast + 关窗
  var foot = '<fluent-button appearance="neutral" size="small" onclick="tryCloseDetail(this.closest(\'.modal-mask\'))">关闭</fluent-button>';
  var sk = '<div class="sk" style="height:20px;width:42%"></div><div class="overview-cards">' + '<div class="overview-card sk" style="height:130px"></div>'.repeat(4) + '</div>';
  var mask = openModal('', sk, { head: '<b>加载中…</b>', foot: foot });
  _applyDetailDensity('info');
  var s;
  try { s = await api('GET', '/api/samples/' + id); }
  catch (err) { if (seq === _detailReqSeq) { toast('详情加载失败', 'err'); closeModal(mask); } return; }
  if (seq !== _detailReqSeq) { closeModal(mask); return; } // 防竞态：回收过期骨架弹窗
  _detailSample = s;
  mask.querySelector('.modal-head').innerHTML = _buildHeadHTML(s, id);
  mask.querySelector('.modal-body').innerHTML = _buildTabsHTML(s, id, 'info') + _buildTabContent(s, id, 'info');
}

// D1.3 头部：编号 + 徽章 + 操作组
function _buildHeadHTML(s, id) {
  var acts = [['🖨 标示卡', '打印标示卡', 'printCard(' + id + ')'],
    ['🏷 标签', '打印标签', 'window.open(\'/api/samples/' + id + '/label/print\'+getPrintSizeQuery(),\'_blank\')'],
    ['⬇ 二维码', '下载二维码', 'downloadQR(' + id + ')']];
  return '<b>' + e(s.sample_no) + '</b>' + statusBadge(s) + '<span class="pv-actions">' +
    acts.map(function(a) { return '<button class="pv-icon-btn" title="' + a[1] + '" onclick="' + a[2] + '">' + a[0] + '</button>'; }).join('') + '</span>';
}

// D1.6 密度类：info→d-high / card→d-mid / logs·image→d-low（宽度样式 D2 进 module.css）
function _applyDetailDensity(tab) {
  var d = document.querySelector('.modal-mask fluent-dialog');
  if (d) { d.classList.add('dm-modal'); d.classList.remove('d-high', 'd-mid', 'd-low'); d.classList.add(tab === 'info' ? 'd-high' : tab === 'card' ? 'd-mid' : 'd-low'); }
}

// D2.2 Tab 懒渲染：切 logs/image 先骨架一帧，setTimeout(0) 后再构建实际 DOM（先给视觉反馈）
function renderTab(tab, id) {
  var s = (_detailSample && _detailSample.id === id) ? _detailSample : null;
  if (!s) return;
  if (_detailTab === 'card' && _detailDirty && !confirm('标示卡有未保存的修改，切换将丢失，继续？')) return; // D1.5 切Tab拦截
  _detailDirty = false; // 离开/重渲标示卡后重置
  _detailTab = tab;
  var body = document.querySelector('.modal-body');
  if (!body) return;
  var tabsHTML = _buildTabsHTML(s, id, tab);
  _applyDetailDensity(tab);
  if (tab === 'logs' || tab === 'image') {
    body.innerHTML = tabsHTML + _buildTabSkeleton(tab); // 骨架先行
    setTimeout(function() {
      if (!_detailSample || _detailTab !== tab) return; // 期间已切走，丢弃过期渲染
      var b = document.querySelector('.modal-body');
      if (!b) return;
      b.innerHTML = tabsHTML + _buildTabContent(s, id, tab);
      if (tab === 'image') loadImageHistory(id); // 大图 Tab 异步历史照片（T14）调用时机保持
    }, 0);
    return;
  }
  body.innerHTML = tabsHTML + _buildTabContent(s, id, tab);
  if (tab === 'card') applyDetailCardValues(s); // 显式回显下拉值（selected 属性在 FAST 下不生效）
}

// D2.2 懒渲染骨架占位块（logs 时间线条 / image 图块）
function _buildTabSkeleton(tab) {
  if (tab === 'logs') {
    var row = '<div style="display:flex;gap:10px;margin-bottom:14px"><div class="sk" style="width:10px;height:10px;border-radius:50%;flex:none;margin-top:4px"></div><div style="flex:1"><div class="sk" style="height:13px;width:36%;margin-bottom:6px"></div><div class="sk" style="height:11px;width:64%"></div></div></div>';
    return '<div style="padding:14px 16px">' + row.repeat(5) + '</div>';
  }
  return '<div style="padding:16px"><div class="sk" style="height:240px;max-width:420px;margin:0 auto 12px"></div><div class="sk" style="height:14px;width:44%;margin:0 auto"></div></div>';
}

/** 构建 Tab 页面内容（不含 tab 栏） */
function _buildTabContent(s, id, tab) {
  var html = '';
  if (tab === 'info') html = _buildOverview(s, id);
  else if (tab === 'logs') html = _buildLogsTab(s, id);
  else if (tab === 'card') html = _buildCardTab(s, id);
  else if (tab === 'image') html = _buildImageTab(s, id);
  return '<div class="dm-pad">' + html + '</div>'; // 统一内容呼吸感（对齐预览稿）
}

function _buildTabsHTML(s, id, activeTab) {
  var hasImg = !!(s.produced_image || s.image || s.inspect_image);
  var hasLog = s.logs && s.logs.length > 0;
  var hasCrd = !!(s.sample_type || s.limit_item || s.source_type || s.card_version || s.test_data || s.test_standard);
  if (!hasImg && !hasLog && !hasCrd) return '';

  var on = 'renderTab(\'';
  var h = '<div class="detail-tabs-top">';
  h += '<div class="detail-tab' + (activeTab === 'info' ? ' active' : '') + '" onclick="' + on + 'info\',' + id + ')">信息</div>';
  if (hasCrd) h += '<div class="detail-tab' + (activeTab === 'card' ? ' active' : '') + '" onclick="' + on + 'card\',' + id + ')">标示卡</div>';
  if (hasLog) h += '<div class="detail-tab' + (activeTab === 'logs' ? ' active' : '') + '" onclick="' + on + 'logs\',' + id + ')">全量日志 (' + s.logs.length + ')</div>';
  if (hasImg) h += '<div class="detail-tab' + (activeTab === 'image' ? ' active' : '') + '" onclick="' + on + 'image\',' + id + ')">大图</div>';
  h += '</div>';
  return h;
}

// ═══ 辅助：label/value ═══
function kv(label, val) { return '<span class="label">' + label + '</span><span>' + (val || '—') + '</span>'; }

// ═══ 概览 Tab（CSS Grid 卡片布局） ═══
function _buildOverview(s, id) {
  return '<div class="overview-cards">' +
    _cardInfo(s) + _cardProgress(s) + _cardImages(s, id) + _cardLogs(s, id) +
    '</div>';
}

function _cardInfo(s) {
  var h = '<div class="overview-card"><div class="title">基础信息</div><div class="field-grid">';
  h += kv('名称', e(s.name)) + kv('机型', e(s.model)) + kv('站别', e(s.station));
  h += kv('规格', e(s.spec)) + kv('保管', e(s.custody_dept)) + kv('储位', e(s.storage_location));
  // 领用/归还（2026-09-05）：领用中展示领用人/部门/应还时间（超时红色高亮），非领用态展示最近归还时间
  if (s.status === 'CHECKED_OUT') {
    var coLate = s.expected_return_at && new Date(s.expected_return_at).getTime() < Date.now();
    h += '<span class="label">领用</span><span class="' + (coLate ? 'b-overdue' : '') + '" style="font-weight:600">' + e(s.checkout_user || '—') + '（' + e(s.checkout_dept || '—') + '）· 应还 ' + fmt(s.expected_return_at) + (coLate ? '（已超时）' : '') + '</span>';
  } else if (s.returned_at) {
    h += kv('最近归还', fmt(s.returned_at));
  }
  var ov = overdue(s);
  h += '<span class="label">复检</span><span class="' + (ov ? 'b-overdue' : '') + '" style="font-weight:600">' + (s.release_cycle_days ? s.release_cycle_days + '天' : '—') + ' / ' + fmt(s.next_inspect_at) + '</span>';
  h += kv('备注', e(s.notes));
  var img = s.produced_image || s.image;
  if (img) h += '<div style="margin-top:8px;grid-column:1/-1"><img src="' + e(img) + '" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>';
  return h + '</div></div>';
}

function _cardProgress(s) {
  var steps = [['制作完成', s.produced_at], ['正式发行', s.released_at], ['分发保管', s.status === 'IN_CUSTODY' ? '储位 ' + e(s.storage_location) : null]];
  if (s.status === 'CHECKED_OUT') steps.push(['领用中（' + e(s.checkout_user || '—') + '）', s.expected_return_at]);
  if (s.returned_at) steps.push(['最近归还', s.returned_at]);
  if (s.status === 'RETURNING' || s.status === 'RETIRED') steps.push(['退回审核', s.retired_reason || '']);
  if (s.status === 'RETIRED') steps.push(['已作废', s.retired_reason || '']);
  return '<div class="overview-card"><div class="title">流转进度</div><div class="progress-timeline">' +
    steps.map(function(x) { return '<div class="progress-step ' + (x[1] ? 'done' : 'pending') + '"><span class="dot"></span>' + x[0] + (x[1] ? ' · ' + e(fmt(x[1])) : '') + '</div>'; }).join('') +
    '</div></div>';
}

function _cardImages(s, id) {
  var h = '';
  var img = s.produced_image || s.image;
  if (img) h += '<div class="overview-card" style="cursor:pointer;text-align:center;padding:8px" onclick="renderTab(\'image\',' + id + ')"><img src="' + e(img) + '" alt="样品图片" style="width:100px;height:100px;object-fit:cover;border-radius:6px"/></div>';
  if (s.inspect_image) h += '<div class="overview-card" style="cursor:pointer;text-align:center;padding:8px" onclick="renderTab(\'image\',' + id + ')"><div class="title">复检照片</div><img src="' + e(s.inspect_image) + '" alt="复检照片" style="width:100px;height:100px;object-fit:cover;border-radius:6px"/></div>';
  return h;
}

function _cardLogs(s, id) {
  var logs = s.logs || [];
  var h = '<div class="overview-card"><div class="title">操作日志</div>';
  if (logs.length) {
    h += '<div class="log-list">' + logs.slice(0, 2).map(function(l) { return '<div><span class="muted">' + fmt(l.created_at) + '</span> · ' + (ACTION_CN[l.action] || l.action) + ' · ' + (l.role || '') + '/' + (l.dept || '') + '</div>'; }).join('') + '</div>';
  } else {
    h += '<div class="muted">暂无日志</div>';
  }
  if (logs.length > 2) h += '<div style="margin-top:4px"><a class="link" onclick="renderTab(\'logs\',' + id + ')">查看全部 ' + logs.length + ' 条 →</a></div>';
  return h + '</div>';
}

// ═══ 日志 Tab（D2.1 时间线：最新在上；API 按 id DESC 返回，无需 reverse） ═══
// 流向映射：action → '从状态 ➜ 到状态'；自环类（EDIT_CARD/EDIT_STORAGE/INSPECT*）标注自环
var _LOG_FLOW = {
  CREATE: '—',
  PRODUCE: '⬆ NEW ➜ 制作完成',
  RELEASE: '⬆ 制作完成 ➜ 已发行',
  CUSTODY: '⬆ 已发行 ➜ 保管中',
  CHECKOUT: '⬆ 保管中 ➜ 领用中', RETURN_OUT: '⬆ 领用中 ➜ 保管中',
  INSPECT: '⬆ 已发行（自环）', INSPECT_EARLY: '⬆ 已发行（自环）', INSPECT_CUSTODY: '⬆ 保管中（自环）',
  EDIT_CARD: '⬆ 修正标示卡（自环）', EDIT_STORAGE: '⬆ 修改储位（自环）',
  RETURN_REQUEST: '⬆ 保管中 ➜ 退回审核',
  RE_RELEASE: '⬆ 退回审核 ➜ 已发行',
  RETIRE_RECREATE: '⬆ 退回审核 ➜ 已作废',
  RETURN_REJECT: '⬆ 退回审核 ➜ 保管中',
  RETIRE_ONLY: '⬆ 已作废', RECREATE: '⬆ 已作废', FORCE_RETIRE: '⬆ 已作废',
  FORCE_REASSIGN: '⬆ 退回审核（改派）'
};

function _buildLogsTab(s, id) {
  var logs = s.logs || [];
  var h = '<div style="padding:12px 14px"><div style="margin-bottom:8px"><a class="link" onclick="renderTab(\'info\',' + id + ')">← 返回详情</a></div><div class="tl">';
  logs.forEach(function(l) {
    var note = (l.note || '').trim();
    var fold = note.length > 40; // 长备注默认折叠 1 行，点击切换展开/收起
    h += '<div class="tl-item">' +
      '<div><span class="tl-act">' + (ACTION_CN[l.action] || l.action) + '</span><span class="tl-flow">' + (_LOG_FLOW[l.action] || '') + '</span></div>' +
      '<div class="tl-meta">' + fmt(l.created_at) + ' · ' + e(l.role || '—') + (l.dept ? '/' + e(l.dept) : '') + (l.location ? ' · ' + e(l.location) : '') + '</div>' +
      (note ? '<div class="tl-note' + (fold ? ' can-fold folded' : '') + '"' + (fold ? ' title="点击展开/收起" onclick="this.classList.toggle(\'folded\')"' : '') + '>' + e(note) + '</div>' : '') +
      '</div>';
  });
  if (!logs.length) h += '<div class="muted">暂无日志</div>';
  return h + '</div></div>';
}

// ═══ 大图 Tab（弹窗内展示，点击可全屏） ═══
function _buildImageTab(s, id) {
  var mainImg = s.produced_image || s.image;
  var h = '<div style="text-align:center;padding:16px">';
  if (mainImg) h += '<div style="margin-bottom:12px"><img id="detail-main-img" src="' + e(mainImg) + '" style="max-width:100%;max-height:40vh;border-radius:8px;cursor:pointer" onclick="showImageView(this.src)" alt="样品图片"/></div>';
  if (s.inspect_image) h += '<div style="margin-bottom:12px"><div class="label">复检照片</div><img src="' + e(s.inspect_image) + '" style="max-width:100%;max-height:40vh;border-radius:8px;cursor:pointer" onclick="showImageView(\'' + e(s.inspect_image) + '\')" alt="复检照片"/></div>';
  if (!mainImg && !s.inspect_image) h += '<div class="muted">暂无图片</div>';
  h += '<div id="detail-img-history" style="display:none;margin-top:12px"></div>';
  return h + '<div style="margin-top:12px"><a class="link" onclick="renderTab(\'info\',' + id + ')">← 返回详情</a></div></div>';
}

// 历史照片区（T14）：大图 Tab 异步拉取缩略图；点击切主图，无历史则隐藏
async function loadImageHistory(id) {
  var box = document.getElementById('detail-img-history');
  if (!box) return;
  var list = [];
  try { list = await api('GET', '/api/samples/' + id + '/images'); } catch (err) { return; }
  box = document.getElementById('detail-img-history');
  if (!box) return; // 响应到达时 Tab 已切换，丢弃过期渲染
  if (!list || !list.length) return;
  var KIND_CN = { produce: '制作', inspect: '复检' };
  var h = '<div class="label" style="margin-bottom:6px">历史照片</div><div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">';
  list.forEach(function (it) {
    var tip = (KIND_CN[it.kind] || it.kind) + (it.ts ? ' ' + it.ts : '');
    h += '<img src="' + e(it.url) + '" title="' + e(tip) + '" alt="' + e(tip) + '"' +
      ' style="width:72px;height:72px;object-fit:cover;border-radius:6px;cursor:pointer;border:1px solid #ddd"' +
      ' onclick="switchMainImage(\'' + e(it.url) + '\')"/>';
  });
  box.innerHTML = h + '</div>';
  box.style.display = '';
}

// 历史缩略图点击：有主图则切换，无主图则直接全屏查看
function switchMainImage(url) {
  var m = document.getElementById('detail-main-img');
  if (m) m.src = url;
  else showImageView(url);
}

function showImageView(src) {
  var o = document.createElement('div');
  o.className = 'img-overlay';
  o.innerHTML = '<img src="' + e(src) + '" onclick="event.stopPropagation()" alt="样品图片"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:28px;cursor:pointer" onclick="this.parentElement.remove()">×</span>';
  o.onclick = function() { o.remove(); };
  document.body.appendChild(o);
}

function printCard(id) { window.open('/api/samples/' + id + '/card/print' + getPrintSizeQuery(), '_blank'); }


/* --- subsystems/samples/frontend/js/views/detail-card.js --- */
// detail-card.js — 样品详情弹窗·标示卡 Tab（编辑表单/保存CAS/409刷新/dirty 拦截）
// 由 detail.js 拆出（D1 红线拆分，方案A）；bundle 拼接顺序：detail.js → detail-card.js
var _detailDirty = false; // 标示卡未保存修改标记

// D1.5 关闭拦截（foot 按钮；遮罩点击见底部 capture 监听）
function tryCloseDetail(mask) {
  if (_detailDirty && !confirm('标示卡有未保存的修改，确定离开？')) return;
  _detailDirty = false;
  if (mask) closeModal(mask);
}

// 标示卡 Tab 下拉回显（selected 属性在 FAST upgrade 时序下失效，须显式设 value）
function applyDetailCardValues(s){
  var el;
  el=document.getElementById('cd-type');if(el)el.value=s.sample_type||'';
  el=document.getElementById('cd-limit-item');if(el)el.value=s.limit_item||'';
  el=document.getElementById('cd-source');if(el)el.value=s.source_type||'';
}

// ═══ 标示卡 Tab（8字段编辑表单） ═══
function _buildCardTab(s, id) {
  var locked = ['RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'].indexOf(s.status) !== -1;
  var dis = locked ? ' disabled' : '';
  var to = '<fluent-option value="">不适用</fluent-option><fluent-option value="OK"' + (s.sample_type === 'OK' ? ' selected' : '') + '>OK样品</fluent-option><fluent-option value="NG"' + (s.sample_type === 'NG' ? ' selected' : '') + '>NG样品</fluent-option>';
  var lo = '<fluent-option value="">不适用</fluent-option>' + (typeof LIMIT_ITEMS !== 'undefined' ? LIMIT_ITEMS : []).map(function(x) { return '<fluent-option value="' + x.code + '"' + (s.limit_item === x.code ? ' selected' : '') + '>' + x.label + '</fluent-option>'; }).join('');
  var so = '<fluent-option value="">不适用</fluent-option><fluent-option value="C"' + (s.source_type === 'C' ? ' selected' : '') + '>客供(C)</fluent-option><fluent-option value="T"' + (s.source_type === 'T' ? ' selected' : '') + '>元山(T)</fluent-option><fluent-option value="G"' + (s.source_type === 'G' ? ' selected' : '') + '>塔岗(G)</fluent-option>';
  // 【口径】有效期/复检日按 UTC 日期显示（toISOString 即 UTC，前后端三处一致）
  var exp = s.next_inspect_at ? new Date(s.next_inspect_at).toISOString().slice(0, 10) : '—';

  // D1.5 可编辑控件变更 → 置 dirty（容器级冒泡监听，FAST composed 事件可达）
  var h = '<div class="card" style="max-width:720px;margin:0 auto;overflow:hidden;padding:14px" oninput="_detailDirty=true" onchange="_detailDirty=true">';
  if (locked) h += '<div class="card-lock-banner">标示卡已锁定（样品已发行），仅可查看和打印' +
    '<a class="link" style="margin-left:10px" onclick="closeModal(this.closest(\'.modal-mask\'));location.hash=\'#/scan?no=' + encodeURIComponent(s.sample_no) + '\'">需要修正？前往扫码台 →</a></div>'; // D1.4 锁定引导
  h += '<div class="card-grid">' +
    '<div><label>样品类型</label><fluent-select id="cd-type"' + dis + '>' + to + '</fluent-select></div>' +
    '<div><label>限度项目</label><fluent-select id="cd-limit-item"' + dis + '>' + lo + '</fluent-select></div>' +
    '<div><label>来源</label><fluent-select id="cd-source"' + dis + '>' + so + '</fluent-select></div>' +
    '<div><label>有效期</label><span style="font-size:13px;color:#333">' + exp + '</span><span class="muted" style="font-size:11px"> (=复检日，自动同步)</span></div>' +
    '<div><label>版次</label><fluent-text-field id="cd-card-version" value="' + e(s.card_version || '') + '" placeholder="如 01"' + dis + '></fluent-text-field></div>' +
    '<div><label>制作</label><fluent-text-field id="cd-signed-rnd" value="' + e(s.signed_by_rd || '') + '"' + dis + '></fluent-text-field></div>' +
    '<div><label>确认</label><fluent-text-field id="cd-signed-qa" value="' + e(s.signed_by_qa || '') + '"' + dis + '></fluent-text-field></div>' +
    '<div class="full-row"><label>样品数值</label><textarea id="cd-test-data" rows="1" style="resize:none;min-height:32px"' + dis + '>' + e(s.test_data || '') + '</textarea></div>' +
    '<div class="full-row"><label>标准范围</label><textarea id="cd-test-standard" rows="2" style="resize:none;min-height:40px"' + dis + '>' + e(s.test_standard || '') + '</textarea></div>' +
    '</div>' +
    '<div style="margin-top:12px;display:flex;gap:8px">' +
    (locked ? '' : '<fluent-button appearance="accent" id="cd-save-btn" onclick="saveCard(' + id + ')">保存标示卡</fluent-button>') +
    '<fluent-button appearance="neutral" onclick="closeModal(this.closest(\'.modal-mask\'));printCard(' + id + ')">打印标示卡</fluent-button>' +
    '</div>' +
    '<div id="cd-msg" class="muted" style="margin-top:8px"></div></div>';
  return h;
}

async function saveCard(id) {
  await withSubmitLock(document.getElementById('cd-save-btn'), async function() {
    var msg = document.getElementById('cd-msg');
    if (msg) msg.textContent = '保存中...';
    try {
      var p = { sample_type: $('#cd-type').value, limit_item: $('#cd-limit-item').value, source_type: $('#cd-source').value, card_version: $('#cd-card-version').value, test_data: $('#cd-test-data').value, test_standard: $('#cd-test-standard').value, signed_by_rd: $('#cd-signed-rnd').value, signed_by_qa: $('#cd-signed-qa').value,
        // T6: 携带 CAS 版本号；undefined 时 JSON 序列化自动省略
        version: (_detailSample && typeof _detailSample.version === 'number') ? _detailSample.version : undefined };
      await api('PUT', '/api/samples/' + id, p);
      // 保存成功后刷新缓存的样品对象（同时更新 version）
      try { _detailSample = await api('GET', '/api/samples/' + id); } catch (_) {}
      _detailDirty = false; // D1.5 保存成功清除标记
      toast('标示卡已保存', 'ok');
      if (msg && msg.isConnected) msg.textContent = '保存成功';
    } catch (e) {
      // 409：api 层已统一处理（toast + reloadDetail），不重复提示
      if (e && e.status === 409) return;
      if (msg && msg.isConnected) msg.textContent = e.message;
    }
  });
}

// T6: 原地刷新详情弹窗（409 回调用，不重开弹窗避免遮罩堆叠）
async function reloadDetail(id) {
  try {
    var s = await api('GET', '/api/samples/' + id);
    _detailSample = s;
    _detailDirty = false; // 内容被重渲，旧编辑已失效
    var body = document.querySelector('.modal-body');
    if (!body) return;
    body.innerHTML = _buildTabsHTML(s, id, _detailTab) + _buildTabContent(s, id, _detailTab);
    if (_detailTab === 'card') applyDetailCardValues(s);
  } catch (_) {}
}
// T6: 409 冲突时自动刷新详情
onConflictRefresh(function() {
  if (_detailSample && document.querySelector('.modal-mask')) reloadDetail(_detailSample.id);
});

// D1.5 遮罩点击拦截：document capture 抢先于 modal.js 关闭监听（mask 自身 capture 因注册顺序无法抢先）；命中遮罩且 dirty 时 stopPropagation + confirm
document.addEventListener('click', function(ev) {
  var t = ev.target;
  if (!_detailDirty || !t || !t.classList || !t.classList.contains('modal-mask')) return;
  ev.stopPropagation();
  if (confirm('标示卡有未保存的修改，确定离开？')) { _detailDirty = false; closeModal(t); }
}, true);


/* --- subsystems/samples/frontend/js/views/scan-camera.js --- */
// scan-camera.js — 摄像头扫码 + 连续扫码 + 输入辅助
var _scanContinuous=false;
let _camStream=null;

function camProtocolOk(){return location.protocol==='https:';}

async function startCamera(){
  var msg=$('#cam-msg'),video=$('#cam');
  if(!camProtocolOk()){
    msg.innerHTML='<span style="color:#dc2626">摄像头仅 HTTPS 可用，当前为 HTTP。请使用扫码枪或手动输入。</span>';
    return;
  }
  if(!('BarcodeDetector'in window)){
    msg.textContent='当前浏览器不支持摄像头识别，请使用 Chrome/Edge，或直接用扫码枪/手动输入。';
    return;
  }
  try{
    _camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=_camStream;video.style.display='block';await video.play();
    var bd=new BarcodeDetector({formats:['qr_code']});msg.textContent='摄像头已开启，对准二维码…';
    var tick=async function(){
      if(video.readyState>=2){
        try{var cs=await bd.detect(video);if(cs.length){stopCamera();$('#scan-code').value=cs[0].rawValue.trim();doScan();return;}}catch(e){}
      }
      requestAnimationFrame(tick);
    };tick();
  }catch(e){
    if(e.name==='NotAllowedError')msg.textContent='摄像头权限被拒绝，请在浏览器设置中允许摄像头访问。';
    else if(e.name==='NotFoundError')msg.textContent='未检测到摄像头设备，请连接摄像头后重试。';
    else msg.textContent='摄像头启动失败：'+e.message;
  }
}

function stopCamera(){if(_camStream){_camStream.getTracks().forEach(function(t){t.stop();});_camStream=null;$('#cam').style.display='none';}}

function renderCameraSection(){
  return '<details>'+
    '<summary style="cursor:pointer" class="muted">或用手机摄像头扫码 '+
    (location.protocol==='https:'?'<span style="color:var(--ok)">HTTPS ✓</span>':'<span style="color:var(--bad)">HTTP ✗</span>')+
    '</summary>'+
    '<div style="margin-top:10px">'+
      '<fluent-button appearance="neutral" size="small" onclick="startCamera()">📷 开启摄像头</fluent-button>'+
      '<video id="cam" playsinline style="display:none;margin-top:10px;border-radius:8px;max-width:100%"></video>'+
      '<div id="cam-msg" class="muted" style="font-size:12px;margin-top:8px"></div>'+
    '</div>'+
  '</details>';
}

function bindScanInput(){
  var inp=$('#scan-code');
  if(!inp)return;
  inp.onkeydown=function(e){
    if(e.key==='Enter'||e.key==='NumpadEnter'){e.preventDefault();doScan();}
  };
  inp.onblur=function(){
    var s=$('#scan-status');
    if(s)s.innerHTML='⚠ 输入框未聚焦，扫码枪无法输入 — 点此区域或重新扫码即可恢复';
  };
  inp.onfocus=function(){
    var s=$('#scan-status');
    if(s)s.innerHTML='● 已就绪，等待扫码枪…';
  };
}

function refocusScan(){
  var i=$('#scan-code');
  if(i){i.focus();var s=$('#scan-status');if(s)s.innerHTML='● 已就绪，等待扫码枪…';}
}

function afterScanReset(){
  $('#scan-result').innerHTML='';
  $('#scan-code').value='';
  delete window._scanSample;delete window._scanRdUsers;
  refocusScan();
}

function previewScanImg(e){
  var f=e.target.files[0],p=document.getElementById('scan-img-prev');
  if(!f){p.innerHTML='';return;}
  var r=new FileReader();r.onload=function(ev){p.innerHTML='<img src="'+ev.target.result+'" style="max-width:120px;border-radius:6px"/>';};r.readAsDataURL(f);
}

function handleScanSuccess(r){
  var contEl=document.getElementById('scan-cont');
  var contChecked=contEl&&contEl.checked;
  if(r.printCard){
    if(contChecked){
      // T18.3 入队去重 + localStorage 持久化（print-queue.js）
      enqueuePrintCard({id:r.sample.id,sample_no:r.sample.sample_no,name:r.sample.name});
    }
    // T18.1 判定：confirmScan（scan.js）的 POST 为异步，执行到此处时按钮点击手势已失效；
    // 相机扫码路径则全程无用户手势——原 setTimeout 600ms 自动弹窗必被浏览器拦截且无提示，故删除。
    // 占位页模式需在手势点（scan.js confirmScan，本任务范围外）开窗，无法在本文件实施；
    // 兜底为 scan.js T8.2 常驻「重新打印标示卡」按钮（真实点击手势内 window.open）。
  }
  if(contChecked){
    $('#scan-code').value='';
    refocusScan();
    $('#scan-result').innerHTML='<div class="card sample-card" style="border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ '+e(r.sample.sample_no)+' → '+STATUS[r.sample.status]+'</h3>'+
      '<p class="muted">'+(r.sample.next_inspect_at?('下次复检：'+fmt(r.sample.next_inspect_at)):(r.sample.storage_location?('储位：'+e(r.sample.storage_location)+'（'+e(r.sample.custody_dept)+'）'):'已记录'))+'　|　已就绪，可继续扫码</p></div>';
    toast('操作成功，可继续扫码','ok');
  }else{
    $('#scan-result').innerHTML='<div class="card sample-card" style="border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ 操作成功</h3>'+
      '<p>样品 '+e(r.sample.sample_no)+' 状态已更新为：<b>'+STATUS[r.sample.status]+'</b></p>'+
      (r.sample.next_inspect_at?('<p class="muted">下次复检：'+fmt(r.sample.next_inspect_at)+'</p>'):'')+
      (r.sample.storage_location?('<p class="muted">储位：'+e(r.sample.storage_location)+'（'+e(r.sample.custody_dept)+'）</p>'):'')+
      '<fluent-button appearance="accent" size="small" onclick="afterScanReset()">继续扫码</fluent-button></div>';
    toast(r.printCard?'操作成功，请点击「重新打印标示卡」打印':'操作成功','ok');
  }
}

function injectWizardCSS(){
  if(document.getElementById('wiz-css'))return;
  var style=document.createElement('style');
  style.id='wiz-css';
  style.textContent='.wizard-steps{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:6px}'+
    '.wdot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:#e5e7eb;color:#6b7280}'+
    '.wdot.active{background:#2563eb;color:#fff}'+
    '.wdot.done{background:#16a34a;color:#fff}'+
    '.wline{width:32px;height:2px;background:#e5e7eb}'+
    '.wline.done{background:#16a34a}';
  document.head.appendChild(style);
}


/* --- subsystems/samples/frontend/js/views/print-queue.js --- */
// print-queue.js — 连续扫码模式下积累标示卡，批量打印（T18：占位页模式 + 批量单页 + 队列治理）
var printQueue=[]; // {id,sample_no,name}
var PRINT_QUEUE_LS_KEY='sample_print_queue';

// T18.1 占位页模式：在用户手势调用点同步 window.open('about:blank') 拿窗口句柄，
// 异步完成后由调用方 win.location.href=url 填地址；被拦截返回 null，由调用方 toast 提示
function openPrintPlaceholder(){
  var win=null;
  try{win=window.open('about:blank','_blank');}catch(e){}
  return win||null;
}

// T18.3 队列 localStorage 持久化，页面刷新后恢复
function savePrintQueue(){
  try{localStorage.setItem(PRINT_QUEUE_LS_KEY,JSON.stringify(printQueue));}catch(e){}
}
function loadPrintQueue(){
  try{
    var arr=JSON.parse(localStorage.getItem(PRINT_QUEUE_LS_KEY)||'[]');
    if(Array.isArray(arr))printQueue=arr.filter(function(c){return c&&c.id;});
  }catch(e){printQueue=[];}
}

// T18.3 入队按样品 id 去重；上限 50（后端批量打印接口上限）
function enqueuePrintCard(card){
  if(printQueue.some(function(c){return c.id===card.id;})){toast('该样品已在打印队列','err');return false;}
  if(printQueue.length>=50){toast('打印队列已满（50 张），请先打印或清空','err');return false;}
  printQueue.push(card);savePrintQueue();renderPrintQueue();
  return true;
}
function removePrintCard(id){
  printQueue=printQueue.filter(function(c){return c.id!==id;});
  savePrintQueue();renderPrintQueue();
}
function clearPrintQueue(){printQueue=[];savePrintQueue();renderPrintQueue();}

function renderPrintQueue(){
  var pq=document.getElementById('scan-print-queue');
  if(!pq)return;
  if(printQueue.length===0){pq.innerHTML='';return;}
  var chips=printQueue.map(function(c){
    return '<span style="display:inline-flex;align-items:center;gap:2px;background:#fff;border:1px solid #bfdbfe;border-radius:4px;padding:1px 4px">'+
      e(c.sample_no)+
      '<a href="javascript:void(0)" onclick="removePrintCard('+c.id+')" style="color:#dc2626;text-decoration:none" title="移除">✕</a>'+
    '</span>';
  }).join(' ');
  pq.innerHTML='<div style="padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af">'+
    '<div style="display:flex;align-items:center;gap:8px">'+
      '📋 已积累 <b>'+printQueue.length+'</b> 张标示卡'+
      '<fluent-button appearance="neutral" size="small" onclick="printAllCards()" style="margin-left:auto;font-size:10px">打印全部</fluent-button>'+
      '<fluent-button appearance="neutral" size="small" onclick="clearPrintQueue()" style="font-size:10px">清空</fluent-button>'+
    '</div>'+
    '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">'+chips+'</div>'+
  '</div>';
}

// T18.2 批量单页：一次 window.open 调后端多卡打印接口（点击手势内，可靠）；
// 打开成功才清队列；被拦截保留队列并提示
function printAllCards(){
  if(printQueue.length===0)return;
  var ids=printQueue.map(function(c){return c.id;});
  var url='/api/samples/cards/print?ids='+ids.join(',')+getPrintSizeQuery().replace(/^\?/,'&');
  var win=null;
  try{win=window.open(url,'_blank');}catch(e){}
  if(!win){toast('浏览器拦截了打印窗口，请允许弹出窗口或使用重打按钮，队列已保留','err');return;}
  clearPrintQueue();
}

// T18.3 启动时恢复队列；SPA 路由切换后扫码台重挂载时补渲染（队列已持久化，不再随页面离开丢失，
// 故移除原 beforeunload「离开将丢失」提醒）
loadPrintQueue();
function _watchPrintQueueView(){
  var view=document.getElementById('view');
  if(!view)return;
  new MutationObserver(function(){
    if(printQueue.length&&document.getElementById('scan-print-queue'))renderPrintQueue();
  }).observe(view,{childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',_watchPrintQueueView);
else _watchPrintQueueView();


/* --- subsystems/samples/frontend/js/views/card-fields.js --- */
// card-fields.js — 标示卡字段状态判断/表格组件（scan/detail 共用）
// 依赖：LIMIT_ITEMS (constants.js)

// 生成 LIMIT_ITEMS 下拉选项，预选 matched 项
function limitItemOptions(matched){
  return LIMIT_ITEMS.map(function(item){
    return '<fluent-option value="'+item.code+'"'+(item.code===matched?' selected':'')+'>'+item.label+'</fluent-option>';
  }).join('');
}

// 标示卡字段状态判断
function cardFieldStatus(s,field){
  var val=s[field]||'';
  if(field==='sample_type'||field==='limit_item'){
    return val?'filled':'required_empty';
  }
  return val?'filled':'empty';
}
// 下拉回显：innerHTML 注入 selected 属性在 FAST upgrade 时序下失效（2026-08-07 实测），须注入后显式设置 value
function applyCardFieldValues(s){
  var el;
  el=document.getElementById('scan-card-type');if(el)el.value=s.sample_type||'';
  el=document.getElementById('scan-card-item');if(el)el.value=s.limit_item||'';
  el=document.getElementById('scan-card-source');if(el)el.value=s.source_type||'';
}

// 标示卡字段表格组件，三处复用（RELEASE Step2, INSPECT, 详情弹窗标示卡Tab）
function buildCardFieldTable(s,editable,suggestedVersion){
  var t=s.sample_type||'', l=s.limit_item||'', src=s.source_type||'';
  var ver=suggestedVersion||s.card_version||'', data=s.test_data||'', std=s.test_standard||'';
  var typeSt=cardFieldStatus(s,'sample_type'), itemSt=cardFieldStatus(s,'limit_item');
  var srcSt=cardFieldStatus(s,'source_type');
  var verSt=cardFieldStatus(s,'card_version'), dataSt=cardFieldStatus(s,'test_data');
  var stdSt=cardFieldStatus(s,'test_standard');

  function mark(field,status){
    if(status==='required_empty')return '<span style="color:#dc2626;font-size:11px;margin-left:4px">✗ 必填</span>';
    if(status==='filled')return '<span style="color:#16a34a;font-size:11px;margin-left:4px">✓'+(s.signed_by_rd?' RD已填':'')+'</span>';
    return '';
  }

  var ro=editable?'':'disabled';
  return '<table style="width:100%;font-size:12px;border-collapse:collapse">'+
    '<tr><td style="padding:4px 0;width:70px;color:#6b7280">样品类型 *</td>'+
      '<td style="padding:4px 0"><fluent-select id="scan-card-type" '+ro+'><fluent-option value="">请选择</fluent-option><fluent-option value="OK"'+(t==='OK'?' selected':'')+'>OK样品</fluent-option><fluent-option value="NG"'+(t==='NG'?' selected':'')+'>NG样品</fluent-option></fluent-select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('sample_type',typeSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">限度项目 *</td>'+
      '<td style="padding:4px 0"><fluent-select id="scan-card-item" '+ro+'><fluent-option value="">请选择</fluent-option>'+limitItemOptions(l)+'</fluent-select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('limit_item',itemSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">来源</td>'+
      '<td style="padding:4px 0"><fluent-select id="scan-card-source" '+ro+'><fluent-option value="">未指定</fluent-option><fluent-option value="C"'+(src==='C'?' selected':'')+'>客供(C)</fluent-option><fluent-option value="T"'+(src==='T'?' selected':'')+'>元山(T)</fluent-option><fluent-option value="G"'+(src==='G'?' selected':'')+'>元将五金塔岗分厂(G)</fluent-option></fluent-select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('source_type',srcSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">版次</td>'+
      '<td style="padding:4px 0"><fluent-text-field id="scan-card-ver" value="'+e(ver)+'" '+ro+' style="font-size:12px;width:100%"></fluent-text-field>'+(editable?'<div style="font-size:11px;color:#6b7280;margin-top:2px">复检/再发行自动 +1；人工修正只能改为 ≥ 当前版次的数字（01~99）</div>':'')+'</td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('card_version',verSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td>'+
      '<td style="padding:4px 0"><textarea id="scan-card-data" rows="2" style="resize:vertical;font-size:12px;width:100%" '+ro+'>'+e(data)+'</textarea></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('test_data',dataSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">标准范围</td>'+
      '<td style="padding:4px 0"><textarea id="scan-card-standard" rows="2" style="resize:vertical;font-size:12px;width:100%" '+ro+'>'+e(std)+'</textarea></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('test_standard',stdSt)+'</td></tr>'+
  '</table>';
}


/* --- subsystems/samples/frontend/js/views/scan-wizard.js --- */
// scan-wizard.js — RELEASE 分步向导（依赖 card-fields.js 的 buildCardFieldTable）
// 计算下一个版次号（与后端逻辑一致）
function nextCardVersion(c){var m=String(c||'').match(/\d+/);var n=m?parseInt(m[0],10):0;return String(Math.min(n+1,99)).padStart(2,'0');}
var wizardSample=null; // 当前向导的样品数据

// 向导进行期间锁定编号输入框（防正待确认时被扫码枪误改导致张冠李戴）
function lockScanCode(no){
  var sc=$('#scan-code');if(!sc)return;
  sc.value=no;sc.readOnly=true;
  // 钩住「取消/继续扫码」复位入口，向导退出时解锁（afterScanReset 定义在 scan-camera.js）
  if(!window._wizResetHooked&&typeof window.afterScanReset==='function'){
    window._wizResetHooked=true;
    var _origAfterScanReset=window.afterScanReset;
    window.afterScanReset=function(){unlockScanCode();_origAfterScanReset();};
  }
}
function unlockScanCode(){
  var sc=$('#scan-code');if(sc)sc.readOnly=false;
}

function buildReleaseWizard(s,isReRelease){
  wizardSample=s;
  wizardSample._isReRelease=isReRelease||false;
  lockScanCode(s.sample_no);
  return renderWizardStep1(s);
}

function renderWizardStep1(s){
  var cycle=s._wizCycle||'365';
  var nextDate=new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10);
  return '<div class="wizard-steps">'+
      '<span class="wdot active">1</span><span class="wline"></span>'+
      '<span class="wdot">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<label>复检周期（天）<b class="required">*</b></label>'+
      '<fluent-text-field id="scan-cycle" type="number" min="1" value="'+cycle+'" placeholder="如 365" oninput="updateWizardNextDate()" style="width:100px;text-align:center"></fluent-text-field>'+
      '<span class="muted" style="margin-left:8px;font-size:12px" id="wiz-next-date">→ 下次复检：'+nextDate+'</span>'+
    '</div>'+
    '<div style="text-align:right;margin-top:14px">'+
      '<fluent-button appearance="accent" size="small" onclick="goWizardStep(2)">下一步：填写标示卡 →</fluent-button>'+
    '</div>'
  ;
}
function updateWizardNextDate(){
  var days=parseInt($('#scan-cycle').value)||365;
  var d=new Date(Date.now()+days*864e5).toISOString().slice(0,10);
  var el=document.getElementById('wiz-next-date');if(el)el.textContent='→ 下次复检：'+d;
}

function renderWizardStep2(s){
  // 版次默认值：已填写过则回显用户值，否则 RE_RELEASE 自动 +1 / 新发行取 '01'
  var verDefault=s._wizCardVersion||(s._isReRelease?nextCardVersion(s.card_version):(s.card_version||'01'));
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<div class="scan-section-title">标示卡审查</div>'+
      buildCardFieldTable(s,true,verDefault)+
      '<div class="muted" style="font-size:12px;margin-top:6px">品保确认人：<b>'+e(me.display_name||me.username)+'</b>（自动签署）</div>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<fluent-button appearance="neutral" size="small" onclick="goWizardStep(1)">← 上一步</fluent-button>'+
      '<fluent-button appearance="accent" size="small" onclick="goWizardStep(3)">下一步：确认发行 →</fluent-button>'+
    '</div>'
  ;
}

function renderWizardStep3(s){
  var cycle=s._wizCycle||'365';
  var t=s._wizCardType||'',l=s._wizCardItem||'';
  var ok=t&&l;
  var confirmAction=s._isReRelease?'RE_RELEASE':'RELEASE';
  var confirmLabel=s._isReRelease?'确认重新发行（品保）':'确认正式发行（品保）';
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<table style="width:100%;font-size:12px">'+
        '<tr><td style="color:#6b7280;padding:3px 0">复检周期</td><td>'+cycle+' 天 → 下次复检 '+new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10)+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">样品类型</td><td>'+(t||'<span style="color:#dc2626">未填写</span>')+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">限度项目</td><td>'+(l||'<span style="color:#dc2626">未填写</span>')+'</td></tr>'+
      '</table>'+
      (!ok?'<p style="color:#dc2626;font-size:11px;margin-top:8px">⚠ 标示卡必填字段未完成，请返回 Step2 补填</p>':'')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<fluent-button appearance="neutral" size="small" onclick="goWizardStep(2)">← 返回修改</fluent-button>'+
      '<fluent-button appearance="accent" id="scan-confirm" onclick="confirmScan(\''+confirmAction+'\',this)"'+
        (!ok?' disabled':'')+'>'+confirmLabel+'</fluent-button>'+
    '</div>'
  ;
}

function goWizardStep(step){
  var s=wizardSample;if(!s)return;
  // 离开Step1前持久化复检周期值（后续step中DOM元素已被替换）
  if(step>1){var cyc=$('#scan-cycle');if(cyc)s._wizCycle=cyc.value;}
  // 从 Step3 返回 Step2：将已填标示卡字段回写原始字段，供 buildCardFieldTable 回显（修复返回修改丢字段）
  if(step===2&&s._wizCardType){
    s.sample_type=s._wizCardType;
    s.limit_item=s._wizCardItem;
    if(s._wizCardSource)s.source_type=s._wizCardSource;
    if(s._wizCardVersion)s.card_version=s._wizCardVersion;
    if(s._wizCardData)s.test_data=s._wizCardData;
    // 标准范围允许空值回写（RD 可能未填），仅当已进入过 Step3 时覆盖
    if(s._wizCardStandard!==undefined)s.test_standard=s._wizCardStandard;
  }
  if(step===3){
    // 离开Step2前持久化标示卡字段值（Step3 DOM中这些元素已不存在）
    var tEl=$('#scan-card-type'),lEl=$('#scan-card-item');
    var t=tEl?tEl.value:'',l=lEl?lEl.value:'';
    if(!t||!l){toast('请填写样品类型和限度项目（必填）','err');return;}
    s._wizCardType=t;s._wizCardItem=l;
    var srcEl=$('#scan-card-source');s._wizCardSource=srcEl?srcEl.value:'';
    var verEl=$('#scan-card-ver');s._wizCardVersion=verEl?verEl.value.trim():'';
    var dataEl=$('#scan-card-data');s._wizCardData=dataEl?dataEl.value.trim():'';
    var stdEl=$('#scan-card-standard');s._wizCardStandard=stdEl?stdEl.value.trim():'';
  }
  var html;
  if(step===1)html=renderWizardStep1(s);
  else if(step===2)html=renderWizardStep2(s);
  else if(step===3)html=renderWizardStep3(s);
  else return;
  var box=$('#scan-result');
  // 仅替换表单区域，保留样品头部信息（编号/名称/规格/储位等）
  var formEl=box.querySelector('#scan-action-form');
  if(formEl)formEl.innerHTML=html;
  // innerHTML 注入的 selected 属性不生效，需显式回显下拉值
  if(step===2)applyCardFieldValues(s);
}


/* --- subsystems/samples/frontend/js/views/scan-return-actions.js --- */
// scan-return-actions.js — 退回审核操作的渲染函数（从 scan.js 提取，降低 scan.js 行数）
// 依赖：buildReleaseWizard (scan-wizard.js)、window._scanRdUsers (scan.js doScan 设置)

function renderReturnActions(action,s){
  if(action==='RETIRE_ONLY'){
    return '<label>作废原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述作废原因"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#dc2626" onclick="confirmScan(\'RETIRE_ONLY\',this)">确认作废</fluent-button></div>';
  }else if(action==='RETURN_REJECT'){
    return '<label>拒绝理由 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请填写拒绝退回的理由"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'RETURN_REJECT\',this)">拒绝退回</fluent-button></div>';
  }else if(action==='RELEASE'){
    // 修复：RELEASE 漏接分步向导（原仅 RE_RELEASE 接入，导致 QA 发行表单空白）
    return buildReleaseWizard(s,false);
  }else if(action==='RE_RELEASE'){
    return buildReleaseWizard(s,true);
  }else if(action==='RETIRE_RECREATE'){
    var rdOptions=(window._scanRdUsers||[]).map(function(u){return '<fluent-option value="'+u.id+'">'+e(u.display_name)+' ('+e(u.dept||'')+')</fluent-option>';}).join('');
    return '<label>指派研发人员 *</label><fluent-select id="scan-rd-select"><fluent-option value="">请选择RD</fluent-option>'+rdOptions+'</fluent-select>'+
      '<label>备注</label><fluent-text-field id="scan-note" placeholder="如：需重新制作"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#f59e0b" onclick="confirmScan(\'RETIRE_RECREATE\',this)">确认作废并指派重做</fluent-button></div>';
  }else if(action==='FORCE_REASSIGN'){
    // T12.3 ADMIN 兜底：强制改派（下拉数据源同 RETIRE_RECREATE，/api/resolve 在 RETURNING 下对全角色返回 rdUsers）
    var frdOptions=(window._scanRdUsers||[]).map(function(u){return '<fluent-option value="'+u.id+'">'+e(u.display_name)+' ('+e(u.dept||'')+')</fluent-option>';}).join('');
    return '<p style="font-size:12px;color:#b45309">管理员兜底：退回审核流程卡死时，强制改派重做研发人员（提交前将二次确认）</p>'+
      '<label>改派研发人员 *</label><fluent-select id="scan-rd-select"><fluent-option value="">请选择RD</fluent-option>'+frdOptions+'</fluent-select>'+
      '<label>备注</label><fluent-text-field id="scan-note" placeholder="如：原指派人不可用，改派"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#b45309" onclick="confirmScan(\'FORCE_REASSIGN\',this)">强制改派</fluent-button></div>';
  }else if(action==='FORCE_RETIRE'){
    return '<p style="font-size:12px;color:#dc2626">管理员兜底：退回审核流程卡死时，强制作废该样品（不可撤销，提交前将二次确认）</p>'+
      '<label>作废原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述强制作废原因"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#dc2626" onclick="confirmScan(\'FORCE_RETIRE\',this)">强制作废</fluent-button></div>';
  }else if(action==='RECREATE'){
    return '<p class="muted">基于样品 <b>'+e(s.sample_no)+'</b>（'+e(s.name||'—')+'）创建替代品</p>'+
      '<p style="font-size:12px;color:#6b7280">将自动复制标示卡信息，新样品编号自动分配</p>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'RECREATE\',this)">确认创建替代品</fluent-button></div>';
  }
  return '';
}


/* --- subsystems/samples/frontend/js/views/scan.js --- */
// scan.js — 扫码台核心逻辑（标示卡字段→card-fields.js，分步向导→scan-wizard.js，打印队列→print-queue.js，摄像头→scan-camera.js）
// T8: ACTION_CN 定义在共享 api-base.js（本批不可改），本地补充 INSPECT_CUSTODY 中文名
var SCAN_ACTION_CN_EXT={INSPECT_CUSTODY:'到期复检',FORCE_REASSIGN:'强制改派',FORCE_RETIRE:'强制作废'};
function viewScan(){
  var v=$('#view');
  v.innerHTML='<div class="card" style="max-width:560px;margin:0 auto">'+
    '<div class="scan-box" id="scan-box" onclick="if(window.getSelection().toString()===\'\')refocusScan()">'+
      '<div class="muted" style="margin-bottom:10px">'+
        '<b>主方式：</b>用 <b>二维码扫描枪</b> 扫样品码，或 <b>手动输入</b> 样品编号（13 位编码如 G-YD9015-Q-001-01，兼容 SM-XXXXXX），按回车 / 点「确认扫码」即可。<br/>'+
        '<b>次方式：</b>无扫码枪的手机端，可用下方「摄像头扫码」（需 HTTPS）。'+
      '</div>'+
      '<input id="scan-code" class="scan-input" placeholder="扫描或输入样品编号（13位编码 / SM-XXXXXX）" autocomplete="off"/>'+
      '<small class="muted" style="font-size:11px">格式：13 位编码（G-YD9015-Q-001-01）或 SM-XXXXXX</small>'+
      '<div style="margin-top:14px">'+
        '<fluent-button appearance="accent" size="small" onclick="doScan()">确认扫码</fluent-button>'+
        '<label class="muted" style="margin-left:12px;font-size:13px;cursor:pointer">'+
          '<input type="checkbox" id="scan-cont" onchange="refocusScan()"/> 连续扫码（自动清空并聚焦，适合扫码枪批量作业）'+
        '</label>'+
      '</div>'+
      '<div id="scan-status" class="muted" style="font-size:12px;margin-top:8px;color:var(--ok)">● 已就绪，等待扫码枪…</div>'+
      '<hr style="margin:16px 0;border:none;border-top:1px dashed var(--line)"/>'+
      renderCameraSection()+
    '</div>'+
    '<div id="scan-result"></div>'+
    '<div id="scan-print-queue"></div>'+
  '</div>';
  bindScanInput();
  refocusScan();
  injectWizardCSS();
  // 支持 #/scan?no=SM-000011 直达预填（工作台下钻跳转用）
  var m = (location.hash || '').match(/[?&]no=([^&]+)/);
  if (m) { $('#scan-code').value = decodeURIComponent(m[1]); doScan(); }
}
var _scanReqSeq=0;
async function doScan(){
  var seq=++_scanReqSeq;
  var code=$('#scan-code').value.trim();
  if(!/^(SM-\d{4,}|[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2})$/.test(code)){toast('编号格式错误：支持 SM-XXXXXX 或 13 位编码（如 G-YD9015-Q-001-01）','err');return refocusScan();}
  var box=$('#scan-result');box.innerHTML='<div class="muted">解析中…</div>';
  try{
    var data=await api('GET','/api/resolve?code='+encodeURIComponent(code));
    if(seq!==_scanReqSeq)return; // 已有更新的扫码请求，丢弃过期响应（防竞态）
    window._scanRdUsers=data.rdUsers||[];
    renderScanAction(data.sample,data.allowedActions);
  }catch(err){if(seq!==_scanReqSeq)return;box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><p style="color:var(--bad)">'+e(err.message)+'</p></div>';}
}
function renderScanAction(s,actions){
  var box=$('#scan-result');
  if(!actions||actions.length===0){
    box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><h3>'+e(s.sample_no)+'</h3>'+
      '<p>当前状态：<b>'+STATUS[s.status]+'</b></p><p class="muted">你的角色（'+ROLE[me.role]+'）无法推进该样品，请确认流程顺序或由对应部门操作。</p></div>';
    return;
  }
  window._scanSample=s;
  var buttonRow=actions.length>1?actions.map(function(a){
    var cn=ACTION_CN[a]||SCAN_ACTION_CN_EXT[a]||a;
    var label=CONFIRM_ACTIONS.has(a)?'确认'+cn:cn;
    return '<fluent-button appearance="accent" size="small" onclick="showScanActionForm(\''+a+'\')">'+label+'</fluent-button>';
  }).join(' '):'';
  box.innerHTML='<div class="card sample-card">'+
    '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">'+e(s.sample_no)+'</h3>'+statusBadge(s)+'</div>'+
    '<div class="field"><span>名称</span><span>'+e(s.name||'—')+'</span></div>'+
    '<div class="field"><span>规格</span><span>'+e(s.spec||'—')+'</span></div>'+
    '<div class="field"><span>储位</span><span class="muted">'+e(s.storage_location||'—')+'</span></div>'+
    '<div class="field"><span>发行时间</span><span class="muted">'+fmt(s.released_at)+'</span></div>'+
    (s.retired_reason?'<div class="field"><span>作废原因</span><span class="muted">'+e(s.retired_reason)+'</span></div>':'')+
    (buttonRow?'<div style="margin-top:12px">'+buttonRow+'</div>':'')+
    '<div id="scan-action-form" style="margin-top:12px"></div>'+
    '<div style="margin-top:8px"><fluent-button appearance="neutral" size="small" onclick="afterScanReset()">取消</fluent-button></div>'+
  '</div>';
  showScanActionForm(actions[0]);
}
function showScanActionForm(action){
  var s=window._scanSample;
  var formEl=$('#scan-action-form');
  if(!formEl)return;
  var html='';
  if(action==='PRODUCE'){
    html='<label>制作照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div>'+
      '<label>备注</label><fluent-text-field id="scan-note" placeholder="如：制作完成"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'PRODUCE\',this)">确认制作完成</fluent-button></div>';
  }else if(action==='INSPECT'){
    html='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><fluent-text-field id="scan-note" placeholder="如：复检通过"></fluent-text-field>'+
      '<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
      '<p class="muted" style="font-size:11px">复检时可更新版次/测试数据</p>'+
      '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;color:#6b7280">版次</td><td><fluent-text-field id="scan-card-ver" value="'+e(s.card_version||'')+'" style="width:100%"></fluent-text-field></td></tr>'+
      '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td><td><textarea id="scan-card-data" rows="2" style="resize:vertical;width:100%">'+e(s.test_data||'')+'</textarea></td></tr></table>'+
      '</details>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'INSPECT\',this)">确认复检完成</fluent-button></div>';
  }else if(action==='INSPECT_CUSTODY'){
    // T8 保管中到期复检：复用 INSPECT 表单结构 + 周期输入框（留空=沿用原周期，后端兜底 400）
    var curCyc=(s&&s.release_cycle_days)?String(s.release_cycle_days):'';
    html='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div>'+
      '<label>复检周期（天）</label><fluent-text-field id="scan-cycle" type="number" min="1" max="3650" placeholder="'+(curCyc?('留空沿用当前 '+e(curCyc)+' 天'):'如 365')+'" style="width:190px"></fluent-text-field>'+
      '<label>复检结论 / 备注</label><fluent-text-field id="scan-note" placeholder="如：复检通过"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'INSPECT_CUSTODY\',this)">确认到期复检</fluent-button></div>';
  }else if(action==='CUSTODY'){
    html='<label>保管储位 *</label><fluent-text-field id="scan-loc" placeholder="如 A区-3架-2层"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'CUSTODY\',this)">确认接收保管</fluent-button></div>';
  }else if(action==='CHECKOUT'){
    // 领出表单（2026-09-05）：领用人/部门（默认当前用户）/领用时长（小时）+ 应还时间实时预览
    html='<label>领用人 *</label><fluent-text-field id="scan-co-user" placeholder="如 张三" value="'+e(me.display_name||me.username||'')+'"></fluent-text-field>'+
      '<label>领用部门</label><fluent-text-field id="scan-co-dept" placeholder="留空默认当前部门" value="'+e(me.dept||'')+'"></fluent-text-field>'+
      '<label>领用时长（小时）*</label><fluent-text-field id="scan-co-hours" type="number" min="1" max="8760" placeholder="如 24" oninput="previewCheckoutDue()"></fluent-text-field>'+
      '<p class="muted" id="scan-co-due" style="font-size:12px;min-height:16px"></p>'+
      '<label>领用备注</label><fluent-text-field id="scan-note" placeholder="如：产线对比测试用"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'CHECKOUT\',this)">确认领出</fluent-button></div>';
  }else if(action==='RETURN_OUT'){
    // 归还表单：展示当前借出信息供核对，备注选填
    html='<p style="font-size:13px">当前领用人：<b>'+e(s.checkout_user||'—')+'</b>（'+e(s.checkout_dept||'—')+'）</p>'+
      '<p class="muted" style="font-size:12px">领出于 '+fmt(s.checkout_at)+' · 应还 '+fmt(s.expected_return_at)+(s.expected_return_at&&new Date(s.expected_return_at).getTime()<Date.now()?' <b style="color:var(--bad)">（已超时）</b>':'')+'</p>'+
      '<label>归还备注</label><fluent-text-field id="scan-note" placeholder="如：外观无异常，已归还"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'RETURN_OUT\',this)">确认归还入库</fluent-button></div>';
  }else if(action==='EDIT_CARD'){
    html=buildCardFieldTable(s,true)+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'EDIT_CARD\',this)">保存修正 + 打印标示卡</fluent-button></div>';
  }else if(action==='EDIT_STORAGE'){
    html='<label>当前储位</label><p class="muted">'+e(s.storage_location||'未设置')+'</p>'+
      '<label>新储位 *</label><fluent-text-field id="scan-loc" placeholder="如 A区-3架-2层" value="'+e(s.storage_location||'')+'"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'EDIT_STORAGE\',this)">确认修改储位</fluent-button></div>';
  }else if(action==='RETURN_REQUEST'){
    html='<label>退回原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述样品存在的问题"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#f59e0b" onclick="confirmScan(\'RETURN_REQUEST\',this)">提交退回申请</fluent-button></div>';
  }else{
    html=renderReturnActions(action,s);
    if(!html){formEl.innerHTML='';return;}
  }
  formEl.innerHTML=html;
  // innerHTML 注入的 selected 属性不生效，需显式回显下拉值
  if(action==='EDIT_CARD')applyCardFieldValues(s);
}
// T8: 收集 INSPECT_CUSTODY 复检周期——留空=沿用原周期；填写则前端软校验 1~3650 整数（后端仍兜底 400）
// 返回 false 表示校验失败（已 toast），调用方中止提交
function collectCustodyCycle(body){
  var el=document.getElementById('scan-cycle');
  var v=el&&el.value?el.value.trim():'';
  if(!v)return true;
  var n=Number(v);
  if(!Number.isInteger(n)||n<1||n>3650){toast('复检周期须为 1~3650 天的整数（留空则沿用原周期）','err');return false;}
  body.cycleDays=n;return true;
}
// 领用（2026-09-05）：应还时间实时预览——时长输入变化时计算 now+时长 并回显
function previewCheckoutDue(){
  var el=document.getElementById('scan-co-hours');
  var tip=document.getElementById('scan-co-due');
  if(!el||!tip)return;
  var n=Number(el.value);
  if(!el.value||!Number.isInteger(n)||n<1||n>8760){tip.textContent='';return;}
  var due=new Date(Date.now()+n*3600000);
  tip.textContent='预计应还时间：'+fmt(due.toISOString())+'（'+n+' 小时后）';
}
// 收集 CHECKOUT 表单：领用人必填、时长前端软校验 1~8760 整数（后端仍兜底 400）
// 返回 false 表示校验失败（已 toast），调用方中止提交
function collectCheckoutPayload(body){
  var uEl=document.getElementById('scan-co-user');
  var dEl=document.getElementById('scan-co-dept');
  var hEl=document.getElementById('scan-co-hours');
  var user=uEl&&uEl.value?uEl.value.trim():'';
  if(!user){toast('请填写领用人','err');return false;}
  var hours=hEl&&hEl.value?Number(hEl.value.trim()):NaN;
  if(!Number.isInteger(hours)||hours<1||hours>8760){toast('领用时长须为 1~8760 小时的整数','err');return false;}
  body.checkout_user=user;
  if(dEl&&dEl.value.trim())body.checkout_dept=dEl.value.trim();
  body.durationHours=hours;
  return true;
}
// 从向导状态收集 RELEASE/RE_RELEASE 公共字段（去重：原两分支字段完全相同）
function collectWizardPayload(body){
  body.cycleDays=(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'365');
  body.sample_type=wizardSample&&wizardSample._wizCardType?wizardSample._wizCardType:'';
  body.limit_item=wizardSample&&wizardSample._wizCardItem?wizardSample._wizCardItem:'';
  if(wizardSample&&wizardSample._wizCardSource)body.source_type=wizardSample._wizCardSource;
  if(wizardSample&&wizardSample._wizCardVersion)body.card_version=wizardSample._wizCardVersion;
  if(wizardSample&&wizardSample._wizCardData)body.test_data=wizardSample._wizCardData;
  if(wizardSample&&wizardSample._wizCardStandard)body.test_standard=wizardSample._wizCardStandard;
}
async function confirmScan(action,btn){
  await withSubmitLock(btn||null,async function(){
  var code=document.getElementById('scan-code').value.trim();
  // 向导流程（RELEASE/RE_RELEASE）：编号以向导样品为准，不再信任实时输入框；
  // 兜底比对：输入框值与向导样品编号不一致（如 Step3 待确认时被扫码枪误改）则中止提交
  var isWizard=(action==='RELEASE'||action==='RE_RELEASE')&&wizardSample;
  if(isWizard){
    if(code!==wizardSample.sample_no){toast('编号与向导样品不一致（向导样品：'+wizardSample.sample_no+'），已中止提交，请重新扫码确认','err');return;}
    code=wizardSample.sample_no;
  }
  var body={code:code,action:action};
  // T12.3: ADMIN 兜底转移二次确认（高危操作，先拦截确认再提交）
  if(action==='FORCE_REASSIGN'||action==='FORCE_RETIRE'){
    if(!confirm(action==='FORCE_REASSIGN'?'确认强制改派该样品的重做研发人员？':'确认强制作废该样品？此操作不可撤销！'))return;
  }
  if(action==='PRODUCE'||action==='INSPECT'||action==='INSPECT_CUSTODY'){
    var f=document.getElementById('scan-img').files[0];
    if(!f){toast('请上传照片','err');return;}
    body.image=await new Promise(function(res,rej){
      var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsDataURL(f);
    });
    var noteEl=document.getElementById('scan-note');if(noteEl&&noteEl.value.trim())body.note=noteEl.value.trim();
  }
  if(action==='INSPECT'){
    var verEl=document.getElementById('scan-card-ver');if(verEl&&verEl.value.trim())body.card_version=verEl.value.trim();
    var dataEl=document.getElementById('scan-card-data');if(dataEl&&dataEl.value.trim())body.test_data=dataEl.value.trim();
  }
  if(action==='INSPECT_CUSTODY'&&!collectCustodyCycle(body))return;
  if(action==='CHECKOUT'&&!collectCheckoutPayload(body))return;
  if(action==='RELEASE'||action==='RE_RELEASE'){collectWizardPayload(body);}
  if(action==='CUSTODY'||action==='EDIT_STORAGE'){body.location=document.getElementById('scan-loc').value;}
  if(action==='RETURN_REQUEST'||action==='RETIRE_ONLY'||action==='RETURN_REJECT'||action==='CHECKOUT'||action==='RETURN_OUT'){
    var noteEl2=document.getElementById('scan-note');if(noteEl2&&noteEl2.value.trim())body.note=noteEl2.value.trim();
  }
  if(action==='RETIRE_RECREATE'){
    var rdEl=document.getElementById('scan-rd-select');if(rdEl&&rdEl.value)body.retire_assigned_rd=rdEl.value;
    var noteEl3=document.getElementById('scan-note');if(noteEl3&&noteEl3.value.trim())body.note=noteEl3.value.trim();
  }
  if(action==='FORCE_REASSIGN'){
    var frdEl=document.getElementById('scan-rd-select');if(frdEl&&frdEl.value)body.retire_assigned_rd=frdEl.value;
    var fnoteEl=document.getElementById('scan-note');if(fnoteEl&&fnoteEl.value.trim())body.note=fnoteEl.value.trim();
  }
  if(action==='FORCE_RETIRE'){
    var fnoteEl2=document.getElementById('scan-note');if(fnoteEl2&&fnoteEl2.value.trim())body.note=fnoteEl2.value.trim();
  }
  if(action==='EDIT_CARD'){
    var tEl=$('#scan-card-type');if(tEl&&tEl.value)body.sample_type=tEl.value;
    var lEl=$('#scan-card-item');if(lEl&&lEl.value)body.limit_item=lEl.value;
    var sEl=$('#scan-card-source');if(sEl&&sEl.value)body.source_type=sEl.value;
    var verEl2=document.getElementById('scan-card-ver');if(verEl2&&verEl2.value!==undefined)body.card_version=verEl2.value.trim();
    var dataEl2=document.getElementById('scan-card-data');if(dataEl2&&dataEl2.value!==undefined)body.test_data=dataEl2.value.trim();
    var stdEl2=document.getElementById('scan-card-standard');if(stdEl2&&stdEl2.value!==undefined)body.test_standard=stdEl2.value.trim();
  }
  try{
    var r=await api('POST','/api/scan',body);
    handleScanSuccess(r);
    if(r&&r.printCard&&r.sample&&r.sample.id)appendReprintBtn(r.sample.id); // T8.2 常驻重新打印兜底
    if(isWizard){wizardSample=null;unlockScanCode();} // 向导提交成功：清除向导状态并解锁编号输入框
  }catch(e){toast(e.message,'err');}
  });
}

// T8.2: 成功提示条常驻「重新打印标示卡」按钮——setTimeout 自动弹窗被浏览器拦截时的手动兜底
// （用户手势 onclick 内触发 window.open，新窗口；打印触发根治在批次 2）
function appendReprintBtn(sampleId){
  var box=document.getElementById('scan-result');
  var card=box?box.querySelector('.sample-card'):null;
  if(!card)return;
  var btn=document.createElement('fluent-button');
  btn.setAttribute('appearance','neutral');btn.setAttribute('size','small');
  btn.style.marginLeft='8px';
  btn.textContent='🖨 重新打印标示卡';
  btn.onclick=function(){window.open('/api/samples/'+sampleId+'/card/print'+(typeof getPrintSizeQuery==='function'?getPrintSizeQuery():''),'_blank');};
  card.appendChild(btn);
}

// T6: 409 冲突时自动刷新当前扫码结果（注册到 api.js 的统一冲突回调）
onConflictRefresh(function(){
  var codeEl=document.getElementById('scan-code');
  if(codeEl&&codeEl.value.trim()&&document.getElementById('scan-result'))doScan();
});


/* --- subsystems/samples/frontend/js/views/logs.js --- */
// logs.js — 操作日志
async function viewLogs(){
  const v=$('#view');v.innerHTML='<div class="muted">加载中…</div>';
  const logs=await api('GET','/api/logs');
  if(!logs.length){v.innerHTML='<div class="empty">暂无日志</div>';return;}
  v.innerHTML='<div class="card" style="padding:0"><table><tr><th>时间</th><th>样品</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>'+
    logs.map(l=>'<tr><td class="muted">'+fmt(l.created_at)+'</td><td>'+e(l.sample_no||'—')+'</td><td>'+(ACTION_CN[l.action]||l.action)+'</td><td class="muted">'+e(l.role||'')+'/'+e(l.dept||'')+'</td><td class="muted">'+e(l.location||'—')+'</td><td class="muted">'+e(l.note||'—')+'</td></tr>').join('')+'</table></div>';
}


/* --- subsystems/samples/frontend/js/views/models.js --- */
// models.js — 机型列表管理（仅 RD/ADMIN 可见，后端 POST/DELETE 403 兜底）
function viewModels() {
  const v = $('#view');
  v.innerHTML = '<div class="filters">' +
    '<fluent-text-field id="m-code" placeholder="机型短码（≥6位，如 YD9015）" style="flex:1.5"></fluent-text-field>' +
    '<fluent-text-field id="m-full-name" placeholder="机型全称（如 YD9015 低噪声马达）" style="flex:2"></fluent-text-field>' +
    '<fluent-button appearance="accent" size="small" onclick="addModel()">新增机型</fluent-button>' +
    '</div><div id="m-list"></div>';
  loadModels();
}

async function loadModels() {
  const list = await api('GET', '/api/samples/models');
  $('#m-list').innerHTML = '<div class="card" style="padding:0"><table>' +
    '<tr><th>机型短码</th><th>机型全称</th><th>创建时间</th><th style="width:80px">操作</th></tr>' +
    (list.length ? list.map(function (m) {
      return '<tr><td><b>' + e(m.code) + '</b></td><td>' + e(m.full_name) + '</td><td class="muted">' + e((m.created_at || '').replace('T', ' ').slice(0, 19)) + '</td>' +
        '<td><a class="link" data-code="' + e(m.code) + '" onclick="deleteModel(' + m.id + ',this.dataset.code)">删除</a></td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">暂无机型，请先新增</td></tr>') +
    '</table></div>';
}

async function addModel() {
  const code = $('#m-code').value.trim().toUpperCase();
  const full_name = $('#m-full-name').value.trim();
  if (!code || !full_name) { toast('请填写机型短码和全称', 'err'); return; }
  if (!/^[A-Za-z0-9]+$/.test(code)) { toast('机型短码仅允许字母和数字', 'err'); return; }
  try {
    await api('POST', '/api/samples/models', { code: code, full_name: full_name });
    toast('机型已新增', 'ok');
    $('#m-code').value = ''; $('#m-full-name').value = '';
    loadModels();
  } catch (e) { toast(e.message, 'err'); }
}

async function deleteModel(id, code) {
  if (!confirm('确认删除机型 ' + code + ' ？')) return;
  try {
    await api('DELETE', '/api/samples/models/' + id);
    toast('机型已删除', 'ok');
    loadModels();
  } catch (e) { toast(e.message, 'err'); }
}


/* --- subsystems/samples/frontend/js/views/help-data.js --- */
// help-data.js — 帮助数据（10个功能模块），按模块组织
var HELP_DATA=[
  {
    id:'dashboard', module:'看板', desc:'登录后的样品看板',
    items:[
      {h:'样品状态概览',body:'顶部6个状态卡片，显示各状态样品数量\n点击卡片可跳转对应列表筛选\nNEW=待制作确认 / PRODUCED=制作完成 / RELEASED=已发行 / IN_CUSTODY=保管中 / RETURNING=退回审核中 / RETIRED=已作废'},
      {h:'待办列表',body:'根据您的角色显示需要处理的样品\n研发：待制作+指派重做的样品\n品保：待发行+退回审核的样品\n保管/生技：待接收的样品'},
      {h:'复检提醒',body:'逾期样品：已过复检日期仍未复检\n7日内到期：未来7天需要复检的样品\n点击可跳转对应列表'},
      {h:'操作日志',body:'最近操作记录表格，显示时间/样品/动作/操作人\n点击右上角「查看全部日志」查看全量'}
    ]
  },
  {
    id:'list', module:'样品列表', desc:'查看和管理全部样品',
    items:[
      {h:'筛选与搜索',body:'按状态筛选：顶部状态标签卡片\n搜索：支持 编号/名称/机型 模糊匹配\n右上角清空按钮重置搜索'},
      {h:'样品编号规则',body:'13 位结构化编码：提供处-机型-组别-流水号-版次\n如 G-YD9015-Q-001-01（客供C/元山T/元将五金G + 机型6位 + 组别1位 + 流水号3位 + 版次2位）\n系统自动生成，不可修改'},
      {h:'颜色标记',body:'复检逾期样品 — 橙色边框高亮\n提醒保管人员及时处理'},
      {h:'点击样品',body:'点击任意样品卡片 → 弹出详情弹窗\n详情弹窗包含：基础信息 / 流转进度 / 图片 / 操作日志（最近2条）\n弹窗底部Tab可切换：标示卡 / 全量日志 / 大图'}
    ]
  },
  {
    id:'create', module:'新建样品', desc:'研发人员创建新样品',
    items:[
      {h:'基本信息',body:'名称、机型、站别 — 必填\n规格、备注 — 选填'},
      {h:'限度样品字段',body:'样品类型：OK样品 / NG样品\n限度项目：26 项下拉选择\n来源：客供 / 元山 / 塔岗\n版次：发行自动01，重新发行+1（最高99）\n标准范围：如「震动≤0.5mm」'},
      {h:'后续流程',body:'创建后自动生成 13 位结构化编号（如 G-YD9015-Q-001-01）\n弹出标签打印页（左半QR码+基本信息，右半空白标示卡区）\n打印标签 → 贴于样品实物 → 扫码台确认制作'}
    ]
  },
  {
    id:'scan', module:'扫码台', desc:'二维码扫码操作，驱动状态流转',
    items:[
      {h:'三种输入方式',body:'二维码扫码枪 / 手动输入编号 / 摄像头扫码\n输入样品编号后系统自动识别状态并给出可选操作'},
      {h:'操作权限',body:'研发：确认制作完成(PRODUCE)、创建替代品\n品保：确认发行(RELEASE)、复检(INSPECT)、退回审核处理\n保管/生技：接收保管(CUSTODY)、申请退回'},
      {h:'连续扫码模式',body:'勾选「连续扫码」→ 勾选「自动加入打印队列」\n发行后不清空，可连续扫码\n发行后标示卡加入打印队列，全部完毕后一起打印（连续模式）/ 直接弹出打印页（非连续模式）'},
      {h:'分步发行向导',body:'Step1：设置复检周期（天）\nStep2：填写标示卡（样品类型+限度项目必填，版次自动01/自动+1）\nStep3：确认发行信息 → 点击确认'}
    ]
  },
  {
    id:'print', module:'打印', desc:'标签与标示卡打印',
    items:[
      {h:'标签打印',body:'新建样品后自动弹出\n左半：QR码（含样品编号+状态）+ 基本信息\n右半：空白标示卡填写区\n顶部可选尺寸：小号/中标/大号/自定义'},
      {h:'标示卡打印',body:'品保发行后自动弹出 / 样品详情页手动打印\n尺寸自动跟随标签设置\n点击打印按钮调起浏览器打印对话框'},
      {h:'尺寸选择',body:'标签3档预设：小37×18mm / 中52×25mm / 大60×40mm\n自定义：30~150mm自由输入\n标示卡自动等比缩放跟随标签尺寸\n注：以系统尺寸预设为准（小37×18/中52×25/大60×40mm，自定义30~150mm；唯一数据源为后端 card-constants.js PRESET_MM）'}
    ]
  },
  {
    id:'return', module:'退回审核', desc:'退回流程与审核处理',
    items:[
      {h:'申请退回',body:'保管/生技人员在保管中样品上发起\n填写退回原因（必填）→ 状态变为「退回审核中」'},
      {h:'品保审核',body:'退回审核中样品，品保可选择：\n1.重新发行 — 更新标示卡，状态回已发行\n2.退回研发重做 — 指派RD，状态回NEW\n3.直接作废 — 不再使用\n4.拒绝退回 — 拒绝申请，状态回保管中'},
      {h:'研发重做',body:'被退回研发的样品 → 研发制作新样品 → 创建替代品\n新样品自动复制标示卡信息，编号自动分配'}
    ]
  },
  {
    id:'checkout', module:'领用与归还', desc:'保管中样品领出使用与归还',
    items:[
      {h:'领出样品',body:'保管/生技人员在「保管中」样品上发起（扫码台或样品详情）\n填写领用人（必填）、领用部门、领用时长（1~8760 小时）→ 状态变为「领用中」\n储位保留，归还后回原储位'},
      {h:'超时提醒',body:'超过应还时间未归还 → 看板出现「领用超时未归还」蓝色预警区块\n样品列表状态徽章变橙色、详情页显示已超时\n提醒保管部门催还，归还后提醒消失'},
      {h:'归还入库',body:'保管/生技人员扫「领用中」样品 → 归还入库\n记录实际归还时间与借出时长 → 状态回「保管中」\n领用中的样品不能申请退回，须先归还'},
      {h:'与退回的区别',body:'领用/归还：样品短期借出使用，仍属保管资产\n申请退回：样品存在问题走品保审核，可能重新发行或作废'}
    ]
  },
  {
    id:'detail', module:'样品详情', desc:'样品完整信息查看与编辑',
    items:[
      {h:'基础信息',body:'名称 / 机型 / 站别 / 规格 / 保管部门 / 储位 / 复检周期 / 备注\n全部字段均为只读展示'},
      {h:'流转进度',body:'时间线展示：制作完成 → 正式发行 → 分发保管\n已完成步骤显示日期，待处理步骤灰色'},
      {h:'标示卡编辑',body:'仅有限度信息的样品显示此Tab\n已发行/保管中/退回审核中/已作废 — 自动锁定只读\n未锁定时可编辑所有字段并保存，版次可手动输入（发行时自动填01）'},
      {h:'操作日志',body:'最近2条日志概览\n点击「查看全部N条」切换到全量日志表格\n表格列：时间 / 动作 / 角色部门 / 储位 / 备注'}
    ]
  },
  {
    id:'inspect', module:'复检管理', desc:'样品周期复检流程',
    items:[
      {h:'复检触发',body:'品保发行时设置复检周期（天）\n保管中的样品到达复检日期 → 看板出现「待复检」提醒\n逾期的样品橙色边框高亮'},
      {h:'复检操作',body:'扫码台扫描样品编号 → 选择「确认复检完成」\n上传复检照片（必填）+ 可选备注\n可选择更新标示卡（版次/测试数据）'},
      {h:'提前复检',body:'未到复检日期也可扫码复检\n日志记录为「提前复检」以区分正常周期复检'}
    ]
  },
  {
    id:'users', module:'用户管理', desc:'系统管理员功能',
    items:[
      {h:'查看用户',body:'管理员在用户管理页查看所有用户\n列表显示：用户名 / 显示名 / 角色 / 部门'},
      {h:'角色说明',body:'系统管理员 — 用户管理+全局查看\n研发 — 建样+确认制作\n品保 — 发行+复检+退回审核\n生技 — 保管（等同保管权限）\n保管 — 接收+申请退回'}
    ]
  },
  {
    id:'card', module:'数字标示卡', desc:'匿名查看与打印',
    items:[
      {h:'匿名查看',body:'每个样品有独立数字标示卡URL\n无账号人员扫码即可查看标示卡信息\nURL格式：/card?no=SM-000001'},
      {h:'显示内容',body:'样品编号 / 名称 / 规格 / 样品类型（色标）\n限度项目 / 来源 / 版次 / 有效期 / 样品数值\n不显示储位/保管单位等敏感信息'},
      {h:'下载打印',body:'页面提供打印和下载PDF按钮\n适合生产现场贴附使用'}
    ]
  }
];


/* --- subsystems/samples/frontend/js/views/help.js --- */
// help.js — 前端使用指南：浮动按钮 + 搜索面板 + 上下文提示条
// 依赖：HELP_DATA（help-data.js）、me（api.js）、$（constants.js）

// 页面 hash → 帮助模块 ID 映射（用于上下文提示条「了解更多」）
var HELP_PAGE_MAP={
  dashboard:null, samples:'list', new:'create', scan:'scan',
  logs:null, users:'users'
};
var HELP_PAGE_TIPS={
  dashboard:'样品看板：查看统计数据和待办事项',
  samples:'样品列表：支持多维度筛选和详情查看',
  new:'新建样品：填写信息后自动生成编号和标签',
  scan:'扫码台：扫描样品二维码驱动状态流转',
  logs:'操作日志：系统全局操作记录',
  users:'用户管理：管理账号和角色'
};

// 渲染右下角浮动「?」按钮（登录后调用一次）
function renderHelpButton(){
  if($('#help-fab'))return;
  var fab=el('div','help-fab','?');
  fab.onclick=openHelp;
  document.body.appendChild(fab);
}

// 打开帮助面板（id 可选，传入则自动展开对应模块）
function openHelp(id){
  if(!$('#help-mask'))renderHelpPanel();
  $('#help-mask').style.display='flex';
  filterHelp('');
  if(id)setTimeout(function(){toggleModule(id,true);},50);
}
function closeHelp(){
  var m=$('#help-mask');if(m)m.style.display='none';
}

// 渲染搜索面板 DOM（仅创建一次）
function renderHelpPanel(){
  var mask=el('div','help-mask');mask.id='help-mask';
  mask.onclick=closeHelp;
  var panel=el('div','help-panel');
  panel.onclick=function(e){e.stopPropagation();};
  panel.innerHTML=
    '<div class="help-head">'+
      '<fluent-text-field id="help-search" placeholder="搜索关键词..." oninput="filterHelp(this.value)"></fluent-text-field>'+
      '<fluent-button appearance="neutral" size="small" onclick="closeHelp()">关闭</fluent-button>'+
    '</div>'+
    '<div id="help-list"></div>';
  mask.appendChild(panel);
  document.body.appendChild(mask);
}

// 按关键词筛选帮助模块（匹配 module/desc/items.body）
function filterHelp(kw){
  kw=(kw||'').toLowerCase().trim();
  var list=HELP_DATA.filter(function(m){
    if(!kw)return true;
    if((m.module||'').toLowerCase().indexOf(kw)>-1)return true;
    if((m.desc||'').toLowerCase().indexOf(kw)>-1)return true;
    return (m.items||[]).some(function(s){return (s.body||'').toLowerCase().indexOf(kw)>-1;});
  });
  renderHelpList(list);
}

// 渲染模块卡片列表
function renderHelpList(list){
  var box=$('#help-list');if(!box)return;
  if(!list.length){box.innerHTML='<div class="empty">未找到相关帮助内容</div>';return;}
  box.innerHTML=list.map(function(m){
    var sections=(m.items||[]).map(function(s,i){
      return '<div class="help-section" data-idx="'+i+'" style="display:none">'+
        '<h4>'+s.h+'</h4><pre>'+s.body+'</pre></div>';
    }).join('');
    return '<div class="help-module" data-id="'+m.id+'">'+
      '<div class="help-module-head" onclick="toggleModule(\''+m.id+'\')">'+
        '<span class="help-module-title">'+m.module+'</span>'+
        '<span class="help-toggle">展开</span>'+
      '</div>'+
      '<div class="help-module-summary">'+m.desc+'</div>'+
      '<div class="help-sections">'+sections+'</div>'+
    '</div>';
  }).join('');
}

// 展开/折叠模块（id=模块ID，forceOpen=true 时强制展开）
function toggleModule(id,forceOpen){
  var card=document.querySelector('.help-module[data-id="'+id+'"]');
  if(!card)return;
  var isOpen=card.classList.contains('open');
  if(forceOpen&&isOpen)return;
  card.classList.toggle('open');
  var sections=card.querySelectorAll('.help-section');
  var toggle=card.querySelector('.help-toggle');
  if(card.classList.contains('open')){
    sections.forEach(function(s){s.style.display='block';});
    if(toggle)toggle.textContent='收起';
  }else{
    sections.forEach(function(s){s.style.display='none';});
    if(toggle)toggle.textContent='展开';
  }
}

// 渲染上下文提示条（route() 中每次调用）
function renderContextHint(pageKey){
  var tip=HELP_PAGE_TIPS[pageKey];
  var helpId=HELP_PAGE_MAP[pageKey];
  if(!tip||sessionStorage.getItem('help-dismiss-'+pageKey))return '';
  var link=helpId?'<a class="link" onclick="openHelp(\''+helpId+'\')">了解更多 →</a>':'';
  return '<div class="help-hint">'+
    '<span>'+tip+'</span>'+
    link+
    '<span class="help-hint-close" onclick="dismissContextHint(\''+pageKey+'\')">✕</span>'+
  '</div>';
}

// 关闭上下文提示（本次会话不再显示）
function dismissContextHint(pageKey){
  sessionStorage.setItem('help-dismiss-'+pageKey,'1');
  var hints=document.querySelectorAll('.help-hint');
  hints.forEach(function(h){h.remove();});
}


/* --- subsystems/samples/frontend/js/router.js --- */
// router.js — 导航菜单、哈希路由
const NAV=[
  {k:'dashboard',t:'样品看板',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'samples',t:'样品列表',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'new',t:'新建样品+打印码',roles:['ADMIN','RD']},
  {k:'models',t:'机型列表',roles:['ADMIN','RD']},
  {k:'scan',t:'扫码台',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'logs',t:'操作日志',roles:['ADMIN']},
];
function buildNav(){
  const nav=$('#nav');nav.innerHTML='';
  NAV.filter(n=>n.roles.includes(me.role)).forEach(n=>{
    const b=el('button',null,n.t);b.onclick=()=>{location.hash='#/'+n.k;};b.dataset.k=n.k;nav.appendChild(b);
  });
}
function setActive(k){document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));}

const VIEWS={dashboard:viewDashboard,samples:viewSamples,new:viewNew,models:viewModels,scan:viewScan,logs:viewLogs,};
function route(){
  const k=(location.hash.replace('#/','').split('?')[0]||'dashboard');
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  const v=VIEWS[k]||viewDashboard; setActive(k);
  const meta={dashboard:'样品看板',samples:'样品列表',new:'新建样品',models:'机型列表',scan:'扫码台',logs:'操作日志',};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
  var hint=renderContextHint(k);
  if(hint)$('#view').insertAdjacentHTML('afterbegin',hint);
}


// bundle init
window.addEventListener('hashchange',route);boot();
