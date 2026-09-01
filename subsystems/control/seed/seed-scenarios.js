// subsystems/control/seed/seed-scenarios.js — 管制种子：12 个场景生成
// 单一职责：只负责生成覆盖全部状态的 12 张管制单（数据 + 状态流转 + 留痕）。
// 场景逻辑与原 seed.js 内联实现完全一致，仅做文件拆分/函数化拆分，行为不变。
// 依赖的运行上下文（数据库、账号、时间工具、签字/流转 helper）由 seed.js 经 ctx 注入，
// 本文件不读 manifest、不判 deployed 保护（统一由 seed.js 处理）。
// 规范：12 个场景按状态推进拆为 6 个分组函数（每个 ≤60 行），顶层函数 ≤10，
// 同时满足 AGENTS.md §7 单函数行数与顶层函数数红线。
const D = require('../../../db');

// ① 草稿 + 会签中（DRAFT / SIGNING）
async function seedDraftAndSign(ctx) {
  const { makeOrder, advance, signStep, addLogAt, localAgo, me, qa, mfg } = ctx;
  console.log('--- 1. DRAFT 申请草稿 ---');
  const o1 = await makeOrder({
    part_no: 'FAN-1225-A', part_name: '直流风扇·标准型', sales_no: 'SO-202608-001', model: 'SF1225',
    qty: 120, bad_type: '外观不良', reason: '扇叶注塑缩水，外观划伤超标，待管制会签',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 3, '新建管制申请单（待会签）');
  console.log('  ' + o1.order_no + ' 直流风扇·标准型 [DRAFT]');

  console.log('--- 2. SIGNING 管制会签中 ---');
  const o2 = await makeOrder({
    part_no: 'MOTOR-MX1234-B', part_name: '马达总成·不良品', sales_no: 'SO-202608-002', model: 'MX1234',
    qty: 60, bad_type: '性能不良', reason: '转速低于标准下限 8%，管制隔离',
    applicant_id: me.id, applicant_name: me.display_name || me.username, apply_dept: '生技部',
    created_by: me.id, applicant_role: 'ME'
  }, 4, '新建管制申请单（已提交待签）');
  await advance(o2, { status: 'SIGNING' });
  await signStep(o2, 'APPLY_SIGN', 1, qa, 'AGREE', 3); // QA 已签，RD 待签
  await addLogAt({ order_id: o2.id, action: 'SUBMIT', role: 'ME', user_id: me.id, dept: '生技部', comment: '提交会签' }, localAgo(3));
  await addLogAt({ order_id: o2.id, action: 'SIGN_AGREE', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '申请管制会签·品保·通过' }, localAgo(2));
  console.log('  ' + o2.order_no + ' 马达总成·不良品 [SIGNING, QA已签/RD待签]');
}

// ② 贴标 + 入管制仓 + 委托单已开（LABELED / CONTROL_STORED / NCR_DONE）
async function seedLabeledStored(ctx) {
  const { makeOrder, advance, signAll, addLogAt, localAgo, isoAgo, D, mfg, fqc, qa } = ctx;
  console.log('--- 3. LABELED 已贴管制标签 ---');
  const o3 = await makeOrder({
    part_no: 'FAN-9225-C', part_name: '静音风扇·管制批', sales_no: 'SO-202608-003', model: 'SF9225',
    qty: 200, bad_type: '异音', reason: '轴承异音超标，需全检管制',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 10, '新建管制申请单');
  await advance(o3, { status: 'SIGNING' });
  await signAll(o3, 'APPLY_SIGN', 8);
  await addLogAt({ order_id: o3.id, action: 'SUBMIT', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', comment: '提交会签' }, localAgo(9));
  await advance(o3, { status: 'LABELED', label_no: 'LB-' + o3.order_no });
  await addLogAt({ order_id: o3.id, action: 'SIGN_OK', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '闸口①会签通过/贴标' }, localAgo(6));
  console.log('  ' + o3.order_no + ' 静音风扇·管制批 [LABELED, 闸口①已全签]');

  console.log('--- 4. CONTROL_STORED 已入管制仓 ---');
  const o4 = await makeOrder({
    part_no: 'MOTOR-MY1234-D', part_name: '马达总成·管制批', sales_no: 'SO-202608-004', model: 'MY1234',
    qty: 80, bad_type: '绝缘不良', reason: '绕组绝缘电阻偏低，入管制仓隔离',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 12, '新建管制申请单');
  await advance(o4, { status: 'SIGNING' });
  await signAll(o4, 'APPLY_SIGN', 10);
  await advance(o4, { status: 'LABELED', label_no: 'LB-' + o4.order_no });
  await addLogAt({ order_id: o4.id, action: 'SIGN_OK', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '闸口①会签通过/贴标' }, localAgo(9));
  await advance(o4, { status: 'CONTROL_STORED', storage_location: 'D区-2架-1层', stored_at: isoAgo(7) });
  await addLogAt({ order_id: o4.id, action: 'STORE', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', comment: '入管制仓 D区-2架-1层' }, localAgo(7));
  console.log('  ' + o4.order_no + ' 马达总成·管制批 [CONTROL_STORED]');

  console.log('--- 5. NCR_DONE 不良品委托单已开 ---');
  const o5 = await makeOrder({
    part_no: 'FAN-1202-E', part_name: '长寿命风扇·客诉批', sales_no: 'SO-202608-005', model: 'SF1202',
    qty: 150, bad_type: '灵敏度不良', reason: '客户投诉转速漂移，开委托单判定',
    applicant_id: fqc.id, applicant_name: fqc.display_name || fqc.username, apply_dept: 'FQC',
    created_by: fqc.id, applicant_role: 'CUSTODY'
  }, 15, '新建管制申请单（客诉）');
  await advance(o5, { status: 'SIGNING' });
  await signAll(o5, 'APPLY_SIGN', 13);
  await advance(o5, { status: 'LABELED', label_no: 'LB-' + o5.order_no });
  await addLogAt({ order_id: o5.id, action: 'SIGN_OK', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '闸口①会签通过/贴标' }, localAgo(12));
  await advance(o5, { status: 'CONTROL_STORED', storage_location: 'E区-1架-3层', stored_at: isoAgo(10) });
  await addLogAt({ order_id: o5.id, action: 'STORE', role: 'CUSTODY', user_id: fqc.id, dept: 'FQC', comment: '入管制仓 E区-1架-3层' }, localAgo(10));
  await advance(o5, { status: 'NCR_DONE', ncr_no: 'NCR-' + o5.order_no });
  await D.addNcrLog({ order_id: o5.id, ncr_no: 'NCR-' + o5.order_no, inspect_dept: '品保文管中心', handle_dept: '研发部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await addLogAt({ order_id: o5.id, action: 'CREATE_NCR', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '开不良品委托单 NCR-' + o5.order_no }, localAgo(8));
  console.log('  ' + o5.order_no + ' 长寿命风扇·客诉批 [NCR_DONE, 委托单已开]');
}

// ③ 处理方式会签中 + 重工工单已开（DISPOSAL_SIGNING / REWORK_OPENED）
async function seedDisposal(ctx) {
  const { makeOrder, advance, signAll, initSign, addLogAt, localAgo, isoAgo, D, mfg, me, qa } = ctx;
  console.log('--- 6. DISPOSAL_SIGNING 处理方式会签中 ---');
  const o6 = await makeOrder({
    part_no: 'FAN-1225-F', part_name: '散热风扇·再生批', sales_no: 'SO-202608-006', model: 'SF1225',
    qty: 300, bad_type: '尺寸不良', reason: '轮廓尺寸偏大 0.5mm，判定能否返修重工',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 20, '新建管制申请单');
  await advance(o6, { status: 'SIGNING' });
  await signAll(o6, 'APPLY_SIGN', 18);
  await advance(o6, { status: 'LABELED', label_no: 'LB-' + o6.order_no });
  await advance(o6, { status: 'CONTROL_STORED', storage_location: 'A区-5架-2层', stored_at: isoAgo(15) });
  await addLogAt({ order_id: o6.id, action: 'STORE', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', comment: '入管制仓 A区-5架-2层' }, localAgo(15));
  await advance(o6, { status: 'NCR_DONE', ncr_no: 'NCR-' + o6.order_no });
  await D.addNcrLog({ order_id: o6.id, ncr_no: 'NCR-' + o6.order_no, inspect_dept: '品保文管中心', handle_dept: '生技部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await advance(o6, { status: 'DISPOSAL_SIGNING' });
  await initSign(o6, 'DISPOSAL_SIGN'); // 初始化闸口② 模板（QA→RD 待签）
  await addLogAt({ order_id: o6.id, action: 'DISPATCH', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '发起处理方式会签' }, localAgo(12));
  console.log('  ' + o6.order_no + ' 散热风扇·再生批 [DISPOSAL_SIGNING, 闸口②待签]');

  console.log('--- 7. REWORK_OPENED 重工工单已开 ---');
  const o7 = await makeOrder({
    part_no: 'MOTOR-MX1234-G', part_name: '马达总成·返工批', sales_no: 'SO-202608-007', model: 'MX1234',
    qty: 100, bad_type: '性能不良', reason: '转速偏低，判定重工返修',
    applicant_id: me.id, applicant_name: me.display_name || me.username, apply_dept: '生技部',
    created_by: me.id, applicant_role: 'ME'
  }, 25, '新建管制申请单（重工）');
  await advance(o7, { status: 'SIGNING' });
  await signAll(o7, 'APPLY_SIGN', 23);
  await advance(o7, { status: 'LABELED', label_no: 'LB-' + o7.order_no });
  await advance(o7, { status: 'CONTROL_STORED', storage_location: 'B区-3架-1层', stored_at: isoAgo(20) });
  await advance(o7, { status: 'NCR_DONE', ncr_no: 'NCR-' + o7.order_no });
  await D.addNcrLog({ order_id: o7.id, ncr_no: 'NCR-' + o7.order_no, inspect_dept: '品保文管中心', handle_dept: '研发部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await advance(o7, { status: 'DISPOSAL_SIGNING' });
  await initSign(o7, 'DISPOSAL_SIGN');
  await signAll(o7, 'DISPOSAL_SIGN', 16);
  await advance(o7, { status: 'REWORK_OPENED', rework_no: 'RW-202608-007', rework_sop: 'SOP-MX-01：更换转子轴承后复测转速', disposal_opinion: '全面串校转子组件，测试通过后复装' });
  await addLogAt({ order_id: o7.id, action: 'DISPOSAL_OK', role: 'QA', user_id: qa.id, dept: '品保文管中心', comment: '闸口②会签通过/开重工单' }, localAgo(14));
  console.log('  ' + o7.order_no + ' 马达总成·返工批 [REWORK_OPENED, 闸口②已全签]');
}

// ④ 重工执行中 + 已报工（REWORKING / REWORK_REPORTED）
async function seedReworking(ctx) {
  const { makeOrder, advance, signAll, initSign, addLogAt, localAgo, isoAgo, D, mfg, me, qa } = ctx;
  console.log('--- 8. REWORKING 重工执行中 ---');
  const o8 = await makeOrder({
    part_no: 'FAN-9225-H', part_name: '静音风扇·重工批', sales_no: 'SO-202608-008', model: 'SF9225',
    qty: 180, bad_type: '异音', reason: '轴承异音，重工换件',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 30, '新建管制申请单');
  await advance(o8, { status: 'SIGNING' });
  await signAll(o8, 'APPLY_SIGN', 28);
  await advance(o8, { status: 'LABELED', label_no: 'LB-' + o8.order_no });
  await advance(o8, { status: 'CONTROL_STORED', storage_location: 'C区-4架-2层', stored_at: isoAgo(24) });
  await advance(o8, { status: 'NCR_DONE', ncr_no: 'NCR-' + o8.order_no });
  await D.addNcrLog({ order_id: o8.id, ncr_no: 'NCR-' + o8.order_no, inspect_dept: '品保文管中心', handle_dept: '生技部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await advance(o8, { status: 'DISPOSAL_SIGNING' });
  await initSign(o8, 'DISPOSAL_SIGN');
  await signAll(o8, 'DISPOSAL_SIGN', 21);
  await advance(o8, { status: 'REWORK_OPENED', rework_no: 'RW-202608-008', rework_sop: 'SOP-92-02：更换轴承并做静音测试', disposal_opinion: '换新轴承后静音复测' });
  await advance(o8, { status: 'REWORKING' });
  await addLogAt({ order_id: o8.id, action: 'START', role: 'ME', user_id: me.id, dept: '生技部', comment: '生产确认开工' }, localAgo(18));
  console.log('  ' + o8.order_no + ' 静音风扇·重工批 [REWORKING]');

  console.log('--- 9. REWORK_REPORTED 已报工 ---');
  const o9 = await makeOrder({
    part_no: 'FAN-1202-I', part_name: '长寿命风扇·返修批', sales_no: 'SO-202608-009', model: 'SF1202',
    qty: 200, bad_type: '性能不良', reason: '转速漂移，返修后复测',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 35, '新建管制申请单');
  await advance(o9, { status: 'SIGNING' });
  await signAll(o9, 'APPLY_SIGN', 33);
  await advance(o9, { status: 'LABELED', label_no: 'LB-' + o9.order_no });
  await advance(o9, { status: 'CONTROL_STORED', storage_location: 'F区-2架-4层', stored_at: isoAgo(28) });
  await advance(o9, { status: 'NCR_DONE', ncr_no: 'NCR-' + o9.order_no });
  await D.addNcrLog({ order_id: o9.id, ncr_no: 'NCR-' + o9.order_no, inspect_dept: '品保文管中心', handle_dept: '研发部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await advance(o9, { status: 'DISPOSAL_SIGNING' });
  await initSign(o9, 'DISPOSAL_SIGN');
  await signAll(o9, 'DISPOSAL_SIGN', 25);
  await advance(o9, { status: 'REWORK_OPENED', rework_no: 'RW-202608-009', rework_sop: 'SOP-12-03：校准控制板后复测转速', disposal_opinion: '重新校准后复测' });
  await advance(o9, { status: 'REWORKING' });
  await advance(o9, { status: 'REWORK_REPORTED' });
  await D.addReworkLog({ order_id: o9.id, work_date: isoAgo(6), good_qty: 170, ng_qty: 20, scrap_qty: 10, scrap_reason: '轴承损坏不可修', operator_id: mfg.id, operator_name: mfg.display_name || mfg.username });
  await advance(o9, { good_qty: 170, ng_qty: 20, scrap_qty: 10, scrap_note: '轴承损坏不可修' });
  await addLogAt({ order_id: o9.id, action: 'REPORT', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', comment: '报工 良品170 不良20 报废10' }, localAgo(6));
  console.log('  ' + o9.order_no + ' 长寿命风扇·返修批 [REWORK_REPORTED, 结余=' + (await D.getOrderById(o9.id)).remain_qty + ']');
}

// ⑤ 已入库 + 已出货（REIN_STOCK / SHIPPED）
async function seedReinStock(ctx) {
  const { makeOrder, advance, signAll, initSign, addLogAt, localAgo, isoAgo, D, mfg, fqc, qa } = ctx;
  console.log('--- 10. REIN_STOCK 已入库 ---');
  const o10 = await makeOrder({
    part_no: 'MOTOR-MX1234-J', part_name: '马达总成·入库批', sales_no: 'SO-202608-010', model: 'MX1234',
    qty: 120, bad_type: '外观不良', reason: '外壳划伤，重工后复检入库',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 40, '新建管制申请单');
  await advance(o10, { status: 'SIGNING' });
  await signAll(o10, 'APPLY_SIGN', 38);
  await advance(o10, { status: 'LABELED', label_no: 'LB-' + o10.order_no });
  await advance(o10, { status: 'CONTROL_STORED', storage_location: 'G区-1架-2层', stored_at: isoAgo(32) });
  await advance(o10, { status: 'NCR_DONE', ncr_no: 'NCR-' + o10.order_no });
  await D.addNcrLog({ order_id: o10.id, ncr_no: 'NCR-' + o10.order_no, inspect_dept: '品保文管中心', handle_dept: '生技部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await advance(o10, { status: 'DISPOSAL_SIGNING' });
  await initSign(o10, 'DISPOSAL_SIGN');
  await signAll(o10, 'DISPOSAL_SIGN', 30);
  await advance(o10, { status: 'REWORK_OPENED', rework_no: 'RW-202608-010', rework_sop: 'SOP-MX-04：抛光外壳后复检', disposal_opinion: '抛光后复检外观' });
  await advance(o10, { status: 'REWORKING' });
  await advance(o10, { status: 'REWORK_REPORTED' });
  await D.addReworkLog({ order_id: o10.id, work_date: isoAgo(8), good_qty: 110, ng_qty: 5, scrap_qty: 5, scrap_reason: '崩角报废', operator_id: mfg.id, operator_name: mfg.display_name || mfg.username });
  await advance(o10, { good_qty: 110, ng_qty: 5, scrap_qty: 5, scrap_note: '崩角报废' });
  await advance(o10, { status: 'REIN_STOCK', in_stock_at: isoAgo(4) });
  await addLogAt({ order_id: o10.id, action: 'IN_STOCK', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', comment: '入库' }, localAgo(4));
  console.log('  ' + o10.order_no + ' 马达总成·入库批 [REIN_STOCK]');

  console.log('--- 11. SHIPPED 已出货 ---');
  const o11 = await makeOrder({
    part_no: 'FAN-1225-K', part_name: '散热风扇·出货批', sales_no: 'SO-202608-011', model: 'SF1225',
    qty: 500, bad_type: '尺寸不良', reason: '尺寸偏差，重工后复检出货',
    applicant_id: fqc.id, applicant_name: fqc.display_name || fqc.username, apply_dept: 'FQC',
    created_by: fqc.id, applicant_role: 'CUSTODY'
  }, 50, '新建管制申请单（出货）');
  await advance(o11, { status: 'SIGNING' });
  await signAll(o11, 'APPLY_SIGN', 48);
  await advance(o11, { status: 'LABELED', label_no: 'LB-' + o11.order_no });
  await advance(o11, { status: 'CONTROL_STORED', storage_location: 'H区-3架-1层', stored_at: isoAgo(42) });
  await advance(o11, { status: 'NCR_DONE', ncr_no: 'NCR-' + o11.order_no });
  await D.addNcrLog({ order_id: o11.id, ncr_no: 'NCR-' + o11.order_no, inspect_dept: '品保文管中心', handle_dept: '生技部', form_template: 'GYS-Q2-008_01(REV_1)', created_by: qa.id });
  await advance(o11, { status: 'DISPOSAL_SIGNING' });
  await initSign(o11, 'DISPOSAL_SIGN');
  await signAll(o11, 'DISPOSAL_SIGN', 40);
  await advance(o11, { status: 'REWORK_OPENED', rework_no: 'RW-202608-011', rework_sop: 'SOP-12-05：精修外形并复测', disposal_opinion: '精修后复测尺寸' });
  await advance(o11, { status: 'REWORKING' });
  await advance(o11, { status: 'REWORK_REPORTED' });
  await D.addReworkLog({ order_id: o11.id, work_date: isoAgo(14), good_qty: 480, ng_qty: 10, scrap_qty: 10, scrap_reason: '超差报废', operator_id: fqc.id, operator_name: fqc.display_name || fqc.username });
  await advance(o11, { good_qty: 480, ng_qty: 10, scrap_qty: 10, scrap_note: '超差报废' });
  await advance(o11, { status: 'REIN_STOCK', in_stock_at: isoAgo(10) });
  await advance(o11, { status: 'SHIPPED' });
  await addLogAt({ order_id: o11.id, action: 'SHIP', role: 'CUSTODY', user_id: fqc.id, dept: 'FQC', comment: '出货' }, localAgo(8));
  console.log('  ' + o11.order_no + ' 散热风扇·出货批 [SHIPPED 终态]');
}

// ⑥ 已作废（RETIRED）
async function seedRetired(ctx) {
  const { makeOrder, advance, addLogAt, localAgo, admin, mfg } = ctx;
  console.log('--- 12. RETIRED 已作废 ---');
  const o12 = await makeOrder({
    part_no: 'FAN-9225-L', part_name: '静音风扇·作废批', sales_no: 'SO-202608-012', model: 'SF9225',
    qty: 50, bad_type: '其他', reason: '客户取消订单，申请作废',
    applicant_id: mfg.id, applicant_name: mfg.display_name || mfg.username, apply_dept: '制造部',
    created_by: mfg.id, applicant_role: 'CUSTODY'
  }, 18, '新建管制申请单（待作废）');
  await advance(o12, { status: 'RETIRED' });
  await addLogAt({ order_id: o12.id, action: 'VOID', role: 'ADMIN', user_id: admin.id, dept: '系统', comment: '客户取消订单，管理员作废' }, localAgo(15));
  console.log('  ' + o12.order_no + ' 静音风扇·作废批 [RETIRED]');
}

/**
 * 运行全部 12 个场景（顺序调用 6 个分组函数）。
 * @param {object} ctx - 运行上下文（由 seed.js 注入 D/isoAgo/localAgo/makeOrder/advance/signAll/signStep/initSign/addLogAt/账号）
 * @returns {Promise<void>}
 */
async function runScenarios(ctx) {
  await seedDraftAndSign(ctx);
  await seedLabeledStored(ctx);
  await seedDisposal(ctx);
  await seedReworking(ctx);
  await seedReinStock(ctx);
  await seedRetired(ctx);
}

module.exports = runScenarios;
