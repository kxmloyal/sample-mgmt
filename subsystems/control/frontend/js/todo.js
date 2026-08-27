// subsystems/control/frontend/js/todo.js — 角色待办派生与渲染（看板顶部待办区）
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.3
// 纯前端派生，复用 constants.js 的 controlTransitionsOf（待我流转）与 progress.js 的 CONTROL_SIGN_NODES（待我签核）
// 说明：看板列表接口不含会签 signs，待我签核按「状态命中会签节点 + 该节点首步角色匹配当前角色/管理员」近似圈定。

// 派生当前角色待办：toFlow=待我流转, toSign=待我签核（各返回单据数组 + 计数）
function ctlTodoOf(orders, role) {
  var list = orders || [];
  var toFlow = [];
  var toSign = [];
  list.forEach(function (o) {
    if (controlTransitionsOf(o.status, role).length) toFlow.push(o);
    var node = CONTROL_SIGN_NODES.find(function (n) { return n.trigger_status === o.status; });
    if (node && node.steps && node.steps.length && (node.steps[0].role === role || role === 'ADMIN')) {
      toSign.push(o);
    }
  });
  return { toFlow: toFlow, toSign: toSign, flowCount: toFlow.length, signCount: toSign.length };
}

// 单条待办项 HTML：单号 + 品名 + 状态徽章 + 下一动作提示（点击跳详情）
function ctlTodoItemHtml(o) {
  var next = controlTransitionsOf(o.status, me.role);
  var hint = next.length ? next[0].label : '查看详情';
  return '<a class="todo-item" href="#/detail?id=' + o.id + '">'
    + '<span class="mono">' + e(o.order_no) + '</span>'
    + '<span>' + e(o.part_name || '—') + '</span>'
    + statusBadge(o)
    + '<span class="todo-hint">' + e(hint) + '</span></a>';
}

// 待办区 HTML：有待办分「待我流转 / 待我签核」两栏，无待办显示空态
function ctlTodoHtml(orders, role) {
  var t = ctlTodoOf(orders, role);
  if (!t.flowCount && !t.signCount) return '<div class="empty">当前角色暂无待办</div>';
  var sec = function (title, list) {
    if (!list.length) return '';
    return '<div class="todo-sec"><div class="todo-title">' + title + ' <span class="n">' + list.length + '</span></div>'
      + list.map(ctlTodoItemHtml).join('') + '</div>';
  };
  return '<div class="ctl-todo">' + sec('待我流转', t.toFlow) + sec('待我签核', t.toSign) + '</div>';
}
