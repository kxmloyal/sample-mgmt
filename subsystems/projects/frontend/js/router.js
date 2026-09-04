// router.js — 项目追踪导航菜单与哈希路由（含任务详情路由 #/tasks/:id）
const NAV=[
  {k:'dashboard',t:'项目看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'kanban',t:'任务看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'list',t:'任务列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'projects',t:'项目列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'milestones',t:'里程碑',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'risks',t:'风险管理',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'workflow',t:'状态机管理',roles:['ADMIN']},
];
const VIEWS={dashboard:renderProjectDashboard,kanban:renderTaskKanban,list:renderTaskList,projects:renderProjects,milestones:renderMilestones,risks:renderRisks,workflow:renderWorkflow};
const META={dashboard:'项目看板',kanban:'任务看板',list:'任务列表',projects:'项目列表',milestones:'里程碑',risks:'风险管理',workflow:'状态机管理'};
function route(){
  // P0-2 修复：剥离 query string（#/list?project=xx），与 samples 路由一致
  const raw=location.hash.replace('#/','');
  const k=raw.split('?')[0].split('/')[0]||'dashboard';
  // 任务详情：#/tasks/:id（不在导航内，清空导航高亮与页头动作区）
  if(k==='tasks'&&raw.split('?')[0].split('/')[1]){
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',false));
    $('#page-title').textContent='任务详情';
    $('#page-actions').innerHTML='';
    renderTaskDetail(Number(raw.split('?')[0].split('/')[1]));
    return;
  }
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  const v=VIEWS[k]||renderProjectDashboard;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
  $('#page-title').textContent=META[k]||'';
  $('#page-actions').innerHTML='';
  v();
}
// 渲染侧边导航菜单（按角色过滤；.nav button 样式来自 app.css 共享侧边栏）
function buildNav(){
  const nav=$('#nav');nav.innerHTML='';
  NAV.filter(n=>n.roles.includes(me.role)).forEach(n=>{
    const b=document.createElement('button');
    b.textContent=n.t;b.dataset.k=n.k;
    b.onclick=()=>{location.hash='#/'+n.k;};
    nav.appendChild(b);
  });
}
// api-base.js 的 boot()/doLogin() 均调用 showApp()（登录后初始化界面，填充侧边栏用户信息）
// P0-1 修复：放开角色门禁，与 manifest.json roles.use / NAV 一致（ADMIN/PM/RD/QA/CUSTODY/ME 可进入）；
// 后端每个操作仍按 isGlobalManager(ADMIN/PM) 或 项目成员/assignee 二次鉴权，角色放开不扩大越权。
const SUBSYSTEM_ROLES=['ADMIN','PM','RD','QA','CUSTODY','ME'];
function showApp(){
  if(!SUBSYSTEM_ROLES.includes(me.role)){location.replace('/portal.html');return;}
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='flex';
  $('#me-name').textContent = me.display_name || me.username;
  $('#me-role').textContent = (ROLE_CN[me.role] || me.role) + (me.dept ? ' · ' + me.dept : '');
  buildNav();
  route();
}
