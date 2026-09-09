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
});
