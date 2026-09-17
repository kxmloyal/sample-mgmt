// tests/samples-list-xss.test.js — 样品列表页两个存储型 XSS 与筛选反馈缺陷的源码锁定（2026-09-17）
// 依据 docs/agents-enforcement-rules.md §25.2.2（非本函数产出字符串进 innerHTML/属性前 MUST 经 e()；
// 标签映射函数 MUST NOT 用原始值兜底）与 §25.6.2（状态/字典单一来源）。
// 风格同 tests/samples-status-multi.test.js：只读源码静态断言，不连数据库、不起服务、不写任何数据
//（samples 子系统 manifest.deployed = true，禁止数据写入类验证）。
// 锁定四件事：(1) P1-1 retired_reason 双层转义；(2) P1-2 sampleTypeLabel 安全兜底 + 调用点 e() 包裹；
// (3) P1-7 两个 toggle 本地即时同步高亮；(4) P1-7 catch 失败路径同步标签排、标签排同步不被 chips 容器短路。
const fs = require('fs');
const path = require('path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf-8');
const V = 'subsystems/samples/frontend/js/views/';
const LIST = V + 'list.js';
const RENDER = V + 'list-render.js';
const INSPECT = V + 'list-inspect.js';
const FILTER = V + 'list-filter.js';
const BAR = V + 'list-status-bar.js';

// 取顶层函数源码（从 `function name(` 起，到首个行首 `}` 止），用于「函数内包含某调用」类断言
const fnBody = (src, name) => {
  const m = src.match(new RegExp('^function ' + name + '\\([\\s\\S]*?\\n\\}', 'm'));
  expect(m).not.toBeNull();
  return m[0];
};

describe('P1-2 样品类型标签（sampleTypeLabel）', () => {
  it('兜底 MUST NOT 是裸变量（禁止 x===\'A\'?\'甲\':x 式原始值透传）', () => {
    const src = read(LIST);
    const m = src.match(/function sampleTypeLabel\(v\)[^\n]*/);
    expect(m).not.toBeNull();
    const body = m[0];
    // 末段兜底不得是标识符（[A-Za-z0-9_$]+），必须是字面量常量
    expect(body).not.toMatch(/[:?]\s*[A-Za-z0-9_$]+\s*\}/);
    // 安全常量兜底 '—'（未知值与空值同口径，与类型列为空时的占位一致）
    expect(body).toContain(":'—'");
  });

  it('两个分支（OK/NG）与既有文案保持不变', () => {
    const body = read(LIST).match(/function sampleTypeLabel\(v\)[^\n]*/)[0];
    expect(body).toContain("v==='OK'?'OK样品'");
    expect(body).toContain("v==='NG'?'NG样品'");
  });

  it('list-render.js 调用点被 e() 包裹', () => {
    const src = read(RENDER);
    expect(src).toContain('e(sampleTypeLabel(s.sample_type))');
    // 不得存在未转义的调用（无 e( 前缀）——负向断言防回归
    expect(/[^e(]sampleTypeLabel\(s\.sample_type\)/.test(src)).toBe(false);
  });
});

describe('P1-1 作废原因 retired_reason 存储型 XSS', () => {
  it('数据层转义：e() 包裹 retired_reason 取值', () => {
    const src = read(INSPECT);
    expect(src).toContain("e(s.retired_reason || '—')");
  });

  it('属性层兜底：title 拼接处对 reason 再经 e()', () => {
    const src = read(INSPECT);
    expect(src).toContain("' title=\"' + e(reason) + '\"'");
    // 不得再出现裸 reason 直进属性
    expect(src).not.toContain("' title=\"' + reason + '\"'");
  });

  it('inspectBadge 的其余 title 仍走字面量或 e()（不引入新的未转义拼接）', () => {
    const src = read(INSPECT);
    // 复检日期 title 属 fmt() 产物，§25.2.2 例外
    expect(src).toContain("' title=\"复检日期：' + fmt(s.next_inspect_at) + '\"'");
  });

  it('存在性守卫：注入 fmt 占位后，恶意原因不会闭合 title 属性', () => {
    const src = read(INSPECT);
    const { inspectBadge } = new Function(
      'var fmt = function(d){ return String(d).slice(0,10); };' +
      "var e = function(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); };" +
      src + '\n;return { inspectBadge };'
    )();
    const h = inspectBadge({ status: 'RETIRED', retired_reason: '"><img src=x onerror=alert(1)>' });
    expect(h).not.toContain('"><img');          // 属性未被闭合
    expect(h).not.toContain('<img');            // 未注入新标签（整串无真实 < 标签）
    expect(h).toContain('onerror');             // 载荷被当作纯文本保留（转义而非丢弃）
    // title 属性自身的引号必须成对：属性以 " 开启、以 " 结束，载荷里的 " 只能以 &quot; 实体形式出现
    const titleAttr = h.match(/title="[^"]*"/);
    expect(titleAttr).not.toBeNull();
    expect(h).toContain('title="已作废，复检计划不适用（原因：&amp;quot;&amp;gt;&amp;lt;img');
    expect((h.match(/"/g) || []).length).toBe(4); // class="muted" 与 title="..." 各 2 个
  });

  it('正常原因文本显示不变（不受双重转义影响）', () => {
    const src = read(INSPECT);
    const { inspectBadge } = new Function(
      'var fmt = function(d){ return String(d).slice(0,10); };' +
      "var e = function(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;').replace(/'/g,'&#39;'); };" +
      src + '\n;return { inspectBadge };'
    )();
    expect(inspectBadge({ status: 'RETIRED', retired_reason: '客户取消' }))
      .toContain('title="已作废，复检计划不适用（原因：客户取消）"');
  });
});

describe('P1-7 状态标签排点击即时反馈与失败路径一致性', () => {
  it('smToggleStatus 先本地同步高亮，再调 loadSamples', () => {
    const src = read(BAR);
    const body = fnBody(src, 'smToggleStatus');
    expect(body).toContain('smSyncStatusBar();');
    expect(body.indexOf('smSyncStatusBar();')).toBeLessThan(body.indexOf('loadSamples();'));
  });

  it('smToggleActivePreset 先本地同步高亮，再调 loadSamples', () => {
    const src = read(BAR);
    const body = fnBody(src, 'smToggleActivePreset');
    expect(body).toContain('smSyncStatusBar();');
    expect(body.indexOf('smSyncStatusBar();')).toBeLessThan(body.indexOf('loadSamples();'));
  });

  it('list-render.js 请求失败路径也同步标签排（typeof 守卫，跨文件全局函数）', () => {
    const src = read(RENDER);
    // 只取 _fetchSamplePage 内的 catch（文件内另有两处 catch：deleteSample/导出后置处理不在本文件）
    const fetchFn = src.slice(src.indexOf('function _fetchSamplePage'));
    const m = fetchFn.match(/\.catch\(function\(e\)\s*\{[\s\S]*?\}\);/);
    expect(m).not.toBeNull();
    expect(m[0]).toContain("if (typeof renderChips === 'function') renderChips();");
    // 失败时除错误文案外不得改动筛选状态（#f-status / _sampleIsOverdue 等）
    // 先剔注释行，避免注释里提到标识符导致误判
    const body = m[0].split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(body).not.toContain('f-status');
    expect(body).not.toContain('_sampleIsOverdue');
    expect(body).not.toContain('_quickFilterType');
  });

  it('list-filter.js 的标签排同步不被 chips 容器 early-return 短路', () => {
    const src = read(FILTER);
    expect(src).not.toContain("var chips = $('#f-chips'); if (!chips) return;");
    const body = fnBody(src, 'renderChips');
    expect(body).toContain('smSyncStatusBar();');
    // chips 写入被存在性守卫包裹，且位于标签排同步之前
    expect(body).toContain('if (chips) chips.innerHTML = html;');
    expect(body.indexOf('if (chips) chips.innerHTML = html;')).toBeLessThan(body.indexOf('smSyncStatusBar();'));
  });

  it('#f-status 全部写点都有元素存在性守卫（唯一安全写入口 smSetStatusValue）', () => {
    const bar = read(BAR);
    expect(bar).toContain("function smSetStatusValue(v) { var el = $('#f-status'); if (el) el.value = v; }");
    // 两个 toggle 不得再直写 value
    expect(fnBody(bar, 'smToggleStatus')).not.toMatch(/\$\('#f-status'\)\.value\s*=/);
    expect(fnBody(bar, 'smToggleActivePreset')).not.toMatch(/\$\('#f-status'\)\.value\s*=/);
    const filter = read(FILTER);
    // list-filter.js 内 4 处写点：loadSamplesOverdue 守卫写、clearQuickFilter 与 chips 的 ✕ 清除统一经 smSetStatusValue
    expect(filter).toContain("var stBox = $('#f-status'); if (stBox) stBox.value = '';");
    expect(filter).toContain('smSetStatusValue(');
    expect(filter).not.toContain("onclick=\"$('#f-status').value=''");
    expect(fnBody(filter, 'clearQuickFilter')).toContain('smSetStatusValue(');
    expect(fnBody(filter, 'loadSamplesOverdue')).not.toMatch(/[^x]\$\('#f-status'\)\.value\s*=/);
  });

  it('list.js 深链写点保留元素守卫（首帧早于渲染路径的唯一合法例外）', () => {
    const src = read(LIST);
    expect(src).toContain("var stBox = $('#f-status'); if (stBox) stBox.value = decodeURIComponent(stMatch[1]);");
  });
});

describe('既有口径未被破坏', () => {
  it('状态多选值载体与标签排入口仍在', () => {
    expect(read(LIST)).toContain('<input type="hidden" id="f-status" />');
    expect(read(LIST)).toContain('smSyncStatusBar();');
    expect(read(FILTER)).toContain("var st = $('#f-status').value;");
  });

  it('状态中文名仍只在 list-status-bar.js 的 _STATUS_CN 与本文件字典内（未新增映射字面量）', () => {
    expect(read(BAR)).toContain("var _STATUS_CN = { NEW: '待制作'");
    expect(read(FILTER)).toContain("RELEASED: '已发行'"); // tests/dashboard.test.js 依赖本行
  });
});
