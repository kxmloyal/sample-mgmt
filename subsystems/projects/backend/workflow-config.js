// subsystems/projects/backend/workflow-config.js — 状态机配置读写与伪角色解析
// workflow 表覆盖 manifest 默认（初始值）；保存即生效（Task 4 实现，配置管理 UI 属后续 Task）
// 注意：SYSTEM 伪角色由自动延期流程使用，不经过 resolveRole（人工流转只校验 ASSIGNEE/MEMBER）
const D = require('../../../db');
// 修正：manifest.json 位于本文件上级（backend/ → projects/），计划写 ../../ 为笔误
const DEFAULT = require('../manifest.json').stateMachine;

// 读取最新配置：project_workflow 覆盖 manifest 默认（DB 为空则用默认）
async function loadWorkflow(conn) {
  const rows = await D.fetchAll(conn || null,
    'SELECT cfg_key, cfg_value FROM project_workflow WHERE flow_key=\'task\'');
  const cfg = {
    initial: DEFAULT.initial,
    states: JSON.parse(JSON.stringify(DEFAULT.states)),
    transitions: JSON.parse(JSON.stringify(DEFAULT.transitions))
  };
  for (const r of rows) {
    if (r.cfg_key === 'initial') cfg.initial = r.cfg_value;
    else if (r.cfg_key === 'states') cfg.states = JSON.parse(r.cfg_value);
    else if (r.cfg_key === 'transitions') cfg.transitions = JSON.parse(r.cfg_value);
  }
  return cfg;
}

// 持久化（事务内调用方已加行锁）；ON DUPLICATE KEY UPDATE 幂等覆盖
async function saveWorkflow(conn, cfg, userId) {
  await conn.execute('INSERT INTO project_workflow (flow_key,cfg_key,cfg_value,updated_by) VALUES (\'task\',?,?,?) ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_by=VALUES(updated_by)',
    ['initial', cfg.initial, userId]);
  await conn.execute('INSERT INTO project_workflow (flow_key,cfg_key,cfg_value,updated_by) VALUES (\'task\',?,?,?) ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_by=VALUES(updated_by)',
    ['states', JSON.stringify(cfg.states), userId]);
  await conn.execute('INSERT INTO project_workflow (flow_key,cfg_key,cfg_value,updated_by) VALUES (\'task\',?,?,?) ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_by=VALUES(updated_by)',
    ['transitions', JSON.stringify(cfg.transitions), userId]);
}

// 伪角色解析：role 数组含 ASSIGNEE（assignee_id===uid）/ MEMBER（uid∈项目成员）即通过
async function resolveRole(conn, roleList, u, task) {
  if (roleList.includes(u.role)) return true;
  if (roleList.includes('ASSIGNEE') && task.assignee_id === u.id) return true;
  if (roleList.includes('MEMBER')) {
    const row = await D.fetchOne(conn, 'SELECT 1 AS x FROM project_members WHERE project_id=? AND user_id=?', [task.project_id, u.id]);
    if (row) return true;
  }
  return false;
}

module.exports = { loadWorkflow, saveWorkflow, resolveRole };
