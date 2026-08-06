// constants.js — 样品子系统常量
// ROLE/STATUS/ACTION_CN/$ 在 shared/frontend/api-base.js 中定义
const CONFIRM_ACTIONS=new Set(['RELEASE','INSPECT','CUSTODY']);
const STATIONS=['马达组','扇叶组','成品组','品保部','SMT','供应商'];
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
// 读取用户首选打印尺寸，默认中标(70mm)
function getPrintSize(){
  try{return localStorage.getItem('printSize')||'medium';}catch(e){return 'medium';}
}
