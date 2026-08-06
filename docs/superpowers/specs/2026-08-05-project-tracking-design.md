# 项目追踪子系统设计文档

- 日期：2026-08-05
- 状态：初稿（记录已完成实现，待评审）
- 所属子系统：项目追踪（projects）
- 关联需求：跨部门项目问题/任务追踪（看板、子任务、依赖、评论、附件、留痕、导出、可配置状态机）
- 架构基础：子系统插件协议（AGENTS.md §17）

## 1. 背景与目标

制造品质管理系统中，样品/治具的改进问题（如品质异常、流程改善、设备故障、安全事项）分散在各子系统与部门，缺乏统一的多项目任务追踪载体。

**目标**：提供多项目问题/任务追踪子系统——支持项目分组、任务全生命周期流转、子任务拆解、前置依赖、协作评论、附件、与样品/治具对象关联、操作全量留痕、看板统计与 CSV 导出，状态机可配置（仅 ADMIN）。

**关键决策**：

| 决策点 | 结论 |
|---|---|
| 形态 | 独立子系统（插件协议，`subsystems/projects/`），与样品/治具/工作台平级 |
| 任务状态机 | 4 态（未开始/进行中/已完成/已延期），已延期为派生态（计划日期超期自动转） |
| 并发 | 乐观锁（version CAS）+ 状态流转 CAS + 工作流配置行锁 + SAVEPOINT 重试 |
| 权限 | ADMIN/PM 全局管理；owner/member 项目内管理；ASSIGNEE 伪角色（责任人放宽） |
| 留痕 | 统一 `project_logs` 表，所有写操作同事务落日志 |
| 状态机配置 | DB 表覆盖 manifest 默认值，保存即时生效 |

## 2. 架构与目录结构

遵循插件协议：manifest.json 为单一事实来源，框架自动发现、建表、挂载路由、生成门户卡片。

```
subsystems/projects/
├── manifest.json            # 元数据/路由/10表声明/角色/导航/状态机/文件管理
├── backend/
│   ├── index.js             # 注册顺序：stats → tasks → task-extras → projects（静态路径先行防 :id 抢占）
│   ├── routes-projects.js   # 项目 CRUD + 成员管理
│   ├── routes-tasks.js      # 任务/子任务/评论/状态流转
│   ├── routes-task-extras.js# 依赖/附件/关联（超红线拆分）
│   ├── routes-stats.js      # 看板统计/跨项目列表/CSV/工作流配置/用户列表
│   ├── permissions.js       # 权限判定（全局/项目内）
│   └── workflow-config.js   # 状态机配置读写 + 伪角色解析
├── db/
│   ├── schema.sql           # 10 表 DDL（幂等）
│   ├── dao.js               # 项目/成员/留痕 + 依赖注入聚合
│   ├── dao-tasks.js         # 任务/子任务/评论 DAO
│   ├── dao-extras.js        # 依赖/附件/关联 DAO
│   └── dao-stats.js         # 看板聚合（弱一致只读）
├── frontend/
│   ├── index.html           # SPA 入口（fluentui + bundle.js 双 script）
│   ├── js/
│   │   ├── router.js        # 导航渲染 + 哈希路由 + #/tasks/:id 详情路由
│   │   ├── constants.js     # ROLE_CN/PRIORITY_CN/CATEGORY_CN/TASK_STATUS_CN/SUBTASK_STATUS_CN
│   │   ├── api.js           # PApi 端点封装
│   │   └── views/           # dashboard/kanban/list/projects/task-detail/workflow
│   └── css/module.css       # .pk-* 专属样式（统计卡复用共享 .kb-stat）
└── seed/seed.js             # 幂等种子（2 项目/6 任务四态覆盖/子任务/依赖/评论/关联）
```

**路由注册顺序（关键）**：`/workflow`、`/stats`、`/tasks/export`、`/tasks`（静态）→ `/tasks/:tid`（参数）→ `/tasks/:tid/...`（子路径）→ `/:id`（参数），避免 `tasks/export` 被 `:tid` 抢占为 404。

## 3. 数据模型（10 表）

| 表 | 用途 | 关键字段 |
|---|---|---|
| `projects` | 项目 | name(必填)、description、status(ACTIVE/DONE)、created_by |
| `project_tasks` | 任务 | project_id、title、category(设备/质量/流程/安全/其他)、priority(H/M/L)、assignee_id、planned_date、actual_date、status、progress(0~100)、solution、notes、**version(乐观锁)**；索引 idx_project/idx_status/idx_assignee |
| `project_subtasks` | 子任务 | task_id、title、assignee_id、status(三态)、planned_date、done_at、version |
| `project_task_comments` | 评论 | task_id、content、operator_id |
| `project_task_deps` | 前置依赖 | task_id(被阻塞)、depends_on_id(前置)、UK(task_id,depends_on_id) |
| `project_members` | 项目成员 | project_id、user_id、is_owner(1=负责人)、UK(project_id,user_id) |
| `project_task_files` | 任务附件 | task_id、file_name、file_path、size、uploaded_by |
| `project_task_links` | 关联对象 | task_id、ref_type(sample/fixture)、ref_id、UK(task_id,ref_type,ref_id) |
| `project_logs` | 全量留痕 | entity_type(project/task/subtask/comment/member/config)、entity_id、action、detail(JSON)、operator_id；索引 idx_entity |
| `project_workflow` | 状态机配置 | flow_key='task'、cfg_key(states/transitions/initial)、cfg_value(JSON)、UK(flow_key,cfg_key) |

**级联约束**：删除任务 = 事务内级联清理 子任务/评论/依赖/附件/关联（`deleteTaskCascade`）；删除项目须无任务（409 保护）。

## 4. 状态机设计

### 4.1 状态与转移（manifest 声明 + DB 可覆盖）

```
NOT_STARTED ──START──▶ IN_PROGRESS ──COMPLETE──▶ DONE
     │                    │
     └────AUTO_OVERDUE────┴────AUTO_OVERDUE──▶ OVERDUE（派生态）
```

| 状态 | 语义 | 进入条件 |
|---|---|---|
| NOT_STARTED | 未开始 | 创建默认 |
| IN_PROGRESS | 进行中 | START（手动） |
| DONE | 已完成 | COMPLETE（手动，强制 progress=100 + actual_date 回写） |
| OVERDUE | 已延期（派生） | AUTO_OVERDUE：`planned_date < CURDATE()` 且非 DONE |

### 4.2 伪角色（resolveRole）

转移规则 `role` 数组支持真实角色 + 两个伪角色：
- **ASSIGNEE**：`task.assignee_id === 当前用户` 即通过（责任人可流转自己任务）
- **MEMBER**：当前用户 ∈ 项目成员即通过
- SYSTEM 伪角色由自动延期流程使用（不经过人工校验）

### 4.3 自动延期（AUTO_OVERDUE，与手动流转互斥）

状态流转事务内先执行批量 `UPDATE ... SET status='OVERDUE' WHERE planned_date < CURDATE() AND status IN ('NOT_STARTED','IN_PROGRESS')`，再执行手动 CAS 流转。已超期任务手动流转必然因状态已变而 409——保证 OVERDUE 派生与人工操作互斥。

## 5. 权限模型

| 能力 | ADMIN | PM | owner | member | assignee | 其他 |
|---|---|---|---|---|---|---|
| 建项目 | ✅ | ✅ | — | — | — | — |
| 编辑/删除项目 | ✅ | ✅ | ✅ | — | — | — |
| 成员管理（增/转/删） | ✅ | ✅ | ✅ | — | — | — |
| 项目内建任务/编辑/流转 | ✅ | ✅ | ✅ | ✅ | ✅（编辑/流转本人任务） | — |
| 删除任务/子任务 | ✅ | ✅ | ✅ | ✅ | — | — |
| 看板/列表/详情（只读） | ✅ | ✅ | ✅ | ✅ | ✅ | ✅（登录可见） |
| 状态机配置 | ✅ | — | — | — | — | — |

规则细节：
- 创建项目者自动成为 owner（`project_members.is_owner=1`）
- owner 不可移除自己（400 保护）
- 编辑任务对 assignee 放宽（不含删除）；评论删除仅作者/ADMIN/PM
- 非项目成员对项目内写操作一律 403

## 6. API 设计（前缀 `/api/projects`，JSON，错误 `{error}`）

### 6.1 项目与成员

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/api/projects` | 项目列表（含任务数/完成数） | 登录 |
| POST | `/api/projects` | 创建（创建人=owner） | ADMIN/PM |
| GET | `/api/projects/:id` | 详情 | 登录 |
| PUT | `/api/projects/:id` | 编辑 | ADMIN/PM/owner |
| DELETE | `/api/projects/:id` | 删除（有任务 409） | ADMIN/PM/owner |
| GET | `/api/projects/:id/members` | 成员列表 | 登录 |
| POST | `/api/projects/:id/members` | 添加成员 | ADMIN/PM/owner |
| PUT | `/api/projects/:id/members/:uid` | 转让 owner / 移除 | ADMIN/PM/owner |
| DELETE | `/api/projects/:id/members/:uid` | 移除别名 | ADMIN/PM/owner |

### 6.2 任务与流转

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/projects/:id/tasks` | 创建任务（非成员 403） |
| GET | `/api/projects/:id/tasks` | 项目任务列表 |
| GET | `/api/projects/tasks` | 跨项目列表（project_id/category/priority/status/assignee_id 筛选） |
| GET | `/api/projects/tasks/:tid` | 详情（task+subtasks+deps+comments+files+links+logs 并行聚合） |
| PUT | `/api/projects/tasks/:tid` | 编辑（**version 乐观锁 409**；DONE 强制 progress=100） |
| DELETE | `/api/projects/tasks/:tid` | 删除（级联清理） |
| POST | `/api/projects/tasks/:tid/status` | 状态流转（CAS+依赖校验+自动延期互斥） |

### 6.3 子任务 / 评论

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/projects/tasks/:tid/subtasks` | 列表/创建 |
| PUT/DELETE | `/api/projects/tasks/:tid/subtasks/:sid` | 编辑（乐观锁）/删除 |
| POST | `/api/projects/tasks/:tid/subtasks/:sid/status` | 三态流转 START/COMPLETE（CAS） |
| GET/POST | `/api/projects/tasks/:tid/comments` | 列表/发表 |
| DELETE | `/api/projects/tasks/:tid/comments/:cid` | 删除（作者/ADMIN/PM） |

### 6.4 依赖 / 附件 / 关联

| 方法 | 路径 | 说明 |
|---|---|---|
| POST/DELETE | `/api/projects/tasks/:tid/deps[/:depId]` | 加/删前置依赖（环检测 400、重复 409、自依赖 400） |
| POST | `/api/projects/tasks/:tid/files` | 上传附件（multer 单文件，≤10MB） |
| DELETE | `/api/projects/tasks/:tid/files/:fid` | 删除附件 |
| GET/POST | `/api/projects/tasks/:tid/links[/:refType/:refId]` | 关联列表/增删（sample/fixture，重复 409） |

### 6.5 统计 / 导出 / 配置

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/projects/stats` | 看板聚合（项目数/任务数/完成率/三维分布/近 8 周趋势） |
| GET | `/api/projects/tasks/export` | CSV 导出（UTF-8 BOM，12 列） |
| GET | `/api/projects/workflow` | 读取状态机配置（DB 覆盖 manifest） |
| PUT | `/api/projects/workflow` | 更新配置（**ADMIN**，行锁事务，四态拓扑校验） |
| GET | `/api/projects/users` | 用户列表（ADMIN/PM；共享 /api/users 仅 ADMIN 故子系统提供） |

## 7. 并发与一致性设计

| 机制 | 场景 | 实现 |
|---|---|---|
| 乐观锁 version | 任务/子任务编辑 | `UPDATE ... WHERE id=? AND version=?`，affectedRows=0 → 409「数据已被他人修改」 |
| 状态流转 CAS | 流转并发 | `UPDATE ... WHERE id=? AND status=读取旧值`，affectedRows=0 → 409 |
| 自动延期互斥 | OVERDUE 派生 vs 手动流转 | 同事务：先批量转 OVERDUE，手动 CAS 再校验，已超期必然 409 |
| 行锁 | 工作流配置更新 | `SELECT ... FOR UPDATE` 锁 flow_key='task' 行后覆盖写 |
| SAVEPOINT | （样品子系统惯例） | 并发唯一键冲突重试 3 次（本项目任务表无唯一编号，主要靠 CAS） |
| 依赖一致性 | 前置任务未 DONE 禁流转 | 流转事务内 `COUNT(*)` 校验 → 409 |
| 环检测 | 依赖添加 | 事务内递归查询 → 400 |

**一致性原则**：所有写操作 MUST 用 `D.withTransaction`，业务变更与留痕（addProjectLog）同事务提交，保证审计不中断。

## 8. 前端设计

入口 `subsystems/projects/frontend/index.html`，fluentui + bundle.js 双 script（AGENTS.md §19）。hash 路由 5 导航 + 1 详情路由。

| 页面 | 路由 | 功能 |
|---|---|---|
| 项目看板 | `#/dashboard` | 5 张 kb-stat 统计卡（项目数/总任务/已完成/进行中/已延期）+ 类别/优先级分布 + 完成率 + 近 8 周 CSS 柱状趋势 |
| 任务看板 | `#/kanban` | 4 列分组（未开始/进行中/已完成/已延期），项目筛选下拉，HTML5 拖拽流转（ACTION_MAP 仅合法转移，非法 toast 回弹，drag-over 高亮） |
| 任务列表 | `#/list` | 跨项目筛选（项目/状态）+ 已延期行 `.pk-row-overdue` 高亮 + CSV 导出（location 跳转带 cookie）+ `#/list?project=xxx` 预选 |
| 项目列表 | `#/projects` | 项目卡（名称+任务数+完成数）+ 新建/编辑/删除（ADMIN/PM）+ 成员管理弹窗（添加/转让/移除），单击项目卡跳列表筛选 |
| 任务详情 | `#/tasks/:id` | 7 区块：主信息（项目名/类别/优先级/责任人/进度/日期/描述/方案/备注 + 编辑）+ 子任务（START/COMPLETE 流转）+ 依赖 + 评论 + 附件上传/下载（/uploads/projects/）+ 关联对象 + 操作日志 |
| 状态机管理 | `#/workflow` | 仅 ADMIN 可见；编辑 4 态 label/color + 转移 label，保存 PUT（行锁） |

**交互要点**：
- 编辑/流转 MUST 回传当前 version（乐观锁）；409 时提示刷新
- 附件下载链接前缀 `/uploads/projects/`（静态服务挂载点）
- 任务详情「项目」名称从项目列表补查映射（详情接口仅含 project_id）
- 统计卡复用共享 `.kb-stat`（AGENTS.md §18），子系统专属样式仅写 `.pk-*` 前缀至 module.css

## 9. 测试与种子数据

**单元测试**（`tests/projects.test.js`，29 用例）：
- 项目 CRUD + 成员（owner 自动成立、非成员 403、有任务删项目 409）
- 任务 CRUD + 乐观锁（version 冲突 409、DONE 强制 progress=100）
- 状态机流转（START/COMPLETE、非法转移、ASSIGNEE 伪角色、过期 version CAS 409）
- 子任务 + 评论（三态流转、编辑乐观锁、非成员 403）
- 依赖/附件/关联（环检测 400、前置未 DONE 409、multipart 上传、关联样品）
- 看板统计/导出/工作流（BOM 校验、ADMIN 行锁、非 ADMIN 403）

**种子数据**（`seed/seed.js`，幂等）：用户复用 pm01/rd01/qa01/me01/admin；2 项目（P1-新品导入、P2-治具改善）；6 任务四态覆盖；T1 附加子任务+依赖+评论+样品关联。

## 10. 容量与可维护性约束

| 文件 | 行数 | 职责隔离 |
|---|---|---|
| routes-tasks.js | ~270 | 任务/子任务/评论（依赖/附件/关联已拆出） |
| routes-projects.js | ~146 | 仅项目+成员 |
| routes-stats.js | ~85 | 统计/导出/配置/用户 |
| dao.js | ~111 | 项目/成员/留痕（任务域/扩展/统计均拆独立文件） |
| module.css | ~44 | 仅 .pk-* 专属样式 |

- 全部源码 ≤400 行红线，顶层函数 ≤10
- 文件拆分原则：同职责同文件、超限即拆（routes-task-extras / dao-tasks / dao-extras / dao-stats 均为容量拆分产物）
- 前端 JS 修改后 MUST 重建 bundle（`node tools/build-bundles.js` + 复制 + 版本号）

## 11. 部署与兼容性

- **部署**：重启 4000 服务即可（插件协议自动发现）；新增表由 initDB 幂等建表
- **回滚**：还原代码 + 重启（无共享文件改动；DB 新增表不删，兼容）
- **共享资源零改动**：未修改 server.js/db.js/app.css/shared/；不影响样品/治具/工作台（三系统回归已验）
- **监控（1~3 周期）**：流转 409 冲突频率、看板统计慢查询、CSV 大文件导出耗时、留痕完整性
