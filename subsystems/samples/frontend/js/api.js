// api.js — 样品子系统入口（鉴权/登录/API 基础见 shared/api-base.js）
var me = null;
function showApp(){
  $('#app').style.display='flex';
  $('#me-name').textContent=me.display_name||me.username;
  $('#me-role').textContent=(ROLE[me.role]||me.role)+' · '+(me.dept||'');
  buildNav(); renderHelpButton(); route();
}

// ---- 样品专用 helpers ----
function overdue(s){return s.status==='IN_CUSTODY'&&s.next_inspect_at&&new Date(s.next_inspect_at).getTime()<Date.now();}
// 覆盖 shared/api-base.js 的 statusBadge：样品逾期检测
function statusBadge(s){var cls='b-'+(s.status==='IN_CUSTODY'&&overdue(s)?'overdue':s.status);return '<fluent-badge class="badge '+cls+'" appearance="filled">'+(STATUS[s.status]||s.status)+'</fluent-badge>';}
function goScan(code){location.hash='#/scan';setTimeout(()=>{if(code)$('#scan-code').value=code;},50);}

// ---- T6: 统一防重提交 / 409 / 401 / 请求序号 helpers ----
// 防重提交锁：执行期禁用按钮并加加载态，fn 结束（含异常）后自动释放；btn 为空时仅执行 fn
function withSubmitLock(btn, fn){
  if(!btn) return Promise.resolve().then(fn);
  if(btn.disabled) return Promise.resolve();
  var orig=btn.textContent;
  btn.disabled=true;btn.classList.add('btn-loading');btn.textContent='处理中\u2026';
  function release(){btn.disabled=false;btn.classList.remove('btn-loading');btn.textContent=orig;}
  return Promise.resolve().then(fn).then(function(v){release();return v;},function(err){release();throw err;});
}

// 409 冲突刷新回调注册表：各视图注册自己的数据刷新函数
var _conflictRefreshFns=[];
function onConflictRefresh(fn){if(typeof fn==='function')_conflictRefreshFns.push(fn);}
function _notifyConflict(){_conflictRefreshFns.forEach(function(fn){try{fn();}catch(_){}});}

// 401 统一跳登录：沿用 boot() 既有惯例——隐藏 app、显示同页登录层（登录层缺失时刷新页面兜底）
function _gotoLogin(){
  var lg=document.getElementById('login'),app=document.getElementById('app');
  if(lg){if(app)app.style.display='none';lg.style.display='flex';}
  else location.reload();
}

// 状态码感知的请求封装（行为与 shared/api-base.js 的 api() 一致，额外携带 err.status 供统一错误处理）
async function _apiFetch(method,url,body){
  var opt={method:method,credentials:'include',headers:{}};
  if(body){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
  var r=await fetch(url,opt);
  var text=await r.text();
  var data={};
  try{data=JSON.parse(text);}catch(e){data={};}
  if(!r.ok){var err=new Error(data.error||('错误 '+r.status));err.status=r.status;throw err;}
  return data;
}
// 包装 shared/api-base.js 的 api()（不动共享层，仅本子系统 bundle 生效）：
// 409 → toast 后端冲突文案 + 触发各视图注册的刷新回调；401 → 统一跳登录；其余错误原样抛出，不破坏现有处理路径
api=async function(method,url,body){
  try{return await _apiFetch(method,url,body);}
  catch(err){
    if(err&&err.status===409){showToast(err.message||'数据已被他人修改，请刷新后重试','err');_notifyConflict();}
    else if(err&&err.status===401){_gotoLogin();}
    throw err;
  }
};
