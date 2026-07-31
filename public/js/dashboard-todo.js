// dashboard-todo.js — Dashboard 待办列表（角色定制优先级 + 分页 + 卡片筛选）
// 快捷操作由 dashboard.js 的 _renderQuickActions 渲染；本文件仅负责待办
// renderTodo(d) 由 dashboard.js 的 viewDashboard 延迟调用（确保 #dash-todo DOM 就绪）
var _todoPager = { limit: 10, offset: 0, total: 0 };
var _todoData = [];
var _todoFilter = '';

// 入口：填充待办数据并首次渲染（分页 10 条/页，清除筛选）
function renderTodo(d) {
  _todoData = d.myPending || [];
  _todoFilter = '';
  _todoPager.offset = 0;
  _renderTodoTable();
}

// 点击统计卡片按状态筛选待办（status 空字符串=全部，el=点击的卡片元素用于高亮）
function filterTodo(status, el) {
  _todoFilter = status;
  _todoPager.offset = 0;
  document.querySelectorAll('.dash-stat.active').forEach(function(n){ n.classList.remove('active'); });
  if (el) el.classList.add('active');
  _renderTodoTable();
}

// 渲染待办表格（按 _todoFilter 过滤，空数据显示提示，复用 dashboard.js 的 _renderPager）
function _renderTodoTable() {
  var box = $('#dash-todo');
  if (!box) return;
  var title = '我的待办（' + (ROLE[me.role] || me.role) + '）' + (_todoFilter ? ' · ' + (STAT_LABELS[_todoFilter] || _todoFilter) : '');
  var filtered = _todoFilter ? _todoData.filter(function(s){ return s.status === _todoFilter; }) : _todoData;
  _todoPager.total = filtered.length;
  if (!filtered.length) {
    box.innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">' + title + '</h3><div class="empty">' + (_todoData.length ? '该状态暂无待办' : '暂无待办') + '</div></div>';
    return;
  }
  var pageList = filtered.slice(_todoPager.offset, _todoPager.offset + _todoPager.limit);
  var rows = pageList.map(function(s) {
    var info = _getTodoInfo(s);
    var img = (s.produced_image || s.image) ? '<img src="' + e(s.produced_image || s.image) + '" width="40" height="40" style="border-radius:4px;object-fit:cover" loading="lazy"/>' : '—';
    // 待办行单击进详情(viewDetail),"去处理"按钮 stopPropagation 防冒泡;info.cls 优先级样式从 td 移到 tr(Task4 CSS 配合调整)
    return '<tr class="dash-todo-row ' + info.cls + '" onclick="viewDetail(\'' + s.id + '\')" style="cursor:pointer"><td>' + e(s.sample_no) + '</td><td>' + e(s.name || '—') + '</td><td>' + img + '</td><td class="muted">' + e(s.spec || '—') + '</td><td>' + info.type + '</td><td>' + statusBadge(s) + '</td><td><a class="link" onclick="event.stopPropagation();goScan(\'' + e(s.sample_no) + '\')">去处理</a></td></tr>';
  }).join('');
  var pagerHtml = _renderPager(_todoPager, 'goTodoPage');
  box.innerHTML = '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">' + title + '</h3><div style="overflow-x:auto"><table><tr><th>编号</th><th>名称</th><th>图片</th><th>规格</th><th>待办类型</th><th>状态</th><th>操作</th></tr>' + rows + '</table></div>' + pagerHtml + '</div>';
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
