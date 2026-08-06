// tests/helpers/deployed.js — 已上线子系统护栏（AGENTS.md §20）
// 用途：测试文件顶部守卫。判断子系统是否已正式上线（manifest.deployed === true），
//       上线子系统禁止任何数据注入测试（仅允许只读验证）。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
const cache = {};

function isDeployed(id) {
  if (cache[id] !== undefined) return cache[id];
  try {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'subsystems', id, 'manifest.json'), 'utf-8'));
    cache[id] = m.deployed === true;
  } catch (e) { cache[id] = false; }
  return cache[id];
}

module.exports = { isDeployed };
