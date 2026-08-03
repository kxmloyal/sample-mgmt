// shared/frontend/api-base.js — 框架共享前端基础
// 包含 ROLE/STATUS/ACTION_CN 常量 + 通用函数（两个子系统共用）

var $ = function (s, r) { return (r || document).querySelector(s); };

var ROLE = { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' };
var STATUS = {
  // 样品状态
  NEW: '新建·待制作确认', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', RETURNING: '退回审核中',
  // 治具状态
  REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待验证',
  TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
  REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成',
  // 共用
  RETIRED: '已废弃'
};
var ACTION_CN = {
  // 样品操作
  CREATE: '新建样品', PRODUCE: '确认制作完成', RELEASE: '正式发行', INSPECT: '复检完成', INSPECT_EARLY: '提前复检',
  CUSTODY: '接收保管', EDIT_CARD: '修正标示卡', EDIT_STORAGE: '修改储位',
  RETURN_REQUEST: '申请退回', RE_RELEASE: '重新发行', RETIRE_RECREATE: '退回研发重做', RETIRE_ONLY: '直接作废',
  RETURN_REJECT: '拒绝退回', RECREATE: '创建替代品', RECREATE_REPLACED: '被替代', UPDATE_CARD: '更新标示卡信息',
  // 治具操作
  ACCEPT: 'RD接收', MAKE: '制作完成', MAKE_DONE: '制作完成', CANCEL: '撤销申请',
  VERIFY: '验证移交',
  USE: '领用', RETURN: '归还', IMPROVE: '申请改善', IMPROVE_DONE: '改善完成',
  REPAIR_ME: 'ME自行维修', REPAIR_RD_REQ: '退回RD维修',
  REPAIR_DONE: 'ME维修完成', REPAIR_RD_DONE: 'RD维修完成',
  REPAIR_CONFIRM: 'ME确认维修', RETIRE: '报废',
  FILE_UPLOAD: '上传文件'
};

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
