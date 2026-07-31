# 有效期自动同步复检日 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** valid_until 自动等于 next_inspect_at，不再由用户手动填写

**Architecture:** 后端 RELEASE/INSPECT 分支自动设置 valid_until = next_inspect_at；前端去掉所有 valid_until 输入框（建样/标示卡编辑/详情弹窗/INSPECT 选填表单）

**Tech Stack:** Node.js + Express, vanilla JS frontend

---

### Task 1: 后端 — RELEASE/INSPECT 自动填充 valid_until，PUT 接口移除 valid_until

**Files:**
- Modify: `routes/scan.js:63,75,90-93`
- Modify: `routes/samples.js:98,108`

- [ ] **Step 1: routes/scan.js — RELEASE 分支自动填充 valid_until**

找到 L63 解构，去掉 `valid_until`：

```js
// 旧
const { sample_type, limit_item, source_type, valid_until, card_version, test_standard, test_data } = (req.body || {});
// 新
const { sample_type, limit_item, source_type, card_version, test_standard, test_data } = (req.body || {});
```

找到 L75，替换：

```js
// 旧
if (valid_until) updated.valid_until = valid_until;
// 新
updated.valid_until = updated.next_inspect_at;
```

- [ ] **Step 2: routes/scan.js — INSPECT 分支自动更新 valid_until**

找到 L90-91，替换：

```js
// 旧
const { valid_until, card_version, test_data } = req.body || {};
if (valid_until) updated.valid_until = valid_until;
// 新
updated.valid_until = updated.next_inspect_at;
const { card_version, test_data } = req.body || {};
```

找到 L94 日志文案，去掉 valid_until 引用：

```js
// 旧
const cardUpdated = (valid_until||card_version||test_data)?'、「标示卡已更新」':'';
// 新
const cardUpdated = (card_version||test_data)?'、「标示卡已更新」':'';
```

- [ ] **Step 3: routes/samples.js — PUT 接口移除 valid_until 参数**

找到 L98 解构，去掉 `valid_until`：

```js
// 旧
const { sample_type, limit_item, source_type, valid_until, card_version,
  test_standard, test_data, signed_by_rd, signed_by_qa } = req.body || {};
// 新
const { sample_type, limit_item, source_type, card_version,
  test_standard, test_data, signed_by_rd, signed_by_qa } = req.body || {};
```

找到 L108 赋值，删除整行：

```js
// 旧 (L104-114)
const updated = { ...s,
  sample_type: sample_type !== undefined ? sample_type : s.sample_type,
  limit_item: limit_item !== undefined ? limit_item : s.limit_item,
  source_type: source_type !== undefined ? source_type : s.source_type,
  valid_until: valid_until !== undefined ? valid_until : s.valid_until,
  card_version: card_version !== undefined ? card_version : s.card_version,
  ...
};
// 新 (删除 valid_until 行)
const updated = { ...s,
  sample_type: sample_type !== undefined ? sample_type : s.sample_type,
  limit_item: limit_item !== undefined ? limit_item : s.limit_item,
  source_type: source_type !== undefined ? source_type : s.source_type,
  card_version: card_version !== undefined ? card_version : s.card_version,
  ...
};
```

- [ ] **Step 4: 重启服务验证**

```bash
cd /www/wwwroot/sample-mgmt && npm restart
```

- [ ] **Step 5: Commit**

```bash
git add routes/scan.js routes/samples.js
git commit -m "feat(valid_until): auto-sync valid_until with next_inspect_at on RELEASE/INSPECT"
```

---

### Task 2: 前端 — 去掉所有 valid_until 输入框

**Files:**
- Modify: `public/js/card-fields.js:22,45-47`
- Modify: `public/js/scan.js:90-95,129-130,134`
- Modify: `public/js/new.js:41`
- Modify: `public/js/detail.js:118,139`

- [ ] **Step 1: card-fields.js — buildCardFieldTable 去掉有效期行**

删除 L22（`var v=...`）和 L25 中的 `vSt`：

```js
// 旧
var t=s.sample_type||'', l=s.limit_item||'', src=s.source_type||'';
var v=s.valid_until?new Date(s.valid_until).toISOString().slice(0,10):'';
var ver=s.card_version||'', data=s.test_data||'';
var typeSt=cardFieldStatus(s,'sample_type'), itemSt=cardFieldStatus(s,'limit_item');
var srcSt=cardFieldStatus(s,'source_type'), vSt=cardFieldStatus(s,'valid_until');
var verSt=cardFieldStatus(s,'card_version'), dataSt=cardFieldStatus(s,'test_data');
// 新
var t=s.sample_type||'', l=s.limit_item||'', src=s.source_type||'';
var ver=s.card_version||'', data=s.test_data||'';
var typeSt=cardFieldStatus(s,'sample_type'), itemSt=cardFieldStatus(s,'limit_item');
var srcSt=cardFieldStatus(s,'source_type');
var verSt=cardFieldStatus(s,'card_version'), dataSt=cardFieldStatus(s,'test_data');
```

删除 L45-47（有效期整行）：

```js
// 删除这三行
'<tr><td style="padding:4px 0;color:#6b7280">有效期</td>'+
  '<td style="padding:4px 0"><input id="scan-card-valid" type="date" value="'+v+'" '+ro+' style="font-size:12px"/></td>'+
  '<td style="padding:4px 0;text-align:right">'+mark('valid_until',vSt)+'</td></tr>'+
```

- [ ] **Step 2: scan.js — INSPECT 表单去掉有效期行**

L90-95，删除有效期 `<tr>` 和说明文字中的「有效期」：

```js
// 旧
'<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
  '<p class="muted" style="font-size:11px">复检时可更新有效期/版次/测试数据</p>'+
  '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;width:70px;color:#6b7280">有效期</td><td><input id="scan-card-valid" type="date" value="'+(s.valid_until?new Date(s.valid_until).toISOString().slice(0,10):'')+'"/></td></tr>'+
  '<tr><td style="padding:4px 0;color:#6b7280">版次</td>...
// 新
'<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
  '<p class="muted" style="font-size:11px">复检时可更新版次/测试数据</p>'+
  '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;width:70px;color:#6b7280">版次</td>...
```

L129-130，删除 confirmScan 中 valid_until 读取：

```js
// 旧
if(action==='INSPECT'){
  var vuEl=document.getElementById('scan-card-valid');if(vuEl&&vuEl.value)body.valid_until=vuEl.value;
  var verEl=document.getElementById('scan-card-ver');...
// 新
if(action==='INSPECT'){
  var verEl=document.getElementById('scan-card-ver');...
```

L134，删除 RELEASE 分支中 valid_until 读取：

```js
// 旧 (L134)
if(action==='RELEASE'){var cycEl=$('#scan-cycle');body.cycleDays=cycEl?cycEl.value:(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'90');body.sample_type=$('#scan-card-type').value;body.limit_item=$('#scan-card-item').value;var srcEl=$('#scan-card-source');if(srcEl&&srcEl.value)body.source_type=srcEl.value;var vuEl=$('#scan-card-valid');if(vuEl&&vuEl.value)body.valid_until=vuEl.value;var verEl=$('#scan-card-ver');if(verEl&&verEl.value.trim())body.card_version=verEl.value.trim();var dataEl=$('#scan-card-data');if(dataEl&&dataEl.value.trim())body.test_data=dataEl.value.trim();}
// 新
if(action==='RELEASE'){var cycEl=$('#scan-cycle');body.cycleDays=cycEl?cycEl.value:(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'90');body.sample_type=$('#scan-card-type').value;body.limit_item=$('#scan-card-item').value;var srcEl=$('#scan-card-source');if(srcEl&&srcEl.value)body.source_type=srcEl.value;var verEl=$('#scan-card-ver');if(verEl&&verEl.value.trim())body.card_version=verEl.value.trim();var dataEl=$('#scan-card-data');if(dataEl&&dataEl.value.trim())body.test_data=dataEl.value.trim();}
```

- [ ] **Step 3: new.js — 建样表单去掉有效期（2 处）**

L21 HTML 模板，删除有效期输入行：

```js
// 旧 (L19-23)
    '<label>来源</label><select id="n-source">...'+
    '<label>有效期</label><input type="date" id="n-valid-until"/>'+
    '<label>版次</label><input id="n-card-version" placeholder="如 A1"/>'+
// 新
    '<label>来源</label><select id="n-source">...'+
    '<label>版次</label><input id="n-card-version" placeholder="如 A1"/>'+
```

L41 createSample 请求体，删除 valid_until：

```js
// 旧 (L38-44)
  sample_type:$('#n-type').value,
  limit_item:$('#n-limit-item').value,
  source_type:$('#n-source').value,
  valid_until:$('#n-valid-until').value,
  card_version:$('#n-card-version').value,
// 新
  sample_type:$('#n-type').value,
  limit_item:$('#n-limit-item').value,
  source_type:$('#n-source').value,
  card_version:$('#n-card-version').value,
```

- [ ] **Step 4: detail.js — 详情弹窗有效期改为只读**

L118，将有效期 input 改为只读显示 next_inspect_at：

```js
// 旧
'<div><label>有效期</label><input type="date" id="cd-valid-until" value="'+(s.valid_until||'')+'"'+dis+'/></div>'+
// 新
'<div><label>有效期</label><span style="font-size:13px;color:#333">'+(s.next_inspect_at?new Date(s.next_inspect_at).toISOString().slice(0,10):'—')+'</span><span class="muted" style="font-size:11px"> (=复检日，自动同步)</span></div>'+
```

L139，从 save 请求中删除 valid_until：

```js
// 旧 (L136-143)
      sample_type:$('#cd-type').value,
      limit_item:$('#cd-limit-item').value,
      source_type:$('#cd-source').value,
      valid_until:$('#cd-valid-until').value,
      card_version:$('#cd-card-version').value,
// 新
      sample_type:$('#cd-type').value,
      limit_item:$('#cd-limit-item').value,
      source_type:$('#cd-source').value,
      card_version:$('#cd-card-version').value,
```

- [ ] **Step 5: 重启服务 + 浏览器验证**

```bash
cd /www/wwwroot/sample-mgmt && npm restart
```

浏览器确认：建样无有效期输入、RELEASE Step2 无有效期行、INSPECT 选填表无有效期行、详情弹窗标示卡 Tab 有效期只读。

- [ ] **Step 6: Commit**

```bash
git add public/js/card-fields.js public/js/scan.js public/js/new.js public/js/detail.js
git commit -m "feat(valid_until): remove valid_until input from all frontend forms"
```

---

### Task 3: 种子数据 — 去掉 valid_until 手动值

**Files:**
- Modify: `seed.js`
- Modify: `seed-rich.js`

- [ ] **Step 1: seed.js — 确认无需修改**

seed.js 中无 `valid_until` 引用（已 grep 确认），跳过。

- [ ] **Step 2: seed-rich.js — 删除 8 处 valid_until**

每处删除 `valid_until: fromNow(N), ` 片段。

L66: `sample_type: 'NG', limit_item: 'C', source_type: 'C', valid_until: fromNow(180),` → 删除 `valid_until: fromNow(180), `
L74: `sample_type: 'OK', limit_item: 'A', source_type: 'T', valid_until: fromNow(90), card_version: 'V2.0',` → 删除 `valid_until: fromNow(90), `
L91: `sample_type: 'OK', limit_item: 'X', source_type: 'G', valid_until: fromNow(120), card_version: 'V1.0',` → 删除 `valid_until: fromNow(120), `
L100: `sample_type: 'OK', limit_item: 'C', source_type: 'C', valid_until: fromNow(365), card_version: 'V3.0',` → 删除 `valid_until: fromNow(365), `
L129: `sample_type: 'NG', limit_item: 'P', source_type: 'T', valid_until: fromNow(90), card_version: 'V2.1',` → 删除 `valid_until: fromNow(90), `
L135: `sample_type: 'OK', limit_item: 'B', source_type: 'C', valid_until: fromNow(30), card_version: 'V1.2',` → 删除 `valid_until: fromNow(30), `
L141: `sample_type: 'NG', limit_item: 'C', source_type: 'G', valid_until: fromNow(-15), card_version: 'V1.0',` → 删除 `valid_until: fromNow(-15), `
L147: `sample_type: 'OK', limit_item: 'X', source_type: 'T', valid_until: fromNow(365), card_version: 'V4.0',` → 删除 `valid_until: fromNow(365), `

- [ ] **Step 3: 重新导入种子验证**

```bash
cd /www/wwwroot/sample-mgmt && node seed-rich.js
```

确认无报错。

- [ ] **Step 4: Commit**

```bash
git add seed.js seed-rich.js
git commit -m "chore(seed): remove valid_until from seed data"
```

---

### Task 4: 文档 — 更新操作说明书

**Files:**
- Modify: `docs/operation-manual.md`

- [ ] **Step 1: 建样章节 — 去掉有效期**

找到「四、4.1 新建样品」，删除有效期相关说明行。

- [ ] **Step 2: 标示卡章节 — 说明有效期自动同步**

找到标示卡相关描述，补充说明：有效期自动等于复检日，不再手动填写。

- [ ] **Step 3: Commit**

```bash
git add docs/operation-manual.md
git commit -m "docs: update valid_until auto-sync behavior"
```
