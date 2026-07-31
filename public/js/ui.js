// ui.js — Toast 提示 + 通用 UI 辅助
function toast(msg,type){const t=$('#toast');t.textContent=msg;t.className='toast show '+(type||'');setTimeout(function(){t.className='toast';},2600);}
