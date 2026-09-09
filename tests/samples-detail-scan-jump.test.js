// tests/samples-detail-scan-jump.test.js — 详情弹窗直达扫码台（2026-09-09 方案A）
// 契约校验：按钮接线 / 深链格式 / 关窗与脏态处理（纯前端，deployed:true 只读兼容）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('详情弹窗 → 扫码台 桥接（方案A）', () => {
  const detail = read('subsystems/samples/frontend/js/views/detail.js');
  const scan = read('subsystems/samples/frontend/js/views/scan.js');
  test('头部操作组含「扫码操作」按钮且调用 goScanFromDetail', () => {
    expect(detail).toContain('扫码操作');
    expect(detail).toContain("goScanFromDetail(' + id + ')");
  });
  test('跳转函数：取 sample_no 深链 #/scan?no=，先关弹窗再跳', () => {
    expect(detail).toContain("'#/scan?no='");
    expect(detail.indexOf('closeModal')).toBeGreaterThan(-1);
    expect(detail.indexOf("location.hash = '#/scan?no='")).toBeGreaterThan(detail.indexOf('closeModal(m)'));
  });
  test('跳前清标示卡未保存态（_detailDirty，防弹窗复用残留拦截）', () => {
    expect(detail).toContain('_detailDirty = false;');
  });
  test('扫码台深链消费端仍在（viewScan ?no= 自动填码触发 doScan）', () => {
    expect(scan).toContain('no=');
    expect(scan).toContain('doScan()');
  });
});
