// scan.js — 扫码台核心逻辑（标示卡字段→card-fields.js，分步向导→scan-wizard.js，打印队列→print-queue.js，摄像头→scan-camera.js）
function viewScan(){
  var v=$('#view');
  v.innerHTML='<div class="card" style="max-width:560px;margin:0 auto">'+
    '<div class="scan-box" id="scan-box" onclick="if(window.getSelection().toString()===\'\')refocusScan()">'+
      '<div class="muted" style="margin-bottom:10px">'+
        '<b>主方式：</b>用 <b>二维码扫描枪</b> 扫样品码，或 <b>手动输入</b> 样品编号（SM-XXXXXX），按回车 / 点「确认扫码」即可。<br/>'+
        '<b>次方式：</b>无扫码枪的手机端，可用下方「摄像头扫码」（需 HTTPS）。'+
      '</div>'+
      '<input id="scan-code" class="scan-input" placeholder="扫描或输入 SM-XXXXXX" autocomplete="off"/>'+
      '<small class="muted" style="font-size:11px">格式：SM-XXXXXX</small>'+
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
}
async function doScan(){
  var code=$('#scan-code').value.trim();
  if(!/^SM-\d{4,}$/.test(code)){toast('编号格式错误：SM- 开头 + 至少4位数字','err');return refocusScan();}
  var box=$('#scan-result');box.innerHTML='<div class="muted">解析中…</div>';
  try{
    var data=await api('GET','/api/resolve?code='+encodeURIComponent(code));
    window._scanRdUsers=data.rdUsers||[];
    renderScanAction(data.sample,data.allowedActions);
  }catch(err){box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><p style="color:var(--bad)">'+e(err.message)+'</p></div>';}
}
function renderScanAction(s,actions){
  var box=$('#scan-result');
  if(!actions||actions.length===0){
    box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><h3>'+e(s.sample_no)+'</h3>'+
      '<p>当前状态：<b>'+STATUS[s.status]+'</b></p><p class="muted">你的角色（'+ROLE[me.role]+'）无法推进该样品，请确认流程顺序或由对应部门操作。</p></div>';
    return;
  }
  window._scanSample=s;
  window._scanActions=actions;
  var buttonRow=actions.length>1?actions.map(function(a){
    var label=CONFIRM_ACTIONS.has(a)?'确认'+ACTION_CN[a]:(ACTION_CN[a]||a);
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
function showScanActionForm(action){
  var s=window._scanSample;
  var formEl=$('#scan-action-form');
  if(!formEl)return;
  var html='';
  if(action==='PRODUCE'){
    html='<label>制作照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div>'+
      '<label>备注</label><input id="scan-note" placeholder="如：制作完成"/>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'PRODUCE\')">确认制作完成</fluent-button></div>';
  }else if(action==='INSPECT'){
    html='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><input id="scan-note" placeholder="如：复检通过"/>'+
      '<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
      '<p class="muted" style="font-size:11px">复检时可更新版次/测试数据</p>'+
      '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;color:#6b7280">版次</td><td><input id="scan-card-ver" value="'+e(s.card_version||'')+'" style="width:100%"/></td></tr>'+
      '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td><td><textarea id="scan-card-data" rows="2" style="resize:vertical;width:100%">'+e(s.test_data||'')+'</textarea></td></tr></table>'+
      '</details>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'INSPECT\')">确认复检完成</fluent-button></div>';
  }else if(action==='CUSTODY'){
    html='<label>保管储位 *</label><input id="scan-loc" placeholder="如 A区-3架-2层"/>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'CUSTODY\')">确认接收保管</fluent-button></div>';
  }else if(action==='EDIT_CARD'){
    html=buildCardFieldTable(s,true)+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'EDIT_CARD\')">保存修正 + 打印标示卡</fluent-button></div>';
  }else if(action==='EDIT_STORAGE'){
    html='<label>当前储位</label><p class="muted">'+e(s.storage_location||'未设置')+'</p>'+
      '<label>新储位 *</label><input id="scan-loc" placeholder="如 A区-3架-2层" value="'+e(s.storage_location||'')+'"/>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'EDIT_STORAGE\')">确认修改储位</fluent-button></div>';
  }else if(action==='RETURN_REQUEST'){
    html='<label>退回原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述样品存在的问题"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#f59e0b" onclick="confirmScan(\'RETURN_REQUEST\')">提交退回申请</fluent-button></div>';
  }else{
    html=renderReturnActions(action,s);
    if(!html){formEl.innerHTML='';return;}
  }
  formEl.innerHTML=html;
}
// 从向导状态收集 RELEASE/RE_RELEASE 公共字段（去重：原两分支字段完全相同）
function collectWizardPayload(body){
  body.cycleDays=(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'90');
  body.sample_type=wizardSample&&wizardSample._wizCardType?wizardSample._wizCardType:'';
  body.limit_item=wizardSample&&wizardSample._wizCardItem?wizardSample._wizCardItem:'';
  if(wizardSample&&wizardSample._wizCardSource)body.source_type=wizardSample._wizCardSource;
  if(wizardSample&&wizardSample._wizCardVersion)body.card_version=wizardSample._wizCardVersion;
  if(wizardSample&&wizardSample._wizCardData)body.test_data=wizardSample._wizCardData;
}
async function confirmScan(action){
  var code=document.getElementById('scan-code').value.trim();
  var body={code:code,action:action};
  if(action==='PRODUCE'||action==='INSPECT'){
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
  if(action==='RELEASE'||action==='RE_RELEASE'){collectWizardPayload(body);}
  if(action==='CUSTODY'||action==='EDIT_STORAGE'){body.location=document.getElementById('scan-loc').value;}
  if(action==='RETURN_REQUEST'||action==='RETIRE_ONLY'||action==='RETURN_REJECT'){
    var noteEl2=document.getElementById('scan-note');if(noteEl2&&noteEl2.value.trim())body.note=noteEl2.value.trim();
  }
  if(action==='RETIRE_RECREATE'){
    var rdEl=document.getElementById('scan-rd-select');if(rdEl&&rdEl.value)body.retire_assigned_rd=rdEl.value;
    var noteEl3=document.getElementById('scan-note');if(noteEl3&&noteEl3.value.trim())body.note=noteEl3.value.trim();
  }
  if(action==='EDIT_CARD'){
    var tEl=$('#scan-card-type');if(tEl&&tEl.value)body.sample_type=tEl.value;
    var lEl=$('#scan-card-item');if(lEl&&lEl.value)body.limit_item=lEl.value;
    var sEl=$('#scan-card-source');if(sEl&&sEl.value)body.source_type=sEl.value;
    var verEl2=document.getElementById('scan-card-ver');if(verEl2&&verEl2.value!==undefined)body.card_version=verEl2.value.trim();
    var dataEl2=document.getElementById('scan-card-data');if(dataEl2&&dataEl2.value!==undefined)body.test_data=dataEl2.value.trim();
  }
  try{var r=await api('POST','/api/scan',body);handleScanSuccess(r);}catch(e){toast(e.message,'err');}
}
