// tools/subsystem-templates.js — 子系统骨架模板（CLI 与面板共用，唯一事实来源）
// 用法: const { generateSubsystem } = require('./subsystem-templates');

function tplManifest(ctx) {
  var sm = '';
  if (ctx.withStateMachine && ctx.states && ctx.states.length) {
    var stateDefs = ctx.states.map(function (s) {
      return '"' + s + '": { "label": "' + s + '", "color": "#1d4ed8", "bg": "#eff6ff" }';
    }).join(',\n      ');
    sm = ',\n  "stateMachine": {\n    "initial": "' + ctx.states[0] + '",\n    "states": {\n      ' + stateDefs + '\n    },\n    "transitions": []\n  }';
  }
  var fl = '';
  if (ctx.withFiles) {
    fl = ',\n  "files": {\n    "enabled": true,\n    "uploadDir": "uploads/' + ctx.id + '",\n    "categories": [\n      { "key": "photo", "label": "实物照片", "extensions": ["jpg", "png", "webp"] },\n      { "key": "document", "label": "文档资料", "extensions": ["pdf", "doc", "docx"] }\n    ]\n  }';
  }
  var roles = ctx.roles && ctx.roles.use ? ctx.roles.use : ['ADMIN', 'RD', 'QA', 'CUSTODY', 'ME'];
  var roleStr = roles.map(function (r) { return '"' + r + '"'; }).join(',');
  return '{\n  "id": "' + ctx.id + '",\n  "name": "' + ctx.name + '",\n  "description": "' + (ctx.description || '') + '",\n  "version": "' + (ctx.version || '1.0.0') + '",\n  "icon": "' + (ctx.icon || 'chart') + '",\n  "route": {\n    "prefix": "/api/' + ctx.id + '",\n    "entry": "/subsystems/' + ctx.id + '/frontend/index.html",\n    "hashBase": "/' + ctx.id + '"\n  },\n  "database": {\n    "tables": [\n      { "name": "' + ctx.id + '_items", "schema": "db/schema.sql" },\n      { "name": "' + ctx.id + '_logs", "schema": "db/schema.sql" }\n    ]\n  },\n  "roles": {\n    "use": [' + roleStr + ']\n  },\n  "navigation": [\n    { "key": "dashboard", "label": "' + ctx.name + '看板", "icon": "chart", "view": "viewDashboard", "roles": [' + roleStr + '] },\n    { "key": "list", "label": "' + ctx.name + '列表", "icon": "list", "view": "viewList", "roles": [' + roleStr + '] }\n  ]' + sm + fl + '\n}';
}

function tplBackendIndex(ctx) {
  return '// subsystems/' + ctx.id + '/backend/index.js — ' + ctx.name + '后端入口\n' +
    '// 插件协议标准接口：register / initDB / seed\n' +
    '\n' +
    'function register(app) {\n' +
    '  const requireAuth = app.locals.requireAuth;\n' +
    '  const db = require(\'../../../db\');\n' +
    '\n' +
    '  // 健康检查（示例）\n' +
    '  app.get(\'/api/' + ctx.id + '/ping\', requireAuth, function (req, res) {\n' +
    '    res.json({ msg: \'pong\', module: \'' + ctx.id + '\' });\n' +
    '  });\n' +
    '\n' +
    '  // 列表查询（示例）\n' +
    '  app.get(\'/api/' + ctx.id + '/list\', requireAuth, async function (req, res) {\n' +
    '    try {\n' +
    '      const pool = db.pool();\n' +
    '      const [rows] = await pool.query(\'SELECT * FROM ' + ctx.id + '_items ORDER BY id DESC LIMIT 50\');\n' +
    '      res.json(rows);\n' +
    '    } catch (e) {\n' +
    '      res.status(500).json({ error: e.message });\n' +
    '    }\n' +
    '  });\n' +
    '}\n' +
    '\n' +
    '// 建表由 db.js 自动执行 subsystems/' + ctx.id + '/db/schema.sql，此处保留协议接口\n' +
    'async function initDB() { return true; }\n' +
    '\n' +
    'async function seed() {\n' +
    '  const seedFn = require(\'../seed/seed\');\n' +
    '  const { pool } = require(\'../../../db\');\n' +
    '  await seedFn(pool());\n' +
    '}\n' +
    '\n' +
    'module.exports = { register, initDB, seed };\n';
}

function tplSchemaSQL(ctx) {
  return '-- subsystems/' + ctx.id + '/db/schema.sql — ' + ctx.name + '示例建表（幂等）\n' +
    'CREATE TABLE IF NOT EXISTS ' + ctx.id + '_items (\n' +
    '  id INT AUTO_INCREMENT PRIMARY KEY,\n' +
    '  item_no VARCHAR(32) NOT NULL UNIQUE COMMENT \'编号\',\n' +
    '  name VARCHAR(100) NOT NULL COMMENT \'名称\',\n' +
    '  status VARCHAR(32) NOT NULL DEFAULT \'NEW\' COMMENT \'状态\',\n' +
    '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n' +
    '  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,\n' +
    '  INDEX idx_' + ctx.id + '_status (status)\n' +
    ') COMMENT=\'' + ctx.name + '主表\';\n' +
    '\n' +
    'CREATE TABLE IF NOT EXISTS ' + ctx.id + '_logs (\n' +
    '  id INT AUTO_INCREMENT PRIMARY KEY,\n' +
    '  item_id INT NOT NULL COMMENT \'主表ID\',\n' +
    '  action VARCHAR(32) NOT NULL COMMENT \'操作\',\n' +
    '  role VARCHAR(16) COMMENT \'角色\',\n' +
    '  user_id INT COMMENT \'用户ID\',\n' +
    '  dept VARCHAR(50) COMMENT \'部门\',\n' +
    '  note VARCHAR(255) COMMENT \'备注\',\n' +
    '  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,\n' +
    '  INDEX idx_' + ctx.id + '_logs_item (item_id)\n' +
    ') COMMENT=\'' + ctx.name + '操作日志\';\n';
}

function tplFrontendIndex(ctx) {
  return '<!DOCTYPE html>\n' +
    '<html lang="zh-CN">\n' +
    '<head>\n' +
    '<meta charset="UTF-8" />\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />\n' +
    '<title>制造品质管理系统 - ' + ctx.name + '</title>\n' +
    '<link rel="stylesheet" href="/css/app.css" />\n' +
    '<link rel="stylesheet" href="/subsystems/' + ctx.id + '/frontend/css/module.css" />\n' +
    '<script type="module" src="/vendor/fluentui-web-components.js"></script>\n' +
    '</head>\n' +
    '<body>\n' +
    '<fluent-provider id="provider" style="background:var(--bg);color:var(--text)">\n' +
    '<div id="login" style="display:none">\n' +
    '  <div class="login-card">\n' +
    '    <h1>制造品质管理系统</h1>\n' +
    '    <p class="sub">' + ctx.name + '</p>\n' +
    '    <label>账号</label>\n' +
    '    <fluent-text-field id="lg-user" placeholder="如 admin / rd01" appearance="outline"></fluent-text-field>\n' +
    '    <label>密码</label>\n' +
    '    <fluent-text-field id="lg-pass" type="password" placeholder="密码" appearance="outline" onkeydown="if(event.key===\'Enter\')doLogin()"></fluent-text-field>\n' +
    '    <fluent-button appearance="accent" style="width:100%;margin-top:18px" onclick="doLogin()">登录</fluent-button>\n' +
    '    <div class="login-err" id="lg-err"></div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div id="app" style="display:none">\n' +
    '  <div class="side">\n' +
    '    <div class="logo">' + ctx.name + '</div>\n' +
    '    <div class="nav" id="nav"></div>\n' +
    '    <div class="me">\n' +
    '      <div><b id="me-name"></b></div>\n' +
    '      <div id="me-role" class="muted"></div>\n' +
    '      <div class="me-actions">\n' +
    '        <a class="btn sm" href="/portal.html">← 返回门户</a>\n' +
    '        <button class="me-link" onclick="doLogout()">退出登录</button>\n' +
    '      </div>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '  <div class="main">\n' +
    '    <div class="topbar"><h2 id="page-title"></h2><div id="page-actions"></div></div>\n' +
    '    <div id="view"></div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '</fluent-provider>\n' +
    '<div class="toast" id="toast"></div>\n' +
    '<script src="/subsystems/' + ctx.id + '/frontend/js/bundle.js" defer></script>\n' +
    '</body>\n' +
    '</html>';
}

function tplRouterJS(ctx) {
  return '// router.js — ' + ctx.name + '导航与哈希路由\n' +
    'const NAV=[\n' +
    '  {k:\'dashboard\',t:\'' + ctx.name + '看板\',roles:[\'ADMIN\',\'RD\',\'QA\',\'CUSTODY\',\'ME\']},\n' +
    '  {k:\'list\',t:\'' + ctx.name + '列表\',roles:[\'ADMIN\',\'RD\',\'QA\',\'CUSTODY\',\'ME\']},\n' +
    '];\n' +
    'function buildNav(){\n' +
    '  const nav=$(\'#nav\'); nav.innerHTML=\'\';\n' +
    '  NAV.filter(n=>n.roles.includes(me.role)).forEach(n=>{\n' +
    '    const b=el(\'button\',null,n.t); b.onclick=()=>{location.hash=\'#/\'+n.k;}; b.dataset.k=n.k; nav.appendChild(b);\n' +
    '  });\n' +
    '}\n' +
    'function setActive(k){ document.querySelectorAll(\'#nav button\').forEach(b=>b.classList.toggle(\'active\',b.dataset.k===k)); }\n' +
    '\n' +
    'const VIEWS={dashboard:viewDashboard,list:viewList};\n' +
    'function route(){\n' +
    '  const k=(location.hash.replace(\'#/\',\'\').split(\'?\')[0]||\'dashboard\');\n' +
    '  const v=VIEWS[k]||viewDashboard; setActive(k);\n' +
    '  $(\'#page-title\').textContent=(k===\'dashboard\'?\'' + ctx.name + '看板\':\'' + ctx.name + '列表\');\n' +
    '  $(\'#page-actions\').innerHTML=\'\';\n' +
    '  v();\n' +
    '}\n' +
    '\n' +
    '// 供 bundle 末尾 boot() 调用（api-base.js 定义）\n' +
    'function showApp(){\n' +
    '  $(\'#me-name\').textContent=me.display_name||me.username;\n' +
    '  $(\'#me-role\').textContent=ROLE[me.role]||me.role;\n' +
    '  document.getElementById(\'app\').style.display=\'block\';\n' +
    '  buildNav(); route();\n' +
    '}\n';
}

function tplViewDashboard(ctx) {
  return '// views/dashboard.js — ' + ctx.name + '看板\n' +
    'function viewDashboard(){\n' +
    '  $(\'#view\').innerHTML=\`<div class="kb-grid">\n' +
    '  <fluent-card class="kb-stat" style="--stat-color:var(--brand)">\n' +
    '    <div class="n">—</div><div class="l">示例统计</div>\n' +
    '  </fluent-card>\n' +
    '</div>\n' +
    '<div class="card" style="margin-top:16px;padding:24px">\n' +
    '  <h3>' + ctx.name + '</h3>\n' +
    '  <p style="color:var(--muted)">子系统骨架已生成。编辑 frontend/js/views/dashboard.js 开始开发。</p>\n' +
    '</div>\`;\n' +
    '}\n';
}

function tplViewList(ctx) {
  return '// views/list.js — ' + ctx.name + '列表\n' +
    'async function viewList(){\n' +
    '  $(\'#view\').innerHTML=\'<div class="card"><div style="padding:24px;color:var(--muted)">加载中…</div></div>\';\n' +
    '  try {\n' +
    '    const rows=await api(\'GET\',\'/api/' + ctx.id + '/list\');\n' +
    '    if(!rows.length){ $(\'#view\').innerHTML=\'<div class="card"><div style="padding:24px;color:var(--muted)">暂无数据，运行 seed 填充示例数据</div></div>\'; return; }\n' +
    '    $(\'#view\').innerHTML=\'<div class="card"><table style="width:100%;border-collapse:collapse"><thead><tr>' +
    '<th style="text-align:left;padding:8px">编号</th><th style="text-align:left;padding:8px">名称</th>' +
    '<th style="text-align:left;padding:8px">状态</th></tr></thead><tbody>\'+\n' +
    '      rows.map(r=>\'<tr><td style="padding:8px;border-top:1px solid var(--line)">\'+r.item_no+\'</td>' +
    '<td style="padding:8px;border-top:1px solid var(--line)">\'+r.name+\'</td>' +
    '<td style="padding:8px;border-top:1px solid var(--line)">\'+(r.status||\'\')+\'</td></tr>\').join(\'\')+\n' +
    '      \'</tbody></table></div>\';\n' +
    '  } catch(e){ showToast(e.message,\'err\'); }\n' +
    '}\n';
}

function tplModuleCSS(ctx) {
  return '/* subsystems/' + ctx.id + '/frontend/css/module.css — ' + ctx.name + '专属样式 */\n' +
    '/* 子系统专属样式写入此文件，禁止修改 app.css 共享类 */\n';
}

function tplSeedJS(ctx) {
  return '// subsystems/' + ctx.id + '/seed/seed.js — ' + ctx.name + '示例数据\n' +
    'module.exports = async function seed(pool) {\n' +
    '  const [rows] = await pool.query(\'SELECT id FROM ' + ctx.id + '_items WHERE item_no = ? LIMIT 1\', [\'DEMO-0001\']);\n' +
    '  if (rows.length) { console.log(\'  [' + ctx.id + '] 示例数据已存在，跳过\'); return; }\n' +
    '  const [r] = await pool.query(\n' +
    '    \'INSERT INTO ' + ctx.id + '_items (item_no, name, status) VALUES (?, ?, ?)\',\n' +
    '    [\'DEMO-0001\', \'示例记录\', \'NEW\']\n' +
    '  );\n' +
    '  await pool.query(\n' +
    '    \'INSERT INTO ' + ctx.id + '_logs (item_id, action, role, note) VALUES (?, ?, ?, ?)\',\n' +
    '    [r.insertId, \'CREATE\', \'ADMIN\', \'种子初始化\']\n' +
    '  );\n' +
    '  console.log(\'  [' + ctx.id + '] 示例数据已插入 DEMO-0001\');\n' +
    '};\n';
}

function generateSubsystem(ctx) {
  return {
    files: {
      'manifest.json': tplManifest(ctx),
      'backend/index.js': tplBackendIndex(ctx),
      'db/schema.sql': tplSchemaSQL(ctx),
      'frontend/index.html': tplFrontendIndex(ctx),
      'frontend/js/router.js': tplRouterJS(ctx),
      'frontend/js/views/dashboard.js': tplViewDashboard(ctx),
      'frontend/js/views/list.js': tplViewList(ctx),
      'frontend/css/module.css': tplModuleCSS(ctx),
      'seed/seed.js': tplSeedJS(ctx)
    }
  };
}

module.exports = { generateSubsystem, tplManifest };
