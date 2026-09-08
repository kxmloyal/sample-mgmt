// subsystems/control/db/dao.js — 管制流程数据访问层（2026-09-08 拆分为薄入口，对外接口不变）
// 按域拆分：dao-orders（主表 CRUD/CAS）+ dao-signs（会签）+ dao-misc（NCR/报工/日志/设置/附件）
// 调用方仍走 db.js scanDao 加载本文件后 D.fnName() 展平调用，函数名与拆分前逐一相同（零调用方改动）
module.exports = function createDao(deps) {
  return Object.assign(
    {},
    require('./dao-orders')(deps),
    require('./dao-signs')(deps),
    require('./dao-misc')(deps)
  );
};
