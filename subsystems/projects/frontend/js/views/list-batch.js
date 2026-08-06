// list-batch.js — 任务列表批量操作（checkbox 选择 + 批量指派/流转/删除）
// 独立文件原因：list.js 顶层函数已达 8 个（§7.2 ≤10），批量逻辑隔离于此保持各文件 <10
var _lkSel = new Set();
var _lkSuppress = false; // 抑制标志：表头全选程序化赋值行 checkbox 触发 change 级联重入（行中间态导致表头被置回 false → 重入清空）

// 行 checkbox 切换：fluent-checkbox 用 .checked 属性判断（:checked 伪类不匹配自定义元素），onchange 后触发
function lkRowCheck(cb) {
  const id = Number(cb.dataset.id);
  if (cb.checked) _lkSel.add(id); else _lkSel.delete(id);
  lkRenderBatchBar();
  if (_lkSuppress) return; // 程序化赋值阶段跳过表头联动（防级联重入）
  const all = document.querySelectorAll('.lk-row-check');
  const allChecked = all.length > 0 && Array.from(all).every(c => c.checked);
  const head = $('#lk-check-all');
  if (head) head.checked = allChecked;
}

// 表头全选：程序化赋值 .checked 触发组件回显（抑制期间忽略行 change 回调的表头联动）
function lkToggleAll() {
  const head = $('#lk-check-all');
  const all = document.querySelectorAll('.lk-row-check');
  _lkSuppress = true;
  try {
    for (const cb of all) {
      cb.checked = head.checked;
      if (head.checked) _lkSel.add(Number(cb.dataset.id)); else _lkSel.delete(Number(cb.dataset.id));
    }
  } finally {
    _lkSuppress = false;
  }
  lkRenderBatchBar();
}

// 批量操作栏渲染（选中 ≥1 条时浮现）
function lkRenderBatchBar() {
  const bar = $('#lk-batch');
  if (!bar) return;
  const n = _lkSel.size;
  if (n === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span style="align-self:center;font-size:13px">已选 <b>' + n + '</b> 条</span>' +
    '<fluent-button appearance="secondary" size="small" onclick="lkBatch(\'status\',\'START\')">批量开始</fluent-button>' +
    '<fluent-button appearance="secondary" size="small" onclick="lkBatch(\'status\',\'COMPLETE\')">批量完成</fluent-button>' +
    '<fluent-button appearance="accent" size="small" onclick="lkBatch(\'delete\')">批量删除</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="lkClearSel()">取消</fluent-button>';
}

function lkClearSel() {
  _lkSel.clear();
  document.querySelectorAll('.lk-row-check').forEach(c => { c.checked = false; });
  const head = $('#lk-check-all'); if (head) head.checked = false;
  lkRenderBatchBar();
}

// 批量操作提交（assign/status/delete → POST /api/projects/tasks/batch）
async function lkBatch(action, action2) {
  const ids = Array.from(_lkSel);
  if (ids.length === 0) return showToast('请先勾选任务', 'err');
  const body = { action: action, ids: ids };
  if (action === 'status') body.action2 = action2;
  try {
    const r = await api('POST', '/api/projects/tasks/batch', body);
    showToast('成功 ' + r.ok.length + ' 条' + (r.skipped.length ? '，跳过 ' + r.skipped.length + ' 条' : ''));
    lkClearSel();
    lkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
