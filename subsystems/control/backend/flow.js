// subsystems/control/backend/flow.js — 管制流程派生纯逻辑模块（无副作用、无 DB 依赖）
// 权威依据：docs/superpowers/specs/2026-08-24-control-flow-design.md
//   §5.2 进度派生表（11 步由 status + 子表/字段存在性实时派生，不落库）
//   §6   报工结余 remain_qty = qty - good_qty - ng_qty - scrap_qty
//   §8   2 个会签闸口（APPLY_SIGN 品保→研发→生管→生产→仓库 / DISPOSAL_SIGN 品保+研发）
// 与 subsystems/control/frontend/js/progress.js 保持单一来源同步（AGENTS.md §16 风险提示）

// 单一事实来源 = data/control-flow.json（§5.1 阶段映射 / §5.2 步定义 / §8 会签模板）。
// 后端 require 与前端 build-bundles 注入的 CONTROL_FLOW 同源，避免两处漂移（AGENTS.md §16）。
// 状态机顺序（对应 manifest.stateMachine.states 线性阶段；RETIRED 为终态不计入进度）
const FLOW = require('../../../data/control-flow.json');
const STATUS_ORDER = FLOW.statusOrder;
const STATUS_IDX = {};
STATUS_ORDER.forEach((s, i) => { STATUS_IDX[s] = i + 1; });

// 状态 → 阶段归属（§7.1；RETIRED/未知无阶段 → 0）
const STAGE_OF_STATUS = FLOW.stageOfStatus;

// 会签节点模板（§8）：2 个关键闸口，会签单位顺序硬编码（不引入可配置引擎，见非目标）
const SIGN_NODES = FLOW.signNodes;

// 11 步定义（§5.2），每步归属阶段（§5.1）
const STEP_DEFS = FLOW.stepDefs;

// 5 阶段定义（§5.1）
const STAGE_DEFS = FLOW.stageDefs;

// 会签步骤短名部门 → 用户表部门全名 归一（2026-09-04 会签按部门区分）：
// 模板 step.dept 为短名（品保/研发/生管/仓库），users.dept 为全名（品保文管中心/研发部/生管部/资材部）。
// 未配置别名的部门名原样返回（含制造部等全名直接配置的步骤），向前兼容。
function normalizeDept(d) {
  const m = FLOW.deptAliases || {};
  return m[d] || [d];
}

/** 部门等价判定：任一别名命中即等价（双向：短名↔全名均先展开再比较） */
function deptEquals(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const na = normalizeDept(a), nb = normalizeDept(b);
  return na.some(function (x) { return nb.indexOf(x) !== -1; });
}

// 部门门槛策略（2026-09-04 下沉授权层，单一来源 = control-flow.json flowPolicy）：
// CUSTODY（仓口角色）执行列出的动作时用户部门须命中（deptEquals 别名等价）；
// ME/QA/RD/ADMIN 不受限（跨部门协作与兜底），待办投递与前端按钮同源引用本表。
const FLOW_POLICY = FLOW.flowPolicy || {};

/**
 * 部门门槛判定（提交②）：CUSTODY 角色且动作配置了部门门槛时校验用户部门；
 * 命中任一角色即过角色关（多角色架构：u.roles 并集）；CUSTODY 命中后再过部门关。
 * @param {object} u   当前用户（u.dept + u.roles[]/u.role）
 * @param {string} action 流转动作（STORE/REPORT/IN_STOCK/SHIP）
 * @returns {boolean} true=允许
 */
function deptGateAllowed(u, action) {
  const gate = FLOW_POLICY[action];
  if (!gate) return true; // 未配置门槛的动作不受限
  const roles = (u && (u.roles || (u.role ? [u.role] : []))) || [];
  if (!roles.some(function (r) { return r !== 'CUSTODY'; })) {
    // 纯仓口角色（无 ME/QA/ADMIN 等其他角色）：必须部门命中
    return roles.some(function (r) { return r === 'CUSTODY'; }) && !!u.dept &&
      (gate || []).some(function (g) { return deptEquals(u.dept, g); });
  }
  return true; // 兼任非仓口角色（ME/QA/ADMIN 等）→ 不受限
}

/**
 * 获取状态所属阶段（§7.1）。
 * @param {string} status 状态机状态
 * @returns {number} 阶段 1~5；RETIRED/未知状态返回 0（无阶段）
 */
function getStageOf(status) {
  return STAGE_OF_STATUS[status] || 0;
}

// 状态是否已达某阈值状态（按 STATUS_ORDER 线性进度，排除 RETIRED）
function statusAtLeast(status, min) {
  const idx = STATUS_IDX[status];
  return !!idx && idx >= STATUS_IDX[min];
}

// 某会签节点是否全部 AGREE：须所有预期 seq 均 AGREE，缺任一 seq 视为未通过
function isSignPassed(signs, nodeKey) {
  const node = SIGN_NODES.find((n) => n.node_key === nodeKey);
  if (!node) return false;
  const list = (signs || []).filter((s) => s.node_key === nodeKey);
  if (list.length < node.steps.length) return false;
  return list.every((s) => s.decision === 'AGREE');
}

// 单步是否完成（§5.2 派生依据）：status/子表/字段存在性实时计算
function stepDone(order, bonus, key) {
  switch (key) {
    case 'apply': return !!STATUS_IDX[order.status];
    case 'sign1': return isSignPassed(bonus.signs, 'APPLY_SIGN');
    case 'label': return !!order.label_no;
    case 'store': return !!order.storage_location;
    case 'ncr': return !!(bonus.ncrLogs && bonus.ncrLogs.length);
    case 'sign2': return isSignPassed(bonus.signs, 'DISPOSAL_SIGN');
    case 'rework_open': return !!order.rework_no;
    case 'schedule': return !!order.rework_sop && statusAtLeast(order.status, 'REWORKING');
    case 'report': return !!(bonus.reworkLogs && bonus.reworkLogs.length);
    case 'in_stock': return statusAtLeast(order.status, 'REIN_STOCK') || !!order.in_stock_at;
    case 'ship': return order.status === 'SHIPPED';
    default: return false;
  }
}

/**
 * 报工结余（§6）：remain = qty - good - ng - scrap。
 * @param {number} qty 申请/不良数量
 * @param {number} good 良品数
 * @param {number} ng 不良品数
 * @param {number} scrap 报废数
 * @returns {number} 结余（允许负数，由调用方按业务约束处理）
 */
function calcReworkRemain(qty, good, ng, scrap) {
  const q = Number(qty) || 0;
  const g = Number(good) || 0;
  const n = Number(ng) || 0;
  const s = Number(scrap) || 0;
  return q - g - n - s;
}

/**
 * 派生 11 步 + 5 阶段完成状态（§5.2，运行时计算、不落库）。
 * @param {Object} order control_orders 行（含 label_no/storage_location/rework_no/rework_sop/status 等）
 * @param {Object} bonus 子表数据 { signs: [], ncrLogs: [], reworkLogs: [] }
 * @returns {{steps:Array<{seq,key,label,stage,done,current}>, stages:Array<{stage,key,name,steps,stepCount,doneCount,done,current}>, currentStage:number, allDone:boolean}}
 */
function deriveProgress(order, bonus) {
  order = order || {};
  const b = {
    signs: (bonus && bonus.signs) || [],
    ncrLogs: (bonus && bonus.ncrLogs) || [],
    reworkLogs: (bonus && bonus.reworkLogs) || []
  };
  const steps = STEP_DEFS.map((def) => {
    return { seq: def.seq, key: def.key, label: def.label, stage: def.stage, done: stepDone(order, b, def.key), current: false };
  });
  // 当前步 = 第一个未完成步；全部完成则无当前步
  let curSeq = 0;
  for (const st of steps) { if (!st.done) { curSeq = st.seq; break; } }
  steps.forEach((st) => { st.current = st.seq === curSeq; });
  const allDone = curSeq === 0;

  const stages = STAGE_DEFS.map((def) => {
    const sts = steps.filter((s) => s.stage === def.stage);
    const doneCount = sts.filter((s) => s.done).length;
    const done = doneCount === sts.length;
    return {
      stage: def.stage, key: def.key, name: def.name, dept: def.dept || [],
      steps: sts.map((s) => s.seq), stepCount: sts.length,
      doneCount, done, current: sts.some((s) => s.current)
    };
  });

  return { steps, stages, currentStage: getStageOf(order.status), allDone };
}

module.exports = { SIGN_NODES, deriveProgress, calcReworkRemain, getStageOf, normalizeDept, deptEquals, deptGateAllowed };
