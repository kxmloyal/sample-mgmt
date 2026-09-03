// shared/frontend/detail-modal.js — 通用详情弹窗组件（设计系统 DM 规则：骨架屏/置顶Tab/密度自适应/dirty守卫/409刷新）
// 供各子系统详情弹窗复用；子系统只需提供渲染回调，交互骨架由本组件统一提供。
//
// 用法：
//   var dm = openDetailModal({
//     id: 'samples-67',
//     fetchData: async function(){ return await api('GET', ...); },  // 返回主数据
//     buildHead: function(data){ return '<b>'+e(data.sample_no)+'</b>' + statusBadge(data); },
//     tabs: function(data){ return [{key:'info',label:'信息',enabled:true}, {key:'logs',label:'日志',enabled:data.logs&&data.logs.length}]; },
//     buildTabContent: function(data, key){ return renderContent(data, key); },  // 返回 HTML
//     density: function(key){ return key==='info' ? 'dm-high' : (key==='card' ? 'dm-mid' : 'dm-low'); },
//     onTabRendered: function(key, data){ if(key==='image') loadImageHistory(id); },
//     footer: function(data){ return '<fluent-button ... onclick="closeModal(...)">关闭</fluent-button>'; },
//     onConflict: function(){ dm && dm.reload(); },   // 409 刷新
//   });
//   dm.open(id);           // 打开
//   dm.switchTab('logs');  // 切 Tab（内部处理 dirty 守卫）
//   dm.setDirty();         // 子系统编辑字段时调用（未保存拦截）
//   dm.reload();           // 重新加载数据
//   dm.close();
//
// 依赖: openModal/closeModal (shared/frontend/modal.js)、statusBadge/e（子系统注入，非本组件）
// 注意: 共享前端文件不使用 module.exports，openDetailModal 为全局函数（同 openModal/api 模式）

var DM_TABS_CLASS = 'detail-tabs-top';

function openDetailModal(cfg) {
  var data = null, currentTab = null, dirty = false, reqSeq = 0, mask = null;
  var DENSITY_DEFAULT = { info: 'dm-high', card: 'dm-mid', logs: 'dm-low', image: 'dm-low', overview: 'dm-high', files: 'dm-low' };

  function applyDensity(key) {
    var d = document.querySelector('.modal-mask fluent-dialog');
    if (!d) return;
    var cls = cfg.density ? cfg.density(key) : (DENSITY_DEFAULT[key] || 'dm-mid');
    d.classList.add('dm-modal');
    d.classList.remove('d-high', 'd-mid', 'd-low');
    d.classList.add(cls);
  }

  function tabsHtml(activeKey) {
    var ts = cfg.tabs ? cfg.tabs(data) : [];
    if (!ts || !ts.length) return '';
    var h = '<div class="' + DM_TABS_CLASS + '">';
    ts.forEach(function(t) {
      if (t.enabled === false) return;
      h += '<div class="detail-tab' + (activeKey === t.key ? ' active' : '') + '" onclick="__dmSwitch(\'' + t.key + '\')">' + (t.label || t.key) + '</div>';
    });
    return h + '</div>';
  }

  function renderBody() {
    var body = document.querySelector('.modal-body');
    if (!body) return;
    var content = cfg.buildTabContent ? cfg.buildTabContent(data, currentTab) : '';
    body.innerHTML = tabsHtml(currentTab) + '<div class="dm-pad">' + content + '</div>';
    if (cfg.onTabRendered) cfg.onTabRendered(currentTab, data);
  }

  // 暴露到全局（HTML onclick 用）
  window.__dmSwitch = function(key) {
    if (dirty && !confirm('有未保存的修改，切换将丢失，继续？')) return;
    currentTab = key; dirty = false;
    applyDensity(key); renderBody();
  };
  window.__dmSetDirty = function() { dirty = true; };
  window.__dmClose = function() {
    if (dirty && !confirm('有未保存的修改，确定关闭？')) return;
    closeModal(mask);
  };

  return {
    open: async function(id) {
      reqSeq++;
      var seq = reqSeq;
      var foot = '<fluent-button appearance="neutral" size="small" onclick="closeModal(this.closest(\'.modal-mask\'))">关闭</fluent-button>'; // 数据就绪前默认关闭按钮，加载后由 cfg.footer(data) 重设
      var sk = '<div class="sk" style="height:20px;width:42%"></div><div class="overview-cards">' + '<div class="overview-card sk" style="height:130px"></div>'.repeat(4) + '</div>';
      mask = openModal('', sk, { head: '<b>加载中…</b>', foot: foot });
      var d;
      try { d = await cfg.fetchData(); } catch (e) {
        if (seq === reqSeq) { if (cfg.toast) cfg.toast('详情加载失败', 'err'); closeModal(mask); }
        return;
      }
      if (seq !== reqSeq) { closeModal(mask); return; }
      data = d;
      var head = cfg.buildHead ? cfg.buildHead(data) : '<b>' + (data && (data.sample_no || data.fixture_no || data.id)) + '</b>';
      // 默认 Tab：首个 enabled
      var ts = cfg.tabs ? cfg.tabs(data) : [];
      currentTab = (ts.find ? ts.find(function(t){ return t.enabled !== false; }) : ts[0]);
      currentTab = currentTab ? currentTab.key : null;
      mask.querySelector('.modal-head').innerHTML = head;
      if (cfg.footer) mask.querySelector('.modal-foot').innerHTML = cfg.footer(data); // 数据就绪后重设 foot（含操作按钮）
      applyDensity(currentTab);
      renderBody();
    },
    switchTab: function(key) { window.__dmSwitch(key); },
    setDirty: function() { dirty = true; },
    reload: async function() {
      try { data = await cfg.fetchData(); renderBody(); } catch (e) {}
    },
    close: function() { window.__dmClose(); },
    getData: function() { return data; }
  };
}

// 全局函数 openDetailModal 已定义（浏览器 bundle 中可直接调用）
