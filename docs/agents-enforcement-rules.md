# AGENTS.md 参考卷 C：强制检查点与规则补充（2026-09-17）

> **本卷收录 AGENTS.md §25 全文**（编号不变，全项目「见 AGENTS.md §25 / §25.x」类引用继续有效）。
> **来源**：`docs/samples-review-2026-09-17.md` 专项评审——三路并行专家评审（后端/前端/安全）+ 主控逐行复核。
> **动手前 MUST 先读**：新增/修改任何写接口、DAO 写语句、前端视图、共享文件、构建与容量台账、规则或测试。
> **主文件配套**：AGENTS.md §25 保留常驻红线摘要 + 本卷指针；本卷承载 24 条规则的完整正文、依据（`file:line`）与可执行检查点。

---

## 25.1 本卷规则编号与来源映射

| 本卷编号 | 报告编号 | 主题 | 性质 |
|---|---|---|---|
| §25.2.1 ~ §25.2.5 | R-6 / R-7 / R-9 / R-1 / R-24 | 安全与转义 | 2 条为**新增**，3 条为**已有规则缺检查点** |
| §25.3.1 ~ §25.3.7 | R-8 / R-11 / R-12 / R-13 / R-14 / R-21 / P3-21 | 数据正确性 | 全部为**新增** |
| §25.4.1 ~ §25.4.4 | R-3 / R-22 / R-23 | 跨子系统边界 | 1 条为已有规则缺检查点 |
| §25.5.1 ~ §25.5.4 | R-2 / R-4 / R-15 | 容量与构建 | 2 条为已有规则缺检查点 |
| §25.6.1 ~ §25.6.6 | R-16 / R-17 / R-18 / R-19 / R-5 / R-20 | 前端生命周期与脚本护栏 | 1 条为已有规则缺检查点 |
| §25.7 | — | 落地状态与优先级 | — |

**「已有规则缺检查点」的含义**：条文早已存在（如 AGENTS.md §19.4、§20.2.5、§21.3），仓库内也有正确样板，但**没有任何机制能发现违反**，故缺陷在部分路径反复发生。这类规则的核心动作是**补检查点**，而非重写条文。

---

## 25.2 安全与转义

### 25.2.1 用户可写入的枚举/标签字段 MUST 在服务端白名单化（R-6）

**规则**：任何进入 UI 展示的短枚举字段（如 `sample_type` / `source_type` / `station` / 状态类），其**每一个写入口** MUST 做 `includes` 白名单校验，非法值返回 400。**禁止**只做 `.trim()` 后直存；**不得**以「前端下拉已经限制了取值」作为豁免理由。

**依据**：`subsystems/samples/backend/routes-samples.js:185` 对 `source_type` 有 `['C','T','G'].includes` 校验、`:189` 对 `station` 有 `STATION_GROUPS` 校验，而**同一函数内** `:194` 的 `sample_type` 无校验——一有一无正是存储型 XSS（报告 P1-2）的根因；同类缺失见 `routes-samples.js:313`、`scan-actions.js:85`、`scan-actions.js:195`。`db/schema.sql:35` 的 `VARCHAR(20)` 仅把载荷压缩到 20 字符，**不构成防护**（20 字符内仍可构造有效 XSS）。

**检查点**：新增/修改写接口时，逐一列出该接口写入的枚举字段，逐个确认有 `includes` 白名单；可静态检索「`xxx_type:`/`station:` 直接赋值且同文件无 `includes(xxx)`」。

**例外**：自由文本字段（备注、原因）不适用白名单，但 MUST 按 §25.2.2 在输出侧转义。

**可选字段的兼容口径（2026-09-18 补充，来源：本批修复的服务端回归实测）**：当被校验字段是**可选**的（既有调用方可以完全不传），校验器 MUST 把「字段未传（`undefined`/`null`）」与「未指定（空串）」**同等视为合法**。**禁止**写成 `['','OK','NG'].includes(String(v).trim())` —— 字段未传时 `String(undefined)` 会得到字面量 `'undefined'`，不在白名单 → 对**所有不传该字段的既有调用方返回 400**，构成 §6.2 所禁的破坏性变更。正确写法：`String(v == null ? '' : v).trim()`。

**依据（实测）**：本批新增的 `subsystems/samples/backend/sample-type.js` 初版即犯此错。服务端全量回归（47 套件）暴露两处 400：`routes-samples.js:190` 的 `POST /api/samples`（`tests/samples-checkout-e2e.test.js:30` 的建样 fixture 因此由 201 变 400）、`scan-actions.js:199` 的 `EDIT_CARD`（**该行注释本就写着「空值沿用原值，行为不变」，代码与自身注释矛盾**）。注意 `routes-samples.js:266` 的 `sample_type !== undefined && !isValidSampleType(...)` 已自带该豁免，同一不变量在两个写入口口径不一致——正因如此，豁免 MUST 收敛到**唯一校验器内部**（§25.3.3），而非散落在各调用点。

**检查点**：改白名单校验器时，MUST 用 `undefined` / `null` / `''` / 非法串 / XSS 载荷 / 数字 / 注入串各跑一次；确认前三个返回 true、后四个返回 false。

### 25.2.2 非本函数产出的字符串进 `innerHTML`/HTML 属性前 MUST 经 `e()`（R-7）

**规则**：
1. 任何**非本函数字面量产出**的字符串，进入 `innerHTML`、属性值（含 `title=`/`value=`/`onclick=`）前 MUST 经 `e()` 转义。
2. **标签映射函数 MUST NOT 用原始值兜底**——禁止 `x==='A'?'甲':x==='B'?'乙':x` 这种「未知值透传」写法；兜底 MUST 返回安全常量（如 `'—'`）或明确的分支。
3. 属性中拼接的值，**属性上下文与 JS 字符串上下文不得混用同一层转义**（见 §25.6.3）。

**依据**：`subsystems/samples/frontend/js/views/list.js:5` 的 `sampleTypeLabel` 对未知值原样返回，配合 `list-render.js:26` 未 `e()` → 存储型 XSS（P1-2）；`list-inspect.js:32` 把 `retired_reason`（`db/schema.sql:45` 为 `TEXT`，**无长度上限**）拼入字符串，`:65` 直接写入 `title="..."`，`">` 即可闭合属性 → 存储型 XSS（P1-1），且经 `list-render.js:50` 与 `dashboard-todo.js:46` 在**列表主页与看板**双处触发。

**检查点**：本系统前端是**单 bundle 单全局作用域的手工拼接**，无框架自动转义，此规则是唯一防线。可写成检查项：① `innerHTML` 赋值行内出现 `(` 调用但无 `e(`；② `title="' +` 之后无 `e(`；③ 标签函数三元链以裸变量结尾。

**例外**：本函数内字面量常量、纯数值（`id`、计数）、已经过 `e()`/`fmt()`/`statusBadge()` 处理的表达式。

### 25.2.3 `catch` 分支 MUST NOT 透出 `err.message`（R-9）

**规则**：接口 `catch` 分支 MUST 返回**固定文案** + 服务端 `logger.error(...)`；仅「已明确列入白名单的业务态提示」（如「该机型已达上限 999」）可直接回给客户端。**禁止**把数据库原始 `err.message` 或 `e.message` 放进响应体。

**依据**：正确样板**早已存在**于 `server.js:164`（全局错误处理统一返回 `{error:'服务器内部错误'}`），但 9 处遗漏：`routes-samples.js:137/209/270`、`routes-scan.js:77`、`routes-storage-map.js:97/119`、`routes-checkout-users.js:36`、`routes-samples-models.js:80`、`batch-scan.js:112`。可构造 `GET /api/samples?status=,`（`db/dao-list.js:17` 生成 `status IN ()` 语法错误）令响应体回显 MySQL 方言、表名、列名与约束名。

**检查点**：静态检索 `catch` 块内是否出现 `err.message` / `e.message` 且未包裹在固定文案白名单中；新增接口 MUST 用 `asyncHandler` + 全局错误处理，禁止各自 `res.status(500).json({error: e.message})`。

### 25.2.4 CSV 生成 MUST 单点复用 `shared/csv.js`，前端导出同样适用（R-1）

**规则**：**任何** CSV 产出（后端导出端点 + 前端 Blob 下载）MUST 走同一转义实现，禁止在视图或路由中自写 `esc`。公式注入中和 MUST 覆盖**前导空白**与全部危险前导字符。

**依据**：条文早已存在于 AGENTS.md §21.3，但 `subsystems/projects/backend/routes-stats.js:68` 自建 `esc` **且缺失** `shared/csv.js:8` 的公式中和 → 2026-09-01 S3 修复在该导出路径被**旁路**（4/5 子系统正确复用，projects 是唯一违规者）；`subsystems/samples/frontend/js/views/scan-batch-result.js:94-98` 前端侧另一套实现，同样无中和。另：`shared/csv.js:8` 的 `/^[=+\-@\t\r]/` 未跳前导空白、未含 `\n`，且 `tests/csv.test.js`（36 行）**从未断言该公式护栏**——保护全仓无测试。

**检查点**：① 断言全仓仅存在一处 CSV 转义实现（可检索 `replace(/"/g,'""')` 类特征）；② 补公式护栏的单元测试（含 `" =1+1"`、`"\n=1+1"`、`"\t=1+1"` 用例）。

### 25.2.5 共享 CSS 变量 MUST 有缓存失效机制（R-24）

**规则**：被 `index.html` 引用的共享样式表（`public/css/app.css`）MUST 纳入版本号刷新或改用内容哈希。**禁止**让共享样式表的 `?v=` 成为静态字面量而无所属版本体系。

**依据**：`?v=20260805b` 是**全部 5 个 `index.html` 中的静态字面量**，`tools/build-bundles.js` 明确不触碰它（注释称「后者使用独立的 v=20260805b 版本体系」），而 `public/css/app.css` 已达 **21,910 字符（109.5%，越 §7.1 的 20,000 兜底线）**且注定要重构 → 一旦改版，用户将拿到旧缓存。

**检查点**：改 `app.css` 前确认版本号刷新路径；长期方案为内容哈希。

---

## 25.3 数据正确性

### 25.3.1 机器可读标记 MUST NOT 写入用户自由文本列；幂等键 MUST 有唯一约束（R-8）

**规则**：
1. 幂等键、批次号、来源标记等**机器可读标记** MUST 落在独立列或独立表，**禁止**与用户自由文本共用同一列。
2. 幂等键 MUST 由有 **UNIQUE 约束**的列/表承载；**禁止**用 `LIKE` 探测实现幂等。
3. 过渡期若不得不共用，探测侧 MUST 至少限定 `action` + `user_id` 维度，且用户文本入库前 MUST 剥离保留字面量。

**依据**：`subsystems/samples/backend/batch-scan.js:101` 把 `' [batch:<id>]'` 追加进 `scan_logs.note`；`db/dao.js:154` 用 `WHERE l.note LIKE CONCAT('%[batch:', ?, ']%')` 探测——**不限定 action、不限操作人、不限批次类型**；而同列被写入用户自由文本：`scan-actions.js:179/190/217/238/246/249/282`（领用备注、归还备注、退回原因、作废原因），`schema.sql:63` 的 `note TEXT` **不截断**。任一 CUSTODY/ME 用户把 `x [batch:ABCD1234]` 写进退回原因，即可让合法批量作业被判 `409 BATCH_DUPLICATE`。

**方向说明（定级依据）**：该缺陷是**「误拒 + 审计污染」**，**不是**越权或重复执行——幂等键由客户端提供，换新 id 即绕过；且二次状态流转被 `batch-scan.js:104` 的 CAS 与 `scan-allowed.js:20-27` 的状态机裁定拦住。

**检查点**：新增幂等/去重机制时，检查标记载体是否为**有唯一约束**的列；检索 `LIKE CONCAT('%[` 类探测语句。

### 25.3.2 超时/期限谓词 MUST 时钟同源（R-11）

**规则**：`TIMESTAMP` 类型列**只能**与 `NOW()` 比较；ISO 字符串列**只能**与 `UTC_TIMESTAMP()` 比较。**禁止**混用（会出现固定时差偏移）。

**依据**：已发生 **2 次真实的 8 小时偏差缺陷**；现存 `subsystems/samples/db/dao-list.js:83` 的 `updated_at < UTC_TIMESTAMP() - INTERVAL ? HOUR`（`updated_at` 为 `TIMESTAMP`，与 UTC 比较 → 72h 实际退化为 80h）。

**检查点**：改任何 `INTERVAL` / 时间窗口查询前，先 `DESCRIBE` 确认列类型；评审清单逐条核对。

### 25.3.3 一个业务不变量 = 一个校验器，被所有写入口共用（R-12）

**规则**：同一业务不变量（枚举合法性、编号单调性、字段联动约束）MUST 由**一个校验器**实现，并被该字段的**全部**写入口调用。**禁止**在各写入口分别复制判断，也禁止只在一个入口校验。

**依据**：`sample_type` 的合法值只可能写在 4 处（`routes-samples.js:194`、`:313`、`scan-actions.js:85`、`:195`），当前 **4 处全缺**；同类：`card_version` 在 `routes-samples.js:313-316` 被 PUT 写入但**无单调性校验**，而新建路径有校验逻辑。

**检查点**：新增字段写入口时，先检索该字段的**全部**写入点，确认共用同一校验器。

### 25.3.4 多出口业务动作 MUST 把副作用收敛到单一列表驱动函数（R-13）

**规则**：一个业务动作若有多个出口（分支），其**副作用**（释放柜位、写日志、失效缓存、递增版次）MUST 由一个**列表/映射驱动的单一函数**统一施加；**禁止**在各分支内分别手写。MUST 补一条「全部出口动作名覆盖」断言测试。

**依据**：`subsystems/samples/backend/scan-actions.js:101-110` 定义 `releaseCabinet()`，`:242/249/285/300` 四个出口正确调用，而 `:269-277` 的 `FORCE_REASSIGN`（**第 5 个出口**）**漏调** → 柜位残留。同类先例：`card_version` 单调性只部分校验。

**检查点**：出口动作名集合可枚举（如 manifest 的 `transitions[].action`），断言「每个动作名都在副作用函数的映射表中出现」。

### 25.3.5 状态机动作 MUST 声明并断言 `to`（R-14）

**规则**：每个状态机动作 MUST 声明 `to`（目标状态），并 MUST 有断言验证「`to` 非空且可达」。**禁止**只校验 `from`。

**依据**：`shared/state-machine.js:14-18` 仅校验 `t.role.includes(role)` 与 `from`，`to` 未参与断言。当前 16 条转移与 `applyAction` 实际分支**零漂移**（本次评审已核），但漂移会静默通过。

**检查点**：断言「`transitions[]` 每项的 `to` 非空，且 ∈ `states`」——与 CLAUDE.md §15.3 的 manifest 校验清单互补（后者只要求人工自检）。

### 25.3.6 DAO 写语句 MUST 自带存活条件（P3-21）

**规则**：DAO 层**写语句**（`UPDATE`/`DELETE`）MUST 自带 `AND deleted_at IS NULL`（或等价的存活条件）。**禁止**把「只改存活行」的正确性外包给调用点。

**依据**：本次评审识别的系统性风险类别；正确性不应由调用方是否记得传条件决定。

### 25.3.7 `manifest.json` 是导航/状态机/表结构的单一事实来源，MUST 补全量漂移测试（R-21）

**规则**：`manifest.json` 的 `navigation`、`stateMachine`、`database.tables` 为单一事实来源；框架与各子系统 `router.js` MUST 从 manifest 派生，**禁止**各自硬编码等价列表。MUST 有全量漂移测试覆盖（视图名集合、状态集合、表集合、导航键集合**双向**比对）。

**依据**：`routes/subsystems.js:66` 只读 `manifest.navigation.length`；**4/5 个子系统的 `router.js` 硬编码自己的 NAV**，`subsystems/samples/frontend/js/router.js:2-12,21,27` 三处硬编码。已存在真实漂移：manifest 声明 `navigation[0].view = renderDashboard`，`router.js:21` 实际注册 `viewDashboard`；标签漂移（`new`：manifest「新建样品」vs router「新建样品+打印码」）。schema 层：`stateMachine.states` 在 samples 是**数组**、在 control/fixtures/projects 是**对象映射**；samples manifest 漏声明 `sample_seqs` 表；`sample_storage_cabinets` **根本不在 `schema.sql`**（由 `routes-storage-map.js:29-33` 内联 DDL 创建）。现有测试只抽查 `storagemap`/`report` 两个键，故漂移长期未被发现。

**检查点**：新增漂移测试；新增子系统/导航项时双向核对。

---

## 25.4 跨子系统边界

### 25.4.1 禁止跨子系统借用实现（R-3）

**规则**：子系统 MUST NOT 使用其它子系统提供的函数、DAO、常量或前端模块（含经 `db.js` 展平后通过 `D.<fn>` 访问的情形）。DAO 导出唯一性检查 MUST 用**运行期工厂展开**，**禁止**用 grep 代替。

**依据**：`subsystems/samples/db/dao.js` 的导出（`:169-173`）**不含** `fetchAll`/`fetchOne`（该文件内部定义 `fetchOne` 于 `:12-18` 但未导出），而 samples 在 4 处调用 `D.fetchAll(null, ...)`（`routes-storage-map.js:44,45`、`routes-checkout-users.js:17,20`）——真正提供者是 `subsystems/projects/db/dao.js:6,14`（五子系统中唯一导出者），违反 CLAUDE.md §15.5-3。**grep 不足的证据**：正则仅能匹配 171 个真实导出名中的 55 个。

**放大风险**：`db.js:106-108` 对 DAO 装载失败**仅 `console.error`、不阻断启动** → 提供方失效后，借用方只在运行期报错。

**顺序陷阱（必须先读再改）**：直接给借用方增加同名导出**不会生效**——`db.js:96-103` 检测到跨 DAO 同名导出后会重命名为 `<subsystem>_<fn>`，调用点仍解析到提供方版本，表现为「改了但无效果」。**MUST 三步独立提交**：① 抽共享实现 → ② 切换全部调用点 → ③ 回收提供方的重复导出。

### 25.4.2 修改共享代码前 MUST 先核对其真实使用方数量（R-22）

**规则**：修改 `shared/` 下任何文件前 MUST 先实测其引用数，并在变更说明中列出使用方清单。**禁止**在未确认使用方的情况下修改共享模块或删除其导出。

**依据**：`shared/file-manager.js`（2,332 字符）**全仓 0 引用 = 死代码**；`shared/frontend/shared/utils.js:7` 的 `formatFileSize` 在 samples bundle 内调用 **0** 次；`SOURCE_TYPES` 被构建注入 5 个 bundle 但 samples 内使用 **0** 次。反向情形同样存在：`control/backend/routes-files.js`（4,149 字符）与 `fixtures/backend/routes-files.js`（8,345 字符）**各自重造** multer+crypto 实现**同一套 4 端点形状**（行相似度 54%），都不用共享模块 → 「以为在复用、其实各写一套」。

### 25.4.3 跨子系统同名文件不等于共享代码（R-23）

**规则**：**禁止**依据文件名相同而合并/统一实现。判定是否为重复代码 MUST 以**实测行重合度**为依据。

**依据**：fixtures 与 samples **各有自己的** `views/list-filter.js`、`views/model-wall.js`、`views/scan.js`、`views/detail.js`，但行重合度仅 **2~4%**（`model-wall.js` 为 28%，最高）→ 强行「统一」将破坏两套独立设计。**反向教训**：`subsystems/samples/frontend/js/api.js:15` 静默**覆盖**了 `shared/frontend/api-base.js:87` 的 `statusBadge`（samples 版支持逾期高亮），而 fixtures/projects 仍用共享版 → 双系统行为在无人察觉处分叉，**差异应显式命名而非静默覆盖**。

---

## 25.5 容量与构建

### 25.5.1 容量判定 MUST 用权威口径，台账 MUST 脚本重算（R-4）

**规则**：
1. 容量判定与修改报告 MUST 用**权威口径**：`fs.readFileSync(p,'utf8').replace(/\r/g,'').length`（LF 归一**字符数**）；行数 = 换行符个数（末行换行不计）。
2. 台账数字 MUST 由脚本重算，**禁止手工誊写**；引用历史数字 MUST 标注其口径。
3. **禁止**用 `pwsh Get-Content`（CRLF 多计 + UTF-8 误码），**禁止**用 `wc -c` / `Buffer.length`（**字节数**，中文 3 字节会假性越线）。

**依据**：台账手工维护已致 **6 处偏差**：`AGENTS.md:378`/`CLAUDE.md:230` 记 `routes-samples.js` 为 **353 行/17,840 字符/89.2%**，实测 **344 行/17,528 字符/87.6%**——台账**跨在 90% 线两侧**；AGENTS §19.1 记 samples bundle 为 231,002 字符/37 文件，实测 **236,049 字符/38 文件**；`CLAUDE.md` 记 `scan-batch.js` 12,708、`scan-batch-result.js` 6,801/107 行，实测 12,715、6,866/108 行。**字节数陷阱实证**：服务器 `wc -c` 对 `routes-samples.js` 报 20,914「越红线」，权威口径实为 17,528（**未越线**）。

**检查点**：每次修改 MUST 用脚本输出「文件 / 字符数 / 行数 / 顶层函数数 / 占比 / 是否触发 70%-90%-红线」。

### 25.5.2 §7.2 的「单函数 ≤60 行」对 `register()` 不适用（R-15）

**规则**：路由注册函数 `register(app)` **豁免** 60 行限制（它是**注册表**——路由声明 + 内联处理器的集合，不是单一业务函数）；其余「顶层函数 ≤10 / 文件」「顶层 Class ≤3 / 文件」红线不变。内联处理器本身若含业务逻辑，MUST 外迁为独立函数。

**依据**：全仓 39 个 >60 行函数中 **20 个是 `register()`**（`fixtures/routes-fixtures.js` 350 行、`samples/routes-samples.js` 330 行、`projects/routes-tasks.js` 259 行）。已核实 `register()` 确为注册表：`routes-samples.js` 的 register = 9 条路由注册 + 9 个内联处理器，**最长连续非注册块仅 55 行**。规则不改则**结构性不可满足**，导致被系统性无视。

### 25.5.3 修改前端 JS 后 MUST 重建 bundle；版本号 SHOULD 为内容哈希（R-2）

**规则**：
1. 新增/删除/重命名/修改 `subsystems/*/frontend/js/` 下任何文件后 MUST 执行 `node tools/build-bundles.js` 并同步 `index.html` 版本号（§19.4 既有条文）。
2. 构建版本号 SHOULD 由**输入源文件集合的内容哈希**（`sha1(内容 + 顺序)`）派生，而非时间戳；MUST 有断言校验「bundle 首行哈希 == 源集合重算哈希」。

**依据**：§19.4 是 MUST 但**无任何自动机制能发现违反**——2026-09-17 评审期间即出现「改了源文件未重建」的提交（`167dfea` 改 `help-data.js` 未重建，由紧随的 `53ba135` 补上，生产未受影响）。版本号当前用 `'b'+Date.now().toString(36)`（`tools/build-bundles.js:10`）导致构建**非幂等**，且回写 `index.html`，无法用 `git diff --exit-code` 做 CI 校验；`.bundle-ver` 被 gitignore → 版本号无可追溯来源。

### 25.5.4 构建产物与测试文件的豁免边界（R-4 附则）

**规则**：`bundle.js` 为构建产物，**不适用** §7.1 单文件红线（§17.3 既有条文）；单元测试文件按 §7.1 豁免 1000 行。**但**：`bundle.js` 字符数仍 MUST 同步进 AGENTS §19.1 台账（**由脚本取值**），测试文件超过 1000 行时 MUST 拆分。

---

## 25.6 前端生命周期、字典与脚本护栏

### 25.6.1 SPA 视图 MUST 声明卸载协议（R-16）

**规则**：`VIEWS` 表每项 MUST 支持可选 `leave()`；**涉及全局副作用资源**的视图 MUST 实现 `leave()` 并在 `route()` 覆写 `#view` 前被调用。全局副作用资源包括：`getUserMedia`/`MediaStream`、`document` 级监听、`MutationObserver`、`requestAnimationFrame` 循环、在途请求。

**依据**：**根因同一个——SPA 有挂载点、没有卸载点**，四个实例：① `views/scan-camera.js:18-26` 摄像头 + 无界 rAF，`stopCamera()` 仅在检测成功时触发（`:23`），切页后**指示灯常亮**；② `views/print-queue.js:75-77` 对 `#view` 建 `MutationObserver`，永久存活；③ `shared/frontend/shared/utils.js:46-71` 的 `_initColResize` 在初始化时按每个含 `.col-rsz` 的表头各注册 `document.addEventListener('mousemove'/'mouseup')`（`:60,65`），全文件 **`removeEventListener` 0 次** → 样品列表 12 列即每次渲染永久 +24 个监听器，闭包还持有 `cols`/`ths` 导致旧表格 DOM 无法回收；④ `views/dashboard.js:52-73`、`views/report.js:62-105` 在 `await` 后写已卸载 DOM。正确实现散落在个别文件（`checkout-user-picker.js:32-37`、`storage-loc-picker.js:26-31` 手动 remove-before-add；`chain.js:47-48` 手动判断 Tab 是否切走），全靠自觉。

**检查点**：断言「引用 `getUserMedia`/`MutationObserver`/`addEventListener('mousemove'` 的视图 MUST 登记 `leave`」。

### 25.6.2 状态/字典的中文名与颜色 MUST 只有一处来源（R-17）

**规则**：状态、来源类型、限制项目的 `value → 中文名 / 颜色` 映射 MUST 只存在于 `shared/frontend/api-base.js`（扩展 `STATUS_CN` / `STATUS_COLOR`）；视图内 MUST NOT 新建映射字面量。**禁止**为同一状态定义两套颜色或两套文案。

**依据**：状态映射共 **9 份副本**（`api-base.js:7`、`list-status-bar.js:13,15,17`、`list-filter.js:27`、`list-filter.js:67`、`dashboard.js:25-34`、`dashboard.js:46-49`、`report.js:14-22`、`storage-map.js:112-113`，另有 `model-wall.js:57`/`scan.js:3`/`scan-batch.js:17`），并已产生 **4 处真实分歧**：`NEW` 文案「新建·待制作确认」（`api-base.js:9`）vs「新建·待制作」（`dashboard.js:47`）；保管/领用/制作在 `storage-map.js:112-113` 作「在柜/被领走/已制作」而其余为「保管中/领用中/制作完成」；`RELEASED` 颜色 `var(--ok)` 绿（`dashboard.js:29`）vs `#ca8a04` 琥珀（`report.js:17`）——**绿色在该系统其余位置语义为「正常/OK」**，属正确性风险而非风格问题。来源类型 4 处硬编码 2 种写法（`list.js:36`/`new.js:13`/`detail-card.js:23` 写「塔岗(G)」，`card-fields.js:51` 写「元将五金塔岗分厂(G)」），而权威字典 `SOURCE_TYPES` 使用 0 次。

**检查点**：断言 `views/*.js` 不出现含 ≥3 个状态键的对象字面量。

### 25.6.3 跨文件全局符号唯一性 + 声明顺序契约（R-18）

**规则**：
1. 单 bundle 内所有源文件共享**同一 classic-script 全局作用域**，故跨文件**同名顶层声明 MUST 只出现在显式白名单**中，且每处 MUST 注明覆盖意图。
2. 共享常量（`LIMIT_ITEMS`/`SOURCE_TYPES`/`DEPTS`/`STATIONS` 等）的声明文件 MUST 位于其**全部消费者**的清单序号之前，并 MUST 有顺序断言测试。
3. **顶层隐式全局赋值同样计入 §7.2 顶层函数计数**（禁止用隐式赋值规避计数）。

**依据**：`var me` 在 `shared/frontend/api-base.js:116` 与 `subsystems/samples/frontend/js/api.js:2` **同作用域重复声明**（第二次赋值把 `me` 重置为 `null`），**当前未爆仅因 `boot()` 在 bundle 末尾执行**——任何清单顺序调整即导致鉴权/角色判断全部失效；`statusBadge` 被静默覆盖（见 §25.4.3）；`js/api.js:59` 写作 `api=async function(...)`（**无 `var`/`function`**），`:58` 注释自陈「**不新增顶层函数**（本文件顶层函数已达 §7.2 上限 10 个）」——**用隐式赋值规避静态计数**；`js/constants.js:5` 的顶层 `const el` 是同类地雷（任何文件日后新增顶层 `var el` 直接 `SyntaxError` 白屏）。

### 25.6.4 `subsystems/*/frontend/**` MUST 被 ESLint 覆盖（R-19）

**规则**：ESLint 配置 MUST 为 `subsystems/*/frontend/**` 增加 `"env": {"browser": true}` override，并开启 `no-redeclare` + `no-implicit-globals`。**禁止**让前端源码落在 lint 覆盖之外。

**依据**：`.eslintrc.json` 仅 `"env": {"node": true, ...}` + `"no-undef": "error"`，且无 `.eslintignore` → 浏览器全局（`window`/`document`/`localStorage` 等）在 `env.node` 下是未定义标识符，对前端跑 `npm run lint` 会产生**上千条 `no-undef`**，等于**前端实际未被 lint 覆盖**。这正是 §25.6.3 类问题（隐式全局、重复声明、死变量）长期存留的根本原因。**本卷中投入产出比最高的一条。**

**检查点**：`no-implicit-globals` 可精确捕获 `api` 这类顶层隐式赋值。

### 25.6.5 破坏性脚本 MUST 在函数入口护栏、读 manifest、fail-closed（R-5）

**规则**：含 `DELETE`/`TRUNCATE`/`DROP`/`ALTER` 的 seed 或清理脚本，其护栏调用 MUST 位于**函数入口**（行号早于首个破坏性语句），MUST 读 `manifest.json` 判定 `deployed`，判定失败 MUST **fail-closed**（拒绝执行）。

**依据**：条文早已存在于 §20.2.5，且根 `seed-samples.js:11-16` **确有护栏**（npm 路径安全）；但 `subsystems/samples/seed/seed.js` 无 in-file 护栏即执行 `:35-40` 的 `DELETE` + 3× `ALTER TABLE ... AUTO_INCREMENT = 1`（`:11` 注释却声称「护栏拒绝执行」）。对照**正例**：`subsystems/fixtures/seed/seed.js:10` 的 `assertSeedAllowed` 位于 `:29` 首个 DELETE **之前**。2026-09-10 fixtures 数据被清空的根因即「护栏不在入口」。当前 samples 的插件协议路径（`backend/index.js:39-43`）虽可绕过护栏，但 `server.js` 对 `initDB`/`seed` 引用数为 **0**，该路径**当前不可达**（latent）。

**检查点**：断言「含破坏性语句的 `seed/*.js` 中，护栏调用行号 < 首个破坏性语句行号」。

### 25.6.6 新增子系统 MUST 经模板生成；共享代码变更前核对使用方（R-20）

**规则**：新增子系统 MUST 经 `tools/subsystem-templates.js` / `tools/create-subsystem.js` 生成，**禁止**手工复制既有子系统目录。

**依据**：5 个子系统 `index.html` 行相似度 72~89%，差异为语义性；**7 个演示账号硬编码在全部 5 个 `index.html` 中（35 行字面凭据，改一次密码需改 5 处）**；`manifest.json` schema 已漂移（见 §25.3.7）。模板已存在（11,899 字符）但未被确立为唯一入口。

---

## 25.7 规则落地状态与优先级

### 25.7.1 当前强制执行状态

| 状态 | 规则 | 说明 |
|---|---|---|
| **已有自动检查点** | §25.6.4（lint，**待补 override**）、§25.2.4（部分，`tests/csv.test.js` 存在但未覆盖公式护栏） | 需补齐断言 |
| **仅有条文、无检查点** | §25.2.1、§25.2.2、§25.2.3、§25.4.1、§25.4.2、§25.5.1、§25.5.3、§25.6.1、§25.6.2、§25.6.3、§25.6.5 | **优先补检查点**——这些规则已有正确样板却仍被违反，属遗漏传播 |
| **需修改既有条文** | §25.5.2（为 `register()` 补豁免口径） | 不改则规则被系统性无视 |

### 25.7.2 落地优先级建议

1. **§25.6.4 前端 lint 覆盖** —— 一次性暴露 §25.6.3 的隐式全局/重复声明/死变量，投入最小。
2. **§25.2.3 错误文案不回显** + **§25.6.2 字典单一来源** —— 「已有正确样板、只在部分路径落地」型，成组清理可根治。
3. **§25.2.2 `e()` 转义与标签函数兜底** + **§25.2.1 枚举白名单** —— 直接关闭两个存储型 XSS 的根因类别。
4. **§25.5.3 构建内容哈希** + **§25.5.1 台账脚本重算** —— 把「君子协定」变为可执行约束。
5. **§25.6.1 视图卸载协议** + **§25.3.7 manifest 全量漂移测试** —— 结构性整改，一次协议化关闭多类问题。
6. **§25.5.2 §7.2 豁免口径** —— 其余容量规则的前提。

### 25.7.3 预算约束（MUST）

`AGENTS.md` 的唯一硬约束是 **AI 上下文注入预算 65,536 字节**（超出即静默截断，截掉文件尾部）。2026-09-17 实测 47,538 字节、余量 17,998 字节；**每次改动 MUST 重测**（`(Get-Item AGENTS.md).Length` 或 node `fs.statSync().size`）。余量低于 5,000 字节时，按本卷同一模式继续外迁（保留原编号 + 摘要 + 指针）。

---

> 本卷为 AGENTS.md §25 的正文载体，修改本卷或 AGENTS.md §25 摘要均需用户明确同意（§14.6）。
