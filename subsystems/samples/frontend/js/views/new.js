// new.js — 新建样品、打印标签、下载二维码、删除样品
function viewNew(){
  const v=$('#view');
  const stationOpts='<fluent-option value="">请选择站别</fluent-option>'+STATIONS.map(x=>'<fluent-option value="'+x+'">'+x+'</fluent-option>').join('');
  const limitOpts='<fluent-option value="">不适用</fluent-option>'+(typeof LIMIT_ITEMS!=='undefined'?LIMIT_ITEMS:[]).map(x=>'<fluent-option value="'+x.code+'">'+x.label+'</fluent-option>').join('');
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<label>样品名称 *</label><fluent-text-field id="n-name" placeholder="如 1225震动样"></fluent-text-field>'+
    '<label>机型</label><fluent-text-field id="n-model" placeholder="如 1225 / X200 等"></fluent-text-field>'+
    '<label>站别</label><fluent-select id="n-station">'+stationOpts+'</fluent-select>'+
    '<label>规格/型号</label><fluent-text-field id="n-spec" placeholder="如 容量/尺寸等"></fluent-text-field>'+
    '<label>备注</label><textarea id="n-notes" rows="3"></textarea>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<label>样品类型</label><fluent-select id="n-type"><fluent-option value="">不适用</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>'+
    '<label>限度项目</label><fluent-select id="n-limit-item">'+limitOpts+'</fluent-select>'+
    '<label>来源</label><fluent-select id="n-source"><fluent-option value="">不适用</fluent-option><fluent-option value="C">客供(C)</fluent-option><fluent-option value="T">元山(T)</fluent-option><fluent-option value="G">塔岗(G)</fluent-option></fluent-select>'+
    '<label>版次</label><fluent-text-field id="n-card-version" placeholder="如 01" style="width:80px"></fluent-text-field>'+
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
