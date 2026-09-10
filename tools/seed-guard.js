// tools/seed-guard.js — 子系统种子数据「上线护栏」共用实现（AGENTS.md §20）
//
// 用途：供各子系统 seed 脚本在注入测试数据前做统一校验。已正式上线（manifest.deployed === true）
//       的子系统禁止注入测试数据，避免误清业务表（2026-09-10 治具表被 seed 清空事故的根因修复）。
// 设计：本模块**只依赖 fs/path**，不 require db.js —— 保证可在无数据库环境下被单元测试直接加载。
//       （db.js 在 require 阶段即启动连接初始化，测试若连带加载会误连生产库，故必须解耦）
// 兼容：新增文件，不改变任何既有模块的对外接口。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/**
 * 校验指定子系统当前是否允许注入种子数据；不允许则抛错。
 *
 * @param {string} subsystemId 子系统 id（即 subsystems/<id>/manifest.json 的目录名），如 'fixtures'
 * @param {string} [manifestPath] 可选，manifest.json 绝对路径（便于单元测试注入临时文件）
 * @returns {void} 允许时静默返回
 * @throws {Error} ① 已上线：error.code = 'SEED_BLOCKED_DEPLOYED'
 *                 ② manifest 缺失或 JSON 损坏：error.code = 'SEED_MANIFEST_UNREADABLE'
 *                 读取失败按「不可判定」处理并拒绝执行（失败关闭），宁可拒绝也不误清库
 */
function assertSeedAllowed(subsystemId, manifestPath) {
  const mp = manifestPath || path.join(ROOT, 'subsystems', subsystemId, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  } catch (e) {
    const unreadable = new Error(
      '[护栏] 无法读取子系统 manifest（' + mp + '）：' + e.message + '；为防误清库，seed 已中止。'
    );
    unreadable.code = 'SEED_MANIFEST_UNREADABLE';
    throw unreadable;
  }
  if (manifest.deployed === true) {
    const label = manifest.name || subsystemId;
    const blocked = new Error(
      '[护栏] ' + label + '（' + subsystemId + '）已正式上线（deployed:true），按 AGENTS.md §20 ' +
      '禁止注入测试数据，seed 已中止。如需造数，请先在管理面板将该子系统切换为未上线。'
    );
    blocked.code = 'SEED_BLOCKED_DEPLOYED';
    throw blocked;
  }
}

module.exports = { assertSeedAllowed };
