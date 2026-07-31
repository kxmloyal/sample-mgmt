// board.js — 生命周期看板
async function viewBoard(){
  const v=$('#view');v.innerHTML='<div class="muted">加载中…</div>';
  const d=await api('GET','/api/dashboard');
  let h='<div class="card"><h3 style="margin:0 0 12px">复检逾期（'+d.overdue.length+'）</h3>'+
    (d.overdue.length?table(d.overdue,true):'<div class="empty">无逾期，全部在控 🎉</div>')+'</div>';
  h+='<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">7 天内将到复检期（'+d.dueSoon.length+'）</h3>'+
    (d.dueSoon.length?table(d.dueSoon,false):'<div class="empty">未来 7 天无到期</div>')+'</div>';
  v.innerHTML=h;
}
function table(list,isOver){
  return '<table><tr><th>编号</th><th>名称</th><th>保管部门</th><th>储位</th><th>复检周期</th><th>应复检日</th></tr>'+
    list.map(s=>'<tr><td>'+e(s.sample_no)+'</td><td>'+e(s.name||'—')+'</td><td>'+e(s.custody_dept||'—')+'</td><td>'+e(s.storage_location||'—')+'</td><td>'+(s.release_cycle_days||'—')+'天</td><td class="'+(isOver?'b-overdue':'')+'" style="font-weight:600">'+fmt(s.next_inspect_at)+'</td></tr>').join('')+'</table>';
}
