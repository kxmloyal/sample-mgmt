// detail.js — 样品详情弹窗
var _detailSample=null;

async function viewDetail(id){
  _detailSample=await api('GET','/api/samples/'+id);
  const head='<b>'+e(_detailSample.sample_no)+'</b>'+statusBadge(_detailSample);
  openModal('','<div class="detail-cards"></div>',{head:head, foot:'<a class="link" style="margin-right:14px;cursor:pointer" onclick="downloadQR('+id+')">下载二维码</a><button class="btn ghost sm" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</button>'});
  await renderDetailBody(id);
}
async function renderDetailBody(id){
  const s=(_detailSample&&_detailSample.id===id)?_detailSample:await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.remove('log-mode');
  var steps=[['制作完成',s.produced_at],['正式发行',s.released_at],['分发保管',s.status==='IN_CUSTODY'?('储位 '+s.storage_location):null]];
  if(s.status==='RETURNING'||s.status==='RETIRED') steps.push(['退回审核',s.retired_reason||'']);
  if(s.status==='RETIRED') steps.push(['已作废',s.retired_reason||'']);
  const leftHTML='<div class="label">基础信息</div>'+
    '<div class="field-grid">'+
      '<span class="label">名称</span><span>'+e(s.name||'—')+'</span>'+
      '<span class="label">机型</span><span>'+e(s.model||'—')+'</span>'+
      '<span class="label">站别</span><span>'+e(s.station||'—')+'</span>'+
      '<span class="label">规格</span><span>'+e(s.spec||'—')+'</span>'+
      '<span class="label">保管</span><span>'+e(s.custody_dept||'—')+'</span>'+
      '<span class="label">储位</span><span>'+e(s.storage_location||'—')+'</span>'+
      '<span class="label">复检</span><span class="'+(overdue(s)?'b-overdue':'')+'" style="font-weight:600">'+(s.release_cycle_days?s.release_cycle_days+'天':'—')+' / '+fmt(s.next_inspect_at)+'</span>'+
      '<span class="label">备注</span><span>'+e(s.notes||'—')+'</span>'+
    '</div>';
  const mainImg=s.produced_image||s.image;
  const imgHTML=mainImg?'<div style="margin-top:8px"><img src="'+e(mainImg)+'" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>':'';
  const progressTimelineHTML=steps.map((x,i)=>'<div class="progress-step '+(x[1]?'done':'pending')+'"><span class="dot"></span>'+x[0]+(x[1]?' · '+e(fmt(x[1])):'')+'</div>').join('');
  const imageCard=mainImg?'<div class="detail-card image" onclick="showImageView(\''+e(mainImg)+'\')"><img src="'+e(mainImg)+'" alt="样品图片"/></div>':'';
  const inspectCard=s.inspect_image?'<div class="detail-card image" onclick="showImageView(\''+e(s.inspect_image)+'\')" style="cursor:pointer;text-align:center"><div class="label">复检照片</div><img src="'+e(s.inspect_image)+'" alt="复检照片" style="width:100px;height:100px;object-fit:cover;border-radius:6px"/></div>':'';
  const recentLogs=s.logs.slice(0,2);
  const logsHTML=recentLogs.length?
    '<div class="log-list">'+recentLogs.map(l=>'<div><span class="muted">'+fmt(l.created_at)+'</span> · '+(ACTION_CN[l.action]||l.action)+' · '+(l.role||'')+'/'+(l.dept||'')+'</div>').join('')+'</div>':
    '<div class="muted">暂无日志</div>';
  const viewAll=s.logs.length>2?'<div style="margin-top:4px"><a class="link" onclick="viewDetailLogs('+id+')">查看全部 '+s.logs.length+' 条 →</a></div>':'';
  body.innerHTML='<div class="detail-cards">'+
    '<div class="detail-card info">'+leftHTML+imgHTML+'</div>'+
    '<div class="detail-card progress">'+
      '<div class="label">流转进度</div>'+
      '<div class="progress-timeline">'+progressTimelineHTML+'</div>'+
    '</div>'+
    imageCard+
    inspectCard+
    '<div class="detail-card logs">'+
      '<div class="label">操作日志(最近2条)</div>'+
      logsHTML+
      viewAll+
    '</div>'+
  '</div>';
  var hasImage=mainImg||s.inspect_image,hasLogs=s.logs && s.logs.length>0,hasCard=!!(s.sample_type||s.limit_item||s.source_type||s.card_version||s.test_data);
  var tabsEl=document.querySelector('.detail-tabs');
  if(tabsEl) tabsEl.remove();
  if(hasImage||hasLogs||hasCard){
    var foot=document.querySelector('.modal-foot');
    var tabHTML='<div class="detail-tabs">';
    tabHTML+='<div class="detail-tab active" onclick="renderDetailBody('+id+')">信息</div>';
    if(hasCard) tabHTML+='<div class="detail-tab" onclick="switchDetailTab(\'card\','+id+')">标示卡</div>';
    if(hasLogs) tabHTML+='<div class="detail-tab" onclick="switchDetailTab(\'logs\','+id+')">全量日志 ('+s.logs.length+')</div>';
    if(hasImage) tabHTML+='<div class="detail-tab" onclick="switchDetailTab(\'image\','+id+')">大图</div>';
    tabHTML+='</div>';
    foot.insertAdjacentHTML('beforebegin',tabHTML);
  }
}
async function viewDetailLogs(id){
  const s=(_detailSample&&_detailSample.id===id)?_detailSample:await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.add('log-mode');
  var tabs=document.querySelectorAll('.detail-tab');
  tabs.forEach(function(t){t.classList.remove('active');});
  if(tabs[1]) tabs[1].classList.add('active');
  body.innerHTML='<div style="padding:12px 14px">'+
    '<div style="margin-bottom:8px"><a class="link" onclick="renderDetailBody('+id+')">← 返回详情</a></div>'+
    '<table><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>'+
    s.logs.map(l=>'<tr><td class="muted">'+fmt(l.created_at)+'</td><td>'+(ACTION_CN[l.action]||l.action)+'</td><td class="muted">'+e(l.role||'')+'/'+e(l.dept||'')+'</td><td class="muted">'+e(l.location||'—')+'</td><td class="muted">'+e(l.note||'—')+'</td></tr>').join('')+
    '</table>'+
  '</div>';
}
function showImageView(src){
  const overlay=document.createElement('div');
  overlay.className='img-overlay';
  overlay.innerHTML='<img src="'+e(src)+'" onclick="event.stopPropagation()" alt="样品图片"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:28px;cursor:pointer" onclick="this.parentElement.remove()">&times;</span>';
  overlay.onclick=function(){overlay.remove();};
  document.body.appendChild(overlay);
}
function switchDetailTab(tab,id){
  var tabs=document.querySelectorAll('.detail-tab');
  tabs.forEach(function(t){t.classList.remove('active');});
  if(tab==='logs'){
    if(tabs[2]) tabs[2].classList.add('active');
    viewDetailLogs(id);
  }else if(tab==='image'){
    if(tabs[tabs.length-1]) tabs[tabs.length-1].classList.add('active');
    var img=document.querySelector('.detail-card.image img');
    if(img) showImageView(img.src);
  }else if(tab==='card'){
    if(tabs[1]) tabs[1].classList.add('active');
    viewDetailCard(id);
  }
}

async function viewDetailCard(id){
  const s=(_detailSample&&_detailSample.id===id)?_detailSample:await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.remove('log-mode');
  const locked=['RELEASED','IN_CUSTODY','RETURNING','RETIRED'].includes(s.status);
  const dis=locked?' disabled':'';
  const typeOpts='<option value="">不适用</option><option value="OK"'+(s.sample_type==='OK'?' selected':'')+'>OK样品</option><option value="NG"'+(s.sample_type==='NG'?' selected':'')+'>NG样品</option>';
  const limitOpts='<option value="">不适用</option>'+LIMIT_ITEMS.map(function(x){return '<option value="'+x.code+'"'+(s.limit_item===x.code?' selected':'')+'>'+x.label+'</option>';}).join('');
  const srcOpts='<option value="">不适用</option><option value="C"'+(s.source_type==='C'?' selected':'')+'>客供(C)</option><option value="T"'+(s.source_type==='T'?' selected':'')+'>元山(T)</option><option value="G"'+(s.source_type==='G'?' selected':'')+'>塔岗(G)</option>';

  body.innerHTML='<div class="card" style="max-width:560px;margin:0 auto">'+
    (locked?'<div class="card-lock-banner">标示卡已锁定（样品已发行），仅可查看和打印</div>':'')+
    '<div class="card-grid">'+
      '<div><label>样品类型</label><select id="cd-type"'+dis+'>'+typeOpts+'</select></div>'+
      '<div><label>限度项目</label><select id="cd-limit-item"'+dis+'>'+limitOpts+'</select></div>'+
      '<div><label>来源</label><select id="cd-source"'+dis+'>'+srcOpts+'</select></div>'+
      '<div><label>有效期</label><span style="font-size:13px;color:#333">'+(s.next_inspect_at?new Date(s.next_inspect_at).toISOString().slice(0,10):'—')+'</span><span class="muted" style="font-size:11px"> (=复检日，自动同步)</span></div>'+
      '<div><label>版次</label><input id="cd-card-version" value="'+e(s.card_version||'')+'" placeholder="如 01"'+dis+'/></div>'+
      '<div><label>制作</label><input id="cd-signed-rnd" value="'+e(s.signed_by_rd||'')+'"'+dis+'/></div>'+
      '<div><label>确认</label><input id="cd-signed-qa" value="'+e(s.signed_by_qa||'')+'"'+dis+'/></div>'+
      '<div class="full-row"><label>样品数值</label><textarea id="cd-test-data" rows="1"'+dis+'style="resize:none;min-height:32px">'+e(s.test_data||'')+'</textarea></div>'+
    '</div>'+
    '<div style="margin-top:12px;display:flex;gap:8px">'+
    (locked?'':'<button class="btn" onclick="saveCard('+id+')">保存标示卡</button>')+
    '<button class="btn ghost" onclick="printCard('+id+')">打印标示卡</button>'+
    '</div>'+
    '<div id="cd-msg" class="muted" style="margin-top:8px"></div>'+
    '</div>';
}

async function saveCard(id){
  $('#cd-msg').textContent='';
  try{
    const payload={
      sample_type:$('#cd-type').value,
      limit_item:$('#cd-limit-item').value,
      source_type:$('#cd-source').value,
      card_version:$('#cd-card-version').value,
      test_data:$('#cd-test-data').value,
      signed_by_rd:$('#cd-signed-rnd').value,
      signed_by_qa:$('#cd-signed-qa').value
    };
    const s=await api('PUT','/api/samples/'+id,payload);
    toast('标示卡已保存','ok');
    $('#cd-msg').textContent='保存成功';
  }catch(e){$('#cd-msg').textContent=e.message;}
}

function printCard(id){
  var sz=getPrintSize();
  window.open('/api/samples/'+id+'/card/print?size='+sz,'_blank');
}
