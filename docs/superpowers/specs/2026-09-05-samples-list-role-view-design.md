# 样品列表角色化呈现（A 修补 + B 角色配置档）设计文档

> 日期：2026-09-05 | 作者：AI agent（用户批准 A+B 方案）
> 背景：样品列表当前为「全角色同一张 13 列表」，角色差异仅有 3 处（取消按钮、「待处理」快捷口径、无）。经评估（方案 A/B/C/D 对比），用户选定 **A+B 组合**，并在 A 中增加快捷筛选「**保管中**」。

## 一、目标与非目标

**目标**
1. （A）修复呈现断档：CHECKED_OUT 行展示领用人/应还时间；新增快捷筛选「保管中」「超时未还」；修正 ADMIN「待处理」口径。
2. （B）角色呈现配置：按角色默认列集 + 默认排序 + 角色快捷入口；「完整视图」开关一键切回全列。
3. 数据范围**不变**：所有角色仍可见全量样品（分发属性 + 看板/导出口径一致），不做行级权限（方案 C 已否决）。

**非目标**
- 不改状态机、不改扫码台、不做独立保管工作台（方案 D 二期再议）。
- CSV 导出保持全列不变（导出口径 ≠ 屏幕口径）。

## 二、角色档位定义（B 核心）

| 档位 | 默认列（其余收进完整视图） | 默认排序 | 快捷入口 |
|---|---|---|---|
| RD | #、编号、名称、机型、类型、状态、制作 | `mine`（我创建的优先） | 待制作、我建的 |
| QA | #、编号、名称、状态、复检状态、发行 | `inspect`（复检到期升序） | 待处理、逾期、近7天 |
| CUSTODY/ME | #、编号、名称、状态、保管部门/储位、**领用人/应还** | `status`（状态优先） | **保管中、超时未还**、待处理、本部门 |
| ADMIN | 完整 13 列（现状不变） | 最新优先 | 待处理（真实口径）、保管中、超时未还、逾期、近7天 |

**通用规则**
- 列集是「默认减列」，所有列都保留在完整视图中；「完整视图」开关状态存 `sessionStorage`（刷新保持，不跨会话）。
- 角色默认排序**仅首次进入时应用**；用户手动改排序后以用户为准（不持久化，现状行为）。
- 深链 `#/samples?model=` / `?status=` 优先级最高：带深链进入时不应用角色默认排序。
- 多角色用户取**主角色**（me.role，现状口径）。
- 移动端：列集减列自动减少 data-label 卡片字段。

## 三、技术设计

### 3.1 后端（samples 子系统）

**dao.js 拆分（红线驱动）**：dao.js 已达 18044/20000 字符（90%），按域拆出**查询域**：
- `db/dao.js` — 保留写入/建样/状态机支撑/日志（瘦身）
- `db/dao-list.js` — listSamples/countAllSamples/overdue 系列/我的待办/机型墙聚合（查询域）
- 两个文件同为 `module.exports = function createDao(deps)` 工厂形态，db.js `scanDao()` 对每子系统只加载 `db/dao.js` 一个入口 → **dao-list.js 由 dao.js require 并合并导出**（保持对外接口零变化，调用方 D.listSamples 不动）。
- 新增导出命名全局唯一（防展平冲突）：`listSamples`/`countAllSamples` 等沿用旧名（无冲突），新增排序走 opts，不新增 DAO 函数名——`mine` 筛选复用 listSamples 的 opts 扩展。

**listSamples/countAllSamples opts 扩展（向后兼容）**：
```
opts.mine_uid   — number；WHERE created_by = ?
opts.checkout_overdue — '1'；WHERE status='CHECKED_OUT' AND expected_return_at IS NOT NULL AND ISO_UTC(expected_return_at) < NOW_UTC
opts.sort 新增：
  'mine'      → ORDER BY (created_by = <mine_uid>) DESC, id DESC   （需 uid，仅列表路由传入）
  'inspect'   → ORDER BY (next_inspect_at IS NULL), next_inspect_at ASC, id DESC
  'status'    → ORDER BY FIELD(status,'NEW','PRODUCED','RELEASED','IN_CUSTODY','CHECKED_OUT','RETURNING','RETIRED'), id DESC
```
- countAllSamples 同步支持 mine_uid/checkout_overdue（计数一致）。
- 逾期 WHERE 构造复用现有 ISO_UTC 常量模式；checkout_overdue 用 `ISO_UTC.replace(/next_inspect_at/g,'expected_return_at')`（dao 已有同款先例 listCheckoutOverdue）。

**routes-samples.js**：
- GET /api/samples 与 /export 解析新参数 `mine`、`checkout_overdue`，路由内 `mine=1` 时取 `currentUser(req).id` 作 mine_uid 传入（服务端派生，防伪造他人 uid）。
- 排序参数 `sort` 白名单透传（新增 mine/inspect/status 三个值）。

### 3.2 前端（samples 子系统 views/）

**新文件 `views/list-role.js`**（角色档位 + 列配置，纯函数）：
```
LIST_ROLE_PROFILE(role) → { cols:[...], sort:'mine', quick:['pending','mine'] }
LIST_ALL_COLS           → 全列 key 数组（与现有表头一致）
listColDef(key)         → { label, width, dataLabel, render(s,isOverdue) }
```
- 列定义集中化：把 `_sampleHeaderCols`/`_sampleRowHtml` 的列 HTML 生成改为按 key 驱动（colgroup width + th + td render 三联动）。
- CHECKED_OUT 行「保管部门/储位」列 render：`s.status==='CHECKED_OUT'` 时显示 `领用人/应还MM-DD`（橙色应还已超时），否则原样。
- 「完整视图」开关：`_listFullView`（sessionStorage `samples_list_full_view`）；on → 全列 + 全快捷入口；off → 角色档位列。

**list.js（viewSamples）**：
- 初始化时按 profile 设置默认排序（无深链时）。
- 快捷栏按 profile.quick 渲染（保管中/超时未还/本部门/我建的/待处理/逾期/近7天）。
- 「完整视图」fluent-switch 放在快捷栏行尾。

**list-filter.js**：
- `quickFilter('custody')` → status=IN_CUSTODY；`quickFilter('checkout_overdue')` → checkout_overdue=1；`quickFilter('mine')` → mine=1；`quickFilter('dept')` → dept=me.dept（CUSTODY/ME）。
- ADMIN 待处理：改为 `NEW,PRODUCED,RELEASED,RETURNING`（真实待办态全量口径）。
- chips 同步新增四种快捷 chip。

### 3.3 影响面与回归
- 共享文件零改动（app.css/modal/api-base 不动）；样式补充进 samples module.css（已达 49 行/3.5k 字符，健康）。
- 深链回归：机型视图点击卡片 → `#/samples?model=` 预选 + 不应用角色默认排序。
- 移动端卡片回归：减列后 data-label 字段联动。
- 列宽拖拽回归：colgroup 由列配置驱动后仍可用。
- 导出回归：全列不变；新筛选参数（mine/checkout_overdue）随筛选复用进导出。
- 回滚：git revert 单提交系列即可；无 DB 变更、无 schema 变更。

## 四、风险
- dao.js 拆分是纯代码移动 + 少量新增，风险低但须语法校验 + 真实 DB 只读 E2E（现有 kb_p2_e2e.js 模式复用）。
- 后端上线需重启（用户宝塔操作）；前端 bundle 重建即生效。
- FIELD() 排序为 MariaDB 方言（项目绑定 MariaDB，可接受；与现有 SQL 风格一致）。

## 五、验证计划
1. `node -c`/`node --check` 全部改动文件。
2. 真实 DB 只读 E2E：listSamples 新参数（mine_uid/checkout_overdue/三种排序）与 countAllSamples 计数一致性。
3. bundle 重建 + 版本号更新 + 部署。
4. 手动清单：五角色（rd01/qa01/mfg01/me01/admin）列表首屏列集/排序/快捷栏；完整视图开关；CHECKED_OUT 行领用信息；深链回归；移动端 375px 截图抽查。
