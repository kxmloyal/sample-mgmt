// users.js — 用户管理（管理员）
async function viewUsers(){
  const v=$('#view');v.innerHTML='<div class="filters"><input id="u-user" placeholder="账号"/><input id="u-name" placeholder="姓名"/><select id="u-role"><option value="RD">研发 RD</option><option value="ME">生技 ME</option><option value="QA">品保 QA</option><option value="CUSTODY">保管 CUSTODY</option></select><input id="u-dept" placeholder="部门"/><input id="u-pass" placeholder="初始密码" value="123456"/><fluent-button appearance="accent" size="small" onclick="addUser()">新增账号</fluent-button></div><div id="u-list"></div>';
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
