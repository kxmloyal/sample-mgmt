// subsystems/control/backend/routes-orders.js — 管制单路由薄入口（2026-09-08 按域拆分）
// routes-orders-crud：列表/日志/导出/统计/详情/新建/编辑；routes-orders-flow：流转/会签/报工/作废
// 拆分原因：原单文件 384 行/25k 字符超 §7.1 任意源码 20k 兜底红线；本文件保持 register 聚合签名
function register(app) {
  require('./routes-orders-crud').register(app);
  require('./routes-orders-flow').register(app);
}

module.exports = { register };
