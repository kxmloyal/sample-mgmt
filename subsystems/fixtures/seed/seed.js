// subsystems/fixtures/seed/seed.js — 治具子系统种子数据
// 覆盖当前单人验证流程全部状态 + 呆滞样例（日志时间戳回退历史，命中呆滞判定）
// 单人验证：申请部门人员验证通过即移交（无双人验证中间态）

const D = require('../../../db');

function daysAgo(n) { var d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 19).replace('T', ' '); }
function daysFromNow(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 19).replace('T', ' '); }

async function seed(pool) {
  const { getUserByUsername } = D;

  function run(sql, params) { return pool.execute(sql, params || []); }
  async function query(sql, params) { var [rows] = await pool.execute(sql, params || []); return rows.map(function(r){return Object.assign({}, r);}); }

  const admin = await getUserByUsername('admin');
  const rd01  = await getUserByUsername('rd01');
  const qa01  = await getUserByUsername('qa01');
  const mfg01 = await getUserByUsername('mfg01');
  const fqc01 = await getUserByUsername('fqc01');
  const me01  = await getUserByUsername('me01');

  if (!rd01 || !me01) { console.log('请先执行 node seed.js 创建基础账号'); return; }

  console.log('清空治具数据…');
  await run('DELETE FROM fixture_logs');
  await run('DELETE FROM fixtures');
  await run('ALTER TABLE fixtures AUTO_INCREMENT = 1');
  await run('ALTER TABLE fixture_logs AUTO_INCREMENT = 1');
  console.log('已清空。\n');

  async function insertFix(fields) {
    var no = fields.fixture_no;
    if (!no) {
      var row = await query('SELECT COALESCE(MAX(id), 0) AS m FROM fixtures');
      no = 'FJ-' + String(row[0].m + 1).padStart(6, '0');
    }
    var keys = ['fixture_no'].concat(Object.keys(fields));
    var vals = [no];
    var ph = ['?'];
    Object.keys(fields).forEach(function(k) { ph.push('?'); vals.push(fields[k]); });
    await run('INSERT INTO fixtures (' + keys.join(',') + ') VALUES (' + ph.join(',') + ')', vals);
    return (await query('SELECT * FROM fixtures WHERE fixture_no = ?', [no]))[0];
  }

  // createdAt 可选：回退历史时间模拟状态停留（呆滞判定依据 MAX(fixture_logs.created_at)）
  async function addLog(fixture_id, action, role, user_id, dept, note, createdAt) {
    await run('INSERT INTO fixture_logs (fixture_id,action,role,user_id,dept,note,created_at) VALUES (?,?,?,?,?,?,?)',
      [fixture_id, action, role, user_id, dept, note, createdAt || daysAgo(0)]);
  }

  // 标准全流程日志：CREATE→ACCEPT→MAKE_DONE→VERIFY（单人：申请部门确认即移交）→[USE]
  // t=最初申请天数；useAt=领用天数（null 则不领用，最后日志停在 VERIFY）
  async function stdLogs(f, role, user, dept, t, useAt) {
    await addLog(f.id, 'CREATE', role, user.id, dept, '申请', daysAgo(t));
    await addLog(f.id, 'ACCEPT', 'RD', rd01.id, '研发部', '接收', daysAgo(t - 2));
    await addLog(f.id, 'MAKE_DONE', 'RD', rd01.id, '研发部', '制作完成，待申请部门验证', daysAgo(t - 4));
    await addLog(f.id, 'VERIFY', role, user.id, dept, '验证通过，已移交', daysAgo(t - 6));
    if (useAt != null) await addLog(f.id, 'USE', role, user.id, dept, '领用', daysAgo(useAt));
  }

  // ═══ 1. REQUESTED·呆滞（90天无人接收）═══
  var f1 = await insertFix({ name: 'PCB测试治具·主板A型', spec: 'PCB-100×80mm', model: 'MT-2000', station: 'SMT-01', category: '测试治具', status: 'REQUESTED', requested_by: mfg01.id, requested_dept: '制造部', request_note: '新机种导入，需制作配套测试治具', maintenance_cycle_days: 30, storage_location: '制造部·1号柜', notes: '优先级高' });
  await addLog(f1.id, 'CREATE', 'CUSTODY', mfg01.id, '制造部', '新机种导入申请', daysAgo(90));

  // ═══ 2. REQUESTED·正常（3天前申请）═══
  var f2 = await insertFix({ name: 'BGA植球治具', spec: 'BGA-484球·0.8mm间距', model: 'BGA-484', station: '植球站', category: '植球治具', status: 'REQUESTED', requested_by: me01.id, requested_dept: '生技部', request_note: 'BGA维修返修工具', maintenance_cycle_days: 60, storage_location: '研发部·治具架A' });
  await addLog(f2.id, 'CREATE', 'ME', me01.id, '生技部', 'BGA返修治具申请', daysAgo(3));

  // ═══ 3. ACCEPTED·正常 ═══
  var f3 = await insertFix({ name: '激光打标治具', spec: '30W光纤·二维码打标', model: 'LM-30W', station: '打标站', category: '加工治具', status: 'ACCEPTED', requested_by: mfg01.id, requested_dept: '制造部', request_note: '产品追溯码打标', made_by: rd01.id, made_at: daysAgo(2), made_note: '图纸已确认，排期制作', maintenance_cycle_days: 60, storage_location: '制造部·打标区' });
  await addLog(f3.id, 'CREATE', 'CUSTODY', mfg01.id, '制造部', '激光打标治具申请', daysAgo(5));
  await addLog(f3.id, 'ACCEPT', 'RD', rd01.id, '研发部', '已接收申请，排期中', daysAgo(2));

  // ═══ 4. VERIFY_PENDING·正常（待申请部门验证）═══
  var f4 = await insertFix({ name: 'LCD屏幕测试架', spec: '7寸LCD·1024×600', model: 'LCD-T7', station: '屏幕测试站', category: '测试治具', status: 'VERIFY_PENDING', requested_by: qa01.id, requested_dept: '品保文管中心', request_note: '入料抽检用屏幕测试架', made_by: rd01.id, made_at: daysAgo(3), made_note: '已制作完成，请申请部门验证', maintenance_cycle_days: 30, storage_location: '品保中心·2号柜' });
  await addLog(f4.id, 'CREATE', 'QA', qa01.id, '品保文管中心', '申请LCD测试治具', daysAgo(8));
  await addLog(f4.id, 'ACCEPT', 'RD', rd01.id, '研发部', '接收', daysAgo(6));
  await addLog(f4.id, 'MAKE_DONE', 'RD', rd01.id, '研发部', '制作完成，请申请部门验证', daysAgo(3));

  // ═══ 5. VERIFY_PENDING·呆滞（70天未验证）═══
  var f5 = await insertFix({ name: '功能测试治具·充电器', spec: '5V/2A·快充协议', model: 'CHG-FCT', station: '功能测试站', category: '测试治具', status: 'VERIFY_PENDING', requested_by: mfg01.id, requested_dept: '制造部', request_note: '充电器功能测试', made_by: rd01.id, made_at: daysAgo(70), made_note: '已制作完成，等待申请部门验证（超期）', maintenance_cycle_days: 30, storage_location: '制造部·待验证区' });
  await addLog(f5.id, 'CREATE', 'CUSTODY', mfg01.id, '制造部', '功能测试治具申请', daysAgo(80));
  await addLog(f5.id, 'ACCEPT', 'RD', rd01.id, '研发部', '接收', daysAgo(78));
  await addLog(f5.id, 'MAKE_DONE', 'RD', rd01.id, '研发部', '制作完成，请申请部门验证', daysAgo(70));

  // ═══ 6. VERIFY_PENDING·正常（制作完成待验证）═══
  var f6 = await insertFix({ name: 'FPC柔性板夹持治具', spec: 'FPC-0.3mm·30pin', model: 'FPC-30', station: '焊接站', category: '焊接治具', status: 'VERIFY_PENDING', requested_by: mfg01.id, requested_dept: '制造部', request_note: 'FPC排线焊接专用', made_by: rd01.id, made_at: daysAgo(15), made_note: '夹持力3N，已制作完成', maintenance_cycle_days: 60, storage_location: '制造部·3号柜' });
  await addLog(f6.id, 'CREATE', 'CUSTODY', mfg01.id, '制造部', 'FPC焊接治具申请', daysAgo(20));
  await addLog(f6.id, 'ACCEPT', 'RD', rd01.id, '研发部', '接收', daysAgo(18));
  await addLog(f6.id, 'MAKE_DONE', 'RD', rd01.id, '研发部', '制作完成，请申请部门验证', daysAgo(15));

  // ═══ 7. TRANSFERRED·正常（单人验证已移交，待领用）═══
  var f7 = await insertFix({ name: 'RF屏蔽箱治具', spec: 'RF-2.4G·5G双频', model: 'RF-BOX-A', station: 'RF测试站', category: 'RF治具', status: 'TRANSFERRED', requested_by: qa01.id, requested_dept: '品保文管中心', request_note: '无线模块RF测试屏蔽箱', made_by: rd01.id, made_at: daysAgo(10), made_note: '屏蔽效能>60dB', verified_me: qa01.id, verified_me_at: daysAgo(4), verify_note: '申请单位确认合格，已移交', transferred_at: daysAgo(4), maintenance_cycle_days: 90, storage_location: '品保中心·RF室' });
  await addLog(f7.id, 'CREATE', 'QA', qa01.id, '品保文管中心', 'RF屏蔽箱申请', daysAgo(15));
  await addLog(f7.id, 'ACCEPT', 'RD', rd01.id, '研发部', '接收', daysAgo(13));
  await addLog(f7.id, 'MAKE_DONE', 'RD', rd01.id, '研发部', '制作完成', daysAgo(10));
  await addLog(f7.id, 'VERIFY', 'QA', qa01.id, '品保文管中心', '验证通过，已移交', daysAgo(4));

  // ═══ 8. TRANSFERRED·呆滞（单人验证移交82天无人领用）═══
  var f8 = await insertFix({ name: '螺丝锁付治具', spec: 'M2/M3通用·电批适配', model: 'SCRW-M2', station: '锁付站', category: '装配治具', status: 'TRANSFERRED', requested_by: mfg01.id, requested_dept: '制造部', request_note: '产线螺丝锁付效率提升', made_by: rd01.id, made_at: daysAgo(86), made_note: '扭矩3N·m可调', verified_me: mfg01.id, verified_me_at: daysAgo(82), verify_note: '申请部门确认合格，移交后长期无人领用', transferred_at: daysAgo(82), maintenance_cycle_days: 90, storage_location: '制造部·2号柜', use_location: '制造部·锁付区' });
  await stdLogs(f8, 'CUSTODY', mfg01, '制造部', 88, null);

  // ═══ 9. TRANSFERRED·正常（已归还可再领用）═══
  var f9 = await insertFix({ name: '气密测试治具', spec: 'IP67·气压0.1MPa', model: 'IP67-A', station: '气密站', category: '测试治具', status: 'TRANSFERRED', requested_by: qa01.id, requested_dept: '品保文管中心', request_note: '防水等级测试', made_by: rd01.id, made_at: daysAgo(26), made_note: '密封圈硅胶定制', verified_me: qa01.id, verified_me_at: daysAgo(24), verify_note: '申请单位确认合格，已移交', transferred_at: daysAgo(24), used_by: qa01.id, used_at: daysAgo(20), use_location: '品保中心·防水测试区', expected_return_days: 30, use_note: '已归还，可再领用', maintenance_cycle_days: 45, last_maintenance_at: daysAgo(3), next_maintenance_at: daysFromNow(42), storage_location: '品保中心·3号柜' });
  await stdLogs(f9, 'QA', qa01, '品保文管中心', 30, 20);
  await addLog(f9.id, 'RETURN', 'QA', qa01.id, '品保文管中心', '归还，状态良好', daysAgo(2));

  // ═══ 10. IN_USE·正常使用中 ═══
  var f10 = await insertFix({ name: 'ICT在线测试治具', spec: 'ICT-256通道', model: 'ICT-256', station: 'ICT站', category: '测试治具', status: 'IN_USE', requested_by: mfg01.id, requested_dept: '制造部', request_note: 'PCB在线测试', made_by: rd01.id, made_at: daysAgo(36), made_note: '探针日本进口', verified_me: mfg01.id, verified_me_at: daysAgo(34), verify_note: '申请部门确认合格', transferred_at: daysAgo(34), used_by: mfg01.id, used_at: daysAgo(30), use_location: '制造部·ICT区', expected_return_days: 180, expected_return_at: daysFromNow(150), use_note: '日常测试使用', maintenance_cycle_days: 30, last_maintenance_at: daysAgo(5), next_maintenance_at: daysFromNow(25), storage_location: '制造部·ICT柜' });
  await stdLogs(f10, 'CUSTODY', mfg01, '制造部', 40, 30);

  // ═══ 11. IN_USE·领用逾期（expected_return_at 已过）═══
  var f11 = await insertFix({ name: '老化测试治具', spec: 'DC-12V·8通道', model: 'AGING-8', station: '老化房', category: '测试治具', status: 'IN_USE', requested_by: fqc01.id, requested_dept: 'FQC', request_note: '成品老化测试用', made_by: rd01.id, made_at: daysAgo(86), made_note: '温控精度±1°C', verified_me: fqc01.id, verified_me_at: daysAgo(84), verify_note: 'FQC确认合格', transferred_at: daysAgo(84), used_by: fqc01.id, used_at: daysAgo(45), use_location: 'FQC·老化房', expected_return_days: 30, expected_return_at: daysAgo(15), use_note: '老化测试中，原计划已逾期', maintenance_cycle_days: 60, last_maintenance_at: daysAgo(70), next_maintenance_at: daysAgo(10), storage_location: 'FQC·老化房A柜' });
  await stdLogs(f11, 'CUSTODY', fqc01, 'FQC', 90, 45);

  // ═══ 12. IN_USE·保养逾期（next_maintenance_at 已过）═══
  var f12 = await insertFix({ name: '温湿度检测治具', spec: '温-40~125°C·湿0~100%RH', model: 'TH-SENSOR', station: '环境监测站', category: '环境治具', status: 'IN_USE', requested_by: me01.id, requested_dept: '生技部', request_note: '车间环境温湿度巡检', made_by: rd01.id, made_at: daysAgo(96), made_note: '传感器Sensirion进口', verified_me: me01.id, verified_me_at: daysAgo(94), verify_note: '生技部确认合格', transferred_at: daysAgo(94), used_by: me01.id, used_at: daysAgo(90), use_location: '生技部·设备区', expected_return_days: 999, use_note: '全车间巡检用', maintenance_cycle_days: 60, last_maintenance_at: daysAgo(75), next_maintenance_at: daysAgo(15), storage_location: '生技部·仪表柜' });
  await stdLogs(f12, 'ME', me01, '生技部', 100, 90);

  // ═══ 13. REPAIRING_ME（ME维修中）═══
  var f13 = await insertFix({ name: 'AOI光学检测治具', spec: '5MP相机·环形光源', model: 'AOI-5M', station: 'AOI站', category: '检测治具', status: 'REPAIRING_ME', requested_by: mfg01.id, requested_dept: '制造部', request_note: 'SMT焊点自动检测', made_by: rd01.id, made_at: daysAgo(96), made_note: '相机分辨率2592×1944', verified_me: mfg01.id, verified_me_at: daysAgo(94), verify_note: '申请部门确认合格', transferred_at: daysAgo(94), used_by: mfg01.id, used_at: daysAgo(90), use_location: '制造部·AOI区', expected_return_days: 365, repair_type: 'ME', repair_requested_by: mfg01.id, repair_requested_at: daysAgo(2), repair_note: '光源亮度衰减，需更换LED环形灯', maintenance_cycle_days: 30, last_maintenance_at: daysAgo(60), next_maintenance_at: daysAgo(30), storage_location: '生技部·维修区' });
  await stdLogs(f13, 'CUSTODY', mfg01, '制造部', 100, 90);
  await addLog(f13.id, 'REPAIR_ME', 'CUSTODY', mfg01.id, '制造部', '报修：光源衰减', daysAgo(2));

  // ═══ 14. REPAIRING_RD（RD维修中）═══
  var f14 = await insertFix({ name: '示波器探头治具', spec: '200MHz·10:1衰减', model: 'PROBE-200', station: '调试站', category: '检测治具', status: 'REPAIRING_RD', requested_by: me01.id, requested_dept: '生技部', request_note: '高频信号测试', made_by: rd01.id, made_at: daysAgo(96), made_note: '输入阻抗10MΩ', verified_me: me01.id, verified_me_at: daysAgo(94), verify_note: '生技部确认合格', transferred_at: daysAgo(94), used_by: me01.id, used_at: daysAgo(90), use_location: '生技部·调试室', expected_return_days: 365, repair_type: 'RD', repair_requested_by: me01.id, repair_requested_at: daysAgo(1), repair_note: '探头接触不良，信号衰减严重', expected_finish_at: daysFromNow(5), maintenance_cycle_days: 60, last_maintenance_at: daysAgo(30), next_maintenance_at: daysFromNow(30), storage_location: '研发部·维修区' });
  await stdLogs(f14, 'ME', me01, '生技部', 100, 90);
  await addLog(f14.id, 'REPAIR_RD_REQ', 'ME', me01.id, '生技部', '退回RD维修：接触不良', daysAgo(1));

  // ═══ 15. REPAIR_DONE（维修完成待确认）═══
  var f15 = await insertFix({ name: '电源负载测试治具', spec: 'DC-24V·10A', model: 'LOAD-24V', station: '电源测试站', category: '测试治具', status: 'REPAIR_DONE', requested_by: qa01.id, requested_dept: '品保文管中心', request_note: '电源带载老化', made_by: rd01.id, made_at: daysAgo(96), made_note: '电子负载10A/240W', verified_me: qa01.id, verified_me_at: daysAgo(94), verify_note: '申请单位确认合格', transferred_at: daysAgo(94), used_by: qa01.id, used_at: daysAgo(90), use_location: '品保中心·电源区', expected_return_days: 180, repair_type: 'ME', repair_requested_by: qa01.id, repair_requested_at: daysAgo(8), repair_note: '电流显示偏移', repaired_by: me01.id, repaired_at: daysAgo(1), repair_done_image: '/uploads/fixtures/demo_repair1.jpg', maintenance_cycle_days: 60, last_maintenance_at: daysAgo(45), next_maintenance_at: daysFromNow(15), storage_location: '生技部·维修台' });
  await stdLogs(f15, 'QA', qa01, '品保文管中心', 100, 90);
  await addLog(f15.id, 'REPAIR_ME', 'QA', qa01.id, '品保文管中心', '报修：电流偏移', daysAgo(8));
  await addLog(f15.id, 'REPAIR_DONE', 'ME', me01.id, '生技部', '已更换采样电阻，待确认', daysAgo(1));

  // ═══ 16. IMPROVING（改善中）═══
  var f16 = await insertFix({ name: '按键寿命测试治具', spec: '50万次·力控0.5N', model: 'BTN-500K', station: '按键测试站', category: '测试治具', status: 'IMPROVING', requested_by: fqc01.id, requested_dept: 'FQC', request_note: '按键耐久测试', made_by: rd01.id, made_at: daysAgo(96), made_note: '气缸驱动，PLC控制', verified_me: fqc01.id, verified_me_at: daysAgo(94), verify_note: 'FQC确认合格', transferred_at: daysAgo(94), used_by: fqc01.id, used_at: daysAgo(90), use_location: 'FQC·测试区', expected_return_days: 365, improve_note: '增加压头适配多种按键尺寸', improvement_count: 1, improved_by: rd01.id, improved_at: daysAgo(3), expected_finish_at: daysFromNow(3), maintenance_cycle_days: 90, last_maintenance_at: daysAgo(30), next_maintenance_at: daysFromNow(60), storage_location: '研发部·改善区' });
  await stdLogs(f16, 'CUSTODY', fqc01, 'FQC', 100, 90);
  await addLog(f16.id, 'IMPROVE', 'CUSTODY', fqc01.id, 'FQC', '申请改善：增加多尺寸压头', daysAgo(5));
  await addLog(f16.id, 'ACCEPT', 'RD', rd01.id, '研发部', '接收改善任务', daysAgo(3));

  // ═══ 17. RETIRED（已报废）═══
  var f17 = await insertFix({ name: '旧版VGA测试治具', spec: 'VGA·640×480', model: 'VGA-OBS', station: '已淘汰', category: '测试治具', status: 'RETIRED', requested_by: mfg01.id, requested_dept: '制造部', request_note: '旧机型测试用（已停产）', made_by: rd01.id, made_at: daysAgo(200), made_note: '已无对应产品', verified_me: mfg01.id, verified_me_at: daysAgo(194), verify_note: '申请部门确认合格', transferred_at: daysAgo(194), used_by: mfg01.id, used_at: daysAgo(190), use_location: '制造部·仓库', retired_by: admin.id, retired_at: daysAgo(30), retired_reason: '对应机种已全部停产，治具无使用场景', maintenance_cycle_days: 90, last_maintenance_at: daysAgo(200), next_maintenance_at: daysAgo(110), storage_location: '废弃区' });
  await stdLogs(f17, 'CUSTODY', mfg01, '制造部', 200, 190);
  await addLog(f17.id, 'RETIRE', 'ADMIN', admin.id, '系统', '机种停产，治具废弃', daysAgo(30));

  console.log('导入完成：17 个治具，覆盖当前流程全部状态\n');
  var all = await query('SELECT status, COUNT(*) as cnt FROM fixtures GROUP BY status ORDER BY status');
  all.forEach(function(r) { console.log('  ' + r.status + ': ' + r.cnt + ' 个'); });
  console.log('\n日志总数：' + (await query('SELECT COUNT(*) as cnt FROM fixture_logs'))[0].cnt + ' 条');
  console.log('\n治具种子完成。');
}

module.exports = seed;
