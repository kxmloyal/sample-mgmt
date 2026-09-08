// views/task-detail-ux.js — 任务详情交互强化（2026-09-08 方案A 前端）
// ① 主卡快捷流转条（状态驱动按钮组，替代进编辑页才能流转）
// ② 子任务拖拽排序（HTML5 dnd + 落定批量持久化）
// ③ 评论@提及（输入 @ 弹成员选择，提交后调 mention-notify）
// ④ 计数徽章（tabs 上显示子任务/评论/附件数）
// ⑤ 附件图片缩略图预览
var _tdUsers = null; // 成员缓存（@补全用，进详情时拉一次）

// === ① 快捷流转条：状态→可用动作映射（与状态机 ACTION 对齐；canEdit 由主渲染器传入） ===
// 方案一A②/三A：BACK/REOPEN 已补后端转边；OVERDUE 保留 开始(RESUME)/完成(FINISH)；
// 退回(BACK)与重新打开(REOPEN) 按钮已可用；新增 CANCELLED 终态（仅 PM/ADMIN 可 CANCEL，见 tduxCanCancel）
function tduxQuickActions(t, canEdit) {
  if (!canEdit) return '';
  const st = t.status_eff || t.status;
  const MAP = {
    'NOT_STARTED': [{ a: 'START', t: '▶ 开始', cls: 'accent' }, { a: 'CANCEL', t: '✕ 取消', cls: 'neutral', pm: 1 }],
    'IN_PROGRESS': [{ a: 'COMPLETE', t: '✔ 完成', cls: 'accent' }, { a: 'BACK', t: '↩ 退回', cls: 'neutral' }, { a: 'CANCEL', t: '✕ 取消', cls: 'neutral', pm: 1 }],
    'OVERDUE': [{ a: 'RESUME', t: '▶ 继续', cls: 'accent' }, { a: 'FINISH', t: '✔ 完成', cls: 'accent' }, { a: 'CANCEL', t: '✕ 取消', cls: 'neutral', pm: 1 }],
    'DONE': [{ a: 'REOPEN', t: '↩ 重新打开', cls: 'neutral' }],
    'CANCELLED': [] // 终态：无出边（如需恢复走 DB/后续 REOPEN 需求再评估）
  };
  // CANCEL 仅 ADMIN/PM（与状态机 role=["PM","ADMIN"] 对齐；ASSIGNEE/MEMBER 不可取消）
  let acts = (MAP[st] || []);
  if (typeof me !== 'undefined' && me.role !== 'ADMIN' && me.role !== 'PM') acts = acts.filter(x => !x.pm);
  if (!acts.length) return '';
  return '<div class="td-quick">' + acts.map(x =>
    '<fluent-button appearance="' + x.cls + '" size="small" onclick="tduxTransition(' + t.id + ',\'' + x.a + '\')">' + x.t + '</fluent-button>').join('') +
    '<span class="td-quick-hint muted">快捷流转</span></div>';
}

// 快捷流转执行（成功后走 tdRefresh 清缓存强刷 + 通知由后端触发点③自动发）
// 取消任务先确认（CANCELLED 为终态不可逆）
async function tduxTransition(tid, action) {
  if (action === 'CANCEL' && !confirm('确认取消该任务？取消后为终态，不可再流转。')) return;
  try {
    const r = await api('POST', PApi.task(tid) + '/status', { action: action });
    showToast(r.message || '流转成功');
  } catch (e) { showToast(e.message, 'err'); }
  tdRefresh();
}

// === ② 子任务拖拽排序 ===
function tduxSubDragStart(e) {
  const row = e.target.closest('.td-sub-row');
  if (!row) return;
  e.dataTransfer.setData('text/plain', row.dataset.sid);
  row.classList.add('dragging');
}
function tduxSubDragEnd(e) {
  const row = e.target.closest('.td-sub-row');
  if (row) row.classList.remove('dragging');
  document.querySelectorAll('.td-sub-row.drag-over').forEach(r => r.classList.remove('drag-over'));
}
function tduxSubDragOver(e) {
  e.preventDefault();
  const row = e.target.closest('.td-sub-row');
  if (row && !row.classList.contains('dragging')) {
    document.querySelectorAll('.td-sub-row.drag-over').forEach(r => r.classList.remove('drag-over'));
    row.classList.add('drag-over');
  }
}
async function tduxSubDrop(e) {
  e.preventDefault();
  const sid = Number(e.dataTransfer.getData('text/plain'));
  const target = e.target.closest('.td-sub-row');
  if (!sid || !target || Number(target.dataset.sid) === sid) return;
  // 重排 DOM：拖到目标行位置
  const rows = Array.from(document.querySelectorAll('#td-subs-list .td-sub-row'));
  const fromEl = rows.find(r => Number(r.dataset.sid) === sid);
  if (!fromEl) return;
  rows.splice(rows.indexOf(fromEl), 1);
  rows.splice(rows.indexOf(target), 0, fromEl);
  const list = $('#td-subs-list');
  rows.forEach(r => list.appendChild(r));
  document.querySelectorAll('.td-sub-row.drag-over').forEach(r => r.classList.remove('drag-over'));
  // 持久化
  try {
    await api('PUT', PApi.task(_tid) + '/subtasks-order', { ids: rows.map(r => Number(r.dataset.sid)) });
    showToast('排序已保存');
  } catch (err) { showToast(err.message, 'err'); tdRefresh(); }
}

// === ③ 评论 @提及：光标处检测 @ 触发成员浮层 ===
function tduxCmtInput() {
  const inp = $('#td-cmt');
  if (!inp) return;
  const pos = inp.selectionStart;
  const before = inp.value.slice(0, pos);
  const m = before.match(/@([^\s@]*)$/);
  const box = $('#td-at-box');
  if (!m || !_tdUsers) { if (box) box.style.display = 'none'; return; }
  const kw = m[1].toLowerCase();
  const hits = _tdUsers.filter(u => !kw || (u.display_name || '').toLowerCase().includes(kw)).slice(0, 6);
  if (!hits.length) { box.style.display = 'none'; return; }
  box.innerHTML = hits.map((u, i) =>
    '<div class="td-at-item' + (i === 0 ? ' sel' : '') + '" onclick="tduxAtPick(' + u.id + ',\'' + esc(u.display_name || ('#' + u.id)).replace(/'/g, '') + '\')">@' + esc(u.display_name || ('#' + u.id)) + '</div>').join('');
  box.style.display = 'block';
}
// 选中候选：替换 @kw 为 @名字 （发送时前端把名字映射回 id 提交 user_ids）
function tduxAtPick(uid, name) {
  const inp = $('#td-cmt');
  const pos = inp.selectionStart;
  const before = inp.value.slice(0, pos).replace(/@([^\s@]*)$/, '@' + name + ' ');
  inp.value = before + inp.value.slice(pos);
  inp.dataset.picked = (inp.dataset.picked ? inp.dataset.picked.split(',').map(Number) : []).concat(uid).join(',');
  $('#td-at-box').style.display = 'none';
  inp.focus();
}

// === ⑤ 附件缩略图（图片类内联预览） ===
function tduxFileThumb(f) {
  const isImg = /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.file_name || '');
  if (!isImg) return '';
  return '<a href="/uploads/projects/' + f.file_path + '" target="_blank"><img class="td-thumb" src="/uploads/projects/' + f.file_path + '" alt="' + esc(f.file_name) + '" loading="lazy"></a>';
}
