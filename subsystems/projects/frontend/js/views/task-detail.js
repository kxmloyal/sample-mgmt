// task-detail.js — 任务详情：主信息卡 + 分区 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
let _tid = 0;
// v2：详情页 = 主信息卡 + 下方 tabs（子任务/评论/附件/关联/日志），分区加载替代全量重渲染
// P1-1 修复：详情 payload 前端缓存（_tdCache），切 tab 复用缓存不再重复拉全量；tdRefresh/写操作后清缓存强制刷新。
// 借鉴样品详情弹窗三模式（2026-09-08）：①骨架屏先行 ②请求序号竞态守卫 ③编辑脏守卫
let _tdReqSeq = 0;                 // 竞态守卫：快速切换任务时丢弃过期渲染
var _tdDirty = false;              // 脏守卫：编辑弹窗有未保存修改标记（tdEdit 打开置位，保存/关闭复位）
var _tdTab = 'subs';
var _tdCache = { tid: 0, data: null, ts: 0, ttl: 8000 };
var _tdCacheTtl = 8000; // 8s 内同任务复用（弱一致只读）；写操作后走 tdRefresh 清缓存强制重新拉取
const TD_TABS = [
  { k: 'subs', t: '子任务' }, { k: 'comments', t: '评论' },
  { k: 'files', t: '附件' }, { k: 'links', t: '关联' },
  { k: 'xlinks', t: '风险/变更' }, { k: 'logs', t: '日志' }
];
async function renderTaskDetail(tid) {
  if (_tdDirty && !confirm('详情有未保存的修改，离开将丢失，继续？')) { // 脏守卫：换任务前拦截
    location.hash = '#/tasks/' + _tid; return;
  }
  const seq = ++_tdReqSeq;
  _tid = tid;
  _tdDirty = false;
  const v = $('#view');
  // ① 骨架屏先行（借鉴 samples viewDetail：标题条 + 主卡占位 + tabs 占位），数据到达后替换
  v.innerHTML =
    '<div class="pk-panel" id="td-info"><div class="td-sk-row"><div class="sk" style="height:20px;width:42%"></div>' +
    '<div class="sk" style="height:12px;width:30%"></div><div class="sk" style="height:12px;width:55%"></div>' +
    '<div class="sk" style="height:12px;width:38%"></div><div class="sk" style="height:12px;width:50%"></div></div></div>' +
    '<div class="pk-panel" style="margin-top:14px">' +
    '<div class="pk-tabs" id="td-tabs"></div>' +
    '<div id="td-body"><div class="sk" style="height:64px;margin-top:8px"></div></div></div>' +
    '<div class="td-at-box" id="td-at-box" style="display:none"></div>'; // @提及候选浮层
  // @补全成员缓存（进详情拉一次；失败静默退化为无补全）
  _tdUsers = await api('GET', '/api/projects/users').catch(function () { return null; });
  if (seq !== _tdReqSeq) return; // 期间已切走：丢弃
  await tdLoadSection('info');
  if (seq !== _tdReqSeq) return;
  tdSwitchTab('subs');
}
function tdSwitchTab(k) {
  _tdTab = k;
  // 方案A-④：tabs 计数徽章（从缓存取数；无缓存时先无徽章渲染，加载后刷新）
  const d = (_tdCache.tid === _tid) ? _tdCache.data : null;
  const badge = function (n) { return n != null ? ' <span class="td-badge">' + n + '</span>' : ''; };
  $('#td-tabs').innerHTML = TD_TABS.map(function (x) {
    const n = d ? { subs: (d.subtasks || []).length, comments: (d.comments || []).length, files: (d.files || []).length, links: (d.links || []).length, logs: (d.logs || []).length, xlinks: ((d.risks || []).length + (d.changes || []).length) }[x.k] : null;
    return '<fluent-button appearance="' + (x.k === k ? 'accent' : 'neutral') + '" size="small" onclick="tdSwitchTab(\'' + x.k + '\')">' + x.t + badge(n) + '</fluent-button>';
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
    else if (kind === 'xlinks') tdLoadXlinks();
    else if (kind === 'logs') body.innerHTML = renderTdLogs(d);
    // 方案A-④：数据到手后刷新 tabs 徽章
    if (kind !== 'info') tdSwitchTabBadges(d);
  } catch (e) { showToast(e.message, 'err'); }
}
// 方案A-④：仅刷新 tabs 徽章（不触发子分区重载）
function tdSwitchTabBadges(d) {
  if (!d || !$('#td-tabs')) return;
  const badge = function (n) { return ' <span class="td-badge">' + n + '</span>'; };
  const counts = { subs: (d.subtasks || []).length, comments: (d.comments || []).length, files: (d.files || []).length, links: (d.links || []).length, logs: (d.logs || []).length, xlinks: ((d.risks || []).length + (d.changes || []).length) };
  $('#td-tabs').innerHTML = TD_TABS.map(function (x) {
    return '<fluent-button appearance="' + (x.k === _tdTab ? 'accent' : 'neutral') + '" size="small" onclick="tdSwitchTab(\'' + x.k + '\')">' + x.t + badge(counts[x.k]) + '</fluent-button>';
  }).join('');
}
// v2：详情局部刷新（清缓存 → info 主卡 + 当前 tab，替代全量重渲染）
function tdRefresh() { _tdCache.tid = 0; _tdCache.ts = 0; tdLoadSection('info'); tdSwitchTab(_tdTab); }
// v2：主信息卡（project_name/assignee_name 来自详情 JOIN，无前端补查；含进度条 + 编辑/子任务/依赖/关联/删除按钮区）
function renderTdInfo(d) {
  const t = d.task;
  const st = t.status_eff || t.status;
  const canEdit = ['ADMIN', 'PM'].includes(me.role);
  // 方案三A：状态底色（CANCELLED 灰；其余沿用 manifest 色系）
  const stBg = { NOT_STARTED: '#fffbeb', IN_PROGRESS: '#eff6ff', DONE: '#ecfdf5', OVERDUE: '#fef2f2', CANCELLED: '#f1f5f9' }[st] || 'transparent';
  $('#td-info').innerHTML =
    '<h3>' + esc(t.title) + '</h3>' +
    '<div class="pk-row"><span class="pk-name">状态</span><span style="background:' + stBg + ';padding:1px 8px;border-radius:8px">' + (TASK_STATUS_CN[st] || st) + '</span>' +
    '<span> · 进度 ' + t.progress + '%</span>' +
    '<span class="pk-progress" style="flex:1"><span class="pk-progress-bar" style="width:' + Math.min(t.progress || 0, 100) + '%"></span></span></div>' +
    '<div class="pk-row"><span class="pk-name">项目</span><span>' + esc(t.project_name || t.project_id) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">类别</span><span>' + (CATEGORY_CN[t.category] || t.category) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">优先级</span><span>' + (PRIORITY_CN[t.priority] || t.priority) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">责任人</span><span>' + esc(t.assignee_name || '未指派') + '</span></div>' +
    (t.start_date ? '<div class="pk-row"><span class="pk-name">开始日期</span><span>' + fmt(t.start_date) + '</span></div>' : '') +
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
      '<fluent-button appearance="neutral" size="small" onclick="pConfirm(\'确认删除该任务？（子任务/评论/附件/日志将一并删除）\',\'tdDel()\')">删除任务</fluent-button></div>' : '') +
    // 方案A-①：快捷流转条（状态驱动按钮组，替代进编辑才能流转）
    tduxQuickActions(t, canEdit);
}
// v2：子任务分区（三态 + CAS 流转按钮：START/COMPLETE）+ 方案A-② 拖拽排序 + 指派人/日期展示
function renderTdSubs(d) {
  const rows = d.subtasks.map(s =>
    '<div class="pk-row td-sub-row" draggable="true" data-sid="' + s.id + '" ' +
    'ondragstart="tduxSubDragStart(event)" ondragend="tduxSubDragEnd(event)" ondragover="tduxSubDragOver(event)" ondrop="tduxSubDrop(event)">' +
    '<span class="td-drag-handle" title="拖拽排序">⋮⋮</span>' +
    '<span class="pk-name">' + esc(s.title) + '</span>' +
    '<span class="muted">' + (s.assignee_name ? '@' + esc(s.assignee_name) : '') + (s.planned_date ? ' · ' + fmt(s.planned_date) : '') + '</span>' +
    '<span>' + (SUBTASK_STATUS_CN[s.status] || s.status) + '</span>' +
    (s.status === 'NOT_STARTED' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'START\')">开始</fluent-button>' : '') +
    (s.status === 'IN_PROGRESS' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'COMPLETE\')">完成</fluent-button>' : '') +
    '<fluent-button size="small" appearance="neutral" onclick="tdSubEdit(' + s.id + ')">编辑</fluent-button>' +
    '<fluent-button size="small" appearance="neutral" onclick="pConfirm(\'确认删除该子任务？\',\'tdSubDel(' + s.id + ')\')">删除</fluent-button>' +
    '</div>').join('');
  return (rows ? '<div class="muted" style="font-size:11px;margin-bottom:6px">拖「⋮⋮」调整执行顺序（自动保存）</div>' : '') +
    '<div id="td-subs-list">' + (rows || '<span class="pk-name pk-empty-line">无子任务</span>') + '</div>';
}
// v2：评论分区（输入框 + 列表，含删除按钮）+ 方案A-③ @提及（oninput 触发候选浮层；提交时解析提及发通知）
function renderTdComments(d) {
  return '<div class="td-cmt-wrap"><div class="pk-filters"><input id="td-cmt" placeholder="写评论… 输入 @ 提及同事" style="flex:1;min-width:180px" oninput="tduxCmtInput()" onkeydown="if(event.key===\'Escape\')document.getElementById(\'td-at-box\').style.display=\'none\'">' +
    '<fluent-button appearance="accent" size="small" onclick="tdAddComment()">发送</fluent-button></div>' +
    d.comments.map(c => '<div class="pk-row"><span class="pk-name">' + (c.operator_name || '—') + '</span><span>' +
      // @名字 高亮渲染（服务端 mentions 存在时把被提名人名字染色；简单实现：只高亮 @xxx 文本）
      esc(c.content).replace(/@([^\s@，。；,;]{1,20})/g, '<span class="td-mention">@$1</span>') + '</span>' +
      (c.operator_id === me.id || me.role === 'ADMIN' || me.role === 'PM'
        ? '<fluent-button size="small" appearance="neutral" onclick="tdCmtDel(' + c.id + ')">删除</fluent-button>' : '') + '</div>').join('') + '</div>';
}
// v2：附件分区（上传区 + 列表，含删除按钮）+ 方案A-⑤ 图片缩略图
// 方案二A：下载切换为受控端点（登录 + 相关人校验）；缩略图预览暂留静态路径（兼容，后续迭代收紧）
function renderTdFiles(d) {
  return '<div class="pk-filters"><input type="file" id="td-file"><fluent-button appearance="accent" size="small" onclick="tdUploadFile()">上传</fluent-button>' +
    '<span class="muted" style="font-size:12px">支持 pdf/office/图片/zip/图纸(dwg·dxf·step)，≤50MB</span></div>' +
    (d.files.map(f => '<div class="pk-row">' + tduxFileThumb(f) +
      '<span class="pk-name"><a href="' + PApi.fileDownload(_tid, f.id) + '" target="_blank">' + esc(f.file_name) + '</a></span>' +
      '<fluent-button size="small" appearance="neutral" onclick="tdFileDel(' + f.id + ')">删除</fluent-button></div>').join('') || '<span class="pk-name pk-empty-line">暂无附件</span>');
}
// 方案三C：风险/变更互链 tab（详情 payload 的 risks/changes，由后端批量查询注入；点击跳对应管理页）
function renderTdXlinks(d) {
  const rk = (d.risks || []).map(r =>
    '<div class="pk-row"><span class="pk-name">风险</span>' +
    '<span><a href="#/risks?project=' + d.task.project_id + '">' + esc(r.risk_name) + '</a>' +
    ' <span class="pk-tag ' + (r.severity || 'm').toLowerCase() + '">' + (r.severity === 'H' ? '高' : r.severity === 'L' ? '低' : '中') + '</span>' +
    ' <span class="muted">' + (r.status === 'RESOLVED' ? '已解决' : '开放') + '</span></span></div>').join('');
  const ch = (d.changes || []).map(c =>
    '<div class="pk-row"><span class="pk-name">变更</span>' +
    '<span><a href="#/changes?project=' + d.task.project_id + '">' + esc(c.change_no || ('#' + c.id)) + '</a> ' + esc(c.description || '').slice(0, 40) +
    ' <span class="muted">' + (c.status === 'PENDING' ? '待审批' : c.status === 'APPROVED' ? '已批准' : c.status === 'REJECTED' ? '已驳回' : c.status) + '</span></span></div>').join('');
  return (rk + ch) || '<span class="pk-name pk-empty-line">暂无关联风险/变更</span>';
}
// 风险/变更 tab 懒加载：详情缓存无数据时按项目拉全量过滤（量级小，一次请求）
async function tdLoadXlinks() {
  const d = await tdFetch();
  if (d.risks || d.changes) { $('#td-body').innerHTML = renderTdXlinks(d); return; }
  try {
    const [rk, ch] = await Promise.all([
      api('GET', PApi.risks(d.task.project_id)).catch(function () { return []; }),
      api('GET', PApi.changes(d.task.project_id)).catch(function () { return []; })
    ]);
    d.risks = (rk || []).filter(function (x) { return x.task_id === _tid; });
    d.changes = (ch || []).filter(function (x) { return x.task_id === _tid; });
  } catch (e) { d.risks = []; d.changes = []; }
  $('#td-body').innerHTML = renderTdXlinks(d);
  tdSwitchTabBadges(d);
}
// v2：关联分区（样品/治具）
function renderTdLinks(d) {
  return d.links.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.ref_type === 'sample' ? '样品' : '治具') + '</span>' +
    '<span>' + esc(l.ref_no || l.ref_id) + ' ' + esc(l.ref_name || '') + '</span></div>').join('') || '<span class="pk-name pk-empty-line">未关联</span>';
}
// v2：操作日志分区
function renderTdLogs(d) {
  return d.logs.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.operator_name || '—') + '</span><span>' + l.action + '</span><span>' + (l.detail || '') + '</span></div>').join('') || '<span class="pk-name pk-empty-line">暂无日志</span>';
}

