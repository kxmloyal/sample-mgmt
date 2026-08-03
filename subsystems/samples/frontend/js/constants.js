// constants.js — 样品子系统常量
// ROLE/STATUS/ACTION_CN/$ 在 shared/frontend/api-base.js 中定义
const CONFIRM_ACTIONS=new Set(['RELEASE','INSPECT','CUSTODY']);
const STATIONS=['马达组','扇叶组','成品组','调机样'];
const el=(t,c,h)=>{const e=document.createElement(t);if(c)e.className=c;if(h!=null)e.innerHTML=h;return e;};
// 打印尺寸预设（宽度 mm），scale = width / 100
var PRINT_SIZES=[
  {key:'small',label:'小号',width:50},
  {key:'medium',label:'中标',width:70},
  {key:'large',label:'大号',width:100},
  {key:'custom',label:'自定义',width:null}
];
// 读取用户首选打印尺寸，默认中标(70mm)
function getPrintSize(){
  try{return localStorage.getItem('printSize')||'medium';}catch(e){return 'medium';}
}
function setPrintSize(key){
  try{localStorage.setItem('printSize',key);}catch(e){}
}
