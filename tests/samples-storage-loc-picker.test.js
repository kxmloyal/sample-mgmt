// tests/samples-storage-loc-picker.test.js — 储位选择器接线（2026-09-09，孪生配套）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('储位选择器（CUSTODY/EDIT_STORAGE 表单）', () => {
  const scan = read('subsystems/samples/frontend/js/views/scan.js');
  const picker = read('subsystems/samples/frontend/js/views/storage-loc-picker.js');
  const css = read('subsystems/samples/frontend/css/module.css');
  test('两处表单（接收保管/修改储位）均挂候选面板 + 事件接线', () => {
    expect((scan.match(/scan-loc-cand/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(scan).toContain('renderSmCandidates');
    expect(scan).toContain('hideSmCandidates');
    expect(scan).toContain('initStorageLocPicker');
    expect(scan).toContain("action==='CUSTODY'||action==='EDIT_STORAGE'");
  });
  test('选择器：数据源 storage-map、空位优先排序、点选回填、fixed 面板防滚动条', () => {
    expect(picker).toContain('/api/samples/storage-map');
    expect(picker).toContain('function smSortedCells');
    expect(picker).toContain('function pickStorageLoc');
    expect(picker).toContain('document.body.appendChild(panel)');
    expect(picker).toContain('positionSmPanel');
  });
  test('bundle 源清单登记 storage-loc-picker.js（且在 scan.js 之前定义）', () => {
    const sources = JSON.parse(read('tools/bundle-sources.json'));
    const iPicker = sources.samples.indexOf('subsystems/samples/frontend/js/views/storage-loc-picker.js');
    const iScan = sources.samples.indexOf('subsystems/samples/frontend/js/views/scan.js');
    expect(iPicker).toBeGreaterThan(-1);
    expect(iPicker).toBeLessThan(iScan);
  });
  test('方案B 柜位图弹窗：两处表单挂「🗺 柜位图」按钮 + 弹窗函数齐全', () => {
    expect((scan.match(/openSmMapPicker\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(picker).toContain('function openSmMapPicker');
    expect(picker).toContain('function smMapSelectCab');
    expect(picker).toContain('function smMapRenderCell');
    expect(picker).toContain('function smMapPick');
    expect(picker).toContain('function closeSmMapPicker');
  });
  test('方案B 柜多处理：柜列表空位优先排序 + 记住上次柜 + 顶层关闭（叠层安全）', () => {
    expect(picker).toContain('b.summary.empty - a.summary.empty');
    expect(picker).toContain('_smMapLastCab');
    expect(picker).toContain('if (ms.length) closeModal(ms[ms.length - 1]);');
  });
  test('方案B 滚动条根治：格高随可视高度动态计算（--sm-cellh + 夹逼 + 极小隐藏副标）', () => {
    expect(picker).toContain("--sm-cellh");
    expect(picker).toContain('window.innerHeight * 0.85 - 190');
    expect(picker).toContain('Math.max(24, Math.min(40, cellH))');
    expect(picker).toContain("classList.toggle('sm-map-tight'");
    expect(css).toContain('height:var(--sm-cellh');
    expect(css).toContain('.sm-map-matrix.sm-map-tight .sm-sub{display:none}');
  });
});
