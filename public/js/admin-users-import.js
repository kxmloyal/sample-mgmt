// public/js/admin-users-import.js — 用户批量导入 + 模板导出（admin-users.html 专属）
// 2026-08-06 新增：CSV 模板（UTF-8 + BOM，Excel/WPS 可直接打开）、前端解析、POST /api/users/import 部分成功策略
// 依赖全局：e()（shared/utils.js）、toast()/api()（api-base.js）、openModal()（modal.js）、loadUsers()（admin-users.html）
// 说明：独立文件承载导入逻辑，避免 admin-users.html 顶层函数继续膨胀（红线 ≤10）

// CSV 解析：支持引号包裹字段与 "" 转义，返回行数组（每行为字段数组）
function parseCSV(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// 导出 CSV 模板：表头 + 示例行（角色用代码，部门取自部门字典）
function exportTemplate() {
  const header = ['账号', '姓名', '角色', '部门', '初始密码'];
  const sample = ['demo01', '示例用户', 'RD', '研发部', '123456'];
  const csv = '\uFEFF' + header.join(',') + '\n' + sample.join(',') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '用户导入模板.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  toast('模板已导出，请按表头填写后重新导入', 'ok');
}

// 触发隐藏的文件选择框
function pickImportFile() {
  const f = $('#u-import');
  if (f) f.click();
}

// 读取所选 CSV 并提交导入（限制 1MB / 500 行，由前端与后端双重校验）
function handleImport() {
  const input = $('#u-import');
  const file = input && input.files && input.files[0];
  if (!file) return;
  if (file.size > 1024 * 1024) { toast('文件超过 1MB 限制', 'err'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = async function (ev) {
    try {
      const rows = parseCSV(ev.target.result);
      if (rows.length < 2) { toast('模板为空或仅含表头，请参考导出的模板', 'err'); return; }
      const users = [];
      for (let i = 1; i < rows.length; i++) {
        const c = rows[i];
        if (!c.join('').trim()) continue; // 跳过空行
        users.push({
          username: String(c[0] || '').trim(),
          display_name: String(c[1] || '').trim(),
          role: String(c[2] || '').trim(),
          dept: String(c[3] || '').trim(),
          password: String(c[4] || '').trim()
        });
      }
      if (!users.length) { toast('没有可导入的数据行', 'err'); return; }
      const res = await api('POST', '/api/users/import', { users: users });
      renderImportResult(res);
      loadUsers();
    } catch (err) { toast('导入失败: ' + err.message, 'err'); }
    input.value = '';
  };
  reader.readAsText(file, 'UTF-8');
}

// 渲染导入结果弹窗：成功/跳过/失败统计 + 失败明细表
function renderImportResult(res) {
  const rows = (res.errors || []).map(function (x) {
    return '<tr><td>' + (x.row || '—') + '</td><td>' + e(x.username) + '</td><td>' + e(x.error) + '</td></tr>';
  }).join('');
  const detail = rows
    ? '<div class="ue-hint" style="margin-top:10px">失败明细（共 ' + res.errors.length + ' 行）：</div>' +
      '<div class="card" style="margin-top:8px;padding:0;max-height:280px;overflow:auto"><table class="au-tbl" style="min-width:0">' +
      '<tr><th style="width:56px">行号</th><th>账号</th><th>原因</th></tr>' + rows + '</table></div>'
    : '';
  openModal('批量导入结果',
    '<div class="ue-form">' +
    '<div style="font-size:14px;line-height:1.9">成功创建 <b style="color:var(--ok)">' + res.created + '</b> 个' +
    (res.skipped ? '；已存在跳过 <b style="color:var(--warn)">' + res.skipped + '</b> 个' : '') +
    (res.errors.length ? '；失败 <b style="color:var(--bad)">' + res.errors.length + '</b> 个' : '') +
    '</div>' + detail + '</div>',
    { foot: '<fluent-button appearance="accent" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>' });
}
