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
  // 2026-08-07 角色过滤：已登录用户仅返回 manifest.roles.use 中允许其角色进入的子系统（projects 未完成仅 ADMIN 可见）；
  // 未登录返回空数组（不向匿名访问暴露子系统清单）
  app.get('/api/subsystems', async function (req, res) {
    // 每次请求以磁盘为准重建 registry（PUT 已同步写磁盘，不会丢数据）
    registry = scanSubsystems();
    var u = await currentUser(req);
    if (!u) return res.json([]);
    var list = Object.values(registry).filter(function (m) {
      var use = m.roles && m.roles.use;
      if (!use || !use.length) return true; // 未声明 roles.use 视为所有人可见
      return use.indexOf(u.role) !== -1;
    });
    res.json(list.map(function (m) {
      return {
        id: m.id, name: m.name, description: m.description,
        icon: m.icon, version: m.version,
        deployed: m.deployed === true,
        route: m.route,
        stateCount: m.stateMachine ? Object.keys(m.stateMachine.states).length : 0,
        navCount: m.navigation ? m.navigation.length : 0
      };
    }));
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

  // ★ 上线开关（ADMIN 专属）：仅更新 manifest.deployed，不动其余字段
  // 切换语义：deployed=true 进入 AGENTS.md §20 上线保护（seed/jest 护栏生效）；false 解除保护允许注入测试数据
  app.put('/api/subsystems/:id/deployed', requireAuth, async function (req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可操作' });
    var id = req.params.id;
    var manifestPath = path.join(__dirname, '..', 'subsystems', id, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return res.status(404).json({ error: '子系统不存在' });
    var deployed = req.body.deployed === true || req.body.deployed === 'true';
    try {
      var m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.deployed = deployed;
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');
      registry[id] = m;
      res.json({ ok: true, id: id, deployed: deployed });
    } catch (e) {
      res.status(500).json({ error: '更新失败: ' + e.message });
    }
  });

  // ★ 创建新子系统（ADMIN 专属）— 调共用模板生成完整骨架 + 面板自定义覆盖
  app.post('/api/subsystems', requireAuth, async function (req, res) {
    var u = await currentUser(req);
    if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可操作' });
    var { id, name, description, icon, version, route, roles, navigation, stateMachine, files } = req.body || {};
    if (!id || !name) return res.status(400).json({ error: 'id 和 name 必填' });
    if (!/^[a-z][a-z0-9-]*$/.test(id)) return res.status(400).json({ error: 'id 必须是字母开头的小写 kebab-case' });
    var subsystemDir = path.join(__dirname, '..', 'subsystems', id);
    if (fs.existsSync(subsystemDir)) return res.status(409).json({ error: '子系统 ' + id + ' 已存在' });
    try {
      const { generateSubsystem } = require('../tools/subsystem-templates');
      // 组装 ctx：显式传入面板字段，缺失用模板默认
      var ctx = {
        id: id, name: name, description: description || '',
        icon: icon || 'chart', version: version || '1.0.0',
        withStateMachine: !!stateMachine,
        states: stateMachine && stateMachine.states ? Object.keys(stateMachine.states) : [],
        withFiles: !!files,
        roles: roles
      };
      var out = generateSubsystem(ctx);
      // 创建目录 + 写入全部模板文件
      Object.keys(out.files).forEach(function (rel) {
        var fp = path.join(subsystemDir, rel);
        fs.mkdirSync(path.dirname(fp), { recursive: true });
        fs.writeFileSync(fp, out.files[rel], 'utf8');
      });
      // 面板自定义 manifest 覆盖（route/roles/navigation/stateMachine/files 以面板提交为准）
      if (route || roles || navigation || stateMachine || files) {
        var manifestPath = path.join(subsystemDir, 'manifest.json');
        var m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        if (route) m.route = route;
        if (roles) m.roles = roles;
        if (navigation) m.navigation = navigation;
        if (stateMachine) m.stateMachine = stateMachine;
        if (files) m.files = files;
        fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');
      }
      // 更新 registry
      var newManifest = JSON.parse(fs.readFileSync(path.join(subsystemDir, 'manifest.json'), 'utf8'));
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
