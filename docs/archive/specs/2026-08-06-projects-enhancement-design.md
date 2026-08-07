# 项目追踪子系统强化设计（簇A~F）

- 日期：2026-08-06
- 状态：REVIEWED（2026-08-06 经 review-sslb + code-review-and-quality 多技能交叉评审，9 项修正已落地，可进入 writing-plans）
- 所属子系统：项目追踪（projects）
- 前置基线：commit 当前 HEAD（projects v2 已上线交互现代化）
- 关联文档：`2026-08-05-project-tracking-design.md`（已完成实现）、`2026-08-06-project-tracking-roadmap.md`（P3-2/P3-3 并入本设计 C3/C4）

> 本文档为 brainstorming 汇总产物，覆盖项目追踪子系统的功能与交互强化。每簇实施前 MUST 按 AGENTS.md §5 流程（brainstorming → 设计文档 → writing-plans → subagent → 回归）执行，完成后本文档随迭代归档至 `docs/archive/`。

## 1. 背景与目标

### 1.1 现状盘点（已实现能力）

| 能力 | 现状 |
|---|---|
| 项目/任务 CRUD | 项目卡 + 成员管理（添加/转让/移除）；任务乐观锁编辑 |
| 看板 | 4 列（未开始/进行中/已完成/已延期），HTML5 拖拽（START/COMPLETE 白名单）+ 按钮兜底 |
| 列表 | 跨项目筛选 + 分页（50/页）+ CSV 导出 + 行内快捷流转 + 延期行高亮 |
| 状态机 | CAS 流转 + 动态 `status_eff`（OVERDUE 派生）+ 伪角色（ASSIGNEE/MEMBER）+ ADMIN 可配 |
| 依赖 | 前置依赖 + 环检测 + 流转前校验（未完成前置 409） |
| 详情 | 主信息卡 + 5-tab（子任务/评论/附件/关联/日志）分区加载 |
| 工程 | 事务留痕、权限矩阵（ADMIN/PM/owner/member/assignee）、乐观锁 |

### 1.2 目标

从「任务记录工具」升级为「项目协作闭环」：检索快、批量顺、进度看得清、依赖堵得住、协同有提醒、知识留得下。

### 1.3 非目标（YAGNI）

- 不做跨项目拖拽/拖拽排序（需引入排序字段，二期评估）
- 不做富文本编辑器（知识库用 Markdown 子集渲染）
- 不做邮件/短信/企业微信通知（仅站内通知中心）
- 不做工时/工作量统计（暂无字段支撑，后续迭代）
- 里程碑（B3）、项目可见性隔离（D4）、日历视图、项目统计报表列为**评估项**，默认不做，确认后再立项

## 2. 总览：六个功能簇

| 簇 | 主题 | 能力点 | 用户价值 |
|---|---|---|---|
| A | 任务检索与批量处理 | A1 全文搜索 / A2 多维筛选 / A3 批量操作 / A4 筛选 URL 化 | 执行层日常效率 |
| B | 进度与依赖可视化 | B1 依赖关系图 / B2 甘特·时间线视图 / B4 依赖解锁联动 | 管理+执行双向可视 |
| C | 协同与提醒 | C1 站内通知中心 / C2 评论@提及 / C3 附件增强 / C4 空态占位 | 沟通闭环 |
| D | 项目管理与治理 | D1 项目归档 / D2 状态机可视化编辑 / D3 关联跳转 | 治理与安全 |
| E | 知识库 | 列表/详情/编辑/任务一键沉淀 / Markdown+附件 / 全员可读 | 经验沉淀复用 |
| F | 工作列表与项目概览 | F1 跨项目我的工作列表 / F2 项目卡聚合统计 / F3 项目动态流 | 个人一站式入口 |

**交付顺序**：A → B → C → D → E → F（C1 通知中心的「任务提醒」依赖簇B 的 overdue_days 派生；E 复用簇A 搜索组件与簇C 附件上传；F1 复用 A1 搜索与簇B overdue 派生）。每簇独立迭代，互不阻塞。

**两个关键设计决策**（已与用户确认方向）：
1. 甘特图新增 `project_tasks.start_date` 列（增量迁移，旧数据用 `created_at` 兜底单点显示）
2. 堵塞（BLOCKED）采用**派生展示**（扩展 `status_eff` 计算，不落库、不动固定 4 态状态机拓扑）

### 2.5 全量评估：核验结论与现存缺陷修复

> 2026-08-06 对现有代码全量核验（routes-tasks/routes-stats/routes-projects/routes-task-extras/dao-tasks/dao-stats/dao/manifest/前端 views），设计假设已就地修正（A2 后端已支持、C1 通知派生化）。

**现存缺陷（评估副产品，实施迭代时一并修复）**：

| # | 缺陷 | 位置 | 修复方案 | 所属迭代 |
|---|---|---|---|---|
| 1 | **P1 延期任务流转死锁**：无 `OVERDUE→*` 转移，且手动流转前自动置 OVERDUE（CAS 互斥）→ 超期任务永远无法 START/COMPLETE，只能编辑 planned_date 解锁 | routes-tasks.js L134-140 + manifest transitions | 新增 `OVERDUE→DONE`(完成延期任务)/`OVERDUE→IN_PROGRESS`(继续处理) 转移（写入 manifest + project_workflow 迁移；4 态拓扑校验只查 states 键，加边不破坏）；手动流转自动延期改为仅超期未流转标记，COMPLETE 放行 | 迭代2（延期强化） |
| 2 | `/api/projects/users` 仅 ADMIN/PM → 非管理者新建任务指派下拉静默为空（现存活缺陷） | routes-stats.js L17-23 | 放宽为 requireAuth（仅返回 id/username/display_name，无敏感字段）；A2/C2/A3 复用 | 迭代1 |
| 3 | CSV 导出忽略筛选参数（与 §21 不符） | routes-stats.js export | 复用当前筛选参数（q/category/priority/status/assignee/project） | 迭代1 |
| 4 | `status_eff` CASE 定义分散 5 处查询 | dao-tasks.js | BLOCKED/overdue_days 扩展 MUST 集中为单一 SQL 片段常量，5 处查询统一引用 | 迭代2 |

## 3. 簇A：任务检索与批量处理

### A1 全文搜索
- **后端**：`GET /api/projects/tasks` 新增 `q` 参数，对 `title/description/notes/solution` 做 LIKE 匹配（`%q%`，转义 `%/_`）；与现有 project_id/status/assignee 等筛选叠加；分页沿用现有 {rows,total,limit,offset}
- **规模边界**：LIKE 无索引全表扫——任务数据量 <5 万行可接受；超阈值评估 FULLTEXT/前缀索引（当前阶段 FYI，不阻塞）
- **前端**：任务列表页顶部搜索框（防抖 300ms 触发 `lkLoad`），搜索词写入 hash（配合 A4）

### A2 多维筛选
- **后端已支持**（全量核验：`buildTaskWhere` 已含 category/priority/project_id/status/assignee_id，`/api/projects/tasks` 路由已透传）——**仅前端工作**
- 列表页（`list.js`）与看板（`kanban.js`）筛选栏新增下拉：类别（CATEGORY_KEYS）、优先级（PRIORITY_KEYS）、责任人（拉 `/api/projects/users`）
- 前置修复：`/api/projects/users` 由 ADMIN/PM 放宽为 requireAuth（缺陷#2，见 §2.5）

### A3 批量操作（核心交互）
- **前端**：列表页行首 checkbox 列 + 表头全选（fluent-checkbox，注意 `.checked` 属性与 `onchange` 事件，见项目记忆踩坑）；选中后顶部批量操作栏浮现：批量指派责任人 / 批量流转（开始/完成）/ 批量删除
- **后端**：`POST /api/projects/tasks/batch` 事务内逐条处理：
  - 参数：`{ action: 'assign'|'status'|'delete', ids: [], assignee_id?/action? }`
  - 权限：逐条 `canEditTask` 校验（assignee 对编辑放宽、删除不放宽）；无权限条目跳过并统计 `{ok, skipped:[{id,reason}]}`
  - 每条写 `project_logs` 留痕（含批量批次标记）
  - delete 走级联（复用 `deleteTaskCascade`）
- **约束**：单批上限 100 条；返回值 `{ok, skipped}` 前端 toast 汇总「成功 N 条，跳过 M 条」

### A4 筛选状态 URL 化
- 列表页筛选（项目/状态/类别/优先级/责任人/搜索词）编码进 `#/list?...`；`route()` 解析并恢复筛选状态（复用现有 `#/list?project=xx` 预选机制扩展）
- **页码不编码进 URL**（刷新回第一页，避免无效页码恢复）；仅筛选/搜索词编码

## 4. 簇B：进度与依赖可视化

### B1 依赖关系图
- **详情页「依赖」tab 图形化**（替换当前纯文本列表，保留原有数据接口）：
  - 布局：前置链（依赖方 → 当前任务）与后置链（当前任务 → 被依赖方）两行节点 DAG；节点=任务卡（标题+状态色），未完成前置节点带 ⛔
  - 交互：点击节点跳对应任务详情（`location.hash='#/tasks/:id'`）；环警示沿用后端 hasCycle 校验（理论上建不成环，前端展示兜底文案）
- **看板卡片阻塞标记**：卡片渲染时计算 `blocked_by`（存在未完成前置 → 显示 `⛔ 依赖阻塞 · 待 TK-xx`），列表行同样标注

### B2 甘特·时间线视图（新导航「时间线」）
- **数据**：新增 `project_tasks.start_date DATE NULL`（迁移见 §8）；无 start_date 用 `created_at` 兜底
- **后端**：**复用现有列表查询（listAllTasks 系）**——不新增独立大查询端点，仅在其返回字段中补充 `start_date/overdue_days/blocked_by`（全量评估决策，§10 已同步移除 timeline 端点）；前端按周聚合渲染
- **前端**：新视图文件 `views/timeline.js`，注册导航（key=`timeline`，全角色可见）：
  - 行 = 任务（按项目分组折叠），列 = 周粒度时间轴（近 8 周，可扩展范围）
  - 任务条 = `start→planned` 区间；色规：进行中 `#93c5fd` / 完成 `#6ee7b7` / 已延期 `#fecaca` / 依赖阻塞 `#fbbf24`
  - 交互：点击任务条跳详情；「仅看延期」开关；ADMIN/PM 条上拖拽调整 planned_date（**二期评估**，本期仅展示）

### B3 里程碑（评估项，默认不做）
- 候选：project_milestones 表 + 任务挂载 + 时间线分组。因需新表+看板分组改造，成本高，标记评估

### B4 依赖解锁联动
- 依赖解除（前置全部 DONE）后：任务 `status_eff` 的 BLOCKED 自动消失；看板/列表刷新时 toast「前置已解锁，可流转」
- 实现：前端在看板/列表加载后对比上次 blocked 状态集合，差异触发提示（轻量，不轮询）

### 派生 BLOCKED 设计（关键决策 #2）
- `status_eff` 计算扩展：任务 status ∈ {NOT_STARTED, IN_PROGRESS} 且存在未完成前置 → 视图状态 BLOCKED
- 实现位置：后端列表/详情查询用相关子查询返回 `blocked_by` 字段——`EXISTS(SELECT 1 FROM project_task_deps d JOIN project_tasks p ON p.id=d.depends_on_id WHERE d.task_id=t.id AND p.status<>'DONE')`（每行独立判定，走 uk_dep/idx_depends 索引，避免全表聚合）；**看板/工作列表全量场景若出现性能压力，改用 `LEFT JOIN project_task_deps + GROUP BY task_id` 一次判定，分页列表维持相关子查询**；详情接口对每个依赖任务补齐完成态；前端 `status_eff` 逻辑：`blocked_by ? 'BLOCKED' : (status_eff || status)`
- 不动 `routes-stats.js` 的 4 态拓扑校验；看板列**不新增** BLOCKED 列，卡片内 ⛔ 标记表达
- 延期与阻塞的判定优先级：阻塞优先展示（延期天数仍保留计算）

### 延期（Overdue）强化
- 后端列表/详情返回 `overdue_days`（`DATEDIFF(CURDATE(), planned_date)`，仅 status_eff=OVERDUE 时有值）
- 卡片/列表显示「已延期 N 天 · 原 MM-DD」；延期原因区分「计划超期/依赖阻塞」
- 项目看板「已延期」统计卡点击 → `#/list?status=OVERDUE` 下钻
- 提醒联动见 C1

## 5. 簇C：协同与提醒

### C1 站内通知中心（核心新能力）
- **新表** `project_notifications`（见 §9）：用户级、可读/未读、关联实体（任务/知识）
- **设计优化（全量评估产出）**：仅**事件型**通知落库（ASSIGN/COMMENT/MENTION/DEP_UNLOCK）；DEADLINE/OVERDUE 为**派生提醒**——不落库、不依赖 setInterval 定时器，在 `GET /notifications` 读取时按 `planned_date` 实时计算（去重键 task_id+type+date），避免进程定时依赖与脏数据
- **触发事件**：
  | 事件 | 触发时机 | 接收人 | 存储 |
  |---|---|---|---|
  | ASSIGN | 任务/子任务被指派或改派 | 新责任人 | 落库 |
  | COMMENT | 任务被评论 | 任务责任人 + 项目 owner + 评论@提及者 | 落库 |
  | MENTION | 评论含 @用户名 | 被@者 | 落库 |
  | DEP_UNLOCK | 前置任务全部完成，被阻塞任务解锁 | 被阻塞任务责任人 | 落库 |
  | DEADLINE | 计划日期前 2 天 | 责任人 | 派生 |
  | OVERDUE | 计划日期已过 | 责任人 | 派生 |
- **API**：`GET /api/projects/notifications?unread=1`（合并事件型 + 派生提醒）/ `POST /api/projects/notifications/:id/read` / `POST /api/projects/notifications/read-all`
- **前端**：顶栏铃铛（fluent 图标）→ 下拉面板（未读 Tab + 全部 Tab，每条：图标+文案+时间，点击跳关联任务）；未读数字角标（跨页面顶部常驻，`showApp()` 时拉取；铃铛为 index.html 静态元素，置于 `#page-actions` 之外避免路由清空）
- **工程注意**：事件型通知写入在既有事务内（`addProjectLog` 同款模式，DEP_UNLOCK 在 DONE 流转事务内查 `project_task_deps WHERE depends_on_id=tid` 后插入）；**通知写入失败降级（try-catch 记日志，不阻断任务流转主流程）**；已上线样品/治具表不触碰

### C2 评论 @提及
- 评论输入框支持 `@用户名`：输入 `@` 弹出用户下拉（复用 `/api/projects/users`），选中插入 `@display_name`
- 存储：评论 content 原文保存；发布时后端解析 `@[\u4e00-\u9fa5\w]+` 按 **username（唯一键）** 匹配用户 → 触发 MENTION 通知（收件人=匹配用户）；display_name 仅作展示与下拉标签，**不作匹配键**（display_name 可重复，防发错通知）
- 渲染：评论展示时 @名字高亮（`esc()` 后包 `<span class="pk-mention">`）

### C3 附件增强
- **图片预览**：附件 tab 图片类（jpg/jpeg/png）缩略图 + 点击放大（简单 lightbox，复用 modal）；非图片保持下载链接
- **下载鉴权**（并入 roadmap P3-2）：新增受控下载 `GET /api/projects/tasks/:tid/files/:fid/download`（requireAuth + 任务成员校验，`res.download`）；静态 `/uploads/projects/` 路由在灰度期保留，监控后下线
- 知识库附件复用同一上传中间件与鉴权模式（见簇E）

### C4 空态占位（并入 roadmap P3-3）
- 统一 `.pk-empty` 组件（图标+文案+可选引导按钮「去创建」），覆盖：列表空、看板列空、详情各 tab 空、时间线空、知识库空
- 样式写入 `module.css`（不动 app.css）

## 6. 簇D：项目管理与治理

### D1 项目归档
- `projects.status` 已有字段（ACTIVE/DONE），补全交互：项目卡「归档」按钮（ADMIN/PM/owner）→ 置 DONE
- 归档后：项目卡标记「已归档」、任务列表默认过滤 ACTIVE 项目、归档项目任务**只读**（编辑/流转/子任务/评论/附件上传删除/依赖增删/沉淀知识 均 403，后端 `getProject` 后校验；读与导出不受限）
- 撤销归档（置回 ACTIVE）仅 ADMIN

### D2 状态机可视化编辑（替代现有文本框）
- 现状：[workflow.js](file:///www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/views/workflow.js) 文本框逗号分隔角色
- 目标：节点卡片（状态名/label/颜色选择器）+ 连线表格（源→目标/动作/角色多选/标签），保存复用现有 PUT /api/projects/workflow（4 态拓扑校验不变）
- 前端布局用现有 `.pk-panel` + fluent 组件，无第三方库

### D3 关联跳转
- 详情「关联」tab：样品/治具链接可点击 → `window.open('/subsystems/samples/frontend/index.html#/list?no=xx' 或 fixtures 对应)`（对齐工作台 `_openWbScanJs` 模式）
- 知识来源任务/关联任务双向跳转（簇E）

### D4 项目可见性（评估项，默认不做）
- 候选：非成员不可见项目 + 列表过滤。涉及权限模型改动大，标记评估

## 7. 簇E：知识库（内嵌模块）

> 用户已确认：内嵌模块 / Markdown+附件 / 全员可读（创建者+ADMIN+PM 可写删）

### 7.1 数据模型
```sql
CREATE TABLE IF NOT EXISTS project_knowledge (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL COMMENT '标题（必填）',
  content MEDIUMTEXT COMMENT 'Markdown 内容',
  category VARCHAR(20) NOT NULL DEFAULT 'other' COMMENT 'sop/improvement/lesson/faq/other',
  tags VARCHAR(500) COMMENT '逗号分隔标签',
  source_task_id INT NULL COMMENT '来源任务（一键沉淀绑定）→ project_tasks.id',
  project_id INT NULL COMMENT '可选关联项目',
  created_by INT, updated_by INT,
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_category(category), KEY idx_source(source_task_id), KEY idx_created(created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_knowledge_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  knowledge_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  size INT, uploaded_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_knowledge(knowledge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```
- 附件存储：`public/uploads/projects/knowledge/`（复用 `createUploader`，扩展名白名单同任务附件）

### 7.2 API（前缀 /api/projects）
| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | /api/projects/knowledge | 登录 | 列表：q/category/tag 筛选 + 分页 {rows,total} |
| GET | /api/projects/knowledge/:id | 登录 | 详情（含 files、source_task 标题） |
| POST | /api/projects/knowledge | 登录 | 创建（title 必填） |
| PUT | /api/projects/knowledge/:id | 创建者/ADMIN/PM | 编辑（乐观锁 version 409） |
| DELETE | /api/projects/knowledge/:id | 创建者/ADMIN/PM | 删除（级联删文件记录 + **物理删除磁盘附件**） |
| POST/DELETE | /api/projects/knowledge/:id/files[/:fid] | 同上 | 附件上传/删除 |
| POST | /api/projects/tasks/:tid/knowledge | 任务成员 | 任务一键沉淀（预填 title/content/source_task_id） |
| GET | /api/projects/tasks/:tid/knowledge | 登录 | 任务关联知识列表 |

### 7.3 前端
- 新导航「知识库」（key=`knowledge`，全角色）；视图文件 `views/knowledge.js`（列表）+ `views/knowledge-detail.js`（详情/编辑）+ `views/knowledge-md.js`（Markdown 子集渲染器）
- **列表页**：搜索框 + 分类下拉 + 标签筛选 + 双列卡片（标题/分类/标签/来源任务/作者/日期）+ 分页
- **详情页**：Markdown 渲染 + 附件区（图片预览复用 C3 lightbox）+ 来源任务跳转 + 编辑/删除
- **编辑**：openModal 表单（标题/分类下拉/标签/内容 textarea/附件上传），保存后局部刷新
- **任务集成**：详情主卡「沉淀为知识」按钮（成员）→ 弹窗预填（标题=任务标题、内容=描述+解决方案拼接、来源任务=当前）→ POST 保存；任务「关联」tab 显示已沉淀知识链接

### 7.4 Markdown 渲染器（关键实现约束）
- 项目无构建、内网环境不可依赖 CDN → **本地化轻量子集渲染器**（`knowledge-md.js`，约 100~150 行）
- 支持子集：标题 #~####、加粗/斜体、无序/有序列表、行内代码/代码块、链接、表格、分隔线
- **安全**：先 `esc()` 全量转义，再按白名单语法解析生成 HTML（防存储型 XSS，对齐 C2 修复经验）；`dangerouslySetInnerHTML` 等价物仅限本渲染器出口；**链接 `href` 仅允许 http/https/mailto 协议**，其余协议（javascript: 等）一律剥离
- 渲染器独立测试用例（tests/ 下新增，豁免 1000 行上限）

### 7.5 权限矩阵
| 操作 | 全员 | 创建者 | ADMIN/PM |
|---|---|---|---|
| 读/搜索 | ✓ | ✓ | ✓ |
| 创建 | ✓ | ✓ | ✓ |
| 编辑 | — | ✓ | ✓ |
| 删除 | — | ✓ | ✓ |
| 附件上传/删除 | — | ✓ | ✓ |

## 8. 簇F：工作列表与项目概览

### F1 跨项目「工作列表」（新导航）
- **定位**：当前用户在所有项目（含子任务）的一站式任务清单，区别于看板/列表的「我的任务」过滤——独立视图、常驻入口
- **后端**：`GET /api/projects/my-tasks`（assignee_id=当前用户，含子任务，可选 status/overdue 过滤），返回 `{pending, in_progress, overdue, done}` 四组（每组含 title/project/planned_date/status_eff/overdue_days/priority/progress/blocked_by）；**任务与子任务双查合并（子任务 JOIN 父任务标题/项目名）**
- **口径**：子任务无 status_eff 派生（v2 仅顶层任务计算），其 overdue 由查询层 `planned_date < CURDATE() AND status<>'DONE'` 判定并返回 overdue_days；blocked_by 仅适用于顶层任务（子任务无依赖，置空）
- **前端**：新视图文件 `views/my-work.js`，注册导航（key=`work`，全角色）：
  - 四组分组（待处理/进行中/已延期/已完成），组内按 优先级 > 计划日期 排序
  - 顶部「今日截止」（planned_date = 今天）置顶高亮；OVERDUE 红色「已延期 N 天」；阻塞 ⛔ 标记
  - 行操作：一键开始/完成（复用流转接口）+ 点击跳任务详情
- **关系**：与簇B 派生字段（overdue_days/status_eff/BLOCKED）对齐渲染；与 C1 通知（DEADLINE/OVERDUE）互为入口补充

### F2 项目卡聚合统计（项目列表页增强）
- **后端**：`GET /api/projects` 每项目附带聚合统计 `{total_tasks, in_progress, overdue, avg_progress}`（LEFT JOIN project_tasks 一次聚合，兼容旧结构只增字段）；**聚合口径限定顶层任务（`parent_id IS NULL`）**，子任务不计入项目卡统计，避免重复计入
- **前端**：projects.js 项目卡显示：任务总数 / 进行中 / 已延期 / 平均进度条 + 成员数；新增「我的项目」过滤（owner 或成员）

### F3 项目动态流
- **后端**：`GET /api/projects/:id/activity?limit=20` 查询 `project_logs`（按 project_id 过滤，JOIN 任务标题），返回最近动态：谁 创建/流转/评论/关联
- **前端**：项目详情新增「动态」tab（纯展示，时间倒序，可展开更多）；复用 C4 空态组件

### F4 评估项（默认不做）
- 日历视图（月历按 planned_date 排布）、项目统计报表（延期趋势/责任人负载）——需独立报表模块，标记评估

## 9. 数据模型变更汇总

| 变更 | 类型 | 说明 |
|---|---|---|
| project_tasks.start_date | 加列 | DATE NULL，甘特图区间；增量迁移 + schema.sql 同步 |
| project_knowledge | 新表 | 知识库主表 |
| project_knowledge_files | 新表 | 知识附件 |
| project_notifications | 新表 | 站内通知 |
| 派生字段 | 不落库 | status_eff(BLOCKED)/overdue_days/blocked_by 由查询层计算 |

- 迁移方式：`schema.sql` CREATE TABLE IF NOT EXISTS 幂等 + `db/migrations.js` 增量（ALTER TABLE ADD COLUMN IF NOT EXISTS 语义——MariaDB 用 INFORMATION_SCHEMA 判断）
- 全部新表/列不触碰已上线子系统（samples）的表

## 10. API 变更清单

**新增**：
- `GET /api/projects/tasks` 扩展 `q/category/priority` 参数（兼容旧参数；甘特复用现有列表查询，无新增 timeline 端点）
- `POST /api/projects/tasks/batch`（簇A，批量）
- `POST /api/projects/notifications` 系（簇C1）
- `GET /api/projects/tasks/:tid/files/:fid/download`（簇C3 受控下载，方法为 GET）
- `POST /api/projects/tasks/:tid/knowledge`、`/api/projects/knowledge` 系（簇E）
- `GET /api/projects/my-tasks`（F1 工作列表）
- `GET /api/projects/:id/activity`（F3 项目动态流）
- `PUT /api/projects/:id` 扩展 status（D1 归档）

**修改**（兼容旧出入参）：
- 列表/详情返回增加 `overdue_days/blocked_by` 字段（只增不改）
- `GET /api/projects` 项目列表附带聚合统计 `total_tasks/in_progress/overdue/avg_progress`（F2，只增字段）
- 确认项目级任务列表（`GET /api/projects/:id/tasks`）与跨项目列表返回字段一致（含 status_eff/overdue_days）
- `GET /api/projects/users` 放宽为 requireAuth（缺陷#2）
- `GET /api/projects/tasks/export` 复用筛选参数（缺陷#3）
- manifest + `project_workflow` 表新增 `OVERDUE→DONE/IN_PROGRESS` 转移（缺陷#1，增量迁移）

## 11. 前端文件结构变更

```
subsystems/projects/frontend/js/views/
├── knowledge.js          # 新增：知识库列表
├── knowledge-detail.js   # 新增：知识详情/编辑
├── knowledge-md.js       # 新增：Markdown 子集渲染器
├── timeline.js           # 新增：甘特·时间线视图
├── my-work.js            # 新增：跨项目工作列表（F1）
├── notifications.js      # 新增：通知面板（铃铛下拉）
├── list.js               # 修改：搜索/多维筛选/批量操作/URL 化
├── kanban.js             # 修改：⛔ 阻塞标记/多维筛选
├── task-detail.js        # 修改：依赖图/沉淀知识入口（注意近红线，主卡渲染拆 helper）
├── workflow.js           # 修改：可视化编辑
└── router.js             # 修改：新增导航 timeline/knowledge/work
```
- 导航变更：NAV + manifest.json `navigation` 新增 timeline/knowledge/work 三项
- 所有前端 JS 改动后 MUST 执行 `node tools/build-bundles.js` + 复制 bundle + 更新版本号

## 12. 工程约束与回归

1. **容量红线**：task-detail.js 已 19,821 字符（99.1% 红线）——**禁止向其追加任何功能**，依赖图/沉淀入口等全部拆独立 helper 文件；新逻辑一律新文件
2. **子系统隔离**：projects 未上线（可写入测试），但 samples 已上线——新表/新列不触碰 samples 表；共享文件改动（app.css/modal.js/api-base.js）MUST 样品/治具/工作台三系统回归
3. **权限**：批量操作逐条校验；知识库/通知权限矩阵见 §7.5/§5；`/api/projects/users` 放宽后仅暴露 id/username/display_name
4. **事务**：通知写入、批量操作、知识沉淀均在事务内；乐观锁冲突 409 语义统一
5. **status_eff 集中化**：BLOCKED/overdue_days SQL 片段 MUST 作为单一常量被 5 处查询引用（缺陷#4），禁止散落复制
6. **bundle**：新增/修改 JS 文件后重建（§19）
7. **测试**：新增用例——知识库 CRUD/渲染器 XSS、批量操作权限、通知触发、status_eff BLOCKED、甘特数据、overdue_days、OVERDUE 死锁回归
8. **兼容**：列表接口新增字段只增不改；附件静态下载灰度期保留

## 13. 分阶段交付计划

| 迭代 | 内容 | 依赖 |
|---|---|---|
| 迭代1 | 簇A（搜索/筛选/批量/URL 化）+ 缺陷#2 users 放宽 + 缺陷#3 导出筛选 | 无 |
| 迭代2 | 簇B（start_date 迁移/甘特视图/依赖图/派生 BLOCKED/延期标签）+ 缺陷#1 OVERDUE 死锁 + 缺陷#4 status_eff 集中化 | 无 |
| 迭代3 | 簇C（通知中心/@提及/附件预览+鉴权/空态） | 迭代2（overdue_days/DEADLINE） |
| 迭代4 | 簇D（归档/状态机可视化/关联跳转） | 无 |
| 迭代5 | 簇E（知识库全套） | 迭代1（搜索组件）/迭代3（附件模式） |
| 迭代6 | 簇F（工作列表/项目聚合/动态流） | 迭代1（搜索）/迭代2（overdue 派生） |

每迭代独立：brainstorming 确认 → 设计 → writing-plans → subagent 执行 → 回归 → 归档。

## 14. 验证清单

- [ ] 全文搜索跨项目命中标题/描述，与筛选叠加分页正确
- [ ] 批量指派/流转/删除：权限逐条校验、留痕、跳过统计
- [ ] 甘特视图：任务条区间、色规、延期红/阻塞琥珀、点击跳详情
- [ ] 派生 BLOCKED：未完成前置任务显示 ⛔，解锁后消失；4 态拓扑校验未破坏
- [ ] overdue_days 正确；项目看板延期卡下钻列表
- [ ] 通知：指派/评论/@/解锁/截止临近/延期六类事件触达与已读
- [ ] 图片附件预览、受控下载鉴权（非成员 403）
- [ ] 知识库 CRUD、Markdown 渲染 XSS 防护、任务一键沉淀、双向跳转
- [ ] 项目归档只读、状态机可视化保存后流转生效
- [ ] 工作列表：跨项目聚合正确、四组分组、今日截止置顶、跳转详情、一键流转
- [ ] 项目卡聚合统计正确；「我的项目」过滤生效
- [ ] 项目动态流展示最近留痕，时间倒序
- [ ] 缺陷修复回归：OVERDUE 任务可直接「完成/继续处理」；`/api/projects/users` 非 ADMIN 可访问；导出带筛选参数
- [ ] 评审修正回归：知识删除物理清理磁盘附件；归档项目全写操作 403；知识链接仅 http/https/mailto；@提及按 username 唯一匹配；F2 项目卡聚合仅统计顶层任务
- [ ] 全链路回归：原 4 列看板拖拽、列表导出、详情 5-tab、依赖环检测不受影响
- [ ] bundle 重建 + 版本号更新 + 双系统回归（共享文件如有改动）

## 15. 待确认事项

- [ ] B3 里程碑、D4 项目可见性、日历视图、项目统计报表：确认不做（默认评估项）
- [ ] 甘特条拖拽调日期（B2 二期）：确认本期仅展示
- [ ] 附件静态下载下线节奏：灰度观察期（建议 ≥2 周）
