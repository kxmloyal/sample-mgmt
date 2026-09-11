// tests/detail-modal-shared.test.js — 共享详情弹窗组件：叠层取值 / 实例隔离 / 懒渲染骨架 / 密度类名
// 2026-09-11 DM-3（samples 详情弹窗迁移）前置修复的回归护栏。
// 纯前端：DOM 桩（vm + 极简 DOM，不依赖 jsdom），不连库、不写库，对 deployed:true 子系统只读兼容。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const SHARED = 'shared/frontend/detail-modal.js';

// ══════════════════════ 极简 DOM 桩（仅覆盖组件实际用到的 API） ══════════════════════
function ClassList() { this.s = new Set(); }
ClassList.prototype.add = function () { for (var i = 0; i < arguments.length; i++) this.s.add(arguments[i]); };
ClassList.prototype.remove = function () { for (var i = 0; i < arguments.length; i++) this.s.delete(arguments[i]); };
ClassList.prototype.contains = function (c) { return this.s.has(c); };
ClassList.prototype.toString = function () { return Array.from(this.s).join(' '); };

function El(tag, cls) {
  this.tagName = String(tag).toUpperCase();
  this.classList = new ClassList();
  this.children = [];
  this.parentElement = null;
  this.id = '';
  this._html = '';
  this.style = {};
  if (cls) String(cls).split(' ').forEach(c => { if (c) this.classList.add(c); });
}
Object.defineProperty(El.prototype, 'isConnected', {
  get: function () { var n = this; while (n.parentElement) n = n.parentElement; return !!(n && n.__docBody); }
});
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { return this._html; },
  set: function (v) { this._html = String(v == null ? '' : v); this.children = []; }
});
El.prototype.appendChild = function (c) { c.parentElement = this; this.children.push(c); return c; };
El.prototype.remove = function () {
  var p = this.parentElement;
  if (p) { var i = p.children.indexOf(this); if (i >= 0) p.children.splice(i, 1); }
  this.parentElement = null;
};
El.prototype.closest = function (sel) { var n = this; while (n) { if (matchSel(n, sel)) return n; n = n.parentElement; } return null; };
El.prototype.querySelector = function (sel) { var r = collect(this, sel, 1); return r.length ? r[0] : null; };
El.prototype.querySelectorAll = function (sel) { return collect(this, sel, Infinity); };
El.prototype.addEventListener = function () {};

function matchSimple(el, part) {
  if (part === '*') return true;
  if (part.charAt(0) === '.') return el.classList.contains(part.slice(1));
  if (part.charAt(0) === '#') return el.id === part.slice(1);
  return el.tagName === part.toUpperCase();
}
function matchSel(el, sel) {
  var parts = String(sel).trim().split(/\s+/);
  if (!matchSimple(el, parts[parts.length - 1])) return false;
  var i = parts.length - 2, n = el.parentElement;
  while (i >= 0 && n) { if (matchSimple(n, parts[i])) i--; n = n.parentElement; }
  return i < 0;
}
function collect(node, sel, limit) {
  var out = [];
  (function walk(cur) {
    for (var i = 0; i < cur.children.length; i++) {
      var c = cur.children[i];
      if (out.length < limit && matchSel(c, sel)) out.push(c);
      if (out.length < limit) walk(c);
    }
  })(node);
  return out;
}
function makeDoc() {
  var body = new El('body');
  body.__docBody = true;
  return {
    body: body,
    createElement: function (t) { return new El(t); },
    querySelector: function (sel) { var r = collect(body, sel, 1); return r.length ? r[0] : null; },
    querySelectorAll: function (sel) { return collect(body, sel, Infinity); },
    getElementById: function (id) { var all = collect(body, '*', 10000); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; },
    addEventListener: function () {}
  };
}

// ══════════════════════ 组件加载器（模拟 modal.js 的 openModal/closeModal DOM 结构） ══════════════════════
function loadComponent(opts) {
  opts = opts || {};
  var doc = makeDoc();
  var win = {};
  var confirms = [];
  var sandbox = {
    document: doc,
    window: win,
    console: console,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    confirm: function (msg) { confirms.push(msg); return opts.confirmAnswer !== false; }
  };
  sandbox.openModal = function (title, html, o) {
    o = o || {};
    var mask = new El('div', 'modal-mask');
    var dlg = new El('fluent-dialog'); dlg.id = 'fluent-modal';
    var head = new El('div', 'modal-head'); head.innerHTML = o.head != null ? o.head : ('<h3>' + title + '</h3>');
    var body = new El('div', 'modal-body'); body.innerHTML = html;
    var foot = new El('div', 'modal-foot'); foot.innerHTML = o.foot != null ? o.foot : '关闭';
    dlg.appendChild(head); dlg.appendChild(body); dlg.appendChild(foot);
    mask.appendChild(dlg);
    doc.body.appendChild(mask);
    return mask;
  };
  sandbox.closeModal = function (m) { if (m) m.remove(); };
  vm.createContext(sandbox);
  vm.runInContext(read(SHARED), sandbox, { filename: SHARED });
  return { sandbox: sandbox, win: win, doc: doc, confirms: confirms, open: sandbox.openDetailModal };
}

function baseCfg(extra) {
  return Object.assign({
    id: 't',
    fetchData: async function (id) { return { id: id, name: 'N' + id, logs: [1, 2] }; },
    buildHead: function (d) { return '<b>' + d.name + '</b>'; },
    tabs: function () { return [{ key: 'info', label: '信息' }, { key: 'logs', label: '日志' }]; },
    buildTabContent: function (d, key) { return '<p>CONTENT-' + key + '-' + d.id + '</p>'; },
    footer: function () { return '关闭'; }
  }, extra || {});
}
function tick() { return new Promise(function (r) { setTimeout(r, 5); }); }
function masks(doc) { return doc.querySelectorAll('.modal-mask'); }
function bodyHtml(mask) { return mask.querySelector('.modal-body').innerHTML; }

describe('共享详情弹窗组件（shared/frontend/detail-modal.js）', () => {
  test('叠层：密度类与内容只写本实例弹窗，不污染底层弹窗', async () => {
    const { sandbox, doc, open } = loadComponent();
    const bg = sandbox.openModal('背景', '<p>BG-BODY</p>', { head: '<b>BG-HEAD</b>' }); // 先开的底层窗（如柜位格位清单）
    const dm = open(baseCfg());
    await dm.open('1');

    const ms = masks(doc);
    expect(ms.length).toBe(2);
    expect(bodyHtml(bg)).toBe('<p>BG-BODY</p>');                                  // 底层 body 未被灌内容
    expect(bg.querySelector('.modal-head').innerHTML).toBe('<b>BG-HEAD</b>');      // 底层 head 未被覆盖
    expect(bg.querySelector('fluent-dialog').classList.contains('d-high')).toBe(false); // 底层未被加密度类

    const top = ms[ms.length - 1];
    expect(top.querySelector('fluent-dialog').classList.contains('d-high')).toBe(true);
    expect(top.querySelector('fluent-dialog').classList.contains('dm-modal')).toBe(true);
    expect(bodyHtml(top)).toContain('CONTENT-info-1');
  });

  test('多实例并存：__dmSwitch 按 mask 定位实例，互不串窗', async () => {
    const { win, doc, open } = loadComponent();
    const a = open(baseCfg());
    await a.open('A');
    const b = open(baseCfg());
    await b.open('B');

    const ms = masks(doc);
    expect(ms.length).toBe(2);
    const tabA = new El('div', 'detail-tab');
    ms[0].querySelector('.modal-body').appendChild(tabA); // 模拟旧窗内的 Tab 元素
    win.__dmSwitch(tabA, 'logs');

    expect(a.getTab()).toBe('logs');
    expect(b.getTab()).toBe('info');                                              // 新窗未被旧窗点击驱动
    expect(bodyHtml(ms[0])).toContain('CONTENT-logs-A');
    expect(bodyHtml(ms[1])).toContain('CONTENT-info-B');
  });

  test('dirty 守卫：使用子系统文案；取消则不改 Tab、不关闭', async () => {
    const { confirms, open } = loadComponent({ confirmAnswer: false });
    let dirty = true;
    const dm = open(baseCfg({
      isDirty: function () { return dirty; },
      dirtyMsg: { switch: '标示卡有未保存的修改，切换将丢失，继续？', close: '标示卡有未保存的修改，确定离开？' }
    }));
    await dm.open('1');

    dm.switchTab('logs');
    expect(confirms[0]).toBe('标示卡有未保存的修改，切换将丢失，继续？');
    expect(dm.getTab()).toBe('info');
    dm.close();
    expect(confirms[1]).toBe('标示卡有未保存的修改，确定离开？');
    expect(dm.isOpen()).toBe(true);

    dirty = false;
    dm.switchTab('logs');
    expect(dm.getTab()).toBe('logs');
    expect(dm.isOpen()).toBe(true);
  });

  test('懒渲染：先骨架一帧，再写真实内容并回调 onTabRendered', async () => {
    const { doc, open } = loadComponent();
    const rendered = [];
    const dm = open(baseCfg({
      skeleton: function (key) { return '<div class="sk">SKELETON-' + key + '</div>'; },
      lazyTabs: ['logs'],
      onTabRendered: function (key) { rendered.push(key); }
    }));
    await dm.open('1');
    expect(rendered).toEqual(['info']);

    dm.switchTab('logs');
    let html = doc.querySelector('.modal-mask .modal-body').innerHTML;
    expect(html).toContain('SKELETON-logs');          // 第一帧只有骨架
    expect(html).not.toContain('CONTENT-logs-1');
    await tick();
    html = doc.querySelector('.modal-mask .modal-body').innerHTML;
    expect(html).toContain('CONTENT-logs-1');         // 第二帧真实内容
    expect(html).not.toContain('SKELETON-logs');
    expect(rendered).toEqual(['info', 'logs']);
  });

  test('默认密度类名必须是 app.css 真实生效的 d-high/d-mid/d-low', async () => {
    const { doc, open } = loadComponent();
    const dm = open(baseCfg()); // 不传 density → 走组件默认表
    await dm.open('1');
    const dlg = masks(doc)[0].querySelector('fluent-dialog');
    expect(dlg.classList.contains('d-high')).toBe(true);
    expect(dlg.classList.contains('dm-high')).toBe(false);
    dm.switchTab('logs');
    expect(dlg.classList.contains('d-low')).toBe(true);
    expect(dlg.classList.contains('d-high')).toBe(false);

    const css = read('public/css/app.css');
    ['d-high', 'd-mid', 'd-low'].forEach(c => expect(css).toContain('#fluent-modal.' + c));
  });

  test('源码不得再出现不生效的 dm-* 密度类名与文档级 querySelector', () => {
    const src = read(SHARED);
    expect(src).not.toContain("'dm-high'");
    expect(src).not.toContain("'dm-mid'");
    expect(src).not.toContain("'dm-low'");
    expect(src).not.toContain("document.querySelector('.modal-body')");
    expect(src).not.toContain("document.querySelector('.modal-mask fluent-dialog')");
    expect(src).toContain('mask.__dmApi');
    expect(src).toContain('__dmSwitch(this,');
  });
});

describe('samples 详情弹窗迁移（DM-3）契约', () => {
  const detail = read('subsystems/samples/frontend/js/views/detail.js');
  const card = read('subsystems/samples/frontend/js/views/detail-card.js');
  const sources = JSON.parse(read('tools/bundle-sources.json'));

  test('detail.js 已改用共享组件，旧交互外壳已移除', () => {
    expect(detail).toContain('openDetailModal({');
    expect(detail).toContain('isDirty: function () { return _detailDirty; }');
    expect(detail).toContain("lazyTabs: ['logs', 'image']");
    ['_applyDetailDensity', '_topBody', '_topMask', '_buildTabsHTML', '_detailReqSeq'].forEach(x => expect(detail).not.toContain(x));
  });

  test('对外入口与业务渲染保留（列表/看板/柜位视图调用点不受影响）', () => {
    ['function viewDetail(', 'function renderTab(', 'function goScanFromDetail(', 'function loadImageHistory(',
      'function switchMainImage(', 'function printCard(', 'function _buildOverview(', 'function _buildLogsTab(',
      'function _buildTabSkeleton(', 'function _buildTabContent('].forEach(f => expect(detail).toContain(f));
    expect(detail).toContain("dirtyMsg: { switch: '标示卡有未保存的修改，切换将丢失，继续？', close: '标示卡有未保存的修改，确定离开？' }");
    expect(detail).toContain("onclick=\"_sdm.close()\"");
  });

  test('detail-card.js 不再直写 .modal-body，tryCloseDetail 已下线', () => {
    expect(card).not.toContain('tryCloseDetail');
    expect(card).not.toContain("document.querySelector('.modal-body')");
    expect(card).toContain('_sdm.reload()');
    expect(card).toContain('_sdm.isOpen()');
  });

  test('bundle 源顺序：detail-modal.js 必须唯一且排在 samples 的 detail.js 之前', () => {
    const arr = sources.samples;
    const i = arr.indexOf('shared/frontend/detail-modal.js');
    expect(i).toBeGreaterThan(-1);
    expect(arr.filter(x => x === 'shared/frontend/detail-modal.js').length).toBe(1);
    expect(i).toBeLessThan(arr.indexOf('subsystems/samples/frontend/js/views/detail.js'));
  });

  test('凡源文件调用 openDetailModal 的子系统，其 bundle 源清单 MUST 登记共享组件', () => {
    // 背景：projects 曾出现「源文件调用 openDetailModal，但 bundle-sources.json 未登记共享组件」
    // → 运行时 ReferenceError（projects 未上线故未暴露）。本断言防止该类漏登记复发。
    const ids = ['control', 'fixtures', 'projects', 'samples', 'workbench'];
    const callers = [];
    ids.forEach(id => {
      const arr = sources[id] || [];
      // 排除组件自身（其函数定义与用法注释里也含 openDetailModal( 字样）
      const calls = arr.filter(f => f !== SHARED && read(f).indexOf('openDetailModal(') !== -1);
      if (calls.length) {
        callers.push(id);
        expect(arr).toContain(SHARED);
        expect(arr.indexOf(SHARED)).toBeLessThan(arr.indexOf(calls[0]));
      }
    });
    expect(callers.sort()).toEqual(['fixtures', 'projects', 'samples']); // 防断言空转：三家确实在调用
  });

  test('三个子系统统一使用共享组件（fixtures/projects 回归面）', () => {
    expect(read('subsystems/fixtures/frontend/js/views/detail.js')).toContain('openDetailModal({');
    expect(read('subsystems/projects/frontend/js/views/project-detail-modal.js')).toContain('openDetailModal({');
    // fixtures 密度类名已订正为真实生效的 d-*
    expect(read('subsystems/fixtures/frontend/js/views/detail.js')).not.toContain("'dm-high'");
    expect(read('subsystems/fixtures/frontend/js/views/detail.js')).not.toContain("'dm-low'");
  });
});
