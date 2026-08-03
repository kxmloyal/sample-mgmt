// subsystems/new-module/backend/index.js — 最小插件实现
function register(app) {
  var requireAuth = app.locals.requireAuth;
  app.get('/api/new-module/ping', requireAuth, function(req, res) {
    res.json({ msg: 'pong', module: 'new-module', time: new Date().toISOString() });
  });
}

async function initDB() {
  return true;
}

async function seed() {
  return true;
}

module.exports = { register, initDB, seed };
