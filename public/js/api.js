// api.js — 样品子系统入口（鉴权/登录/API 基础见 shared/api-base.js）
var me = null;
function showApp(){
  $('#app').style.display='flex';
  $('#me-name').textContent=me.display_name||me.username;
  $('#me-role').textContent=(ROLE[me.role]||me.role)+' · '+(me.dept||'');
  buildNav(); renderHelpButton(); route();
}

// ---- 样品专用 helpers ----
function overdue(s){return s.status==='IN_CUSTODY'&&s.next_inspect_at&&new Date(s.next_inspect_at).getTime()<Date.now();}
// 覆盖 shared/api-base.js 的 statusBadge：样品逾期检测
function statusBadge(s){var cls='b-'+(s.status==='IN_CUSTODY'&&overdue(s)?'overdue':s.status);return '<fluent-badge class="badge '+cls+'" appearance="filled">'+(STATUS[s.status]||s.status)+'</fluent-badge>';}
function goScan(code){location.hash='#/scan';setTimeout(()=>{if(code)$('#scan-code').value=code;},50);}
