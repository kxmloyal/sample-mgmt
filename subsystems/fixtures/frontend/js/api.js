// fixture-api.js — 治具 API 请求 + 鉴权（公共基础见 shared/api-base.js）
var me = null;

// ---- 治具专用工具 ----
function fixtureVersion(f) {
  if (!f.improvement_count || f.improvement_count <= 0) return '';
  return '-V' + f.improvement_count;
}
function fixtureNoVersion(f) {
  return (f.fixture_no || '') + fixtureVersion(f);
}

// ---- 鉴权覆盖（治具用 showFixtureApp 启动） ----
async function bootFixture() {
  try {
    me = await api('GET', '/api/me');
    document.getElementById('me-name').textContent = me.display_name || me.username;
    document.getElementById('me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    buildFixtureNav(); routeFixture();
  } catch (e) { document.getElementById('login').style.display = 'flex'; }
}
async function doLogin() {
  document.getElementById('lg-err').textContent = '';
  try {
    me = await api('POST', '/api/login', { username: document.getElementById('lg-user').value, password: document.getElementById('lg-pass').value });
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    document.getElementById('me-name').textContent = me.display_name || me.username;
    document.getElementById('me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
    buildFixtureNav(); routeFixture();
  } catch (e) { document.getElementById('lg-err').textContent = e.message; }
}

// ---- 导航 ----
function buildFixtureNav() {
  var nav = [
    { id: 'dashboard', label: '治具看板' },
    { id: 'list', label: '治具清单' },
    { id: 'new', label: '新建申请' },
    { id: 'scan', label: '扫码台' },
    { id: 'logs', label: '操作日志' }
  ];
  document.getElementById('nav').innerHTML = nav.map(function (n) {
    return '<button data-k="' + n.id + '" onclick="goFixture(\'' + n.id + '\')">' + n.label + '</button>';
  }).join('');
  setFixtureActive('dashboard');
}

function setFixtureActive(k) {
  document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('active', b.dataset.k === k); });
}

function goFixture(page) {
  location.hash = '#/' + page;
}

// ---- 治具专用 helpers ----
function isOverdue(f) { return f.status === 'IN_USE' && f.expected_return_at && new Date(f.expected_return_at).getTime() < Date.now(); }
// 覆盖 shared/api-base.js 的 statusBadge：治具逾期检测
function statusBadge(f) {
  var cls = 'b-' + (f.status === 'IN_USE' && isOverdue(f) ? 'overdue' : f.status);
  return '<fluent-badge class="badge ' + cls + '" appearance="filled">' + (STATUS[f.status] || f.status) + '</fluent-badge>';
}
function goFixScan(code) { location.hash = '#/scan'; setTimeout(function() { var el = document.getElementById('scan-code'); if (el && code) el.value = code; }, 50); }
