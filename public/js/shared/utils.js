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

/** 修复 fluent-data-grid 列宽：FAST DataGrid 内部 grid-template-columns 默认为 auto，
 *  列宽按内容收缩。调用 fixGridColumns(el) 将容器内所有 data-grid 设为 1fr 均分。
 *  始终通过 customElements.whenDefined 异步执行，确保组件初始化完成后再设属性。
 */
function fixGridColumns(container) {
  function apply() {
    (container || document).querySelectorAll('fluent-data-grid').forEach(function(grid) {
      try {
        var hdr = grid.querySelector('fluent-data-grid-row[row-type="header"]');
        if (!hdr) return;
        var n = hdr.querySelectorAll('fluent-data-grid-cell').length;
        if (!n) return;
        var cols = Array(n).fill('1fr').join(' ');
        if ('gridTemplateColumns' in grid) grid.gridTemplateColumns = cols;
      } catch(e) {}
    });
  }

  var TAG = 'fluent-data-grid';
  if (window.customElements) {
    customElements.whenDefined(TAG).then(function() {
      requestAnimationFrame(apply);
    });
  } else {
    // 极老浏览器 fallback：直接执行
    apply();
  }
}
