// samples.js — 样品列表、筛选、删除、分页
function stLabel(v){return v==='OK'?'OK样品':v==='NG'?'NG样品':v;}
var _debounceTimer=null;
var _quickFilterType=null;
// 分页状态（对齐治具 fixtureListPager 模式）
var samplePager={limit:20,offset:0,total:0};
var _sampleBuildParams=null;
var _sampleIsOverdue=false;
function debounceSearch(){clearTimeout(_debounceTimer);_debounceTimer=setTimeout(loadSamples,300);}
// 统一拉取一页样品数据（resetOffset=true 用于筛选条件变更时回到第一页）
function _fetchSamplePage(resetOffset){
  if(resetOffset)samplePager.offset=0;
  if(!_sampleBuildParams)return;
  var params=_sampleBuildParams();
  params+=(params?'&':'')+'limit='+samplePager.limit+'&offset='+samplePager.offset;
  api('GET','/api/samples?'+params).then(function(data){
    samplePager.total=data.total||0;
    _renderSampleList(data.samples||[],_sampleIsOverdue,samplePager);
    renderChips();
  }).catch(function(e){$('#s-list').innerHTML='<div class="empty">加载失败：'+e.message+'</div>';});
}
function goSamplePage(page){
  samplePager.offset=(page-1)*samplePager.limit;
  _fetchSamplePage(false);
}
async function viewSamples(){
  var v=$('#view');
  var stOpts='<fluent-option value="">全部状态</fluent-option><fluent-option value="NEW">待制作</fluent-option><fluent-option value="PRODUCED">制作完成</fluent-option><fluent-option value="RELEASED">已发行</fluent-option><fluent-option value="IN_CUSTODY">保管中</fluent-option><fluent-option value="RETURNING">退回审核中</fluent-option><fluent-option value="RETIRED">已作废</fluent-option>';
  var deptOpts='<fluent-option value="">保管部门</fluent-option><fluent-option value="研发中心">研发中心</fluent-option><fluent-option value="品保文管中心">品保文管中心</fluent-option><fluent-option value="制造部">制造部</fluent-option><fluent-option value="FQC">FQC</fluent-option><fluent-option value="生技部">生技部</fluent-option>';
  var sortOpts='<fluent-option value="">排序：最新优先</fluent-option><fluent-option value="created_at">最早优先</fluent-option><fluent-option value="sample_no">编号升序</fluent-option><fluent-option value="-sample_no">编号降序</fluent-option>';
  v.innerHTML='<div class="filters"><fluent-text-field id="f-q" placeholder="搜索编号/名称/规格" oninput="debounceSearch()"></fluent-text-field>'+
    '<fluent-select id="f-status" onchange="loadSamples()">'+stOpts+'</fluent-select>'+
    '<fluent-select id="f-dept" onchange="loadSamples()">'+deptOpts+'</fluent-select>'+
    '<fluent-select id="f-type" onchange="loadSamples()"><fluent-option value="">全部类型</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select>'+
    '<fluent-select id="f-limit-item" onchange="loadSamples()"><fluent-option value="">全部项目</fluent-option>'+LIMIT_ITEMS.map(function(x){return '<fluent-option value="'+x.code+'">'+x.label+'</fluent-option>';}).join('')+'</fluent-select>'+
    '<fluent-select id="f-source" onchange="loadSamples()"><fluent-option value="">全部来源</fluent-option><fluent-option value="C">客供</fluent-option><fluent-option value="T">元山</fluent-option><fluent-option value="G">塔岗</fluent-option></fluent-select>'+
    '<fluent-select id="f-sort" onchange="loadSamples()">'+sortOpts+'</fluent-select>'+
    '<fluent-button appearance="accent" size="small" onclick="loadSamples()">查询</fluent-button></div>'+
    '<div class="filters" style="margin-bottom:14px;align-items:center">'+
    '<span style="font-size:12px;color:var(--muted)">快捷：</span>'+
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'pending\')">待处理</a>'+
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'overdue\')">逾期</a>'+
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'soon\')">近7天</a>'+
    '<span id="f-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:10px"></span></div>'+
    '<div id="s-list"></div>';
  // 读 hash query 的 status（来自 dashboard 卡片/比例条点击筛选）
  var stMatch=location.hash.match(/[?&]status=([^&]+)/);
  if(stMatch){var stBox=$('#f-status');if(stBox)stBox.value=decodeURIComponent(stMatch[1]);loadSamplesWithStatus(decodeURIComponent(stMatch[1]));}
  else loadSamples();
}
function _renderSampleList(list,isOverdue,pager){
  var box=$('#s-list');
  if(!list.length){box.innerHTML='<div class="empty">'+(isOverdue?'无逾期/即将到期样品':'无样品')+'</div>';return;}
  var cols=isOverdue?
    '<fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">编号</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">名称</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">机型/站别</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">图片</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">规格</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">类型</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">状态</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">制作</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">发行</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">保管部门/储位</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">复检到期</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader"></fluent-data-grid-cell></fluent-data-grid-row>':
    '<fluent-data-grid-row row-type="header"><fluent-data-grid-cell cell-type="columnheader">编号</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">名称</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">机型/站别</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">图片</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">规格</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">类型</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">状态</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">制作</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">发行</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader">保管部门/储位</fluent-data-grid-cell><fluent-data-grid-cell cell-type="columnheader"></fluent-data-grid-cell></fluent-data-grid-row>';
  var rows=list.map(function(s){
    var imgCell=s.produced_image||s.image?'<img src="'+e(s.produced_image||s.image)+'" width="40" style="border-radius:4px"/>':'—';
    var typeCell=s.sample_type?'<span class="badge" style="background:'+(s.sample_type==='OK'?'#16a34a':'#dc2626')+';color:#fff">'+stLabel(s.sample_type)+'</span>':'—';
    var actions='<a class="link" onclick="viewDetail('+s.id+')">详情</a>';
    if(s.status==='NEW') actions='<a class="link" style="margin-right:8px" onclick="event.stopPropagation();printSampleLabel('+s.id+')">打印</a>'+actions;
    actions='<a class="link" style="margin-right:8px" onclick="event.stopPropagation();downloadQR('+s.id+')">下载QR</a>'+actions;
    if((s.status==='NEW'||s.status==='PRODUCED')&&(me.role==='ADMIN'||me.role==='RD'||s.created_by===me.id))
      actions='<a class="link" style="margin-right:8px;color:var(--bad)" onclick="event.stopPropagation();deleteSample('+s.id+')">取消</a>'+actions;
    var overdueCell=isOverdue?'<fluent-data-grid-cell class="'+(new Date(s.next_inspect_at).getTime()<Date.now()?'b-overdue':'muted')+'">'+fmt(s.next_inspect_at)+'</fluent-data-grid-cell>':'';
    return '<fluent-data-grid-row><fluent-data-grid-cell>'+e(s.sample_no)+'</fluent-data-grid-cell><fluent-data-grid-cell>'+e(s.name||'—')+'</fluent-data-grid-cell><fluent-data-grid-cell class="muted">'+e(s.model||'—')+(s.station?(' · '+e(s.station)):'')+'</fluent-data-grid-cell><fluent-data-grid-cell>'+imgCell+'</fluent-data-grid-cell><fluent-data-grid-cell class="muted">'+e(s.spec||'—')+'</fluent-data-grid-cell><fluent-data-grid-cell>'+typeCell+'</fluent-data-grid-cell><fluent-data-grid-cell>'+statusBadge(s)+'</fluent-data-grid-cell><fluent-data-grid-cell class="muted">'+fmt(s.produced_at)+'</fluent-data-grid-cell><fluent-data-grid-cell class="muted">'+fmt(s.released_at)+'</fluent-data-grid-cell><fluent-data-grid-cell class="muted">'+e(s.custody_dept||'—')+'/'+e(s.storage_location||'—')+'</fluent-data-grid-cell>'+overdueCell+'<fluent-data-grid-cell>'+actions+'</fluent-data-grid-cell></fluent-data-grid-row>';
  });
  var html='<div class="card" style="padding:0"><fluent-data-grid>'+cols+rows.join('')+'</fluent-data-grid></div>';
  // 分页控件（对齐治具 fixture-list.js 模式）
  if(pager&&pager.total>pager.limit){
    var totalPages=Math.ceil(pager.total/pager.limit);
    var currentPage=Math.floor(pager.offset/pager.limit)+1;
    html+='<div style="display:flex;justify-content:center;align-items:center;gap:12px;padding:12px;font-size:13px">';
    html+='<fluent-button appearance="accent" size="small" '+(pager.offset===0?'disabled':'')+' onclick="goSamplePage('+(currentPage-1)+')">← 上一页</fluent-button>';
    html+='<span class="muted">第 <b>'+currentPage+'</b>/<b>'+totalPages+'</b> 页 · 共 <b>'+pager.total+'</b> 条</span>';
    html+='<fluent-button appearance="accent" size="small" '+(currentPage>=totalPages?'disabled':'')+' onclick="goSamplePage('+(currentPage+1)+')">下一页 →</fluent-button>';
    html+='</div>';
  }
  box.innerHTML=html;
  fixGridColumns(box);
}
async function loadSamples(){
  _quickFilterType=null;
  _sampleIsOverdue=false;
  _sampleBuildParams=function(){
    var q=$('#f-q').value,st=$('#f-status').value,dept=$('#f-dept').value,sort=$('#f-sort').value;
    var tp=$('#f-type').value,li=$('#f-limit-item').value,src=$('#f-source').value;
    var params='';
    if(q)params+='&q='+encodeURIComponent(q);
    if(st)params+='&status='+st;
    if(dept)params+='&dept='+encodeURIComponent(dept);
    if(sort)params+='&sort='+sort;
    if(tp)params+='&sample_type='+tp;
    if(li)params+='&limit_item='+li;
    if(src)params+='&source_type='+src;
    return params.substring(1);
  };
  _fetchSamplePage(true);
}
async function deleteSample(id){
  if(!confirm('确认取消该样品？此操作不可撤销，将同时删除关联日志。')) return;
  try{
    await api('DELETE','/api/samples/'+id);
    toast('样品已取消','ok');
    loadSamples();
  }catch(e){toast(e.message,'err');}
}
function loadSamplesWithStatus(statusStr){
  _sampleIsOverdue=false;
  _sampleBuildParams=function(){
    var q=$('#f-q').value,dept=$('#f-dept').value,sort=$('#f-sort').value;
    var tp=$('#f-type').value,li=$('#f-limit-item').value,src=$('#f-source').value;
    var params='status='+statusStr;
    if(q)params+='&q='+encodeURIComponent(q);
    if(dept)params+='&dept='+encodeURIComponent(dept);
    if(sort)params+='&sort='+sort;
    if(tp)params+='&sample_type='+tp;
    if(li)params+='&limit_item='+li;
    if(src)params+='&source_type='+src;
    return params;
  };
  _fetchSamplePage(true);
}
function quickFilter(type){
  _quickFilterType=type;
  if(type==='pending'){
    var st=me.role==='RD'?'NEW':me.role==='QA'?'PRODUCED,RETURNING':(me.role==='CUSTODY'||me.role==='ME')?'RELEASED':'';
    $('#f-status').value='';$('#f-dept').value='';
    loadSamplesWithStatus(st);
    return;
  }
  if(type==='overdue'){loadSamplesOverdue('1');return;}
  if(type==='soon'){loadSamplesOverdue('7');return;}
}
function loadSamplesOverdue(v){
  _quickFilterType=v==='1'?'overdue':'soon';
  _sampleIsOverdue=true;
  $('#f-status').value='';$('#f-dept').value='';
  _sampleBuildParams=function(){
    var q=$('#f-q').value,sort=$('#f-sort').value;
    var tp=$('#f-type').value,li=$('#f-limit-item').value,src=$('#f-source').value;
    var params='overdue='+v;
    if(q)params+='&q='+encodeURIComponent(q);
    if(sort)params+='&sort='+sort;
    if(tp)params+='&sample_type='+tp;
    if(li)params+='&limit_item='+li;
    if(src)params+='&source_type='+src;
    return params;
  };
  _fetchSamplePage(true);
}
function renderChips(){
  var chips=$('#f-chips');if(!chips)return;
  var html='',st=$('#f-status').value,dept=$('#f-dept').value,sort=$('#f-sort').value;
  var tp=$('#f-type').value,li=$('#f-limit-item').value,src=$('#f-source').value;
  var stLabels={NEW:'待制作',PRODUCED:'制作完成',RELEASED:'已发行',IN_CUSTODY:'保管中',RETURNING:'退回审核中',RETIRED:'已作废'};
  if(st)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-status\').value=\'\';loadSamples()">'+(stLabels[st]||st)+' ✕</span>';
  if(dept)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-dept\').value=\'\';loadSamples()">'+dept+' ✕</span>';
  if(tp)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-type\').value=\'\';loadSamples()">'+stLabel(tp)+' ✕</span>';
  if(li){var liLabel=(LIMIT_ITEMS.find(function(x){return x.code===li;})||{}).label||li;html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-limit-item\').value=\'\';loadSamples()">'+liLabel+' ✕</span>';}
  if(src){var srcLabel={C:'客供',T:'元山',G:'塔岗'}[src]||src;html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-source\').value=\'\';loadSamples()">'+srcLabel+' ✕</span>';}
  if(sort)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-sort\').value=\'\';loadSamples()">排序 ✕</span>';
  if(_quickFilterType==='pending')html+='<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">待处理 ✕</span>';
  if(_quickFilterType==='overdue')html+='<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">逾期 ✕</span>';
  if(_quickFilterType==='soon')html+='<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">近7天 ✕</span>';
  chips.innerHTML=html;
}
function clearQuickFilter(){
  _quickFilterType=null;
  $('#f-status').value='';$('#f-dept').value='';
  loadSamples();
}
