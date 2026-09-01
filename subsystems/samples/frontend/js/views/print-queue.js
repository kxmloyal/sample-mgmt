// print-queue.js — 连续扫码模式下积累标示卡，批量打印（T18：占位页模式 + 批量单页 + 队列治理）
var printQueue=[]; // {id,sample_no,name}
var PRINT_QUEUE_LS_KEY='sample_print_queue';

// T18.1 占位页模式：在用户手势调用点同步 window.open('about:blank') 拿窗口句柄，
// 异步完成后由调用方 win.location.href=url 填地址；被拦截返回 null，由调用方 toast 提示
function openPrintPlaceholder(){
  var win=null;
  try{win=window.open('about:blank','_blank');}catch(e){}
  return win||null;
}

// T18.3 队列 localStorage 持久化，页面刷新后恢复
function savePrintQueue(){
  try{localStorage.setItem(PRINT_QUEUE_LS_KEY,JSON.stringify(printQueue));}catch(e){}
}
function loadPrintQueue(){
  try{
    var arr=JSON.parse(localStorage.getItem(PRINT_QUEUE_LS_KEY)||'[]');
    if(Array.isArray(arr))printQueue=arr.filter(function(c){return c&&c.id;});
  }catch(e){printQueue=[];}
}

// T18.3 入队按样品 id 去重；上限 50（后端批量打印接口上限）
function enqueuePrintCard(card){
  if(printQueue.some(function(c){return c.id===card.id;})){toast('该样品已在打印队列','err');return false;}
  if(printQueue.length>=50){toast('打印队列已满（50 张），请先打印或清空','err');return false;}
  printQueue.push(card);savePrintQueue();renderPrintQueue();
  return true;
}
function removePrintCard(id){
  printQueue=printQueue.filter(function(c){return c.id!==id;});
  savePrintQueue();renderPrintQueue();
}
function clearPrintQueue(){printQueue=[];savePrintQueue();renderPrintQueue();}

function renderPrintQueue(){
  var pq=document.getElementById('scan-print-queue');
  if(!pq)return;
  if(printQueue.length===0){pq.innerHTML='';return;}
  var chips=printQueue.map(function(c){
    return '<span style="display:inline-flex;align-items:center;gap:2px;background:#fff;border:1px solid #bfdbfe;border-radius:4px;padding:1px 4px">'+
      e(c.sample_no)+
      '<a href="javascript:void(0)" onclick="removePrintCard('+c.id+')" style="color:#dc2626;text-decoration:none" title="移除">✕</a>'+
    '</span>';
  }).join(' ');
  pq.innerHTML='<div style="padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af">'+
    '<div style="display:flex;align-items:center;gap:8px">'+
      '📋 已积累 <b>'+printQueue.length+'</b> 张标示卡'+
      '<fluent-button appearance="neutral" size="small" onclick="printAllCards()" style="margin-left:auto;font-size:10px">打印全部</fluent-button>'+
      '<fluent-button appearance="neutral" size="small" onclick="clearPrintQueue()" style="font-size:10px">清空</fluent-button>'+
    '</div>'+
    '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px">'+chips+'</div>'+
  '</div>';
}

// T18.2 批量单页：一次 window.open 调后端多卡打印接口（点击手势内，可靠）；
// 打开成功才清队列；被拦截保留队列并提示
function printAllCards(){
  if(printQueue.length===0)return;
  var ids=printQueue.map(function(c){return c.id;});
  var url='/api/samples/cards/print?ids='+ids.join(',')+getPrintSizeQuery().replace(/^\?/,'&');
  var win=null;
  try{win=window.open(url,'_blank');}catch(e){}
  if(!win){toast('浏览器拦截了打印窗口，请允许弹出窗口或使用重打按钮，队列已保留','err');return;}
  clearPrintQueue();
}

// T18.3 启动时恢复队列；SPA 路由切换后扫码台重挂载时补渲染（队列已持久化，不再随页面离开丢失，
// 故移除原 beforeunload「离开将丢失」提醒）
loadPrintQueue();
function _watchPrintQueueView(){
  var view=document.getElementById('view');
  if(!view)return;
  new MutationObserver(function(){
    if(printQueue.length&&document.getElementById('scan-print-queue'))renderPrintQueue();
  }).observe(view,{childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',_watchPrintQueueView);
else _watchPrintQueueView();
