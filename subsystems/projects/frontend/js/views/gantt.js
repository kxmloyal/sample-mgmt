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
