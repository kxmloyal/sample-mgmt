// scan-return-actions.js — 退回审核操作的渲染函数（从 scan.js 提取，降低 scan.js 行数）
// 依赖：buildReleaseWizard (scan-wizard.js)、window._scanRdUsers (scan.js doScan 设置)

function renderReturnActions(action,s){
  if(action==='RETIRE_ONLY'){
    return '<label>作废原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述作废原因"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#dc2626" onclick="confirmScan(\'RETIRE_ONLY\',this)">确认作废</fluent-button></div>';
  }else if(action==='RETURN_REJECT'){
    return '<label>拒绝理由 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请填写拒绝退回的理由"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'RETURN_REJECT\',this)">拒绝退回</fluent-button></div>';
  }else if(action==='RELEASE'){
    // 修复：RELEASE 漏接分步向导（原仅 RE_RELEASE 接入，导致 QA 发行表单空白）
    return buildReleaseWizard(s,false);
  }else if(action==='RE_RELEASE'){
    return buildReleaseWizard(s,true);
  }else if(action==='RETIRE_RECREATE'){
    var rdOptions=(window._scanRdUsers||[]).map(function(u){return '<fluent-option value="'+u.id+'">'+e(u.display_name)+' ('+e(u.dept||'')+')</fluent-option>';}).join('');
    return '<label>指派研发人员 *</label><fluent-select id="scan-rd-select"><fluent-option value="">请选择RD</fluent-option>'+rdOptions+'</fluent-select>'+
      '<label>备注</label><fluent-text-field id="scan-note" placeholder="如：需重新制作"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#f59e0b" onclick="confirmScan(\'RETIRE_RECREATE\',this)">确认作废并指派重做</fluent-button></div>';
  }else if(action==='FORCE_REASSIGN'){
    // T12.3 ADMIN 兜底：强制改派（下拉数据源同 RETIRE_RECREATE，/api/resolve 在 RETURNING 下对全角色返回 rdUsers）
    var frdOptions=(window._scanRdUsers||[]).map(function(u){return '<fluent-option value="'+u.id+'">'+e(u.display_name)+' ('+e(u.dept||'')+')</fluent-option>';}).join('');
    return '<p style="font-size:12px;color:#b45309">管理员兜底：退回审核流程卡死时，强制改派重做研发人员（提交前将二次确认）</p>'+
      '<label>改派研发人员 *</label><fluent-select id="scan-rd-select"><fluent-option value="">请选择RD</fluent-option>'+frdOptions+'</fluent-select>'+
      '<label>备注</label><fluent-text-field id="scan-note" placeholder="如：原指派人不可用，改派"></fluent-text-field>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#b45309" onclick="confirmScan(\'FORCE_REASSIGN\',this)">强制改派</fluent-button></div>';
  }else if(action==='FORCE_RETIRE'){
    return '<p style="font-size:12px;color:#dc2626">管理员兜底：退回审核流程卡死时，强制作废该样品（不可撤销，提交前将二次确认）</p>'+
      '<label>作废原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述强制作废原因"></textarea>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" style="background:#dc2626" onclick="confirmScan(\'FORCE_RETIRE\',this)">强制作废</fluent-button></div>';
  }else if(action==='RECREATE'){
    return '<p class="muted">基于样品 <b>'+e(s.sample_no)+'</b>（'+e(s.name||'—')+'）创建替代品</p>'+
      '<p style="font-size:12px;color:#6b7280">将自动复制标示卡信息，新样品编号自动分配</p>'+
      '<div style="margin-top:12px"><fluent-button appearance="accent" onclick="confirmScan(\'RECREATE\',this)">确认创建替代品</fluent-button></div>';
  }
  return '';
}
