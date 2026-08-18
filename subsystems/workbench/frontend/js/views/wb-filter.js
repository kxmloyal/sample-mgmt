// subsystems/workbench/frontend/js/views/wb-filter.js
// 工作台筛选栏/分页/hash 持久化（依赖全局：_deptFilter/_wbItems/renderWorkbenchDashboard/tierLabels/me/e）

// 从 location.hash 解析筛选状态（#type=sample&level=2&dept=...&keyword=...&offset=...）
function parseWbHash() {
  var f = { type: '', level: '', dept: '', apply_dept: '', keyword: '', stage: '', dormant: '', min_hours: '', max_hours: '', limit: 50, offset: 0 };
  var h = (location.hash || '').replace(/^#/, '');
  if (!h) return f;
  h.split('&').forEach(function(kv) {
    var i = kv.indexOf('=');
    if (i < 0) return;
    var k = kv.slice(0, i), v;
    try { v = decodeURIComponent(kv.slice(i + 1)); } catch (e) { return; } // 非法编码跳过该 kv，避免页面加载死循环
    if (v === '') return;
    if (k === 'offset') { f.offset = Math.max(parseInt(v, 10) || 0, 0); }
    else if (k === 'limit') { f.limit = parseInt(v, 10) || 50; }
    else if (k in f) f[k] = v;
  });
  return f;
}

// 序列化筛选状态为 hash 片段（空值跳过）
function serializeWbHash(f) {
  var parts = [];
  ['type', 'level', 'dept', 'apply_dept', 'keyword', 'stage', 'dormant', 'min_hours', 'max_hours'].forEach(function(k) {
    if (f[k]) parts.push(k + '=' + encodeURIComponent(f[k]));
  });
  if (f.offset > 0) parts.push('offset=' + f.offset);
  return parts.length ? '#/dashboard&' + parts.join('&') : '';
}

// 渲染筛选栏（含结果计数 + 清除按钮 + ADMIN 阈值入口）
function renderWbFilterBar(f, total, deptStats, applyDepts) {
  var tl = tierLabels();
  var deptOpts = '<option value="">全部负责部门</option>' + (deptStats || []).map(function(d) {
    return '<option value="' + d.dept + '"' + (f.dept === d.dept ? ' selected' : '') + '>' + d.dept + '</option>';
  }).join('');
  var applyOpts = '<option value="">全部申请部门</option>' + (applyDepts || []).map(function(d) {
    return '<option value="' + d + '"' + (f.apply_dept === d ? ' selected' : '') + '>' + d + '</option>';
  }).join('');
  var isAdmin = typeof me !== 'undefined' && me && me.role === 'ADMIN';
  var settingsBtn = isAdmin
    ? '<button class="btn btn-sm" onclick="openThresholdModal()" style="margin-left:8px">阈值设置</button>'
    : '';
  return '<div class="filters" style="margin:16px 0;display:flex;flex-wrap:wrap;gap:6px;align-items:center">' +
    '<input class="filter-select" id="wb-keyword" placeholder="编号/名称搜索" value="' + e(f.keyword) + '" style="max-width:150px" onkeydown="if(event.key===\'Enter\')wbSetFilter({keyword:this.value,offset:0})">' +
    '<select class="filter-select" id="wb-type" onchange="wbSetFilter({type:this.value,offset:0})">' +
      '<option value="">全部类型</option>' +
      '<option value="sample"' + (f.type === 'sample' ? ' selected' : '') + '>样品</option>' +
      '<option value="fixture"' + (f.type === 'fixture' ? ' selected' : '') + '>治具</option>' +
    '</select>' +
    '<select class="filter-select" id="wb-level" onchange="wbSetFilter({level:this.value,offset:0})">' +
      '<option value="">全部积压等级</option>' +
      '<option value="0"' + (f.level === '0' ? ' selected' : '') + '>' + tl[0] + '</option>' +
      '<option value="1"' + (f.level === '1' ? ' selected' : '') + '>' + tl[1] + '</option>' +
      '<option value="2"' + (f.level === '2' ? ' selected' : '') + '>' + tl[2] + '</option>' +
    '</select>' +
    '<select class="filter-select" id="wb-dept" onchange="wbSetFilter({dept:this.value,offset:0})">' + deptOpts + '</select>' +
    '<select class="filter-select" id="wb-apply-dept" onchange="wbSetFilter({apply_dept:this.value,offset:0})">' + applyOpts + '</select>' +
    '<span class="filter-group">' +
      '<label class="filter-check" title="仅显示无任何流转/移动记录的积压项目">' +
        '<input type="checkbox" id="wb-dormant"' + (f.dormant ? ' checked' : '') + ' onchange="wbSetFilter({dormant:this.checked?\'1\':\'\',offset:0})">仅呆滞</label>' +
      '<span style="font-size:12px;color:var(--muted)">停留</span>' +
      '<input class="filter-select" id="wb-min-h" placeholder="≥小时" value="' + e(f.min_hours || '') + '" style="width:70px" onchange="wbSetFilter({min_hours:this.value,offset:0})">' +
      '<span style="color:var(--muted)">~</span>' +
      '<input class="filter-select" id="wb-max-h" placeholder="≤小时" value="' + e(f.max_hours || '') + '" style="width:70px" onchange="wbSetFilter({max_hours:this.value,offset:0})">' +
    '</span>' +
    '<button class="btn btn-sm" onclick="wbClearFilter()">清除筛选</button>' +
    '<span style="margin-left:4px;font-size:12px;color:var(--muted)">共 ' + total + ' 条</span>' +
    '<button class="btn btn-sm" onclick="renderWorkbenchDashboard(true)">刷新</button>' +
    settingsBtn +
    '</div>';
}

// 渲染分页控件（上一页/下一页 + 页码/总数；≤1 页不渲染）
function renderWbPager(f, total) {
  var pageSize = f.limit || 50;
  var pages = Math.max(Math.ceil(total / pageSize), 1);
  var cur = Math.floor((f.offset || 0) / pageSize) + 1;
  if (pages <= 1) return '';
  return '<div class="pager" style="margin:12px 0;display:flex;align-items:center;gap:8px">' +
    '<button class="btn btn-sm" ' + (cur <= 1 ? 'disabled' : 'onclick="wbSetFilter({offset:' + ((cur - 2) * pageSize) + '})"') + '>上一页</button>' +
    '<span style="font-size:12px;color:var(--muted)">' + cur + ' / ' + pages + ' 页</span>' +
    '<button class="btn btn-sm" ' + (cur >= pages ? 'disabled' : 'onclick="wbSetFilter({offset:' + (cur * pageSize) + '})"') + '>下一页</button>' +
    '</div>';
}

// 更新筛选状态：合并 patch → 写 hash → 重载看板
function wbSetFilter(patch) {
  var f = parseWbHash();
  Object.keys(patch).forEach(function(k) { f[k] = patch[k]; });
  var hash = serializeWbHash(f);
  if (hash !== location.hash) history.replaceState(null, '', hash);
  renderWorkbenchDashboard(true);
}

// 一键清除筛选（含部门卡 active 态复位）
function wbClearFilter() {
  history.replaceState(null, '', location.pathname + location.search);
  _deptFilter = null;
  renderWorkbenchDashboard(true);
}
