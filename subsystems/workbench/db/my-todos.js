// subsystems/workbench/db/my-todos.js — 「我的待办」跨子系统聚合（全部实时派生，零落库零迁移）
// 归属口径（用户已确认：角色/部门可处理 + 个人指派合并）：
//   样品 sample：RD=NEW(待制作确认)/RETURNING且retire_assigned_rd=本人(待重做)；QA=PRODUCED(待发行)/RETURNING(待审核退回)；
//     CUSTODY|ME=RELEASED(待接收)；ADMIN=上述角色规则并集；其余角色(如 PM)=无样品待办。
//     非 ADMIN 直接复用 D.listMyPendingSamples(role, userId)（与样品看板同一 DAO，数字互相印证）。
//   治具 fixture：allowedActions（权限）+ "行动主体才看待办"原则（2026-09-04，待办≠权限广播）：
//     RD=REQUESTED(待接收)/ACCEPTED(制作中)/IMPROVING(改善中)/REPAIRING_RD(RD维修)；
//     ME=REPAIRING_ME(ME维修)/REPAIR_DONE(待确认维修)/IMPROVING(改善中)/保养到期(TRANSFERRED|IN_USE 且 next_maintenance_at 到期)；
//     申请部门(requested_dept=我部门)=VERIFY_PENDING(待验证)/TRANSFERRED(可领用)/IMPROVING(改善中)；
//     借用人本人+借用部门+ME=IN_USE 归还逾期(expected_return_at 到期)；
//     ADMIN=VERIFY_PENDING 兜底验证 + VERIFY_RD_OK/VERIFY_ORG_OK 死锁态(待强制移交 FORCE_TRANSFER)；
//     个人=领用逾期归还(used_by=本人且 expected_return_at 到期)。
//   管制 control：manifest.stateMachine.transitions 角色匹配=待我流转（剔除 VOID 作废与 *_REJECT 退回——
//     退回是会签的一部分，已由待我签核覆盖）；DRAFT 提交待办仅申请部门（apply_dept=我部门，起草人自己提交）；
//     CUSTODY 职能池状态（入仓/报工/入库/出货）仅仓口部门（CTL_CUSTODY_DEPT_GATE，待办≠部门广播）；
//     control_signs 待签行(decision 空) role 匹配=待我签核；ADMIN 对所有会签中单据可见。
//     与 control 前端 todo.js 的差异：前端待我签核仅首步角色近似，本模块按任一待签行
//     （会签已并行化，本口径更准）；前端 toFlow 含 REJECT 动作，本模块不含（评审 R6）。
//   项目 project：project_tasks/project_subtasks assignee_id=本人且 status<>'DONE'（唯一按个人指派的子系统）。
var D = require('../../../db');
var CTL_MANIFEST = require('../../control/manifest.json');

// 状态中文映射（与各子系统权威来源对齐：workbench-queries.js CASE / control manifest.states / projects manifest.states）
var SAMPLE_STATUS_CN = { NEW: '制样中', PRODUCED: '待发行', RELEASED: '保管中', IN_CUSTODY: '保管中', RETURNING: '退回审核中' };
var FIXTURE_STATUS_CN = {
  REQUESTED: '待接收', ACCEPTED: '制作中', VERIFY_PENDING: '待验证', VERIFY_RD_OK: 'RD验证通过', VERIFY_ORG_OK: '申请单位确认',
  TRANSFERRED: '可领用', IN_USE: '领用中', IMPROVING: '改善中', REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '待确认维修'
};
var CONTROL_STATUS_CN = {};
Object.keys(CTL_MANIFEST.stateMachine.states).forEach(function (k) { CONTROL_STATUS_CN[k] = CTL_MANIFEST.stateMachine.states[k].label; });
var PROJECT_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', OVERDUE: '已延期' };

function _isManager(role) { return role === 'ME' || role === 'QA' || role === 'CUSTODY'; } // 对齐 isMECustodyQA

/* ---------------- 样品 ---------------- */
// 待办类型派生（对齐 samples 前端 dashboard-todo.js 的 _getTodoInfo）
function sampleTodoOf(s, u) {
  if (s.status === 'NEW') return { todo: '待制作确认', urgent: false };
  if (s.status === 'PRODUCED') return { todo: '待发行', urgent: false };
  if (s.status === 'RELEASED') return { todo: '待接收', urgent: false };
  if (s.status === 'RETURNING') {
    if (String(s.retire_assigned_rd) === String(u.id)) return { todo: '待重做', urgent: true };
    return { todo: '待审核退回', urgent: u.role === 'QA' || u.role === 'ADMIN' };
  }
  return { todo: '待处理', urgent: false };
}

async function collectSampleTodos(u) {
  var rows;
  if (u.role === 'ADMIN') {
    // ADMIN=各角色规则并集（不用 dao 的全量回退，避免把全部样品当作待办）；上限与 listMyPendingSamples 对齐 200
    var [r] = await D.pool().execute(
      "SELECT * FROM samples WHERE deleted_at IS NULL AND (status IN ('NEW','PRODUCED','RELEASED','RETURNING')) ORDER BY id DESC LIMIT 200");
    rows = r;
  } else if (['RD', 'QA', 'CUSTODY', 'ME'].indexOf(u.role) !== -1) {
    rows = await D.listMyPendingSamples(u.role, u.id);
  } else {
    return [];
  }
  return (rows || []).map(function (s) {
    var t = sampleTodoOf(s, u);
    return {
      id: s.id, item_type: 'sample', item_no: s.sample_no, name: s.name,
      todo: t.todo, status: s.status, status_cn: SAMPLE_STATUS_CN[s.status] || s.status,
      urgent: t.urgent, hint: s.spec || '', updated_at: s.updated_at
    };
  });
}

/* ---------------- 治具 ---------------- */
// 口径基准：allowedActions（权限）+ 2026-09-04 收紧的"行动主体才看待办"原则（待办 ≠ 权限广播）：
// 待办只给当事人（申请人部门/借用人/借用部门）与职能口（RD 制作维修、ME 设备管理），旁观部门不广播。
// RETURN/REPAIR_ME/REPAIR_RD_REQ/IMPROVE 为可选项不入待办，RETIRE 为破坏性操作不入待办；
// MAKE 的图纸/照片文件门槛属执行时校验，待办仅按状态+角色提醒
function fixtureTodoOf(f, u) {
  var reasons = [];
  var urgent = false;
  var role = u.role;
  var borrower = f.used_by;
  switch (f.status) {
    case 'REQUESTED':
      if (role === 'RD') reasons.push('待接收');
      break;
    case 'ACCEPTED':
      if (role === 'RD') reasons.push('制作中');
      break;
    case 'VERIFY_PENDING':
      // 谁申请谁验证（申请部门）+ ADMIN 兜底，与 canVerify/allowedActions 同源
      if (f.requested_dept === u.dept || role === 'ADMIN') reasons.push('待验证');
      break;
    case 'VERIFY_RD_OK':
    case 'VERIFY_ORG_OK':
      if (role === 'ADMIN') { reasons.push('死锁待强制移交'); urgent = true; } // F5 兜底态仅 ADMIN 可解锁
      break;
    case 'TRANSFERRED':
      // 可领用：申请部门（等着用）+ ME（设备台账管理口）；不再向 QA/CUSTODY 其他部门广播
      if (f.requested_dept === u.dept || role === 'ME') reasons.push('可领用');
      break;
    case 'IN_USE':
      // 归还逾期：借用人本人 + 借用人部门 + ME（设备管理口催收/代办）；不再向 QA/CUSTODY 其他部门广播
      if (f.expected_return_at && new Date(f.expected_return_at) <= new Date()
          && (String(borrower) === String(u.id) || (f.used_by_dept && f.used_by_dept === u.dept) || role === 'ME')) {
        reasons.push('归还逾期'); urgent = true;
      }
      break;
    case 'IMPROVING':
      // 改善中：RD（改善主导）+ ME + 申请部门（等待方）；不再向 QA/CUSTODY 其他部门广播
      if (role === 'RD' || role === 'ME' || f.requested_dept === u.dept) reasons.push('改善中');
      break;
    case 'REPAIRING_ME':
      if (role === 'ME') reasons.push('ME维修中');
      break;
    case 'REPAIRING_RD':
      if (role === 'RD') reasons.push('RD维修中');
      break;
    case 'REPAIR_DONE':
      if (role === 'ME') reasons.push('待确认维修');
      break;
  }
  // 保养到期：MAINTENANCE 动作权威=ME（TRANSFERRED/IN_USE）
  if (role === 'ME' && ['TRANSFERRED', 'IN_USE'].indexOf(f.status) !== -1
      && f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date()) {
    reasons.push('保养到期'); urgent = true;
  }
  // 个人维度已并入上方 IN_USE 归还逾期判定（借用人本人/借用部门/ME）
  if (!reasons.length) return null;
  return { todo: reasons.join('、'), urgent: urgent };
}

async function collectFixtureTodos(u) {
  // 一次取回全部进行中治具（含死锁态），JS 侧按口径派生，避免超长 OR-SQL；
  // LEFT JOIN users 取借用人部门（归还逾期按借用部门广播用）
  var [rows] = await D.pool().execute(
    "SELECT f.id, f.fixture_no, f.name, f.status, f.requested_dept, f.used_by, ub.dept AS used_by_dept, f.expected_return_at, f.next_maintenance_at, f.updated_at " +
    "FROM fixtures f LEFT JOIN users ub ON ub.id = f.used_by " +
    "WHERE f.status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_RD_OK','VERIFY_ORG_OK','TRANSFERRED','IN_USE','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE') " +
    "ORDER BY f.updated_at DESC LIMIT 1000");
  var out = [];
  rows.forEach(function (f) {
    var t = fixtureTodoOf(f, u);
    if (!t) return;
    out.push({
      id: f.id, item_type: 'fixture', item_no: f.fixture_no, name: f.name,
      todo: t.todo, status: f.status, status_cn: FIXTURE_STATUS_CN[f.status] || f.status,
      urgent: t.urgent, hint: f.requested_dept || '', updated_at: f.updated_at
    });
  });
  return out;
}

/* ---------------- 管制 ---------------- */
// CUSTODY 职能池仓口部门门槛（2026-09-04 收紧：待办只给仓口当事人部门，不再全 CUSTODY 部门广播；
// ME/QA 为职能角色不受此门槛限制；DRAFT 提交待办单独按 apply_dept 匹配）
var CTL_CUSTODY_DEPT_GATE = {
  LABELED: ['资材部'],                            // 入管制仓：仓库口执行
  REWORKING: ['生管部', '资材部', '制造部'],        // 报工：生产执行口
  REWORK_REPORTED: ['资材部', '生管部'],            // 入库
  REIN_STOCK: ['资材部', '生管部']                  // 出货
};

async function collectControlTodos(u) {
  var pool = D.pool();
  var byId = {}; // id → item（合并 待我流转/待我签核 两个来源）

  // 待我流转：transitions 角色匹配
  // 剔除 VOID（作废，破坏性）与 *_REJECT（会签退回是会签动作的一部分，已由待我签核覆盖，避免重复+语义混乱）
  var flowMap = {}; // status → { label, action }
  (CTL_MANIFEST.stateMachine.transitions || []).forEach(function (t) {
    if (t.action === 'VOID' || t.action === 'SIGN_REJECT' || t.action === 'DISPOSAL_REJECT') return;
    if (t.role.indexOf(u.role) !== -1 && !flowMap[t.from]) flowMap[t.from] = { label: t.label, action: t.action };
  });
  var statuses = Object.keys(flowMap);
  if (statuses.length) {
    var ph = statuses.map(function () { return '?'; }).join(',');
    var [orders] = await pool.execute(
      "SELECT id, order_no, part_name, status, apply_dept, updated_at FROM control_orders WHERE status IN (" + ph + ") ORDER BY updated_at DESC LIMIT 200",
      statuses);
    orders.forEach(function (o) {
      var fm = flowMap[o.status];
      if (!fm) return;
      // 部门门槛（2026-09-04）：DRAFT 提交会签 → 仅申请部门（起草人所在部门自己提交）；
      // CUSTODY 职能池状态 → 仅仓口当事人部门（CTL_CUSTODY_DEPT_GATE）
      if (o.status === 'DRAFT') {
        if (o.apply_dept !== u.dept) return;
      } else if (u.role === 'CUSTODY' && CTL_CUSTODY_DEPT_GATE[o.status]
          && CTL_CUSTODY_DEPT_GATE[o.status].indexOf(u.dept) === -1) {
        return;
      }
      byId[o.id] = {
        id: o.id, item_type: 'control', item_no: o.order_no, name: o.part_name,
        todo: '待流转：' + fm.label, status: o.status, status_cn: CONTROL_STATUS_CN[o.status] || o.status,
        urgent: false, hint: '', updated_at: o.updated_at
      };
    });
  }

  // 待我签核：control_signs 待签行 role 匹配（会签已并行化，任一待签步即可签）；
  // ADMIN 对所有会签中单据可见（对齐 control 前端 todo.js 的 ADMIN 规则）
  var signRows;
  if (u.role === 'ADMIN') {
    var [r1] = await pool.execute(
      "SELECT DISTINCT o.id, o.order_no, o.part_name, o.status, o.apply_dept, o.updated_at FROM control_orders o " +
      "WHERE o.status IN ('SIGNING','DISPOSAL_SIGNING') AND EXISTS (" +
      "  SELECT 1 FROM control_signs s WHERE s.order_id = o.id AND (s.decision IS NULL OR s.decision = '')" +
      ") ORDER BY o.updated_at DESC LIMIT 200");
    signRows = r1;
  } else {
    var [r2] = await pool.execute(
      "SELECT DISTINCT o.id, o.order_no, o.part_name, o.status, o.apply_dept, o.updated_at FROM control_signs s " +
      "JOIN control_orders o ON o.id = s.order_id " +
      "WHERE (s.decision IS NULL OR s.decision = '') AND s.role = ? AND o.status IN ('SIGNING','DISPOSAL_SIGNING') " +
      "ORDER BY o.updated_at DESC LIMIT 200", [u.role]);
    signRows = r2;
  }
  signRows.forEach(function (o) {
    var signLabel = o.status === 'SIGNING' ? '待签核：闸口①会签' : '待签核：闸口②会签';
    if (byId[o.id]) {
      byId[o.id].todo = signLabel + '；' + byId[o.id].todo; // 签核优先展示
    } else {
      byId[o.id] = {
        id: o.id, item_type: 'control', item_no: o.order_no, name: o.part_name,
        todo: signLabel, status: o.status, status_cn: CONTROL_STATUS_CN[o.status] || o.status,
        urgent: false, hint: '', updated_at: o.updated_at
      };
    }
  });
  return Object.values(byId);
}

/* ---------------- 项目 ---------------- */
async function collectProjectTodos(u) {
  var pool = D.pool();
  var out = [];
  var [tasks] = await pool.execute(
    "SELECT t.id, t.title, t.status, t.priority, t.planned_date, t.updated_at, p.name AS project_name " +
    "FROM project_tasks t JOIN projects p ON p.id = t.project_id " +
    "WHERE t.assignee_id = ? AND t.status <> 'DONE' " +
    "ORDER BY (t.status = 'OVERDUE') DESC, (t.planned_date IS NULL) ASC, t.planned_date ASC LIMIT 100", [u.id]);
  tasks.forEach(function (t) {
    out.push({
      id: t.id, item_type: 'project', item_no: 'TASK-' + t.id, name: t.title,
      todo: t.status === 'OVERDUE' ? '任务已延期' : (t.status === 'NOT_STARTED' ? '任务待开始' : '任务进行中'),
      status: t.status, status_cn: PROJECT_STATUS_CN[t.status] || t.status,
      urgent: t.status === 'OVERDUE',
      hint: (t.project_name || '') + (t.planned_date ? ' · 计划 ' + String(t.planned_date).slice(0, 10) : ''),
      updated_at: t.updated_at,
      link: '/subsystems/projects/frontend/index.html#/tasks/' + t.id
    });
  });
  var [subs] = await pool.execute(
    "SELECT s.id, s.task_id, s.title, s.status, s.planned_date, s.updated_at, t.title AS task_title " +
    "FROM project_subtasks s JOIN project_tasks t ON t.id = s.task_id " +
    "WHERE s.assignee_id = ? AND s.status <> 'DONE' " +
    "ORDER BY (s.planned_date IS NULL) ASC, s.planned_date ASC LIMIT 100", [u.id]);
  subs.forEach(function (s) {
    out.push({
      id: s.task_id, item_type: 'project', item_no: 'SUB-' + s.id, name: s.title,
      todo: '子任务待处理',
      status: s.status, status_cn: PROJECT_STATUS_CN[s.status] || s.status,
      urgent: false,
      hint: '父任务：' + (s.task_title || ''),
      updated_at: s.updated_at,
      link: '/subsystems/projects/frontend/index.html#/tasks/' + s.task_id
    });
  });
  return out;
}

/* ---------------- 聚合入口 ---------------- */
// 并行聚合四组；单个子系统失败降级为空组 + 日志，不拖垮整体
async function collectMyTodos(u) {
  var defs = [
    { key: 'sample', name: '样品', fn: collectSampleTodos },
    { key: 'fixture', name: '治具', fn: collectFixtureTodos },
    { key: 'control', name: '管制', fn: collectControlTodos },
    { key: 'project', name: '项目任务', fn: collectProjectTodos }
  ];
  var settled = await Promise.all(defs.map(function (d) {
    return d.fn(u).catch(function (e) {
      console.error('[workbench] 我的待办[' + d.key + ']聚合失败:', e.message);
      return [];
    });
  }));
  var groups = [];
  var total = 0;
  defs.forEach(function (d, i) {
    total += settled[i].length;
    groups.push({ key: d.key, name: d.name, items: settled[i] });
  });
  return { groups: groups, total: total };
}

module.exports = { collectMyTodos };
