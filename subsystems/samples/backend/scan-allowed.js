// subsystems/samples/backend/scan-allowed.js — 扫码动作可用集与状态标签（2026-09-16 自 routes-scan.js 外迁）
// 外迁原因：批量领用/归还通道（batch-scan.js）必须与单件扫码台用**同一份**动作口径，
// 复制粘贴会立刻产生漂移（§15 禁止复制粘贴）；同时降低 routes-scan.js 容量。
// manifest 为转移/角色的唯一真相源（§17 协议，T16）；此处仅叠加两项 manifest 无法表达的动态业务门：
//   INSPECT_CUSTODY 临期窗口（距复检日 ≤ INSPECT_EARLY_DAYS 天）、RECREATE 指派到人（retire_assigned_rd 比对）
// 领用/归还（2026-09-05）：CHECKOUT/RETURN_OUT 纯 manifest 声明（IN_CUSTODY→CHECKED_OUT→IN_CUSTODY），无需动态门；
// 领用中样品天然无法申请退回（RETURN_REQUEST 仅从 IN_CUSTODY 出发），归还后方可走退回链路。
const { createStateMachine } = require('../../../shared/state-machine');
const manifest = require('../manifest.json');
const SM = createStateMachine(manifest.stateMachine);

// 保管中复检开放窗口口径：距下次复检日 ≤ 7 天（含已逾期）时，QA 扫 IN_CUSTODY 样品出现 INSPECT_CUSTODY 动作
var INSPECT_EARLY_DAYS = 7;

const STATUS_LABEL = {
  NEW: '新建(待制作确认)', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', CHECKED_OUT: '领用中', RETURNING: '退回审核中', RETIRED: '已作废'
};

function allowedActions(role, status, next_inspect_at, retire_assigned_rd, currentUserId) {
  return SM.getAllowedActions(role, status).map(function (t) { return t.action; }).filter(function (a) {
    if (a === 'INSPECT_CUSTODY')
      return next_inspect_at && new Date(next_inspect_at).getTime() - Date.now() <= INSPECT_EARLY_DAYS * 86400000;
    if (a === 'RECREATE') return String(retire_assigned_rd) === String(currentUserId);
    return true;
  });
}

module.exports = { allowedActions, STATUS_LABEL, INSPECT_EARLY_DAYS };
