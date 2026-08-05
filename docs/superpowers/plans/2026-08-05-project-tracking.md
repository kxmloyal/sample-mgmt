# 项目追踪子系统实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增「项目追踪」子系统（`subsystems/projects/`），覆盖多项目两级结构、PM/项目成员权限、配置化状态机、Kanban 看板、子任务/依赖/评论/附件/关联、看板统计与趋势、CSV 导出、延期预警、全量留痕，并内置并发防护（CAS + 乐观锁 + 行锁 + 同事务留痕）。

**Architecture:** 遵循子系统插件协议（AGENTS.md §17）新建独立子系统目录，manifest.json 声明元数据/状态机/导航/角色，backend/index.js 注册 Express 路由，db/schema.sql 幂等建表，db/dao.js 工厂模式数据访问层（db.js 自动扫描加载），前端独立 SPA（bundle 合并构建）。权限模型：ADMIN/PM 全局、owner/member 项目内、其他角色只读+流转自己名下任务。

**Tech Stack:** Node.js + Express 4.x（CommonJS）、MariaDB（mysql2 连接池）、原生 HTML/CSS/JS 单页、fluent-ui Web Components、jest + supertest、qrcode 不涉及、multer 附件上传。

**设计文档:** `docs/superpowers/specs/2026-08-05-project-tracking-design.md`（v2，commit bf8c5f3）

**Git 协议:** 所有 commit 使用 `sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com ...`（www 属主仓库）；`add` 精确到具体文件，禁止 `git add -A`。

**测试协议:** `sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest <file> 2>&1 | tail -60'`；确认输出含 `JEST_EXIT=0` 或 `Tests: N passed`；测试走 MariaDB 真实库（tests/helpers/setup.js 的 SQLite 为死代码，忽略）。

---

## 文件结构总览

```
subsystems/projects/
├── manifest.json                 # 元数据 + 状态机声明 + 导航 + 角色 + 文件配置
├── backend/
│   ├── index.js                  # register(app)/initDB()/seed() 协议入口
│   ├── permissions.js            # 权限判定：ADMIN/PM/owner/member 解析
│   ├── workflow-config.js        # 状态机配置读写（workflow 表 + manifest 默认合并）
│   ├── routes-projects.js        # 项目 CRUD + 成员管理
│   ├── routes-tasks.js           # 任务 CRUD + 状态流转 + 子任务 + 评论 + 依赖 + 附件 + 关联
│   └── routes-stats.js           # 看板聚合 + 趋势 + CSV 导出 + workflow 配置 API
├── db/
│   ├── schema.sql                # 10 张表 DDL（幂等）
│   └── dao.js                    # 数据访问层（工厂模式，db.js 自动扫描加载）
├── frontend/
│   ├── index.html                # SPA 入口
│   ├── css/module.css            # 子系统专属样式（Kanban/趋势图/高亮）
│   └── js/
│       ├── constants.js          # ROLE_CN/PRIORITY_CN/CATEGORY_CN/ACTION_CN/STATUS_CN
│       ├── api.js                # apiProjects 封装（调用共享 api()）
│       ├── views/dashboard.js    # 项目看板：kb-stat + 三维分布 + 趋势图
│       ├── views/kanban.js       # 任务看板：拖拽流转
│       ├── views/list.js         # 任务列表：筛选/导出/高亮
│       ├── views/projects.js     # 项目列表：CRUD + 成员管理
│       ├── views/task-detail.js  # 任务详情：子任务/依赖/评论/附件/关联/日志
│       ├── views/workflow.js     # 状态机管理面板（ADMIN）
│       └── router.js             # 导航 + hash 路由
└── seed/seed.js                  # 测试数据（导出 seed(pool)）
```

修改的既有文件：
- `tools/bundle-sources.json`：新增 `"projects"` 条目
- `tests/helpers/setup.js`：**不改**（避免影响既有测试）；projects.test.js 内自建 PM 测试账号

---

## Task 1: 子系统骨架 + 建表 + 注册验证

**Files:**
- Create: `subsystems/projects/manifest.json`
- Create: `subsystems/projects/db/schema.sql`
- Create: `subsystems/projects/db/dao.js`（空工厂骨架）
- Create: `subsystems/projects/backend/index.js`
- Create: `subsystems/projects/backend/permissions.js`（骨架）
- Create: `subsystems/projects/backend/workflow-config.js`（骨架）
- Create: `subsystems/projects/frontend/index.html`（骨架）
- Create: `subsystems/projects/frontend/js/router.js`（骨架）
- Create: `subsystems/projects/seed/seed.js`（空 seed）
- Modify: `tools/bundle-sources.json`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p /www/wwwroot/sample-mgmt/subsystems/projects/{backend,db,frontend/{css,js/views},seed}
```

- [ ] **Step 2: 编写 manifest.json**

`subsystems/projects/manifest.json`：

```json
{
  "id": "projects",
  "name": "项目追踪",
  "description": "多项目问题/任务追踪：看板、子任务、依赖、评论、附件、留痕、导出",
  "version": "1.0.0",
  "icon": "kanban",
  "route": {
    "prefix": "/api/projects",
    "entry": "/subsystems/projects/frontend/index.html",
    "hashBase": "/projects"
  },
  "database": {
    "tables": [
      { "name": "projects", "schema": "db/schema.sql" },
      { "name": "project_tasks", "schema": "db/schema.sql" },
      { "name": "project_subtasks", "schema": "db/schema.sql" },
      { "name": "project_task_comments", "schema": "db/schema.sql" },
      { "name": "project_task_deps", "schema": "db/schema.sql" },
      { "name": "project_members", "schema": "db/schema.sql" },
      { "name": "project_task_files", "schema": "db/schema.sql" },
      { "name": "project_task_links", "schema": "db/schema.sql" },
      { "name": "project_logs", "schema": "db/schema.sql" },
      { "name": "project_workflow", "schema": "db/schema.sql" }
    ]
  },
  "roles": {
    "use": ["ADMIN", "PM", "RD", "QA", "CUSTODY", "ME"],
    "admin": ["ADMIN"]
  },
  "navigation": [
    { "key": "dashboard", "label": "项目看板", "icon": "chart", "view": "renderProjectDashboard", "roles": ["ADMIN", "PM", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "kanban", "label": "任务看板", "icon": "columns", "view": "renderTaskKanban", "roles": ["ADMIN", "PM", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "list", "label": "任务列表", "icon": "list", "view": "renderTaskList", "roles": ["ADMIN", "PM", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "projects", "label": "项目列表", "icon": "folder", "view": "renderProjects", "roles": ["ADMIN", "PM", "RD", "QA", "CUSTODY", "ME"] },
    { "key": "workflow", "label": "状态机管理", "icon": "settings", "view": "renderWorkflow", "roles": ["ADMIN"] }
  ],
  "stateMachine": {
    "initial": "NOT_STARTED",
    "states": {
      "NOT_STARTED": { "label": "未开始", "color": "#92400e", "bg": "#fffbeb" },
      "IN_PROGRESS": { "label": "进行中", "color": "#1d4ed8", "bg": "#eff6ff" },
      "DONE":        { "label": "已完成", "color": "#065f46", "bg": "#ecfdf5" },
      "OVERDUE":     { "label": "已延期", "color": "#b91c1c", "bg": "#fef2f2" }
    },
    "transitions": [
      { "from": "NOT_STARTED", "to": "IN_PROGRESS", "action": "START", "role": ["PM", "ADMIN", "MEMBER", "ASSIGNEE"], "label": "开始处理" },
      { "from": "IN_PROGRESS", "to": "DONE", "action": "COMPLETE", "role": ["PM", "ADMIN", "MEMBER", "ASSIGNEE"], "label": "标记完成" },
      { "from": "NOT_STARTED", "to": "OVERDUE", "action": "AUTO_OVERDUE", "role": ["SYSTEM"], "label": "自动延期" },
      { "from": "IN_PROGRESS", "to": "OVERDUE", "action": "AUTO_OVERDUE", "role": ["SYSTEM"], "label": "自动延期" }
    ]
  },
  "files": {
    "enabled": true,
    "uploadDir": "public/uploads/projects",
    "maxSize": 10485760,
    "categories": [
      { "key": "attachment", "label": "任务附件", "extensions": ["pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx", "zip"] }
    ]
  }
}
```

- [ ] **Step 3: 编写 db/schema.sql**

`subsystems/projects/db/schema.sql`（严格按设计文档 §4，逐条 `CREATE TABLE IF NOT EXISTS`，语句以 `;` 结尾；db.js 按 `;` 切分执行）：

```sql
CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL COMMENT '项目名称（必填）',
  description TEXT COMMENT '项目描述',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE进行中/DONE已完成',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_tasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL COMMENT '所属项目 → projects.id',
  title VARCHAR(200) NOT NULL COMMENT '问题/任务名称（必填）',
  description TEXT COMMENT '详细描述',
  category VARCHAR(20) NOT NULL DEFAULT 'other' COMMENT '设备/质量/流程/安全/其他',
  priority VARCHAR(10) NOT NULL DEFAULT 'M' COMMENT '高H/中M/低L',
  assignee_id INT COMMENT '责任人 → users.id',
  planned_date DATE COMMENT '计划完成日期',
  actual_date DATE COMMENT '实际完成日期',
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' COMMENT '状态机状态',
  progress INT NOT NULL DEFAULT 0 COMMENT '进度 0~100',
  solution TEXT COMMENT '改善措施/解决方案',
  notes TEXT COMMENT '备注',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_project (project_id), KEY idx_status (status), KEY idx_assignee (assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_subtasks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  title VARCHAR(200) NOT NULL,
  assignee_id INT,
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED' COMMENT 'NOT_STARTED/IN_PROGRESS/DONE',
  planned_date DATE,
  done_at TIMESTAMP NULL,
  version INT NOT NULL DEFAULT 0,
  created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  content TEXT NOT NULL,
  operator_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_deps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL COMMENT '被阻塞任务',
  depends_on_id INT NOT NULL COMMENT '前置任务',
  created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dep (task_id, depends_on_id),
  KEY idx_depends (depends_on_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  is_owner TINYINT NOT NULL DEFAULT 0 COMMENT '1=项目负责人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member (project_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL, file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL, size INT, uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_task_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL, ref_type VARCHAR(10) NOT NULL COMMENT 'sample/fixture',
  ref_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_link (task_id, ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(10) NOT NULL COMMENT 'project/task/subtask/comment/member/config',
  entity_id INT NOT NULL,
  action VARCHAR(30) NOT NULL COMMENT 'CREATE/UPDATE/DELETE/STATUS_CHANGE/CONFIG/LINK/COMMENT',
  detail TEXT COMMENT '变更摘要（JSON）',
  operator_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_workflow (
  id INT AUTO_INCREMENT PRIMARY KEY,
  flow_key VARCHAR(30) NOT NULL DEFAULT 'task',
  cfg_key VARCHAR(50) NOT NULL COMMENT 'states/transitions/initial',
  cfg_value TEXT NOT NULL COMMENT 'JSON 配置',
  updated_by INT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_flow_key (flow_key, cfg_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 4: 编写 dao.js 骨架（工厂模式，含事务内查询工具）**

`subsystems/projects/db/dao.js`：

```js
// subsystems/projects/db/dao.js — 项目追踪数据访问层（工厂模式，db.js 自动扫描加载）
module.exports = function createDao(deps) {
  var q = deps.q, one = deps.one, run = deps.run, nowISO = deps.nowISO;

  // 事务内单行查询：传 conn 用当前连接，否则用连接池
  async function fetchOne(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].length ? Object.assign({}, rows[0][0]) : undefined;
    }
    return one(sql, params);
  }
  // 事务内多行查询
  async function fetchAll(conn, sql, params) {
    if (conn) {
      var rows = await conn.execute(sql, params || []);
      return rows[0].map(function (r) { return Object.assign({}, r); });
    }
    return q(sql, params);
  }

  // ===== Task 2 起逐项实现：项目/成员/任务/子任务/评论/依赖/附件/关联/日志/工作流 =====
  return { fetchOne, fetchAll };
};
```

- [ ] **Step 5: 编写 backend 骨架**

`subsystems/projects/backend/index.js`：

```js
// subsystems/projects/backend/index.js — 项目追踪子系统后端入口（插件协议标准接口）
function register(app) {
  require('./routes-projects').register(app);
  require('./routes-tasks').register(app);
  require('./routes-stats').register(app);
}

async function initDB() { return true; }

async function seed() {
  try {
    const seedFn = require('../seed/seed');
    const { pool } = require('../../../db');
    await seedFn(pool());
  } catch (e) {
    console.error('[projects] 种子数据填充失败:', e.message);
    throw e;
  }
}

module.exports = { register, initDB, seed };
```

`subsystems/projects/backend/permissions.js`（骨架，Task 2 填充）：

```js
// subsystems/projects/backend/permissions.js — 项目权限判定（ADMIN/PM 全局，owner/member 项目内）
module.exports = { };
```

`subsystems/projects/backend/workflow-config.js`（骨架，Task 4 填充）：

```js
// subsystems/projects/backend/workflow-config.js — 状态机配置读写（workflow 表 + manifest 默认合并）
module.exports = { };
```

`subsystems/projects/backend/routes-projects.js`（骨架）：

```js
// subsystems/projects/backend/routes-projects.js — 项目 CRUD + 成员管理（Task 2 实现）
function register(app) { }
module.exports = { register };
```

`subsystems/projects/backend/routes-tasks.js`（骨架）：

```js
// subsystems/projects/backend/routes-tasks.js — 任务/子任务/评论/依赖/附件/关联/流转（Task 3-6 实现）
function register(app) { }
module.exports = { register };
```

`subsystems/projects/backend/routes-stats.js`（骨架）：

```js
// subsystems/projects/backend/routes-stats.js — 看板聚合/趋势/导出/工作流配置（Task 7 实现）
function register(app) { }
module.exports = { register };
```

- [ ] **Step 6: 编写 frontend 骨架**

`subsystems/projects/frontend/index.html`（参考 workbench 入口骨架，双 script 规范，禁内联 boot）：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0f766e">
<title>项目追踪</title>
<link rel="stylesheet" href="/css/app.css">
<link rel="stylesheet" href="/subsystems/projects/frontend/css/module.css?v=20260805a">
</head>
<body>
<div id="login" style="display:none">
  <div class="login-box">
    <h2>项目追踪 · 登录</h2>
    <input id="lg-user" placeholder="账号"><input id="lg-pass" type="password" placeholder="密码">
    <div id="lg-err" class="lg-err"></div>
    <button onclick="doLogin()">登录</button>
  </div>
</div>
<div id="app" style="display:none">
  <header class="topbar">
    <div class="brand">项目追踪</div>
    <nav id="nav"></nav>
    <div class="top-right">
      <span id="me-label"></span>
      <button onclick="doLogout()">退出</button>
    </div>
  </header>
  <main class="content">
    <div class="page-head"><h1 id="page-title"></h1><div id="page-actions"></div></div>
    <div id="view"></div>
  </main>
</div>
<div id="toast" class="toast"></div>
<script type="module" src="/vendor/fluentui-web-components.js"></script>
<script src="/subsystems/projects/frontend/js/bundle.js?v=__VER__" defer></script>
</body>
</html>
```

`subsystems/projects/frontend/js/router.js`（骨架，导航与 hash 路由，写法对齐 samples router.js；`renderXxx` 函数由各 views 文件定义）：

```js
// router.js — 项目追踪导航菜单与哈希路由
const NAV=[
  {k:'dashboard',t:'项目看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'kanban',t:'任务看板',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'list',t:'任务列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'projects',t:'项目列表',roles:['ADMIN','PM','RD','QA','CUSTODY','ME']},
  {k:'workflow',t:'状态机管理',roles:['ADMIN']},
];
const VIEWS={dashboard:renderProjectDashboard,kanban:renderTaskKanban,list:renderTaskList,projects:renderProjects,workflow:renderWorkflow};
function route(){
  const k=(location.hash.replace('#/','').split('?')[0]||'dashboard');
  const navItem=NAV.find(n=>n.k===k);
  if(navItem&&!navItem.roles.includes(me.role)){location.hash='#/dashboard';return;}
  const v=VIEWS[k]||renderProjectDashboard;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
  const meta={dashboard:'项目看板',kanban:'任务看板',list:'任务列表',projects:'项目列表',workflow:'状态机管理'};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
}
</script>
```

（末尾 `</script>` 为笔误，实际文件不要包含该行；router.js 以 `v();}` 结尾。）

`subsystems/projects/seed/seed.js`：

```js
// subsystems/projects/seed/seed.js — 项目追踪种子数据（Task 11 填充）
async function seed(pool) {
  // Task 11 实现
}
module.exports = seed;
```

`subsystems/projects/frontend/css/module.css`（空文件，后续 Task 追加）。

- [ ] **Step 7: bundle-sources.json 注册 projects**

`tools/bundle-sources.json` 末尾追加：

```json
  ,
  "projects": [
    "shared/frontend/shared/utils.js",
    "shared/frontend/api-base.js",
    "shared/frontend/modal.js",
    "subsystems/projects/frontend/js/constants.js",
    "subsystems/projects/frontend/js/api.js",
    "subsystems/projects/frontend/js/views/dashboard.js",
    "subsystems/projects/frontend/js/views/kanban.js",
    "subsystems/projects/frontend/js/views/list.js",
    "subsystems/projects/frontend/js/views/projects.js",
    "subsystems/projects/frontend/js/views/task-detail.js",
    "subsystems/projects/frontend/js/views/workflow.js",
    "subsystems/projects/frontend/js/router.js"
  ]
```

（注意 JSON 合法：前面 workbench 条目后已无逗号，需在 `}` 前补逗号；若顺序复杂，用 `node -e "JSON.parse(require('fs').readFileSync('tools/bundle-sources.json','utf8'))"` 校验。同时创建空的 `frontend/js/constants.js`、`frontend/js/api.js`、各 views 文件，否则构建 WARN 但不会失败——本 Task 先建空文件。）

- [ ] **Step 8: 复制文件 + 重启验证注册与建表**

```bash
# 文件属主 www：新建目录内所有文件执行
sudo chown -R www:www /www/wwwroot/sample-mgmt/subsystems/projects
```

重启（精确 kill 4000，禁止触碰 3500）：
```bash
sudo ss -tlnp | grep ':4000'
# 取 4000 PID 后 kill
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A kill <PID_4000>
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
sleep 3
sudo ss -tlnp | grep ':4000'
```

验证：
```bash
curl -s http://localhost:4000/api/subsystems | grep -o '"id":"projects"' && echo REGISTERED
mysql -u sample_mgmt -p<DB_PASSWORD> sample_mgmt -e "SHOW TABLES LIKE 'project%';" 
```
Expected: `REGISTERED` + 10 张 `project_*` 表存在；启动日志无 `[db] 加载子系统 schema 失败`。

- [ ] **Step 9: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tools/bundle-sources.json
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 项目追踪子系统骨架（manifest + 10表schema + 插件协议入口 + bundle注册）
"
```

---

## Task 2: 项目 CRUD + 成员管理（后端 + 测试）

**Files:**
- Create: `subsystems/projects/backend/routes-projects.js`（实现）
- Create: `subsystems/projects/backend/permissions.js`（实现）
- Modify: `subsystems/projects/db/dao.js`（项目/成员方法）
- Test: `tests/projects.test.js`（项目/成员用例）

- [ ] **Step 1: 写失败测试**

`tests/projects.test.js`（先只含项目/成员用例；后续 Task 追加 describe 块）：

```js
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { getApp, login } = require('./helpers/setup');

let app, admin, pm;
async function makeUser(u) {
  const D = require('../db');
  if (!D.getUserByUsername(u.username)) {
    D.createUser({ username: u.username, password_hash: bcrypt.hashSync(u.password, 10), role: u.role, dept: u.dept, display_name: u.display_name });
  }
  const agent = request.agent(app);
  await agent.post('/api/login').send({ username: u.username, password: u.password });
  return { agent, user: D.getUserByUsername(u.username) };
}

beforeAll(async () => {
  app = await getApp();
  admin = await makeUser({ username: 'admin', password: 'admin123', role: 'ADMIN', dept: '系统', display_name: '系统管理员' });
  pm = await makeUser({ username: 'pm01', password: 'pm123', role: 'PM', dept: '项目部', display_name: '项目经理' });
}, 30000);

describe('项目 CRUD 与成员管理', () => {
  let pid;
  test('PM 创建项目 → 自动成为 owner', async () => {
    const res = await pm.agent.post('/api/projects').send({ name: 'P-测试项目', description: 'desc' });
    expect(res.status).toBe(201);
    pid = res.body.id;
    const mem = await pm.agent.get('/api/projects/' + pid + '/members');
    expect(mem.body.some(m => m.user_id === pm.user.id && m.is_owner === 1)).toBe(true);
  });
  test('非成员 RD 只读，不能建任务', async () => {
    const rd = await makeUser({ username: 'rd-proj', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发' });
    const list = await rd.agent.get('/api/projects');
    expect(list.status).toBe(200);
    const create = await rd.agent.post('/api/projects/' + pid + '/tasks').send({ title: 'x' });
    expect(create.status).toBe(403);
  });
  test('owner 添加成员、转让 owner、移除成员', async () => {
    const rd2 = await makeUser({ username: 'rd-proj2', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发2' });
    const add = await pm.agent.post('/api/projects/' + pid + '/members').send({ user_id: rd2.user.id });
    expect(add.status).toBe(201);
    const transfer = await pm.agent.put('/api/projects/' + pid + '/members/' + rd2.user.id).send({ is_owner: 1 });
    expect(transfer.status).toBe(200);
    const memAfter = await pm.agent.get('/api/projects/' + pid + '/members');
    expect(memAfter.body.find(m => m.user_id === rd2.user.id).is_owner).toBe(1);
  });
  test('普通角色不能删除项目', async () => {
    const rd = await makeUser({ username: 'rd-proj3', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发3' });
    const del = await rd.agent.delete('/api/projects/' + pid);
    expect(del.status).toBe(403);
  });
  test('有任务的项目删除 → 409', async () => {
    await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '任务A', priority: 'M', category: '质量' });
    const del = await pm.agent.delete('/api/projects/' + pid);
    expect(del.status).toBe(409);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js 2>&1 | tail -30'
```
Expected: FAIL（404 — 路由未注册）。

- [ ] **Step 3: 实现 permissions.js**

`subsystems/projects/backend/permissions.js`：

```js
// subsystems/projects/backend/permissions.js — 项目权限判定
// isAdmin/isPM：全局；isOwner/isMember：项目内；其他角色仅读 + 流转自己名下任务
module.exports = {
  isGlobalManager(role) { return role === 'ADMIN' || role === 'PM'; },
  async getProjectAccess(conn, projectId, userId) {
    const D = require('../../../db');
    const row = await D.fetchOne(conn,
      'SELECT is_owner FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId]);
    return { isOwner: !!row && row.is_owner === 1, isMember: !!row };
  }
};
```

- [ ] **Step 4: 实现 dao.js 项目/成员方法**

在 `subsystems/projects/db/dao.js` 的 return 对象中追加：

```js
  // ===== 项目 =====
  async function createProject(data, conn) {
    const sql = 'INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)';
    const r = conn ? await conn.execute(sql, [data.name, data.description || '', 'ACTIVE', data.created_by])
                   : await q(sql, [data.name, data.description || '', 'ACTIVE', data.created_by]);
    return { id: r[0].insertId };
  }
  async function listProjects(conn) {
    return fetchAll(conn,
      'SELECT p.*, (SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id) AS task_count, ' +
      '(SELECT COUNT(*) FROM project_tasks t WHERE t.project_id=p.id AND t.status=\'DONE\') AS done_count ' +
      'FROM projects p ORDER BY p.id DESC');
  }
  async function getProject(conn, id) { return fetchOne(conn, 'SELECT * FROM projects WHERE id=?', [id]); }
  async function updateProject(conn, id, data) {
    const r = await (conn || q)('UPDATE projects SET name=?, description=? WHERE id=?',
      [data.name, data.description || '', id]);
    return { changed: r[0] ? r[0].affectedRows : r.affectedRows };
  }
  async function deleteProject(conn, id) {
    const r = await (conn || q)('DELETE FROM projects WHERE id=?', [id]);
    return { changed: r[0] ? r[0].affectedRows : r.affectedRows };
  }
  async function countProjectTasks(conn, id) {
    const row = await fetchOne(conn, 'SELECT COUNT(*) AS c FROM project_tasks WHERE project_id=?', [id]);
    return row ? row.c : 0;
  }

  // ===== 成员 =====
  async function listMembers(conn, projectId) {
    return fetchAll(conn,
      'SELECT m.user_id, m.is_owner, m.created_at, u.username, u.display_name, u.role, u.dept ' +
      'FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.is_owner DESC, m.id', [projectId]);
  }
  async function addMember(conn, projectId, userId, isOwner) {
    await (conn || q)('INSERT IGNORE INTO project_members (project_id,user_id,is_owner) VALUES (?,?,?)',
      [projectId, userId, isOwner ? 1 : 0]);
  }
  async function setOwner(conn, projectId, userId) {
    await (conn || q)('UPDATE project_members SET is_owner=0 WHERE project_id=?', [projectId]);
    await (conn || q)('UPDATE project_members SET is_owner=1 WHERE project_id=? AND user_id=?', [projectId, userId]);
  }
  async function removeMember(conn, projectId, userId) {
    await (conn || q)('DELETE FROM project_members WHERE project_id=? AND user_id=?', [projectId, userId]);
  }
```

（注意 `q`/`run` 返回结构：`pool.execute` 返回 `[ResultSetHeader, undefined]`，`q()` 已 map 处理——**统一走 conn 分支**：有 conn 用 `conn.execute` 取 `r[0]`；无 conn 的 UPDATE/DELETE/INSERT 直接用 `run(sql, params)`（db.js dbRef.run 只执行不返回），返回 `{ changed: 1 }` 兼容。上述 `(conn || q)` 写法需改为三元分支避免结构差异，执行时以「有 conn → conn.execute()[0]；无 conn → run() 且 changed 假定 1」为准。）

- [ ] **Step 5: 实现 routes-projects.js**

`subsystems/projects/backend/routes-projects.js`（完整实现，含权限/事务/留痕）：

```js
// subsystems/projects/backend/routes-projects.js — 项目 CRUD + 成员管理
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 项目列表（所有登录用户可见，含任务统计）
  app.get('/api/projects', requireAuth, async (req, res) => {
    try {
      const list = await D.listProjects();
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 创建项目（ADMIN/PM 或任意角色？设计：ADMIN/PM 可建；owner 由创建人生成）
  app.post('/api/projects', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (u.role !== 'ADMIN' && u.role !== 'PM') return res.status(403).json({ error: '仅管理员或项目经理可创建项目' });
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '项目名称必填' });
      await D.withTransaction(async conn => {
        const p = await D.createProject({ name, description: req.body.description, created_by: u.id }, conn);
        await D.addMember(conn, p.id, u.id, 1);
        await D.addProjectLog(conn, 'project', p.id, 'CREATE', JSON.stringify({ name }), u.id);
        res.status(201).json({ id: p.id, name });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 项目详情
  app.get('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const p = await D.getProject(null, Number(req.params.id));
      if (!p) return res.status(404).json({ error: '项目不存在' });
      res.json(p);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑项目（ADMIN/PM/owner）
  app.put('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const p = await D.getProject(null, id);
      if (!p) return res.status(404).json({ error: '项目不存在' });
      const name = (req.body.name || '').trim();
      if (!name) return res.status(400).json({ error: '项目名称必填' });
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权编辑该项目' });
        await D.updateProject(conn, id, { name, description: req.body.description });
        await D.addProjectLog(conn, 'project', id, 'UPDATE', JSON.stringify({ name }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除项目（ADMIN/PM/owner；有任务 409 保护）
  app.delete('/api/projects/:id', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      await D.withTransaction(async conn => {
        const p = await D.getProject(conn, id);
        if (!p) return res.status(404).json({ error: '项目不存在' });
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权删除该项目' });
        const c = await D.countProjectTasks(conn, id);
        if (c > 0) return res.status(409).json({ error: '项目下存在任务，禁止删除' });
        await D.deleteProject(conn, id);
        await D.addProjectLog(conn, 'project', id, 'DELETE', JSON.stringify({ name: p.name }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 成员列表
  app.get('/api/projects/:id/members', requireAuth, async (req, res) => {
    try {
      const list = await D.listMembers(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 添加成员（ADMIN/PM/owner）
  app.post('/api/projects/:id/members', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const userId = Number(req.body.user_id);
      if (!userId) return res.status(400).json({ error: 'user_id 必填' });
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权管理成员' });
        const target = await D.getUserById(userId);
        if (!target) return res.status(404).json({ error: '用户不存在' });
        await D.addMember(conn, id, userId, 0);
        await D.addProjectLog(conn, 'member', id, 'CREATE', JSON.stringify({ user_id: userId }), u.id);
        res.status(201).json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 转让 owner / 移除成员（ADMIN/PM/owner；owner 不可移除自己）
  app.put('/api/projects/:id/members/:uid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const uid = Number(req.params.uid);
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权管理成员' });
        if (req.body.is_owner) {
          await D.setOwner(conn, id, uid);
          await D.addProjectLog(conn, 'member', id, 'UPDATE', JSON.stringify({ owner: uid }), u.id);
        } else {
          if (acc.isOwner && u.id === uid) return res.status(400).json({ error: '不能移除自己（负责人）' });
          await D.removeMember(conn, id, uid);
          await D.addProjectLog(conn, 'member', id, 'DELETE', JSON.stringify({ user_id: uid }), u.id);
        }
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除成员（DELETE 语义，走 PUT 兼容；额外提供 DELETE 别名）
  app.delete('/api/projects/:id/members/:uid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const id = Number(req.params.id);
      const uid = Number(req.params.uid);
      await D.withTransaction(async conn => {
        const acc = await perm.getProjectAccess(conn, id, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isOwner) return res.status(403).json({ error: '无权管理成员' });
        await D.removeMember(conn, id, uid);
        await D.addProjectLog(conn, 'member', id, 'DELETE', JSON.stringify({ user_id: uid }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
```

dao.js 同步追加 `addProjectLog`（留痕，全 Task 共用）：

```js
  // ===== 留痕（全 Task 共用） =====
  async function addProjectLog(conn, entityType, entityId, action, detail, operatorId) {
    await conn.execute('INSERT INTO project_logs (entity_type,entity_id,action,detail,operator_id) VALUES (?,?,?,?,?)',
      [entityType, entityId, action, detail || '', operatorId || null]);
  }
```

> ⚠️ 路由注册顺序约束（Express 按声明顺序匹配）：`/api/projects/tasks/...` 与 `/api/projects/workflow`、`/api/projects/stats` 必须由 routes-tasks.js / routes-stats.js **先于** routes-projects.js 注册（backend/index.js 中 require 顺序已保证：projects → tasks → stats 中，register 调用顺序为 projects、tasks、stats——需调整为先 tasks/stats 后 projects，见 Step 6 注释）。

- [ ] **Step 6: 调整 backend/index.js 注册顺序**

`subsystems/projects/backend/index.js` 的 register 改为（静态路径优先，避免 `/api/projects/:id` 抢占）：

```js
function register(app) {
  require('./routes-tasks').register(app);   // 含 /tasks/export 等静态子路径
  require('./routes-stats').register(app);   // /workflow /stats（静态）
  require('./routes-projects').register(app); // 最后注册 /:id 参数路由
}
```

- [ ] **Step 7: 跑测试确认通过**

```bash
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js 2>&1 | tail -40'
```
Expected: PASS（本 describe 5 用例全绿）。

- [ ] **Step 8: 重启 + Commit**

```bash
# 重启（见 Task 1 Step 8 流程）
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tests/projects.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 项目 CRUD + 成员管理（ADMIN/PM/owner 权限 + 同事务留痕 + 有任务409保护）
"
```

---

## Task 3: 任务 CRUD + 乐观锁（后端 + 测试）

**Files:**
- Create: `subsystems/projects/backend/routes-tasks.js`（任务 CRUD 部分）
- Modify: `subsystems/projects/db/dao.js`（任务方法）
- Modify: `tests/projects.test.js`（追加任务 describe）

- [ ] **Step 1: 写失败测试（追加到 tests/projects.test.js）**

```js
describe('任务 CRUD 与乐观锁', () => {
  let tid, ver;
  test('owner 创建任务', async () => {
    const res = await pm.agent.post('/api/projects/' + pid + '/tasks').send({
      title: '任务A', description: 'd', category: '质量', priority: 'H',
      assignee_id: pm.user.id, planned_date: '2026-08-20'
    });
    expect(res.status).toBe(201);
    tid = res.body.id;
  });
  test('任务列表带状态与字段', async () => {
    const res = await pm.agent.get('/api/projects/' + pid + '/tasks');
    expect(res.status).toBe(200);
    const t = res.body.find(x => x.id === tid);
    expect(t.title).toBe('任务A');
    expect(t.status).toBe('NOT_STARTED');
    expect(t.version).toBe(0);
    ver = t.version;
  });
  test('乐观锁：version 不匹配 → 409', async () => {
    const ok = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: '任务A-改', version: ver });
    expect(ok.status).toBe(200);
    const conflict = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: '任务A-又改', version: ver });
    expect(conflict.status).toBe(409);
  });
  test('DONE 规则：progress 必为 100', async () => {
    const res = await pm.agent.put('/api/projects/tasks/' + tid).send({ title: '任务A-改', status: 'DONE', progress: 50, version: 2 });
    expect(res.status).toBe(400);
  });
  test('普通角色编辑他人任务 → 403', async () => {
    const rd = await makeUser({ username: 'rd-proj4', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发4' });
    const res = await rd.agent.put('/api/projects/tasks/' + tid).send({ title: 'hack', version: 2 });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL（404）。

- [ ] **Step 3: dao.js 任务方法**

```js
  // ===== 任务 =====
  async function createTask(data, conn) {
    const sql = 'INSERT INTO project_tasks (project_id,title,description,category,priority,assignee_id,planned_date,status,progress,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)';
    const r = await conn.execute(sql, [data.project_id, data.title, data.description || '', data.category || 'other',
      data.priority || 'M', data.assignee_id || null, data.planned_date || null, 'NOT_STARTED', 0, data.created_by]);
    return { id: r[0].insertId };
  }
  async function listProjectTasks(conn, projectId) {
    return fetchAll(conn,
      'SELECT t.*, u.display_name AS assignee_name, u.username AS assignee_username ' +
      'FROM project_tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.project_id=? ORDER BY t.id DESC', [projectId]);
  }
  async function getTask(conn, id) { return fetchOne(conn, 'SELECT * FROM project_tasks WHERE id=?', [id]); }
  async function updateTask(conn, id, data, version) {
    // 乐观锁：WHERE id AND version
    const sets = [], params = [];
    const fields = ['title', 'description', 'category', 'priority', 'assignee_id', 'planned_date', 'status', 'progress', 'solution', 'notes', 'actual_date'];
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(f + '=?'); params.push(data[f]); }
    }
    if (sets.length === 0) return { changed: 1 };
    sets.push('version=version+1');
    params.push(id, version);
    const r = await conn.execute('UPDATE project_tasks SET ' + sets.join(',') + ' WHERE id=? AND version=?', params);
    return { changed: r[0].affectedRows };
  }
  async function deleteTask(conn, id) {
    const r = await conn.execute('DELETE FROM project_tasks WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }
  async function listAllTasks(conn, filters) {
    // 跨项目列表（Task 7 使用）；filters: project_id/category/priority/status/assignee_id/overdue
    let sql = 'SELECT t.*, p.name AS project_name, u.display_name AS assignee_name ' +
      'FROM project_tasks t JOIN projects p ON p.id=t.project_id LEFT JOIN users u ON u.id=t.assignee_id WHERE 1=1';
    const params = [];
    if (filters.project_id) { sql += ' AND t.project_id=?'; params.push(filters.project_id); }
    if (filters.category) { sql += ' AND t.category=?'; params.push(filters.category); }
    if (filters.priority) { sql += ' AND t.priority=?'; params.push(filters.priority); }
    if (filters.status && filters.status !== 'OVERDUE') { sql += ' AND t.status=?'; params.push(filters.status); }
    if (filters.status === 'OVERDUE') { sql += " AND t.status<>'DONE' AND t.planned_date < CURDATE()"; }
    if (filters.assignee_id) { sql += ' AND t.assignee_id=?'; params.push(filters.assignee_id); }
    sql += ' ORDER BY t.id DESC';
    return fetchAll(conn, sql, params);
  }
```

- [ ] **Step 4: 实现 routes-tasks.js 任务 CRUD 部分**

```js
// subsystems/projects/backend/routes-tasks.js — 任务/子任务/评论/依赖/附件/关联/流转
const D = require('../../../db');
const perm = require('./permissions');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 校验任务操作权限：ADMIN/PM/项目 owner/member；assignee 对编辑（不含删除）放宽
  async function canEditTask(conn, u, task, allowAssigneeEdit) {
    if (perm.isGlobalManager(u.role)) return true;
    const acc = await perm.getProjectAccess(conn, task.project_id, u.id);
    if (acc.isMember) return true;
    if (allowAssigneeEdit && task.assignee_id === u.id) return true;
    return false;
  }

  // 创建任务（ADMIN/PM/项目成员）
  app.post('/api/projects/:id/tasks', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const pid = Number(req.params.id);
      const title = (req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: '任务名称必填' });
      await D.withTransaction(async conn => {
        const p = await D.getProject(conn, pid);
        if (!p) return res.status(404).json({ error: '项目不存在' });
        const acc = await perm.getProjectAccess(conn, pid, u.id);
        if (!perm.isGlobalManager(u.role) && !acc.isMember) return res.status(403).json({ error: '非项目成员无权创建任务' });
        const t = await D.createTask({ project_id: pid, title, description: req.body.description,
          category: req.body.category, priority: req.body.priority, assignee_id: req.body.assignee_id || null,
          planned_date: req.body.planned_date || null, created_by: u.id }, conn);
        await D.addProjectLog(conn, 'task', t.id, 'CREATE', JSON.stringify({ title }), u.id);
        res.status(201).json({ id: t.id });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 项目任务列表
  app.get('/api/projects/:id/tasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listProjectTasks(null, Number(req.params.id));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 任务详情（含子任务/依赖/评论/附件/关联/日志）
  app.get('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const tid = Number(req.params.tid);
      const t = await D.getTask(null, tid);
      if (!t) return res.status(404).json({ error: '任务不存在' });
      res.json({
        task: t,
        subtasks: await D.listSubtasks(null, tid),
        deps: await D.listTaskDeps(null, tid),
        comments: await D.listTaskComments(null, tid),
        files: await D.listTaskFiles(null, tid),
        links: await D.listTaskLinks(null, tid),
        logs: await D.listTaskLogs(null, tid)
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 编辑任务（乐观锁；ADMIN/PM/成员/assignee）
  app.put('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权编辑该任务' });
        const body = req.body || {};
        // DONE 规则：progress 强制 100 + actual_date 必填（设计文档 §4.10）
        if (body.status === 'DONE' && Number(body.progress) !== 100) return res.status(400).json({ error: '标记完成后进度必须为 100%' });
        const r = await D.updateTask(conn, tid, body, Number(body.version));
        if (r.changed === 0) return res.status(409).json({ error: '数据已被他人修改，请刷新后重试' });
        await D.addProjectLog(conn, 'task', tid, 'UPDATE', JSON.stringify({ fields: Object.keys(body).filter(k => k !== 'version') }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 删除任务（ADMIN/PM/成员；级联清理）
  app.delete('/api/projects/tasks/:tid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, false)) return res.status(403).json({ error: '无权删除该任务' });
        await D.deleteTaskCascade(conn, tid);
        await D.addProjectLog(conn, 'task', tid, 'DELETE', JSON.stringify({ title: t.title }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
module.exports = { register };
```

dao.js 同步追加（级联删除 + 详情辅助，评论/依赖/附件/关联/子任务方法在 Task 5/6 实现，本 Task 先定义删除所需 + 空实现列表函数避免 404）：

```js
  async function deleteTaskCascade(conn, tid) {
    for (const tbl of ['project_subtasks', 'project_task_comments', 'project_task_deps', 'project_task_files', 'project_task_links', 'project_logs']) {
      await conn.execute('DELETE FROM ' + tbl + ' WHERE task_id=?', [tid]);
    }
    await conn.execute('DELETE FROM project_logs WHERE entity_type=\'task\' AND entity_id=?', [tid]);
    await conn.execute('DELETE FROM project_tasks WHERE id=?', [tid]);
  }
```

- [ ] **Step 5: 跑测试**

Expected: PASS（本 describe 5 用例全绿；乐观锁 409 / DONE 规则 400 / 403 均断言通过）。

- [ ] **Step 6: 重启 + Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tests/projects.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 任务 CRUD + 乐观锁（version 冲突409 / DONE规则400 / 级联删除同事务）
"
```

---

## Task 4: 状态机流转引擎 + CAS + 伪角色 + OVERDUE（后端 + 测试）

**Files:**
- Create: `subsystems/projects/backend/workflow-config.js`（实现）
- Modify: `subsystems/projects/backend/routes-tasks.js`（状态流转 POST）
- Modify: `subsystems/projects/db/dao.js`（CAS 更新 + 伪角色成员查询）
- Modify: `tests/projects.test.js`（追加流转/并发 describe）

- [ ] **Step 1: 写失败测试（追加）**

```js
describe('状态机流转与并发', () => {
  let flowId;
  test('START：NOT_STARTED → IN_PROGRESS', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('IN_PROGRESS');
    flowId = res.body.task.version;
  });
  test('非法转移（DONE 未完成规则）→ 400；无前置任务直接 DONE 需 COMPLETE', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'COMPLETE' });
    expect(res.status).toBe(200); // 无依赖任务可直接完成
    expect(res.body.task.status).toBe('DONE');
  });
  test('ASSIGNEE 伪角色：仅责任人可流转自己任务', async () => {
    // rd-proj2 非成员：创建任务指派给自己，可流转
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '指派任务', assignee_id: rd2.user.id, priority: 'M' });
    const res = await rd2.agent.post('/api/projects/tasks/' + t.body.id + '/status').send({ action: 'START' });
    expect(res.status).toBe(200);
  });
  test('CAS 并发冲突：过期 version 流转 → 409', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/status').send({ action: 'START' });
    expect(res.status).toBe(409); // 已 DONE，状态不匹配 CAS
  });
});
```

（rd2 变量来自 Task 2 describe 作用域——需将 rd2 声明提升到文件级 `let rd2` 并在 Task 2 用例赋值。）

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL（404 — status 路由未注册）。

- [ ] **Step 3: 实现 workflow-config.js**

```js
// subsystems/projects/backend/workflow-config.js — 状态机配置读写
// workflow 表覆盖 manifest 默认（初始值）；保存即生效
const D = require('../../../db');
const DEFAULT = require('../../manifest.json').stateMachine;

async function loadWorkflow(conn) {
  const rows = await D.fetchAll(conn || null,
    'SELECT cfg_key, cfg_value FROM project_workflow WHERE flow_key=\'task\'');
  const cfg = {
    initial: DEFAULT.initial,
    states: JSON.parse(JSON.stringify(DEFAULT.states)),
    transitions: JSON.parse(JSON.stringify(DEFAULT.transitions))
  };
  for (const r of rows) {
    if (r.cfg_key === 'initial') cfg.initial = r.cfg_value;
    else if (r.cfg_key === 'states') cfg.states = JSON.parse(r.cfg_value);
    else if (r.cfg_key === 'transitions') cfg.transitions = JSON.parse(r.cfg_value);
  }
  return cfg;
}

// 持久化（事务内调用方已加行锁）
async function saveWorkflow(conn, cfg, userId) {
  await conn.execute('INSERT INTO project_workflow (flow_key,cfg_key,cfg_value,updated_by) VALUES (\'task\',?,?,?) ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_by=VALUES(updated_by)',
    ['initial', cfg.initial, userId]);
  await conn.execute('INSERT INTO project_workflow (flow_key,cfg_key,cfg_value,updated_by) VALUES (\'task\',?,?,?) ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_by=VALUES(updated_by)',
    ['states', JSON.stringify(cfg.states), userId]);
  await conn.execute('INSERT INTO project_workflow (flow_key,cfg_key,cfg_value,updated_by) VALUES (\'task\',?,?,?) ON DUPLICATE KEY UPDATE cfg_value=VALUES(cfg_value), updated_by=VALUES(updated_by)',
    ['transitions', JSON.stringify(cfg.transitions), userId]);
}

// 伪角色解析：role 数组含 ASSIGNEE（assignee_id===uid）/ MEMBER（uid∈成员）即通过
async function resolveRole(conn, roleList, u, task) {
  if (roleList.includes(u.role)) return true;
  if (roleList.includes('ASSIGNEE') && task.assignee_id === u.id) return true;
  if (roleList.includes('MEMBER')) {
    const row = await D.fetchOne(conn, 'SELECT 1 AS x FROM project_members WHERE project_id=? AND user_id=?', [task.project_id, u.id]);
    if (row) return true;
  }
  return false;
}

module.exports = { loadWorkflow, saveWorkflow, resolveRole };
```

- [ ] **Step 4: 实现状态流转 POST（routes-tasks.js 追加）**

```js
  // 状态流转（CAS + 状态机 + 依赖校验 + 同事务留痕 + 触发 OVERDUE 批量）
  app.post('/api/projects/tasks/:tid/status', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const action = (req.body.action || '').trim();
      if (!action) return res.status(400).json({ error: 'action 必填' });
      await D.withTransaction(async conn => {
        // 事务内读取最新配置（缓解新旧混合）
        const wf = await require('./workflow-config').loadWorkflow(conn);
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        const tr = wf.transitions.find(x => x.action === action && x.from === t.status);
        if (!tr) return res.status(400).json({ error: '当前状态不允许该操作' });
        if (!await require('./workflow-config').resolveRole(conn, tr.role, u, t))
          return res.status(403).json({ error: '无权限执行该操作' });
        // 依赖校验：进入 IN_PROGRESS/DONE 前，前置任务须全部 DONE
        if (tr.to === 'IN_PROGRESS' || tr.to === 'DONE') {
          const pending = await D.fetchOne(conn,
            'SELECT COUNT(*) AS c FROM project_task_deps d JOIN project_tasks p ON p.id=d.depends_on_id ' +
            'WHERE d.task_id=? AND p.status<>\'DONE\'', [tid]);
          if (pending && pending.c > 0) return res.status(409).json({ error: '存在未完成的前置任务，禁止流转' });
        }
        // 自动延期批量（与手动流转同事务，CAS 保证互斥）
        await conn.execute(
          "UPDATE project_tasks SET status='OVERDUE', version=version+1 WHERE id=? AND status IN ('NOT_STARTED','IN_PROGRESS') AND planned_date < CURDATE()",
          [tid]);
        // 手动流转 CAS
        let r = await conn.execute('UPDATE project_tasks SET status=?, version=version+1 WHERE id=? AND status=?',
          [tr.to, tid, t.status]);
        if (r[0].affectedRows === 0) return res.status(409).json({ error: '任务状态已变更，请刷新后重试' });
        // DONE 附加：progress=100 + actual_date 必填 + 回写
        if (tr.to === 'DONE') {
          await conn.execute("UPDATE project_tasks SET progress=100, actual_date=COALESCE(actual_date,CURDATE()) WHERE id=?", [tid]);
        }
        await D.addProjectLog(conn, 'task', tid, 'STATUS_CHANGE', JSON.stringify({ from: t.status, to: tr.to, action }), u.id);
        const nt = await D.getTask(conn, tid);
        res.json({ task: nt, message: tr.label });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 5: 跑测试**

Expected: PASS（4 用例；含 CAS 409 与伪角色 ASSIGNEE）。

- [ ] **Step 6: 重启 + Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tests/projects.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 状态机流转引擎（CAS条件更新 + ASSIGNEE/MEMBER伪角色 + OVERDUE自动延期互斥 + 依赖阻塞）
"
```

---

## Task 5: 子任务 + 评论（后端 + 测试）

**Files:**
- Modify: `subsystems/projects/backend/routes-tasks.js`（子任务/评论路由）
- Modify: `subsystems/projects/db/dao.js`（子任务/评论方法）
- Modify: `tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试（追加）**

```js
describe('子任务与评论', () => {
  let sid;
  test('创建子任务', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + tid + '/subtasks').send({ title: '子任务1', planned_date: '2026-08-10' });
    expect(res.status).toBe(201);
    sid = res.body.id;
  });
  test('子任务流转 CAS（START → DONE 需按序）', async () => {
    const s1 = await pm.agent.post('/api/projects/tasks/' + tid + '/subtasks/' + sid + '/status').send({ action: 'START' });
    expect(s1.status).toBe(200);
    expect(s1.body.status).toBe('IN_PROGRESS');
    const s2 = await pm.agent.post('/api/projects/tasks/' + tid + '/subtasks/' + sid + '/status').send({ action: 'COMPLETE' });
    expect(s2.status).toBe(200);
    expect(s2.body.status).toBe('DONE');
  });
  test('子任务编辑乐观锁', async () => {
    const ok = await pm.agent.put('/api/projects/tasks/' + tid + '/subtasks/' + sid).send({ title: '子任务1-改', version: 0 });
    expect(ok.status).toBe(200);
    const conflict = await pm.agent.put('/api/projects/tasks/' + tid + '/subtasks/' + sid).send({ title: '改2', version: 0 });
    expect(conflict.status).toBe(409);
  });
  test('发表评论并展示', async () => {
    const c = await pm.agent.post('/api/projects/tasks/' + tid + '/comments').send({ content: '进展：样品测试完成' });
    expect(c.status).toBe(201);
    const list = await pm.agent.get('/api/projects/tasks/' + tid + '/comments');
    expect(list.body.some(x => x.content === '进展：样品测试完成')).toBe(true);
  });
  test('非成员不能评论', async () => {
    const rd = await makeUser({ username: 'rd-proj5', password: 'rd123', role: 'RD', dept: '研发中心', display_name: '研发5' });
    const res = await rd.agent.post('/api/projects/tasks/' + tid + '/comments').send({ content: 'x' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL（404）。

- [ ] **Step 3: dao.js 子任务/评论方法**

```js
  // ===== 子任务（三态：NOT_STARTED/IN_PROGRESS/DONE，无 OVERDUE） =====
  async function createSubtask(data, conn) {
    const r = await conn.execute(
      'INSERT INTO project_subtasks (task_id,title,assignee_id,planned_date,created_by) VALUES (?,?,?,?,?)',
      [data.task_id, data.title, data.assignee_id || null, data.planned_date || null, data.created_by]);
    return { id: r[0].insertId };
  }
  async function listSubtasks(conn, taskId) {
    return fetchAll(conn, 'SELECT * FROM project_subtasks WHERE task_id=? ORDER BY id', [taskId]);
  }
  async function updateSubtask(conn, id, data, version) {
    const sets = [], params = [];
    const fields = ['title', 'assignee_id', 'planned_date'];
    for (const f of fields) {
      if (data[f] !== undefined) { sets.push(f + '=?'); params.push(data[f]); }
    }
    if (sets.length === 0) return { changed: 1 };
    sets.push('version=version+1');
    params.push(id, version);
    const r = await conn.execute('UPDATE project_subtasks SET ' + sets.join(',') + ' WHERE id=? AND version=?', params);
    return { changed: r[0].affectedRows };
  }
  async function deleteSubtask(conn, id) {
    const r = await conn.execute('DELETE FROM project_subtasks WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }
  // 子任务 CAS：按 status 条件更新（前端无需回传 version）
  async function casSubtaskStatus(conn, id, fromStatus, to) {
    const doneAt = to === 'DONE' ? (await conn.execute('SELECT NOW() AS n'))[0][0].n : null;
    const r = await conn.execute('UPDATE project_subtasks SET status=?, done_at=?, version=version+1 WHERE id=? AND status=?',
      [to, doneAt, id, fromStatus]);
    return { changed: r[0].affectedRows };
  }

  // ===== 评论 =====
  async function createComment(conn, taskId, content, operatorId) {
    const r = await conn.execute('INSERT INTO project_task_comments (task_id,content,operator_id) VALUES (?,?,?)',
      [taskId, content, operatorId]);
    return { id: r[0].insertId };
  }
  async function listTaskComments(conn, taskId) {
    return fetchAll(conn,
      'SELECT c.*, u.display_name AS operator_name FROM project_task_comments c LEFT JOIN users u ON u.id=c.operator_id ' +
      'WHERE c.task_id=? ORDER BY c.id', [taskId]);
  }
  async function deleteComment(conn, id) {
    const r = await conn.execute('DELETE FROM project_task_comments WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }
```

- [ ] **Step 4: routes-tasks.js 追加子任务/评论路由**

```js
  // 子任务列表/创建
  app.get('/api/projects/tasks/:tid/subtasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listSubtasks(null, Number(req.params.tid));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/projects/tasks/:tid/subtasks', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const title = (req.body.title || '').trim();
      if (!title) return res.status(400).json({ error: '子任务名称必填' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        const s = await D.createSubtask({ task_id: tid, title, assignee_id: req.body.assignee_id, planned_date: req.body.planned_date, created_by: u.id }, conn);
        await D.addProjectLog(conn, 'subtask', s.id, 'CREATE', JSON.stringify({ title }), u.id);
        res.status(201).json({ id: s.id });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 子任务编辑（乐观锁）
  app.put('/api/projects/tasks/:tid/subtasks/:sid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const sid = Number(req.params.sid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        const r = await D.updateSubtask(conn, sid, req.body, Number(req.body.version));
        if (r.changed === 0) return res.status(409).json({ error: '数据已被他人修改，请刷新后重试' });
        await D.addProjectLog(conn, 'subtask', sid, 'UPDATE', '', u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 子任务删除
  app.delete('/api/projects/tasks/:tid/subtasks/:sid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const sid = Number(req.params.sid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, false)) return res.status(403).json({ error: '无权操作该任务' });
        await D.deleteSubtask(conn, sid);
        await D.addProjectLog(conn, 'subtask', sid, 'DELETE', '', u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 子任务状态流转（CAS，三态）
  app.post('/api/projects/tasks/:tid/subtasks/:sid/status', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const sid = Number(req.params.sid);
      const action = (req.body.action || '').trim();
      const MAP = { START: { from: 'NOT_STARTED', to: 'IN_PROGRESS' }, COMPLETE: { from: 'IN_PROGRESS', to: 'DONE' } };
      const m = MAP[action];
      if (!m) return res.status(400).json({ error: '非法子任务操作' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        const r = await D.casSubtaskStatus(conn, sid, m.from, m.to);
        if (r.changed === 0) return res.status(409).json({ error: '子任务状态已变更，请刷新后重试' });
        await D.addProjectLog(conn, 'subtask', sid, 'STATUS_CHANGE', JSON.stringify(m), u.id);
        const s = await D.fetchOne(conn, 'SELECT * FROM project_subtasks WHERE id=?', [sid]);
        res.json(s);
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 评论列表/发表/删除
  app.get('/api/projects/tasks/:tid/comments', requireAuth, async (req, res) => {
    try {
      const list = await D.listTaskComments(null, Number(req.params.tid));
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.post('/api/projects/tasks/:tid/comments', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const content = (req.body.content || '').trim();
      if (!content) return res.status(400).json({ error: '评论内容必填' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        const c = await D.createComment(conn, tid, content, u.id);
        await D.addProjectLog(conn, 'comment', c.id, 'COMMENT', JSON.stringify({ content }), u.id);
        res.status(201).json({ id: c.id });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.delete('/api/projects/tasks/:tid/comments/:cid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const cid = Number(req.params.cid);
      await D.withTransaction(async conn => {
        const c = await D.fetchOne(conn, 'SELECT * FROM project_task_comments WHERE id=?', [cid]);
        if (!c) return res.status(404).json({ error: '评论不存在' });
        if (u.role !== 'ADMIN' && u.role !== 'PM' && c.operator_id !== u.id)
          return res.status(403).json({ error: '仅作者或管理员可删除' });
        await D.deleteComment(conn, cid);
        await D.addProjectLog(conn, 'comment', cid, 'DELETE', '', u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 5: 跑测试**

Expected: PASS（5 用例全绿）。

- [ ] **Step 6: 重启 + Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tests/projects.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 子任务（三态CAS流转）+ 任务评论（作者/ADMIN/PM可删，同事务留痕）
"
```

---

## Task 6: 依赖 + 附件 + 关联（后端 + 测试）

**Files:**
- Modify: `subsystems/projects/backend/routes-tasks.js`（依赖/附件/关联路由 + createUploader 引入）
- Modify: `subsystems/projects/db/dao.js`（依赖/附件/关联方法）
- Modify: `tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试（追加）**

```js
describe('任务依赖/附件/关联', () => {
  let depTaskId, depTargetId;
  test('添加前置依赖 + 环检测', async () => {
    depTaskId = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '被阻塞任务', priority: 'H' })).body.id;
    depTargetId = (await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '前置任务', priority: 'H' })).body.id;
    const add = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/deps').send({ depends_on_id: depTargetId });
    expect(add.status).toBe(201);
    // 环检测：前置任务再依赖被阻塞任务 → 400
    const cycle = await pm.agent.post('/api/projects/tasks/' + depTargetId + '/deps').send({ depends_on_id: depTaskId });
    expect(cycle.status).toBe(400);
  });
  test('前置未 DONE，被阻塞任务流转 → 409', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/status').send({ action: 'START' });
    expect(res.status).toBe(409);
  });
  test('前置完成后可流转', async () => {
    await pm.agent.post('/api/projects/tasks/' + depTargetId + '/status').send({ action: 'START' });
    const done = await pm.agent.post('/api/projects/tasks/' + depTargetId + '/status').send({ action: 'COMPLETE' });
    expect(done.status).toBe(200);
    const start = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/status').send({ action: 'START' });
    expect(start.status).toBe(200);
  });
  test('上传附件（multipart）', async () => {
    const res = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/files')
      .attach('file', Buffer.from('hello'), 'note.txt');
    expect(res.status).toBe(201);
    expect(res.body.file_name).toBe('note.txt');
  });
  test('关联样品/治具', async () => {
    const link = await pm.agent.post('/api/projects/tasks/' + depTaskId + '/links').send({ ref_type: 'sample', ref_id: 1 });
    expect(link.status).toBe(201);
    const list = await pm.agent.get('/api/projects/tasks/' + depTaskId + '/links');
    expect(list.body.some(l => l.ref_type === 'sample')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL（404 — deps/files/links 路由未注册）。

- [ ] **Step 3: dao.js 依赖/附件/关联方法**

```js
  // ===== 依赖 =====
  async function listTaskDeps(conn, taskId) {
    return fetchAll(conn,
      'SELECT d.*, t.title AS depends_on_title FROM project_task_deps d JOIN project_tasks t ON t.id=d.depends_on_id ' +
      'WHERE d.task_id=? ORDER BY d.id', [taskId]);
  }
  async function addTaskDep(conn, taskId, dependsOnId, createdBy) {
    const r = await conn.execute('INSERT IGNORE INTO project_task_deps (task_id,depends_on_id,created_by) VALUES (?,?,?)',
      [taskId, dependsOnId, createdBy]);
    return { changed: r[0].affectedRows };
  }
  async function removeTaskDep(conn, taskId, dependsOnId) {
    const r = await conn.execute('DELETE FROM project_task_deps WHERE task_id=? AND depends_on_id=?',
      [taskId, dependsOnId]);
    return { changed: r[0].affectedRows };
  }
  // 环检测：沿 depends_on_id 向上单向链，若回到 taskId 则为环
  async function hasCycle(conn, taskId, dependsOnId) {
    let cur = dependsOnId;
    const visited = new Set();
    while (cur) {
      if (cur === taskId) return true;
      if (visited.has(cur)) return false;
      visited.add(cur);
      const row = await fetchOne(conn, 'SELECT depends_on_id FROM project_task_deps WHERE task_id=?', [cur]);
      cur = row ? row.depends_on_id : null;
    }
    return false;
  }

  // ===== 附件 =====
  async function createTaskFile(conn, taskId, file, uploadedBy) {
    const r = await conn.execute('INSERT INTO project_task_files (task_id,file_name,file_path,size,uploaded_by) VALUES (?,?,?,?,?)',
      [taskId, file.file_name, file.file_path, file.size || 0, uploadedBy]);
    return { id: r[0].insertId };
  }
  async function listTaskFiles(conn, taskId) {
    return fetchAll(conn, 'SELECT * FROM project_task_files WHERE task_id=? ORDER BY id', [taskId]);
  }
  async function deleteTaskFile(conn, id) {
    const r = await conn.execute('DELETE FROM project_task_files WHERE id=?', [id]);
    return { changed: r[0].affectedRows };
  }

  // ===== 关联 =====
  async function addTaskLink(conn, taskId, refType, refId) {
    const r = await conn.execute('INSERT IGNORE INTO project_task_links (task_id,ref_type,ref_id) VALUES (?,?,?)',
      [taskId, refType, refId]);
    return { changed: r[0].affectedRows };
  }
  async function listTaskLinks(conn, taskId) {
    return fetchAll(conn,
      'SELECT l.*, CASE WHEN l.ref_type=\'sample\' THEN s.sample_no WHEN l.ref_type=\'fixture\' THEN f.fixture_no END AS ref_no, ' +
      'CASE WHEN l.ref_type=\'sample\' THEN s.name WHEN l.ref_type=\'fixture\' THEN f.name END AS ref_name ' +
      'FROM project_task_links l LEFT JOIN samples s ON s.id=l.ref_id AND l.ref_type=\'sample\' ' +
      'LEFT JOIN fixtures f ON f.id=l.ref_id AND l.ref_type=\'fixture\' WHERE l.task_id=? ORDER BY l.id', [taskId]);
  }
  async function removeTaskLink(conn, taskId, refType, refId) {
    const r = await conn.execute('DELETE FROM project_task_links WHERE task_id=? AND ref_type=? AND ref_id=?',
      [taskId, refType, refId]);
    return { changed: r[0].affectedRows };
  }
  async function listTaskLogs(conn, taskId) {
    return fetchAll(conn,
      'SELECT l.*, u.display_name AS operator_name FROM project_logs l LEFT JOIN users u ON u.id=l.operator_id ' +
      "WHERE l.entity_type='task' AND l.entity_id=? ORDER BY l.id DESC LIMIT 200", [taskId]);
  }
```

- [ ] **Step 4: routes-tasks.js 追加依赖/附件/关联路由**

顶部引入上传中间件：

```js
const { createUploader } = require('../../../shared/middleware/upload');
```

```js
  // 添加前置依赖（环检测在事务内）
  app.post('/api/projects/tasks/:tid/deps', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const depId = Number(req.body.depends_on_id);
      if (!depId) return res.status(400).json({ error: 'depends_on_id 必填' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        if (depId === tid) return res.status(400).json({ error: '不能依赖自己' });
        if (await D.hasCycle(conn, tid, depId)) return res.status(400).json({ error: '存在循环依赖，禁止添加' });
        const r = await D.addTaskDep(conn, tid, depId, u.id);
        if (r.changed === 0) return res.status(409).json({ error: '该依赖已存在' });
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ dep: depId }), u.id);
        res.status(201).json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 移除依赖
  app.delete('/api/projects/tasks/:tid/deps/:depId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const depId = Number(req.params.depId);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        await D.removeTaskDep(conn, tid, depId);
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ unlink: depId }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 上传附件（multer 单文件）
  app.post('/api/projects/tasks/:tid/files', requireAuth,
    createUploader({ uploadDir: 'public/uploads/projects', maxSize: 10485760 }).single('file'),
    async (req, res) => {
      try {
        const u = await currentUser(req);
        const tid = Number(req.params.tid);
        if (!req.file) return res.status(400).json({ error: '未收到文件' });
        await D.withTransaction(async conn => {
          const t = await D.getTask(conn, tid);
          if (!t) return res.status(404).json({ error: '任务不存在' });
          if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
          const f = await D.createTaskFile(conn, tid, { file_name: req.file.originalname, file_path: req.file.filename, size: req.file.size }, u.id);
          await D.addProjectLog(conn, 'task', tid, 'FILE_UPLOAD', JSON.stringify({ file_name: req.file.originalname }), u.id);
          res.status(201).json({ id: f.id, file_name: req.file.originalname, url: '/uploads/projects/' + req.file.filename });
        });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  // 删除附件
  app.delete('/api/projects/tasks/:tid/files/:fid', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const fid = Number(req.params.fid);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        await D.deleteTaskFile(conn, fid);
        await D.addProjectLog(conn, 'task', tid, 'FILE_DELETE', JSON.stringify({ fid }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 关联样品/治具
  app.post('/api/projects/tasks/:tid/links', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const refType = req.body.ref_type;
      const refId = Number(req.body.ref_id);
      if (!['sample', 'fixture'].includes(refType) || !refId)
        return res.status(400).json({ error: 'ref_type(sample/fixture) 与 ref_id 必填' });
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        const r = await D.addTaskLink(conn, tid, refType, refId);
        if (r.changed === 0) return res.status(409).json({ error: '已关联该对象' });
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ ref_type: refType, ref_id: refId }), u.id);
        res.status(201).json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  // 取消关联
  app.delete('/api/projects/tasks/:tid/links/:refType/:refId', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const tid = Number(req.params.tid);
      const refType = req.params.refType;
      const refId = Number(req.params.refId);
      await D.withTransaction(async conn => {
        const t = await D.getTask(conn, tid);
        if (!t) return res.status(404).json({ error: '任务不存在' });
        if (!await canEditTask(conn, u, t, true)) return res.status(403).json({ error: '无权操作该任务' });
        await D.removeTaskLink(conn, tid, refType, refId);
        await D.addProjectLog(conn, 'task', tid, 'LINK', JSON.stringify({ unlink: refType + ':' + refId }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
```

- [ ] **Step 5: 跑测试**

Expected: PASS（5 用例；环检测 400 / 依赖阻塞 409 / 前置完成放行 / multipart 附件 / 关联）。

- [ ] **Step 6: 重启 + Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tests/projects.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 任务依赖（环检测+阻塞校验）、附件上传（multer）、样品/治具关联
"
```

---

## Task 7: 看板统计 + 趋势 + CSV 导出 + 工作流配置（后端 + 测试）

**Files:**
- Create: `subsystems/projects/backend/routes-stats.js`（实现）
- Modify: `subsystems/projects/backend/routes-tasks.js`（跨项目任务列表 GET /api/projects/tasks）
- Modify: `subsystems/projects/db/dao.js`（统计聚合方法）
- Modify: `tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试（追加）**

```js
describe('看板统计/导出/工作流配置', () => {
  test('看板统计聚合（项目数/任务数/完成率/三维分布）', async () => {
    const res = await pm.agent.get('/api/projects/stats');
    expect(res.status).toBe(200);
    expect(res.body.project_count).toBeGreaterThan(0);
    expect(typeof res.body.completion_rate).toBe('number');
    expect(Array.isArray(res.body.category_dist)).toBe(true);
    expect(Array.isArray(res.body.trend)).toBe(true);
  });
  test('跨项目任务列表 + OVERDUE 派生筛选', async () => {
    const res = await pm.agent.get('/api/projects/tasks?status=OVERDUE');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
  test('CSV 导出（UTF-8 BOM + 列头）', async () => {
    const res = await pm.agent.get('/api/projects/tasks/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xFEFF); // BOM
    expect(res.text).toContain('项目名称');
    expect(res.text).toContain('任务名称');
  });
  test('工作流配置读取/更新（ADMIN 行锁）', async () => {
    const get = await pm.agent.get('/api/projects/workflow');
    expect(get.status).toBe(200);
    expect(get.body.states.NOT_STARTED).toBeTruthy();
    const put = await admin.agent.put('/api/projects/workflow').send({
      states: Object.assign(get.body.states, { NOT_STARTED: { label: '未开始', color: '#92400e', bg: '#fffbeb' } }),
      transitions: get.body.transitions, initial: get.body.initial
    });
    expect(put.status).toBe(200);
    const get2 = await pm.agent.get('/api/projects/workflow');
    expect(get2.body.states.NOT_STARTED.label).toBe('未开始');
  });
  test('非 ADMIN 改工作流 → 403', async () => {
    const res = await pm.agent.put('/api/projects/workflow').send({ states: {}, transitions: [], initial: 'NOT_STARTED' });
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL（404）。

- [ ] **Step 3: dao.js 统计方法**

```js
  // ===== 看板统计（弱一致只读聚合） =====
  async function statsDashboard(conn) {
    const projectCount = (await fetchOne(conn, 'SELECT COUNT(*) AS c FROM projects')).c;
    const total = (await fetchOne(conn, 'SELECT COUNT(*) AS c FROM project_tasks')).c;
    const done = (await fetchOne(conn, "SELECT COUNT(*) AS c FROM project_tasks WHERE status='DONE'")).c;
    const inProgress = (await fetchOne(conn, "SELECT COUNT(*) AS c FROM project_tasks WHERE status='IN_PROGRESS'")).c;
    const notStarted = (await fetchOne(conn, "SELECT COUNT(*) AS c FROM project_tasks WHERE status='NOT_STARTED'")).c;
    const overdue = (await fetchOne(conn,
      "SELECT COUNT(*) AS c FROM project_tasks WHERE status<>'DONE' AND planned_date < CURDATE()")).c;
    // 三维分布
    const categoryDist = await fetchAll(conn, 'SELECT category, COUNT(*) AS c FROM project_tasks GROUP BY category');
    const priorityDist = await fetchAll(conn, 'SELECT priority, COUNT(*) AS c FROM project_tasks GROUP BY priority');
    const statusDist = await fetchAll(conn, 'SELECT status, COUNT(*) AS c FROM project_tasks GROUP BY status');
    // 近 8 周每周 DONE 数
    const trend = await fetchAll(conn,
      "SELECT DATE_FORMAT(created_at, '%Y-%u') AS wk, COUNT(*) AS c FROM project_tasks " +
      "WHERE status='DONE' AND created_at >= DATE_SUB(CURDATE(), INTERVAL 8 WEEK) " +
      'GROUP BY DATE_FORMAT(created_at, \'%Y-%u\') ORDER BY wk');
    return {
      project_count: projectCount, total_tasks: total, done_count: done, in_progress_count: inProgress,
      not_started_count: notStarted, overdue_count: overdue,
      completion_rate: total ? Math.round(done / total * 100) : 0,
      category_dist: categoryDist, priority_dist: priorityDist, status_dist: statusDist, trend
    };
  }
```

- [ ] **Step 4: 实现 routes-stats.js**

```js
// subsystems/projects/backend/routes-stats.js — 看板聚合/趋势/导出/工作流配置
const D = require('../../../db');
const wf = require('./workflow-config');

function register(app) {
  const requireAuth = app.locals.requireAuth;
  const currentUser = app.locals.currentUser;

  // 看板统计
  app.get('/api/projects/stats', requireAuth, async (req, res) => {
    try {
      res.json(await D.statsDashboard());
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 跨项目任务列表（筛选）
  app.get('/api/projects/tasks', requireAuth, async (req, res) => {
    try {
      const list = await D.listAllTasks(null, {
        project_id: req.query.project_id, category: req.query.category,
        priority: req.query.priority, status: req.query.status, assignee_id: req.query.assignee_id
      });
      res.json(list);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // CSV 导出（UTF-8 BOM；列：项目名称/任务名称/类别/优先级/责任人/状态/进度/计划日期/实际日期/描述/方案/备注）
  app.get('/api/projects/tasks/export', requireAuth, async (req, res) => {
    try {
      const rows = await D.listAllTasks(null, {});
      const head = ['项目名称', '任务名称', '类别', '优先级', '责任人', '状态', '进度(%)', '计划完成日期', '实际完成日期', '描述', '解决方案', '备注'];
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = [head.map(esc).join(',')];
      const STATE_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
      for (const r of rows) {
        lines.push([r.project_name, r.title, r.category, r.priority, r.assignee_name || '',
          STATE_CN[r.status] || r.status, r.progress, r.planned_date, r.actual_date,
          r.description, r.solution, r.notes].map(esc).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tasks-' + Date.now() + '.csv"');
      res.send('\uFEFF' + lines.join('\r\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 工作流配置读取
  app.get('/api/projects/workflow', requireAuth, async (req, res) => {
    try {
      res.json(await wf.loadWorkflow(null));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // 工作流配置更新（ADMIN；行锁事务）
  app.put('/api/projects/workflow', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      if (u.role !== 'ADMIN') return res.status(403).json({ error: '仅管理员可修改状态机配置' });
      const body = req.body || {};
      // 拓扑固定校验：4 态 + 4 转移边
      const KEYS = ['NOT_STARTED', 'IN_PROGRESS', 'DONE', 'OVERDUE'];
      if (!body.states || KEYS.some(k => !body.states[k]))
        return res.status(400).json({ error: '状态必须包含 NOT_STARTED/IN_PROGRESS/DONE/OVERDUE 四态' });
      if (!Array.isArray(body.transitions) || body.transitions.length === 0)
        return res.status(400).json({ error: 'transitions 必填' });
      await D.withTransaction(async conn => {
        // 行锁（9.3）
        await conn.execute("SELECT id FROM project_workflow WHERE flow_key='task' FOR UPDATE");
        await wf.saveWorkflow(conn, { initial: body.initial || 'NOT_STARTED', states: body.states, transitions: body.transitions }, u.id);
        await D.addProjectLog(conn, 'config', 1, 'CONFIG', JSON.stringify({ states: body.states, transitions: body.transitions }), u.id);
        res.json({ ok: 1 });
      });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

module.exports = { register };
```

- [ ] **Step 5: 跑测试**

Expected: PASS（5 用例全绿）。注意 `GET /api/projects/tasks` 与 `GET /api/projects/:id` 无冲突（tasks 为静态段且 routes-tasks 先注册）；`GET /api/projects/tasks/export` 必须声明在 `GET /api/projects/tasks` 之后（Express 精确匹配 export 优先于查询参数路由，实际无冲突，但保持 export 在 :tid 路由之前注册——本 Task 中 export 在 tasks 列表之后、:tid 相关路由之前由 backend/index.js 的注册顺序保证）。

- [ ] **Step 6: 重启 + Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tests/projects.test.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 看板统计聚合 + 近8周趋势 + CSV导出（BOM）+ 工作流配置读写（ADMIN行锁）
"
```

---

## Task 8: 前端骨架 + 项目看板 + 趋势图（前端）

**Files:**
- Create: `subsystems/projects/frontend/js/constants.js`
- Create: `subsystems/projects/frontend/js/api.js`
- Create: `subsystems/projects/frontend/js/views/dashboard.js`
- Create: `subsystems/projects/frontend/js/views/kanban.js`（空占位，Task 9 实现）
- Create: `subsystems/projects/frontend/js/views/list.js`（空占位）
- Create: `subsystems/projects/frontend/js/views/projects.js`（空占位）
- Create: `subsystems/projects/frontend/js/views/task-detail.js`（空占位）
- Create: `subsystems/projects/frontend/js/views/workflow.js`（空占位）
- Create: `subsystems/projects/frontend/css/module.css`（看板样式）
- Modify: `subsystems/projects/frontend/index.html`（module.css 版本 + boot 初始化）

- [ ] **Step 1: constants.js**

```js
// constants.js — 项目追踪子系统常量（不修改共享 api-base.js，避免跨系统影响）
const ROLE_CN = Object.assign({ PM: '项目经理(PM)' }, { ADMIN: '管理员', RD: '研发(RD)', ME: '生技(ME)', QA: '品保(QA)', CUSTODY: '保管(CUSTODY)' });
const PRIORITY_CN = { H: '高', M: '中', L: '低' };
const CATEGORY_CN = { device: '设备', quality: '质量', process: '流程', safety: '安全', other: '其他' };
const TASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
const SUBTASK_STATUS_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成' };
```

- [ ] **Step 2: api.js**

```js
// api.js — 项目追踪 API 封装（复用共享 api()，仅收敛端点字符串）
const PApi = {
  projects: p => '/api/projects' + (p ? '/' + p : ''),
  projectTasks: pid => '/api/projects/' + pid + '/tasks',
  task: tid => '/api/projects/tasks/' + tid,
  taskSub: (tid, sid) => '/api/projects/tasks/' + tid + '/subtasks' + (sid ? '/' + sid : ''),
  taskComments: tid => '/api/projects/tasks/' + tid + '/comments',
  taskDeps: (tid, depId) => '/api/projects/tasks/' + tid + '/deps' + (depId ? '/' + depId : ''),
  taskFiles: (tid, fid) => '/api/projects/tasks/' + tid + '/files' + (fid ? '/' + fid : ''),
  taskLinks: (tid, refType, refId) => '/api/projects/tasks/' + tid + '/links' + (refType ? '/' + refType + (refId ? '/' + refId : '') : ''),
  stats: '/api/projects/stats',
  exportCsv: '/api/projects/tasks/export',
  workflow: '/api/projects/workflow'
};
```

- [ ] **Step 3: module.css（看板/统计卡/趋势图/筛选/徽章样式）**

```css
/* module.css — 项目追踪专属样式（不修改 app.css 共享定义） */
.pk-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px}
.pk-panels{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.pk-panel{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.pk-panel h3{font-size:14px;font-weight:600;color:var(--text);margin:0 0 10px}
.pk-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;color:var(--text)}
.pk-row .pk-name{width:80px;color:var(--muted)}
.pk-bar{height:8px;border-radius:4px;background:var(--line);flex:1;overflow:hidden}
.pk-bar i{display:block;height:100%;border-radius:4px;background:var(--brand)}
.pk-count{margin-left:auto;font-weight:600;min-width:24px;text-align:right}
.pk-trend{display:flex;align-items:flex-end;gap:6px;height:110px;padding-top:6px}
.pk-trend .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:4px}
.pk-trend .bar{width:100%;max-width:34px;background:var(--brand);border-radius:4px 4px 0 0;min-height:2px;transition:height .2s}
.pk-trend .wk{font-size:11px;color:var(--muted)}
.pk-trend .num{font-size:11px;color:var(--text)}
.pk-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.pk-filters fluent-select{width:150px}
.pk-table{width:100%;border-collapse:collapse}
.pk-table th,.pk-table td{padding:8px 10px;font-size:13px;text-align:left;border-bottom:1px solid var(--line)}
.pk-table th{color:var(--muted);font-weight:600;background:var(--bg)}
.pk-row-overdue{background:#fef2f2}
.pk-kanban{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.pk-col{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:10px;min-height:200px}
.pk-col h4{font-size:13px;font-weight:600;margin:0 0 10px;display:flex;justify-content:space-between;align-items:center}
.pk-card{background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:grab;box-shadow:0 1px 2px rgba(15,23,42,.06)}
.pk-card:active{cursor:grabbing}
.pk-card .t{font-size:13px;font-weight:600;color:var(--text);margin-bottom:6px}
.pk-card .m{display:flex;gap:6px;flex-wrap:wrap;font-size:11px;color:var(--muted)}
.pk-card.dragging{opacity:.5;transform:rotate(2deg)}
.pk-tag{display:inline-block;font-size:11px;padding:1px 8px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}
.pk-tag.h{color:#b91c1c;border-color:#fecaca;background:#fef2f2}
.pk-tag.m{color:#92400e;border-color:#fde68a;background:#fffbeb}
.pk-tag.l{color:#1e40af;border-color:#bfdbfe;background:#eff6ff}
@media(max-width:1199px){.pk-panels{grid-template-columns:1fr}}
@media(max-width:767px){.pk-kanban{grid-template-columns:1fr 1fr}}
@media(max-width:576px){.pk-kanban{grid-template-columns:1fr}.pk-filters fluent-select{width:100%}}
```

- [ ] **Step 4: dashboard.js（kb-stat 卡片 + 三维分布 + 趋势图）**

```js
// dashboard.js — 项目看板：统计卡（kb-stat 共享组件）+ 三维分布 + 近 8 周趋势
async function renderProjectDashboard() {
  const v = $('#view');
  v.innerHTML = '<div class="pk-stats" id="pk-stats"></div><div class="pk-panels" id="pk-panels"></div>';
  const s = await api('GET', PApi.stats);
  const stats = [
    { k: 'projects', n: s.project_count, l: '项目数', c: 'var(--brand)' },
    { k: 'total', n: s.total_tasks, l: '总任务', c: 'var(--brand)' },
    { k: 'done', n: s.done_count, l: '已完成', c: 'var(--ok)' },
    { k: 'doing', n: s.in_progress_count, l: '进行中', c: '#1d4ed8' },
    { k: 'overdue', n: s.overdue_count, l: '已延期', c: 'var(--bad)' }
  ];
  $('#pk-stats').innerHTML = stats.map(x =>
    '<fluent-card class="kb-stat"><span class="kb-bar" style="background:' + x.c + '"></span>' +
    '<span class="kb-n" style="color:' + x.c + '">' + x.n + '</span>' +
    '<span class="kb-l">' + x.l + '</span></fluent-card>').join('');
  // 三维分布（类别/优先级）+ 完成率 + 趋势
  const dist = (arr, cn, base) => arr.map(x =>
    '<div class="pk-row"><span class="pk-name">' + (cn[x.category || x.priority] || x.category || x.priority) + '</span>' +
    '<div class="pk-bar"><i style="width:' + Math.round(x.c / Math.max(base, 1) * 100) + '%"></i></div>' +
    '<span class="pk-count">' + x.c + '</span></div>').join('');
  const maxCat = Math.max.apply(null, s.category_dist.map(x => x.c).concat([1]));
  const maxPr = Math.max.apply(null, s.priority_dist.map(x => x.c).concat([1]));
  const maxTrend = Math.max.apply(null, s.trend.map(x => x.c).concat([1]));
  const trendHtml = s.trend.map(x =>
    '<div class="col"><span class="bar" style="height:' + Math.max(4, Math.round(x.c / maxTrend * 90)) + 'px"></span>' +
    '<span class="num">' + x.c + '</span><span class="wk">' + x.wk.slice(5) + '</span></div>').join('');
  $('#pk-panels').innerHTML =
    '<div class="pk-panel"><h3>类别分布</h3>' + dist(s.category_dist, CATEGORY_CN, maxCat) + '</div>' +
    '<div class="pk-panel"><h3>优先级分布</h3>' + dist(s.priority_dist, PRIORITY_CN, maxPr) + '</div>' +
    '<div class="pk-panel"><h3>完成率</h3><div class="pk-row"><span class="pk-name">整体</span>' +
    '<div class="pk-bar"><i style="width:' + s.completion_rate + '%"></i></div>' +
    '<span class="pk-count">' + s.completion_rate + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">未开始</span><span class="pk-count">' + s.not_started_count + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">已延期</span><span class="pk-count">' + s.overdue_count + '</span></div></div>' +
    '<div class="pk-panel"><h3>近 8 周完成趋势</h3><div class="pk-trend">' +
    (trendHtml || '<span class="pk-name">暂无数据</span>') + '</div></div>';
}
```

- [ ] **Step 5: index.html 确认 boot 初始化 + 版本号**

index.html 末尾 bundle 引用已含 `defer`；bundle 末尾追加 `window.addEventListener('hashchange',route);boot('项目追踪');`（由构建脚本 INIT 配置 `projects` 键：`"projects":"window.addEventListener('hashchange',route);boot('项目追踪');"`，修改 `tools/build-bundles.js` 的 INIT 对象）。module.css 版本号保持 `v=20260805a`。

`tools/build-bundles.js` 的 INIT 追加：

```js
  projects: "window.addEventListener('hashchange',route);boot('项目追踪');"
```

- [ ] **Step 6: 重建 bundle + 复制 + 版本号**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www bash -c 'node tools/build-bundles.js'
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A cp /tmp/bundle-projects.js subsystems/projects/frontend/js/bundle.js
sudo -A chown www:www subsystems/projects/frontend/js/bundle.js
VER=$(cat tools/.bundle-ver)
sudo -A -u www sed -i "s|bundle.js?v=__VER__|bundle.js?v=$VER|" subsystems/projects/frontend/index.html
grep 'bundle.js?v=' subsystems/projects/frontend/index.html
```

- [ ] **Step 7: 重启 + Commit**

```bash
# 重启（Task 1 Step 8 流程）
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects tools/build-bundles.js
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 前端骨架 + 项目看板（kb-stat统计卡 + 三维分布 + CSS趋势图）
"
```

---

## Task 9: 任务看板 Kanban（拖拽流转）

**Files:**
- Create: `subsystems/projects/frontend/js/views/kanban.js`（实现）
- Modify: `subsystems/projects/frontend/css/module.css`（看板列高亮等补充）
- Modify: `tests/projects.test.js`（可选：流转 API 已有覆盖，本 Task 以手动/browser_use 验证为主）

- [ ] **Step 1: 实现 kanban.js（HTML5 drag & drop）**

`subsystems/projects/frontend/js/views/kanban.js`：

```js
// kanban.js — 任务看板：4 列（未开始/进行中/已完成/已延期），拖拽流转（仅合法转移）
// 拖拽时依据 manifest 转移规则判定：同项目内单张卡，drop 到目标列即调 status API
async function renderTaskKanban() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters"><fluent-select id="kb-project" @change="kbLoad()">' +
    '<fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-button appearance="secondary" onclick="kbLoad()">刷新</fluent-button></div>' +
    '<div class="pk-kanban" id="pk-kanban"></div>';
  const projects = await api('GET', PApi.projects());
  const sel = $('#kb-project');
  for (const p of projects) {
    const opt = document.createElement('fluent-option');
    opt.value = String(p.id); opt.textContent = p.name;
    sel.appendChild(opt);
  }
  await kbLoad();
}

// 加载当前筛选下的全部任务并分组渲染
async function kbLoad() {
  const pid = $('#kb-project').value;
  const tasks = await api('GET', PApi.projectTasks(pid) + (pid ? '' : ''), undefined)
    .catch(async () => await api('GET', PApi.stats)); // 兼容：项目维度列表无值时降级
  let rows = tasks && Array.isArray(tasks) ? tasks : [];
  const cols = [
    { k: 'NOT_STARTED', t: '未开始' },
    { k: 'IN_PROGRESS', t: '进行中' },
    { k: 'DONE', t: '已完成' },
    { k: 'OVERDUE', t: '已延期' }
  ];
  const board = $('#pk-kanban');
  board.innerHTML = cols.map(c =>
    '<div class="pk-col" data-status="' + c.k + '" ondragover="kbDragOver(event)" ondrop="kbDrop(event)">' +
    '<h4>' + c.t + '<span>' + rows.filter(x => x.status === c.k).length + '</span></h4>' +
    '<div id="kb-col-' + c.k + '"></div></div>').join('');
  for (const c of cols) {
    const el = $('#kb-col-' + c.k);
    el.innerHTML = rows.filter(x => x.status === c.k).map(t =>
      '<div class="pk-card" draggable="true" data-id="' + t.id + '" data-status="' + t.status + '" ' +
      'ondragstart="kbDragStart(event)" ondragend="kbDragEnd(event)" ' +
      'onclick="location.hash=\'#/tasks/' + t.id + '\'">' +
      '<div class="t">' + t.title + '</div>' +
      '<div class="m"><span class="pk-tag ' + (t.priority || 'm').toLowerCase() + '">' +
      (PRIORITY_CN[t.priority] || t.priority) + '</span>' +
      '<span>' + (t.assignee_name || '未指派') + '</span>' +
      '<span>' + (t.planned_date ? fmt(t.planned_date) : '') + '</span></div></div>').join('');
  }
}

function kbDragStart(e) {
  e.dataTransfer.setData('text/plain', e.target.closest('.pk-card').dataset.id);
  e.target.closest('.pk-card').classList.add('dragging');
}
function kbDragEnd(e) {
  e.target.closest('.pk-card').classList.remove('dragging');
}
function kbDragOver(e) { e.preventDefault(); }

// 落子校验：同任务合法转移（后端 CAS 兜底），非法 toast 回弹
async function kbDrop(e) {
  e.preventDefault();
  const targetStatus = e.target.closest('.pk-col') ? e.target.closest('.pk-col').dataset.status : null;
  const id = e.dataTransfer.getData('text/plain');
  if (!targetStatus || !id) return;
  const ACTION_MAP = {
    'NOT_STARTED>IN_PROGRESS': 'START',
    'IN_PROGRESS>DONE': 'COMPLETE'
  };
  const card = document.querySelector('.pk-card[data-id="' + id + '"]');
  const from = card ? card.dataset.status : '';
  const action = ACTION_MAP[from + '>' + targetStatus];
  if (!action) { showToast('不允许的流转：' + (TASK_STATUS_CN[from] || from) + ' → ' + (TASK_STATUS_CN[targetStatus] || targetStatus), 'err'); kbLoad(); return; }
  try {
    await api('POST', PApi.task(id) + '/status', { action });
    showToast('流转成功');
  } catch (err) { showToast(err.message, 'err'); }
  kbLoad();
}
```

说明：
- 路由参数 `#/tasks/:id` 在 Task 10 的 router.js 中解析为任务详情（`location.hash='#/tasks/' + t.id` → 跳详情，不重载看板）。
- 非法流转（如 DONE→IN_PROGRESS、未完成前置的 START）由后端 400/409 兜底 + 前端 toast + 重新渲染回弹。

- [ ] **Step 2: module.css 追加拖拽反馈**

```css
.pk-col.drag-over{border-color:var(--brand);background:#f0fdfa}
```

（可选：在 kbDragOver 中加 `e.target.closest('.pk-col').classList.add('drag-over')`，kbDragEnd 时移除——保持简单，不加亦可。）

- [ ] **Step 3: 重建 bundle + 复制 + 版本号**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www bash -c 'node tools/build-bundles.js'
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A cp /tmp/bundle-projects.js subsystems/projects/frontend/js/bundle.js
sudo -A chown www:www subsystems/projects/frontend/js/bundle.js
VER=$(cat tools/.bundle-ver)
sudo -A -u www sed -i "s|bundle.js?v=[^\"']*|bundle.js?v=$VER|" subsystems/projects/frontend/index.html
grep 'bundle.js?v=' subsystems/projects/frontend/index.html
```

- [ ] **Step 4: 手动验证（browser_use）**

验证要点：
1. 项目看板 4 列渲染，卡片带优先级标签/责任人/计划日期
2. 拖拽「未开始」卡到「进行中」→ toast 流转成功，列计数 +1
3. 拖拽「已完成」卡到「进行中」→ toast 报错 + 卡片回弹
4. 单击卡片 → 跳转任务详情（Task 10 完成后验证）

- [ ] **Step 5: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 任务看板 Kanban（HTML5拖拽流转 + 非法流转回弹）
"
```

---

## Task 10: 前端剩余页面（项目/任务/详情/状态机管理）

**Files:**
- Create: `subsystems/projects/frontend/js/views/projects.js`（实现）
- Create: `subsystems/projects/frontend/js/views/list.js`（实现）
- Create: `subsystems/projects/frontend/js/views/task-detail.js`（实现）
- Create: `subsystems/projects/frontend/js/views/workflow.js`（实现）
- Modify: `subsystems/projects/frontend/js/router.js`（解析 `#/tasks/:id` 详情路由 + 加载详情状态）
- Modify: `subsystems/projects/frontend/css/module.css`（详情/表单补充样式）
- Modify: `tests/projects.test.js`（可选：详情接口已在 Task 3 覆盖，本 Task 以手动/browser_use 验证为主）

- [ ] **Step 1: router.js 支持详情路由**

`subsystems/projects/frontend/js/router.js` 的 `route()` 函数改为先匹配 `#/tasks/:id`：

```js
function route(){
  const raw = location.hash.replace('#/','');
  const parts = raw.split('/');
  const k = parts[0] || 'dashboard';
  // 任务详情：#/tasks/:id
  if (k === 'tasks' && parts[1]) {
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',false));
    $('#page-title').textContent = '任务详情';
    $('#page-actions').innerHTML = '';
    renderTaskDetail(Number(parts[1]));
    return;
  }
  const navItem = NAV.find(n=>n.k===k);
  if (navItem && !navItem.roles.includes(me.role)) { location.hash = '#/dashboard'; return; }
  const v = VIEWS[k] || renderProjectDashboard;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.k===k));
  const meta = { dashboard:'项目看板', kanban:'任务看板', list:'任务列表', projects:'项目列表', workflow:'状态机管理' };
  $('#page-title').textContent = meta[k] || '';
  $('#page-actions').innerHTML = '';
  v();
}
```

- [ ] **Step 2: projects.js（项目列表 CRUD + 成员管理）**

```js
// projects.js — 项目列表：卡片式展示 + 新建/编辑/删除 + 成员管理弹窗
async function renderProjects() {
  const v = $('#view');
  v.innerHTML = '<div class="pk-filters">' +
    '<fluent-button appearance="accent" onclick="projCreate()">新建项目</fluent-button></div>' +
    '<div class="pk-stats" id="proj-list"></div>';
  const list = await api('GET', PApi.projects());
  const canManage = me.role === 'ADMIN' || me.role === 'PM';
  $('#proj-list').innerHTML = list.map(p =>
    '<fluent-card class="kb-stat" data-k="' + p.id + '">' +
    '<span class="kb-bar" style="background:var(--brand)"></span>' +
    '<span class="kb-n" style="font-size:16px">' + p.name + '</span>' +
    '<span class="kb-l">任务 ' + p.task_count + ' · 完成 ' + p.done_count + '</span>' +
    (canManage
      ? '<span class="kb-x"><fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projEdit(' + p.id + ')">编辑</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projMembers(' + p.id + ')">成员</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="event.stopPropagation();projDel(' + p.id + ',\'' + p.name + '\')">删除</fluent-button></span>'
      : '') +
    '</fluent-card>').join('');
  // 单击项目 → 跳任务列表并筛选该项目
  document.querySelectorAll('#proj-list .kb-stat').forEach(el => {
    el.onclick = () => location.hash = '#/list?project=' + el.dataset.k;
  });
}

// 新建项目弹窗
async function projCreate() {
  const name = prompt('项目名称（必填）');
  if (name === null) return;
  const desc = prompt('项目描述（可空）') || '';
  try { await api('POST', PApi.projects(), { name, description: desc }); showToast('创建成功'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 编辑项目弹窗
async function projEdit(id) {
  const p = await api('GET', PApi.projects(id));
  const name = prompt('项目名称', p.name);
  if (name === null) return;
  const desc = prompt('项目描述', p.description || '') || '';
  try { await api('PUT', PApi.projects(id), { name, description: desc }); showToast('已保存'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 删除项目（有任务时后端 409）
async function projDel(id, name) {
  if (!confirm('确认删除项目「' + name + '」？（项目下有任务时将被拒绝）')) return;
  try { await api('DELETE', PApi.projects(id)); showToast('已删除'); renderProjects(); }
  catch (e) { showToast(e.message, 'err'); }
}

// 成员管理弹窗（列表 + 添加 + 转让 owner + 移除）
async function projMembers(id) {
  const [mem, users] = await Promise.all([
    api('GET', PApi.projects(id) + '/members'),
    api('GET', '/api/users')  // 共享用户列表接口（需确认存在；若无则改用后端提供 /api/projects/users）
  ]);
  const lines = mem.map(m =>
    '<div class="pk-row"><span class="pk-name">' + (m.display_name || m.username) + '</span>' +
    '<span>' + (m.is_owner ? '负责人' : '成员') + '</span>' +
    (m.is_owner
      ? ''
      : '<fluent-button appearance="secondary" size="small" onclick="memTransfer(' + id + ',' + m.user_id + ')">转让</fluent-button> ' +
        '<fluent-button appearance="secondary" size="small" onclick="memRemove(' + id + ',' + m.user_id + ')">移除</fluent-button>') +
    '</div>').join('');
  const opts = users.filter(u => !mem.some(m => m.user_id === u.id))
    .map(u => '<fluent-option value="' + u.id + '">' + (u.display_name || u.username) + '</fluent-option>').join('');
  openModal('成员管理', lines +
    '<div class="pk-filters"><fluent-select id="mem-user">' + opts + '</fluent-select>' +
    '<fluent-button appearance="accent" onclick="memAdd(' + id + ')">添加</fluent-button></div>');
}
async function memAdd(id) {
  const uid = $('#mem-user').value;
  if (!uid) return showToast('请选择用户');
  try { await api('POST', PApi.projects(id) + '/members', { user_id: Number(uid) }); showToast('已添加'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memTransfer(id, uid) {
  try { await api('PUT', PApi.projects(id) + '/members/' + uid, { is_owner: 1 }); showToast('已转让'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
async function memRemove(id, uid) {
  if (!confirm('确认移除该成员？')) return;
  try { await api('DELETE', PApi.projects(id) + '/members/' + uid); showToast('已移除'); projMembers(id); }
  catch (e) { showToast(e.message, 'err'); }
}
```

说明：`/api/users` 为共享用户列表接口（routes/misc.js 已有，ADMIN 可见）；若 PM 无权查看，需后端在 routes-stats.js 增加 `GET /api/projects/users`（返回所有可用用户 id/display_name/username，仅 ADMIN/PM）。执行时以实际接口为准，缺失则补最小接口。

- [ ] **Step 3: list.js（任务列表 + 筛选 + CSV 导出 + OVERDUE 高亮）**

```js
// list.js — 任务列表：跨项目筛选（项目/类别/优先级/状态/延期）+ CSV 导出 + 延期行高亮
async function renderTaskList() {
  const v = $('#view');
  v.innerHTML =
    '<div class="pk-filters">' +
    '<fluent-select id="lk-project"><fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-select id="lk-status"><fluent-option value="">全部状态</fluent-option>' +
    '<fluent-option value="NOT_STARTED">未开始</fluent-option><fluent-option value="IN_PROGRESS">进行中</fluent-option>' +
    '<fluent-option value="DONE">已完成</fluent-option><fluent-option value="OVERDUE">已延期</fluent-option></fluent-select>' +
    '<fluent-button appearance="secondary" onclick="lkLoad()">查询</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="location.href=\'' + PApi.exportCsv + '\'">导出 CSV</fluent-button></div>' +
    '<table class="pk-table" id="lk-table"><thead><tr>' +
    '<th>项目</th><th>任务</th><th>类别</th><th>优先级</th><th>责任人</th><th>状态</th><th>进度</th><th>计划日期</th><th>操作</th>' +
    '</tr></thead><tbody></tbody></table>';
  const projects = await api('GET', PApi.projects());
  const sel = $('#lk-project');
  for (const p of projects) {
    const opt = document.createElement('fluent-option');
    opt.value = String(p.id); opt.textContent = p.name;
    sel.appendChild(opt);
  }
  // 支持 #/list?project=xxx 跳转预选
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  if (qs.get('project')) sel.value = qs.get('project');
  await lkLoad();
}

async function lkLoad() {
  const qs = new URLSearchParams();
  const pid = $('#lk-project').value;
  if (pid) qs.set('project_id', pid);
  const st = $('#lk-status').value;
  if (st) qs.set('status', st);
  const rows = await api('GET', PApi.task(0).replace('/tasks/0', '/tasks') + (qs.toString() ? '?' + qs : ''));
  const tbody = document.querySelector('#lk-table tbody');
  tbody.innerHTML = rows.map(t =>
    '<tr class="' + (t.status === 'OVERDUE' ? 'pk-row-overdue' : '') + '">' +
    '<td>' + t.project_name + '</td>' +
    '<td><a href="#/tasks/' + t.id + '">' + t.title + '</a></td>' +
    '<td>' + (CATEGORY_CN[t.category] || t.category) + '</td>' +
    '<td><span class="pk-tag ' + (t.priority || 'm').toLowerCase() + '">' + (PRIORITY_CN[t.priority] || t.priority) + '</span></td>' +
    '<td>' + (t.assignee_name || '未指派') + '</td>' +
    '<td>' + (TASK_STATUS_CN[t.status] || t.status) + '</td>' +
    '<td>' + t.progress + '%</td>' +
    '<td>' + fmt(t.planned_date) + '</td>' +
    '<td><a href="#/tasks/' + t.id + '">详情</a></td></tr>').join('');
}
```

- [ ] **Step 4: task-detail.js（详情全功能：信息/子任务/依赖/评论/附件/关联/日志）**

```js
// task-detail.js — 任务详情：主信息卡 + 子任务（三态流转）+ 依赖 + 评论 + 附件 + 关联 + 留痕
let _tid = 0;
async function renderTaskDetail(tid) {
  _tid = tid;
  const v = $('#view');
  v.innerHTML = '<div class="pk-panels" id="td-main"><div class="pk-panel" id="td-info">加载中…</div></div>';
  await tdLoad();
}

async function tdLoad() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  const canEdit = ['ADMIN', 'PM'].includes(me.role);
  const info =
    '<h3>' + t.title + '</h3>' +
    '<div class="pk-row"><span class="pk-name">状态</span><span>' + (TASK_STATUS_CN[t.status] || t.status) +
    ' · 进度 ' + t.progress + '%</span></div>' +
    '<div class="pk-row"><span class="pk-name">项目</span><span>' + t.project_id + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">类别</span><span>' + (CATEGORY_CN[t.category] || t.category) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">优先级</span><span>' + (PRIORITY_CN[t.priority] || t.priority) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">责任人</span><span>' + (t.assignee_name || '未指派') + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">计划日期</span><span>' + fmt(t.planned_date) + '</span></div>' +
    '<div class="pk-row"><span class="pk-name">实际日期</span><span>' + fmt(t.actual_date) + '</span></div>' +
    (t.description ? '<div class="pk-row"><span class="pk-name">描述</span><span>' + t.description + '</span></div>' : '') +
    (t.solution ? '<div class="pk-row"><span class="pk-name">方案</span><span>' + t.solution + '</span></div>' : '') +
    (t.notes ? '<div class="pk-row"><span class="pk-name">备注</span><span>' + t.notes + '</span></div>' : '') +
    (canEdit ? '<div class="pk-filters"><fluent-button appearance="secondary" size="small" onclick="tdEdit()">编辑</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddSub()">加子任务</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddDep()">加依赖</fluent-button>' +
      '<fluent-button appearance="secondary" size="small" onclick="tdAddLink()">关联样品/治具</fluent-button></div>' : '') +
    '<div class="pk-panel" style="margin-top:14px"><h3>子任务</h3><div id="td-subs"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>依赖</h3><div id="td-deps"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>评论</h3><div id="td-comments"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>附件</h3><div id="td-files"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>关联对象</h3><div id="td-links"></div></div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>操作日志</h3><div id="td-logs"></div></div>';
  $('#td-info').innerHTML = info;
  // 子任务（三态 + CAS 流转按钮）
  $('#td-subs').innerHTML = d.subtasks.map(s =>
    '<div class="pk-row"><span class="pk-name">' + s.title + '</span>' +
    '<span>' + (SUBTASK_STATUS_CN[s.status] || s.status) + '</span>' +
    (s.status === 'NOT_STARTED' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'START\')">开始</fluent-button>' : '') +
    (s.status === 'IN_PROGRESS' ? '<fluent-button size="small" onclick="tdSubAction(' + s.id + ',\'COMPLETE\')">完成</fluent-button>' : '') +
    '</div>').join('') || '<span class="pk-name">无子任务</span>';
  // 依赖
  $('#td-deps').innerHTML = d.deps.map(x =>
    '<div class="pk-row"><span class="pk-name">↳ ' + x.depends_on_title + '</span></div>').join('') || '<span class="pk-name">无前置依赖</span>';
  // 评论（输入框 + 列表）
  $('#td-comments').innerHTML =
    '<div class="pk-filters"><input id="td-cmt" placeholder="写评论…" style="flex:1;min-width:180px">' +
    '<fluent-button appearance="accent" size="small" onclick="tdAddComment()">发送</fluent-button></div>' +
    d.comments.map(c => '<div class="pk-row"><span class="pk-name">' + (c.operator_name || '—') + '</span><span>' + c.content + '</span></div>').join('');
  // 附件
  $('#td-files').innerHTML =
    '<div class="pk-filters"><input type="file" id="td-file"><fluent-button appearance="accent" size="small" onclick="tdUploadFile()">上传</fluent-button></div>' +
    d.files.map(f => '<div class="pk-row"><span class="pk-name"><a href="/uploads/projects/' + f.file_path + '" target="_blank">' + f.file_name + '</a></span></div>').join('');
  // 关联
  $('#td-links').innerHTML = d.links.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.ref_type === 'sample' ? '样品' : '治具') + '</span>' +
    '<span>' + (l.ref_no || l.ref_id) + ' ' + (l.ref_name || '') + '</span></div>').join('') || '<span class="pk-name">未关联</span>';
  // 日志
  $('#td-logs').innerHTML = d.logs.map(l =>
    '<div class="pk-row"><span class="pk-name">' + (l.operator_name || '—') + '</span><span>' + l.action + '</span><span>' + (l.detail || '') + '</span></div>').join('');
}

// 编辑任务（prompt 简化；版本号取当前任务 version 自增感知——严格用法：详情返回 version 后回传）
async function tdEdit() {
  const d = await api('GET', PApi.task(_tid));
  const t = d.task;
  const title = prompt('任务名称', t.title);
  if (title === null) return;
  const priority = prompt('优先级 H/M/L', t.priority || 'M');
  const body = { title, priority, version: t.version };
  try { await api('PUT', PApi.task(_tid), body); showToast('已保存'); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdSubAction(sid, action) {
  try { await api('POST', PApi.taskSub(_tid, sid) + '/status', { action }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddSub() {
  const title = prompt('子任务名称');
  if (!title) return;
  try { await api('POST', PApi.taskSub(_tid), { title }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddDep() {
  const depId = prompt('前置任务 ID');
  if (!depId) return;
  try { await api('POST', PApi.taskDeps(_tid), { depends_on_id: Number(depId) }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddLink() {
  const refType = prompt('关联类型 sample/fixture', 'sample');
  const refId = prompt('对象 ID');
  if (!refId) return;
  try { await api('POST', PApi.taskLinks(_tid), { ref_type: refType, ref_id: Number(refId) }); tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdAddComment() {
  const content = $('#td-cmt').value.trim();
  if (!content) return;
  try { await api('POST', PApi.taskComments(_tid), { content }); $('#td-cmt').value = ''; tdLoad(); }
  catch (e) { showToast(e.message, 'err'); }
}
async function tdUploadFile() {
  const f = $('#td-file').files[0];
  if (!f) return showToast('请选择文件');
  const fd = new FormData();
  fd.append('file', f);
  try {
    await fetch(PApi.taskFiles(_tid), { method: 'POST', credentials: 'include', body: fd });
    showToast('上传成功'); tdLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
```

说明：编辑/详情使用 `PApi.task(_tid)` 等已定义端点；`PApi.task(0).replace(...)` 为 list.js 中跨项目列表 URL 拼接的辅助写法——执行时若混乱，直接写死 `'/api/projects/tasks'`。

- [ ] **Step 5: workflow.js（状态机管理面板，仅 ADMIN）**

```js
// workflow.js — 状态机管理：读取/保存 4 态 + 转移配置（ADMIN）
async function renderWorkflow() {
  const v = $('#view');
  if (me.role !== 'ADMIN') { v.innerHTML = '<p>仅管理员可访问</p>'; return; }
  const wf = await api('GET', PApi.workflow);
  const stateHtml = Object.keys(wf.states).map(k => {
    const s = wf.states[k];
    return '<div class="pk-row"><span class="pk-name">' + k + '</span>' +
      '<input id="wf-st-' + k + '" value="' + s.label + '" style="flex:1;min-width:120px">' +
      '<input type="color" id="wf-c-' + k + '" value="' + (s.color || '#000000') + '"></div>';
  }).join('');
  const trHtml = wf.transitions.map((t, i) =>
    '<div class="pk-row"><span class="pk-name">' + (t.from || '') + ' → ' + (t.to || '') + '</span>' +
    '<input id="wf-tr-' + i + '" value="' + (t.label || '') + '" style="flex:1;min-width:120px"></div>').join('');
  v.innerHTML =
    '<div class="pk-panel"><h3>状态定义</h3>' + stateHtml + '</div>' +
    '<div class="pk-panel" style="margin-top:14px"><h3>转移规则</h3>' + trHtml + '</div>' +
    '<div class="pk-filters" style="margin-top:14px"><fluent-button appearance="accent" onclick="wfSave()">保存配置</fluent-button></div>';
  window._wf = wf;
}

async function wfSave() {
  const wf = window._wf;
  const states = {};
  for (const k of Object.keys(wf.states)) {
    states[k] = { label: $('#wf-st-' + k).value, color: $('#wf-c-' + k).value, bg: wf.states[k].bg };
  }
  const transitions = wf.transitions.map((t, i) =>
    Object.assign({}, t, { label: $('#wf-tr-' + i).value }));
  try {
    await api('PUT', PApi.workflow, { states, transitions, initial: wf.initial });
    showToast('配置已保存并生效'); renderWorkflow();
  } catch (e) { showToast(e.message, 'err'); }
}
```

- [ ] **Step 6: module.css 追加详情/表单样式**

```css
.pk-row input[type=text],.pk-row input[type=color]{height:28px;border:1px solid var(--line);border-radius:6px;padding:0 8px}
.pk-row input[type=color]{width:40px;padding:2px}
.pk-panel a{color:var(--brand);text-decoration:none}
.pk-panel a:hover{text-decoration:underline}
```

- [ ] **Step 7: 重建 bundle + 复制 + 版本号 + 重启**

```bash
cd /www/wwwroot/sample-mgmt && sudo -A -u www bash -c 'node tools/build-bundles.js'
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A cp /tmp/bundle-projects.js subsystems/projects/frontend/js/bundle.js
sudo -A chown www:www subsystems/projects/frontend/js/bundle.js
VER=$(cat tools/.bundle-ver)
sudo -A -u www sed -i "s|bundle.js?v=[^\"']*|bundle.js?v=$VER|" subsystems/projects/frontend/index.html
# 重启（Task 1 Step 8 流程）
```

- [ ] **Step 8: browser_use 验证**

验证要点：
1. 项目列表渲染 + 新建项目 → 成员管理弹窗添加/转让/移除
2. 任务列表筛选（项目/状态）+ OVERDUE 高亮行 + 导出 CSV（下载含 BOM）
3. 任务详情：子任务流转、评论发送、附件上传、关联展示、日志列表
4. 状态机管理（admin）：改状态标签/转移标签 → 保存 → 看板反映
5. 响应式：<576px 单栏不溢出

- [ ] **Step 9: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 前端页面全集（项目CRUD+成员 / 任务列表筛选导出高亮 / 任务详情全功能 / 状态机管理面板）
"
```

---

## Task 11: 种子数据 + 端到端回归验证

**Files:**
- Create: `subsystems/projects/seed/seed.js`（实现）
- Modify: `tests/projects.test.js`（追加全量用例运行确认）
- Modify: `docs/superpowers/plans/2026-08-05-project-tracking.md`（本文件完成后归档流程）

- [ ] **Step 1: 实现 seed.js（幂等 + 退出前 process.exit(0)）**

`subsystems/projects/seed/seed.js`：

```js
// subsystems/projects/seed/seed.js — 项目追踪种子数据（幂等：项目名存在则跳过）
// 测试数据：2 项目、6 任务（4 态覆盖）、子任务/依赖/评论/附件/关联/日志
const bcrypt = require('bcryptjs');

async function seed(pool) {
  const q = async (sql, params) => (await pool.execute(sql, params || []))[0];
  const one = async (sql, params) => {
    const rows = await q(sql, params);
    return rows.length ? rows[0] : undefined;
  };

  // 用户（复用/创建：pm01 项目经理）
  let pm = await one('SELECT * FROM users WHERE username=?', ['pm01']);
  if (!pm) {
    await q('INSERT INTO users (username,password_hash,role,dept,display_name) VALUES (?,?,?,?,?)',
      ['pm01', bcrypt.hashSync('pm123', 10), 'PM', '项目部', '项目经理']);
    pm = await one('SELECT * FROM users WHERE username=?', ['pm01']);
  }
  const rd = await one('SELECT * FROM users WHERE username=?', ['rd01']);
  const qa = await one('SELECT * FROM users WHERE username=?', ['qa01']);
  const me = await one('SELECT * FROM users WHERE username=?', ['me01']);
  const admin = await one('SELECT * FROM users WHERE username=?', ['admin']);

  // 项目 P1（含任务 + 成员）
  let p1 = await one('SELECT * FROM projects WHERE name=?', ['P1-新品导入']);
  if (!p1) {
    const r = await q('INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)',
      ['P1-新品导入', '样品 A 量产导入', 'ACTIVE', pm.id]);
    p1 = { id: r.insertId };
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,1)', [p1.id, pm.id]);
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,0)', [p1.id, rd.id]);
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,0)', [p1.id, qa.id]);
  }

  // 项目 P2（空项目，验证 409 删除保护）
  let p2 = await one('SELECT * FROM projects WHERE name=?', ['P2-治具改善']);
  if (!p2) {
    const r = await q('INSERT INTO projects (name,description,status,created_by) VALUES (?,?,?,?)',
      ['P2-治具改善', '治具寿命提升改善', 'ACTIVE', pm.id]);
    p2 = { id: r.insertId };
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,1)', [p2.id, pm.id]);
    await q('INSERT INTO project_members (project_id,user_id,is_owner) VALUES (?,?,0)', [p2.id, me.id]);
  }

  // 任务：4 态全覆盖（NOT_STARTED / IN_PROGRESS / DONE / OVERDUE）
  const tasks = [
    { project_id: p1.id, title: 'T1-样品A测试验证', category: 'quality', priority: 'H', assignee_id: qa.id, planned_date: '2026-08-20', status: 'IN_PROGRESS', progress: 60, solution: '已完成首轮测试' },
    { project_id: p1.id, title: 'T2-产线SOP编制', category: 'process', priority: 'M', assignee_id: rd.id, planned_date: '2026-08-25', status: 'NOT_STARTED', progress: 0, solution: '' },
    { project_id: p1.id, title: 'T3-物料确认', category: 'device', priority: 'L', assignee_id: rd.id, planned_date: '2026-07-20', status: 'DONE', progress: 100, actual_date: '2026-07-18' },
    { project_id: p1.id, title: 'T4-安全评估', category: 'safety', priority: 'H', assignee_id: me.id, planned_date: '2026-06-30', status: 'OVERDUE', progress: 30, solution: '延期，等待产线评估' },
    { project_id: p1.id, title: 'T5-样品B关联任务', category: 'other', priority: 'M', assignee_id: qa.id, planned_date: '2026-09-01', status: 'NOT_STARTED', progress: 0 },
    { project_id: p2.id, title: 'T6-治具寿命测试', category: 'quality', priority: 'M', assignee_id: me.id, planned_date: '2026-09-10', status: 'NOT_STARTED', progress: 0 }
  ];
  const taskIds = {};
  for (const t of tasks) {
    const exist = await one('SELECT * FROM project_tasks WHERE title=?', [t.title]);
    if (exist) { taskIds[t.title] = exist.id; continue; }
    const r = await q(
      'INSERT INTO project_tasks (project_id,title,category,priority,assignee_id,planned_date,actual_date,status,progress,solution,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [t.project_id, t.title, t.category, t.priority, t.assignee_id, t.planned_date, t.actual_date || null, t.status, t.progress, t.solution, pm.id]);
    taskIds[t.title] = r.insertId;
    await q('INSERT INTO project_logs (entity_type,entity_id,action,detail,operator_id) VALUES (?,?,?,?,?)',
      ['task', r.insertId, 'CREATE', JSON.stringify({ title: t.title }), pm.id]);
  }

  // T1 附加：子任务 + 依赖 + 评论 + 附件记录 + 关联样品
  const t1 = taskIds['T1-样品A测试验证'];
  const sub = await one('SELECT * FROM project_subtasks WHERE task_id=? AND title=?', [t1, '功能测试']);
  if (!sub) {
    await q('INSERT INTO project_subtasks (task_id,title,assignee_id,status,planned_date,created_by) VALUES (?,?,?,?,?,?)',
      [t1, '功能测试', qa.id, 'IN_PROGRESS', '2026-08-15', pm.id]);
  }
  const dep = await one('SELECT * FROM project_task_deps WHERE task_id=? AND depends_on_id=?', [t1, taskIds['T3-物料确认']]);
  if (!dep) {
    await q('INSERT INTO project_task_deps (task_id,depends_on_id,created_by) VALUES (?,?,?)',
      [t1, taskIds['T3-物料确认'], pm.id]);
  }
  const cmt = await one('SELECT * FROM project_task_comments WHERE task_id=?', [t1]);
  if (!cmt) {
    await q('INSERT INTO project_task_comments (task_id,content,operator_id) VALUES (?,?,?)',
      [t1, '首轮测试完成，等待物料确认', qa.id]);
  }
  const link = await one('SELECT * FROM project_task_links WHERE task_id=? AND ref_type=?', [t1, 'sample']);
  if (!link) {
    const s = await one('SELECT id FROM samples ORDER BY id LIMIT 1');
    if (s) await q('INSERT INTO project_task_links (task_id,ref_type,ref_id) VALUES (?,?,?)', [t1, 'sample', s.id]);
  }

  console.log('[projects-seed] 完成: 2 项目 / 6 任务 / 子任务+依赖+评论+关联');
}

module.exports = seed;
```

- [ ] **Step 2: 执行种子（独立脚本，显式退出防挂起）**

```bash
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && node -e "
require(\"dotenv\").config();
const D = require(\"./db\");
(async () => {
  await D.ready;
  await require(\"./subsystems/projects/seed/seed\")(D.pool());
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
"'
```

Expected: `[projects-seed] 完成: 2 项目 / 6 任务 / 子任务+依赖+评论+关联`，命令正常退出（无挂起）。

- [ ] **Step 3: 全量测试回归**

```bash
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js 2>&1 | tail -40'
```

Expected: 全部用例 PASS（Task 2-7 累计 ~25 用例）。若因种子数据导致断言计数变化（如 project_count），调整断言为 `toBeGreaterThan` 等宽松形式。

- [ ] **Step 4: browser_use 端到端回归**

验证清单（覆盖 5 导航 + 详情 + 看板 + 响应式）：

| # | 场景 | 通过标准 |
|---|---|---|
| 1 | 登录 pm01 → 项目看板 | kb-stat 5 卡 + 类别/优先级/完成率/趋势渲染 |
| 2 | 任务看板 | 4 列分组正确，计数 = 1/1/1/1 |
| 3 | 拖拽 T1「进行中→已完成」 | toast 成功；回拖「已完成→进行中」→ 报错回弹 |
| 4 | 任务列表 | 筛选 OVERDUE → T4 行红色高亮；导出 CSV 含 BOM |
| 5 | 任务详情 T1 | 子任务/依赖/评论/附件/关联/日志 6 区块齐全 |
| 6 | 项目列表 | 新建 P3 → 成员管理（添加 rd01/转让 owner/移除）→ 删除空项目 |
| 7 | 状态机管理（admin） | 改「进行中」标签 → 保存 → 看板/列表文案同步 |
| 8 | 响应式 | 375px 视口无横向滚动；看板单列 |
| 9 | 子系统隔离 | 样品管理、治具管理、工作台三系统页面正常（框架共享文件未动，快速抽查） |

- [ ] **Step 5: 输出文件臃肿检测报告 + Commit**

按 AGENTS.md §9 对本次改动文件输出容量/元素/冗余报告，然后：

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/projects
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "feat(projects): 种子数据（2项目6任务四态覆盖 + 子任务/依赖/评论/关联）+ 端到端回归
"
```

- [ ] **Step 6: 更新文档 + 归档**

1. `README.md`：新增「项目追踪」子系统说明（入口 URL、PM 账号、功能清单）
2. 设计文档与实现计划在部署稳定后归档至 `docs/archive/`（遵循 AGENTS.md §5 迭代归档流程）
3. 提示上线后 1~3 周期监控：任务流转并发 409 频率、CSV 导出大文件耗时、看板统计 SQL 慢查询

---

## 计划自审记录（Self-Review）

- **Spec 覆盖**：设计文档 11 章 → 本计划 Task 对照：
  - §3 架构 → Task 1 骨架 + 插件协议
  - §4 数据模型（10 表）→ Task 1 schema.sql 全表
  - §5 状态机（4 态 + manifest 声明）→ Task 1 manifest + Task 4 流转引擎
  - §6 角色权限（ADMIN/PM/owner/member/伪角色）→ Task 2 permissions + Task 4 resolveRole
  - §7 前端页面（看板/列表/详情/状态机管理）→ Task 8/9/10
  - §8 API 清单（17+ 端点）→ Task 2-7 全部路由
  - §9 并发防护 9.1-9.6（CAS/乐观锁/行锁/同事务留痕/依赖原子校验/弱一致统计）→ Task 3/4/6/7
  - §10 测试计划 → 各 Task TDD + Task 11 回归
- **占位符扫描**：无 "TBD/TODO/implement later"；每步含完整代码或明确命令。
- **类型一致性**：`D.fetchOne/fetchAll`（dao.js 骨架定义）在所有 Task 一致使用；`PApi.task(id)`、`PApi.projectTasks(pid)` 前端端点与后端路由一致；`D.addProjectLog`、`D.withTransaction` 命名在 Task 2 定义后全篇统一；伪角色 `ASSIGNEE/MEMBER/SYSTEM` 与 manifest transitions role 字段一致。