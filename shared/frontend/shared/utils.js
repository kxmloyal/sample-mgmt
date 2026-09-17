// shared/utils.js — 跨子系统公共工具函数

/** HTML 实体转义，防止 XSS */
function e(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

/** 格式化文件大小 */
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  var units = ['B', 'KB', 'MB', 'GB'];
  var i = 0, size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

/** 修复 fluent-data-grid 列宽：Shadow DOM 仅 slot，row 本身是 grid 容器。
 *  fixGridColumns(el) 读取每个表头 cell 的 data-w 属性作为该列宽度，
 *  未设置 data-w 时回退 1fr（向后兼容：无 data-w 的表格行为不变）。
 *  data-w 取值示例：'120px' / 'min-content' / '2fr' / 'auto'。
 */
function fixGridColumns(container) {
  function apply() {
    (container || document).querySelectorAll('fluent-data-grid').forEach(function(grid) {
      try {
        var hdr = grid.querySelector('fluent-data-grid-row[row-type="header"]');
        if (!hdr) return;
        var cells = hdr.querySelectorAll('fluent-data-grid-cell');
        if (!cells.length) return;
        // 读取表头 cell 的 data-w 属性，未设置回退 1fr（保持向后兼容）
        var cols = Array.prototype.map.call(cells, function(c) {
          return c.getAttribute('data-w') || '1fr';
        }).join(' ');
        // grid 容器是 row（Shadow DOM 仅 slot），给每个 row 设 inline style
        grid.querySelectorAll('fluent-data-grid-row').forEach(function(row) {
          row.style.gridTemplateColumns = cols;
        });
      } catch(e) {}
    });
  }
  var TAG = 'fluent-data-grid';
  if (window.customElements) {
    customElements.whenDefined(TAG).then(function() { requestAnimationFrame(apply); });
  } else { apply(); }
}

// P1-8 修复：document 级 mousemove/mouseup 改为模块级单例（全页只注册 1 组，与表格列数无关）；
// 拖动目标（表/列/起始 x/起始宽度）在 mousedown 时记录、mouseup 时清空，
// 故表格被 innerHTML 重渲后不再残留监听器与游离 DOM（原先 12 列 × 每次渲染 = +24 个 document 监听器）。
var _colRszState = null, _colRszBound = false;

/** 注册 document 级拖拽监听（幂等，只成功注册一次） */
function _bindColRszDoc() {
  if (_colRszBound) return;
  _colRszBound = true;
  document.addEventListener('mousemove', function(e) {
    if (!_colRszState) return;
    if (_colRszState.col) _colRszState.col.style.width = Math.max(36, _colRszState.startW + (e.pageX - _colRszState.startX)) + 'px';
  });
  document.addEventListener('mouseup', function() {
    if (!_colRszState) return;
    _colRszState = null;
    document.body.style.cursor = ''; document.body.style.userSelect = '';
  });
}

/** 列宽拖拽调整 — 拖拽 th 右侧的 .col-rsz 把手修改对应 col 宽度（样品/治具共用）
 *  事件委托：mousedown 挂在表格自身（随表格 DOM 一同销毁），document 监听走 _bindColRszDoc 单例；
 *  函数名与签名 (table) 保持不变，全部既有调用点无需改动，对外行为不可区分。
 */
function _initColResize(table) {
  if (!table || table._colRszBound) return; // 同一表格重复初始化直接跳过
  table._colRszBound = 1;
  table.addEventListener('mousedown', function(e) {
    var handle = e.target && e.target.classList && e.target.classList.contains('col-rsz') ? e.target : null;
    if (!handle) return;
    var th = handle.parentNode;
    while (th && th.tagName !== 'TH') th = th.parentNode;
    if (!th) return;
    var i = Array.prototype.indexOf.call(table.querySelectorAll('thead th'), th);
    if (i < 0) return;
    var cols = table.querySelectorAll('colgroup col');
    e.preventDefault(); e.stopPropagation();
    _colRszState = { col: cols[i] || null, startX: e.pageX,
      startW: cols[i] ? parseInt(cols[i].style.width || getComputedStyle(cols[i]).width) : th.offsetWidth };
    document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    _bindColRszDoc();
  });
}

// 兼容别名：toast() → showToast()（从 public/js/ui.js 迁移）
function toast(msg, type) { showToast(msg, type); }
