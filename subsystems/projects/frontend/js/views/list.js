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
