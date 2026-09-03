// subsystems/workbench/frontend/js/views/my-todos.js — 我的待办（跨子系统聚合视图）
// 数据：GET /api/workbench/my-todos（后端按 角色/部门/个人 三维实时聚合，口径见后端 db/my-todos.js）
// 下钻：样品/治具/管制 复用 openWbDetail 弹窗（wb-detail.js）；项目任务新标签页跳 projects 子系统深链 #/tasks/:id
// 依赖：api()/e()/fmt()（api-base.js/utils.js）、openWbDetail（wb-detail.js，bundle 顺序须在其后）

// 待办项注册表：groupKey → items（点击时按索引取原始对象，避免把数据拼进 onclick 引号地狱/XSS）
var _wbTodoItems = {};

// 入口：渲染我的待办页（汇总卡 + 按子系统分组列表）
async function renderMyTodos() {
  var v = document.getElementById('view');
  v.innerHTML = '<div class="muted" style="text-align:center;padding:40px">加载中…</div>';
  document.getElementById('page-actions').innerHTML =
    '<fluent-button appearance="lightweight" size="small" onclick="renderMyTodos()">刷新</fluent-button>';
  var d;
  try {
    d = await api('GET', '/api/workbench/my-todos');
  } catch (err) {
    v.innerHTML = '<div class="empty">加载失败：' + e(err.message) + '</div>';
    return;
  }
  var groups = d.groups || [];
  var total = d.total || 0;
  var overdueTotal = 0;
  _wbTodoItems = {};
  groups.forEach(function (g) {
    _wbTodoItems[g.key] = g.items;
    g.items.forEach(function (it) { if (it.overdue) overdueTotal++; });
  });

  // 汇总条：总数 + 各子系统计数徽章（点击滚动定位）+ 口径说明
  var html = '<div class="filters" style="align-items:center;gap:12px;flex-wrap:wrap">' +
    '<span style="font-size:14px">我的待办共 <b>' + total + '</b> 项' +
    (overdueTotal ? ' · <span style="color:var(--bad);font-weight:600">逾期/紧急 ' + overdueTotal + '</span>' : '') + '</span>' +
    groups.map(function (g) {
      return '<span class="badge" style="cursor:pointer" onclick="wbTodoJump(\'' + g.key + '\')">' + g.name + ' ' + g.items.length + '</span>';
    }).join('') +
    '<span class="muted" style="font-size:12px">口径：我角色/部门可处理 + 指派给我 · ' + e(d.display_name || '') + '（' + e(d.dept || '未设部门') + '）</span></div>';

  if (!total) {
    html += '<div class="card"><div class="empty" style="padding:40px">🎉 暂无待办事项</div></div>';
    v.innerHTML = html;
    return;
  }

  // 分组卡片
  groups.forEach(function (g) {
    html += '<div class="card" style="padding:0;margin-bottom:14px" id="wb-todo-' + g.key + '">' +
      '<div style="padding:12px 16px;border-bottom:1px solid var(--line);font-weight:600;font-size:14px">' +
      g.name + ' <span class="badge">' + g.items.length + '</span></div>';
    if (!g.items.length) {
      html += '<div class="empty" style="padding:16px">暂无待办</div></div>';
      return;
    }
    html += g.items.map(function (it, i) { return _wbTodoRow(g.key, it, i); }).join('') + '</div>';
  });
  v.innerHTML = html;
}

// 单行待办：待办类型徽章 + 编号 + 名称 + 状态 + 提示 + 更新时间；逾期红左边框
function _wbTodoRow(groupKey, it, idx) {
  return '<div class="wb-todo-row" style="display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;' +
    (idx > 0 ? 'border-top:1px solid var(--line);' : '') +
    (it.overdue ? 'border-left:3px solid var(--bad);' : 'border-left:3px solid transparent;') +
    '" onclick="wbTodoOpen(\'' + groupKey + '\',' + idx + ')">' +
    '<span class="badge" style="flex:none;' + (it.overdue ? 'border:1px solid var(--bad);color:var(--bad)' : '') + '">' + e(it.todo) + '</span>' +
    '<b style="flex:none">' + e(it.item_no || '—') + '</b>' +
    '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(it.name || '—') + '</span>' +
    '<span class="muted" style="flex:none;font-size:12px">' + e(it.status_cn || it.status || '') + '</span>' +
    (it.hint ? '<span class="muted" style="flex:none;font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + e(it.hint) + '</span>' : '') +
    '<span class="muted" style="flex:none;font-size:12px">' + fmt(it.updated_at) + '</span></div>';
}

// 行点击：project 新标签页跳子系统深链；其余复用 openWbDetail 弹窗
function wbTodoOpen(groupKey, idx) {
  var it = (_wbTodoItems[groupKey] || [])[idx];
  if (!it) return;
  if (it.item_type === 'project') {
    window.open(it.link || '/subsystems/projects/frontend/index.html', '_blank');
    return;
  }
  openWbDetail({ id: it.id, item_type: it.item_type, item_no: it.item_no, name: it.name });
}

// 汇总徽章点击 → 滚动定位到对应分组
function wbTodoJump(key) {
  var el = document.getElementById('wb-todo-' + key);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
