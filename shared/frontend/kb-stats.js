// kb-stats.js — 看板统计卡共享渲染组件（kb-stat 视觉协议见 public/css/app.css L228-235）
// 单击/双击双语义协议（参数注入，各看板按需选用）：
//   click:'filter'   单击 toggle 筛选（调用方提供全局筛选函数名，如 filterKbStat/filterDashStats）
//                    可叠加 href → 双击跳列表（samples 双语义卡协议：单击筛选待办·双击查看列表）
//   click:'navigate' 单击直接 location.hash 跳转（projects 统计卡跳列表）
//   click:'none'     仅展示（纯统计卡）
// 首用顺序：projects（试点）→ fixtures → samples（deployed 等价迁移）。样式统一走 /css/app.css，本文件不写样式。
(function () {
  /**
   * 渲染统计卡组 innerHTML（不含 .kb-stats 网格外壳，配 wrap 使用）
   * @param {Array} cards 卡片配置数组：{ n:数量, l:标签, color:CSS色值, href:跳转hash(可选), title:悬浮提示(可选) }
   * @param {Object} opts { click:'filter'|'navigate'|'none', filterHandler:'全局函数名(filter模式必填)',
   *                        activeIndex:number|null 高亮卡索引（null/0 视语义由调用方决定） }
   * @returns {string} 卡组 HTML（调用方用 KbStats.wrap() 包裹或并入更大片段）
   */
  function render(cards, opts) {
    opts = opts || {};
    var click = opts.click || 'none';
    return (cards || []).map(function (cfg, idx) {
      var attrs = '';
      if (cfg.title) attrs += ' title="' + cfg.title + '"';
      if (click === 'filter' && opts.filterHandler)
        attrs += ' onclick="' + opts.filterHandler + '(' + idx + ',this)"';
      else if (click === 'navigate' && cfg.href)
        attrs += ' onclick="location.hash=\'' + cfg.href + '\'"';
      // 双击跳列表：仅 filter 模式且卡片配置 href 时叠加（与单击 toggle 自洽：双击前两次 click 恰好复位筛选）
      if (click === 'filter' && cfg.href)
        attrs += ' ondblclick="location.hash=\'' + cfg.href + '\'"';
      var cls = 'kb-stat' + (opts.activeIndex === idx ? ' active' : '');
      return '<fluent-card class="' + cls + '" style="--stat-color:' + (cfg.color || 'var(--brand)') + '"' + attrs +
        '><div class="n">' + cfg.n + '</div><div class="l">' + cfg.l + '</div></fluent-card>';
    }).join('');
  }

  /** 包裹 .kb-stats 网格外壳（grid 布局定义在 /css/app.css） */
  function wrap(inner) { return '<div class="kb-stats">' + inner + '</div>'; }

  /**
   * active 高亮管理：容器内第 idx 张卡加 active、其余移除
   * @param {Element|string} container 卡组容器（.kb-stats 元素或选择器）；null 安全
   * @param {number|null} idx 高亮索引；null/负值清除全部高亮
   */
  function setActive(container, idx) {
    var el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    var cards = el.querySelectorAll('.kb-stat');
    for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('active', idx != null && idx >= 0 && i === idx);
  }

  window.KbStats = { render: render, wrap: wrap, setActive: setActive };
})();
