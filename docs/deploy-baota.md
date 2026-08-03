# 制造品质管理系统 — 宝塔面板部署教程

本教程适用于把「样品管理 / 治具管理 / 全局工作台」三大子系统部署到 **宝塔面板（Linux 服务器）**，对外提供多人访问，并支持手机扫码（需 HTTPS）。

---

## 0. 部署前须知（很重要）

| 项目 | 说明 |
|---|---|
| 技术栈 | Node.js + Express + **MariaDB/MySQL**（mysql2 连接池） |
| 数据库 | 需自建 **MariaDB（或 MySQL 5.7+）**，默认库名 `sample_mgmt`（`.env` 中 `DB_NAME` 可改） |
| 入口文件 | `server.js` |
| 启动命令 | `npm start`（即 `node server.js`） |
| 默认端口 | `4000`（可用 `.env` 中 `PORT` 改） |
| 统一入口 | `public/portal.html` 门户页（先选子系统，再登录） |
| 子系统 | `subsystems/<id>/`：样品管理 / 治具管理 / 全局工作台，由框架启动时自动扫描 manifest 挂载 |
| 建表方式 | `db.js` 启动时自动执行 `subsystems/*/db/schema.sql`（幂等，含 `workbench_settings` 等表） |
| 会话密钥 | `.env` 中 `SESSION_SECRET`（生产环境**务必改掉**默认开发值） |
| 环境变量 | 项目根目录 `.env` 文件读取（`dotenv`），模板见 `.env.example` |
| 目录权限 | 运行用户（默认 `www`）需可写 `logs/`（日志）与 `public/uploads/`（图片上传） |
| 手机摄像头扫码 | 依赖浏览器原生 `BarcodeDetector`，**必须在 HTTPS 下才可用**（或 localhost）。仅桌面扫码枪不需要。 |

> ⚠️ 结论先行：**手机扫码一定要配域名 + SSL 证书**。否则手机端只能手动输入编号代替扫码。
>
> ⚠️ 本系统数据库已从 SQLite 迁移至 **MariaDB**，部署前必须先装数据库（见 3.2），不能再沿用旧版"单文件零依赖"方式。

---

## 1. 服务器准备

- 一台 Linux 服务器（CentOS / Ubuntu / Debian 均可），已装好**宝塔面板**。
- 开放端口：宝塔面板 `8888`、以及后续要用的 `80 / 443`。
- 准备一个域名（如 `sample.your-company.com`），A 记录解析到服务器 IP。
- 本地先确认项目能跑：`npm install && npm run seed && npm start`，浏览器开 `http://localhost:4000`。

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

### 3.2 安装并初始化数据库（新增，必做）

1. 宝塔 → **软件商店** → 安装 **MariaDB**（或 MySQL 5.7+）→ 启动。
2. 宝塔 → **数据库** → **添加数据库**（或直接在 MySQL 终端执行）：
   ```sql
   CREATE DATABASE IF NOT EXISTS sample_mgmt DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
   CREATE USER IF NOT EXISTS 'sample_mgmt'@'127.0.0.1' IDENTIFIED BY '此处替换为强密码';
   GRANT ALL PRIVILEGES ON sample_mgmt.* TO 'sample_mgmt'@'127.0.0.1';
   FLUSH PRIVILEGES;
   ```
3. 数据库仅本机访问即可（账号绑定 `127.0.0.1`），**不要对外暴露 3306**。

> 表结构无需手动创建：`server.js` 首次启动时会自动执行 `subsystems/*/db/schema.sql` 幂等建表
> （`samples` / `scan_logs` / `fixtures` / `fixture_logs` / `fixture_files` / `workbench_settings` 等）。

### 3.3 上传项目代码

推荐通过**文件**上传（注意跳过 `node_modules` 和 `data`）：

1. 宝塔 → **文件** → 进入 `/www/wwwroot/` → 新建目录 `sample-mgmt`。
2. 把本地项目打包（**不含** `node_modules/`、`data/`）上传到该目录并解压：
   ```bash
   # 本地打包（在项目目录外执行）
   cd sample-mgmt
   tar czf sample-mgmt.tar.gz --exclude=node_modules --exclude=data .
   ```
   将 `sample-mgmt.tar.gz` 上传到 `/www/wwwroot/sample-mgmt/`，解压。
3. 或在服务器上用 **Git** 拉取（若代码在 Git 仓库）：
   ```bash
   cd /www/wwwroot/sample-mgmt
   git clone <你的仓库地址> .
   ```

> `data/` 目录仅存放共享静态配置（`limit-items.json`、`source-types.json` 等），**不含数据库**，漏传不影响运行。

### 3.4 添加 Node 项目

1. 宝塔 → **Node.js 项目** → **添加项目**：
   - 项目目录：`/www/wwwroot/sample-mgmt`
   - 项目名称：`sample-mgmt`
   - 项目类型：`Node`
   - 启动文件 / 入口：`server.js`
   - 运行端口：`4000`
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
> vi .env
> # 必改项：
> #   SESSION_SECRET=随机长串       生成方式：openssl rand -hex 32
> #   DB_PASSWORD=3.2 步骤设置的数据库密码
> # 可选：DB_HOST / DB_PORT / DB_USER / DB_NAME 按需调整（默认 127.0.0.1:3306 / sample_mgmt / sample_mgmt）
> ```
> 兼容说明：若仍希望在启动命令中注入环境变量（如 PM2 ecosystem 配置），**注入值优先**，`.env` 仅作兜底。

### 3.5 安装依赖 + 初始化数据

在项目里打开**终端**（或宝塔「终端」进入目录）：

```bash
cd /www/wwwroot/sample-mgmt
npm install --production
npm run seed          # 创建 6 个角色账号（仅首次执行）
# 以下为可选的演示/测试数据（生产环境可跳过）：
npm run seed-samples  # 15 个样品（6 种状态全覆盖）
npm run seed-fixture  # 15 个治具（12 种状态全覆盖）
```

> 若依赖安装慢，可切换 npm 镜像：`npm config set registry https://registry.npmmirror.com`

### 3.6 启动并验证

- 在 Node.js 项目列表点 **启动**（首次启动会自动建表，见 3.2 说明）。
- 浏览器直接访问 `http://服务器IP:4000`，应能看到**门户页**（样品管理 / 治具管理 / 全局工作台三张入口卡片）。
- 任选一子系统进入登录页，用 `admin / admin123` 登录验证流程。

### 3.7 绑定域名 + 开启 HTTPS（手机扫码必需）

1. 宝塔 → **网站** → **Node 项目**（或「添加站点」选 Node 项目）→ **域名管理** → 添加 `sample.your-company.com`。
2. 宝塔会**自动生成 Nginx 反向代理**到 `127.0.0.1:4000`。
3. **SSL** → 申请 **Let's Encrypt 免费证书** → 强制 HTTPS。
4. 手机访问 `https://sample.your-company.com` → 登录 → 进入扫码台 → 应能用摄像头扫码。

> 若没自动反代，手动在站点「反向代理」加一条：目标 `127.0.0.1:4000`，发送域名 `$host`。

---

## 4. 方案 B：PM2 + 宝塔 Nginx 站点（备选）

适用：没装官方 Node 管理器，或习惯用 PM2 守护。

1. 宝塔 → 软件商店 → 安装 **PM2 管理器**（顺带装 Node）与 **MariaDB**（建库同 3.2）。
2. 上传代码到 `/www/wwwroot/sample-mgmt`（同 3.3），配置 `.env`（同 3.4）。
3. 宝塔「终端」：
   ```bash
   cd /www/wwwroot/sample-mgmt
   npm install --production
   npm run seed          # 角色账号（仅首次）
   npm run seed-samples  # 可选演示数据
   npm run seed-fixture  # 可选演示数据
   ```
4. PM2 管理器 → **添加项目**：
   - 启动文件：`/www/wwwroot/sample-mgmt/server.js`
   - 运行名称：`sample-mgmt`
   - 启动参数：留空（环境变量从 `.env` 文件读取）
   - 点击启动（PM2 会自动 daemon 化并开机自启）。

> PM2 方式同样需先配置 `.env` 文件（见 3.4 步骤）。若使用 PM2 ecosystem 配置文件注入环境变量，注入值优先于 `.env`。
5. 宝塔 → **网站** → **添加站点**（填域名 `sample.your-company.com`，PHP 选「纯静态」）→ **反向代理** 指向 `127.0.0.1:4000` → **SSL** 申请证书并强制 HTTPS。

---

## 5. 生产环境变量速查

`server.js` 通过 `dotenv` 从项目根目录 `.env` 文件读取环境变量，不填则用开发默认值：

| 变量 | 作用 | 生产建议 |
|---|---|---|
| `PORT` | 监听端口 | `4000`（与反代一致） |
| `SESSION_SECRET` | 会话签名密钥 | **务必改成随机长串**，否则有会话被伪造风险 |
| `NODE_ENV` | 环境标识 | 生产设 `production`（静态资源缓存 7 天、错误输出收敛） |
| `LOGIN_RATE_LIMIT_MAX` | 登录限流（次/分钟） | 默认 `10`，可按需调 |
| `API_RATE_LIMIT_MAX` | API 限流（次/分钟） | 默认 `200` |
| `LOG_DIR` | 日志目录 | 默认 `logs`（需可写） |
| `UPLOAD_MAX_SIZE` | 上传大小上限（字节） | 默认 `5242880`（5MB），图片类建议 ≤10MB |
| `DB_HOST` | 数据库地址 | `127.0.0.1` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_USER` | 数据库账号 | `sample_mgmt` |
| `DB_PASSWORD` | 数据库密码 | **3.2 步骤设置的强密码** |
| `DB_NAME` | 数据库名 | `sample_mgmt` |

配置方式（推荐）：编辑项目根目录 `.env` 文件（`cp .env.example .env` 后修改），改完点**重启**。

> 兼容性：若通过宝塔「Node.js 项目 → 设置 → 环境变量」、PM2 ecosystem、或启动命令注入同名变量，**注入值优先**，`.env` 仅作兜底。

---

## 6. 数据备份与迁移

数据库存放在 **MariaDB** 中，备份用 `mysqldump`（也可直接用宝塔「数据库 → 备份」功能）：

```bash
# 备份（输出到项目外目录）
mysqldump -h127.0.0.1 -usample_mgmt -p sample_mgmt > /www/backup/sample-$(date +%F).sql

# 恢复
mysql -h127.0.0.1 -usample_mgmt -p sample_mgmt < /www/backup/sample-2026-08-04.sql
```

> 建议用宝塔「计划任务」设置每日把导出的 `.sql` 打包传到 OSS / 另一块磁盘；`logs/`、`public/uploads/` 按需一并备份。

---

## 7. 代码更新 / 升级流程

```bash
cd /www/wwwroot/sample-mgmt
git pull            # 或重新上传解压
npm install --production
pm2 restart sample-mgmt   # 或宝塔 Node 项目 → 重启
```

> - 表结构由 `db.js` 启动时自动执行 `subsystems/*/db/schema.sql`（幂等，`CREATE TABLE IF NOT EXISTS`），**新增表无需手动建**。
> - **字段级变更**（加列/改类型）需手动 `ALTER TABLE` 并同步子系统的 `db/schema.sql` 与全链路代码；迁移脚本见 `db/migrations.js`。
> - 升级后建议核对日志无报错、三子系统均能正常登录访问（子系统隔离回归）。

---

## 8. 常见问题排查

| 现象 | 可能原因 / 解决办法 |
|---|---|
| 页面打不开 / 502 | Node 项目没启动；检查端口是否 `4000`、是否被防火墙挡；看项目「日志」 |
| 启动即报数据库错误 | **MariaDB 未安装/未启动**，或 `.env` 中 `DB_PASSWORD` 与 3.2 设置不一致；先在宝塔确认数据库可连接 |
| 手机端点不开摄像头 | **不是 HTTPS**。`BarcodeDetector` 只在安全上下文可用 → 必须配域名 + SSL。临时可手动输入编号 |
| 登录后马上掉线 | `SESSION_SECRET` 改了但没重启；或多实例运行导致会话不一致（确保只跑一个 Node 进程） |
| 上传图片失败 | `public/uploads/` 目录不可写；或文件超过 `UPLOAD_MAX_SIZE` 白名单限制 |
| 日志目录报 EACCES | `logs/` 不可写，`chown -R <运行用户> logs` 后重启 |
| 改阈值/配置不生效 | 确认是 ADMIN 角色操作；前端强缓存时 Ctrl+F5 强制刷新 |
| `npm install` 卡住/失败 | 换 npmmirror 镜像；或用方案 B 的 PM2（自带 Node，环境更干净） |
| 上传后白屏 | 上传时漏了文件；或 `npm install` 没跑。检查 `public/portal.html` 是否存在 |
| 数据"丢了" | 数据库误删/被覆盖，从 6 的备份恢复；部署时勿覆盖 `.env` 与数据库 |
| 扫码枪不触发 | 扫码枪需以「回车结尾」输出；检查扫码台输入框是否已聚焦、枪的 suffix 设置 |

---

## 9. 安全与进阶建议

1. **改默认密码**：上线后立刻改 `admin / rd01 / qa01 / mfg01 / fqc01 / me01` 的默认口令（「用户管理」页或改 `seed.js` 后重新 seed）。
2. **HTTPS 全站强制**：已配 SSL 后开启「强制 HTTPS」，避免明文传输账号。
3. **防火墙**：数据库 `3306` 只绑本机，Node 端口 `4000` 不必对外暴露，外部统一走 `80/443`（Nginx 反代）。
4. **会话时效**：`server.js` cookie `maxAge` 为 8 小时，可按需调整。
5. **全局工作台阈值**：积压阈值（默认 3 天 / 7 天）仅 ADMIN 可在工作台「阈值设置」修改，存于 `workbench_settings` 表，全局生效。
6. **主动提醒**：复检逾期目前靠看板高亮；如需邮件 / 企业微信主动推送，可在此基础上扩展。

---

## 10. 快速检查清单（部署完照着勾）

- [ ] Node 版本 ≥ 18 已装
- [ ] **MariaDB 已安装并创建 `sample_mgmt` 库与账号**（3.2）
- [ ] 代码上传到 `/www/wwwroot/sample-mgmt`（无 node_modules/data）
- [ ] `npm install` 完成
- [ ] `cp .env.example .env` 并修改 `SESSION_SECRET` 为随机长串、`DB_PASSWORD` 为数据库密码
- [ ] `npm run seed` 已执行（首次，创建角色账号）
- [ ] 项目以 `node server.js` 启动（环境变量从 `.env` 读取）
- [ ] `http://IP:4000` 能看到门户页并可登录
- [ ] 已绑域名 + 申请 Let's Encrypt + 强制 HTTPS
- [ ] 手机 `https://域名` 能用摄像头扫码
- [ ] 默认账号密码已修改
- [ ] `logs/` 与 `public/uploads/` 目录权限正常（运行用户可写）
- [ ] 数据库已加入每日备份计划（宝塔「数据库」备份或 mysqldump + 计划任务）
