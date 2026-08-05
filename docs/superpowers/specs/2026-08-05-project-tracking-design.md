# 项目追踪子系统设计文档（全量版）

> 日期：2026-08-05（v2，功能补充确认后更新）
> 参考：`docs/通用项目追踪模板.xlsx`（追踪总表 / 统计看板 / 使用说明 三 sheet）
> 状态：已获用户设计确认（含并发防护 + 全量功能补充）

## 1. 背景与目标

将 Excel 版「项目问题追踪模板」线上化为独立子系统，覆盖模板全部能力，并升级为**全量项目追踪**：多项目两级结构、PM 角色 + 项目成员权限、配置化状态机、Kanban 看板、子任务与任务依赖、任务评论、附件与跨子系统关联、全量留痕、统计看板与进度趋势、Excel 导出、延期预警。

## 2. 需求确认记录

| 决策点 | 结论 |
|---|---|
| 数据层级 | 多项目（项目 + 任务两级） |
| 权限模型 | 新增 PM 角色（第 6 角色）全局管理 + 项目内成员（负责人/成员）管理；其余角色只读 + 流转自己名下任务 |
| 状态与留痕 | 配置化状态机（manifest 声明 + ADMIN 表单式管理面板）+ 全量操作留痕 |
| 能力 | 任务附件上传 + 关联样品/治具 |
| 状态机实现级别 | 方案 1+：配置化 + 管理面板（不做运行时拖拽画布，已评估 3~5 倍成本） |
| **功能补充（v2）** | Kanban 看板视图、任务评论、子任务拆分、任务依赖（前置）、Excel 导出、延期预警、项目成员管理、进度趋势图——**全部纳入本次** |

## 3. 架构总览

遵循子系统插件协议（AGENTS.md 第 17 节）新增 `subsystems/projects/`：

```
subsystems/projects/
├── manifest.json          # 元数据 + 状态机声明 + 导航 + 角色 + 文件配置
├── backend/index.js       # register(app) / initDB() / seed()
├── backend/workflow-config.js  # 状态机配置读写（存库，运行时读取）
├── db/schema.sql          # 建表 DDL（幂等）
├── db/dao.js              # 数据访问层
├── frontend/index.html    # SPA 入口
├── frontend/js/           # views/ + router.js（bundle 构建）
└── seed/seed.js           # 测试数据（导出 seed(pool)）
```

框架自动发现挂载，门户卡片/导航/建表零框架改动。

## 4. 数据模型

### 4.1 projects（项目，一级）

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
```

> 项目负责人由 `project_members.is_owner` 表达（4.6），不设 owner_id 冗余列。

### 4.2 project_tasks（问题/任务，二级）

```sql
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
```

### 4.3 project_subtasks（子任务，任务下三级）

```sql
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
```

> 子任务状态简化为三态（无 OVERDUE 派生）；父任务详情展示子任务完成率，父任务 progress 支持手动覆盖。

### 4.4 project_task_comments（任务评论）

```sql
CREATE TABLE IF NOT EXISTS project_task_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL,
  content TEXT NOT NULL,
  operator_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_task (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.5 project_task_deps（任务依赖，前置）

```sql
CREATE TABLE IF NOT EXISTS project_task_deps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL COMMENT '被阻塞任务',
  depends_on_id INT NOT NULL COMMENT '前置任务',
  created_by INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dep (task_id, depends_on_id),
  KEY idx_depends (depends_on_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 环检测（A→B→A 禁止）在 API 层执行；被依赖任务未 DONE 时，任务**流转到 IN_PROGRESS/DONE 被阻塞**（409），编辑不受影响。

### 4.6 project_members（项目成员）

```sql
CREATE TABLE IF NOT EXISTS project_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  user_id INT NOT NULL,
  is_owner TINYINT NOT NULL DEFAULT 0 COMMENT '1=项目负责人',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_member (project_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

> 建项目时创建人自动成为 owner；owner/ADMIN 可增删成员、转让 owner。

### 4.7 project_task_files（附件，复用框架 file-manager 机制）

```sql
CREATE TABLE IF NOT EXISTS project_task_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL, file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL, size INT, uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.8 project_task_links（关联样品/治具）

```sql
CREATE TABLE IF NOT EXISTS project_task_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  task_id INT NOT NULL, ref_type VARCHAR(10) NOT NULL COMMENT 'sample/fixture',
  ref_id INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_link (task_id, ref_type, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.9 project_logs（全量留痕）

```sql
CREATE TABLE IF NOT EXISTS project_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  entity_type VARCHAR(10) NOT NULL COMMENT 'project/task/subtask/comment/member/config',
  entity_id INT NOT NULL,
  action VARCHAR(30) NOT NULL COMMENT 'CREATE/UPDATE/DELETE/STATUS_CHANGE/CONFIG/LINK/COMMENT',
  detail TEXT COMMENT '变更摘要（JSON）',
  operator_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.10 project_workflow（状态机配置，存库热生效）

```sql
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

**规则约束**（服务端强制 + 前端提示）：
- 状态「DONE」→ progress 强制 100 + actual_date 必填（模板使用说明第 5 条）
- progress 范围 0~100 整数
- 「OVERDUE（已延期）」为派生态：`planned_date < 今天 且 status NOT IN ('DONE')`，系统自动判定，不可手动选择
- **延期预警**：planned_date 距今 ≤3 天且未完成 → 临期提醒；已超期 → 已延期。看板/列表高亮（badge + 背景）

## 5. 状态机（manifest 声明 + ADMIN 表单式管理面板）

### 5.1 语义固定

```
NOT_STARTED(未开始) → IN_PROGRESS(进行中) → DONE(已完成)
OVERDUE(已延期)：派生态，由系统判定
```

### 5.2 manifest 声明（初始值）

```jsonc
"stateMachine": {
  "initial": "NOT_STARTED",
  "states": {
    "NOT_STARTED": { "label": "未开始", "color": "#92400e", "bg": "#fffbeb" },
    "IN_PROGRESS": { "label": "进行中", "color": "#1d4ed8", "bg": "#eff6ff" },
    "DONE":        { "label": "已完成", "color": "#065f46", "bg": "#ecfdf5" },
    "OVERDUE":     { "label": "已延期", "color": "#b91c1c", "bg": "#fef2f2" }
  },
  "transitions": [
    { "from": "NOT_STARTED", "to": "IN_PROGRESS", "action": "START", "role": ["PM","ADMIN","MEMBER","ASSIGNEE"], "label": "开始处理" },
    { "from": "IN_PROGRESS", "to": "DONE", "action": "COMPLETE", "role": ["PM","ADMIN","MEMBER","ASSIGNEE"], "label": "标记完成" },
    { "from": "NOT_STARTED", "to": "OVERDUE", "action": "AUTO_OVERDUE", "role": ["SYSTEM"], "label": "自动延期" },
    { "from": "IN_PROGRESS", "to": "OVERDUE", "action": "AUTO_OVERDUE", "role": ["SYSTEM"], "label": "自动延期" }
  ]
}
```

> `ASSIGNEE`/`MEMBER` 为伪角色：运行时解析为「任务 assignee_id === 当前用户」/「当前用户 ∈ 该项目成员」。OVERDUE 恢复处理由 PM/ADMIN/项目成员通过编辑直接改回，不留系统转移。

### 5.3 ADMIN 表单式管理面板

- **可配置项**：状态 badge 颜色/标签文案、转移规则的角色权限、初始状态
- **固定项**：4 态语义与转移拓扑（不可增删状态节点/转移边，防止破坏看板统计与延期规则）
- 存储 `project_workflow` 表，**保存即生效**（后端状态机与前端下拉/看板/badge 运行时读取 `GET /api/projects/workflow`）
- 入口：子系统导航「状态机管理」（仅 ADMIN）

## 6. 角色权限

| 角色 | 项目 | 任务 | 状态机配置 |
|---|---|---|---|
| ADMIN | 建/改/删 + 成员管理 | 建/改/删/流转任意 | 可编辑 |
| PM（新增第 6 角色） | 建/改/删 + 成员管理 | 建/改/删/流转任意 | 只读 |
| 项目负责人（owner） | 改/删该项目 + 成员管理 | 该项目内建/改/删/流转 | — |
| 项目成员（member） | 只读 | 该项目内建/改/删/流转 | — |
| RD/ME/QA/CUSTODY（非成员） | 只读 | 只读 + 流转/编辑自己名下任务 | 不可见 |

- `users.role` VARCHAR(20) 无枚举约束，新增 `'PM'` 零破坏；manifest `roles.use` 加入 PM
- PM 账号由 ADMIN 在「用户管理」创建；项目成员由 owner/ADMIN 在项目内添加（可跨部门）
- 全链路影响排查：现有前端角色判断不匹配 PM 即视为普通只读，不破坏现有逻辑；仅需将 PM 加入本子系统 manifest `roles.use`

## 7. 前端页面（独立 SPA）

| 导航 | 内容 | 可见 |
|---|---|---|
| 项目看板 | kb-stat 卡片（项目数/总任务/已完成/进行中/已延期/完成率）+ 类别/优先级/状态三维分布 + **近 8 周完成趋势图（CSS 柱状图）** | 全部 |
| 任务看板（Kanban） | 按状态列展示任务卡片，**拖拽流转（仅合法转移）**，可按项目/责任人筛选 | 全部 |
| 任务列表 | 跨项目任务，筛选（项目/类别/优先级/状态/责任人/是否逾期）+ **导出 Excel（CSV）** + 临期/逾期高亮 | 全部 |
| 项目列表 | 项目 CRUD + 成员管理 + 展开项目任务 | 全部（写按权限） |
| 状态机管理 | 表单编辑状态颜色/标签/转移角色权限 | ADMIN |

任务详情：全部字段 + 状态流转按钮（按权限 + 运行时状态机配置渲染）+ **子任务区** + **依赖区（前置任务）** + 附件上传 + 关联样品/治具选择器 + **评论区** + 操作日志。

- Kanban 拖拽只调用状态流转 API（CAS + 状态机 + 依赖校验），非法转移 toast 拒绝并回弹卡片
- 进度趋势图用纯 CSS/SVG 自绘（近 8 周 DONE 数聚合），不引入图表库
- 遵循卡片设计系统（.kb-stat/.card token）与 5 档响应式断点；前端 JS 合并构建

## 8. API 清单（前缀 `/api/projects`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | /api/projects | 项目列表 / 创建（创建人自动 owner） |
| GET/PUT/DELETE | /api/projects/:id | 详情 / 编辑 / 删除（有任务 409 保护） |
| GET/POST | /api/projects/:id/members | 成员列表 / 添加成员（owner/ADMIN/PM） |
| PUT/DELETE | /api/projects/:id/members/:uid | 转让 owner / 移除成员（owner/ADMIN/PM） |
| GET/POST | /api/projects/:id/tasks | 项目任务列表 / 创建 |
| GET/PUT/DELETE | /api/projects/tasks/:tid | 任务详情（含子任务/依赖/评论/附件/关联/日志）/ 编辑（乐观锁）/ 删除（级联清理） |
| POST | /api/projects/tasks/:tid/status | 状态流转（CAS + 状态机 + 依赖校验） |
| GET/POST | /api/projects/tasks/:tid/subtasks | 子任务列表 / 创建 |
| PUT/DELETE | /api/projects/tasks/:tid/subtasks/:sid | 编辑（乐观锁）/ 删除 |
| POST | /api/projects/tasks/:tid/subtasks/:sid/status | 子任务状态流转（CAS） |
| GET/POST | /api/projects/tasks/:tid/comments | 评论列表 / 发表 |
| DELETE | /api/projects/tasks/:tid/comments/:cid | 删除评论（作者/ADMIN/PM） |
| POST/DELETE | /api/projects/tasks/:tid/deps | 添加前置任务（环检测）/ 移除 |
| POST/DELETE | /api/projects/tasks/:tid/files | 上传 / 删除附件 |
| POST/DELETE | /api/projects/tasks/:tid/links | 关联样品/治具 / 取消 |
| GET | /api/projects/stats | 看板聚合（卡片 + 三维分布 + 趋势） |
| GET | /api/projects/tasks/export | 导出 CSV（UTF-8 BOM，含模板 12 列 + 项目名） |
| GET/PUT | /api/projects/workflow | 状态机配置读取 / 更新（行锁事务，ADMIN） |

错误格式统一 `{ error: "..." }` + 语义化状态码；写操作事务包裹。

## 9. 并发与一致性（MUST）

> 评估依据：现有样品/治具状态机为无锁 read-modify-write + 无条件 UPDATE，存在双写丢失与自动判定竞争。项目追踪从第一天起采用以下防护。

### 9.1 状态流转 CAS 条件更新（核心）

```sql
-- 手动流转（任务/子任务同法）
UPDATE project_tasks SET status=?, actual_date=?, progress=?, version=version+1
WHERE id=? AND status=?;
-- 自动延期批量（与手动流转互斥，最多一方成功）
UPDATE project_tasks SET status='OVERDUE', version=version+1
WHERE id=? AND status IN ('NOT_STARTED','IN_PROGRESS') AND planned_date < CURDATE();
```

`affectedRows === 0` → `409 { error: '任务状态已变更，请刷新后重试' }`。解决：双人同时流转（审计断链/状态错乱）、自动延期与手动流转竞争（已完成被误标延期）。

### 9.2 状态更新与留痕同事务

`withTransaction` 包裹「状态 UPDATE + project_logs INSERT」；删除任务级联清理子任务/依赖/评论/附件/关联/日志整体事务。

### 9.3 状态机配置写入行锁

`PUT /api/projects/workflow` 事务内 `SELECT ... FOR UPDATE` 后写；流转请求同请求事务内读取配置（缓解新旧混合）。

### 9.4 任务/子任务编辑乐观锁

`version` 列 + `WHERE id=? AND version=?`；冲突 409「数据已被他人修改，请刷新」。删除同样携带 version。

### 9.5 依赖与流转的原子校验

任务流转到 IN_PROGRESS/DONE 前，事务内校验前置任务（`SELECT COUNT(*) FROM project_task_deps ... JOIN project_tasks`）均 DONE；添加依赖时环检测（递归向上查祖先）。校验与状态更新同一事务。

### 9.6 补充说明

- 看板统计/趋势为只读聚合，允许弱一致，无锁
- 附件/关联/评论独立接口，均在任务存在性校验后执行
- 现有样品/治具的同类无锁竞态属存量技术债，建议后续单独迭代加固（不在本子系统范围）

## 10. 测试计划

- `tests/projects.test.js`（jest，走 MariaDB 真实库）：
  - 项目/任务/成员/子任务/评论/依赖 CRUD 与权限（ADMIN/PM/owner/member/普通角色/责任人）
  - 状态机流转合法/非法（含 ASSIGNEE/MEMBER 伪角色解析、依赖阻塞、环检测）
  - **并发用例**：CAS 流转冲突（第二请求 409）、乐观锁 version 冲突、自动延期与手动流转互斥
  - 规则校验：DONE 强制 progress=100 + actual_date；progress 0~100；OVERDUE 自动判定
  - 附件/关联、CSV 导出（含 BOM/列头）、看板聚合与趋势
- 端到端回归（browser_use）：看板/任务看板拖拽/列表/详情（子任务/依赖/评论/附件/关联）/状态机管理面板/导出/响应式

## 11. 范围外（后续迭代）

- 运行时拖拽工作流引擎（已评估 3~5 倍成本，独立大迭代）
- 外部推送通知（邮件/企业微信等，本次仅站内预警高亮）
- 样品/治具存量状态机并发加固
