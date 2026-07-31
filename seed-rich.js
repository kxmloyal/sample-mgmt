// 丰富演示数据导入脚本 — 各状态样品全覆盖 + 标示卡数据
// 用法: npm run seed-rich（需先 npm run seed 初始化账号）
//      node seed-rich.js --fix  修复现有样品占位图片
require('dotenv').config();
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const D = require('./db');

const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

// 生成 1x1 蓝色占位 PNG（品牌色 #2563eb）
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let j = 0; j < 8; j++) c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0); } return (c ^ 0xFFFFFFFF) >>> 0; }
function pngChunk(type, data) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(td), 0); return Buffer.concat([l, Buffer.from(type), data, cr]); }
function generatePlaceholderPNG() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ih = Buffer.alloc(13); ih.writeUInt32BE(1, 0); ih.writeUInt32BE(1, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([sig, pngChunk('IHDR', ih), pngChunk('IDAT', zlib.deflateSync(Buffer.from([0, 37, 99, 235]))), pngChunk('IEND', Buffer.alloc(0))]);
}

// 验证图片文件是否有效（PNG 文件头检查 + 最小大小）
function isValidImage(fullPath) {
  if (!fs.existsSync(fullPath)) return false;
  const stat = fs.statSync(fullPath);
  if (stat.size < 67) return false; // 最小有效 PNG ≥ 67 字节
  const head = Buffer.alloc(8);
  const fd = fs.openSync(fullPath, 'r');
  fs.readSync(fd, head, 0, 8, 0);
  fs.closeSync(fd);
  const pngSig = [137, 80, 78, 71, 13, 10, 26, 10];
  const jpgSig = [255, 216];
  if (head.every((b, i) => b === pngSig[i])) return true; // PNG
  if (head[0] === jpgSig[0] && head[1] === jpgSig[1]) return true; // JPEG
  return false;
}
async function ensureImage(sample) {
  const current = await D.getSampleById(sample.id);
  const imgPath = current.produced_image || current.image;
  // 已有有效图片则跳过
  if (imgPath) {
    const fullPath = path.join(__dirname, 'public', imgPath);
    if (isValidImage(fullPath)) return;
  }
  if (!['PRODUCED', 'RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'].includes(current.status)) return;
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const fname = current.sample_no + '.png';
  fs.writeFileSync(path.join(UPLOAD_DIR, fname), generatePlaceholderPNG());
  await D.updateSample({ ...current, produced_image: '/uploads/' + fname });
}

const NOW = new Date();
function ago(hours) { const d = new Date(NOW); d.setHours(d.getHours() - hours); return d.toISOString(); }
function fromNow(days) { const d = new Date(NOW); d.setDate(d.getDate() + days); return d.toISOString(); }

// 模拟状态流转：不 override 已由 createSample 设好的字段
async function transition(s, overrides) {
  const current = await D.getSampleById(s.id);
  return await D.updateSample({ ...current, ...overrides, updated_at: overrides.updated_at || D.nowISO() });
}

async function seed() {
  await D.init();

  // --fix 模式：为所有已有样品生成缺失的占位图片
  if (process.argv.includes('--fix')) {
    console.log('--- 修复模式：生成缺失的占位图片 ---');
    const all = await D.listSamples({});
    var fixCount = 0;
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    for (const s of all) {
      if (!['PRODUCED', 'RELEASED', 'IN_CUSTODY', 'RETURNING', 'RETIRED'].includes(s.status)) continue;
      const current = await D.getSampleById(s.id);
      const imgPath = current.produced_image || current.image;
      // 检查图片文件是否真实有效
      if (imgPath) {
        const fullPath = path.join(__dirname, 'public', imgPath);
        if (isValidImage(fullPath)) { console.log('  ✓ ' + current.sample_no + ' (有效)'); continue; }
        // 文件无效，尝试用原文件名覆盖
        const fname = path.basename(imgPath);
        try {
          fs.writeFileSync(path.join(UPLOAD_DIR, fname), generatePlaceholderPNG());
          fixCount++;
          console.log('  ✓ ' + current.sample_no + ' (修复: ' + fname + ')');
        } catch (e) {
          // 权限不足，改用新文件名
          const newFname = current.sample_no + '.png';
          fs.writeFileSync(path.join(UPLOAD_DIR, newFname), generatePlaceholderPNG());
          await D.updateSample({ ...current, produced_image: '/uploads/' + newFname });
          fixCount++;
          console.log('  ✓ ' + current.sample_no + ' (修复→' + newFname + ')');
        }
      } else {
        // 无图片记录，生成新文件
        const fname = current.sample_no + '.png';
        fs.writeFileSync(path.join(UPLOAD_DIR, fname), generatePlaceholderPNG());
        await D.updateSample({ ...current, produced_image: '/uploads/' + fname });
        fixCount++;
        console.log('  ✓ ' + current.sample_no + ' (新增: ' + fname + ')');
      }
    }
    console.log('\n修复完成：' + fixCount + ' 个样品已生成占位图片');
    return;
  }

  // ========== 1. 账号 ==========
  const accountDefs = [
    { username: 'admin', password: 'admin123', role: 'ADMIN',  dept: '系统',     display_name: '系统管理员' },
    { username: 'rd01',  password: 'rd123',    role: 'RD',    dept: '研发中心', display_name: '研发工程师' },
    { username: 'qa01',  password: 'qa123',    role: 'QA',     dept: '品保文管中心', display_name: '品保文管员' },
    { username: 'mfg01', password: 'mfg123',   role: 'CUSTODY', dept: '制造部',  display_name: '制造部保管员' },
    { username: 'fqc01', password: 'fqc123',   role: 'CUSTODY', dept: 'FQC',     display_name: 'FQC保管员' },
    { username: 'me01',  password: 'me123',    role: 'ME',     dept: '生技部',   display_name: '生技工程师' },
  ];
  console.log('--- 用户 ---');
  for (const u of accountDefs) {
    const exist = await D.getUserByUsername(u.username);
    if (!exist) {
      await D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
      console.log('  创建: ' + u.username + ' (' + u.role + ')');
    } else {
      console.log('  已存在跳过: ' + u.username);
    }
  }
  const admin = await D.getUserByUsername('admin');
  const rnd = await D.getUserByUsername('rd01');
  const me = await D.getUserByUsername('me01');
  const qa = await D.getUserByUsername('qa01');
  const store1 = await D.getUserByUsername('mfg01');
  const store2 = await D.getUserByUsername('fqc01');

  // 如已有较多样品则跳过（防止重复导入；允许 seed.js 创建的 1 个基础样品）
  const existing = await D.listSamples({});
  if (existing.length > 1) {
    console.log('\n已存在 ' + existing.length + ' 个样品，跳过演示数据导入。');
    console.log('如需重新导入请先删除 data/sample.db.sqlite 再运行。');
    await printSummary();
    return;
  }

  // ========== 2. NEW: 新建·待制作确认 (3个) ==========
  console.log('\n--- NEW 状态 ---');
  const s1 = await D.createSample({ name: '震动测试样品-A', spec: '规格: 1225·Φ80·高度45mm', model: '1225-X', station: '马达组', notes: '首批试模样品，待贴码确认', created_by: rnd.id });
  await D.addLog({ sample_id: s1.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品' });
  console.log('  ' + s1.sample_no + ' ' + s1.name);

  const s2 = await D.createSample({ name: '噪音验证样品-B', spec: '规格: 1225·DC12V·噪音<28dB', model: '1225-Y', station: '扇叶组', notes: '噪音摸底验证用', created_by: rnd.id });
  await D.addLog({ sample_id: s2.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品' });
  console.log('  ' + s2.sample_no + ' ' + s2.name);

  // 含标示卡数据的 NEW 样品（有限度信息）
  const s3 = await D.createSample({ name: '寿命测试样品-C', spec: '规格: 1225·额定转速3000RPM', model: 'X200', station: '成品组', notes: '长寿命验证，预计跑1000h', created_by: rnd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'C',
    card_version: 'V1.0', test_standard: 'Q/YS-001-2025', test_data: 'A=0.3g, B=0.5g, C=0.2g', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s3.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  console.log('  ' + s3.sample_no + ' ' + s3.name + ' [含标示卡 NG·外观·客供]');

  // ========== 3. PRODUCED: 制作完成，待品保发行 (2个) ==========
  console.log('\n--- PRODUCED 状态 ---');
  const s4 = await D.createSample({ name: '量产验证样品-D', spec: '规格: 1225·Φ80·高度45mm', model: '1225-X', station: '马达组', notes: '量产工艺验证样品', created_by: rnd.id,
    sample_type: 'OK', limit_item: 'A', source_type: 'T', card_version: 'V2.0', test_standard: 'Q/YS-振动-002', test_data: '震动≤0.5mm', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s4.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await transition(s4, { status: 'PRODUCED', produced_at: ago(2), updated_at: ago(2) });
  await D.addLog({ sample_id: s4.id, action: 'PRODUCE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '研发确认制作完成' });
  await ensureImage(s4);
  console.log('  ' + s4.sample_no + ' 量产验证样品-D [含标示卡 OK·成品震动·元山]');

  const s5 = await D.createSample({ name: '竞品对标样品-E', spec: '规格: 竞品A·Φ92·高度38mm', model: 'Y300', station: '成品组', notes: '竞品对标分析用样品', created_by: rnd.id });
  await D.addLog({ sample_id: s5.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品' });
  await transition(s5, { status: 'PRODUCED', produced_at: ago(5), updated_at: ago(5) });
  await D.addLog({ sample_id: s5.id, action: 'PRODUCE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '研发确认制作完成' });
  await ensureImage(s5);
  console.log('  ' + s5.sample_no + ' 竞品对标样品-E');

  // ========== 4. RELEASED: 已发行，待保管接收 (3个) ==========
  console.log('\n--- RELEASED 状态 ---');

  // RD 创建的调机样
  const s6 = await D.createSample({ name: '调机验证样品-F', spec: '规格: 1225·DC24V·IP55', model: '1225-P', station: '调机样', notes: '调机工艺验证样品', created_by: rnd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'G', card_version: 'V1.0', test_standard: 'Q/YS-调机-003', test_data: '调机参数OK', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s6.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建调机样（含标示卡）' });
  await transition(s6, { status: 'PRODUCED', produced_at: ago(48), updated_at: ago(48) });
  await D.addLog({ sample_id: s6.id, action: 'PRODUCE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '研发确认制作完成' });
  await transition(s6, { status: 'RELEASED', released_at: ago(24), release_cycle_days: 90, next_inspect_at: fromNow(90 - 1), updated_at: ago(24) });
  await D.addLog({ sample_id: s6.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期90天' });
  console.log('  ' + s6.sample_no + ' 调机验证样品-F [含标示卡 OK·特殊工站·塔岗, 90天周期]');

  const s7 = await D.createSample({ name: '客户端承认样品-G', spec: '规格: 1225·DC24V·IP55', model: '1225-P', station: '成品组', notes: '客户承认用样品，需分发至制造部', created_by: rnd.id,
    sample_type: 'OK', limit_item: 'C', source_type: 'C', card_version: 'V3.0', test_standard: 'Q/YS-外观-004', test_data: '无划伤/无毛刺/颜色一致', signed_by_rd: '研发工程师', signed_by_qa: '品保文管员' });
  await D.addLog({ sample_id: s7.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await transition(s7, { status: 'PRODUCED', produced_at: ago(72), updated_at: ago(72) });
  await D.addLog({ sample_id: s7.id, action: 'PRODUCE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '研发确认制作完成' });
  await transition(s7, { status: 'RELEASED', released_at: ago(36), release_cycle_days: 180, next_inspect_at: fromNow(180), updated_at: ago(36) });
  await D.addLog({ sample_id: s7.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期180天，标示卡QA已签署' });
  console.log('  ' + s7.sample_no + ' 客户端承认样品-G [含标示卡 OK·外观·客供, 180天周期, QA已签]');

  const s8 = await D.createSample({ name: '年度稽核留样-H', spec: '规格: 1225·Φ80·高度45mm', model: '1225-X', station: '马达组', notes: '年度体系稽核留样', created_by: rnd.id });
  await D.addLog({ sample_id: s8.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品' });
  await transition(s8, { status: 'PRODUCED', produced_at: ago(60), updated_at: ago(60) });
  await D.addLog({ sample_id: s8.id, action: 'PRODUCE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '研发确认制作完成' });
  await transition(s8, { status: 'RELEASED', released_at: ago(12), release_cycle_days: 365, next_inspect_at: fromNow(365), updated_at: ago(12) });
  await D.addLog({ sample_id: s8.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期365天' });
  console.log('  ' + s8.sample_no + ' 年度稽核留样-H（365天周期）');

  // ========== 5. IN_CUSTODY: 保管中 (4个，含逾期/将到期) ==========
  console.log('\n--- IN_CUSTODY 状态 ---');

  async function fullFlow(s, producedH, releaseH, cycleDays, inspectOffset, custodyUser, custodyDept, location) {
    await transition(s, { status: 'PRODUCED', produced_at: ago(producedH || 168), updated_at: ago(producedH || 168) });
    await D.addLog({ sample_id: s.id, action: 'PRODUCE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '研发确认制作完成' });
    await ensureImage(s);
    await transition(s, { status: 'RELEASED', released_at: ago(releaseH || 120), release_cycle_days: cycleDays, next_inspect_at: fromNow(inspectOffset), updated_at: ago(releaseH || 120) });
    await D.addLog({ sample_id: s.id, action: 'RELEASE', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '正式发行，复检周期' + cycleDays + '天' });
    await transition(s, { status: 'IN_CUSTODY', custody_dept: custodyDept, storage_location: location, updated_at: ago(Math.min(producedH, releaseH) - 24) });
    await D.addLog({ sample_id: s.id, action: 'CUSTODY', role: custodyUser.role, user_id: custodyUser.id, dept: custodyDept, location: location, note: '部门接收保管' });
  }

  const s9 = await D.createSample({ name: '产线日常监控-I', spec: '规格: 1225·Φ80·高度45mm', model: '1225-X', station: '马达组', notes: '产线日常品质监控样品', created_by: rnd.id,
    sample_type: 'NG', limit_item: 'P', source_type: 'T', card_version: 'V2.1', test_standard: 'Q/YS-成品-005', test_data: 'RPM=2950, I=0.35A', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s9.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s9, 168, 120, 90, 60, store1, '制造部', 'A区-3架-2层');
  console.log('  ' + s9.sample_no + ' 产线日常监控-I [含标示卡 NG·成品检测·元山, 90天周期, 60天后复检]');

  const s10 = await D.createSample({ name: '出货检验留样-J', spec: '规格: 1225·Φ80·高度45mm', model: '1225-X', station: '成品组', notes: '出货检验留样，需尽快复检', created_by: rnd.id,
    sample_type: 'OK', limit_item: 'B', source_type: 'C', card_version: 'V1.2', test_standard: 'Q/YS-异音-006', test_data: '噪音≤30dB', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s10.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s10, 200, 150, 90, 3, store1, '制造部', 'A区-2架-1层');
  console.log('  ' + s10.sample_no + ' 出货检验留样-J [含标示卡 OK·异音·客供, 90天周期, 3天后复检(即将到期)]');

  const s11 = await D.createSample({ name: '客诉追溯留样-K', spec: '规格: 竞品B·Φ92·高度38mm', model: 'Y300', station: '成品组', notes: '客诉追溯样品，已逾期未复检', created_by: rnd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'G', card_version: 'V1.0', test_standard: 'Q/YS-外观-004', test_data: 'A面划伤, B面毛刺', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s11.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡，客诉追溯）' });
  await fullFlow(s11, 300, 250, 60, -15, store2, 'FQC', 'B区-3架-2层');
  console.log('  ' + s11.sample_no + ' 客诉追溯留样-K [含标示卡 NG·外观·塔岗, 60天周期, 已逾期15天(已过期)]');

  const s12 = await D.createSample({ name: '年度型式试验-L', spec: '规格: 1225·DC24V·IP55', model: '1225-P', station: '成品组', notes: '年度型式试验留样', created_by: rnd.id,
    sample_type: 'OK', limit_item: 'X', source_type: 'T', card_version: 'V4.0', test_standard: 'Q/YS-特殊-007', test_data: '全项通过', signed_by_rd: '研发工程师', signed_by_qa: '品保文管员' });
  await D.addLog({ sample_id: s12.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s12, 400, 350, 180, 120, store1, '制造部', 'C区-5架-3层');
  console.log('  ' + s12.sample_no + ' 年度型式试验-L [含标示卡 OK·特殊工站·元山, 180天周期, 120天后复检, QA已签]');

  // ========== 6. RETURNING: 退回审核中 (1个) ==========
  console.log('\n--- RETURNING 状态 ---');

  const s13 = await D.createSample({ name: '退回审核样品-M', spec: '规格: 1225·Φ80·高度45mm', model: '1225-X', station: '马达组', notes: '保管申请退回，等待品保审核', created_by: rnd.id,
    sample_type: 'NG', limit_item: 'C', source_type: 'T', card_version: 'V1.0', test_standard: 'Q/YS-外观-004', test_data: 'A面划伤', signed_by_rd: '研发工程师' });
  await D.addLog({ sample_id: s13.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s13, 100, 80, 90, 60, store1, '制造部', 'A区-3架-2层');
  await transition(s13, { status: 'RETURNING', retired_reason: '样品外观损坏，需重新制作', updated_at: ago(1) });
  await D.addLog({ sample_id: s13.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: store1.id, dept: '制造部', note: '样品外观损坏，申请退回处理' });
  console.log('  ' + s13.sample_no + ' 退回审核样品-M [含标示卡 NG·外观·元山, RETURNING状态]');

  // ========== 7. RETIRED: 已作废 (1个) ==========
  console.log('\n--- RETIRED 状态 ---');

  const s14 = await D.createSample({ name: '已作废样品-N', spec: '规格: 1225·DC12V·噪音<28dB', model: '1225-Y', station: '扇叶组', notes: '品保确认作废', created_by: rnd.id,
    sample_type: 'OK', limit_item: 'B', source_type: 'C', card_version: 'V2.0', test_standard: 'Q/YS-异音-006', test_data: '噪音≤30dB', signed_by_rd: '研发工程师', signed_by_qa: '品保文管员' });
  await D.addLog({ sample_id: s14.id, action: 'CREATE', role: 'RD', user_id: rnd.id, dept: '研发中心', note: '新建样品（含标示卡）' });
  await fullFlow(s14, 120, 100, 90, 60, store1, '制造部', 'A区-3架-2层');
  await transition(s14, { status: 'RETURNING', updated_at: ago(2) });
  await D.addLog({ sample_id: s14.id, action: 'RETURN_REQUEST', role: 'CUSTODY', user_id: store1.id, dept: '制造部', note: '样品过期，申请退回' });
  await transition(s14, { status: 'RETIRED', retired_reason: '样品过期无法使用，确认作废', updated_at: ago(1) });
  await D.addLog({ sample_id: s14.id, action: 'RETIRE_ONLY', role: 'QA', user_id: qa.id, dept: '品保文管中心', note: '样品过期无法使用，确认作废' });
  console.log('  ' + s14.sample_no + ' 已作废样品-N [含标示卡 OK·异音·客供, RETIRED状态]');

  // ========== 汇总 ==========
  await printSummary();
}

async function printSummary() {
  console.log('\n========== 汇总 ==========');
  const all = await D.listSamples({});
  const cnt = { NEW: 0, PRODUCED: 0, RELEASED: 0, IN_CUSTODY: 0, RETURNING: 0, RETIRED: 0 };
  for (const s of all) cnt[s.status] = (cnt[s.status] || 0) + 1;
  console.log('  用户: ' + await D.listUsers().length + ' 个');
  console.log('  样品: ' + all.length + ' 个');
  console.log('    NEW(待制作):        ' + cnt.NEW);
  console.log('    PRODUCED(待发行):    ' + cnt.PRODUCED);
  console.log('    RELEASED(待接收):    ' + cnt.RELEASED);
  console.log('    IN_CUSTODY(保管中):  ' + cnt.IN_CUSTODY);
  console.log('    RETURNING(退回审核中): ' + cnt.RETURNING);
  console.log('    RETIRED(已作废):      ' + cnt.RETIRED);

  const overdue = all.filter(s => s.status === 'IN_CUSTODY' && s.next_inspect_at && new Date(s.next_inspect_at).getTime() < Date.now());
  const dueSoon = all.filter(s => s.status === 'IN_CUSTODY' && s.next_inspect_at && new Date(s.next_inspect_at).getTime() >= Date.now() && new Date(s.next_inspect_at).getTime() < Date.now() + 7 * 864e5);
  const hasCard = all.filter(s => s.sample_type || s.limit_item || s.source_type);
  console.log('  含标示卡: ' + hasCard.length + ' | 逾期: ' + overdue.length + ' | 7天内到期: ' + dueSoon.length);
  console.log('');
  console.log('演示账号: admin/admin123 | rd01/rd123 | qa01/qa123 | mfg01/mfg123 | fqc01/fqc123 | me01/me123');
}

seed().catch(e => { console.error(e); process.exit(1); });
