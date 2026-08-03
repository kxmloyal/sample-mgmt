// logs.js — 操作日志
async function viewLogs(){
  const v=$('#view');v.innerHTML='<div class="muted">加载中…</div>';
  const logs=await api('GET','/api/logs');
  if(!logs.length){v.innerHTML='<div class="empty">暂无日志</div>';return;}
  v.innerHTML='<div class="card" style="padding:0"><table><tr><th>时间</th><th>样品</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>'+
    logs.map(l=>'<tr><td class="muted">'+fmt(l.created_at)+'</td><td>'+e(l.sample_no||'—')+'</td><td>'+(ACTION_CN[l.action]||l.action)+'</td><td class="muted">'+e(l.role||'')+'/'+e(l.dept||'')+'</td><td class="muted">'+e(l.location||'—')+'</td><td class="muted">'+e(l.note||'—')+'</td></tr>').join('')+'</table></div>';
}
