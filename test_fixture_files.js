// test_fixture_files.js — 治具文件管理 E2E 测试
var BASE = 'http://127.0.0.1:4006';

async function rq(method, url, body, cks) {
  var headers = {};
  if (cks) headers.Cookie = cks;
  if (body && method !== 'GET') { headers['Content-Type'] = 'application/json'; }
  var opts = { method: method, headers: headers, redirect: 'manual' };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  var resp = await fetch(BASE + url, opts);
  var txt = await resp.text();
  try { return { status: resp.status, body: JSON.parse(txt), headers: resp.headers }; }
  catch(e) { return { status: resp.status, body: txt, headers: resp.headers }; }
}

var passed = 0, failed = 0;
function ok(r, msg) { if (r.status >= 200 && r.status < 300) { passed++; console.log('  PASS: ' + msg); } else { failed++; console.log('  FAIL: ' + msg + ' (status=' + r.status + ' body=' + JSON.stringify(r.body).substring(0,80) + ')'); } }
function fail(r, msg) { if (r.status >= 400) { passed++; console.log('  PASS: ' + msg); } else { failed++; console.log('  FAIL: ' + msg + ' (status=' + r.status + ')'); } }

// multipart 上传辅助：手动构造 multipart body
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

async function uploadFile(url, fields, cks) {
  var boundary = '----TestBoundary' + Math.random().toString(36).substring(2);
  var body = buildMultipart(fields, boundary);
  var headers = { 'Content-Type': 'multipart/form-data; boundary=' + boundary };
  if (cks) headers.Cookie = cks;
  var resp = await fetch(BASE + url, { method: 'POST', body: body, headers: headers });
  var txt = await resp.text();
  try { return { status: resp.status, body: JSON.parse(txt), headers: resp.headers }; }
  catch(e) { return { status: resp.status, body: txt, headers: resp.headers }; }
}

async function main() {
  // 登录
  var login = await rq('POST', '/api/login', { username: 'rd01', password: 'rd123' });
  var cks = login.headers.get('set-cookie'); if (cks) cks = cks.split(';')[0];
  ok(login, 'rd01 登录');

  // 获取列表，找 ACCEPTED 或 REQUESTED 的治具
  var list = await rq('GET', '/api/fixtures', null, cks);
  ok(list, '获取治具列表');
  var fix = list.body.find(function(f) { return f.status === 'ACCEPTED'; });

  if (!fix) {
    // 没有 ACCEPTED 的，则找一个 REQUESTED 并接收
    var reqFix = list.body.find(function(f) { return f.status === 'REQUESTED'; });
    if (!reqFix) {
      // 创建新治具
      var me = await rq('POST', '/api/login', { username: 'me01', password: 'me123' });
      var meCks = me.headers.get('set-cookie'); if (meCks) meCks = meCks.split(';')[0];
      var create = await rq('POST', '/api/fixtures', { name: '测试治具_文件上传E2E', spec: '文件测试', model: 'V1', station: '测试工站', category: '测试' }, meCks);
      ok(create, '创建测试治具');
      reqFix = create.body;
    }
    var accept = await rq('POST', '/api/fixtures/scan', { code: reqFix.fixture_no, action: 'ACCEPT', expectedDays: 7 }, cks);
    ok(accept, '接收治具');
    fix = accept.body.fixture;
  }

  console.log('  测试治具: ' + fix.fixture_no + ' (id=' + fix.id + ', status=' + fix.status + ')');

  // 测试1: MAKE 无设计图纸应失败
  var make1 = await rq('POST', '/api/fixtures/scan', { code: fix.fixture_no, action: 'MAKE' }, cks);
  fail(make1, 'MAKE无设计图纸 → 应被拒绝(400)');

  // 测试2: 获取文件列表（空）
  var files1 = await rq('GET', '/api/fixtures/' + fix.id + '/files', null, cks);
  ok(files1, '获取文件列表（空）');
  console.log('    文件数: ' + files1.body.length);

  // 测试3: 上传设计图纸（模拟文件上传）
  var up1 = await uploadFile('/api/fixtures/' + fix.id + '/files', {
    file: { buffer: Buffer.from('%PDF-1.4\nfake pdf content\n'), filename: '设计图纸_v1.pdf', contentType: 'application/pdf' },
    category: 'design_drawing'
  }, cks);
  ok(up1, '上传设计图纸');

  // 测试4: 上传请购单
  var up2 = await uploadFile('/api/fixtures/' + fix.id + '/files', {
    file: { buffer: Buffer.from('fake png data'), filename: '请购单.png', contentType: 'image/png' },
    category: 'purchase_order'
  }, cks);
  ok(up2, '上传请购单');

  // 测试5: 获取文件列表（有文件）
  var files2 = await rq('GET', '/api/fixtures/' + fix.id + '/files', null, cks);
  ok(files2, '获取文件列表（有文件）');
  console.log('    文件数: ' + files2.body.length);

  // 测试6: MAKE 有设计图纸应成功
  var make2 = await rq('POST', '/api/fixtures/scan', { code: fix.fixture_no, action: 'MAKE' }, cks);
  ok(make2, 'MAKE有设计图纸 → 应成功');
  if (make2.body && make2.body.fixture) console.log('    新状态: ' + make2.body.fixture.status);

  // 测试7: 非 RD 不可上传
  var meLogin = await rq('POST', '/api/login', { username: 'me01', password: 'me123' });
  var meCks = meLogin.headers.get('set-cookie'); if (meCks) meCks = meCks.split(';')[0];
  var up3 = await uploadFile('/api/fixtures/' + fix.id + '/files', {
    file: { buffer: Buffer.from('test'), filename: 'test.txt', contentType: 'text/plain' },
    category: 'other'
  }, meCks);
  fail(up3, 'ME不可上传文件');

  // 测试8: 下载文件
  if (files2.body.length > 0) {
    var fileId = files2.body[0].id;
    var download = await fetch(BASE + '/api/fixtures/' + fix.id + '/files/' + fileId + '/download', { headers: { Cookie: cks } });
    ok(download, '下载文件(' + download.status + ')');
  }

  // 测试9: RD 删除文件
  if (files2.body.length > 0) {
    var del = await rq('DELETE', '/api/fixtures/' + fix.id + '/files/' + files2.body[0].id, null, cks);
    ok(del, 'RD删除自己上传的文件');
  }

  console.log('\n=== 结果: ' + passed + ' 通过, ' + failed + ' 失败 ===');
  if (failed > 0) process.exit(1);
}

main().catch(function(e) { console.error('测试异常: ' + e.message); process.exit(1); });
