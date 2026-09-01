// subsystems/control/seed/seed.js — 管制流程子系统种子数据
// 权威依据：docs/superpowers/specs/2026-08-24-control-flow-design.md §5-§8
// 说明：
//  - 读 manifest 判定 deployed:true 时拒绝执行（AGENTS.md §20.2 上线保护）。
//  - 造 12 张管制单覆盖全状态（DRAFT/SIGNING/LABELED/CONTROL_STORED/NCR_DONE/
//    DISPOSAL_SIGNING/REWORK_OPENED/REWORKING/REWORK_REPORTED/REIN_STOCK/SHIPPED/RETIRED）。
//  - 会签按 flow.js SIGN_NODES 模板初始化/签字；created_at/apply_at/日志时间按本地时间(UTC+8)回填，
//    保证时间线真实（与 samples/seed/seed.js 一致）。
//  - 本脚本对 control_* 表执行清空 + 插入，属测试数据注入；control 未上线（deployed:false）可运行。
//  - 12 个场景生成逻辑已拆分至 seed-scenarios.js（单一职责），本文件只负责：上线保护/账号获取/清空/
//    签字与流转 helper（addLogAt/initSign/signStep/signAll/advance/makeOrder）与汇总输出。
const D = require('../../../db');
const { buildSignTemplate, findSignNode } = require('../backend/flow-ops');
const manifest = require('../manifest.json');
const runScenarios = require('./seed-scenarios');

const NOW = new Date();
const DAY = 86400000;
// ISO(UTC) 时间，用于 apply_at / signed_at / work_date 等 VARCHAR 时间列
function isoAgo(n) { return new Date(NOW.getTime() - n * DAY).toISOString(); }
// 本地时间(UTC+8)字符串，用于 TIMESTAMP 列（created_at / 日志时间）回填
function localAgo(n) {
  var d = new Date(NOW.getTime() - n * DAY);
  function p(x) { return String(x).padStart(2, '0'); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

async function seed(pool) {
  // ── 上线保护：已上线(deployed:true)拒绝注入测试数据 ──
  if (manifest.deployed) {
    console.log('[control] 子系统已上线(deployed:true)，拒绝注入测试数据。');
    return;
  }

  const admin = await D.getUserByUsername('admin');
  const rd = await D.getUserByUsername('rd01');
  const qa = await D.getUserByUsername('qa01');
  const mfg = await D.getUserByUsername('mfg01');
  const fqc = await D.getUserByUsername('fqc01');
  const pmc = await D.getUserByUsername('pmc01');
  const wh = await D.getUserByUsername('wh01');
  const me = await D.getUserByUsername('me01');
  if (!rd || !qa || !mfg || !pmc || !wh || !me) { console.log('请先执行 node seed.js 创建基础账号'); return; }
  // 会签用户按角色映射（ADMIN/RD/QA/ME；CUSTODY 为兜底，仅用于申请人角色日志）
  const USERS = { ADMIN: admin, RD: rd, QA: qa, ME: me, CUSTODY: mfg };
  // 会签按「角色+单位」定位具体账号：品保→qa、研发→rd、生管→pmc、制造部→mfg、仓库→wh
  function userForStep(step) {
    if (step.role === 'CUSTODY') {
      if (step.dept === '生管') return pmc;
      if (step.dept === '仓库') return wh;
      return mfg; // 制造部及其它单位兜底
    }
    return USERS[step.role];
  }

  // ── 清空管制数据（子表→主表→序号） ──
  console.log('清空管制数据…');
  await pool.execute('DELETE FROM control_logs');
  await pool.execute('DELETE FROM control_rework_logs');
  await pool.execute('DELETE FROM control_ncr_logs');
  await pool.execute('DELETE FROM control_signs');
  await pool.execute('DELETE FROM control_orders');
  await pool.execute('DELETE FROM control_seqs');
  const ALTERS = ['control_orders', 'control_signs', 'control_ncr_logs', 'control_rework_logs', 'control_logs'];
  for (const t of ALTERS) { try { await pool.execute('ALTER TABLE ' + t + ' AUTO_INCREMENT = 1'); } catch (e) { /* 忽略 */ } }
  console.log('已清空。\n');

  // 带时间戳的日志插入（DAO.addControlLog 不支持回填 created_at，故用原生 SQL）
  async function addLogAt(l, ts) {
    await pool.execute(
      'INSERT INTO control_logs (order_id,action,role,user_id,dept,comment,created_at) VALUES (?,?,?,?,?,?,?)',
      [l.order_id, l.action, l.role || null, l.user_id || null, l.dept || null, l.comment || null, ts || localAgo(0)]
    );
  }

  // 初始化某会签节点模板（decision='' 待签槽）
  async function initSign(order, nodeKey) {
    for (const s of buildSignTemplate(order.id, nodeKey)) await D.addSign(s);
  }

  // 单步签字（写 signer/decision/signed_at）
  async function signStep(order, nodeKey, seq, u, decision, daysAgo) {
    const node = findSignNode(nodeKey);
    const step = node.steps.find(s => s.seq === seq);
    await D.addSign({ order_id: order.id, node_key: nodeKey, node_name: node.node_name, seq, role: step.role, sign_dept: step.dept, signer_id: u.id, signer_name: u.display_name || u.username, decision, comment: decision === 'REJECT' ? '退回' : '会签通过', signed_at: isoAgo(daysAgo) });
  }

  // 会签节点全步 AGREE（按模板「角色+单位」映射用户）
  async function signAll(order, nodeKey, daysAgo) {
    const node = findSignNode(nodeKey);
    for (const step of node.steps) {
      await signStep(order, nodeKey, step.seq, userForStep(step), 'AGREE', daysAgo);
    }
  }

  // 状态流转：读最新 + 全量字段覆盖（与系统 updateOrder 一致）
  async function advance(order, patch) {
    const cur = await D.getOrderById(order.id);
    await D.updateOrder(Object.assign({}, cur, patch));
    return await D.getOrderById(order.id);
  }

  // 新建管制申请单：建主单 + 初始化闸口①模板 + CREATE 留痕（created_at/apply_at 回填）
  async function makeOrder(data, daysAgo, logNote) {
    const o = await D.createOrder(Object.assign({}, data, { apply_at: isoAgo(daysAgo) }));
    await pool.execute('UPDATE control_orders SET created_at=? WHERE id=?', [localAgo(daysAgo), o.id]);
    await initSign(o, 'APPLY_SIGN');
    await addLogAt({ order_id: o.id, action: 'CREATE', role: USERS[data.applicant_role] ? USERS[data.applicant_role].role : null, user_id: data.created_by, dept: data.apply_dept, comment: logNote || '新建管制申请单' }, localAgo(daysAgo));
    return o;
  }

  // 运行 12 个场景（已拆分至 seed-scenarios.js，行为与原内联实现一致）
  await runScenarios({
    D, isoAgo, localAgo, makeOrder, advance, signAll, signStep, initSign, addLogAt,
    admin, qa, mfg, fqc, me
  });

  // ── 汇总 ──
  const rows = await pool.execute('SELECT status, COUNT(*) AS cnt FROM control_orders GROUP BY status ORDER BY status');
  const total = (await pool.execute('SELECT COUNT(*) AS cnt FROM control_orders'))[0][0].cnt;
  const logCnt = (await pool.execute('SELECT COUNT(*) AS cnt FROM control_logs'))[0][0].cnt;
  const signCnt = (await pool.execute('SELECT COUNT(*) AS cnt FROM control_signs'))[0][0].cnt;
  const ncrCnt = (await pool.execute('SELECT COUNT(*) AS cnt FROM control_ncr_logs'))[0][0].cnt;
  const rwCnt = (await pool.execute('SELECT COUNT(*) AS cnt FROM control_rework_logs'))[0][0].cnt;
  console.log('\n========== 汇总 ==========');
  console.log('  管制单总数: ' + total + ' 张');
  rows[0].forEach(function (r) { console.log('    ' + r.status + ': ' + r.cnt + ' 张'); });
  console.log('  会签记录: ' + signCnt + ' 条');
  console.log('  委托单明细: ' + ncrCnt + ' 条');
  console.log('  报工记录: ' + rwCnt + ' 条');
  console.log('  操作日志: ' + logCnt + ' 条');
  console.log('\n管制种子完成。');
}

module.exports = seed;
