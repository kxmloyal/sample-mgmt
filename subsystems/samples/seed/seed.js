// subsystems/samples/seed/seed.js — 样品子系统种子数据
// 2026-08-06 更新：对照最新 schema/manifest/DAO 重构
//  - 新增 sample_models 机型主数据（新建样品强制校验机型存在）
//  - 覆盖全 6 状态 + RETIRE_RECREATE→RECREATE 替代链（replaces/replaced_by 成对）
//  - produced_at/released_at/next_inspect_at/valid_until 统一 ISO(UTC)，与系统写入一致
//  - created_at/日志时间按本地时间(UTC+8)回填，保证时间线真实
//  - 日志覆盖 10 种动作：CREATE/PRODUCE/RELEASE/CUSTODY/INSPECT/EDIT_STORAGE/
//    RETURN_REQUEST/RETIRE_RECREATE/RETIRE_ONLY/RECREATE_REPLACED
const D = require('../../../db');

const NOW = new Date();
const DAY = 86400000;
function isoAgo(n) { return new Date(NOW.getTime() - n * DAY).toISOString(); }
function isoFrom(n) { return new Date(NOW.getTime() + n * DAY).toISOString(); }
// 本地时间(UTC+8)字符串，用于 TIMESTAMP 列（created_at / 日志时间）回填
function localAgo(n) {
  var d = new Date(NOW.getTime() - n * DAY);
  function p(x) { return String(x).padStart(2, '0'); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

async function seed(pool) {
  const admin = await D.getUserByUsername('admin');
  const rd    = await D.getUserByUsername('rd01');
  const qa    = await D.getUserByUsername('qa01');
  const mfg   = await D.getUserByUsername('mfg01');
  const fqc   = await D.getUserByUsername('fqc01');
  if (!rd || !qa) { console.log('请先执行 node seed.js 创建基础账号'); return; }

  // 清空样品数据（含机型主数据）
  console.log('清空样品数据…');
  await pool.execute('DELETE FROM scan_logs');
  await pool.execute('DELETE FROM samples');
  await pool.execute('DELETE FROM sample_models');
  await pool.execute('ALTER TABLE samples AUTO_INCREMENT = 1');
  await pool.execute('ALTER TABLE scan_logs AUTO_INCREMENT = 1');
  await pool.execute('ALTER TABLE sample_models AUTO_INCREMENT = 1');
  console.log('已清空。\n');

  // 带时间戳的日志插入（D.addLog 不支持回填时间）
  async function addLogAt(log, ts) {
    await pool.execute(
      'INSERT INTO scan_logs (sample_id,action,role,user_id,dept,location,note,created_at) VALUES (?,?,?,?,?,?,?,?)',
      [log.sample_id, log.action, log.role || null, log.user_id || null, log.dept || null, log.location || null, log.note || null, ts || localAgo(0)]
    );
  }
  // 状态流转：读最新 + 全量字段覆盖（与系统 updateSample 一致）
  async function transit(s, patch) {
    var cur = await D.getSampleById(s.id);
    return await D.updateSample(Object.assign({}, cur, patch));
  }
  // 新建样品并记录 CREATE 日志（created_at 回填保证时间线）
  async function make(data, createdDaysAgo, logNote) {
    var s = await D.createSample(data);
    await pool.execute('UPDATE samples SET created_at=? WHERE id=?', [localAgo(createdDaysAgo), s.id]);
    await addLogAt({ sample_id: s.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发部', note: logNote || '新建样品' }, localAgo(createdDaysAgo));
    return s;
  }
  // PRODUCE + RELEASE（cfg: produced/released/cycle/inspectOffset）
  async function flowToReleased(s, cfg) {
    await transit(s, { status: 'PRODUCED', produced_at: isoAgo(cfg.produced) });
    await addLogAt({ sample_id: s.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发部', note: '研发确认制作完成' }, localAgo(cfg.produced));
    await transit(s, { status: 'RELEASED', released_at: isoAgo(cfg.released), release_cycle_days: cfg.cycle, next_inspect_at: isoFrom(cfg.inspectOffset), valid_until: isoFrom(cfg.inspectOffset) });
    await addLogAt({ sample_id: s.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期' + cfg.cycle + '天' }, localAgo(cfg.released));
  }
  // flowToReleased + CUSTODY 接收保管（cfg 追加 user/dept/location）
  async function flowToCustody(s, cfg) {
    await flowToReleased(s, cfg);
    await transit(s, { status: 'IN_CUSTODY', custody_dept: cfg.dept, storage_location: cfg.location });
    await addLogAt({ sample_id: s.id, action: 'CUSTODY', role: cfg.user.role, user_id: cfg.user.id, dept: cfg.dept, location: cfg.location, note: '部门接收保管' }, localAgo(cfg.released + 1));
  }

  // ═══ 机型主数据（新建样品强制校验机型存在，须先种） ═══
  console.log('--- 机型主数据 ---');
  const MODELS = [
    { code: 'SF1225', full_name: '直流风扇 1225' },
    { code: 'SF9225', full_name: '直流风扇 9225' },
    { code: 'SF1202', full_name: '直流风扇 1202' },
    { code: 'MX1234', full_name: '马达总成 MX1234' },
    { code: 'MY1234', full_name: '马达总成 MY1234' },
    { code: 'BD1025', full_name: '直流无刷马达 BD1025' }
  ];
  for (var i = 0; i < MODELS.length; i++) {
    await D.createModel({ code: MODELS[i].code, full_name: MODELS[i].full_name, created_by: admin.id });
    console.log('  + ' + MODELS[i].code + ' ' + MODELS[i].full_name);
  }

  // ═══ 1. NEW: 新建·待制作确认 (3个) ═══
  console.log('\n--- NEW 状态 ---');
  var s1 = await make({
    name: '散热风扇·标准型A', spec: 'DC12V·0.35A·3000RPM·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '首批试模样品，待研发贴码确认', created_by: rd.id, source_type: 'T'
  }, 3);
  console.log('  ' + s1.sample_no + ' 散热风扇·标准型A');

  var s2 = await make({
    name: '静音风扇·低噪音验证', spec: 'DC12V·0.22A·噪音<28dB·Φ92×38mm', model: 'SF9225', station: '扇叶组',
    notes: '噪音摸底验证用样品', created_by: rd.id, source_type: 'T'
  }, 2);
  console.log('  ' + s2.sample_no + ' 静音风扇·低噪音验证');

  var s3 = await make({
    name: '长寿命验证风扇', spec: 'DC24V·0.5A·2000RPM·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '长寿命验证1000h，待标示卡填写', created_by: rd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'C', card_version: '01',
    test_standard: 'Q/YS-001-2025', test_data: 'A=0.3g, B=0.5g, C=0.2g', signed_by_rd: '研发工程师'
  }, 1, '新建样品（含标示卡）');
  console.log('  ' + s3.sample_no + ' 长寿命验证风扇 [含标示卡 NG·外观·客供]');

  // ═══ 2. PRODUCED: 制作完成 (2个) ═══
  console.log('\n--- PRODUCED 状态 ---');
  var s4 = await make({
    name: '量产验证风扇·标准品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '量产工艺验证样品', created_by: rd.id,
    sample_type: 'OK', limit_item: 'A', source_type: 'T', card_version: '01',
    test_standard: 'Q/YS-振动-002', test_data: '震动≤0.5mm', signed_by_rd: '研发工程师'
  }, 4, '新建样品（含标示卡）');
  await transit(s4, { status: 'PRODUCED', produced_at: isoAgo(2) });
  await addLogAt({ sample_id: s4.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发部', note: '研发确认制作完成' }, localAgo(2));
  console.log('  ' + s4.sample_no + ' 量产验证风扇·标准品 [含标示卡 OK·成品震动·元山]');

  var s5 = await make({
    name: '竞品对标风扇·A品牌', spec: 'DC12V·0.38A·3200RPM·Φ92×38mm', model: 'SF9225', station: '成品组',
    notes: '竞品对标分析用样品', created_by: rd.id, source_type: 'C'
  }, 7);
  await transit(s5, { status: 'PRODUCED', produced_at: isoAgo(5) });
  await addLogAt({ sample_id: s5.id, action: 'PRODUCE', role: 'RD', user_id: rd.id, dept: '研发部', note: '研发确认制作完成' }, localAgo(5));
  console.log('  ' + s5.sample_no + ' 竞品对标风扇·A品牌');

  // ═══ 3. RELEASED: 已发行 (3个) ═══
  console.log('\n--- RELEASED 状态 ---');

  var s6 = await make({
    name: '调机验证风扇·量产版', spec: 'DC24V·0.45A·IP55·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '调机工艺验证样品', created_by: rd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'G', card_version: '01',
    test_standard: 'Q/YS-调机-003', test_data: '调机参数OK', signed_by_rd: '研发工程师'
  }, 50, '新建调机样（含标示卡）');
  await flowToReleased(s6, { produced: 48, released: 24, cycle: 90, inspectOffset: 66 });
  console.log('  ' + s6.sample_no + ' 调机验证风扇·量产版 [含标示卡 OK·特殊工站·塔岗, 90天周期]');

  var s7 = await make({
    name: '客户端承认样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '成品组',
    notes: '客户承认用样品，需分发至制造部', created_by: rd.id,
    sample_type: 'OK', limit_item: 'C', source_type: 'C', card_version: '01',
    test_standard: 'Q/YS-外观-004', test_data: '无划伤/无毛刺/颜色一致',
    signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  }, 74, '新建样品（含标示卡）');
  await flowToReleased(s7, { produced: 72, released: 36, cycle: 180, inspectOffset: 144 });
  console.log('  ' + s7.sample_no + ' 客户端承认样品 [含标示卡 OK·外观·客供, 180天周期, QA已签]');

  var s8 = await make({
    name: '年度稽核留样', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '年度体系稽核留样', created_by: rd.id,
    sample_type: 'OK', limit_item: 'A', source_type: 'T', card_version: '01',
    test_standard: 'Q/YS-成品-005', test_data: 'RPM=3000, I=0.35A', signed_by_rd: '研发工程师'
  }, 62, '新建样品（含标示卡）');
  await flowToReleased(s8, { produced: 60, released: 12, cycle: 365, inspectOffset: 353 });
  console.log('  ' + s8.sample_no + ' 年度稽核留样 [含标示卡 OK·成品震动·元山, 365天周期]');

  // ═══ 4. IN_CUSTODY: 保管中 (4个，覆盖 正常/近7天/逾期/复检+改储位) ═══
  console.log('\n--- IN_CUSTODY 状态 ---');

  var s9 = await make({
    name: '产线日常监控样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '产线日常品质监控样品', created_by: rd.id,
    sample_type: 'NG', limit_item: 'P', source_type: 'T', card_version: '01',
    test_standard: 'Q/YS-成品-005', test_data: 'RPM=2950, I=0.35A', signed_by_rd: '研发工程师'
  }, 170, '新建样品（含标示卡）');
  await flowToCustody(s9, { produced: 168, released: 120, cycle: 90, inspectOffset: -60, user: mfg, dept: '制造部', location: 'A区-3架-2层' });
  // QA 复检：更新下次复检时间（提前复检场景）
  await transit(s9, { next_inspect_at: isoFrom(60), valid_until: isoFrom(60) });
  await addLogAt({ sample_id: s9.id, action: 'INSPECT', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '复检通过，下次周期90天' }, localAgo(60));
  console.log('  ' + s9.sample_no + ' 产线日常监控样品 [含标示卡 NG·成品检测·元山, 已复检1次]');

  var s10 = await make({
    name: '出货检验留样', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '成品组',
    notes: '出货检验留样，需尽快复检', created_by: rd.id,
    sample_type: 'OK', limit_item: 'B', source_type: 'C', card_version: '01',
    test_standard: 'Q/YS-异音-006', test_data: '噪音≤30dB', signed_by_rd: '研发工程师'
  }, 202, '新建样品（含标示卡）');
  await flowToCustody(s10, { produced: 200, released: 150, cycle: 90, inspectOffset: 3, user: mfg, dept: '制造部', location: 'A区-2架-1层' });
  console.log('  ' + s10.sample_no + ' 出货检验留样 [含标示卡 OK·异音·客供, 3天后复检(即将到期)]');

  var s11 = await make({
    name: '客诉追溯留样', spec: 'DC12V·0.45A·Φ92×38mm', model: 'SF9225', station: '成品组',
    notes: '客诉追溯样品，已逾期未复检', created_by: rd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'G', card_version: '01',
    test_standard: 'Q/YS-外观-004', test_data: 'A面划伤, B面毛刺', signed_by_rd: '研发工程师'
  }, 302, '新建样品（含标示卡，客诉追溯）');
  await flowToCustody(s11, { produced: 300, released: 250, cycle: 60, inspectOffset: -15, user: fqc, dept: 'FQC', location: 'B区-3架-2层' });
  console.log('  ' + s11.sample_no + ' 客诉追溯留样 [含标示卡 NG·外观·塔岗, 已逾期15天]');

  var s12 = await make({
    name: '年度型式试验留样', spec: 'DC24V·0.45A·IP55·Φ120×38mm', model: 'SF1202', station: '成品组',
    notes: '年度型式试验留样', created_by: rd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'T', card_version: '01',
    test_standard: 'Q/YS-特殊-007', test_data: '全项通过',
    signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  }, 402, '新建样品（含标示卡）');
  await flowToCustody(s12, { produced: 400, released: 350, cycle: 180, inspectOffset: 120, user: mfg, dept: '制造部', location: 'C区-5架-3层' });
  // 保管修改储位
  await transit(s12, { storage_location: 'C区-5架-2层' });
  await addLogAt({ sample_id: s12.id, action: 'EDIT_STORAGE', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', location: 'C区-5架-2层', note: '修改储位' }, localAgo(30));
  console.log('  ' + s12.sample_no + ' 年度型式试验留样 [含标示卡 OK·特殊工站·元山, 180天周期, QA已签]');

  // ═══ 5. RETURNING: 退回审核中 (2个) ═══
  console.log('\n--- RETURNING 状态 ---');

  var s13 = await make({
    name: '外观损坏退回样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1225', station: '马达组',
    notes: '保管申请退回，等待品保审核', created_by: rd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'T', card_version: '01',
    test_standard: 'Q/YS-外观-004', test_data: 'A面划伤', signed_by_rd: '研发工程师'
  }, 102, '新建样品（含标示卡）');
  await flowToCustody(s13, { produced: 100, released: 80, cycle: 90, inspectOffset: 10, user: mfg, dept: '制造部', location: 'A区-3架-2层' });
  await transit(s13, { status: 'RETURNING', retired_reason: '样品外观损坏，需重新制作' });
  await addLogAt({ sample_id: s13.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', note: '样品外观损坏，申请退回处理' }, localAgo(5));
  console.log('  ' + s13.sample_no + ' 外观损坏退回样品 [含标示卡 NG·外观·元山, 待品保审核]');

  var s14 = await make({
    name: '精度偏移退回样品', spec: 'DC12V·0.38A·Φ92×38mm', model: 'SF9225', station: '成品组',
    notes: '精度超标，退回研发重新制作', created_by: rd.id,
    sample_type: 'NG', limit_item: 'P', source_type: 'G', card_version: '01',
    test_standard: 'Q/YS-成品-005', test_data: 'RPM偏差>5%', signed_by_rd: '研发工程师'
  }, 92, '新建样品（含标示卡）');
  await flowToCustody(s14, { produced: 90, released: 70, cycle: 60, inspectOffset: -30, user: fqc, dept: 'FQC', location: 'B区-1架-3层' });
  await transit(s14, { status: 'RETURNING', retired_reason: '测试精度超标，需研发重新确认' });
  await addLogAt({ sample_id: s14.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: fqc.id, dept: 'FQC', note: '精度超标，申请退回研发' }, localAgo(3));
  // 品保审核：退回研发重做，指派 rd01（RD 待执行 RECREATE）
  await transit(s14, { retired_reason: '退回研发重新制作', retire_assigned_rd: String(rd.id) });
  await addLogAt({ sample_id: s14.id, action: 'RETIRE_RECREATE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '退回研发重新制作，指派 ' + (rd.display_name || rd.username) }, localAgo(1));
  console.log('  ' + s14.sample_no + ' 精度偏移退回样品 [含标示卡 NG·成品检测·塔岗, 已指派研发重做]');

  // ═══ 6. RETIRED: 已作废 (2个) + RECREATE 替代链 ═══
  console.log('\n--- RETIRED 状态 ---');

  // s15：直接作废（RETIRE_ONLY）
  var s15 = await make({
    name: '过期作废样品', spec: 'DC12V·0.22A·噪音<28dB·Φ92×38mm', model: 'SF9225', station: '扇叶组',
    notes: '品保确认作废', created_by: rd.id,
    sample_type: 'OK', limit_item: 'B', source_type: 'C', card_version: '01',
    test_standard: 'Q/YS-异音-006', test_data: '噪音≤30dB',
    signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  }, 122, '新建样品（含标示卡）');
  await flowToCustody(s15, { produced: 120, released: 100, cycle: 90, inspectOffset: -10, user: mfg, dept: '制造部', location: 'A区-3架-2层' });
  await transit(s15, { status: 'RETURNING', retired_reason: '样品过期申请退回' });
  await addLogAt({ sample_id: s15.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', note: '样品过期，申请退回' }, localAgo(20));
  await transit(s15, { status: 'RETIRED', retired_reason: '样品过期无法使用，确认作废' });
  await addLogAt({ sample_id: s15.id, action: 'RETIRE_ONLY', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '样品过期无法使用，确认作废' }, localAgo(18));
  console.log('  ' + s15.sample_no + ' 过期作废样品 [含标示卡 OK·异音·客供, 直接作废]');

  // s16 → s17：RECREATE 替代链（replaces/replaced_by 成对）
  var s16 = await make({
    name: '精度漂移作废样品', spec: 'DC12V·0.35A·Φ80×45mm', model: 'SF1202', station: '成品组',
    notes: '复检精度漂移，退回研发重做后由替代品接续', created_by: rd.id,
    sample_type: 'NG', limit_item: 'P', source_type: 'T', card_version: '01',
    test_standard: 'Q/YS-成品-005', test_data: 'RPM偏差>8%', signed_by_rd: '研发工程师', signed_by_qa: '品保文管员'
  }, 82, '新建样品（含标示卡）');
  await flowToCustody(s16, { produced: 80, released: 60, cycle: 60, inspectOffset: -45, user: mfg, dept: '制造部', location: 'A区-1架-1层' });
  await transit(s16, { status: 'RETURNING', retired_reason: '测试精度漂移，需重做' });
  await addLogAt({ sample_id: s16.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: mfg.id, dept: '制造部', note: '复检精度漂移，申请退回' }, localAgo(10));
  await transit(s16, { retired_reason: '退回研发重新制作', retire_assigned_rd: String(rd.id) });
  await addLogAt({ sample_id: s16.id, action: 'RETIRE_RECREATE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '退回研发重新制作，指派 ' + (rd.display_name || rd.username) }, localAgo(8));
  // RD 执行 RECREATE：创建替代品 s17 + 旧样品 RETIRED
  var s17 = await D.createSample({
    name: s16.name, spec: s16.spec, model: s16.model, station: s16.station,
    sample_type: s16.sample_type, limit_item: s16.limit_item, source_type: s16.source_type,
    card_version: s16.card_version, test_standard: s16.test_standard, test_data: s16.test_data,
    signed_by_rd: '研发工程师', signed_by_qa: s16.signed_by_qa,
    notes: '替代已作废样品 ' + s16.sample_no, created_by: rd.id, replaces: s16.sample_no
  });
  await pool.execute('UPDATE samples SET created_at=? WHERE id=?', [localAgo(6), s17.id]);
  await addLogAt({ sample_id: s17.id, action: 'CREATE', role: 'RD', user_id: rd.id, dept: '研发部', note: '替代 ' + s16.sample_no }, localAgo(6));
  await transit(s16, { status: 'RETIRED', replaced_by: s17.sample_no });
  await addLogAt({ sample_id: s16.id, action: 'RECREATE_REPLACED', role: 'RD', user_id: rd.id, dept: '研发部', note: '由 ' + s17.sample_no + ' 替代' }, localAgo(6));
  console.log('  ' + s16.sample_no + ' 精度漂移作废样品 [被 ' + s17.sample_no + ' 替代]');
  console.log('  ' + s17.sample_no + ' 精度漂移重做替代品 [替代 ' + s16.sample_no + ', 待制作确认]');

  // ═══ 汇总 ═══
  var rows = await pool.execute('SELECT status, COUNT(*) as cnt FROM samples GROUP BY status ORDER BY status');
  console.log('\n========== 汇总 ==========');
  var total = (await pool.execute('SELECT COUNT(*) as cnt FROM samples'))[0][0].cnt;
  console.log('  样品总数: ' + total + ' 个');
  rows[0].forEach(function(r) { console.log('    ' + r.status + ': ' + r.cnt + ' 个'); });
  var modelCnt = (await pool.execute('SELECT COUNT(*) as cnt FROM sample_models'))[0][0].cnt;
  console.log('  机型主数据: ' + modelCnt + ' 个');
  var logCnt = (await pool.execute('SELECT COUNT(*) as cnt FROM scan_logs'))[0][0].cnt;
  console.log('  操作日志: ' + logCnt + ' 条');
  console.log('\n样品种子完成。');
}

module.exports = seed;
