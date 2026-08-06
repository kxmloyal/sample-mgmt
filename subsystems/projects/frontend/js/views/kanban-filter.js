// kanban-filter.js — 任务看板多维筛选（类别/优先级/责任人）+ 筛选 URL 化（A2/A4）
// 独立文件原因：kanban.js 顶层函数已达 10 个（§7.2 ≤10），筛选函数隔离于此保持各文件不超限
function kbFilters() {
  return {
    project_id: $('#kb-project').value,
    category: $('#kb-category').value,
    priority: $('#kb-priority').value,
    assignee_id: $('#kb-assignee').value
  };
}

// A4 筛选状态 URL 化：查询时把筛选写入 hash（进入页面时 kbRestoreFromHash 恢复）
function kbApplyFilters() {
  const f = kbFilters();
  const qs = new URLSearchParams();
  if (f.project_id) qs.set('project', f.project_id);
  if (f.category) qs.set('category', f.category);
  if (f.priority) qs.set('priority', f.priority);
  if (f.assignee_id) qs.set('assignee', f.assignee_id);
  if (_kbMine) qs.set('mine', '1');
  location.hash = '#/kanban' + (qs.toString() ? '?' + qs : '');
  kbLoad();
}

// 从 hash 恢复筛选（进入页面时调用；程序化赋值下拉不触发 change 事件，故末尾须由调用方显式 kbLoad）
function kbRestoreFromHash() {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const set = function (id, v) { if (v) $(id).value = v; };
  set('#kb-project', qs.get('project'));
  set('#kb-category', qs.get('category'));
  set('#kb-priority', qs.get('priority'));
  set('#kb-assignee', qs.get('assignee'));
  if (qs.get('mine') === '1' && !_kbMine) {
    _kbMine = true;
    $('#kb-mine').classList.add('active');
  }
}
