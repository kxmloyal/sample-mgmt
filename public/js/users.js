// users.js — 用户管理（管理员）
async function viewUsers(){
  const v=$('#view');v.innerHTML='<div class="filters"><fluent-text-field id="u-user" placeholder="账号"></fluent-text-field><fluent-text-field id="u-name" placeholder="姓名"></fluent-text-field><fluent-select id="u-role"><fluent-option value="RD">研发 RD</fluent-option><fluent-option value="ME">生技 ME</fluent-option><fluent-option value="QA">品保 QA</fluent-option><fluent-option value="CUSTODY">保管 CUSTODY</fluent-option></fluent-select><fluent-text-field id="u-dept" placeholder="部门"></fluent-text-field><fluent-text-field id="u-pass" placeholder="初始密码" value="123456"></fluent-text-field><fluent-button appearance="accent" size="small" onclick="addUser()">新增账号</fluent-button></div><div id="u-list"></div>';
  loadUsers();
}
async function loadUsers(){
  const list=await api('GET','/api/users');
  $('#u-list').innerHTML='<div class="card" style="padding:0"><table><tr><th>账号</th><th>姓名</th><th>角色</th><th>部门</th></tr>'+
    list.map(u=>'<tr><td>'+e(u.username)+'</td><td>'+e(u.display_name||'—')+'</td><td>'+(ROLE[u.role]||u.role)+'</td><td class="muted">'+e(u.dept||'—')+'</td></tr>').join('')+'</table></div>';
}
async function addUser(){
  try{await api('POST','/api/users',{username:$('#u-user').value,display_name:$('#u-name').value,role:$('#u-role').value,dept:$('#u-dept').value,password:$('#u-pass').value});
    toast('账号已创建','ok');$('#u-user').value='';$('#u-name').value='';$('#u-dept').value='';loadUsers();}
  catch(e){toast(e.message,'err');}
}
