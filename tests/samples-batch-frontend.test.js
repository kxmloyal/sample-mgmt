// tests/samples-batch-frontend.test.js — 批量领用/归还前端契约与队列模型（2026-09-16，需求 1 的 T4）
// 分两层：
//   ① 真跑层：在假 DOM/localStorage 下用 vm 执行 scan-batch.js 的队列函数（去重、上限、班次隔离、
//      幂等键复用、HTTP 语义分流），断言行为而非文本；
//   ② 契约层：源文件静态断言（挂载点、静默选项不新增顶层函数、CSS 归属、bundle 登记顺序、无重复定义）。
// 纯函数/源码层，不连库，可在生产环境安全运行。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const readSrc = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const count = (s, n) => s.split(n).length - 1;
const SB = 'subsystems/samples/frontend/js/views/scan-batch.js';

// 假 DOM：只实现本文件用到的 getElementById / innerHTML
function fakeDom() {
  const els = {};
  return {
    els,
    document: {
      getElementById: id => (els[id] = els[id] || { id, innerHTML: '', style: {}, value: '', setAttribute() {} }),
      addEventListener() {}
    }
  };
}

// 用 vm 加载 scan-batch.js + scan-batch-result.js（同一 bundle 作用域），注入假环境与可控的 api/me/toast。
// opts.store：可复用的 localStorage 后备对象，用于模拟「刷新页面后重新载入」的持久化恢复与班次隔离场景。
function loadBatch(opts) {
  const dom = fakeDom();
  const store = (opts && opts.store) || {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const calls = [];
  const toasts = [];
  const api = async (method, url, body) => {
    calls.push({ method, url, body });
    const h = (opts.handlers || {})[url];
    if (h) return h(body, calls.length);
    return { ok: [], failed: [], skipped: [] };
  };
  const sandbox = {
    document: dom.document, localStorage, window: {}, crypto: { randomUUID: () => 'uuid-fixed-0001' },
    me: opts.me || { id: 7, role: 'CUSTODY', dept: '制造部' }, STATUS: { IN_CUSTODY: '保管中', CHECKED_OUT: '领用中' },
    api, toast: (m, k) => toasts.push({ m, k }), console,
    e: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), // shared/frontend/shared/utils.js 同款
    // 单件路径的公共项收集（scan-payload.js 同款契约：读 #scan-co-* 填 body，失败返回 false）
    collectCheckoutPayload: b => {
      const u = dom.document.getElementById('scan-co-user').value.trim();
      if (!u) { toasts.push({ m: '请填写领用人', k: 'err' }); return false; }
      b.checkout_user = u; b.durationHours = 24; return true;
    },
    withSubmitLock: (btn, fn) => Promise.resolve().then(fn),
    initCheckoutUserPicker: () => {}, fmt: s => String(s), renderCoCandidates: () => {}, hideCoCandidates: () => {}, previewCheckoutDue: () => {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(readSrc(SB) + '\n' + readSrc('subsystems/samples/frontend/js/views/scan-batch-result.js'), ctx, { filename: SB });
  return { s: sandbox, calls, toasts, dom, store };
}

describe('批量队列模型（scan-batch.js 真跑）', () => {
  test('入队去重 + 上限 50 + 状态位初值', () => {
    const { s, toasts } = loadBatch({});
    s.document.getElementById('scan-batch'); // 容器存在（sbRender 需要）
    for (let i = 1; i <= 50; i++) expect(s.sbEnqueue({ sample_no: 'SM-' + i, name: 'n' + i }, ['CHECKOUT'])).toBe(true);
    expect(s._sbQueue.length).toBe(50);
    // 去重：同编号再次扫码被拒且不入队
    expect(s.sbEnqueue({ sample_no: 'SM-1' }, ['CHECKOUT'])).toBe(false);
    expect(s._sbQueue.length).toBe(50);
    expect(toasts.some(t => t.m.indexOf('已在队列中') > -1)).toBe(true);
    // 上限：第 51 件被拒
    expect(s.sbEnqueue({ sample_no: 'SM-51' }, ['CHECKOUT'])).toBe(false);
    expect(toasts.some(t => t.m.indexOf('队列已满') > -1)).toBe(true);
    expect(s._sbQueue[0]).toEqual({ code: 'SM-1', sample: { sample_no: 'SM-1', name: 'n1' }, acts: ['CHECKOUT'], state: 'pending' });
    expect(s.SB_LIMIT).toBe(50); // 与后端 BATCH_LIMIT 同值
  });

  test('队列操作：移出一件保留其余；清空同时作废幂等键与结果', () => {
    const { s } = loadBatch({});
    s.sbEnqueue({ sample_no: 'A' }); s.sbEnqueue({ sample_no: 'B' });
    s._sbBatchId = 'keep-me'; s._sbResult = { kind: 'done', ok: [], failed: [], skipped: [] };
    s.sbQueueOp('remove', 'A');
    expect(s._sbQueue.map(x => x.code)).toEqual(['B']);
    expect(s._sbBatchId).toBeNull(); // 队列一变，旧幂等键即作废（防误判已提交）
    s.sbQueueOp('clear');
    expect(s._sbQueue).toEqual([]);
    expect(s._sbResult).toBeNull();
  });

  test('首次使用（无历史记录）不得清空队列——「无记录」不等于「跨班次」', () => {
    // 回归护栏：2026-09-16 本地预跑发现，班次校验曾把「无历史载荷」误判为跨班次，
    // 导致第一次 sbPaint 把刚扫入的第一件静默清掉（实测入队 50 件只剩 49 件）
    const { s } = loadBatch({});
    expect(s.sbEnqueue({ sample_no: 'FIRST' }, ['CHECKOUT'])).toBe(true);
    expect(s._sbQueue.map(x => x.code)).toEqual(['FIRST']);
    expect(s.sbEnqueue({ sample_no: 'SECOND' }, [])).toBe(true); // allowedActions 为空 = 当前状态下本动作不适用
    expect(s._sbQueue.map(x => x.code)).toEqual(['FIRST', 'SECOND']);
    // 队首提示：不适用本动作的件被计数并标记（只读提示，不改变入队结果）
    expect(s.sbQueueHtml()).toContain('sb-chip-manual');
    expect(s.sbQueueHtml()).toContain('不适用本动作');
  });

  test('班次隔离：换操作人 或 超过 8 小时 → 丢弃继承来的队列；同人未超时 → 保留', () => {
    const t0 = Date.now();
    const seed = (store, uid, at, items, action) => {
      store['sample_batch_queue'] = JSON.stringify({ uid, at, action: action || 'CHECKOUT', items });
    };
    // 场景 A：操作人变化（同一浏览器换人登录）→ 丢弃
    const a = loadBatch({ me: { id: 9, role: 'CUSTODY' } });
    seed(a.store, 7, t0, [{ code: 'X' }]);
    const b = loadBatch({ me: { id: 9, role: 'CUSTODY' }, store: a.store });
    expect(b.s._sbQueue.length).toBe(1); // 载入期只解析，尚未判定
    b.s.document.getElementById('scan-batch');
    b.s.sbQueueHtml();                   // 首次渲染 → 触发班次校验
    expect(b.s._sbQueue).toEqual([]);
    // 场景 B：超 8 小时 → 丢弃
    const c = loadBatch({ me: { id: 7 } });
    seed(c.store, 7, t0 - 9 * 3600000, [{ code: 'Y' }]);
    const d = loadBatch({ me: { id: 7 }, store: c.store });
    d.s.document.getElementById('scan-batch');
    d.s.sbQueueHtml();
    expect(d.s._sbQueue).toEqual([]);
    // 场景 C：同人且未超时 → 保留，且动作随队列一并恢复
    const e = loadBatch({ me: { id: 7 } });
    seed(e.store, 7, t0, [{ code: 'Z' }], 'RETURN_OUT');
    const f = loadBatch({ me: { id: 7 }, store: e.store });
    expect(f.s._sbAction).toBe('RETURN_OUT');
    f.s.document.getElementById('scan-batch');
    f.s.sbQueueHtml();
    expect(f.s._sbQueue.map(x => x.code)).toEqual(['Z']);
  });

  test('提交成功：逐件状态位落 ok/failed，幂等键在落库后作废，公共项按单件同款收集', async () => {
    const { s, calls } = loadBatch({
      handlers: {
        '/api/samples/batch-action': () => ({
          action: 'CHECKOUT', batchId: 'uuid-fixed-0001',
          ok: [{ code: 'A', id: 1, sample_no: 'A', status: 'CHECKED_OUT' }],
          failed: [{ code: 'B', ok: false, code_: 'VERSION_CONFLICT', reason: '该样品刚被他人操作，请刷新后重试', retryable: true }],
          skipped: [{ code: 'A', reason: '本批队列内重复（首件为准）' }]
        })
      }
    });
    s.document.getElementById('scan-batch');
    s.sbEnqueue({ sample_no: 'A' }); s.sbEnqueue({ sample_no: 'B' });
    s.document.getElementById('scan-co-user').value = '张三';
    await s.sbSubmit(null);
    const body = calls.find(c => c.url === '/api/samples/batch-action').body;
    expect(body.action).toBe('CHECKOUT');
    expect(body.codes).toEqual(['A', 'B']);
    expect(body.batchId).toBe('uuid-fixed-0001');       // crypto.randomUUID 生成的幂等键
    expect(body.checkout_user).toBe('张三');            // 复用 collectCheckoutPayload
    expect(body.durationHours).toBe(24);
    expect(s._sbQueue.map(x => x.state)).toEqual(['ok', 'failed']);
    expect(s._sbResult.kind).toBe('done');
    expect(s._sbResult.failed[0].retryable).toBe(true);
    expect(s._sbBatchId).toBeNull();                    // 已落库 → 下次提交必须换新 id
    // 静默：批量通道不得触发全局 409 toast（逐件原因由结果面板承载）
    expect(calls.filter(c => c.url === '/api/samples/batch-resolve').length).toBe(0);
  });

  test('领用人缺失时不发请求（公共项校验前置）', async () => {
    const { s, calls } = loadBatch({});
    s.document.getElementById('scan-batch');
    s.sbEnqueue({ sample_no: 'A' });
    await s.sbSubmit(null);
    expect(calls.length).toBe(0);
    expect(s._sbQueue[0].state).toBe('pending'); // 状态位未被改成提交中
  });

  test('422 预校验失败：整批判「需人工」，不发第二次请求，队列保留', async () => {
    const { s, calls, toasts } = loadBatch({
      handlers: {
        '/api/samples/batch-action': () => {
          const e = new Error('预校验未通过，整批已取消（未执行任何操作）');
          e.status = 422; e.data = { code: 'PRECHECK_FAILED', executed: 0, rejected: [
            { code: 'B', code_: 'ACTION_NOT_ALLOWED', status: 'CHECKED_OUT', reason: '当前状态「领用中」下你的角色（CUSTODY）不可执行「CHECKOUT」' },
            { code: 'C', code_: 'NOT_FOUND', status: null, reason: '未找到对应样品' }], skipped: [] };
          throw e;
        }
      }
    });
    s.document.getElementById('scan-batch');
    s.sbEnqueue({ sample_no: 'A' });
    s.document.getElementById('scan-co-user').value = '张三';
    await s.sbSubmit(null);
    expect(calls.filter(c => c.url === '/api/samples/batch-action').length).toBe(1);
    expect(s._sbResult.kind).toBe('rejected');
    expect(s._sbResult.rejected.length).toBe(2);
    expect(s._sbResult.rejected.map(r => r.code_)).toEqual(['ACTION_NOT_ALLOWED', 'NOT_FOUND']);
    expect(toasts.some(t => t.m.indexOf('预校验未通过') > -1)).toBe(true);
  });

  test('网络异常：保留队列与同一 batchId（未知态重试不会重复执行）', async () => {
    let n = 0;
    const { s } = loadBatch({
      handlers: {
        '/api/samples/batch-action': () => { n++; const e = new Error('Failed to fetch'); throw e; }
      }
    });
    s.document.getElementById('scan-batch');
    s.sbEnqueue({ sample_no: 'A' });
    s.document.getElementById('scan-co-user').value = '张三';
    await s.sbSubmit(null);
    const first = s._sbBatchId;
    expect(first).not.toBeNull();
    expect(s._sbQueue[0].state).toBe('failed');
    await s.sbSubmit(null);
    expect(n).toBe(2);
    expect(s._sbBatchId).toBe(first); // 同一幂等键重试
  });

  test('409 BATCH_DUPLICATE：已生效件标 ok、其余回 pending，幂等键作废，并逐件只读复核', async () => {
    const { s, calls } = loadBatch({
      handlers: {
        '/api/samples/batch-action': () => {
          const e = new Error('该批次已提交过（batchId 重复），本次未执行任何操作');
          e.status = 409; e.data = { code: 'BATCH_DUPLICATE', executed: 0, applied: ['A'], batchId: 'dup-1' };
          throw e;
        },
        '/api/samples/batch-resolve': () => ({ items: [
          { code: 'A', ok: true, allowedActions: [] },                 // 已生效：本动作不再允许
          { code: 'B', ok: true, allowedActions: ['CHECKOUT'] }], skipped: [] })
      }
    });
    s.document.getElementById('scan-batch');
    s.sbEnqueue({ sample_no: 'A' }); s.sbEnqueue({ sample_no: 'B' });
    s.document.getElementById('scan-co-user').value = '张三';
    await s.sbSubmit(null);
    expect(s._sbQueue.map(x => x.state)).toEqual(['ok', 'pending']);
    expect(s._sbResult.kind).toBe('duplicate');
    expect(s._sbResult.applied).toEqual(['A']);
    expect(s._sbBatchId).toBeNull(); // 其余件须换新 id 重交
    const chk = calls.find(c => c.url === '/api/samples/batch-resolve');
    expect(chk.body.codes).toEqual(['A', 'B']);
    expect(chk.body.action).toBe('CHECKOUT');
  });
});

describe('前端契约（源文件静态断言）', () => {
  const src = readSrc(SB);
  const scan = readSrc('subsystems/samples/frontend/js/views/scan.js');
  const api = readSrc('subsystems/samples/frontend/js/api.js');
  const css = readSrc('subsystems/samples/frontend/css/batch.css');

  test('挂载点与开关：复用既有 #scan-cont（不新增第二个同屏连扫开关），容器为 #scan-batch', () => {
    expect(scan).toContain('id="scan-batch"');
    expect(scan).toContain('id="sb-mode-btn"');
    expect(count(scan, 'id="scan-cont"')).toBe(1);           // 全屏仍只有 1 个连扫开关
    expect(count(scan, '批量模式')).toBeGreaterThan(0);
    // 批量模式只在两处分流：doScan 入队分流 + viewScan 重挂载恢复；且仍走既有只读 /api/resolve
    expect(count(scan, 'if(_sbMode)')).toBe(1);              // doScan：扫码即入队
    expect(count(scan, "_sbMode&&$('#scan-batch')")).toBe(1); // viewScan：跨视图返回时恢复队列容器
    expect(scan).toContain("api('GET','/api/resolve?code='");
  });

  test('批量提交两条通道均带 silent，且 api.js 未新增顶层函数（仍 10 个声明，§7.2 上限内）', () => {
    expect(count(src, ", { silent: true }")).toBe(2);
    expect(api).toContain('api=async function(method,url,body,opts)');
    expect(api).toContain('err.data=data');
    expect(count(api, 'function _apiFetch(')).toBe(1);
    // 顶层 function 声明 10 个（§7.2 上限 10，未越线）；api= 是对 shared/api-base.js 的既有覆盖（非新增声明，故单列）
    const decl = (api.match(/^(async )?function /gm) || []).length;
    const override = (api.match(/^api=async function/gm) || []).length;
    expect(decl).toBe(10);
    expect(override).toBe(1);
  });

  test('仅允许 CHECKOUT / RETURN_OUT；动作白名单与后端一致', () => {
    expect(src).toContain("if (a !== 'CHECKOUT' && a !== 'RETURN_OUT') return;");
    expect(src).toContain("var _sbAction = 'CHECKOUT'");
    expect(src).not.toContain("'PRODUCE'");
    expect(src).not.toContain("'INSPECT'");
  });

  test('领用字段复用单件路径的 DOM id 与收集函数（不另造一份校验）', () => {
    ['scan-co-user', 'scan-co-dept', 'scan-co-hours', 'scan-co-due', 'scan-co-cand'].forEach(id => {
      expect(src).toContain('id="' + id + '"');
    });
    expect(src).toContain('collectCheckoutPayload(body)');
    expect(src).toContain('initCheckoutUserPicker');
  });

  test('样式写在子系统自有 batch.css，未污染共享 app.css', () => {
    expect(css).toContain('.sb-chip');
    expect(css).toContain('.sb-result');
    expect(css).toContain('@media (max-width:575px)');
    expect(readSrc('subsystems/samples/frontend/css/module.css')).not.toContain('.sb-chip{');
    const html = readSrc('subsystems/samples/frontend/index.html');
    expect(html).toContain('/subsystems/samples/frontend/css/batch.css?v=');
    expect(html).not.toContain('css/app.css?v=bmu');       // app.css 版本体系独立，不得被 bundle 版本污染
  });

  test('bundle 登记：scan-forms / scan-batch 均在 scan.js 之前（依赖顺序 = 单作用域可用性）', () => {
    const srcs = JSON.parse(readSrc('tools/bundle-sources.json')).samples;
    const iForms = srcs.indexOf('subsystems/samples/frontend/js/views/scan-forms.js');
    const iBatch = srcs.indexOf('subsystems/samples/frontend/js/views/scan-batch.js');
    const iScan = srcs.indexOf('subsystems/samples/frontend/js/views/scan.js');
    expect(iForms).toBeGreaterThan(-1);
    expect(iBatch).toBeGreaterThan(-1);
    expect(iForms).toBeLessThan(iScan);
    expect(iBatch).toBeLessThan(iScan);
    // bundle 已重建：新文件内容在产物中，且 showScanActionForm 未重复定义（外迁成功而非复制）
    const bundle = readSrc('subsystems/samples/frontend/js/bundle.js');
    expect(count(bundle, 'function showScanActionForm(')).toBe(1);
    expect(bundle).toContain('function sbSubmit(');
    expect(bundle).toContain('function showScanActionForm(action)');
  });
});
