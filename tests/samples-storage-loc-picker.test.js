// tests/samples-storage-loc-picker.test.js — 储位选择器接线（2026-09-09，孪生配套）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('储位选择器（CUSTODY/EDIT_STORAGE 表单）', () => {
  const scan = read('subsystems/samples/frontend/js/views/scan.js');
  const picker = read('subsystems/samples/frontend/js/views/storage-loc-picker.js');
  const css = read('subsystems/samples/frontend/css/module.css');
  const map = read('subsystems/samples/frontend/js/views/storage-map.js');
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
  test('方案B 滚动条根治：格高随可视高度动态计算（--sm-cellh + 实测 modal-body + 夹逼 + 极小隐藏副标）', () => {
    expect(picker).toContain("--sm-cellh");
    expect(picker).toContain('body.clientHeight - chrome');
    expect(picker).toContain('Math.max(22, Math.min(40, cellH))');
    expect(picker).toContain("classList.toggle('sm-map-tight'");
    expect(css).toContain('height:var(--sm-cellh');
    expect(css).toContain('.sm-map-matrix.sm-map-tight .sm-sub{display:none}');
  });
  test('预填值保护：picker 初始化搬迁面板后强制回填 value（fluent 元素视觉值丢失修复）', () => {
    expect(picker).toContain('var prefill = input.value;');
    expect(picker).toContain("input.value = prefill || '';");
    const co = read('subsystems/samples/frontend/js/views/checkout-user-picker.js');
    expect(co).toContain('var prefill = input.value;');
    expect(co).toContain("input.value = prefill || '';");
  });
  test('防误确认（2026-09-10 用户需求）：领用人/新储位默认空，必须主动输入；零动作提交拦截', () => {
    // 领用人/部门不再预填当前登录人（防顺手确认记成自己）
    expect(scan).not.toContain('me.display_name||me.username');
    expect(scan).toContain('placeholder="必填：点选候选或直接输入"');
    // 修改储位新储位不预填当前储位（当前储位仅展示供核对；data-cur 携带原值供零动作比对）
    expect(scan).not.toContain('value="\'+e(s.storage_location||\'\')+\'"');
    expect(scan).toContain('data-cur="\'+e(s.storage_location||\'\')+\'"');
    expect(scan).toContain('placeholder="必填：点选候选 / 柜位图 / 直接输入"');
    // 校验抽至 storage-loc-picker.js（scan.js 超 70% 预警线薄调用）；空值 + 新=当前 双拦截
    expect(scan).toContain('!collectScanLoc(body,action)');
    expect(picker).toContain('function collectScanLoc(body, action)');
    expect(picker).toContain('请填写储位（点选候选 / 柜位图 / 直接输入）');
    expect(picker).toContain('新储位与当前储位相同');
    expect(picker).toContain("el.getAttribute('data-cur')");
    // 领用人空值拦截仍在（collectCheckoutPayload 原有校验）
    expect(scan).toContain("if(!user){toast('请填写领用人','err');return false;}");
  });
  test('柜位图弹窗图例（2026-09-10 用户反馈）：与柜位视图共用 smLegendHtml，标签唯一来源', () => {
    // 图例函数单一来源在 storage-map.js，弹窗复用（不各自硬编码）
    expect(map).toContain('function smLegendHtml(withLabel)');
    expect(map).toContain('smLegendHtml(true)');      // 柜位视图顶栏（带「图例：」前缀）
    expect(picker).toContain('smLegendHtml(false)');  // 弹窗标题栏（无前缀，省空间）
    expect(picker).toContain('sm-map-legend');
    expect(css).toContain('.sm-map-legend{display:flex');
    // 4 个标签只在共享函数里出现一次，弹窗不得再抄一份
    expect((map.match(/被领走\(占位\)/g) || []).length).toBe(1);
    expect(picker).not.toContain('被领走(占位)');
    // 图例放在 modal-head（body 之外），不占格高预算、不引入滚动条
    expect(picker).toContain("head: '<h3>选择储位（柜位图）</h3><span class=\"sm-map-legend\">'");
  });
});
