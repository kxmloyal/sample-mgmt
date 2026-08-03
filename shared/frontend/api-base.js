// shared/frontend/api-base.js — 框架共享前端基础
// 子系统特定常量(STATUS/ACTION_CN) → 各子系统 frontend/js/constants.js
// 此文件仅保留框架通用功能

var $ = function (s, r) { return (r || document).querySelector(s); };

var ROLE = { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' };

async function api(method, url, body) {
  var opt = { method: method, credentials: 'include', headers: {} };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  var r = await fetch(url, opt);
  var text = await r.text();
  var data = {};
  try { data = JSON.parse(text); } catch (e) { data = {}; }
  if (!r.ok) throw new Error(data.error || ('错误 ' + r.status));
  return data;
}

async function doLogin() {
  var err = document.getElementById('lg-err');
  err.textContent = '';
  try {
    me = await api('POST', '/api/login', {
      username: document.getElementById('lg-user').value,
      password: document.getElementById('lg-pass').value
    });
    document.getElementById('login').style.display = 'none';
    showApp();
  } catch (e) { err.textContent = e.message; }
}

async function doLogout() {
  try { await api('POST', '/api/logout'); } catch (e) { }
  location.reload();
}

async function boot(pageTitle) {
  try {
    var res = await api('GET', '/api/me');
    me = res;
    document.title = pageTitle || '制造品质管理系统';
    showApp();
  } catch (e) { document.getElementById('login').style.display = 'flex'; }
}

function statusBadge(row) {
  var cls0 = row.status || 'NEW';
  var cls = 'b-' + cls0;
  var label = row._statusLabel || cls0;
  return '<fluent-badge class="badge ' + cls + '" appearance="filled">' + label + '</fluent-badge>';
}

function fmt(d) {
  if (!d) return '—';
  return String(d).slice(0, 10);
}

function showToast(msg, type) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.className = 'toast show' + (type ? ' ' + type : '');
  setTimeout(function() { el.className = 'toast'; }, 2500);
}

var me = null;
