// new.js — 新建样品（单条/批量双模式）、打印标签、下载二维码、删除样品
// 2026-09-07 批量模式：对齐治具「① 公共设置 → ② 行式清单」模式（1~50 条，单事务整体回滚），
// 创建成功出结果面板，用 cards/print 批量单页打印（T17/T18 已有能力，一次 window.open 可靠）
var _nbMode = 'single';   // 当前模式：single | batch
var _nbRows = [];         // 批量行数据 [{name,source,station,notes}]

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
    '<div style="border:1px solid var(--line);border-radius:8px;padding:14px 16px;margin-bottom:16px">'+
    '<div style="font-weight:600;font-size:13px;margin-bottom:10px">① 公共设置 <span class="muted" style="font-weight:400">（机型与版次整批共用——样品编号的机型段必须一致才成批）</span></div>'+
    '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">'+
    '<div><label style="font-size:12px">规格/型号 *</label><br><fluent-select id="n-b-spec" style="min-width:220px"><fluent-option value="">请选择机型</fluent-option></fluent-select></div>'+
    '<div><label style="font-size:12px">机型编码</label><br><fluent-text-field id="n-b-model" disabled placeholder="选择机型后自动填入"></fluent-text-field></div>'+
    '<div><label style="font-size:12px">版次（01~99）</label><br><fluent-text-field id="n-b-version" value="01" maxlength="2" style="width:90px"></fluent-text-field></div>'+
    '<span id="n-b-preview" class="muted" style="font-size:12px"></span>'+
    '</div></div>'+
    '<div style="border:1px solid var(--line);border-radius:8px;padding:14px 16px">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'+
    '<div style="font-weight:600;font-size:13px">② 样品清单 <span class="muted" style="font-weight:400">（同机型批量创建）</span></div>'+
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
        $('#n-b-model').value = bsel.value;
        _nbSchedulePreview();
      });
    }
  } catch (_) { /* 下拉加载失败保持仅提示项 */ }
  _bindPreview();
  _nbRows = [{ name: '', source: '', station: '', notes: '' }];
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
  const model=$('#n-b-model').value, ver=($('#n-b-version').value||'01');
  const first=_nbRows.find(r=>r.source&&r.station);
  if(!model||model.length<6||!first){ box.textContent=''; return; }
  try{
    const r=await api('GET','/api/samples/code-preview?source_type='+encodeURIComponent(first.source)+'&model='+encodeURIComponent(model)+'&station='+encodeURIComponent(first.station)+'&card_version='+encodeURIComponent(ver));
    box.textContent='编号预览（按第1条口径）：'+r.sample_no+' 起';
  }catch(e){ box.textContent=''; }
}
// 行式渲染（对齐治具 fnRenderRows：名称行首 flex:2，删除按钮仅剩 1 行时禁用）
function _nbRenderRows(){
  const box=$('#n-b-rows');
  if(!box) return;
  const groupOpts=STATIONS.map(x=>'<option value="'+x+'">'+x+'</option>').join('');
  const sourceOpts='<option value="">提供处*</option><option value="C">客供(C)</option><option value="T">元山(T)</option><option value="G">塔岗(G)</option></option>'.replace('</option></option>','</option>');
  const head='<div class="fn-row fn-head">'+
    '<span class="fn-cell fn-name">样品名称 <em style="color:var(--bad);font-style:normal">*</em></span>'+
    '<span class="fn-cell">提供处</span>'+
    '<span class="fn-cell">组别</span>'+
    '<span class="fn-cell">备注</span>'+
    '<span class="fn-head-del">删除</span>'+
    '</div>';
  box.innerHTML=head+_nbRows.map(function(r,i){
    return '<div class="fn-row" data-i="'+i+'">'+
      '<input class="fn-cell fn-name" value="'+e(r.name)+'" placeholder="样品名称*" oninput="nbRowCell('+i+',\'name\',this.value)" onblur="nbRowCell('+i+',\'mark\')"/>'+
      '<select class="fn-cell" onchange="nbRowCell('+i+',\'source\',this.value)">'+
        '<option value="">提供处*</option><option value="C"'+(r.source==='C'?' selected':'')+'>客供(C)</option><option value="T"'+(r.source==='T'?' selected':'')+'>元山(T)</option><option value="G"'+(r.source==='G'?' selected':'')+'>塔岗(G)</option>'+
      '</select>'+
      '<select class="fn-cell" onchange="nbRowCell('+i+',\'station\',this.value)">'+
        '<option value="">组别*</option>'+STATIONS.map(function(x){return '<option value="'+x+'"'+(r.station===x?' selected':'')+'>'+e(x)+'</option>';}).join('')+
      '</select>'+
      '<input class="fn-cell" value="'+e(r.notes||'')+'" placeholder="备注" oninput="nbRowCell('+i+',\'notes\',this.value)"/>'+
      '<button type="button" class="fn-del" onclick="nbDelRow('+i+')" '+(_nbRows.length<=1?'disabled':'')+'>删除</button>'+
      '</div>';
  }).join('');
}
function nbRowCell(i,key,val){
  if(key==='mark'){
    const el=document.querySelector('.n-b-rows .fn-row[data-i="'+i+'"] .fn-name, #n-b-rows .fn-row[data-i="'+i+'"] .fn-name');
    if(el) el.style.borderColor=(_nbRows[i]&&_nbRows[i].name&&_nbRows[i].name.trim())?'':'var(--bad)';
    return;
  }
  if(_nbRows[i]){ _nbRows[i][key]=val; if(key!=='notes')_nbSchedulePreview(); }
}
function nbAddRow(){
  if(_nbRows.length>=50){ toast('一次最多 50 条'); return; }
  _nbRows.push({name:'',source:'',station:'',notes:''});
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
    const model=$('#n-b-model').value;
    const version=($('#n-b-version').value||'01').trim();
    if(!model||model.length<6){ msg.textContent='请先在「① 公共设置」选择机型'; return; }
    let valid=true;
    _nbRows.forEach(function(r,i){
      if(!r.name||!r.name.trim()||!r.source||!r.station){ valid=false; if(!r.name||!r.name.trim())nbRowCell(i,'mark'); }
    });
    if(!valid){ msg.textContent='存在未填完整的行（名称/提供处/组别均为必填），请补全后再提交'; return; }
    try{
      const res=await api('POST','/api/samples/batch',{
        model:model,
        card_version:/^\d{2}$/.test(version)?version:'01',
        items:_nbRows.map(function(r){return {name:r.name.trim(),source_type:r.source,station:r.station,notes:(r.notes||'').trim()};})
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
      // 重置行区但保留结果面板
      _nbRows=[{name:'',source:'',station:'',notes:''}];
      _nbRenderRows();
      toast('已批量创建 '+res.created+' 条样品','ok');
    }catch(e2){
      msg.textContent=e2.message;
    }
  });
}
function nbResetAfterCreate(){
  $('#n-b-result').innerHTML='';
  _nbRows=[{name:'',source:'',station:'',notes:''}];
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
