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
  workbench:"window.addEventListener('hashchange',route);boot();",
  projects: "window.addEventListener('hashchange',route);boot('项目追踪');",
  control:  "window.addEventListener('hashchange',route);boot('管制流程管理');"
};

const sourcesPath = path.join(__dirname, 'bundle-sources.json');
if (!fs.existsSync(sourcesPath)) { console.error('bundle-sources.json 不存在'); process.exit(1); }
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

// 共享常量注入：读取 data/*.json（与 routes/misc.js /js/shared-constants.js 同源，服务端动态版保留兼容）
// 用 var 而非 const，避免与子系统内同名声明冲突
function sharedConstantsHeader() {
  const limitItems = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'limit-items.json'), 'utf-8'));
  const sourceTypes = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'source-types.json'), 'utf-8'));
  const depts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'depts.json'), 'utf-8'));
  return '/* --- shared constants (data/*.json) --- */\n' +
    'var LIMIT_ITEMS = ' + JSON.stringify(limitItems) + ';\n' +
    'var SOURCE_TYPES = ' + JSON.stringify(sourceTypes) + ';\n' +
    'var DEPTS = ' + JSON.stringify(depts) + ';\n';
}

for (const [id, scripts] of Object.entries(sources)) {
  console.log('=== ' + id + ' ===');
  // 新子系统默认初始化（脚手架生成的子系统统一用 route/boot）
  const init = INIT[id] || "window.addEventListener('hashchange',route);boot();";

  let out = '/** BUNDLE v' + BUNDLE_VER + ' — ' + scripts.length + ' files */\n';
  out += sharedConstantsHeader();
  // 管制子系统专属流程常量：注入 CONTROL_FLOW（与后端 flow.js require data/control-flow.json 同源，仅 control bundle 携带）
  if (id === 'control') {
    const controlFlow = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'control-flow.json'), 'utf-8'));
    out += 'var CONTROL_FLOW = ' + JSON.stringify(controlFlow) + ';\n';
  }
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
