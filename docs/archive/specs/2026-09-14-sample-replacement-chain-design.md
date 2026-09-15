# 样品替代链视图 — 设计文档

- 日期：2026-09-14
- 状态：**待用户确认**（确认后进入实施）
- 迭代：批次 6（替代链视图）
- 依据规范：CLAUDE.md §2.1 / §5 / §7 / §11、AGENTS.md §5-6 / §7.1 / §12 / §17 / §20 / §23
- 影响子系统：`samples`（已上线 `deployed:true`，§20 保护规则生效）

---

## 1. 需求

用户诉求（2026-09-14）：*「在样品系统中已经作废被替代的，如何查看替代链？比如 G-BD7620-A-058-01」*。

已由用户拍板的范围：

1. **只做替代链视图**（不做列表替代列、不做独立报表、不动既有替代流程）。
2. **采用方案 B**：后端新增一个只读链查询接口（递归 CTE 一次返回整链）+ 前端视图。

## 2. 现状与缺口（实测证据）

### 2.1 数据层：完整，无需补救

| 检查项 | 实测结果 | 证据 |
|---|---|---|
| 字段存在 | 生产库 `samples.replaces` / `samples.replaced_by`，均 `varchar(20)` | `subsystems/samples/db/schema.sql:46-47` |
| 成对写入 | 唯一写入点＝`RECREATE` 动作的 4 步写事务 | `subsystems/samples/backend/scan-actions.js:265-282` |
| 写入明细 | 新样品 INSERT 带 `replaces=老编号`；老样品 UPDATE 为 `RETIRED` + `replaced_by=新编号`；双留痕 `RECREATE_REPLACED` / `CREATE` | `subsystems/samples/db/dao.js:37,46`（INSERT 列）、`dao.js:84-85`（UPDATE 列含两字段）、`scan-actions.js:273,276,278-279` |

### 2.2 界面层：完全没有替代链视图（本次要补的缺口）

| 检查项 | 实测结果 | 证据 |
|---|---|---|
| bundle 是否渲染 | `replaced_by` **0 命中**、`replaces` **0 命中**、`替代链` 0 命中 | `subsystems/samples/frontend/js/bundle.js` |
| 视图源文件是否渲染 | 全部 view 文件 0 命中 | `subsystems/samples/frontend/js/views/*.js` |
| 详情弹窗为何看不到 | 逐字段手写 `kv()`，非动态遍历对象；仅展示 `已作废` + `retired_reason` | `frontend/js/views/detail.js:106`、`detail.js:138-139` |
| 列表页 | 12 列无替代字段 | `frontend/js/views/list-render.js:6` |
| 日志行可否跳转 | 不可；仅显示 action 中文 + note 文本 | `frontend/js/views/detail.js:190`、`shared/frontend/api-base.js:23` |
| 已有小瑕疵 | `_LOG_FLOW` 缺 `RECREATE_REPLACED` 键 → 该行无流向标签 | `frontend/js/views/detail.js:167-181` |

### 2.3 真实链路（2026-09-14 生产库只读核对）

| 节点 | id | 编号 | 状态 | replaces | replaced_by |
|---|---|---|---|---|---|
| 链首 | 65 | `G-BD7620-A-058-01` | RETIRED | NULL | `G-BD7620-A-061-01` |
| 链尾 | 122 | `G-BD7620-A-061-01` | PRODUCED | `G-BD7620-A-058-01` | NULL |

- 序号由 `058` 跳到 `061`：替代品取下一条最小可用流水号，`059`/`060` 已被在库样品占用（id 66、67）。
- 全库共 **26 组**替代关系（52 行），全部集中在机型 BD7620，替代品 id 为 122–147 连号。

## 3. 全链路关联依赖清单（5 维度）

### 3.1 代码层

| 文件 | 角色 | 现状容量 | 本次改动 |
|---|---|---|---|
| `subsystems/samples/db/dao-list.js` | 查询域 DAO（列表/计数/预警/机型墙聚合） | 142 行 / 10,083 字符（50.4%） | 新增 1 个内层函数 `listSampleChain`（无新增文件级函数） |
| `subsystems/samples/backend/routes-chain.js` | **新建** 只读链路由 | — | 新建，约 60 行 |
| `subsystems/samples/backend/index.js` | 子系统路由注册 | 48 行 / 1,359 字符（6.8%） | +1 行 `require('./routes-chain').register(app)` |
| `subsystems/samples/frontend/js/views/chain.js` | **新建** 链视图渲染 | — | 新建，约 70 行 |
| `subsystems/samples/frontend/js/views/detail.js` | 详情弹窗 Tab 装配 | 246 行 / 13,434 字符（67.2%） | **仅 +2 行**（Tab 项 + 分发），不新增文件级函数 |
| `tools/bundle-sources.json` | bundle 文件顺序（单一事实来源） | 127 行 / 6,124 字符（30.6%） | samples 数组 +1 条目 |
| `subsystems/samples/frontend/css/module.css` | 子系统样式 | 156 行 / 10,804 字符（54.0%） | 追加 `.sm-chain*` 规则 |

**不触碰**：`routes-samples.js`（89.2%，已越 70% 预警线，按 §7.1 禁止追加）、`dao.js`（无需改动，`dao-list.js` 由其第 160-166 行合并导出）、`app.css`（109.6% 已超红线且属共享样式）、`manifest.json`、`router.js`、`list-render.js`。

### 3.2 数据库层

- **零 DDL、零迁移、零写入**：只读 `SELECT`（`samples` 单表自连接）。
- 无新表、无新索引、无字段变更 → 不触发 §12 的字段变更规则。

### 3.3 配置层

无环境变量、无依赖新增（`package.json` 不变）。

### 3.4 接口层

- 新增 `GET /api/samples/:id/chain`（登录即可）。
- 无既有接口出入参变更 → 向后兼容。

### 3.5 文档层

| 文档 | 同步内容 |
|---|---|
| `README.md` | API 表追加一行（见 §7 容量约束：**须等量精简**） |
| `docs/role-permission-matrix.md` | §二 样品管理 追加接口权限行 |
| `docs/样品系统操作说明.md` | 新增 §7.9「替代链查看」 |
| `docs/operation-manual.md` | §5.10 补「如何查看替代链」 |
| `docs/label-card-standard.md` | 无需改（不涉及标签/标示卡） |
| 本文档 + 实施计划 | 部署后归档至 `docs/archive/` |

### 3.6 受影响业务场景清单

| 场景 | 影响 |
|---|---|
| 样品查看详情 | 链上样品多一个 Tab（其余样品无变化） |
| 样品列表 / 看板 / 扫码台 / 柜位视图 / 机型视图 | **无影响** |
| 治具、管制、项目、工作台子系统 | **无影响**（不触碰共享文件，无 §6.1 双系统回归要求） |
| 替代（RECREATE）写流程 | **无影响**（只读接口） |

## 4. 设计目标与非目标

**目标**

1. 从任一链上样品出发，一次请求即可看到完整替代链（链首 → 链尾）。
2. 链上每个节点可点击跳转到该样品的详情弹窗。
3. 与既有 UI 体系一致（Fluent 徽标、`module.css` 子系统样式、断点约定）。
4. 不改动任何写入路径、不新增表、不新增依赖。

**非目标**

1. 不做独立导航页/独立子系统（会引入 manifest + router 改动）。
2. 不在列表页增列。
3. 不做替代链的编辑/修复能力（数据异常只呈现，不修改）。
4. 不做链的可视化图形（有向图/时间轴图），仅垂直链式列表。

## 5. 方案设计

### 5.1 接口契约

```
GET /api/samples/:id/chain       权限：登录（requireAuth）
```

**成功 200**

```json
{
  "current": { "id": 65, "sample_no": "G-BD7620-A-058-01" },
  "length": 2,
  "truncated": false,
  "chain": [
    { "ord": 0, "id": 65,  "sample_no": "G-BD7620-A-058-01", "status": "RETIRED",
      "isCurrent": true,  "soft_deleted": false,
      "created_at": "2026-08-24 10:49:41", "released_at": "2026-09-10 14:45:12",
      "retired_reason": "修正样品标准范围数值",
      "next_inspect_at": null, "expected_return_at": null,
      "replaces": null, "replaced_by": "G-BD7620-A-061-01" },
    { "ord": 1, "id": 122, "sample_no": "G-BD7620-A-061-01", "status": "PRODUCED",
      "isCurrent": false, "soft_deleted": false,
      "created_at": "2026-09-14 15:15:03", "released_at": null,
      "retired_reason": null,
      "next_inspect_at": null, "expected_return_at": null,
      "replaces": "G-BD7620-A-058-01", "replaced_by": null }
  ]
}
```

**错误**

| 状态码 | 响应 | 触发 |
|---|---|---|
| 404 | `{ "error": "样品不存在" }` | id 不存在或已软删（文案与 `GET /api/samples/:id` 一致） |
| 401 | 由 `requireAuth` 统一处理 | 未登录 |

**语义约定**

- `chain` **按 `ord` 升序**：`ord` 负数 = 更早（链首方向），`0` = 当前样品，正数 = 更新（链尾方向）。
- `length = chain.length`；`truncated = true` 表示达到深度上限（20 节）被截断。
- 链长恒 ≥ 1；仅当样品同时无 `replaces` 与无 `replaced_by` 时 `length === 1`。

### 5.2 数据访问（`subsystems/samples/db/dao-list.js`）

新增内层函数 `listSampleChain(sampleNo)`（**无新增文件级函数**，函数名经 5 个子系统 `dao.js` 全局检索确认唯一）。实现二选一，推荐 (a)：

**(a) 双向递归 CTE + 单次查询**（推荐，全部在 SQL 内定序，无 JS 归并逻辑）

```sql
WITH RECURSIVE
newer AS (            -- 沿 replaces 前进：谁替代了我
  SELECT s.id, s.sample_no, s.status, s.created_at, s.released_at, s.retired_reason,
         s.replaces, s.replaced_by, s.next_inspect_at, s.expected_return_at, s.deleted_at,
         1 AS ord, 1 AS d
  FROM samples s WHERE s.replaces = ?
  UNION ALL
  SELECT s.id, s.sample_no, s.status, s.created_at, s.released_at, s.retired_reason,
         s.replaces, s.replaced_by, s.next_inspect_at, s.expected_return_at, s.deleted_at,
         n.ord + 1, n.d + 1
  FROM samples s JOIN newer n ON s.replaces = n.sample_no
  WHERE n.d < 20
),
older AS (            -- 沿 replaced_by 回溯：我替代了谁
  SELECT s.id, s.sample_no, s.status, s.created_at, s.released_at, s.retired_reason,
         s.replaces, s.replaced_by, s.next_inspect_at, s.expected_return_at, s.deleted_at,
         -1 AS ord, 1 AS d
  FROM samples s WHERE s.replaced_by = ?
  UNION ALL
  SELECT s.id, s.sample_no, s.status, s.created_at, s.released_at, s.retired_reason,
         s.replaces, s.replaced_by, s.next_inspect_at, s.expected_return_at, s.deleted_at,
         o.ord - 1, o.d + 1
  FROM samples s JOIN older o ON s.replaced_by = o.sample_no
  WHERE o.d < 20
),
origin AS (
  SELECT id, sample_no, status, created_at, released_at, retired_reason,
         replaces, replaced_by, next_inspect_at, expected_return_at, deleted_at, 0 AS ord
  FROM samples WHERE sample_no = ? AND deleted_at IS NULL LIMIT 1
)
SELECT * FROM older UNION ALL SELECT * FROM origin UNION ALL SELECT * FROM newer ORDER BY ord;
```

**(b) 两条方向查询 + JS 归并**：可读性更好但需要 JS 归并代码与对应单测，代码量更大。

**边界与安全**

| 边界 | 处置 |
|---|---|
| 无替代关系 | 两个方向 CTE 均为空 → 仅返回 `origin` 一条 |
| 深度上限 | 两个 CTE 均以 `d < 20` 收敛（防脏数据成环导致 MySQL `cte_max_recursion_depth` 报错） |
| 截断标记 | 路由层 `truncated = chain.length > 20` |
| 软删节点 | 递归步骤**不过滤** `deleted_at`（替代链是历史事实，不因软删断链）；输出 `soft_deleted` 标记供 UI 呈现 |
| 编号复用风险 | 递归连接列是 `replaces` / `replaced_by`（仅由 `RECREATE` 成对写入），非 `sample_no` 等值匹配，故「已取消 NEW 编号被复用」不会产生伪链；已知残留边界见 §9-R3 |
| 空入参 | `sampleNo` 为空直接 `Promise.resolve([])`，不发查询 |

### 5.3 前端设计

**信息架构：放在样品详情弹窗的 Tab，不新增导航项。**

理由：替代链是「样品的关系属性」，用户已在看这个样品；同时可零改动 `manifest.json` / `router.js` / `NAV`，改动面最小。

**Tab 顺序**（仅链上样品出现该 Tab）：`信息 → 替代链 → 标示卡 → 全量日志 → 大图`。

**`detail.js` 改动（仅 2 行）**

1. `_detailTabs(s)` 内追加：`var hasChain = !!(s.replaced_by || s.replaces); if (hasChain) ts.splice(1, 0, { key: 'chain', label: '替代链' });`
   - 判定字段**已在详情响应中**（`routes-samples.js:177-181` 用 `SELECT *`），**零额外请求**即可决定是否显示 Tab。
2. `_buildTabContent(s, id, tab)` 内追加分发：`else if (t === 'chain') html = _buildChainTab(s, id);`

**新建 `frontend/js/views/chain.js`（3 个文件级函数）**

| 函数 | 职责 |
|---|---|
| `_buildChainTab(s, id)` | 同步输出骨架容器，随后调用 `loadSampleChain(id)`（沿用 `_buildImageTab` + `loadImageHistory` 的既有惰性加载范式，`detail.js:200,211`） |
| `loadSampleChain(id)` | `api('GET','/api/samples/'+id+'/chain')` → 渲染垂直链；失败显示错误态 |
| `chainNodeJump(id)` | 节点点击 → `viewDetail(id)`（复用 `detail.js:40` 的入口） |

**渲染规则**

- 每个节点：`序`（链首起 1 基）+ 编号 + 状态徽标（复用 `api.js:15` 的 `statusBadge(s)`）+ 关键时间（`released_at` 或作废时 `retired_reason`）+ 当前样品高亮标记「当前」。
- 节点间用 1px 竖线连接（`var(--line)`），当前节点用 `var(--brand)` 强调。
- `truncated` → 顶部提示「链条过长，仅显示前 20 节」。
- `length === 1` → 「该样品当前没有替代关系」。
- 软删节点加「已删除」灰标。
- 小屏（XS/SM）：节点改为纵向堆叠、字段换行，不横向滚动（遵循 §10 断点）。

**CSS（`module.css`，`sm-chain-` 前缀，沿用现有 token）**

新增约 6 条规则：`.sm-chain-list` / `.sm-chain-node` / `.sm-chain-node.current` / `.sm-chain-link`（竖线）/ `.sm-chain-meta` / `.sm-chain-note`。颜色只用 `var(--line)` / `var(--muted)` / `var(--brand)`；状态徽标复用既有 `b-<STATUS>` 类，**不新增配色**。

### 5.4 权限与数据范围

- 接口权限**与 `GET /api/samples/:id` 同口径＝登录即可**（`requireAuth`）。理由：链上信息与详情弹窗「全量日志」Tab 已展示的内容同源（互为替代关系），不新增信息暴露面。
- 5 个角色（ADMIN/RD/QA/ME/CUSTODY）均可查看，不做部门裁剪。
- 待用户确认项见 §11-Q2（是否要跟随列表的角色数据范围）。

### 5.5 容量与红线校验

| 文件 | 现状 | 改动后（估算） | 判定 |
|---|---|---|---|
| `routes-samples.js` | 17,840（89.2%） | **不动** | ✓（避免触碰 90% 线） |
| `detail.js` | 13,434（67.2%） | ≈13,560（67.8%） | ✓ 未越 70% |
| `dao-list.js` | 10,083（50.4%） | ≈11,600（58%） | ✓ |
| `module.css` | 10,804（54.0%） | ≈12,000（60%） | ✓ |
| `backend/index.js` | 1,359（6.8%） | ≈1,440（7.2%） | ✓ |
| 新建文件 | — | 均 <100 行 | ✓ |
| 文件级函数 | `detail.js` 现 19 个（**历史越限，非本次引入**） | 仍 19 个（本次不新增文件级函数） | 不恶化 |

## 6. 备选方案与取舍

| 备选 | 为什么不用 |
|---|---|
| 纯前端走 `GET /api/resolve` 逐节爬链（无需重启） | 用户已选方案 B；且 N 节需 N 次请求、无整链一致性、无法判定截断 |
| 新建独立导航页「替代链」 | 需改 `manifest.json` + `router.js` + `NAV` + `VIEWS`，改动面与回归面显著扩大，与「只做替代链视图」的最小范围冲突 |
| 列表页加「替代」列 | 需改 `list-render.js` 列定义与列宽拖拽逻辑，超范围 |
| 新建 `sample_report_snapshots` 类快照表 / 物化链 | 对只读展示毫无必要，且新增 DDL 与运维窗口 |
| 在 `routes-samples.js` 内追加路由 | 该文件 89.2%，§7.1 禁止追加新功能 |
| 新建独立 `dao-chain.js` | 需在 `dao.js` 增加 require + `Object.assign` 两处改动；单函数拆文件收益低于改动成本 |

## 7. 兼容性与回滚

- **向后兼容**：纯新增（新文件 + 新接口 + 新 Tab），无既有接口出入参变更、无字段变更、无写入路径变更。
- **降级**：若链数据异常，前端可仅下线该 Tab（`detail.js` 去掉 2 行）→ 接口保留不影响任何既有功能。
- **回滚**：`git revert <commit>`；`README`/文档同步回滚。**无数据回滚需求**（零写入）。
- **回滚影响面**：仅样品详情弹窗；样品列表/看板/扫码/柜位/机型视图及治具、管制、项目、工作台均不受影响。

## 8. 部署（含重启申请）

> 后端新增路由在 `register(app)` 中注册，**进程启动时才挂载**，故本次改动**必须重启一次服务**才能生效。按 AGENTS.md §23.2 / CLAUDE.md §20，AI 不得代为重启。

**《重启申请》**

| 项 | 内容 |
|---|---|
| 原因 | 样品子系统新增只读路由 `GET /api/samples/:id/chain`，Express 路由仅在进程启动时注册 |
| 影响范围 | 仅 samples 子系统新增只读接口；无数据库变更、无依赖变更、无配置变更 |
| 涉及文件 | 新增 `backend/routes-chain.js`、`frontend/js/views/chain.js`；改 `backend/index.js`、`db/dao-list.js`、`frontend/js/views/detail.js`、`frontend/css/module.css`、`tools/bundle-sources.json`、`frontend/js/bundle.js`(重建)、`frontend/index.html`(?v=) |
| 前置保障 | 重启前 `git status` 干净、已推送；备份 `/www/backup/`；确认端口 4000 单实例（§23.4） |
| 回滚方案 | `git revert` + 再重启一次；或仅回滚前端 bundle（无需重启） |
| 执行人 | **运维**（宝塔面板「停止 → 启动」），AI 不执行 |

**部署顺序**

1. 本地：改代码 → `node --check` → 重建 bundle → 同步 `?v=` → 提交推送。
2. 服务器：`sudo -u www git fetch && git merge --ff-only origin/main`（仅静态文件落地，服务仍跑旧代码）。
3. **运维在宝塔面板重启** samples 项目（端口 4000，按 §23.4 只允许按端口定位）。
4. 验证：`GET /api/samples/65/chain` 返回链；页面详情弹窗出现「替代链」Tab。

**注意**：bundle 重建脚本会顺带刷新全部 5 个 `index.html` 的 `module.css?v=`，其余 4 个须 `git checkout --` 还原（既有已知行为）。

## 9. 风险与缓解

| id | 风险 | 等级 | 缓解 |
|---|---|---|---|
| R1 | 新增路由被 `/api/samples/:id` 捕获 | 低 | 路径为**三段** `/api/samples/:id/chain`，`/api/samples/:id`（两段）不匹配；既有 `/api/samples/:id/images`（`routes-samples.js:155`）为先例；测试中显式断言 |
| R2 | 脏数据成环导致递归 CTE 报错 | 低 | 双向 CTE 均以 `d < 20` 收敛；`truncated` 标记 |
| R3 | 编号复用产生重复 `sample_no` 行 | 极低 | 递归连接列为 `replaces`/`replaced_by`（仅 RECREATE 成对写入），非按 `sample_no` 等值匹配；残留场景：同一编号的软删行与存活行同时存在时，UI 以「已删除」标记区分 |
| R4 | 详情弹窗字符占用越过 70% | 中 | 本次仅 +2 行；若后续再加 Tab，须先执行 `detail.js` 拆分（已 19 个文件级函数，应另立拆分任务） |
| R5 | `README.md` 已达 98.7%，新增行触碰 90% 限制 | 中 | 按用户 2026-09-11 决定「新增内容前须先等量精简」，追加 API 行的同时等量精简同文件冗余文字 |
| R6 | 重启期间的短暂不可用 | 中 | 由运维在低峰执行；重启前完成推送与备份；回滚路径已验证 |

## 10. 验收标准与回归清单

**验收标准**

| id | 标准 | 验收方式 |
|---|---|---|
| A1 | `GET /api/samples/65/chain` 返回 2 节链，`ord` 0/1 分别为 058 与 061 | 只读接口调用 |
| A2 | 链首样品与链尾样品查询结果一致（同一链，`isCurrent` 位置不同） | 分别请求 65 与 122 |
| A3 | 无替代关系的样品返回 `length=1` | 请求一个无链样品 |
| A4 | 不存在/软删 id 返回 404「样品不存在」 | 请求不存在 id |
| A5 | 详情弹窗对链上样品出现「替代链」Tab，对普通样品不出现 | 页面验证 |
| A6 | 点击链上节点可跳转到该样品详情 | 页面验证 |
| A7 | 未登录访问返回 401 | 无 cookie 请求 |
| A8 | 其余 4 个子系统与样品其余视图无任何变化 | 双系统回归（§6.1） |

**回归清单**

- 样品列表（筛选/排序/分页/导出 CSV 不变）
- 样品看板、扫码台（三步向导/退回分支）、柜位视图、机型视图、操作日志
- 详情弹窗其余 Tab（信息/标示卡/全量日志/大图）与打印入口
- 治具、管制、项目、工作台四子系统入口与关键页

## 11. 待用户确认

| id | 问题 | 倾向 |
|---|---|---|
| Q1 | 信息架构：替代链放**详情弹窗 Tab**（本设计，零 manifest/router 改动）还是独立导航页「替代链」？ | 详情弹窗 Tab |
| Q2 | 权限：沿用详情口径「登录即可看全量」（本设计），还是改为跟随列表的角色数据范围（ME/CUSTODY 仅本部门）？ | 沿用详情口径 |
| Q3 | Tab 顺序：`信息 → 替代链 → 标示卡 → 全量日志 → 大图` 是否可接受？ | 是 |
| Q4 | 是否同时补 `RECREATE_REPLACED` 的流向标签（`detail.js:167-181` 现存小瑕疵）？ | 顺手补（不影响既有行） |

## 12. 部署记录（2026-09-15 实测）

| 阶段 | 结果 |
|---|---|
| 提交 | `c3b75e7`（16 文件，+979/−20）；`4978587`（两项拆分立项文档）|
| 推送 | `origin/main` = `4978587` |
| 并发集成 | 推送时发现并发提交 `21cb0e1`（报表只读聚合页）/ `617b28d`（v2.0.5），已 rebase 到 `617b28d` 之上；重叠 4 文件全部保留双方 |
| 服务器静态拉取 | `sudo -u www git merge --ff-only origin/main`：`617b28d` → `4978587`，工作区干净 |
| 运维重启 | 宝塔面板「停止 → 启动」（AI 未执行）；端口 4000 PID `1498664` → `1503826`，单实例 |
| 路由挂载判别 | `GET /api/samples/65/chain`：重启前 **404**（路由未注册）→ 重启后 **401**（已挂载待鉴权）|

**重启后只读验证（全部通过，2026-09-15）**

| id | 结果 |
|---|---|
| A1 `id=65` | 200，`length=2`，`truncated=false`；`ord`0=`058-01`（isCurrent、RETIRED、`replaced_by=061-01`）、`ord`1=`061-01`（PRODUCED、`replaces=058-01`）|
| A2 `id=122` | 200，同一条链；`ord`−1=`058-01`、`ord`0=`061-01`（isCurrent）—— 验证 `ord` 正负语义（负=更早、0=当前、正=更新）|
| A3 `id=5` | 200，`length=1`，`replaces`/`replaced_by` 均为 null（无链边界）|
| A4 `id=999999` | 404 `{"error":"样品不存在"}` |
| A5 无 cookie | 401（`requireAuth`，与详情接口同口径）|
| A6 字段白名单 | 节点不含 `version` 等内部字段，软删以 `soft_deleted` 表达 |
| A7 回归 | samples 列表/看板/机型墙(`view=wall`)/柜位(`storage-map`)/按组别查询 全部 200；登录与登出均 200，无会话残留；`/health`、`/api/config` 200 |
| A8 进程 | 端口 4000 仅一个实例（PID `1503826`）|

**实测注意（供后续迭代参考）**

1. 静态先落地而路由未挂载的窗口内，浏览器会加载新 bundle；对带替代关系的样品点击「替代链」Tab 会短暂显示「替代链加载失败」。该 Tab 非默认页、需主动点击，影响面小。**结论：本次这类「后端新增路由 + 前端新 Tab」的改动，拉取与重启应尽量紧邻执行。**
2. 已提交 bundle 中的 6 处文件级 `const/let`（`NAV`/`VIEWS`/`STATIONS`/`CONFIRM_ACTIONS`/`el`/`_camStream`）位于共享常量头，为**既有基线**（`617b28d` 同样为 2 处 `statusBadge` 重名，非本次引入）；本次新增的 6 个链渲染函数均为函数声明且全局各 1 次，未新增顶层 `const/let`。
3. **遗留**：版本号仍为 `2.0.5`，而该发布说明（`617b28d`）由并发提交撰写、不含本次替代链视图。若需正式发版，应升 `2.0.6` 并新建 `docs/RELEASE-v2.0.6.md`，四处同步（`package.json` + 5 个 `manifest.json`）——**待用户确认后再做**。
