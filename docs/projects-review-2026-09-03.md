# 项目追踪子系统 · 全链路评审报告

- 版本：1.0（2026-09-03，评审 + 修复已落地）
- 范围：`subsystems/projects` 前后端全链路（index.html / router / 7 视图 / 后端 routes×4 / dao×5 / schema / seed / module.css / manifest）
- 交付：评审结论 + 本轮落地修复清单（commit `13e8f2f`）
- 子系统状态：`roles.use` 已放开门禁至 PM/RD/QA/CUSTODY/ME

---

## 一、评审维度总览

| 维度 | 总评 | 关键点 |
|------|------|--------|
| 响应（response） | 良 | 看板统计已做聚合缓存；任务详情切 tab 曾重复拉全量（已修） |
| 合理（reasonableness） | 良 | 乐观锁/状态机/依赖环检测/级联清楚；角色门禁曾与菜单不一致（已修） |
| 科学（scientific） | 良 | 状态机驱动流转 + CAS + 依赖前置校验；统计聚合 SQL 已优化 |
| 高效（efficiency） | 中 | 详情/成员弹窗存在重复拉取与整窗重开（已修）；批量无 overdue（已修） |
| 交互（interaction） | 良 | 弹窗设计系统化；成员操作曾整窗重开丢失输入（已修） |
| 跳转（navigation） | 良 | hash 路由 + 侧边导航角色过滤；query 剥离已对齐 samples |

---

## 二、本轮修复清单

> 均已上线：前端 `bundle.js?v=bmtlmu7pm` 与 `index.html` 版本同步；后端已宝塔重启生效。

### P0 — 阻断级

**P0-1 角色门禁与菜单/权限不一致**（响应/合理）
- 原 `SUBSYSTEM_ROLES=['ADMIN']` 仅管理员可进入，但 `NAV`/`manifest.navigation` 已声明 PM/RD/QA/CUSTODY/ME 可见 → 这些角色被直接弹回门户。
- 修复：`frontend/js/router.js` 的 `SUBSYSTEM_ROLES` 放开为 `['ADMIN','PM','RD','QA','CUSTODY','ME']`；`manifest.json roles.use` 同步。
- 安全性：所有写操作仍由后端 `isGlobalManager(ADMIN/PM)` 或 项目成员/assignee 二次鉴权，放开门禁不扩大越权。

**P0-2 bundle 缓存版本失配（已修）**
- `index.html?v=bmtbkaco2` 与实际 bundle banner `vbmtldqewd` 不一致 → 用户浏览器命中旧缓存，新功能不生效。
- 修复：重建 bundle，`?v=` 同步为 `bmtlmu7pm`；运维提示：改前端 JS 后需同时重建 bundle 并同步 `index.html` 的 `?v=`。

### P1 — 明显缺陷（已修）
**P1-1 任务详情切 tab 重复拉全量（高效/响应）**
- 原 `task-detail.js` 每次 `tdSwitchTab`/`tdRefresh` 都经 `api()` 重拉整个任务详情。
- 修复：前端 8s payload 缓存（`_tdCache`），写操作后清缓存强制刷新，减少切 tab 的重复请求。

**P1-3 状态机保存校验（合理/科学）**
- 原 `PUT /api/projects/workflow` 仅校验 4 态存在，未校验转边 `from/to/action/role/label` 合法性。
- 修复：`routes-stats.js` 保存前校验每转边的 `from/to`∈四态、`action` 唯一、角色非空、label 非空，非法 400。

**P1-4 用户列表字段收敛（合理/安全）**
- 原 `GET /api/projects/users` 对任意登录用户返回 `id,username,display_name`（暴露登录名）。
- 修复：仅返回 `id,display_name`（去 `username`）；前端 8 处下拉展示改用 `display_name || '#'+id` 兜底。

### P2 — 一般项（已修）
**P2-1 批量状态流转缺 AUTO_OVERDUE（科学/一致性）**
- 单条状态流转会先 auto-overdue；批量 `transition` 分支原未做。
- 修复：`routes-tasks.js` 批量 `status` 分支与单条一致，先执行 `AUTO_OVERDUE`(CAS)：已过期任务自动落 `OVERDUE`，再手动流转（互斥）。

**P2-2 成员弹窗整窗重开/重复拉全量（交互）**
- 原 `projMembers` 每次增删/转让都重开弹窗，重拉成员+全量用户、丢失滚动/输入。
- 修复：`projects.js` 改为 `memRefresh()` 仅刷新成员行，保持弹窗打开；下拉 `memRenderOpts` 增量更新。

### P3 — 提示（已修）
**P3 dao.createProject 无 conn 陷阱**
- 原未传 `conn` 时返回 `{id:0}`；现显式 `throw new Error('createProject 必须传事务连接 conn')`，避免静默 0 主键。

**P3 附件下载路径**（未改，评估后维持）
- 前端 `href="/uploads/projects/<file_path>"`；`file_path` 由 multer 生成防用户控制，路径安全，维持现状。

---

## 三、遗留/待决策项（未在本轮改动）

1. **读取可见范围**：放开门禁后，RD/QA/ME/CUSTODY 可浏览全部项目（只读）。如需"仅见参与的项目"再做项目范围过滤，属后续增强。
2. **`manifest deployed`**：projects 未声明 `deployed:true`，门户按 `roles.use` 放行可见即可；如需门户标记"已上线"，可补 `deployed:true`。
3. **任务详情分 tab 后端按分区 GET**：当前详情仍单接口返回全部子数据（前端缓存缓解了旧重复请求）。如进一步降低首屏体重，可拆分区 GET 端点（subtasks/comments/deps/files/logs），属可选优化。

---

## 四、验证记录

- 前端：`bundle.js?v=bmtlmu7pm` ↔ bundle banner `vbmtlmu7pm`（HTTP 实测一致）。
- 后端：`GET /api/projects/users` 实测仅 `id+display_name`（新代码重启生效，佐证 P1-3/P2-1/P3 同批次生效）。
- Git：commit `13e8f2f` 已 `push origin/main`。

## 五、对运营的提示
- **改前端 JS 后必须重建 bundle 并同步 `index.html` 的 `?v=`**（避免缓存失效/功能不生效）。
- 后端 routes/dao 改动回**宝塔重启**后生效。