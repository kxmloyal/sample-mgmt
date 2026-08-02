// new.js — 新建样品、打印标签、下载二维码、删除样品
function viewNew(){
  const v=$('#view');
  const stationOpts='<option value="">请选择站别</option>'+STATIONS.map(x=>'<option value="'+x+'">'+x+'</option>').join('');
  const limitOpts='<option value="">不适用</option>'+LIMIT_ITEMS.map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join('');
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<label>样品名称 *</label><input id="n-name" placeholder="如 1225震动样"/>'+
    '<label>机型</label><input id="n-model" placeholder="如 1225 / X200 等"/>'+
    '<label>站别</label><select id="n-station">'+stationOpts+'</select>'+
    '<label>规格/型号</label><input id="n-spec" placeholder="如 容量/尺寸等"/>'+
    '<label>备注</label><textarea id="n-notes" rows="3"></textarea>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<label>样品类型</label><select id="n-type"><option value="">不适用</option><option value="OK">OK样品</option><option value="NG">NG样品</option></select>'+
    '<label>限度项目</label><select id="n-limit-item">'+limitOpts+'</select>'+
    '<label>来源</label><select id="n-source"><option value="">不适用</option><option value="C">客供(C)</option><option value="T">元山(T)</option><option value="G">塔岗(G)</option></select>'+
    '<label>版次</label><input id="n-card-version" placeholder="如 01" style="width:80px"/>'+
    '<span class="muted" style="font-size:11px">发行时自动填01，重新发行自动+1，也可手动输入</span>'+
    '<label>标准范围</label><textarea id="n-test-standard" rows="3"></textarea>'+
    '</div>'+
    '</div>'+
    '<div style="margin-top:16px"><fluent-button appearance="accent" onclick="submitNew()">创建样品并生成条码</fluent-button></div>'+
    '<div id="n-msg" class="muted" style="margin-top:10px"></div></div>';
}
async function submitNew(){
  $('#n-msg').textContent='';
  try{
    const payload={
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      spec:$('#n-spec').value,
      notes:$('#n-notes').value,
      sample_type:$('#n-type').value,
      limit_item:$('#n-limit-item').value,
      source_type:$('#n-source').value,
      card_version:$('#n-card-version').value,
      test_standard:$('#n-test-standard').value
    };
    const s=await api('POST','/api/samples',payload);
    openPrintLabel(s);
    toast('已创建 '+s.sample_no+'，可到样品列表补打条码','ok');
  }catch(e){$('#n-msg').textContent=e.message;}
}
function openPrintLabel(s){
  var sz=getPrintSize();
  window.open('/api/samples/'+s.id+'/label/print?size='+sz,'_blank');
}
async function printSampleLabel(id){
  const s=await api('GET','/api/samples/'+id);
  openPrintLabel(s);
}
function downloadQR(id){
  var a=document.createElement('a');
  a.href='/api/samples/'+id+'/label/download';
  a.download='';
  a.click();
}
