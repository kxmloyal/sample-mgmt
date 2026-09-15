// tests/samples-replacement-chain.test.js — 样品替代链视图（2026-09-14）
// 契约：只读端点/三段路径不被 :id 捕获/双向递归 CTE 口径与收敛/字段白名单/前端 Tab 接线/bundle 落地/样式隔离
// 背景：samples.replaces / replaced_by 自 RECREATE 动作起即成对写入（数据完整），但全仓前端 0 处渲染——
//       本迭代补「详情弹窗 → 替代链 Tab」，故本文件同时锁住「后端只读」「前端接线」「隔离不污染」三类不变量。
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const ROUTE = 'subsystems/samples/backend/routes-chain.js';
const VIEW = 'subsystems/samples/frontend/js/views/chain.js';
const DAO = 'subsystems/samples/db/dao-list.js';
const DETAIL = 'subsystems/samples/frontend/js/views/detail.js';

describe('替代链端点（routes-chain.js）', () => {
  const src = read(ROUTE);
  test('路由 GET /api/samples/:id/chain，登录即可（与详情接口同口径）', () => {
    expect(src).toContain("'/api/samples/:id/chain'");
    expect(src).toContain('requireAuth');
  });
  test('三段路径不会被两段的 GET /api/samples/:id 捕获 → 注册顺序无约束', () => {
    // Express 的 /api/samples/:id 只匹配两段路径；三段不匹配。与 storage-map/checkout-users（一段，必须先注册）不同。
    // 既有两段先例 /api/samples/:id/images 同样注册在 routes-samples 之后。
    const samples = read('subsystems/samples/backend/routes-samples.js');
    expect(samples).toContain("app.get('/api/samples/:id',");
    expect(samples).toContain("'/api/samples/:id/images'");
    expect(samples).not.toContain("'/api/samples/:id/chain'");
    const idx = read('subsystems/samples/backend/index.js');
    expect(idx.indexOf('routes-chain')).toBeGreaterThan(-1);
    expect(idx.indexOf("require('./routes-chain')")).toBeGreaterThan(idx.indexOf("require('./routes-samples')"));
  });
  test('404 文案与详情接口一致；纯只读（无任何写方法）', () => {
    expect(src).toContain("res.status(404).json({ error: '样品不存在' })");
    expect(src).toContain('getSampleById(Number(req.params.id))');
    expect(src).not.toMatch(/\.(post|put|delete)\(/);
  });
  test('字段白名单：不下发 version 等内部字段；输出 current/length/truncated/chain', () => {
    expect(src).toContain('NODE_FIELDS');
    expect(src).not.toContain("'version'");
    expect(src).toContain('truncated: isTruncated(chain)');
    expect(src).toContain('current: { id: s.id, sample_no: s.sample_no }');
  });
  test('截断判定精确：仅当边界节点仍有下一跳（不把「刚好 20 节的完整链」误报为截断）', () => {
    expect(src).toContain('n.ord === 20 && n.replaced_by');
    expect(src).toContain('n.ord === -20 && n.replaces');
  });
});

describe('替代链 DAO（dao-list.js 查询域）', () => {
  const dao = read(DAO);
  test('listSampleChain 已加入查询域导出（db.js 展平后 D.listSampleChain 可用）', () => {
    expect(dao).toContain('function listSampleChain(sampleNo)');
    expect(dao).toMatch(/return \{[^}]*listSampleChain/);
  });
  test('双向递归 CTE：沿 replaces 前进 / 沿 replaced_by 回溯 / origin 取当前样品', () => {
    expect(dao).toContain('WITH RECURSIVE newer AS (');
    expect(dao).toContain('JOIN newer n ON s.replaces = n.sample_no');
    expect(dao).toContain('JOIN older o ON s.replaced_by = o.sample_no');
    expect(dao).toContain('FROM samples s WHERE s.sample_no = ? AND s.deleted_at IS NULL LIMIT 1');
    expect(dao).toContain('ORDER BY ord');
  });
  test('边界与收敛：|ord| ≤ 20 防脏数据成环；空入参短路；软删节点不断链', () => {
    expect(dao).toContain('WHERE n.ord < 20');
    expect(dao).toContain('WHERE o.ord > -20');
    expect(dao).toContain('if (!sampleNo) return Promise.resolve([]);');
    // 连接列必须是 replaces/replaced_by（仅 RECREATE 成对写入），不得按 sample_no 等值匹配（编号复用会产生伪链）
    expect(dao).toContain('WHERE s.replaces = ?');
    expect(dao).toContain('WHERE s.replaced_by = ?');
  });
  test('DAO 命名全局唯一（db.js 展平冲突会加子系统前缀，调用点会拿错函数）', () => {
    let hits = 0;
    ['control', 'fixtures', 'projects', 'samples', 'workbench'].forEach(id => {
      const p = path.join(root, 'subsystems', id, 'db');
      if (!fs.existsSync(p)) return;
      fs.readdirSync(p).filter(f => /^dao.*\.js$/.test(f)).forEach(f => {
        hits += (fs.readFileSync(path.join(p, f), 'utf8').match(/function listSampleChain\b/g) || []).length;
      });
    });
    expect(hits).toBe(1);
  });
});

describe('替代链前端接线（detail.js / chain.js）', () => {
  const detail = read(DETAIL);
  const view = read(VIEW);
  test('chain.js 渲染函数齐备，并复用既有入口（api / statusBadge / e / viewDetail）', () => {
    ['function _chainSkeleton', 'function _buildChainTab', 'function _chainNode', 'function _chainMeta',
      'async function loadSampleChain', 'function chainNodeJump'].forEach(f => expect(view).toContain(f));
    expect(view).toContain("api('GET', '/api/samples/' + id + '/chain')");
    expect(view).toContain('viewDetail(id)');
    expect(view).toContain('statusBadge(n)');
    expect(view).toContain('e(n.sample_no)');
  });
  test('chain.js 四态覆盖：无链 / 截断 / 软删 / 请求失败与过期渲染丢弃', () => {
    expect(view).toContain('该样品当前没有替代关系');
    expect(view).toContain('sm-chain-warn');
    expect(view).toContain('sm-chain-gone');
    expect(view).toContain('替代链加载失败');
    expect(view).toContain('if (!box) return;'); // 响应到达时 Tab 已切换 → 丢弃过期渲染
  });
  test('detail.js 六处接线：Tab 项 / 空判守卫 / 懒加载 / 骨架 / dispatch / onTabRendered', () => {
    expect(detail).toContain('var hasChain = !!(s.replaced_by || s.replaces);');
    expect(detail).toContain('if (!hasImg && !hasLog && !hasCrd && !hasChain) return [];');
    expect(detail).toContain("if (hasChain) ts.push({ key: 'chain', label: '替代链' });");
    expect(detail).toContain("lazyTabs: ['logs', 'image', 'chain']");
    expect(detail).toContain("if (tab === 'chain') return _chainSkeleton();");
    expect(detail).toContain("else if (t === 'chain') html = _buildChainTab(s, id);");
    expect(detail).toContain("else if (key === 'chain') loadSampleChain(_detailId);");
  });
  test('判定字段来自详情响应（SELECT *）→ 零额外请求即可决定 Tab 是否出现', () => {
    expect(read('subsystems/samples/backend/routes-samples.js')).toContain('res.json({ ...s, logs: await D.listLogsBySample(s.id) });');
  });
  test('RECREATE_REPLACED 流向标签已补齐（原 _LOG_FLOW 缺该键 → 「被替代」行无流向标签）', () => {
    expect(detail).toContain("RECREATE_REPLACED: '⬆ 已作废（自环）'");
  });
});

describe('替代链构建与隔离（bundle / css）', () => {
  test('bundle 源清单登记 chain.js，紧跟 detail.js，且 router.js 仍为末位', () => {
    const arr = JSON.parse(read('tools/bundle-sources.json')).samples;
    expect(arr).toContain(VIEW);
    expect(arr.indexOf(VIEW)).toBe(arr.indexOf(DETAIL) + 1);
    expect(arr[arr.length - 1]).toBe('subsystems/samples/frontend/js/router.js');
  });
  test('已落地 bundle 含链函数与接线（防止改源码未重建）', () => {
    const b = read('subsystems/samples/frontend/js/bundle.js');
    ['function _chainSkeleton', 'function _buildChainTab', 'async function loadSampleChain',
      'function chainNodeJump', "lazyTabs: ['logs', 'image', 'chain']",
      '/* --- subsystems/samples/frontend/js/views/chain.js --- */'
    ].forEach(k => expect(b).toContain(k));
  });
  test('样式落在 module.css，且未污染 app.css 与其它视图（子系统隔离）', () => {
    const css = read('subsystems/samples/frontend/css/module.css');
    ['.sm-chain{', '.sm-chain-node{', '.sm-chain-node.current{', '.sm-chain-node.gone{', '.sm-chain-idx{',
      '.sm-chain-main{', '.sm-chain-head{', '.sm-chain-meta{', '.sm-chain-link{', '.sm-chain-link::before{',
      '.sm-chain-cur{', '.sm-chain-gone{', '.sm-chain-warn{'
    ].forEach(k => expect(css).toContain(k));
    expect(read('public/css/app.css')).not.toContain('sm-chain');
    ['subsystems/samples/frontend/js/views/list-render.js',
      'subsystems/samples/frontend/js/views/storage-map.js',
      'subsystems/samples/frontend/js/views/models.js'
    ].forEach(f => expect(read(f)).not.toContain('sm-chain'));
  });
  test('新增接口已登记进 README API 表', () => {
    expect(read('README.md')).toContain('/api/samples/:id/chain');
  });
});

// ── 运行时回归：只读端点真跑 ──
// §20.2：samples deployed:true，写类验证仅允许在独立测试库；本套件全部为只读 GET，
// 但为与 samples-checkout-e2e.test.js / samples-storage-map.test.js 同款守卫保持一致，仍仅当 DB_NAME 指向测试库时执行。
const request = require('supertest');
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');
const D = require('../db');
const suite = (isDeployed('samples') && process.env.DB_NAME !== 'sample_mgmt_test') ? describe.skip : describe;

suite('替代链端点真实执行（只读 GET）', () => {
  let samples = [];
  beforeAll(async () => {
    await getApp();
    const [rows] = await D.pool().query(
      'SELECT id, sample_no, status, replaces, replaced_by FROM samples WHERE deleted_at IS NULL ORDER BY id LIMIT 200');
    samples = rows || [];
  });
  test('无替代关系的样品 → length=1、truncated=false、唯一节点即当前样品', async () => {
    const lonely = samples.find(s => !s.replaces && !s.replaced_by);
    if (!lonely) return; // 库内无孤立样品则跳过，不误报
    const u = await login('admin', 'admin123');
    const r = await u.agent.get('/api/samples/' + lonely.id + '/chain');
    expect(r.status).toBe(200);
    expect(r.body.length).toBe(1);
    expect(r.body.truncated).toBe(false);
    expect(r.body.chain[0].isCurrent).toBe(true);
    expect(r.body.chain[0].sample_no).toBe(lonely.sample_no);
  });
  test('链上样品 → 正序整链，链尾紧随链首之后，isCurrent 落在所查样品', async () => {
    const head = samples.find(s => s.replaced_by);
    if (!head) return; // 测试库无替代数据则跳过
    const u = await login('admin', 'admin123');
    const r = await u.agent.get('/api/samples/' + head.id + '/chain');
    expect(r.status).toBe(200);
    const nos = r.body.chain.map(n => n.sample_no);
    expect(r.body.length).toBe(nos.length);
    expect(nos).toContain(head.sample_no);
    expect(nos).toContain(head.replaced_by);
    expect(r.body.chain.find(n => n.sample_no === head.sample_no).isCurrent).toBe(true);
    expect(nos.indexOf(head.replaced_by)).toBe(nos.indexOf(head.sample_no) + 1);
    // 字段白名单：不下发 samples 表内部字段
    expect(r.body.chain.every(n => n.version === undefined && n.deleted_at === undefined)).toBe(true);
    expect(r.body.chain.every(n => typeof n.ord === 'number')).toBe(true);
  });
  test('不存在的 id → 404「样品不存在」；未登录 → 401', async () => {
    const u = await login('admin', 'admin123');
    const r404 = await u.agent.get('/api/samples/99999999/chain');
    expect(r404.status).toBe(404);
    expect(r404.body.error).toBe('样品不存在');
    const anon = await request(await getApp()).get('/api/samples/1/chain');
    expect(anon.status).toBe(401);
  });
});
