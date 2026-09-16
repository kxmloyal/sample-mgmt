// inspect-state-cn.js — 样品复检状态中文（CSV 导出口径唯一落点，与前端 list-inspect.js 展示口径同源）
// 2026-09-16 自 backend/routes-samples.js 外迁（容量合规：该文件 89.2% 已逼近红线，只允许精简/重构），
//   同时补齐「不适用」判定——此前已作废/退回审核中/未发行的样品在导出里仍显示「正常」，与页面判定不一致。
// 口径（对应设计文档 §6.2）：不适用 → 「不适用」；领用中 → 「领用中·暂停复检」；其余照旧 正常/近7天到期/逾期N天/—。

const INSPECT_SOON_DAYS = 7;

// 不适用集合：状态层面不存在复检语义（未发行 / 退回审核中 / 已作废）
const INSPECT_NA_STATUSES = ['RETURNING', 'RETIRED', 'NEW', 'PRODUCED'];

// 灰化集合：前端灰字展示（此处保留三态文字，仅供调用方判断；导出列本身不区分颜色）
const INSPECT_GREY_STATUSES = ['RELEASED', 'CHECKED_OUT'];

/** 复检状态中文文案
 * @param {object} row 样品行（需 status、next_inspect_at；其余字段不参与判定）
 * @returns {string} '不适用' | '领用中·暂停复检' | '正常' | '近7天到期' | '逾期N天' | '—' */
function inspectStateCn(row) {
  if (!row) return '—';
  if (row.status && INSPECT_NA_STATUSES.indexOf(row.status) >= 0) return '不适用';
  if (row.status === 'CHECKED_OUT') return '领用中·暂停复检';
  if (!row.next_inspect_at) return '—';
  const t = new Date(row.next_inspect_at).getTime();
  if (t < Date.now()) return '逾期' + Math.ceil((Date.now() - t) / 86400000) + '天';
  if (t <= Date.now() + INSPECT_SOON_DAYS * 86400000) return '近7天到期';
  return '正常';
}

module.exports = { inspectStateCn, INSPECT_SOON_DAYS, INSPECT_NA_STATUSES, INSPECT_GREY_STATUSES };
