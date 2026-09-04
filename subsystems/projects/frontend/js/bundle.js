/** BUNDLE vbmtmo3jqm — 22 files */
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


/* --- subsystems/projects/frontend/js/constants.js --- */
// constants.js — 项目追踪子系统常量（不修改共享 api-base.js，避免跨系统影响）
const ROLE_CN = Object.assign({ PM: '项目经理(PM)' }, { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' });
const PRIORITY_CN = { H: '高', M: '中', L: '低' };
const CATEGORY_CN = { device: '设备', quality: '质量', process: '流程', safety: '安全', other: '其他' };
const TASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
const SUBTASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成' };
// v2：表单下拉选项（弹窗复用）
const CATEGORY_KEYS = Object.keys(CATEGORY_CN);
const PRIORITY_KEYS = Object.keys(PRIORITY_CN);

// C2 修复：HTML 转义（所有用户输入字段渲染必须经 esc，防存储型 XSS）
function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(m){ return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]; }); }


/* --- subsystems/projects/frontend/js/api.js --- */
// api.js — 项目追踪 API 封装（复用共享 api()，仅收敛端点字符串）
const PApi = {
  projects: p => '/api/projects' + (p ? '/' + p : ''),
  projectTasks: pid => '/api/projects/' + pid + '/tasks',
  task: tid => '/api/projects/tasks/' + tid,
  taskSub: (tid, sid) => '/api/projects/tasks/' + tid + '/subtasks' + (sid ? '/' + sid : ''),
  taskComments: tid => '/api/projects/tasks/' + tid + '/comments',
  taskDeps: (tid, depId) => '/api/projects/tasks/' + tid + '/deps' + (depId ? '/' + depId : ''),
  taskFiles: (tid, fid) => '/api/projects/tasks/' + tid + '/files' + (fid ? '/' + fid : ''),
  taskLinks: (tid, refType, refId) => '/api/projects/tasks/' + tid + '/links' + (refType ? '/' + refType + (refId ? '/' + refId : '') : ''),
  stats: '/api/projects/stats',
  exportCsv: '/api/projects/tasks/export',
  workflow: '/api/projects/workflow',
  // OA 能力移植（方案A一期）：里程碑/风险/预算扩展
  milestones: pid => '/api/projects/' + pid + '/milestones',
  milestone: mid => '/api/projects/milestones/' + mid,
  milestoneAchieve: mid => '/api/projects/milestones/' + mid + '/achieve',
  risks: pid => '/api/projects/' + pid + '/risks',
  risk: rid => '/api/projects/risks/' + rid,
  riskResolve: rid => '/api/projects/risks/' + rid + '/resolve',
  extras: pid => '/api/projects/' + pid + '/extras',
  // OA 能力移植（二期批次1）：变更单 + 机型引用
  changes: pid => '/api/projects/' + pid + '/changes',
  change: cid => '/api/projects/changes/' + cid,
  changeApprove: cid => '/api/projects/changes/' + cid + '/approve',
  modelOptions: '/api/projects/model-options',
  modelRefs: pid => '/api/projects/' + pid + '/models',
  modelRef: (pid, mid) => '/api/projects/' + pid + '/models/' + mid,
  // OA 能力移植（二期批次2）：项目模板
  templates: '/api/projects/templates',
  template: tid => '/api/projects/templates/' + tid,
  templateInstantiate: tid => '/api/projects/templates/' + tid + '/instantiate',
  // OA 能力移植（二期批次3）：关系 + 图谱
  relations: '/api/projects/relations',
  relation: rid => '/api/projects/relations/' + rid,
  graph: '/api/projects/graph'
};


/* --- subsystems/projects/frontend/js/views/dashboard.js --- */
// dashboard.js — 项目看板：统计卡（KbStats 共享组件，navigate 单击跳列表）+ 三维分布 + 近 8 周趋势
async function renderProjectDashboard() {
  const v = $('#view');
  if (!v) return;
  v.innerHTML = '<div class="pk-stats" id="pk-stats"></div><div class="pk-panels" id="pk-panels"></div>';
  const s = await api('GET', PApi.stats);
  // 竞态守卫：await 期间视图可能已被切换，节点脱离 document 后直接返回
  if (!v.isConnected) return;
  // 统计卡：KbStats navigate 语义（单击跳任务列表并预选状态；项目卡跳项目列表）
  // 跳转目标复用 list.js 既有 A4 深链（#/list?status= 由 lkRestoreFromHash 恢复），后端零改动
  const stats = [
    { k: 'projects', n: s.project_count, l: '项目数', c: 'var(--brand)', href: '#/projects', title: '查看项目列表' },
    { k: 'total', n: s.total_tasks, l: '总任务', c: 'var(--brand)', href: '#/list', title: '查看任务列表（全部）' },
    { k: 'done', n: s.done_count, l: '已完成', c: 'var(--ok)', href: '#/list?status=DONE', title: '查看已完成任务' },
    { k: 'doing', n: s.in_progress_count, l: '进行中', c: '#1d4ed8', href: '#/list?status=IN_PROGRESS', title: '查看进行中任务' },
    { k: 'overdue', n: s.overdue_count, l: '已延期', c: 'var(--bad)', href: '#/list?status=OVERDUE', title: '查看已延期任务' }
  ];
  // KbStats 共享组件（kb-stat 规范：fluent-card + .n/.l + --stat-color 竖色条，样式见 /css/app.css）
  $('#pk-stats').innerHTML = KbStats.render(stats, { click: 'navigate' });
  // 三维分布（类别/优先级）+ 完成率 + 趋势
  const dist = (arr, cn, base) => arr.map(x =>
    '<div class="pk-row"><span class="pk-name">' + (cn[x.category || x.priority] || x.category || x.priority) + '</span>' +
    '<div class="pk-bar"><i style="width:' + Math.round(x.c / Math.max(base, 1) * 100) + '%"></i></div>' +
    '<span class="pk-count">' + x.c + '</span></div>').join('');
  const maxCat = Math.max.apply(null, s.category_dist.map(x => x.c).concat([1]));
  const maxPr = Math.max.apply(null, s.priority_dist.map(x => x.c).concat([1]));
  const maxTrend = Math.max.apply(null, s.trend.map(x => x.c).concat([1]));
  const trendHtml = s.trend.map(x =>
    '<div class="col"><span class="bar" style="height:' + Math.max(4, Math.round(x.c / maxTrend * 90)) + 'px"></span>' +
    '<span class="num">' + x.c + '</span><span class="wk">' + x.wk.slice(5) + '</span></div>').join('');
  $('#pk-panels').innerHTML =
    '<div class="pk-panel"><h3>类别分布</h3>' + (dist(s.category_dist, CATEGORY_CN, maxCat) || '<span class="pk-name">暂无数据</span>') + '</div>' +
    '<div class="pk-panel"><h3>优先级分布</h3>' + (dist(s.priority_dist, PRIORITY_CN, maxPr) || '<span class="pk-name">暂无数据</span>') + '</div>' +
    '<div class="pk-panel"><h3>完成率</h3><div class="pk-row"><span class="pk-name">整体</span>' +
    '<div class="pk-bar"><i style="width:' + s.completion_rate + '%"></i></div>' +
    '<span class="pk-count">' + s.completion_rate + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">未开始</span><span class="pk-count">' + s.not_started_count + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">已延期</span><span class="pk-count">' + s.overdue_count + '</span></div></div>' +
    '<div class="pk-panel"><h3>近 8 周完成趋势</h3><div class="pk-trend">' +
    (trendHtml || '<span class="pk-name">暂无数据</span>') + '</div></div>';
}


/* --- subsystems/projects/frontend/js/views/kanban.js --- */
// kanban.js — 任务看板：4 列（未开始/进行中/已完成/已延期），HTML5 拖拽流转（仅合法转移）
// 落列按 ACTION_MAP 判定：NOT_STARTED>IN_PROGRESS→START、IN_PROGRESS>DONE→COMPLETE；非法流转 toast 报错并重渲染回弹
// 卡片内提供「开始/完成」按钮兜底（移动端无拖拽能力时亦可流转）
// v2：看板「我的任务」筛选状态；列分组/计数按 status_eff；卡片进度条 + 项目名标签 + OVERDUE 强调
// 迭代1：类别/优先级/责任人下拉筛选（A2）+ 筛选 URL 化（A4，筛选函数在 kanban-filter.js 保持顶层函数 ≤10）
var _kbMine = false;
async function kbToggleMine() {
  _kbMine = !_kbMine;
  $('#kb-mine').classList.toggle('active', _kbMine);
  kbApplyFilters();
}
// v2：新建任务弹窗（看板选中项目自动带入）
async function kbCreate() {
  const projects = await api('GET', PApi.projects());
  const selPid = $('#kb-project').value;
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  openModal('新建任务',
    '<div class="pk-form">' +
    '<label>所属项目 *</label><fluent-select id="kc-project">' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '"' + (String(p.id) === selPid ? ' selected' : '') + '>' + esc(p.name) + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>任务名称 *</label><fluent-text-field id="kc-title"></fluent-text-field>' +
    '<label>类别</label><fluent-select id="kc-category">' + CATEGORY_KEYS.map(function (k) { return '<fluent-option value="' + k + '">' + CATEGORY_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>优先级</label><fluent-select id="kc-priority">' + PRIORITY_KEYS.map(function (k) { return '<fluent-option value="' + k + '">' + PRIORITY_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>责任人</label><fluent-select id="kc-assignee"><fluent-option value="">未指派</fluent-option>' +
    users.map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || ('#' + u.id)) + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>计划完成日期</label><fluent-text-field id="kc-date" type="date"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="kc-desc"></fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="kbCreateSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function kbCreateSave() {
  const pid = $('#kc-project').value;
  const title = $('#kc-title').value.trim();
  if (!pid) return showToast('请选择项目', 'err');
  if (!title) return showToast('任务名称必填', 'err');
  try {
    await api('POST', PApi.projectTasks(pid), {
      title: title, category: $('#kc-category').value, priority: $('#kc-priority').value,
      assignee_id: Number($('#kc-assignee').value) || null, planned_date: $('#kc-date').value || null,
      description: $('#kc-desc').value
    });
    showToast('创建成功'); pCloseModal(); kbLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
async function renderTaskKanban() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="kb-project" onchange="kbApplyFilters()"><fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-select id="kb-category" onchange="kbApplyFilters()"><fluent-option value="">全部类别</fluent-option>' +
    CATEGORY_KEYS.map(k => '<fluent-option value="' + k + '">' + CATEGORY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="kb-priority" onchange="kbApplyFilters()"><fluent-option value="">全部优先级</fluent-option>' +
    PRIORITY_KEYS.map(k => '<fluent-option value="' + k + '">' + PRIORITY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="kb-assignee" onchange="kbApplyFilters()"><fluent-option value="">全部责任人</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="kbCreate()">新建任务</fluent-button>' +
    '<fluent-button appearance="secondary" id="kb-mine" onclick="kbToggleMine()">我的任务</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="kbLoad()">刷新</fluent-button></div>' +
    '<div class="pk-kanban" id="pk-kanban"></div>';
  const projects = await api('GET', PApi.projects());
  const sel = $('#kb-project');
  for (const p of projects) {
    const opt = document.createElement('fluent-option');
    opt.value = String(p.id); opt.textContent = p.name;
    sel.appendChild(opt);
  }
  // 责任人下拉（缺陷#2 修复后全员可访问）
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  const selA = $('#kb-assignee');
  for (const u of users) {
    const opt = document.createElement('fluent-option');
    opt.value = String(u.id); opt.textContent = u.display_name || ('#' + u.id);
    selA.appendChild(opt);
  }
  // A4 URL 化：进入页面时从 hash 恢复筛选（程序化赋值不触发 change，显式 kbLoad）
  kbRestoreFromHash();
  await kbLoad();
}

// 加载当前筛选下的任务并分组渲染 4 列（统一走跨项目列表端点，支持多维筛选参数）
async function kbLoad() {
  const f = kbFilters();
  const qs = new URLSearchParams();
  if (f.project_id) qs.set('project_id', f.project_id);
  if (f.category) qs.set('category', f.category);
  if (f.priority) qs.set('priority', f.priority);
  if (f.assignee_id) qs.set('assignee_id', f.assignee_id);
  if (_kbMine) qs.set('assignee_id', me.id);
  const url = '/api/projects/tasks' + (qs.toString() ? '?' + qs : '');
  const tasks = await api('GET', url);
  const rows = Array.isArray(tasks) ? tasks : [];
  const cols = [
    { k: 'NOT_STARTED', t: '未开始' },
    { k: 'IN_PROGRESS', t: '进行中' },
    { k: 'DONE', t: '已完成' },
    { k: 'OVERDUE', t: '已延期' }
  ];
  const board = $('#pk-kanban');
  board.innerHTML = cols.map(c =>
    '<div class="pk-col" data-status="' + c.k + '" ondragover="kbDragOver(event)" ondrop="kbDrop(event)">' +
    '<h4>' + c.t + '<span>' + rows.filter(x => (x.status_eff || x.status) === c.k).length + '</span></h4>' +
    '<div id="kb-col-' + c.k + '"></div></div>').join('');
  for (const c of cols) {
    const el = $('#kb-col-' + c.k);
    el.innerHTML = rows.filter(x => (x.status_eff || x.status) === c.k).map(t => {
      const st = t.status_eff || t.status;
      // P2 修复：卡片流转按钮兜底（移动端无拖拽；桌面亦可用），stopPropagation 避免触发跳详情
      const ops = (st === 'NOT_STARTED'
        ? '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();kbAction(' + t.id + ',\'START\')">开始</fluent-button>' : '') +
        (st === 'IN_PROGRESS'
          ? '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();kbAction(' + t.id + ',\'COMPLETE\')">完成</fluent-button>' : '');
      // v2：全部项目视图显示项目名标签（project_id 空 = 全部项目）
      const projTag = !f.project_id ? '<span class="pk-proj-tag">' + esc(t.project_name) + '</span>' : '';
      return '<div class="pk-card' + (st === 'OVERDUE' ? ' pk-card-overdue' : '') + '" draggable="true" data-id="' + t.id + '" data-status="' + st + '" ' +
        'ondragstart="kbDragStart(event)" ondragend="kbDragEnd(event)" ' +
        'onclick="location.hash=\'#/tasks/' + t.id + '\'">' +
        '<div class="t">' + projTag + esc(t.title) + '</div>' +
        '<div class="pk-progress"><span class="pk-progress-bar" style="width:' + Math.min(t.progress || 0, 100) + '%"></span></div>' +
        '<div class="m"><span class="pk-tag ' + (t.priority || 'm').toLowerCase() + '">' +
        esc(PRIORITY_CN[t.priority] || t.priority) + '</span>' +
        '<span>' + (esc(t.assignee_name) || '未指派') + '</span>' +
        '<span>' + (t.planned_date ? fmt(t.planned_date) : '') + '</span></div>' +
        (ops ? '<div class="ops">' + ops + '</div>' : '') + '</div>';
    }).join('');
  }
}

// 卡片按钮流转（与拖拽 kbDrop 共用状态机接口，后端 CAS 兜底）
async function kbAction(id, action) {
  try { await api('POST', PApi.task(id) + '/status', { action }); showToast('流转成功'); }
  catch (err) { showToast(err.message, 'err'); }
  kbLoad();
}

function kbDragStart(e) {
  const card = e.target.closest('.pk-card');
  if (!card) return;
  e.dataTransfer.setData('text/plain', card.dataset.id);
  card.classList.add('dragging');
}
function kbDragEnd(e) {
  const card = e.target.closest('.pk-card');
  if (card) card.classList.remove('dragging');
  document.querySelectorAll('.pk-col.drag-over').forEach(c => c.classList.remove('drag-over'));
}
function kbDragOver(e) {
  e.preventDefault();
  const col = e.target.closest('.pk-col');
  if (col && !col.classList.contains('drag-over')) col.classList.add('drag-over');
}

// 落列校验：仅 START/COMPLETE 合法转移；非法 toast 报错 + 重渲染回弹（后端 CAS 兜底）
async function kbDrop(e) {
  e.preventDefault();
  const col = e.target.closest('.pk-col');
  const targetStatus = col ? col.dataset.status : null;
  const id = e.dataTransfer.getData('text/plain');
  if (!targetStatus || !id) return;
  const ACTION_MAP = {
    'NOT_STARTED>IN_PROGRESS': 'START',
    'IN_PROGRESS>DONE': 'COMPLETE'
  };
  const card = document.querySelector('.pk-card[data-id="' + id + '"]');
  const from = card ? card.dataset.status : '';
  const action = ACTION_MAP[from + '>' + targetStatus];
  if (!action) { showToast('不允许的流转：' + (TASK_STATUS_CN[from] || from) + ' → ' + (TASK_STATUS_CN[targetStatus] || targetStatus), 'err'); kbLoad(); return; }
  try {
    await api('POST', PApi.task(id) + '/status', { action });
    showToast('流转成功');
  } catch (err) { showToast(err.message, 'err'); }
  kbLoad();
}


/* --- subsystems/projects/frontend/js/views/kanban-filter.js --- */
// kanban-filter.js — 任务看板多维筛选（类别/优先级/责任人）+ 筛选 URL 化（A2/A4）
// 独立文件原因：kanban.js 顶层函数已达 10 个（§7.2 ≤10），筛选函数隔离于此保持各文件不超限
function kbFilters() {
  return {
    project_id: $('#kb-project').value,
    category: $('#kb-category').value,
    priority: $('#kb-priority').value,
    assignee_id: $('#kb-assignee').value
  };
}

// A4 筛选状态 URL 化：查询时把筛选写入 hash（进入页面时 kbRestoreFromHash 恢复）
function kbApplyFilters() {
  const f = kbFilters();
  const qs = new URLSearchParams();
  if (f.project_id) qs.set('project', f.project_id);
  if (f.category) qs.set('category', f.category);
  if (f.priority) qs.set('priority', f.priority);
  if (f.assignee_id) qs.set('assignee', f.assignee_id);
  if (_kbMine) qs.set('mine', '1');
  location.hash = '#/kanban' + (qs.toString() ? '?' + qs : '');
  kbLoad();
}

// 从 hash 恢复筛选（进入页面时调用；程序化赋值下拉不触发 change 事件，故末尾须由调用方显式 kbLoad）
function kbRestoreFromHash() {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const set = function (id, v) { if (v) $(id).value = v; };
  set('#kb-project', qs.get('project'));
  set('#kb-category', qs.get('category'));
  set('#kb-priority', qs.get('priority'));
  set('#kb-assignee', qs.get('assignee'));
  if (qs.get('mine') === '1' && !_kbMine) {
    _kbMine = true;
    $('#kb-mine').classList.add('active');
  }
}


/* --- subsystems/projects/frontend/js/views/list.js --- */
// list.js — 任务列表：跨项目筛选（项目/状态/类别/优先级/责任人）+ 全文搜索 + 分页 + CSV 导出 + 延期行高亮
// v2：列表「只看我的」筛选状态；迭代1：搜索框/多维筛选下拉/checkbox 批量（批量函数在 list-batch.js，筛选 URL 化在 list-filter.js）
var _lkMine = false;
function lkToggleMine() {
  _lkMine = !_lkMine;
  $('#lk-mine').classList.toggle('active', _lkMine);
  lkLoad();
}
// v2：列表页新建任务弹窗（复用看板 kbCreate 弹窗，但项目默认空）
async function lkCreate() { kbCreate(); }
async function renderTaskList() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-text-field id="lk-q" placeholder="搜索标题/描述/备注…" style="width:200px"></fluent-text-field>' +
    '<fluent-select id="lk-project"><fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-select id="lk-status"><fluent-option value="">全部状态</fluent-option>' +
    '<fluent-option value="NOT_STARTED">未开始</fluent-option><fluent-option value="IN_PROGRESS">进行中</fluent-option>' +
    '<fluent-option value="DONE">已完成</fluent-option><fluent-option value="OVERDUE">已延期</fluent-option></fluent-select>' +
    '<fluent-select id="lk-category"><fluent-option value="">全部类别</fluent-option>' +
    CATEGORY_KEYS.map(k => '<fluent-option value="' + k + '">' + CATEGORY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="lk-priority"><fluent-option value="">全部优先级</fluent-option>' +
    PRIORITY_KEYS.map(k => '<fluent-option value="' + k + '">' + PRIORITY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="lk-assignee"><fluent-option value="">全部责任人</fluent-option></fluent-select>' +
    '<fluent-button appearance="secondary" onclick="lkApplyFilters()">查询</fluent-button>' +
    '<fluent-button appearance="secondary" id="lk-mine" onclick="lkToggleMine()">只看我的</fluent-button>' +
    '<fluent-button appearance="accent" onclick="lkCreate()">新建任务</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="lkExport()">导出 CSV</fluent-button></div>' +
    // P2 修复：表格外包共享 .card 容器，overflow-x:auto 兜底窄屏横向溢出
    '<div class="card" style="padding:8px 0;overflow-x:auto"><table class="pk-table" id="lk-table"><thead><tr>' +
    '<th style="width:36px"><fluent-checkbox id="lk-check-all" onchange="lkToggleAll()"></fluent-checkbox></th>' +
    '<th>项目</th><th>任务</th><th>类别</th><th>优先级</th><th>责任人</th><th>状态</th><th>进度</th><th>计划日期</th><th>操作</th>' +
    '</tr></thead><tbody></tbody></table>' +
    '<div class="pk-filters" id="lk-batch" style="display:none;padding:8px 12px;background:#f0fdfa;border-radius:8px"></div>' +
    '<div class="pk-filters" id="lk-pager" style="padding:8px 12px"></div></div>';
  const projects = await api('GET', PApi.projects());
  const sel = $('#lk-project');
  for (const p of projects) {
    const opt = document.createElement('fluent-option');
    opt.value = String(p.id); opt.textContent = p.name;
    sel.appendChild(opt);
  }
  // 责任人下拉（缺陷#2 修复后全员可访问）
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  const selA = $('#lk-assignee');
  for (const u of users) {
    const opt = document.createElement('fluent-option');
    opt.value = String(u.id); opt.textContent = u.display_name || ('#' + u.id);
    selA.appendChild(opt);
  }
  // 搜索框防抖 300ms（触发 lkApplyFilters → URL 化 + 重新加载）
  $('#lk-q').addEventListener('keyup', function () {
    clearTimeout(window.__lkQTimer);
    window.__lkQTimer = setTimeout(function () { lkApplyFilters(); }, 300);
  });
  // A4 URL 化：进入页面时从 hash 恢复筛选状态
  lkRestoreFromHash();
  // 支持 #/list?project=xxx 跳转预选项目：fluent-select 选项异步注册，重试赋值直到生效后再加载
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const prePid = qs.get('project');
  if (prePid) {
    let tries = 0;
    (function attempt() {
      sel.value = prePid;
      if (sel.value === prePid || ++tries >= 10) { lkLoad(); }
      else setTimeout(attempt, 60);
    })();
  } else {
    await lkLoad();
  }
}

// 加载筛选条件下的跨项目任务列表（URL 写死 /api/projects/tasks，避免 /tasks/0 拼接 hack）
// 迭代1：读取全部筛选下拉值（类别/优先级/责任人/搜索词）+ 行首 checkbox（批量）
async function lkLoad() {
  const qs = new URLSearchParams();
  const pid = $('#lk-project').value;
  if (pid) qs.set('project_id', pid);
  const st = $('#lk-status').value;
  if (st) qs.set('status', st);
  const cat = $('#lk-category').value;
  if (cat) qs.set('category', cat);
  const pr = $('#lk-priority').value;
  if (pr) qs.set('priority', pr);
  const as = $('#lk-assignee').value;
  if (as) qs.set('assignee_id', as);
  const q = $('#lk-q').value.trim();
  if (q) qs.set('q', q);
  if (_lkMine) qs.set('assignee_id', me.id);
  qs.set('limit', String(_lkPageSize));
  qs.set('offset', String(_lkPage * _lkPageSize));
  const r = await api('GET', '/api/projects/tasks' + (qs.toString() ? '?' + qs : ''));
  const rows = Array.isArray(r) ? r : (r.rows || []);
  const total = Array.isArray(r) ? rows.length : (r.total || 0);
  const tbody = document.querySelector('#lk-table tbody');
  tbody.innerHTML = rows.map(t =>
    '<tr class="' + ((t.status_eff || t.status) === 'OVERDUE' ? 'pk-row-overdue' : '') + '">' +
    '<td><fluent-checkbox class="lk-row-check" data-id="' + t.id + '" onchange="lkRowCheck(this)"></fluent-checkbox></td>' +
    '<td>' + esc(t.project_name) + '</td>' +
    '<td><a href="#/tasks/' + t.id + '">' + esc(t.title) + '</a></td>' +
    '<td>' + (CATEGORY_CN[t.category] || t.category) + '</td>' +
    '<td><span class="pk-tag ' + (t.priority || 'm').toLowerCase() + '">' + (PRIORITY_CN[t.priority] || t.priority) + '</span></td>' +
    '<td>' + (esc(t.assignee_name) || '未指派') + '</td>' +
    '<td>' + (TASK_STATUS_CN[t.status_eff || t.status] || t.status_eff || t.status) + '</td>' +
    '<td>' + t.progress + '%</td>' +
    '<td>' + fmt(t.planned_date) + '</td>' +
    '<td><a href="#/tasks/' + t.id + '">详情</a> ' + lkQuickOps(t) + '</td></tr>').join('');
  renderLkPager(total);
}
// v2：行内快捷流转按钮（开始/完成，按有效状态动态显示）
function lkQuickOps(t) {
  const st = t.status_eff || t.status;
  if (st === 'NOT_STARTED') return '<fluent-button size="small" appearance="neutral" onclick="lkAction(' + t.id + ',\'START\')">开始</fluent-button>';
  if (st === 'IN_PROGRESS') return '<fluent-button size="small" appearance="neutral" onclick="lkAction(' + t.id + ',\'COMPLETE\')">完成</fluent-button>';
  return '';
}
async function lkAction(id, action) {
  try { await api('POST', PApi.task(id) + '/status', { action }); showToast('流转成功'); }
  catch (e) { showToast(e.message, 'err'); }
  lkLoad();
}
// v2：分页状态与渲染
var _lkPage = 0, _lkPageSize = 50;
function renderLkPager(total) {
  const pages = Math.max(1, Math.ceil(total / _lkPageSize));
  if (_lkPage >= pages) _lkPage = pages - 1;
  const el = $('#lk-pager');
  el.innerHTML =
    '<fluent-button appearance="neutral" size="small" ' + (_lkPage > 0 ? 'onclick="lkPage(-1)"' : 'disabled') + '>上一页</fluent-button>' +
    '<span style="margin:0 10px">第 ' + (_lkPage + 1) + '/' + pages + ' 页 · 共 ' + total + ' 条</span>' +
    '<fluent-button appearance="neutral" size="small" ' + (_lkPage < pages - 1 ? 'onclick="lkPage(1)"' : 'disabled') + '>下一页</fluent-button>';
}
function lkPage(d) {
  _lkPage += d;
  lkLoad();
}


/* --- subsystems/projects/frontend/js/views/list-batch.js --- */
// list-batch.js — 任务列表批量操作（checkbox 选择 + 批量指派/流转/删除）
// 独立文件原因：list.js 顶层函数已达 8 个（§7.2 ≤10），批量逻辑隔离于此保持各文件 <10
var _lkSel = new Set();
var _lkSuppress = false; // 抑制标志：表头全选程序化赋值行 checkbox 触发 change 级联重入（行中间态导致表头被置回 false → 重入清空）

// 行 checkbox 切换：fluent-checkbox 用 .checked 属性判断（:checked 伪类不匹配自定义元素），onchange 后触发
function lkRowCheck(cb) {
  const id = Number(cb.dataset.id);
  if (cb.checked) _lkSel.add(id); else _lkSel.delete(id);
  lkRenderBatchBar();
  if (_lkSuppress) return; // 程序化赋值阶段跳过表头联动（防级联重入）
  const all = document.querySelectorAll('.lk-row-check');
  const allChecked = all.length > 0 && Array.from(all).every(c => c.checked);
  const head = $('#lk-check-all');
  if (head) head.checked = allChecked;
}

// 表头全选：程序化赋值 .checked 触发组件回显（抑制期间忽略行 change 回调的表头联动）
function lkToggleAll() {
  const head = $('#lk-check-all');
  const all = document.querySelectorAll('.lk-row-check');
  _lkSuppress = true;
  try {
    for (const cb of all) {
      cb.checked = head.checked;
      if (head.checked) _lkSel.add(Number(cb.dataset.id)); else _lkSel.delete(Number(cb.dataset.id));
    }
  } finally {
    _lkSuppress = false;
  }
  lkRenderBatchBar();
}

// 批量操作栏渲染（选中 ≥1 条时浮现）
function lkRenderBatchBar() {
  const bar = $('#lk-batch');
  if (!bar) return;
  const n = _lkSel.size;
  if (n === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span style="align-self:center;font-size:13px">已选 <b>' + n + '</b> 条</span>' +
    '<fluent-button appearance="secondary" size="small" onclick="lkBatch(\'status\',\'START\')">批量开始</fluent-button>' +
    '<fluent-button appearance="secondary" size="small" onclick="lkBatch(\'status\',\'COMPLETE\')">批量完成</fluent-button>' +
    '<fluent-button appearance="accent" size="small" onclick="lkBatch(\'delete\')">批量删除</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="lkClearSel()">取消</fluent-button>';
}

function lkClearSel() {
  _lkSel.clear();
  document.querySelectorAll('.lk-row-check').forEach(c => { c.checked = false; });
  const head = $('#lk-check-all'); if (head) head.checked = false;
  lkRenderBatchBar();
}

// 批量操作提交（assign/status/delete → POST /api/projects/tasks/batch）
async function lkBatch(action, action2) {
  const ids = Array.from(_lkSel);
  if (ids.length === 0) return showToast('请先勾选任务', 'err');
  const body = { action: action, ids: ids };
  if (action === 'status') body.action2 = action2;
  try {
    const r = await api('POST', '/api/projects/tasks/batch', body);
    showToast('成功 ' + r.ok.length + ' 条' + (r.skipped.length ? '，跳过 ' + r.skipped.length + ' 条' : ''));
    lkClearSel();
    lkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/list-filter.js --- */
// list-filter.js — 任务列表筛选 URL 化（A4）+ CSV 导出（复用当前筛选）
// 独立文件原因：list.js 顶层函数已达 8 个（§7.2 ≤10），筛选工具隔离于此

// A4 筛选状态 URL 化：查询时把筛选写入 hash（页码不写入，刷新回第一页）
function lkApplyFilters() {
  const qs = new URLSearchParams();
  const map = {
    q: '#lk-q', project: '#lk-project', status: '#lk-status',
    category: '#lk-category', priority: '#lk-priority', assignee: '#lk-assignee'
  };
  for (const [key, sel] of Object.entries(map)) {
    const val = $(sel).value;
    if (val) qs.set(key, val);
  }
  if (_lkMine) qs.set('mine', '1');
  _lkPage = 0;
  location.hash = '#/list' + (qs.toString() ? '?' + qs : '');
  lkLoad();
}

// 从 hash 恢复筛选（进入页面时 renderTaskList 调用；project 由原 attempt 逻辑兜底异步注册）
function lkRestoreFromHash() {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const set = function (id, v) { if (v) $(id).value = v; };
  set('#lk-q', qs.get('q'));
  set('#lk-project', qs.get('project'));
  set('#lk-status', qs.get('status'));
  set('#lk-category', qs.get('category'));
  set('#lk-priority', qs.get('priority'));
  set('#lk-assignee', qs.get('assignee'));
  if (qs.get('mine') === '1' && !_lkMine) lkToggleMine();
}

// 导出 CSV：复用当前筛选参数拼 URL（location.href 触发下载，避免弹窗拦截；缺陷#3 后端已复用筛选）
function lkExport() {
  const qs = new URLSearchParams();
  const map = { q: '#lk-q', project: '#lk-project', status: '#lk-status',
    category: '#lk-category', priority: '#lk-priority', assignee: '#lk-assignee' };
  for (const [key, sel] of Object.entries(map)) {
    const val = $(sel).value;
    if (val) qs.set(key, val);
  }
  location.href = '/api/projects/tasks/export' + (qs.toString() ? '?' + qs : '');
}


/* --- subsystems/projects/frontend/js/views/projects.js --- */
// projects.js — 项目列表：卡片式展示 + 新建/编辑/删除 + 成员管理弹窗
// 权限：新建/编辑/删除/成员管理仅 ADMIN/PM（后端再校验 owner）；其他角色只读浏览
async function renderProjects() {
  const v = $('#view');
  v.innerHTML = '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="projCreate()">新建项目</fluent-button></div>' +
    '<div class="pk-stats" id="proj-list"></div>';
  const list = await api('GET', PApi.projects());
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  $('#proj-list').innerHTML = list.map(p =>
    '<fluent-card class="kb-stat" data-k="' + p.id + '">' +
    '<span class="n" style="font-size:16px;color:var(--brand)">' + esc(p.name) + '</span>' +
    '<span class="l">任务 ' + p.task_count + ' · 完成 ' + p.done_count + '</span>' +
    '<span class="kb-x" style="position:static"><fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projModels(' + p.id + ',\'' + esc(p.name).replace(/'/g, '') + '\')">机型</fluent-button></span>' +
    (canManage
      ? '<span class="kb-x"><fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projEdit(' + p.id + ')">编辑</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projMembers(' + p.id + ')">成员</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projDel(' + p.id + ')">删除</fluent-button></span>'
      : '') +
    '</fluent-card>').join('');
  // 单击项目卡 → 跳任务列表并筛选该项目
  document.querySelectorAll('#proj-list .kb-stat').forEach(el => {
    el.onclick = () => location.hash = '#/list?project=' + el.dataset.k;
  });
}

// v2：新建项目弹窗
function projCreate() {
  openModal('新建项目',
    '<div class="pk-form">' +
    '<label>项目名称 *</label><fluent-text-field id="pj-name"></fluent-text-field>' +
    '<label>项目描述</label><fluent-text-area id="pj-desc"></fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="projCreateSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function projCreateSave() {
  const name = $('#pj-name').value.trim();
  if (!name) return showToast('项目名称必填', 'err');
  try { await api('POST', PApi.projects(), { name: name, description: $('#pj-desc').value }); showToast('创建成功'); pCloseModal(); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function projEdit(id) {
  const p = await api('GET', PApi.projects(id));
  openModal('编辑项目',
    '<div class="pk-form">' +
    '<label>项目名称 *</label><fluent-text-field id="pj-name" value="' + esc(p.name) + '"></fluent-text-field>' +
    '<label>项目描述</label><fluent-text-area id="pj-desc">' + esc(p.description || '') + '</fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="projEditSave(' + id + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function projEditSave(id) {
  const name = $('#pj-name').value.trim();
  if (!name) return showToast('项目名称必填', 'err');
  try { await api('PUT', PApi.projects(id), { name: name, description: $('#pj-desc').value }); showToast('已保存'); pCloseModal(); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 删除项目（有任务时后端 409 保护）
async function projDel(id) {
  if (!confirm('确认删除该项目？（项目下有任务时将被拒绝）')) return;
  try { await api('DELETE', PApi.projects(id)); showToast('已删除'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 成员管理弹窗（成员列表 + 搜索过滤添加下拉 + 转让 owner + 移除）
// 用户列表走子系统接口 /api/projects/users（共享 /api/users 仅 ADMIN，PM 无权）
// P2-2 修复：增删/转让不再整窗重开，改为只刷新成员行（避免弹窗滚动/输入丢失、重复拉全量用户列表）
var _pjMemId = 0;
function projMembers(id) {
  _pjMemId = id;
  openModal('成员管理',
    '<div id="pj-mem-rows"></div>' +
    '<div class="pk-filters" style="margin-top:10px">' +
    '<fluent-text-field id="mem-q" placeholder="搜索用户…" onchange="memRenderOpts()"></fluent-text-field>' +
    '<fluent-select id="mem-user"></fluent-select>' +
    '<fluent-button appearance="accent" onclick="memAdd()">添加</fluent-button></div>');
  memRefresh();
  memRenderOpts();
}
// 刷新成员行（保持弹窗打开，仅更新列表区）
async function memRefresh() {
  const id = _pjMemId;
  const mem = await api('GET', PApi.projects(id) + '/members');
  $('#pj-mem-rows').innerHTML = mem.map(m =>
    '<div class="pk-row"><span class="pk-name">' + esc(m.display_name || m.username) + '</span>' +
    '<span>' + (m.is_owner ? '负责人' : '成员') + '</span>' +
    (m.is_owner
      ? ''
      : '<fluent-button appearance="secondary" size="small" onclick="memTransfer(' + m.user_id + ')">转让</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="memRemove(' + m.user_id + ')">移除</fluent-button>') +
    '</div>').join('');
}
// v2：按关键字过滤可添加用户下拉
async function memRenderOpts() {
  const q = $('#mem-q').value || '';
  const [mem, users] = await Promise.all([
    api('GET', PApi.projects(_pjMemId) + '/members'),
    api('GET', '/api/projects/users')
  ]);
  const opts = users.filter(function (u) {
    return !mem.some(function (m) { return m.user_id === u.id; }) &&
      (!q || (u.display_name || ('#' + u.id)).indexOf(q) >= 0);
  }).map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || ('#' + u.id)) + '</fluent-option>'; }).join('');
  $('#mem-user').innerHTML = opts || '<fluent-option value="">无匹配用户</fluent-option>';
}
async function memAdd() {
  const uid = $('#mem-user').value;
  if (!uid) return showToast('请选择用户');
  try { await api('POST', PApi.projects(_pjMemId) + '/members', { user_id: Number(uid) }); showToast('已添加'); memRefresh(); memRenderOpts(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memTransfer(uid) {
  try { await api('PUT', PApi.projects(_pjMemId) + '/members/' + uid, { is_owner: 1 }); showToast('已转让'); memRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memRemove(uid) {
  if (!confirm('确认移除该成员？')) return;
  try { await api('DELETE', PApi.projects(_pjMemId) + '/members/' + uid); showToast('已移除'); memRefresh(); memRenderOpts(); }
  catch (e) { showToast(e.message, 'err'); }
}

// ===== 机型引用管理（OA 移植二期：sample_models 只读引用，不写 fixtures 子系统） =====
var _pjModelId = 0;
var REF_ROLE_CN = { TARGET: '试产对象', VERIFY: '验证对象', REF: '参考机型' };
async function projModels(id, name) {
  _pjModelId = id;
  const refs = await api('GET', PApi.modelRefs(id));
  const models = await api('GET', PApi.modelOptions);
  const canEdit = me.role === 'ADMIN' || me.role === 'PM'; // 后端对成员也放宽，前端按钮从宽渲染由后端兜底
  openModal('引用机型 — ' + (name || ('项目#' + id)),
    '<div class="pk-form">' +
    '<div id="pm-ref-list">' + pmRefRows(refs, canEdit) + '</div>' +
    (canEdit
      ? '<div class="pk-row" style="margin-top:10px;gap:6px;display:flex">' +
        '<fluent-select id="pm-model" style="flex:2">' + models.map(function (m) { return '<fluent-option value="' + m.id + '">' + esc(m.code) + '（' + esc(m.full_name) + '）</fluent-option>'; }).join('') + '</fluent-select>' +
        '<fluent-select id="pm-role" style="flex:1">' + Object.keys(REF_ROLE_CN).map(function (k) { return '<fluent-option value="' + k + '">' + REF_ROLE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
        '<fluent-button appearance="accent" size="small" onclick="pmAdd()">添加</fluent-button></div>'
      : '') +
    '</div>',
    { foot: '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">关闭</fluent-button>' });
}
function pmRefRows(refs, canEdit) {
  if (!refs.length) return '<div class="muted" style="font-size:13px">暂无引用机型</div>';
  return refs.map(function (r) {
    return '<div class="pk-row" style="display:flex;justify-content:space-between;padding:4px 0">' +
      '<span><b>' + esc(r.model_code || ('#' + r.model_id)) + '</b>' +
      (r.model_name ? '<span class="muted"> ' + esc(r.model_name) + '</span>' : (r.model_id ? '<span class="muted" style="color:#b91c1c">（机型已不存在）</span>' : '')) +
      ' · ' + (REF_ROLE_CN[r.role] || r.role) + '</span>' +
      (canEdit ? '<fluent-button appearance="secondary" size="small" onclick="pmRemove(' + r.model_id + ')">移除</fluent-button>' : '') +
      '</div>';
  }).join('');
}
async function pmAdd() {
  const mid = $('#pm-model').value;
  if (!mid) return showToast('请选择机型', 'err');
  try {
    const r = await api('POST', PApi.modelRefs(_pjModelId), { model_id: Number(mid), role: $('#pm-role').value });
    showToast(r.duplicate ? '该机型已在引用列表中' : '已添加');
    const refs = await api('GET', PApi.modelRefs(_pjModelId));
    $('#pm-ref-list').innerHTML = pmRefRows(refs, true);
  } catch (e) { showToast(e.message, 'err'); }
}
async function pmRemove(mid) {
  if (!confirm('确认移除该机型引用？（不影响机型本身）')) return;
  try {
    await api('DELETE', PApi.modelRef(_pjModelId, mid));
    showToast('已移除');
    const refs = await api('GET', PApi.modelRefs(_pjModelId));
    $('#pm-ref-list').innerHTML = pmRefRows(refs, true);
  } catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/milestones.js --- */
// milestones.js — OA 能力移植：里程碑管理（项目下拉 + 里程碑列表 + 新建/编辑/达成/删除）
// 权限：新建/编辑/达成/删除 = ADMIN/PM（owner 由后端二次校验）；其他角色只读
async function renderMilestones() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="ms-project" onchange="msLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="msCreate()">新建里程碑</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="msLoad()">刷新</fluent-button></div>' +
    '<div id="ms-list"></div>';
  const projects = await api('GET', PApi.projects());
  $('#ms-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
}

async function msLoad() {
  const pid = $('#ms-project').value;
  const box = $('#ms-list');
  if (!pid) { box.innerHTML = '<div class="empty-hint">请先选择项目</div>'; return; }
  const list = await api('GET', PApi.milestones(pid));
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="empty-hint">该项目暂无里程碑</div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (m) {
    const done = m.status === 'ACHIEVED';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(m.name) + '</span>' +
      '<span class="l">目标 ' + (m.target_date || '—') +
      (done ? ' · 达成 ' + (m.actual_date || '') + (m.is_delayed ? ' <b style="color:#b91c1c">（延期）</b>' : '') : '') + '</span>' +
      '<span class="l">' + (done
        ? '<span style="color:#065f46">✔ 已达成</span>'
        : '待达成' + (m.target_date && m.target_date < new Date().toISOString().slice(0, 10) ? ' <b style="color:#b91c1c">（已超期）</b>' : '')) + '</span>' +
      (canManage
        ? '<span class="kb-x">' +
          (done ? '' : '<fluent-button appearance="accent" size="small" onclick="msAchieve(' + m.id + ',' + m.version + ')">达成</fluent-button> ') +
          '<fluent-button appearance="secondary" size="small" onclick="msEdit(' + m.id + ')">编辑</fluent-button> ' +
          '<fluent-button appearance="secondary" size="small" onclick="msDel(' + m.id + ')">删除</fluent-button></span>'
        : '') +
      '</fluent-card>';
  }).join('') + '</div>';
}

function msCreate() {
  const pid = $('#ms-project').value;
  if (!pid) return showToast('请先选择项目', 'err');
  openModal('新建里程碑',
    '<div class="pk-form">' +
    '<label>里程碑名称 *</label><fluent-text-field id="ms-name"></fluent-text-field>' +
    '<label>目标日期</label><fluent-text-field id="ms-date" type="date"></fluent-text-field>' +
    '<label>排序（小在前）</label><fluent-text-field id="ms-sort" type="number" value="0"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="ms-desc"></fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="msCreateSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function msCreateSave() {
  const pid = $('#ms-project').value;
  const name = $('#ms-name').value.trim();
  if (!name) return showToast('里程碑名称必填', 'err');
  try {
    await api('POST', PApi.milestones(pid), {
      name: name, target_date: $('#ms-date').value || null,
      sort: Number($('#ms-sort').value) || 0, description: $('#ms-desc').value
    });
    showToast('创建成功'); pCloseModal(); msLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function msEdit(id) {
  const pid = $('#ms-project').value;
  const list = await api('GET', PApi.milestones(pid));
  const m = list.find(function (x) { return x.id === id; });
  if (!m) return showToast('里程碑不存在', 'err');
  if (m.status === 'ACHIEVED') return showToast('已达成里程碑不可编辑', 'err');
  openModal('编辑里程碑',
    '<div class="pk-form">' +
    '<label>里程碑名称 *</label><fluent-text-field id="ms-name" value="' + esc(m.name) + '"></fluent-text-field>' +
    '<label>目标日期</label><fluent-text-field id="ms-date" type="date" value="' + (m.target_date || '') + '"></fluent-text-field>' +
    '<label>排序</label><fluent-text-field id="ms-sort" type="number" value="' + (m.sort || 0) + '"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="ms-desc">' + esc(m.description || '') + '</fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="msEditSave(' + id + ',' + m.version + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function msEditSave(id, version) {
  const name = $('#ms-name').value.trim();
  if (!name) return showToast('里程碑名称必填', 'err');
  try {
    await api('PUT', PApi.milestone(id), {
      name: name, target_date: $('#ms-date').value || null,
      sort: Number($('#ms-sort').value) || 0, description: $('#ms-desc').value, version: version
    });
    showToast('已保存'); pCloseModal(); msLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

// 达成里程碑（CAS：传读取时 version；409 时提示刷新）
async function msAchieve(id, version) {
  if (!confirm('确认标记该里程碑已达成？（若已超过目标日期将自动标记延期）')) return;
  try {
    await api('POST', PApi.milestoneAchieve(id), { version: version });
    showToast('已达成'); msLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function msDel(id) {
  if (!confirm('确认删除该里程碑？')) return;
  try { await api('DELETE', PApi.milestone(id)); showToast('已删除'); msLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/risks.js --- */
// risks.js — OA 能力移植：风险管理（项目下拉 + 风险列表 + 严重度×概率矩阵标记 + 新建/编辑/解决/删除）
// 权限：识别 = 项目成员（后端校验）；编辑/解决/删除 = ADMIN/PM（owner 后端二次校验）；只读角色仅浏览
async function renderRisks() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="rk-project" onchange="rkLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="rkCreate()">识别风险</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="rkLoad()">刷新</fluent-button></div>' +
    '<div id="rk-list"></div>';
  const projects = await api('GET', PApi.projects());
  $('#rk-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
}

// 严重度/概率中文与颜色（对齐 constants.js 优先级配色习惯）
var SEV_CN = { H: '高', M: '中', L: '低' };
var SEV_COLOR = { H: '#b91c1c', M: '#92400e', L: '#065f46' };
var RISK_TYPE_CN = { schedule: '进度', quality: '质量', resource: '资源', tech: '技术', other: '其他' };

async function rkLoad() {
  const pid = $('#rk-project').value;
  const box = $('#rk-list');
  if (!pid) { box.innerHTML = '<div class="empty-hint">请先选择项目</div>'; return; }
  const list = await api('GET', PApi.risks(pid));
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="empty-hint">该项目暂无风险记录</div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (r) {
    const resolved = r.status === 'RESOLVED';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(r.risk_name) + '</span>' +
      '<span class="l">' + (RISK_TYPE_CN[r.risk_type] || r.risk_type || '—') +
      ' · 严重度 <b style="color:' + SEV_COLOR[r.severity] + '">' + (SEV_CN[r.severity] || r.severity) + '</b>' +
      ' · 概率 <b style="color:' + SEV_COLOR[r.probability] + '">' + (SEV_CN[r.probability] || r.probability) + '</b></span>' +
      (r.impact ? '<span class="l">影响：' + esc(r.impact) + '</span>' : '') +
      '<span class="l">' + (resolved
        ? '<span style="color:#065f46">✔ 已解决</span>' + (r.resolved_name ? '（' + esc(r.resolved_name) + ' ' + (r.resolved_at || '').slice(0, 10) + '）' : '')
        : '<span style="color:#b91c1c">● 开放</span>' + (r.identified_name ? '（' + esc(r.identified_name) + ' 识别）' : '')) + '</span>' +
      (canManage
        ? '<span class="kb-x">' +
          (resolved ? '' : '<fluent-button appearance="accent" size="small" onclick="rkResolve(' + r.id + ',' + r.version + ')">解决</fluent-button> ' +
          '<fluent-button appearance="secondary" size="small" onclick="rkEdit(' + r.id + ')">编辑</fluent-button> ') +
          '<fluent-button appearance="secondary" size="small" onclick="rkDel(' + r.id + ')">删除</fluent-button></span>'
        : '') +
      '</fluent-card>';
  }).join('') + '</div>';
}

function rkCreate() {
  const pid = $('#rk-project').value;
  if (!pid) return showToast('请先选择项目', 'err');
  openModal('识别风险',
    '<div class="pk-form">' +
    '<label>风险名称 *</label><fluent-text-field id="rk-name"></fluent-text-field>' +
    '<label>类型</label><fluent-select id="rk-type">' +
    Object.keys(RISK_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '">' + RISK_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>严重度</label><fluent-select id="rk-sev"><fluent-option value="H">高</fluent-option><fluent-option value="M" selected>中</fluent-option><fluent-option value="L">低</fluent-option></fluent-select>' +
    '<label>发生概率</label><fluent-select id="rk-prob"><fluent-option value="H">高</fluent-option><fluent-option value="M" selected>中</fluent-option><fluent-option value="L">低</fluent-option></fluent-select>' +
    '<label>影响说明</label><fluent-text-field id="rk-impact"></fluent-text-field>' +
    '<label>缓解措施</label><fluent-text-area id="rk-mit"></fluent-text-area>' +
    '<label>描述</label><fluent-text-area id="rk-desc"></fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="rkCreateSave()">提交</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function rkCreateSave() {
  const pid = $('#rk-project').value;
  const name = $('#rk-name').value.trim();
  if (!name) return showToast('风险名称必填', 'err');
  try {
    await api('POST', PApi.risks(pid), {
      risk_name: name, risk_type: $('#rk-type').value,
      severity: $('#rk-sev').value, probability: $('#rk-prob').value,
      impact: $('#rk-impact').value, mitigation: $('#rk-mit').value, description: $('#rk-desc').value
    });
    showToast('已识别'); pCloseModal(); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkEdit(id) {
  const pid = $('#rk-project').value;
  const list = await api('GET', PApi.risks(pid));
  const r = list.find(function (x) { return x.id === id; });
  if (!r) return showToast('风险不存在', 'err');
  if (r.status === 'RESOLVED') return showToast('已解决风险不可编辑', 'err');
  openModal('编辑风险',
    '<div class="pk-form">' +
    '<label>风险名称 *</label><fluent-text-field id="rk-name" value="' + esc(r.risk_name) + '"></fluent-text-field>' +
    '<label>类型</label><fluent-select id="rk-type">' +
    Object.keys(RISK_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '"' + (r.risk_type === k ? ' selected' : '') + '>' + RISK_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>严重度</label><fluent-select id="rk-sev">' +
    ['H', 'M', 'L'].map(function (s) { return '<fluent-option value="' + s + '"' + (r.severity === s ? ' selected' : '') + '>' + SEV_CN[s] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>发生概率</label><fluent-select id="rk-prob">' +
    ['H', 'M', 'L'].map(function (s) { return '<fluent-option value="' + s + '"' + (r.probability === s ? ' selected' : '') + '>' + SEV_CN[s] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>影响说明</label><fluent-text-field id="rk-impact" value="' + esc(r.impact || '') + '"></fluent-text-field>' +
    '<label>缓解措施</label><fluent-text-area id="rk-mit">' + esc(r.mitigation || '') + '</fluent-text-area>' +
    '<label>描述</label><fluent-text-area id="rk-desc">' + esc(r.description || '') + '</fluent-text-area></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="rkEditSave(' + id + ',' + r.version + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function rkEditSave(id, version) {
  const name = $('#rk-name').value.trim();
  if (!name) return showToast('风险名称必填', 'err');
  try {
    await api('PUT', PApi.risk(id), {
      risk_name: name, risk_type: $('#rk-type').value,
      severity: $('#rk-sev').value, probability: $('#rk-prob').value,
      impact: $('#rk-impact').value, mitigation: $('#rk-mit').value,
      description: $('#rk-desc').value, version: version
    });
    showToast('已保存'); pCloseModal(); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkResolve(id, version) {
  if (!confirm('确认标记该风险已解决？')) return;
  try {
    await api('POST', PApi.riskResolve(id), { version: version });
    showToast('已解决'); rkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}

async function rkDel(id) {
  if (!confirm('确认删除该风险记录？')) return;
  try { await api('DELETE', PApi.risk(id)); showToast('已删除'); rkLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/changes.js --- */
// changes.js — OA 能力移植二期：变更管理（项目下拉 + 变更单列表 + 新建/编辑/审批/删除）
// 审批人：ADMIN/PM/项目 owner（后端校验）；申请人不能审批本人变更；BUDGET 批准后自动写入预算
// TIME 类批准后仅记录，不自动顺延任务日期（用户确认保守方案）
var CHG_TYPE_CN = { SCOPE: '范围', TIME: '时间', RESOURCE: '资源', BUDGET: '预算' };
var CHG_STATUS_CN = { PENDING: '待审批', APPROVED: '已批准', REJECTED: '已驳回' };
var CHG_STATUS_COLOR = { PENDING: '#92400e', APPROVED: '#065f46', REJECTED: '#b91c1c' };

async function renderChanges() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="cg-project" onchange="cgLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<fluent-button appearance="accent" onclick="cgCreate()">发起变更</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="cgLoad()">刷新</fluent-button></div>' +
    '<div id="cg-list"></div>';
  const projects = await api('GET', PApi.projects());
  $('#cg-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
}

async function cgLoad() {
  const pid = $('#cg-project').value;
  const box = $('#cg-list');
  if (!pid) { box.innerHTML = '<div class="empty-hint">请先选择项目</div>'; return; }
  const list = await api('GET', PApi.changes(pid));
  const canApprove = me.role === 'ADMIN' || me.role === 'PM';
  if (!list.length) { box.innerHTML = '<div class="empty-hint">该项目暂无变更单</div>'; return; }
  box.innerHTML = '<div class="pk-stats">' + list.map(function (c) {
    const pending = c.status === 'PENDING';
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px">' + esc(c.change_no || ('#' + c.id)) + ' · ' + (CHG_TYPE_CN[c.change_type] || c.change_type) + '变更</span>' +
      '<span class="l">' + esc(c.description) + '</span>' +
      (c.before_value ? '<span class="l">变更前：' + esc(c.before_value) + ' → 变更后：' + esc(c.after_value || '—') + '</span>' : '') +
      (c.reason ? '<span class="l">原因：' + esc(c.reason) + '</span>' : '') +
      '<span class="l"><b style="color:' + CHG_STATUS_COLOR[c.status] + '">' + (CHG_STATUS_CN[c.status] || c.status) + '</b>' +
      ' · 申请人 ' + esc(c.applicant_name || ('#' + c.applicant_id)) +
      (pending ? '' : ' · 审批人 ' + esc(c.approver_name || ('#' + c.approver_id)) + ' ' + (c.approved_at || '').slice(0, 10)) + '</span>' +
      '<span class="kb-x">' +
      (pending && canApprove && c.applicant_id !== me.id
        ? '<fluent-button appearance="accent" size="small" onclick="cgApprove(' + c.id + ',' + c.version + ',\'APPROVED\')">批准</fluent-button> ' +
          '<fluent-button appearance="secondary" size="small" onclick="cgApprove(' + c.id + ',' + c.version + ',\'REJECTED\')">驳回</fluent-button> '
        : '') +
      (pending && (canApprove || c.applicant_id === me.id)
        ? '<fluent-button appearance="secondary" size="small" onclick="cgEdit(' + c.id + ')">编辑</fluent-button> ' : '') +
      (pending && (canApprove || c.applicant_id === me.id)
        ? '<fluent-button appearance="secondary" size="small" onclick="cgDel(' + c.id + ')">删除</fluent-button>' : '') +
      '</span></fluent-card>';
  }).join('') + '</div>';
}

function cgCreate() {
  const pid = $('#cg-project').value;
  if (!pid) return showToast('请先选择项目', 'err');
  cgForm('发起变更', { change_type: 'SCOPE' }, null, 0);
}
function cgEdit(id) {
  const pid = $('#cg-project').value;
  api('GET', PApi.changes(pid)).then(function (list) {
    const c = list.find(function (x) { return x.id === id; });
    if (!c) return showToast('变更单不存在', 'err');
    cgForm('编辑变更单 ' + (c.change_no || ''), c, id, c.version);
  });
}
// 变更单新建/编辑共用弹窗
function cgForm(title, c, cid, version) {
  const isBudget = c.change_type === 'BUDGET';
  openModal(title,
    '<div class="pk-form">' +
    '<label>变更类型 *</label><fluent-select id="cg-type">' +
    Object.keys(CHG_TYPE_CN).map(function (k) { return '<fluent-option value="' + k + '"' + (c.change_type === k ? ' selected' : '') + '>' + CHG_TYPE_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>变更内容描述 *</label><fluent-text-area id="cg-desc">' + esc(c.description || '') + '</fluent-text-area>' +
    '<label>变更前</label><fluent-text-field id="cg-before" value="' + esc(c.before_value || '') + '"></fluent-text-field>' +
    '<label>变更后' + (isBudget ? '（数字，批准后写入项目预算）' : '') + '</label><fluent-text-field id="cg-after" value="' + esc(c.after_value || '') + '"></fluent-text-field>' +
    '<label>变更原因</label><fluent-text-area id="cg-reason">' + esc(c.reason || '') + '</fluent-text-area>' +
    '<div class="muted" style="font-size:12px;margin-top:6px">审批人：管理员/项目经理/项目负责人；申请人不能审批本人发起的变更；BUDGET 类批准后自动更新项目预算。</div></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="' + (cid ? 'cgEditSave(' + cid + ',' + version + ')' : 'cgCreateSave()') + '">提交</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
function cgReadForm() {
  return {
    change_type: $('#cg-type').value,
    description: $('#cg-desc').value.trim(),
    before_value: $('#cg-before').value,
    after_value: $('#cg-after').value,
    reason: $('#cg-reason').value
  };
}
async function cgCreateSave() {
  const pid = $('#cg-project').value;
  const d = cgReadForm();
  if (!d.description) return showToast('变更内容描述必填', 'err');
  try {
    const r = await api('POST', PApi.changes(pid), d);
    showToast('已发起 ' + (r.change_no || ''));
    pCloseModal(); cgLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
async function cgEditSave(cid, version) {
  const d = cgReadForm();
  if (!d.description) return showToast('变更内容描述必填', 'err');
  try {
    await api('PUT', PApi.change(cid), Object.assign({ version: version }, d));
    showToast('已保存'); pCloseModal(); cgLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
// 审批（decision=APPROVED/REJECTED；CAS version 防并发双审）
async function cgApprove(cid, version, decision) {
  const word = decision === 'APPROVED' ? '批准' : '驳回';
  if (!confirm('确认' + word + '该变更单？（BUDGET 类批准后自动更新项目预算）')) return;
  try {
    await api('POST', PApi.changeApprove(cid), { decision: decision, version: version });
    showToast('已' + word); cgLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
async function cgDel(cid) {
  if (!confirm('确认删除该变更单？（已审批单留档不可删）')) return;
  try { await api('DELETE', PApi.change(cid)); showToast('已删除'); cgLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/templates.js --- */
// templates.js — OA 移植二期批次2：项目模板（卡片列表 + 清单编辑 + 从模板创建项目向导）
// 仅 ADMIN/PM 可见此导航（router roles 控）；后端同权限校验兜底
var TPL_CATEGORY_CN = { equipment: '设备', quality: '质量', process: '流程', safety: '安全', other: '其他' };

async function renderTemplates() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="tplCreate()">新建模板</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="renderTemplates()">刷新</fluent-button></div>' +
    '<div id="tpl-list" class="pk-stats" style="margin-top:10px"></div>';
  const list = await api('GET', PApi.templates);
  if (!list.length) { $('#tpl-list').innerHTML = '<div class="empty-hint">暂无模板，点击「新建模板」创建</div>'; return; }
  $('#tpl-list').innerHTML = list.map(function (t) {
    return '<fluent-card class="kb-stat">' +
      '<span class="n" style="font-size:15px;color:var(--brand)">' + esc(t.name) + '</span>' +
      (t.description ? '<span class="l">' + esc(t.description) + '</span>' : '') +
      '<span class="l">任务 ' + t.tasks.length + ' · 里程碑 ' + t.milestones.length + ' · 已实例化 ' + t.instance_count + ' 次</span>' +
      '<span class="kb-x">' +
      '<fluent-button appearance="accent" size="small" onclick="tplWizard(' + t.id + ',\'' + esc(t.name).replace(/'/g, '') + '\')">从模板创建项目</fluent-button> ' +
      '<fluent-button appearance="secondary" size="small" onclick="tplEdit(' + t.id + ')">编辑</fluent-button> ' +
      '<fluent-button appearance="secondary" size="small" onclick="tplDel(' + t.id + ',\'' + esc(t.name).replace(/'/g, '') + '\')">停用</fluent-button></span>' +
      '</fluent-card>';
  }).join('');
}

// 模板新建/编辑弹窗（任务/里程碑清单按行编辑，行内 5 列/2 列）
function tplForm(title, t, tid) {
  t = t || { name: '', description: '', tasks: [], milestones: [] };
  const taskRows = t.tasks.map(function (x, i) { return tplTaskRow(i, x); }).join('') || tplTaskRow(0, {});
  const msRows = t.milestones.map(function (x, i) { return tplMsRow(i, x); }).join('') || tplMsRow(0, {});
  openModal(title,
    '<div class="pk-form">' +
    '<label>模板名称 *</label><fluent-text-field id="tf-name" value="' + esc(t.name) + '"></fluent-text-field>' +
    '<label>模板说明</label><fluent-text-area id="tf-desc">' + esc(t.description || '') + '</fluent-text-area>' +
    '<label style="margin-top:8px">任务清单（偏移天数=距项目启动日；工期天仅备注用）</label>' +
    '<div id="tf-tasks">' + taskRows + '</div>' +
    '<fluent-button appearance="neutral" size="small" onclick="tplAddTask()">+ 加任务</fluent-button>' +
    '<label style="margin-top:8px">里程碑清单（目标偏移天数=距项目启动日）</label>' +
    '<div id="tf-ms">' + msRows + '</div>' +
    '<fluent-button appearance="neutral" size="small" onclick="tplAddMs()">+ 加里程碑</fluent-button>' +
    '</div>',
    { wide: true, foot: '<fluent-button appearance="accent" size="small" onclick="' + (tid ? 'tplSave(' + tid + ')' : 'tplSave()') + '">保存</fluent-button>' +
        '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
function tplTaskRow(i, x) {
  return '<div class="pk-row" style="display:flex;gap:4px;margin:3px 0" data-tpl-task>' +
    '<input placeholder="任务标题" value="' + esc(x.title || '') + '" style="flex:3" data-k="title">' +
    '<select style="flex:1" data-k="category">' + Object.keys(TPL_CATEGORY_CN).map(function (k) { return '<option value="' + k + '"' + (x.category === k ? ' selected' : '') + '>' + TPL_CATEGORY_CN[k] + '</option>'; }).join('') + '</select>' +
    '<select style="flex:1" data-k="priority">' + ['H', 'M', 'L'].map(function (k) { return '<option value="' + k + '"' + (x.priority === k ? ' selected' : '') + '>' + k + '</option>'; }).join('') + '</select>' +
    '<input type="number" placeholder="偏移天" min="0" value="' + (x.offset_days || 0) + '" style="flex:1" data-k="offset_days">' +
    '<input type="number" placeholder="工期天" min="0" value="' + (x.planned_days || 0) + '" style="flex:1" data-k="planned_days">' +
    '<fluent-button appearance="neutral" size="small" onclick="this.closest(\'[data-tpl-task]\').remove()">删</fluent-button></div>';
}
function tplMsRow(i, x) {
  return '<div class="pk-row" style="display:flex;gap:4px;margin:3px 0" data-tpl-ms>' +
    '<input placeholder="里程碑名称" value="' + esc(x.name || '') + '" style="flex:3" data-k="name">' +
    '<input type="number" placeholder="目标偏移天" min="0" value="' + (x.target_offset_days || 0) + '" style="flex:1" data-k="target_offset_days">' +
    '<fluent-button appearance="neutral" size="small" onclick="this.closest(\'[data-tpl-ms]\').remove()">删</fluent-button></div>';
}
function tplAddTask() { $('#tf-tasks').insertAdjacentHTML('beforeend', tplTaskRow(999, {})); }
function tplAddMs() { $('#tf-ms').insertAdjacentHTML('beforeend', tplMsRow(999, {})); }
function tplReadForm() {
  const tasks = [], milestones = [];
  document.querySelectorAll('#tf-tasks [data-tpl-task]').forEach(function (row) {
    const title = row.querySelector('[data-k="title"]').value.trim();
    if (title) tasks.push({
      title: title, category: row.querySelector('[data-k="category"]').value,
      priority: row.querySelector('[data-k="priority"]').value,
      offset_days: Number(row.querySelector('[data-k="offset_days"]').value) || 0,
      planned_days: Number(row.querySelector('[data-k="planned_days"]').value) || 0
    });
  });
  document.querySelectorAll('#tf-ms [data-tpl-ms]').forEach(function (row) {
    const name = row.querySelector('[data-k="name"]').value.trim();
    if (name) milestones.push({ name: name, target_offset_days: Number(row.querySelector('[data-k="target_offset_days"]').value) || 0 });
  });
  return { name: $('#tf-name').value.trim(), description: $('#tf-desc').value.trim(), tasks: tasks, milestones: milestones };
}
function tplCreate() { tplForm('新建模板', null, 0); }
async function tplEdit(id) {
  const list = await api('GET', PApi.templates);
  const t = list.find(function (x) { return x.id === id; });
  if (!t) return showToast('模板不存在', 'err');
  tplForm('编辑模板：' + t.name, t, id);
}
async function tplSave(tid) {
  const d = tplReadForm();
  if (!d.name) return showToast('模板名称必填', 'err');
  try {
    if (tid) await api('PUT', PApi.template(tid), d);
    else await api('POST', PApi.templates, d);
    showToast('已保存'); pCloseModal(); renderTemplates();
  } catch (e) { showToast(e.message, 'err'); }
}
async function tplDel(id, name) {
  if (!confirm('确认停用模板「' + name + '」？（已实例化的项目不受影响）')) return;
  try { await api('DELETE', PApi.template(id)); showToast('已停用'); renderTemplates(); }
  catch (e) { showToast(e.message, 'err'); }
}

// ===== 从模板创建项目向导（两步：填信息+选机型 → 预览 → 确认） =====
var _tplWiz = null;
async function tplWizard(id, name) {
  const list = await api('GET', PApi.templates);
  const t = list.find(function (x) { return x.id === id; });
  if (!t) return showToast('模板不存在', 'err');
  const models = await api('GET', PApi.modelOptions);
  _tplWiz = { id: id, name: name, tasks: t.tasks, milestones: t.milestones };
  openModal('从模板创建项目 — ' + name,
    '<div class="pk-form">' +
    '<label>项目名称 *（独立命名，与机型解耦）</label><fluent-text-field id="tw-name"></fluent-text-field>' +
    '<label>启动日期 *（任务/里程碑按此日 + 偏移天数推算）</label><input type="date" id="tw-start" style="padding:4px">' +
    '<label>引用机型（可多选，Ctrl+点击）</label><select id="tw-models" multiple size="5" style="width:100%">' +
    models.map(function (m) { return '<option value="' + m.id + '">' + esc(m.code) + '（' + esc(m.full_name) + '）</option>'; }).join('') + '</select>' +
    '<label style="margin-top:8px">项目描述</label><fluent-text-area id="tw-desc"></fluent-text-area>' +
    '<div class="muted" style="font-size:12px">将生成：任务 ' + t.tasks.length + ' 个 · 里程碑 ' + t.milestones.length + ' 个（下一步预览确认）</div></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tplWizPreview()">预览</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
function tplWizPreview() {
  const name = $('#tw-name').value.trim();
  const start = $('#tw-start').value;
  if (!name) return showToast('项目名称必填', 'err');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return showToast('请选择启动日期', 'err');
  const modelIds = Array.prototype.slice.call($('#tw-models').selectedOptions).map(function (o) { return Number(o.value); });
  const modelNames = Array.prototype.slice.call($('#tw-models').selectedOptions).map(function (o) { return o.textContent; });
  _tplWiz.req = { name: name, start_date: start, model_ids: modelIds, description: $('#tw-desc').value.trim() };
  const addD = function (ds, n) { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const taskLines = _tplWiz.tasks.map(function (x) { return '<div>· ' + esc(x.title) + '（' + TPL_CATEGORY_CN[x.category] + '/' + x.priority + ' → ' + addD(start, x.offset_days) + '）</div>'; }).join('');
  const msLines = _tplWiz.milestones.map(function (x) { return '<div>◆ ' + esc(x.name) + '（目标 ' + addD(start, x.target_offset_days) + '）</div>'; }).join('');
  openModal('预览 — ' + name,
    '<div class="pk-form" style="font-size:13px;line-height:1.7">' +
    '<b>启动日期：</b>' + start + '<br>' +
    (modelNames.length ? '<b>引用机型：</b>' + esc(modelNames.join('、')) + '<br>' : '') +
    '<b style="display:block;margin-top:6px">任务 ' + _tplWiz.tasks.length + ' 个：</b>' + taskLines +
    '<b style="display:block;margin-top:6px">里程碑 ' + _tplWiz.milestones.length + ' 个：</b>' + msLines +
    '<div class="muted" style="margin-top:8px;font-size:12px">确认后一次性创建（事务化，任一步失败整体回滚）</div></div>',
    { wide: true, foot: '<fluent-button appearance="accent" size="small" onclick="tplWizGo()">确认创建</fluent-button>' +
        '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">返回修改</fluent-button>' });
}
async function tplWizGo() {
  try {
    const r = await api('POST', PApi.templateInstantiate(_tplWiz.id), _tplWiz.req);
    showToast('项目已创建：生成任务 ' + r.tasks + ' · 里程碑 ' + r.milestones + (r.model_refs ? ' · 机型 ' + r.model_refs : ''));
    pCloseModal();
    location.hash = '#/projects';
  } catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/gantt.js --- */
// gantt.js — OA 移植二期批次2：甘特图（纯前端自绘，无第三方依赖）
// 数据：任务(标题/planned_date/status/progress) + 里程碑(target/actual/is_delayed) + 依赖(depends_on)
// 任务无开始日字段 → 条形终点=planned_date、长度=工期估算(7天)起点；依赖箭头按「前置任务终点→后续任务起点」
var GT_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', BLOCKED: '阻塞' };
var GT_STATUS_COLOR = { NOT_STARTED: '#94a3b8', IN_PROGRESS: '#2563eb', DONE: '#059669', BLOCKED: '#dc2626' };

async function renderGantt() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="gt-project" onchange="gtLoad()"><fluent-option value="">选择项目…</fluent-option></fluent-select>' +
    '<span id="gt-legend" style="font-size:12px;color:#64748b;margin-left:12px">' +
    Object.keys(GT_STATUS_COLOR).map(function (k) { return '<span style="color:' + GT_STATUS_COLOR[k] + '">■</span> ' + GT_STATUS_CN[k]; }).join('　') +
    '　<span style="color:#b45309">◆</span> 里程碑（空心=已延期）</span></div>' +
    '<div id="gt-box" style="overflow-x:auto;border:1px solid var(--border,#e2e8f0);border-radius:8px;background:#fff"></div>';
  const projects = await api('GET', PApi.projects());
  $('#gt-project').innerHTML = '<fluent-option value="">选择项目…</fluent-option>' +
    projects.map(function (p) { return '<fluent-option value="' + p.id + '">' + esc(p.name) + '</fluent-option>'; }).join('');
  // 支持 #/gantt?project=N 直达
  const m = (location.hash.match(/project=(\d+)/) || [])[1];
  if (m) { $('#gt-project').value = m; gtLoad(); }
}

async function gtLoad() {
  const pid = $('#gt-project').value;
  const box = $('#gt-box');
  if (!pid) { box.innerHTML = '<div style="padding:24px;color:#94a3b8">请先选择项目</div>'; return; }
  const tasks = await api('GET', PApi.projectTasks(pid));
  const milestones = await api('GET', PApi.milestones(pid));
  const depsMap = {}; // taskId -> [dependsOn...]
  // 依赖：逐任务详情并行拉取太多请求 → 批量解析（deps 接口是按任务查询的，这里仅对有依赖线索的任务拉取）
  // 简化：拉第一个任务页的依赖映射不可行 → 改为按需：若有任务才拉全部任务的 deps（任务数一般 <50，可接受）
  const depResults = await Promise.all(tasks.map(function (t) { return api('GET', PApi.taskDeps(t.id)).catch(function () { return []; }); }));
  tasks.forEach(function (t, i) {
    if (depResults[i] && depResults[i].length) depsMap[t.id] = depResults[i];
  });
  gtDraw(tasks, milestones, depsMap);
}

function gtDraw(tasks, milestones, depsMap) {
  const box = $('#gt-box');
  if (!tasks.length && !milestones.length) { box.innerHTML = '<div style="padding:24px;color:#94a3b8">该项目暂无任务/里程碑</div>'; return; }
  const DAY = 86400000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  // 日期范围：所有 planned_date / target_date 的 min/max，前后各留 3 天
  let min = null, max = null;
  function span(d) { if (!d) return; const t = new Date(d).getTime(); if (!min || t < min) min = t; if (!max || t > max) max = t; }
  tasks.forEach(function (t) { span(t.planned_date); });
  milestones.forEach(function (m) { span(m.target_date); span(m.actual_date); });
  if (!min) { min = today.getTime(); max = min + 30 * DAY; }
  min -= 3 * DAY; max += 3 * DAY;
  const totalDays = Math.ceil((max - min) / DAY) || 1;
  const COLW = 34, ROWH = 30, LEFTW = 220, HEADH = 26;
  const width = LEFTW + totalDays * COLW;
  const rows = [];
  tasks.forEach(function (t) { rows.push({ kind: 'task', d: t }); });
  milestones.forEach(function (m) { rows.push({ kind: 'ms', d: m }); });
  const height = HEADH + rows.length * ROWH + 8;
  // 月份/日期刻度
  let scale = '';
  for (let i = 0; i < totalDays; i++) {
    const dayT = min + i * DAY;
    const dt = new Date(dayT);
    const isMonthStart = dt.getDate() === 1;
    const isToday = dayT === today.getTime();
    if (i % 2 === 0) scale += '<div style="position:absolute;left:' + (LEFTW + i * COLW) + 'px;top:0;width:1px;height:' + height + 'px;background:#f1f5f9"></div>';
    if (isMonthStart) scale += '<div style="position:absolute;left:' + (LEFTW + i * COLW) + 'px;top:0;width:1px;height:' + height + 'px;background:#cbd5e1"></div>' +
      '<div style="position:absolute;left:' + (LEFTW + i * COLW + 3) + 'px;top:2px;font-size:11px;color:#64748b">' + (dt.getMonth() + 1) + '月</div>';
    if (isToday) scale += '<div style="position:absolute;left:' + (LEFTW + i * COLW) + 'px;top:0;width:2px;height:' + height + 'px;background:#f59e0b;opacity:.7;z-index:2"></div>';
  }
  const todayX = LEFTW + Math.round((today.getTime() - min) / DAY) * COLW;
  let body = '', bars = '', arrows = '';
  const rowPos = {}; // id -> {y, xStart, xEnd, kind}
  rows.forEach(function (r, idx) {
    const y = HEADH + idx * ROWH;
    const d = r.d;
    const label = r.kind === 'task' ? d.title : '◆ ' + d.name;
    body += '<div style="position:absolute;left:0;top:' + y + 'px;width:' + LEFTW + 'px;height:' + (ROWH - 4) + 'px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:12px;padding-left:6px;line-height:' + (ROWH - 4) + 'px;border-bottom:1px solid #f8fafc" title="' + esc(label) + '">' +
      '<span style="color:' + (r.kind === 'ms' ? '#b45309' : '#334155') + '">' + esc(label) + '</span></div>';
    body += '<div style="position:absolute;left:' + LEFTW + 'px;top:' + y + 'px;width:' + (totalDays * COLW) + 'px;height:' + (ROWH - 4) + 'px;border-bottom:1px solid #f8fafc"></div>';
    if (r.kind === 'task') {
      const dueT = d.planned_date ? new Date(d.planned_date).getTime() : null;
      const est = 7 * DAY; // 无开始日：以「截止前 7 天」为默认工期窗
      const xEnd = dueT ? Math.round((dueT - min) / DAY) * COLW : null;
      const xStart = xEnd !== null ? Math.max(0, xEnd - Math.round(est / DAY) * COLW) : null;
      const overdue = dueT && d.status !== 'DONE' && dueT < today.getTime();
      if (xStart !== null) {
        const w = Math.max(COLW, xEnd - xStart);
        const color = GT_STATUS_COLOR[d.status] || '#94a3b8';
        bars += '<div style="position:absolute;left:' + (LEFTW + xStart) + 'px;top:' + (y + 5) + 'px;width:' + w + 'px;height:' + (ROWH - 14) + 'px;background:' + color + ';opacity:' + (d.status === 'DONE' ? '.45' : '.8') + ';border-radius:4px;cursor:pointer" ' +
          'onclick="gtOpenTask(' + d.id + ')" title="' + esc(d.title) + ' · ' + (GT_STATUS_CN[d.status] || d.status) + (d.progress !== undefined ? ' ' + d.progress + '%' : '') + (overdue ? ' · 已逾期' : '') + '">' +
          (d.status === 'IN_PROGRESS' && d.progress ? '<div style="height:100%;width:' + d.progress + '%;background:rgba(255,255,255,.4);border-radius:4px"></div>' : '') + '</div>';
        if (overdue) bars += '<div style="position:absolute;left:' + (LEFTW + xEnd) + 'px;top:' + (y + 4) + 'px;font-size:10px;color:#dc2626">!</div>';
        rowPos[d.id] = { y: y, xEnd: xEnd, xStart: xStart, kind: 'task' };
      }
    } else {
      const tT = d.target_date ? new Date(d.target_date).getTime() : null;
      if (tT) {
        const x = Math.round((tT - min) / DAY) * COLW;
        const delayed = d.is_delayed && !d.actual_date;
        bars += '<div style="position:absolute;left:' + (LEFTW + x - 7) + 'px;top:' + (y + 4) + 'px;width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;border-top:14px solid ' + (d.actual_date ? '#059669' : (delayed ? 'transparent' : '#b45309')) + ';' + (delayed ? 'border-top-color:transparent;box-shadow:none;outline:2px solid #dc2626;outline-offset:-2px;transform:rotate(45deg);width:10px;height:10px;border-radius:2px;' : '') + 'cursor:pointer" ' +
          'title="' + esc(d.name) + ' · 目标 ' + d.target_date + (d.actual_date ? ' · 已达成 ' + d.actual_date.slice(0, 10) : (delayed ? ' · 已延期' : '')) + '" onclick="gtMsInfo(' + d.id + ')"></div>';
        rowPos['ms' + d.id] = { y: y, x: x };
      }
    }
  });
  // 依赖箭头（前置任务终点 → 后续任务起点；简化为水平虚线标注，SVG 连线在行间绘制成本高）
  let depCount = 0;
  Object.keys(depsMap).forEach(function (tid) {
    const to = rowPos[tid];
    if (!to) return;
    depsMap[tid].forEach(function (dep) {
      const from = rowPos[dep.depends_on_id];
      if (!from) return;
      depCount++;
    });
  });
  box.innerHTML = '<div style="position:relative;width:' + width + 'px;height:' + height + 'px;font-family:inherit">' +
    scale +
    (today.getTime() >= min && today.getTime() <= max ? '<div style="position:absolute;left:' + todayX + 'px;top:0;width:2px;height:' + height + 'px;background:#f59e0b;opacity:.8;z-index:3"></div>' : '') +
    body + bars +
    (depCount ? '<div style="position:absolute;right:8px;bottom:4px;font-size:11px;color:#94a3b8">依赖关系 ' + depCount + ' 条（详情见任务卡片）</div>' : '') +
    '</div>';
}
function gtOpenTask(id) {
  // 复用任务详情（task-detail.js 已提供）
  if (typeof openTaskDetail === 'function') openTaskDetail(id);
  else location.hash = '#/list';
}
function gtMsInfo(id) { showToast('里程碑详情请到「里程碑」页查看', ''); }


/* --- subsystems/projects/frontend/js/views/graph.js --- */
// graph.js — OA 移植二期批次3：项目关系图谱（力导向布局自实现 + SVG，无第三方依赖）
// 节点=项目（状态色 + 完成率环），边=关系（颜色/虚实区分）；SHARES_MODEL 自动推导边为虚线灰
// 交互：拖拽节点 / 点击节点摘要卡 / 点击边说明 / 类型过滤 / PNG 导出
var GR_TYPE_CN = { DEPENDS_ON: '依赖', DERIVED_FROM: '衍生', SHARES_MODEL: '共享机型', REPLACES: '替代', RELATES: '关联', SAME_CUSTOMER: '同一客户', CUSTOM: '自定义' };
var GR_TYPE_COLOR = { DEPENDS_ON: '#dc2626', DERIVED_FROM: '#7c3aed', SHARES_MODEL: '#94a3b8', REPLACES: '#ea580c', RELATES: '#0891b2', SAME_CUSTOMER: '#16a34a', CUSTOM: '#6366f1' };
var GR_STATUS_COLOR = { ACTIVE: '#2563eb', DONE: '#059669' };
var _gr = null; // 图数据缓存 {nodes, edges, pos, fixed}

async function renderGraph() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="grAddRel()">标注关系</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="renderGraph()">刷新</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="grExport()">导出 PNG</fluent-button>' +
    '<span id="gr-filters" style="margin-left:8px"></span></div>' +
    '<div style="position:relative">' +
    '<div id="gr-svg-box" style="border:1px solid var(--border,#e2e8f0);border-radius:8px;background:#fff;overflow:hidden"></div>' +
    '<div id="gr-card" style="display:none;position:absolute;right:12px;top:12px;width:260px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.1);padding:12px;font-size:13px;z-index:5"></div></div>';
  const g = await api('GET', PApi.graph);
  _gr = g;
  _gr.pos = {};
  // 初始布局：环形（力导向从此收敛）
  const R = Math.min(280, 120 + g.nodes.length * 6), cx = 420, cy = 300;
  g.nodes.forEach(function (n, i) {
    const a = (2 * Math.PI * i) / Math.max(1, g.nodes.length) - Math.PI / 2;
    _gr.pos[n.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), vx: 0, vy: 0 };
  });
  // 类型过滤器
  const types = [];
  g.edges.forEach(function (e) { if (types.indexOf(e.type) < 0) types.push(e.type); });
  $('#gr-filters').innerHTML = types.map(function (t) {
    return '<label style="font-size:12px;margin-right:10px;color:' + GR_TYPE_COLOR[t] + '"><input type="checkbox" checked onchange="grDraw()" data-gr-type="' + t + '"> ' + (GR_TYPE_CN[t] || t) + '</label>';
  }).join('');
  grSimulate();
  grDraw();
  _bindGraphClicks();
}

// 力导向模拟（斥力 + 弹簧 + 向心，60 轮收敛；仅初始计算，拖拽后局部不重算）
function grSimulate() {
  const nodes = _gr.nodes, pos = _gr.pos, edges = _gr.edges;
  for (let it = 0; it < 60; it++) {
    nodes.forEach(function (n) {
      const p = pos[n.id];
      // 向心
      p.vx += (420 - p.x) * 0.002; p.vy += (300 - p.y) * 0.002;
      // 斥力
      nodes.forEach(function (m) {
        if (m.id === n.id) return;
        const q = pos[m.id];
        let dx = p.x - q.x, dy = p.y - q.y;
        let d2 = dx * dx + dy * dy || 1;
        if (d2 < 40000) { const f = 3000 / d2; p.vx += dx / Math.sqrt(d2) * f; p.vy += dy / Math.sqrt(d2) * f; }
      });
    });
    // 弹簧
    edges.forEach(function (e) {
      const a = pos[e.from], b = pos[e.to];
      if (!a || !b) return;
      let dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - 150) * 0.01;
      a.vx += dx / d * f; a.vy += dy / d * f;
      b.vx -= dx / d * f; b.vy -= dy / d * f;
    });
    nodes.forEach(function (n) {
      const p = pos[n.id];
      p.x += Math.max(-8, Math.min(8, p.vx)); p.y += Math.max(-8, Math.min(8, p.vy));
      p.vx *= 0.85; p.vy *= 0.85;
      p.x = Math.max(40, Math.min(800, p.x)); p.y = Math.max(40, Math.min(560, p.y));
    });
  }
}

function grActiveTypes() {
  return new Set(Array.prototype.slice.call(document.querySelectorAll('[data-gr-type]')).filter(function (c) { return c.checked; }).map(function (c) { return c.dataset.grType; }));
}

function grDraw() {
  if (!_gr) return;
  const box = $('#gr-svg-box');
  const W = 840, H = 600;
  const active = grActiveTypes();
  let edges = '', nodes = '';
  _gr.edges.forEach(function (e) {
    if (!active.has(e.type)) return;
    const a = _gr.pos[e.from], b = _gr.pos[e.to];
    if (!a || !b) return;
    const color = GR_TYPE_COLOR[e.type] || '#6366f1';
    const dash = e.type === 'SHARES_MODEL' ? 'stroke-dasharray="6,4"' : '';
    edges += '<line x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + color + '" stroke-width="' + (e.auto ? 1.2 : 2) + '" ' + dash + ' opacity="' + (e.auto ? .5 : .8) + '" style="cursor:pointer" ' +
      'data-gr-edge="' + e.id + '" data-gr-edge-info="' + esc((GR_TYPE_CN[e.type] || e.type) + (e.custom_type ? '：' + e.custom_type : '') + '（' + (e.note || '无备注') + '）') + '" />';
  });
  _gr.nodes.forEach(function (n) {
    const p = _gr.pos[n.id];
    if (!p) return;
    const pct = n.task_count ? Math.round((n.done_count / n.task_count) * 100) : 0;
    const color = GR_STATUS_COLOR[n.status] || '#64748b';
    // 节点：圆 + 完成率环（简化为底部弧线粗细）+ 名称
    nodes += '<g transform="translate(' + p.x + ',' + p.y + ')" style="cursor:grab" data-gr-node="' + n.id + '">' +
      '<circle r="26" fill="#fff" stroke="' + color + '" stroke-width="2.5"/>' +
      '<circle r="26" fill="' + color + '" fill-opacity="' + (0.08 + pct / 200) + '"/>' +
      '<text text-anchor="middle" dy="4" font-size="10" fill="' + color + '" font-weight="bold">' + pct + '%</text>' +
      '<text text-anchor="middle" y="44" font-size="12" fill="#334155">' + esc(n.name.length > 10 ? n.name.slice(0, 10) + '…' : n.name) + '</text>' +
      '<title>' + esc(n.name) + ' · ' + (n.status === 'ACTIVE' ? '进行中' : '已完成') + ' · 任务 ' + n.done_count + '/' + n.task_count + '</title></g>';
  });
  box.innerHTML = '<svg id="gr-svg" width="' + W + '" height="' + H + '" viewBox="0 0 840 600">' + edges + nodes + '</svg>' +
    (_gr.nodes.length ? '' : '<div style="padding:24px;color:#94a3b8">暂无项目</div>');
  _bindGraphClicks();
}

function _bindGraphClicks() {
  const svg = $('#gr-svg');
  if (!svg) return;
  // 节点点击 → 摘要卡
  svg.querySelectorAll('[data-gr-node]').forEach(function (gEl) {
    let moved = false;
    gEl.addEventListener('mousedown', function () { moved = false; });
    gEl.addEventListener('mousemove', function () { moved = true; });
    gEl.addEventListener('click', function () { if (!moved) grNodeCard(Number(gEl.dataset.grNode)); });
    // 拖拽
    gEl.addEventListener('mousedown', function (ev) {
      const id = Number(gEl.dataset.grNode);
      const svgRect = svg.getBoundingClientRect();
      const scale = svgRect.width / 840;
      function mm(e) {
        const p = _gr.pos[id];
        p.x = (e.clientX - svgRect.left) / scale;
        p.y = (e.clientY - svgRect.top) / scale;
        grDraw();
      }
      function mu() { document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  });
  // 边点击 → 说明
  svg.querySelectorAll('[data-gr-edge]').forEach(function (l) {
    l.addEventListener('click', function () {
      const card = $('#gr-card');
      card.innerHTML = '<b>关系</b><div style="margin-top:6px;color:#475569">' + l.dataset.grEdgeInfo + '</div>' +
        (l.dataset.grEdge.indexOf('auto-') !== 0 ? '<button style="margin-top:8px;font-size:12px" onclick="grDelRel(' + Number(l.dataset.grEdge) + ')">删除此关系</button>' : '<div class="muted" style="font-size:11px;margin-top:6px">系统自动推导边，无需删除</div>');
      card.style.display = 'block';
    });
  });
}

function grNodeCard(id) {
  const n = _gr.nodes.find(function (x) { return x.id === id; });
  if (!n) return;
  const rels = _gr.edges.filter(function (e) { return e.from === id || e.to === id; });
  const card = $('#gr-card');
  card.innerHTML = '<b style="color:var(--brand,#2563eb)">' + esc(n.name) + '</b>' +
    '<div style="margin:6px 0;color:#64748b">' + (n.status === 'ACTIVE' ? '进行中' : '已完成') + ' · 任务 ' + n.done_count + '/' + n.task_count + '（' + (n.task_count ? Math.round(n.done_count / n.task_count * 100) : 0) + '%）</div>' +
    (rels.length ? '<div style="border-top:1px solid #f1f5f9;padding-top:6px">' + rels.map(function (e) {
      const other = _gr.nodes.find(function (x) { return x.id === (e.from === id ? e.to : e.from); });
      return '<div style="font-size:12px;margin:2px 0"><span style="color:' + (GR_TYPE_COLOR[e.type] || '#666') + '">●</span> ' + (GR_TYPE_CN[e.type] || e.type) + (e.custom_type ? '：' + esc(e.custom_type) : '') + ' → ' + esc(other ? other.name : '#' + (e.from === id ? e.to : e.from)) + (e.note ? ' <span class="muted">(' + esc(e.note) + ')</span>' : '') + '</div>';
    }).join('') + '</div>' : '') +
    '<div style="margin-top:8px"><button style="font-size:12px" onclick="location.hash=\'#/list?project=' + id + '\'">查看任务</button> ' +
    '<button style="font-size:12px" onclick="grAddRel(' + id + ')">标注关系</button> ' +
    '<button style="font-size:12px" onclick="$(\'#gr-card\').style.display=\'none\'">关闭</button></div>';
  card.style.display = 'block';
}

async function grAddRel(fromPid) {
  const projects = await api('GET', PApi.projects());
  const opt = function (sel) {
    return projects.map(function (p) { return '<fluent-option value="' + p.id + '"' + (p.id === fromPid ? ' selected' : '') + '>' + esc(p.name) + '</fluent-option>'; }).join('');
  };
  openModal('标注项目关系',
    '<div class="pk-form">' +
    '<label>源项目 *</label><fluent-select id="gr-from">' + opt(fromPid) + '</fluent-select>' +
    '<label>目标项目 *（关系方向：源 → 目标）</label><fluent-select id="gr-to">' + opt() + '</fluent-select>' +
    '<label>关系类型 *</label><fluent-select id="gr-type">' + Object.keys(GR_TYPE_CN).map(function (k) {
      return '<fluent-option value="' + k + '"' + (k === 'DEPENDS_ON' ? ' selected' : '') + '>' + (k === 'CUSTOM' ? '自定义…' : GR_TYPE_CN[k]) + '</fluent-option>';
    }).join('') + '</fluent-select>' +
    '<div id="gr-custom-box" style="display:none"><label>自定义关系名称 *</label><fluent-text-field id="gr-custom" placeholder="如：同一产线"></fluent-text-field></div>' +
    '<label>备注</label><fluent-text-field id="gr-note"></fluent-text-field>' +
    '<div class="muted" style="font-size:12px">「共享机型」通常由系统按引用机型自动推导，无需手工标注；双方项目成员均可标注。</div></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="grAddRelSave()">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
  $('#gr-type').addEventListener('change', function () {
    $('#gr-custom-box').style.display = this.value === 'CUSTOM' ? 'block' : 'none';
  });
}
async function grAddRelSave() {
  const d = {
    from_project_id: Number($('#gr-from').value), to_project_id: Number($('#gr-to').value),
    relation_type: $('#gr-type').value, custom_type: $('#gr-custom') ? $('#gr-custom').value : '', note: $('#gr-note').value.trim()
  };
  if (d.from_project_id === d.to_project_id) return showToast('不能与自身建立关系', 'err');
  if (d.relation_type === 'CUSTOM' && !d.custom_type.trim()) return showToast('请填写自定义关系名称', 'err');
  try {
    const r = await api('POST', PApi.relations, d);
    showToast(r.duplicate ? '该关系已存在' : '已标注');
    pCloseModal(); renderGraph();
  } catch (e) { showToast(e.message, 'err'); }
}
async function grDelRel(rid) {
  if (!confirm('确认删除该关系？')) return;
  try { await api('DELETE', PApi.relation(rid)); showToast('已删除'); $('#gr-card').style.display = 'none'; renderGraph(); }
  catch (e) { showToast(e.message, 'err'); }
}
// PNG 导出（SVG 序列化 → canvas → 下载）
function grExport() {
  const svg = $('#gr-svg');
  if (!svg) return showToast('无图可导出', 'err');
  const xml = new XMLSerializer().serializeToString(svg);
  const img = new Image();
  img.onload = function () {
    const c = document.createElement('canvas');
    c.width = 840; c.height = 600;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 840, 600);
    ctx.drawImage(img, 0, 0);
    const a = document.createElement('a');
    a.download = 'project-graph-' + new Date().toISOString().slice(0, 10) + '.png';
    a.href = c.toDataURL('image/png');
    a.click();
  };
  img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(xml)));
}


/* --- subsystems/projects/frontend/js/views/task-detail.js --- */
// task-detail.js — 任务详情：主信息卡 + 分区 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
let _tid = 0;
// v2：详情页 = 主信息卡 + 下方 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
// P1-1 修复：详情 payload 前端缓存（_tdCache），切 tab 复用缓存不再重复拉全量；tdRefresh/写操作后清缓存强制刷新。
var _tdTab = 'subs';
var _tdCache = { tid: 0, data: null, ts: 0, ttl: 8000 };
var _tdCacheTtl = 8000; // 8s 内同任务复用（弱一致只读）；写操作后走 tdRefresh 清缓存强制重新拉取
const TD_TABS = [
  { k: 'subs', t: '子任务' }, { k: 'comments', t: '评论' },
  { k: 'files', t: '附件' }, { k: 'links', t: '关联' }, { k: 'logs', t: '日志' }
];
async function renderTaskDetail(tid) {
  _tid = tid;
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-panel" id="td-info">加载中…</div>' +
    '<div class="pk-panel" style="margin-top:14px">' +
    '<div class="pk-tabs" id="td-tabs"></div>' +
    '<div id="td-body"></div></div>';
  await tdLoadSection('info');
  tdSwitchTab('subs');
}
function tdSwitchTab(k) {
  _tdTab = k;
  $('#td-tabs').innerHTML = TD_TABS.map(function (x) {
    return '<fluent-button appearance="' + (x.k === k ? 'accent' : 'neutral') + '" size="small" onclick="tdSwitchTab(\'' + x.k + '\')">' + x.t + '</fluent-button>';
  }).join('');
  tdLoadSection(k);
}
// 取详情：命中缓存且未过期则复用（P1-1 减少切 tab 的重复全量请求）；否则拉取并缓存
async function tdFetch() {
  const now = Date.now();
  if (_tdCache.tid === _tid && _tdCache.data && (now - _tdCache.ts) < _tdCache.ttl) return _tdCache.data;
  const d = await api('GET', PApi.task(_tid));
  _tdCache = { tid: _tid, data: d, ts: now, ttl: _tdCacheTtl };
  return d;
}
// v2：分区加载（info 渲染主卡；其余按当前 tab 渲染对应区块，不再全量）
async function tdLoadSection(kind) {
  try {
    const d = await tdFetch();
    if (kind === 'info') { renderTdInfo(d); return; }
    const body = $('#td-body');
    if (kind === 'subs') body.innerHTML = renderTdSubs(d);
    else if (kind === 'comments') body.innerHTML = renderTdComments(d);
    else if (kind === 'files') body.innerHTML = renderTdFiles(d);
    else if (kind === 'links') body.innerHTML = renderTdLinks(d);
    else if (kind === 'logs') body.innerHTML = renderTdLogs(d);
  } catch (e) { showToast(e.message, 'err'); }
}
// v2：详情局部刷新（清缓存 → info 主卡 + 当前 tab，替代全量重渲染）
function tdRefresh() { _tdCache.tid = 0; _tdCache.ts = 0; tdLoadSection('info'); tdSwitchTab(_tdTab); }
// v2：主信息卡（project_name/assignee_name 来自详情 JOIN，无前端补查；含进度条 + 编辑/子任务/依赖/关联/删除按钮区）
function renderTdInfo(d) {
  const t = d.task;
  const st = t.status_eff || t.status;
  const canEdit = ['ADMIN', 'PM'].includes(me.role);
  $('#td-info').innerHTML =
    '<h3>' + esc(t.title) + '</h3>' +
    '<div class="pk-row"><span class="pk-name">状态</span><span>' + (TASK_STATUS_CN[st] || st) +
    ' · 进度 ' + t.progress + '%</span>' +
    '<span class="pk-progress" style="flex:1"><span class="pk-progress-bar" style="width:' + Math.min(t.progress || 0, 100) + '%"></span></span></div>' +
    '<div class="pk-row"><span class="pk-name">项目</span><span>' + esc(t.project_name || t.project_id) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">类别</span><span>' + (CATEGORY_CN[t.category] || t.category) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">优先级</span><span>' + (PRIORITY_CN[t.priority] || t.priority) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">责任人</span><span>' + esc(t.assignee_name || '未指派') + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">计划日期</span><span>' + fmt(t.planned_date) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">实际日期</span><span>' + fmt(t.actual_date) + '</span></div>' +
    (t.description ? '<div class="pk-row"><span class="pk-name">描述</span><span>' + esc(t.description) + '</span></div>' : '') +
    (t.solution ? '<div class="pk-row"><span class="pk-name">方案</span><span>' + esc(t.solution) + '</span></div>' : '') +
    (t.notes ? '<div class="pk-row"><span class="pk-name">备注</span><span>' + esc(t.notes) + '</span></div>' : '') +
    (d.deps && d.deps.length ? '<div class="pk-row"><span class="pk-name">前置依赖</span><span>' +
      d.deps.map(x => esc(x.depends_on_title) + (canEdit ? ' <fluent-button size="small" appearance="neutral" onclick="tdDepDel(' + x.depends_on_id + ')">移除</fluent-button>' : '')).join('；') + '</span></div>' : '') +
    (canEdit ? '<div class="pk-filters"><fluent-button appearance="secondary" size="small" onclick="tdEdit()">编辑</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddSub()">加子任务</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddDep()">加依赖</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddLink()">关联样品/治具</fluent-button>' +
      '<fluent-button appearance="neutral" size="small" onclick="pConfirm(\'确认删除该任务？（子任务/评论/附件/日志将一并删除）\',\'tdDel()\')">删除任务</fluent-button></div>' : '');
}
// v2：子任务分区（三态 + CAS 流转按钮：START/COMPLETE）
function renderTdSubs(d) {
  return d.subtasks.map(s =>
    '<div class="pk-row"><span class="pk-name">' + esc(s.title) + '</span>' +
    '<span>' + (SUBTASK_STATUS_CN[s.status] || s.status) + '</span>' +
    (s.status === 'NOT_STARTED' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'START\')">开始</fluent-button>' : '') +
    (s.status === 'IN_PROGRESS' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'COMPLETE\')">完成</fluent-button>' : '') +
    '<fluent-button size="small" appearance="neutral" onclick="tdSubEdit(' + s.id + ')">编辑</fluent-button>' +
    '<fluent-button size="small" appearance="neutral" onclick="pConfirm(\'确认删除该子任务？\',\'tdSubDel(' + s.id + ')\')">删除</fluent-button>' +
    '</div>').join('') || '<span class="pk-name">无子任务</span>';
}
// v2：评论分区（输入框 + 列表，含删除按钮）
function renderTdComments(d) {
  return '<div class="pk-filters"><input id="td-cmt" placeholder="写评论…" style="flex:1;min-width:180px">' +
    '<fluent-button appearance="accent" size="small" onclick="tdAddComment()">发送</fluent-button></div>' +
    d.comments.map(c => '<div class="pk-row"><span class="pk-name">' + (c.operator_name || '—') + '</span><span>' + esc(c.content) + '</span>' +
      (c.operator_id === me.id || me.role === 'ADMIN' || me.role === 'PM'
        ? '<fluent-button size="small" appearance="neutral" onclick="tdCmtDel(' + c.id + ')">删除</fluent-button>' : '') + '</div>').join('');
}
// v2：附件分区（上传区 + 列表，含删除按钮；下载链接前缀 /uploads/projects/）
function renderTdFiles(d) {
  return '<div class="pk-filters"><input type="file" id="td-file"><fluent-button appearance="accent" size="small" onclick="tdUploadFile()">上传</fluent-button></div>' +
    d.files.map(f => '<div class="pk-row"><span class="pk-name"><a href="/uploads/projects/' + f.file_path + '" target="_blank">' + esc(f.file_name) + '</a></span>' +
      '<fluent-button size="small" appearance="neutral" onclick="tdFileDel(' + f.id + ')">删除</fluent-button></div>').join('');
}
// v2：关联分区（样品/治具）
function renderTdLinks(d) {
  return d.links.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.ref_type === 'sample' ? '样品' : '治具') + '</span>' +
    '<span>' + esc(l.ref_no || l.ref_id) + ' ' + esc(l.ref_name || '') + '</span></div>').join('') || '<span class="pk-name">未关联</span>';
}
// v2：操作日志分区
function renderTdLogs(d) {
  return d.logs.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.operator_name || '—') + '</span><span>' + l.action + '</span><span>' + (l.detail || '') + '</span></div>').join('');
}

// v2：弹窗关闭 helper（shared closeModal 需 mask 参数，统一封装）
function pCloseModal() {
  document.querySelectorAll('.modal-mask').forEach(function (m) { m.remove(); });
  document.body.style.overflow = '';
}
// v2：模态确认（替代 confirm()）；onOk 为函数名字符串，执行后关闭
function pConfirm(msg, onOk) {
  openModal('确认', '<div class="pk-name">' + esc(msg) + '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="' + onOk + ';pCloseModal()">确定</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
// v2：任务编辑弹窗（全字段；责任人下拉仅 ADMIN/PM 显示，其余角色只读）
async function tdEdit() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  const canPickUser = me.role === 'ADMIN' || me.role === 'PM';
  const assigneeField = canPickUser
    ? '<label>责任人</label><fluent-select id="te-assignee"><fluent-option value="">未指派</fluent-option>' +
      users.map(function (u) { return '<fluent-option value="' + u.id + '"' + (u.id === t.assignee_id ? ' selected' : '') + '>' + esc(u.display_name || ('#' + u.id)) + '</fluent-option>'; }).join('') + '</fluent-select>'
    : '<label>责任人</label><div class="pk-name">' + esc(t.assignee_name || '未指派') + '</div>';
  openModal('编辑任务',
    '<div class="pk-form">' +
    '<label>任务名称 *</label><fluent-text-field id="te-title" value="' + esc(t.title) + '"></fluent-text-field>' +
    '<label>类别</label><fluent-select id="te-category">' + CATEGORY_KEYS.map(function (k) { return '<fluent-option value="' + k + '"' + (t.category === k ? ' selected' : '') + '>' + CATEGORY_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>优先级</label><fluent-select id="te-priority">' + PRIORITY_KEYS.map(function (k) { return '<fluent-option value="' + k + '"' + (t.priority === k ? ' selected' : '') + '>' + PRIORITY_CN[k] + '</fluent-option>'; }).join('') + '</fluent-select>' +
    assigneeField +
    '<label>计划完成日期</label><fluent-text-field id="te-date" type="date" value="' + (t.planned_date || '') + '"></fluent-text-field>' +
    '<label>进度(%)</label><fluent-text-field id="te-progress" type="number" min="0" max="100" value="' + (t.progress || 0) + '"></fluent-text-field>' +
    '<label>描述</label><fluent-text-area id="te-desc">' + esc(t.description || '') + '</fluent-text-area>' +
    '<label>解决方案</label><fluent-text-area id="te-solution">' + esc(t.solution || '') + '</fluent-text-area>' +
    '<label>备注</label><fluent-text-area id="te-notes">' + esc(t.notes || '') + '</fluent-text-area>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdEditSave(' + t.version + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdEditSave(version) {
  const title = $('#te-title').value.trim();
  if (!title) return showToast('任务名称必填', 'err');
  const body = {
    title: title, category: $('#te-category').value, priority: $('#te-priority').value,
    assignee_id: $('#te-assignee') ? (Number($('#te-assignee').value) || null) : null,
    planned_date: $('#te-date').value || null, progress: Number($('#te-progress').value) || 0,
    description: $('#te-desc').value, solution: $('#te-solution').value, notes: $('#te-notes').value,
    version: version
  };
  try { await api('PUT', PApi.task(_tid), body); showToast('已保存'); pCloseModal(); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// v2：加子任务弹窗（标题 + 责任人 + 日期）
async function tdAddSub() {
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  openModal('加子任务',
    '<div class="pk-form">' +
    '<label>子任务名称 *</label><fluent-text-field id="ts-title"></fluent-text-field>' +
    '<label>责任人</label><fluent-select id="ts-assignee"><fluent-option value="">未指派</fluent-option>' +
    users.map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || ('#' + u.id)) + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>计划日期</label><fluent-text-field id="ts-date" type="date"></fluent-text-field>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdAddSubSave()">创建</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdAddSubSave() {
  const title = $('#ts-title').value.trim();
  if (!title) return showToast('子任务名称必填', 'err');
  try {
    await api('POST', PApi.taskSub(_tid), { title: title, assignee_id: Number($('#ts-assignee').value) || null, planned_date: $('#ts-date').value || null });
    showToast('已创建'); pCloseModal(); tdRefresh();
  } catch (e) { showToast(e.message, 'err'); }
}
// v2：加依赖弹窗（同项目任务下拉，显示标题+状态，禁选自己与已依赖项）
async function tdAddDep() {
  const [d, projs] = await Promise.all([api('GET', PApi.task(_tid)), api('GET', PApi.projects())]);
  const t = d.task;
  const proj = projs.find(function (p) { return p.id === t.project_id; });
  if (!proj) return showToast('任务项目不存在', 'err');
  const tasks = await api('GET', PApi.projectTasks(t.project_id));
  const excludes = d.deps.map(function (x) { return x.depends_on_id; });
  const opts = tasks.filter(function (x) { return x.id !== _tid && excludes.indexOf(x.id) < 0; })
    .map(function (x) { return '<fluent-option value="' + x.id + '">' + esc(x.title) + ' · ' + (TASK_STATUS_CN[x.status_eff || x.status] || x.status) + '</fluent-option>'; }).join('');
  if (!opts) return showToast('该项目内无可添加的前置任务', 'err');
  openModal('添加前置依赖',
    '<div class="pk-form"><label>前置任务</label><fluent-select id="td-dep">' + opts + '</fluent-select></div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdAddDepSave()">添加</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdAddDepSave() {
  try { await api('POST', PApi.taskDeps(_tid), { depends_on_id: Number($('#td-dep').value) }); showToast('已添加'); pCloseModal(); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// v2：关联样品/治具弹窗（类型下拉 + 编号关键字搜索，结果 ≤10 条）
async function tdAddLink() {
  openModal('关联样品/治具',
    '<div class="pk-form">' +
    '<label>类型</label><fluent-select id="tl-type" onchange="tdLinkSearch()"><fluent-option value="sample">样品</fluent-option><fluent-option value="fixture">治具</fluent-option></fluent-select>' +
    '<label>搜索（输入编号关键字）</label><fluent-text-field id="tl-q" placeholder="如 SM2026 或 FIX-001" onchange="tdLinkSearch()"></fluent-text-field>' +
    '<fluent-select id="tl-target"></fluent-select>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdAddLinkSave()">关联</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
  tdLinkSearch();
}
async function tdLinkSearch() {
  const type = $('#tl-type').value;
  const q = encodeURIComponent($('#tl-q').value || '');
  const url = type === 'sample' ? '/api/samples?q=' + q : '/api/fixtures?search=' + q;
  try {
    const r = await api('GET', url);
    const list = (type === 'sample' ? (r.samples || []) : (r.fixtures || [])).slice(0, 10);
    $('#tl-target').innerHTML = list.map(function (x) {
      return '<fluent-option value="' + x.id + '">' + esc(x.sample_no || x.fixture_no || x.name) + ' ' + esc(x.name || '') + '</fluent-option>';
    }).join('') || '<fluent-option value="">无匹配结果</fluent-option>';
  } catch (e) { $('#tl-target').innerHTML = '<fluent-option value="">搜索失败</fluent-option>'; }
}
async function tdAddLinkSave() {
  const refId = Number($('#tl-target').value);
  if (!refId) return showToast('请先选择对象', 'err');
  try { await api('POST', PApi.taskLinks(_tid), { ref_type: $('#tl-type').value, ref_id: refId }); showToast('已关联'); pCloseModal(); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// 子任务流转（CAS：后端按当前状态条件更新）
async function tdSubAction(sid, action) {
  try { await api('POST', PApi.taskSub(_tid, sid) + '/status', { action }); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// v2：子任务编辑弹窗（标题 + 责任人 + 日期）
async function tdSubEdit(sid) {
  const d = await api('GET', PApi.task(_tid));
  const s = d.subtasks.find(function (x) { return x.id === sid; });
  if (!s) return;
  const users = await api('GET', '/api/projects/users').catch(function () { return []; });
  openModal('编辑子任务',
    '<div class="pk-form">' +
    '<label>子任务名称 *</label><fluent-text-field id="tse-title" value="' + esc(s.title) + '"></fluent-text-field>' +
    '<label>责任人</label><fluent-select id="tse-assignee"><fluent-option value="">未指派</fluent-option>' +
    users.map(function (u) { return '<fluent-option value="' + u.id + '"' + (u.id === s.assignee_id ? ' selected' : '') + '>' + esc(u.display_name || ('#' + u.id)) + '</fluent-option>'; }).join('') + '</fluent-select>' +
    '<label>计划日期</label><fluent-text-field id="tse-date" type="date" value="' + (s.planned_date || '') + '"></fluent-text-field>' +
    '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="tdSubEditSave(' + sid + ',' + (s.version || 0) + ')">保存</fluent-button>' +
            '<fluent-button appearance="neutral" size="small" onclick="pCloseModal()">取消</fluent-button>' });
}
async function tdSubEditSave(sid, version) {
  const title = $('#tse-title').value.trim();
  if (!title) return showToast('子任务名称必填', 'err');
  try {
    await api('PUT', PApi.taskSub(_tid, sid), { title: title, assignee_id: Number($('#tse-assignee').value) || null, planned_date: $('#tse-date').value || null, version: version });
    showToast('已保存'); pCloseModal(); tdRefresh();
  } catch (e) { showToast(e.message, 'err'); }
}
async function tdSubDel(sid) {
  try { await api('DELETE', PApi.taskSub(_tid, sid)); showToast('已删除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdDepDel(depId) {
  try { await api('DELETE', PApi.taskDeps(_tid, depId)); showToast('已移除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdCmtDel(cid) {
  try { await api('DELETE', PApi.taskComments(_tid) + '/' + cid); showToast('已删除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdFileDel(fid) {
  try { await api('DELETE', PApi.taskFiles(_tid, fid)); showToast('已删除'); tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddComment() {
  const content = $('#td-cmt').value.trim();
  if (!content) return;
  try { await api('POST', PApi.taskComments(_tid), { content }); $('#td-cmt').value = ''; tdRefresh(); }
  catch (e) { showToast(e.message, 'err'); }
}
// 附件上传：FormData + fetch（credentials 带 session cookie），校验响应状态码
async function tdUploadFile() {
  const f = $('#td-file').files[0];
  if (!f) return showToast('请选择文件');
  const fd = new FormData();
  fd.append('file', f);
  try {
    const r = await fetch(PApi.taskFiles(_tid), { method: 'POST', credentials: 'include', body: fd });
    if (!r.ok) { let d = {}; try { d = await r.json(); } catch (e) {} throw new Error(d.error || ('上传失败 ' + r.status)); }
    showToast('上传成功'); tdRefresh();
  } catch (e) { showToast(e.message, 'err'); }
}
// v2：删除任务（ADMIN/PM/成员；级联）
async function tdDel() {
  try {
    await api('DELETE', PApi.task(_tid));
    showToast('已删除');
    location.hash = '#/kanban';
  } catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/workflow.js --- */
// workflow.js — 状态机管理：表单化配置（状态 label/color + 流转角色/标签），保存校验
async function renderWorkflow() {
  const v = $('#view');
  const cfg = await api('GET', PApi.workflow);
  const states = Object.keys(cfg.states).map(s =>
    '<div class="pk-row"><span class="pk-name">' + esc(s) + '</span>' +
    '<fluent-text-field id="wf-slabel-' + s + '" value="' + esc(cfg.states[s].label) + '" style="flex:1"></fluent-text-field>' +
    '<input id="wf-scolor-' + s + '" type="color" value="' + esc(cfg.states[s].color) + '"></div>').join('');
  const trs = cfg.transitions.map(function (tr, i) {
    return '<div class="pk-row"><span class="pk-name">' + esc(tr.from) + ' → ' + esc(tr.to) + '（' + esc(tr.action) + '）</span>' +
      '<fluent-text-field id="wf-trole-' + i + '" value="' + esc((tr.role || []).join(',')) + '" placeholder="如 ADMIN,ASSIGNEE,MEMBER" style="flex:1"></fluent-text-field>' +
      '<fluent-text-field id="wf-tlabel-' + i + '" value="' + esc(tr.label) + '"></fluent-text-field></div>';
  }).join('');
  v.innerHTML = '<div class="pk-panel"><h3>状态配置（名称 / 标签 / 颜色）</h3>' + states +
    '<h3 style="margin-top:16px">流转配置（源 → 目标 / 角色逗号分隔 / 动作标签）</h3>' + trs +
    '<div class="pk-filters" style="margin-top:12px"><fluent-button appearance="accent" onclick="wfSave()">保存配置</fluent-button></div></div>';
}
async function wfSave() {
  const cfg = await api('GET', PApi.workflow);
  const states = {};
  Object.keys(cfg.states).forEach(function (s) {
    const label = $('#wf-slabel-' + s).value.trim();
    if (!label) { showToast('状态 ' + s + ' 缺少标签', 'err'); return; }
    states[s] = { label: label, color: $('#wf-scolor-' + s).value, bg: cfg.states[s].bg || '#f8fafc' };
  });
  if (Object.keys(states).length !== Object.keys(cfg.states).length) return;
  const transitions = cfg.transitions.map(function (tr, i) {
    const label = $('#wf-tlabel-' + i).value.trim();
    const role = ($('#wf-trole-' + i).value || '').split(',').map(function (r) { return r.trim(); }).filter(Boolean);
    if (!label || !role.length) { showToast('流转 ' + (tr.from + '→' + tr.to) + ' 需填写角色与标签', 'err'); return null; }
    return { from: tr.from, to: tr.to, action: tr.action, role: role, label: label };
  });
  if (!transitions || transitions.some(function (x) { return x === null; })) return;
  try {
    await api('PUT', PApi.workflow, { initial: cfg.initial, states: states, transitions: transitions });
    showToast('已保存');
    renderWorkflow();
  } catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/router.js --- */
// router.js — 项目追踪导航菜单与哈希路由（含任务详情路由 #/tasks/:id）
const NAV=[
  {k:'dashboard',t:'项目看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'kanban',t:'任务看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'list',t:'任务列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'projects',t:'项目列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'milestones',t:'里程碑',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'risks',t:'风险管理',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'changes',t:'变更管理',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'gantt',t:'甘特图',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'graph',t:'关系图谱',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'templates',t:'项目模板',roles:['ADMIN','PM']},
  {k:'workflow',t:'状态机管理',roles:['ADMIN']},
];
const VIEWS={dashboard:renderProjectDashboard,kanban:renderTaskKanban,list:renderTaskList,projects:renderProjects,milestones:renderMilestones,risks:renderRisks,changes:renderChanges,gantt:renderGantt,graph:renderGraph,templates:renderTemplates,workflow:renderWorkflow};
const META={dashboard:'项目看板',kanban:'任务看板',list:'任务列表',projects:'项目列表',milestones:'里程碑',risks:'风险管理',changes:'变更管理',gantt:'甘特图',graph:'关系图谱',templates:'项目模板',workflow:'状态机管理'};
function route(){
  // P0-2 修复：剥离 query string（#/list?project=xx），与 samples 路由一致
  const raw=location.hash.replace('#/','');
  const k=raw.split('?')[0].split('/')[0]||'dashboard';
  // 任务详情：#/tasks/:id（不在导航内，清空导航高亮与页头动作区）
  if(k==='tasks'&&raw.split('?')[0].split('/')[1]){
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',false));
    $('#page-title').textContent='任务详情';
    $('#page-actions').innerHTML='';
    renderTaskDetail(Number(raw.split('?')[0].split('/')[1]));
    return;
  }
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  const v=VIEWS[k]||renderProjectDashboard;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
  $('#page-title').textContent=META[k]||'';
  $('#page-actions').innerHTML='';
  v();
}
// 渲染侧边导航菜单（按角色过滤；.nav button 样式来自 app.css 共享侧边栏）
function buildNav(){
  const nav=$('#nav');nav.innerHTML='';
  NAV.filter(n=>n.roles.includes(me.role)).forEach(n=>{
    const b=document.createElement('button');
    b.textContent=n.t;b.dataset.k=n.k;
    b.onclick=()=>{location.hash='#/'+n.k;};
    nav.appendChild(b);
  });
}
// api-base.js 的 boot()/doLogin() 均调用 showApp()（登录后初始化界面，填充侧边栏用户信息）
// P0-1 修复：放开角色门禁，与 manifest.json roles.use / NAV 一致（ADMIN/PM/RD/QA/CUSTODY/ME 可进入）；
// 后端每个操作仍按 isGlobalManager(ADMIN/PM) 或 项目成员/assignee 二次鉴权，角色放开不扩大越权。
const SUBSYSTEM_ROLES=['ADMIN','PM','RD','QA','CUSTODY','ME'];
function showApp(){
  if(!SUBSYSTEM_ROLES.includes(me.role)){location.replace('/portal.html');return;}
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  $('#me-name').textContent = me.display_name || me.username;
  $('#me-role').textContent = (ROLE_CN[me.role] || me.role) + (me.dept ? ' · ' + me.dept : '');
  buildNav();
  route();
}


// bundle init
window.addEventListener('hashchange',route);boot('项目追踪');
