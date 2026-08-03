# 制造品质管理系统

含**样品管理**与**治具管理**两大子系统，统一门户入口（portal.html），三方扫码驱动状态机，全量留痕。

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
REQUESTED → ACCEPTED → VERIFY_PENDING → VERIFY_RD_OK/VERIFY_ME_OK
                          ↕
                    VERIFY_ORG_OK → TRANSFERRED ⇄ IN_USE
                                       ↓
                                 REPAIRING_ME/REPAIRING_RD
                                       ↓
                                 REPAIR_DONE → TRANSFERRED
                                       ↓→ IMPROVING → RETIRED
```

### 治具看板

- DASH_STATS 配置驱动统计卡片（active 高亮 + 单击筛选）
- 逾期未归还预警表格
- 待保养预警表格
- 我的待办列表

### 治具清单

- 筛选（关键词/状态/部门）+ 每页条数选择器（10/20/50/100）
- colgroup + col-rsz 列宽拖拽 + data-label 响应式

---

## 运行

```bash
npm install          # 安装依赖
cp .env.example .env # 复制环境变量模板
npm run seed         # 初始化角色账号（仅一次）
npm run seed-samples # 样品全量测试数据（15个，6种状态全覆盖）
npm run seed-fixture # 治具全量测试数据（15个，12种状态全覆盖）
npm start            # 启动，访问 http://localhost:3000
```

### 环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `PORT` | 服务监听端口 | `3000` |
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
| rd01 | rd123 | 研发(RD) | 研发中心 |
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
| `/api/samples` | GET | 是 | 样品列表（筛选/排序/逾期/分页）|
| `/api/samples` | POST | 是 | 新建样品（含限度字段）|
| `/api/samples/:id` | GET | 是 | 样品详情 + 操作日志 |
| `/api/samples/:id` | PUT | 是 | 更新样品 |
| `/api/samples/:id` | DELETE | 是 | 删除样品（仅 NEW/PRODUCED）|
| `/api/samples/:id/qrcode` | GET | 是 | 样品二维码 |
| `/api/samples/:id/qrcode/download` | GET | 是 | 下载高清二维码 |
| `/api/samples/:id/label/download` | GET | 是 | 下载标签 HTML |
| `/api/samples/:id/card/print` | GET | 是 | 打印标示卡 |
| `/api/fixtures` | GET | 是 | 治具列表（筛选/排序/分页）|
| `/api/fixtures` | POST | 是 | 新建治具申请 |
| `/api/fixtures/:id` | GET | 是 | 治具详情 + 操作日志 |
| `/api/fixtures/:id` | PUT | 是 | 更新治具（状态机流转）|
| `/api/fixtures/:id/retire` | PUT | 是(ADMIN) | 治具报废 |
| `/api/fixtures/:id/qrcode` | GET | 是 | 治具二维码 |
| `/api/resolve` | GET | 是 | 解析扫码内容 |
| `/api/scan` | POST | 是 | 执行扫码操作（状态机）|
| `/api/dashboard` | GET | 是 | 样品看板数据 |
| `/api/fixture-dashboard` | GET | 是 | 治具看板数据 |
| `/api/logs` | GET | 是 | 操作日志（最近 500 条）|
| `/api/users` | GET/POST | 是(ADMIN) | 用户管理 |
| `/card/:sample_no` | GET | **否** | 匿名数字标示卡 |
| `/health` | GET | 否 | 健康检查 |

## 技术栈

Node.js + Express · MariaDB(MySQL) via mysql2 · express-session + bcryptjs · qrcode · Fluent Web Components · 原生 HTML/CSS/JS 单页（无构建）。

## 目录

```
server.js               后端入口：加载中间件、注册路由模块
db.js                   数据层入口：建表/迁移/工厂组装
db/
  ├── samples.js         样品 CRUD + 编号生成
  ├── fixtures.js        治具 CRUD + 编号生成
  ├── users.js           用户查询
  └── logs.js            操作日志
logger.js               日志系统（Winston，按天轮转）
seed.js                 种子：6 个角色账号
seed-rich.js            丰富样品演示数据（旧版）
seed-samples.js          样品全量测试数据（15个，6种状态 + 表示卡）
seed-fixture.js          治具全量测试数据（15个，12种状态）
test_flow.js            端到端流程测试
routes/
  ├── auth.js            鉴权路由
  ├── samples.js         样品路由（CRUD + QR）
  ├── fixtures.js        治具路由（CRUD + 扫码状态机）
  ├── cards.js           标示卡路由
  ├── scan.js            样品扫码台（解析 + 状态机）
  └── misc.js            看板/日志/用户/健康检查
data/
  ├── limit-items.json    限度项目（26项）
  └── source-types.json   来源类型
public/
  ├── portal.html         门户首页（统一入口）
  ├── index.html          样品单页入口
  ├── fixture.html        治具单页入口
  ├── css/
  │   └── app.css          全局共享样式（两系统共用 CSS 变量）
  ├── js/
  │   ├── shared/          共享模块
  │   │   ├── api.js          鉴权 + HTTP 请求
  │   │   ├── utils.js        工具函数（initColResize 等）
  │   │   ├── constants.js    全局常量
  │   │   └── ui.js           toast/UI 辅助
  │   ├── samples.js       样品列表 + 列宽拖拽
  │   ├── detail.js        样品详情弹窗（信息/标示卡/日志/大图 四Tab）
  │   ├── dashboard.js     样品看板（DASH_STATS + 比例条 + 预警）
  │   ├── dashboard-todo.js 样品看板-待办
  │   ├── scan.js          样品扫码台
  │   ├── fixture-api.js   治具共享 API + 状态助手
  │   ├── fixture-dashboard.js 治具看板
  │   ├── fixture-list.js  治具清单 + 分页 + 每页条数选择
  │   ├── fixture-detail.js 治具详情弹窗
  │   ├── fixture-logs.js  治具日志
  │   └── ...
  └── uploads/            样品/治具图片上传目录
docs/
  ├── deploy-baota.md      宝塔部署文档
  ├── operation-manual.md  用户操作说明书
  └── superpowers/
      ├── specs/            设计文档
      └── plans/            实现计划
scripts/
  ├── to-production.sh     演示 → 生产模式切换
  └── to-demo.sh           生产 → 演示模式切换
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

## 演示/生产切换

```bash
bash scripts/to-production.sh   # 移除登录页演示账号提示
bash scripts/to-demo.sh         # 恢复演示提示
```

## 代码检查

```bash
npm run lint          # ESLint
npm run lint:fix      # ESLint 自动修复
npm run format        # Prettier
```
