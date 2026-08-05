# 前端阶段 2:Fluent UI Web Components 渐进迁移 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原生 HTML/JS 单页项目(无构建)中渐进引入 Fluent UI Web Components,按 6 模块迁移基础控件/卡片/badge/表格/modal/表单,每模块独立 commit 并在样品+治具双系统回归。

**Architecture:** 1) 本地 vendor 方式引入 `@fluentui/web-components` bundle(免 CDN 依赖、免构建);2) 用 `<fluent-provider>` 包裹 `#app` 与 `#login` 提供 Design Token 上下文;3) 通过 `::part()` 与 Fluent Design Token 变量把项目 `:root` 青蓝品牌色映射进 Shadow DOM;4) 控件按类型分模块迁移,每模块独立 commit,可单独 revert;5) 验证靠 browser_use 双系统回归(项目无前端单测框架)。

**Tech Stack:** Node.js + Express(静态托管)+ 原生 HTML/CSS/JS + `@fluentui/web-components@^2`(Web Components,免框架)+ browser_use(回归验证)

---

## 关键约束(全部 Task 通用,每个 subagent MUST 遵守)

1. **子系统隔离**(AGENTS.md 6.1):每模块迁移后 MUST 在样品(index.html)+ 治具(fixture.html)双系统回归。改共享文件(modal.js / app.css / api-base.js)MUST 双系统验证。
2. **行数红线**(AGENTS.md 7.1):`dashboard.js` 当前 152 行(10 顶层函数已触上限),MUST 先精简或外移再新增逻辑;`app.css` 170 行接近 200 行 utils 上限,新增 token MUST 不超限。
3. **innerHTML 兼容**:项目大量用 `el.innerHTML = '...'` 拼接 DOM。Fluent Web Components 支持通过 innerHTML 创建(自定义元素在 bundle 加载后注册),`onclick` attribute 仍工作。`<fluent-text-field>.value` 与原生 `<input>.value` 读写一致。
4. **样式穿透**:Fluent 组件 Shadow DOM 内的样式需用 `::part(...)` 或覆盖 Fluent Design Token 变量(`--accent-fill-rest` 等),不能用全局 CSS 直接选 Shadow 内节点。
5. **commit 粒度**:一个 Task 一个 commit。`git add` 仅本 Task 改动文件(工作树有大量无关 modified 文件)。NEVER `git add -A`。
6. **回归验证**:每个模块完成 MUST 用 browser_use subagent 在样品(rd01 登录)+ 治具(admin 登录)双系统走一遍:看板渲染、列表加载、扫码台、modal 开关、表单提交。无 console error。
7. **臃肿检测报告**:每模块完成 MUST 输出 3 项(文件类型/行数/距上限、函数数/是否触阈值、冗余清单+瘦身方案)。

---

## 文件结构(本计划涉及)

| 文件 | 职责 | 本计划改动 |
|---|---|---|
| `package.json` | 依赖清单 | +`@fluentui/web-components` |
| `public/vendor/fluentui-web-components.js` | Fluent bundle 本地副本(新建) | 模块0 新建 |
| `public/index.html` | 样品入口 | 模块0 加 script + provider;模块1 改 #login;模块4/6 按需 |
| `public/fixture.html` | 治具入口 | 同上(双系统对称改) |
| `public/css/app.css` | 全局样式 | 模块0 加 token 映射;模块1-6 按需加 ::part 覆盖 |
| `public/js/dashboard.js` | 样品看板 | 模块2 .kb-stat→fluent-card |
| `public/js/dashboard-todo.js` | 样品看板待办 | 模块1/3 按需 |
| `public/js/fixture-dashboard.js` | 治具看板 | 模块2 .kb-stat→fluent-card |
| `public/js/modal.js` | 通用弹窗(双系统共用) | 模块5 .modal→fluent-dialog |
| `public/js/shared/api-base.js` | 登录+statusBadge+boot | 模块3 statusBadge→fluent-badge;模块1 按需 |
| `public/js/samples.js` | 样品列表/详情 | 模块1/3/4 按需 |
| `public/js/fixture-list.js` | 治具列表 | 模块1/3/4 按需 |
| `public/js/new.js` | 新建样品表单 | 模块6 表单控件 |
| `public/js/fixture-new.js` | 新建治具表单 | 模块6 表单控件 |
| `server.js` | 静态托管 | 模块0 挂载 /vendor 路由(若需) |

---

## 模块 0:基础设施引入(依赖 + Provider + Token 映射)

> **风险**:低(仅引入,不替换控件)。**前置**:无。**目标**:Fluent 控件可用、双系统无破坏。

### Task 0.1:安装依赖并本地化 bundle

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/package.json`(dependencies + 锁版本)
- Create: `/www/wwwroot/sample-mgmt/public/vendor/fluentui-web-components.js`

- [ ] **Step 1: 安装固定版本依赖**

Run(在 `/www/wwwroot/sample-mgmt`):
```bash
npm install @fluentui/web-components@^2.0.0
```
Expected: `package.json` dependencies 出现 `"@fluentui/web-components": "^2.0.0"`,`package-lock.json` 更新。

- [ ] **Step 2: 定位 bundle 入口文件**

Run:
```bash
ls node_modules/@fluentui/web-components/dist/
```
Expected: 看到 `web-components.min.js` 或类似 bundle 文件(可能含 `.js` / `.mjs`)。记录确切文件名。

- [ ] **Step 3: 复制 bundle 到 public/vendor**

Run:
```bash
mkdir -p public/vendor
cp node_modules/@fluentui/web-components/dist/web-components.min.js public/vendor/fluentui-web-components.js
ls -lh public/vendor/fluentui-web-components.js
```
Expected: 文件存在,大小通常 1-3MB。

- [ ] **Step 4: 验证 express 静态托管已覆盖 /vendor**

Read `server.js` 确认有 `app.use(express.static('public'))` 或等价配置。若已存在,`/vendor/fluentui-web-components.js` 自动可访问;若无,在 server.js 添加(参考现有 static 中间件位置)。

- [ ] **Step 5: 提交**

```bash
git add package.json package-lock.json public/vendor/fluentui-web-components.js
git commit -m "chore(fluentui): add @fluentui/web-components@^2 vendor bundle"
```

### Task 0.2:index.html 引入 script + fluent-provider 包裹

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/index.html`

- [ ] **Step 1: 在 `<head>` 加载 Fluent bundle**

在 `index.html` 第 9 行(`<link rel="stylesheet" href="/css/help.css" />` 之后)插入:
```html
<script type="module" src="/vendor/fluentui-web-components.js"></script>
```

- [ ] **Step 2: 用 `<fluent-provider>` 包裹 `#login` 与 `#app`**

把 `index.html` 第 13-49 行(`<div id="login">...</div>` + `<div id="app">...</div>`)整体用 `<fluent-provider>` 包裹:
```html
<fluent-provider id="provider" style="background:var(--bg);color:var(--text)">
  <div id="login" style="display:none">...</div>
  <div id="app" style="display:none">...</div>
</fluent-provider>
```
注意:`<div class="toast" id="toast"></div>` 留在 provider 外(toast 用 fixed 定位,不需 token 上下文)。

- [ ] **Step 3: 版本号 bump**

`index.html` 中 `app.css?v=20260807` → `app.css?v=20260810`,所有 `js/*.js?v=` 也 +1(强制刷新)。

- [ ] **Step 4: 验证样品页加载无 console error**

用 browser_use subagent 访问 `http://localhost:4000/index.html`,F12 console 应无 error。`document.querySelector('fluent-provider')` 存在。登录页正常显示。

### Task 0.3:fixture.html 对称改造

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/fixture.html`

- [ ] **Step 1: 镜像 Task 0.2 改动到 fixture.html**

在 fixture.html `<head>` 第 8 行后加 `<script type="module" src="/vendor/fluentui-web-components.js"></script>`。用 `<fluent-provider>` 包裹 `#login` + `#app`(第 12-40 行)。版本号 bump 到 `v=20260810`。

- [ ] **Step 2: 验证治具页加载无 console error**

browser_use 访问 `http://localhost:4000/fixture.html`,console 无 error,登录页正常。

### Task 0.4:app.css 添加 Design Token 映射

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(在 `:root` 内追加)

- [ ] **Step 1: 在 :root 追加 Fluent token 映射**

在 `app.css` 第 9 行(`color-scheme:light;`)之前插入:
```css
  /* Fluent Design Token 映射(青蓝品牌色 → Fluent accent) */
  --accent-fill-rest:#0f766e;
  --accent-fill-hover:#115e59;
  --accent-fill-active:#134e4a;
  --accent-foreground-rest:#fff;
  --neutral-background-2:#f8fafc;
  --neutral-foreground-1:#0f172a;
  --neutral-foreground-2:#64748b;
  --neutral-stroke-1:#e2e8f0;
  --neutral-stroke-2:#f1f5f9;
  --stroke-control-strong:#0f172a;
```

- [ ] **Step 2: 验证 token 生效**

browser_use 在 console 执行 `getComputedStyle(document.documentElement).getPropertyValue('--accent-fill-rest')` 应返回 `#0f766e`。

### Task 0.5:双系统回归 + commit 模块 0

- [ ] **Step 1: browser_use 双系统回归**

派 browser_use subagent:
- 样品:访问 `index.html`,rd01/rd123 登录,看板渲染、列表加载、扫码台进入、modal 开关、退出登录。截图 + console 日志。
- 治具:访问 `fixture.html`,admin/admin123 登录,看板、列表、扫码台、modal、退出。截图 + console 日志。
- 验收:无 console error,所有功能与阶段1 完成态一致(仅多了 provider 包裹,无控件替换)。

- [ ] **Step 2: commit 模块 0**

```bash
git add public/index.html public/fixture.html public/css/app.css
git commit -m "feat(fluentui): wire up provider + token mapping (stage2 module0)"
```

- [ ] **Step 3: 输出臃肿检测报告**

对 `index.html` / `fixture.html` / `app.css` 输出 3 项(类型/行数/距上限、函数数/阈值、冗余清单)。

---

## 模块 1:基础控件(button / input / select)

> **风险**:中(影响面最广,201 处中约 60% 是 button/input/select)。**策略**:先登录页(隔离、静态),再按子系统分批,每批 commit。

### Task 1.1:登录页控件替换(双系统)

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/index.html`(第 13-32 行 #login 区)
- Modify: `/www/wwwroot/sample-mgmt/public/fixture.html`(第 12-23 行 #login 区)

- [ ] **Step 1: 替换 index.html #login 的 input/button**

把 `index.html` 第 18-21 行:
```html
<input id="lg-user" placeholder="如 rd01 / qa01 / mfg01 / admin" />
...
<input id="lg-pass" type="password" placeholder="密码" onkeydown="if(event.key==='Enter')doLogin()" />
<button class="btn" style="width:100%;margin-top:18px" onclick="doLogin()">登录</button>
```
替换为:
```html
<fluent-text-field id="lg-user" placeholder="如 rd01 / qa01 / mfg01 / admin" appearance="outline"></fluent-text-field>
...
<fluent-text-field id="lg-pass" type="password" placeholder="密码" appearance="outline" onkeydown="if(event.key==='Enter')doLogin()"></fluent-text-field>
<fluent-button appearance="accent" style="width:100%;margin-top:18px" onclick="doLogin()">登录</fluent-button>
```
**兼容性关键**: `doLogin()` 在 [api-base.js](file:///www/wwwroot/sample-mgmt/public/js/shared/api-base.js) 中读 `$('#lg-user').value`,`<fluent-text-field>.value` 与原生一致,无需改 JS。

- [ ] **Step 2: 镜像替换 fixture.html #login**

fixture.html 第 17-20 行同样替换为 `<fluent-text-field>` + `<fluent-button appearance="accent">`。

- [ ] **Step 3: app.css 添加 fluent-text-field 宽度修正**

Fluent text-field 默认非 100% 宽。在 `app.css` 第 22 行后追加:
```css
fluent-text-field{width:100%;box-sizing:border-box}
fluent-button[appearance="accent"]{width:auto}
```

- [ ] **Step 4: browser_use 验证双系统登录**

browser_use subagent:
- 样品:输入 rd01/rd123,点登录按钮,应成功进入看板。
- 样品:清空,输入错误密码,应显示 .login-err。
- 样品:在密码框按 Enter,应触发登录。
- 治具:同上(admin/admin123 + 错误密码 + Enter)。
- 验收:6 个场景全过,console 无 error。

- [ ] **Step 5: commit**

```bash
git add public/index.html public/fixture.html public/css/app.css
git commit -m "feat(fluentui): migrate login controls to fluent-text-field/fluent-button"
```

### Task 1.2:样品子系统 .btn → fluent-button

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/dashboard.js`(_renderQuickActions / _renderPager)
- Modify: `/www/wwwroot/sample-mgmt/public/js/dashboard-todo.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/samples.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/new.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan-wizard.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan-return-actions.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/detail.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/users.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/board.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/logs.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/help.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/print-queue.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan-camera.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/card-fields.js`

> **替换规则**(机械执行,所有 subagent 一致):
> 1. `<button class="btn"` → `<fluent-button appearance="accent"`
> 2. `<button class="btn ghost"` → `<fluent-button appearance="neutral"`
> 3. `<button class="btn ghost sm"` → `<fluent-button appearance="neutral" size="small"`
> 4. `<button class="btn sm"` → `<fluent-button appearance="accent" size="small"`
> 5. `</button>` → `</fluent-button>`
> 6. `.btn` 在 CSS 选择器中保留(过渡期不删,模块0 完成后 .btn 类不再被新 HTML 用)
> 7. **特例**:`.nav button`(侧边栏导航)是 `background:none;border:none`,不替换为 fluent-button(保持原生以保留自定义样式),仅加 `class="nav-btn"` 便于后续处理。

- [ ] **Step 1: dashboard.js 替换**

把 `dashboard.js` 第 100-102 行 `_renderQuickActions`:
```js
return '<button class="btn" onclick="location.hash=\'' + a.h + '\'">' + a.t + '</button>';
```
替换为:
```js
return '<fluent-button appearance="accent" onclick="location.hash=\'' + a.h + '\'">' + a.t + '</fluent-button>';
```

把第 151 行 `_renderPager` 两个 `<button class="btn sm"` 替换为 `<fluent-button appearance="accent" size="small"`(注意保留 disabled 属性与 onclick)。

- [ ] **Step 2: 批量替换其余 13 个 JS 文件**

对 `samples.js` / `new.js` / `scan.js` / `scan-wizard.js` / `scan-return-actions.js` / `detail.js` / `users.js` / `board.js` / `logs.js` / `help.js` / `print-queue.js` / `scan-camera.js` / `card-fields.js` / `dashboard-todo.js` 按上述 7 条规则机械替换。每个文件替换后用 `grep -n '<button' public/js/该文件.js` 确认无残留 `<button`(除 `.nav button` 特例)。

- [ ] **Step 3: app.css 加 fluent-button 宽度修正**

`app.css` 追加:
```css
.dash-actions fluent-button{margin-right:8px}
.dash-pager fluent-button{padding:4px 12px}
```

- [ ] **Step 4: browser_use 双系统回归(样品侧)**

browser_use subagent(样品,rd01 登录):
- 看板:快捷操作按钮、分页按钮(若有)可点击。
- 样品列表:筛选/操作按钮可点击。
- 新建样品:表单按钮可点击。
- 扫码台:扫码相关按钮可点击。
- 详情:modal 内按钮、操作按钮可点击。
- 用户管理(admin):按钮可点击。
- 验收:所有按钮渲染为 Fluent 风格(青蓝填充/neutral 描边),点击有按压反馈,功能正常,console 无 error。

- [ ] **Step 5: commit**

```bash
git add public/js/*.js public/css/app.css
git commit -m "feat(fluentui): migrate sample .btn to fluent-button (stage2 module1 sample)"
```

### Task 1.3:治具子系统 .btn → fluent-button

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-dashboard.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-list.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-detail.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-new.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-scan.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-logs.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-file-ui.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-photo-upload.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-router.js`

- [ ] **Step 1: 按 Task 1.2 规则批量替换 9 个 fixture-*.js**

同 Task 1.2 Step 2 规则。每个文件替换后 `grep -n '<button' public/js/fixture-*.js` 确认无残留(除 `.nav button`)。

- [ ] **Step 2: browser_use 双系统回归(治具侧)**

browser_use subagent(治具,admin 登录):
- 看板:逾期表、待办表按钮。
- 治具列表:筛选/操作按钮。
- 新建治具:表单按钮。
- 治具扫码台:扫码按钮。
- 治具详情:modal 按钮。
- 验收:全部 Fluent 风格,功能正常,console 无 error。

- [ ] **Step 3: commit**

```bash
git add public/js/fixture-*.js
git commit -m "feat(fluentui): migrate fixture .btn to fluent-button (stage2 module1 fixture)"
```

### Task 1.4:样品子系统 input/select → fluent-text-field/fluent-select

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/samples.js`(列表筛选)
- Modify: `/www/wwwroot/sample-mgmt/public/js/new.js`(新建表单)
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan.js`(扫码输入)
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan-wizard.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/scan-return-actions.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/detail.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/users.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/card-fields.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/print-queue.js`

> **替换规则**:
> 1. `<input` → `<fluent-text-field`(配对 `</fluent-text-field>`,自闭合也行)
> 2. `<select` → `<fluent-select`(配对 `</fluent-select>`),`<option>` → `<fluent-option>`
> 3. `<textarea` → `<fluent-text-area`
> 4. **JS 取值不变**: `el.value` 在 fluent-text-field / fluent-select 上与原生一致。
> 5. **特例不换**:
>    - `<input type="file">`(文件上传,Web Components 处理 file 检查器复杂,保留原生)
>    - `<input type="hidden">`(无 UI,保留)
>    - `.scan-input` 扫码输入框(需 letter-spacing 等特殊样式,Shadow DOM 内难定制,保留原生,仅外层加 class)
>    - `#cam` 摄像头 video(非 input)

- [ ] **Step 1: samples.js 列表筛选 input/select 替换**

定位 `samples.js` 中 `.filters` 区的 `<select` 与 `<input`,按规则替换。注意 `<select>` 内的 `<option value="...">` 全换为 `<fluent-option value="...">`。

- [ ] **Step 2: new.js 新建样品表单替换**

定位表单内 `<input` 与 `<select`(除 file/hidden),按规则替换。`.required` 红星保留在 label 中。

- [ ] **Step 3: 其余 7 个文件按规则替换**

`scan.js`(扫码输入保留原生,其余替换)/ `scan-wizard.js` / `scan-return-actions.js` / `detail.js`(详情 modal 内表单)/ `users.js`(用户管理表单)/ `card-fields.js` / `print-queue.js`。

- [ ] **Step 4: app.css 加 fluent-text-field/fluent-select 宽度与对齐**

```css
.filters fluent-text-field,.filters fluent-select{max-width:200px;margin-right:8px}
fluent-text-field[appearance="outline"]{--control-corner-radius:8px}
```

- [ ] **Step 5: browser_use 双系统回归(样品侧)**

browser_use subagent(rd01 登录):
- 样品列表:筛选下拉、搜索框可输入可筛选。
- 新建样品:所有字段可输入,下拉可选,提交成功。
- 扫码台:扫码输入框(原生保留)正常,其余按钮 Fluent 风格。
- 详情 modal:内嵌表单字段可用。
- 用户管理(admin):新增/编辑用户表单可用。
- 验收:所有 fluent-text-field 输入框有 outline 描边,focus 时青蓝高亮,select 下拉正常展开,功能正常,console 无 error。

- [ ] **Step 6: commit**

```bash
git add public/js/*.js public/css/app.css
git commit -m "feat(fluentui): migrate sample input/select to fluent-text-field/fluent-select"
```

### Task 1.5:治具子系统 input/select → fluent-text-field/fluent-select

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-list.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-new.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-scan.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-detail.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-file-ui.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-photo-upload.js`

- [ ] **Step 1: 按 Task 1.4 规则批量替换 6 个 fixture-*.js**

同 Task 1.4 规则与特例。

- [ ] **Step 2: browser_use 双系统回归(治具侧)**

browser_use subagent(admin 或 me01 登录):
- 治具列表:筛选下拉、搜索框可用。
- 新建治具:表单字段可输入可提交。
- 治具扫码台:扫码输入正常。
- 治具详情:modal 内表单可用。
- 文件上传:file input 保留原生,可上传。
- 验收:功能正常,console 无 error。

- [ ] **Step 3: commit**

```bash
git add public/js/fixture-*.js
git commit -m "feat(fluentui): migrate fixture input/select to fluent-text-field/fluent-select"
```

### Task 1.6:模块 1 整体回归 + 臃肿报告

- [ ] **Step 1: browser_use 全量双系统回归**

派 browser_use subagent 走完整流程(样品 rd01 + 治具 admin):登录、看板、列表、扫码、详情 modal、表单提交、退出。截图 + console。

- [ ] **Step 2: 输出臃肿检测报告**

对每个修改文件输出 3 项。重点关注 `dashboard.js`(已 152 行,模块1 若加注释可能超限,需评估)。

---

## 模块 2:stat 卡片(.kb-stat → fluent-card)

> **风险**:低(仅看板统计卡)。**前置**:模块 0。**目标**:看板 stat 卡片用 fluent-card。

### Task 2.1:dashboard.js .kb-stat → fluent-card

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/dashboard.js`(_renderStats 第 65-68 行)
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(.kb-stat 样式调整)

- [ ] **Step 1: _renderStats 卡片 HTML 替换**

把 `dashboard.js` 第 68 行:
```js
return '<div class="kb-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterKbStat(' + idx + ',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></div>';
```
替换为:
```js
return '<fluent-card class="kb-stat" style="--stat-color:' + (STAT_COLORS[x[2]] || 'var(--brand)') + '" onclick="filterKbStat(' + idx + ',this)" ondblclick="location.hash=\'' + href + '\'" title="单击筛选待办·双击查看列表"><div class="n">' + x[1] + '</div><div class="l">' + x[0] + '</div></fluent-card>';
```
注意:`filterKbStat(this)` 中 `this` 传的是 fluent-card 元素,后续 `el.classList.add('active')` 仍工作(classList 在自定义元素上可用)。

- [ ] **Step 2: app.css .kb-stat 适配 fluent-card**

fluent-card 内部有 Shadow DOM padding。在 `app.css` `.kb-stat` 规则(第 135 行)后追加:
```css
.kb-stat::part(control){background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
fluent-card.kb-stat{padding:0;background:transparent}
```
保留原 `.kb-stat::before`(左侧色条)、`.kb-stat .n`、`.kb-stat .l`。

- [ ] **Step 3: browser_use 验证样品看板**

browser_use subagent(rd01 登录):
- 看板统计卡片渲染为 Fluent card 风格(有阴影、圆角)。
- 单击卡片筛选待办,双击跳转列表。
- 卡片左侧色条、数字、标签正常。
- 验收:功能正常,console 无 error。

- [ ] **Step 4: commit**

```bash
git add public/js/dashboard.js public/css/app.css
git commit -m "feat(fluentui): migrate sample .kb-stat to fluent-card (stage2 module2)"
```

### Task 2.2:fixture-dashboard.js .kb-stat → fluent-card

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-dashboard.js`(_renderDashContent 第 33-38 行)

- [ ] **Step 1: 统计卡片 HTML 替换**

把 `fixture-dashboard.js` 第 37 行:
```js
return '<div class="kb-stat' + cls + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></div>';
```
替换为:
```js
return '<fluent-card class="kb-stat' + cls + '" onclick="filterDashStats(' + i + ')"><div class="n">' + count + '</div><div class="l">' + cfg.label + '</div></fluent-card>';
```

- [ ] **Step 2: browser_use 验证治具看板**

browser_use subagent(admin 登录):
- 治具看板统计卡片 Fluent card 风格。
- 单击卡片筛选待办。
- 验收:功能正常,console 无 error。

- [ ] **Step 3: commit**

```bash
git add public/js/fixture-dashboard.js
git commit -m "feat(fluentui): migrate fixture .kb-stat to fluent-card"
```

---

## 模块 3:badge(.b-* → fluent-badge)

> **风险**:中(badge 散布全局,statusBadge 是核心函数)。**前置**:模块 0。

### Task 3.1:statusBadge 函数改造 + .b-* 映射

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/shared/api-base.js`(statusBadge 定义)
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-api.js`(治具 statusBadge,若独立)
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(.b-* 保留作过渡)

- [ ] **Step 1: 定位 statusBadge 定义**

Read `api-base.js` 与 `fixture-api.js`,找到 `function statusBadge(s)` 定义。记录当前返回格式(通常是 `<span class="b-XXX">标签</span>`)。

- [ ] **Step 2: 改造 statusBadge 返回 fluent-badge**

把 statusBadge 返回值从:
```js
return '<span class="b-' + status + '">' + label + '</span>';
```
改为:
```js
return '<fluent-badge appearance="filled" style="--badge-background:' + BADGE_COLORS[status] + ';--badge-foreground:' + BADGE_FG[status] + '">' + label + '</fluent-badge>';
```
其中 `BADGE_COLORS` / `BADGE_FG` 从 app.css `.b-*` 规则提取(如 NEW: bg `#f0fdfa` / fg `#115e59`)。在 statusBadge 函数内或上方定义映射常量。

**兼容性**: `.b-*` CSS 类保留(过渡期),其他直接用 `<span class="b-*">` 的地方仍工作。

- [ ] **Step 3: app.css 加 fluent-badge 颜色覆盖**

```css
fluent-badge[appearance="filled"]::part(control){background:var(--badge-background,var(--brand-l));color:var(--badge-foreground,var(--brand-d));border-radius:999px;padding:3px 9px;font-size:12px;font-weight:600}
```

- [ ] **Step 4: browser_use 双系统验证 badge**

browser_use subagent:
- 样品(rd01):列表、看板、详情中所有状态 badge 渲染为 fluent-badge,颜色与原 .b-* 一致(NEW 青蓝、PRODUCED 青等)。
- 治具(admin):列表、看板中治具状态 badge(VERIFY_PENDING 黄、IN_USE 蓝等)颜色一致。
- 验收:所有 badge 圆角胶囊状,颜色正确,console 无 error。

- [ ] **Step 5: commit**

```bash
git add public/js/shared/api-base.js public/js/fixture-api.js public/css/app.css
git commit -m "feat(fluentui): migrate statusBadge to fluent-badge (stage2 module3)"
```

- [ ] **Step 6: 输出臃肿检测报告**

重点 `api-base.js`(若加 BADGE_COLORS 常量可能增长,评估是否抽到 constants)。

---

## 模块 4:表格(table → fluent-data-grid)

> **风险**:中(表格散布列表/看板,且 .fx-list-table 有移动端响应式特例)。**前置**:模块 0。

### Task 4.1:样品列表 table → fluent-data-grid

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/samples.js`(样品列表)
- Modify: `/www/wwwroot/sample-mgmt/public/js/dashboard.js`(_renderAlertBlock 预警表)
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(table 样式保留 + fluent-data-grid 适配)

- [ ] **Step 1: samples.js 列表 table 替换**

定位样品列表渲染函数,把:
```html
<table><tr><th>编号</th>...</tr><tr onclick="..."><td>...</td></tr></table>
```
替换为:
```html
<fluent-data-grid><fluent-data-grid-row header><fluent-data-grid-cell>编号</fluent-data-grid-cell>...</fluent-data-grid-row><fluent-data-grid-row onclick="..."><fluent-data-grid-cell>...</fluent-data-grid-cell></fluent-data-grid-row></fluent-data-grid>
```
**注意**: fluent-data-grid 的 row/cell 需配对标签。onclick 在 row 上保留。

- [ ] **Step 2: dashboard.js 预警表替换**

`_renderAlertBlock` 第 143 行的 `<table>...</table>` 同样替换为 fluent-data-grid。

- [ ] **Step 3: app.css 适配 fluent-data-grid**

```css
fluent-data-grid{width:100%;font-size:13px}
fluent-data-grid-row::part(row){border-bottom:1px solid var(--line)}
fluent-data-grid-row[header]::part(row){background:var(--bg);color:var(--muted);font-weight:600;font-size:12px}
fluent-data-grid-row:not([header]):hover::part(row){background:#fafbfc}
```
保留原 `table/th/td` 样式(其他未迁移表仍用)。

- [ ] **Step 4: browser_use 验证样品表格**

browser_use subagent(rd01):
- 样品列表:表格渲染为 Fluent data-grid,行 hover 高亮,点击行跳详情。
- 看板预警表(逾期/即将到期):渲染正常,点击行跳详情,分页按钮(已是 fluent-button)工作。
- 验收:功能正常,console 无 error。

- [ ] **Step 5: commit**

```bash
git add public/js/samples.js public/js/dashboard.js public/css/app.css
git commit -m "feat(fluentui): migrate sample tables to fluent-data-grid (stage2 module4)"
```

### Task 4.2:治具列表 table → fluent-data-grid

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-list.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-dashboard.js`(_renderDashContent 三个表)
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-logs.js`
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(.fx-list-table 移动端响应式适配)

- [ ] **Step 1: fixture-list.js 与 fixture-dashboard.js 表替换**

按 Task 4.1 规则替换所有 `<table>` 为 `<fluent-data-grid>`。

- [ ] **Step 2: .fx-list-table 移动端响应式适配**

`app.css` 第 126-132 行 `.fx-list-table` 移动端规则需调整:fluent-data-grid 在移动端的 block 布局需用 `::part(row)` 控制。改为:
```css
@media(max-width:767px){
  fluent-data-grid.fx-list-table::part(row){display:block;border-bottom:1px solid var(--line);padding:8px}
  fluent-data-grid.fx-list-table fluent-data-grid-cell{display:block;padding:2px 0}
  fluent-data-grid.fx-list-table fluent-data-grid-cell:before{content:attr(data-label);font-size:11px;color:var(--muted);display:block;margin-bottom:2px}
}
```
注意:需在 fixture-list.js 给 fluent-data-grid 加 `class="fx-list-table"`,给 cell 加 `data-label` 属性。

- [ ] **Step 3: browser_use 验证治具表格 + 移动端**

browser_use subagent(admin):
- 治具列表:表格 Fluent 风格,点击行跳详情。
- 治具看板:逾期表、保养表、待办表渲染正常。
- 移动端(375px 视口):.fx-list-table 转块状布局,字段标签显示。
- 验收:功能正常,console 无 error。

- [ ] **Step 4: commit**

```bash
git add public/js/fixture-*.js public/css/app.css
git commit -m "feat(fluentui): migrate fixture tables to fluent-data-grid"
```

---

## 模块 5:modal(.modal → fluent-dialog)

> **风险**:中(modal.js 双系统共用,改一处影响两系统)。**前置**:模块 0。

### Task 5.1:modal.js 改用 fluent-dialog

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/modal.js`
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(.modal 样式适配)

- [ ] **Step 1: modal.js openModal 改用 fluent-dialog**

把 `modal.js` 第 2 行 `openModal` 内的:
```js
m.innerHTML='<div class="modal"><div class="modal-head">'+headHTML+'</div><div class="modal-body">'+html+'</div><div class="modal-foot">'+footHTML+'</div></div>';
```
替换为:
```js
m.innerHTML='<fluent-dialog id="fluent-modal" modal="true" trap-focus="true"><div class="modal-head">'+headHTML+'</div><div class="modal-body">'+html+'</div><div class="modal-foot">'+footHTML+'</div></fluent-dialog>';
```
**兼容性关键**:
- `closeModal(this.closest('.modal-mask'))` 仍工作(mask 是外层 div)。
- `.modal-head/.modal-body/.modal-foot` 类保留,样式仍生效(fluent-dialog 是容器,内部 div 用全局 CSS)。
- `trap-focus` 自动焦点陷阱,a11y 提升。

- [ ] **Step 2: app.css 适配 fluent-dialog**

`app.css` 第 76-80 行 `.modal` 规则改为同时作用于 fluent-dialog:
```css
fluent-dialog#fluent-modal,.modal{background:#fff;border-radius:16px;width:94vw;max-width:900px;max-height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden;box-shadow:var(--shadow-3)}
fluent-dialog::part(control){background:#fff;border-radius:16px;max-width:900px}
```
保留 `.modal-head/.modal-body/.modal-foot` 规则不变。响应式断点(第 104-105 行)同步加 `fluent-dialog#fluent-modal` 选择器。

- [ ] **Step 3: app.css 确认 .modal-mask 不变**

`.modal-mask`(第 75 行)保留(仍是外层遮罩)。

- [ ] **Step 4: browser_use 双系统验证 modal**

browser_use subagent:
- 样品(rd01):列表点行开详情 modal、扫码台 modal、用户新建 modal。modal 居中、遮罩、关闭按钮、ESC 关闭(若 fluent-dialog 支持)、点遮罩关闭。
- 治具(admin):治具详情 modal、新建治具 modal、扫码 modal。同上验证。
- 验收:所有 modal 渲染为 Fluent dialog 风格,功能正常,console 无 error。

- [ ] **Step 5: commit**

```bash
git add public/js/modal.js public/css/app.css
git commit -m "feat(fluentui): migrate modal to fluent-dialog (stage2 module5)"
```

- [ ] **Step 6: 输出臃肿检测报告**

`modal.js` 改动后仍应 ≤200 行(utils 上限),函数 ≤2。

---

## 模块 6:表单(login 已在模块1,本模块处理新建/标示卡发行表单)

> **风险**:中(表单逻辑复杂)。**前置**:模块 1。

### Task 6.1:新建样品/治具表单深化

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/new.js`
- Modify: `/www/wwwroot/sample-mgmt/public/js/fixture-new.js`
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(.new-grid 表单布局适配)

> **说明**: 模块 1 已把 input/select 换为 fluent-text-field/fluent-select。本模块聚焦表单**布局与验证**的 Fluent 化。

- [ ] **Step 1: new.js 表单字段加 fluent-field 标签组件**

把 new.js 中:
```html
<label>样品名称</label>
<fluent-text-field id="nf-name"></fluent-text-field>
```
升级为:
```html
<fluent-field>
  <label slot="label">样品名称 <span class="required">*</span></label>
  <fluent-text-field id="nf-name" appearance="outline"></fluent-text-field>
</fluent-field>
```
(若 @fluentui/web-components 不含 fluent-field,则保留 label + fluent-text-field 平铺,仅样式调整)

- [ ] **Step 2: fixture-new.js 镜像改造**

同 Step 1 规则应用到治具新建表单。

- [ ] **Step 3: app.css .new-grid 适配**

```css
.new-grid fluent-text-field,.new-grid fluent-select,.new-grid fluent-text-area{width:100%;margin-bottom:8px}
fluent-field{display:block;margin-bottom:12px}
```

- [ ] **Step 4: browser_use 双系统验证表单**

browser_use subagent:
- 样品(rd01):新建样品表单所有字段可输入,必填校验工作,提交成功。
- 治具(rd01 或 me01):新建治具申请表单提交成功。
- 验收:表单字段对齐美观,功能正常,console 无 error。

- [ ] **Step 5: commit**

```bash
git add public/js/new.js public/js/fixture-new.js public/css/app.css
git commit -m "feat(fluentui): refine new sample/fixture forms with fluent-field (stage2 module6)"
```

### Task 6.2:标示卡发行表单深化

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/public/js/card-fields.js`
- Modify: `/www/wwwroot/sample-mgmt/public/css/app.css`(.card-grid 适配)

- [ ] **Step 1: card-fields.js 表单字段 fluent 化**

`card-fields.js` 中标示卡发行表单的 input/select(模块1 已换 fluent-text-field)进一步加 fluent-field 包裹与必填红星。

- [ ] **Step 2: app.css .card-grid 适配**

```css
.card-grid fluent-text-field,.card-grid fluent-select{width:100%}
.card-grid fluent-field{margin-bottom:6px}
```

- [ ] **Step 3: browser_use 验证标示卡发行**

browser_use subagent(qa01 登录):
- 标示卡发行表单:字段可输入,扫描卡号区工作,提交成功,打印队列更新。
- 验收:功能正常,console 无 error。

- [ ] **Step 4: commit**

```bash
git add public/js/card-fields.js public/css/app.css
git commit -m "feat(fluentui): refine card-issue form with fluent-field"
```

---

## 模块 7:最终全量回归 + 收尾

### Task 7.1:阶段 2 全量双系统回归

- [ ] **Step 1: browser_use 全量回归(样品)**

browser_use subagent 依次走(rd01 + admin 两角色):
- 登录(fluent-text-field + fluent-button)
- 看板(fluent-card 统计卡 + fluent-data-grid 预警表 + fluent-badge + fluent-button 分页)
- 样品列表(fluent-data-grid + fluent-badge + fluent-text-field/fluent-select 筛选 + fluent-button)
- 新建样品(fluent-field 表单 + fluent-button 提交)
- 扫码台(原生 scan-input 保留 + fluent-button)
- 详情 modal(fluent-dialog + fluent-badge + fluent-button)
- 标示卡发行(fluent-field 表单)
- 用户管理(fluent-field 表单 + fluent-data-grid)
- 退出登录
- 截图 + console 日志,验收全部功能正常,无 console error。

- [ ] **Step 2: browser_use 全量回归(治具)**

browser_use subagent 依次走(admin + me01 + rd01 三角色):
- 登录
- 看板(fluent-card + fluent-data-grid + fluent-badge)
- 治具列表(fluent-data-grid + fluent-badge + 筛选)
- 新建治具申请(fluent-field 表单)
- 治具扫码台(扫码状态机流转:VERIFY_PENDING → VERIFY_RD_OK → TRANSFERRED → IN_USE)
- 治具详情 modal(fluent-dialog)
- 维修/报废流程
- 退出
- 验收全部功能正常,无 console error。

### Task 7.2:文档同步 + 最终臃肿报告

- [ ] **Step 1: 更新 README.md(若涉及前端依赖说明)**

在 README.md 依赖/前端章节补一句:`@fluentui/web-components@^2`(若 README 无前端章节则跳过,不主动创建文档)。

- [ ] **Step 2: 输出阶段 2 总结臃肿报告**

对所有修改文件输出汇总:
- 文件类型 / 当前行数 / 距上限剩余
- 函数数 / 是否触阈值(dashboard.js 重点关注)
- 冗余清单:.b-* CSS 类(过渡期保留)、.btn CSS 类(过渡期保留)、废弃 `<button>` 残留(应无)
- 瘦身方案:阶段 2 完成后可在下个迭代删除 .b-* / .btn(若全量迁移完成且无残留引用)

- [ ] **Step 3: 上线监控提示**

输出:上线后 1~3 周期监控 Fluent bundle 加载性能(LCP < 2.5s)、Shadow DOM CSS 穿透问题(::part 是否生效)、双系统功能反馈。

---

## 自检(CLAUDE.md 强制)

- [x] 全链路依赖已排查(5 维度):见 spec 第 8 节
- [x] 关联文件已同步修改:每 Task 列 Files 清单
- [x] 每模块输出臃肿检测报告:Task 0.5/1.6/3.1/5.1/7.2
- [x] 回归验证步骤已列:每 Task 的 browser_use 步骤
- [x] 子系统隔离已验证:每模块双系统回归
- [x] 兼容性影响已说明:.value 读写一致、onclick attribute 兼容、.b-*/.btn 过渡期保留
- [x] 部署/回滚步骤:`npm install` + `git revert <commit>`(每模块独立 commit)
- [x] 上线监控提示:Task 7.2 Step 3
- [x] 文档同步:Task 7.2 Step 1(仅 README,不主动创建文档)

---

## 执行顺序与依赖

```
模块0(基础设施)──┬─→ 模块1(基础控件)──┬─→ 模块6(表单深化)
                  ├─→ 模块2(stat 卡)  └─→ 模块3(badge)
                  ├─→ 模块4(表格)
                  └─→ 模块5(modal)

模块0 是所有后续模块的前置。
模块1 是模块6 的前置(表单深化依赖控件已迁移)。
模块2/3/4/5 之间可并行(但建议串行以便集中回归)。
每模块独立 commit,可单独 revert。
```

**建议执行顺序**: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7(串行,每模块双系统回归后进下一个)。
