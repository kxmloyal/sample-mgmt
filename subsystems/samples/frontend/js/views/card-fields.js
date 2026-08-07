// card-fields.js — 标示卡字段状态判断/表格组件（scan/detail 共用）
// 依赖：LIMIT_ITEMS (constants.js)

// 生成 LIMIT_ITEMS 下拉选项，预选 matched 项
function limitItemOptions(matched){
  return LIMIT_ITEMS.map(function(item){
    return '<fluent-option value="'+item.code+'"'+(item.code===matched?' selected':'')+'>'+item.label+'</fluent-option>';
  }).join('');
}

// 标示卡字段状态判断
function cardFieldStatus(s,field){
  var val=s[field]||'';
  if(field==='sample_type'||field==='limit_item'){
    return val?'filled':'required_empty';
  }
  return val?'filled':'empty';
}
// 下拉回显：innerHTML 注入 selected 属性在 FAST upgrade 时序下失效（2026-08-07 实测），须注入后显式设置 value
function applyCardFieldValues(s){
  var el;
  el=document.getElementById('scan-card-type');if(el)el.value=s.sample_type||'';
  el=document.getElementById('scan-card-item');if(el)el.value=s.limit_item||'';
  el=document.getElementById('scan-card-source');if(el)el.value=s.source_type||'';
}

// 标示卡字段表格组件，三处复用（RELEASE Step2, INSPECT, 详情弹窗标示卡Tab）
function buildCardFieldTable(s,editable,suggestedVersion){
  var t=s.sample_type||'', l=s.limit_item||'', src=s.source_type||'';
  var ver=suggestedVersion||s.card_version||'', data=s.test_data||'', std=s.test_standard||'';
  var typeSt=cardFieldStatus(s,'sample_type'), itemSt=cardFieldStatus(s,'limit_item');
  var srcSt=cardFieldStatus(s,'source_type');
  var verSt=cardFieldStatus(s,'card_version'), dataSt=cardFieldStatus(s,'test_data');
  var stdSt=cardFieldStatus(s,'test_standard');

  function mark(field,status){
    if(status==='required_empty')return '<span style="color:#dc2626;font-size:11px;margin-left:4px">✗ 必填</span>';
    if(status==='filled')return '<span style="color:#16a34a;font-size:11px;margin-left:4px">✓'+(s.signed_by_rd?' RD已填':'')+'</span>';
    return '';
  }

  var ro=editable?'':'disabled';
  return '<table style="width:100%;font-size:12px;border-collapse:collapse">'+
    '<tr><td style="padding:4px 0;width:70px;color:#6b7280">样品类型 *</td>'+
      '<td style="padding:4px 0"><fluent-select id="scan-card-type" '+ro+'><fluent-option value="">请选择</fluent-option><fluent-option value="OK"'+(t==='OK'?' selected':'')+'>OK样品</fluent-option><fluent-option value="NG"'+(t==='NG'?' selected':'')+'>NG样品</fluent-option></fluent-select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('sample_type',typeSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">限度项目 *</td>'+
      '<td style="padding:4px 0"><fluent-select id="scan-card-item" '+ro+'><fluent-option value="">请选择</fluent-option>'+limitItemOptions(l)+'</fluent-select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('limit_item',itemSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">来源</td>'+
      '<td style="padding:4px 0"><fluent-select id="scan-card-source" '+ro+'><fluent-option value="">未指定</fluent-option><fluent-option value="C"'+(src==='C'?' selected':'')+'>客供(C)</fluent-option><fluent-option value="T"'+(src==='T'?' selected':'')+'>元山(T)</fluent-option><fluent-option value="G"'+(src==='G'?' selected':'')+'>元将五金塔岗分厂(G)</fluent-option></fluent-select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('source_type',srcSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">版次</td>'+
      '<td style="padding:4px 0"><fluent-text-field id="scan-card-ver" value="'+e(ver)+'" '+ro+' style="font-size:12px;width:100%"></fluent-text-field></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('card_version',verSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td>'+
      '<td style="padding:4px 0"><textarea id="scan-card-data" rows="2" style="resize:vertical;font-size:12px;width:100%" '+ro+'>'+e(data)+'</textarea></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('test_data',dataSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">标准范围</td>'+
      '<td style="padding:4px 0"><textarea id="scan-card-standard" rows="2" style="resize:vertical;font-size:12px;width:100%" '+ro+'>'+e(std)+'</textarea></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('test_standard',stdSt)+'</td></tr>'+
  '</table>';
}
