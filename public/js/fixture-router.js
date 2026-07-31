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
  var page = h.replace('#/', '');
  if (!VIEWS[page]) page = 'dashboard';
  var fn = VIEWS[page];
  if (fn) fn();
  setFixtureActive(page);
}
