/** BUNDLE vbmshpu1kt — 15 files */
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
  workflow: '/api/projects/workflow'
};


/* --- subsystems/projects/frontend/js/views/dashboard.js --- */
// dashboard.js — 项目看板：统计卡（kb-stat 共享组件）+ 三维分布 + 近 8 周趋势
async function renderProjectDashboard() {
  const v = $('#view');
  if (!v) return;
  v.innerHTML = '<div class="pk-stats" id="pk-stats"></div><div class="pk-panels" id="pk-panels"></div>';
  const s = await api('GET', PApi.stats);
  // 竞态守卫：await 期间视图可能已被切换，节点脱离 document 后直接返回
  if (!v.isConnected) return;
  const stats = [
    { k: 'projects', n: s.project_count, l: '项目数', c: 'var(--brand)' },
    { k: 'total', n: s.total_tasks, l: '总任务', c: 'var(--brand)' },
    { k: 'done', n: s.done_count, l: '已完成', c: 'var(--ok)' },
    { k: 'doing', n: s.in_progress_count, l: '进行中', c: '#1d4ed8' },
    { k: 'overdue', n: s.overdue_count, l: '已延期', c: 'var(--bad)' }
  ];
  // P1-1 修复：遵循共享 kb-stat 规范（fluent-card + .n/.l + --stat-color，数字 26px 粗体 + ::before 竖色条）
  $('#pk-stats').innerHTML = stats.map(x =>
    '<fluent-card class="kb-stat" style="--stat-color:' + x.c + '"><span class="n">' + x.n + '</span>' +
    '<span class="l">' + x.l + '</span></fluent-card>').join('');
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
    users.map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>' +
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
    opt.value = String(u.id); opt.textContent = u.display_name || u.username;
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
    opt.value = String(u.id); opt.textContent = u.display_name || u.username;
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
async function projMembers(id) {
  const [mem, users] = await Promise.all([
    api('GET', PApi.projects(id) + '/members'),
    api('GET', '/api/projects/users')
  ]);
  const lines = mem.map(m =>
    '<div class="pk-row"><span class="pk-name">' + esc(m.display_name || m.username) + '</span>' +
    '<span>' + (m.is_owner ? '负责人' : '成员') + '</span>' +
    (m.is_owner
      ? ''
      : '<fluent-button appearance="secondary" size="small" onclick="memTransfer(' + id + ',' + m.user_id + ')">转让</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="memRemove(' + id + ',' + m.user_id + ')">移除</fluent-button>') +
    '</div>').join('');
  openModal('成员管理', lines +
    '<div class="pk-filters" style="margin-top:10px">' +
    '<fluent-text-field id="mem-q" placeholder="搜索用户…" onchange="memRenderOpts(' + id + ')"></fluent-text-field>' +
    '<fluent-select id="mem-user"></fluent-select>' +
    '<fluent-button appearance="accent" onclick="memAdd(' + id + ')">添加</fluent-button></div>');
  memRenderOpts(id);
}
// v2：按关键字过滤可添加用户下拉
async function memRenderOpts(id) {
  const q = $('#mem-q').value || '';
  const [mem, users] = await Promise.all([
    api('GET', PApi.projects(id) + '/members'),
    api('GET', '/api/projects/users')
  ]);
  const opts = users.filter(function (u) {
    return !mem.some(function (m) { return m.user_id === u.id; }) &&
      (!q || (u.display_name || u.username).indexOf(q) >= 0);
  }).map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('');
  $('#mem-user').innerHTML = opts || '<fluent-option value="">无匹配用户</fluent-option>';
}
async function memAdd(id) {
  const uid = $('#mem-user').value;
  if (!uid) return showToast('请选择用户');
  try { await api('POST', PApi.projects(id) + '/members', { user_id: Number(uid) }); showToast('已添加'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memTransfer(id, uid) {
  try { await api('PUT', PApi.projects(id) + '/members/' + uid, { is_owner: 1 }); showToast('已转让'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memRemove(id, uid) {
  if (!confirm('确认移除该成员？')) return;
  try { await api('DELETE', PApi.projects(id) + '/members/' + uid); showToast('已移除'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/task-detail.js --- */
// task-detail.js — 任务详情：主信息卡 + 分区 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
let _tid = 0;
// v2：详情页 = 主信息卡 + 下方 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
var _tdTab = 'subs';
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
// v2：分区加载（info 渲染主卡；其余按当前 tab 渲染对应区块，不再全量）
async function tdLoadSection(kind) {
  const d = await api('GET', PApi.task(_tid));
  if (kind === 'info') { renderTdInfo(d); return; }
  const body = $('#td-body');
  if (kind === 'subs') body.innerHTML = renderTdSubs(d);
  else if (kind === 'comments') body.innerHTML = renderTdComments(d);
  else if (kind === 'files') body.innerHTML = renderTdFiles(d);
  else if (kind === 'links') body.innerHTML = renderTdLinks(d);
  else if (kind === 'logs') body.innerHTML = renderTdLogs(d);
}
// v2：详情局部刷新（info 主卡 + 当前 tab，替代全量重渲染）
function tdRefresh() { tdLoadSection('info'); tdSwitchTab(_tdTab); }
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
      users.map(function (u) { return '<fluent-option value="' + u.id + '"' + (u.id === t.assignee_id ? ' selected' : '') + '>' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>'
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
    users.map(function (u) { return '<fluent-option value="' + u.id + '">' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>' +
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
    users.map(function (u) { return '<fluent-option value="' + u.id + '"' + (u.id === s.assignee_id ? ' selected' : '') + '>' + esc(u.display_name || u.username) + '</fluent-option>'; }).join('') + '</fluent-select>' +
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
  {k:'workflow',t:'状态机管理',roles:['ADMIN']},
];
const VIEWS={dashboard:renderProjectDashboard,kanban:renderTaskKanban,list:renderTaskList,projects:renderProjects,workflow:renderWorkflow};
const META={dashboard:'项目看板',kanban:'任务看板',list:'任务列表',projects:'项目列表',workflow:'状态机管理'};
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
function showApp(){
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  $('#me-name').textContent = me.display_name || me.username;
  $('#me-role').textContent = (ROLE_CN[me.role] || me.role) + (me.dept ? ' · ' + me.dept : '');
  buildNav();
  route();
}


// bundle init
window.addEventListener('hashchange',route);boot('项目追踪');
