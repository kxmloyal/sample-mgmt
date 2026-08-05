// router.js — 项目追踪导航菜单与哈希路由
const NAV=[
  {k:'dashboard',t:'项目看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'kanban',t:'任务看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'list',t:'任务列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'projects',t:'项目列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'workflow',t:'状态机管理',roles:['ADMIN']},
];
const VIEWS={dashboard:renderProjectDashboard,kanban:renderTaskKanban,list:renderTaskList,projects:renderProjects,workflow:renderWorkflow};
function route(){
  const k=(location.hash.replace('#/','').split('?')[0]||'dashboard');
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  const v=VIEWS[k]||renderProjectDashboard;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
  const meta={dashboard:'项目看板',kanban:'任务看板',list:'任务列表',projects:'项目列表',workflow:'状态机管理'};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
}
