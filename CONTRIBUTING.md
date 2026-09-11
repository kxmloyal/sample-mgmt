# CONTRIBUTING — 开发贡献指南

> 本文档约束所有开发者与 AI agent 在本仓库的编码规范，与 AGENTS.md（AI 协作指南）、CLAUDE.md（Claude 工作指南）互为补充。

## 1. 编辑器格式规范（EditorConfig）

仓库根目录 `.editorconfig` 为编辑器格式统一规范，主流 IDE（VS Code/Trae/JetBrains）自动识别，无需手动安装插件。

| 规则 | 值 | 说明 |
|---|---|---|
| `indent_style` | space | 空格缩进（禁止 Tab） |
| `indent_size` | 2 | JS/JSON/CSS/HTML/SQL 统一 2 空格 |
| `charset` | utf-8 | 统一 UTF-8 |
| `end_of_line` | lf | LF 行尾（Linux 部署环境） |
| `insert_final_newline` | true | 文件末尾保留换行 |
| `trim_trailing_whitespace` | true | 去除行尾空格（`.md` 除外，保留 Markdown 行尾双空格换行语义） |

若 IDE 未生效：确认已启用 EditorConfig 支持（VS Code 需安装扩展 "EditorConfig for VS Code"）。

## 2. dotenv 加载规范（MUST）

### 背景与根因

本项目的数据库配置在 **db.js 模块加载时即求值**（`dbConfig` 直接读取 `process.env.DB_*`），而 **db.js 本身不加载 .env**——dotenv 由各独立入口在 `require('db')` **之前**加载。任何新脚本若在加载 dotenv 前 require db.js，会拿到空密码连接，报 `Access denied for user 'sample_mgmt'@'localhost'`。

### 硬性规则

1. **任何独立运行的脚本/CLI（通过 `node xxx.js` 直接执行）MUST 在顶部、require db 之前加载 dotenv**：

```js
require('dotenv').config();          // MUST 第一行（或紧随注释）
const D = require('./db');           // 之后才可 require db
```

2. **豁免场景（无需自加载）**：
   - 纯函数导出模块（`module.exports = fn`，无自执行入口），由已加载 dotenv 的入口调用（如各 `subsystems/*/seed/seed.js`）
   - 后端路由/中间件（`routes/*`、`subsystems/*/backend/*`），统一由 `server.js`（已加载 dotenv）挂载
   - 测试文件：经 `tests/helpers/setup.js → getApp() → server.js` 链路加载，禁止在顶层提前 require db
   - `tools/` 构建/文档脚本：不连 DB，无此约束

3. **禁止**：在 `require('dotenv')` 之前 `require('./db')` 或读取 `process.env.DB_*`（db.js 的 `dbConfig` 在模块加载时捕获环境变量，晚加载无效）。

### 自查命令（提交前 MUST 执行）

```bash
# 列出所有引用 db 的脚本，逐一确认 dotenv 在 require db 之前
grep -rn "require.*['"].*db['"]" --include='*.js' . | grep -v node_modules
# 列出所有已加载 dotenv 的脚本
grep -rln "dotenv" --include='*.js' . | grep -v node_modules
```

### 排查清单

- [ ] 新脚本：`dotenv` 加载行位于 `require db` 之前
- [ ] 纯导出模块未误加自执行入口（如 `if (require.main === module)`）
- [ ] 测试文件未在顶层 require db（须经 getApp() 链路）
- [ ] 冒烟验证：脚本能独立连库（非 `Access denied`）

---

## 测试数据库隔离（强制，2026-09-11 / P1 修复）

**规则：`npm test` / `npx jest` 只允许连独立测试库（库名 MUST 以 `_test` 结尾，默认 `sample_mgmt_test`），禁止连生产库 `sample_mgmt`。**

| 层 | 机制 |
|---|---|
| 强制改写 | `jest.config.js` 的 `setupFiles: ['<rootDir>/tests/setup-env.js']` 在每个测试文件加载前把 `DB_NAME` 改写为 `sample_mgmt_test`（可用 `TEST_DB_NAME` 指定其它 `_test` 库） |
| 为什么有效 | `setupFiles` 早于 `db.js`（第 9 行）与 `server.js`（第 59 行，会话存储）**在模块加载时**捕获 `DB_NAME` 的时机；且 `dotenv` 默认 `override=false`，测试文件顶层的 `require('dotenv').config()` 不会覆盖它 |
| 兜底断言 | `tests/helpers/setup.js` 的 `getApp()` 在 `require('../../server')` 之前校验 `DB_NAME` 以 `_test` 结尾，否则**失败即停**（不降级继续） |

**为什么必须这样做**：`getApp()` → `server.js` → `db.js init()` 会对**所连库**执行 `schema.sql` 与全部迁移。连错库 = 对生产库执行迁移（`migrateProjectPlm` 每次启动即 `DELETE project_workflow`；`migrateSamplesDeletedAtTz` 的 `+8h` 校正仅靠一张哨兵表拦截）。测试文件里的 `describe.skip` 守卫只跳过测试主体，**不阻止** `init()` 的迁移副作用。

**首次使用前确保测试库存在**：

```sql
CREATE DATABASE IF NOT EXISTS sample_mgmt_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

表结构由启动迁移自动创建，无需手工建表。

**其它约定**：
- 已上线子系统（`manifest.deployed: true`）的数据写入类用例只允许跑在测试库上；`tests/helpers/deployed.js` + 各套件守卫据此判断（DB_NAME 非 `_test` 时自动 skip）。
- 多套测试库并行：`TEST_DB_NAME=xxx_test npx jest`（仍须 `_test` 结尾）。
- 独立运行的手工流量脚本（`test_flow.js` / `test_fixture_flow.js`）不经 jest，**不享受本隔离**，运行前须自行确认目标库。
