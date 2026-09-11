# 样品子系统 P0/P1 缺陷修复设计（含打印流程）

- 日期：2026-09-01
- 范围：`subsystems/samples`（含必要的共享层联动）
- 依据：2026-08-31 四维度只读审计（后端与状态机 / 前端交互 / 安全权限 / 业务流程）+ 打印流程专项审计（curl 实测）
- 状态：设计待评审

---

## 1. 背景

样品子系统已上线（`deployed:true`）。审计确认其处于「只建样、不流转」状态（60 个样品中 57 个积压 NEW，发行后动作日志 0 条），以下核心缺陷尚未在生产数据中引爆，但流转放量后必然爆发：

| 缺陷 | 位置 | 后果 |
|---|---|---|
| 复检死锁 | `routes-scan.js:19` INSPECT 仅允许 RELEASED；逾期判定 `dao.js:128` 查的是 IN_CUSTODY | 样品入库后 QA 无任何可执行动作，逾期样品无合规出口 |
| 无并发 CAS | `dao.js:114` updateSample 全行覆盖写，无 version/状态条件 | 双人同扫可双重流转、字段互丢 |
| 打印触发断裂 | `scan-camera.js:86-91` 无手势 window.open 被拦截；`print-queue.js:14-18` 批量只打第一张；`routes-scan.js:227` printCard 不含 INSPECT | 实物标示卡与系统数据系统性脱节 |
| 发行向导张冠李戴 | `scan.js:117` code 实时读输入框，标示卡数据来自 wizardSample | A 的周期/标示卡可发行到 B 样品 |
| 指派可卡死 | `routes-scan.js:182-189` 不校验目标有效性；ADMIN 扫码零权限 | RD 离职 → RETURNING 永久卡死 |

设计原则：**已上线子系统，所有改动向后兼容；schema 变更仅做新增列；不改 API 既有出入参语义**。

## 2. 目标 / 非目标

**目标**：修复 P0 四项 + P1 八项（见 §4 批次划分），使「建样→制作→发行→保管→复检→退回/替代」全链路闭环可用、并发安全、打印可靠。
**非目标**（明确不做）：
- 种子账号强制改密/停用（用户决策暂缓，另立安全专项）
- `/card` 限流与 token 化 URL、静态服务收敛（属安全专项，涉及 server.js 框架层，单独评审）
- workbench 阈值口径调整（近期 cfae44a 已处理）
- CSV 公式注入修复（`shared/csv.js` 共享层，需全子系统回归，列入安全专项）

## 3. 方案选型记录

| 议题 | 选项 | 决策 |
|---|---|---|
| 复检通路 | A. 新增 IN_CUSTODY→IN_CUSTODY 复检转移；B. 改文档承认"复检=退回+重新发行" | **A**（与 README/操作手册一致，改动集中） |
| 并发防护 | A. version 乐观锁；B. SELECT ... FOR UPDATE 悲观锁 | **A**（与 projects 子系统既有模式一致，无锁竞争） |
| 删除与编号 | A. 软删除 + 编号不复用；B. 物理删除 + 日志归档 | **A**（杜绝旧 QR 指向新样品） |
| 批量打印 | A. 单页多 id 服务端渲染 + @page 分页；B. 检测 window.open 返回值逐个重试 | **A**（一次用户手势一次打印，根治拦截） |
| 弹窗拦截 | A. 手势内先开占位页再改 location；B. 仅提供重打按钮 | **A 为主 + B 兜底**（成功提示条常驻「重新打印」按钮） |

## 4. 批次划分

**批次 1（P0 包，同一代码区一次回归）**：P0-1 复检通路、P0-2 并发 CAS、P0-3 向导校验 + XSS、P1-4 字段清理、P1-5 版次校验、P-H3 复检触发重打（并入 P0-1）。
**批次 2（P1 包）**：P1-1 指派校验 + ADMIN 兜底、P1-2 软删除、P1-3 照片留痕、P1-6 manifest 唯一真相源、P1-7 打印触发重构、P1-8 打印显示一致性。

---

## 5. 批次 1 详细设计

### 5.1 P0-1 复检通路（含 P-H3 复检触发重打、P1-4 字段清理联动）

**状态机变更（manifest.json）**：

```
新增转移：{ from: IN_CUSTODY, to: IN_CUSTODY, action: INSPECT_CUSTODY,
           role: ["QA"], label: "到期复检" }
```

**后端（routes-scan.js）**：
1. `allowedActions` 增加 QA + IN_CUSTODY 分支，返回 `INSPECT_CUSTODY`（宽限窗口：到期前 7 天起可复检，窗口常量定义于文件顶部注释说明）
2. 处理器逻辑：
   - 上传复检照片（文件名带时间戳，见 P1-3 机制先行落地于本 action）
   - 周期：前端表单可输入，默认沿用 `s.release_cycle_days`；非法值（非正数）返回 400，**取消静默兜底 90 天**；周期上限 3650 天（堵「永久免检」漏洞）
   - `next_inspect_at = NOW + cycle 天`；`valid_until` 同步顺延
   - 版次按 label-card-standard §2.5 **自动 +1**（`nextCardVersion`，上限 99）；同时修订 operation-manual §5.4 的矛盾表述，以标准化规则文档为准
   - `printCard` 判定纳入 `INSPECT_CUSTODY`：复检后必弹/必提示重打（有效期必然变化）
   - 同事务写 scan_logs（含旧/新版次、周期、复检结论）
3. `RETURN_REJECT` 联动：回到 IN_CUSTODY 时 `next_inspect_at += 审核消耗天数`（RETURN_REQUEST 至 RETURN_REJECT 的间隔），消除「回保管即再逾期」死循环
4. `RE_RELEASE` 清理：`custody_dept`、`storage_location` 置 NULL（重新走保管接收）；`RETIRE_ONLY` 清理 `retire_assigned_rd`

**前端（scan.js / scan-wizard.js）**：
- QA 扫 IN_CUSTODY 且合法时显示复检表单（照片上传 + 周期输入默认沿用 + 结论）
- 扫码成功提示条增加常驻「🖨 重新打印标示卡」按钮（链接 `card/print`，用户手势内点击，兼作 H1 拦截的兜底）

**文档同步**：README 扫码台表格补 INSPECT_CUSTODY 行、operation-manual §5.4（版次与周期表述拉齐）、label-card-standard（如条款需澄清）。

### 5.2 P0-2 并发 CAS（version 乐观锁）

1. **迁移**（`db/migrations.js`，幂等）：`ALTER TABLE samples ADD COLUMN version INT NOT NULL DEFAULT 1`。新增列向后兼容：旧 UPDATE 不带 version 条件仍可执行。
2. **dao.js**：`updateSample(id, fields, expectedVersion)` → `SET ..., version=version+1 WHERE id=? AND version=?`；affectedRows=0 抛 `CONFLICT`。
3. **routes-scan.js**：所有 action 处理器携带读到的 `s.version` 调用更新；CONFLICT → `409 {error:"该样品刚被他人操作，请刷新后重试"}`。
4. **routes-samples.js**：PUT 更新样品同样走 version 条件（前端编辑时携带读到的 version）。
5. **前端**：
   - 统一 `withSubmitLock(fn)` helper：执行期禁用按钮 + 加载态（替换 new.js 孤立的 `_nSubmitting`，推广至 confirmScan 及全部表单提交）
   - 409 → toast 提示 + 自动刷新当前样品
   - 列表/看板请求加响应序号，只接受最后一次响应（防乱序覆盖）

### 5.3 P0-3 发行向导一致性 + 列表 XSS

- `scan-wizard.js` Step3 编号输入框 readonly；`confirmScan` 的 `code` 取 `wizardSample.sample_no`；提交前兜底比对，不一致 → 报错中止。
- `list-filter.js:54-55`：`renderChips` 的 `st`/`dept` 统一 `e()` 转义；顺带修复 `models.js` `m.code` 拼 onclick 未转义同类问题。
- 前端改动后 **MUST 重建 bundle**（`node tools/build-bundles.js` + 复制 + 更新版本号，§19）。

---

## 6. 批次 2 详细设计

### 6.1 P1-1 指派校验 + ADMIN 兜底

- `RETIRE_RECREATE`：服务端校验指派目标存在 + `role='RD'` + `enabled=1`，否则 400。
- `db/users.js`：新增 `listActiveRdUsers()`（`AND enabled=1`），**不改原 `listRdUsers()` 签名**（先全局 grep 调用方确认，共享层兼容改造原则）。
- manifest 新增转移（ADMIN 兜底）：
  ```
  RETURNING →(FORCE_REASSIGN, ADMIN)→ RETURNING   // 强制改派 RD
  RETURNING →(FORCE_RETIRE, ADMIN)→ RETIRED       // 强制作废
  ```
  前端二次确认弹窗，防误操作。
- RETURNING 停留 > 3 天进入 QA/ADMIN 待办并看板高亮（口径对齐 workbench 积压逻辑）。

### 6.2 P1-2 软删除 + 编号占位

1. 迁移：`ALTER TABLE samples ADD COLUMN deleted_at TIMESTAMP NULL DEFAULT NULL`。
2. `deleteSample` → `UPDATE samples SET deleted_at=UTC_TIMESTAMP()`，**不再删 scan_logs**；事务包裹。
3. **全链路排查（§12）**：所有查询补 `WHERE deleted_at IS NULL`——dao.js 全部 list/get/overdue/todo/export、workbench 聚合 SQL（跨子系统只读依赖）、匿名 `/card/:sample_no`。
4. 匿名卡对已删除样品返回统一 404（不区分「不存在/已删除」，避免枚举 oracle 差异）。
5. `sample-code.js`：取号不再复用任何已分配编号（含软删占用），接受序号空档；同步修订 sample-code-encoding.md §3「最小空档复用」描述。

### 6.3 P1-3 照片历史留痕 + 上传魔数校验

- 复检/制作照片文件名：`{sample_no}_insp_{YYYYMMDD-HHmmss}.{ext}`（制作照片 `_prod_` 同理）；`inspect_image`/`produce_image` 指向最新。
- 详情弹窗「大图」Tab 增加历史照片列表（按时间倒序，读取 uploads 目录该编号前缀文件）。
- `saveSampleImage` 增加 magic bytes 校验（jpg/png/gif/webp 文件头），不信任 data URL 声明的 MIME。

### 6.4 P1-6 状态机唯一真相源

- `routes-scan.js` 的 `allowedActions` 改为从 manifest `transitions` 派生（启用目前闲置的 `shared/state-machine.js`）。
- manifest 补声明遗漏 action（`INSPECT_EARLY`、`EDIT_CARD`、`EDIT_STORAGE` 等自环转移）。
- 先 grep 确认 fixtures 是否使用 `shared/state-machine.js`：若未使用，改造闭环在 samples 内；仍按 §6.1 做 fixtures 扫码台冒烟回归。

### 6.5 P1-7 打印触发重构

1. **占位页模式**：所有「操作成功后自动打印」链路（confirmScan、新建样品 openPrintLabel）改为——用户手势内同步 `window.open('about:blank')` 占位，异步完成后 `占位页.location = 打印URL`；占位失败（被拦）→ toast + 「重新打印」按钮。
2. **批量打印合并单页**：新增 `GET /api/samples/cards/print?ids=1,2,3&size=…`（requireAuth，上限 50 个），服务端渲染多卡一页，`@page` 分页，一次 `window.print`；`printAllCards` 改为打开该单页。
3. **打印队列**：入队按样品 id 去重；localStorage 持久化；扫码视图每次渲染时恢复 `renderPrintQueue()`。

### 6.6 P1-8 打印显示一致性

1. **有效期口径统一**：三处显示（打印卡/匿名页/详情页）统一 `YYYY-MM-DD`；`valid_until`/`next_inspect_at` 按 UTC 日期格式化（前后端共用同一格式化逻辑）；文档写明「按自然日口径」。
2. 匿名 `/card` 页日志去掉 role/dept（仅动作+时间，合规 §六.4）。
3. `card-print-html.js` 纸张尺寸 mm 直出，取消 mm→px→mm 往返换算。
4. 修正 `card-html.js` 自定义缺高回退逻辑与注释矛盾（缺高按等比计算，激活现死代码分支）；constants.js 过期注释、help-data.js 尺寸副本改引用说明。

---

## 7. 全链路关联依赖清单（5 维度）

| 维度 | 关联项 |
|---|---|
| 代码 | samples backend(routes-scan/routes-samples/routes-cards/dao/sample-code)、frontend(scan*/list*/detail/print-queue/card-fields)、db/users.js、db/migrations.js、shared/state-machine.js、shared/frontend（新增 withSubmitLock 位置待定） |
| SQL | samples 表新增 version/deleted_at 两列（幂等迁移）；全部 samples 查询补 deleted_at 过滤；workbench 聚合 SQL 同步 |
| 配置 | 无环境变量变更；manifest.json transitions 新增 3 条（INSPECT_CUSTODY/FORCE_REASSIGN/FORCE_RETIRE） |
| 接口 | 新增 `GET /api/samples/cards/print`（批量）；既有接口出入参不变；新增 409 错误码语义 |
| 文档 | README（扫码台表格/状态机/API 表）、operation-manual §5.4、label-card-standard、sample-code-encoding §3、AGENTS.md §14 技术债更新 |

## 8. 兼容性影响

- 新增列（version/deleted_at）向后兼容，无需回填；旧客户端不感知。
- 软删除改变 DELETE 语义（不再物理删日志）——属有意行为变更，README「全量留痕」表述自此成立。
- 编号不复用：接受序号空档；不影响既有编号。
- 409 为新增响应码，前端统一兜底；第三方无对接。

## 9. 回归验证计划

- **单测**：CAS 冲突（并发双扫模拟）、INSPECT_CUSTODY 窗口边界、版次校验、软删除过滤、批量打印 ids 上限。（注：samples 已上线，`tests/` 写入类用例受 `tests/helpers/deployed.js` 护栏约束，写入验证使用独立测试库）
- **E2E**：test_flow.js 扩展——完整走一遍 NEW→…→IN_CUSTODY→INSPECT_CUSTODY→RETURNING→RECREATE（独立测试库）。
- **跨子系统回归**（涉共享层时）：fixtures 扫码台冒烟、workbench 列表/统计口径、portal 门户卡片。
- **打印实测**：Chrome/Edge 实机验证占位页链路、批量单页分页、三档预设 + 自定义尺寸边界。
- **浏览器自动化**：browser_use 走扫码→发行→打印链路。

## 10. 部署与回滚

- 部署：迁移幂等随服务启动执行；**重启由运维走宝塔面板**（§23，AI 不执行）；前端 bundle 重建 + 版本号更新。
- 回滚：代码 git revert；新增列保留无害（回滚后旧代码忽略之）；无需数据回滚。

## 11. 上线后监控（1~3 周期）

- 关注 scan_logs 中 INSPECT_CUSTODY 使用率与 409 冲突频次；
- 打印重打按钮点击率（若高，说明自动打印链路仍有问题）；
- RETURNING 停留时长分布；
- 看板逾期数量下降趋势。
