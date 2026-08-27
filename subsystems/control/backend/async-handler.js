// subsystems/control/backend/async-handler.js — Express 4 async 路由异常兜底
// Express 4 不捕获 async rejection；统一包装为 next(err)，由 server.js 全局错误中间件返回 500 JSON
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
module.exports = { asyncHandler };
