// scan-return-actions.js — 退回审核操作的渲染函数（从 scan.js 提取，降低 scan.js 行数）
// 依赖：buildReleaseWizard (scan-wizard.js)、window._scanRdUsers (scan.js doScan 设置)

function renderReturnActions(action,s){
  if(action==='RETIRE_ONLY'){
    return '<label>作废原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述作废原因"></textarea>'+
      '<div style="margin-top:12px"><button class="btn" style="background:#dc2626" onclick="confirmScan(\'RETIRE_ONLY\')">确认作废</button></div>';
  }else if(action==='RETURN_REJECT'){
    return '<label>拒绝理由 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请填写拒绝退回的理由"></textarea>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'RETURN_REJECT\')">拒绝退回</button></div>';
  }else if(action==='RE_RELEASE'){
    return buildReleaseWizard(s,true);
  }else if(action==='RETIRE_RECREATE'){
    var rdOptions=(window._scanRdUsers||[]).map(function(u){return '<option value="'+u.id+'">'+e(u.display_name)+' ('+e(u.dept||'')+')</option>';}).join('');
    return '<label>指派研发人员 *</label><select id="scan-rd-select"><option value="">请选择RD</option>'+rdOptions+'</select>'+
      '<label>备注</label><input id="scan-note" placeholder="如：需重新制作"/>'+
      '<div style="margin-top:12px"><button class="btn" style="background:#f59e0b" onclick="confirmScan(\'RETIRE_RECREATE\')">确认作废并指派重做</button></div>';
  }else if(action==='RECREATE'){
    return '<p class="muted">基于样品 <b>'+e(s.sample_no)+'</b>（'+e(s.name||'—')+'）创建替代品</p>'+
      '<p style="font-size:12px;color:#6b7280">将自动复制标示卡信息，新样品编号自动分配</p>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'RECREATE\')">确认创建替代品</button></div>';
  }
  return '';
}
