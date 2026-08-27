// tests/control-flow.test.js — 管制流程派生纯逻辑单测（无 DB、无 deployed 保护）
// 覆盖：SIGN_NODES（§8 会签模板）/ getStageOf（§7.1）/ calcReworkRemain（§6 结余）/ deriveProgress（§5.2 进度派生）
//   + data/control-flow.json 共享配置自洽性（No.5 单一事实来源）
const { SIGN_NODES, deriveProgress, calcReworkRemain, getStageOf } = require('../subsystems/control/backend/flow');
const FLOW_JSON = require('../data/control-flow.json');

// 建会签记录：node 每 seq 一条，decision 缺省空（待签）
function signsFor(nodeKey, decisions) {
  const node = SIGN_NODES.find((n) => n.node_key === nodeKey);
  return node.steps.map((s, i) => ({
    node_key: nodeKey, seq: s.seq, role: s.role, sign_dept: s.dept,
    decision: (decisions && decisions[i]) || ''
  }));
}
const applySigns = (d) => signsFor('APPLY_SIGN', d);
const disposalSigns = (d) => signsFor('DISPOSAL_SIGN', d);

const order = (o) => Object.assign({ status: 'DRAFT' }, o);
const step = (prog, key) => prog.steps.find((s) => s.key === key);
const stage = (prog, n) => prog.stages.find((s) => s.stage === n);

describe('SIGN_NODES 会签模板（§8）', () => {
  it('收敛为 2 个关键闸口', () => {
    expect(SIGN_NODES).toHaveLength(2);
    expect(SIGN_NODES.map((n) => n.node_key)).toEqual(['APPLY_SIGN', 'DISPOSAL_SIGN']);
  });
  it('APPLY_SIGN 顺序 品保→研发→生管→制造部→仓库（5 步）', () => {
    const apply = SIGN_NODES.find((n) => n.node_key === 'APPLY_SIGN');
    expect(apply.trigger_status).toBe('SIGNING');
    expect(apply.steps.map((s) => s.role)).toEqual(['QA', 'RD', 'CUSTODY', 'CUSTODY', 'CUSTODY']);
    expect(apply.steps.map((s) => s.dept)).toEqual(['品保', '研发', '生管', '制造部', '仓库']);
    expect(apply.steps.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5]);
  });
  it('DISPOSAL_SIGN 仅品保+研发（2 步），触发状态 DISPOSAL_SIGNING', () => {
    const dis = SIGN_NODES.find((n) => n.node_key === 'DISPOSAL_SIGN');
    expect(dis.trigger_status).toBe('DISPOSAL_SIGNING');
    expect(dis.steps.map((s) => s.role)).toEqual(['QA', 'RD']);
    expect(dis.steps).toHaveLength(2);
  });
});

describe('getStageOf（§7.1 阶段归属）', () => {
  it('各状态映射到 5 阶段', () => {
    expect(getStageOf('DRAFT')).toBe(1);
    expect(getStageOf('SIGNING')).toBe(1);
    expect(getStageOf('LABELED')).toBe(2);
    expect(getStageOf('CONTROL_STORED')).toBe(2);
    expect(getStageOf('NCR_DONE')).toBe(3);
    expect(getStageOf('DISPOSAL_SIGNING')).toBe(3);
    expect(getStageOf('REWORK_OPENED')).toBe(4);
    expect(getStageOf('REWORKING')).toBe(4);
    expect(getStageOf('REWORK_REPORTED')).toBe(4);
    expect(getStageOf('REIN_STOCK')).toBe(5);
    expect(getStageOf('SHIPPED')).toBe(5);
  });
  it('RETIRED/未知/null 无阶段 → 0', () => {
    expect(getStageOf('RETIRED')).toBe(0);
    expect(getStageOf('WHATEVER')).toBe(0);
    expect(getStageOf(null)).toBe(0);
  });
});

describe('calcReworkRemain（§6 结余 remain=qty-good-ng-scrap）', () => {
  it('标准结余', () => {
    expect(calcReworkRemain(100, 60, 30, 5)).toBe(5);
  });
  it('全部为 0 → 0', () => {
    expect(calcReworkRemain(0, 0, 0, 0)).toBe(0);
  });
  it('字符串数字正常计算', () => {
    expect(calcReworkRemain('100', '60', '30', '5')).toBe(5);
  });
  it('null/undefined 兜底为 0', () => {
    expect(calcReworkRemain(null, null, null, null)).toBe(0);
    expect(calcReworkRemain(10, undefined, undefined, undefined)).toBe(10);
  });
  it('不良/报废超出申请数 → 负数（由调用方约束）', () => {
    expect(calcReworkRemain(10, 6, 3, 2)).toBe(-1);
  });
});

describe('deriveProgress 进度派生（§5.2）', () => {
  it('新建 DRAFT：仅步骤①完成，当前阶段 1，未全部完成', () => {
    const d = deriveProgress(order(), {});
    expect(step(d, 'apply').done).toBe(true);
    expect(step(d, 'sign1').done).toBe(false);
    expect(d.steps.filter((s) => s.done)).toHaveLength(1);
    expect(d.currentStage).toBe(1);
    expect(stage(d, 1).current).toBe(true);
    expect(d.allDone).toBe(false);
  });
  it('闸口① APPLY_SIGN 全部 AGREE → 步骤②完成，阶段1完成', () => {
    const d = deriveProgress(order({ status: 'SIGNING' }), { signs: applySigns(['AGREE', 'AGREE', 'AGREE', 'AGREE', 'AGREE']) });
    expect(step(d, 'sign1').done).toBe(true);
    expect(stage(d, 1).done).toBe(true);
  });
  it('闸口① 部分 AGREE（缺 seq）→ 步骤②未完成', () => {
    const d = deriveProgress(order({ status: 'SIGNING' }), { signs: applySigns(['AGREE', 'AGREE', 'AGREE']) });
    expect(step(d, 'sign1').done).toBe(false);
    expect(stage(d, 1).done).toBe(false);
  });
  it('闸口① 任一 REJECT → 步骤②未完成', () => {
    const d = deriveProgress(order({ status: 'SIGNING' }), { signs: applySigns(['AGREE', 'REJECT', 'AGREE', 'AGREE', 'AGREE']) });
    expect(step(d, 'sign1').done).toBe(false);
  });
  it('贴标 + 入仓 → 步骤③④完成，当前阶段 2', () => {
    const d = deriveProgress(order({ status: 'CONTROL_STORED', label_no: 'CTL-LABEL-1', storage_location: 'A区' }), {});
    expect(step(d, 'label').done).toBe(true);
    expect(step(d, 'store').done).toBe(true);
    expect(stage(d, 2).done).toBe(true);
    expect(d.currentStage).toBe(2);
  });
  it('开 NCR（ncr_logs 有记录）→ 步骤⑤完成', () => {
    const d = deriveProgress(order({ status: 'NCR_DONE' }), { ncrLogs: [{ ncr_no: 'NCR-001' }] });
    expect(step(d, 'ncr').done).toBe(true);
    const d2 = deriveProgress(order({ status: 'NCR_DONE' }), { ncrLogs: [] });
    expect(step(d2, 'ncr').done).toBe(false);
  });
  it('闸口② DISPOSAL_SIGN 全部 AGREE → 步骤⑥完成，阶段3完成', () => {
    const d = deriveProgress(order({ status: 'DISPOSAL_SIGNING' }), {
      ncrLogs: [{ ncr_no: 'NCR-001' }],
      signs: disposalSigns(['AGREE', 'AGREE'])
    });
    expect(step(d, 'sign2').done).toBe(true);
    expect(stage(d, 3).done).toBe(true);
  });
  it('阶段3 仅开 NCR 未处理会签 → 未完成', () => {
    const d = deriveProgress(order({ status: 'NCR_DONE' }), { ncrLogs: [{ ncr_no: 'NCR-001' }] });
    expect(stage(d, 3).done).toBe(false);
  });
  it('报工完成须 rework_no + rework_sop(color)、报工记录齐全且状态推进', () => {
    const d = deriveProgress(order({ status: 'REWORK_REPORTED', rework_no: 'RW-001', rework_sop: 'SOP', good_qty: 60, ng_qty: 30, scrap_qty: 5 }), { reworkLogs: [{ good_qty: 60 }] });
    expect(step(d, 'rework_open').done).toBe(true);
    expect(step(d, 'schedule').done).toBe(true);
    expect(step(d, 'report').done).toBe(true);
    expect(stage(d, 4).done).toBe(true);
  });
  it('仅开重工单未排产报工 → 阶段4未完成', () => {
    const d = deriveProgress(order({ status: 'REWORK_OPENED', rework_no: 'RW-001' }), {});
    expect(step(d, 'rework_open').done).toBe(true);
    expect(step(d, 'schedule').done).toBe(false);
    expect(step(d, 'report').done).toBe(false);
    expect(stage(d, 4).done).toBe(false);
  });
  it('排产需 rework_sop 非空且 status >= REWORKING', () => {
    const d1 = deriveProgress(order({ status: 'REWORK_OPENED', rework_no: 'RW-001', rework_sop: 'SOP' }), {});
    expect(step(d1, 'schedule').done).toBe(false); // status 未达 REWORKING
    const d2 = deriveProgress(order({ status: 'REWORKING', rework_no: 'RW-001', rework_sop: 'SOP' }), {});
    expect(step(d2, 'schedule').done).toBe(true);
  });
  it('入库：status >= REIN_STOCK 或 in_stock_at 有值 → 步骤⑩完成', () => {
    expect(step(deriveProgress(order({ status: 'REIN_STOCK' }), {}), 'in_stock').done).toBe(true);
    const alt = deriveProgress(order({ status: 'REWORK_REPORTED', in_stock_at: '2026-08-24T10:00:00' }), {});
    expect(step(alt, 'in_stock').done).toBe(true);
  });
  it('出货：status = SHIPPED → 步骤⑪完成，全部完成', () => {
    const d = deriveProgress(order({ status: 'SHIPPED', label_no: 'L', storage_location: 'A', rework_no: 'RW', rework_sop: 'S', in_stock_at: 'x' }), {
      signs: applySigns(['AGREE', 'AGREE', 'AGREE', 'AGREE', 'AGREE']).concat(disposalSigns(['AGREE', 'AGREE'])),
      ncrLogs: [{ ncr_no: 'N' }],
      reworkLogs: [{ good_qty: 60 }]
    });
    expect(step(d, 'ship').done).toBe(true);
    expect(d.allDone).toBe(true);
    expect(d.currentStage).toBe(5);
  });
  it('作废 RETIRED：无有效阶段，步骤①不可视为完成', () => {
    const d = deriveProgress(order({ status: 'RETIRED' }), {});
    expect(d.currentStage).toBe(0);
    expect(step(d, 'apply').done).toBe(false);
    expect(d.allDone).toBe(false);
  });
  it('当前步 = 第一个未完成步（DRAFT → 步骤②高亮，阶段1当前）', () => {
    const d = deriveProgress(order(), {});
    expect(step(d, 'sign1').current).toBe(true);
    expect(stage(d, 1).current).toBe(true);
    expect(stage(d, 2).current).toBe(false);
  });
});

describe('data/control-flow.json 共享配置自洽性（No.5 单一事实来源）', () => {
  it('statusOrder 为 11 项且不含 RETIRED（终态不计入进度）', () => {
    expect(FLOW_JSON.statusOrder).toHaveLength(11);
    expect(FLOW_JSON.statusOrder).not.toContain('RETIRED');
  });
  it('stepDefs 11 步，每步 seq/key 唯一且归属 1~5 阶段', () => {
    expect(FLOW_JSON.stepDefs).toHaveLength(11);
    expect(FLOW_JSON.stepDefs.map((s) => s.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(new Set(FLOW_JSON.stepDefs.map((s) => s.key)).size).toBe(11);
    expect(FLOW_JSON.stepDefs.every((s) => s.stage >= 1 && s.stage <= 5)).toBe(true);
  });
  it('stageDefs 为 5 阶段且与 stepDefs 的 stage 集合一致', () => {
    expect(FLOW_JSON.stageDefs).toHaveLength(5);
    const defStages = FLOW_JSON.stageDefs.map((s) => s.stage);
    const stepStages = [...new Set(FLOW_JSON.stepDefs.map((s) => s.stage))].sort();
    expect(defStages).toEqual(stepStages);
  });
  it('stageOfStatus 覆盖 statusOrder 全部状态，阶段值在 1~5', () => {
    ['DRAFT', 'SIGNING', 'LABELED', 'CONTROL_STORED', 'NCR_DONE', 'DISPOSAL_SIGNING', 'REWORK_OPENED', 'REWORKING', 'REWORK_REPORTED', 'REIN_STOCK', 'SHIPPED'].forEach((s) => {
      const st = FLOW_JSON.stageOfStatus[s];
      expect(typeof st).toBe('number');
      expect(st).toBeGreaterThanOrEqual(1);
      expect(st).toBeLessThanOrEqual(5);
    });
    expect(FLOW_JSON.stageOfStatus.RETIRED).toBeUndefined();
  });
  it('signNodes 结构完整：2 节点，steps 均含 seq/role/dept', () => {
    expect(FLOW_JSON.signNodes).toHaveLength(2);
    FLOW_JSON.signNodes.forEach((n) => {
      expect(n.node_key).toBeTruthy();
      expect(n.trigger_status).toBeTruthy();
      expect(typeof n.steps).toBe('object');
      n.steps.forEach((s) => {
        expect(typeof s.seq).toBe('number');
        expect(s.role).toBeTruthy();
        expect(s.dept).toBeTruthy();
      });
    });
  });
  it('后端 flow.js 加载结果与共享 JSON 完全一致（同源）', () => {
    expect(SIGN_NODES).toEqual(FLOW_JSON.signNodes);
    expect(getStageOf('DRAFT')).toBe(FLOW_JSON.stageOfStatus.DRAFT);
    expect(getStageOf('SHIPPED')).toBe(FLOW_JSON.stageOfStatus.SHIPPED);
    // 11 步 key 与 JSON 一致，且 stepDone 步 key 均能在 JSON 中找到定义
    const deriveKeys = deriveProgress(order({}), {}).steps.map((s) => s.key);
    expect(deriveKeys).toEqual(FLOW_JSON.stepDefs.map((s) => s.key));
    expect(deriveKeys).toHaveLength(11);
  });
});

