// tests/samples-scan-payload-split.test.js — scan.js 载荷收集拆分护栏（2026-09-16）
// 背景：scan.js 字符数达 96.6%（§7.1 达 90% 仅允许精简），4 个表单载荷收集函数拆至 scan-payload.js。
// 本护栏防「函数被重新内联回 scan.js」与「新文件漏登记 bundle 源清单（顺序须在 scan.js 之前）」。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const SCAN = 'subsystems/samples/frontend/js/views/scan.js';
const SCAN_FORMS = 'subsystems/samples/frontend/js/views/scan-forms.js';
const PAYLOAD = 'subsystems/samples/frontend/js/views/scan-payload.js';
const FNS = ['collectCustodyCycle', 'previewCheckoutDue', 'collectCheckoutPayload', 'collectWizardPayload'];

describe('scan.js 载荷收集拆分（scan-payload.js）', () => {
  // 扫码台 = scan.js + scan-forms.js（2026-09-16 批次二 T0 把动作表单构造外迁至 scan-forms.js）。
  // 本套件校验「载荷函数的调用点仍在扫码台」，故取两文件的合并视图——护栏强度不降低，
  // 且对未来继续拆分保持稳健（只看「扫码台整体是否仍有该调用点」，不绑定具体文件）。
  const scan = read(SCAN) + read(SCAN_FORMS);
  const scanOnly = read(SCAN);
  const payload = read(PAYLOAD);
  test('4 个载荷函数定义在 scan-payload.js，且不再定义于扫码台任一文件', () => {
    FNS.forEach((fn) => {
      expect(payload).toContain('function ' + fn + '(');
      expect(read(SCAN)).not.toContain('function ' + fn + '(');
      expect(read(SCAN_FORMS)).not.toContain('function ' + fn + '(');
    });
  });
  test('调用点仍在扫码台（表单 oninput 与 confirmScan 校验链未断）', () => {
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
    expect(scanOnly.length).toBeLessThan(20000);
    expect(read(SCAN_FORMS).length).toBeLessThan(20000);
    expect(payload.length).toBeLessThan(20000);
    // T0 外迁（纯删除）后 85.5% → 49.7%；批次二 T4 又为其挂上批量模式开关与入队分流 → 53.2%（实测 10,648 字符）
    expect(scanOnly.length / 20000).toBeLessThan(0.6);
  });
});
