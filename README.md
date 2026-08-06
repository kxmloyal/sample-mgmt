# 制造品质管理系统

含**样品管理**、**治具管理**、**全局工作台**与**项目追踪**四大子系统，统一门户入口（portal.html），三方扫码驱动状态机，全量留痕。

**子系统清单**(由 `node tools/sync-subsystem-docs.js` 自动维护):

<!-- AUTO-SUBSYSTEMS:START -->
- **治具管理**(`fixtures`)：覆盖治具申请→制作→验证移交→领用→维修→报废全流程
- **项目追踪**(`projects`)：多项目问题/任务追踪：看板、子任务、依赖、评论、附件、留痕、导出
- **样品管理**(`samples`)：覆盖样品发行→确认→生命周期管理→分发全流程
- **全局工作台**(`workbench`)：跨部门项目进度监控，合并样品与治具待办积压视图
<!-- AUTO-SUBSYSTEMS:END -->

## 五个责任主体

| 阶段 | 责任方 | 主要职责 |
|------|--------|-----------|
| 样品制作 / 治具制作 | 研发工程(RD) | 建样、制作治具、扫码确认制作、维修治具、创建替代品 |
| 发行 / 验证移交 / 领用 | 品保文管中心(QA) | 样品扫码发行/复检/审核退回；治具验证移交/领用/报修 |
| 保管 / 领用 / 保养 | 各部门保管(CUSTODY) | 样品接收保管/申请退回；治具验证移交/领用/报修 |
| 验证 / 保养 / 维修 | 生技部(ME) | 样品保管/退回；治具验证移交/领用/保养/维修 |
| 系统管理 | 管理员(ADMIN) | 用户管理、全局查看、治具报废 |

---

## 样品管理

### 状态机

```
NEW → PRODUCED(制作完成) → RELEASED(已发行) → IN_CUSTODY(保管中)
                                                    ↓
                                            RETURNING(退回审核中)
                                                    ↓
                                            RETIRED(已作废)
```

周期到点派生 **待复检 / 逾期**（看板高亮预警）。

### 扫码台 — 三方扫码驱动状态机

| 当前状态 | 操作角色 | 扫码后动作 | 要求 |
|---|---|---|---|
| NEW(待制作) | 研发(RD) | → PRODUCED | 上传制作照片 |
| PRODUCED(制作完成) | 品保(QA) | → RELEASED | 填写复检周期 + 标示卡信息（三步向导）|
| RELEASED(已发行) | 保管(CUSTODY) | → IN_CUSTODY | 填写储位 |
| IN_CUSTODY 到期 | 品保(QA) | 复检 | 上传复检照片 |
| IN_CUSTODY | 保管(CUSTODY) | → RETURNING | 填写退回原因 |
| RETURNING | 品保(QA) | 多分支：重新发行/退回研发/直接作废/拒绝退回 | — |
| RETURNING(被指派) | 研发(RD) | 创建替代品 | 自动复制原样品信息 |

### 样品列表

- 多维度组合筛选（状态/部门/类型/限度项目/来源 + 关键词搜索）
- 快捷筛选（待处理/逾期/近7天到期）+ 芯片可视化
- 响应式表格（table-layout:fixed + colgroup）+ 列宽拖拽
- 移动端 data-label 卡片式布局
- 分页（默认 20 条/页）

### 样品详情弹窗

四栏 Tab：信息（CSS Grid 卡片布局 + 流转时间线）、全量日志、标示卡（编辑/打印）、大图

### 限度样品

样品类型 OK/NG、26 项限度项目、3 种来源（客供/元山/塔岗）、版次、测试标准/数据

### 数字标示卡

- 匿名页 `/card/:sample_no` 无需登录
- 双面标签打印（QR面 + 标示卡面）
- 尺寸选择（3档预设 + 自定义 30~150mm）
- 连续扫码打印队列 + 批量打印

---

## 治具管理

### 状态机

```
REQUESTED → ACCEPTED → VERIFY_PENDING → TRANSFERRED ⇄ IN_USE
                                       ↓
                                 REPAIRING_ME/REPAIRING_RD
                                       ↓
                                 REPAIR_DONE → TRANSFERRED
                                       ↓→ IMPROVING → RETIRED
```

> 验证为**单人验证**（申请部门人员验证即可移交）；`VERIFY_RD_OK/VERIFY_ORG_OK` 为旧双人验证的历史状态（存量数据兼容）。

### 治具看板

- DASH_STATS 配置驱动统计卡片（active 高亮 + 单击筛选）
- 逾期未归还预警表格
- 待保养预警表格
- 我的待办列表

### 治具清单

- 筛选（关键词/状态/部门）+ 每页条数选择器（10/20/50/100）
- colgroup + col-rsz 列宽拖拽 + data-label 响应式

### 治具操作日志

- 独立操作日志页（左侧导航「操作日志」）：全量日志 + 关键词搜索（操作/部门/备注）
- 列宽自适应（时间列固定、备注列弹性占余量）+ col-rsz 列宽拖拽
- 移动端自动转为 data-label 卡片式布局；详情弹窗「操作日志」Tab 同步支持

---

## 全局工作台

跨部门监控样品 + 治具全部活跃项目（合并视图），帮助各部门掌握积压情况。

### 功能

- **统计卡片**：总计 + 各部门卡片，互斥三档积压（≤3 天 / 3~7 天 / 7 天以上），标签随阈值动态显示
- **卡片交互**：单击部门卡筛选该部门数据、再次单击取消；双击/总计卡清除筛选
- **统一列表**：编号/名称/类型/阶段/负责部门/申请部门/停留时长/积压状态，支持类型 + 积压等级筛选
- **信息下钻**：点击列表行打开详情弹窗——左栏基本信息、右栏流转日志时间线（倒序最新在上 + 流程步骤号 + ⬆ 流向箭头 + 折叠）；弹窗宽高随信息密度自适应；「前往处理」跳转对应子系统扫码台并预填编号
- **阈值设置**（仅 ADMIN）：可自定义 3 天 / 7 天边界（支持快捷预设 3/7、5/10、7/14、10/30 天），保存后全局生效（存 `workbench_settings` 表），所有用户即时按新阈值渲染
- **逾期判定**：样品 NEW/PRODUCED 阈值放大 3 倍（制样中更宽松）；RELEASED/IN_CUSTODY 按复检日；治具维修/改善状态优先按 `expected_finish_at`（有值且未到期→正常，到期按超出天数），无该值则按报修日兜底

---

## 项目追踪

多项目问题/任务追踪子系统（入口 `/subsystems/projects/frontend/index.html`），面向 PM/项目成员的任务协作与进度监控。

### 功能

- **项目看板**：kb-stat 统计卡（项目数/总任务/已完成/进行中/已延期）+ 类别/优先级分布 + 完成率 + 近 8 周完成趋势（CSS 柱状图）
- **任务看板（Kanban）**：未开始/进行中/已完成/已延期 4 列，HTML5 拖拽流转（仅合法转移，非法回弹），项目筛选
- **任务列表**：跨项目筛选（项目/状态）+ 已延期行红色高亮 + CSV 导出（UTF-8 BOM）
- **任务详情**：主信息 + 子任务（三态 CAS 流转）+ 前置依赖（环检测/阻塞校验）+ 评论 + 附件上传 + 样品/治具关联 + 操作日志
- **项目列表**：项目 CRUD + 成员管理（添加/转让 owner/移除）；有任务的项目禁止删除（409）
- **状态机管理**（仅 ADMIN）：可视化编辑 4 态标签/颜色 + 转移规则，保存即时生效
- **并发防护**：任务编辑乐观锁（version 冲突 409）、状态流转 CAS、工作流配置行锁、同事务留痕

### 角色权限

| 角色 | 权限 |
|---|---|
| ADMIN / PM | 全局：建项目/任务/成员管理/删除；PM 为项目经理 |
| owner / member | 项目内管理（建任务/编辑/成员管理由 owner） |
| 其他角色 | 只读 + 流转自己名下任务（ASSIGNEE 伪角色） |

### 演示账号

| 账号 | 密码 | 角色 |
|---|---|---|
| pm01 | pm123 | 项目经理(PM) |

---

## 门户卡片个性化排列

门户首页（portal.html）支持用户级卡片个性化排列，偏好按登录用户独立保存。

- **编辑入口**：门户欢迎语旁「编辑排列」按钮，进入编辑模式后每张卡片出现 ⋮⋮ 拖拽手柄，按钮变为「保存顺序」「取消」
- **拖拽排序**：编辑模式下按住卡片拖拽换位，实时预览新顺序（仅内存操作，未保存不影响浏览态）
- **保存/取消**：点击「保存顺序」统一提交（PUT /api/portal/prefs），toast 提示已保存；点击「取消」丢弃本次调整，顺序回退到上次保存值
- **默认行为**：新用户/未配置用户按子系统默认顺序排列；未配置的子系统自动排尾；新增子系统无需迁移自动获得默认位置
- **清除恢复**：PUT /api/portal/prefs 传 `order=[]` 或 `null` 即清除偏好恢复默认顺序

---

## 运行

```bash
npm install          # 安装依赖
cp .env.example .env # 复制环境变量模板
npm run seed         # 初始化角色账号（仅一次）
npm run seed-samples # 样品全量测试数据（15个，6种状态全覆盖；⚠️ samples 已上线，护栏将拒绝执行）
npm run seed-fixture # 治具全量测试数据（15个，12种状态全覆盖）
npm start            # 启动，访问 http://localhost:4000（需先配置 .env 数据库连接）
```

### 环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `PORT` | 服务监听端口 | `4000` |
| `SESSION_SECRET` | 会话签名密钥 | `sample-mgmt-dev-secret-change-me` |
| `NODE_ENV` | 环境标识 | `development` |
| `LOGIN_RATE_LIMIT_MAX` | 登录速率限制（次/分钟） | `10` |
| `API_RATE_LIMIT_MAX` | API 速率限制（次/分钟） | `200` |
| `LOG_DIR` | 日志目录 | `logs` |
| `UPLOAD_MAX_SIZE` | 上传文件大小限制（字节） | `5242880`（5MB） |
| `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 数据库连接 | — |

> PM2/宝塔注入的同名环境变量优先，`.env` 仅作兜底。

## 演示账号

| 账号 | 密码 | 角色 | 部门 |
|------|------|------|------|
| admin | admin123 | 管理员 | 系统 |
| rd01 | rd123 | 研发(RD) | 研发部 |
| qa01 | qa123 | 品保(QA) | 品保文管中心 |
| mfg01 | mfg123 | 保管(CUSTODY) | 制造部 |
| fqc01 | fqc123 | 保管(CUSTODY) | FQC |
| me01 | me123 | 保管(ME) | 生技部 |

## API 一览

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/login` | POST | 否 | 登录 |
| `/api/logout` | POST | 是 | 登出 |
| `/api/me` | GET | 是 | 当前用户信息 |
| `/api/config` | GET | 否 | 公共配置（demoMode 演示账号开关，登录页使用）|
| `/api/samples` | GET | 是 | 样品列表（筛选/排序/逾期/分页）|
| `/api/samples` | POST | 是 | 新建样品（含限度字段）|
| `/api/samples/:id` | GET | 是 | 样品详情 + 操作日志 |
| `/api/samples/:id` | PUT | 是 | 更新样品 |
| `/api/samples/:id` | DELETE | 是 | 删除样品（仅 NEW/PRODUCED）|
| `/api/samples/:id/qrcode` | GET | 是 | 样品二维码 |
| `/api/samples/:id/qrcode/download` | GET | 是 | 下载高清二维码 |
| `/api/samples/:id/label/download` | GET | 是 | 下载标签 HTML |
| `/api/samples/:id/card/print` | GET | 是 | 打印标示卡 |
| `/api/samples/export` | GET | 是 | 样品列表导出 CSV（复用筛选参数，忽略分页）|
| `/api/fixtures` | GET | 是 | 治具列表（筛选/排序/分页）|
| `/api/fixtures/export` | GET | 是 | 治具清单导出 CSV（复用筛选/排序参数，忽略分页）|
| `/api/fixtures` | POST | 是 | 新建治具申请 |
| `/api/fixtures/scan` | GET/POST | 是 | 治具扫码台（解析/执行状态机）|
| `/api/fixtures/dashboard` | GET | 是 | 治具看板数据 |
| `/api/fixtures/logs` | GET | 是 | 治具操作日志（全量，可搜索）|
| `/api/fixtures/:id` | GET | 是 | 治具详情 + 操作日志 |
| `/api/fixtures/:id` | PUT | 是 | 更新治具（状态机流转）|
| `/api/fixtures/:id/logs` | GET | 是 | 单治具操作日志 |
| `/api/fixtures/:id/retire` | PUT | 是(ADMIN) | 治具报废 |
| `/api/fixtures/:id/qrcode` | GET | 是 | 治具二维码 |
| `/api/fixtures/:id/files` | GET/POST | 是 | 治具附件列表/上传 |
| `/api/fixtures/:id/files/:fileId` | DELETE | 是 | 删除治具附件 |
| `/api/fixtures/:id/files/:fileId/preview` / `download` | GET | 是 | 附件预览/下载 |
| `/api/resolve` | GET | 是 | 解析扫码内容 |
| `/api/scan` | POST | 是 | 执行扫码操作（状态机）|
| `/api/dashboard` | GET | 是 | 样品看板数据 |
| `/api/workbench` | GET | 是 | 工作台合并数据（样品 + 治具积压）|
| `/api/workbench/settings` | GET/PUT | 是(ADMIN 写) | 工作台积压阈值 |
| `/api/subsystems` | GET | 是 | 已注册子系统清单（门户渲染）|
| `/api/subsystems/:id/deployed` | PUT | 是(ADMIN) | 子系统上线开关（双向切换 deployed，切换即生效 seed/jest 护栏）|
| `/api/portal/prefs` | GET | 是 | 当前用户门户卡片排序偏好（无记录返回空数组）|
| `/api/portal/prefs` | PUT | 是 | 保存/清除排序偏好（order=[] 或 null 清除）|
| `/api/rd-users` | GET | 是 | RD 用户列表（退回指派选择）|
| `/api/logs` | GET | 是(ADMIN) | 全量操作日志 |
| `/api/users` | GET/POST | 是(ADMIN) | 用户管理 |
| `/api/users/batch` | POST | 是(ADMIN) | 用户批量管理（delete/reset-password/update/enable/disable）|
| `/card/:sample_no` | GET | **否** | 匿名数字标示卡 |
| `/health` | GET | 否 | 健康检查 |

## 技术栈

Node.js + Express · MariaDB(MySQL) via mysql2 · express-session + bcryptjs · qrcode · Fluent Web Components · 原生 HTML/CSS/JS 单页（源文件无框架；前端 JS 由 `tools/build-bundles.js` 合并为单 bundle，版本号破缓存）。

## 目录

```
server.js                   后端入口：加载中间件、扫描注册子系统
db.js                       数据层入口：建表/迁移/工厂组装
logger.js                   日志系统（Winston，按天轮转）
seed.js                     种子：6 个角色账号
seed-samples.js             样品全量测试数据（15个，6种状态）
seed-fixture.js             治具全量测试数据（15个，12种状态）
test_flow.js                样品端到端流程测试（建样→制作→发行→保管→退回→替代）
test_fixture_flow.js        治具生命周期 E2E 测试（申请→接收→上传文件→制作→单人验证→领用→改善→报废）
test_fixture_files.js       治具文件管理 E2E 测试（上传/下载/删除/权限）
shared/                     框架共享层
  ├── middleware/           鉴权 + 上传中间件
  ├── state-machine.js      通用状态机引擎
  ├── file-manager.js       通用文件管理 DAO
  └── frontend/             共享前端模块（api-base/modal/utils）
routes/
  ├── auth.js               鉴权路由
  ├── misc.js               杂项路由（看板/日志/用户/健康检查）
  └── subsystems.js         子系统发现 + CRUD API
subsystems/                 所有子系统（插件协议，每目录自包含）
  ├── samples/              样品管理（manifest + backend/db/frontend/seed）
  ├── fixtures/             治具管理（同构）
  ├── workbench/            全局工作台（同构）
  └── projects/             项目追踪（同构）
db/                         数据访问层
  ├── users.js              用户查询
  ├── fixture-files.js      治具文件 DAO
  ├── tx.js                 事务工具
  └── migrations.js         增量迁移
data/
  ├── limit-items.json       限度项目（26项）
  └── source-types.json      来源类型
public/
  ├── portal.html            门户首页（统一入口）
  ├── admin-users.html       用户管理（框架级独立页，仅 ADMIN；含批量管理/PM 角色）
  ├── admin-subsystems.html  子系统管理面板
  ├── css/app.css            全局共享样式
  └── uploads/               样品/治具图片与文件上传目录
docs/
  ├── deploy-baota.md        宝塔部署文档
  ├── operation-manual.md    用户操作说明书
  ├── archive/               历史设计文档与实现计划（已完成迭代归档）
  └── superpowers/           当前有效的设计规范与计划
tools/
  ├── build-bundles.js       JS 合并构建（各子系统 JS → 单 bundle + 版本号）
  ├── bundle-sources.json    bundle 源文件清单（依赖顺序）
  ├── .bundle-ver            当前 bundle 版本号（构建生成，gitignore）
  ├── create-subsystem.js    子系统脚手架 CLI（交互生成全套骨架）
  └── subsystem-templates.js 子系统骨架模板（CLI 与面板共用）
```

## 响应式断点

| 断点 | 宽度 | 布局 |
|---|---|---|
| XS | <576px | 单栏 |
| SM | 576~767px | 单栏（字段 2 列） |
| MD | 768~1199px | 双栏 35/65 |
| LG | 1200~1599px | 双栏 30/70，弹窗 800px |
| XL | ≥1600px | 三栏 25/25/50，弹窗 900px |

表格移动端自动转为 data-label 卡片式布局。

## 健康检查

```
GET /health → { "status":"ok","uptime":123,"timestamp":"...","memory":...,"db":"connected" }
```

## 日志

- `logs/` 目录，JSON 格式，按天轮转，保留 30 天，单文件上限 20MB
- Morgan short 格式访问日志
- 级别：生产 `info`，开发 `debug`

## 速率限制

| 端点 | 限制 |
|---|---|
| `/api/login` | 10 次/分钟/IP |
| `/api/*` | 200 次/分钟/IP |

## 安全

- Helmet（XSS/MIME sniff/clickjack/HSTS）
- Session Cookie：httpOnly + sameSite strict
- 文件上传：jpg/png/gif/webp ≤5MB

## 代码检查

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint 自动修复
npm run format        # Prettier
```
