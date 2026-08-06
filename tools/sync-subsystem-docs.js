// tools/sync-subsystem-docs.js — 子系统文档同步脚本（规则：AGENTS.md 17.12）
// 用法: node tools/sync-subsystem-docs.js [--dry-run]
// 功能: 扫描 subsystems/*/manifest.json（单一事实来源），重写各文档中的自动标记块：
//   - <!-- AUTO-SUBSYSTEMS:START/END -->     子系统清单（名称+描述）
//   - <!-- AUTO-SUBSYSTEMS-TREE:START/END --> 目录结构树（subsystems/ 部分）
// 新增/删除子系统后 MUST 运行本脚本；标记块内内容禁止手改。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SYS_DIR = path.join(ROOT, 'subsystems');
const BLOCK_LIST = ['<!-- AUTO-SUBSYSTEMS:START -->', '<!-- AUTO-SUBSYSTEMS:END -->'];
const BLOCK_TREE = ['<!-- AUTO-SUBSYSTEMS-TREE:START -->', '<!-- AUTO-SUBSYSTEMS-TREE:END -->'];

// 目标文档（相对 ROOT）
const TARGETS = ['AGENTS.md', 'CLAUDE.md', 'README.md', 'docs/subsystem-management-guide.md'];

// 读取所有子系统 manifest，返回按 id 排序的 [{id,name,description}]
function loadSubsystems() {
  const list = [];
  if (!fs.existsSync(SYS_DIR)) return list;
  fs.readdirSync(SYS_DIR).forEach(function (id) {
    if (!fs.statSync(path.join(SYS_DIR, id)).isDirectory()) return;
    const mp = path.join(SYS_DIR, id, 'manifest.json');
    if (!fs.existsSync(mp)) return;
    try {
      const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
      list.push({ id: id, name: m.name || id, description: m.description || '' });
    } catch (e) { console.warn('⚠ manifest 解析失败(跳过): ' + mp); }
  });
  return list.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
}

// 生成子系统清单块内容（bullet 列表）
function buildListBlock(list) {
  return list.map(function (s) {
    return '- **' + s.name + '**(`' + s.id + '`)：' + s.description;
  }).join('\n') + '\n';
}

// 生成目录树块内容（subsystems/ 子树，与 AGENTS.md 目录风格一致）
function buildTreeBlock(list) {
  const lines = ['├── subsystems/            # ★ 所有子系统(插件协议,见 AGENTS.md 第 17 节)'];
  list.forEach(function (s, i) {
    const branch = i === list.length - 1 ? '└──' : '├──';
    lines.push('│   ' + branch + ' ' + s.id + '/          # ' + s.name + '(backend/ db/ frontend/ seed/ manifest.json)');
  });
  return lines.join('\n') + '\n';
}

// 用新内容替换单个标记块；无标记块返回 false
function replaceBlock(text, block, content) {
  const [startTag, endTag] = block;
  const i = text.indexOf(startTag);
  if (i < 0) return { ok: false, text: text };
  const j = text.indexOf(endTag, i);
  if (j < 0) return { ok: false, text: text };
  const head = text.slice(0, i + startTag.length);
  const tail = text.slice(j);
  return { ok: true, text: head + '\n' + content + tail };
}

// 同步单个文档：替换清单块 + 目录树块
function syncFile(rel, list, dryRun) {
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) { console.log('  ⚠ 不存在，跳过: ' + rel); return; }
  let text = fs.readFileSync(fp, 'utf8');
  const listR = replaceBlock(text, BLOCK_LIST, buildListBlock(list));
  let changed = listR.ok;
  const treeR = replaceBlock(listR.text, BLOCK_TREE, buildTreeBlock(list));
  changed = changed || treeR.ok;
  if (!changed) { console.log('  ⚠ 无标记块，跳过: ' + rel); return; }
  if (dryRun) { console.log('  [dry-run] 将同步: ' + rel); return; }
  try {
    fs.writeFileSync(fp, treeR.text, 'utf8');
    console.log('  ✓ 已同步: ' + rel);
  } catch (e) {
    if (e.code === 'EACCES') {
      console.log('  ✗ 无写入权限: ' + rel + '（请用 sudo 运行本脚本）');
      return;
    }
    throw e;
  }
}

function main() {
  const dryRun = process.argv.includes('--dry-run');
  const list = loadSubsystems();
  console.log('子系统(' + list.length + '): ' + list.map(function (s) { return s.id; }).join(', '));
  TARGETS.forEach(function (rel) { syncFile(rel, list, dryRun); });
  console.log(dryRun ? '（dry-run 结束，未写盘）' : '完成。');
}

// 支持直接运行（node tools/sync-subsystem-docs.js）或被 create-subsystem.js require 调用
if (require.main === module) main();
module.exports = { main, loadSubsystems, buildListBlock, buildTreeBlock };
