// router.js — 项目追踪导航菜单与哈希路由（含任务详情路由 #/tasks/:id）
const NAV=[
  {k:'dashboard',t:'项目看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'kanban',t:'任务看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'list',t:'任务列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'projects',t:'项目列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'workflow',t:'状态机管理',roles:['ADMIN']},
];
const VIEWS={dashboard:renderProjectDashboard,kanban:renderTaskKanban,list:renderTaskList,projects:renderProjects,workflow:renderWorkflow};
function route(){
  const raw=location.hash.replace('#/','');
  const parts=raw.split('/');
  const k=parts[0]||'dashboard';
  // 任务详情：#/tasks/:id（不在导航内，清空导航高亮与页头动作区）
  if(k==='tasks'&&parts[1]){
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',false));
    $('#page-title').textContent='任务详情';
    $('#page-actions').innerHTML='';
    renderTaskDetail(Number(parts[1]));
    return;
  }
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  const v=VIEWS[k]||renderProjectDashboard;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
  const meta={dashboard:'项目看板',kanban:'任务看板',list:'任务列表',projects:'项目列表',workflow:'状态机管理'};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
}
// 渲染顶部导航菜单（按角色过滤）
function buildNav(){
  $('#nav').innerHTML = NAV.filter(n=>n.roles.includes(me.role)).map(n =>
    '<button data-k="' + n.k + '" onclick="location.hash=\'#/' + n.k + '\'">' + n.t + '</button>').join('');
}
// api-base.js 的 boot()/doLogin() 均调用 showApp()，必须提供实现（登录后初始化界面）
function showApp(){
  $('#me-label').textContent = (me.display_name || me.username) + ' · ' + (ROLE_CN[me.role] || me.role) + (me.dept ? ' · ' + me.dept : '');
  document.getElementById('login').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  buildNav();
  route();
}
