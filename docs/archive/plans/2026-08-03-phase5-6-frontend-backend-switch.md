# Phase 5-6: 前端切换 + 后端切换 + 旧代码清理 — 实现计划

> **For agentic workers:** 使用 subagent-driven-development 逐任务实现，每任务独立审核。
> 步骤使用 checkbox (`- [ ]`) 语法追踪。

**Goal:** 完成子系统插件协议迁移的最后两阶段——Phase 5（前端 SPA 引用切换到子系统内部路径，删除旧 public/js/ 冗余副本）和 Phase 6（后端路由迁移到 subsystem register()，删除旧 routes/ + old SPAs + 旧 DAO，拆分 db.js DDL）。

**Architecture:** 当前处于「新旧双轨并行但实际只走旧轨」状态。Phase 5 将子系统 SPA 的 `<script>` 引用从 `public/js/` 切换到 `subsystems/*/frontend/js/` + `shared/frontend/`。Phase 6 将 routes/*.js 的业务逻辑迁移到 `subsystems/*/backend/index.js` 的 `register()` 函数中，删除旧 routes/、db/ DAO、public/ 旧 SPA 和 public/js/ 残留文件。

**Tech Stack:** Node.js + Express 4.x + MariaDB(mysql2) + 原生 HTML/CSS/JS

**前置状态:** Phase 1-4 已完成。共享层（shared/state-machine.js、shared/file-manager.js、shared/middleware/、shared/frontend/）已就绪。subsystems/ 目录骨架和 manifest.json 已就绪。21 对 JS 文件在 public/js/ 和 subsystems/*/frontend/js/views/ 之间完全重复，子系统 SPA 仍引用 public/js/ 旧路径。

**预计新建文件:** 2 个
**预计修改文件:** 7 个
**预计删除文件:** ~35 个

---

### 文件归类清单（参考）

| 文件 | 归属 | Phase 5 后位置 |
|---|---|---|
| `public/js/shared/utils.js` | 共享 | `shared/frontend/shared/utils.js`（已存在） |
| `public/js/shared/api-base.js` | 共享 | `shared/frontend/api-base.js`（已存在） |
| `public/js/modal.js` | 共享 | `shared/frontend/modal.js`（已存在） |
| `public/js/api.js` (14行) | 样品专属 | `subsystems/samples/frontend/js/api.js` |
| `public/js/ui.js` (2行) | 共享 | 合并到 `shared/frontend/shared/utils.js` |
| `public/js/constants.js` | 共享 | 保留在 `public/js/constants.js`（来自 misc.js） |
| `public/js/fixture-api.js` | 治具专属 | `subsystems/fixtures/frontend/js/api.js` |
| `public/js/fixture-file-api.js` | 治具专属 | `subsystems/fixtures/frontend/js/views/fixture-file-api.js`（已重复） |
| `public/js/fixture-file-ui.js` | 治具专属 | `subsystems/fixtures/frontend/js/views/fixture-file-ui.js`（已重复） |
| 其余 `public/js/*.js`（18个） | 样品/治具 views | 已在 `subsystems/*/frontend/js/views/` 有完全重复副本，直接删除 |
| `public/index.html` | 样品旧 SPA | Phase 6 删除 |
| `public/fixture.html` | 治具旧 SPA | Phase 6 删除 |
| `routes/samples.js` 等 | 旧路由 | Phase 6 迁移后删除 |
| `db/samples.js` 等 | 旧 DAO | Phase 6 迁移后删除 |
| `seed-samples.js`/`seed-fixture.js` | 旧种子 | Phase 6 删除 |

---

### Phase 5: 前端切换（8 Tasks）

> 目标：子系统 SPA 引用子系统内部 JS 路径，删除 public/js/ 冗余副本。
> 零停机：Phase 5 期间旧 SPA（public/index.html、public/fixture.html）仍可正常工作。
> 验证：每 Task 完成后，新 SPA 入口（/subsystems/*/frontend/index.html）在浏览器中登录并验证全部功能正常。

---

### Task 1: 创建样品子系统专属 api.js

**Files:**
- Create: `subsystems/samples/frontend/js/api.js`

当前 `public/js/api.js`（14行）是样品专属入口逻辑（showApp/boot 包装），应复制到子系统内部。

- [ ] **Step 1: 从 public/js/api.js 复制到子系统**

```bash
cd /www/wwwroot/sample-mgmt
cp public/js/api.js subsystems/samples/frontend/js/api.js
```

- [ ] **Step 2: 验证文件内容**

```bash
cd /www/wwwroot/sample-mgmt && node -c subsystems/samples/frontend/js/api.js
```

- [ ] **Step 3: Commit**

```bash
git add subsystems/samples/frontend/js/api.js
git commit -m "refactor(samples): copy sample-specific api.js to subsystems/samples/frontend/js/"
```

---

### Task 2: 创建治具子系统专属 api.js 和 file-api.js/file-ui.js

**Files:**
- Create: `subsystems/fixtures/frontend/js/api.js`
- Create: `subsystems/fixtures/frontend/js/file-api.js`
- Create: `subsystems/fixtures/frontend/js/file-ui.js`

治具专属的 `fixture-api.js`、`fixture-file-api.js`、`fixture-file-ui.js` 不存在于 subsystems 副本中（之前的 views/ 复制遗漏了这些非 view 文件）。需要注意：`subsystems/fixtures/frontend/js/views/fixture-file-api.js` 和 `subsystems/fixtures/frontend/js/views/fixture-file-ui.js` 已存在完全重复副本，但 `fixture-api.js` 需要单独创建。

- [ ] **Step 1: 复制 fixture-api.js 到子系统**

```bash
cd /www/wwwroot/sample-mgmt
cp public/js/fixture-api.js subsystems/fixtures/frontend/js/api.js
```

- [ ] **Step 2: 将 fixture-file-api.js 和 fixture-file-ui.js 复制到子系统 js/ 根目录**

```bash
cd /www/wwwroot/sample-mgmt
cp public/js/fixture-file-api.js subsystems/fixtures/frontend/js/file-api.js
cp public/js/fixture-file-ui.js subsystems/fixtures/frontend/js/file-ui.js
```

- [ ] **Step 3: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt
node -c subsystems/fixtures/frontend/js/api.js
node -c subsystems/fixtures/frontend/js/file-api.js
node -c subsystems/fixtures/frontend/js/file-ui.js
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/fixtures/frontend/js/api.js subsystems/fixtures/frontend/js/file-api.js subsystems/fixtures/frontend/js/file-ui.js
git commit -m "refactor(fixtures): copy fixture-specific JS modules to subsystems/fixtures/frontend/js/"
```

---

### Task 3: 合并 ui.js 到 shared/frontend/shared/utils.js

**Files:**
- Modify: `shared/frontend/shared/utils.js`

`public/js/ui.js`（2行）提供了 `$` 和 `el` 函数，它们与 `shared/frontend/api-base.js` 中的 `$` 重复。需要将 `el` 函数合并到共享 tools 文件中。

- [ ] **Step 1: 读取 public/js/ui.js 的当前内容**

```bash
cat /www/wwwroot/sample-mgmt/public/js/ui.js
```

- [ ] **Step 2: 将 `el` 函数追加到 shared/frontend/shared/utils.js**

在 `shared/frontend/shared/utils.js` 末尾追加：

```js
// UI 工具（从 public/js/ui.js 迁移）
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
```

- [ ] **Step 3: 验证语法**

```bash
cd /www/wwwroot/sample-mgmt && node -c shared/frontend/shared/utils.js
```

- [ ] **Step 4: Commit**

```bash
git add shared/frontend/shared/utils.js
git commit -m "refactor(shared): merge el() helper from public/js/ui.js into shared utils"
```

---

### Task 4: 切换 samples SPA 的 script 引用到子系统内部路径

**Files:**
- Modify: `subsystems/samples/frontend/index.html`

将 `<script src="/js/...">` 全部替换为子系统内部路径或共享路径。

**替换映射表：**

| 旧路径 | 新路径 |
|---|---|
| `/js/shared/utils.js` | `/shared/frontend/shared/utils.js` |
| `/js/shared/api-base.js` | `/shared/frontend/api-base.js` |
| `/js/shared-constants.js` | `/js/shared-constants.js`（由 misc.js 动态生成，保持不变） |
| `/js/constants.js` | `/subsystems/samples/frontend/js/constants.js`（子系统已有完全重复副本） |
| `/js/api.js` | `/subsystems/samples/frontend/js/api.js` |
| `/js/ui.js` | 删除（已合并到 shared utils） |
| `/js/modal.js` | `/shared/frontend/modal.js` |
| `/js/dashboard.js` | `/subsystems/samples/frontend/js/views/dashboard.js` |
| `/js/dashboard-todo.js` | `/subsystems/samples/frontend/js/views/dashboard-todo.js` |
| `/js/new.js` | `/subsystems/samples/frontend/js/views/new.js` |
| `/js/samples.js` | `/subsystems/samples/frontend/js/views/list.js` |
| `/js/sample-filter.js` | `/subsystems/samples/frontend/js/views/list-filter.js` |
| `/js/sample-list-render.js` | `/subsystems/samples/frontend/js/views/list-render.js` |
| `/js/detail.js` | `/subsystems/samples/frontend/js/views/detail.js` |
| `/js/scan-camera.js` | `/subsystems/samples/frontend/js/views/scan-camera.js` |
| `/js/print-queue.js` | `/subsystems/samples/frontend/js/views/print-queue.js` |
| `/js/card-fields.js` | `/subsystems/samples/frontend/js/views/card-fields.js` |
| `/js/scan-wizard.js` | `/subsystems/samples/frontend/js/views/scan-wizard.js` |
| `/js/scan-return-actions.js` | `/subsystems/samples/frontend/js/views/scan-return-actions.js` |
| `/js/scan.js` | `/subsystems/samples/frontend/js/views/scan.js` |
| `/js/logs.js` | `/subsystems/samples/frontend/js/views/logs.js` |
| `/js/users.js` | `/subsystems/samples/frontend/js/views/users.js` |
| `/js/help-data.js` | `/subsystems/samples/frontend/js/views/help-data.js` |
| `/js/help.js` | `/subsystems/samples/frontend/js/views/help.js` |
| `/js/router.js` | `/subsystems/samples/frontend/js/router.js` |

- [ ] **Step 1: 修改 subsystems/samples/frontend/index.html 第 57-82 行**

将旧 script 块替换为新引用：

```html
<!-- Phase 5: 切换到子系统内部路径 + shared/frontend/ -->
<script src="/shared/frontend/shared/utils.js?v=20260803a"></script>
<script src="/shared/frontend/api-base.js"></script>
<script src="/js/shared-constants.js?v=20260803a"></script>
<script src="/subsystems/samples/frontend/js/constants.js"></script>
<script src="/shared/frontend/modal.js"></script>
<script src="/subsystems/samples/frontend/js/api.js"></script>
<!-- 页面视图模块 -->
<script src="/subsystems/samples/frontend/js/views/dashboard.js?v=20260803d"></script>
<script src="/subsystems/samples/frontend/js/views/dashboard-todo.js?v=20260810"></script>
<script src="/subsystems/samples/frontend/js/views/new.js"></script>
<script src="/subsystems/samples/frontend/js/views/list.js?v=20260803a"></script>
<script src="/subsystems/samples/frontend/js/views/list-filter.js?v=20260803a"></script>
<script src="/subsystems/samples/frontend/js/views/list-render.js?v=20260803a"></script>
<script src="/subsystems/samples/frontend/js/views/detail.js"></script>
<script src="/subsystems/samples/frontend/js/views/scan-camera.js"></script>
<script src="/subsystems/samples/frontend/js/views/print-queue.js"></script>
<script src="/subsystems/samples/frontend/js/views/card-fields.js"></script>
<script src="/subsystems/samples/frontend/js/views/scan-wizard.js"></script>
<script src="/subsystems/samples/frontend/js/views/scan-return-actions.js"></script>
<script src="/subsystems/samples/frontend/js/views/scan.js?v=20260810"></script>
<script src="/subsystems/samples/frontend/js/views/logs.js"></script>
<script src="/subsystems/samples/frontend/js/views/users.js"></script>
<script src="/subsystems/samples/frontend/js/views/help-data.js"></script>
<script src="/subsystems/samples/frontend/js/views/help.js"></script>
<script src="/subsystems/samples/frontend/js/router.js?v=20260810"></script>
```

- [ ] **Step 2: 确保 CSS 引用 module.css**

确认 header 中已有 `<link rel="stylesheet" href="/subsystems/samples/frontend/css/module.css" />`（第 10 行，已存在）。

- [ ] **Step 3: 验证**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 浏览器访问: http://localhost:4000/subsystems/samples/frontend/index.html
# 确认能正常登录、看板、列表、新建、扫码、日志、用户管理全部正常
# 关键验证: 打开浏览器 DevTools Network 面板，确认所有 JS 文件都从新路径加载（无 404）
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/samples/frontend/index.html
git commit -m "feat(samples): switch SPA script refs to subsystem internal paths"
```

---

### Task 5: 切换 fixtures SPA 的 script 引用到子系统内部路径

**Files:**
- Modify: `subsystems/fixtures/frontend/index.html`

**替换映射表：**

| 旧路径 | 新路径 |
|---|---|
| `/js/shared/utils.js` | `/shared/frontend/shared/utils.js` |
| `/js/shared/api-base.js` | `/shared/frontend/api-base.js` |
| `/js/fixture-api.js` | `/subsystems/fixtures/frontend/js/api.js` |
| `/js/fixture-file-api.js` | `/subsystems/fixtures/frontend/js/file-api.js` |
| `/js/modal.js` | `/shared/frontend/modal.js` |
| `/js/fixture-dashboard.js` | `/subsystems/fixtures/frontend/js/views/dashboard.js` |
| `/js/fixture-detail.js` | `/subsystems/fixtures/frontend/js/views/detail.js` |
| `/js/fixture-list-filter.js` | `/subsystems/fixtures/frontend/js/views/list-filter.js` |
| `/js/fixture-list.js` | `/subsystems/fixtures/frontend/js/views/list.js` |
| `/js/fixture-file-ui.js` | `/subsystems/fixtures/frontend/js/file-ui.js` |
| `/js/fixture-photo-upload.js` | `/subsystems/fixtures/frontend/js/views/fixture-photo-upload.js` |
| `/js/fixture-scan.js` | `/subsystems/fixtures/frontend/js/views/scan.js` |
| `/js/fixture-logs.js` | `/subsystems/fixtures/frontend/js/views/logs.js` |
| `/js/fixture-new.js` | `/subsystems/fixtures/frontend/js/views/new.js` |
| `/js/fixture-router.js` | `/subsystems/fixtures/frontend/js/router.js` |

- [ ] **Step 1: 修改 subsystems/fixtures/frontend/index.html 第 48-63 行**

```html
<!-- Phase 5: 切换到子系统内部路径 + shared/frontend/ -->
<script src="/shared/frontend/shared/utils.js?v=20260803a"></script>
<script src="/shared/frontend/api-base.js"></script>
<script src="/shared/frontend/modal.js"></script>
<script src="/subsystems/fixtures/frontend/js/api.js"></script>
<script src="/subsystems/fixtures/frontend/js/file-api.js"></script>
<script src="/subsystems/fixtures/frontend/js/file-ui.js"></script>
<script src="/subsystems/fixtures/frontend/js/views/dashboard.js?v=20260803d"></script>
<script src="/subsystems/fixtures/frontend/js/views/detail.js"></script>
<script src="/subsystems/fixtures/frontend/js/views/list-filter.js?v=20260803a"></script>
<script src="/subsystems/fixtures/frontend/js/views/list.js?v=20260803c"></script>
<script src="/subsystems/fixtures/frontend/js/views/fixture-photo-upload.js"></script>
<script src="/subsystems/fixtures/frontend/js/views/scan.js"></script>
<script src="/subsystems/fixtures/frontend/js/views/logs.js?v=20260803a"></script>
<script src="/subsystems/fixtures/frontend/js/views/new.js"></script>
<script src="/subsystems/fixtures/frontend/js/router.js"></script>
<script>
window.addEventListener('hashchange',routeFixture);
bootFixture();
</script>
```

- [ ] **Step 2: 确保 CSS 引用 module.css**

确认 header 中已有 `<link rel="stylesheet" href="/subsystems/fixtures/frontend/css/module.css" />`（第 9 行，已存在）。

- [ ] **Step 3: 验证**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 浏览器访问: http://localhost:4000/subsystems/fixtures/frontend/index.html
# 确认能正常登录、看板、清单、新建、扫码、日志全部正常
# 关键验证: DevTools Network 面板无 404
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/fixtures/frontend/index.html
git commit -m "feat(fixtures): switch SPA script refs to subsystem internal paths"
```

---

### Task 6: 清理 CSS 状态 Badge 三重复制 + 修复 VERIFY_ME_OK Bug

**Files:**
- Modify: `public/css/app.css`

从 app.css 中删除子系统专属的状态 badge 样式（它们现在在各自的 module.css 中），同时修复 `.b-VERIFY_ME_OK` 应为 `.b-VERIFY_ORG_OK` 的 bug。

- [ ] **Step 1: 从 app.css 删除样品状态 badge（第 70-74 行）**

删除以下 5 行：
```css
.b-NEW{background:#f0fdfa;color:#115e59}
.b-PRODUCED{background:#ecfeff;color:#155e75}
.b-RELEASED{background:#fef9c3;color:#854d0e}
.b-IN_CUSTODY{background:#dcfce7;color:#166534}
```

注意：`.badge` 基类（第 70 行）**保留**。`.b-RETURNING` 和 `.b-RETIRED` 未在 app.css 中出现（它们在 module.css 中），不需要删。

- [ ] **Step 2: 从 app.css 删除治具状态 badge（第 140-141 行）并修复 bug**

删除含以下内容的行（第 141 行整行）：
```css
.b-REQUESTED{background:#f0f0f0;color:#666}.b-VERIFY_PENDING{...}.b-VERIFY_ME_OK{...}...
```
并在治具 module.css 中将 `.b-VERIFY_ME_OK` 改为 `.b-VERIFY_ORG_OK`（当前已正确，无需改）。同时删除第 140 行注释 `/* 治具 badge 状态标签（从 fixture.html 迁移） */`。

- [ ] **Step 3: 确认 module.css 中 badge 完整**

`subsystems/samples/frontend/css/module.css` 应含：`.b-NEW, .b-PRODUCED, .b-RELEASED, .b-IN_CUSTODY, .b-RETURNING, .b-RETIRED`

`subsystems/fixtures/frontend/css/module.css` 应含 12 个 badge（REQUESTED~RETIRED），且 VERIFY_ORG_OK 名称正确。

- [ ] **Step 4: 验证**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 访问样品和治具两个子系统：
# 1. 样品列表 → 确认所有状态 badge 颜色正常显示
# 2. 治具清单 → 确认所有状态 badge 颜色正常显示
# 3. DevTools 检查无 CSS 404
```

- [ ] **Step 5: Commit**

```bash
git add public/css/app.css
git commit -m "fix(css): remove duplicate state badges from app.css, keep only module.css copies"
```

---

### Task 7: 删除 public/js/ 中的 21 对冗余副本

**Files:**
- Delete: 21 个 `public/js/*.js` 文件（仅删除 subsystems 中已有完全重复副本的文件）

保留的文件（仍被其他地方引用或为共享文件）：
- `public/js/shared/` 目录（utils.js、api-base.js）— 旧 SPA 仍需要
- `public/js/modal.js` — 旧 SPA 仍需要
- `public/js/api.js` — 旧 SPA（public/index.html）仍需要
- `public/js/fixture-api.js` — 旧 SPA（public/fixture.html）仍需要
- `public/js/fixture-file-api.js` — 旧 SPA 仍需要
- `public/js/fixture-file-ui.js` — 旧 SPA 仍需要
- `public/js/ui.js` — 旧 SPA 仍需要
- `public/js/constants.js` — 旧 SPA 仍需要（Phase 6 Task 14 随旧 SPA 一起删除）
- `public/js/subsystem-manager.js` — 管理面板

**待删除的 21 个文件：**

- [ ] **Step 1: 删除样品专属 views（15 个文件）**

```bash
cd /www/wwwroot/sample-mgmt
rm public/js/dashboard.js
rm public/js/dashboard-todo.js
rm public/js/new.js
rm public/js/samples.js
rm public/js/sample-filter.js
rm public/js/sample-list-render.js
rm public/js/detail.js
rm public/js/scan-camera.js
rm public/js/print-queue.js
rm public/js/card-fields.js
rm public/js/scan-wizard.js
rm public/js/scan-return-actions.js
rm public/js/scan.js
rm public/js/logs.js
rm public/js/users.js
```

- [ ] **Step 2: 删除样品专属 help/router 文件（3 个）**

```bash
cd /www/wwwroot/sample-mgmt
rm public/js/help-data.js
rm public/js/help.js
rm public/js/router.js
```

- [ ] **Step 3: 删除治具专属 views（删除与已有 subsystems 副本重复的 9 个文件）**

```bash
cd /www/wwwroot/sample-mgmt
rm public/js/fixture-dashboard.js
rm public/js/fixture-detail.js
rm public/js/fixture-list.js
rm public/js/fixture-list-filter.js
rm public/js/fixture-photo-upload.js
rm public/js/fixture-scan.js
rm public/js/fixture-logs.js
rm public/js/fixture-new.js
rm public/js/fixture-router.js
```

注意：`fixture-file-api.js` 和 `fixture-file-ui.js` 保留，因为旧 SPA（public/fixture.html）仍引用它们。

- [ ] **Step 4: 验证新 SPA 仍然正常工作**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 浏览器访问:
# http://localhost:4000/subsystems/samples/frontend/index.html → 全部功能正常
# http://localhost:4000/subsystems/fixtures/frontend/index.html → 全部功能正常
# DevTools Network 面板确认无 404
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): remove 21 duplicate JS files from public/js/, subsystems own their copies now"
```

---

### Task 8: Phase 5 双系统回归验证

- [ ] **Step 1: 新 SPA 入口全功能验证 — 样品**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 浏览器访问: http://localhost:4000/subsystems/samples/frontend/index.html
# rd01/rd123 登录:
# [ ] 样品看板 — 统计卡正确、待办列表正常
# [ ] 样品列表 — 筛选、排序、分页正常
# [ ] 新建样品 — 表单填写、提交成功
# [ ] 扫码台 — 扫码识别、操作按钮正常
# [ ] 操作日志 — 列表加载正常
# qa01/qa123 登录:
# [ ] 发行操作正常
# mfg01/mfg123 登录:
# [ ] 保管操作正常
# admin/admin123 登录:
# [ ] 用户管理正常
```

- [ ] **Step 2: 新 SPA 入口全功能验证 — 治具**

```bash
# 浏览器访问: http://localhost:4000/subsystems/fixtures/frontend/index.html
# rd01/rd123 登录:
# [ ] 治具看板 — 统计卡正确
# [ ] 治具清单 — 筛选、排序、分页正常
# [ ] 新建申请 — 表单填写、文件上传成功
# [ ] 治具扫码台 — 扫码、操作正常
# [ ] 操作日志 — 列表加载正常
# me01/me123 登录:
# [ ] 领用/维修操作正常
# admin/admin123 登录:
# [ ] 报废操作正常
```

- [ ] **Step 3: 旧 SPA 入口兼容验证（仍可使用但未来会删除）**

```bash
# 浏览器访问: http://localhost:4000/index.html — 样品旧入口仍正常
# 浏览器访问: http://localhost:4000/fixture.html — 治具旧入口仍正常
```

- [ ] **Step 4: 门户验证**

```bash
# 浏览器访问: http://localhost:4000/
# [ ] 动态渲染样品 + 治具两张卡片
# [ ] 点击样品卡片 → 跳转到 /subsystems/samples/frontend/index.html
# [ ] 点击治具卡片 → 跳转到 /subsystems/fixtures/frontend/index.html
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(phase5): frontend switch regression verified — new SPAs working, old SPAs compatible"
```

---

### Phase 6: 后端切换 + 旧代码清理（7 Tasks）

> 目标：将旧 routes/*.js 路由逻辑迁移到 subsystems/*/backend/index.js 的 register() 中，删除旧 routes/、db/ DAO、public/ 旧 SPA 和 public/js/ 残留文件，拆分 db.js DDL。
> **关键约束：Phase 6 执行期间旧 SPA 不再需要工作，但新 SPA 必须始终正常。**

---

### Task 9: 拆分 db.js — 提取 DDL 到 subsystems schema.sql

**Files:**
- Modify: `db.js`（删除内嵌 DDL，保留连接池 + schema 自动加载）
- Create/Modify: `subsystems/samples/db/schema.sql`
- Create/Modify: `subsystems/fixtures/db/schema.sql`

当前 `db.js` 224 行（超 200 行上限 12%），init() 中内嵌了 5 张表的 DDL。按协议应拆分到 subsystems/*/db/schema.sql。

- [ ] **Step 1: 创建 subsystems/samples/db/schema.sql**

```sql
-- subsystems/samples/db/schema.sql
-- 样品子系统数据库表定义（幂等）

CREATE TABLE IF NOT EXISTS samples (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_no VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  spec VARCHAR(200) DEFAULT '',
  model VARCHAR(100) DEFAULT '',
  station VARCHAR(100) DEFAULT '',
  sample_type VARCHAR(20) DEFAULT '',
  limit_item VARCHAR(50) DEFAULT '',
  source_type VARCHAR(10) DEFAULT '',
  status VARCHAR(30) NOT NULL DEFAULT 'NEW',
  image TEXT,
  produced_image TEXT,
  inspect_image TEXT,
  notes TEXT,
  signed_by_rd VARCHAR(100) DEFAULT '',
  signed_by_qa VARCHAR(100) DEFAULT '',
  card_version VARCHAR(10) DEFAULT '01',
  test_standard TEXT,
  test_data TEXT,
  release_cycle_days INT DEFAULT 90,
  released_at VARCHAR(30) DEFAULT '',
  produced_at VARCHAR(30) DEFAULT '',
  next_inspect_at VARCHAR(30) DEFAULT '',
  valid_until VARCHAR(30) DEFAULT '',
  custody_dept VARCHAR(100) DEFAULT '',
  storage_location VARCHAR(200) DEFAULT '',
  retired_reason TEXT,
  retire_assigned_rd VARCHAR(10) DEFAULT NULL,
  replaced_by VARCHAR(20) DEFAULT '',
  replaces VARCHAR(20) DEFAULT '',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_samples_status (status),
  INDEX idx_samples_retire_rd (retire_assigned_rd)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS scan_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sample_id INT NOT NULL,
  target_type VARCHAR(20) DEFAULT 'sample',
  target_id INT DEFAULT NULL,
  action VARCHAR(30) NOT NULL,
  role VARCHAR(20) DEFAULT '',
  user_id INT,
  dept VARCHAR(100) DEFAULT '',
  location VARCHAR(200) DEFAULT '',
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_logs_sample (sample_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 2: 创建 subsystems/fixtures/db/schema.sql**

```sql
-- subsystems/fixtures/db/schema.sql
-- 治具子系统数据库表定义（幂等）

CREATE TABLE IF NOT EXISTS fixtures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_no VARCHAR(20) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  spec VARCHAR(200),
  model VARCHAR(100),
  station VARCHAR(100),
  category VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  requested_by INT,
  requested_dept VARCHAR(50),
  request_note TEXT,
  request_image VARCHAR(300),
  made_by INT,
  made_at DATETIME,
  made_note TEXT,
  made_image VARCHAR(300),
  verified_rd INT,
  verified_rd_at DATETIME,
  verified_me INT,
  verified_me_at DATETIME,
  transferred_at DATETIME,
  verify_note TEXT,
  used_by INT,
  used_at DATETIME,
  use_location VARCHAR(100),
  expected_return_days INT DEFAULT NULL,
  expected_return_at DATETIME DEFAULT NULL,
  use_note TEXT,
  repair_type VARCHAR(10),
  repair_requested_by INT,
  repair_requested_at DATETIME,
  repair_note TEXT,
  repaired_by INT,
  repaired_at DATETIME,
  repair_done_image VARCHAR(300),
  repair_confirmed_by INT,
  repair_confirmed_at DATETIME,
  retired_by INT,
  retired_at DATETIME,
  retired_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_fixtures_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fixture_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  fixture_id INT NOT NULL,
  action VARCHAR(30) NOT NULL,
  role VARCHAR(20),
  user_id INT,
  dept VARCHAR(50),
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_flogs_fixture (fixture_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- fixture_files 表由 db/migrations.js 迁移创建，此处保留为文档
CREATE TABLE IF NOT EXISTS fixture_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  target_id INT NOT NULL,
  category VARCHAR(50) DEFAULT '',
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500) DEFAULT '',
  mime_type VARCHAR(100) DEFAULT '',
  file_size INT DEFAULT 0,
  file_path VARCHAR(500) DEFAULT '',
  created_by INT,
  note TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fixture_files_target (target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

- [ ] **Step 3: 从 db.js 删除内嵌 DDL，保留 users 表（全局）**

修改 `db.js` 的 `init()` 函数，只保留 `users` 表的 CREATE TABLE（用户表是全局共享的，不属于任何子系统），删除 samples/scan_logs/fixtures/fixture_logs 的内嵌 DDL。schema 自动加载代码（第 161-182 行）已存在且工作正常。

删除 `db.js` 中第 39-144 行的 samples 和 fixtures/scan_logs/fixture_logs 建表语句。

- [ ] **Step 4: 验证启动**

```bash
cd /www/wwwroot/sample-mgmt && node -c db.js && npm start
# 观察启动日志：应显示 schema 已加载
# 访问两个子系统确认数据正常
```

- [ ] **Step 5: 验证 db.js 行数**

```bash
wc -l /www/wwwroot/sample-mgmt/db.js
# 目标: < 200 行
```

- [ ] **Step 6: Commit**

```bash
git add subsystems/samples/db/schema.sql subsystems/fixtures/db/schema.sql db.js
git commit -m "refactor(db): extract subsystem DDL to schema.sql, reduce db.js to <200 lines"
```

---

### Task 10: 迁移样品后端路由到 subsystems/samples/backend/index.js

**Files:**
- Modify: `subsystems/samples/backend/index.js`
- Modify: `server.js`

将 `routes/samples.js` + `routes/scan.js` + `routes/cards.js` + `routes/card-page.js` + `routes/card-html.js` + `routes/card-constants.js` 的业务逻辑迁移到 `subsystems/samples/backend/index.js` 的 `register()` 函数中。

**策略：逐个 require 旧路由文件，但改为从子系统 backend 内部调用。Phase 6 最终删除旧路由文件后，将其内容直接内联到 register() 中。**

- [ ] **Step 1: 重新实现 register() — 委托旧路由文件**

```js
// subsystems/samples/backend/index.js
function register(app) {
  // Phase 6: 子系统自行注册路由（替代 server.js 中的直接注册）
  // 当前阶段：委托旧路由文件，确保 API 行为完全不变
  require('../../../routes/samples').register(app);
  require('../../../routes/scan').register(app);
  require('../../../routes/cards').register(app);
  // card-page 和 card-html 路由在 cards.js 内部引用，无需单独注册
  // card-constants 是纯数据文件，不需要 register()
}
```

- [ ] **Step 2: 从 server.js 删除旧路由直接注册**

删除 [server.js](file:///www/wwwroot/sample-mgmt/server.js#L140-L147) 的第 140-147 行（兼容期旧路由注册块）：

```js
// Phase 2-3 兼容期：保留旧路由直接注册（Phase 6 删除）
require('./routes/samples').register(app);
require('./routes/scan').register(app);
require('./routes/cards').register(app);
require('./routes/misc').register(app);
require('./routes/fixtures').register(app);
require('./routes/fixture-files').register(app);
require('./routes/fixture-preview').register(app);
```

**重要：** `require('./routes/misc').register(app)` 不能删除 — misc.js 提供共享常量 (shared-constants.js)、看板数据、日志 API、用户管理等全局路由，不属于任何单一子系统。

server.js 的旧路由注册区变为仅保留：

```js
// 全局路由（不属于任何子系统）
require('./routes/misc').register(app);
```

- [ ] **Step 3: 验证启动**

```bash
cd /www/wwwroot/sample-mgmt && node -c server.js && node -c subsystems/samples/backend/index.js
npm start
# 确认启动日志显示「子系统已自动加载: 样品管理」
# 确认无 require 报错
```

- [ ] **Step 4: 验证样品 API 正常工作**

```bash
npm start
# 浏览器访问 http://localhost:4000/subsystems/samples/frontend/index.html
# 登录 → 看板/列表/新建/扫码/日志/用户管理 全部正常
# curl http://localhost:4000/api/samples?limit=5 → 正常返回数据
# curl http://localhost:4000/api/scan/stats → 正常返回
# curl http://localhost:4000/card/SM-000001 → 正常返回标示卡页面
```

- [ ] **Step 5: Commit**

```bash
git add subsystems/samples/backend/index.js server.js
git commit -m "feat(samples): migrate backend route registration to subsystem register()"
```

---

### Task 11: 迁移治具后端路由到 subsystems/fixtures/backend/index.js

**Files:**
- Modify: `subsystems/fixtures/backend/index.js`

将 `routes/fixtures.js` + `routes/fixture-files.js` + `routes/fixture-preview.js` + `routes/fixture-helpers.js` + `routes/fixture-actions-*.js` 的业务逻辑委托到 `subsystems/fixtures/backend/index.js`。

- [ ] **Step 1: 重新实现 register()**

```js
// subsystems/fixtures/backend/index.js
function register(app) {
  // Phase 6: 子系统自行注册路由
  require('../../../routes/fixtures').register(app);
  require('../../../routes/fixture-files').register(app);
  require('../../../routes/fixture-preview').register(app);
  // fixture-helpers 和 fixture-actions-* 在 fixtures.js 内部引用，无需单独注册
}
```

- [ ] **Step 2: 验证启动**

```bash
cd /www/wwwroot/sample-mgmt && node -c subsystems/fixtures/backend/index.js && node -c server.js
npm start
# 确认启动日志显示「子系统已自动加载: 治具管理」
```

- [ ] **Step 3: 验证治具 API 正常工作**

```bash
npm start
# 浏览器访问 http://localhost:4000/subsystems/fixtures/frontend/index.html
# 登录 → 看板/清单/新建/扫码/日志 全部正常
# curl http://localhost:4000/api/fixtures?limit=5 → 正常返回
```

- [ ] **Step 4: Commit**

```bash
git add subsystems/fixtures/backend/index.js
git commit -m "feat(fixtures): migrate backend route registration to subsystem register()"
```

---

### Task 12: 删除旧 routes/ 文件

**Files:**
- Delete: `routes/samples.js`
- Delete: `routes/scan.js`
- Delete: `routes/cards.js`
- Delete: `routes/card-page.js`
- Delete: `routes/card-html.js`
- Delete: `routes/card-constants.js`
- Delete: `routes/fixtures.js`
- Delete: `routes/fixture-files.js`
- Delete: `routes/fixture-preview.js`
- Delete: `routes/fixture-helpers.js`
- Delete: `routes/fixture-actions-cycle.js`
- Delete: `routes/fixture-actions-make.js`
- Delete: `routes/fixture-actions-repair.js`
- Delete: `routes/fixture-actions-special.js`

**保留：**
- `routes/auth.js` — 鉴权，全局必需
- `routes/subsystems.js` — 子系统管理 API，全局必需
- `routes/misc.js` — 看板/日志 API、shared-constants 生成，全局必需

- [ ] **Step 1: 删除旧样品路由**

```bash
cd /www/wwwroot/sample-mgmt
rm routes/samples.js routes/scan.js routes/cards.js routes/card-page.js routes/card-html.js routes/card-constants.js
```

- [ ] **Step 2: 删除旧治具路由**

```bash
cd /www/wwwroot/sample-mgmt
rm routes/fixtures.js routes/fixture-files.js routes/fixture-preview.js routes/fixture-helpers.js
rm routes/fixture-actions-cycle.js routes/fixture-actions-make.js routes/fixture-actions-repair.js routes/fixture-actions-special.js
```

- [ ] **Step 3: 验证启动无报错**

```bash
cd /www/wwwroot/sample-mgmt && node -c server.js && npm start
# 确认日志无 require 报错
# 确认子系统加载正常
```

- [ ] **Step 4: 全量 API 验证**

```bash
# 样品 API
curl http://localhost:4000/api/samples?limit=3
curl http://localhost:4000/api/scan/stats
curl http://localhost:4000/card/SM-000001

# 治具 API
curl http://localhost:4000/api/fixtures?limit=3
curl http://localhost:4000/api/fixtures/dashboard

# 全局 API
curl http://localhost:4000/api/subsystems
curl http://localhost:4000/api/me  # 需要 session
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): delete old routes/ files, now served by subsystem register()"
```

---

### Task 13: 删除旧 db/ DAO 和旧种子文件

**Files:**
- Delete: `db/samples.js`
- Delete: `db/fixtures.js`
- Delete: `db/logs.js`
- Delete: `db/fixture-files.js`
- Delete: `seed-samples.js`
- Delete: `seed-fixture.js`

**保留：**
- `db.js` — 连接池 + 全局 Schema 加载
- `db/users.js` — 用户 DAO，全局必需
- `db/migrations.js` — 数据库迁移
- `db/tx.js` — 事务工具
- `seed.js` — 用户种子
- `seed-rich.js` — 演示数据

修改 `db.js` 中移除对旧 DAO 的 require，改用子系统 DAO 自动加载（已在 Phase 4 实现）。

- [ ] **Step 1: 检查旧 DAO 引用**

```bash
cd /www/wwwroot/sample-mgmt
grep -rn "db/samples\|db/fixtures\|db/logs\|db/fixture-files" --include='*.js' . --exclude-dir=node_modules | grep -v '.git'
```

确认只有 `db.js` 引用这些 DAO。

- [ ] **Step 2: 从 db.js 删除旧 DAO require 和展开**

删除 [db.js](file:///www/wwwroot/sample-mgmt/db.js#L212-L216) 的第 212-216 行：

```js
const users = require('./db/users')({ q, one, dbRef });
const samples = require('./db/samples')({ q, one, dbRef, nowISO });
const logs = require('./db/logs')({ q, dbRef });
const fixtures = require('./db/fixtures')({ q, one, dbRef, nowISO });
const fixtureFiles = require('./db/fixture-files')({ q, one, dbRef, nowISO });
```

替换为仅保留 users DAO，其他 DAO 从子系统路径加载：

```js
const users = require('./db/users')({ q, one, dbRef });

// ★ 子系统 DAO 自动加载（Phase 4）
const fs = require('fs');
const path = require('path');
const subsystemsDir = path.join(__dirname, 'subsystems');
const subsystemDAOs = {};
if (fs.existsSync(subsystemsDir)) {
  const entries = fs.readdirSync(subsystemsDir, { withFileTypes: true });
  entries.forEach(entry => {
    if (!entry.isDirectory()) return;
    const daoPath = path.join(subsystemsDir, entry.name, 'db', 'dao.js');
    if (fs.existsSync(daoPath)) {
      try {
        const dao = require(daoPath)({ q, one, dbRef: { run: dbRef.run }, nowISO });
        subsystemDAOs[entry.name] = dao;
        // 兼容旧代码：将各 DAO 函数展平到顶层
        Object.keys(dao).forEach(fn => { dao[fn] = dao[fn]; });
      } catch (e) {
        console.error('[DB] 加载子系统 DAO 失败: ' + daoPath, e.message);
      }
    }
  });
}
```

更新 module.exports：

```js
module.exports = {
  init, ready, pool: getPool, nowISO, withTransaction,
  ...users,
  ...(subsystemDAOs.samples || {}),
  ...(subsystemDAOs.fixtures || {}),
};
```

> **注意：** 展平后，`D.listSamples`、`D.createSample`、`D.listFixtures` 等 API 保持不变，上游调用方 `routes/misc.js` 等不需要修改。

- [ ] **Step 3: 删除旧 DAO 文件**

```bash
cd /www/wwwroot/sample-mgmt
rm db/samples.js db/fixtures.js db/logs.js db/fixture-files.js
```

- [ ] **Step 4: 删除旧种子文件**

```bash
cd /www/wwwroot/sample-mgmt
rm seed-samples.js seed-fixture.js
```

- [ ] **Step 5: 验证启动 + DAO 加载**

```bash
cd /www/wwwroot/sample-mgmt && node -c db.js && npm start
# 确认 API 正常:
# curl http://localhost:4000/api/samples?limit=3
# curl http://localhost:4000/api/fixtures?limit=3
# curl http://localhost:4000/api/subsystems
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(cleanup): delete old db/ DAOs + seed files, use subsystem DAO auto-loading"
```

---

### Task 14: 删除旧 SPA 入口 + public/js/ 残留文件

**Files:**
- Delete: `public/index.html`（样品旧 SPA）
- Delete: `public/fixture.html`（治具旧 SPA）
- Delete: `public/js/` 中 Phase 5 保留的残留文件（api.js, fixture-api.js, fixture-file-api.js, fixture-file-ui.js, modal.js, shared/ 目录, ui.js）

**保留：**
- `public/portal.html` — 门户首页
- `public/admin-subsystems.html` — 子系统管理面板
- `public/css/app.css` — 全局样式
- `public/css/help.css` — 帮助样式
- `public/vendor/` — 第三方库
- `public/uploads/` — 上传目录
- `public/js/subsystem-manager.js` — 管理面板 JS

数据流说明：`routes/misc.js` 提供 `GET /js/shared-constants.js` 端点动态生成共享常量（样品 SPA 仍引用此路径）。`constants.js` 已迁移至子系统内部路径 `/subsystems/samples/frontend/js/constants.js`。

- [ ] **Step 1: 删除旧 SPA 入口**

```bash
cd /www/wwwroot/sample-mgmt
rm public/index.html public/fixture.html
```

- [ ] **Step 2: 删除 public/js/ 残留文件（Phase 5 时保留的）**

```bash
cd /www/wwwroot/sample-mgmt
rm public/js/api.js
rm public/js/fixture-api.js
rm public/js/fixture-file-api.js
rm public/js/fixture-file-ui.js
rm public/js/modal.js
rm public/js/ui.js
rm public/js/constants.js
rm -rf public/js/shared/
```

shared/ 下的 utils.js 和 api-base.js 已在 shared/frontend/ 路径提供服务，不再需要 public/js/shared/。

**保留：**
- `public/js/subsystem-manager.js`（管理面板仍引用）

- [ ] **Step 3: 验证 portal.html 引用路径**

portal.html 当前引用 `/css/app.css?v=20260803`，无需修改。如果管理面板 `public/admin-subsystems.html` 引用了 `public/js/` 中已删除的文件，需检查并修复。

```bash
cd /www/wwwroot/sample-mgmt
grep -rn "src=" public/admin-subsystems.html
```

- [ ] **Step 4: 验证新 SPA 正常**

```bash
cd /www/wwwroot/sample-mgmt && npm start
# 浏览器访问:
# http://localhost:4000/ → 门户正常，2 张卡片
# http://localhost:4000/subsystems/samples/frontend/index.html → 全部功能正常
# http://localhost:4000/subsystems/fixtures/frontend/index.html → 全部功能正常
# http://localhost:4000/admin-subsystems.html → 管理面板正常
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(cleanup): delete old SPAs and remaining public/js/ files"
```

---

### Task 15: 全链路回归验证 + 部署指引

- [ ] **Step 1: 完整功能回归清单**

```bash
cd /www/wwwroot/sample-mgmt && npm start

# === 门户 ===
# [ ] http://localhost:4000/ → 动态渲染样品 + 治具卡片
# [ ] 点击样品卡片 → 进入 /subsystems/samples/frontend/index.html
# [ ] 点击治具卡片 → 进入 /subsystems/fixtures/frontend/index.html

# === 样品子系统（全部角色） ===
# admin/admin123:
# [ ] 看板/列表/新建/扫码/日志/用户管理 全部正常
# rd01/rd123:
# [ ] 列表/新建/扫码(PRODUCE) 正常
# qa01/qa123:
# [ ] 列表/扫码(RELEASE/INSPECT/EDIT_CARD) 正常
# mfg01/mfg123:
# [ ] 列表/扫码(CUSTODY/RETURN_REQUEST) 正常
# me01/me123:
# [ ] 列表/扫码(CUSTODY) 正常

# === 治具子系统（全部角色） ===
# admin/admin123:
# [ ] 看板/清单/新建/扫码/日志 全部正常，报废操作正常
# rd01/rd123:
# [ ] 清单/新建/扫码(ACCEPT/MAKE/VERIFY_RD) 正常
# me01/me123:
# [ ] 清单/扫码(USE/RETURN/REPAIR_ME/REPAIR_CONFIRM) 正常

# === API 端点 ===
# [ ] GET /api/subsystems → 返回 samples + fixtures
# [ ] GET /api/samples?limit=5 → 返回 5 条
# [ ] GET /api/fixtures?limit=5 → 返回 5 条
# [ ] GET /api/scan/stats → 正常返回
# [ ] GET /api/fixtures/dashboard → 正常返回
# [ ] POST /api/login → 正常登录
# [ ] GET /card/SM-000001 → 标示卡正常

# === 子系统管理面板 ===
# [ ] http://localhost:4000/admin-subsystems.html 正常
# [ ] 查看列表（samples/fixtures/new-module）
# [ ] 导出 manifest 正常
```

- [ ] **Step 2: 文件清理确认**

```bash
cd /www/wwwroot/sample-mgmt

# 确认已删除的文件
[ ! -f public/index.html ] && echo "✓ 旧样品 SPA 已删除" || echo "✗ public/index.html 仍存在"
[ ! -f public/fixture.html ] && echo "✓ 旧治具 SPA 已删除" || echo "✗ public/fixture.html 仍存在"
[ ! -f routes/samples.js ] && echo "✓ 旧路由 samples.js 已删除" || echo "✗ routes/samples.js 仍存在"
[ ! -f routes/fixtures.js ] && echo "✓ 旧路由 fixtures.js 已删除" || echo "✗ routes/fixtures.js 仍存在"
[ ! -f db/samples.js ] && echo "✓ 旧 DAO samples.js 已删除" || echo "✗ db/samples.js 仍存在"

# 确认保留的关键文件
[ -f routes/auth.js ] && echo "✓ routes/auth.js 保留" || echo "✗ routes/auth.js 丢失"
[ -f routes/subsystems.js ] && echo "✓ routes/subsystems.js 保留" || echo "✗ routes/subsystems.js 丢失"
[ -f routes/misc.js ] && echo "✓ routes/misc.js 保留" || echo "✗ routes/misc.js 丢失"
[ -f shared/state-machine.js ] && echo "✓ 状态机引擎保留" || echo "✗ 状态机引擎丢失"
[ -f shared/file-manager.js ] && echo "✓ 文件管理器保留" || echo "✗ 文件管理器丢失"
```

- [ ] **Step 3: 文件容量最终验证**

```bash
cd /www/wwwroot/sample-mgmt
echo "=== db.js ==="
wc -l db.js
echo "=== server.js ==="
wc -l server.js
echo "=== subsys JS总计 ==="
find subsystems/ -name '*.js' | xargs wc -l | tail -1
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(phase6): full migration verified — all old files cleaned, subsystems fully self-contained"
```

---

### 风险与回滚

| 风险 | 影响 | 缓解 |
|---|---|---|
| 子系统 DAO 加载后 API 函数名冲突 | 运行时错误 | Task 13 中 DAO 按子系统 id 隔离，展平时检查重复 |
| 删除 public/js/ 后旧 SPA 报错 | 旧 SPA 不可用 | Phase 5 先确保新 SPA 独立工作，再 Phase 6 删除旧 SPA |
| misc.js 对外暴露 DAO 函数调用 | API 报错 | misc.js 通过 `D.fnName` 调用，DAO 展平后需验证一致性 |
| card-html/card-page 路由丢失 | 标示卡 404 | Task 10 Step 1 确保 cards.js 委托在 samples backend 中 |

**回滚方案：**
- Phase 5 期间：`git checkout` 恢复 public/js/ 被删除的文件，SPA 改回旧路径引用
- Phase 6 期间：恢复旧 routes/ + db/ DAO + server.js 直接注册，子系统 backend register() 变回空桩

---

### 完成后项目目录预期

```
/www/wwwroot/sample-mgmt/
├── server.js                    # 框架入口（仅全局路由 + 子系统自动发现）
├── db.js                        # 连接池 + users DAO + schema 自动加载（<200行）
├── shared/                      # 框架共享层
│   ├── middleware/               # auth.js, upload.js
│   ├── state-machine.js
│   ├── file-manager.js
│   └── frontend/                # 共享前端模块（utils, api-base, modal）
├── subsystems/
│   ├── samples/
│   │   ├── manifest.json
│   │   ├── backend/index.js     # register() → 样品全部 API
│   │   ├── db/schema.sql + dao.js
│   │   ├── frontend/index.html + js/* + css/module.css
│   │   └── seed/seed.js
│   ├── fixtures/
│   │   ├── manifest.json
│   │   ├── backend/index.js     # register() → 治具全部 API
│   │   ├── db/schema.sql + dao.js
│   │   ├── frontend/index.html + js/* + css/module.css
│   │   └── seed/seed.js
│   └── new-module/              # 模板子系统
├── routes/
│   ├── auth.js                  # 鉴权（全局）
│   ├── subsystems.js            # 子系统管理 API（全局）
│   └── misc.js                  # 看板/日志/常量生成（全局）
├── db/
│   ├── users.js                 # 用户 DAO（全局）
│   ├── migrations.js
│   └── tx.js
├── public/
│   ├── portal.html              # 门户首页（动态卡片）
│   ├── admin-subsystems.html    # 子系统管理面板
│   ├── css/app.css              # 全局样式（无子系统 badge）
│   ├── css/help.css
│   ├── vendor/
│   └── uploads/
├── seed.js / seed-rich.js       # 全局种子
└── tests/
```

---
