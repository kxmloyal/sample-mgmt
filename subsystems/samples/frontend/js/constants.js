// constants.js — 样品子系统常量
// ROLE/STATUS/ACTION_CN/$ 在 shared/frontend/api-base.js 中定义
const CONFIRM_ACTIONS=new Set(['RELEASE','INSPECT','CUSTODY']);
const STATIONS=['马达组','扇叶组','成品组','品保部','SMT','供应商'];
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
// 读取用户首选打印尺寸，默认中标（52×25mm；尺寸唯一来源：后端 card-constants.js PRESET_MM）
function getPrintSize(){
  try{return localStorage.getItem('printSize')||'medium';}catch(e){return 'medium';}
}
// 拼接打印 URL 尺寸参数：custom 档携带真实宽高，保证标示卡打印跟随标签纸尺寸
function getPrintSizeQuery(){
  var sz=getPrintSize();
  if(sz==='custom'){
    try{
      var w=localStorage.getItem('printCustomW'),h=localStorage.getItem('printCustomH');
      if(w&&h)return '?size=custom&customW='+w+'&customH='+h;
    }catch(e){}
  }
  return '?size='+sz;
}
