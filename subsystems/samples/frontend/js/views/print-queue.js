// print-queue.js — 连续扫码模式下积累标示卡，批量打印
var printQueue=[]; // {id,sample_no,name}
function renderPrintQueue(){
  var pq=document.getElementById('scan-print-queue');
  if(!pq)return;
  if(printQueue.length===0){pq.innerHTML='';return;}
  pq.innerHTML='<div style="padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af;display:flex;align-items:center;gap:8px">'+
    '📋 已积累 <b>'+printQueue.length+'</b> 张标示卡'+
    '<fluent-button appearance="neutral" size="small" onclick="printAllCards()" style="margin-left:auto;font-size:10px">打印全部</fluent-button>'+
    '<fluent-button appearance="neutral" size="small" onclick="printQueue=[];renderPrintQueue()" style="font-size:10px">清空</fluent-button>'+
  '</div>';
}
function printAllCards(){
  var sz=getPrintSize();
  printQueue.forEach(function(c){window.open('/api/samples/'+c.id+'/card/print?size='+sz,'_blank');});
  printQueue=[];renderPrintQueue();
}
// 离开页面前提醒未打印队列
window.addEventListener('beforeunload',function(e){
  if(printQueue.length>0){
    e.preventDefault();
    e.returnValue='有 '+printQueue.length+' 张标示卡未打印，离开将丢失';
    return e.returnValue;
  }
});
