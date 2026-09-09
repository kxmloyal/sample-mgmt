// tests/samples-checkout-users.test.js — 领用人候选选择器（2026-09-09 方案A）
// 契约校验：端点注册/字段收敛/前端接线（deployed:true 只读兼容，不写入任何样品数据）
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

describe('领用人候选 端点（routes-checkout-users.js）', () => {
  const src = read('subsystems/samples/backend/routes-checkout-users.js');
  test('路由已注册且为 GET /api/samples/checkout-users（登录即可）', () => {
    expect(src).toContain("'/api/samples/checkout-users'");
    expect(src).toContain('requireAuth');
  });
  test('字段收敛：SQL 仅取 id/display_name/dept，且仅 enabled=1 账号', () => {
    const sqlLine = src.split('\n').find(l => l.includes('SELECT id, display_name, dept FROM users'));
    expect(sqlLine).toBeTruthy();
    expect(sqlLine).toContain('enabled=1');
    expect(src.split('\n').filter(l => !l.trim().startsWith('//') && l.includes('username'))).toEqual([]);
  });
  test('已挂载到子系统入口（register 链路完整）', () => {
    expect(read('subsystems/samples/backend/index.js')).toContain("require('./routes-checkout-users').register(app)");
  });
  test('注册顺序：checkout-users 须在 routes-samples 之前（否则被 GET /:id 捕获成「样品不存在」）', () => {
    const idx = read('subsystems/samples/backend/index.js');
    expect(idx.indexOf('routes-checkout-users')).toBeLessThan(idx.indexOf("require('./routes-samples')"));
  });
});

describe('领用人选择器 前端接线', () => {
  test('领用表单含候选面板容器与失焦收起', () => {
    const scan = read('subsystems/samples/frontend/js/views/scan.js');
    expect(scan).toContain('id="scan-co-cand"');
    expect(scan).toContain('initCheckoutUserPicker');
    expect(scan).toContain('onblur');
  });
  test('选择器组件：点选带部门、输入过滤、API 路径正确', () => {
    const picker = read('subsystems/samples/frontend/js/views/checkout-user-picker.js');
    expect(picker).toContain('/api/samples/checkout-users');
    expect(picker).toContain('function pickCheckoutUser');
    expect(picker).toContain('function renderCoCandidates');
    expect(picker).toContain('co-cand-item');
  });
  test('提交链路：点选用户部门兜底（防中途清空）', () => {
    const scan = read('subsystems/samples/frontend/js/views/scan.js');
    expect(scan).toContain('_coPick&&_coPick.dept');
  });
  test('候选面板挂输入框右侧（co-wrap + co-cand-right）', () => {
    const scan = read('subsystems/samples/frontend/js/views/scan.js');
    expect(scan).toContain('co-wrap');
    expect(scan).toContain('co-cand-right');
  });
});

describe('排序增强：同部门优先 + 领用频率（后端）', () => {
  const src = read('subsystems/samples/backend/routes-checkout-users.js');
  test('接口按操作人部门排序返回（同部门在前）', () => {
    expect(src).toContain('currentUser(req)');
    expect(src).toContain('myDept');
    expect(src).toContain('localeCompare');
  });
  test('频率数据源：scan_logs CHECKOUT 流水提取计数（封顶 2000 条）', () => {
    expect(src).toContain("action='CHECKOUT'");
    expect(src).toContain('LIMIT 2000');
    expect(src).toContain('freq');
  });
  test('前端渲染徽标（同部门 / N次）', () => {
    const picker = read('subsystems/samples/frontend/js/views/checkout-user-picker.js');
    expect(picker).toContain('co-badge-dept');
    expect(picker).toContain('次</span>');
  });
  test('容器防横向滚动：面板 overflow-x hidden + 行内省略号截断', () => {
    const css = read('subsystems/samples/frontend/css/module.css');
    expect(css).toContain('overflow-x:hidden');
    expect(css).toContain('text-overflow:ellipsis');
    expect(css).toContain('max-width:min(72vw,340px)');
  });
});
