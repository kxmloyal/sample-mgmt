// tests/fixtures-seed-guard.test.js — 治具种子「上线护栏」单元测试（AGENTS.md §20）
//
// 目的：锁定护栏行为，防止被回退或绕过。该种子脚本会无条件执行
//       DELETE FROM fixture_logs / fixtures，2026-09-10 曾在 deployed:true 状态下清空治具表，
//       故护栏必须有回归保护。
//
// ★ 本测试**完全不触数据库**：
//   - 只 require tools/seed-guard.js（该模块仅依赖 fs/path）；
//   - 不可 require subsystems/fixtures/seed/seed.js —— 它连带 require db.js，而 db.js 在模块
//     顶层执行 `const ready = init();`，require 瞬间即连接 .env 指向的库（生产库）并跑迁移。
//   - 对种子源码「护栏调用必须早于 DELETE」改用源码顺序断言（静态校验，无副作用）。
const fs = require('fs');
const os = require('os');
const path = require('path');
const { assertSeedAllowed } = require('../tools/seed-guard');

const SEED_SRC = path.join(__dirname, '..', 'subsystems', 'fixtures', 'seed', 'seed.js');
const REAL_MANIFEST = path.join(__dirname, '..', 'subsystems', 'fixtures', 'manifest.json');

function tmpManifest(obj) {
  const p = path.join(
    os.tmpdir(),
    'fixture-manifest-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json'
  );
  fs.writeFileSync(p, JSON.stringify(obj, null, 2), 'utf-8');
  return p;
}

function codeOf(fn) {
  try { fn(); return null; } catch (e) { return e.code; }
}

describe('治具种子上线护栏（AGENTS.md §20）', () => {
  it('deployed:true 时必须拒绝执行（硬护栏）', () => {
    const p = tmpManifest({ id: 'fixtures', name: '治具管理', deployed: true });
    try {
      expect(() => assertSeedAllowed('fixtures', p)).toThrow();
      expect(codeOf(() => assertSeedAllowed('fixtures', p))).toBe('SEED_BLOCKED_DEPLOYED');
    } finally { fs.unlinkSync(p); }
  });

  it('deployed:false 时允许执行（未上线可造数）', () => {
    const p = tmpManifest({ id: 'fixtures', name: '治具管理', deployed: false });
    try { expect(assertSeedAllowed('fixtures', p)).toBeUndefined(); } finally { fs.unlinkSync(p); }
  });

  it('未写 deployed 字段时允许执行（与门户「未写视为未上线」口径一致）', () => {
    const p = tmpManifest({ id: 'fixtures', name: '治具管理' });
    try { expect(assertSeedAllowed('fixtures', p)).toBeUndefined(); } finally { fs.unlinkSync(p); }
  });

  it('manifest 缺失时必须失败关闭（宁可拒绝也不误清库）', () => {
    const missing = path.join(os.tmpdir(), 'not-exist-' + Date.now() + '.json');
    expect(codeOf(() => assertSeedAllowed('fixtures', missing))).toBe('SEED_MANIFEST_UNREADABLE');
  });

  it('manifest JSON 损坏时也必须失败关闭', () => {
    const p = path.join(os.tmpdir(), 'broken-manifest-' + Date.now() + '.json');
    fs.writeFileSync(p, '{ this is not json', 'utf-8');
    try {
      expect(codeOf(() => assertSeedAllowed('fixtures', p))).toBe('SEED_MANIFEST_UNREADABLE');
    } finally { fs.unlinkSync(p); }
  });

  it('拦截信息应含子系统中文名与 id，便于运维定位', () => {
    const p = tmpManifest({ id: 'fixtures', name: '治具管理', deployed: true });
    try {
      let msg = '';
      try { assertSeedAllowed('fixtures', p); } catch (e) { msg = e.message; }
      expect(msg).toContain('治具管理');
      expect(msg).toContain('fixtures');
      expect(msg).toContain('AGENTS.md §20');
    } finally { fs.unlinkSync(p); }
  });

  it('对真实 manifest 的判定应与实际 deployed 状态一致（只读校验）', () => {
    const deployed = JSON.parse(fs.readFileSync(REAL_MANIFEST, 'utf-8')).deployed === true;
    const code = codeOf(() => assertSeedAllowed('fixtures'));
    expect(code).toBe(deployed ? 'SEED_BLOCKED_DEPLOYED' : null);
  });

  it('种子入口的护栏调用必须早于任何 DELETE（源码顺序断言）', () => {
    const src = fs.readFileSync(SEED_SRC, 'utf8');
    const iCall = src.indexOf('\n  assertSeedAllowed();');
    const iDelete = src.indexOf('DELETE FROM fixture_logs');
    expect(iCall).toBeGreaterThan(-1);      // seed() 内确有护栏调用
    expect(iDelete).toBeGreaterThan(-1);    // 确有清表语句
    expect(iCall).toBeLessThan(iDelete);    // 且护栏在前 —— 这是本次事故的根因防线
  });

  it('种子模块必须复用共用护栏（不得内联重复实现）', () => {
    const src = fs.readFileSync(SEED_SRC, 'utf8');
    expect(src).toContain("require('../../../tools/seed-guard')");
    expect(src).toContain("seedGuard.assertSeedAllowed('fixtures'");
    expect(src).not.toContain('SEED_BLOCKED_DEPLOYED'); // 码值只应存在于共用模块
  });
});
