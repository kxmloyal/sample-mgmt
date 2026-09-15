# 样品替代链视图 — 实施计划

- 日期：2026-09-14
- 对应设计：`docs/superpowers/specs/2026-09-14-sample-replacement-chain-design.md`
- 依赖确认：设计中 §11-Q1…Q4 已由用户确认后方可开工（默认取设计文档倾向值）
- 目标子系统：`samples`（已上线 `deployed:true`）
- 交付形态：后端 1 个只读接口 + 前端 1 个详情弹窗 Tab

---

## 0. 前置约束（每个任务都必须遵守）

1. **禁止重启服务**：AI 不执行任何重启/杀进程/拉起（AGENTS.md §23）。本次新增后端路由需重启才能生效 → 走 §8 的《重启申请》，由运维执行。
2. **只读**：samples 已上线，禁止造数/清库/写数据类测试；验证仅允许只读接口与页面浏览。
3. **禁止触碰**：`routes-samples.js`（89.2%）、`public/css/app.css`（109.6%，共享样式）、`manifest.json`、`router.js`、`list-render.js`、`AGENTS.md`、`CLAUDE.md`。
4. **格式**：2 空格 / UTF-8 / LF / 末行换行；前端重建 bundle 后同步 `?v=`。
5. **容量**：任意源码文件 ≤20,000 字符；单函数 ≤60 行。修改后逐文件复核。

---

## 任务清单

### T1 后端 DAO：新增 `listSampleChain`

| 项 | 内容 |
|---|---|
| 目标 | 在查询域 DAO 新增只读链查询，返回按 `ord` 升序的整链行 |
| 文件 | `subsystems/samples/db/dao-list.js`（改） |
| 做法 | ① 在 `createDaoList(deps)` 内新增**内层**函数 `listSampleChain(sampleNo)`（不新增文件级函数）；② 空入参 `return Promise.resolve([])` 短路；③ 执行设计 §5.2(a) 的双向递归 CTE（`newer` / `older` / `origin`）+ `ORDER BY ord`；④ 每行补 `soft_deleted`（`deleted_at IS NULL ? 0 : 1`）；⑤ 加入 `return { ... }` 导出清单；⑥ 同步文件头注释的「覆盖：」描述 |
| 验收 | `node --check` 通过；导出清单含 `listSampleChain`；函数名经 5 个子系统 `dao.js` 全局检索唯一（已核对：无冲突） |
| 注意 | 递归连接列必须是 `replaces` / `replaced_by`（**不是** `sample_no` 等值匹配）；两个方向 CTE 均须 `d < 20` 收敛 |
| 回滚 | 单文件 `git revert` |

### T2 后端路由：新建 `routes-chain.js` + 注册

| 项 | 内容 |
|---|---|
| 目标 | 暴露 `GET /api/samples/:id/chain` |
| 文件 | `subsystems/samples/backend/routes-chain.js`（新建）、`subsystems/samples/backend/index.js`（+1 行） |
| 做法 | ① 参照 `routes-storage-map.js` 的文件头注释风格，写明端点、权限、返回语义；② `register(app)` 内 `app.get('/api/samples/:id/chain', app.locals.requireAuth, asyncHandler(...))`；③ 逻辑：`getSampleById(Number(req.params.id))` → 空则 404 `{error:'样品不存在'}`（与 `routes-samples.js:179` 同文案）→ `listSampleChain(s.sample_no)` → 计算 `truncated = list.length > 20` → 输出设计 §5.1 契约；④ 在 `backend/index.js:20` 的 `require('./routes-samples').register(app);` **之后**追加 `require('./routes-chain').register(app);`，并在注释里说明「三段路径不会被 `/api/samples/:id`（两段）捕获，无注册顺序约束」 |
| 验收 | `node --check` 通过；路由字符串与 `requireAuth` 存在；`backend/index.js` 含注册行 |
| 回滚 | 删除新文件 + 还原 `index.js` |

### T3 前端视图：新建 `views/chain.js`

| 项 | 内容 |
|---|---|
| 目标 | 渲染替代链 Tab（惰性加载 + 节点可跳转） |
| 文件 | `subsystems/samples/frontend/js/views/chain.js`（新建） |
| 做法 | 3 个文件级函数：`_buildChainTab(s,id)`（骨架 + 触发加载）、`loadSampleChain(id)`（`api('GET','/api/samples/'+id+'/chain')` → 渲染）、`chainNodeJump(id)`（`viewDetail(id)`）。范式对齐 `detail.js:200,211` 的 `_buildImageTab` + `loadImageHistory`。渲染：`序 + 编号 + statusBadge(s) + 关键时间/作废原因`，当前节点加「当前」与 `--brand` 强调，节点间 `var(--line)` 竖线；处理 `length===1`、`truncated`、请求失败、`soft_deleted` 四种状态 |
| 验收 | `node --check` 通过；文件含 3 个函数；未引用跨子系统文件；未使用 `innerHTML` 直插未转义字段（须经 `e()` 转义） |
| 回滚 | 删除新文件 + 从 `bundle-sources.json` 摘除 |

### T4 前端接线：`detail.js` 仅 +2 行

| 项 | 内容 |
|---|---|
| 目标 | 让链上样品出现「替代链」Tab |
| 文件 | `subsystems/samples/frontend/js/views/detail.js`（改） |
| 做法 | ① `_detailTabs(s)`（现 `detail.js:93-103`）内追加 `var hasChain = !!(s.replaced_by || s.replaces); if (hasChain) ts.splice(1, 0, { key: 'chain', label: '替代链' });`；② `_buildTabContent(s, id, t)`（现 `detail.js:82-90`）内追加 `else if (t === 'chain') html = _buildChainTab(s, id);`。**不新增文件级函数**（该文件已有 19 个，历史越限，本次不恶化） |
| 可选 | 若用户确认 Q4：`_LOG_FLOW`（`detail.js:167-181`）补 `RECREATE_REPLACED: '⬆ 已作废 ➜ 被替代'` |
| 验收 | `node --check` 通过；改动行数 ≤4；`detail.js` 字符占用 <70% |
| 回滚 | 还原 2 行 |

### T5 样式：`module.css` 追加 `.sm-chain*`

| 项 | 内容 |
|---|---|
| 目标 | 链视图样式，与既有设计体系一致 |
| 文件 | `subsystems/samples/frontend/css/module.css`（改） |
| 做法 | 追加 6 条单行规则（沿用项目单行 CSS 风格）：`.sm-chain-list` / `.sm-chain-node` / `.sm-chain-node.current` / `.sm-chain-link` / `.sm-chain-meta` / `.sm-chain-note` + 移动优先媒体查询；颜色只用 `var(--line)` / `var(--muted)` / `var(--brand)`；**不新增配色、不动 app.css** |
| 验收 | 未新增非 token 硬编码颜色；`.sm-chain-` 前缀未与既有类冲突（全局检索确认）；`module.css` <70% |
| 回滚 | 还原新增规则块 |

### T6 重建 bundle 并同步版本号

| 项 | 内容 |
|---|---|
| 目标 | 前端改动落地为单 bundle |
| 做法 | ① `tools/bundle-sources.json` 的 `samples` 数组在 `views/detail.js` 之后 insert `subsystems/samples/frontend/js/views/chain.js`（`router.js` 必须仍为末位）；② `rm -f /tmp/bundle-*.js`（属主不同会 EACCES）→ `node tools/build-bundles.js`；③ 复制 samples bundle 到 `subsystems/samples/frontend/js/bundle.js`；④ `subsystems/samples/frontend/index.html` 的 `bundle.js?v=` 与 `module.css?v=` 同步为 `tools/.bundle-ver` 的新值；⑤ **还原其余 4 个 `index.html`**（构建脚本会顺带刷新它们的 `module.css?v=`） |
| 验收 | `index.html` 仍恰好 2 个 `<script>`；`app.css?v=` 保持原值不动；`grep -c 'sm-chain' bundle.js` > 0；另 4 个 `index.html` 的 diff 为空 |
| 回滚 | `git checkout --` 5 个 `index.html` + bundle.js |

### T7 测试：新建 `tests/samples-replacement-chain.test.js`

| 项 | 内容 |
|---|---|
| 目标 | 契约护栏 + 防回归 |
| 文件 | `tests/samples-replacement-chain.test.js`（新建，属 §7.1 豁免类型，≤1000 行） |
| 内容 | **静态断言**（不连库，随 `npx jest` 即可跑）：① `routes-chain.js` 含 `'/api/samples/:id/chain'` 与 `requireAuth`；② `backend/index.js` 已注册且注释含三段路径说明；③ 路径为三段 → 断言其**不**被 `'/api/samples/:id'` 前缀捕获（注释形式断言）；④ `dao-list.js` 含 `listSampleChain` 与 `WITH RECURSIVE`、`d < 20`；⑤ 导出清单含 `listSampleChain`；⑥ `views/chain.js` 存在且含 3 个函数；⑦ `detail.js` 含 `hasChain` 与 `'chain'` 分发；⑧ `bundle-sources.json` 的 samples 数组含 `views/chain.js` 且 `router.js` 仍为末位；⑨ `module.css` 含 `.sm-chain-`；⑩ **隔离断言**：`list-render.js` / `storage-map.js` / `views/models.js` 均不含 `sm-chain`。**只读接口断言**：`if (isDeployed('samples'))` 时仅允许 GET（`tests/helpers/deployed.js` 守卫），不得 POST/PUT/DELETE |
| 验收 | 服务器上 `npx jest tests/samples-replacement-chain.test.js` 全绿（本地镜像无 `node_modules`，本地只能 `node --check`） |
| 回滚 | 删除测试文件 |

### T8 文档同步（5 维度闭环）

| 文件 | 改动 |
|---|---|
| `README.md` | API 表（现 L319-332）在 `/api/samples/:id` 行后追加 `\| /api/samples/:id/chain \| GET \| 是 \| 样品替代链（只读，含链首→链尾全链）\|`；**同时等量精简同文件冗余文字**（现 19,747 字符 / 98.7%，按用户 2026-09-11 决定「新增内容前须先等量精简」） |
| `docs/role-permission-matrix.md` | §二 样品管理 追加该接口的权限行（5 角色，登录即可） |
| `docs/样品系统操作说明.md` | 新增 `### 7.9 替代链查看（2026-09-14 新增）`：入口＝详情弹窗「替代链」Tab；说明编号不复用、替代品取新流水号；举例 058→061 |
| `docs/operation-manual.md` | §5.10（L330-338）「5. 原样品记录被替代关系」补一句查看路径 |
| `docs/sample-code-encoding.md` | 无需改（序号不复用规则已覆盖） |

### T9 提交与推送

| 项 | 内容 |
|---|---|
| 做法 | Conventional Commits：`feat(samples): 新增替代链视图——只读链接口 + 详情弹窗替代链 Tab`（body 说明 why：数据早已成对写入但界面零渲染）。分 1 个提交（单一 Task 语义）；**禁止 `git add -A`**，逐文件指定；LF 保持；`sudo -u www git push`；不得 `--force` |
| 验收 | `HEAD == origin/main`（`git rev-list --left-right --count` = `0 0`） |

### T10 服务器静态落地

| 项 | 内容 |
|---|---|
| 做法 | `cd /www/wwwroot/sample-mgmt && sudo -u www git fetch && sudo -u www git merge --ff-only origin/main`；确认工作区干净、属主 `www:www` |
| 注意 | 此步**不重启**，服务仍跑旧代码；新增接口此时尚未生效 |

### T11 运维重启（用户/运维执行，AI 禁止）

按设计 §8《重启申请》：宝塔面板「停止 → 启动」，端口 4000，按 §23.4 只允许按端口定位（`ss -ltnp | grep :4000`），禁止 `pkill -f server.js`。

### T12 重启后验证与收尾

| 项 | 内容 |
|---|---|
| 接口 | `GET /api/samples/65/chain` → 2 节链（058 RETIRED → 061 PRODUCED），`ord` 0/1；`GET /api/samples/122/chain` → 同一链、`isCurrent` 落在 061 |
| 边界 | 无链样品 → `length=1`；不存在 id → 404；未登录 → 401 |
| 页面 | 链上样品详情出现「替代链」Tab，普通样品不出现；点击节点可跳转 |
| 回归 | 按设计 §10 回归清单逐项走查（样品 6 项 + 治具/管制/项目/工作台 4 入口） |
| 产出 | 文件臃肿检测报告（AGENTS.md §9）+ 部署/回滚记录 + 上传后 1~3 周期监控提示 |
| 归档 | 设计与计划文档移至 `docs/archive/`（迭代完成后） |

---

## 执行顺序与并行度

```
T1 → T2 （后端，串行：路由依赖 DAO 导出）
T3 → T4 → T5 → T6 （前端，串行：bundle 依赖全部前端文件）
T7 （测试，可在 T2/T4 完成后立即写）
T8 （文档，可与 T7 并行）
T9 → T10 → T11 → T12 （交付链，严格串行）
```

## 验收门（未过不得进入下一步）

| 门 | 条件 |
|---|---|
| G1 | T1/T2 `node --check` 通过且 DAO 名唯一 |
| G2 | T4 改动行数 ≤4 且 `detail.js` <70% |
| G3 | T6 后 `index.html` 恰好 2 个 `<script>`、`app.css?v=` 未被动、另 4 个 `index.html` 无 diff |
| G4 | T7 测试在服务器全绿 |
| G5 | T8 后 `README.md` 字符数**不增加**（等量精简达成） |
| G6 | T12 全部验收项通过 + 双系统回归无差异 |

## 明确不做

- 不新建独立导航页、不改 `manifest.json` / `router.js`
- 不在列表页加列
- 不做替代链编辑/修复
- 不新增数据表、不新增依赖、不改 `package.json`
- 不动 `app.css`、`routes-samples.js`
