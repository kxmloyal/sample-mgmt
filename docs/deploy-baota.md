# 制造品质管理系统 — 宝塔面板部署教程

本教程适用于把「样品发行 / 确认 / 生命周期 / 分发」系统部署到 **宝塔面板（Linux 服务器）**，对外提供多人访问，并支持手机扫码（需 HTTPS）。

---

## 0. 部署前须知（很重要）

| 项目 | 说明 |
|---|---|
| 技术栈 | Node.js + Express，**无需数据库服务**（用 sql.js 把 SQLite 存成单文件，零外部依赖） |
| 入口文件 | `server.js` |
| 启动命令 | `npm start` （即 `node server.js`） |
| 默认端口 | `3000`（可用 `.env` 中 `PORT` 改） |
| 会话密钥 | `.env` 中 `SESSION_SECRET`（生产环境**务必改掉**默认开发值） |
| 环境变量 | 通过项目根目录 `.env` 文件读取（基于 `dotenv`），模板见 `.env.example` |
| 数据存储 | `data/sample.db.sqlite`（单文件，**备份就拷这个目录**） |
| 手机摄像头扫码 | 依赖浏览器原生 `BarcodeDetector`，**必须在 HTTPS 下才可用**（或 localhost）。仅桌面扫码枪不需要。 |

> ⚠️ 结论先行：**手机扫码一定要配域名 + SSL 证书**。否则手机端只能用手动输入样品编号代替扫码。

---

## 1. 服务器准备

- 一台 Linux 服务器（CentOS / Ubuntu / Debian 均可），已装好**宝塔面板**。
- 开放端口：宝塔面板 `8888`、以及后续要用的 `80 / 443`。
- 准备一个域名（如 `sample.your-company.com`），A 记录解析到服务器 IP。
- 本地先确认项目能跑：`npm install && npm run seed && npm start`，浏览器开 `http://localhost:3000`。

---

## 2. 方案选择

| 方案 | 适合场景 | 难度 |
|---|---|---|
| **A. 宝塔「Node.js 项目」管理器（推荐）** | 有宝塔官方 Node 项目管理器，图形化、自带反代/SSL | 低 |
| **B. PM2 + 宝塔 Nginx 站点** | 没有官方 Node 管理器，或想用 PM2 守护进程 | 中 |

下面以**方案 A** 为主，方案 B 作为备选在文末给出。

---

## 3. 方案 A：宝塔 Node.js 项目管理器

### 3.1 安装 Node 运行环境

1. 登录宝塔面板 → **软件商店** → 搜索 `Node.js` → 安装 **「Node.js 项目」**（宝塔官方，会顺带装好版本管理器与 PM2）。
2. 进入 **Node.js 版本管理器** → 安装一个 Node 版本（建议 **≥ 18**，本项目开发用 Node 22，生产 18/20/22 均可）。

### 3.2 上传项目代码

推荐通过**文件**上传（注意跳过 `node_modules` 和 `data`）：

1. 宝塔 → **文件** → 进入 `/www/wwwroot/` → 新建目录 `sample-mgmt`。
2. 把本地项目打包（**不含** `node_modules/`、`data/`）上传到该目录并解压：
   ```bash
   # 本地打包（在 样品管理 目录外执行）
   cd 样品管理
   tar czf sample-mgmt.tar.gz --exclude=node_modules --exclude=data .
   ```
   将 `sample-mgmt.tar.gz` 上传到 `/www/wwwroot/sample-mgmt/`，解压。
3. 或在服务器上用 **Git** 拉取（若代码在 Git 仓库）：
   ```bash
   cd /www/wwwroot/sample-mgmt
   git clone <你的仓库地址> .
   ```

### 3.3 添加 Node 项目

1. 宝塔 → **Node.js 项目** → **添加项目**：
   - 项目目录：`/www/wwwroot/sample-mgmt`
   - 项目名称：`sample-mgmt`
   - 项目类型：`Node`
   - 启动文件 / 入口：`server.js`
   - 运行端口：`3000`
   - 运行用户：`www`（默认）
   - Node 版本：选 3.1 装的版本
   - 启动命令：
     ```
     node server.js
     ```
     > 环境变量已通过项目根目录 `.env` 文件读取，无需在启动命令中注入。
2. 点 **创建**。

> **配置 .env 文件**（在启动前完成）：
> ```bash
> cd /www/wwwroot/sample-mgmt
> cp .env.example .env
> # 编辑 .env，将 SESSION_SECRET 改为随机长串
> vi .env
> # 生成随机密钥：openssl rand -hex 32
> ```
> 兼容说明：若仍希望在启动命令中注入环境变量（如 PM2 ecosystem 配置），**注入值优先**，`.env` 仅作兜底。

### 3.4 安装依赖 + 初始化数据库

在项目里打开**终端**（或宝塔「终端」进入目录）：

```bash
cd /www/wwwroot/sample-mgmt
npm install --production
npm run seed          # 创建演示账号与样品（只首次执行）
```

> 若依赖安装慢，可切换 npm 镜像：`npm config set registry https://registry.npmmirror.com`

### 3.5 启动并验证

- 在 Node.js 项目列表点 **启动**。
- 浏览器直接访问 `http://服务器IP:3000`，应能看到登录页。
- 用 `admin / admin123` 登录验证流程。

### 3.6 绑定域名 + 开启 HTTPS（手机扫码必需）

1. 宝塔 → **网站** → **Node 项目**（或「添加站点」选 Node 项目）→ **域名管理** → 添加 `sample.your-company.com`。
2. 宝塔会**自动生成 Nginx 反向代理**到 `127.0.0.1:3000`。
3. **SSL** → 申请 **Let's Encrypt 免费证书** → 强制 HTTPS。
4. 手机访问 `https://sample.your-company.com` → 登录 → 进入「扫码台」→ 应能用摄像头扫码。

> 若没自动反代，手动在站点「反向代理」加一条：目标 `127.0.0.1:3000`，发送域名 `$host`。

---

## 4. 方案 B：PM2 + 宝塔 Nginx 站点（备选）

适用：没装官方 Node 管理器，或习惯用 PM2 守护。

1. 宝塔 → 软件商店 → 安装 **PM2 管理器**（顺带装 Node）。
2. 上传代码到 `/www/wwwroot/sample-mgmt`（同 3.2）。
3. 宝塔「终端」：
   ```bash
   cd /www/wwwroot/sample-mgmt
   npm install --production
   npm run seed
   ```
4. PM2 管理器 → **添加项目**：
   - 启动文件：`/www/wwwroot/sample-mgmt/server.js`
   - 运行名称：`sample-mgmt`
   - 启动参数：留空（环境变量从 `.env` 文件读取）
   - 点击启动（PM2 会自动 daemon 化并开机自启）。

> PM2 方式同样需先配置 `.env` 文件（见 3.3 步骤）。若使用 PM2 ecosystem 配置文件注入环境变量，注入值优先于 `.env`。
5. 宝塔 → **网站** → **添加站点**（填域名 `sample.your-company.com`，PHP 选「纯静态」）→ **反向代理** 指向 `127.0.0.1:3000` → **SSL** 申请证书并强制 HTTPS。

---

## 5. 生产环境变量速查

`server.js` 通过 `dotenv` 从项目根目录 `.env` 文件读取环境变量，不填则用开发默认值：

| 变量 | 作用 | 生产建议 |
|---|---|---|
| `PORT` | 监听端口 | 设 `3000`（与反代一致） |
| `SESSION_SECRET` | 会话签名密钥 | **务必改成随机长串**，否则有会话被伪造风险 |

配置方式（推荐）：编辑项目根目录 `.env` 文件（`cp .env.example .env` 后修改），改完点**重启**。

> 兼容性：若通过宝塔「Node.js 项目 → 设置 → 环境变量」、PM2 ecosystem、或启动命令注入同名变量，**注入值优先**，`.env` 仅作兜底。

---

## 6. 数据备份与迁移

整个数据库就是一个文件，备份极其简单：

```bash
# 备份
tar czf sample-backup-$(date +%F).tar.gz -C /www/wwwroot/sample-mgmt data

# 恢复：把 data/ 解压覆盖回项目目录，重启项目即可
```

> 建议用宝塔「计划任务」设置每日把 `data/` 打包传到 OSS / 另一块磁盘。

---

## 7. 代码更新 / 升级流程

```bash
cd /www/wwwroot/sample-mgmt
git pull            # 或重新上传解压
npm install --production
# 若 server.js / db.js 有结构变更，注意保留 data/ 不覆盖
# 重启项目（宝塔 Node 项目 → 重启；或 PM2 → 重启）
```

> 数据库结构由 `db.js` 自动建表；新增字段需手动 `ALTER TABLE`（当前 MVP 版本尚未涉及）。

---

## 8. 常见问题排查

| 现象 | 可能原因 / 解决办法 |
|---|---|
| 页面打不开 / 502 | Node 项目没启动；检查端口是否 3000、是否被防火墙挡；看项目「日志」 |
| 手机端点不开摄像头 | **不是 HTTPS**。`BarcodeDetector` 只在安全上下文可用 → 必须配域名 + SSL。临时可手动输入样品编号 |
| 登录后马上掉线 | `SESSION_SECRET` 改了但没重启；或多实例运行导致会话不一致（确保只跑一个 Node 进程） |
| `npm install` 卡住/失败 | 换 npmmirror 镜像；或用方案 B 的 PM2（自带 Node，环境更干净） |
| 上传后白屏 | 上传时漏了文件；或 `npm install` 没跑。检查 `public/index.html` 是否存在 |
| 数据库"丢了" | 误删 `data/`；从 6 的备份恢复。部署时务必保留 `data/` 不被覆盖 |
| 扫码枪不触发 | 扫码枪需以「回车结尾」输出；检查扫码台输入框是否已聚焦、枪的 suffix 设置 |

---

## 9. 安全与进阶建议

1. **改默认密码**：上线后立刻改 `admin / rd01 / qa01 / mfg01 / fqc01 / me01` 的默认口令（在「用户管理」页或 `db.js` 改种子脚本后重新 seed）。
2. **HTTPS 全站强制**：已配 SSL 后开启「强制 HTTPS」，避免明文传输账号。
3. **防火墙**：数据库只在本地文件，端口 `3000` 不必对外暴露，外部统一走 `80/443`（Nginx 反代）。
4. **会话时效**：当前 `server.js` cookie `maxAge` 为 8 小时，可按需调整。
5. **规模化**：当前 sql.js 把整库读进内存、每次写入重写单文件，适合中小体量。若日后样品量很大或要跨机高并发，把 `db.js` 一层换成 MySQL/Postgres 即可，API 与前端无需改动。
6. **主动提醒**：复检逾期目前靠看板高亮；如需邮件 / 企业微信主动推送，可在此基础上扩展。

---

## 10. 快速检查清单（部署完照着勾）

- [ ] Node 版本 ≥ 18 已装
- [ ] 代码上传到 `/www/wwwroot/sample-mgmt`（无 node_modules/data）
- [ ] `npm install` 完成
- [ ] `cp .env.example .env` 并修改 `SESSION_SECRET` 为随机长串
- [ ] `npm run seed` 已执行（首次）
- [ ] 项目以 `node server.js` 启动（环境变量从 `.env` 读取）
- [ ] `http://IP:3000` 能登录
- [ ] 已绑域名 + 申请 Let's Encrypt + 强制 HTTPS
- [ ] 手机 `https://域名` 能用摄像头扫码
- [ ] 默认账号密码已修改
- [ ] `data/` 已加入每日备份计划
