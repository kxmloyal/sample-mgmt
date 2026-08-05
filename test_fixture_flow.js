// 端到端流程测试：治具申请→RD接收→上传文件→制作→单人验证→领用→归还→改善→报废
// 覆盖最新状态机：VERIFY 为单人验证（申请部门/ME/QA/CUSTODY），MAKE 需 design_drawing+fixture_photo
require('dotenv').config(); const D = require('./db');
const BASE = 'http://localhost:' + (process.env.PORT || '4000');
const cookies = {};

async function call(method, path, body, who) {
  const headers = { 'Content-Type': 'application/json' };
  if (cookies[who]) headers['Cookie'] = cookies[who];
  const r = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie');
  if (sc && who) cookies[who] = sc.split(';')[0];
  let data = null;
  try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}

async function login(who, user, pass) {
  const r = await call('POST', '/api/login', { username: user, password: pass }, who);
  console.log('登录', user, '->', r.status, r.data ? r.data.role : 'FAIL');
  return r;
}

function assert(cond, msg) {
  if (!cond) { console.error('  ✗ FAIL:', msg); process.exitCode = 1; }
  else console.log('  ✓', msg);
}

// multipart 上传辅助（与 test_fixture_files.js 共用写法）
var CRLF = '\r\n';
function buildMultipart(fields, boundary) {
  var bufs = [];
  function w(s) { bufs.push(Buffer.from(s)); }
  Object.keys(fields).forEach(function(k) {
    var v = fields[k];
    w('--' + boundary + CRLF);
    if (v && v.buffer) {
      w('Content-Disposition: form-data; name="' + k + '"; filename="' + (v.filename || 'file') + '"' + CRLF);
      w('Content-Type: ' + (v.contentType || 'application/octet-stream') + CRLF);
      w(CRLF);
      bufs.push(Buffer.isBuffer(v.buffer) ? v.buffer : Buffer.from(v.buffer));
      w(CRLF);
    } else {
      w('Content-Disposition: form-data; name="' + k + '"' + CRLF);
      w(CRLF);
      w(String(v) + CRLF);
    }
  });
  w('--' + boundary + '--' + CRLF);
  return Buffer.concat(bufs);
}
async function uploadFile(url, fields, who) {
  var boundary = '----TestBoundary' + Math.random().toString(36).substring(2);
  var body = buildMultipart(fields, boundary);
  var headers = { 'Content-Type': 'multipart/form-data; boundary=' + boundary };
  if (cookies[who]) headers['Cookie'] = cookies[who];
  var resp = await fetch(BASE + url, { method: 'POST', body: body, headers: headers });
  var txt = await resp.text();
  try { return { status: resp.status, data: JSON.parse(txt) }; }
  catch(e) { return { status: resp.status, data: txt }; }
}

(async () => {
  await D.init();

  // ---- 登录所有测试角色（分批次，避免触发登录限流 10次/分钟/IP） ----
  await login('me', 'me01', 'me123');
  await login('rd', 'rd01', 'rd123');
  await new Promise(r => setTimeout(r, 1000));
  await login('fqc', 'fqc01', 'fqc123');
  await login('admin', 'admin', 'admin123');

  var meInfo = await call('GET', '/api/me', null, 'me');
  var meId = meInfo.data.id;
  console.log('me01 id:', meId, 'dept:', meInfo.data.dept);

  // === 场景1: me01 新建申请治具 ===
  var mk = await call('POST', '/api/fixtures', {
    name: 'E2E测试治具', spec: 'SPEC-E2E', model: 'M-001', station: 'ST1', category: '测试治具',
    request_note: 'E2E测试申请'
  }, 'me');
  assert(mk.status === 200 && mk.data.fixture_no, '场景1: 新建申请成功: ' + (mk.data && mk.data.fixture_no));
  var fixNo = mk.data.fixture_no;
  var fixId = mk.data.id;
  assert(mk.data.status === 'REQUESTED', '  状态=已申请');
  assert(mk.data.requested_dept === '生技部', '  申请部门=生技部');
  assert(String(mk.data.requested_by) === String(meId), '  申请人=me01');

  // === 场景2: rd01 扫码接收 ===
  var sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'ACCEPT', expectedDays: 7, note: '接收测试' }, 'rd');
  assert(sc.status === 200, '场景2: RD接收成功: ' + sc.status);
  assert(sc.data.fixture.status === 'ACCEPTED', '  状态→已接收');
  assert(sc.data.fixture.expected_finish_at, '  预计完成日已设置: ' + sc.data.fixture.expected_finish_at);

  // === 场景3: me01 查看清单 显示「已接收」+ 预计完成日 ===
  var list = await call('GET', '/api/fixtures?status=ACCEPTED', null, 'me');
  assert(list.status === 200, '场景3: 清单查询成功');
  var foundFix = list.data.fixtures.find(function(f) { return f.fixture_no === fixNo; });
  assert(foundFix && foundFix.status === 'ACCEPTED', '  清单显示已接收状态');
  assert(foundFix.expected_finish_at, '  清单显示预计完成日');

  // === 场景4: rd01 未上传设计图纸时 MAKE → allowedActions 不含 MAKE → 409 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'MAKE', note: '制作完成测试' }, 'rd');
  assert(sc.status === 409, '场景4: 无设计图纸MAKE被拒绝: ' + sc.status);

  // === 场景5: 上传设计图纸 + 实物照片（MAKE 前置条件） ===
  var up1 = await uploadFile('/api/fixtures/' + fixId + '/files', {
    file: { buffer: Buffer.from('%PDF-1.4\nfake pdf\n'), filename: '设计图纸.pdf', contentType: 'application/pdf' },
    category: 'design_drawing'
  }, 'rd');
  assert(up1.status === 200, '场景5a: 上传设计图纸成功: ' + up1.status);

  // 仅有图纸无照片 → allowedActions 无 MAKE → 409
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'MAKE', note: '制作完成测试' }, 'rd');
  assert(sc.status === 409, '场景5b: 缺实物照片MAKE被拒绝(409): ' + sc.status);

  var up2 = await uploadFile('/api/fixtures/' + fixId + '/files', {
    file: { buffer: Buffer.from('fake png data'), filename: '实物照片.png', contentType: 'image/png' },
    category: 'fixture_photo'
  }, 'rd');
  assert(up2.status === 200, '场景5c: 上传实物照片成功: ' + up2.status);

  // === 场景6: rd01 扫码制作（两类文件已齐） ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'MAKE', note: '制作完成测试' }, 'rd');
  assert(sc.status === 200, '场景6: RD制作成功');
  assert(sc.data.fixture.status === 'VERIFY_PENDING', '  状态→待验证');

  // === 场景7: rd01 尝试验证 → 应被拒绝（单人验证：仅申请部门/ME/QA/CUSTODY） ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY', location: 'A库-1架', note: 'RD尝试验证' }, 'rd');
  assert(sc.status === 409, '场景7: RD越权验证被拒绝(409): ' + sc.status);

  // === 场景8: me01 单人验证（申请部门人员，需 location） ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY', location: 'A库-1架', note: '生技部验证通过' }, 'me');
  assert(sc.status === 200, '场景8: 申请单位单人验证成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');
  assert(sc.data.fixture.storage_location === 'A库-1架', '  存放位置已记录');

  // === 场景9: fqc01 越权验证（CUSTODY 属于验证方，验证治具2） ===
  var mk2 = await call('POST', '/api/fixtures', { name: 'E2E-验证测试', spec: 'SPEC-V2', station: 'ST2', request_note: 'CUSTODY验证测试' }, 'me');
  var fixNo2 = mk2.data.fixture_no;
  var fixId2 = mk2.data.id;
  assert(mk2.status === 200 && fixNo2, '场景9-prep: 新建治具2成功');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'ACCEPT', expectedDays: 3 }, 'rd');
  assert(sc.status === 200, '  RD接收治具2');
  var up3 = await uploadFile('/api/fixtures/' + fixId2 + '/files', {
    file: { buffer: Buffer.from('%PDF-1.4\nfake pdf\n'), filename: '图纸.pdf', contentType: 'application/pdf' }, category: 'design_drawing'
  }, 'rd');
  assert(up3.status === 200, '  上传治具2图纸');
  var up4 = await uploadFile('/api/fixtures/' + fixId2 + '/files', {
    file: { buffer: Buffer.from('fake png'), filename: '照片.png', contentType: 'image/png' }, category: 'fixture_photo'
  }, 'rd');
  assert(up4.status === 200, '  上传治具2照片');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'MAKE' }, 'rd');
  assert(sc.status === 200 && sc.data.fixture.status === 'VERIFY_PENDING', '  RD制作治具2→待验证');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'VERIFY', location: 'B库-2架', note: 'CUSTODY验证' }, 'fqc');
  assert(sc.status === 200, '场景9: fqc01(CUSTODY)单人验证成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');

  // === 场景10: me01 扫码领用（需 location + days） ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'USE', location: 'A线-3号工位', days: 30, note: '测试领用' }, 'me');
  assert(sc.status === 200, '场景10: 领用成功');
  assert(sc.data.fixture.status === 'IN_USE', '  状态→领用中');
  assert(sc.data.fixture.use_location === 'A线-3号工位', '  使用位置已记录');
  assert(sc.data.fixture.expected_return_days === 30, '  预计使用天数=30');

  // 领用缺 days → 400
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'USE', location: 'B线-1号工位' }, 'me');
  assert(sc.status === 400, '  领用缺预计天数被拒绝(400): ' + sc.status);

  // === 场景11: me01 扫码归还 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'RETURN', note: '使用完毕归还' }, 'me');
  assert(sc.status === 200, '场景11: 归还成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');

  // === 场景12: me01 扫码申请改善 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'IMPROVE', note: '增加防呆装置，提升定位精度' }, 'me');
  assert(sc.status === 200, '场景12: 申请改善成功');
  assert(sc.data.fixture.status === 'IMPROVING', '  状态→改善中');

  // === 场景13: rd01 扫码改善完成 → 重新待验证 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'IMPROVE_DONE', note: '防呆装置已加装，精度测试OK' }, 'rd');
  assert(sc.status === 200, '场景13: 改善完成成功');
  assert(sc.data.fixture.status === 'VERIFY_PENDING', '  状态→待验证（重新验证）');
  assert(sc.data.fixture.improvement_count === 1, '  improvement_count=1');
  assert(sc.data.fixture.improved_by, '  改善人已记录');

  // === 场景14: 改善后单人验证 → 已移交 + 版次 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY', location: 'A库-1架', note: '改善后验证' }, 'me');
  assert(sc.status === 200, '场景14: 改善后单人验证成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');
  var detail = await call('GET', '/api/fixtures/' + fixId, null, 'me');
  assert(detail.status === 200 && detail.data.improvement_count === 1, '  详情显示 improvement_count=1（版次V1）');

  // === 场景15: me01 撤销自己的申请（治具3） ===
  var mk3 = await call('POST', '/api/fixtures', { name: 'E2E-撤销测试', spec: 'SPEC-CANCEL', station: 'ST3', request_note: '撤销测试' }, 'me');
  var fixNo3 = mk3.data.fixture_no;
  assert(mk3.status === 200 && fixNo3, '场景15-prep: 新建治具3成功');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo3, action: 'CANCEL', note: '测试撤销' }, 'me');
  assert(sc.status === 200, '场景15: 申请人撤销成功');
  assert(sc.data.fixture.status === 'RETIRED', '  状态→已报废');
  assert(sc.data.fixture.retired_reason === '测试撤销', '  作废原因已记录');

  // === 场景16: fqc01 撤销他人的申请 → 应被拒绝 ===
  var mk4 = await call('POST', '/api/fixtures', { name: 'E2E-撤销越权', spec: 'SPEC-CANCEL2', station: 'ST4', request_note: '撤销越权测试' }, 'me');
  var fixNo4 = mk4.data.fixture_no;
  var scDeny = await call('POST', '/api/fixtures/scan', { code: fixNo4, action: 'CANCEL', note: 'fqc尝试撤销' }, 'fqc');
  assert(scDeny.status === 409, '场景16: fqc01越权撤销被拒绝(409): ' + scDeny.status);

  // === 场景17: admin 报废非终态治具 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'RETIRE', note: '管理员测试报废' }, 'admin');
  assert(sc.status === 200, '场景17: 管理员报废成功');
  assert(sc.data.fixture.status === 'RETIRED', '  状态→已报废');

  // 治具2 由 admin 一并报废清理
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'RETIRE', note: '管理员清理' }, 'admin');
  assert(sc.status === 200 && sc.data.fixture.status === 'RETIRED', '  治具2报废清理完成');

  console.log('\n治具生命周期 E2E 测试完成。退出码:', process.exitCode || 0);
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
