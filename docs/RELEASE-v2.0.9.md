# RELEASE v2.0.9 — 启动加固（并发 DDL 事故根因修复）+ scan.js 拆分瘦身 + 版本号文档校正 + 测试环境稳定性修复

> 发布日期：2026-09-16
> 上一版：[RELEASE-v2.0.8.md](./RELEASE-v2.0.8.md)（作废即清柜）
> 本版性质：**稳定性加固（fix）+ 容量瘦身（refactor）+ 文档校正（docs）+ 测试环境稳定性（fix，见 §9）**，无业务语义变更、无状态机变更、无接口出入参变更。

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
| `scan.js`（改后） | 244 | 17,109 | **85.5%**（原 96.6%） | 6（原 10） |
| `scan-payload.js`（新增） | 51 | 2,685 | 13.4% | 4 |

> 容量口径：服务器端 LF 文本 + `String.length`（字符）与 `wc -l`（行）实测值。

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

### 2.4 测试环境稳定性修复（验证期新增，详见 §9）

- `tests/setup-env.js` 新增**编码表预热**：消除多测试文件全量运行时的 `cesu8` 致命中断，全量套件首次能跑完并打印汇总。
- `package.json` 新增依赖锁定 `overrides: { mysql2: { iconv-lite: 0.6.3 } }`（方案 A，实测对 `cesu8` 无效，保留现状，见 §9.1 备注）。
- `tests/detail-modal-shared.test.js`、`tests/samples-picker-timing.test.js` 各同步 1 处陈旧断言（E/F）。

---

## 3. 全链路关联依赖清单（5 维度）

| 维度 | 受影响项 | 处理 |
|---|---|---|
| 代码 | `db.js`（框架共享）、`db/migrations/index.js`、`server.js`；`subsystems/samples/frontend/js/views/scan.js`、新增 `scan-payload.js`；`tools/bundle-sources.json` | 已改；`db/migrations.js` 薄转发不变（新增导出为超集，兼容） |
| SQL | 无表/字段/索引变更；启动 DDL 执行路径与顺序变化（同一进程内串行化） | 迁移文件本身未改；`_migr_*` 哨兵语义未变 |
| 配置 | 无新增环境变量；锁定名 `sample_mgmt_ddl`、等待 30s、重试 3 次为代码内常量；**新增依赖锁定** `overrides: mysql2 → iconv-lite 0.6.3`（§9.1） | 需在重启窗口执行 `sudo -u www npm install`（已执行：`changed 1 package`，`npm ls` 退出码 0） |
| 接口 | 无 API 出入参变更；`module.exports.ready = init()` 语义保持（seeds/tools/tests 链路不变） | 兼容 |
| 文档 | `docs/RELEASE-v2.0.9.md`（新增）、`AGENTS.md` §3/§13 | 已改；`README.md`/`CLAUDE.md` 无需改 |
| 测试 | `tests/db-startup-guard.test.js`、`tests/samples-scan-payload-split.test.js`（新增）；`tests/setup-env.js`（编码表预热，B）；`tests/detail-modal-shared.test.js:247`（E）、`tests/samples-picker-timing.test.js:20`（F） | 已改；断言强度不变（E）或增强（F） |

**跨模块/跨子系统**：`db.js`/`server.js`/`db/migrations/index.js` 属**框架共享**文件（§6.1/§15.4 双系统回归强制）⇒ 需 samples + fixtures 双向只读回归。

---

## 4. 回归证据

### 4.1 静态校验（本地）

- `node --check`：`server.js`、`db.js`、`db/migrations/index.js`、`tests/db-startup-guard.test.js`、`scan.js`、`scan-payload.js`、`bundle.js` 全通过。
- **启动加固静态接线断言 24 项全 PASS**（单飞入口唯一、`createPool` 仅 1 处、框架表 DDL 已迁出 `db.js`、`GET_LOCK`/`RELEASE_LOCK`/退避重试/错误码白名单/导出超集、`server.js` try-catch 与 listen error 捕获、连接日志 `MySQL`）。首轮 1 项为**断言过严误报**（`server.js:62` 的 `MariaDB` 是 `disableTouch` 设计注释，非陈旧标签）。
- **拆分断言 22 项全 PASS**（4 函数归属与唯一性、调用点留存、清单顺序 25 < 26、三处版本号一致、34 文件计数、容量与函数数）。
- 新增单元测试：`tests/db-startup-guard.test.js`（4 用例：单飞同一 promise、错误码真值表、`withDdlLock` 串行化、`runDdlWithRetry` 重试成功/非瞬时错误立即抛出）。

### 4.2 服务器端全量测试（三阶段实测对比）

| 阶段 | 命令 | 套件结果 | 用例结果 | `cesu8` 致命异常 |
|---|---|---|---|---|
| 修复前 | `npx jest --maxWorkers=2 --forceExit` | 11 PASS / 2 FAIL（进程中断，仅跑到 13 个套件） | 无汇总行 | **3 次**，进程致命退出 |
| 修复前（串行对照） | `npx jest --runInBand` | 11 PASS / 2 FAIL | 无汇总行 | **3 次**（与 worker 数无关） |
| 预热修复后（B） | `npx jest --maxWorkers=2 --forceExit` | 35 PASS / 3 FAIL / 7 skipped（45 套件） | **505 passed / 6 failed / 10 skipped** | **0 次**，正常打印汇总 |

> 修复前全量只能跑到 13 个套件即中断，故 45 个套件中的多数用例长期未被真正执行；预热修复后首次获得完整测试信号（这也是 F 直到本次才暴露的原因）。

**失败套件定性（均为既存问题，非本版引入，详见 §9）**：

| 套件 | 现象 | A/B 对照（旧提交 `9996b69` vs 本版，同命令同用例） |
|---|---|---|
| `tests/users.test.js` | 4 项失败：`Lock wait timeout exceeded`（`db/dao.js:65` 的 `pool.execute`）+ 2 项 30s 用例超时 | 旧 6 项失败 / 新 4 项失败（旧不优于新） |
| `tests/detail-modal-shared.test.js` | 1 项：`lazyTabs` 断言陈旧（E） | 双向一致 `1 failed, 11 passed`；本版已修 |
| `tests/samples-picker-timing.test.js` | 1 项：`_smCache` 失效条件断言陈旧（F） | 双向一致 `1 failed, 7 passed`；本版已修 |

**本次新增测试**：`tests/db-startup-guard.test.js` **PASS**（9.18s）、`tests/samples-scan-payload-split.test.js` **PASS**。

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
- **依赖**：仅 1 个嵌套包变更（`mysql2` 的 `iconv-lite` 0.7.3 → 0.6.3，`npm ls` 退出码 0，无连带升级）；生产运行路径经 245/245 连接探针验证无变化。
- **测试环境**：`tests/setup-env.js` 新增编码表预热，仅作用于测试进程（生产为纯 node 运行，不经该惰性加载路径）。
- **无破坏性变更**：无字段/接口/常量删除，无需兼容过渡期。

---

## 6. 部署与回滚

### 6.1 部署（运维/用户执行）

```bash
# 1) 服务器拉取（项目目录属主 www）
cd /www/wwwroot/sample-mgmt && sudo -u www git pull --ff-only
# 2) 依赖同步（本版 package.json / package-lock.json 有变更：iconv-lite override）
sudo -u www npm install --no-audit --no-fund
# 3) 生效范围
#    - 前端：subsystems/samples/frontend/{index.html,js/bundle.js} 刷新浏览器即生效
#    - 版本号/manifest：ff-pull 即生效
#    - 后端：db.js / db/migrations/index.js / server.js 属启动期加载，MUST 由运维在宝塔面板「重启」后生效
# 4) 重启后只读验收
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4000/health
grep -c '子系统 schema 已加载' /www/wwwlogs/nodejs/sample_mgmt.log   # 每个子系统应仅 1 次（不再成对交错）
grep -n '数据库已连接: MySQL' /www/wwwlogs/nodejs/sample_mgmt.log
grep -n '启动失败，进程退出' /www/wwwlogs/nodejs/sample_mgmt.log      # 应无输出
```

> 步骤 2 已于 2026-09-16 由本次验证执行完毕（`changed 1 package`）；若后续回退依赖再按 §6.3 重装。

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
# 测试侧回滚（§9 的 B/E/F 三个测试文件）
sudo -u www git checkout v2.0.8 -- tests/setup-env.js tests/detail-modal-shared.test.js tests/samples-picker-timing.test.js
# 依赖回滚（§9.1 方案 A 去留；回退后需重装依赖）
sudo -u www git revert fea2b13 && sudo -u www npm install --no-audit --no-fund
```

回滚后：`db.js` 恢复「模块加载即 `init()` + `server.js` 再 `init()`」的旧行为（并发 DDL 风险回归），故**回滚仅在加固引入新问题时使用**，并应立即上报。测试侧回滚会使全量套件重新出现 `cesu8` 致命中断（§9.1）。

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
| 握手编码（测试环境） | 全量 `npx jest` 正常打印汇总、`cesu8` 出现 **0 次** | 每次回归 |

---

## 8. 遗留与拆分方案（容量体检）

- `subsystems/samples/frontend/js/views/scan.js` 拆分后 **85.5%**，仍高于 70% 预警线：后续如需继续瘦身，可把 `renderScanAction`/`showScanActionForm` 渲染块抽为 `scan-form.js`（本次未做，避免一次改动过大）。
- 未处理容量项（既有技术债）已由用户确认为**下一迭代目标**，清单见 §10.1。
- `tools/build-bundles.js` 会刷新全部 5 个子系统的 `module.css?v=`（本次已回退 4 个），建议后续为脚本增加「仅刷新指定子系统」参数以免反复产生跨子系统噪声。

---

## 9. 验证期发现与修复（D/E/F）

> 本节记录**服务器端回归验证过程中新发现**的问题。三项均经 A/B 对照（旧提交 `9996b69` 与本版同命令、同用例）确认**非本版引入**。

### 9.1 D：数据库握手 `cesu8` 致命异常（高优先级，已修复）

**现象**：全量 `npx jest` 运行中被 `Error: Encoding not recognized: 'cesu8' (searched as: 'cesu8')` 终止（`{ fatal: true }`），**不打印 Tests 汇总行**；单套件运行时表现为连接失败 / `Lock wait timeout exceeded` / 用例 30s 超时，极易误判为数据库故障。

**完整栈（服务器实测）**：

```
iconv-lite/lib/index.js  getCodec → throw "Encoding not recognized: 'cesu8'"
mysql2/lib/parsers/string.js:20              decode
mysql2/lib/packets/packet.js:444             readNullTerminatedString
mysql2/lib/packets/handshake.js:63           readNullTerminatedString('cesu8')   ← mysql2 硬编码
mysql2/lib/commands/client_handshake.js:261  handshakeInit
mysql2/lib/base/connection.js:111            Socket.<anonymous> → TCP.onStreamRead   { fatal: true }
```

**根因链（每步均有实测证据）**：

1. `mysql2/lib/packets/handshake.js:63` 以**硬编码 `'cesu8'`** 解析服务端版本串 ⇒ 每次连接握手都会请求该编码。
2. `iconv-lite` 首次使用某编码时才**惰性载入编码表**：`iconv-lite/lib/index.js:63`（0.6.3）= `if (!iconv.encodings) iconv.encodings = require("../encodings");`（**无 try/catch**）。
3. 多测试文件的全量运行中，该惰性 `require` 在**连接回调期（模块注册表生命周期边界）**取不到完整编码表 ⇒ `encodings['cesu8']` 为 `undefined` ⇒ `switch` 落到 `default` 分支抛出「Encoding not recognized」——**真实加载异常被伪装成「编码不支持」**（0.6.3 抛错点 `lib/index.js:104`、0.7.3 为 `:108`，行号随版本偏移而错误文案不变，可佐证同一分支）。
4. 异常发生在 socket 数据回调内、无上层 try/catch ⇒ **进程致命退出**；若发生在启动 DDL 内则被 `withDdlLock` 的 fail-open 捕获并记录（日志可见 `[db] 获取 DDL 锁失败，退化为无锁执行: ... cesu8`）。

**证据矩阵**：

| 验证项 | 结果 | 结论 |
|---|---|---|
| 纯 node 探针（不含仓库代码）：串行 30 次 + 池化 15 次 + 并发 200 次连接（含生产库与测试库、含/不含 charset） | **245/245 成功** | 生产运行路径与连接配置无缺陷 |
| `iconv-lite` 版本对比：`getCodec('cesu8')` 在 0.6.3 与 0.7.3 下（纯 node） | 两者均成功 | **版本不是变量** |
| 方案 A（`overrides` 锁 `iconv-lite@0.6.3`）安装后全量运行 | `cesu8` 仍 **3 次**；栈行号由 0.7.3 的 108 变为 0.6.3 的 104 | **A 无效**（已实施、无副作用） |
| 单测试文件运行（`--runInBand` 单文件） | `cesu8` **0 次** | 触发条件与「多测试文件」相关 |
| 全量串行 `--runInBand` | `cesu8` **3 次** | 与 worker 数量无关 |
| jest 内探针：`require(内嵌 iconv-lite)` 后 `encodingsLoaded=false`、`getCodec('cesu8')` 成功 | 同步调用可触发惰性载入 | 惰性载入点在「注册表存活期内」可正常工作 |
| 方案 B（`tests/setup-env.js` 预热编码表）后全量运行 | `cesu8` **0 次**，首次打印汇总（505 passed） | **B 有效** |

**方案 A 备注（保留现状）**：`package.json` 的 `overrides` 已实施并安装（`npm install` 仅变更 1 个包、`npm ls` 退出码 0），对 `cesu8` 症状**无实际作用**；但 `iconv-lite@0.6.3` 是 mysql2 长期依赖版本、无兼容风险，故**默认保留**。如需最小化依赖改动，可按 §6.3 用 `git revert + npm install` 回退。

**影响面**：仅**测试环境**。生产为纯 node 运行、不经该惰性加载路径（245/245 探针为证），服务 `/health` 全程 200，生产进程未受影响。

### 9.2 E：`lazyTabs` 断言未同步「替代链」Tab（已修复）

`tests/detail-modal-shared.test.js:247` 断言 `lazyTabs: ['logs', 'image']`，而 `subsystems/samples/frontend/js/views/detail.js:25` 自 `c3b75e7`（2026-09-15 新增替代链 Tab；`docs/RELEASE-v2.0.6.md:47` 明确「懒加载（`lazyTabs` 增加 `chain`）」）起为 `['logs', 'image', 'chain']`；`tests/samples-replacement-chain.test.js:104` 已按新值断言 ⇒ **测试未同步、代码正确**。修法：按「新增替代链 Tab」将断言同步为三元素（断言强度不变）。

### 9.3 F：`_smCache` 失效条件断言未同步广义化（已修复）

`tests/samples-picker-timing.test.js:20` 断言 `if(action==='CUSTODY'||action==='EDIT_STORAGE')_smCache=null;`，而 `subsystems/samples/frontend/js/views/scan.js:6,219` 已改为广义机制 `_SM_LOC_ACTIONS`（`CUSTODY/EDIT_STORAGE/RETIRE_ONLY/RETIRE_RECREATE/FORCE_RETIRE/RECREATE`，注释明确为 2026-09-16 扩入作废/重做类）⇒ 断言陈旧。修法：断言同步为机制校验（覆盖面**强于**原字面量的 2 个动作）。该套件此前从未被真正执行（全量运行在 `cesu8` 处中断）⇒ **新暴露的既存问题**。

### 9.4 遗留：`tests/users.test.js` 4 项失败（环境性，本次未修）

失败形态为 `Lock wait timeout exceeded`（`db/dao.js:65` 的 `pool.execute`）与 2 项 30s 用例超时，伴随数据库侧慢查询（实测单请求 22–24s）；测试库残留连接数 0，MySQL 侧配置正常（`max_connections=500`、`max_user_connections=0`、`Threads_connected=44`）。A/B 显示旧提交失败**更多**（6 项）⇒ 非本版引入，属测试库负载/慢查询导致的既存环境性失败，建议独立排查（不属本版范围）。

---

## 10. 下一迭代目标（用户 2026-09-16 确认）

### 10.1 容量瘦身（§7.1 / §7.2）

| 目标 | 现状 | 建议动作 |
|---|---|---|
| `subsystems/samples/frontend/js/views/report.js` | 78.1%，16 个顶层函数 | 拆「统计 / 明细」两域，函数数降至 ≤10 |
| `subsystems/samples/frontend/js/views/detail.js` | 19 个顶层函数（超 §7.2 上限 10） | 按 Tab 域拆分 |
| `subsystems/samples/frontend/js/views/storage-loc-picker.js` | 12 个顶层函数 | 拆「候选渲染 / 取值」两域 |
| `docs/operation-manual.md` | 124.6% 字符红线 | 下沉至已有 5 份子系统分册 |
| `applyAction` | 199 行（超 §7.2 单函数 60 行） | 按动作类型拆子函数 |
| `smRenderCell` / `smMapRenderCell` | 逻辑重复 | 合并 |
| `public/css/app.css` | 109.6%（已超 20000 字符红线） | 门户块拆独立样式文件（需三系统回归） |
| `README.md` | 101.2% | 用户 2026-09-11 决定暂不拆分 |
| `subsystems/samples/backend/routes-samples.js` | 89.2% | 后续拆分候选 |
| `scan.js` | 85.5%（本版已由 96.6% 降低） | 如需继续：`renderScanAction`/`showScanActionForm` 抽 `scan-form.js` |
| `tools/build-bundles.js` | 会刷新全部 5 个子系统 `module.css?v=` | 增加「仅刷新指定子系统」参数 |
| 本文件 `docs/RELEASE-v2.0.9.md` | 304 行 / 15,710 字符（**78.5%**，已过 70% 预警线；该数值为新增本行前的实测值） | 后续发布说明精简为「本版变更 + 回归证据」，§9 级根因证据链下沉 `docs/archive/` |

### 10.2 其他

- 测试环境：`tests/users.test.js` 的 `Lock wait timeout` 环境性失败需独立排查（§9.4）。
- 方案 A 去留（§9.1 备注）：建议保留 `iconv-lite@0.6.3` override（无副作用，符合 mysql2 长期依赖组合）。
