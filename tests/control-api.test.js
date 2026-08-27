// tests/control-api.test.js — 管制流程 API 集成测试（supertest in-process app）
// 覆盖：全链路 创建→会签→贴标→入仓→NCR→处理会签→重工→入库→出货；会签顺序/角色保护；
//       闸口未全通过拦截；REJECT 回退；NCR 追加；报工结余；CSV 导出；标签 HTML；作废。
// 依赖 MariaDB（tests/helpers/setup.js 启动 server.js 建池）；control deployed:false → 允许造数。
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');

// 管制子系统已上线（manifest deployed:true）：按 AGENTS.md §20 保护规则跳过全部测试（禁止数据注入）
if (isDeployed('control')) {
  describe.skip('管制子系统已上线（deployed:true）', () => { it('按 AGENTS.md §20 保护规则跳过全部测试', () => {}); });
} else {

let aAdmin, aRd, aQa, aMfg, aMe;

beforeAll(async () => {
  await getApp();
  aAdmin = (await login('admin', 'admin123')).agent;
  aRd = (await login('rd01', 'rd123')).agent;
  aQa = (await login('qa01', 'qa123')).agent;
  aMfg = (await login('mfg01', 'mfg123')).agent;
  aMe = (await login('me01', 'me123')).agent;
}, 30000);

// 全链路涉及多次 DB 读写往返，默认 5s 易超时；本文件统一放宽到 30s
jest.setTimeout(30000);

async function createOrder(agent, payload) {
  const res = await agent.post('/api/control/orders').send(Object.assign({
    part_no: 'CTL-TEST-001', part_name: '测试管制件', qty: 100,
    bad_type: '外观', reason: '测试管制原因', sales_no: 'SO-TEST-001', model: 'M10'
  }, payload));
  return res;
}

async function sign(agent, id, node, decision, comment) {
  return agent.post('/api/control/orders/' + id + '/sign').send({ node_key: node, decision: decision, comment: comment });
}

async function transition(agent, id, action, body) {
  return agent.post('/api/control/orders/' + id + '/transition').send(Object.assign({ action: action }, body));
}

// 闸口① APPLY_SIGN 顺序 5 步全 AGREE（品保→研发→生管→生产→仓库）
async function signApplyAll(id) {
  await sign(aQa, id, 'APPLY_SIGN', 'AGREE', '同意');
  await sign(aRd, id, 'APPLY_SIGN', 'AGREE', '同意');
  await sign(aMe, id, 'APPLY_SIGN', 'AGREE', '同意');
  await sign(aMe, id, 'APPLY_SIGN', 'AGREE', '同意');
  await sign(aMfg, id, 'APPLY_SIGN', 'AGREE', '同意');
}

// 闸口② DISPOSAL_SIGN 顺序 2 步全 AGREE（品保→研发）
async function signDisposalAll(id) {
  await sign(aQa, id, 'DISPOSAL_SIGN', 'AGREE', '同意');
  await sign(aRd, id, 'DISPOSAL_SIGN', 'AGREE', '同意');
}

describe('管制全链路：创建 → 会签 → 贴标 → 入仓 → NCR → 处理会签 → 重工 → 入库 → 出货', () => {
  it('完整流转到 SHIPPED，各状态/字段/进度/留痕正确', async () => {
    const create = await createOrder(aMfg);
    expect(create.status).toBe(200);
    const order = create.body;
    expect(order.order_no).toMatch(/^CTL\d{6}\d{3,}$/);
    expect(order.status).toBe('DRAFT');
    expect(order.remain_qty).toBe(100);

    // 1) 提交会签 → SIGNING
    const rSub = await transition(aMfg, order.id, 'SUBMIT', {});
    expect(rSub.status).toBe(200);
    expect(rSub.body.to).toBe('SIGNING');

    // 2) 闸口① 5 步会签
    await signApplyAll(order.id);

    // 3) 闸口① 通过 → LABELED（生成管制标签号）
    const rOk = await transition(aQa, order.id, 'SIGN_OK', {});
    expect(rOk.status).toBe(200);
    expect(rOk.body.to).toBe('LABELED');
    expect(rOk.body.order.label_no).toBe('LB-' + order.order_no);

    // 4) 入管制仓 → CONTROL_STORED
    const rStore = await transition(aMfg, order.id, 'STORE', { storage_location: 'A-01-05' });
    expect(rStore.status).toBe(200);
    expect(rStore.body.to).toBe('CONTROL_STORED');
    expect(rStore.body.order.storage_location).toBe('A-01-05');

    // 5) 追加不良品委托单（子表 + 摘要）
    const rNcr = await aQa.post('/api/control/orders/' + order.id + '/ncr')
      .send({ inspect_dept: '品保', handle_dept: '生技' });
    expect(rNcr.status).toBe(200);
    expect(rNcr.body.ncr_no).toBe('NCR-' + order.order_no);
    // 开单流转 → NCR_DONE
    const rCn = await transition(aQa, order.id, 'CREATE_NCR', {});
    expect(rCn.status).toBe(200);
    expect(rCn.body.to).toBe('NCR_DONE');

    // 6) 发起处理方式会签 → DISPOSAL_SIGNING（初始化闸口②模板）
    const rDisp = await transition(aQa, order.id, 'DISPATCH', {});
    expect(rDisp.status).toBe(200);
    expect(rDisp.body.to).toBe('DISPOSAL_SIGNING');

    // 7) 闸口② 2 步会签
    await signDisposalAll(order.id);

    // 8) 闸口② 通过 → REWORK_OPENED（记录处理方式）
    const rDok = await transition(aQa, order.id, 'DISPOSAL_OK', { disposal_opinion: '重工处理' });
    expect(rDok.status).toBe(200);
    expect(rDok.body.to).toBe('REWORK_OPENED');
    expect(rDok.body.order.disposal_opinion).toBe('重工处理');

    // 9) 生产确认开工 → REWORKING（设置重工单号 + SOP）
    const rStart = await transition(aMe, order.id, 'START', { rework_no: 'RW-TEST-001', rework_sop: '重工SOP-V1' });
    expect(rStart.status).toBe(200);
    expect(rStart.body.to).toBe('REWORKING');
    expect(rStart.body.order.rework_no).toBe('RW-TEST-001');

    // 10) 报工记录数量（结余自动算：100-60-30-5=5）
    const rRep = await aMfg.post('/api/control/orders/' + order.id + '/rework-log')
      .send({ good_qty: 60, ng_qty: 30, scrap_qty: 5, scrap_reason: '不良报废', work_date: '2026-08-25' });
    expect(rRep.status).toBe(200);
    expect(rRep.body.good_qty).toBe(60);
    expect(rRep.body.ng_qty).toBe(30);
    expect(rRep.body.scrap_qty).toBe(5);
    expect(rRep.body.remain_qty).toBe(5);
    // 报工推进状态 → REWORK_REPORTED
    const rReport = await transition(aMfg, order.id, 'REPORT', {});
    expect(rReport.status).toBe(200);
    expect(rReport.body.to).toBe('REWORK_REPORTED');

    // 11) 入库 → REIN_STOCK；出货 → SHIPPED
    const rIn = await transition(aMfg, order.id, 'IN_STOCK', {});
    expect(rIn.status).toBe(200);
    expect(rIn.body.to).toBe('REIN_STOCK');
    const rShip = await transition(aMfg, order.id, 'SHIP', {});
    expect(rShip.status).toBe(200);
    expect(rShip.body.to).toBe('SHIPPED');

    // 12) 详情聚合：进度全部完成 + 会签/委托单/报工/留痕齐全
    const rDetail = await aMfg.get('/api/control/orders/' + order.id);
    expect(rDetail.status).toBe(200);
    expect(rDetail.body.status).toBe('SHIPPED');
    expect(rDetail.body.signs).toHaveLength(7); // 5(闸口①) + 2(闸口②)
    expect(rDetail.body.signs.every(function (s) { return s.decision === 'AGREE'; })).toBe(true);
    expect(rDetail.body.ncrLogs.length).toBe(1);
    expect(rDetail.body.reworkLogs).toHaveLength(1);
    expect(rDetail.body.logs.some(function (l) { return l.action === 'SHIP'; })).toBe(true);
  }, 30000);
});

describe('会签顺序/角色保护（§12）', () => {
  it('未提交会签即签字 → 400 当前状态不可会签', async () => {
    const r = await createOrder(aMfg);
    expect(r.status).toBe(200);
    const rs = await sign(aQa, r.body.id, 'APPLY_SIGN', 'AGREE');
    expect(rs.status).toBe(400);
  });

  it('乱序签字（RD 先于 QA 签闸口①）→ 403 当前节点待 QA', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    const rs = await sign(aRd, r.body.id, 'APPLY_SIGN', 'AGREE');
    expect(rs.status).toBe(403);
  });

  it('闸口①仅部分通过即触发 SIGN_OK → 400 会签未完成', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await sign(aQa, r.body.id, 'APPLY_SIGN', 'AGREE'); // 仅第 1 步
    const rs = await transition(aQa, r.body.id, 'SIGN_OK', {});
    expect(rs.status).toBe(400);
    expect(rs.body.error).toBe('该节点会签未完成');
  });

  it('非法会签决定 → 400', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    const rs = await sign(aQa, r.body.id, 'APPLY_SIGN', 'APPROVE');
    expect(rs.status).toBe(400);
  });

  it('非 ADMIN 强制 SKIP → 403', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    const rs = await sign(aQa, r.body.id, 'APPLY_SIGN', 'SKIP');
    expect(rs.status).toBe(403);
  });
});

describe('会签 REJECT 回退（§8）', () => {
  it('闸口① REJECT → SIGNING→DRAFT', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    const rs = await sign(aQa, r.body.id, 'APPLY_SIGN', 'REJECT', '资料不全退回');
    expect(rs.status).toBe(200);
    expect(rs.body.order.status).toBe('DRAFT');
  });

  it('闸口② REJECT → DISPOSAL_SIGNING→NCR_DONE', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await signApplyAll(r.body.id);
    await transition(aQa, r.body.id, 'SIGN_OK', {});
    await transition(aMfg, r.body.id, 'STORE', { storage_location: 'B-02' });
    await aQa.post('/api/control/orders/' + r.body.id + '/ncr').send({ inspect_dept: '品保', handle_dept: '生技' });
    await transition(aQa, r.body.id, 'CREATE_NCR', {});
    await transition(aQa, r.body.id, 'DISPATCH', {});
    const rs = await sign(aQa, r.body.id, 'DISPOSAL_SIGN', 'REJECT', '处理方式需再议');
    expect(rs.status).toBe(200);
    expect(rs.body.order.status).toBe('NCR_DONE');
  });
});

describe('NCR 追加与门槛（§6.3）', () => {
  it('草稿态追加委托单 → 409 未进入管制阶段', async () => {
    const r = await createOrder(aMfg);
    const rs = await aQa.post('/api/control/orders/' + r.body.id + '/ncr')
      .send({ inspect_dept: '品保', handle_dept: '生技' });
    expect(rs.status).toBe(409);
  });

  it('缺检验/处理部门 → 400', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await signApplyAll(r.body.id);
    await transition(aQa, r.body.id, 'SIGN_OK', {});
    await transition(aMfg, r.body.id, 'STORE', { storage_location: 'B-02' });
    const rs = await aQa.post('/api/control/orders/' + r.body.id + '/ncr').send({ inspect_dept: '品保' });
    expect(rs.status).toBe(400);
  });

  it('非 QA/ADMIN 追加委托单 → 403', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await signApplyAll(r.body.id);
    await transition(aQa, r.body.id, 'SIGN_OK', {});
    await transition(aMfg, r.body.id, 'STORE', { storage_location: 'B-02' });
    const rs = await aMfg.post('/api/control/orders/' + r.body.id + '/ncr')
      .send({ inspect_dept: '品保', handle_dept: '生技' });
    expect(rs.status).toBe(403);
  });
});

describe('报工结余（§6）', () => {
  it('结余分多次报工累加并自动重算', async () => {
    const r = await createOrder(aMfg, { qty: 100 });
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await signApplyAll(r.body.id);
    await transition(aQa, r.body.id, 'SIGN_OK', {});
    await transition(aMfg, r.body.id, 'STORE', { storage_location: 'C-01' });
    await aQa.post('/api/control/orders/' + r.body.id + '/ncr').send({ inspect_dept: '品保', handle_dept: '生技' });
    await transition(aQa, r.body.id, 'CREATE_NCR', {});
    await transition(aQa, r.body.id, 'DISPATCH', {});
    await signDisposalAll(r.body.id);
    await transition(aQa, r.body.id, 'DISPOSAL_OK', {});
    await transition(aMe, r.body.id, 'START', { rework_no: 'RW-TEST-002', rework_sop: 'SOP' });
    const r1 = await aMfg.post('/api/control/orders/' + r.body.id + '/rework-log')
      .send({ good_qty: 50, ng_qty: 20, scrap_qty: 0 });
    expect(r1.body.remain_qty).toBe(30); // 100-50-20
    const r2 = await aMfg.post('/api/control/orders/' + r.body.id + '/rework-log')
      .send({ good_qty: 10, ng_qty: 5, scrap_qty: 5 });
    expect(r2.body.good_qty).toBe(60);
    expect(r2.body.ng_qty).toBe(25);
    expect(r2.body.scrap_qty).toBe(5);
    expect(r2.body.remain_qty).toBe(10); // 100-60-25-5
  });

  it('报工数量全为 0 → 400', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await signApplyAll(r.body.id);
    await transition(aQa, r.body.id, 'SIGN_OK', {});
    await transition(aMfg, r.body.id, 'STORE', { storage_location: 'C-02' });
    await aQa.post('/api/control/orders/' + r.body.id + '/ncr').send({ inspect_dept: '品保', handle_dept: '生技' });
    await transition(aQa, r.body.id, 'CREATE_NCR', {});
    await transition(aQa, r.body.id, 'DISPATCH', {});
    await signDisposalAll(r.body.id);
    await transition(aQa, r.body.id, 'DISPOSAL_OK', {});
    await transition(aMe, r.body.id, 'START', { rework_no: 'RW-TEST-003', rework_sop: 'SOP' });
    const rs = await aMfg.post('/api/control/orders/' + r.body.id + '/rework-log')
      .send({ good_qty: 0, ng_qty: 0, scrap_qty: 0 });
    expect(rs.status).toBe(400);
  });
});

describe('作废（§10.3）', () => {
  it('非 ADMIN 作废 → 403', async () => {
    const r = await createOrder(aMfg);
    const rs = await aMfg.post('/api/control/orders/' + r.body.id + '/void').send({});
    expect(rs.status).toBe(403);
  });

  it('ADMIN 作废 → RETIRED，已作废再作废 → 400', async () => {
    const r = await createOrder(aMfg);
    const rs = await aAdmin.post('/api/control/orders/' + r.body.id + '/void').send({ comment: '取消' });
    expect(rs.status).toBe(200);
    expect(rs.body.status).toBe('RETIRED');
    const r2 = await aAdmin.post('/api/control/orders/' + r.body.id + '/void').send({});
    expect(r2.status).toBe(400);
  });

  it('已出货不可作废 → 400', async () => {
    const r = await createOrder(aMfg);
    await transition(aMfg, r.body.id, 'SUBMIT', {});
    await signApplyAll(r.body.id);
    await transition(aQa, r.body.id, 'SIGN_OK', {});
    await transition(aMfg, r.body.id, 'STORE', { storage_location: 'D-01' });
    await aQa.post('/api/control/orders/' + r.body.id + '/ncr').send({ inspect_dept: '品保', handle_dept: '生技' });
    await transition(aQa, r.body.id, 'CREATE_NCR', {});
    await transition(aQa, r.body.id, 'DISPATCH', {});
    await signDisposalAll(r.body.id);
    await transition(aQa, r.body.id, 'DISPOSAL_OK', {});
    await transition(aMe, r.body.id, 'START', { rework_no: 'RW-TEST-004', rework_sop: 'SOP' });
    await aMfg.post('/api/control/orders/' + r.body.id + '/rework-log').send({ good_qty: 100, ng_qty: 0, scrap_qty: 0 });
    await transition(aMfg, r.body.id, 'REPORT', {});
    await transition(aMfg, r.body.id, 'IN_STOCK', {});
    await transition(aMfg, r.body.id, 'SHIP', {});
    const rs = await aAdmin.post('/api/control/orders/' + r.body.id + '/void').send({});
    expect(rs.status).toBe(400);
  });
});

describe('列表/导出/标签', () => {
  it('列表返回分页结构与总数', async () => {
    const rs = await aMfg.get('/api/control/orders?limit=5&offset=0');
    expect(rs.status).toBe(200);
    expect(Array.isArray(rs.body.orders)).toBe(true);
    expect(rs.body.orders.length).toBeLessThanOrEqual(5);
    expect(typeof rs.body.total).toBe('number');
  });

  it('导出 CSV：BOM UTF-8 头 + 数据列', async () => {
    const rs = await aMfg.get('/api/control/orders/export');
    expect(rs.status).toBe(200);
    expect(rs.headers['content-type']).toMatch(/text\/csv/);
    const text = rs.text;
    expect(text.charCodeAt(0)).toBe(0xFEFF); // BOM
    expect(text).toContain('管制单号');
    expect(text).toContain('状态');
  });

  it('标签 HTML 含管制信息，登录即可访问', async () => {
    const r = await createOrder(aMfg, { part_no: 'CTL-LABEL-01' });
    const rs = await aMfg.get('/api/control/orders/' + r.body.id + '/label');
    expect(rs.status).toBe(200);
    expect(rs.headers['content-type']).toMatch(/text\/html/);
    expect(rs.text).toContain('CTL-LABEL-01');
    expect(rs.text).toContain(r.body.order_no);
  });

  it('流转校验：非法 action → 403 当前状态/角色不允许该操作', async () => {
    const r = await createOrder(aMfg);
    const rs = await transition(aMfg, r.body.id, 'NOT_AN_ACTION', {});
    expect(rs.status).toBe(403);
  });

  it('权限校验：更新他人非 ADMIN 草稿 → 403', async () => {
    // aQa 申请（applicant=qa01），非 ADMIN 的 aMe 尝试编辑 → 仅申请人/管理员可编辑
    const r = await createOrder(aQa, { part_no: 'CTL-PERM-01' });
    const rs = await aMe.put('/api/control/orders/' + r.body.id).send({ part_name: '越权改名' });
    expect(rs.status).toBe(403);
  });
});

}
