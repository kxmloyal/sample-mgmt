// tools/create-subsystem.js — 子系统脚手架 CLI
// 用法: node tools/create-subsystem.js <id> <name> [描述]
// 交互补全: 状态机 / 文件管理（可选能力；非 TTY 时自动用默认值）
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { generateSubsystem } = require('./subsystem-templates');

const ROOT = path.join(__dirname, '..');

// 单例 readline：复用同一实例，避免管道输入被多次创建/关闭的实例丢弃
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function validateId(id) {
  if (!id) return 'id 必填';
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return 'id 必须是字母开头的小写 kebab-case';
  if (fs.existsSync(path.join(ROOT, 'subsystems', id))) return '子系统 ' + id + ' 已存在';
  return null;
}

function prompt(q) {
  return new Promise(function (resolve) {
    rl.question(q, function (ans) { resolve(ans.trim()); });
  });
}

async function askYesNo(q) {
  if (!process.stdin.isTTY) { console.log(q + ' [y/N] 非交互模式，默认否'); return false; }
  var a = await prompt(q + ' [y/N] ');
  return /^[yY]/.test(a);
}

async function askStates() {
  if (!process.stdin.isTTY) { console.log('状态列表：非交互模式，跳过'); return []; }
  var s = await prompt('状态列表（逗号分隔，首个为初始态，如 DRAFT,ACTIVE,CLOSED）: ');
  return s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
}

async function writeFiles(id, files) {
  var dir = path.join(ROOT, 'subsystems', id);
  Object.keys(files).forEach(function (rel) {
    var fp = path.join(dir, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, files[rel], 'utf8');
  });
}

function updateBundleSources(id) {
  var sp = path.join(ROOT, 'tools', 'bundle-sources.json');
  var src = JSON.parse(fs.readFileSync(sp, 'utf8'));
  if (src[id]) return false;
  src[id] = [
    'shared/frontend/shared/utils.js',
    'shared/frontend/api-base.js',
    'shared/frontend/modal.js',
    'subsystems/' + id + '/frontend/js/views/dashboard.js',
    'subsystems/' + id + '/frontend/js/views/list.js',
    'subsystems/' + id + '/frontend/js/router.js'
  ];
  fs.writeFileSync(sp, JSON.stringify(src, null, 2) + '\n', 'utf8');
  return true;
}

async function main() {
  var id = process.argv[2], name = process.argv[3], desc = process.argv[4] || '';
  var err = validateId(id);
  if (err) { console.error('✗ ' + err); process.exit(1); }
  if (!name) { console.error('✗ name 必填（用法: node tools/create-subsystem.js <id> <name> [描述]）'); process.exit(1); }

  var withState = await askYesNo('需要状态机（状态/流转声明）吗？');
  var states = withState ? await askStates() : [];
  var withFiles = await askYesNo('需要文件管理（附件上传）吗？');

  var ctx = { id: id, name: name, description: desc, icon: 'chart', version: '1.0.0',
    withStateMachine: withState, withFiles: withFiles, states: states };
  var out = generateSubsystem(ctx);
  await writeFiles(id, out.files);
  var added = updateBundleSources(id);
  console.log('✓ 生成 ' + Object.keys(out.files).length + ' 个文件 → subsystems/' + id + '/');
  console.log(added ? '✓ 已追加 tools/bundle-sources.json' : '⚠ tools/bundle-sources.json 已含该子系统');
  console.log('\n下一步:');
  console.log('  1) node tools/build-bundles.js');
  console.log('  2) sudo cp /tmp/bundle-' + id + '.js subsystems/' + id + '/frontend/js/bundle.js');
  console.log('  3) 重启服务后访问 http://localhost:4000/portal.html 查看新卡片');
  process.exit(0);
}

main().catch(function (e) { console.error('✗ 生成失败: ' + e.message); process.exit(1); });
