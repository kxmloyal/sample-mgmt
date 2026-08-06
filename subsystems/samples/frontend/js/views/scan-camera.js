// scan-camera.js — 摄像头扫码 + 连续扫码 + 输入辅助
var _scanContinuous=false;
let _camStream=null;

function camProtocolOk(){return location.protocol==='https:';}

async function startCamera(){
  var msg=$('#cam-msg'),video=$('#cam');
  if(!camProtocolOk()){
    msg.innerHTML='<span style="color:#dc2626">摄像头仅 HTTPS 可用，当前为 HTTP。请使用扫码枪或手动输入。</span>';
    return;
  }
  if(!('BarcodeDetector'in window)){
    msg.textContent='当前浏览器不支持摄像头识别，请使用 Chrome/Edge，或直接用扫码枪/手动输入。';
    return;
  }
  try{
    _camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=_camStream;video.style.display='block';await video.play();
    var bd=new BarcodeDetector({formats:['qr_code']});msg.textContent='摄像头已开启，对准二维码…';
    var tick=async function(){
      if(video.readyState>=2){
        try{var cs=await bd.detect(video);if(cs.length){stopCamera();$('#scan-code').value=cs[0].rawValue.trim();doScan();return;}}catch(e){}
      }
      requestAnimationFrame(tick);
    };tick();
  }catch(e){
    if(e.name==='NotAllowedError')msg.textContent='摄像头权限被拒绝，请在浏览器设置中允许摄像头访问。';
    else if(e.name==='NotFoundError')msg.textContent='未检测到摄像头设备，请连接摄像头后重试。';
    else msg.textContent='摄像头启动失败：'+e.message;
  }
}

function stopCamera(){if(_camStream){_camStream.getTracks().forEach(function(t){t.stop();});_camStream=null;$('#cam').style.display='none';}}

function renderCameraSection(){
  return '<details>'+
    '<summary style="cursor:pointer" class="muted">或用手机摄像头扫码 '+
    (location.protocol==='https:'?'<span style="color:var(--ok)">HTTPS ✓</span>':'<span style="color:var(--bad)">HTTP ✗</span>')+
    '</summary>'+
    '<div style="margin-top:10px">'+
      '<fluent-button appearance="neutral" size="small" onclick="startCamera()">📷 开启摄像头</fluent-button>'+
      '<video id="cam" playsinline style="display:none;margin-top:10px;border-radius:8px;max-width:100%"></video>'+
      '<div id="cam-msg" class="muted" style="font-size:12px;margin-top:8px"></div>'+
    '</div>'+
  '</details>';
}

function bindScanInput(){
  var inp=$('#scan-code');
  if(!inp)return;
  inp.onkeydown=function(e){
    if(e.key==='Enter'||e.key==='NumpadEnter'){e.preventDefault();doScan();}
  };
  inp.onblur=function(){
    var s=$('#scan-status');
    if(s)s.innerHTML='⚠ 输入框未聚焦，扫码枪无法输入 — 点此区域或重新扫码即可恢复';
  };
  inp.onfocus=function(){
    var s=$('#scan-status');
    if(s)s.innerHTML='● 已就绪，等待扫码枪…';
  };
}

function refocusScan(){
  var i=$('#scan-code');
  if(i){i.focus();var s=$('#scan-status');if(s)s.innerHTML='● 已就绪，等待扫码枪…';}
}

function afterScanReset(){
  $('#scan-result').innerHTML='';
  $('#scan-code').value='';
  delete window._scanSample;delete window._scanRdUsers;
  refocusScan();
}

function previewScanImg(e){
  var f=e.target.files[0],p=document.getElementById('scan-img-prev');
  if(!f){p.innerHTML='';return;}
  var r=new FileReader();r.onload=function(ev){p.innerHTML='<img src="'+ev.target.result+'" style="max-width:120px;border-radius:6px"/>';};r.readAsDataURL(f);
}

function handleScanSuccess(r){
  var contEl=document.getElementById('scan-cont');
  var contChecked=contEl&&contEl.checked;
  if(r.printCard){
    if(contChecked){
      printQueue.push({id:r.sample.id,sample_no:r.sample.sample_no,name:r.sample.name});
      renderPrintQueue();
    }else{
      var sz=getPrintSize();
      setTimeout(function(){window.open('/api/samples/'+r.sample.id+'/card/print?size='+sz,'_blank');},600);
    }
  }
  if(contChecked){
    $('#scan-code').value='';
    refocusScan();
    $('#scan-result').innerHTML='<div class="card sample-card" style="border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ '+e(r.sample.sample_no)+' → '+STATUS[r.sample.status]+'</h3>'+
      '<p class="muted">'+(r.sample.next_inspect_at?('下次复检：'+fmt(r.sample.next_inspect_at)):(r.sample.storage_location?('储位：'+e(r.sample.storage_location)+'（'+e(r.sample.custody_dept)+'）'):'已记录'))+'　|　已就绪，可继续扫码</p></div>';
    toast('操作成功，可继续扫码','ok');
  }else{
    $('#scan-result').innerHTML='<div class="card sample-card" style="border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ 操作成功</h3>'+
      '<p>样品 '+e(r.sample.sample_no)+' 状态已更新为：<b>'+STATUS[r.sample.status]+'</b></p>'+
      (r.sample.next_inspect_at?('<p class="muted">下次复检：'+fmt(r.sample.next_inspect_at)+'</p>'):'')+
      (r.sample.storage_location?('<p class="muted">储位：'+e(r.sample.storage_location)+'（'+e(r.sample.custody_dept)+'）</p>'):'')+
      '<fluent-button appearance="accent" size="small" onclick="afterScanReset()">继续扫码</fluent-button></div>';
    toast('操作成功','ok');
  }
}

function injectWizardCSS(){
  if(document.getElementById('wiz-css'))return;
  var style=document.createElement('style');
  style.id='wiz-css';
  style.textContent='.wizard-steps{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:6px}'+
    '.wdot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:#e5e7eb;color:#6b7280}'+
    '.wdot.active{background:#2563eb;color:#fff}'+
    '.wdot.done{background:#16a34a;color:#fff}'+
    '.wline{width:32px;height:2px;background:#e5e7eb}'+
    '.wline.done{background:#16a34a}';
  document.head.appendChild(style);
}
