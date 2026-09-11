// shared/frontend/detail-modal.js — 通用详情弹窗组件（设计系统 DM 规则：骨架屏/置顶Tab/密度自适应/dirty守卫/Tab懒渲染/409刷新）
// 供各子系统详情弹窗复用；子系统只需提供渲染回调，交互骨架由本组件统一提供。
//
// 用法：
//   var dm = openDetailModal({
//     id: 'samples-67',
//     fetchData: async function(id){ return await api('GET', '/api/samples/'+id); }, // 入参为 dm.open(id) 的 id（可选）
//     buildHead: function(data){ return '<b>'+e(data.sample_no)+'</b>' + statusBadge(data); },
//     tabs: function(data){ return [{key:'info',label:'信息',enabled:true}, {key:'logs',label:'日志',enabled:data.logs&&data.logs.length}]; },
//     buildTabContent: function(data, key){ return renderContent(data, key); },  // 返回 HTML（不含 .dm-pad 外层，组件统一包裹）
//     density: function(key){ return key==='info' ? 'd-high' : 'd-low'; },       // 可选，缺省见 DM_DENSITY_DEFAULT
//     skeleton: function(key){ return '<div class="sk"></div>'; },               // 可选：懒渲染 Tab 的骨架 HTML（自带内边距，组件不再包 .dm-pad）
//     lazyTabs: ['logs','image'],                                               // 可选：这些 Tab 先骨架一帧，下一帧再写真实内容
//     onTabRendered: function(key, data){ if(key==='image') loadImageHistory(id); }, // 每次内容写入后回调（异步加载挂这里）
//     isDirty: function(){ return _detailDirty; },                              // 可选：由子系统托管未保存态（优先于组件内部标记）
//     dirtyMsg: { switch:'切换将丢失，继续？', close:'确定关闭？' },               // 可选：覆盖确认文案
//     footer: function(data){ return '<fluent-button ... onclick="dm.close()">关闭</fluent-button>'; },
//     toast: function(msg,type){ showToast(msg,type); },                        // 可选：加载失败提示
//     onClosed: function(){ ... },                                              // 可选：关闭后回调
//   });
//   dm.open(id); dm.switchTab('logs'); dm.setDirty(true); dm.reload(); dm.close(); dm.getTab(); dm.isOpen();
//
// 依赖: openModal/closeModal (shared/frontend/modal.js)；statusBadge/e 由子系统注入，非本组件
// 注意: 共享前端文件不使用 module.exports，openDetailModal 为全局函数（同 openModal/api 模式）
//
// 2026-09-11 修复（叠层弹窗缺陷，samples DM-3 迁移的前置条件）：
//   1) 密度类与内容一律只写本实例自己的 mask —— 旧实现用文档级 querySelector 取「第一个」匹配
//      （层级选择器取 dialog、类选择器取 body），在「柜位/格位清单 → 详情」叠层场景会把密度类与内容
//      灌进底层弹窗（详情自身反而空白）；
//   2) Tab 切换/关闭/置脏的 HTML 回调改为按 mask 定位实例（`mask.__dmApi`）—— 旧实现用
//      `window.__dmSwitch` 等全局单例，叠层时后开实例会覆盖前者，点旧窗 Tab 会驱动新窗状态；
//   3) 密度类名订正为真实生效的 `d-high/d-mid/d-low`（app.css `#fluent-modal.d-*::part(control)` 控制宽度）；
//      旧默认值 `dm-high/dm-mid/dm-low` 在 app.css 中无任何规则 → 等于不生效（fixtures 密度设置长期空转）。

var DM_TABS_CLASS = 'detail-tabs-top';
// 各 Tab 默认密度（宽度）类：app.css 中 #fluent-modal.d-high=960px / .d-mid=800px / .d-low=640px
var DM_DENSITY_DEFAULT = { info: 'd-high', card: 'd-mid', logs: 'd-low', image: 'd-low', overview: 'd-high', files: 'd-low' };
var DM_DENSITY_ALL = ['d-high', 'd-mid', 'd-low'];

function openDetailModal(cfg) {
  cfg = cfg || {};
  var data = null, currentTab = null, lastId = null, dirty = false, reqSeq = 0, renderSeq = 0, mask = null;

  function topMask() { var ms = document.querySelectorAll('.modal-mask'); return ms.length ? ms[ms.length - 1] : null; }
  // 本实例的弹窗节点（mask 已被关闭的极端时序下回退到最上层，避免抛错）
  function myMask() { return (mask && mask.isConnected) ? mask : topMask(); }
  function isDirty() { return cfg.isDirty ? !!cfg.isDirty() : dirty; }
  function msgSwitch() { return (cfg.dirtyMsg && cfg.dirtyMsg.switch) || '有未保存的修改，切换将丢失，继续？'; }
  function msgClose() { return (cfg.dirtyMsg && cfg.dirtyMsg.close) || '有未保存的修改，确定关闭？'; }

  // 密度类：只作用本实例 dialog（叠层安全，不碰其它弹窗）
  function applyDensity(key) {
    var m = myMask();
    var d = m ? m.querySelector('fluent-dialog') : null;
    if (!d) return;
    var cls = cfg.density ? cfg.density(key) : (DM_DENSITY_DEFAULT[key] || 'd-mid');
    d.classList.add('dm-modal');
    DM_DENSITY_ALL.forEach(function (c) { d.classList.remove(c); });
    d.classList.add(cls);
  }

  function tabsHtml(activeKey) {
    var ts = cfg.tabs ? cfg.tabs(data) : [];
    if (!ts || !ts.length) return '';
    var h = '<div class="' + DM_TABS_CLASS + '">';
    ts.forEach(function (t) {
      if (t.enabled === false) return;
      // 传 this（.detail-tab 元素）→ 由 __dmSwitch 按 mask 反查实例，叠层时不串窗
      h += '<div class="detail-tab' + (activeKey === t.key ? ' active' : '') + '" onclick="__dmSwitch(this,\'' + t.key + '\')">' + (t.label || t.key) + '</div>';
    });
    return h + '</div>';
  }

  function contentHtml(key) { return cfg.buildTabContent ? cfg.buildTabContent(data, key || 'info') : ''; }
  function isLazy(key) { return !!(cfg.lazyTabs && key && cfg.lazyTabs.indexOf(key) !== -1 && cfg.skeleton); }

  // 渲染当前 Tab：useSkeleton=true 时先只写骨架，下一帧再写真实内容（D2.2 懒渲染）
  function renderBody(useSkeleton) {
    var body = myMask() ? myMask().querySelector('.modal-body') : null;
    if (!body) return;
    var mySeq = ++renderSeq;
    var key = currentTab;
    if (useSkeleton) {
      body.innerHTML = tabsHtml(key) + cfg.skeleton(key);
      setTimeout(function () {
        if (mySeq !== renderSeq || currentTab !== key) return; // 期间已切走/重渲，丢弃过期骨架
        var b = myMask() ? myMask().querySelector('.modal-body') : null;
        if (!b) return;
        b.innerHTML = tabsHtml(key) + '<div class="dm-pad">' + contentHtml(key) + '</div>';
        if (cfg.onTabRendered) cfg.onTabRendered(key, data);
      }, 0);
      return;
    }
    body.innerHTML = tabsHtml(key) + '<div class="dm-pad">' + contentHtml(key) + '</div>';
    if (cfg.onTabRendered) cfg.onTabRendered(key, data);
  }

  function switchTab(key) {
    if (isDirty() && !confirm(msgSwitch())) return;
    if (!cfg.isDirty) dirty = false; // 子系统托管 dirty 时由其自行清理（如标示卡 Tab 重渲后重置）
    currentTab = key;
    applyDensity(key);
    renderBody(isLazy(key));
  }

  function doClose() {
    if (isDirty() && !confirm(msgClose())) return;
    if (!cfg.isDirty) dirty = false;
    closeModal(myMask());
    if (cfg.onClosed) cfg.onClosed();
  }

  // 暴露到全局（HTML onclick 用）：按 mask 反查实例，多实例并存互不干扰
  window.__dmSwitch = function (el, key) {
    var m = el && el.closest ? el.closest('.modal-mask') : null;
    if (m && m.__dmApi) m.__dmApi.switchTab(key);
  };
  window.__dmSetDirty = function (el) {
    var m = el && el.closest ? el.closest('.modal-mask') : null;
    if (m && m.__dmApi) m.__dmApi.setDirty(true);
  };
  window.__dmClose = function (el) {
    var m = el && el.closest ? el.closest('.modal-mask') : null;
    if (m && m.__dmApi) m.__dmApi.close();
  };

  var api = {
    open: async function (id) {
      reqSeq++;
      var seq = reqSeq;
      lastId = id; currentTab = null; dirty = false; renderSeq++;
      var foot = '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>'; // 数据就绪前默认关闭按钮，加载后由 cfg.footer(data) 重设
      var sk = '<div class="sk" style="height:20px;width:42%"></div><div class="overview-cards">' + '<div class="overview-card sk" style="height:130px"></div>'.repeat(4) + '</div>';
      mask = openModal('', sk, { head: '<b>加载中…</b>', foot: foot });
      mask.__dmApi = api; // 供 __dmSwitch/__dmSetDirty/__dmClose 反查本实例
      var d;
      try { d = await cfg.fetchData(id); } catch (err) {
        if (seq === reqSeq) { if (cfg.toast) cfg.toast('详情加载失败', 'err'); closeModal(mask); }
        return;
      }
      if (seq !== reqSeq) { closeModal(mask); return; }
      data = d;
      var head = cfg.buildHead ? cfg.buildHead(data) : '<b>' + (data && (data.sample_no || data.fixture_no || data.id)) + '</b>';
      // 默认 Tab：首个 enabled；子系统返回空数组时 currentTab=null（不渲染 Tab 栏，内容按 info 兜底）
      var ts = cfg.tabs ? cfg.tabs(data) : [];
      var first = ts.find ? ts.find(function (t) { return t.enabled !== false; }) : ts[0];
      currentTab = first ? first.key : null;
      mask.querySelector('.modal-head').innerHTML = head;
      if (cfg.footer) mask.querySelector('.modal-foot').innerHTML = cfg.footer(data); // 数据就绪后重设 foot（含操作按钮）
      applyDensity(currentTab);
      renderBody(isLazy(currentTab));
    },
    switchTab: switchTab,
    setDirty: function (v) { dirty = (v === false) ? false : true; }, // 兼容无参调用（等价 true）
    reload: async function () {
      try { data = await cfg.fetchData(lastId); renderBody(false); } catch (err) {}
    },
    close: doClose,
    getData: function () { return data; },
    getTab: function () { return currentTab; },
    isOpen: function () { return !!(mask && mask.isConnected); }
  };
  return api;
}

// 全局函数 openDetailModal 已定义（浏览器 bundle 中可直接调用）
