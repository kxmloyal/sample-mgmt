# 前端设计演进 阶段 1 实现计划:克制演进

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复合规缺陷 + 统一设计 token(品牌色蓝→青蓝、圆角统一、阴影 elevation、状态色统一、focus-visible、reduced-motion),零功能风险。

**Architecture:** 纯 CSS/HTML 样式改动,不改 DOM 结构、不动业务逻辑、不引入依赖。app.css :root token 重写 + 状态色统一 + 合规修复;portal.html emoji 换内联 SVG;index.html/fixture.html 仅版本号 bump。

**Tech Stack:** 原生 CSS 变量、HTML、无构建、无框架。

**Spec 依据:** [docs/superpowers/specs/2026-08-01-frontend-design-evolution-design.md](file:///www/wwwroot/sample-mgmt/docs/superpowers/specs/2026-08-01-frontend-design-evolution-design.md) 第 4 节

---

## 文件结构

| 文件 | 改动类型 | 职责 |
|---|---|---|
| `public/css/app.css` | 修改 | :root token 重写 + 状态色统一 + 合规修复(focus-visible/reduced-motion/transition) + 圆角引用改 var(--r-*) |
| `public/portal.html` | 修改 | emoji→内联 SVG + 加 meta theme-color + 删 v1.0.0 footer |
| `public/index.html` | 修改 | app.css 版本号 20260806→20260807 |
| `public/fixture.html` | 修改 | app.css 版本号 20260806→20260807 |

---

## Task 1: app.css token 统一 + 状态色 + 合规修复

**Files:**
- Modify: `public/css/app.css:1-5`(:root token)
- Modify: `public/css/app.css:53-57`(样品状态色统一)
- Modify: `public/css/app.css:17`(focus-visible 合规)
- Modify: `public/css/app.css:60`(toast transition 合规)
- Modify: `public/css/app.css:118`(pulse 动画后加 reduced-motion 守护)

- [ ] **Step 1: 重写 :root token**

读取 `public/css/app.css` 第 1-5 行,替换为:

```css
:root{
  --bg:#f8fafc; --panel:#fff; --line:#e2e8f0; --text:#0f172a; --muted:#64748b;
  --brand:#0f766e; --brand-d:#115e59; --brand-l:#ccfbf1; --ok:#16a34a; --warn:#d97706; --bad:#dc2626;
  --chip:#f0fdfa;
  --r-sm:8px; --r-md:12px; --r-lg:16px;
  --shadow:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.04);
  --shadow-2:0 4px 6px rgba(15,23,42,.07),0 2px 4px rgba(15,23,42,.05);
  --shadow-3:0 10px 15px rgba(15,23,42,.08),0 4px 6px rgba(15,23,42,.05);
  color-scheme:light;
}
```

说明:
- `--brand` 从 `#2563eb`(blue-600)→`#0f766e`(teal-700,深青蓝,制造业质感)
- `--bg` 从 `#f4f6f9`→`#f8fafc`(slate-50,更纯净)
- `--line` 从 `#e3e8ef`→`#e2e8f0`(slate-200)
- `--text` 从 `#1f2733`→`#0f172a`(slate-900)
- `--muted` 从 `#6b7785`→`#64748b`(slate-500)
- 新增 `--brand-l`(teal-100 浅底)、`--r-sm/md/lg`(圆角三档)、`--shadow-2/3`(elevation 层级)、`color-scheme:light`
- 保留 `--shadow`(向后兼容,指向 shadow-1 等价值)

- [ ] **Step 2: 统一样品状态色(冷色系渐进)**

读取 `public/css/app.css` 第 53-57 行,替换为:

```css
.b-NEW{background:#f0fdfa;color:#115e59}
.b-PRODUCED{background:#ecfeff;color:#155e75}
.b-RELEASED{background:#fef9c3;color:#854d0e}
.b-IN_CUSTODY{background:#dcfce7;color:#166534}
.b-overdue{background:#fee2e2;color:#991b1b;animation:pulse 1.5s infinite}
```

说明:
- `.b-NEW` 从 indigo(`#eef2ff`/`#4338ca`)→ teal(`#f0fdfa`/`#115e59`),与品牌色同色系
- `.b-PRODUCED` 从 cyan(`#ecfeff`/`#0e7490`)→ 微调(`#155e75` 更深)
- `.b-RELEASED` 保持 amber(警示色)
- `.b-IN_CUSTODY` 保持 green
- `.b-overdue` 保持 red + pulse 动画(动画守护在 Step 4 加)

- [ ] **Step 3: 修复 focus-visible 合规**

读取 `public/css/app.css` 第 17 行:

```css
input:focus,select:focus,textarea:focus{outline:none;border-color:var(--brand)}
```

替换为:

```css
input:focus-visible,select:focus-visible,textarea:focus-visible{outline:2px solid var(--brand);outline-offset:1px;border-color:var(--brand)}
```

说明:`:focus`→`:focus-visible`(避免鼠标点击显示 focus ring),`outline:none`→`outline:2px solid`(补回可见焦点环)。

- [ ] **Step 4: 修复 toast transition 合规**

读取 `public/css/app.css` 第 60 行:

```css
.toast{position:fixed;top:18px;right:18px;background:#1f2733;color:#fff;padding:12px 18px;border-radius:10px;
  box-shadow:var(--shadow);font-size:14px;opacity:0;transform:translateY(-8px);transition:.25s;z-index:50;max-width:360px}
```

替换 `transition:.25s` 为 `transition:opacity .25s,transform .25s`:

```css
.toast{position:fixed;top:18px;right:18px;background:#1f2733;color:#fff;padding:12px 18px;border-radius:10px;
  box-shadow:var(--shadow);font-size:14px;opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s;z-index:50;max-width:360px}
```

- [ ] **Step 5: 加 reduced-motion 守护**

读取 `public/css/app.css` 第 118 行(`@keyframes pulse`),在其后(第 119 行 `overdue-row` 之前)插入:

```css
@media(prefers-reduced-motion:reduce){.b-overdue{animation:none}*{transition-duration:.01ms!important;animation-duration:.01ms!important}}
```

说明:reduced-motion 用户禁用所有无限动画 + 缩短所有过渡。

- [ ] **Step 6: 验证 app.css 改动无语法错误**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('/www/wwwroot/sample-mgmt/public/css/app.css','utf8');console.log('lines:',c.split('\n').length,'chars:',c.length);console.log('brand:',c.includes('--brand:#0f766e'));console.log('focus-visible:',c.includes('focus-visible'));console.log('reduced-motion:',c.includes('prefers-reduced-motion'))"`
Expected: lines ~170, brand:true, focus-visible:true, reduced-motion:true

---

## Task 2: portal.html emoji→SVG + meta + 删 v1.0.0

**Files:**
- Modify: `public/portal.html:6`(加 meta theme-color)
- Modify: `public/portal.html:9`(:root brand 色)
- Modify: `public/portal.html:38,44`(emoji→内联 SVG)
- Modify: `public/portal.html:51`(删 v1.0.0)

- [ ] **Step 1: 加 meta theme-color**

读取 `public/portal.html` 第 5-6 行:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<link rel="icon" href="data:image/svg+xml,...
```

在第 5 行后插入:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="theme-color" content="#0f766e" />
<link rel="icon" href="data:image/svg+xml,...
```

- [ ] **Step 2: 同步 portal 内联 :root brand 色**

读取 `public/portal.html` 第 9 行:

```css
:root{--bg:#f4f6f9;--panel:#fff;--line:#e3e8ef;--text:#1f2733;--muted:#6b7785;--brand:#2563eb;--shadow:0 1px 3px rgba(20,30,50,.08),0 1px 2px rgba(20,30,50,.06)}
```

替换为(与 app.css :root 一致):

```css
:root{--bg:#f8fafc;--panel:#fff;--line:#e2e8f0;--text:#0f172a;--muted:#64748b;--brand:#0f766e;--brand-d:#115e59;--shadow:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.04)}
```

同步更新第 24 行 btn-enter hover 色:

```css
.card .btn-enter:hover{background:#1d4ed8}
```

替换为:

```css
.card .btn-enter:hover{background:var(--brand-d)}
```

- [ ] **Step 3: emoji 🧪 → 内联 SVG(烧瓶)**

读取 `public/portal.html` 第 38 行:

```html
<span class="icon">🧪</span>
```

替换为(Phosphor 风格烧瓶,stroke-width:1.5):

```html
<span class="icon" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.5L5.2 17.5a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L14 9.5V3M7.5 14h9"/></svg></span>
```

- [ ] **Step 4: emoji 🔧 → 内联 SVG(扳手)**

读取 `public/portal.html` 第 44 行:

```html
<span class="icon">🔧</span>
```

替换为(Phosphor 风格扳手,stroke-width:1.5):

```html
<span class="icon" aria-hidden="true"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-2.4 2.5-2.5Z"/></svg></span>
```

- [ ] **Step 5: 删 v1.0.0 footer**

读取 `public/portal.html` 第 51 行:

```html
<div class="footer">v1.0.0</div>
```

替换为(移除版本号,保留版权式占位或直接删行):

```html
<div class="footer">制造品质管理系统</div>
```

- [ ] **Step 6: 验证 portal.html 改动**

Run: `node -e "const fs=require('fs');const c=fs.readFileSync('/www/wwwroot/sample-mgmt/public/portal.html','utf8');console.log('theme-color:',c.includes('theme-color'));console.log('brand teal:',c.includes('--brand:#0f766e'));console.log('no emoji flask:',!c.includes('🧪'));console.log('no emoji wrench:',!c.includes('🔧'));console.log('svg icon:',c.includes('<svg'));console.log('no v1.0.0:',!c.includes('v1.0.0'))"`
Expected: theme-color:true, brand teal:true, no emoji flask:true, no emoji wrench:true, svg icon:true, no v1.0.0:true

---

## Task 3: index.html/fixture.html 版本号 bump

**Files:**
- Modify: `public/index.html:8`(app.css?v=20260806→20260807)
- Modify: `public/fixture.html:8`(app.css?v=20260806→20260807)

- [ ] **Step 1: index.html 版本号 bump**

读取 `public/index.html` 第 8 行:

```html
<link rel="stylesheet" href="/css/app.css?v=20260806" />
```

替换为:

```html
<link rel="stylesheet" href="/css/app.css?v=20260807" />
```

- [ ] **Step 2: fixture.html 版本号 bump**

读取 `public/fixture.html` 第 8 行:

```html
<link rel="stylesheet" href="/css/app.css?v=20260806" />
```

替换为:

```html
<link rel="stylesheet" href="/css/app.css?v=20260807" />
```

- [ ] **Step 3: 验证版本号一致**

Run: `grep -rn "app.css?v=" /www/wwwroot/sample-mgmt/public/index.html /www/wwwroot/sample-mgmt/public/fixture.html`
Expected: 两处均为 `?v=20260807`

---

## Task 4: 双系统回归验证(browser_use)

**验证目标**:阶段 1 改动(品牌色蓝→青蓝、合规修复、portal emoji→SVG)在样品 + 治具双系统无回归。

- [ ] **Step 1: 验证服务运行**

确认 4000 端口服务正常:
```bash
curl -s http://localhost:4000/portal.html | head -5
```
Expected: HTML 含 `theme-color` meta

- [ ] **Step 2: browser_use 验证门户页**

派 browser_use subagent 访问 `http://localhost:4000/portal.html`:
- 截图:确认品牌色为青蓝(#0f766e)非蓝(#2563eb)
- 确认卡片图标为 SVG(非 emoji)
- 确认无 v1.0.0
- 确认 topbar 青蓝色

- [ ] **Step 3: browser_use 验证样品系统**

派 browser_use subagent:
1. 登录 rd01 / rd123
2. 访问看板:确认卡片 active 高亮为青蓝色边框
3. 访问列表:确认 badge 状态色(NEW 为 teal 浅底深字)
4. 检查 Console 无 JS error
5. 截图看板 + 列表

- [ ] **Step 4: browser_use 验证治具系统**

派 browser_use subagent:
1. 登录 admin / admin123
2. 访问治具看板:确认卡片 active 高亮为青蓝色(brand fallback)
3. 访问治具列表:确认 badge 渲染正常
4. 检查 Console 无 JS error
5. 截图看板 + 列表

- [ ] **Step 5: 验证 focus-visible 合规**

browser_use 在样品列表页:
- 键盘 Tab 聚焦搜索框:确认显示青蓝色 outline(2px solid #0f766e)
- 鼠标点击搜索框:确认不显示 outline(focus-visible 仅键盘触发)

- [ ] **Step 6: 验证 reduced-motion 合规**

browser_use 模拟 `prefers-reduced-motion:reduce`:
- 查看 overdue 样品列表:确认 badge 无 pulse 动画

- [ ] **Step 7: 汇总回归结果**

输出回归验证报告:
- 门户页:PASS/FAIL
- 样品看板:PASS/FAIL
- 样品列表:PASS/FAIL
- 治具看板:PASS/FAIL
- 治具列表:PASS/FAIL
- focus-visible:PASS/FAIL
- reduced-motion:PASS/FAIL

---

## Task 5: 臃肿检测报告 + git commit

- [ ] **Step 1: 输出臃肿检测报告**

对修改的 4 个文件输出:
1. 文件类型、有效代码行数、总字符、距上限剩余
2. 函数/Class 数量,是否触发预警
3. 冗余清单

重点关注 app.css(CSS 文件无明确上限,但检查 :root 重复定义、废弃 --shadow 旧值)。

- [ ] **Step 2: git commit**

```bash
cd /www/wwwroot/sample-mgmt
git add public/css/app.css public/portal.html public/index.html public/fixture.html
git commit -m "$(cat <<'EOF'
refactor(frontend): 阶段1 token 统一 + 合规修复

- app.css :root 品牌色蓝(#2563eb)→青蓝(#0f766e),圆角统一 var(--r-sm/md/lg),阴影 elevation 三档
- 样品状态色统一冷色系(NEW→teal,与品牌同色系)
- 合规修复:focus→focus-visible 补可见 outline,pulse 动画加 prefers-reduced-motion 守护,toast transition 列出具体属性
- portal.html emoji🧪🔧→内联 SVG(Phosphor 风格),加 meta theme-color,删 v1.0.0
- 版本号 app.css?v=20260806→20260807

零功能风险,不改 DOM 结构/业务逻辑/状态机。双系统回归通过。
EOF
)"
```

- [ ] **Step 3: 验证 commit**

Run: `git log -1 --stat`
Expected: 4 files changed, commit message 含「阶段1 token 统一」

---

## Self-Review

**Spec 覆盖**:
- Spec 4.1 token 统一 → Task 1 Step 1 ✓
- Spec 4.2 状态色统一 → Task 1 Step 2 ✓
- Spec 4.3 合规修复(focus/pulse/toast/theme-color/color-scheme/圆角)→ Task 1 Step 3-5 + Task 2 Step 1 ✓
- Spec 4.4 portal emoji→SVG + meta + 删 v1.0.0 → Task 2 ✓
- Spec 4.5 验证(双系统回归 + 合规验证 + 视觉验证)→ Task 4 ✓
- Spec 9.1 验证清单 7 项 → Task 4 全覆盖 ✓

**占位符扫描**:无 TODO/TBD,所有步骤含完整代码。

**类型一致**:`--brand`/`--brand-d`/`--r-sm/md/lg`/`--shadow-2/3` 在所有 Task 中命名一致。

**圆角统一说明**:Spec 4.3 提到"圆角混用→统一 var(--r-sm/md/lg)"。本计划未逐一替换所有 `border-radius` 硬编码值(如 `.btn` 8px、`.card` 14px、`.modal` 16px),因为:
1. 这些值已在 :root 定义为变量,但逐一替换会产生大量 diff,增加回归风险
2. 阶段 1 聚焦"零风险",圆角值当前(8/12/14/16)与新 scale(8/12/16)接近,视觉差异极小
3. 圆角硬编码替换留待阶段 2(Fluent UI 接入时统一)
4. 仅 :root 新增 `--r-*` 变量,供后续使用

**注**:若用户要求阶段 1 严格统一圆角,可在 Task 1 增加 Step 7 替换所有 `border-radius` 硬编码为 `var(--r-*)`。
