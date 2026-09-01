# CLAUDE.md — Claude 项目工作指南

> 本文件是 Claude 在本项目工作时的特定指南。**核心规则与 AGENTS.md 一致**,本文件仅补充 Claude 特有的工作偏好、技能调用顺序、工具使用约束。
> 阅读优先级:本文件 > AGENTS.md > 用户 user_rules。

## 1. 项目一句话

制造品质管理系统:Node.js + Express + MariaDB + 原生 HTML 单页,含管制流程管理、样品管理、治具管理、全局工作台与项目追踪五大子系统,统一门户入口 portal.html。**架构基础：子系统插件协议（见 AGENTS.md 第 17 节）**，新增子系统通过 manifest.json + 标准接口即可接入框架。

**子系统清单**(由 `node tools/sync-subsystem-docs.js` 自动维护):

<!-- AUTO-SUBSYSTEMS:START -->
- **管制流程管理**(`control`)：覆盖管制/不良品管制申请→会签→贴标入仓→NCR→处理会签→重工→入库出货全流程
- **治具管理**(`fixtures`)：覆盖治具申请→制作→验证移交→领用→维修→报废全流程
- **项目追踪**(`projects`)：多项目问题/任务追踪：看板、子任务、依赖、评论、附件、留痕、导出
- **样品管理**(`samples`)：覆盖样品发行→确认→生命周期管理→分发全流程
- **全局工作台**(`workbench`)：跨部门项目进度监控，合并样品与治具待办积压视图
<!-- AUTO-SUBSYSTEMS:END -->

完整项目指南见 [AGENTS.md](./AGENTS.md)。

## 2. Claude 工作流程(强制)

### 2.1 收到非平凡需求时,MUST 按顺序执行

```
1. Skill: brainstorming        → 探索意图、对比方案、用户确认设计
2. 写设计文档                  → docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
3. Skill: writing-plans        → 产出实现计划 docs/superpowers/plans/YYYY-MM-DD-<topic>.md
4. subagent 驱动执行(Task 工具)→ 每 Task 派发 general_purpose_task subagent
5. browser_use subagent 验证   → 自动化回归
6. 输出文件臃肿检测报告
```

> 迭代完成部署后,将已实施的设计文档/实现计划归档至 `docs/archive/`,当前有效文档保留在 `docs/superpowers/`。

### 2.2 技能调用时机

| 技能 | 触发条件 |
|---|---|
| `brainstorming` | 任何创建功能/构建组件/添加功能/修改行为的需求(创意工作前 MUST 调用) |
| `writing-plans` | 已有 spec/需求,多步任务,动代码前 MUST 调用 |
| `systematic-debugging` | 遇到 bug/测试失败/异常行为,提出修复前 MUST 调用 |
| `test-driven-development` | 实现任何功能/bugfix,写实现代码前 MUST 调用 |
| `code-review` | 完成任务/实现主要功能/合并前 SHOULD 调用 |
| `self-improvement` | 命令失败、用户纠正、发现知识过时、发现更好方法时 SHOULD 调用 |

### 2.3 例外(可跳过 brainstorming + writing-plans)

- 简单 bug 修复(单行/单函数)
- 纯文档更新
- 配置单值改动
- 用户明确指示「直接改」

但仍需:全链路排查 + 回归验证 + 臃肿检测报告。

## 3. 工具使用约束

### 3.1 优先级(CRITICAL)

- 读文件 → `Read`(禁 `cat`/`head`/`tail`)
- 编辑文件 → `Edit`(禁 `sed`/`awk`)
- 创建文件 → `Write`(禁 `cat heredoc`/`echo >`)
- 搜索文件名 → `Glob`(禁 `find`)
- 搜索文件内容 → `Grep`(禁 `grep`/`rg`)
- 模糊语义搜索 → `SearchCodebase` 或 `Task` with `search` subagent
- 终端操作 → `RunCommand`(仅限 git/npm/system 命令,禁用于文件操作)

### 3.2 并行调用

- 无依赖的多个工具调用 MUST 在同一消息内并行(如同时读多个文件、同时 git status + git log + git diff)
- 上限 5 个并行工具调用(除非用户明确要求更多)

### 3.3 Subagent 派发

- 复杂多步任务、跨层改动、产生大量中间 token 的任务 → `Task` with `general_purpose_task`
- 代码库探索、模糊搜索 → `Task` with `search`
- UI 设计/组件 → `Task` with `ui-designer`
- API 设计/后端架构 → `Task` with `backend-architect`
- 前端架构 → `Task` with `frontend-architect`
- 浏览器自动化验证 → `Task` with `browser_use`

**Subagent 使用原则**:
- 派发后不再重复 subagent 已做的搜索
- 给 subagent 提供完整上下文(它看不到对话历史)
- 用祈使句描述任务,不用第一人称

### 3.4 TodoWrite

- 3+ 步任务 MUST 用 TodoWrite 跟踪
- 完成任务后 IMMEDIATELY 标记 completed(不要批量)
- 一次仅 1 个 in_progress

### 3.5 AskUserQuestion

- 不确定的需求、冲突的上下文、无法确认的技术细节 → 主动问
- 变更可能影响现有系统 → 提前明确告知风险与影响范围
- 提供选项时,推荐项放第一并标注「(Recommended)」

## 4. 代码风格偏好

### 4.1 JavaScript(项目当前风格)

- 函数声明优先于箭头函数(顶层函数 `function foo(){}` 或 `async function foo(){}`)
- 单行压缩风格(项目历史风格,如 `function foo(a,b){return a+b;}`)
- 字符串:模板字符串 `` ` `` 优先于 `+` 拼接(含变量时)
- 错误处理:API 边界 try-catch,内部信任不包
- 不写 JSDoc(项目无此习惯),但复杂逻辑写中文行内注释

### 4.2 CSS(项目当前风格)

- 单行规则(如 `.modal{background:#fff;border-radius:16px;...}`)
- CSS 变量:`--brand`/`--muted`/`--line`/`--bg`/`--ok`/`--warn`/`--shadow`(见 `:root`)
- 颜色用 hex 或 var(),不用 rgb()/hsl()
- 媒体查询 `min-width` 移动优先

### 4.3 HTML

- 语义化标签(`<table>`/`<form>`/`<nav>` 等)
- 不写 ARIA(项目当前无,留待独立无障碍任务)
- 内联 `style="..."` 仅用于一次性样式,复用样式 MUST 抽 CSS 类

### 4.4 EditorConfig 格式

根目录 `.editorconfig` 统一格式（2 空格 / UTF-8 / LF / 末行换行），IDE 自动识别，生成的代码 MUST 匹配。

### 4.5 dotenv 加载规范（MUST）

- 独立运行脚本 MUST 顶部先 `require('dotenv').config()` 再 `require('db')`（db.js 配置模块加载时求值，缺加载 Access denied）
- 豁免：纯导出模块 / server.js 加载的后端 / 测试 getApp() 链路 / tools/ 脚本

## 5. 全链路变更规则(核心)

> 完整规则见 AGENTS.md 第 6 节与用户 user_rules。Claude MUST 永久记忆:

1. **变更前**:全局扫描 5 维度(代码/SQL/配置/接口/文档),输出《全链路关联依赖清单》
2. **变更中**:清单内所有关联项同步改;高危删除三步走(兼容→注释→物理删除)
3. **变更后**:补关联单元测试 + 输出回归清单 + 提示上线 1~3 周期监控

**拦截逻辑**:
- 用户只改单点拒绝全链路 → 拒写代码
- 直接删字段无兼容 → 标记高危中止
- 只改主文件遗漏关联 → 列遗漏暂停

### 5.1 子系统隔离原则(强制)

项目含样品管理与治具管理两个独立子系统,修改任一子系统 MUST 确保不影响另一子系统:

1. **共享资源变更 MUST 双系统回归**:修改 `server.js`/`db.js`/`app.css`/`modal.js`/`portal.html` 等共享文件时,Claude MUST 在样品和治具两个子系统中均进行回归验证。
2. **禁止交叉污染**:不得为修复一个子系统而改变另一子系统的行为、样式、接口或状态机。
3. **拦截**:修改共享文件仅验证一个子系统 → 暂停;为治具修改了样品状态机 → 标记高危中止。

## 6. 文件容量红线(强制)

详见 AGENTS.md 第 7.1 节。关键阈值:

- 子系统前端入口 `subsystems/*/frontend/index.html`:600 行 / 20000 字符
- `server.js`/`routes/*.js`:400 行(Service 业务逻辑)
- `db.js`:200 行(通用工具)
- 顶层函数 ≤10/文件,单函数 ≤60 行

**预警触发时**:
- 70%:停止新增业务,输出拆分方案
- 90%:仅允许精简/重构,禁追加新功能

**当前所有文件均在健康容量范围内,无预警触发**。

## 7. 修改完成强制报告

每次修改文件结束 MUST 输出 3 项:

1. **容量**:文件类型、有效代码行、总字符、距上限剩余
2. **元素**:函数/Class 数量,是否触发预警
3. **冗余**:未使用导入、废弃代码、可合并重复 + 瘦身方案

## 8. Git 规范

- Conventional Commits 格式(`feat`/`fix`/`refactor`/`docs`/`chore`/`test`/`style`/`perf`)
- 一个 Task 一个 commit
- commit 信息聚焦「why」
- **NEVER** push 除非用户明确要求
- **NEVER** `--force` 到 main
- **NEVER** 修改 git config
- **NEVER** `reset --hard`/`checkout .`/`clean -f` 除非用户明确要求
- 首次 init 仓库需用户确认(归属/分支策略/远端)

## 9. 响应式 UI 约定

| 断点 | 宽度 | 布局 |
|---|---|---|
| XS | <576px | 单栏 |
| SM | 576~767px | 单栏(字段 2 列) |
| MD | 768~1199px | 双栏 35/65 |
| LG | 1200~1599px | 双栏 30/70,弹窗 800px |
| XL | ≥1600px | 三栏 25/25/50,弹窗 900px |

新增 UI MUST 遵循上述断点,CSS Grid + Flexbox,避免硬编码 px。

## 10. API 与状态机

### API
- 路径 `/api/...`,JSON 返回,错误 `{error:'...'}` + 语义化 HTTP 码
- session cookie 鉴权(`requireAuth` 中间件)
- 角色:`ADMIN`/`RD`/`ME`/`QA`/`CUSTODY`
- 变更出入参 MUST 保留旧参数兼容,排查下游

### 状态机
**样品**:`NEW → PRODUCED → RELEASED → IN_CUSTODY → RETURNING → RETIRED`
- 研发扫码 → PRODUCED
- 品保扫码 → RELEASED
- 保管扫码 → IN_CUSTODY
- 周期到点 → 派生「待复检」/「逾期」

**治具**:`REQUESTED → ACCEPTED → VERIFY_PENDING → TRANSFERRED ⇄ IN_USE → REPAIRING_ME/REPAIRING_RD → REPAIR_DONE → TRANSFERRED → RETIRED`,另有 `IN_USE←IMPROVING` 改善流程。验证为**单人验证**（申请部门人员验证即可移交）；`VERIFY_RD_OK/VERIFY_ORG_OK` 为历史状态（旧双人验证，存量数据兼容）
- RD制作 → VERIFY_PENDING
- 申请部门人员单人验证 → TRANSFERRED
- ME/QA/CUSTODY领用 → IN_USE
- 领用中可报修(自行/退回RD) → 维修完成 → ME确认 → TRANSFERRED
- ADMIN报废 → RETIRED
- 改善中不能领用，完成后直接报废

## 11. 当前技术债(新增功能前评估)

- `subsystems/fixtures/backend/routes-fixtures.js` 状态机分支多（含 action helper 拆分后仍偏大），后续治具迭代需关注
- `subsystems/workbench/frontend/js/views/dashboard.js` 顶层函数 8 个（≤10），阈值弹窗已抽独立 `threshold.js`
- 无阻塞性技术债；旧版 `public/js/*`、`routes/samples.js` 等已随 Phase 5/6 迁移删除，子系统前端均按 views/ 拆分
- `public/css/app.css` 已达 94% 字符红线（约 19.9k/20k，2026-08-06），建议门户块拆独立样式文件（需三系统回归）

## 12. 验证清单(提交前自检)

- [ ] 全链路依赖已排查(5 维度)
- [ ] 关联文件已同步修改
- [ ] 文件臃肿检测报告已输出
- [ ] 回归验证步骤已列
- [ ] 子系统隔离已验证（修改共享文件 MUST 双系统回归）
- [ ] 兼容性影响已说明
- [ ] 部署/回滚步骤已提供
- [ ] 上线监控提示已给出(1~3 周期)
- [ ] 文档已同步(如适用)

## 13. 输出风格

- 简洁直接,不废话
- 中文响应(用户语言一致)
- 代码引用用可点击链接 `[文件名](file:///path#L行号)`
- 代码块用三反引号 + 语言标签
- 表格/列表优先于大段文字
- 关键信息加粗
- 不用 emoji 除非用户要求
- 不预测时间估算

## 14. 禁止行为

1. 创建不必要文件(优先编辑已有)
2. 主动创建文档(除非用户要求)
3. 添加未要求的功能/重构/改进
4. 添加多余错误处理/兼容性 shim
5. 添加 JSDoc/类型注解到未改动的代码
6. 修改 AGENTS.md/CLAUDE.md 除非用户明确要求
7. 编造信息(不确定就问)
8. 原地堆砌新业务到大文件
9. 复制现有函数改少量参数追加到原文件

## 15. 子系统插件协议（Claude 实施指引）

> 完整协议定义见 [AGENTS.md 第 17 节](./AGENTS.md#17-子系统插件协议核心架构)。
> Claude 在涉及子系统的任务中 MUST 遵循本指引。

### 15.1 核心判断：新功能放哪里

收到用户需求时，先判断归属：

| 需求类型 | 归属 | 修改目标 |
|---|---|---|
| 属于现有子系统（样品/治具） | `subsystems/<id>/` | 只改该子系统目录内文件 |
| 全新业务模块 | 新建 `subsystems/<new-id>/` | 按协议创建子系统 |
| 框架级功能（鉴权/日志/门戶/样式基础） | `shared/` 或 `server.js` | 修改共享层 |
| 跨子系统功能 | `shared/` | 抽取为共享模块 |

### 15.2 Claude 新增子系统标准流程

当用户需要创建新子系统时，Claude MUST 按以下步骤执行：

```
1. brainstorming        → 探索子系统需求、状态机设计、角色权限
2. 写 design doc        → docs/superpowers/specs/YYYY-MM-DD-<subsystem>-design.md
3. writing-plans        → 产出实现计划
4. 生成 manifest.json   → 基于协议规范，填写完整 manifest
5. 生成目录骨架         → mkdir + 创建 backend/index.js / db/schema.sql / frontend/
6. 生成前端骨架         → index.html + router.js + views/*.js
7. 验证                 → 启动服务，确认门户卡片出现 + 导航正常 + 路由可用
8. 臃肿检测报告         → 按 AGENTS.md 第 9 节输出
```

### 15.3 manifest.json 生成校验清单

Claude 生成 manifest.json 后 MUST 自检：

- [ ] `id` 全小写 kebab-case，与目录名一致
- [ ] `route.prefix` 以 `/api/` 开头，不与现有子系统冲突
- [ ] `route.entry` 路径指向 `subsystems/<id>/frontend/index.html`
- [ ] `route.hashBase` 以 `/` 开头
- [ ] `database.tables[]` 每项含 `name` 和 `schema` 两个字段
- [ ] `roles.use` 至少包含 `ADMIN`
- [ ] `navigation[]` 每项含 `key`/`label`/`icon`/`view`/`roles` 五个字段
- [ ] `navigation[].view` 函数名不与现有子系统冲突（全局作用域）
- [ ] 如需状态机：`stateMachine.initial` 对应的状态在 `states` 中存在
- [ ] 如需状态机：每个 `transitions[].from` 和 `transitions[].to` 都在 `states` 中存在
- [ ] 如需文件管理：`files.categories[]` 每项含 `key`/`label`/`extensions`

### 15.4 共享资源变更强制双系统（三系统）回归

修改以下文件/目录时，MUST 在所有已注册子系统中回归验证：

| 共享资源 | 说明 |
|---|---|
| `shared/` | 框架共享模块 |
| `server.js` | 框架入口 |
| `db.js` | 数据库连接池 |
| `public/css/app.css` | 共享 CSS 变量和基础样式 |
| `public/portal.html` | 门户页 |

### 15.5 Claude 禁止行为（子系统相关）

1. **禁止**将新子系统代码写入 `routes/`、`public/js/`、`db/` 等旧目录
2. **禁止**在 `app.css` 中新增子系统特定样式（应写入 `frontend/css/module.css`）
3. **禁止**跨子系统引用文件（如从治具子系统 import 样品子系统的代码）
4. **禁止**修改 manifest.json 时不校验 schema
5. **禁止**在 subsystem 注册时硬编码 `server.js`（框架应自动发现）
6. **禁止**在 `portal.html` 中硬编码新子系统卡片（应用 JS 动态渲染）

### 15.6 新增子系统文档同步（强制）

> 新增/删除子系统后，Claude MUST 执行：
> 1. 运行 `node tools/sync-subsystem-docs.js`（自动重写 4 个文档的子系统清单标记块）
> 2. 人工同步标记块外内容：AGENTS.md 概述/技术债、CLAUDE.md 概述/隔离原则/技术债、README 功能章节/API 表、指南迁移表
> 3. 校验：`git diff` 中标记块内容与 `subsystems/*/manifest.json` 一致
>
> 拦截：标记块未同步 → 暂停；手改标记块 → 警告重生成。

## 16. 卡片设计系统（Claude 实施指引）

> 完整规范见 [docs/superpowers/specs/2026-08-04-card-design-system.md](./docs/superpowers/specs/2026-08-04-card-design-system.md) 与 [AGENTS.md 第 18 节](./AGENTS.md#18-卡片设计系统规范强制)。

### 16.1 核心要点

- 卡片圆角/过渡/阴影 MUST 使用 app.css 的 `--card-radius`/`--card-hover`/`--card-shadow-hover` token，禁止硬编码
- 统计卡 MUST 使用共享 `.kb-stat`（fluent-card + `.n`/`.l` + 可选 `.x` 扩展区），禁止自建卡片类
- 交互协议：hover 上浮 / 单击筛选 / 再次单击取消 / active 高亮；双击跳列表（仅单一子系统看板）
- 子系统补充样式（如积压标签 `.wb-tag`）写入本子系统 `module.css`

### 16.2 Claude 禁止行为（卡片相关）

1. 禁止在 app.css 新增子系统卡片样式（`.kb-stat` 是共享组件，修改需三系统回归）
2. 禁止硬编码卡片圆角 14/16px 或自定义 hover 阴影
3. 禁止统计卡与入口卡混用结构（`.kb-stat` 与 `.portal-card` 职责分离）

## 17. JS 合并构建（Claude 实施指引）

> 完整规范见 [AGENTS.md 第 19 节](./AGENTS.md#19-js-合并构建规范强制)。
> 每个子系统前端仅 1 个 `bundle.js`（25→1 / 16→1 / 7→1），defer 加载。

### 17.1 Claude MUST 遵守

- 新增/删除/重命名 `subsystems/*/frontend/js/` 下的 JS 文件后，**MUST 执行重建**：
  ```bash
  node tools/build-bundles.js   # 生成 /tmp/bundle-*.js
  sudo cp /tmp/bundle-*.js subsystems/*/frontend/js/bundle.js
  # 更新 index.html 中的版本号（tools/.bundle-ver 中获取）
  ```
- 修改任意 JS 文件内容后，同上重建
- 三个 `index.html` 中 **只能有 2 个 script**：`fluentui`（module） + `bundle.js`（defer）
- 初始化调用（`boot()`/`bootFixture()`）已包含在 bundle 末尾，**不要**在 HTML 中写内联 `<script>boot()</script>`

### 17.2 Claude 禁止行为

1. 在 `index.html` 中手动添加 `<script src="...">` 绕开 bundle
2. 修改 JS 文件后不重建 bundle（写代码 → 改测试 → 重建 bundle → 验证，这是完整流程）
3. 移除 bundle 末尾的 `boot()` 初始化调用

### 17.3 容量检测豁免

`bundle.js` 不适用 AGENTS.md 第 7.1 节单文件红线（它是构建产物，非源码）；
修改仍在原始拆分文件中进行，修改后重建即可。

---


## 18. 子系统上线保护规则（Claude 实施指引）

> 完整规则见 [AGENTS.md §20](./AGENTS.md#20-子系统上线保护规则强制)。Claude 在涉及子系统数据的任务中 MUST 遵守。

### 18.1 核心判断

- `subsystems/<id>/manifest.json` 顶层 `"deployed": true` = 该子系统**已正式上线**，数据受保护。
- 已上线子系统（当前：samples，2026-08-06）：**禁止注入测试数据、禁止清库、禁止跑数据写入类测试**。
- 未上线子系统可自由注入测试数据（seed/造数测试）。

### 18.2 Claude MUST 遵守

1. 对 `deployed:true` 子系统的验证只做「只读」：查询接口、页面浏览、登录；不 POST/PUT/DELETE 造数。
2. 不运行 `npm run seed-samples`（护栏会拒绝）；不手工向 samples/scan_logs/sample_models 写 SQL。
3. `tests/*.test.js` 中样品相关用例已被 `tests/helpers/deployed.js` 守卫自动跳过，不要绕过。
4. 用户要求清空/批量修改已上线数据时：先备份（/www/backup/），明确告知风险，用户确认后执行。
5. 修改 `deployed` 标记需用户明确授权。

### 18.3 拦截逻辑

- 用户要求向已上线子系统注入测试数据 → 拒绝并说明规则
- 修改 manifest deployed 未经授权 → 暂停

---

## 19. 标签与标示卡标准化规则（Claude 实施指引）

> 完整规范见 `docs/label-card-standard.md`，与 AGENTS.md 第 24 节一致。适用于样品子系统中「标签」与「标示卡」的代码/文档变更。

### 19.1 核心要点

1. **定义**：标签 = 贴实物的标签纸打印视图（2:3 布局，左 QR+基本信息，右空白标示卡区）；标示卡 = 承载品质信息的内容卡，三种形态（打印版 / 数字匿名卡 / 详情页编辑表单）。
2. **唯一事实来源 = `samples` 表**：标签与标示卡均**实时派生**渲染，**无独立存储**。禁止为二者建立独立数据副本、持久化缓存、冗余快照字段。
3. **尺寸联动**：标示卡纸张 = 标签纸去掉 QR 侧边的空白卡区尺寸；标签纸尺寸唯一数据源 `card-constants.js` 的 `PRESET_MM`（小 37×18 / 中 52×25 / 大 60×40mm + 自定义 30~150mm），禁止各自硬编码。
4. **双向更新**：字段变更仅需更新 `samples` 表一次，另一视图下次打印/查看自动同步；已打印旧纸需人工重新打印更换。
5. **版次机制**：新建/首发默认 `01`，复检/再发行自动 +1（上限 99），替代品复制原标示卡信息。
6. **缓存边界**：仅 QR 有 LRU 缓存（上限 200，键 = `sample_no/qr_token + width`），缓存仅依赖二维码编码内容，与品质字段无关。
7. **接口权限**：`label/download`、`qrcode/download` 仅 ADMIN/QA/RD；`card/print`、`label/print` 登录即可；数字标示卡 `GET /card/:sample_no` 为公开匿名。

### 19.2 Claude 禁止行为

- 在 `app.css` 添加标签/标示卡专属样式 → 拒绝，要求写入 `subsystems/samples/frontend/css/module.css`。
- 为标签/标示卡引入独立数据副本、持久化缓存 → 标记高危，中止。
- 尺寸常量各文件硬编码而非引用 `PRESET_MM` → 拒绝，要求统一引用。
- 修改标签/标示卡字段、尺寸、接口而未同步更新 `docs/label-card-standard.md` → 暂停，要求补齐。

---

## 20. 禁止自动重启与 PID 治理（Claude 实施指引）

> 与 AGENTS.md 第 23 节一致。本项目通过**宝塔面板**项目功能管理与运维，AI 不得代执行任何重启/杀进程/拉起服务的动作。

### 20.1 硬性禁令（MUST）

1. **AI 不得执行任何自动重启操作**：包括 `npm start`、`pm2 restart`、`kill`/`pkill` 后重启、宝塔「重启」、`systemctl restart`、`nohup ... &` 拉起等一切导致服务重启的动作。
2. **AI 不得修改/移除/添加任何重启或自启动机制**：不得改动 `sample_mgmt_start.sh`、PM2/BaoTa 启动配置、systemd/supervisor 配置。
3. 仅进行**只读类验证**，禁止借验证之名重启服务；确需重启时按 §23.2 提交申请、由运维执行。

### 20.2 PID 错位与多实例治理

> 背景：2026-08-24 宝塔面板显示 sample-mgmt「未启动」，实际服务却在跑。根因为 **`sample_mgmt.pid` 数字错位**——误写成其它进程 PID（曾恰为 trae 扩展宿主进程），面板回读校验失败误判。服务本身由真实进程（监听 4000）正常提供。

**核心：sample-mgmt 必须「单一入口 + 单实例」运行。**

1. **单一启动入口（MUST）**：启停只用宝塔面板（启动文件=`server.js`，端口=4000），禁止手工 `npm start` / `node server.js` / `nohup ... &` 另起实例。
2. **独立进程边界**：sample-mgmt(4000) 与 backend/CPK(3500) 是互不相关的独立面板项目，各自独立 PID 文件与端口，禁止混淆、禁止交叉启停。
3. **启动脚本已加固**：`sample_mgmt_start.sh` 已改为「若实例已运行则跳过并同步 PID，仅无实例时才拉起」，误跑也不会再造游离实例。
4. **防复发清单**：面板「负载状态」应始终仅一个 `node server.js`(4000)；发现非 4000 端口的 sample-mgmt 进程 = 游离残留，须由运维清理；PID 文件与 4000 归属不一致 → 按 §20.1 提交重启申请，由运维「停止→启动」接管。

### 20.3 AI 拦截逻辑

- 用户要求手工 `npm start`/`node server.js` 另起 sample-mgmt 实例 → 拒绝，改走宝塔面板。
- 用 `pgrep` 判定时仅允许按「node 主进程 + 服务绝对路径」匹配，禁止用裸 `server.js`（会误命中 backend/CPK 等其它项目）。

---

**本文件为 Claude 特定指南。核心规则与 AGENTS.md 一致,修改本文件需用户明确同意。**
