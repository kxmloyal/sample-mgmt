// fixture-list-filter.js — 治具清单筛选、排序、分页控件
// 依赖：fixtureListState (fixture-list.js), loadFixtureList (fixture-list.js)

function clearFilterChip(idx) {
  var keys = [];
  if (fixtureListState.status) keys.push('status');
  if (fixtureListState.dept) keys.push('dept');
  if (fixtureListState.model) keys.push('model');
  if (fixtureListState.dormant) keys.push('dormant');
  if (fixtureListState.search) keys.push('search');
  if (idx >= 0 && idx < keys.length) {
    fixtureListState[keys[idx]] = '';
    fixtureListState.pageNo = 1;
  }
  loadFixtureList();
}

function clearAllFilters() {
  fixtureListState.status = '';
  fixtureListState.dept = '';
  fixtureListState.search = '';
  fixtureListState.dormant = '';
  fixtureListState.model = '';
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function filterFixtureListStatus(val) {
  fixtureListState.status = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function filterFixtureListDept(val) {
  fixtureListState.dept = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function filterFixtureListDormant(val) {
  fixtureListState.dormant = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

// 机型筛选：写入 state.model 并刷新列表（筛选栏下拉 onchange 调用）
function filterFixtureListModel(val) {
  fixtureListState.model = val;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function debounceRenderFixtureList(val) {
  clearTimeout(fixtureListState._t);
  fixtureListState._t = setTimeout(function() {
    fixtureListState.search = val;
    fixtureListState.pageNo = 1;
    loadFixtureList();
  }, 300);
}

function toggleFixtureSort(val) {
  if (fixtureListState.col === val) {
    fixtureListState.dir = fixtureListState.dir === 'asc' ? 'desc' : 'asc';
  } else {
    fixtureListState.col = val;
    fixtureListState.dir = 'asc';
  }
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function changeFixturePageSize(val) {
  fixtureListState.page = parseInt(val) || 20;
  fixtureListState.pageNo = 1;
  loadFixtureList();
}

function goFixturePage(n) {
  fixtureListState.pageNo = n;
  loadFixtureList();
}
