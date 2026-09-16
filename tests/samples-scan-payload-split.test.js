// tests/samples-scan-payload-split.test.js — scan.js 载荷收集拆分护栏（2026-09-16）
// 背景：scan.js 字符数达 96.6%（§7.1 达 90% 仅允许精简），4 个表单载荷收集函数拆至 scan-payload.js。
// 本护栏防「函数被重新内联回 scan.js」与「新文件漏登记 bundle 源清单（顺序须在 scan.js 之前）」。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const SCAN = 'subsystems/samples/frontend/js/views/scan.js';
const PAYLOAD = 'subsystems/samples/frontend/js/views/scan-payload.js';
const FNS = ['collectCustodyCycle', 'previewCheckoutDue', 'collectCheckoutPayload', 'collectWizardPayload'];

describe('scan.js 载荷收集拆分（scan-payload.js）', () => {
  const scan = read(SCAN);
  const payload = read(PAYLOAD);
  test('4 个载荷函数定义在 scan-payload.js，且不再定义于 scan.js', () => {
    FNS.forEach((fn) => {
      expect(payload).toContain('function ' + fn + '(');
      expect(scan).not.toContain('function ' + fn + '(');
    });
  });
  test('调用点仍在 scan.js（表单 oninput 与 confirmScan 校验链未断）', () => {
    ['previewCheckoutDue()', 'collectCustodyCycle(body)', 'collectCheckoutPayload(body)', 'collectWizardPayload(body)']
      .forEach((call) => expect(scan).toContain(call));
  });
  test('bundle 源清单已登记且顺序在 scan.js 之前（bundle 单作用域可见性）', () => {
    const sources = JSON.parse(read('tools/bundle-sources.json'));
    const iPayload = sources.samples.indexOf(PAYLOAD);
    const iScan = sources.samples.indexOf(SCAN);
    expect(iPayload).toBeGreaterThan(-1);
    expect(iScan).toBeGreaterThan(-1);
    expect(iPayload).toBeLessThan(iScan);
  });
  test('两文件均在 §7.1 兜底线内，scan.js 已退出 90% 禁区', () => {
    expect(scan.length).toBeLessThan(20000);
    expect(payload.length).toBeLessThan(20000);
    expect(scan.length / 20000).toBeLessThan(0.9);
  });
});
