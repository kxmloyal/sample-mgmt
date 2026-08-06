// list-filter.js — 任务列表筛选 URL 化（A4）+ CSV 导出（复用当前筛选）
// 独立文件原因：list.js 顶层函数已达 8 个（§7.2 ≤10），筛选工具隔离于此

// A4 筛选状态 URL 化：查询时把筛选写入 hash（页码不写入，刷新回第一页）
function lkApplyFilters() {
  const qs = new URLSearchParams();
  const map = {
    q: '#lk-q', project: '#lk-project', status: '#lk-status',
    category: '#lk-category', priority: '#lk-priority', assignee: '#lk-assignee'
  };
  for (const [key, sel] of Object.entries(map)) {
    const val = $(sel).value;
    if (val) qs.set(key, val);
  }
  if (_lkMine) qs.set('mine', '1');
  _lkPage = 0;
  location.hash = '#/list' + (qs.toString() ? '?' + qs : '');
  lkLoad();
}

// 从 hash 恢复筛选（进入页面时 renderTaskList 调用；project 由原 attempt 逻辑兜底异步注册）
function lkRestoreFromHash() {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const set = function (id, v) { if (v) $(id).value = v; };
  set('#lk-q', qs.get('q'));
  set('#lk-project', qs.get('project'));
  set('#lk-status', qs.get('status'));
  set('#lk-category', qs.get('category'));
  set('#lk-priority', qs.get('priority'));
  set('#lk-assignee', qs.get('assignee'));
  if (qs.get('mine') === '1' && !_lkMine) lkToggleMine();
}

// 导出 CSV：复用当前筛选参数拼 URL（location.href 触发下载，避免弹窗拦截；缺陷#3 后端已复用筛选）
function lkExport() {
  const qs = new URLSearchParams();
  const map = { q: '#lk-q', project: '#lk-project', status: '#lk-status',
    category: '#lk-category', priority: '#lk-priority', assignee: '#lk-assignee' };
  for (const [key, sel] of Object.entries(map)) {
    const val = $(sel).value;
    if (val) qs.set(key, val);
  }
  location.href = '/api/projects/tasks/export' + (qs.toString() ? '?' + qs : '');
}
