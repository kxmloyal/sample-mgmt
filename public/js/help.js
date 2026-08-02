// help.js — 前端使用指南：浮动按钮 + 搜索面板 + 上下文提示条
// 依赖：HELP_DATA（help-data.js）、me（api.js）、$（constants.js）

// 页面 hash → 帮助模块 ID 映射（用于上下文提示条「了解更多」）
var HELP_PAGE_MAP={
  dashboard:null, samples:'list', new:'create', scan:'scan',
  board:'inspect', logs:null, users:'users'
};
var HELP_PAGE_TIPS={
  dashboard:'样品看板：查看统计数据和待办事项',
  samples:'样品列表：支持多维度筛选和详情查看',
  new:'新建样品：填写信息后自动生成编号和标签',
  scan:'扫码台：扫描样品二维码驱动状态流转',
  board:'生命周期看板：查看复检逾期和即将到期样品',
  logs:'操作日志：系统全局操作记录',
  users:'用户管理：管理账号和角色'
};

// 渲染右下角浮动「?」按钮（登录后调用一次）
function renderHelpButton(){
  if($('#help-fab'))return;
  var fab=el('div','help-fab','?');
  fab.onclick=openHelp;
  document.body.appendChild(fab);
}

// 打开帮助面板（id 可选，传入则自动展开对应模块）
function openHelp(id){
  if(!$('#help-mask'))renderHelpPanel();
  $('#help-mask').style.display='flex';
  filterHelp('');
  if(id)setTimeout(function(){toggleModule(id,true);},50);
}
function closeHelp(){
  var m=$('#help-mask');if(m)m.style.display='none';
}

// 渲染搜索面板 DOM（仅创建一次）
function renderHelpPanel(){
  var mask=el('div','help-mask');mask.id='help-mask';
  mask.onclick=closeHelp;
  var panel=el('div','help-panel');
  panel.onclick=function(e){e.stopPropagation();};
  panel.innerHTML=
    '<div class="help-head">'+
      '<fluent-text-field id="help-search" placeholder="搜索关键词..." oninput="filterHelp(this.value)"></fluent-text-field>'+
      '<fluent-button appearance="neutral" size="small" onclick="closeHelp()">关闭</fluent-button>'+
    '</div>'+
    '<div id="help-list"></div>';
  mask.appendChild(panel);
  document.body.appendChild(mask);
}

// 按关键词筛选帮助模块（匹配 module/desc/items.body）
function filterHelp(kw){
  kw=(kw||'').toLowerCase().trim();
  var list=HELP_DATA.filter(function(m){
    if(!kw)return true;
    if((m.module||'').toLowerCase().indexOf(kw)>-1)return true;
    if((m.desc||'').toLowerCase().indexOf(kw)>-1)return true;
    return (m.items||[]).some(function(s){return (s.body||'').toLowerCase().indexOf(kw)>-1;});
  });
  renderHelpList(list);
}

// 渲染模块卡片列表
function renderHelpList(list){
  var box=$('#help-list');if(!box)return;
  if(!list.length){box.innerHTML='<div class="empty">未找到相关帮助内容</div>';return;}
  box.innerHTML=list.map(function(m){
    var sections=(m.items||[]).map(function(s,i){
      return '<div class="help-section" data-idx="'+i+'" style="display:none">'+
        '<h4>'+s.h+'</h4><pre>'+s.body+'</pre></div>';
    }).join('');
    return '<div class="help-module" data-id="'+m.id+'">'+
      '<div class="help-module-head" onclick="toggleModule(\''+m.id+'\')">'+
        '<span class="help-module-title">'+m.module+'</span>'+
        '<span class="help-toggle">展开</span>'+
      '</div>'+
      '<div class="help-module-summary">'+m.desc+'</div>'+
      '<div class="help-sections">'+sections+'</div>'+
    '</div>';
  }).join('');
}

// 展开/折叠模块（id=模块ID，forceOpen=true 时强制展开）
function toggleModule(id,forceOpen){
  var card=document.querySelector('.help-module[data-id="'+id+'"]');
  if(!card)return;
  var isOpen=card.classList.contains('open');
  if(forceOpen&&isOpen)return;
  card.classList.toggle('open');
  var sections=card.querySelectorAll('.help-section');
  var toggle=card.querySelector('.help-toggle');
  if(card.classList.contains('open')){
    sections.forEach(function(s){s.style.display='block';});
    if(toggle)toggle.textContent='收起';
  }else{
    sections.forEach(function(s){s.style.display='none';});
    if(toggle)toggle.textContent='展开';
  }
}

// 渲染上下文提示条（route() 中每次调用）
function renderContextHint(pageKey){
  var tip=HELP_PAGE_TIPS[pageKey];
  var helpId=HELP_PAGE_MAP[pageKey];
  if(!tip||sessionStorage.getItem('help-dismiss-'+pageKey))return '';
  var link=helpId?'<a class="link" onclick="openHelp(\''+helpId+'\')">了解更多 →</a>':'';
  return '<div class="help-hint">'+
    '<span>'+tip+'</span>'+
    link+
    '<span class="help-hint-close" onclick="dismissContextHint(\''+pageKey+'\')">✕</span>'+
  '</div>';
}

// 关闭上下文提示（本次会话不再显示）
function dismissContextHint(pageKey){
  sessionStorage.setItem('help-dismiss-'+pageKey,'1');
  var hints=document.querySelectorAll('.help-hint');
  hints.forEach(function(h){h.remove();});
}
