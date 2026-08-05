// users.js — 用户管理（管理员）
async function viewUsers(){
  const v=$('#view');v.innerHTML='<div class="filters"><fluent-text-field id="u-user" placeholder="账号"></fluent-text-field><fluent-text-field id="u-name" placeholder="姓名"></fluent-text-field><fluent-select id="u-role"><fluent-option value="RD">研发 RD</fluent-option><fluent-option value="ME">生技 ME</fluent-option><fluent-option value="QA">品保 QA</fluent-option><fluent-option value="CUSTODY">保管 CUSTODY</fluent-option></fluent-select><fluent-text-field id="u-dept" placeholder="部门"></fluent-text-field><fluent-text-field id="u-pass" placeholder="初始密码" value="123456"></fluent-text-field><fluent-button appearance="accent" size="small" onclick="addUser()">新增账号</fluent-button></div><div id="u-list"></div>';
  loadUsers();
}
async function loadUsers(){
  const list=await api('GET','/api/users');
  window.__users=list;
  $('#u-list').innerHTML='<div class="card" style="padding:0"><table><tr><th>账号</th><th>姓名</th><th>角色</th><th>部门</th><th>操作</th></tr>'+
    list.map(u=>'<tr><td>'+e(u.username)+'</td><td>'+e(u.display_name||'—')+'</td><td>'+(ROLE[u.role]||u.role)+'</td><td class="muted">'+e(u.dept||'—')+'</td><td><fluent-button appearance="neutral" size="small" onclick="openEditUser('+u.id+')">编辑</fluent-button></td></tr>').join('')+'</table></div>';
}
// 编辑用户弹窗：用户信息卡 + 姓名/新密码分段字段（账号只读）
function openEditUser(id){
  const u=(window.__users||[]).find(x=>x.id===id);if(!u)return;
  const avatar=e((u.display_name||u.username||'?').trim().charAt(0));
  const roleLabel=e(ROLE[u.role]||u.role);
  openModal('编辑用户',
    '<div class="ue-form">'+
    '<div class="ue-user-card">'+
    '<div class="ue-avatar">'+avatar+'</div>'+
    '<div class="ue-meta"><div class="ue-name">'+e(u.display_name||u.username)+'</div>'+
    '<div class="ue-sub">账号 '+e(u.username)+' · '+roleLabel+' · '+e(u.dept||'—')+'</div></div>'+
    '</div>'+
    '<div class="ue-field"><div class="ue-label">姓名</div>'+
    '<fluent-text-field id="eu-name" value="'+e(u.display_name||'')+'"></fluent-text-field>'+
    '<div class="ue-hint">修改后，操作日志与签署记录将显示新姓名</div></div>'+
    '<div class="ue-field"><div class="ue-label">新密码</div>'+
    '<fluent-text-field id="eu-pass" type="password" placeholder="不修改请留空"></fluent-text-field>'+
    '<div class="ue-hint">留空表示不修改密码；保存后旧密码立即失效</div></div>'+
    '</div>',
    { foot:'<fluent-button appearance="accent" size="small" onclick="saveUser('+u.id+')">保存</fluent-button><fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">取消</fluent-button>' });
}
async function saveUser(id){
  const body={};const name=$('#eu-name').value.trim();const pass=$('#eu-pass').value;
  if(name!=='')body.display_name=name;
  if(pass!=='')body.password=pass;
  if(!Object.keys(body).length){toast('未做任何修改','err');return;}
  try{await api('PUT','/api/users/'+id,body);toast('已保存','ok');closeModal(document.querySelector('.modal-mask'));loadUsers();}
  catch(err){toast(err.message,'err');}
}
async function addUser(){
  try{await api('POST','/api/users',{username:$('#u-user').value,display_name:$('#u-name').value,role:$('#u-role').value,dept:$('#u-dept').value,password:$('#u-pass').value});
    toast('账号已创建','ok');$('#u-user').value='';$('#u-name').value='';$('#u-dept').value='';loadUsers();}
  catch(e){toast(e.message,'err');}
}
