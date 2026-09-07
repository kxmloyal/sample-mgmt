// kanban.js — 任务看板：4 列（未开始/进行中/已完成/已延期），HTML5 拖拽流转（仅合法转移）
// 落列按 ACTION_MAP 判定：NOT_STARTED>IN_PROGRESS→START、IN_PROGRESS>DONE→COMPLETE；非法流转 toast 报错并重渲染回弹
// 卡片内提供「开始/完成」按钮兜底（移动端无拖拽能力时亦可流转）
// v2：看板「我的任务」筛选状态；列分组/计数按 status_eff；卡片进度条 + 项目名标签 + OVERDUE 强调
// 迭代1：类别/优先级/责任人下拉筛选（A2）+ 筛选 URL 化（A4，筛选函数在 kanban-filter.js 保持顶层函数 ≤10）
// 方案B-⑥：看板顶部 OA 摘要卡（里程碑/风险/变更 三卡，当前筛选项目范围；空数据显示 0 计数+引导语）
// 方案B-⑦：30s 静默轮询（页面不可见时暂停；数据有变化才重渲染，无变化不打扰拖拽操作）
// 方案B-⑧：筛选记忆（localStorage 持久化，进入看板自动恢复上次筛选组合；URL hash 优先级更高）
var _kbMine = false;
var _kbPollTimer = null;
var _kbLastSig = '';

// ⑥ OA 摘要卡：拉当前项目范围的里程碑/风险/变更汇总并渲染三卡
async function kbRenderOaCards() {
  const box = $('#kb-oa');
  if (!box) return;
  const f = kbFilters();
  const pid = f.project_id || (_kbMine ? null : null);
  const scope = pid ? 'project_id=' + pid + '&' : '';
  const [ms, rk, ch] = await Promise.all([
    pid ? api('GET', PApi.milestones(pid)).catch(function () { return []; }) : Promise.resolve([]),
    api('GET', '/api/projects/risks' + (pid ? '?' + scope : '')).catch(function () { return []; }),
    api('GET', '/api/projects/changes' + (pid ? '?' + scope : '')).catch(function () { return []; })
  ]);
  const msDue = ms.filter(function (m) { return !m.achieved_at; }).length;
  const rkOpen = rk.filter(function (r) { return r.status === 'OPEN'; }).length;
  const chPend = ch.filter(function (c) { return c.status === 'PENDING'; }).length;
  const cards = [
    { t: '里程碑', n: msDue, cls: 'oa-ms', tip: msDue ? '个未达成' : '全部达成', link: '#/milestones' },
    { t: '风险', n: rkOpen, cls: 'oa-rk', tip: rkOpen ? '个未解决' : '暂无未解决', link: '#/risks' },
    { t: '变更', n: chPend, cls: 'oa-ch', tip: chPend ? '单待审批' : '无待审批', link: '#/changes' }
  ];
  box.innerHTML = cards.map(function (c) {
    return '<div class="kb-oa-card ' + c.cls + '" onclick="location.hash=\'' + c.link + '\'">' +
      '<span class="n">' + c.n + '</span><span class="t">' + c.t + '</span><span class="tip">' + c.tip + '</span></div>';
  }).join('');
}
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
    '<div class="kb-oa-row" id="kb-oa"><div class="muted" style="padding:4px 2px">OA 摘要加载中…</div></div>' +
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
  // B-⑧ 筛选记忆：hash 无筛选时回退 localStorage 记忆（URL 优先）
  if (!location.hash.includes('?')) kbRestoreFromMemory();
  kbRestoreFromHash();
  kbRememberFilters();
  await kbLoad();
  kbRenderOaCards(); // B-⑥ OA 摘要卡
  kbStartPolling();  // B-⑦ 30s 静默轮询
}

// B-⑧ 筛选记忆：保存/恢复（localStorage key = projects.kanban.filters）
function kbRememberFilters() {
  try {
    const f = kbFilters();
    localStorage.setItem('projects.kanban.filters', JSON.stringify({ project_id: f.project_id, category: f.category, priority: f.priority, assignee_id: f.assignee_id, mine: _kbMine }));
  } catch (e) {}
}
function kbRestoreFromMemory() {
  try {
    const s = localStorage.getItem('projects.kanban.filters');
    if (!s) return;
    const f = JSON.parse(s);
    const map = { 'kb-project': f.project_id, 'kb-category': f.category, 'kb-priority': f.priority, 'kb-assignee': f.assignee_id };
    Object.keys(map).forEach(function (id) {
      const el = document.getElementById(id);
      if (el && map[id]) el.value = String(map[id]);
    });
    if (f.mine) { _kbMine = true; const b = $('#kb-mine'); if (b) b.classList.add('active'); }
  } catch (e) {}
}

// B-⑦ 静默轮询：30s 拉当前筛选任务集做签名比对，变化才 kbLoad 重渲染；页面隐藏时暂停
function kbStartPolling() {
  if (_kbPollTimer) clearInterval(_kbPollTimer);
  _kbLastSig = '';
  _kbPollTimer = setInterval(async function () {
    if (document.hidden) return;                     // 后台标签页暂停
    if (!document.getElementById('pk-kanban')) {     // 已离开看板视图 → 停止
      clearInterval(_kbPollTimer); _kbPollTimer = null; return;
    }
    try {
      const f = kbFilters();
      const qs = new URLSearchParams();
      if (f.project_id) qs.set('project_id', f.project_id);
      if (f.category) qs.set('category', f.category);
      if (f.priority) qs.set('priority', f.priority);
      if (_kbMine) qs.set('assignee_id', me.id);
      const rows = await api('GET', '/api/projects/tasks' + (qs.toString() ? '?' + qs : ''));
      const sig = (Array.isArray(rows) ? rows : []).map(function (t) { return t.id + ':' + (t.status_eff || t.status) + ':' + (t.version || 0) + ':' + (t.progress || 0); }).sort().join('|');
      if (sig !== _kbLastSig) {
        const first = _kbLastSig === '';
        _kbLastSig = sig;
        if (!first) { await kbLoad(); kbRenderOaCards(); } // 首轮只记基线不渲染（kbLoad 刚跑过）
      }
    } catch (e) { /* 静默 */ }
  }, 30000);
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
