// scan.js — 扫码台核心逻辑（标示卡字段→card-fields.js，分步向导→scan-wizard.js，打印队列→print-queue.js，摄像头→scan-camera.js）
// T8: ACTION_CN 定义在共享 api-base.js（本批不可改），本地补充 INSPECT_CUSTODY 中文名
var SCAN_ACTION_CN_EXT={INSPECT_CUSTODY:'到期复检',FORCE_REASSIGN:'强制改派',FORCE_RETIRE:'强制作废',CLEAR_STORAGE:'清柜释放储位(历史)'};
// 注：CLEAR_STORAGE 动作已于 2.0.8 下线（改为「作废即清柜」），此键仅用于渲染 2026-09-16 订正产生的历史日志
// 会改变柜位占用的动作（2026-09-16 扩入作废/重做类）：成功后必须失效格位缓存
var _SM_LOC_ACTIONS=['CUSTODY','EDIT_STORAGE','RETIRE_ONLY','RETIRE_RECREATE','FORCE_RETIRE','RECREATE'];
function viewScan(){
  var v=$('#view');
  v.innerHTML='<div class="card" style="max-width:560px;margin:0 auto">'+
    '<div class="scan-box" id="scan-box" onclick="if(window.getSelection().toString()===\'\')refocusScan()">'+
      '<div class="muted" style="margin-bottom:10px">'+
        '<b>主方式：</b>用 <b>二维码扫描枪</b> 扫样品码，或 <b>手动输入</b> 样品编号（13 位编码如 G-YD9015-Q-001-01，兼容 SM-XXXXXX），按回车 / 点「确认扫码」即可。<br/>'+
        '<b>次方式：</b>无扫码枪的手机端，可用下方「摄像头扫码」（需 HTTPS）。'+
      '</div>'+
      '<input id="scan-code" class="scan-input" placeholder="扫描或输入样品编号（13位编码 / SM-XXXXXX）" autocomplete="off"/>'+
      '<small class="muted" style="font-size:11px">格式：13 位编码（G-YD9015-Q-001-01）或 SM-XXXXXX</small>'+
      '<div style="margin-top:14px">'+
        '<fluent-button appearance="accent" size="small" onclick="doScan()">确认扫码</fluent-button>'+
        '<label class="muted" style="margin-left:12px;font-size:13px;cursor:pointer">'+
          '<input type="checkbox" id="scan-cont" onchange="refocusScan()"/> 连续扫码（自动清空并聚焦，适合扫码枪批量作业）'+
        '</label>'+
      '</div>'+
      '<div id="scan-status" class="muted" style="font-size:12px;margin-top:8px;color:var(--ok)">● 已就绪，等待扫码枪…</div>'+
      '<hr style="margin:16px 0;border:none;border-top:1px dashed var(--line)"/>'+
      renderCameraSection()+
    '</div>'+
    '<div id="scan-result"></div>'+
    '<div id="scan-print-queue"></div>'+
  '</div>';
  bindScanInput();
  refocusScan();
  injectWizardCSS();
  // 支持 #/scan?no=SM-000011 直达预填（工作台下钻跳转用）
  var m = (location.hash || '').match(/[?&]no=([^&]+)/);
  if (m) { $('#scan-code').value = decodeURIComponent(m[1]); doScan(); }
}
var _scanReqSeq=0;
async function doScan(){
  var seq=++_scanReqSeq;
  // 时机评审修正①：扫码即收起遗留候选面板——扫码枪连续作业时 input 被整体移除不触发 blur，
  // 面板（body 级）会残留到下一个样品的表单上；两个 picker 统一在此收口
  if(typeof hideSmCandidates==='function')hideSmCandidates();
  if(typeof hideCoCandidates==='function')hideCoCandidates();
  var code=$('#scan-code').value.trim();
  if(!/^(SM-\d{4,}|[CTG]-[A-Za-z0-9]{6}-[SMAQEI]-\d{3}-\d{2})$/.test(code)){toast('编号格式错误：支持 SM-XXXXXX 或 13 位编码（如 G-YD9015-Q-001-01）','err');return refocusScan();}
  var box=$('#scan-result');box.innerHTML='<div class="muted">解析中…</div>';
  try{
    var data=await api('GET','/api/resolve?code='+encodeURIComponent(code));
    if(seq!==_scanReqSeq)return; // 已有更新的扫码请求，丢弃过期响应（防竞态）
    window._scanRdUsers=data.rdUsers||[];
    renderScanAction(data.sample,data.allowedActions);
  }catch(err){if(seq!==_scanReqSeq)return;box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><p style="color:var(--bad)">'+e(err.message)+'</p></div>';}
}
function renderScanAction(s,actions){
  var box=$('#scan-result');
  if(!actions||actions.length===0){
    box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><h3>'+e(s.sample_no)+'</h3>'+
      '<p>当前状态：<b>'+STATUS[s.status]+'</b></p><p class="muted">你的角色（'+ROLE[me.role]+'）无法推进该样品，请确认流程顺序或由对应部门操作。</p></div>';
    return;
  }
  window._scanSample=s;
  var buttonRow=actions.length>1?actions.map(function(a){
    var cn=ACTION_CN[a]||SCAN_ACTION_CN_EXT[a]||a;
    var label=CONFIRM_ACTIONS.has(a)?'确认'+cn:cn;
    return '<fluent-button appearance="accent" size="small" onclick="showScanActionForm(\''+a+'\')">'+label+'</fluent-button>';
  }).join(' '):'';
  box.innerHTML='<div class="card sample-card">'+
    '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">'+e(s.sample_no)+'</h3>'+statusBadge(s)+'</div>'+
    '<div class="field"><span>名称</span><span>'+e(s.name||'—')+'</span></div>'+
    '<div class="field"><span>规格</span><span>'+e(s.spec||'—')+'</span></div>'+
    '<div class="field"><span>储位</span><span class="muted">'+e(s.storage_location||'—')+'</span></div>'+
    '<div class="field"><span>发行时间</span><span class="muted">'+fmt(s.released_at)+'</span></div>'+
    (s.retired_reason?'<div class="field"><span>作废原因</span><span class="muted">'+e(s.retired_reason)+'</span></div>':'')+
    (buttonRow?'<div style="margin-top:12px">'+buttonRow+'</div>':'')+
    '<div id="scan-action-form" style="margin-top:12px"></div>'+
    '<div style="margin-top:8px"><fluent-button appearance="neutral" size="small" onclick="afterScanReset()">取消</fluent-button></div>'+
  '</div>';
  showScanActionForm(actions[0]);
}
// 动作表单构造 showScanActionForm 已于 2026-09-16（T0）拆至 scan-forms.js
// 原因：本文件字符数达 85.5%（§7.1 越 70% 线必须停止新增业务），批量模式挂钩前先等量外迁
// 表单载荷收集（collectCustodyCycle / previewCheckoutDue / collectCheckoutPayload / collectWizardPayload）
// 已于 2026-09-16 拆至 scan-payload.js（本文件字符数超 §7.1 的 90% 线，仅允许精简）
async function confirmScan(action,btn){
  await withSubmitLock(btn||null,async function(){
  var code=document.getElementById('scan-code').value.trim();
  // 向导流程（RELEASE/RE_RELEASE）：编号以向导样品为准，不再信任实时输入框；
  // 兜底比对：输入框值与向导样品编号不一致（如 Step3 待确认时被扫码枪误改）则中止提交
  var isWizard=(action==='RELEASE'||action==='RE_RELEASE')&&wizardSample;
  if(isWizard){
    if(code!==wizardSample.sample_no){toast('编号与向导样品不一致（向导样品：'+wizardSample.sample_no+'），已中止提交，请重新扫码确认','err');return;}
    code=wizardSample.sample_no;
  }
  var body={code:code,action:action};
  // T12.3: ADMIN 兜底转移二次确认（高危操作，先拦截确认再提交）
  if(action==='FORCE_REASSIGN'||action==='FORCE_RETIRE'){
    if(!confirm(action==='FORCE_REASSIGN'?'确认强制改派该样品的重做研发人员？':'确认强制作废该样品？此操作不可撤销！'))return;
  }
  if(action==='PRODUCE'||action==='INSPECT'||action==='INSPECT_CUSTODY'){
    var f=document.getElementById('scan-img').files[0];
    if(!f){toast('请上传照片','err');return;}
    body.image=await new Promise(function(res,rej){
      var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsDataURL(f);
    });
    var noteEl=document.getElementById('scan-note');if(noteEl&&noteEl.value.trim())body.note=noteEl.value.trim();
  }
  if(action==='INSPECT'){
    var verEl=document.getElementById('scan-card-ver');if(verEl&&verEl.value.trim())body.card_version=verEl.value.trim();
    var dataEl=document.getElementById('scan-card-data');if(dataEl&&dataEl.value.trim())body.test_data=dataEl.value.trim();
  }
  if(action==='INSPECT_CUSTODY'&&!collectCustodyCycle(body))return;
  if(action==='CHECKOUT'&&!collectCheckoutPayload(body))return;
  if(action==='RELEASE'||action==='RE_RELEASE'){collectWizardPayload(body);}
  // 2026-09-10 防误确认：储位校验抽至 storage-loc-picker.js（scan.js 超 70% 预警线只做薄调用）；
  // 校验失败 toast 并 return false，调用方中止提交
  if((action==='CUSTODY'||action==='EDIT_STORAGE')&&!collectScanLoc(body,action))return;
  if(action==='RETURN_REQUEST'||action==='RETIRE_ONLY'||action==='RETURN_REJECT'||action==='CHECKOUT'||action==='RETURN_OUT'){
    var noteEl2=document.getElementById('scan-note');if(noteEl2&&noteEl2.value.trim())body.note=noteEl2.value.trim();
  }
  if(action==='RETIRE_RECREATE'){
    var rdEl=document.getElementById('scan-rd-select');if(rdEl&&rdEl.value)body.retire_assigned_rd=rdEl.value;
    var noteEl3=document.getElementById('scan-note');if(noteEl3&&noteEl3.value.trim())body.note=noteEl3.value.trim();
  }
  if(action==='FORCE_REASSIGN'){
    var frdEl=document.getElementById('scan-rd-select');if(frdEl&&frdEl.value)body.retire_assigned_rd=frdEl.value;
    var fnoteEl=document.getElementById('scan-note');if(fnoteEl&&fnoteEl.value.trim())body.note=fnoteEl.value.trim();
  }
  if(action==='FORCE_RETIRE'){
    var fnoteEl2=document.getElementById('scan-note');if(fnoteEl2&&fnoteEl2.value.trim())body.note=fnoteEl2.value.trim();
  }
  if(action==='EDIT_CARD'){
    var tEl=$('#scan-card-type');if(tEl&&tEl.value)body.sample_type=tEl.value;
    var lEl=$('#scan-card-item');if(lEl&&lEl.value)body.limit_item=lEl.value;
    var sEl=$('#scan-card-source');if(sEl&&sEl.value)body.source_type=sEl.value;
    var verEl2=document.getElementById('scan-card-ver');if(verEl2&&verEl2.value!==undefined)body.card_version=verEl2.value.trim();
    var dataEl2=document.getElementById('scan-card-data');if(dataEl2&&dataEl2.value!==undefined)body.test_data=dataEl2.value.trim();
    var stdEl2=document.getElementById('scan-card-standard');if(stdEl2&&stdEl2.value!==undefined)body.test_standard=stdEl2.value.trim();
  }
  try{
    var r=await api('POST','/api/scan',body);
    handleScanSuccess(r);
    // 时机评审修正②：储位类动作成功即失效格位缓存——该格位占用态已变（空→占用），
    // 缓存不失效会导致下一件样品的候选空位徽标过期误导；领用人列表无此问题不处理
    // 作废即清柜（2026-09-16）：作废/重做类动作同样改动格位占用（原样品储位被释放），须与储位动作同样失效缓存
    if(_SM_LOC_ACTIONS.indexOf(action)>=0)_smCache=null;
    if(r&&r.printCard&&r.sample&&r.sample.id)appendReprintBtn(r.sample.id); // T8.2 常驻重新打印兜底
    if(isWizard){wizardSample=null;unlockScanCode();} // 向导提交成功：清除向导状态并解锁编号输入框
  }catch(e){toast(e.message,'err');}
  });
}

// T8.2: 成功提示条常驻「重新打印标示卡」按钮——setTimeout 自动弹窗被浏览器拦截时的手动兜底
// （用户手势 onclick 内触发 window.open，新窗口；打印触发根治在批次 2）
function appendReprintBtn(sampleId){
  var box=document.getElementById('scan-result');
  var card=box?box.querySelector('.sample-card'):null;
  if(!card)return;
  var btn=document.createElement('fluent-button');
  btn.setAttribute('appearance','neutral');btn.setAttribute('size','small');
  btn.style.marginLeft='8px';
  btn.textContent='🖨 重新打印标示卡';
  btn.onclick=function(){window.open('/api/samples/'+sampleId+'/card/print'+(typeof getPrintSizeQuery==='function'?getPrintSizeQuery():''),'_blank');};
  card.appendChild(btn);
}

// T6: 409 冲突时自动刷新当前扫码结果（注册到 api.js 的统一冲突回调）
onConflictRefresh(function(){
  var codeEl=document.getElementById('scan-code');
  if(codeEl&&codeEl.value.trim()&&document.getElementById('scan-result'))doScan();
});
