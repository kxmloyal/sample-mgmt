// subsystems/control/frontend/js/progress.js — 管制详情页进度可视化
// 由详情聚合响应 agg = GET /api/control/orders/:id 会话 { order, signs, ncrLogs, reworkLogs }
// 派生 11 步进度条 + 5 阶段卡。与 backend/flow.js 的 deriveProgress 保持单一来源同步（AGENTS.md §16 风险提示）。
// 暴露（浏览器全局）：controlDeriveProgress / controlRenderProgress / controlRenderStageCards / controlCalcRemain

// 单一事实来源 = data/control-flow.json（§5.1 阶段映射 / §5.2 步定义 / §8 会签模板）。
// 由 tools/build-bundles.js 注入全局 var CONTROL_FLOW，与后端 flow.js 的 require 同源，避免两处漂移。
// 兜底空对象仅防未构建时 ReferenceError，业务数据以 JSON 为准。
const CF = (typeof CONTROL_FLOW !== 'undefined' && CONTROL_FLOW) || { statusOrder: [], stageOfStatus: {}, signNodes: [], stepDefs: [], stageDefs: [] };
const CONTROL_STATUS_ORDER = CF.statusOrder;
const CONTROL_STATUS_IDX = {};
CONTROL_STATUS_ORDER.forEach(function (s, i) { CONTROL_STATUS_IDX[s] = i + 1; });

const CONTROL_STAGE_OF_STATUS = CF.stageOfStatus;

const CONTROL_SIGN_NODES = CF.signNodes;

const CONTROL_STEP_DEFS = CF.stepDefs;

const CONTROL_STAGE_DEFS = CF.stageDefs;

function controlGetStageOf(status) { return CONTROL_STAGE_OF_STATUS[status] || 0; }

function controlStatusAtLeast(status, min) {
  const idx = CONTROL_STATUS_IDX[status];
  return !!idx && idx >= CONTROL_STATUS_IDX[min];
}

function controlSignPassed(signs, nodeKey) {
  const node = CONTROL_SIGN_NODES.find(function (n) { return n.node_key === nodeKey; });
  if (!node) return false;
  const list = (signs || []).filter(function (s) { return s.node_key === nodeKey; });
  if (list.length < node.steps.length) return false;
  return list.every(function (s) { return s.decision === 'AGREE'; });
}

function controlStepDone(order, bonus, key) {
  switch (key) {
    case 'apply': return !!CONTROL_STATUS_IDX[order.status];
    case 'sign1': return controlSignPassed(bonus.signs, 'APPLY_SIGN');
    case 'label': return !!order.label_no;
    case 'store': return !!order.storage_location;
    case 'ncr': return !!(bonus.ncrLogs && bonus.ncrLogs.length);
    case 'sign2': return controlSignPassed(bonus.signs, 'DISPOSAL_SIGN');
    case 'rework_open': return !!order.rework_no;
    case 'schedule': return !!order.rework_sop && controlStatusAtLeast(order.status, 'REWORKING');
    case 'report': return !!(bonus.reworkLogs && bonus.reworkLogs.length);
    case 'in_stock': return controlStatusAtLeast(order.status, 'REIN_STOCK') || !!order.in_stock_at;
    case 'ship': return order.status === 'SHIPPED';
    default: return false;
  }
}

// 报工结余（§6）：remain = qty - good - ng - scrap
function controlCalcRemain(qty, good, ng, scrap) {
  return (Number(qty) || 0) - (Number(good) || 0) - (Number(ng) || 0) - (Number(scrap) || 0);
}

/**
 * 派生 11 步 + 5 阶段完成状态（§5.2，同 backend/flow.js deriveProgress）。
 * @param {Object} agg 详情聚合 { order, signs, ncrLogs, reworkLogs }
 */
function controlDeriveProgress(agg) {
  const order = (agg && agg.order) || {};
  const b = {
    signs: (agg && agg.signs) || [],
    ncrLogs: (agg && agg.ncrLogs) || [],
    reworkLogs: (agg && agg.reworkLogs) || []
  };
  const steps = CONTROL_STEP_DEFS.map(function (def) {
    return { seq: def.seq, key: def.key, label: def.label, stage: def.stage, done: controlStepDone(order, b, def.key), current: false };
  });
  let curSeq = 0;
  for (let i = 0; i < steps.length; i++) { if (!steps[i].done) { curSeq = steps[i].seq; break; } }
  steps.forEach(function (st) { st.current = st.seq === curSeq; });
  const allDone = curSeq === 0;

  const stages = CONTROL_STAGE_DEFS.map(function (def) {
    const sts = steps.filter(function (s) { return s.stage === def.stage; });
    const doneCount = sts.filter(function (s) { return s.done; }).length;
    return {
      stage: def.stage, key: def.key, name: def.name,
      steps: sts.map(function (s) { return s.seq; }), stepCount: sts.length,
      doneCount, done: doneCount === sts.length, current: sts.some(function (s) { return s.current; })
    };
  });

  return { steps: steps, stages: stages, currentStage: controlGetStageOf(order.status), allDone: allDone };
}

/**
 * 渲染 11 步进度步骤条 HTML。
 * @param {Object} agg 详情聚合
 * @returns {string} <ol class="ctl-progress"> 步骤条
 */
function controlRenderProgress(agg) {
  const d = controlDeriveProgress(agg);
  const items = d.steps.map(function (s) {
    const cls = s.done ? 'ctl-step done' : (s.current ? 'ctl-step current' : 'ctl-step');
    const dot = s.done ? '\u2713' : String(s.seq);
    return '<li class="' + cls + '"><span class="ctl-step-dot">' + dot + '</span><span class="ctl-step-label">' + s.label + '</span></li>';
  }).join('');
  return '<ol class="ctl-progress">' + items + '</ol>';
}

/**
 * 渲染 5 阶段卡 HTML。
 * @param {Object} agg 详情聚合
 * @returns {string} 阶段卡片片段
 */
function controlRenderStageCards(agg) {
  const d = controlDeriveProgress(agg);
  return d.stages.map(function (st) {
    const cls = st.done ? 'ctl-stage done' : (st.current ? 'ctl-stage current' : 'ctl-stage');
    return '<div class="' + cls + '" data-stage="' + st.stage + '">'
      + '<div class="ctl-stage-name">阶段' + st.stage + ' ' + st.name + '</div>'
      + '<div class="ctl-stage-count">' + st.doneCount + '/' + st.stepCount + '</div>'
      + '</div>';
  }).join('');
}
