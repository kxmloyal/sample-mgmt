# 前端设计演进设计文档

> 日期: 2026-08-01
> 类型: 设计文档(spec)
> 状态: 待用户审核
> 技能依据: design-taste-frontend(门户页) + web-design-guidelines(合规) + Fluent UI Web Components(B2B 设计系统)

---

## 1. 背景与目标

### 1.1 现状

制造品质管理系统前端为原生 HTML/CSS/JS 单页(无构建、无框架),含两大子系统:

- **样品管理**([index.html](file:///www/wwwroot/sample-mgmt/public/index.html)):看板、列表、扫码台、标示卡、详情
- **治具管理**([fixture.html](file:///www/wwwroot/sample-mgmt/public/fixture.html)):看板、列表、扫码台、详情
- **统一门户**([portal.html](file:///www/wwwroot/sample-mgmt/public/portal.html)):2 卡片入口

视觉语言基于 [app.css :root](file:///www/wwwroot/sample-mgmt/public/css/app.css#L1-L5),采用 Tailwind blue-600(`#2563eb`)品牌色 + 系统字体栈 + 混用圆角。功能完整,但存在三类问题:

1. **合规缺陷**:focus 状态缺失、无限动画未守护 reduced-motion、`transition:all` 等价写法、暗色模式 token 缺失
2. **设计平庸**:品牌色为通用 AI 蓝、圆角无统一 scale、状态色色相混杂、emoji 作图标
3. **门户页观感弱**:portal.html 纯文字 + emoji + 居中等宽卡片,无品牌识别度

### 1.2 目标

- **阶段 1(A 克制演进)**:修复合规缺陷 + 统一设计 token,零功能风险
- **阶段 2(B 设计系统接入)**:引入 Fluent UI Web Components 渐进迁移看板与表单
- **阶段 3(C 门户重塑)**:portal.html 按 landing page 美学重塑,建立品牌识别

### 1.3 非目标

- 不重写后端 API 或数据层
- 不改变状态机、业务逻辑、路由结构
- 不引入 React/Vue 等框架(保持原生 HTML 架构)
- 不改变子系统隔离原则(改共享资源须双系统回归)

---

## 2. Design Read(场景判定)

> Reading this as: **B2B 制造业内部工具** for 品保/研发/生技/保管员, with a 严肃数据密集型 language, leaning toward **Fluent UI 设计系统(B2B 制造业经典)+ Linear-style 克制美学(门户页)**.

### 2.1 三刻度(design-taste-frontend Section 1)

| 刻度 | 看板/列表/扫码台 | 门户页 |
|---|---|---|
| `DESIGN_VARIANCE` | 4(对称网格) | 6(非对称 Bento) |
| `MOTION_INTENSITY` | 3(静态,仅 hover/active) | 4(轻量入场) |
| `VISUAL_DENSITY` | 7(数据密集) | 4(呼吸感) |

### 2.2 设计系统选择(design-taste-frontend Section 2.A)

| 场景 | 选择 | 理由 |
|---|---|---|
| 看板/列表/表单/扫码台 | **Fluent UI Web Components** | 微软官方、B2B 制造业经典、免框架、Web Components 渐进接入、a11y/dark mode/reduced-motion 开箱即用 |
| 门户页 | 原生 CSS + Phosphor Icons + 自托管字体 | landing page 性质,无需设计系统,套用 design-taste-frontend 美学规则 |

---

## 3. 现状审计

### 3.1 视觉 token 审计([app.css :root](file:///www/wwwroot/sample-mgmt/public/css/app.css#L1-L5))

| Token | 当前值 | 问题 |
|---|---|---|
| `--brand` | `#2563eb`(blue-600) | 通用 AI 蓝,无品牌识别 |
| 字体 | `-apple-system,"Segoe UI","Microsoft YaHei"` | 系统栈,无设计意图 |
| 圆角 | 8/10/12/14/16px 混用 | **违反 Shape Consistency Lock**,无统一 scale |
| 阴影 | 单层 `0 1px 3px rgba(20,30,50,.08)` | 层次感弱 |
| 状态色 | 6 种 badge 散落(暖黄+冷青+冷蓝混杂) | 色相不统一 |
| `--shadow` | 仅 1 档 | 缺 elevation 层级 |

### 3.2 web-design-guidelines 合规扫描(关键问题)

| 文件 | 行 | 问题 | 严重度 |
|---|---|---|---|
| [app.css:17](file:///www/wwwroot/sample-mgmt/public/css/app.css#L17) | `input:focus{outline:none}` | **outline:none 无 focus-visible 替换** | 高 |
| [app.css:57](file:///www/wwwroot/sample-mgmt/public/css/app.css#L57) | `.b-overdue{animation:pulse 1.5s infinite}` | **未声明 prefers-reduced-motion** | 高 |
| [app.css:118](file:///www/wwwroot/sample-mgmt/public/css/app.css#L118) | `@keyframes pulse` | 无限动画未受 reduced-motion 守护 | 高 |
| [app.css:60](file:///www/wwwroot/sample-mgmt/public/css/app.css#L60) | `.toast{transition:.25s}` | **transition:all 等价**(未列属性) | 中 |
| [portal.html:38,44](file:///www/wwwroot/sample-mgmt/public/portal.html#L38) | 🧪🔧 emoji 作图标 | 无 aria-label,装饰性 emoji 缺 aria-hidden | 中 |
| portal.html | 无 `<meta name="theme-color">` | 暗色模式滚动条异常 | 中 |
| app.css :root | 无 `color-scheme` | 暗色模式原生控件异常 | 中 |
| [portal.html:51](file:///www/wwwroot/sample-mgmt/public/portal.html#L51) | `v1.0.0` footer | 版本号在入口页(AI Tell) | 低 |
| 全局 | 日期/数字硬编码格式 | 应 `Intl.*` 格式化 | 中 |

### 3.3 design-taste-frontend AI Tell 检测(portal.html)

- [portal.html:38,44](file:///www/wwwroot/sample-mgmt/public/portal.html#L38):emoji 🧪🔧 作图标 → **Tell**(应换 icon library)
- [portal.html:36-49](file:///www/wwwroot/sample-mgmt/public/portal.html#L36-L49):2 张等宽居中卡片 → **Section 4.3 ANTI-CENTER 命中**(VARIANCE 低,平庸)
- 缺真实视觉资产(纯文字+emoji)→ **Section 4.8 命中**
- [portal.html:9-27](file:///www/wwwroot/sample-mgmt/public/portal.html#L9-L27):内联 `<style>` → 可接受但应外联

---

## 4. 阶段 1:克制演进(方案 A)

> **风险**:零(仅样式与合规修复,不改 DOM 结构、不动业务逻辑)
> **范围**:app.css + portal.html + index.html/fixture.html(仅版本号 bump)

### 4.1 设计 token 统一(app.css :root)

```css
:root{
  /* 配色:放弃 AI 蓝,改深青蓝(制造业辨识度) */
  --brand:#0f766e;        /* teal-700,深青蓝,制造业质感 */
  --brand-d:#115e59;      /* teal-800 */
  --brand-l:#ccfbf1;      /* teal-100,浅底 */
  --bg:#f8fafc;           /* slate-50 */
  --panel:#ffffff;
  --line:#e2e8f0;         /* slate-200 */
  --text:#0f172a;         /* slate-900 */
  --muted:#64748b;        /* slate-500 */
  --ok:#16a34a; --warn:#d97706; --bad:#dc2626;
  --chip:#f0fdfa;         /* teal-50 */

  /* 圆角统一 scale(三档,Shape Consistency Lock) */
  --r-sm:8px;   /* 输入框、小按钮、chip */
  --r-md:12px;  /* 卡片、stat */
  --r-lg:16px;  /* modal、login-card */

  /* 阴影 elevation 三档 */
  --shadow-1:0 1px 2px rgba(15,23,42,.06),0 1px 3px rgba(15,23,42,.04);
  --shadow-2:0 4px 6px rgba(15,23,42,.07),0 2px 4px rgba(15,23,42,.05);
  --shadow-3:0 10px 15px rgba(15,23,42,.08),0 4px 6px rgba(15,23,42,.05);

  color-scheme:light dark; /* 原生控件暗色适配 */
}
```

### 4.2 状态色统一(同色相不同明度)

```css
/* 样品状态:冷色系渐进(青→蓝→绿) */
.b-NEW{background:#f0fdfa;color:#115e59}        /* teal */
.b-PRODUCED{background:#ecfeff;color:#155e75}   /* cyan */
.b-RELEASED{background:#fef9c3;color:#854d0e}   /* amber(警示色保留) */
.b-IN_CUSTODY{background:#dcfce7;color:#166534} /* green */
.b-overdue{background:#fee2e2;color:#991b1b}    /* red */
.b-RETIRED{background:#f1f5f9;color:#64748b}    /* slate */

/* 治具状态:沿用原配色(已统一) */
```

### 4.3 合规修复清单

| 修复项 | 当前 | 修复后 |
|---|---|---|
| focus 状态 | `input:focus{outline:none}` | `input:focus-visible{outline:2px solid var(--brand);outline-offset:1px}` |
| pulse 动画 | 无限循环无守护 | 加 `@media (prefers-reduced-motion:reduce){.b-overdue{animation:none}}` |
| toast transition | `transition:.25s` | `transition:opacity .25s,transform .25s` |
| theme-color | 缺 | portal.html 加 `<meta name="theme-color" content="#0f766e">` |
| color-scheme | 缺 | :root 加 `color-scheme:light` |
| 圆角混用 | 8/10/12/14/16 | 统一为 `var(--r-sm/md/lg)` 三档 |

### 4.4 portal.html 最小修复(不重塑)

- emoji 🧪🔧 → 内联 SVG(样品:烧瓶轮廓;治具:扳手轮廓,stroke-width:1.5)
- 加 `<meta name="theme-color" content="#0f766e">`
- `v1.0.0` 移除(版本号移至管理后台)
- 内联 `<style>` 保留(门户页独立,无需外联)

### 4.5 验证

- 双系统回归:样品(RD)+ 治具(admin)看板、列表、扫码台、modal 渲染无变化
- 合规验证:focus-visible 可见、reduced-motion 下 pulse 停止、`transition` 列出属性
- 视觉验证:品牌色从蓝→青蓝、圆角统一、状态色色相一致

---

## 5. 阶段 2:Fluent UI 接入(方案 B)

> **风险**:中(引入依赖,渐进迁移,双系统回归)
> **前置**:阶段 1 完成
> **范围**:看板、列表、表单、扫码台、modal

### 5.1 依赖引入

```bash
npm install @fluentui/web-components@^2
```

### 5.2 渐进迁移路线(按模块,每模块独立 commit)

| 顺序 | 模块 | 替换内容 | 文件 |
|---|---|---|---|
| 1 | 基础控件 | `<button>`→`<fluent-button>`,`<input>`→`<fluent-text-field>`,`<select>`→`<fluent-select>` | 全局 |
| 2 | 卡片/stat | `.card`/`.stat`→`<fluent-card>` | dashboard.js、fixture-dashboard.js |
| 3 | Badge | `.b-*`→`<fluent-badge appearance="filled">` | 全局 |
| 4 | 表格 | `<table>`→`<fluent-data-grid>` | 列表页 |
| 5 | Modal | `.modal`→`<fluent-dialog>` | modal.js |
| 6 | 表单 | login-card、标示卡发行表单 | login.js、card-issue.js |

### 5.3 Design Token 映射

```js
// 项目 :root → Fluent Design Tokens
--brand (#0f766e) → --accent-fill-rest (#0f766e)
--bg     (#f8fafc) → --neutral-background-2 (#f8fafc)
--text   (#0f172a) → --neutral-foreground-1 (#0f172a)
--line   (#e2e8f0) → --neutral-stroke-1 (#e2e8f0)
```

### 5.4 暗色模式

Fluent UI 内置 dark mode,通过 `color-scheme:dark` + `<fluent-provider>` 切换。阶段 2 完成后,系统自动支持暗色模式(无需手写 dark: 变体)。

### 5.5 风险与回滚

- **风险**:Web Components Shadow DOM 可能影响全局 CSS 穿透(需用 `::part()` 或 Fluent tokens 定制)
- **回滚**:每模块独立 commit,可 `git revert` 单模块;未迁移模块继续用原生控件
- **子系统隔离**:每模块迁移后须在样品 + 治具双系统回归

---

## 6. 阶段 3:门户页重塑(方案 C)

> **风险**:低(仅 portal.html,独立于看板)
> **前置**:阶段 1 完成(阶段 2 非必须)
> **范围**:portal.html 单文件

### 6.1 Design Read

> Reading this as: B2B 制造业门户 for 品保/研发/生技/保管员, with a Linear-style 克制 language, leaning toward 原生 CSS + Phosphor Icons + 自托管 Geist 字体.

刻度:`DESIGN_VARIANCE:6 / MOTION:4 / VISUAL_DENSITY:4`

### 6.2 布局:Asymmetric Split Hero

```
┌─────────────────────────────────────────────┐
│  [logo] 制造品质管理系统          [v] 主题   │  nav 64px
├──────────────────────┬──────────────────────┤
│                      │                      │
│  制造品质管理系统     │   [工厂实景图]       │
│  限度样品 · 治具      │   1600×1200          │
│  全流程留痕           │   (生成或采购)       │
│                      │                      │
│  [进入样品管理 →]     │                      │
│  [进入治具管理 →]     │                      │
│                      │                      │
└──────────────────────┴──────────────────────┘
```

### 6.3 配色方案(二选一,design-taste-frontend Section 4.2 轮换)

**选项 1:Forest(推荐 - 制造业质感)**
- 背景:`#f8fafc`(slate-50)
- 主文字:`#0f172a`(slate-900)
- 强调:`#0f766e`(teal-700,与看板一致)
- 强调辅:`#d97706`(amber-600,工厂金属感)

**选项 2:Cold Luxury(冷峻工业)**
- 背景:`#f1f5f9`(slate-100)
- 主文字:`#020617`(slate-950)
- 强调:`#475569`(slate-600,银灰)
- 强调辅:`#0ea5e9`(sky-500,铬蓝)

### 6.4 字体

- 标题:Geist(自托管,`@font-face` + `font-display:swap`)
- 正文:Geist(同上)
- 数字:`font-variant-numeric:tabular-nums`

### 6.5 图标

- 入口卡片图标:Phosphor Icons(`@phosphor-icons/web`,CDN 或自托管)
  - 样品:`ph-flask`
  - 治具:`ph-wrench`

### 6.6 真实视觉资产

- Hero 右侧:工厂/品质检测实景图
  - 优先:image-generation 工具生成(1600×1200,工厂车间或品质检测台)
  - 次选:[picsum.photos/seed/manufacturing-quality-line/1600/1200](https://picsum.photos/seed/manufacturing-quality-line/1600/1200)
  - 兜底:留 `<!-- TODO: hero photo 1600×1200 -->` 占位

### 6.7 动效(MOTION_INTENSITY:4)

- Hero 入场:标题 + 图片 `opacity:0→1, y:24→0`,duration 0.6s,delay 0.1s(stagger)
- 卡片 hover:translateY(-2px) + shadow-2
- 全部受 `prefers-reduced-motion` 守护

### 6.8 Pre-Flight Check(关键项)

- [x] 零 em-dash
- [x] Page Theme Lock(单一 light theme)
- [x] Color Consistency Lock(单一 teal 强调)
- [x] Shape Consistency Lock(圆角 12px 统一)
- [x] Hero fits viewport(标题 ≤2 行,CTA 可见)
- [x] Eyebrow count ≤ ceil(sectionCount/3)(仅 1 section,0 eyebrow)
- [x] 真实图片(非 div fake screenshot)
- [x] icon library(Phosphor,非 emoji)
- [x] 无 AI Tell(无 emoji、无 v1.0.0、无居中等宽卡片)

---

## 7. 演进路线与时间线

```
阶段 1(A)─────────阶段 2(B)─────────────阶段 3(C)
合规修复 + token    Fluent UI 渐进迁移    门户重塑
   │                   │                     │
   ▼                   ▼                     ▼
 app.css 统一       基础控件→卡片→         portal.html
 portal.html 修复   badge→表格→modal→      Asymmetric Split
 双系统回归         表单(6 模块 commit)   Forest/Cold Luxury
                                        Phosphor + Geist
                                        真实工厂图

 风险:零             风险:中              风险:低
 前置:无             前置:阶段 1          前置:阶段 1
```

**注**:阶段 2 与阶段 3 可并行(门户独立于看板)。阶段 3 不依赖阶段 2。

---

## 8. 全链路变更影响清单

### 8.1 上游依赖

- 无第三方系统调用前端(纯内部工具)

### 8.2 下游依赖

| 文件 | 阶段 1 改动 | 阶段 2 改动 | 阶段 3 改动 |
|---|---|---|---|
| [app.css](file:///www/wwwroot/sample-mgmt/public/css/app.css) | :root token + 合规修复 | 保留(Fluent 叠加) | 不改 |
| [portal.html](file:///www/wwwroot/sample-mgmt/public/portal.html) | emoji→SVG + meta | 不改 | 全面重塑 |
| [index.html](file:///www/wwwroot/sample-mgmt/public/index.html) | 版本号 bump | 引入 Fluent script | 不改 |
| [fixture.html](file:///www/wwwroot/sample-mgmt/public/fixture.html) | 版本号 bump | 引入 Fluent script | 不改 |
| [dashboard.js](file:///www/wwwroot/sample-mgmt/public/js/dashboard.js) | 不改 | `.kb-stat`→`<fluent-card>` | 不改 |
| [modal.js](file:///www/wwwroot/sample-mgmt/public/js/modal.js) | 不改 | `.modal`→`<fluent-dialog>` | 不改 |
| package.json | 不改 | + `@fluentui/web-components` | 不改 |

### 8.3 跨模块

- 无 ETL / 报表 / 定时任务引用前端样式
- 无数据库字段变更
- 无 API 变更

---

## 9. 验证清单

### 9.1 阶段 1 验证

- [ ] 双系统回归:样品(RD)+ 治具(admin)看板/列表/扫码台/modal 渲染无变化
- [ ] focus-visible 在键盘 Tab 时可见
- [ ] `prefers-reduced-motion:reduce` 下 pulse 动画停止
- [ ] 品牌色从 `#2563eb`→`#0f766e`,双系统一致
- [ ] 圆角统一为 8/12/16 三档
- [ ] portal.html emoji 已换 SVG
- [ ] portal.html 有 `<meta theme-color>`

### 9.2 阶段 2 验证(每模块)

- [ ] 迁移模块在样品 + 治具双系统渲染正确
- [ ] Fluent 控件 a11y 通过(键盘导航、屏幕阅读器)
- [ ] dark mode 切换正常
- [ ] 无 console error

### 9.3 阶段 3 验证

- [ ] Pre-Flight Check 全通过(见 6.8)
- [ ] Hero 在 1440×900 视口完整可见
- [ ] 移动端 375×667 单栏布局正确
- [ ] Phosphor Icons 加载成功
- [ ] Geist 字体加载成功(font-display:swap)

---

## 10. 兼容性影响

- **阶段 1**:纯样式变更,零兼容性影响。用户首访拿新 `app.css?v=新版本号`
- **阶段 2**:Web Components 在 Chrome/Edge/Safari/Firefox 现代浏览器支持良好。IE 不支持(项目已不要求)
- **阶段 3**:门户页独立,不影响子系统

---

## 11. 部署与回滚

### 11.1 部署

- 阶段 1/2/3 均为前端改动,无需重启 Node 服务
- `git pull` + 用户首访自动拿新版本号资源
- 阶段 2 需 `npm install`(新增依赖)

### 11.2 回滚

- 每阶段独立 commit,可 `git revert <commit>`
- 阶段 2 可按模块 revert(6 模块独立)
- 阶段 3 可单独 revert portal.html

---

## 12. 上线后监控(1~3 周期)

- **阶段 1**:监控用户反馈品牌色变化(蓝→青蓝),确认无辨识度下降
- **阶段 2**:监控 Fluent Web Components 加载性能(LCP < 2.5s)、Shadow DOM CSS 穿透问题
- **阶段 3**:监控门户页跳出率、Hero 图片加载性能

---

## 13. 待用户确认项

1. **品牌色选择**:`#0f766e`(teal 深青蓝)还是其他?
2. **阶段 2 设计系统**:Fluent UI 还是 Carbon?(本文档默认 Fluent)
3. **阶段 3 配色**:Forest(青绿+琥珀)还是 Cold Luxury(银灰+铬蓝)?
4. **阶段 3 Hero 图片**:用 image-generation 生成还是 picsum 占位还是用户提供?
5. **执行顺序**:阶段 1→2→3 串行,还是阶段 1 后 2/3 并行?
