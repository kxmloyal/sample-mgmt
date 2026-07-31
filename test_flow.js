// 端到端流程测试：研发建样→制作→品保发行(周期)→保管(储位)
require('dotenv').config(); const D = require('./db');
const BASE = 'http://localhost:' + (process.env.PORT || '3000');
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
  console.log(`登录 ${user} ->`, r.status, r.data && r.data.role);
  return r;
}
function assert(cond, msg) { if (!cond) { console.error('  ✗ FAIL:', msg); process.exitCode = 1; } else console.log('  ✓', msg); }

(async () => {
  await D.init();
  // 登录三角色 + ME
  await login('rd', 'rd01', 'rd123');
  await login('qa', 'qa01', 'qa123');
  await login('store', 'mfg01', 'mfg123');
  await login('me', 'me01', 'me123');

  // 1) 研发新建样品
  const mk = await call('POST', '/api/samples', { name: '测试样品-X', spec: 'SPEC-X' }, 'rd');
  assert(mk.status === 200 && mk.data.sample_no, '研发新建样品成功: ' + (mk.data && mk.data.sample_no));
  const no = mk.data.sample_no;

  // 2) 研发扫码 -> 制作完成（需上传制作照片）
  let sc = await call('POST', '/api/scan', { code: no, image: 'data:image/png;base64,iVBORw0KGgo=' }, 'rd');
  assert(sc.status === 200 && sc.data.sample.status === 'PRODUCED', '研发扫码→制作完成: ' + (sc.data && sc.data.sample.status));

  // 越权：研发再扫应无效（非 NEW）
  sc = await call('POST', '/api/scan', { code: no }, 'rd');
  assert(sc.status === 409, '研发重复扫码被拦截(409)');

  // 3) 品保扫码 -> 已发行 + 复检周期90天
  sc = await call('POST', '/api/scan', { code: no, cycleDays: 90, sample_type: 'OK', limit_item: 'A' }, 'qa');
  assert(sc.status === 200 && sc.data.sample.status === 'RELEASED' && sc.data.sample.release_cycle_days === 90, '品保扫码→已发行,周期90天');
  assert(sc.data.sample.next_inspect_at, '下次复检已计算: ' + sc.data.sample.next_inspect_at);

  // 越权：品保再扫应被拒绝（有 INSPECT/EDIT_CARD 但无必填照片则 400）
  sc = await call('POST', '/api/scan', { code: no }, 'qa');
  assert(sc.status === 400, '品保重复扫码被拦截(400)');

  // 4) 保管扫码 -> 保管中 + 储位
  sc = await call('POST', '/api/scan', { code: no, location: 'A区-3架-2层' }, 'store');
  assert(sc.status === 200 && sc.data.sample.status === 'IN_CUSTODY', '保管扫码→保管中');
  assert(sc.data.sample.custody_dept === '制造部' && sc.data.sample.storage_location === 'A区-3架-2层', '保管部门/储位已记录');

  // 5) 看板(品保视角) 应有该样品在保管中
  const dash = await call('GET', '/api/dashboard', null, 'qa');
  assert(dash.status === 200 && dash.data.byStatus.IN_CUSTODY >= 1, '看板统计保管中≥1: ' + JSON.stringify(dash.data.byStatus));

  // 6) 日志应包含 4 条（CREATE/PRODUCE/RELEASE/CUSTODY）
  const logs = await call('GET', '/api/logs', null, 'qa');
  const acts = logs.data.map(l => l.action);
  assert(acts.includes('PRODUCE') && acts.includes('RELEASE') && acts.includes('CUSTODY'), '操作日志含 PRODUCE/RELEASE/CUSTODY: ' + acts.join(','));

  // 7) 解析接口：保管员对已保管样品再扫，应可修改储位或申请退回
  const res = await call('GET', '/api/resolve?code=' + encodeURIComponent(no), null, 'store');
  assert(res.status === 200 && res.data.allowedActions && res.data.allowedActions.length >= 1, '保管员对已保管样品再扫 allowedActions 非空: ' + JSON.stringify(res.data.allowedActions));

  // 8) 保管申请退回 → 品保审核
  const ret = await call('POST', '/api/scan', { code: no, action: 'RETURN_REQUEST', note: '测试退回原因' }, 'store');
  assert(ret.status === 200 && ret.data.sample.status === 'RETURNING', '保管申请退回→退回审核中: ' + (ret.data && ret.data.sample.status));

  // 9) 品保审核退回：直接作废
  const retire = await call('POST', '/api/scan', { code: no, action: 'RETIRE_ONLY', note: '测试作废' }, 'qa');
  assert(retire.status === 200 && retire.data.sample.status === 'RETIRED', '品保审核→直接作废: ' + (retire.data && retire.data.sample.status));

  // 10) 已作废样品 resolve：无操作
  const resRetired = await call('GET', '/api/resolve?code=' + encodeURIComponent(no), null, 'qa');
  assert(resRetired.status === 200 && resRetired.data.allowedActions.length === 0, '已作废样品 resolve allowedActions=[]');

  // 11) 日志应包含 RETURN_REQUEST / RETIRE_ONLY
  const logs2 = await call('GET', '/api/logs', null, 'qa');
  const acts2 = logs2.data.map(l => l.action);
  assert(acts2.includes('RETURN_REQUEST') && acts2.includes('RETIRE_ONLY'), '操作日志含 RETURN_REQUEST/RETIRE_ONLY: ' + acts2.join(','));

  // ---- ME 角色 + RETIRE_RECREATE + RECREATE 流程 ----

  // 12) 研发新建另一个样品
  const rdInfo = await call('GET', '/api/me', null, 'rd');
  const rdId = String(rdInfo.data.id);
  const mk2 = await call('POST', '/api/samples', { name: '测试样品-Y', spec: 'SPEC-Y' }, 'rd');
  assert(mk2.status === 200 && mk2.data.sample_no, '研发新建样品Y: ' + (mk2.data && mk2.data.sample_no));
  const no2 = mk2.data.sample_no;

  // 13) 研发→制作→品保→保管(ME接收)
  sc = await call('POST', '/api/scan', { code: no2, image: 'data:image/png;base64,iVBORw0KGgo=' }, 'rd');
  assert(sc.status === 200 && sc.data.sample.status === 'PRODUCED', '研发确认制作样品Y: PRODUCED');

  sc = await call('POST', '/api/scan', { code: no2, cycleDays: 60, sample_type: 'OK', limit_item: 'B' }, 'qa');
  assert(sc.status === 200 && sc.data.sample.status === 'RELEASED', '品保发行样品Y: RELEASED');

  sc = await call('POST', '/api/scan', { code: no2, location: 'B区-1架-3层' }, 'me');
  assert(sc.status === 200 && sc.data.sample.status === 'IN_CUSTODY' && sc.data.sample.custody_dept === '生技部', 'ME角色接收保管: IN_CUSTODY/' + (sc.data && sc.data.sample.custody_dept));

  // 14) ME 申请退回
  const ret2 = await call('POST', '/api/scan', { code: no2, action: 'RETURN_REQUEST', note: 'ME测试退回' }, 'me');
  assert(ret2.status === 200 && ret2.data.sample.status === 'RETURNING', 'ME申请退回→RETURNING');

  // 15) 品保审核→退回研发重做（指派rd01）
  const reassign = await call('POST', '/api/scan', { code: no2, action: 'RETIRE_RECREATE', retire_assigned_rd: rdId, note: '退回研发重做' }, 'qa');
  assert(reassign.status === 200, '品保指派研发重做: ' + (reassign.status === 200 ? 'OK' : 'FAIL'));

  // 16) rd01 resolve 被指派的样品
  const res2 = await call('GET', '/api/resolve?code=' + encodeURIComponent(no2), null, 'rd');
  assert(res2.status === 200 && res2.data.allowedActions.includes('RECREATE'), 'RD resolve RETURNING→可创建替代品: ' + JSON.stringify(res2.data.allowedActions));

  // 17) RD 创建替代品
  const rec = await call('POST', '/api/scan', { code: no2, action: 'RECREATE' }, 'rd');
  assert(rec.status === 200 && rec.data.sample && rec.data.sample.status === 'NEW', 'RD创建替代品→新样品NEW: ' + (rec.data && rec.data.sample && rec.data.sample.sample_no));
  const newNo = rec.data.sample.sample_no;

  // 18) 验证原样品已作废
  const oldRes = await call('GET', '/api/resolve?code=' + encodeURIComponent(no2), null, 'qa');
  assert(oldRes.status === 200 && oldRes.data.sample.status === 'RETIRED', '原样品已作废: ' + (oldRes.data && oldRes.data.sample.status));

  // 19) 新替代品确认制作
  sc = await call('POST', '/api/scan', { code: newNo, image: 'data:image/png;base64,iVBORw0KGgo=' }, 'rd');
  assert(sc.status === 200 && sc.data.sample.status === 'PRODUCED', '替代品确认制作→PRODUCED: ' + newNo);

  console.log('\n端到端流程测试完成。退出码:', process.exitCode || 0);
})().catch(e => { console.error(e); process.exit(1); });
