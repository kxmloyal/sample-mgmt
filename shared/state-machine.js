// shared/state-machine.js — 通用状态机引擎
// 基于 manifest.stateMachine 声明式校验和驱动状态转移

/**
 * 加载 manifest 的状态机定义，返回操作接口
 * @param {object} stateMachine - manifest.stateMachine 对象
 * @returns {{ getAllowedActions, canTransition, getStateLabel, getStateBadge, getTransitions }}
 */
function createStateMachine(stateMachine) {
  const states = stateMachine.states || {};
  const transitions = stateMachine.transitions || [];

  /** 获取当前状态下当前角色可执行的操作列表 */
  function getAllowedActions(role, currentStatus) {
    return transitions
      .filter(function (t) { return t.from === currentStatus && t.role.includes(role); })
      .map(function (t) { return { action: t.action, label: t.label, to: t.to }; });
  }

  /** 校验操作是否允许 */
  function canTransition(role, from, action) {
    return transitions.some(function (t) {
      return t.from === from && t.action === action && t.role.includes(role);
    });
  }

  /** 获取状态人类可读标签 */
  function getStateLabel(status) {
    return states[status] ? states[status].label : status;
  }

  /** 获取状态 badge 的颜色信息 */
  function getStateBadge(status) {
    var s = states[status];
    if (!s) return { label: status, color: '#999', bg: '#f0f0f0' };
    return { label: s.label, color: s.color, bg: s.bg };
  }

  /** 获取所有转移规则 */
  function getTransitions() {
    return transitions;
  }

  return { getAllowedActions, canTransition, getStateLabel, getStateBadge, getTransitions };
}

module.exports = { createStateMachine };
