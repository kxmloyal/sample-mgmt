# 子系统脚手架（create-subsystem.js）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 提供 `node tools/create-subsystem.js <id> <name>` 一条命令生成「可运行的最小完整子系统骨架」，并让管理面板共用同一套模板。

**Architecture:** 模板纯函数模块（`tools/subsystem-templates.js`，唯一事实来源）→ CLI（`tools/create-subsystem.js`）与面板（`routes/subsystems.js` POST）双入口调用；`tools/build-bundles.js` 加 INIT 默认分支支持任意新子系统。

**Tech Stack:** Node.js（CommonJS）、fs/readline（无新增依赖）、jest（单测）、MariaDB via mysql2。

**设计文档：** `docs/superpowers/specs/2026-08-05-subsystem-scaffold-design.md`

**权限注意事项（本项目关键）：** 项目文件属主 www。对 `subsystems/` 写入需以 www 身份或 sudo 执行。编辑项目文件走 `/tmp` 副本 + `sudo cp` + `chown www:www`。测试 CLI 生成时用 `node tools/create-subsystem.js` 需先确认运行用户（当前 shell 用户通常 ystech，无写 www 目录权限——CLI 生成验证时以 `sudo -u www` 或先 chmod 临时目录）。

---

### Task 1: 模板模块 subsystem-templates.js

**Files:**
- Create: `tools/subsystem-templates.js`
- Test: `tests/subsystem-scaffold.test.js`

- [ ] **Step 1: 写失败测试**（`tests/subsystem-scaffold.test.js`）

```js
// tests/subsystem-scaffold.test.js — 子系统脚手架模板单元测试
const { generateSubsystem, tplManifest } = require('../tools/subsystem-templates');

const ctx = { id: 'mymod', name: '我的模块', description: '测试模块', icon: 'chart', version: '1.0.0',
  withStateMachine: true, withFiles: true, states: ['DRAFT', 'ACTIVE', 'CLOSED'] };

describe('generateSubsystem', () => {
  it('应生成 9 个文件', () => {
    const { files } = generateSubsystem(ctx);
    expect(Object.keys(files)).toHaveLength(9);
  });

  it('manifest 可解析且 id/route/database 正确', () => {
    const { files } = generateSubsystem(ctx);
    const m = JSON.parse(files['manifest.json']);
    expect(m.id).toBe('mymod');
    expect(m.route.prefix).toBe('/api/mymod');
    expect(m.route.entry).toBe('/subsystems/mymod/frontend/index.html');
    expect(m.database.tables).toHaveLength(2);
    expect(m.navigation).toHaveLength(2);
  });

  it('含状态机时 manifest 含 stateMachine（初始态 + 全部状态）', () => {
    const { files } = generateSubsystem(ctx);
    const m = JSON.parse(files['manifest.json']);
    expect(m.stateMachine.initial).toBe('DRAFT');
    expect(Object.keys(m.stateMachine.states)).toEqual(['DRAFT', 'ACTIVE', 'CLOSED']);
  });

  it('含文件管理时 manifest 含 files 配置', () => {
    const { files } = generateSubsystem(ctx);
    const m = JSON.parse(files['manifest.json']);
    expect(m.files.enabled).toBe(true);
    expect(m.files.categories.length).toBeGreaterThan(0);
  });

  it('无状态机时 manifest 不含 stateMachine 键', () => {
    const { files } = generateSubsystem({ ...ctx, withStateMachine: false, states: [] });
    const m = JSON.parse(files['manifest.json']);
    expect(m.stateMachine).toBeUndefined();
  });

  it('schema.sql 幂等（CREATE TABLE IF NOT EXISTS）且含索引', () => {
    const { files } = generateSubsystem(ctx);
    const sql = files['db/schema.sql'];
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mymod_items');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS mymod_logs');
    expect(sql).toContain('INDEX idx_mymod_status');
  });

  it('backend 含 ping 与 list 路由，且导出协议三接口', () => {
    const { files } = generateSubsystem(ctx);
    const b = files['backend/index.js'];
    expect(b).toContain("'/api/mymod/ping'");
    expect(b).toContain("'/api/mymod/list'");
    expect(b).toContain('module.exports = { register, initDB, seed }');
  });

  it('前端含 router 与两个 view 文件', () => {
    const { files } = generateSubsystem(ctx);
    expect(files['frontend/js/router.js']).toContain('VIEWS={dashboard:viewDashboard,list:viewList}');
    expect(files['frontend/js/views/dashboard.js']).toContain('function viewDashboard');
    expect(files['frontend/js/views/list.js']).toContain('async function viewList');
    expect(files['frontend/index.html']).toContain('/subsystems/mymod/frontend/js/bundle.js');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest tests/subsystem-scaffold.test.js`
Expected: FAIL（`Cannot find module '../tools/subsystem-templates'`）

- [ ] **Step 3: 实现模板模块**（`tools/subsystem-templates.js`，顶层函数 10 个 = 9 模板 + generateSubsystem，符合红线）

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest tests/subsystem-scaffold.test.js`
Expected: PASS（9 个用例全绿）

- [ ] **Step 5: 语法检查 + 提交**

Run: `node --check tools/subsystem-templates.js`
Expected: 无输出（语法通过）

```bash
git add tools/subsystem-templates.js tests/subsystem-scaffold.test.js
git commit -m "feat(tools): 子系统骨架模板模块 generateSubsystem"
```

---

### Task 2: CLI create-subsystem.js + bundle INIT 默认分支

**Files:**
- Create: `tools/create-subsystem.js`
- Modify: `tools/build-bundles.js:25`（INIT 默认分支）

- [ ] **Step 1: 修改 build-bundles.js 支持任意新子系统**

将第 25-26 行：

```js
  const init = INIT[id];
  if (!init) { console.log('  无 init，跳过'); continue; }
```

替换为：

```js
  // 新子系统默认初始化（脚手架生成的子系统统一用 route/boot）
  const init = INIT[id] || "window.addEventListener('hashchange',route);boot();";
```

- [ ] **Step 2: 实现 CLI**（`tools/create-subsystem.js`，顶层函数 6 个）

```js
// tools/create-subsystem.js — 子系统脚手架 CLI
// 用法: node tools/create-subsystem.js <id> <name> [描述]
// 交互补全: 状态机 / 文件管理（可选能力）
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { generateSubsystem } = require('./subsystem-templates');

const ROOT = path.join(__dirname, '..');

function validateId(id) {
  if (!id) return 'id 必填';
  if (!/^[a-z][a-z0-9-]*$/.test(id)) return 'id 必须是字母开头的小写 kebab-case';
  if (fs.existsSync(path.join(ROOT, 'subsystems', id))) return '子系统 ' + id + ' 已存在';
  return null;
}

function prompt(q) {
  return new Promise(function (resolve) {
    var rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(q, function (ans) { rl.close(); resolve(ans.trim()); });
  });
}

async function askYesNo(q) {
  var a = await prompt(q + ' [y/N] ');
  return /^[yY]/.test(a);
}

async function writeFiles(id, files) {
  var dir = path.join(ROOT, 'subsystems', id);
  Object.keys(files).forEach(function (rel) {
    var fp = path.join(dir, rel);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, files[rel], 'utf8');
  });
}

function updateBundleSources(id) {
  var sp = path.join(ROOT, 'tools', 'bundle-sources.json');
  var src = JSON.parse(fs.readFileSync(sp, 'utf8'));
  if (src[id]) return false;
  src[id] = [
    'shared/frontend/shared/utils.js',
    'shared/frontend/api-base.js',
    'shared/frontend/modal.js',
    'subsystems/' + id + '/frontend/js/views/dashboard.js',
    'subsystems/' + id + '/frontend/js/views/list.js',
    'subsystems/' + id + '/frontend/js/router.js'
  ];
  fs.writeFileSync(sp, JSON.stringify(src, null, 2) + '\n', 'utf8');
  return true;
}

async function main() {
  var id = process.argv[2], name = process.argv[3], desc = process.argv[4] || '';
  var err = validateId(id);
  if (err) { console.error('✗ ' + err); process.exit(1); }
  if (!name) { console.error('✗ name 必填（用法: node tools/create-subsystem.js <id> <name> [描述]）'); process.exit(1); }

  var withState = await askYesNo('需要状态机（状态/流转声明）吗？');
  var states = [];
  if (withState) {
    var s = await prompt('状态列表（逗号分隔，首个为初始态，如 DRAFT,ACTIVE,CLOSED）: ');
    states = s.split(/[,，]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }
  var withFiles = await askYesNo('需要文件管理（附件上传）吗？');

  var ctx = { id: id, name: name, description: desc, icon: 'chart', version: '1.0.0',
    withStateMachine: withState, withFiles: withFiles, states: states };
  var out = generateSubsystem(ctx);
  await writeFiles(id, out.files);
  var added = updateBundleSources(id);
  console.log('✓ 生成 ' + Object.keys(out.files).length + ' 个文件 → subsystems/' + id + '/');
  console.log(added ? '✓ 已追加 tools/bundle-sources.json' : '⚠ tools/bundle-sources.json 已含该子系统');
  console.log('\n下一步:');
  console.log('  1) node tools/build-bundles.js');
  console.log('  2) sudo cp /tmp/bundle-' + id + '.js subsystems/' + id + '/frontend/js/bundle.js');
  console.log('  3) 重启服务后访问 http://localhost:4000/portal.html 查看新卡片');
  process.exit(0);
}

main().catch(function (e) { console.error('✗ 生成失败: ' + e.message); process.exit(1); });
```

- [ ] **Step 3: 语法检查 + 单元验证（临时目录）**

Run: `node --check tools/create-subsystem.js && node -e "const {generateSubsystem}=require('./tools/subsystem-templates'); const {files}=generateSubsystem({id:'mymod',name:'测试',withStateMachine:true,withFiles:true,states:['A','B']}); console.log(Object.keys(files).length, JSON.parse(files['manifest.json']).stateMachine.initial)"`
Expected: `9 A`（模板函数可被 CLI 引用，manifest 状态机正常）

- [ ] **Step 4: 提交**

```bash
git add tools/create-subsystem.js tools/build-bundles.js
git commit -m "feat(tools): 子系统脚手架 CLI + bundle INIT 默认分支"
```

---

### Task 3: 面板 POST /api/subsystems 改造

**Files:**
- Modify: `routes/subsystems.js:82-137`（POST /api/subsystems）
- Test: `tests/subsystems.test.js`（现有 POST 用例保持通过）

- [ ] **Step 1: 先运行现有测试建立基线**

Run: `npx jest tests/subsystems.test.js`
Expected: PASS（基线通过，含 POST 创建用例）

- [ ] **Step 2: 改造 POST handler 调用共用模板**

将 `routes/subsystems.js` 第 91-136 行（try 块内「创建目录 + 写 manifest + 写模板文件 + 更新 registry」）整体替换为：

```js
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
```

**兼容性要点**：出入参保持 `201 + { ok, id }` 不变；目录从「极简骨架」升级为「完整骨架」（额外生成 router.js/views/schema 内容）；面板提交的 route/roles/navigation/stateMachine/files 仍会覆盖模板默认值。

- [ ] **Step 3: 语法检查 + 现有测试回归**

Run: `node --check routes/subsystems.js && npx jest tests/subsystems.test.js`
Expected: 语法通过，全部用例 PASS

- [ ] **Step 4: 提交**

```bash
git add routes/subsystems.js
git commit -m "refactor(subsystems): POST 创建改调共用模板，目录升级为完整骨架"
```

---

### Task 4: E2E 验证（临时子系统全链路）

**Files:**
- 运行验证用（临时创建后清理，不提交）

- [ ] **Step 1: 以 www 身份用 CLI 生成临时子系统**

Run: `sudo -u www node tools/create-subsystem.js mymod 我的模块 -- 2>/dev/null <<'EOF'
n
y
EOF`
Expected: 生成 9 个文件 → `subsystems/mymod/`，bundle-sources.json 追加 mymod 条目
（说明：交互中「状态机」答 n，「文件管理」答 y；`--` 为描述占位可省略）

- [ ] **Step 2: rebuild bundle + 复制到子系统**

Run: `node tools/build-bundles.js && sudo cp /tmp/bundle-mymod.js subsystems/mymod/frontend/js/bundle.js && sudo chown www:www subsystems/mymod/frontend/js/bundle.js`
Expected: 输出 `mymod` 条目（files=6, bundle=~XXKB）

- [ ] **Step 3: 重启服务并验证**

重启 4000 服务（精确 PID：`sudo ss -tlnp | grep :4000` → 仅重启该项目进程，勿碰 3500）。
Run: `curl -s http://localhost:4000/api/subsystems | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const l=JSON.parse(d);console.log('含 mymod:',!!l.find(s=>s.id==='mymod'));})"`
Expected: `含 mymod: true`（门户卡片出现，db.js 自动建 mymod_items/mymod_logs 表）

- [ ] **Step 4: 登录验证 ping 与 list**

Run: `curl -s -c /tmp/ck.txt -d 'username=admin&password=admin123' http://localhost:4000/api/login -o /dev/null -w '%{http_code}\n' && curl -s -b /tmp/ck.txt http://localhost:4000/api/mymod/ping && curl -s -b /tmp/ck.txt http://localhost:4000/api/mymod/list`
Expected: `200`；ping 返回 `{"msg":"pong","module":"mymod"}`；list 返回数组（seed 前为空 `[]`）

- [ ] **Step 5: 清理临时子系统**

Run: `sudo rm -rf subsystems/mymod` + 从 `tools/bundle-sources.json` 移除 mymod 条目 + 删除新建的两张表（`DROP TABLE IF EXISTS mymod_items, mymod_logs`）+ 重启服务恢复。
Expected: `/api/subsystems` 不再含 mymod

---

### Task 5: 全量回归 + 文档同步

**Files:**
- Test: `tests/samples.test.js`、`tests/fixture-inspect.test.js`、`tests/dashboard.test.js`、`tests/auth.test.js`、`tests/subsystems.test.js`、`tests/workbench-drilldown.test.js`、`tests/inspect-state.test.js`
- Modify: `AGENTS.md:17.6`（新增子系统流程第 2 步补 CLI 方式）、`README.md`（tools 说明）

- [ ] **Step 1: 全量单测回归（共享文件改动验证）**

Run: `npx jest --silent`
Expected: 全部 PASS（routes/subsystems.js 为共享文件，需确认样品/治具/工作台相关用例不受影响）

- [ ] **Step 2: 三子系统前端 smoke（bundle 未破坏）**

Run: `node tools/build-bundles.js`
Expected: samples/fixtures/workbench 三个 bundle 正常生成，无 [MISSING] 警告

- [ ] **Step 3: 文档同步**

- `AGENTS.md` 第 17.6 节第 2 步「编写 manifest.json」旁补一行：`可用 CLI 快速生成骨架：node tools/create-subsystem.js <id> <name> [描述]（生成完整可运行骨架 + 自动追加 bundle-sources.json）`
- `README.md` 根目录 tools/ 说明补：`create-subsystem.js — 子系统脚手架（一条命令生成可运行骨架）`、`subsystem-templates.js — 骨架模板（CLI 与面板共用）`
- 更新 `docs/superpowers/specs/2026-08-05-subsystem-scaffold-design.md` 状态为「已实施」

- [ ] **Step 4: 臃肿检测报告 + 提交**

```bash
git add AGENTS.md README.md
git commit -m "docs: 同步子系统脚手架用法与目录说明"
```

提交后按 AGENTS.md 第 9 节输出 3 项臃肿检测（新建文件行数/函数数/冗余清单）。

---

## Self-Review 记录

**Spec 覆盖**：设计文档 10 节 → Task 1（§4 模板文件）、Task 2（§5 CLI + §6 bundle）、Task 3（§7 面板）、Task 4（§8 E2E）、Task 5（§9 回归 + 文档）。验收标准 5 条全覆盖。

**占位符扫描**：无 TBD/TODO；每步含完整代码与命令。

**类型一致性**：`generateSubsystem(ctx)` 签名在 Task1 定义 / Task2 CLI / Task3 面板调用一致；`ctx` 字段（id/name/description/icon/version/withStateMachine/withFiles/states/roles）三处一致；`viewDashboard/viewList/route/boot/showApp` 命名在模板与 api-base.js 约定一致。

**已知风险提示**：CLI 交互输入在非 TTY 环境（如 CI 管道）会挂起——Task 4 Step 1 用 heredoc 模拟输入；面板 POST 生成的完整骨架含 `db/schema.sql` 内容，服务重启后 db.js 会自动建表（Task 4 Step 3 验证）。
