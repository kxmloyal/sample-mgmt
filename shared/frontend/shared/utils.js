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

/** 列宽拖拽调整 — 拖拽 th 右侧的 .col-rsz 把手修改对应 col 宽度（样品/治具共用） */
function _initColResize(table) {
  if (!table) return;
  var cols = table.querySelectorAll('colgroup col');
  var ths = table.querySelectorAll('thead th');
  ths.forEach(function(th, i) {
    var handle = th.querySelector('.col-rsz');
    if (!handle) return;
    var dragging = false, startX, startW;
    handle.addEventListener('mousedown', function(e) {
      e.preventDefault(); e.stopPropagation();
      dragging = true; startX = e.pageX;
      startW = cols[i] ? parseInt(cols[i].style.width || getComputedStyle(cols[i]).width) : th.offsetWidth;
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function(e) {
      if (!dragging) return;
      var w = Math.max(36, startW + (e.pageX - startX));
      if (cols[i]) cols[i].style.width = w + 'px';
    });
    document.addEventListener('mouseup', function() {
      if (!dragging) return;
      dragging = false;
      document.body.style.cursor = ''; document.body.style.userSelect = '';
    });
  });
}
