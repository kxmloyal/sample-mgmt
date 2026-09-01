// tests/card-print.test.js — 打印链路（标签/标示卡 HTML 生成）单元测试
// 纯函数，无 DB 依赖；覆盖评审修复的 8 个问题中可单测部分
const { buildLabelHtml, buildCardPrintHtml, parseSize } = require('../subsystems/samples/backend/card-html');
const { PRESET_MM } = require('../subsystems/samples/backend/card-constants');
const { buildCardPrintHtml: buildCardDirect, fmtDateYYMMDD } = require('../subsystems/samples/backend/card-print-html');

const s = {
  sample_no: 'G-BD7620-S-001-01', name: '扇叶样品', station: '扇叶组', model: 'BD7620',
  spec: 'SPEC', sample_type: '样品', source_type: 'C', card_version: '01', limit_item: 'WL',
  valid_until: '2026-12-31', test_data: '5.0kg', signed_by_rd: '张三', signed_by_qa: '李四',
  notes: '备注', qr_token: 'tok123'
};

describe('PRESET_MM 共享常量（Issue #5）', () => {
  it('三档预设值与标签/标示卡页一致', () => {
    expect(PRESET_MM).toEqual({ small: [37, 18], medium: [52, 25], large: [60, 40] });
  });
  it('标示卡打印纸=空白卡区（大号 32×35mm / 小号 20×15mm）', () => {
    expect(buildCardPrintHtml(s, 'large')).toContain('32×35mm');
    expect(buildCardPrintHtml(s, 'small')).toContain('20×15mm');
  });
});

describe('buildLabelHtml 反射 XSS 防护（Issue #1）', () => {
  it('恶意 sizeKey 注入不进入输出，回退 large', () => {
    const html = buildLabelHtml(s, 'data:image/png;base64,x', true, true, 1, '"><script>alert(1)</script>', 60, 40);
    expect(html).not.toContain('alert(1)');
    expect(html).not.toContain('"><script>');
    expect(html).toContain('大号 60×40mm');
  });
});

describe('autoPrint 分离（Issue #2）', () => {
  it('autoPrint=true 页面加载后自动弹打印', () => {
    expect(buildLabelHtml(s, 'x', true, true, 1, 'large', 60, 40)).toContain('window.onload');
  });
  it('autoPrint=false（下载场景）不自动打印（仍含 fitCard 屏幕自适应缩放）', () => {
    // 2026-09-01：下载页也会注入 window.onload=fitCard() 做屏幕自适应，但不允许自动打印
    const html = buildLabelHtml(s, 'x', true, false, 1, 'large', 60, 40);
    // 页面固定有手动打印按钮 onclick="window.print()"，断言针对自动打印脚本特征串
    expect(html).not.toContain('setTimeout(function(){window.print()}');
    expect(html).toContain('window.onload=function(){fitCard();}');
  });
});

describe('buildCardPrintHtml 去 scale 参数 + 超长文本换行（Issue #3/#7）', () => {
  it('新签名 (s, sizeKey, cw, ch) 可调用且内容完整', () => {
    const html = buildCardPrintHtml(s, 'large');
    expect(html).toContain('G-BD7620-S-001-01');
    expect(html).toContain('26/12/31');
  });
  it('full 行 CSS 支持换行（min-width:0 + word-break）', () => {
    const html = buildCardPrintHtml(s, 'large');
    expect(html).toContain('.crd .full{grid-column:1/-1;display:flex;gap:3px;min-width:0');
    expect(html).toContain('.crd .full .val{min-width:0;flex:1;white-space:normal;word-break:break-word}');
  });
  it('自定义尺寸跟随（Issue #5 延伸：纸张=空白卡区自动换算）', () => {
    // 80×40 标签纸 → 空白卡区 42×33mm；不再输出整张标签纸尺寸
    expect(buildCardPrintHtml(s, 'custom', 80, 40)).toContain('42×33mm');
    expect(buildCardPrintHtml(s, 'custom', 80, 40)).not.toContain('80×40mm');
  });
  it('card-html.js 重导出接口兼容', () => {
    expect(typeof buildCardDirect).toBe('function');
    expect(buildCardDirect).toBe(buildCardPrintHtml);
  });
});

describe('标示卡来源显示（窄小空白卡区用代码+简称，避免全称撑宽整卡）', () => {
  it('source_type=C 显示 C·客供，不再输出全称', () => {
    const html = buildCardPrintHtml(s, 'large');
    expect(html).toContain('C\u00b7客供');
    expect(html).not.toContain('元将五金塔岗分厂');
  });
  it('source_type=G 显示 G·塔岗（code+short 映射）', () => {
    const g = Object.assign({}, s, { source_type: 'G' });
    expect(buildCardPrintHtml(g, 'large')).toContain('G\u00b7塔岗');
  });
  it('未知/空 source_type 降级为代码或空（不崩）', () => {
    const unknown = Object.assign({}, s, { source_type: 'ZZ' });
    expect(buildCardPrintHtml(unknown, 'large')).toContain('>ZZ<');
    const empty = Object.assign({}, s, { source_type: '' });
    expect(buildCardPrintHtml(empty, 'large')).not.toContain('\u00b7');
  });
});

describe('fmtDateYYMMDD（Issue #3 迁移后仍可用）', () => {
  it('输出 yy/mm/dd 格式', () => {
    expect(fmtDateYYMMDD('2026-12-31')).toBe('26/12/31');
  });
  it('空值返回占位符', () => {
    expect(fmtDateYYMMDD(null)).toBe('______');
  });
});

describe('@page 纸张尺寸按档位写死', () => {
  it('标签页 large → 60mm 40mm；medium → 52mm 25mm', () => {
    expect(buildLabelHtml(s, 'x', true, true, 1, 'large', 60, 40)).toContain('@page{margin:0;size:60mm 40mm}');
    expect(buildLabelHtml(s, 'x', true, true, 1, 'medium', 52, 25)).toContain('@page{margin:0;size:52mm 25mm}');
  });
  it('标签页 custom 80×40 → 80mm 40mm', () => {
    expect(buildLabelHtml(s, 'x', true, true, 1, 'custom', 80, 40)).toContain('@page{margin:0;size:80mm 40mm}');
  });
  it('标示卡页纸张=空白卡区：large → 32mm 35mm；small → 20mm 15mm', () => {
    expect(buildCardPrintHtml(s, 'large')).toContain('@page{margin:0;size:32mm 35mm}');
    expect(buildCardPrintHtml(s, 'small')).toContain('@page{margin:0;size:20mm 15mm}');
  });
  it('标示卡页顶部显示档位名+空白卡区尺寸+选纸引导', () => {
    expect(buildCardPrintHtml(s, 'medium')).toContain('中标 28×20mm');
    expect(buildCardPrintHtml(s, 'medium')).toContain('请在打印对话框选择 28×20mm 纸张');
    // 自定义档自动换算空白卡区：80×40 标签纸 → 42×33mm
    expect(buildCardPrintHtml(s, 'custom', 80, 40)).toContain('自定义 42×33mm');
  });
  it('标示卡页自定义 60×40 标签纸 → 空白卡区 32×35mm', () => {
    const html = buildCardPrintHtml(s, 'custom', 60, 40);
    expect(html).toContain('自定义 32×35mm');
    expect(html).toContain('@page{margin:0;size:32mm 35mm}');
  });
});

describe('parseSize 尺寸解析', () => {
  it('默认大号 60×40，contain scale=min(60/74.2,40/35.2)', () => {
    const r = parseSize({ query: {} });
    expect(r.sizeKey).toBe('large');
    expect(r.cw).toBe(60);
    expect(r.ch).toBe(40);
    expect(r.scale).toBeCloseTo(Math.min(60 / 74.2, 40 / 35.2), 3);
  });
  it('预设档 medium/small 从 PRESET_MM 取独立宽高', () => {
    const m = parseSize({ query: { size: 'medium' } });
    expect(m.sizeKey).toBe('medium');
    expect(m.cw).toBe(52);
    expect(m.ch).toBe(25);
    expect(m.scale).toBeCloseTo(Math.min(52 / 74.2, 25 / 35.2), 3);
  });
  it('自定义合法尺寸返回 contain scale', () => {
    const r = parseSize({ query: { size: 'custom', customW: '80', customH: '40' } });
    expect(r.sizeKey).toBe('custom');
    expect(r.cw).toBe(80);
    expect(r.ch).toBe(40);
    expect(r.scale).toBeCloseTo(Math.min(80 / 74.2, 40 / 35.2), 3);
  });
  it('自定义非法宽度回退大号（cw/ch 取 PRESET_MM.large 60×40）', () => {
    const r = parseSize({ query: { size: 'custom', customW: '999', customH: '40' } });
    expect(r.sizeKey).toBe('large');
    expect(r.cw).toBe(60);
    expect(r.ch).toBe(40);
    expect(r.scale).toBeCloseTo(Math.min(60 / 74.2, 40 / 35.2), 3);
  });
});
