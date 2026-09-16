# RELEASE v2.0.9 — 启动加固（并发 DDL 事故根因修复）+ scan.js 拆分瘦身 + 版本号文档校正

> 发布日期：2026-09-16
> 上一版：[RELEASE-v2.0.8.md](./RELEASE-v2.0.8.md)（作废即清柜）
> 本版性质：**稳定性加固（fix）+ 容量瘦身（refactor）+ 文档校正（docs）**，无业务语义变更、无状态机变更、无接口出入参变更。

---

## 1. 版本号统一（延续 v2.0.3 约定）

| 位置 | 值 |
|---|---|
| `package.json` → `version` | `2.0.9` |
| `subsystems/control/manifest.json` → `version` | `2.0.9` |
| `subsystems/fixtures/manifest.json` → `version` | `2.0.9` |
| `subsystems/projects/manifest.json` → `version` | `2.0.9` |
| `subsystems/samples/manifest.json` → `version` | `2.0.9` |
| `subsystems/workbench/manifest.json` → `version` | `2.0.9` |
| 本文件 | `docs/RELEASE-v2.0.9.md` |

AGENTS.md §13「版本号约定」原记录「当前 **2.0.6**」已滞后两个版本（v2.0.7/v2.0.8 发布时未同步），本次一并校正为 **2.0.9** 并复核四处一致。

---

## 2. 变更范围

### 2.1 启动加固：并发 DDL 事故根因修复（核心）

**事故现象（2026-09-16 实测）**：11:31:45 起服务未监听 4000，面板显示未启动，中断约 37 分钟（11:31:45–12:08）。

**根因（日志实证，非推断）**：

- `/www/wwwlogs/nodejs/sample_mgmt.log`（面板每次启动截断，单次运行 68 行）中 `[db] 子系统 schema 已加载: <name>` 对**同一进程**每个子系统打印 **2 次**，且成对交错（control,control,fixtures,fixtures,projects,projects,samples,samples,workbench,workbench）。
- 即**单进程内 `init()` 被执行了两次**：`db.js` 模块加载时的 `const ready = init()` 与 `server.js` 的 `await D.init()`。两次执行各自 `mysql.createPool()` 并各自跑一遍「框架表 DDL + 5 个子系统 schema.sql + 增量迁移」⇒ 同一进程内**并发 DDL**。
- 并发 `ALTER TABLE fixtures ADD COLUMN improve_note TEXT` 触发 `ER_LOCK_DEADLOCK`(errno 1213)：`db/migrations/fixtures.js:11` → `db/migrations/index.js:16` → `db.js:77 Object.init` → `server.js:170` 异步 IIFE，**当时无 try/catch** ⇒ uncaught rejection，进程在 `app.listen` 之前退出，故从未监听 4000。
- 该竞态为概率性：11:16 的启动侥幸通过，11:31 的启动命中死锁。
- 附带缺陷：双 `init()` 也意味着**每进程泄漏一个连接池**（`connectionLimit: 20`）。

**修复（三处，均为框架共享文件）**：

| 文件 | 变更 | 作用 |
|---|---|---|
| `db.js` | `init()` 改为**单飞（single-flight）**：`initPromise` 缓存同一 promise，失败时置回 `null` 允许重试；原 `init` 主体更名 `_init()` | 全进程**仅一次**建池 + 一次启动 DDL；消除并发 DDL 与连接池泄漏 |
| `db/migrations/index.js` | 新增 `runStartupDdl(pool)`：聚合「框架表 DDL + 子系统 schema 加载 + 增量迁移」，外层 `withDdlLock`（MySQL 命名锁 `GET_LOCK('sample_mgmt_ddl', 30)`，`finally` 中 `RELEASE_LOCK`）+ `runDdlWithRetry`（`ER_LOCK_DEADLOCK`/`ER_LOCK_WAIT_TIMEOUT`/`ER_TOO_MANY_USER_CONNECTIONS` 退避重试，最多 3 次，间隔 `1000*i` ms） | 即使未来出现多实例/多路径启动，DDL 也串行化并具备死锁重试；非瞬时错误（如 `ER_DUP_FIELDNAME`）立即抛出，不吞错 |
| `server.js` | `D.init()` 包 try/catch：失败时 `logger.error('启动失败，进程退出: ' + code + msg)` 并 `process.exit(1)`；新增 `server.on('error')` 捕获 `EADDRINUSE` 等监听失败并记录后退出；修正连接日志标注 `MariaDB` → `MySQL` | 启动失败**可见、可定位**（退出码 1 + 明确日志），不再静默 uncaught rejection |

**可用性取舍（重要）**：`withDdlLock` 取锁失败（如数据库无锁权限、`GET_LOCK` 报错、30s 超时）时**退化为无锁执行**（fail-open），不阻断启动——加固不得制造新的启动单点。`server.js:62` 的 `MariaDB` 字样为 `disableTouch` 设计注释（说明双 1 落盘延迟），属合法保留。

### 2.2 scan.js 拆分瘦身（§7.1 容量治理）

**背景**：`subsystems/samples/frontend/js/views/scan.js` 达 **289 行 / 19,313 字符 = 96.6%**，已越过 §7.1「达 90% 仅允许精简/重构」红线，且顶层函数 10 个（§7.2 上限 10）。

**做法**：按职责把「表单取值 + 前端软校验 + 载荷组装」4 个函数**逐字搬迁**至新文件 `subsystems/samples/frontend/js/views/scan-payload.js`：

- `collectCustodyCycle(body)`（复检周期软校验）
- `previewCheckoutDue()`（应还时间实时预览）
- `collectCheckoutPayload(body)`（领用人必填/时长校验/部门兜底）
- `collectWizardPayload(body)`（向导 RELEASE/RE_RELEASE 公共字段）

**结果**：

| 文件 | 行数 | 字符 | 占比 | 顶层函数 |
|---|---|---|---|---|
| `scan.js`（改后） | 242 | 17,109 | **85.5%**（原 96.6%） | 6（原 10） |
| `scan-payload.js`（新增） | 53 | 2,685 | 13.4% | 4 |

**行为保持依据**：bundle 为按 `tools/bundle-sources.json` 顺序**拼接的单一作用域**，4 个函数的依赖 `_coPick`（`checkout-user-picker.js:9` 顶层 `var`）、`wizardSample`（`scan-wizard.js:4` 顶层 `var`）、`toast`/`fmt`（shared）在该作用域内仍可见；调用点全部留在 `scan.js`（表单 `oninput="previewCheckoutDue()"` 与 `confirmScan` 的 3 处校验链）；`scan-payload.js` 已登记于 `bundle-sources.json` 且**顺序在 `scan.js` 之前**（索引 25 < 26）。bundle 内 4 个函数各出现 **1 次**，无重复定义。

**关联同步项（易漏）**：

1. `tests/samples-storage-loc-picker.test.js:76`、`tests/samples-checkout-users.test.js:43` 的断言原读 `scan.js` 中的被搬迁代码 → 改读 `scan-payload.js`（断言强度不变）。
2. 新增护栏 `tests/samples-scan-payload-split.test.js`（4 用例）：函数定义归属、调用点留存、bundle 清单顺序、容量红线。
3. **构建脚本跨子系统副作用已回退**：`tools/build-bundles.js` 会刷新**全部 5 个子系统** `index.html` 的 `module.css?v=`，本次按 §6.1 隔离原则回退 control/fixtures/projects/workbench 的 4 个 `index.html`，仅保留 samples。
4. samples bundle 重建：33 → **34 个源文件**，`bundle.js?v=bmu3wqo7w`、`module.css?v=bmu3wqo7w`、bundle 头 `BUNDLE vbmu3wqo7w — 34 files` **三处一致**（`tests/samples-report.test.js:90` 守护）。

### 2.3 文档与版本号校正

- `AGENTS.md` §3 目录树 RELEASE 清单补齐 `RELEASE-v2.0.7.md / RELEASE-v2.0.8.md / RELEASE-v2.0.9.md`。
- `AGENTS.md` §13 版本号约定：`（当前 **2.0.6**）` → `（2026-09-16 复核：当前 **2.0.9**）`。
- `CLAUDE.md` / `README.md` 无版本号硬编码，经检索无需改动。

---

## 3. 全链路关联依赖清单（5 维度）

| 维度 | 受影响项 | 处理 |
|---|---|---|
| 代码 | `db.js`（框架共享）、`db/migrations/index.js`、`server.js`；`subsystems/samples/frontend/js/views/scan.js`、新增 `scan-payload.js`；`tools/bundle-sources.json` | 已改；`db/migrations.js` 薄转发不变（新增导出为超集，兼容） |
| SQL | 无表/字段/索引变更；启动 DDL 执行路径与顺序变化（同一进程内串行化） | 迁移文件本身未改；`_migr_*` 哨兵语义未变 |
| 配置 | 无新增环境变量；锁定名 `sample_mgmt_ddl`、等待 30s、重试 3 次为代码内常量 | 无需运维配置 |
| 接口 | 无 API 出入参变更；`module.exports.ready = init()` 语义保持（seeds/tools/tests 链路不变） | 兼容 |
| 文档 | `docs/RELEASE-v2.0.9.md`（新增）、`AGENTS.md` §3/§13 | 已改；`README.md`/`CLAUDE.md` 无需改 |

**跨模块/跨子系统**：`db.js`/`server.js`/`db/migrations/index.js` 属**框架共享**文件（§6.1/§15.4 双系统回归强制）⇒ 需 samples + fixtures 双向只读回归。

---

## 4. 回归证据

### 4.1 静态校验（本地）

- `node --check`：`server.js`、`db.js`、`db/migrations/index.js`、`tests/db-startup-guard.test.js`、`scan.js`、`scan-payload.js`、`bundle.js` 全通过。
- **启动加固静态接线断言 24 项全 PASS**（单飞入口唯一、`createPool` 仅 1 处、框架表 DDL 已迁出 `db.js`、`GET_LOCK`/`RELEASE_LOCK`/退避重试/错误码白名单/导出超集、`server.js` try-catch 与 listen error 捕获、连接日志 `MySQL`）。首轮 1 项为**断言过严误报**（`server.js:62` 的 `MariaDB` 是 `disableTouch` 设计注释，非陈旧标签）。
- **拆分断言 22 项全 PASS**（4 函数归属与唯一性、调用点留存、清单顺序 25 < 26、三处版本号一致、34 文件计数、容量与函数数）。
- 新增单元测试：`tests/db-startup-guard.test.js`（4 用例：单飞同一 promise、错误码真值表、`withDdlLock` 串行化、`runDdlWithRetry` 重试成功/非瞬时错误立即抛出）。

### 4.2 服务器端全量测试

以服务器 jest 为准（本地镜像无 `node_modules`），结论见部署记录。

### 4.3 双系统只读回归（§6.1 强制）

| 系统 | 只读项 | 期望 |
|---|---|---|
| samples | `/health`、登录、样品列表/详情、柜位图、扫码台（含领用/接收保管/复检表单） | 页面正常、`allowedActions` 与 v2.0.8 一致（17 转移） |
| fixtures | 登录、治具列表/详情 | 页面与接口正常，无行为变化 |

---

## 5. 兼容性与已知行为

- **单飞语义**：并发调用 `D.init()` 返回**同一个** promise；首次失败后 `initPromise` 置回 `null`，后续调用可重试（不会永久卡死）。
- **锁权限**：数据库账号无 `GET_LOCK` 权限或取锁超时时**不阻断启动**（fail-open，退化为无锁执行并记录告警）。
- **重试边界**：仅重试 3 类瞬时错误；其余错误（如重复列 `ER_DUP_FIELDNAME`）立即抛出，避免掩盖真实迁移缺陷。
- **启动耗时**：启动 DDL 实测约 15–18s（v2.0.8 观测值），本次不改变执行内容，仅消除重复执行 ⇒ 启动期间**不再重复做一遍 DDL**。
- **前端**：4 个函数搬迁后全局可见性不变，页面行为与 v2.0.8 一致；bundle 版本号更新仅用于缓存失效。
- **无破坏性变更**：无字段/接口/常量删除，无需兼容过渡期。

---

## 6. 部署与回滚

### 6.1 部署（运维/用户执行）

```bash
# 1) 服务器拉取（项目目录属主 www）
cd /www/wwwroot/sample-mgmt && sudo -u www git pull --ff-only
# 2) 生效范围
#    - 前端：subsystems/samples/frontend/{index.html,js/bundle.js} 刷新浏览器即生效
#    - 版本号/manifest：ff-pull 即生效
#    - 后端：db.js / db/migrations/index.js / server.js 属启动期加载，MUST 由运维在宝塔面板「重启」后生效
# 3) 重启后只读验收
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/health
grep -c '子系统 schema 已加载' /www/wwwlogs/nodejs/sample_mgmt.log   # 每个子系统应仅 1 次（不再成对交错）
grep -n '数据库已连接: MySQL' /www/wwwlogs/nodejs/sample_mgmt.log
grep -n '启动失败，进程退出' /www/wwwlogs/nodejs/sample_mgmt.log      # 应无输出
```

### 6.2 重启申请（§23.2）

后端三文件为**启动期加载**，本版加固**必须重启才生效**；AI 不执行任何重启动作，需提交《重启申请》由运维在宝塔面板执行（详见交付说明）。

### 6.3 回滚

```bash
# 前端单点回滚（不影响后端）
cd /www/wwwroot/sample-mgmt && sudo -u www git checkout v2.0.8 -- \
  subsystems/samples/frontend/index.html \
  subsystems/samples/frontend/js/bundle.js \
  subsystems/samples/frontend/js/views/scan.js \
  subsystems/samples/frontend/js/views/scan-payload.js
# 后端回滚（回滚后同样需要运维重启）
sudo -u www git checkout v2.0.8 -- db.js db/migrations/index.js server.js
```

回滚后：`db.js` 恢复「模块加载即 `init()` + `server.js` 再 `init()`」的旧行为（并发 DDL 风险回归），故**回滚仅在加固引入新问题时使用**，并应立即上报。

---

## 7. 上线监控（1–3 个业务周期）

| 监控项 | 判据 | 周期 |
|---|---|---|
| 启动日志 | `[db] 子系统 schema 已加载` 每子系统**仅 1 次**；出现 `数据库已连接: MySQL` | 首次重启 |
| 启动失败 | 无 `启动失败，进程退出`、无 `ER_LOCK_DEADLOCK` | 首次重启 + 1 周期 |
| 进程存活 | 面板「负载状态」仅一个 `node server.js`(4000)，无游离实例 | 1–3 周期 |
| 错误日志 | `"level":"error"` 计数为 0（除既有业务告警） | 1–3 周期 |
| 迁移哨兵 | `_migr_*` 哨兵表存在，迁移未重跑（`deleted_at` 无二次 +8h） | 1–3 周期 |
| 前端 | 扫码台领用/接收保管/复检表单提交正常（拆分文件生效） | 首个业务日 |

---

## 8. 遗留与拆分方案（容量体检）

- `subsystems/samples/frontend/js/views/scan.js` 拆分后 **85.5%**，仍高于 70% 预警线：后续如需继续瘦身，可把 `renderScanAction`/`showScanActionForm` 渲染块抽为 `scan-form.js`（本次未做，避免一次改动过大）。
- 未处理容量项（既有技术债）：`report.js` 78.1%/16 顶层函数、`detail.js` 19 函数、`storage-loc-picker.js` 12 函数、`docs/operation-manual.md` 124.6%、`applyAction` 199 行、`smRenderCell`/`smMapRenderCell` 可合并。
- `tools/build-bundles.js` 会刷新全部 5 个子系统的 `module.css?v=`（本次已回退 4 个），建议后续为脚本增加「仅刷新指定子系统」参数以免反复产生跨子系统噪声。
