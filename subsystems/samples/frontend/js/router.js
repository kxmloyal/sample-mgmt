// router.js — 导航菜单、哈希路由
const NAV=[
  {k:'dashboard',t:'样品看板',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'samples',t:'样品列表',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'wall',t:'机型视图',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'new',t:'新建样品+打印码',roles:['ADMIN','RD']},
  {k:'models',t:'机型列表',roles:['ADMIN','RD']},
  {k:'scan',t:'扫码台',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'storagemap',t:'柜位视图',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'report',t:'样品报表',roles:['ADMIN','RD','ME','QA','CUSTODY']},
  {k:'logs',t:'操作日志',roles:['ADMIN']},
];
function buildNav(){
  const nav=$('#nav');nav.innerHTML='';
  NAV.filter(n=>n.roles.includes(me.role)).forEach(n=>{
    const b=el('button',null,n.t);b.onclick=()=>{location.hash='#/'+n.k;};b.dataset.k=n.k;nav.appendChild(b);
  });
}
function setActive(k){document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));}

// 路由令牌（P2-6）：route() 每次自增。视图可在 await 前取 var seq=_routeSeq，await 后比对
// seq!==_routeSeq 即判定「本页已被卸载」并放弃写 DOM；接入视图见后续批次（本批次不动视图文件）。
var _routeSeq=0,_prevView=null;

// VIEWS 项兼容两种取值：裸函数（原行为）或 {render,leave} 对象（卸载协议，§25.6.1）
const VIEWS={dashboard:viewDashboard,samples:viewSamples,wall:viewSampleModelWall,new:viewNew,models:viewModels,
  scan:{render:viewScan,leave:function(){if(typeof stopCamera==='function')stopCamera();}},logs:viewLogs,storagemap:viewStorageMap,report:viewReport,};
function route(){
  const k=(location.hash.replace('#/','').split('?')[0]||'dashboard');
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  _routeSeq++;
  if(_prevView&&typeof _prevView.leave==='function'){try{_prevView.leave();}catch(err){/* leave 失败不得阻断导航 */}}   // 卸载协议：覆写 #view 前先调用上一个视图的 leave
  const entry=VIEWS[k]||viewDashboard;
  _prevView=entry;
  const v=typeof entry==='function'?entry:entry.render;
  setActive(k);
  const meta={dashboard:'样品看板',samples:'样品列表',wall:'机型视图',new:'新建样品',models:'机型列表',scan:'扫码台',logs:'操作日志',storagemap:'柜位视图',report:'样品报表',};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
  // 上下文提示条渲染进 #view 之外的独立容器（#page-hint）：6 个视图在 await 后整体重写 #view.innerHTML，写在 #view 内会被静默清除
  var hintBox=$('#page-hint');
  if(hintBox)hintBox.innerHTML=renderContextHint(k);
}
