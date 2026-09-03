// fixture-router.js — 治具页面路由
var VIEWS = {
  dashboard: function () {
    document.getElementById('page-title').textContent = '治具看板';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureDashboard();
  },
  list: function () {
    document.getElementById('page-title').textContent = '治具清单';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureList();
  },
  models: function () {
    document.getElementById('page-title').textContent = '治具清单 · 机型视图';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureModelWall();
  },
  'new': function () {
    document.getElementById('page-title').textContent = '新建申请';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureNew();
  },
  scan: function () {
    document.getElementById('page-title').textContent = '治具扫码台';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureScan();
  },
  logs: function () {
    document.getElementById('page-title').textContent = '操作日志';
    document.getElementById('page-actions').innerHTML = '';
    renderFixtureLogs();
  }
};
function routeFixture() {
  var h = location.hash || '#/dashboard';
  // A4 深链：#/list?model=X — 解析 hash query 到 _fxRouteQuery，视图函数自行消费（renderFixtureList 预选机型）
  var body = h.replace('#/', '');
  var qidx = body.indexOf('?');
  window._fxRouteQuery = {};
  if (qidx !== -1) {
    new URLSearchParams(body.substring(qidx + 1)).forEach(function (v, k) { window._fxRouteQuery[k] = v; });
    body = body.substring(0, qidx);
  }
  var page = body.split('?')[0];
  if (!VIEWS[page]) page = 'dashboard';
  var fn = VIEWS[page];
  if (fn) fn();
  setFixtureActive(page);
}
