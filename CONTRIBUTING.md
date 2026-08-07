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
