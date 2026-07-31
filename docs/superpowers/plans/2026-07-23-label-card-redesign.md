# 标签+标示卡组合式打印 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构标签和标示卡为组合式 2:3 布局，研发建样时打印标签（左 QR+基本信息，右空白标示卡区），品保发行时打印标示卡贴入空白区。

**Architecture:** 标签 HTML 模板统一到 `routes/cards.js` 的 `buildLabelHtml()` 工厂函数；标示卡 HTML 用 `buildCardPrintHtml()`；前端 `openPrintLabel()` 改为 `window.open` 调服务端渲染；发行成功自动触发打印标示卡。

**Tech Stack:** Node.js/Express, QRCode, vanilla JS

---

## 文件结构

| 角色 | 文件 | 职责 |
|---|---|---|
| 标签 HTML 工厂 | `routes/cards.js` | `buildLabelHtml(s, qrDataUrl)` — 生成 2:3 标签，供 print 和 download 共用 |
| 标签打印端点 | `routes/cards.js` | `GET /api/samples/:id/label/print` — 返回 HTML + 自动 window.print() |
| 标签下载端点 | `routes/cards.js` | `GET /api/samples/:id/label/download` — 返回 HTML 附件 |
| 标示卡打印 | `routes/cards.js` | `GET /api/samples/:id/card/print` — 无 QR 标示卡，新字段名 |
| 匿名标示卡 | `routes/cards.js` | `GET /card/:sample_no` — 更新字段名 |
| 前端标签打印 | `public/js/new.js` | `openPrintLabel()` — 改为 window.open 到 label/print |
| 前端补打标签 | `public/js/samples.js` | `printSampleLabel()` — 复用 openPrintLabel |
| 发行后打标示卡 | `public/js/scan.js` | `confirmScan()` RELEASE 后调 `printCard()` |
| 标示卡 tab 始终显示 | `public/js/detail.js` | `viewDetail()` — hasCard 条件移除 |
| CSS | `public/css/app.css` | 新增 `.card-grid` 编辑表单样式 |

---

### Task 1: 添加标签打印端点 + 共享工厂函数

**Files:**
- Modify: `routes/cards.js`

- [ ] **Step 1: 添加 `buildLabelHtml` 工厂函数**

在 `routes/cards.js` 顶部（`register` 函数之前、`fmtCard` 之后）加入：

```js
function buildLabelHtml(s, qrDataUrl, blankCard) {
  const meta = [s.model || '', s.station || ''].filter(Boolean).join(' · ') || '—';
  const cardSide = blankCard
    ? `<div style="flex:1;min-width:0;padding:0 4px;border-left:1px dashed #aaa">
         <div style="font-weight:700;font-size:7px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px">标示卡（发行后打印贴入）</div>
         <div style="font-size:7px;color:#ccc;line-height:1.6">
           <div><span style="color:#d5d5d5">类型</span> ___ <span style="color:#d5d5d5">来源</span> ___ <span style="color:#d5d5d5">版次</span> ___</div>
           <div><span style="color:#d5d5d5">项目</span> ________ <span style="color:#d5d5d5">有效期</span> ________</div>
           <div><span style="color:#d5d5d5">标准范围</span> ________________________</div>
           <div><span style="color:#d5d5d5">样品数值</span> ________________________</div>
           <div><span style="color:#d5d5d5">制作</span> ________ <span style="color:#d5d5d5">确认</span> ________</div>
           <div><span style="color:#d5d5d5">备注</span> ____________________________</div>
         </div>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>标签 ${s.sample_no}</title>
<style>
@page{margin:3mm;size:auto}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.lab{width:280px;border:2px solid #000;border-radius:10px;padding:10px;display:flex;gap:7px}
.qr-side{width:100px;flex-shrink:0;text-align:center}
.qr-side img{width:66px;height:66px;display:block;margin:0 auto}
.qr-side .no{font-weight:700;font-size:11px;margin-top:3px;line-height:1.2}
.qr-side .name{font-size:9px;line-height:1.4}
.qr-side .meta{font-size:8px;color:#555;line-height:1.3}
.qr-side .spec{font-size:7px;color:#666;line-height:1.2;margin-top:1px}
.footer-note{font-size:6px;color:#999;text-align:center;margin-top:5px}
@media print{html,body{width:auto;height:auto;overflow:visible}}
</style></head><body>
<div class="lab">
  <div class="qr-side">
    <img src="${qrDataUrl}" alt="QR"/>
    <div class="no">${s.sample_no}</div>
    <div class="name">${s.name||'—'}</div>
    <div class="meta">${meta}</div>
    <div class="spec">${s.spec||''}</div>
  </div>
  ${cardSide}
</div>
<div class="footer-note">贴于样品并扫码确认</div>
</body></html>`;
}
```

- [ ] **Step 2: 添加 `GET /api/samples/:id/label/print` 端点**

在 `register` 函数内、`/api/samples/:id/label/download` 之前加入：

```js
// 打印标签（2:3布局，左QR+基本信息，右空白标示卡区，自动打印）
app.get('/api/samples/:id/label/print', requireAuth, (req, res) => {
  const s = D.getSampleById(Number(req.params.id));
  if (!s) return res.status(404).json({ error: '样品不存在' });
  QRCode.toDataURL(s.sample_no, { width: 132, margin: 1, errorCorrectionLevel: 'M' })
    .then(qrDataUrl => {
      const html = buildLabelHtml(s, qrDataUrl, true);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.send(html + '<script>window.onload=function(){window.print()}</script>');
    })
    .catch(e => {
      logger.error('生成标签失败: '+e.message);
      res.status(500).json({ error: '生成标签失败' });
    });
});
```

- [ ] **Step 3: 更新 `GET /api/samples/:id/label/download` 使用共享工厂**

替换现有 L157-189 的 download 端点：

```js
// 下载标签（HTML附件，2:3布局）
app.get('/api/samples/:id/label/download', requireAuth, (req, res) => {
  const s = D.getSampleById(Number(req.params.id));
  if (!s) return res.status(404).json({ error: '样品不存在' });
  QRCode.toDataURL(s.sample_no, { width: 132, margin: 1, errorCorrectionLevel: 'M' })
    .then(qrDataUrl => {
      const html = buildLabelHtml(s, qrDataUrl, true);
      res.set('Content-Type', 'text/html; charset=utf-8');
      res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_label.html"');
      res.send(html);
    })
    .catch(e => {
      logger.error('生成标签失败: '+e.message);
      res.status(500).json({ error: '生成标签失败' });
    });
});
```

- [ ] **Step 4: 提交**

```bash
git add routes/cards.js
git commit -m "feat: add label print endpoint with 2:3 layout, shared buildLabelHtml factory"
```

---

### Task 2: 重新设计标示卡打印模板

**Files:**
- Modify: `routes/cards.js`

- [ ] **Step 1: 添加 `buildCardPrintHtml` 工厂函数**

在 `buildLabelHtml` 后面加入：

```js
function fmtDateYYMMDD(t) {
  if (!t) return '______';
  const d = new Date(t);
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return yy+mm+dd;
}

function buildCardPrintHtml(s) {
  const sourceLabel = {C:'客供', T:'元山', G:'元将五金塔岗分厂'}[s.source_type] || s.source_type || '';
  const validStr = fmtDateYYMMDD(s.valid_until);
  const now = new Date();
  const expired = s.valid_until && new Date(s.valid_until) < now;
  const validColor = expired ? 'color:#dc2626;font-weight:700' : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>标示卡 ${s.sample_no}</title>
<style>
@page{margin:2mm;size:auto}*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'PingFang SC','Microsoft YaHei',-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.crd{width:155px;border:2px solid #000;border-radius:8px;padding:8px;font-size:7px;line-height:1.5}
.crd .title{font-weight:700;font-size:7px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px}
.crd .grid{display:grid;grid-template-columns:28px 1fr 28px 1fr;gap:2px 4px}
.crd .lbl{color:#999;white-space:nowrap;text-align:right}
.crd .val{color:#333;white-space:nowrap;min-width:0}
.crd .full{grid-column:1/-1;display:flex;gap:3px}
.crd .full .lbl{min-width:28px;flex-shrink:0}
@media print{html,body{width:auto;height:auto;overflow:visible}}
</style></head><body>
<div class="crd">
  <div class="title">标示卡</div>
  <div class="grid">
    <span class="lbl">类型</span><span class="val">${s.sample_type||''}</span>
    <span class="lbl">来源</span><span class="val">${sourceLabel}</span>
    <span class="lbl">版次</span><span class="val">${s.card_version||''}</span>
    <span class="lbl">项目</span><span class="val" style="grid-column:span 3">${s.limit_item||''}</span>
    <span class="lbl">有效期</span><span class="val" style="grid-column:span 3;${validColor}">${validStr}${expired?' [已过期]':''}</span>
    <div class="full"><span class="lbl">标准范围</span><span class="val">${s.test_standard||''}</span></div>
    <div class="full"><span class="lbl">样品数值</span><span class="val">${s.test_data||''}</span></div>
    <span class="lbl">制作</span><span class="val">${s.signed_by_rnd||''}</span>
    <span class="lbl">确认</span><span class="val">${s.signed_by_qa||''}</span>
    <div class="full"><span class="lbl">备注</span><span class="val">${s.notes||''}</span></div>
  </div>
</div></body></html>`;
}
```

- [ ] **Step 2: 替换 `GET /api/samples/:id/card/print` 端点**

替换现有的 L99-154（整个 card/print 端点）：

```js
// 打印标示卡（无QR，仅标示卡内容，品保发行后贴入标签空白区）
app.get('/api/samples/:id/card/print', requireAuth, (req, res) => {
  const s = D.getSampleById(Number(req.params.id));
  if (!s) return res.status(404).json({ error: '样品不存在' });
  const html = buildCardPrintHtml(s);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(html + '<script>window.onload=function(){window.print()}</script>');
});
```

- [ ] **Step 3: 更新匿名标示卡页面 `/card/:sample_no` 字段名**

修改 L72-86 中的字段标签：

```
限度项目 → 项目
来源 → 来源
版次 → 版次
测试标准 → 标准范围
测试数据 → 样品数值
有效期 → 有效期
制作人 → 制作
确认人 → 确认
```

- [ ] **Step 4: 提交**

```bash
git add routes/cards.js
git commit -m "feat: redesign card print template, update anonymous card field names"
```

---

### Task 3: 前端 `openPrintLabel` 改为调用服务端端点

**Files:**
- Modify: `public/js/new.js`

- [ ] **Step 1: 替换 `openPrintLabel` 函数**

将 L50-74 替换为：

```js
function openPrintLabel(s){
  window.open('/api/samples/'+s.id+'/label/print','_blank');
}
```

- [ ] **Step 2: 提交**

```bash
git add public/js/new.js
git commit -m "refactor: openPrintLabel uses server-side label/print endpoint"
```

---

### Task 4: 发行成功后自动触发标示卡打印

**Files:**
- Modify: `public/js/scan.js`

- [ ] **Step 1: 在 `confirmScan` RELEASE 成功后触发打印**

在 `confirmScan()` 函数中，RELEASE 成功处理后、toast 之前，加入打印触发。修改 L140-157 的部分：

找到 `if(action==='RELEASE')` 处理逻辑（在 L141-155 的 try 块中），在 toast 前加：

```js
if(action==='RELEASE'){setTimeout(function(){printCard(r.sample.id);},500);}
```

具体：在 L155 `toast('操作成功','ok');` 之前（非连续模式的 toast），和 L147 `toast('操作成功，可继续扫码','ok');` 之前（连续模式的 toast），各加一行打印触发。

更简洁的方式：在 try 块中 L140 `const r=await api('POST','/api/scan',body);` 之后立即加入：

```js
if(action==='RELEASE'){setTimeout(function(){window.open('/api/samples/'+r.sample.id+'/card/print','_blank');},600);}
```

在 L140 和 L141 之间插入。

- [ ] **Step 2: 提交**

```bash
git add public/js/scan.js
git commit -m "feat: auto-trigger card print after QA release"
```

---

### Task 5: 所有样品始终显示标示卡 tab

**Files:**
- Modify: `public/js/detail.js`

- [ ] **Step 1: 移除标示卡 tab 的条件限制**

将 L49 的：

```js
var hasImage=mainImg||s.inspect_image,hasLogs=s.logs && s.logs.length>0,hasCard=s.sample_type||s.limit_item||s.source_type;
```

改为：

```js
var hasImage=mainImg||s.inspect_image,hasLogs=s.logs && s.logs.length>0,hasCard=true;
```

- [ ] **Step 2: 更新标示卡编辑表单字段名**

在 `viewDetailCard()` 函数中（L101-131），更新字段标签匹配新命名：

- L115: `<label>样品类型</label>` → 保持不变（研发建样时也用此名）
- L116: `<label>限度项目</label>` → 保持不变
- L117: `<label>来源</label>` → 保持不变
- L118: `<label>有效期</label>` → 保持不变
- L119: `<label>版次</label>` → 保持不变
- L120: `<label>制作人</label>` → `<label>制作</label>`
- L121: `<label>品保确认人</label>` → `<label>确认</label>`
- L123: `<label style="margin-top:8px">测试标准/规格</label>` → `<label style="margin-top:8px">标准范围</label>`
- L124: `<label style="margin-top:8px">测试数据/实测值</label>` → `<label style="margin-top:8px">样品数值</label>`

同时更新 `saveCard()` 中 L142-143 的 `test_standard`/`test_data` key 保持不变（后端字段名不变）。

- [ ] **Step 3: 更新 `.card-grid` CSS 支持多行布局**

在 `app.css` L120-122 的 `.card-grid` 处，增加对单行全宽字段的支持（标准范围/样品数值/备注各占一行）：

```css
.card-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}
.card-grid .full-row{grid-column:1/-1}
```

然后修改 `viewDetailCard()` 中表单布局，将标准/数据改为占满行：

```js
'<div><label>制作</label><input id="cd-signed-rnd" value="'+(s.signed_by_rnd||'')+'"'+dis+'/></div>'+
'<div><label>确认</label><input id="cd-signed-qa" value="'+(s.signed_by_qa||'')+'"'+dis+'/></div>'+
'<div class="full-row"><label>标准范围</label><textarea id="cd-test-standard" rows="1"'+dis+'style="resize:none;min-height:32px">'+(s.test_standard||'')+'</textarea></div>'+
'<div class="full-row"><label>样品数值</label><textarea id="cd-test-data" rows="1"'+dis+'style="resize:none;min-height:32px">'+(s.test_data||'')+'</textarea></div>'+
```

- [ ] **Step 4: 提交**

```bash
git add public/js/detail.js public/css/app.css
git commit -m "feat: always show card tab, update card form field labels"
```

---

### Task 6: 运行测试验证

**Files:**
- Test: `tests/samples.test.js`

- [ ] **Step 1: 运行测试**

```bash
npm test
```

预期：40 passed，0 failed

- [ ] **Step 2: 如有失败，修复后重新运行**

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动服务器**

```bash
npm start
```

- [ ] **Step 2: 浏览器验证清单**

1. 用 rd01 登录，新建样品 → 确认标签打印窗口弹出，2:3 布局，左侧 QR+信息，右侧空白标示卡区
2. 样品列表 → 点击「打印」→ 同样的 2:3 标签
3. 样品列表 → 详情 → 标示卡 tab → 始终显示（包括无限度信息的样品）
4. 标示卡编辑表单：类型/项目/来源/有效期/版次 在 2 列网格中，标准范围/样品数值 占满行，制作/确认 并排，备注 占满行
5. 用 qa01 登录，扫码 RELEASE → 确认发行 → 标示卡打印窗口自动弹出
6. 标示卡打印内容：无 QR 码，6 行按指定布局（类型+来源+版次 / 项目+有效期 / 标准范围 / 样品数值 / 制作+确认 / 备注）
7. 实际打印：窗口弹出后自动调用 window.print()，正确调用打印机

- [ ] **Step 3: 提交最终变更**

```bash
git add -A
git commit -m "chore: final verification after label-card redesign"
```
