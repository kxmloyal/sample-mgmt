// subsystems/control/frontend/js/views/todo.js — 我的待办独立页
// 职责：加载当前角色的待办（待我流转 + 待我签核），独立页面展示，单击单据进详情。
// 复用 js/todo.js 的 ctlTodoOf / ctlTodoHtml 派生逻辑，与看板统计卡「待我签核/待我流转」联动。

async function renderTodo() {
  var view = $('#view');
  view.innerHTML = '<h3 class="ctl-sec">我的待办</h3><div class="ctl-todo" id="ctl-todo-body"><div class="empty">加载中…</div></div>';
  var body = $('#ctl-todo-body');
  try {
    var res = await api('GET', '/api/control/orders?limit=200');
    var orders = (res && res.orders) || [];
    body.innerHTML = ctlTodoHtml(orders, me.role);
  } catch (err) {
    body.innerHTML = '<div class="empty">待办加载失败：' + e(err.message) + '</div>';
  }
}
