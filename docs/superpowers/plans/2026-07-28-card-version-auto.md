# 版次自动填写 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 标示卡版次 RELEASE 首发自动填 "01"，RE_RELEASE 自动 +1（最高99），用户可手动调整。

**Architecture:** 前后端各实现一份 `nextCardVersion` 辅助函数（避免额外API调用），`buildCardFieldTable` 新增 `suggestedVersion` 参数用于预填，后端兜底确保提交值有效。

**Tech Stack:** Node.js/Express (routes/scan.js) + 原生 JS (scan-wizard.js, card-fields.js)

**Spec:** [2026-07-28-card-version-auto-design.md](../specs/2026-07-28-card-version-auto-design.md)

---

### Task 1: 后端 — nextCardVersion 辅助函数 + 兜底逻辑

**Files:**
- Modify: `routes/scan.js:3-4` (插入辅助函数)
- Modify: `routes/scan.js:94` (RELEASE handler)
- Modify: `routes/scan.js:154` (RE_RELEASE handler)

- [ ] **Step 1: 在 routes/scan.js 顶部（require 行之后）插入 nextCardVersion 函数**

在 `// 扫码页面：解析码，返回样品信息与可能的操作` 注释之前插入：

```js
// 计算下一个版次号（格式 "01"~"99"），兼容旧格式 V1.0/A1 等取数字部分+1
function nextCardVersion(current) {
  const m = String(current||'').match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 0;
  return String(Math.min(n + 1, 99)).padStart(2, '0');
}
```

- [ ] **Step 2: RELEASE handler — L94 改为首发默认 "01"**

原始代码（routes/scan.js L94）：
```js
      if (card_version) updated.card_version = card_version.trim();
```

替换为：
```js
      updated.card_version = (card_version && card_version.trim()) || '01';
```

- [ ] **Step 3: RE_RELEASE handler — L154 改为兜底 +1**

原始代码（routes/scan.js L154）：
```js
      if (card_version) updated.card_version = card_version.trim();
```

替换为：
```js
      updated.card_version = (card_version && card_version.trim()) || nextCardVersion(s.card_version);
```

- [ ] **Step 4: 语法检查**

```bash
cd /www/wwwroot/sample-mgmt && node -c routes/scan.js
```
预期：无错误输出。

- [ ] **Step 5: Commit**

```bash
git add routes/scan.js
git commit -m "feat(scan): add nextCardVersion helper, auto card_version on RELEASE/RE_RELEASE"
```

---

### Task 2: 前端 — card-fields.js 新增 suggestedVersion 参数

**Files:**
- Modify: `public/js/card-fields.js:20` (函数签名)
- Modify: `public/js/card-fields.js:45` (input value)

- [ ] **Step 1: 修改 buildCardFieldTable 函数签名，接收第3个参数**

原始代码（card-fields.js L20）：
```js
function buildCardFieldTable(s,editable){
```

替换为：
```js
function buildCardFieldTable(s,editable,suggestedVersion){
```

- [ ] **Step 2: L22 行修改 ver 变量赋值，优先使用 suggestedVersion**

原始代码（card-fields.js L22）：
```js
  var ver=s.card_version||'', data=s.test_data||'';
```

替换为：
```js
  var ver=suggestedVersion||s.card_version||'', data=s.test_data||'';
```

- [ ] **Step 3: Commit**

```bash
git add public/js/card-fields.js
git commit -m "feat(card): add suggestedVersion param to buildCardFieldTable"
```

---

### Task 3: 前端 — scan-wizard.js 前端计算 + 传入建议值

**Files:**
- Modify: `public/js/scan-wizard.js:1-4` (插入辅助函数)
- Modify: `public/js/scan-wizard.js:44` (调用处传参)
- Modify: `public/js/scan-return-actions.js:12` (调用处传参，RE_RELEASE 走 scan-return-actions.js 的 RE_RELEASE 分支)

- [ ] **Step 1: 在 scan-wizard.js 顶部插入前端版 nextCardVersion**

在 `var wizardSample=null;` 之前插入：

```js
// 计算下一个版次号（与后端逻辑一致）
function nextCardVersion(c){var m=String(c||'').match(/\d+/);var n=m?parseInt(m[0],10):0;return String(Math.min(n+1,99)).padStart(2,'0');}
```

- [ ] **Step 2: 修改 renderWizardStep2 中 buildCardFieldTable 调用**

原始代码（scan-wizard.js L44）：
```js
      buildCardFieldTable(s,true)+
```

替换为：
```js
      buildCardFieldTable(s,true,(s._isReRelease?nextCardVersion(s.card_version):(s.card_version||'01')))+
```

- [ ] **Step 3: 修改 scan-return-actions.js 中 buildReleaseWizard 调用处**

`scan-return-actions.js` L12 也调用了 `buildReleaseWizard(s,true)`，该函数入口会设置 `s._isReRelease=true`，因此无需额外修改 —— 但需确认渲染路径。实际上 L12 调用 `buildReleaseWizard(s,true)` → `buildReleaseWizard` 设置 `wizardSample._isReRelease=true` → `renderWizardStep2` 中 `s._isReRelease` 为 true。路径正确，无需额外改动。

- [ ] **Step 4: 语法检查**

```bash
cd /www/wwwroot/sample-mgmt && node -c public/js/scan-wizard.js
```
预期：无错误输出。

- [ ] **Step 5: Commit**

```bash
git add public/js/scan-wizard.js
git commit -m "feat(wizard): compute suggested card version for RELEASE/RE_RELEASE"
```

---

### Task 4: 验证 — 端到端回归

- [ ] **Step 1: 重启服务**

在宝塔面板 PM2 管理器中重启 sample-mgmt 服务（加载新的 routes/scan.js）。

- [ ] **Step 2: 浏览器验证**

1. 登录 QA 账号（qa01/qa123）
2. 扫码台扫描一个 PRODUCED 状态的样品
3. 选择「确认正式发行」→ Step2 标示卡审查 → 版次应默认显示 `01`
4. 完成发行流程，确认成功
5. 再扫描该样品（状态应为 IN_CUSTODY）→ 保管人扫码退回 → QA 重新扫码 → 选择「重新发行」
6. Step2 版次应默认显示 `02`
7. 手动改为 `03` → 完成 RE_RELEASE → 查看样品详情，版次应为 `03`

- [ ] **Step 3: 边界验证**

1. 找一个 card_version 为旧格式（V1.0）的样品（如演示数据 SM-000001）
2. 走 RE_RELEASE 流程 → 版次应默认显示 `02`
3. 找一个 card_version 为 "99" 的样品 → RE_RELEASE → 版次应显示 "99"

- [ ] **Step 4: 非发行场景不受影响**

1. 对 IN_CUSTODY 样品执行「修正标示卡」(EDIT_CARD) → 版次保持原值，不自动+1
2. 详情页直接编辑标示卡（detail.js saveCard）→ 版次保持原值

---

### Task 5: 文档同步 + 臃肿检测

- [ ] **Step 1: 更新操作手册**

`docs/operation-manual.md` 中「标示卡」相关章节补充：版次首发自动01，重新发行自动+1。

- [ ] **Step 2: 输出臃肿检测报告**

对本次修改的 3 个文件进行容量评估并输出报告。

---
