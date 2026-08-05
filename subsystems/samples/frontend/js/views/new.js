// new.js — 新建样品、打印标签、下载二维码、删除样品
async function viewNew(){
  const v=$('#view');
  const groupOpts='<fluent-option value="">请选择组别</fluent-option>'+STATIONS.map(x=>'<fluent-option value="'+x+'">'+x+'</fluent-option>').join('');
  const sourceOpts='<fluent-option value="">请选择提供处</fluent-option><fluent-option value="C">客供(C)</fluent-option><fluent-option value="T">元山(T)</fluent-option><fluent-option value="G">塔岗(G)</fluent-option>';
  const limitOpts='<fluent-option value="">不适用</fluent-option>'+(typeof LIMIT_ITEMS!=='undefined'?LIMIT_ITEMS:[]).map(x=>'<fluent-option value="'+x.code+'">'+x.label+'</fluent-option>').join('');
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<label>样品名称 *</label><fluent-text-field id="n-name" placeholder="如 1225震动样"></fluent-text-field>'+
    '<label>提供处 *</label><fluent-select id="n-source">'+sourceOpts+'</fluent-select>'+
    '<label>机型 *</label><fluent-text-field id="n-model" disabled placeholder="选择机型后自动填入"></fluent-text-field>'+
    '<label>组别 *</label><fluent-select id="n-station">'+groupOpts+'</fluent-select>'+
    '<label>规格/型号 *</label><fluent-select id="n-spec"><fluent-option value="">请选择机型</fluent-option></fluent-select>'+
    '<label>备注</label><textarea id="n-notes" rows="3"></textarea>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<label>样品类型</label><fluent-select id="n-type"><fluent-option value="">不适用</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>'+
    '<label>限度项目</label><fluent-select id="n-limit-item">'+limitOpts+'</fluent-select>'+
    '<label>版次（01~99，默认01）</label><fluent-text-field id="n-card-version" value="01" maxlength="2" style="width:80px"></fluent-text-field>'+
    '<span class="muted" style="font-size:11px">样品编号生成后固定，不再随版次变化</span>'+
    '<label>标准范围</label><textarea id="n-test-standard" rows="3"></textarea>'+
    '</div>'+
    '</div>'+
    '<div id="n-preview" class="muted" style="margin-top:12px;font-size:13px"></div>'+
    '<div style="margin-top:16px"><fluent-button appearance="accent" onclick="submitNew()">创建样品并生成条码</fluent-button></div>'+
    '<div id="n-msg" class="muted" style="margin-top:10px"></div></div>';
  try {
    const opts = await api('GET', '/api/samples/model-options');
    const sel = $('#n-spec');
    if (!opts.length) {
      sel.innerHTML = '<fluent-option value="">暂无机型，请先到机型列表添加</fluent-option>';
    } else {
      sel.innerHTML = '<fluent-option value="">请选择机型</fluent-option>' + opts.map(function (o) { return '<fluent-option value="' + e(o.value) + '">' + e(o.label) + '</fluent-option>'; }).join('');
      sel.addEventListener('change', function () {
        $('#n-model').value = sel.value;
        _schedulePreview();
      });
    }
  } catch (_) { /* 下拉加载失败保持仅提示项 */ }
  _bindPreview();
}

// ═══ 编号实时预览（防抖 300ms，只读接口，不落库）═══
var _previewTimer=null;
function _bindPreview(){
  ['n-source','n-station'].forEach(function(id){
    const el=$('#'+id);
    if(el) el.addEventListener('change',_schedulePreview);
  });
  const m=$('#n-model');
  if(m) m.addEventListener('input',_schedulePreview);
}
function _schedulePreview(){
  clearTimeout(_previewTimer);
  _previewTimer=setTimeout(_refreshPreview,300);
}
async function _refreshPreview(){
  const box=$('#n-preview');
  if(!box) return;
  const src=$('#n-source').value, model=$('#n-model').value, station=$('#n-station').value;
  if(!src||!station){ box.textContent=''; return; }
  if(model.length>0&&model.length<6){ box.textContent='机型编码至少 6 位'; return; }
  try{
    const r=await api('GET','/api/samples/code-preview?source_type='+encodeURIComponent(src)+'&model='+encodeURIComponent(model)+'&station='+encodeURIComponent(station));
    box.textContent='编号预览：'+r.sample_no;
  }catch(e){ box.textContent=''; }
}
async function submitNew(){
  $('#n-msg').textContent='';
  try{
    const payload={
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      source_type:$('#n-source').value,
      card_version:$('#n-card-version').value||'01',
      spec: $('#n-spec').selectedOptions && $('#n-spec').selectedOptions.length ? $('#n-spec').selectedOptions[0].text : '',
      notes:$('#n-notes').value,
      sample_type:$('#n-type').value,
      limit_item:$('#n-limit-item').value,
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
