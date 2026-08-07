# 新建样品页面布局优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将新建样品页面（`subsystems/samples/frontend/js/views/new.js`）从「两列卡片 + 字段竖排」优化为「双列卡片 + 列内字段 2 列网格」，机型选择（规格/型号下拉）置于首位，零 JS 逻辑变更。

**Architecture:** 纯前端样式/结构调整。HTML 结构在 `viewNew()` 的 innerHTML 字符串中重排（新增 `.nf-grid`/`.nf-full`/`.nf-actions` 结构类），样式追加到 samples 子系统 `module.css`（不触碰 app.css 共享类 `.new-grid`/`.new-col`，避免双系统回归）。所有字段 id、交互逻辑不变，因此无需改后端与数据库。修改后重建 bundle（`tools/build-bundles.js`）并更新 `index.html` 版本号。

**Tech Stack:** Node.js + Express 4.x (CommonJS)、原生 HTML/JS 单页、Fluent Web Components、jest + supertest（回归用）。

---

## 环境约定（所有 Task 必须遵守）

- **文件权限协议**：项目文件属主 `www`，直接编辑遇 EACCES 时用 `/tmp` 副本修改 + `sudo -A cp` 回原路径 + `sudo -A chown www:www`（askpass 已配置于 `/tmp/askpass.sh`，用 `export SUDO_ASKPASS=/tmp/askpass.sh`）
- **git 协议**：`sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com`，add 具体文件（禁止 `-A`），禁止 push
- **bundle 协议**：修改 `subsystems/*/frontend/js/` 下任意 JS 后 MUST 执行 `sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && node tools/build-bundles.js'`，输出 `VER=xxx`；将 `/tmp/bundle-samples.js` 复制回 `subsystems/samples/frontend/js/bundle.js`；更新 `index.html` L60 的 `bundle.js?v=旧版本` → `bundle.js?v=新版本`
- **测试协议**：jest 必须 www 用户运行：`sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest 2>&1 | tail -40'`，确认 `JEST_EXIT=0`
- **当前 bundle 版本**：`bmsfyrbqj`（`tools/.bundle-ver`）

**文件变更总览：**

| 文件 | 类型 | 说明 |
|---|---|---|
| `subsystems/samples/frontend/js/views/new.js` | 修改 | `viewNew()` HTML 字符串重排（Task 1） |
| `subsystems/samples/frontend/css/module.css` | 修改 | 追加 `.nf-grid`/`.nf-full`/`.nf-actions` 样式（Task 1） |
| `subsystems/samples/frontend/js/bundle.js` | 重建产物 | bundle 重建（Task 2） |
| `subsystems/samples/frontend/index.html` | 修改 | bundle 版本号（Task 2） |

---

### Task 1: new.js HTML 重排 + module.css 样式

**Files:**
- Modify: `subsystems/samples/frontend/js/views/new.js:7-29`
- Modify: `subsystems/samples/frontend/css/module.css`（文件末尾追加）

- [ ] **Step 1: 修改 /tmp 副本的 new.js 结构区（L7-29）**

复制原文并替换：

```bash
cp /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/views/new.js /tmp/new.js
```

将 `/tmp/new.js` 中 `viewNew()` 的 `v.innerHTML='<div class="card" style="max-width:960px">'+` 起、到 `'<div id="n-msg" class="muted" style="margin-top:10px"></div></div>';` 止（原 L7-29）的整段字符串，替换为：

```js
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<div class="nf-grid">'+
    '<div><label>规格/型号 *</label><fluent-select id="n-spec"><fluent-option value="">请选择机型</fluent-option></fluent-select></div>'+
    '<div><label>样品名称 *</label><fluent-text-field id="n-name" placeholder="如 1225震动样"></fluent-text-field></div>'+
    '<div class="nf-full"><label>机型编码（选择规格/型号后自动填入）</label><fluent-text-field id="n-model" disabled placeholder="选择机型后自动填入"></fluent-text-field></div>'+
    '<div><label>提供处 *</label><fluent-select id="n-source">'+sourceOpts+'</fluent-select></div>'+
    '<div><label>组别 *</label><fluent-select id="n-station">'+groupOpts+'</fluent-select></div>'+
    '<div class="nf-full"><label>备注</label><textarea id="n-notes" rows="3"></textarea></div>'+
    '</div>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<div class="nf-grid">'+
    '<div><label>样品类型</label><fluent-select id="n-type"><fluent-option value="">不适用</fluent-option><fluent-option value="OK">OK样品</fluent-option><fluent-option value="NG">NG样品</fluent-option></fluent-select></div>'+
    '<div><label>限度项目</label><fluent-select id="n-limit-item">'+limitOpts+'</fluent-select></div>'+
    '<div><label>版次（01~99，默认01）</label><fluent-text-field id="n-card-version" value="01" maxlength="2"></fluent-text-field></div>'+
    '<div><span class="muted" style="font-size:11px;display:block;margin-top:10px">样品编号生成后固定，不再随版次变化</span></div>'+
    '<div class="nf-full"><label>标准范围</label><textarea id="n-test-standard" rows="3"></textarea></div>'+
    '</div>'+
    '</div>'+
    '</div>'+
    '<div class="nf-actions">'+
    '<div id="n-preview" class="muted" style="font-size:13px"></div>'+
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
    '<fluent-button appearance="accent" onclick="submitNew()">创建样品并生成条码</fluent-button>'+
    '<span id="n-msg" class="muted"></span>'+
    '</div></div></div>';
```

**关键点**（替换时务必核对）：
- 字段 id 全部不变：`n-spec`/`n-name`/`n-model`/`n-source`/`n-station`/`n-notes`/`n-type`/`n-limit-item`/`n-card-version`/`n-test-standard`/`n-preview`/`n-msg`
- 字段顺序：规格/型号(下拉) 与 样品名称 同行第一行；机型编码 `n-model` 用 `.nf-full` 全宽跟随后方；提供处/组别 同行；备注全宽
- 版次输入移除内联 `style="width:80px"`；说明文字改为与版次同行的 span（`display:block;margin-top:10px` 对齐 label）
- 预览 `n-preview`、按钮、消息 `n-msg` 移入 `.nf-actions`；`n-preview`/`n-msg` 保留原 id
- `viewNew` 其余部分（L30 起的下拉加载/联动/`_bindPreview()`）**完全不动**
- `submitNew`/`_schedulePreview`/`_refreshPreview`/`openPrintLabel` 等函数**完全不动**

- [ ] **Step 2: 修改 /tmp 副本的 module.css（末尾追加）**

复制原文并追加：

```bash
cp /www/wwwroot/sample-mgmt/subsystems/samples/frontend/css/module.css /tmp/module.css
```

在 `/tmp/module.css` 末尾追加：

```css

/* 新建样品表单布局（2026-08-05，设计文档 2026-08-05-new-page-layout-design.md） */
.nf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
.nf-grid fluent-text-field,.nf-grid fluent-select,.nf-grid textarea{margin-bottom:0}
.nf-full{grid-column:1/-1}
.nf-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:18px;padding-top:14px}
.nf-actions fluent-button{min-width:180px}
@media(max-width:767px){.nf-grid{grid-template-columns:1fr}}
```

- [ ] **Step 3: 语法自检 + 部署**

```bash
node -c /tmp/new.js
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A cp /tmp/new.js /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/views/new.js
sudo -A chown www:www /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/views/new.js
sudo -A cp /tmp/module.css /www/wwwroot/sample-mgmt/subsystems/samples/frontend/css/module.css
sudo -A chown www:www /www/wwwroot/sample-mgmt/subsystems/samples/frontend/css/module.css
```

Expected: `node -c` 无输出；`grep -c 'nf-grid'` 部署后的 new.js 返回 ≥6（结构类出现次数）。

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/views/new.js subsystems/samples/frontend/css/module.css
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "style(samples): 新建样品页双列卡片+列内字段2列网格，机型选择置首位"
```

---

### Task 2: 重建 bundle 并部署

**Files:**
- Rebuild: `subsystems/samples/frontend/js/bundle.js`（构建产物，豁免容量红线）
- Modify: `subsystems/samples/frontend/index.html:60`

- [ ] **Step 1: 重建 bundle（www 用户）**

```bash
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && node tools/build-bundles.js 2>&1 | tail -8'
cat tools/.bundle-ver
```

Expected: 输出 `VER=<新版本号>`（如 `bmsfxyz12`），`tools/.bundle-ver` 内容与 VER 一致。新版本号记为 `$NEWVER`。

- [ ] **Step 2: 部署 samples bundle**

```bash
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A cp /tmp/bundle-samples.js /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/bundle.js
sudo -A chown www:www /www/wwwroot/sample-mgmt/subsystems/samples/frontend/js/bundle.js
```

Expected: `ls -la .../bundle.js` 属主 www，大小较旧版（108661 字节）有变化。

- [ ] **Step 3: 更新 index.html 版本号**

```bash
cp /www/wwwroot/sample-mgmt/subsystems/samples/frontend/index.html /tmp/idx-samples.html
sed -i 's|bundle.js?v=bmsfyrbqj|bundle.js?v=<NEWVER>|' /tmp/idx-samples.html
grep -n 'bundle.js?v=' /tmp/idx-samples.html
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A cp /tmp/idx-samples.html /www/wwwroot/sample-mgmt/subsystems/samples/frontend/index.html
sudo -A chown www:www /www/wwwroot/sample-mgmt/subsystems/samples/frontend/index.html
```

Expected: L60 显示 `bundle.js?v=<NEWVER>`（`<NEWVER>` 替换为 Step 1 实际值）。

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/js/bundle.js subsystems/samples/frontend/index.html
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "chore(samples): 重建 bundle 引入新建页布局优化"
```

---

### Task 3: 回归验证

**Files:** 无（只读验证）

- [ ] **Step 1: jest 全量回归（确认无后端/逻辑回归）**

```bash
export SUDO_ASKPASS=/tmp/askpass.sh
sudo -A -u www bash -c 'cd /www/wwwroot/sample-mgmt && npx jest 2>&1 | tail -40'
```

Expected: 完整日志确认 `JEST_EXIT=0`（注意 tail 可能截断 open-handle 警告，须抓完整输出看结尾测试通过数；现有 142/142 应保持）。

- [ ] **Step 2: browser_use 视觉回归（5 项）**

派发 browser_use subagent 验证 `http://192.168.90.163:4000/subsystems/samples/frontend/index.html`（admin/admin123 登录 → #/new）：

1. **字段顺序**：基础信息列自上而下为 规格/型号(下拉) → 样品名称 → 机型编码(只读,全宽) → 提供处/组别(同行) → 备注(全宽)；限度列 样品类型/限度项目(同行) → 版次+说明文字(同行) → 标准范围(全宽)
2. **选中联动**：规格/型号下拉选择某机型 → 机型编码输入框自动填入短码、编号预览出现（提供处+组别填完后）
3. **底部操作条**：`.nf-actions` 顶部边框可见，编号预览在左、创建按钮在右
4. **窄屏降级**：窗口宽度调至 <768px → 单列卡片、字段全宽
5. **创建流程**：填必填项（规格/型号/样品名称/提供处/组别）→ 点击创建 → 弹出打印标签页（新窗口）

Expected: 5 项全部通过。若发现布局缺陷（如 label 间距异常），记录并反馈修复。

- [ ] **Step 3: 双系统回归说明（不执行）**

本次未修改 `app.css` 共享类（`.new-grid`/`.new-col` 保持原样），fixtures/workbench 无影响。在最终报告中注明即可，无需实际验证。

---

### Task 4: 完成报告

- [ ] **Step 1: 输出文件臃肿检测报告**

按 AGENTS.md 第 9 节对本次修改文件输出：
1. 容量：new.js（原 107 行）/module.css（原 15 行）当前有效行数、字符、距上限剩余
2. 元素：顶层函数数量（new.js 仍为 7 个，≤10 无预警）
3. 冗余：检查是否有未使用类/内联样式残留（如版次 `width:80px` 已移除），无则说明

- [ ] **Step 2: 输出变更记录**

文件/接口/配置变更清单 + 兼容性影响（零接口变化、零数据库变化）+ 部署/回滚步骤（回滚 = 撤销 commit）+ 上线 1~3 周期监控提示（新建流程是否正常、窄屏终端可读性）。

---

### Task 5: 响应式横向溢出修复（计划外补充，commit a5c8190）

> 背景：Task 3 视觉回归（1032px 与 700px 视口）后，用户实测报告"会出现左右滚动栏"。browser_use 诊断确认任何 ≥768px 视口 `.card` 内部横向滚动（见设计文档 6.1）。

**Files:**
- Modify: `subsystems/samples/frontend/css/module.css`（.nf-grid 块更新 + 追加 2 条规则）
- Modify: `subsystems/samples/frontend/index.html`（module.css 版本号 `20260804c` → `20260805a`）

- [ ] **Step 1: 更新 module.css 的 .nf-grid 块为最终版本**

将 `.nf-grid` 块（原 L17-22）替换为：

```css
.nf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 14px}
.nf-grid>div{min-width:0}
.nf-grid fluent-text-field,.nf-grid fluent-select,.nf-grid textarea{margin-bottom:0;width:100%;min-width:0}
.nf-full{grid-column:1/-1}
.nf-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:18px;padding-top:14px}
.nf-actions fluent-button{min-width:180px}
.new-grid>.new-col{min-width:0}
@media(max-width:767px){.nf-grid{grid-template-columns:1fr}}
```

（纯 CSS 修改，**无需重建 JS bundle**，AGENTS.md 19.4 例外；/tmp 副本 + `sudo -A cp` + `chown www:www` 部署）

- [ ] **Step 2: 更新 index.html 的 module.css 版本号**

`module.css?v=20260804c` → `module.css?v=20260805a`（强制浏览器刷新新样式）。

- [ ] **Step 3: 多视口回归验证（browser_use）**

同源 iframe 逐视口（768/820/900/1000/1100/1280/1440/1920/700px）测量 `.card` 的 scrollWidth vs clientWidth，全部为 0；抽查字段同行/全宽布局与选中联动不破坏。

- [ ] **Step 4: Commit**

```bash
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com add subsystems/samples/frontend/css/module.css subsystems/samples/frontend/index.html
sudo -A -u www git -c user.name=357346987 -c user.email=357346987@qq.com commit -m "fix(samples): 新建页横向溢出——minmax(0,1fr)+fluent组件min-width:0，768px+视口不再出滚动条"
```
