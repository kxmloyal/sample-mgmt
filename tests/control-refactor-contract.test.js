// tests/control-refactor-contract.test.js — 管制拆分重构结构契约测试（2026-09-08，零 DB 写入）
// 背景：routes-orders.js 与 dao.js 按域拆分（§7.1 容量红线）。本套件验证拆分后对外契约不变：
//   ① DAO 合并导出函数名逐一保留（db.js scanDao 展平调用方零改动）
//   ② 路由薄入口聚合签名不变（register 可调用）
//   ③ manifest 与 flow.js 结构自洽：流转 action 均有 target、退回边已物理删除（与签字 REJECT 闭环一致）
const D = require('../db');
const routesOrders = require('../subsystems/control/backend/routes-orders');
const routesCrud = require('../subsystems/control/backend/routes-orders-crud');
const routesFlow = require('../subsystems/control/backend/routes-orders-flow');
const manifest = require('../subsystems/control/manifest.json');

const REQUIRED_DAO_FNS = [
  'createOrder', 'getOrderById', 'getOrderByNo', 'listOrders', 'countAllOrders', 'updateOrder', 'countOrdersByStatus',
  'addSign', 'listSignsByOrder', 'deleteSignsByOrder', 'listPendingSignRoles', 'listOverdueSigns', 'countOverdueSigns',
  'addNcrLog', 'listNcrLogsByOrder', 'listNcrAgg', 'countNcrAgg',
  'addReworkLog', 'listReworkLogsByOrder',
  'addControlLog', 'listLogsByOrder', 'listLogsAll', 'countLogsAll',
  'getControlSetting', 'setControlSetting',
  'ctlListOrderFiles', 'ctlGetOrderFile', 'ctlAddOrderFile', 'ctlDeleteOrderFile', 'getControlUploadDir'
];

describe('管制拆分重构契约（零 DB 写入）', () => {
  it('DAO 拆分后合并导出函数名逐一保留', () => {
    REQUIRED_DAO_FNS.forEach(fn => expect(typeof D[fn]).toBe('function'));
  });

  it('路由薄入口与两个域模块均导出 register 函数', () => {
    expect(typeof routesOrders.register).toBe('function');
    expect(typeof routesCrud.register).toBe('function');
    expect(typeof routesFlow.register).toBe('function');
  });

  it('manifest 已移除「单据详情」导航项（详情不占侧边栏，深链保留）', () => {
    const keys = (manifest.navigation || []).map(n => n.key);
    expect(keys).not.toContain('detail');
    expect(keys).toContain('orders');
  });

  it('manifest 已物理删除会签退回旁路边（退回唯一入口 = 签字 REJECT）', () => {
    const actions = (manifest.stateMachine.transitions || []).map(t => t.action);
    expect(actions).not.toContain('SIGN_REJECT');
    expect(actions).not.toContain('DISPOSAL_REJECT');
    // 正向流转边完整
    ['SUBMIT', 'SIGN_OK', 'STORE', 'CREATE_NCR', 'DISPATCH', 'DISPOSAL_OK', 'START', 'REPORT', 'IN_STOCK', 'SHIP'].forEach(a => expect(actions).toContain(a));
  });

  it('后端 flow-ops targetOf 对 manifest 每条正向边均可解析（状态机自洽）', () => {
    const { targetOf } = require('../subsystems/control/backend/flow-ops');
    (manifest.stateMachine.transitions || []).forEach(t => {
      expect(targetOf(t.action, t.from)).not.toBeNull();
    });
  });
});
