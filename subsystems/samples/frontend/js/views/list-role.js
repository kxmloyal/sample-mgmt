// list-role.js — 样品列表角色化呈现配置（2026-09-05 方案A+B）
// 职责：全列定义（key 驱动）、角色档位（默认列集/默认排序/快捷入口）、完整视图开关状态
// 依赖：sampleTypeLabel/inspectBadge/statusBadge/e/fmt（定义于同 bundle 的 list.js/list-inspect.js 等）
// 设计：docs/superpowers/specs/2026-09-05-samples-list-role-view-design.md

/** 全列定义（顺序 = 完整视图列序；label/width/dataLabel/cell 四联动） */
var LIST_COL_DEFS = {
  idx:      { label: '#',            width: 42,  dataLabel: '序号',      cell: function (s, i) { return '<td data-label="序号" class="muted">' + (typeof i !== 'undefined' ? (samplePager.offset + i + 1) : '') + '</td>'; } },
  no:       { label: '编号',         width: 100, dataLabel: '编号',      cell: function (s) { return '<td data-label="编号">' + e(s.sample_no) + '</td>'; } },
  name:     { label: '名称',         width: 130, dataLabel: '名称',      cell: function (s) { return '<td data-label="名称">' + e(s.name || '—') + '</td>'; } },
  model:    { label: '机型/站别',    width: 90,  dataLabel: '机型/站别', cell: function (s) { return '<td data-label="机型/站别" class="muted">' + e(s.model || '—') + (s.station ? ' · ' + e(s.station) : '') + '</td>'; } },
  img:      { label: '图片',         width: 52,  dataLabel: '图片',      cell: function (s) { var im = s.produced_image || s.image ? '<img src="' + e(s.produced_image || s.image) + '" width="40" style="border-radius:4px"/>' : '—'; return '<td data-label="图片">' + im + '</td>'; } },
  spec:     { label: '规格',         width: 80,  dataLabel: '规格',      cell: function (s) { return '<td data-label="规格" class="muted">' + e(s.spec || '—') + '</td>'; } },
  type:     { label: '类型',         width: 70,  dataLabel: '类型',      cell: function (s) { var c = s.sample_type ? '<span class="badge" style="background:' + (s.sample_type === 'OK' ? '#16a34a' : '#dc2626') + ';color:#fff">' + sampleTypeLabel(s.sample_type) + '</span>' : '—'; return '<td data-label="类型">' + c + '</td>'; } },
  status:   { label: '状态',         width: 84,  dataLabel: '状态',      cell: function (s) { return '<td data-label="状态">' + statusBadge(s) + '</td>'; } },
  inspect:  { label: '复检状态',     width: 84,  dataLabel: '复检状态',  cell: function (s) { return '<td data-label="复检状态">' + inspectBadge(s) + '</td>'; } },
  produced: { label: '制作',         width: 78,  dataLabel: '制作',      cell: function (s) { return '<td data-label="制作" class="muted">' + fmt(s.produced_at) + '</td>'; } },
  released: { label: '发行',         width: 78,  dataLabel: '发行',      cell: function (s) { return '<td data-label="发行" class="muted">' + fmt(s.released_at) + '</td>'; } },
  custody:  { label: '保管部门/储位', width: 110, dataLabel: '保管/储位', cell: function (s) { return '<td data-label="保管/储位" class="muted">' + e(s.custody_dept || '—') + '/' + e(s.storage_location || '—') + '</td>'; } },
  // 2026-09-05 方案A：CHECKED_OUT 行「保管部门/储位」列临时改显领用人 + 应还（数据本就在 samples 表行内，零后端改动）
  checkout: { label: '领用人/应还',  width: 110, dataLabel: '领用/应还', cell: function (s) {
    if (s.status !== 'CHECKED_OUT') return '<td data-label="领用/应还" class="muted">—</td>';
    var late = s.expected_return_at && new Date(s.expected_return_at).getTime() < Date.now();
    var ret = late
      ? '<span class="b-overdue" style="font-weight:700">' + _fmtShort(s.expected_return_at) + '超时</span>'
      : '<span class="muted">' + _fmtShort(s.expected_return_at) + '</span>';
    return '<td data-label="领用/应还">' + e(s.checkout_user || '—') + ' / ' + ret + '</td>';
  } },
  due:      { label: '复检到期',     width: 84,  dataLabel: '复检到期',  cell: function (s) { var ov = s.next_inspect_at && new Date(s.next_inspect_at).getTime() < Date.now(); return '<td data-label="复检到期" class="' + (ov ? 'b-overdue' : 'muted') + '">' + fmt(s.next_inspect_at) + '</td>'; } },
  actions:  { label: '操作',         width: 120, dataLabel: '操作',      cell: function (s) { return '<td data-label="操作" style="white-space:nowrap">' + _sampleActions(s) + '</td>'; } }
};

/** 完整视图列序（与旧版 13 列一致；due 列仅在逾期视图插入到 actions 前） */
var LIST_ALL_COLS = ['idx', 'no', 'name', 'model', 'img', 'spec', 'type', 'status', 'inspect', 'produced', 'released', 'custody', 'checkout', 'actions'];

/** 短日期（MM-DD）——应还列用，减少列宽压力 */
function _fmtShort(v) { if (!v) return '—'; var d = new Date(v); return (d.getMonth() + 1) + '-' + d.getDate(); }

/** 行内操作（自 list-render.js 原 _sampleRowHtml 内联逻辑抽出，行为不变） */
function _sampleActions(s) {
  var actions = '<a class="link" onclick="viewDetail(' + s.id + ')">详情</a>';
  if (s.status === 'NEW')
    actions = '<a class="link" style="margin-right:8px" onclick="event.stopPropagation();printSampleLabel(' + s.id + ')">打印</a>' + actions;
  actions = '<a class="link" style="margin-right:8px" onclick="event.stopPropagation();downloadQR(' + s.id + ')">下载QR</a>' + actions;
  if ((s.status === 'NEW' || s.status === 'PRODUCED') && (me.role === 'ADMIN' || s.created_by === me.id))
    actions = '<a class="link" style="margin-right:8px;color:var(--bad)" onclick="event.stopPropagation();deleteSample(' + s.id + ')">取消</a>' + actions;
  return actions;
}

/** 角色档位：默认列集（完整视图的子集）/ 默认排序 / 快捷入口（quickFilter 键序） */
var LIST_ROLE_PROFILES = {
  RD:      { cols: ['idx', 'no', 'name', 'model', 'type', 'status', 'produced', 'actions'], sort: 'mine',    quick: ['pending', 'mine'] },
  QA:      { cols: ['idx', 'no', 'name', 'status', 'inspect', 'released', 'actions'],      sort: 'inspect', quick: ['pending', 'overdue', 'soon'] },
  CUSTODY: { cols: ['idx', 'no', 'name', 'status', 'custody', 'checkout', 'actions'],      sort: 'status',  quick: ['custody', 'checkout_overdue', 'pending', 'dept'] },
  ME:      { cols: ['idx', 'no', 'name', 'status', 'custody', 'checkout', 'actions'],      sort: 'status',  quick: ['custody', 'checkout_overdue', 'pending', 'dept'] },
  ADMIN:   { cols: null, sort: '', quick: ['pending', 'custody', 'checkout_overdue', 'overdue', 'soon'] } // null = 完整 14 列（现状）
};

/** 当前用户档位（多角色取主角色 me.role；未知角色兜底 ADMIN 全列） */
function listRoleProfile() {
  return LIST_ROLE_PROFILES[me.role] || LIST_ROLE_PROFILES.ADMIN;
}

/** 当前生效列集：完整视图开关 → 全列；否则角色档位列（无档位=全列） */
function listActiveCols() {
  if (_listFullView()) return LIST_ALL_COLS;
  var p = listRoleProfile();
  return p.cols || LIST_ALL_COLS;
}

/** 完整视图开关状态（sessionStorage：刷新保持、不跨会话；默认关=角色档） */
function _listFullView() {
  try { return sessionStorage.getItem('samples_list_full_view') === '1'; } catch (_) { return false; }
}
function toggleListFullView(cb) {
  try {
    if (cb && cb.checked) sessionStorage.setItem('samples_list_full_view', '1');
    else sessionStorage.removeItem('samples_list_full_view');
  } catch (_) {}
  loadSamples(); // 重新渲染表格（列集变更）
}

/** 快捷入口渲染：按档位 quick 键序生成（完整视图时展示全部入口） */
var QUICK_FILTER_DEFS = {
  pending:          { label: '待处理',   fn: function () { quickFilter('pending'); } },
  custody:          { label: '保管中',   fn: function () { quickFilter('custody'); } },
  checkout_overdue: { label: '超时未还', fn: function () { quickFilter('checkout_overdue'); } },
  overdue:          { label: '逾期',     fn: function () { quickFilter('overdue'); } },
  soon:             { label: '近7天',    fn: function () { quickFilter('soon'); } },
  mine:             { label: '我建的',   fn: function () { quickFilter('mine'); } },
  dept:             { label: '本部门',   fn: function () { quickFilter('dept'); } }
};
function quickLinksHtml() {
  var keys = _listFullView() ? ['pending', 'custody', 'checkout_overdue', 'overdue', 'soon'] : listRoleProfile().quick;
  return keys.map(function (k) {
    var d = QUICK_FILTER_DEFS[k];
    return d ? '<a class="link" style="font-size:12px" onclick="quickFilter(\'' + k + '\')">' + d.label + '</a>' : '';
  }).join('');
}
