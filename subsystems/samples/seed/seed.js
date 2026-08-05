// subsystems/samples/seed/seed.js — 样品子系统种子数据
// 导出 seed(pool) 函数供框架调用，Phase 2 过渡期内仍通过 D 模块操作

const D = require('../../../db');

const NOW = new Date();
function daysAgo(n) { var d = new Date(NOW); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 19).replace('T', ' '); }
function daysFromNow(n) { var d = new Date(NOW); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 19).replace('T', ' '); }

async function seed(pool) {
  // 查找用户
  const admin = await D.getUserByUsername('admin');
  const rd    = await D.getUserByUsername('rd01');
  const qa    = await D.getUserByUsername('qa01');
  const mfg   = await D.getUserByUsername('mfg01');
  const fqc   = await D.getUserByUsername('fqc01');
  const me    = await D.getUserByUsername('me01');

  if (!rd || !qa) { console.log('请先执行 node seed.js 创建基础账号'); return; }

  // 清空样品数据
  console.log('清空样品数据…');
  await pool.execute('DELETE FROM scan_logs');
  await pool.execute('DELETE FROM samples');
  await pool.execute('ALTER TABLE samples AUTO_INCREMENT = 1');
  await pool.execute('ALTER TABLE scan_logs AUTO_INCREMENT = 1');
  console.log('已清空。\n');

  // 工具函数
  async function transition(s, overrides) {
    var current = await D.getSampleById(s.id);
    return await D.updateSample({ ...current, ...overrides });
  }

  // ═══ 1. NEW: 新建·待制作确认 (3个) ═══
  console.log('--- NEW 状态 ---');

  var s1 = await D.createSample({
    name: '散热风扇·标准型A', spec: 'DC12V·0.35A·3000RPM·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '首批试模样品，待研发贴码确认', created_by: rd.id, source_type: 'T'
  });
  await D.addLog({ sample_id: s1.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品' });
  console.log('  ' + s1.sample_no + ' 散热风扇·标准型A');

  var s2 = await D.createSample({
    name: '静音风扇·低噪音验证', spec: 'DC12V·0.22A·噪音<28dB·Φ92×38mm', model: 'SF9225', station: '扇叶组',
    notes: '噪音摸底验证用样品', created_by: rd.id, source_type: 'T'
  });
  await D.addLog({ sample_id: s2.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品' });
  console.log('  ' + s2.sample_no + ' 静音风扇·低噪音验证');

  var s3 = await D.createSample({
    name: '长寿命验证风扇', spec: 'DC24V·0.5A·2000RPM·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '长寿命验证1000h，待标示卡填写', created_by: rd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'C',
    card_version: 'V1.0', test_standard: 'Q/YS-001-2025', test_data: 'A=0.3g, B=0.5g, C=0.2g', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s3.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  console.log('  ' + s3.sample_no + ' 长寿命验证风扇 [含标示卡 NG·外观·客供]');

  // ═══ 2. PRODUCED: 制作完成 (2个) ═══
  console.log('\n--- PRODUCED 状态 ---');

  var s4 = await D.createSample({
    name: '量产验证风扇·标准品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '量产工艺验证样品', created_by: rd.id,
    sample_type: 'OK', limit_item: 'A', source_type: 'T', card_version: 'V2.0',
    test_standard: 'Q/YS-振动-002', test_data: '震动≤0.5mm', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s4.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await transition(s4, { status: 'PRODUCED', produced_at: daysAgo(2) });
  await D.addLog({ sample_id: s4.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '研发确认制作完成' });
  console.log('  ' + s4.sample_no + ' 量产验证风扇·标准品 [含标示卡 OK·成品震动·元山]');

  var s5 = await D.createSample({
    name: '竞品对标风扇·A品牌', spec: 'DC12V·0.38A·3200RPM·Φ92×38mm', model: 'SF9225', station: '成品组',
    notes: '竞品对标分析用样品', created_by: rd.id, source_type: 'C'
  });
  await D.addLog({ sample_id: s5.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品' });
  await transition(s5, { status: 'PRODUCED', produced_at: daysAgo(5) });
  await D.addLog({ sample_id: s5.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '研发确认制作完成' });
  console.log('  ' + s5.sample_no + ' 竞品对标风扇·A品牌');

  // ═══ 3. RELEASED: 已发行 (3个) ═══
  console.log('\n--- RELEASED 状态 ---');

  var s6 = await D.createSample({
    name: '调机验证风扇·量产版', spec: 'DC24V·0.45A·IP55·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '调机工艺验证样品', created_by: rd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'G', card_version: 'V1.5',
    test_standard: 'Q/YS-调机-003', test_data: '调机参数OK', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s6.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建调机样（含标示卡）' });
  await transition(s6, { status: 'PRODUCED', produced_at: daysAgo(48) });
  await D.addLog({ sample_id: s6.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '研发确认制作完成' });
  await transition(s6, { status: 'RELEASED', released_at: daysAgo(24), release_cycle_days: 90, next_inspect_at: daysFromNow(66) });
  await D.addLog({ sample_id: s6.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期90天' });
  console.log('  ' + s6.sample_no + ' 调机验证风扇·量产版 [含标示卡 OK·特殊工站·塔岗, 90天周期]');

  var s7 = await D.createSample({
    name: '客户端承认样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '成品组',
    notes: '客户承认用样品，需分发至制造部', created_by: rd.id,
    sample_type: 'OK', limit_item: 'C', source_type: 'C', card_version: 'V3.0',
    test_standard: 'Q/YS-外观-004', test_data: '无划伤/无毛刺/颜色一致',
    signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  });
  await D.addLog({ sample_id: s7.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await transition(s7, { status: 'PRODUCED', produced_at: daysAgo(72) });
  await D.addLog({ sample_id: s7.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '研发确认制作完成' });
  await transition(s7, { status: 'RELEASED', released_at: daysAgo(36), release_cycle_days: 180, next_inspect_at: daysFromNow(144) });
  await D.addLog({ sample_id: s7.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期180天，QA已签' });
  console.log('  ' + s7.sample_no + ' 客户端承认样品 [含标示卡 OK·外观·客供, 180天周期, QA已签]');

  var s8 = await D.createSample({
    name: '年度稽核留样', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '年度体系稽核留样', created_by: rd.id, source_type: 'T'
  });
  await D.addLog({ sample_id: s8.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品' });
  await transition(s8, { status: 'PRODUCED', produced_at: daysAgo(60) });
  await D.addLog({ sample_id: s8.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '研发确认制作完成' });
  await transition(s8, { status: 'RELEASED', released_at: daysAgo(12), release_cycle_days: 365, next_inspect_at: daysFromNow(353) });
  await D.addLog({ sample_id: s8.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期365天' });
  console.log('  ' + s8.sample_no + ' 年度稽核留样（365天周期）');

  // ═══ 4. IN_CUSTODY: 保管中 (4个) ═══
  console.log('\n--- IN_CUSTODY 状态 ---');

  async function fullFlow(s, produced, released, cycle, inspectOffset, user, dept, location) {
    await transition(s, { status: 'PRODUCED', produced_at: daysAgo(produced) });
    await D.addLog({ sample_id: s.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '研发确认制作完成' });
    await transition(s, { status: 'RELEASED', released_at: daysAgo(released), release_cycle_days: cycle, next_inspect_at: daysFromNow(inspectOffset) });
    await D.addLog({ sample_id: s.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期' + cycle + '天' });
    await transition(s, { status: 'IN_CUSTODY', custody_dept: dept, storage_location: location });
    await D.addLog({ sample_id: s.id, action: 'CUSTODY', role: user.role, user_id: user.id, dept: dept, location: location, note: '部门接收保管' });
  }

  var s9 = await D.createSample({
    name: '产线日常监控样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '产线日常品质监控样品', created_by: rd.id,
    sample_type: 'NG', limit_item: 'P', source_type: 'T', card_version: 'V2.1',
    test_standard: 'Q/YS-成品-005', test_data: 'RPM=2950, I=0.35A', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s9.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s9, 168, 120, 90, 60, mfg, '制造部', 'A区-3架-2层');
  console.log('  ' + s9.sample_no + ' 产线日常监控样品 [含标示卡 NG·成品检测·元山, 90天, 60天后复检]');

  var s10 = await D.createSample({
    name: '出货检验留样', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '成品组',
    notes: '出货检验留样，需尽快复检', created_by: rd.id,
    sample_type: 'OK', limit_item: 'B', source_type: 'C', card_version: 'V1.2',
    test_standard: 'Q/YS-异音-006', test_data: '噪音≤30dB', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s10.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s10, 200, 150, 90, 3, mfg, '制造部', 'A区-2架-1层');
  console.log('  ' + s10.sample_no + ' 出货检验留样 [含标示卡 OK·异音·客供, 90天, 3天后复检(即将到期)]');

  var s11 = await D.createSample({
    name: '客诉追溯留样', spec: 'DC12V·0.45A·Φ92×38mm', model: 'SF9225', station: '成品组',
    notes: '客诉追溯样品，已逾期未复检', created_by: rd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'G', card_version: 'V1.0',
    test_standard: 'Q/YS-外观-004', test_data: 'A面划伤, B面毛刺', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s11.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡，客诉追溯）' });
  await fullFlow(s11, 300, 250, 60, -15, fqc, 'FQC', 'B区-3架-2层');
  console.log('  ' + s11.sample_no + ' 客诉追溯留样 [含标示卡 NG·外观·塔岗, 60天, 已逾期15天]');

  var s12 = await D.createSample({
    name: '年度型式试验留样', spec: 'DC24V·0.45A·IP55·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '年度型式试验留样', created_by: rd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'T', card_version: 'V4.0',
    test_standard: 'Q/YS-特殊-007', test_data: '全项通过',
    signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  });
  await D.addLog({ sample_id: s12.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s12, 400, 350, 180, 120, mfg, '制造部', 'C区-5架-3层');
  console.log('  ' + s12.sample_no + ' 年度型式试验留样 [含标示卡 OK·特殊工站·元山, 180天, 120天后复检, QA已签]');

  // ═══ 5. RETURNING: 退回审核中 (2个) ═══
  console.log('\n--- RETURNING 状态 ---');

  var s13 = await D.createSample({
    name: '外观损坏退回样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '保管申请退回，等待品保审核', created_by: rd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'T', card_version: 'V1.0',
    test_standard: 'Q/YS-外观-004', test_data: 'A面划伤', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s13.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s13, 100, 80, 90, 60, mfg, '制造部', 'A区-3架-2层');
  await transition(s13, { status: 'RETURNING', retired_reason: '样品外观损坏，需重新制作' });
  await D.addLog({ sample_id: s13.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', note: '样品外观损坏，申请退回处理' });
  console.log('  ' + s13.sample_no + ' 外观损坏退回样品 [含标示卡 NG·外观·元山]');

  var s14 = await D.createSample({
    name: '精度偏移退回样品', spec: 'DC12V·0.38A·Φ92×38mm', model: 'SF9225', station: '成品组',
    notes: '精度超标，退回研发重新制作', created_by: rd.id,
    sample_type: 'NG', limit_item: 'P', source_type: 'G', card_version: 'V1.0',
    test_standard: 'Q/YS-成品-005', test_data: 'RPM偏差>5%', signed_by_rd: '研发工程师'
  });
  await D.addLog({ sample_id: s14.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s14, 90, 70, 60, 30, fqc, 'FQC', 'B区-1架-3层');
  await transition(s14, { status: 'RETURNING', retired_reason: '测试精度超标，需研发重新确认' });
  await D.addLog({ sample_id: s14.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: fqc.id, dept: 'FQC', note: '精度超标，申请退回研发' });
  console.log('  ' + s14.sample_no + ' 精度偏移退回样品 [含标示卡 NG·成品检测·塔岗]');

  // ═══ 6. RETIRED: 已作废 (1个) ═══
  console.log('\n--- RETIRED 状态 ---');

  var s15 = await D.createSample({
    name: '过期作废样品', spec: 'DC12V·0.22A·噪音<28dB·Φ92×38mm', model: 'SF9225', station: '扇叶组',
    notes: '品保确认作废', created_by: rd.id,
    sample_type: 'OK', limit_item: 'B', source_type: 'C', card_version: 'V2.0',
    test_standard: 'Q/YS-异音-006', test_data: '噪音≤30dB',
    signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  });
  await D.addLog({ sample_id: s15.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s15, 120, 100, 90, 60, mfg, '制造部', 'A区-3架-2层');
  await transition(s15, { status: 'RETURNING', retired_reason: '样品过期申请退回' });
  await D.addLog({ sample_id: s15.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', note: '样品过期，申请退回' });
  await transition(s15, { status: 'RETIRED', retired_reason: '样品过期无法使用，确认作废' });
  await D.addLog({ sample_id: s15.id, action: 'RETIRE_ONLY', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '样品过期无法使用，确认作废' });
  console.log('  ' + s15.sample_no + ' 过期作废样品 [含标示卡 OK·异音·客供, QA已签]');

  // 汇总
  var rows = await pool.execute('SELECT status, COUNT(*) as cnt FROM samples GROUP BY status ORDER BY status');
  console.log('\n========== 汇总 ==========');
  var total = (await pool.execute('SELECT COUNT(*) as cnt FROM samples'))[0][0].cnt;
  console.log('  样品总数: ' + total + ' 个');
  rows[0].forEach(function(r) { console.log('    ' + r.status + ': ' + r.cnt + ' 个'); });
  var logCnt = (await pool.execute('SELECT COUNT(*) as cnt FROM scan_logs'))[0][0].cnt;
  console.log('  操作日志: ' + logCnt + ' 条');
  console.log('\n样品种子完成。');
}

module.exports = seed;
