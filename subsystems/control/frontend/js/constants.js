// subsystems/control/frontend/js/constants.js — 管制流程管理子系统前端常量
// 来源：manifest.json（状态/动作中文）、后端 ACTION_LOG、设计规格。ROLE/STATUS/$/api 等由 shared/api-base.js 提供。

// 状态 → 中文（取自 manifest.stateMachine.states.label）
var CONTROL_STATUS_CN = {
  DRAFT: '申请草稿', SIGNING: '管制会签中', LABELED: '已贴管制标签',
  CONTROL_STORED: '已入管制仓', NCR_DONE: '不良品委托单已开',
  DISPOSAL_SIGNING: '处理方式会签中', REWORK_OPENED: '重工工单已开',
  REWORKING: '重工执行中', REWORK_REPORTED: '已报工', REIN_STOCK: '已入库',
  SHIPPED: '已出货', RETIRED: '已作废'
};

// 流转/留痕动作 → 中文（与后端 ACTION_LOG 对齐，新增补充 CREATE/EDIT/NCR/REWORK_LOG 及会签动作）
var CONTROL_ACTION_CN = {
  CREATE: '新建管制申请', EDIT: '编辑草稿', SUBMIT: '提交会签',
  SIGN_OK: '闸口①会签通过/贴标', STORE: '入管制仓', CREATE_NCR: '开不良品委托单',
  DISPATCH: '发起处理方式会签', DISPOSAL_OK: '闸口②会签通过', START: '生产确认开工',
  REPORT: '报工', IN_STOCK: '入库', SHIP: '出货',
  SIGN_REJECT: '闸口①会签退回', DISPOSAL_REJECT: '闸口②会签退回',
  VOID: '作废', NCR: '追加不良品委托单', REWORK_LOG: '报工',
  SIGN_AGREE: '会签同意', SIGN_REJECT2: '会签退回', SIGN_SKIP: '会签强制跳过'
};

// 不良类型（新建时下拉）
var CONTROL_BAD_TYPES = ['外观不良', '功能不良', '尺寸不良', '性能不良', '包装不良', '其它'];

// 申请部门（新建时下拉，缺省覆盖常见单位）
var CONTROL_DEPTS = ['品保文管中心', '研发部', '生管', '仓库', '制造部', 'FQC', '生技部'];

// 状态流转规则（前端动作按钮过滤：与 manifest.stateMachine.transitions 保持一致；VOID 作废仅 ADMIN，由详情页单独处理）
// 2026-09-04 会签退回闭环（方案A）：剔除 SIGN_REJECT/DISPOSAL_REJECT 两条旁路退回边——
// 退回唯一入口 = 「去会签」弹窗选「退回」（意见必填，签字人留痕）；重提时后端清旧签字行重建模板。
// manifest 保留两条退回边仅作 API 兼容，transition 接口已显式拒绝这两个 action。
var CONTROL_TRANSITIONS = [
  { from: 'DRAFT', to: 'SIGNING', action: 'SUBMIT', role: ['CUSTODY', 'ME', 'QA'], label: '提交会签' },
  { from: 'SIGNING', to: 'LABELED', action: 'SIGN_OK', role: ['QA'], label: '闸口①会签通过/贴标' },
  { from: 'LABELED', to: 'CONTROL_STORED', action: 'STORE', role: ['CUSTODY'], label: '入管制仓' },
  { from: 'CONTROL_STORED', to: 'NCR_DONE', action: 'CREATE_NCR', role: ['QA'], label: '开不良品委托单' },
  { from: 'NCR_DONE', to: 'DISPOSAL_SIGNING', action: 'DISPATCH', role: ['QA'], label: '发起处理方式会签' },
  { from: 'DISPOSAL_SIGNING', to: 'REWORK_OPENED', action: 'DISPOSAL_OK', role: ['QA', 'RD'], label: '闸口②会签通过' },
  { from: 'REWORK_OPENED', to: 'REWORKING', action: 'START', role: ['ME'], label: '生产确认开工' },
  { from: 'REWORKING', to: 'REWORK_REPORTED', action: 'REPORT', role: ['CUSTODY', 'ME'], label: '报工' },
  { from: 'REWORK_REPORTED', to: 'REIN_STOCK', action: 'IN_STOCK', role: ['CUSTODY', 'ME'], label: '入库' },
  { from: 'REIN_STOCK', to: 'SHIPPED', action: 'SHIP', role: ['CUSTODY', 'ME'], label: '出货' }
];

// 按当前状态 + 角色返回可执行的流转按钮列表（不含 VOID 作废）
function controlTransitionsOf(status, role) {
  return CONTROL_TRANSITIONS.filter(function (t) {
    return t.from === status && t.role.indexOf(role) > -1;
  });
}
