// routes/subsystems.js — 子系统注册与管理 API
const fs = require('fs');
const path = require('path');

/** 全局子系统注册表：{ id: manifest } */
var registry = {};

/**
 * 扫描 subsystems/ 目录，加载所有 manifest.json
 * @param {string} subsystemsDir - subsystems 目录绝对路径（可选）
 * @returns {object} { id: manifest }
 */
function scanSubsystems(subsystemsDir) {
  var dir = subsystemsDir || path.join(__dirname, '..', 'subsystems');
  var result = {};
  if (!fs.existsSync(dir)) return result;
  var entries = fs.readdirSync(dir, { withFileTypes: true });
  entries.forEach(function (entry) {
    if (!entry.isDirectory()) return;
    var manifestPath = path.join(dir, entry.name, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      try {
        var manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (manifest.id && manifest.id === entry.name) {
          result[manifest.id] = manifest;
        }
      } catch (e) {
        console.error('[子系统] 无法解析 manifest: ' + manifestPath, e.message);
      }
    }
  });
  return result;
}

function register(app) {
  // 初始化：扫描 subsystems/ 目录加载所有 manifest.json
  Object.assign(registry, scanSubsystems());
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 获取所有子系统（门户渲染用）— 每次请求实时扫描，确保 server.js 后加载的子系统也能被发现
  app.get('/api/subsystems', function (req, res) {
    // 每次请求以磁盘为准重建 registry（PUT 已同步写磁盘，不会丢数据）
    registry = scanSubsystems();
    var list = Object.values(registry).map(function (m) {
      return {
        id: m.id, name: m.name, description: m.description,
        icon: m.icon, version: m.version,
        route: m.route,
        stateCount: m.stateMachine ? Object.keys(m.stateMachine.states).length : 0,
        navCount: m.navigation ? m.navigation.length : 0
      };
    });
    res.json(list);
  });

  // 获取单个子系统 manifest
  app.get('/api/subsystems/:id', function (req, res) {
    var m = registry[req.params.id];
    if (!m) return res.status(404).json({ error: '子系统不存在' });
    res.json(m);
  });

  // 更新 manifest（ADMIN 专属）
  app.put('/api/subsystems/:id/manifest', requireAuth, async function (req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可操作' });
    var id = req.params.id;
    var subsystemDir = path.join(__dirname, '..', 'subsystems', id);
    if (!fs.existsSync(subsystemDir)) return res.status(404).json({ error: '子系统不存在' });
    try {
      var newManifest = req.body;
      if (!newManifest.id || newManifest.id !== id) return res.status(400).json({ error: 'manifest.id 必须与路径一致' });
      fs.writeFileSync(path.join(subsystemDir, 'manifest.json'), JSON.stringify(newManifest, null, 2), 'utf8');
      registry[id] = newManifest;
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: '更新失败: ' + e.message });
    }
  });

  // ★ 创建新子系统（ADMIN 专属）— 生成目录骨架 + manifest.json + 模板文件
  app.post('/api/subsystems', requireAuth, async function (req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可操作' });
    var { id, name, description, icon, version, route, roles, navigation, stateMachine, files } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: 'id 和 name 必填' });
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return res.status(400).json({ error: 'id 必须是字母开头的小写 kebab-case' });
    var subsystemDir = path.join(__dirname, '..', 'subsystems', id);
    if (fs.existsSync(subsystemDir)) return res.status(409).json({ error: '子系统 ' + id + ' 已存在' });
    try {
      // 创建目录
      ['backend', 'db', 'frontend/js/views', 'frontend/css', 'seed'].forEach(function(d) {
        fs.mkdirSync(path.join(subsystemDir, d), { recursive: true });
      });
      // 写入 manifest.json
      var manifest = JSON.stringify({
        id: id, name: name, description: description || '', version: version || '1.0.0',
        icon: icon || '_default',
        route: route || { prefix: '/api/' + id, entry: '/subsystems/' + id + '/frontend/index.html', hashBase: '/' + id },
        database: { tables: [] },
        roles: roles || { use: ['ADMIN'] },
        navigation: navigation || [{ key: 'home', label: '首页', icon: 'chart', view: 'renderHome', roles: ['ADMIN'] }],
        stateMachine: stateMachine || null,
        files: files || null
      }, null, 2);
      fs.writeFileSync(path.join(subsystemDir, 'manifest.json'), manifest, 'utf8');
      // 写入模板文件
      fs.writeFileSync(path.join(subsystemDir, 'backend', 'index.js'),
        '// subsystems/' + id + '/backend/index.js\n' +
        'function register(app) {\n  var requireAuth = app.locals.requireAuth;\n' +
        '  app.get(\'/api/' + id + '/ping\', requireAuth, function(req, res) {\n' +
        '    res.json({ msg: \'pong\', module: \'' + id + '\' });\n  });\n}\n' +
        'async function initDB() { return true; }\n' +
        'async function seed() { return true; }\n' +
        'module.exports = { register, initDB, seed };\n');
      fs.writeFileSync(path.join(subsystemDir, 'db', 'schema.sql'),
        '-- subsystems/' + id + '/db/schema.sql\n-- 建表 DDL（使用 CREATE TABLE IF NOT EXISTS）\n');
      fs.writeFileSync(path.join(subsystemDir, 'frontend', 'index.html'),
        '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width,initial-scale=1.0" />' +
        '<link rel="stylesheet" href="/css/app.css" /><title>' + name + '</title></head><body>' +
        '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:var(--bg)">' +
        '<div style="background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:var(--shadow)">' +
        '<h1>' + name + '</h1><p style="color:var(--muted)">子系统已就绪</p>' +
        '<a href="/portal.html">← 返回门户</a></div></div></body></html>');
      fs.writeFileSync(path.join(subsystemDir, 'frontend', 'css', 'module.css'),
        '/* subsystems/' + id + '/frontend/css/module.css — 子系统专属样式 */\n');
      fs.writeFileSync(path.join(subsystemDir, 'seed', 'seed.js'),
        '// subsystems/' + id + '/seed/seed.js\nmodule.exports = async function seed(pool) { /* TODO */ };\n');
      // 更新 registry
      var newManifest = JSON.parse(manifest);
      registry[id] = newManifest;
      res.status(201).json({ ok: true, id: id });
    } catch (e) {
      res.status(500).json({ error: '创建失败: ' + e.message });
    }
  });

  // ★ 导出 manifest.json（ADMIN 专属）
  app.get('/api/subsystems/:id/export', requireAuth, async function (req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可操作' });
    var id = req.params.id;
    var manifestPath = path.join(__dirname, '..', 'subsystems', id, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return res.status(404).json({ error: 'manifest 不存在' });
    res.download(manifestPath, id + '-manifest.json');
  });
}

module.exports = { register, scanSubsystems, registry };
