// subsystems/control/frontend/js/views/ncr-form.js — NCR 详细内容：流转需填字段 + 必填校验（纯逻辑，供 detail.js 引用）
// 拆分目的：detail.js 已 287 行超 70% 红线(280)，将「流转额外字段定义 + DISPATCH 必填校验」抽离至此。
// 约定：detail.js 的 _ctlUtil.fieldHtml 会按 f.type 渲染 textarea；_ctlSubmit 提交前调 ncrRequiredCheck。

// 需要额外字段输入的流转 action（其余流转仅确认即提交）
// 变更：START 不再收集 rework_sop（已在 DISPATCH 会签时登记）；新增 DISPATCH 收集重工/全检标准
var _CTL_TRANS_FIELDS = {
  STORE: [{ k: 'storage_location', label: '管制仓储位' }],
  CREATE_NCR: [{ k: 'ncr_no', label: '不良品委托单号' }],
  DISPOSAL_OK: [{ k: 'disposal_opinion', label: '处理方式结论' }],
  START: [{ k: 'rework_no', label: '重工工单号' }],
  DISPATCH: [
    { k: 'rework_sop', label: '重工 SOP', type: 'textarea', required: true },
    { k: 'rework_guide', label: '现场指导' },
    { k: 'rework_other', label: '其他标准文件' },
    { k: 'pack_sop', label: '包装SOP编号' }
  ]
};

/**
 * 处理方式会签(DISPATCH)必填校验：SOP 必填 + 现场指导/其他标准文件至少一项。
 * 与后端 routes-orders.js §8.3 校验口径一致。
 * @param {string} action 流转 action
 * @param {Object} body 已收集的字段对象
 * @returns {string} 错误文案（合法返回空串）
 */
function ncrRequiredCheck(action, body) {
  if (action !== 'DISPATCH') return '';
  var sop = (body.rework_sop || '').trim();
  var guide = (body.rework_guide || '').trim();
  var other = (body.rework_other || '').trim();
  if (!sop) return '处理方式会签前必须填写重工/全检标准：重工SOP';
  if (!guide && !other) return '处理方式会签前必须填写重工/全检标准：现场指导或标准文件至少填一项';
  return '';
}
