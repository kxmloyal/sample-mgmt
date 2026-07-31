// 端到端流程测试：治具申请→RD接收→制作→双人验证→领用→归还→改善→版次控制
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

(async () => {
  await D.init();

  // ---- 登录所有测试角色（分批次，避免触发速率限制） ----
  await login('me', 'me01', 'me123');
  await login('rd', 'rd01', 'rd123');
  await new Promise(r => setTimeout(r, 1000));
  await login('fqc', 'fqc01', 'fqc123');
  await login('admin', 'admin', 'admin123');

  // 获取 me01 用户信息（用于后续校验）
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

  // === 场景2: rd01 扫码接收 ===
  var sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'ACCEPT', expectedDays: 7, note: '接收测试' }, 'rd');
  assert(sc.status === 200, '场景2: RD接收成功: ' + sc.status);
  assert(sc.data.fixture.status === 'ACCEPTED', '  状态→已接收');
  assert(sc.data.fixture.expected_finish_at, '  预计完成日已设置: ' + sc.data.fixture.expected_finish_at);

  // === 场景3: me01 查看清单 显示「已接收」+ 预计完成日 ===
  var list = await call('GET', '/api/fixtures?status=ACCEPTED', null, 'me');
  assert(list.status === 200, '场景3: 清单查询成功');
  var foundFix = list.data.find(function(f) { return f.fixture_no === fixNo; });
  assert(foundFix && foundFix.status === 'ACCEPTED', '  清单显示已接收状态');
  assert(foundFix.expected_finish_at, '  清单显示预计完成日');

  // === 场景4: rd01 扫码制作 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'MAKE', note: '制作完成测试' }, 'rd');
  assert(sc.status === 200, '场景4: RD制作成功');
  assert(sc.data.fixture.status === 'VERIFY_PENDING', '  状态→待双人验证');

  // === 场景5: rd01 扫码RD验证 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY_RD', note: 'RD验证通过' }, 'rd');
  assert(sc.status === 200, '场景5: RD验证成功');
  assert(sc.data.fixture.status === 'VERIFY_RD_OK', '  状态→RD已确认(待申请单位)');

  // === 场景6: me01 扫码验证（dept匹配） ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY_ORG', note: '生技部验证通过' }, 'me');
  assert(sc.status === 200, '场景6: 申请单位验证成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');

  // === 场景7: fqc01 扫码验证（dept不匹配）→ 应被拒绝 ===
  // 先做另一个治具来测试这个场景，或者直接测 fqc01 对已有治具的验证
  // 创建一个新的治具，让 rd01 接收→制作→仅RD验证（状态=VERIFY_RD_OK）
  var mk2 = await call('POST', '/api/fixtures', {
    name: 'E2E-越权测试', spec: 'SPEC-DENY', station: 'ST2', request_note: '越权测试'
  }, 'me');
  var fixNo2 = mk2.data.fixture_no;
  assert(mk2.status === 200, '场景7-prep: 新建治具2成功');

  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'ACCEPT', expectedDays: 3 }, 'rd');
  assert(sc.status === 200, '  RD接收治具2');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'MAKE' }, 'rd');
  assert(sc.status === 200, '  RD制作治具2');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'VERIFY_RD' }, 'rd');
  assert(sc.status === 200, '  RD验证治具2→VERIFY_RD_OK');

  // fqc01 尝试 VERIFY_ORG（dept=品保文管中心 vs 生技部）
  var scDeny = await call('POST', '/api/fixtures/scan', { code: fixNo2, action: 'VERIFY_ORG', note: '品保尝试验证' }, 'fqc');
  assert(scDeny.status !== 200, '场景7: fqc01越权验证被拒绝: ' + scDeny.status);
  assert(scDeny.data && scDeny.data.error && scDeny.data.error.indexOf('申请单位') !== -1, '  错误信息含"申请单位"');

  // === 场景8: me01 扫码领用 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'USE', location: 'A线-3号工位', days: 30, note: '测试领用' }, 'me');
  assert(sc.status === 200, '场景8: 领用成功');
  assert(sc.data.fixture.status === 'IN_USE', '  状态→领用中');
  assert(sc.data.fixture.use_location === 'A线-3号工位', '  使用位置已记录');
  assert(sc.data.fixture.expected_return_days === 30, '  预计使用天数=30');

  // === 场景9: me01 扫码归还 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'RETURN', note: '使用完毕归还' }, 'me');
  assert(sc.status === 200, '场景9: 归还成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');

  // === 场景10: me01 扫码申请改善 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'IMPROVE', note: '增加防呆装置，提升定位精度' }, 'me');
  assert(sc.status === 200, '场景10: 申请改善成功');
  assert(sc.data.fixture.status === 'IMPROVING', '  状态→改善中');
  assert(sc.data.fixture.improve_note === '增加防呆装置，提升定位精度', '  改善说明已记录');

  // === 场景11: rd01 扫码改善完成 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'IMPROVE_DONE', note: '防呆装置已加装，精度测试OK' }, 'rd');
  assert(sc.status === 200, '场景11: 改善完成成功');
  assert(sc.data.fixture.status === 'VERIFY_PENDING', '  状态→待双人验证（重新验证）');
  assert(sc.data.fixture.improvement_count === 1, '  improvement_count=1');
  assert(sc.data.fixture.improved_by, '  改善人已记录');

  // === 场景12: 改善后验证通过 → 显示版次 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY_RD', note: '改善后RD验证' }, 'rd');
  assert(sc.status === 200, '场景12: 改善后RD验证成功');
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'VERIFY_ORG', note: '改善后生技部验证' }, 'me');
  assert(sc.status === 200, '  改善后申请单位验证成功');
  assert(sc.data.fixture.status === 'TRANSFERRED', '  状态→已移交');

  // 验证版次在详情中显示
  var detail = await call('GET', '/api/fixtures/' + fixId, null, 'me');
  assert(detail.status === 200, '  详情查询成功');
  assert(detail.data.improvement_count === 1, '  详情显示 improvement_count=1（版次V1）');

  // --- 为场景13准备：创建一个新治具用于撤销测试 ---
  var mk3 = await call('POST', '/api/fixtures', {
    name: 'E2E-撤销测试', spec: 'SPEC-CANCEL', station: 'ST3', request_note: '撤销测试'
  }, 'me');
  var fixNo3 = mk3.data.fixture_no;
  assert(mk3.status === 200 && fixNo3, '场景13-prep: 新建治具3成功');

  // === 场景13: me01 撤销自己的申请 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo3, action: 'CANCEL', note: '测试撤销' }, 'me');
  assert(sc.status === 200, '场景13: 申请人撤销成功');
  assert(sc.data.fixture.status === 'RETIRED', '  状态→已报废');
  assert(sc.data.fixture.retired_reason === '测试撤销', '  作废原因已记录');

  // === 场景14: fqc01 撤销他人的申请 ===
  var mk4 = await call('POST', '/api/fixtures', {
    name: 'E2E-撤销越权', spec: 'SPEC-CANCEL2', station: 'ST4', request_note: '撤销越权测试'
  }, 'me');
  var fixNo4 = mk4.data.fixture_no;
  var scDeny2 = await call('POST', '/api/fixtures/scan', { code: fixNo4, action: 'CANCEL', note: 'fqc尝试撤销' }, 'fqc');
  assert(scDeny2.status !== 200, '场景14: fqc01越权撤销被拒绝: ' + scDeny2.status);

  // === 场景15: admin 报废非终态治具 ===
  sc = await call('POST', '/api/fixtures/scan', { code: fixNo, action: 'RETIRE', note: '管理员测试报废' }, 'admin');
  assert(sc.status === 200, '场景15: 管理员报废成功');
  assert(sc.data.fixture.status === 'RETIRED', '  状态→已报废');

  console.log('\n治具生命周期 E2E 测试完成。退出码:', process.exitCode || 0);
  process.exit(process.exitCode || 0);
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
