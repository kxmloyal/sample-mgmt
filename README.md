# 制造品质管理系统

样品的**发行 → 确认 → 生命周期管理 → 分发** 全流程系统。三方扫码驱动状态机，全量留痕。

## 三个责任主体

| 阶段 | 责任方 | 动作 | 系统记录 |
|------|--------|------|-----------|
| ① 制作 | 研发工程 | 建样、打印二维码标签、贴样、扫码确认 | 制作完成时间、状态推进 |
| ② 发行 | 品保文管中心 | 扫码确认发行，填写标示卡信息 | 正式发行时间、复检周期、启动计时 |
| ③ 分发 | 各部门保管 | 扫码接收保管 | 保管部门、储位、保管中 |

> 生技部(ME)属于保管单位，权限同 CUSTODY：可接收保管、修改储位、申请退回，不可建样和确认制作。

状态机：`NEW → PRODUCED(制作完成) → RELEASED(已发行) → IN_CUSTODY(保管中)` → `RETURNING(退回审核中)` → `RETIRED(已作废)`，
周期到点派生 `待复检 / 逾期`（看板高亮预警）。

## 运行

```bash
npm install       # 安装依赖
cp .env.example .env   # 复制环境变量模板（首次）
npm run seed     # 初始化角色账号 + 演示样品（仅需一次）
npm run seed-rich # 导入丰富演示数据（14个样品，覆盖6种状态 + 标示卡 + 逾期/退回/作废场景）
npm start         # 启动，访问 http://localhost:3000（端口可通过 .env 中 PORT 配置）
```

### 环境变量配置

项目通过 `.env` 文件读取环境变量（基于 `dotenv`），模板见 `.env.example`：

| 变量 | 作用 | 默认值 |
|---|---|---|
| `PORT` | 服务监听端口 | `3000` |
| `SESSION_SECRET` | 会话签名密钥（生产环境**务必改为随机长串**） | `sample-mgmt-dev-secret-change-me` |
| `NODE_ENV` | 环境标识（`development`/`production`） | `development` |
| `LOGIN_RATE_LIMIT_MAX` | 登录速率限制（次/分钟） | `10` |
| `API_RATE_LIMIT_MAX` | API 速率限制（次/分钟） | `200` |
| `LOG_DIR` | 日志目录 | `logs` |
| `UPLOAD_MAX_SIZE` | 上传文件大小限制（字节） | `5242880`（5MB） |

> 兼容说明：若通过 PM2/宝塔启动命令注入同名环境变量，**注入值优先**，`.env` 仅作兜底。
> 生产密钥生成：`openssl rand -hex 32`

局域网内手机访问 `http://<本机IP>:3000` 即可用摄像头扫码。

## 演示账号

| 账号 | 密码 | 角色 | 部门 |
|------|------|------|------|
| admin | admin123 | 管理员 | 系统 |
| rd01 | rd123 | 研发(RD) | 研发中心 |
| qa01 | qa123 | 品保(QA) | 品保文管中心 |
| mfg01 | mfg123 | 保管(CUSTODY) | 制造部 |
| fqc01 | fqc123 | 保管(CUSTODY) | FQC |
| me01 | me123 | 保管(ME) | 生技部 |

## 功能特性

### 扫码台（v0.1+）

两种扫码方式均支持：

- **手机摄像头**：点击「开启摄像头」，用浏览器原生 `BarcodeDetector` 识别二维码（需 Chrome/Edge）。
- **桌面扫码枪**：扫码枪本质是「键盘输入 + 回车」，直接扫进输入框即触发确认（无需摄像头）。

二维码内容 = 样品编号（如 `SM-000001`），扫码台解析后自动定位样品并推进状态。

#### 状态流转（扫码自动推进）

| 当前状态 | 操作角色 | 扫码后动作 | 要求 |
|---|---|---|---|
| NEW(待制作) | 研发(RD) | → PRODUCED | 上传制作照片 |
| PRODUCED(制作完成) | 品保(QA) | → RELEASED | 填写复检周期 + 标示卡信息（分步向导）|
| RELEASED(已发行) | 保管(CUSTODY) | → IN_CUSTODY | 填写储位 |
| IN_CUSTODY 到期 | 品保(QA) | 复检 | 上传复检照片 |
| IN_CUSTODY | 保管(CUSTODY) | → RETURNING | 填写退回原因 |
| RETURNING | 品保(QA) | 多分支：重新发行/退回研发/直接作废/拒绝退回 | — |
| RETURNING(被指派) | 研发(RD) | 创建替代品 | 自动复制原样品信息 |

品保发行时采用**三步向导**：① 设置复检周期 → ② 填写标示卡（样品类型/限度项目/来源/版次/测试数据）→ ③ 确认发行。

### 样品列表筛选

支持多维度组合筛选，300ms 防抖搜索，激活标签可视化：

| 筛选维度 | 说明 |
|---|---|
| 关键词搜索 | 编号 / 名称 / 规格模糊匹配 |
| 状态下拉 | 待制作 / 制作完成 / 已发行 / 保管中 / 退回审核中 / 已作废 |
| 部门下拉 | 研发中心 / 品保文管中心 / 制造部 / FQC / 生技部 |
| 排序 | 最新优先 / 最早优先 / 编号升序 / 编号降序 |
| 快捷预设 | 待处理（角色感知）/ 逾期 / 近7天到期 |
| 激活标签(chip) | 点击 ✕ 移除对应筛选条件 |

### 样品退回与作废（v0.3+）

#### 保管申请退回（CUSTODY）

保管员扫描 IN_CUSTODY 样品二维码，点击「申请退回」→ 填写退回原因 → 状态变为 `RETURNING(退回审核中)`。

#### 品保审核退回（QA 4 分支）

品保扫描 RETURNING 样品，可选择：
- **重新发行**：修改标示卡和复检周期后直接重新发行 → RELEASED
- **退回研发重做**：指派研发人员 → RETIRED，研发收到待办可创建替代品
- **直接作废**：填写作废原因 → RETIRED
- **拒绝退回**：填写拒绝理由 → 恢复 IN_CUSTODY

#### 研发创建替代品（RD）

被指派的研发扫描 RETURNING 样品，点击「创建替代品」→ 系统自动复制原样品信息生成新编号 → 新样品按正常流程制作。

### 样品删除

- **NEW / PRODUCED** 状态的样品可由创建者、同角色研发或管理员取消（硬删除）
- RELEASED / IN_CUSTODY / RETURNING / RETIRED 状态不可删除，保障数据完整性

### 样品详情弹窗

四栏 Tab 切换（响应式，大屏多栏）：

| Tab | 内容 |
|---|---|
| 信息 | 样品基础信息 + 状态流转时间线 |
| 全量日志 | 默认最近 2 条，可切换查看全部操作记录 |
| 标示卡 | 限度样品专属：查看/编辑所有限度字段，支持保存与打印标示卡 |
| 大图 | 制作/复检照片查看 |

### 限度样品管理（v0.2+）

为满足 (GYS-Q3-011) 限度样品规范，在通用样品基础上叠加限度管理：

#### 限度样品字段

| 字段 | 说明 | 可选值 |
|---|---|---|
| 样品类型 | OK/NG 样品 | OK / NG / 不适用 |
| 限度项目 | 26 项检测项目 | A·成品震动 / AI·扇叶震动 / A1·MCU IC烧録器 / … / X·特殊工站 |
| 来源 | 样品提供处 | C(客供) / T(元山) / G(元将五金塔岗分厂) / 不适用 |
| 保管单位 | 保管部门代号 | 1品保 / 2厂务 / 3工程 / 4研发 / 5客户 / 6厂务二部 / 8工程二部 |
| 有效期 | 截止日期 | 日期选择 |
| 版次 | 标示卡版次 | 发行自动01，重新发行自动+1（最高99），也可手动输入 |
| 测试标准/规格 | 检测依据 | 文本域 |

#### 新建样品

横向双栏布局（≥768px），左侧基础信息 + 右侧限度样品信息（选填）。

#### 样品列表

额外筛选维度：OK/NG 类型、限度项目、来源。

### 数字标示卡（v0.2+）

#### 匿名查看

`GET /card/:sample_no` — 无需登录，扫二维码直接打开：

- 移动端优化的独立 HTML 页面（max-width 480px）
- 显示：样品编号、OK/NG 标记、限度项目、来源、版次、测试标准、测试数据
- 有效期逾期红色高亮
- 制作人、确认人
- 状态流转记录（最近 2 条）
- 底部："此卡供现场参照，系统内可查看更多信息"

#### 双面标签

打印标签采用双面布局（QR 面 + 标示卡面）：

| 面 | 内容 |
|---|---|
| QR 面 | 二维码 + 样品编号、名称、机型/站别、规格 |
| 标示卡面 | 发行前为空白占位（提示发行后打印贴入），发行后显示完整限度信息 |

> 发行前打印：QR 面有内容 + 标示卡面空白占位框；发行后打印：两面完整。

#### 打印队列

连续扫码模式下，扫码确认后自动积累标示卡，支持「打印全部」批量输出。离开页面前有未打印提醒。

### 标签尺寸选择与帮助指南

**标签尺寸选择**（v0.4+）：标签打印页顶部提供尺寸选择器，支持 3 档预设（小号 37×18mm / 中标 52×25mm / 大号 74×35mm）+ 自定义输入（30~150mm），标示卡自动跟随标签尺寸等比缩放。标示卡引导页顶部显示当前选中尺寸（只读标签）。

**帮助指南**（v0.4+）：右下角蓝色「?」浮动按钮 → 打开搜索面板，按功能模块组织 10 个模块的结构化帮助文档。支持关键词搜索筛选 + 页面跳转功能，适合新用户快速上手。

### 扫码图片上传

- **制作确认**（NEW→PRODUCED）：必须上传制作照片
- **品保发行**（PRODUCED→RELEASED）：填写复检周期 + 标示卡信息
- **保管接收**（RELEASED→IN_CUSTODY）：填写储位
- **复检**（IN_CUSTODY 到期）：必须上传复检照片
- 图片自动落盘至 `public/uploads/`，详情弹窗内可查看

### 其他功能

- **登录快捷键**：密码框输入后回车即可登录
- **下载二维码**：详情中可下载高分辨率 PNG 二维码供条码打印软件导入
- **下载标签**：详情中可下载完整 HTML 标签文件（离线可打开/打印）
- **看板**：实时统计各状态数量、我的待处理、逾期/即将到期样品

## API 一览

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/api/login` | POST | 否 | 登录 |
| `/api/logout` | POST | 是 | 登出 |
| `/api/me` | GET | 是 | 当前用户信息 |
| `/api/samples` | GET | 是 | 样品列表（支持筛选/排序/逾期）|
| `/api/samples` | POST | 是 | 新建样品（含限度字段）|
| `/api/samples/:id` | GET | 是 | 样品详情 + 操作日志 |
| `/api/samples/:id` | PUT | 是 | 更新样品（含标示卡字段）|
| `/api/samples/:id` | DELETE | 是 | 删除样品（仅 NEW/PRODUCED）|
| `/api/samples/:id/qrcode` | GET | 是 | 样品二维码（PNG）|
| `/api/samples/:id/qrcode/download` | GET | 是 | 下载高清二维码 |
| `/api/samples/:id/label/download` | GET | 是 | 下载标签 HTML |
| `/api/samples/:id/card/print` | GET | 是 | 打印标示卡 |
| `/api/resolve` | GET | 是 | 解析扫码内容 |
| `/api/scan` | POST | 是 | 执行扫码操作（状态机）|
| `/api/dashboard` | GET | 是 | 看板数据 |
| `/api/logs` | GET | 是 | 全量操作日志（最近 500 条）|
| `/api/users` | GET/POST | 是(ADMIN) | 用户管理 |
| `/card/:sample_no` | GET | **否** | 匿名数字标示卡 |
| `/health` | GET | 否 | 健康检查 |
| `/js/shared-constants.js` | GET | 否 | 共享常量JS脚本（前端加载，数据源 data/*.json）|

## 技术栈

Node.js + Express · SQLite(sql.js，纯 WASM，无需编译) · express-session + bcrypt · qrcode · 原生 HTML/JS 单页（无构建）。

数据库经 `db.js` 统一封装（sql.js = SQLite WASM，数据存于 `data/sample.db.sqlite`），未来切换 MySQL/Postgres 仅需替换该文件，API 与前端不变。

## 目录

```
server.js             后端入口：加载中间件、注册路由模块（94 行）
db.js                 数据层入口：建表/迁移/工厂组装（123 行）
db/
  ├── samples.js      样品 CRUD + 结构化编号生成（81 行）
  ├── users.js        用户查询（13 行）
  └── logs.js          操作日志（14 行）
logger.js             日志系统（Winston，按天轮转，JSON 格式）（40 行）
seed.js               种子：6 个角色账号 + 1 个演示样品（47 行）
seed-rich.js          丰富演示数据：14 个样品，6 种状态全覆盖（含退回/作废）（202 行）
routes/
  ├── auth.js          鉴权路由：login/logout/me（41 行）
  ├── samples.js       样品路由：CRUD + QR（125 行）
  ├── cards.js         标示卡路由注册（90 行）
  ├── card-html.js     标签/标示卡 HTML 生成 + 尺寸解析（180 行）
  ├── card-page.js     匿名标示卡页面生成（84 行）
  ├── card-constants.js 标示卡共享常量（从 data/*.json 加载）（12 行）
  ├── scan.js          扫码台路由：解析 + 状态机（202 行）
  └── misc.js          看板/日志/用户/健康检查/共享常量路由（93 行）
data/
  ├── limit-items.json  限度项目数据源（26 项，前后端共享）（28 行）
  ├── source-types.json 来源类型数据源（前后端共享）（1 行）
  └── sample.db.sqlite  SQLite 数据库（不入 git）
public/
  ├── index.html        前端单页入口（纯 HTML 结构，81 行）
  ├── css/
  │   ├── app.css         全局样式（122 行）
  │   └── help.css        帮助指南组件样式（24 行）
  ├── js/                 前端模块（17 个）
  │   ├── constants.js      全局常量/工具函数（26 行）
  │   ├── api.js            鉴权登录、API请求（31 行）
  │   ├── ui.js             UI辅助函数/toast（12 行）
  │   ├── modal.js          通用弹窗组件（55 行）
  │   ├── router.js         导航菜单、哈希路由（66 行）
  │   ├── dashboard.js      首页概览（45 行）
  │   ├── samples.js        样品列表、筛选、删除（85 行）
  │   ├── detail.js         样品详情弹窗、标示卡 Tab、日志查看（155 行）
  │   ├── new.js            新建样品（横向双栏布局）、打印标签（75 行）
  │   ├── card-fields.js    标示卡字段状态判断/表格组件（scan/detail 共用）（60 行）
  │   ├── scan.js           扫码台（扫码枪 + 摄像头）（224 行）
  │   ├── scan-wizard.js    品保发行三步向导（51 行）
  │   ├── scan-return-actions.js  扫码台退回操作表单渲染（24 行）
  │   ├── camera-helper.js  摄像头扫码工具（52 行）
  │   ├── print-queue.js    连续扫码打印队列（批量打印 + 离开提醒）（64 行）
  │   ├── board.js          生命周期看板（42 行）
  │   ├── logs.js           操作日志（34 行）
  │   ├── users.js          用户管理（管理员）（15 行）
  │   ├── help-data.js      帮助指南内容数据（228 行）
  │   └── help.js           帮助指南浮动按钮+搜索面板（129 行）
  └── uploads/            样品图片上传目录
tests/
  ├── helpers/
  │   └── setup.js          测试环境初始化（45 行）
  ├── samples.test.js       样品 CRUD/筛选/限度/编码 测试（380 行，40 条用例）
  └── auth.test.js          登录鉴权测试
docs/
  ├── operation-manual.md   用户操作说明书
  ├── superpowers/
  │   ├── specs/            设计文档（9 份）
  │   └── plans/            实现计划（10 份）
  └── deploy-baota.md       宝塔部署文档
scripts/
  ├── to-production.sh      演示 → 生产模式切换
  └── to-demo.sh            生产 → 演示模式切换
test_flow.js           端到端流程测试脚本（覆盖完整状态机链路 + 退回/作废/替代品）（86 行）
```

## 健康检查

`GET /health` 返回服务运行状态，无需认证：

```json
{
  "status": "ok",
  "uptime": 123,
  "timestamp": "2026-07-23T18:00:00.000Z",
  "memory": 97628160,
  "db": "connected"
}
```

## 日志

- 日志存储在 `logs/` 目录，JSON 格式
- 按天轮转，保留 30 天，单文件上限 20MB
- 访问日志通过 Morgan 以 short 格式记录
- 日志级别：生产环境 `info`，开发环境 `debug`
- 环境变量 `LOG_DIR` 可配置日志目录（默认 `logs`）

## 速率限制

| 端点 | 限制 | 可配环境变量 |
|---|---|---|
| `/api/login` | 10 次/分钟/IP | `LOGIN_RATE_LIMIT_MAX` |
| `/api/*` | 200 次/分钟/IP | `API_RATE_LIMIT_MAX` |

超限返回 HTTP 429。

## 安全加固

- **Helmet**：XSS/MIME sniff/clickjack/HSTS 安全头
- **Session Cookie**：`httpOnly` + `sameSite: strict`（生产环境 `secure`）
- **文件上传**：仅允许 jpg/png/gif/webp，大小限制 5MB（`UPLOAD_MAX_SIZE` 可配）

## 测试

```bash
npm test              # 运行全部测试（40 条）
npm run test:watch    # 监听模式
npm run test:coverage # 覆盖率报告
```

测试数据库与生产数据隔离（`TEST_MODE=1` 时使用 `data/test.db.sqlite`）。

端到端手动测试脚本：
```bash
node test_flow.js    # 需先 npm start 启动服务，覆盖完整状态机链路
```

## 演示模式 ↔ 生产模式切换

登录页默认包含演示账号提示。部署到正式环境时，可一键切换为生产模式（隐藏演示信息）：

```bash
bash scripts/to-production.sh   # 演示 → 生产：移除登录页演示账号提示
bash scripts/to-demo.sh         # 生产 → 演示：从备份恢复演示提示
```

| 脚本 | 方向 | 效果 |
|---|---|---|
| `to-production.sh` | 演示→生产 | 移除登录页 `#demo-hint` 区块，输入框 placeholder 改为「请输入账号」 |
| `to-demo.sh` | 生产→演示 | 从 `index.html.bak.demo` 备份恢复演示提示 |

切换脚本自动备份 `public/index.html` → `public/index.html.bak.demo`，可随时恢复。

## 代码检查

```bash
npm run lint          # ESLint 检查
npm run lint:fix      # ESLint 自动修复
npm run format        # Prettier 格式化
```
