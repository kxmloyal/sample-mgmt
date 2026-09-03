// subsystems/workbench/db/my-todos.js — 「我的待办」跨子系统聚合（全部实时派生，零落库零迁移）
// 归属口径（用户已确认：角色/部门可处理 + 个人指派合并）：
//   样品 sample：RD=NEW(待制作确认)/RETURNING且retire_assigned_rd=本人(待重做)；QA=PRODUCED(待发行)/RETURNING(待审核退回)；
//     CUSTODY|ME=RELEASED(待接收)；ADMIN=上述角色规则并集；其余角色(如 PM)=无样品待办。
//     非 ADMIN 直接复用 D.listMyPendingSamples(role, userId)（与样品看板同一 DAO，数字互相印证）。
//   治具 fixture：RD/ADMIN=REQUESTED(待接收)/ACCEPTED(制作中)/IMPROVING(改善中)/REPAIRING_RD(RD维修)；
//     ME/ADMIN=REPAIRING_ME(ME维修)/REPAIR_DONE(待确认维修)；
//     申请部门(requested_dept=我部门)=VERIFY_PENDING(待验证，2026-09-03 起单人验证)/TRANSFERRED(可领用)；
//     治具管理方(ME/QA/CUSTODY)=VERIFY_PENDING 同可见（canVerify 口径）；
//     个人=领用逾期归还(used_by=本人且 expected_return_at 到期)/我报修的待确认(repair_requested_by=本人)。
//   管制 control：manifest.stateMachine.transitions 角色匹配(剔除 VOID)=待我流转；
//     control_signs 待签行(decision 空) role 匹配=待我签核；ADMIN 对所有会签中单据可见（与 control 前端 todo.js 一致）。
//   项目 project：project_tasks/project_subtasks assignee_id=本人且 status<>'DONE'（唯一按个人指派的子系统）。
var D = require('../../../db');
var CTL_MANIFEST = require('../../control/manifest.json');

// 状态中文映射（与各子系统权威来源对齐：workbench-queries.js CASE / control manifest.states / projects manifest.states）
var SAMPLE_STATUS_CN = { NEW: '制样中', PRODUCED: '待发行', RELEASED: '保管中', IN_CUSTODY: '保管中', RETURNING: '退回审核中' };
var FIXTURE_STATUS_CN = {
  REQUESTED: '待接收', ACCEPTED: '制作中', VERIFY_PENDING: '待验证', TRANSFERRED: '可领用',
  IN_USE: '领用中', IMPROVING: '改善中', REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '待确认维修'
};
var CONTROL_STATUS_CN = {};
Object.keys(CTL_MANIFEST.stateMachine.states).forEach(function (k) { CONTROL_STATUS_CN[k] = CTL_MANIFEST.stateMachine.states[k].label; });
var PROJECT_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', OVERDUE: '已延期' };

/* ---------------- 样品 ---------------- */
// 待办类型派生（对齐 samples 前端 dashboard-todo.js 的 _getTodoInfo）
function sampleTodoOf(s, u) {
  if (s.status === 'NEW') return { todo: '待制作确认', overdue: false };
  if (s.status === 'PRODUCED') return { todo: '待发行', overdue: false };
  if (s.status === 'RELEASED') return { todo: '待接收', overdue: false };
  if (s.status === 'RETURNING') {
    if (String(s.retire_assigned_rd) === String(u.id)) return { todo: '待重做', overdue: true };
    return { todo: '待审核退回', overdue: u.role === 'QA' || u.role === 'ADMIN' };
  }
  return { todo: '待处理', overdue: false };
}

async function collectSampleTodos(u) {
  var rows;
  if (u.role === 'ADMIN') {
    // ADMIN=各角色规则并集（不用 dao 的全量回退，避免把全部样品当作待办）
    var [r] = await D.pool().execute(
      "SELECT * FROM samples WHERE deleted_at IS NULL AND (status IN ('NEW','PRODUCED','RELEASED','RETURNING')) ORDER BY id DESC LIMIT 100");
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
      overdue: t.overdue, hint: s.spec || '', updated_at: s.updated_at
    };
  });
}

/* ---------------- 治具 ---------------- */
function fixtureTodoOf(f, u) {
  var reasons = [];
  var overdue = false;
  if (['REQUESTED', 'ACCEPTED', 'IMPROVING', 'REPAIRING_RD'].indexOf(f.status) !== -1 && ['RD', 'ADMIN'].indexOf(u.role) !== -1) {
    reasons.push({ REQUESTED: '待接收', ACCEPTED: '制作中', IMPROVING: '改善中', REPAIRING_RD: 'RD维修中' }[f.status]);
  }
  if (['REPAIRING_ME', 'REPAIR_DONE'].indexOf(f.status) !== -1 && ['ME', 'ADMIN'].indexOf(u.role) !== -1) {
    reasons.push(f.status === 'REPAIRING_ME' ? 'ME维修中' : '待确认维修');
  }
  if (f.status === 'VERIFY_PENDING' && (f.requested_dept === u.dept || ['ME', 'QA', 'CUSTODY', 'ADMIN'].indexOf(u.role) !== -1)) {
    reasons.push('待验证');
  }
  if (f.status === 'TRANSFERRED' && f.requested_dept === u.dept) reasons.push('可领用');
  // 个人维度
  if (f.status === 'IN_USE' && String(f.used_by) === String(u.id) && f.expected_return_at && new Date(f.expected_return_at) <= new Date()) {
    reasons.push('归还逾期'); overdue = true;
  }
  if (f.status === 'REPAIR_DONE' && String(f.repair_requested_by) === String(u.id) && reasons.indexOf('待确认维修') === -1) {
    reasons.push('待确认维修');
  }
  if (['IN_USE', 'TRANSFERRED'].indexOf(f.status) !== -1 && f.next_maintenance_at && new Date(f.next_maintenance_at) <= new Date()
      && (String(f.used_by) === String(u.id) || f.requested_dept === u.dept || ['ME', 'ADMIN'].indexOf(u.role) !== -1)) {
    reasons.push('保养到期'); overdue = true;
  }
  if (!reasons.length) return null;
  return { todo: reasons.join('、'), overdue: overdue };
}

async function collectFixtureTodos(u) {
  // 一次取回全部进行中治具（量级小，17~数百条），JS 侧按口径派生，避免超长 OR-SQL
  var [rows] = await D.pool().execute(
    "SELECT id, fixture_no, name, status, requested_dept, used_by, repair_requested_by, expected_return_at, next_maintenance_at, updated_at " +
    "FROM fixtures WHERE status IN ('REQUESTED','ACCEPTED','VERIFY_PENDING','TRANSFERRED','IN_USE','IMPROVING','REPAIRING_ME','REPAIRING_RD','REPAIR_DONE') " +
    "ORDER BY updated_at DESC LIMIT 500");
  var out = [];
  rows.forEach(function (f) {
    var t = fixtureTodoOf(f, u);
    if (!t) return;
    out.push({
      id: f.id, item_type: 'fixture', item_no: f.fixture_no, name: f.name,
      todo: t.todo, status: f.status, status_cn: FIXTURE_STATUS_CN[f.status] || f.status,
      overdue: t.overdue, hint: f.requested_dept || '', updated_at: f.updated_at
    });
  });
  return out;
}

/* ---------------- 管制 ---------------- */
async function collectControlTodos(u) {
  var pool = D.pool();
  var byId = {}; // id → item（合并 待我流转/待我签核 两个来源）

  // 待我流转：transitions 角色匹配（剔除 VOID 作废——破坏性操作不算待办）
  var flowMap = {}; // status → 动作 label
  (CTL_MANIFEST.stateMachine.transitions || []).forEach(function (t) {
    if (t.action === 'VOID') return;
    if (t.role.indexOf(u.role) !== -1 && !flowMap[t.from]) flowMap[t.from] = t.label;
  });
  var statuses = Object.keys(flowMap);
  if (statuses.length) {
    var ph = statuses.map(function () { return '?'; }).join(',');
    var [orders] = await pool.execute(
      "SELECT id, order_no, part_name, status, updated_at FROM control_orders WHERE status IN (" + ph + ") ORDER BY updated_at DESC LIMIT 200",
      statuses);
    orders.forEach(function (o) {
      byId[o.id] = {
        id: o.id, item_type: 'control', item_no: o.order_no, name: o.part_name,
        todo: '待流转：' + flowMap[o.status], status: o.status, status_cn: CONTROL_STATUS_CN[o.status] || o.status,
        overdue: false, hint: '', updated_at: o.updated_at
      };
    });
  }

  // 待我签核：control_signs 待签行 role 匹配；ADMIN 对所有会签中单据可见（对齐 control 前端 todo.js）
  var signRows;
  if (u.role === 'ADMIN') {
    var [r1] = await pool.execute(
      "SELECT DISTINCT o.id, o.order_no, o.part_name, o.status, o.updated_at FROM control_orders o " +
      "WHERE o.status IN ('SIGNING','DISPOSAL_SIGNING') AND EXISTS (" +
      "  SELECT 1 FROM control_signs s WHERE s.order_id = o.id AND (s.decision IS NULL OR s.decision = '')" +
      ") ORDER BY o.updated_at DESC LIMIT 200");
    signRows = r1;
  } else {
    var [r2] = await pool.execute(
      "SELECT DISTINCT o.id, o.order_no, o.part_name, o.status, o.updated_at FROM control_signs s " +
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
        overdue: false, hint: '', updated_at: o.updated_at
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
      overdue: t.status === 'OVERDUE',
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
      overdue: false,
      hint: '父任务：' + (s.task_title || ''),
      updated_at: s.updated_at,
      link: '/subsystems/projects/frontend/index.html#/tasks/' + s.task_id
    });
  });
  return out;
}

/* ---------------- 聚合入口 ---------------- */
// 返回 { groups: [{key,name,items}], total }；单个子系统失败不拖垮整体（降级为空组 + 日志）
async function collectMyTodos(u) {
  var defs = [
    { key: 'sample', name: '样品', fn: collectSampleTodos },
    { key: 'fixture', name: '治具', fn: collectFixtureTodos },
    { key: 'control', name: '管制', fn: collectControlTodos },
    { key: 'project', name: '项目任务', fn: collectProjectTodos }
  ];
  var groups = [];
  var total = 0;
  for (var i = 0; i < defs.length; i++) {
    var items = [];
    try {
      items = await defs[i].fn(u);
    } catch (e) {
      console.error('[workbench] 我的待办[' + defs[i].key + ']聚合失败:', e.message);
    }
    total += items.length;
    groups.push({ key: defs[i].key, name: defs[i].name, items: items });
  }
  return { groups: groups, total: total };
}

module.exports = { collectMyTodos };
