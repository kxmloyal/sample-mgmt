// new.js — 新建样品（单条/批量双模式）、打印标签、下载二维码、删除样品
// 2026-09-07 批量模式：对齐治具「① 公共设置 → ② 行式清单」模式（1~50 条，单事务整体回滚），
// 创建成功出结果面板，用 cards/print 批量单页打印（T17/T18 已有能力，一次 window.open 可靠）
var _nbMode = 'single';   // 当前模式：single | batch
var _nbRows = [];         // 批量行数据 [{name,sample_type,limit_item,test_standard,notes}]（提供处/组别批次级，不在行内）
var _nbModelCode = '';    // 批次机型编码（公共设置选择后记录，提交与预览共用）
var _nbSource = '';       // 批次提供处（公共设置，编号第1段）
var _nbStation = '';      // 批次组别（公共设置，编号第3段）

async function viewNew(){
  const v=$('#view');
  const groupOpts='<fluent-option value="">请选择组别</fluent-option>'+STATIONS.map(x=>'<fluent-option value="'+x+'">'+x+'</fluent-option>').join('');
  const sourceOpts='<fluent-option value="">请选择提供处</fluent-option><fluent-option value="C">客供(C)</fluent-option><fluent-option value="T">元山(T)</fluent-option><fluent-option value="G">塔岗(G)</fluent-option>';
  const limitOpts='<fluent-option value="">不适用</fluent-option>'+(typeof LIMIT_ITEMS!=='undefined'?LIMIT_ITEMS:[]).map(x=>'<fluent-option value="'+x.code+'">'+x.label+'</fluent-option>').join('');
  v.innerHTML='<div style="max-width:960px;margin:0 auto 10px;display:flex;gap:8px">'+
    '<fluent-button id="n-tab-single" appearance="accent" onclick="nbSwitchMode(\'single\')">单条创建</fluent-button>'+
    '<fluent-button id="n-tab-batch" appearance="neutral" onclick="nbSwitchMode(\'batch\')">批量创建</fluent-button>'+
    '</div>'+
    // ═══ 单条模式（原有表单，不动） ═══
    '<div id="n-single-wrap"><div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<div class="nf-grid">'+
    '<div><label>规格/型号 *</label><fluent-select id="n-spec"><fluent-option value="">请选择机型</fluent-option></fluent-select></div>'+
    '<div><label>样品名称 *</label><fluent-text-field id="n-name" placeholder="如 1225震动样"></fluent-text-field></div>'+
    '<div class="nf-full"><label>机型编码（选择规格/型号后自动填入）</label><fluent-text-field id="n-model" disabled placeholder="选择机型后自动填入"></fluent-text-field></div>'+
    '<div><label>提供处 *</label><fluent-select id="n-source">'+sourceOpts+'</fluent-select></div>'+
    '<div><label>组别 *</label><fluent-select id="n-station">'+groupOpts+'</fluent-select></div>'+
    '<div class="nf-full"><label>备注</label><textarea id="n-notes" rows="3"></textarea></div>'+
    '</div>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<div class="nf-grid">'+
    '<div><label>样品类型</label><fluent-select id="n-type"><fluent-option value="">不适用</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select></div>'+
    '<div><label>限度项目</label><fluent-select id="n-limit-item">'+limitOpts+'</fluent-select></div>'+
    '<div><label>版次（01~99，默认01）</label><fluent-text-field id="n-card-version" value="01" maxlength="2"></fluent-text-field></div>'+
    '<div><span class="muted" style="font-size:11px;display:block;margin-top:10px">样品编号生成后固定，不再随版次变化</span></div>'+
    '<div class="nf-full"><label>标准范围</label><textarea id="n-test-standard" rows="3"></textarea></div>'+
    '</div>'+
    '</div>'+
    '</div>'+
    '<div class="nf-actions">'+
    '<div id="n-preview" class="muted" style="font-size:13px"></div>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
    '<fluent-button id="n-submit" appearance="accent" onclick="submitNew()">创建样品并生成条码</fluent-button>'+
    '<span id="n-msg" class="muted"></span>'+
    '</div></div></div></div>'+
    // ═══ 批量模式（对齐治具新建申请：① 公共设置 → ② 行式清单） ═══
    '<div id="n-batch-wrap" style="display:none"><div class="card" style="max-width:960px">'+
    '<h3 style="margin:0 0 14px">批量新建样品 <span class="muted" style="font-size:12px;font-weight:400">（一次最多 50 条；任一行非法则整批不创建）</span></h3>'+
    '<div class="sec nb-sec">'+
    '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 公共设置 <span class="muted" style="font-weight:400">（机型/提供处/组别/版次整批共用——样品编号前四段由它们决定）</span></div>'+
    '<div class="nf-grid">'+
    '<div><label>规格/型号 *</label><fluent-select id="n-b-spec"><fluent-option value="">请选择机型</fluent-option></fluent-select></div>'+
    '<div><label>提供处 *</label><fluent-select id="n-b-source">'+sourceOpts+'</fluent-select></div>'+
    '<div><label>组别 *</label><fluent-select id="n-b-station">'+groupOpts+'</fluent-select></div>'+
    '<div><label>版次（01~99，默认01）</label><fluent-text-field id="n-b-version" value="01" maxlength="2"></fluent-text-field></div>'+
    '<div class="nf-full"><label>机型编码</label><span id="n-b-model-badge" class="nb-model-badge muted">选择机型后自动识别</span></div>'+
    '</div>'+
    '<div id="n-b-preview" class="muted nb-preview"></div>'+
    '</div>'+
    '<div class="sec nb-sec">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
    '<div style="font-weight:600;font-size:13px">② 样品清单 <span class="muted" style="font-weight:400">（同机型批量创建；限度样品信息按行填写，选填）</span></div>'+
    '<fluent-button appearance="lightweight" size="small" onclick="nbAddRow()">＋ 添加一行</fluent-button>'+
    '</div>'+
    '<div id="n-b-rows"></div>'+
    '</div>'+
    '<div class="nf-actions">'+
    '<div id="n-b-msg" class="muted" style="font-size:13px"></div>'+
    '<div style="display:flex;gap:10px;align-items:center">'+
    '<fluent-button id="n-b-submit" appearance="accent" onclick="submitBatchNew()">批量创建（N 条）</fluent-button>'+
    '</div></div>'+
    '<div id="n-b-result"></div>'+
    '</div></div>';
  try {
    // 新建下拉仅用机型主数据（不含补集），已删除机型不会出现在此处，杜绝误选；单条/批量共用一次加载
    const opts = await api('GET', '/api/samples/models');
    const optHtml = '<fluent-option value="">请选择机型</fluent-option>' + opts.map(function (o) { return '<fluent-option value="' + e(o.code) + '">' + e(o.full_name) + '</fluent-option>'; }).join('');
    const sel = $('#n-spec'), bsel = $('#n-b-spec');
    if (!opts.length) {
      sel.innerHTML = '<fluent-option value="">暂无机型，请先到机型列表添加</fluent-option>';
      bsel.innerHTML = '<fluent-option value="">暂无机型，请先到机型列表添加</fluent-option>';
    } else {
      sel.innerHTML = optHtml;
      bsel.innerHTML = optHtml;
      sel.addEventListener('change', function () {
        $('#n-model').value = sel.value;
        _schedulePreview();
      });
      bsel.addEventListener('change', function () {
        _nbModelCode = bsel.value;
        const badge = $('#n-b-model-badge');
        if (badge) badge.textContent = _nbModelCode || '选择机型后自动识别';
        _nbSchedulePreview();
      });
      const bsrc = $('#n-b-source'), bsta = $('#n-b-station');
      if (bsrc) bsrc.addEventListener('change', function () { _nbSource = bsrc.value; _nbSchedulePreview(); });
      if (bsta) bsta.addEventListener('change', function () { _nbStation = bsta.value; _nbSchedulePreview(); });
    }
  } catch (_) { /* 下拉加载失败保持仅提示项 */ }
  _bindPreview();
  _nbRows = [{ name: '', sample_type: '', limit_item: '', test_standard: '', notes: '' }];
  _nbRenderRows();
}

// ═══ 批量模式 ═══
function nbSwitchMode(m){
  _nbMode=m;
  $('#n-single-wrap').style.display = m==='single' ? '' : 'none';
  $('#n-batch-wrap').style.display = m==='batch' ? '' : 'none';
  const t1=$('#n-tab-single'), t2=$('#n-tab-batch');
  t1.setAttribute('appearance', m==='single'?'accent':'neutral');
  t2.setAttribute('appearance', m==='batch'?'accent':'neutral');
}
// 批量编号预览：用第一行的提供处/组别 + 批次机型/版次（仅提示，正式编号以创建结果为准）
var _nbPreviewTimer=null;
function _nbSchedulePreview(){
  clearTimeout(_nbPreviewTimer);
  _nbPreviewTimer=setTimeout(_nbRefreshPreview,300);
}
async function _nbRefreshPreview(){
  const box=$('#n-b-preview');
  if(!box) return;
  const model=_nbModelCode, ver=($('#n-b-version').value||'01');
  if(!model||model.length<6||!_nbSource||!_nbStation){ box.textContent=''; return; }
  try{
    const r=await api('GET','/api/samples/code-preview?source_type='+encodeURIComponent(_nbSource)+'&model='+encodeURIComponent(model)+'&station='+encodeURIComponent(_nbStation)+'&card_version='+encodeURIComponent(ver));
    box.textContent='编号预览：'+r.sample_no+' 起（同批流水号连续递增）';
  }catch(e){ box.textContent=''; }
}
// 行式渲染（nb-* 样式体系见 module.css：桌面 flex 对齐、<768px 卡片堆叠、表头隐藏）
// 行级字段：名称* + 限度三字段（选填）+ 备注；提供处/组别已提升批次级（编号前四段整批一致）
function _nbRenderRows(){
  const box=$('#n-b-rows');
  if(!box) return;
  const head='<div class="nb-row nb-head">'+
    '<span class="nb-cell nb-name">样品名称 <em style="color:var(--bad);font-style:normal">*</em></span>'+
    '<span class="nb-cell nb-type">样品类型</span>'+
    '<span class="nb-cell nb-limit">限度项目</span>'+
    '<span class="nb-cell nb-std">标准范围</span>'+
    '<span class="nb-cell nb-note">备注</span>'+
    '<span class="nb-head-del">删除</span>'+
    '</div>';
  box.innerHTML=head+_nbRows.map(function(r,i){
    return '<div class="nb-row" data-i="'+i+'">'+
      '<div class="nb-idx muted">'+(i+1)+'</div>'+
      '<input class="nb-cell nb-name" value="'+e(r.name)+'" placeholder="样品名称*" oninput="nbRowCell('+i+',\'name\',this.value)" onblur="nbRowCell('+i+',\'mark\')"/>'+
      '<select class="nb-cell nb-type" onchange="nbRowCell('+i+',\'sample_type\',this.value)">'+
        '<option value=""'+(!r.sample_type?' selected':'')+'>类型</option><option value="OK"'+(r.sample_type==='OK'?' selected':'')+'>OK样品</option><option value="NG"'+(r.sample_type==='NG'?' selected':'')+'>NG样品</option>'+
      '</select>'+
      '<select class="nb-cell nb-limit" onchange="nbRowCell('+i+',\'limit_item\',this.value)">'+
        '<option value=""'+(!r.limit_item?' selected':'')+'>限度项目</option>'+(typeof LIMIT_ITEMS!=='undefined'?LIMIT_ITEMS:[]).map(function(x){return '<option value="'+x.code+'"'+(r.limit_item===x.code?' selected':'')+'>'+e(x.label)+'</option>';}).join('')+
      '</select>'+
      '<input class="nb-cell nb-std" value="'+e(r.test_standard||'')+'" placeholder="标准范围，如 震动≤0.5mm" oninput="nbRowCell('+i+',\'test_standard\',this.value)"/>'+
      '<input class="nb-cell nb-note" value="'+e(r.notes||'')+'" placeholder="备注" oninput="nbRowCell('+i+',\'notes\',this.value)"/>'+
      '<button type="button" class="nb-del" onclick="nbDelRow('+i+')" title="删除本行" '+(_nbRows.length<=1?'disabled':'')+'>✕</button>'+
      '</div>';
  }).join('');
}
function nbRowCell(i,key,val){
  if(key==='mark'){
    const el=document.querySelector('#n-b-rows .nb-row[data-i="'+i+'"] .nb-name');
    if(el) el.style.borderColor=(_nbRows[i]&&_nbRows[i].name&&_nbRows[i].name.trim())?'':'var(--bad)';
    return;
  }
  if(_nbRows[i]) _nbRows[i][key]=val;
}
function nbAddRow(){
  if(_nbRows.length>=50){ toast('一次最多 50 条'); return; }
  _nbRows.push({name:'',sample_type:'',limit_item:'',test_standard:'',notes:''});
  _nbRenderRows();
}
function nbDelRow(i){
  if(_nbRows.length<=1)return;
  _nbRows.splice(i,1);
  _nbRenderRows();
}
async function submitBatchNew(){
  await withSubmitLock($('#n-b-submit'),async function(){
    const msg=$('#n-b-msg'); msg.textContent='';
    const model=_nbModelCode;
    const version=($('#n-b-version').value||'01').trim();
    if(!model||model.length<6){ msg.textContent='请先在「① 公共设置」选择机型'; return; }
    if(!_nbSource){ msg.textContent='请先在「① 公共设置」选择提供处'; return; }
    if(!_nbStation){ msg.textContent='请先在「① 公共设置」选择组别'; return; }
    let valid=true;
    _nbRows.forEach(function(r,i){
      if(!r.name||!r.name.trim()){ valid=false; nbRowCell(i,'mark'); }
    });
    if(!valid){ msg.textContent='存在名称为空的行，请补全后再提交'; return; }
    try{
      const res=await api('POST','/api/samples/batch',{
        model:model,
        card_version:/^\d{2}$/.test(version)?version:'01',
        source_type:_nbSource,
        station:_nbStation,
        items:_nbRows.map(function(r){
          const it={name:r.name.trim(),notes:(r.notes||'').trim(),test_standard:(r.test_standard||'').trim()};
          if(r.sample_type)it.sample_type=r.sample_type;
          if(r.limit_item)it.limit_item=r.limit_item;
          return it;
        })
      });
      // 结果面板：编号清单 + 批量单页打印（cards/print 一次 window.open，T17 方案，不会被拦截）
      const ids=res.samples.map(function(s){return s.id;});
      const sizeQ=getPrintSizeQuery().replace(/^\?/,'&');
      $('#n-b-result').innerHTML='<div style="margin-top:14px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:8px;padding:12px 14px">'+
        '<div style="font-weight:600;font-size:13px;color:#1e40af">✅ 已创建 '+res.created+' 条样品</div>'+
        '<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">'+res.samples.map(function(s){
          return '<span style="display:inline-flex;align-items:center;gap:6px;background:#fff;border:1px solid #bfdbfe;border-radius:4px;padding:2px 6px;font-size:12px"><b>'+e(s.sample_no)+'</b>'+e(s.name)+'<a href="javascript:void(0)" onclick="printSampleLabel('+s.id+')" style="color:#1d4ed8">打印</a></span>';
        }).join('')+'</div>'+
        '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'+
        '<fluent-button appearance="accent" size="small" onclick="window.open(\'/api/samples/cards/print?ids='+ids.join(',')+sizeQ+'\',\'_blank\')">🖨 打印全部标示卡</fluent-button>'+
        '<fluent-button appearance="neutral" size="small" onclick="nbResetAfterCreate()">清空，再建一批</fluent-button>'+
        '</div></div>';
      // 重置行区但保留结果面板（公共设置保留，同口径连续建批）
      _nbRows=[{name:'',sample_type:'',limit_item:'',test_standard:'',notes:''}];
      _nbRenderRows();
      toast('已批量创建 '+res.created+' 条样品','ok');
    }catch(e2){
      msg.textContent=e2.message;
    }
  });
}
function nbResetAfterCreate(){
  $('#n-b-result').innerHTML='';
  _nbRows=[{name:'',sample_type:'',limit_item:'',test_standard:'',notes:''}];
  _nbRenderRows();
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
var _previewReqSeq=0;
async function _refreshPreview(){
  const seq=++_previewReqSeq;
  const box=$('#n-preview');
  if(!box) return;
  const src=$('#n-source').value, model=$('#n-model').value, station=$('#n-station').value;
  if(!src||!station){ box.textContent=''; return; }
  if(model.length>0&&model.length<6){ box.textContent='机型编码至少 6 位'; return; }
  try{
    const r=await api('GET','/api/samples/code-preview?source_type='+encodeURIComponent(src)+'&model='+encodeURIComponent(model)+'&station='+encodeURIComponent(station));
    if(seq!==_previewReqSeq)return; // 已有更新的预览请求，丢弃过期响应（防竞态）
    box.textContent='编号预览：'+r.sample_no;
  }catch(e){ if(seq===_previewReqSeq)box.textContent=''; }
}
// 防重复提交：withSubmitLock 统一实现（提交中禁用按钮 + 加载态，见 api.js）
async function submitNew(){
  await withSubmitLock($('#n-submit'),async function(){
    $('#n-msg').textContent='';
    // T18.1 占位页模式：点击提交的手势内（transient activation 窗口内）同步开占位页，
    // POST 完成后填打印地址，规避慢网超手势窗口期被拦截
    var printWin=openPrintPlaceholder();
    if(!printWin)toast('浏览器拦截了打印窗口，请允许弹出窗口；创建后可到样品列表补打条码','err');
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
    if(printWin)printWin.location.href='/api/samples/'+s.id+'/label/print'+getPrintSizeQuery();
    toast('已创建 '+s.sample_no+'，可到样品列表补打条码','ok');
    }catch(e){
      if(printWin)try{printWin.close();}catch(_){}
      const m=$('#n-msg');if(m)m.textContent=e.message;}
  });
}
// 列表/详情补打标签：真实点击手势内直接 window.open，无需占位页
function openPrintLabel(s){
  window.open('/api/samples/'+s.id+'/label/print'+getPrintSizeQuery(),'_blank');
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
