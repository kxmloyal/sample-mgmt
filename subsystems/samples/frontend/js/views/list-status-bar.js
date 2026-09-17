// list-status-bar.js — 样品列表「状态多选」标签排（2026-09-17）
// 背景：原 #f-status 是单值 fluent-select，其「全部状态」= 不过滤 = **含已作废**；用户要确认「某机种正式发行了
//       多少个样品」时无法排除作废样品，读到的数字偏大（实测 BD7620D：卡片 86 件，其中已作废 26 件，
//       详见 docs/RELEASE-v2.1.0.md §10）。后端 /api/samples 早已支持多值（db/dao-list.js `_listWhere`：
//       `status=A,B` → `status IN ('A','B')`），仅前端缺入口，故本次只补 UI，不动接口、不动 SQL。
// 设计（兼容优先，零改动既有读写点）：控件本体改为本文件渲染的标签排；#f-status 退化为隐藏值载体（逗号分隔），
//       于是 _buildQueryParams / renderChips / 深链(#/samples?status=A,B) / 导出 CSV / 快捷筛选 全部无需改动。
// 单一事实来源：选中态一律由 #f-status.value 反推（smSyncStatusBar），本文件不另存选中状态，避免两处漂移。
// 样式前缀 .lsb-*（list status bar）：与 batch.css 已占用的 .sb-*（批量领用/归还）刻意区分，见 module.css。
// 入口：list.js 渲染 #f-status-bar 容器并首帧调用 smSyncStatusBar()；list-filter.js 的 renderChips 每次重绘后调用同步。

/** 状态全集（顺序即展示顺序，与后端 status 枚举、看板卡片顺序一致） */
var _STATUS_LIST = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'CHECKED_OUT', 'RETURNING', 'RETIRED'];
/** 状态中文名（与 list-filter.js 的 chips / _roleStatusLabel 用词保持一致） */
var _STATUS_CN = { NEW: '待制作', PRODUCED: '制作完成', RELEASED: '已发行', IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中', RETIRED: '已作废' };
/** 「在用（不含已作废）」预设 = 除 RETIRED 外的 6 个状态；与看板总数卡「在管总量 = 存活 − 已作废」同口径 */
var _ACTIVE_STATUSES = ['NEW', 'PRODUCED', 'RELEASED', 'IN_CUSTODY', 'CHECKED_OUT', 'RETURNING'];

/** 读取当前已选状态数组。值载体为逗号分隔串，空串表示不过滤（= 全部状态，含已作废）。
 *  兼容：任何单值（如看板卡片深链 #/samples?status=RELEASED）都自然解析为长度 1 的数组。 */
function smStatusValues() {
  var el = $('#f-status');
  return String((el && el.value) || '').split(',').filter(function(s) { return s; });
}

/** #f-status 值载体唯一安全写入口：元素存在性守卫（写点可能早于 list.js 渲染该元素，裸写会抛错） */
function smSetStatusValue(v) { var el = $('#f-status'); if (el) el.value = v; }

/** 渲染状态标签排。选中态由 #f-status.value 反推，故深链赋值、chips 清除、快捷筛选置空后都能自动跟上。 */
function smSyncStatusBar() {
  var bar = $('#f-status-bar'); if (!bar) return;
  var sel = smStatusValues();
  var html = '<span class="lsb-label">状态：</span>' + _STATUS_LIST.map(function(k) {
    return '<span class="lsb-tag' + (sel.indexOf(k) >= 0 ? ' on' : '') + '" onclick="smToggleStatus(\'' + k + '\')" title="点击筛选该状态，可多选；再次点击取消">' + _STATUS_CN[k] + '</span>';
  }).join('');
  var allActive = sel.length === _ACTIVE_STATUSES.length && _ACTIVE_STATUSES.every(function(k) { return sel.indexOf(k) >= 0; });
  html += '<span class="lsb-sep"></span><span class="lsb-tag lsb-preset' + (allActive ? ' on' : '') + '" onclick="smToggleActivePreset()" title="一次筛出 6 个未作废状态（不含已作废），与看板「在管总量」同口径">在用（不含已作废）</span>';
  bar.innerHTML = html;
}

/** 切换单个状态（未选则加入，已选则移除）；移除最后一个后值载体为空串 = 回到「全部状态」。
 *  随后走既有 loadSamples 链路，参数构建/渲染/分页/导出全部复用，无重复实现。
 *  P1-7：改完值先本地同步高亮再发请求，不等网络往返。 */
function smToggleStatus(k) {
  var sel = smStatusValues();
  var i = sel.indexOf(k);
  if (i >= 0) sel.splice(i, 1); else sel.push(k);
  smSetStatusValue(sel.join(','));
  smSyncStatusBar();
  loadSamples();
}

/** 「在用（不含已作废）」预设：未全选则一次选中 6 个状态；已全选则清空（再点取消，回到全部状态）。同样先本地同步高亮（P1-7）。 */
function smToggleActivePreset() {
  var sel = smStatusValues();
  var allActive = sel.length === _ACTIVE_STATUSES.length && _ACTIVE_STATUSES.every(function(k) { return sel.indexOf(k) >= 0; });
  smSetStatusValue(allActive ? '' : _ACTIVE_STATUSES.join(','));
  smSyncStatusBar();
  loadSamples();
}
