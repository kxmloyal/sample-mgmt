// subsystems/workbench/frontend/js/router.js — 前端路由
// 统一为侧边栏布局模式（与 samples/fixtures 一致）

function buildNav() {
  var nav = document.getElementById('nav');
  nav.innerHTML =
    '<button data-k="dashboard" class="active" onclick="location.hash=\'#/dashboard\'">工作台</button>' +
    '<button data-k="todos" onclick="location.hash=\'#/todos\'">我的待办</button>';
}

function setActive(k) {
  document.querySelectorAll('#nav button').forEach(function(b) {
    b.classList.toggle('active', b.dataset.k === k);
  });
}

function route() {
  var h = location.hash.replace('#/', '') || 'dashboard';
  if (h.indexOf('todos') === 0) {
    setActive('todos');
    document.getElementById('page-title').textContent = '我的待办';
    document.getElementById('page-actions').innerHTML = '';
    renderMyTodos();
    return;
  }
  if (h.indexOf('dashboard') === 0) {
    setActive('dashboard');
    document.getElementById('page-title').textContent = '全局工作台';
    document.getElementById('page-actions').innerHTML = '';
    renderWorkbenchDashboard();
  }
}

// 覆盖 api-base.js 的 boot()，使用工作台专用初始化流程
async function boot() {
  showDemoHint();
  try {
    me = await api('GET', '/api/me');
    document.title = '制造品质管理系统 - 全局工作台';
    fillMe();
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    buildNav();
    route();
  } catch (e) {
    document.getElementById('login').style.display = 'flex';
  }
}

// api-base.js 的 doLogin() 会调用 showApp()，必须提供实现
function showApp() {
  fillMe();
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  buildNav();
  route();
}

function fillMe() {
  document.getElementById('me-name').textContent = me.display_name || me.username;
  document.getElementById('me-role').textContent = (ROLE[me.role] || me.role) + ' · ' + (me.dept || '');
}
