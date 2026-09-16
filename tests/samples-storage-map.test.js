// tests/samples-storage-map.test.js — 样品柜数字孪生（2026-09-09）
// 契约：端点注册顺序/聚合口径/格位解析/柜配置表/前端接线/manifest+router 注册
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('storage-map 端点（routes-storage-map.js）', () => {
  const src = read('subsystems/samples/backend/routes-storage-map.js');
  test('路由 GET /api/samples/storage-map 登录即可，且注册在 routes-samples 之前（/:id 捕获教训）', () => {
    expect(src).toContain("'/api/samples/storage-map'");
    expect(src).toContain('requireAuth');
    const idx = read('subsystems/samples/backend/index.js');
    expect(idx.indexOf('routes-storage-map')).toBeGreaterThan(-1);
    expect(idx.indexOf('routes-storage-map')).toBeLessThan(idx.indexOf("require('./routes-samples')"));
  });
  test('聚合口径：deleted_at IS NULL；CHECKED_OUT/RETURNING 占位（用户确认领走算占用）', () => {
    expect(src).toContain('deleted_at IS NULL');
    expect(src).toContain("status === 'CHECKED_OUT'");
    expect(src).toContain("status === 'RETURNING'");
  });
  test('格位解析 N#样品柜C-R（含空格脏数据兼容）', () => {
    const { parseLoc, stateOf } = require('../subsystems/samples/backend/routes-storage-map');
    expect(parseLoc('4#样品柜3-7')).toEqual({ key: '4#样品柜', no: 4, col: 3, row: 7 });
    expect(parseLoc('1#样品柜 3-7')).toEqual({ key: '1#样品柜', no: 1, col: 3, row: 7 });
    expect(parseLoc('A区-3架')).toBeNull();
    expect(parseLoc(null)).toBeNull();
    expect(stateOf('IN_CUSTODY')).toBe('in');
    expect(stateOf('CHECKED_OUT')).toBe('out');
    expect(stateOf('NEW')).toBeNull();
  });
  test('柜配置表幂等建表：rows/columns 可配置，ADMIN PUT 端点存在', () => {
    expect(src).toMatch(/CREATE TABLE IF NOT EXISTS sample_storage_cabinets/);
    expect(src).toContain("'/api/samples/storage-map/cabinets/:key'");
    expect(src).toContain("u.role !== 'ADMIN'");
    // 2026-09-09 修复：全局 db.js 无 D.run（臆造接口致「D.run is not a function」）——写操作统一走 D.pool().query
    expect(src).toContain('await D.pool().query(');
    expect(src).not.toContain('D.run(');
    // 2026-09-10 修复：ON DUPLICATE KEY UPDATE 中 rows/columns 未加反引号 → MariaDB 保留字语法错误
    //（用户实测 near 'rows=VALUES(rows), columns=VALUES(columns), updated_by=VALUES(updated_by)'）；
    // DDL/SELECT 原本已加反引号，仅这句漏加——本断言锁住，防止再次漏加
    expect(src).toContain('`rows`=VALUES(`rows`), `columns`=VALUES(`columns`)');
    expect(src).not.toMatch(/ON DUPLICATE KEY UPDATE\s+rows=/);
    // 2026-09-10 新增：配置表中尚无样品的柜也要补种为全空柜（支持先建柜后放样品）
    expect(src).toContain('cabCfg.forEach(c => {');
    expect(src).toContain('{ key: c.cabinet_key, no: Number(m[1]), cols: Number(c.columns) || 3');
  });
  test('新增柜入口（2026-09-10）：ADMIN 按钮复用配置弹窗（key=null 新增模式，柜号自增默认）', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    expect(view).toContain("me.role === 'ADMIN' ? '<fluent-button appearance=\"accent\" size=\"small\" onclick=\"smConfigCabinet(null,3,9)\">➕ 新增柜</fluent-button>'");
    expect(view).toContain("var isNew = !key;");
    expect(view).toContain("id=\"sm-cfg-no\"");
    expect(view).toContain("openModal(isNew ? '新增保管柜' : '配置 ' + key + ' 行列'");
    // 已存在的柜不得经「新增」入口覆盖尺寸；柜号范围校验 1~99
    expect(view).toContain('已存在，如需改尺寸请用该柜的「配置行列」');
    expect(view).toContain("toast('柜号须为 1~99 的整数', 'err')");
    // 复用同一 PUT 接口（不新增端点）
    expect(view).toContain("await api('PUT', '/api/samples/storage-map/cabinets/' + encodeURIComponent(key)");
  });
  test('工具栏布局（2026-09-14 修复）：容器复用共享 .filters，禁跨子系统 pk- 类名，emoji 保留', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    const css = read('subsystems/samples/frontend/css/module.css');
    // 容器 MUST 用 app.css 的共享 .filters（此前误用 projects 私有 .pk-filters → 非 flex：
    // 实测按钮间距 1px、align-items:center 静默失效、垂直中心差 5.5px、无 flex-wrap）
    expect(view).toContain('<div class="filters" style="align-items:center">');
    // 跨子系统类名零容忍：samples 侧不得再引用 projects 的 pk- 前缀类
    expect(view).not.toContain('pk-filters');
    expect(view).not.toContain('pk-form');
    // 柜位配置弹窗表单改用本子系统 sm- 前缀 + 纵向 flex（此前 .pk-form 无定义 → 行内流）
    expect(view).toContain('<div class="sm-form">');
    expect(css).toContain('.sm-form{display:flex;flex-direction:column;gap:8px}');
    // 交互文案 emoji（U+2795 ➕）依用户 2026-09-14 决定「保留」，此处正向锁定以防再被以「非必要符号」误删
    expect(view).toContain('>➕ 新增柜</fluent-button>');
  });
  test('工具栏分组（2026-09-14 方案 C）：信息组 + 竖分隔线 + 右操作组，且不越界污染其它视图', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    const css = read('subsystems/samples/frontend/css/module.css');
    // 结构：左信息组 .sm-tb-info / 右操作组 .sm-tb-ops（组内首元素为 1px 竖分隔线）
    expect(view).toContain('<div class="sm-tb-info">');
    expect(view).toContain('<div class="sm-tb-ops">');
    expect(view).toContain('<span class="sm-tb-sep"></span>');
    // 顺序断言：分隔线在操作组「内部」（位于 ops 开标签之后）——否则换行时它会孤零零残留在上一行行尾
    const iInfo = view.indexOf('<div class="sm-tb-info">');
    const iOps = view.indexOf('<div class="sm-tb-ops">');
    const iSep = view.indexOf('<span class="sm-tb-sep"></span>');
    expect(iInfo).toBeGreaterThan(-1);
    expect(iOps).toBeGreaterThan(iInfo);
    expect(iSep).toBeGreaterThan(iOps);
    // 样式：操作组用 auto 外边距整体右推；分隔线 1px 宽 22px 高
    expect(css).toContain('.sm-tb-info{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}');
    expect(css).toContain('.sm-tb-ops{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-left:auto}');
    expect(css).toContain('.sm-tb-sep{width:1px;height:22px;background:var(--line,#e2e8f0);flex:0 0 auto}');
    // 隔离护栏 1：共享 .filters 规则 MUST 保持原样（另有 4 个视图在使用它）
    expect(read('public/css/app.css')).toContain('.filters{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}');
    // 隔离护栏 2：另外 4 个 .filters 工具栏与储位弹窗标题栏（.sm-map-legend 容器）不得引用 sm-tb- 类
    ['subsystems/samples/frontend/js/views/list.js',
      'subsystems/samples/frontend/js/views/model-wall.js',
      'subsystems/samples/frontend/js/views/models.js',
      'subsystems/samples/frontend/js/views/storage-loc-picker.js'
    ].forEach(f => expect(read(f)).not.toContain('sm-tb-'));
  });
});

describe('孪生视图接线（前端/manifest/router）', () => {
  test('视图文件：viewStorageMap 存在且走 hash 路由（列表页按钮 onclick 跳 #/storagemap）', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    expect(view).toContain('function viewStorageMap');
    expect(view).toContain('/api/samples/storage-map');
    const list = read('subsystems/samples/frontend/js/views/list.js');
    expect(list).toContain('#/storagemap');
  });
  test('router VIEWS/NAV/meta 三处注册 storagemap，manifest navigation 有柜位视图', () => {
    const router = read('subsystems/samples/frontend/js/router.js');
    expect(router).toContain('storagemap:viewStorageMap');
    expect(router).toContain("k:'storagemap'");
    const manifest = JSON.parse(read('subsystems/samples/manifest.json'));
    const nav = manifest.navigation.find(n => n.key === 'storagemap');
    expect(nav).toBeTruthy();
    expect(nav.view).toBe('viewStorageMap');
    expect(nav.roles).toContain('CUSTODY');
  });
  test('bundle 源清单登记 storage-map.js', () => {
    const sources = JSON.parse(read('tools/bundle-sources.json'));
    expect(sources.samples).toContain('subsystems/samples/frontend/js/views/storage-map.js');
  });
  test('弹窗关闭用共享 closeModal（禁 projects 域 pCloseModal——跨域臆造致关不掉）', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    // 源码里 \\' 转义后的字面是 closeModal(this.closest(\\'.modal-mask\\'))，断言取稳定子串
    expect(view).toContain("closeModal(this.closest(");
    expect(view).toContain('if (ms.length) closeModal(ms[ms.length - 1]);');
    expect(view).not.toContain('pCloseModal');
  });
  test('全链路评审 P1/P2：detail 叠层安全（已下沉共享组件，mask 作用域）——不灌底层窗、扫码操作关全部窗', () => {
    const detail = read('subsystems/samples/frontend/js/views/detail.js');
    const shared = read('shared/frontend/detail-modal.js');
    // 2026-09-11 DM-3：详情弹窗改用共享组件，叠层取值（原 _topBody/_topMask）已下沉
    // shared/frontend/detail-modal.js，组件按「本实例 mask」作用域读写；行为级回归见
    // tests/detail-modal-shared.test.js（叠层不污染底层窗 + 多实例互不串窗）
    expect(detail).toContain('openDetailModal({');
    expect(detail).not.toContain('function _topBody');
    expect(detail).not.toContain('function _topMask');
    // 禁「裸 document.querySelector('.modal-body')」（叠层时命中底层清单窗）
    expect(detail).not.toContain("document.querySelector('.modal-body')");
    expect(shared).not.toContain("document.querySelector('.modal-body')");
    expect(shared).toContain("myMask().querySelector('.modal-body')"); // 只写本实例 mask
    expect(shared).toContain('mask.__dmApi');                          // 回调按 mask 反查实例
    expect(detail).toContain('querySelectorAll(\'.modal-mask\')');
    const ms = detail.indexOf('querySelectorAll(\'.modal-mask\')');
    const hash = detail.indexOf("location.hash = '#/scan?no='");
    expect(ms).toBeGreaterThan(-1);
    expect(hash).toBeGreaterThan(ms); // 先关全部弹窗再跳 hash
  });
  test('全链路评审 P2（storage-map 侧）：配置弹窗取消/保存走顶层关闭 closeSmCfgModal', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    expect(view).toContain('function closeSmCfgModal');
    expect(view).toContain('onclick="closeSmCfgModal()"');
  });
});

// ── 运行时回归：柜配置 upsert 真实执行（2026-09-10，MariaDB 保留字 rows/columns）──
// 静态断言无法复现 SQL 语法错误（用户实测 500：near 'rows=VALUES(rows), columns=VALUES(columns)...'），
// 故此处对测试库真跑一遍写路径。§20.2：已上线子系统的写类验证仅允许在独立测试库 sample_mgmt_test 进行。
const { getApp, login } = require('./helpers/setup');
const { isDeployed } = require('./helpers/deployed');
const D = require('../db');
// samples deployed:true 时仅当 DB_NAME 指向测试库才执行（与 samples-checkout-e2e.test.js 同款守卫）
const suite = (isDeployed('samples') && process.env.DB_NAME !== 'sample_mgmt_test') ? describe.skip : describe;

suite('柜配置 upsert 真实执行（保留字反引号回归）', () => {
  const KEY = '99#样品柜'; // 借高位柜号避免污染真实柜配置，afterAll 清理
  afterAll(async () => {
    try { await D.pool().query('DELETE FROM sample_storage_cabinets WHERE cabinet_key=?', [KEY]); } catch (_) {}
  });
  test('ADMIN PUT 行列：INSERT 分支 + ON DUPLICATE 分支均无 SQL 语法错误，值正确落库', async () => {
    await getApp();
    const admin = await login('admin', 'admin123');
    const url = '/api/samples/storage-map/cabinets/' + encodeURIComponent(KEY);
    const r1 = await admin.agent.put(url).send({ rows: 7, columns: 4 }); // 首插（INSERT 分支）
    expect(r1.status).toBe(200);
    const r2 = await admin.agent.put(url).send({ rows: 5, columns: 6 }); // 重复键（原 bug 触发点）
    expect(r2.status).toBe(200);
    const [rows] = await D.pool().query('SELECT `rows`, `columns` FROM sample_storage_cabinets WHERE cabinet_key=?', [KEY]);
    expect(rows[0].rows).toBe(5);
    expect(rows[0].columns).toBe(6);
  });
  test('空柜渲染（2026-09-10）：配置表中尚无样品的柜也返回全空格位（configured=true）', async () => {
    await getApp();
    const admin = await login('admin', 'admin123');
    const KEY = '97#样品柜';
    const put = await admin.agent.put('/api/samples/storage-map/cabinets/' + encodeURIComponent(KEY)).send({ rows: 4, columns: 3 });
    expect(put.status).toBe(200);
    const res = await admin.agent.get('/api/samples/storage-map');
    expect(res.status).toBe(200);
    const cab = (res.body.cabinets || []).find(c => c.key === KEY);
    expect(cab).toBeTruthy();          // 原逻辑下无样品柜不出现，此断言即回归点
    expect(cab.configured).toBe(true); // 不显示「未配置」角标
    expect(cab.cols).toBe(3);
    expect(cab.rows).toBe(4);
    expect(cab.summary.total).toBe(12);
    expect(cab.summary.empty).toBe(12); // 全空
    expect(cab.cells.length).toBe(12);
    expect(cab.cells.every(x => x.empty === true)).toBe(true);
    await D.pool().query('DELETE FROM sample_storage_cabinets WHERE cabinet_key=?', [KEY]);
  });
});

// ── 作废即清柜（2026-09-16 用户业务规则）：作废/重做时同步释放柜位，独立清柜动作已下线 ──
describe('作废即清柜（scan-actions.js + manifest + 前端接线）', () => {
  const act = read('subsystems/samples/backend/scan-actions.js');

  test('manifest 移除 CLEAR_STORAGE 自环转移（18 → 17），落 RETIRED 的路径不变', () => {
    const mf = require('../subsystems/samples/manifest.json');
    expect((mf.stateMachine.transitions || []).length).toBe(17);
    expect(mf.stateMachine.transitions.filter(t => t.action === 'CLEAR_STORAGE').length).toBe(0);
    expect(mf.stateMachine.transitions.filter(t => t.to === 'RETIRED').map(t => t.action).sort())
      .toEqual(['FORCE_RETIRE', 'RECREATE', 'RETIRE_ONLY']);
  });

  test('releaseCabinet：置空储位 + 原储位并入作废日志（note 追加 + location 列），无储位零动作', () => {
    expect(act).toContain('function releaseCabinet(target, s, log) {');
    expect(act).toContain('target.storage_location = null;');
    expect(act).toContain('log.location = released;');
    expect(act).toContain("log.note = (log.note || '') + '，同步释放柜位 ' + released;");
    expect(act).toContain('if (!s.storage_location) return log;');
    // 只清储位，不动保管口径字段
    const helper = act.slice(act.indexOf('function releaseCabinet'), act.indexOf('// action 执行入口'));
    expect(helper).not.toContain('custody_dept');
  });

  test('4 个出口全部接入，且 RECREATE 事务内「先释放后写库」顺序正确', () => {
    expect((act.match(/releaseCabinet\(/g) || []).length).toBe(5); // 1 定义 + 4 调用
    ['RETIRE_ONLY', 'RETIRE_RECREATE', 'FORCE_RETIRE', 'RECREATE_REPLACED'].forEach(a => {
      expect(act).toContain("action: '" + a + "'");
    });
    const iRel = act.indexOf('releaseCabinet(oldUpdated, s,');
    const iUpd = act.indexOf('await D.updateSample(oldUpdated, conn, s.version);');
    expect(iRel).toBeGreaterThan(-1);
    expect(iUpd).toBeGreaterThan(iRel); // 就地改写必须先于 CAS 写库，否则置空不生效
    expect(act).not.toContain("chosenAction === 'CLEAR_STORAGE'");
  });

  test('前端 4 个确认框均提示柜位将释放（DRY 助手），且无清柜执行入口', () => {
    const sra = read('subsystems/samples/frontend/js/views/scan-return-actions.js');
    expect(sra).toContain('function retiredReleaseHint(s){');
    expect((sra.match(/retiredReleaseHint\(s\)\+/g) || []).length).toBe(4);
    expect(sra).toContain('将同步释放');
    expect(sra).not.toContain('CLEAR_STORAGE');
    const scan = read('subsystems/samples/frontend/js/views/scan.js');
    expect(scan).not.toContain("action==='CLEAR_STORAGE'");
    // 作废/重做类动作同样改变格位占用 → 必须与储位动作一样失效缓存
    expect(scan).toContain("var _SM_LOC_ACTIONS=['CUSTODY','EDIT_STORAGE','RETIRE_ONLY','RETIRE_RECREATE','FORCE_RETIRE','RECREATE'];");
    expect(scan).toContain('if(_SM_LOC_ACTIONS.indexOf(action)>=0)_smCache=null;');
  });

  test('第 5 态/「废N」角标随 gone 桶一并回退（三处前后端均无残留）', () => {
    const view = read('subsystems/samples/frontend/js/views/storage-map.js');
    const picker = read('subsystems/samples/frontend/js/views/storage-loc-picker.js');
    const css = read('subsystems/samples/frontend/css/module.css');
    const rpt = read('subsystems/samples/frontend/js/views/report.js');
    const backend = read('subsystems/samples/backend/routes-storage-map.js');
    [view, picker].forEach(src => {
      expect(src).not.toContain('sm-gone');
      expect(src).not.toContain('occ.gone');
      expect(src).not.toContain('已作废(待清柜)');
    });
    expect(css).not.toContain('sm-gone');
    expect(rpt).not.toContain('作废残留');
    expect(rpt).not.toContain('Number(s.gone)');
    expect(backend).not.toContain('cell.gone');
    expect(backend).not.toContain('summary.gone');
    expect(backend).not.toContain('gone:');
    // 保留的独立显示修复：格位清单状态中文化（原仅覆盖在柜三态，预占格位回显英文）
    expect(view).toContain("RETIRED: '已作废'");
    expect(view).toContain("NEW: '待制作'");
  });

  test('历史兼容：CLEAR_STORAGE 保留渲染映射（26 条订正日志可读）', () => {
    const scan = read('subsystems/samples/frontend/js/views/scan.js');
    const detail = read('subsystems/samples/frontend/js/views/detail.js');
    expect(scan).toContain("CLEAR_STORAGE:'清柜释放储位(历史)'");
    expect(detail).toContain('CLEAR_STORAGE:');
    expect(detail).toContain('SCAN_ACTION_CN_EXT[l.action]');
    expect(act).not.toContain("'仅「已作废」样品可清柜释放格位'");
  });

  test('落地 bundle 自证：含释放提示与历史标签，不含已下线动作的确认入口', () => {
    const b = read('subsystems/samples/frontend/js/bundle.js');
    expect(b).toContain('retiredReleaseHint');
    expect(b).toContain('将同步释放');
    expect(b).toContain('同步释放柜位');
    expect(b).toContain("CLEAR_STORAGE:'清柜释放储位(历史)'");
    expect(b).not.toContain('确认清柜释放格位');
    expect(b).not.toContain('sm-gone');
  });
});
