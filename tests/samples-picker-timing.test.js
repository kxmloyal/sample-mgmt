// tests/samples-picker-timing.test.js — 候选框出现/关闭时机评审修正（2026-09-09）
// ①扫码入口统一关面板 ②储位缓存成功即失效 ③候选 onmousedown（移动端竞态）④resize 监听去重
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('候选框时机修正', () => {
  const scan = read('subsystems/samples/frontend/js/views/scan.js');
  const sm = read('subsystems/samples/frontend/js/views/storage-loc-picker.js');
  const co = read('subsystems/samples/frontend/js/views/checkout-user-picker.js');

  test('①doScan 入口统一收起两个候选面板（扫码枪连续作业 blur 不触发）', () => {
    const iDo = scan.indexOf('async function doScan');
    expect(scan.slice(iDo).indexOf('hideSmCandidates')).toBeGreaterThan(-1);
    expect(scan.slice(iDo).indexOf('hideCoCandidates')).toBeGreaterThan(-1);
  });

  test('②CUSTODY/EDIT_STORAGE 成功后失效 _smCache（防空位徽标过期误导）', () => {
    expect(scan).toContain("if(action==='CUSTODY'||action==='EDIT_STORAGE')_smCache=null;");
  });

  test('③候选点选用 onmousedown（先于 blur，杜绝 200ms 竞态）', () => {
    expect(sm).toContain("onmousedown=\"pickStorageLoc");
    expect(co).toContain("onmousedown=\"pickCheckoutUser");
    expect(sm).not.toContain("onclick=\"pickStorageLoc");
    expect(co).not.toContain("onclick=\"pickCheckoutUser");
  });

  test('④两 picker 的 resize 监听均去重（防多次初始化累积）', () => {
    expect(sm).toContain("window.removeEventListener('resize', window._smResizeHandler)");
    expect(co).toContain("window.removeEventListener('resize', window._coResizeHandler)");
  });

  test('⑤失焦延迟关补齐（co 此前缺，点候选外区域不收）', () => {
    expect(co).toContain('setTimeout(hideCoCandidates, 200)');
    expect(sm).toContain('setTimeout(hideSmCandidates, 200)');
  });

  test('⑥迟到响应防复弹：接口返回时输入框已失焦/销毁则不渲染面板', () => {
    expect(co).toContain('document.activeElement === input');
    expect(sm).toContain('document.activeElement === input');
  });

  test('⑦全局 click-away 兜底：pointerdown capture 点面板/输入框以外即收起（覆盖 blur 触发不到的路径）', () => {
    expect(co).toContain('function ensureCoOutsideClose');
    expect(co).toContain("document.addEventListener('pointerdown', window._coOutsideHandler, true)");
    expect(co).toContain('t.closest(\'#scan-co-cand\')');
    expect(sm).toContain("if (typeof ensureCoOutsideClose === 'function') ensureCoOutsideClose();");
  });

  test('⑧blur 定时器可取消：聚焦/输入先 clearTimeout（防 200ms 内回焦被旧定时器误杀）', () => {
    expect(co).toContain('clearTimeout(window._coBlurTimer)');
    expect(sm).toContain('clearTimeout(window._smBlurTimer)');
  });
});
