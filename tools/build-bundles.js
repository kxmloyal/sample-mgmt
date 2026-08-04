// tools/build-bundles.js — 子系统 JS 合并构建脚本
// 用途：按 bundle-sources.json 中定义的顺序合并各子系统 JS 文件为单个 bundle.js
// 用法：node tools/build-bundles.js
// 遵守子系统隔离原则：每个子系统独立合并

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const BUNDLE_VER = 'b' + Date.now().toString(36);

// 各子系统初始化代码（追加到 bundle 末尾）
const INIT = {
  samples:  "window.addEventListener('hashchange',route);boot();",
  fixtures: "window.addEventListener('hashchange',routeFixture);bootFixture();",
  workbench:"window.addEventListener('hashchange',route);boot();"
};

const sourcesPath = path.join(__dirname, 'bundle-sources.json');
if (!fs.existsSync(sourcesPath)) { console.error('bundle-sources.json 不存在'); process.exit(1); }
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

for (const [id, scripts] of Object.entries(sources)) {
  console.log('=== ' + id + ' ===');
  const init = INIT[id];
  if (!init) { console.log('  无 init，跳过'); continue; }

  let out = '/** BUNDLE v' + BUNDLE_VER + ' — ' + scripts.length + ' files */\n';
  let total = 0;
  for (const s of scripts) {
    const fp = path.join(ROOT, s);
    if (!fs.existsSync(fp)) { console.warn('  [WARN] 缺失: ' + s); out += '\n/** [MISSING] ' + s + ' */\n'; continue; }
    const c = fs.readFileSync(fp, 'utf-8');
    out += '\n/* --- ' + s + ' --- */\n' + c + '\n';
    total += c.length;
  }
  out += '\n// bundle init\n' + init + '\n';
  console.log('  files=' + scripts.length + '  src=' + (total/1024).toFixed(1) + 'KB  bundle=' + (out.length/1024).toFixed(1) + 'KB');

  const dst = '/tmp/bundle-' + id + '.js';
  fs.writeFileSync(dst, out, 'utf-8');
  console.log('  -> ' + dst);
}

console.log('\nDone. VER=' + BUNDLE_VER);
fs.writeFileSync(path.join(ROOT, 'tools', '.bundle-ver'), BUNDLE_VER);
