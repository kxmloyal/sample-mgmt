// fixture-list-filter.js — 治具清单筛选、排序、分页控件
// 依赖：fixtureListState (fixture-list.js), loadFixtureList (fixture-list.js)

function clearFilterChip(idx) {
  var keys = [];
  if (fixtureListState.status) keys.push('status');
  if (fixtureListState.dept) keys.push('dept');
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
