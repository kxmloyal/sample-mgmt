// subsystems/control/frontend/js/todo.js — 角色待办派生与渲染（看板顶部待办区）
// 权威依据：docs/superpowers/specs/2026-08-26-control-dashboard-todo-design.md §3.3
// 纯前端派生，复用 constants.js 的 controlTransitionsOf（待我流转）；
// 待我签核按列表接口注入的 pending 行（该单全部待签行的 role+dept）精准判定。
// 2026-09-04 修复与收紧：①原「会签节点首步角色」近似导致非首步角色待办缺失（误导）；
// ②会签按部门区分（role+dept 双匹配，deptAliases 展开短名↔全名），同角色不同部门不互代签——
// 与后端 resolveSignTarget、详情页 canSign、workbench 我的待办四处同口径。

// 会签步骤短名部门 → 用户表部门全名（与 data/control-flow.json 的 deptAliases 同源，两处维护勿漂移）
var CTL_DEPT_ALIAS = { '品保': ['品保文管中心'], '研发': ['研发部', '测试部'], '生管': ['生管部'], '仓库': ['资材部'], '制造部': ['制造部'] };

// 我的部门是否命中会签步骤部门（短名/全名双向展开比较）
function ctlSignDeptHit(stepDept, myDept) {
  if (!stepDept || !myDept) return false;
  if (stepDept === myDept) return true;
  var a = CTL_DEPT_ALIAS[stepDept] || [stepDept];
  var b = CTL_DEPT_ALIAS[myDept] || [myDept];
  return a.some(function (x) { return b.indexOf(x) !== -1; });
}

// 派生当前角色待办：toFlow=待我流转, toSign=待我签核（各返回单据数组 + 计数）
function ctlTodoOf(orders, role) {
  var list = orders || [];
  var toFlow = [];
  var toSign = [];
  list.forEach(function (o) {
    if (controlTransitionsOf(o.status, role).length) toFlow.push(o);
    var pending = o.pending || [];
    if ((o.status === 'SIGNING' || o.status === 'DISPOSAL_SIGNING')
        && pending.some(function (p) { return p.role === role || (role === 'ADMIN' && p.role); })) {
      // 非 ADMIN 再按部门过滤（ADMIN 见所有待签单）
      if (role === 'ADMIN' || pending.some(function (p) { return p.role === role && ctlSignDeptHit(p.dept, me.dept); })) {
        toSign.push(o);
      }
    }
  });
  return { toFlow: toFlow, toSign: toSign, flowCount: toFlow.length, signCount: toSign.length };
}

// 单条待办项 HTML：单号 + 品名 + 状态徽章 + 下一动作提示（点击跳详情）
function ctlTodoItemHtml(o) {
  // 轮到我（角色+部门）签核时优先提示「待我会签」，否则按角色可执行流转（如退回），无可执行动作则「查看详情」
  var pending = o.pending || [];
  var mine = pending.some(function (p) { return p.role === me.role && ctlSignDeptHit(p.dept, me.dept); });
  var trans = controlTransitionsOf(o.status, me.role);
  var hint = mine ? '待我会签'
    : (trans.length ? trans[0].label : '查看详情');
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
