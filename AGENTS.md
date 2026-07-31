# AGENTS.md — 制造品质管理系统 AI 协作指南

> 本文件是所有 AI agent(包括 Claude、Codex、Gemini 等)在本项目工作时的统一指南。
> 任何 AI 在动手前 MUST 完整阅读本文件,并遵守其中所有规则。

## 1. 项目概述

**制造品质管理系统**:含样品管理与治具管理两大子系统，统一门户入口（portal.html），三方扫码驱动状态机，全量留痕。

**子系统**:
- **样品管理**:覆盖样品「发行 → 确认 → 生命周期管理 → 分发」全流程
- **治具管理**:覆盖治具「申请 → 制作 → 验证移交 → 领用 → 维修 → 报废」全流程

**五个责任主体**:
- 研发工程:建样、制作治具、扫码确认制作、维修治具、创建替代品
- 品保文管中心:样品扫码发行/复检/审核退回；治具验证移交/领用/报修
- 生技部:样品保管/退回；治具验证移交/领用/保养/维修
- 各部门保管:样品接收保管/申请退回；治具验证移交/领用/报修
- 管理员:用户管理、全局查看、治具报废

**状态机**:
- 样品:`NEW → PRODUCED → RELEASED → IN_CUSTODY → RETURNING → RETIRED`
- 治具:`REQUESTED → VERIFY_PENDING → VERIFY_RD_OK/VERIFY_ME_OK → TRANSFERRED ⇄ IN_USE → REPAIRING_ME/REPAIRING_RD → REPAIR_DONE → TRANSFERRED → RETIRED`

## 2. 技术栈

| 层 | 技术 |
|---|---|
| 后端 | Node.js + Express 4.x(CommonJS) |
| 数据库 | MariaDB(MySQL) via mysql2,连接池,数据存 `sample_mgmt` 库 |
| 鉴权 | express-session + bcryptjs,8h session |
| 二维码 | qrcode |
| 前端 | 原生 HTML/CSS/JS 单页(无构建、无框架) |
| 配置 | dotenv 加载 .env;PM2/宝塔注入的环境变量优先 |

**数据库**:已从 SQLite 迁移至 MariaDB。如需回退 SQLite,仅需替换 `db.js`。

## 3. 目录结构

```
/www/wwwroot/sample-mgmt/
├── server.js              # 后端入口:加载中间件、注册路由模块
├── db.js                  # 数据层入口:建表/迁移/工厂组装
├── db/
│   ├── samples.js         # 样品 CRUD + 编号生成
│   ├── fixtures.js        # 治具 CRUD + 编号生成
│   ├── users.js           # 用户查询
│   └── logs.js            # 操作日志
├── routes/
│   ├── auth.js            # 鉴权路由
│   ├── samples.js         # 样品路由(CRUD + QR)
│   ├── fixtures.js        # 治具路由(CRUD + 扫码状态机)
│   ├── cards.js           # 标示卡路由(匿名页/标签/打印)
│   ├── scan.js            # 样品扫码台路由(解析 + 状态机)
│   └── misc.js            # 杂项路由(看板/日志/用户/健康检查)
├── logger.js              # 日志系统(Winston)
├── seed.js                # 种子:6 个角色账号 + 1 个演示样品
├── seed-rich.js           # 丰富演示数据:14 个样品,6 种状态全覆盖
├── test_flow.js           # 端到端流程测试
├── public/
│   ├── portal.html        # 门户首页(统一入口,先选子系统后登录)
│   ├── index.html         # 样品单页入口(纯 HTML 结构)
│   ├── fixture.html       # 治具单页入口(独立 SPA)
│   ├── css/
│   │   └── app.css        # 全部样式(样品+治具共享 CSS 变量)
│   ├── js/                # 前端模块(样品 16 个 + 治具 5 个,按职责拆分)
│   └── uploads/           # 样品/治具图片上传目录
├── data/                  # 共享数据(limit-items.json, source-types.json)
├── tests/                 # 单元测试(含 helpers)
├── docs/
│   ├── deploy-baota.md    # 宝塔部署文档
│   ├── operation-manual.md # 用户操作说明书
│   └── superpowers/
│       ├── specs/         # brainstorming 产出的设计文档
│       └── plans/         # writing-plans 产出的实现计划
├── scripts/
│   ├── to-production.sh   # 演示→生产模式切换
│   └── to-demo.sh         # 生产→演示模式切换
├── .env.example           # 环境变量模板
├── .gitignore
└── package.json
```

## 4. 启动与运行

```bash
npm install         # 安装依赖
cp .env.example .env   # 首次复制环境变量
npm run seed        # 初始化角色账号 + 演示样品(仅一次)
npm run seed-rich   # 导入丰富演示数据(14 个样品,6 种状态全覆盖)
npm start           # 启动,访问 http://localhost:3000(端口可通过 .env 中 PORT 配置)
```

**演示账号**(更多见 README.md):
| 账号 | 密码 | 角色 | 部门 |
|---|---|---|---|
| admin | admin123 | 管理员 | 系统 |
| rd01 | rd123 | 研发(RD) | 研发中心 |
| qa01 | qa123 | 品保(QA) | 品保文管中心 |
| mfg01 | mfg123 | 保管(CUSTODY) | 制造部 |
| fqc01 | fqc123 | 保管(CUSTODY) | FQC |
| me01 | me123 | 保管(ME) | 生技部 |

## 5. AI 工作流程(强制)

任何非平凡的需求,**MUST** 按以下流程执行,不得跳步:

```
1. brainstorming(技能)  → 探索意图、对比方案、用户确认设计
2. 写设计文档            → docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md
3. writing-plans(技能)  → 产出实现计划 docs/superpowers/plans/YYYY-MM-DD-<topic>.md
4. subagent 驱动执行     → 每个 Task 派发独立 subagent,Task 间审查
5. 回归验证              → browser_use 自动化 + 手动检查清单
6. 文件臃肿检测报告       → 修改完成 MUST 输出(见第 9 节)
```

**例外**:简单 bug 修复、单行配置改动、纯文档更新可跳过 1-3,但仍需第 5-6 步。

## 6. 全链路变更规则(强制)

> 详细规则见用户 user_rules。核心要点:

1. **变更前** MUST 全局扫描项目,输出《全链路关联依赖清单》(上游/下游/跨模块),覆盖 5 维度:代码、SQL、配置、接口、文档。
2. **变更中** 禁止单点修改,清单内所有关联项同步改;无法同步的采用兼容改造方案(保留旧逻辑,逐步切换)。
3. **高危删除**(字段/接口/常量)MUST 三步走:兼容 → 注释下线 → 物理删除(≥2 个迭代周期后)。
4. **变更后** MUST 补充关联单元测试 + 输出业务回归清单 + 提示上线后 1~3 周期监控。

**AI 拦截逻辑**(触发即停止生成代码):
- 用户只改单点、拒绝全链路排查 → 拒写代码
- 直接删字段/参数无兼容代码 → 标记高危,中止
- 只改主文件、关联文件遗漏 → 列出遗漏,暂停

### 6.1 子系统隔离原则(强制)

本项目含**样品管理**与**治具管理**两个独立子系统,修改任一子系统 MUST 确保不影响另一子系统:

1. **共享资源变更 MUST 双系统回归**:修改共享文件（`server.js`/`db.js`/`app.css`/`modal.js`/`portal.html` 等）时,MUST 在样品和治具两个子系统中均进行回归验证,确认行为无变化。
2. **禁止交叉污染**:不得为了修复/优化一个子系统而改变另一个子系统的行为、样式、接口返回格式、状态机流转逻辑。
3. **共享 CSS 类修改**:修改 `app.css` 中的共享样式类时,MUST 同时在样品页面（`index.html`）和治具页面（`fixture.html`）验证渲染效果,不得破坏任一系统的 UI 布局。
4. **共享中间件/路由修改**:修改 `requireAuth`、`db.js` 连接池、公共路由模块时,MUST 验证两个子系统的鉴权、数据读写均正常。
5. **API 路径隔离**:样品 API（`/api/samples/...`）与治具 API（`/api/fixtures/...`）路径前缀已隔离,新增 API 不得跨子系统复用路径前缀。

**AI 拦截逻辑**:
- 修改共享文件但仅验证一个子系统 → 暂停,要求补充另一子系统的回归验证
- 为治具功能修改了样品的状态机/接口行为 → 标记高危,中止
- UI 改动仅在一个子系统验证 → 要求补充双系统截图/验证

## 7. 代码规范

### 7.1 文件容量红线(MUST)

| 文件类型 | 行数上限 | 字符上限 |
|---|---|---|
| 常量/枚举/实体DTO | 150 | — |
| 通用工具 utils | 200 | — |
| 独立脚本/通用函数 | 300 | — |
| Controller/API | 400 | — |
| Service 业务逻辑 | 400 | — |
| Vue/React 页面组件 | 400 | — |
| 项目唯一入口 main | 600 | — |
| SQL 脚本 | 800 | — |
| 任意源码文件(兜底) | — | 20000 |
| constants 常量文件(豁免) | 800 | — |
| 单元测试(豁免) | 1000 | — |

**阈值预警**:
- 达 70% 上限:MUST 停止新增业务逻辑,输出拆分方案
- 达 90% 上限:MUST 仅允许精简/重构,禁止追加新功能

### 7.2 元素数量

- 单文件顶层函数 MUST ≤10
- 单文件顶层 Class MUST ≤3
- 单函数内部代码块 MUST ≤60 行,超长 MUST 拆分子函数

### 7.3 单一职责

- Controller:仅参数接收/校验/转发,不写 DB/计算/渲染
- Service:仅业务流程,不写前端渲染/SQL/常量配置
- DB 操作统一抽 Mapper/DAO 层
- 常量/字典/枚举 MUST 抽至 constants 目录
- 页面复杂渲染逻辑 SHOULD 抽 hooks/helper 独立文件

### 7.4 命名风格

- JS:`camelCase` 变量/函数,`PascalCase` 类,`UPPER_SNAKE` 常量
- CSS:`kebab-case`,BEM 风格可选
- 文件:`kebab-case` 小写,业务按模块分文件

### 7.5 注释要求

新增/修改函数、类、接口 MUST 补充注释:
- 功能描述与变更目的
- 参数说明(类型、含义、必填/可选、是否兼容旧参数)
- 返回值说明(是否兼容旧调用方)
- 异常说明(变更后可能新增的异常场景)

## 8. Git 规范

### 8.1 提交格式(Conventional Commits)

```
<type>(<scope>): <subject>

<body 可选,说明 why>

<footer 可选,如 BREAKING CHANGE>
```

**type**:
- `feat`:新功能
- `fix`:bug 修复
- `refactor`:重构(无功能变化)
- `docs`:文档
- `chore`:构建/工具/杂项
- `test`:测试
- `style`:格式(不影响代码逻辑)
- `perf`:性能优化

**scope** 示例:`modal`/`detail`/`responsive`/`auth`/`scan`/`db`

**示例**:
```
feat(responsive): add 3 breakpoints (768/1200/1600px)

- 768px: 2-col grid 35%/65%
- 1200px: modal 800px, 2-col 30%/70%
- 1600px: modal 900px, 3-col 25%/25%/50%, show .detail-img
```

### 8.2 提交粒度

- 一个 Task 一个 commit(参考实现计划)
- commit 信息聚焦「why」而非「what」
- **禁止** `git add -A` 后一次提交多个无关改动
- **禁止** push 除非用户明确要求

### 8.3 禁止行为

- NEVER `git push --force` 到 main/master
- NEVER 修改 git config 除非用户要求
- NEVER `reset --hard` / `checkout .` / `clean -f` 除非用户明确要求
- NEVER commit `.env` / 凭证文件

## 9. 修改完成强制报告(MUST)

每次修改文件结束,MUST 输出 3 项臃肿检测信息:

1. **文件类型、当前有效代码行数、总字符、距离上限剩余空间**
2. **当前文件函数/顶层 Class 数量,是否触发预警阈值**
3. **冗余清单**:未使用导入、废弃代码块、可合并重复逻辑 + 瘦身拆分优化方案

## 10. 响应式 UI 约定

本项目前端为单体 HTML,CSS 已建立响应式断点体系:

| 断点 | 视窗宽度 | 用途 |
|---|---|---|
| XS | <576px | 手机单栏 |
| SM | 576~767px | 大手机/小平板 |
| MD | 768~1199px | 平板双栏 |
| LG | 1200~1599px | 桌面双栏 |
| XL | ≥1600px | 大屏三栏 |

新增 UI MUST 遵循上述断点,使用 CSS Grid + Flexbox,避免硬编码 px 宽度。

## 11. API 约定

- 所有 API 路径以 `/api/` 开头
- 返回 JSON,错误格式 `{ "error": "..." }`,HTTP 状态码语义化
- 鉴权:session cookie(`requireAuth` 中间件)
- 角色:`ADMIN`/`RD`/`ME`/`QA`/`CUSTODY`,接口需校验角色权限
- 样品状态:`NEW`/`PRODUCED`/`RELEASED`/`IN_CUSTODY`/`RETURNING`/`RETIRED`
- 治具状态:`REQUESTED`/`VERIFY_PENDING`/`VERIFY_RD_OK`/`VERIFY_ME_OK`/`TRANSFERRED`/`IN_USE`/`REPAIRING_ME`/`REPAIRING_RD`/`REPAIR_DONE`/`RETIRED`

**变更 API 出入参** MUST 保留旧参数做兼容,全量排查下游(前端页面、第三方对接)。

## 12. 数据库约定

- 五表:`users` / `samples` / `scan_logs` / `fixtures` / `fixture_logs`(schema 见 `db.js`)
- 数据库写入由 `mysql2` 连接池自动提交,无需手动 `persist()`(no-op 保留兼容)
- 时间字段:建表用 `TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,代码中用 `nowISO()` 生成 ISO 8601
- **改字段名/类型/删除字段** MUST 全量检索 DAO、XML、原生 SQL、ETL、报表、定时脚本、历史初始化脚本

## 13. 文档同步

代码修改完成后 MUST 同步更新文档(AGENTS.md/CLAUDE.md 除非用户明确要求):
- README.md 中受影响的功能说明、配置项、使用示例
- 接口文档(docs/api.md 或 Swagger 注释,若有)
- 依赖说明(版本变更原因与兼容性影响)
- 提供**变更记录**:文件/接口/配置清单 + 兼容性影响 + 部署/回滚步骤

## 14. 当前已知技术债

- `public/js/scan.js` 239 行,接近 300 行上限(79.7%),函数多,后续版本可拆分 建议:扫码逻辑与 UI 渲染进一步解耦,提取扫码台状态提示组件
- `routes/fixtures.js` 231 行,接近 400 行上限(57.8%),状态机分支多,后续治具迭代需关注
- 无阻塞性技术债,`index.html` 已模块化拆分为骨架+外部 JS

## 15. 禁止行为黑名单

1. 只无限追加代码,从不清理废弃/重复/冗余内容
2. 超长 if/else、多层嵌套不拆子方法
3. 超大静态数组、长配置字典硬编码塞业务文件
4. 单个 controller/service 堆十余个无关联接口
5. 数百行巨型函数不拆分
6. 全局临时变量泛滥、大量复制粘贴
7. 长期保留 console/log 调试打印、测试临时代码
8. 大段废弃代码注释堆积,不删除不归档

## 16. 验证清单

任何修改完成前 MUST 自检:

- [ ] 全链路依赖已排查(5 维度)
- [ ] 关联文件已同步修改
- [ ] 文件臃肿检测报告已输出
- [ ] 回归验证步骤已列出
- [ ] 子系统隔离已验证（修改共享文件时 MUST 双系统回归）
- [ ] 兼容性影响已说明
- [ ] 部署/回滚步骤已提供
- [ ] 上线后监控提示已给出(1~3 周期)
- [ ] 文档已同步更新(如适用)

---

**本文件为项目级 AI 协作指南,适用于所有 AI agent。修改本文件需用户明确同意。**
