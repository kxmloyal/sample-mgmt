/** BUNDLE vbmsh8gvcd — 12 files */
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


/* --- subsystems/projects/frontend/js/constants.js --- */
// constants.js — 项目追踪子系统常量（不修改共享 api-base.js，避免跨系统影响）
const ROLE_CN = Object.assign({ PM: '项目经理(PM)' }, { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' });
const PRIORITY_CN = { H: '高', M: '中', L: '低' };
const CATEGORY_CN = { device: '设备', quality: '质量', process: '流程', safety: '安全', other: '其他' };
const TASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
const SUBTASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成' };

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
async function renderTaskKanban() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters"><fluent-select id="kb-project" onchange="kbLoad()">' +
    '<fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-button appearance="secondary" onclick="kbLoad()">刷新</fluent-button></div>' +
    '<div class="pk-kanban" id="pk-kanban"></div>';
  const projects = await api('GET', PApi.projects());
  const sel = $('#kb-project');
  for (const p of projects) {
    const opt = document.createElement('fluent-option');
    opt.value = String(p.id); opt.textContent = p.name;
    sel.appendChild(opt);
  }
  await kbLoad();
}

// 加载当前筛选下的任务并分组渲染 4 列；全部项目走跨项目列表端点（避免 /api/projects//tasks 双斜杠 404）
async function kbLoad() {
  const pid = $('#kb-project').value;
  const url = pid ? PApi.projectTasks(pid) : '/api/projects/tasks';
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
    '<h4>' + c.t + '<span>' + rows.filter(x => x.status === c.k).length + '</span></h4>' +
    '<div id="kb-col-' + c.k + '"></div></div>').join('');
  for (const c of cols) {
    const el = $('#kb-col-' + c.k);
    el.innerHTML = rows.filter(x => x.status === c.k).map(t => {
      // P2 修复：卡片流转按钮兜底（移动端无拖拽；桌面亦可用），stopPropagation 避免触发跳详情
      const ops = (t.status === 'NOT_STARTED'
        ? '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();kbAction(' + t.id + ',\'START\')">开始</fluent-button>' : '') +
        (t.status === 'IN_PROGRESS'
          ? '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();kbAction(' + t.id + ',\'COMPLETE\')">完成</fluent-button>' : '');
      return '<div class="pk-card" draggable="true" data-id="' + t.id + '" data-status="' + t.status + '" ' +
        'ondragstart="kbDragStart(event)" ondragend="kbDragEnd(event)" ' +
        'onclick="location.hash=\'#/tasks/' + t.id + '\'">' +
        '<div class="t">' + esc(t.title) + '</div>' +
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


/* --- subsystems/projects/frontend/js/views/list.js --- */
// list.js — 任务列表：跨项目筛选（项目/状态）+ CSV 导出 + 延期行高亮
async function renderTaskList() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="lk-project"><fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-select id="lk-status"><fluent-option value="">全部状态</fluent-option>' +
    '<fluent-option value="NOT_STARTED">未开始</fluent-option><fluent-option value="IN_PROGRESS">进行中</fluent-option>' +
    '<fluent-option value="DONE">已完成</fluent-option><fluent-option value="OVERDUE">已延期</fluent-option></fluent-select>' +
    '<fluent-button appearance="secondary" onclick="lkLoad()">查询</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="location.href=\'/api/projects/tasks/export\'">导出 CSV</fluent-button></div>' +
    // P2 修复：表格外包共享 .card 容器，overflow-x:auto 兜底窄屏横向溢出
    '<div class="card" style="padding:8px 0;overflow-x:auto"><table class="pk-table" id="lk-table"><thead><tr>' +
    '<th>项目</th><th>任务</th><th>类别</th><th>优先级</th><th>责任人</th><th>状态</th><th>进度</th><th>计划日期</th><th>操作</th>' +
    '</tr></thead><tbody></tbody></table></div>';
  const projects = await api('GET', PApi.projects());
  const sel = $('#lk-project');
  for (const p of projects) {
    const opt = document.createElement('fluent-option');
    opt.value = String(p.id); opt.textContent = p.name;
    sel.appendChild(opt);
  }
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
// 仅读下拉值（用户选择为准）；hash 的 project 参数只用于进入页面时的初始预选
async function lkLoad() {
  const qs = new URLSearchParams();
  const pid = $('#lk-project').value;
  if (pid) qs.set('project_id', pid);
  const st = $('#lk-status').value;
  if (st) qs.set('status', st);
  const rows = await api('GET', '/api/projects/tasks' + (qs.toString() ? '?' + qs : ''));
  const tbody = document.querySelector('#lk-table tbody');
  tbody.innerHTML = rows.map(t =>
    '<tr class="' + (t.status === 'OVERDUE' ? 'pk-row-overdue' : '') + '">' +
    '<td>' + esc(t.project_name) + '</td>' +
    '<td><a href="#/tasks/' + t.id + '">' + esc(t.title) + '</a></td>' +
    '<td>' + (CATEGORY_CN[t.category] || t.category) + '</td>' +
    '<td><span class="pk-tag ' + (t.priority || 'm').toLowerCase() + '">' + (PRIORITY_CN[t.priority] || t.priority) + '</span></td>' +
    '<td>' + (esc(t.assignee_name) || '未指派') + '</td>' +
    '<td>' + (TASK_STATUS_CN[t.status] || t.status) + '</td>' +
    '<td>' + t.progress + '%</td>' +
    '<td>' + fmt(t.planned_date) + '</td>' +
    '<td><a href="#/tasks/' + t.id + '">详情</a></td></tr>').join('');
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

// 新建项目弹窗（prompt 简化输入）
async function projCreate() {
  const name = prompt('项目名称（必填）');
  if (name === null) return;
  const desc = prompt('项目描述（可空）') || '';
  try { await api('POST', PApi.projects(), { name, description: desc }); showToast('创建成功'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 编辑项目弹窗
async function projEdit(id) {
  const p = await api('GET', PApi.projects(id));
  const name = prompt('项目名称', p.name);
  if (name === null) return;
  const desc = prompt('项目描述', p.description || '') || '';
  try { await api('PUT', PApi.projects(id), { name, description: desc }); showToast('已保存'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 删除项目（有任务时后端 409 保护）
async function projDel(id) {
  if (!confirm('确认删除该项目？（项目下有任务时将被拒绝）')) return;
  try { await api('DELETE', PApi.projects(id)); showToast('已删除'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 成员管理弹窗（成员列表 + 添加下拉 + 转让 owner + 移除）
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
  const opts = users.filter(u => !mem.some(m => m.user_id === u.id))
    .map(u => '<fluent-option value="' + u.id + '">' + (u.display_name || u.username) + '</fluent-option>').join('');
  openModal('成员管理', lines +
    '<div class="pk-filters"><fluent-select id="mem-user">' + opts + '</fluent-select>' +
    '<fluent-button appearance="accent" onclick="memAdd(' + id + ')">添加</fluent-button></div>');
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
// task-detail.js — 任务详情：主信息卡 + 子任务（三态流转）+ 依赖 + 评论 + 附件 + 关联 + 留痕
let _tid = 0;
async function renderTaskDetail(tid) {
  _tid = tid;
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-panel" id="td-info">加载中…</div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>子任务</h3><div id="td-subs"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>依赖</h3><div id="td-deps"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>评论</h3><div id="td-comments"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>附件</h3><div id="td-files"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>关联对象</h3><div id="td-links"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>操作日志</h3><div id="td-logs"></div></div>';
  await tdLoad();
}

// 加载详情数据并渲染 6 区块（项目名/责任人姓名：详情接口无 JOIN，从项目列表/跨项目列表补查）
async function tdLoad() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  // 项目名称映射（详情接口仅含 project_id）
  let projName = t.project_id;
  try {
    const projs = await api('GET', PApi.projects());
    const pp = projs.find(p => p.id === t.project_id);
    if (pp) projName = pp.name;
  } catch (e) { /* 补查失败时显示项目 ID */ }
  let assigneeName = t.assignee_name;
  if (!assigneeName && t.assignee_id) {
    try {
      const all = await api('GET', '/api/projects/tasks');
      const row = all.find(x => x.id === _tid);
      if (row) assigneeName = row.assignee_name;
    } catch (e) { /* 补查失败时显示用户 ID */ }
  }
  const canEdit = ['ADMIN', 'PM'].includes(me.role);
  $('#td-info').innerHTML =
    '<h3>' + esc(t.title) + '</h3>' +
    '<div class="pk-row"><span class="pk-name">状态</span><span>' + (TASK_STATUS_CN[t.status] || t.status) +
    ' · 进度 ' + t.progress + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">项目</span><span>' + projName + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">类别</span><span>' + (CATEGORY_CN[t.category] || t.category) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">优先级</span><span>' + (PRIORITY_CN[t.priority] || t.priority) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">责任人</span><span>' + (assigneeName || '未指派') + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">计划日期</span><span>' + fmt(t.planned_date) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">实际日期</span><span>' + fmt(t.actual_date) + '</span></div>' +
    (t.description ? '<div class="pk-row"><span class="pk-name">描述</span><span>' + esc(t.description) + '</span></div>' : '') +
    (t.solution ? '<div class="pk-row"><span class="pk-name">方案</span><span>' + esc(t.solution) + '</span></div>' : '') +
    (t.notes ? '<div class="pk-row"><span class="pk-name">备注</span><span>' + esc(t.notes) + '</span></div>' : '') +
    (canEdit ? '<div class="pk-filters"><fluent-button appearance="secondary" size="small" onclick="tdEdit()">编辑</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddSub()">加子任务</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddDep()">加依赖</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddLink()">关联样品/治具</fluent-button></div>' : '');
  // 子任务（三态 + CAS 流转按钮：START/COMPLETE）
  $('#td-subs').innerHTML = d.subtasks.map(s =>
    '<div class="pk-row"><span class="pk-name">' + esc(s.title) + '</span>' +
    '<span>' + (SUBTASK_STATUS_CN[s.status] || s.status) + '</span>' +
    (s.status === 'NOT_STARTED' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'START\')">开始</fluent-button>' : '') +
    (s.status === 'IN_PROGRESS' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'COMPLETE\')">完成</fluent-button>' : '') +
    '</div>').join('') || '<span class="pk-name">无子任务</span>';
  // 依赖（前置任务列表）
  $('#td-deps').innerHTML = d.deps.map(x =>
    '<div class="pk-row"><span class="pk-name">↳ ' + esc(x.depends_on_title) + '</span></div>').join('') || '<span class="pk-name">无前置依赖</span>';
  // 评论（输入框 + 列表）
  $('#td-comments').innerHTML =
    '<div class="pk-filters"><input id="td-cmt" placeholder="写评论…" style="flex:1;min-width:180px">' +
    '<fluent-button appearance="accent" size="small" onclick="tdAddComment()">发送</fluent-button></div>' +
    d.comments.map(c => '<div class="pk-row"><span class="pk-name">' + (c.operator_name || '—') + '</span><span>' + esc(c.content) + '</span></div>').join('');
  // 附件（下载链接前缀 /uploads/projects/，静态服务挂载点）
  $('#td-files').innerHTML =
    '<div class="pk-filters"><input type="file" id="td-file"><fluent-button appearance="accent" size="small" onclick="tdUploadFile()">上传</fluent-button></div>' +
    d.files.map(f => '<div class="pk-row"><span class="pk-name"><a href="/uploads/projects/' + f.file_path + '" target="_blank">' + esc(f.file_name) + '</a></span></div>').join('');
  // 关联（样品/治具）
  $('#td-links').innerHTML = d.links.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.ref_type === 'sample' ? '样品' : '治具') + '</span>' +
    '<span>' + esc(l.ref_no || l.ref_id) + ' ' + esc(l.ref_name || '') + '</span></div>').join('') || '<span class="pk-name">未关联</span>';
  // 操作日志
  $('#td-logs').innerHTML = d.logs.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.operator_name || '—') + '</span><span>' + l.action + '</span><span>' + (l.detail || '') + '</span></div>').join('');
}

// 编辑任务（prompt 简化；MUST 回传 version 供乐观锁校验，否则后端 409）
async function tdEdit() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  const title = prompt('任务名称', t.title);
  if (title === null) return;
  const priority = prompt('优先级 H/M/L', t.priority || 'M');
  const body = { title, priority, version: t.version };
  try { await api('PUT', PApi.task(_tid), body); showToast('已保存'); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
// 子任务流转（CAS：后端按当前状态条件更新）
async function tdSubAction(sid, action) {
  try { await api('POST', PApi.taskSub(_tid, sid) + '/status', { action }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddSub() {
  const title = prompt('子任务名称');
  if (!title) return;
  try { await api('POST', PApi.taskSub(_tid), { title }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddDep() {
  const depId = prompt('前置任务 ID');
  if (!depId) return;
  try { await api('POST', PApi.taskDeps(_tid), { depends_on_id: Number(depId) }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddLink() {
  const refType = prompt('关联类型 sample/fixture', 'sample');
  const refId = prompt('对象 ID');
  if (!refId) return;
  try { await api('POST', PApi.taskLinks(_tid), { ref_type: refType, ref_id: Number(refId) }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddComment() {
  const content = $('#td-cmt').value.trim();
  if (!content) return;
  try { await api('POST', PApi.taskComments(_tid), { content }); $('#td-cmt').value = ''; tdLoad(); }
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
    showToast('上传成功'); tdLoad();
  } catch (e) { showToast(e.message, 'err'); }
}


/* --- subsystems/projects/frontend/js/views/workflow.js --- */
// workflow.js — 状态机管理：读取/保存 4 态 + 转移规则（仅 ADMIN；PUT 后端校验角色）
async function renderWorkflow() {
  const v = $('#view');
  if (me.role !== 'ADMIN') { v.innerHTML = '<p>仅管理员可访问</p>'; return; }
  const wf = await api('GET', PApi.workflow);
  const stateHtml = Object.keys(wf.states).map(k => {
    const s = wf.states[k];
    return '<div class="pk-row"><span class="pk-name">' + k + '</span>' +
      '<input id="wf-st-' + k + '" value="' + esc(s.label) + '" style="flex:1;min-width:120px">' +
      '<input type="color" id="wf-c-' + k + '" value="' + (s.color || '#000000') + '"></div>';
  }).join('');
  const trHtml = wf.transitions.map((t, i) =>
    '<div class="pk-row"><span class="pk-name">' + (t.from || '') + ' → ' + (t.to || '') + '</span>' +
    '<input id="wf-tr-' + i + '" value="' + esc(t.label || '') + '" style="flex:1;min-width:120px"></div>').join('');
  v.innerHTML =
    '<div class="pk-panel"><h3>状态定义</h3>' + stateHtml + '</div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>转移规则</h3>' + trHtml + '</div>' +
    '<div class="pk-filters" style="margin-top:14px"><fluent-button appearance="accent" onclick="wfSave()">保存配置</fluent-button></div>';
  window._wf = wf; // 暂存当前配置供 wfSave 读取（仅标签/颜色可改，拓扑与角色不可变）
}

// 保存配置：汇总 4 态 label/color + 转移 label，PUT 后端持久化（initial 一并回传）
async function wfSave() {
  const wf = window._wf;
  const states = {};
  for (const k of Object.keys(wf.states)) {
    states[k] = { label: $('#wf-st-' + k).value, color: $('#wf-c-' + k).value, bg: wf.states[k].bg };
  }
  const transitions = wf.transitions.map((t, i) =>
    Object.assign({}, t, { label: $('#wf-tr-' + i).value }));
  try {
    await api('PUT', PApi.workflow, { states, transitions, initial: wf.initial });
    showToast('配置已保存并生效'); renderWorkflow();
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
