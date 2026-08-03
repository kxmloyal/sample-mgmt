// router.js — 导航菜单、哈希路由
const NAV=[
  {k:'dashboard',t:'样品看板',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'samples',t:'样品列表',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'new',t:'新建样品+打印码',roles:['ADMIN','RD']},
  {k:'scan',t:'扫码台',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'logs',t:'操作日志',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'users',t:'用户管理',roles:['ADMIN']},
];
function buildNav(){
  const nav=$('#nav');nav.innerHTML='';
  NAV.filter(n=>n.roles.includes(me.role)).forEach(n=>{
    const b=el('button',null,n.t);b.onclick=()=>{location.hash='#/'+n.k;};b.dataset.k=n.k;nav.appendChild(b);
  });
}
function setActive(k){document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));}

const VIEWS={dashboard:viewDashboard,samples:viewSamples,new:viewNew,scan:viewScan,logs:viewLogs,users:viewUsers};
function route(){
  const k=(location.hash.replace('#/','').split('?')[0]||'dashboard');
  const v=VIEWS[k]||viewDashboard; setActive(k);
  const meta={dashboard:'样品看板',samples:'样品列表',new:'新建样品',scan:'扫码台',logs:'操作日志',users:'用户管理'};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
  var hint=renderContextHint(k);
  if(hint)$('#view').insertAdjacentHTML('afterbegin',hint);
}
