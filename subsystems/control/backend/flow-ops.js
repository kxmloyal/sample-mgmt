// subsystems/control/backend/flow-ops.js — 管制后端流程操作辅助（纯逻辑，供 routes-orders/routes-ncr/label 复用）
// 权威依据：docs/superpowers/specs/2026-08-24-control-flow-design.md §8/§12
// 职责：会签闸口/目标解析、状态机封装、状态中文、模板初始化、流转目标推导，均为纯函数（不依赖 DB）
const { createStateMachine } = require('../../../shared/state-machine');
const { SIGN_NODES, deriveProgress, calcReworkRemain, deptEquals } = require('./flow');

const MANIFEST = require('../manifest.json');
const sm = createStateMachine(MANIFEST.stateMachine);

// 状态 → 中文（导出/显示，取自 manifest.stateMachine.states.label）
const STATUS_CN = {};
Object.keys(MANIFEST.stateMachine.states).forEach(function (k) { STATUS_CN[k] = MANIFEST.stateMachine.states[k].label; });

/** 状态机实例（供 canTransition/getStateLabel 等） */
function getStateMachine() { return sm; }

/** 状态中文 */
function statusLabel(status) { return STATUS_CN[status] || status; }

/** 状态 badge（颜色信息，前端/导出用） */
function statusBadge(status) { return sm.getStateBadge(status); }

/** 按 node_key 找会签节点模板 */
function findSignNode(nodeKey) {
  return SIGN_NODES.find(function (n) { return n.node_key === nodeKey; }) || null;
}

/** 创建时初始化会签模板：APPLY_SIGN 的 N 步 → 待签记录（decision 空，待各单位签署） */
function buildSignTemplate(orderId, nodeKey) {
  const node = findSignNode(nodeKey);
  if (!node) return [];
  return node.steps.map(function (step) {
    return { order_id: orderId, node_key: node.node_key, node_name: node.node_name, seq: step.seq, role: step.role, sign_dept: step.dept };
  });
}

/** 某流转 action 需要哪个会签闸口全通过（无闸口 → null）；设计 §8：非系统自动推进，全通过才允许对应流转 */
function gateForAction(action) {
  if (action === 'SIGN_OK') return 'APPLY_SIGN';
  if (action === 'DISPOSAL_OK') return 'DISPOSAL_SIGN';
  return null;
}

/** 闸口是否全部通过：所有预期 seq 均 AGREE（或 ADMIN 强制 SKIP）；缺任一 seq 或未签 → 未通过 */
function isGatePassed(signs, nodeKey) {
  const node = findSignNode(nodeKey);
  if (!node) return false;
  const list = (signs || []).filter(function (s) { return s.node_key === nodeKey; });
  if (list.length < node.steps.length) return false;
  return list.every(function (s) { return s.decision === 'AGREE' || s.decision === 'SKIP'; });
}

/** 当前待签 seq：顺序会签，取最低未生效（非 AGREE/SKIP）的 seq；全部通过 → null */
function currentSignSeq(node, signs) {
  for (let i = 0; i < node.steps.length; i++) {
    const step = node.steps[i];
    const s = (signs || []).find(function (x) { return x.node_key === node.node_key && x.seq === step.seq; });
    if (!s || (s.decision !== 'AGREE' && s.decision !== 'SKIP')) return step.seq;
  }
  return null;
}

/**
 * 会签目标解析：顺序会签，仅允许签署「当前待签 seq」。
 * 返回 { seq, step } 成功，或 { code, error } 失败（设计 §12：非当前 seq → 400，角色不符 → 403）。
 * @param {Object} node 会签节点模板
 * @param {Array} signs 已有会签记录
 * @param {Object} u 当前用户
 * @param {number|null} requestedSeq 客户端指定 seq（可选）
 */
function resolveSignTarget(node, signs, u, requestedSeq) {
  if (!node) return { code: 400, error: '会签节点不存在' };
  // C2 并行会签（2026-09-03）：任一未签步骤即可签，不再强制顺序
  // 2026-09-04 收紧：会签按部门区分（role+dept 双匹配）——同角色不同部门（如 CUSTODY 的
  // 生管/制造部/仓库）互相代签属越权；ADMIN 兜底不受限。deptEquals 处理模板短名↔users 全名
  var signed = {}; (signs || []).forEach(function (s) { if (s.node_key === node.node_key && (s.decision === 'AGREE' || s.decision === 'SKIP')) signed[s.seq] = true; });
  var allSigned = node.steps.every(function (s) { return signed[s.seq]; });
  if (allSigned) return { code: 400, error: '该节点会签已完成' };
  var available = node.steps.filter(function (s) {
    if (signed[s.seq]) return false;
    if (u.role === 'ADMIN') return true;
    return s.role === u.role && deptEquals(s.dept, u.dept);
  });
  if (available.length === 0) {
    var waiting = node.steps.filter(function (s) { return !signed[s.seq]; });
    if (waiting.some(function (s) { return s.role === u.role; })) {
      // 角色有份但部门不符：明确提示越权代签
      return { code: 403, error: '会签按部门执行：该步待 ' + waiting.map(function (s) { return s.dept; }).join('/') + ' 签核' };
    }
    return { code: 403, error: '当前节点待 ' + waiting.map(function (s) { return s.role; }).join('/') + ' 会签' };
  }
  var target = available[0];
  if (requestedSeq != null) {
    var specific = available.find(function (s) { return s.seq === Number(requestedSeq); });
    if (specific) target = specific;
  }
  return { seq: target.seq, step: target };
}

/** REJECT 回退目标：node_key → {from,to}；设计 §8：闸口①退回 SIGNING→DRAFT，闸口②退回 DISPOSAL_SIGNING→NCR_DONE */
function rejectTargetOf(nodeKey) {
  if (nodeKey === 'APPLY_SIGN') return { from: 'SIGNING', to: 'DRAFT' };
  if (nodeKey === 'DISPOSAL_SIGN') return { from: 'DISPOSAL_SIGNING', to: 'NCR_DONE' };
  return null;
}

/** 报工结余：remain = qty - good - ng - scrap */
function computeRemain(qty, good, ng, scrap) { return calcReworkRemain(qty, good, ng, scrap); }

/** 由 action + curStatus 推导目标状态（manifest.transitions 声明式）；找不到 → null */
function targetOf(action, from) {
  return (MANIFEST.stateMachine.transitions || []).find(function (t) { return t.action === action && t.from === from; }) || null;
}

module.exports = {
  getStateMachine, statusLabel, statusBadge, findSignNode, buildSignTemplate,
  gateForAction, isGatePassed, currentSignSeq, resolveSignTarget, rejectTargetOf,
  computeRemain, targetOf, deriveProgress
};
