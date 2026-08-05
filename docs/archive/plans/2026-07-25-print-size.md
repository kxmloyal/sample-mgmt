# 打印尺寸功能 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 标签和标示卡打印支持 3 档预设尺寸（小号/中标/大号）+ 自定义输入，标示卡自动跟随标签尺寸等比缩放。

**Architecture:** 后端 `buildLabelHtml`/`buildCardPrintHtml` 新增 `sizeKey` 参数，按 `scale = width/100` 等比缩放所有 CSS 数值和 QR 生成尺寸。前端通过 localStorage 记忆选择，所有打印入口（新建/列表/扫码/队列）传递 `?size=` 参数。打印页顶部注入尺寸选择器，切换时页面重载。

**Tech Stack:** Node.js + Express · 原生 HTML/CSS/JS · QRCode

**Spec:** [docs/superpowers/specs/2026-07-25-print-size-design.md](../specs/2026-07-25-print-size-design.md)

---

### Task 1: 添加 PRINT_SIZES 常量和 getPrintSize 工具函数

**Files:**
- Modify: `public/js/constants.js`

- [ ] **Step 1: 在 constants.js 末尾追加常量**

```js
// 打印尺寸预设（宽度 mm），scale = width / 100
var PRINT_SIZES=[
  {key:'small',label:'小号',width:50},
  {key:'medium',label:'中标',width:70},
  {key:'large',label:'大号',width:100},
  {key:'custom',label:'自定义',width:null}
];
// 读取用户首选打印尺寸，默认中标(70mm)
function getPrintSize(){
  try{return localStorage.getItem('printSize')||'medium';}catch(e){return 'medium';}
}
function setPrintSize(key){
  try{localStorage.setItem('printSize',key);}catch(e){}
}
```

- [ ] **Step 2: 验证常量文件行数**

```bash
wc -l public/js/constants.js
```

- [ ] **Step 3: Commit**

```bash
git add public/js/constants.js
git commit -m "feat(print): add PRINT_SIZES constant and getPrintSize helper"
```

---

### Task 2: 后端 buildLabelHtml 支持 sizeKey 参数

**Files:**
- Modify: `routes/cards.js:12-54`

- [ ] **Step 1: 修改 buildLabelHtml 函数签名和样式动态化**

将 `function buildLabelHtml(s, qrDataUrl, blankCard)` 改为 `function buildLabelHtml(s, qrDataUrl, blankCard, sizeKey)`，内部新增 `scale` 计算，所有硬编码的 px 值替换为 `Math.round(基准 × scale)`。

当前函数（第 12-54 行）替换为：

```js
function buildLabelHtml(s, qrDataUrl, blankCard, sizeKey) {
  // 打印尺寸计算（默认大号=100mm，兼容不传参）
  var sizeKey2 = sizeKey || 'large';
  var size = { small: {w:50}, medium: {w:70}, large: {w:100} }[sizeKey2] || {w:100};
  if (sizeKey2==='custom' && size.customW) size.w = size.customW;
  var scale = size.w / 100; // 0.5 / 0.7 / 1.0

  // 动态尺寸（基于大号 100mm = 当前值 280px/100px/66px/…）
  var labW = Math.round(280 * scale);          // .lab width
  var qrSideW = Math.round(100 * scale);       // .qr-side width
  var qrImgW = Math.round(66 * scale);         // QR 显示
  var pad = Math.round(10 * scale);            // padding
  var gap = Math.round(7 * scale);             // gap
  var radius = Math.round(10 * scale);         // border-radius
  var borderW = scale >= 0.7 ? 2 : 1;          // 小号边框 1px
  var noSize = Math.round(11 * scale);          // 编号字号
  var nameSize = Math.round(9 * scale);         // 名称字号
  var metaSize = Math.round(8 * scale);         // 机型字号
  var specSize = Math.round(7 * scale);         // 规格字号
  var cardTitle = Math.round(7 * scale);        // 标示卡标题字号
  var cardText = Math.round(7 * scale);         // 标示卡正文字号
  var footerSize = Math.round(6 * scale);       // 脚注字号
  var cardPad = Math.round(4 * scale);          // 标示卡内边距

  var meta = [s.model || '', s.station || ''].filter(Boolean).join(' \u00b7 ') || '\u2014';
  var cardSide = blankCard
    ? '<div style="flex:1;min-width:0;padding:0 '+cardPad+'px;border-left:1px dashed #aaa">'+
         '<div style="font-weight:700;font-size:'+cardTitle+'px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px">\u6807\u793a\u5361\uff08\u53d1\u884c\u540e\u6253\u5370\u8d34\u5165\uff09</div>'+
         '<div style="font-size:'+cardText+'px;color:#ccc;line-height:1.6">'+
           '<div><span style="color:#d5d5d5">\u7c7b\u578b</span> ___ <span style="color:#d5d5d5">\u6765\u6e90</span> ___ <span style="color:#d5d5d5">\u7248\u6b21</span> ___</div>'+
           '<div><span style="color:#d5d5d5">\u9879\u76ee</span> ________ <span style="color:#d5d5d5">\u6709\u6548\u671f</span> ________</div>'+
           '<div><span style="color:#d5d5d5">\u6837\u54c1\u6570\u503c</span> ________________________</div>'+
           '<div><span style="color:#d5d5d5">\u5236\u4f5c</span> ________ <span style="color:#d5d5d5">\u786e\u8ba4</span> ________</div>'+
           '<div><span style="color:#d5d5d5">\u5907\u6ce8</span> ____________________________</div>'+
         '</div>'+
       '</div>'
    : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u7b7e '+s.sample_no+'</title>\n'+
'<style>\n'+
'@page{margin:3mm;size:auto}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}\n'+
'.lab{width:'+labW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;display:flex;gap:'+gap+'px}\n'+
'.qr-side{width:'+qrSideW+'px;flex-shrink:0;text-align:center}\n'+
'.qr-side img{width:'+qrImgW+'px;height:'+qrImgW+'px;display:block;margin:0 auto}\n'+
'.qr-side .no{font-weight:700;font-size:'+noSize+'px;margin-top:3px;line-height:1.2}\n'+
'.qr-side .name{font-size:'+nameSize+'px;line-height:1.4}\n'+
'.qr-side .meta{font-size:'+metaSize+'px;color:#555;line-height:1.3}\n'+
'.qr-side .spec{font-size:'+specSize+'px;color:#666;line-height:1.2;margin-top:1px}\n'+
'.footer-note{font-size:'+footerSize+'px;color:#999;text-align:center;margin-top:5px}\n'+
'@media print{html,body{width:auto;height:auto;overflow:visible}}\n'+
'</style></head><body>\n'+
'<div class="lab">\n'+
'  <div class="qr-side">\n'+
'    <img src="'+qrDataUrl+'" alt="QR"/>\n'+
'    <div class="no">'+s.sample_no+'</div>\n'+
'    <div class="name">'+(s.name||'\u2014')+'</div>\n'+
'    <div class="meta">'+meta+'</div>\n'+
'    <div class="spec">'+(s.spec||'')+'</div>\n'+
'  </div>\n'+
'  '+cardSide+'\n'+
'</div>\n'+
'<div class="footer-note">\u8d34\u4e8e\u6837\u54c1\u5e76\u626b\u7801\u786e\u8ba4</div>\n'+
'</body></html>';
}
```

- [ ] **Step 2: 验证**

```bash
node -e "require('./routes/cards')" 2>&1 | head -5
```

- [ ] **Step 3: Commit**

```bash
git add routes/cards.js
git commit -m "feat(print): buildLabelHtml supports sizeKey for print scaling"
```

---

### Task 3: 后端 buildCardPrintHtml 支持 sizeKey 参数

**Files:**
- Modify: `routes/cards.js:77-121`

- [ ] **Step 1: 修改 buildCardPrintHtml 函数**

将 `function buildCardPrintHtml(s)` 改为 `function buildCardPrintHtml(s, sizeKey)`：

```js
function buildCardPrintHtml(s, sizeKey) {
  var sizeKey2 = sizeKey || 'large';
  var size = { small: {w:50}, medium: {w:70}, large: {w:100} }[sizeKey2] || {w:100};
  if (sizeKey2==='custom' && size.customW) size.w = size.customW;
  var scale = size.w / 100;

  var cardW = Math.round(155 * scale);
  var pad = Math.round(8 * scale);
  var radius = Math.round(8 * scale);
  var borderW = scale >= 0.7 ? 2 : 1;
  var fontSize = Math.round(7 * scale);
  var titleSize = Math.round(7 * scale);
  var gridCol = Math.round(28 * scale);
  var gap1 = Math.round(2 * scale);
  var gap2 = Math.round(4 * scale);

  var sourceLabel = {C:'\u5ba2\u4f9b', T:'\u5143\u5c71', G:'\u5143\u5c06\u4e94\u91d1\u5854\u5c97\u5206\u5382'}[s.source_type] || s.source_type || '';
  var limitLabel = LIMIT_LABELS[s.limit_item] || s.limit_item || '';
  var validStr = fmtDateYYMMDD(s.valid_until);
  var now = new Date();
  var expired = s.valid_until && new Date(s.valid_until) < now;
  var validColor = expired ? 'color:#dc2626;font-weight:700' : '';

  return '<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>\u6807\u793a\u5361 '+s.sample_no+'</title>\n'+
'<style>\n'+
'@page{margin:2mm;size:auto}*{margin:0;padding:0;box-sizing:border-box}\n'+
'body{font-family:\'PingFang SC\',\'Microsoft YaHei\',-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}\n'+
'.crd{width:'+cardW+'px;border:'+borderW+'px solid #000;border-radius:'+radius+'px;padding:'+pad+'px;font-size:'+fontSize+'px;line-height:1.5}\n'+
'.crd .title{font-weight:700;font-size:'+titleSize+'px;text-align:center;color:#6b7280;border-bottom:1px solid #e5e7eb;padding-bottom:2px;margin-bottom:4px}\n'+
'.crd .grid{display:grid;grid-template-columns:'+gridCol+'px 1fr '+gridCol+'px 1fr;gap:'+gap1+'px '+gap2+'px}\n'+
'.crd .lbl{color:#999;white-space:nowrap;text-align:right}\n'+
'.crd .val{color:#333;white-space:nowrap}\n'+
'.crd .full{grid-column:1/-1;display:flex;gap:3px;overflow:visible}\n'+
'.crd .full .lbl{min-width:'+gridCol+'px;flex-shrink:0}\n'+
'.crd .full .val{overflow:visible;flex:1}\n'+
'.crd .pair-row{grid-column:1/-1;display:flex;justify-content:space-between}\n'+
'.crd .pair-row .pair{display:flex;gap:2px;flex-shrink:0}\n'+
'.crd .pair-row .pair .lbl{min-width:'+gridCol+'px;flex-shrink:0;text-align:right}\n'+
'@media print{html,body{width:auto;height:auto;overflow:visible}}\n'+
'</style></head><body>\n'+
'<div class="crd">\n'+
'  <div class="title">\u6807\u793a\u5361</div>\n'+
'  <div class="grid">\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">\u7c7b\u578b</span><span class="val"><b>'+(s.sample_type||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">\u6765\u6e90</span><span class="val"><b>'+sourceLabel+'</b></span></div>\n'+
'    </div>\n'+
'    <span class="lbl">\u7248\u6b21</span><span class="val"><b>'+(s.card_version||'')+'</b></span>\n'+
'    <div class="full"><span class="lbl">\u9879\u76ee</span><span class="val"><b>'+limitLabel+'</b></span></div>\n'+
'    <div class="full"><span class="lbl">\u6709\u6548\u671f</span><span class="val" style="'+validColor+'"><b>'+validStr+'</b>'+(expired?' [\u5df2\u8fc7\u671f]':'')+'</span></div>\n'+
'    <div class="full"><span class="lbl">\u6837\u54c1\u6570\u503c</span><span class="val">'+(s.test_data||'')+'</span></div>\n'+
'    <div class="pair-row">\n'+
'      <div class="pair"><span class="lbl">\u5236\u4f5c</span><span class="val"><b>'+(s.signed_by_rd||s.signed_by_rnd||'')+'</b></span></div>\n'+
'      <div class="pair"><span class="lbl">\u786e\u8ba4</span><span class="val"><b>'+(s.signed_by_qa||'')+'</b></span></div>\n'+
'    </div>\n'+
'    <div class="full"><span class="lbl">\u5907\u6ce8</span><span class="val">'+(s.notes||'')+'</span></div>\n'+
'  </div>\n'+
'</div></body></html>';
}
```

- [ ] **Step 2: Commit**

```bash
git add routes/cards.js
git commit -m "feat(print): buildCardPrintHtml supports sizeKey for print scaling"
```

---

### Task 4: 更新后端路由，接收 ?size= 参数并传递

**Files:**
- Modify: `routes/cards.js:208-231`

- [ ] **Step 1: 更新标示卡打印路由**

将第 208-215 行的 `/api/samples/:id/card/print` 改为读取 `req.query.size`：

```js
  // 打印标示卡
  app.get('/api/samples/:id/card/print', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '\u6837\u54c1\u4e0d\u5b58\u5728' });
    const sizeKey = req.query.size || 'large';
    const html = buildCardPrintHtml(s, sizeKey) +
      '<script>window.onload=function(){var url=new URL(location);var sz=url.searchParams.get("size")||"large";'+
      'var s='+JSON.stringify({small:{w:50},medium:{w:70},large:{w:100}})+';var cur=s[sz];'+
      'var label=cur?cur.w+"mm":"?";'+
      'document.body.insertAdjacentHTML("afterbegin",'+
      '\'<div style="position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif">'+
      '\u6253\u5370\u5c3a\u5bf8: <b>\'+label+\'</b> '+
      '<span style="color:#6b7280">\uff08\u8ddf\u968f\u6807\u7b7e\u5c3a\u5bf8\uff09</span>'+
      '<button onclick="window.print()" style="margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">\u6253\u5370</button>'+
      '</div>\');'+
      'document.body.style.paddingTop="42px";'+
      'setTimeout(function(){window.print()},600);};</script>';
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });
```

- [ ] **Step 2: 更新标签打印路由**

将第 218-231 行的 `/api/samples/:id/label/print` 改为读取 `req.query.size`，QR 生成尺寸也按 scale 缩放：

```js
  // 打印标签
  app.get('/api/samples/:id/label/print', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '\u6837\u54c1\u4e0d\u5b58\u5728' });
    const sizeKey = req.query.size || 'large';
    var size = { small: {w:50}, medium: {w:70}, large: {w:100} }[sizeKey] || {w:100};
    if (sizeKey==='custom' && req.query.customW) size.w = Number(req.query.customW);
    var scale = size.w / 100;
    var qrGenW = Math.round(132 * scale);
    QRCode.toDataURL(s.sample_no, { width: qrGenW, margin: 1, errorCorrectionLevel: 'M' })
      .then(qrDataUrl => {
        const html = buildLabelHtml(s, qrDataUrl, true, sizeKey) +
          '<script>window.onload=function(){var url=new URL(location);var sz=url.searchParams.get("size")||"large";'+
          'var sizes='+JSON.stringify([{key:'small',label:'\u5c0f\u53f7',width:50},{key:'medium',label:'\u4e2d\u6807',width:70},{key:'large',label:'\u5927\u53f7',width:100},{key:'custom',label:'\u81ea\u5b9a\u4e49',width:null}])+';'+
          'var cur=sizes.find(function(x){return x.key===sz;})||sizes[2];'+
          'var opts=sizes.map(function(x){return \'<option value="\'+x.key+\'"\'+(x.key===sz?" selected":"")+\'>\'+x.label+(x.width?\' \'+x.width+"mm":"")+\'</option>\';}).join("");'+
          'document.body.insertAdjacentHTML("afterbegin",'+
          '\'<div style="position:fixed;top:0;left:0;right:0;z-index:999;background:#fff;border-bottom:1px solid #e5e7eb;padding:6px 10px;display:flex;align-items:center;gap:8px;font-size:12px;font-family:sans-serif">'+
          '\u6253\u5370\u5c3a\u5bf8: <select onchange="var v=this.value;if(v===\\\'custom\\\'){var w=prompt(\\\'\u8f93\u5165\u5bbd\u5ea6(30~150mm)\\n\u5907\u6ce8:\u8f93\u5165\u81ea\u5b9a\u4e49mm\u6570\u5b57\\\',\\\'80\\\');if(w&&!isNaN(w)&&Number(w)>=30&&Number(w)<=150){localStorage.setItem(\\\'printSize\\\',\\\'custom\\\');location.search=\\\'?size=custom&customW=\\\'+w}else{this.value=sz;return}}else{localStorage.setItem(\\\'printSize\\\',v);location.search=\\\'?size=\\\'+v}" style="padding:2px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:12px">\'+opts+\'</select>\'+
          '<button onclick="window.print()" style="margin-left:auto;padding:4px 16px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">\u6253\u5370</button>'+
          '</div>\');'+
          'document.body.style.paddingTop="42px";'+
          'setTimeout(function(){window.print()},600);};</script>';
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      })
      .catch(e => {
        logger.error('\u751f\u6210\u6807\u7b7e\u5931\u8d25: '+e.message);
        res.status(500).json({ error: '\u751f\u6210\u6807\u7b7e\u5931\u8d25' });
      });
  });
```

- [ ] **Step 3: 更新标签下载路由**

同理修改 `/api/samples/:id/label/download`，读取 `req.query.size`：

```js
  // 下载标签
  app.get('/api/samples/:id/label/download', requireAuth, (req, res) => {
    const s = D.getSampleById(Number(req.params.id));
    if (!s) return res.status(404).json({ error: '\u6837\u54c1\u4e0d\u5b58\u5728' });
    const sizeKey = req.query.size || 'large';
    var size = { small: {w:50}, medium: {w:70}, large: {w:100} }[sizeKey] || {w:100};
    if (sizeKey==='custom' && req.query.customW) size.w = Number(req.query.customW);
    var scale = size.w / 100;
    var qrGenW = Math.round(132 * scale);
    QRCode.toDataURL(s.sample_no, { width: qrGenW, margin: 1, errorCorrectionLevel: 'M' })
      .then(qrDataUrl => {
        const html = buildLabelHtml(s, qrDataUrl, true, sizeKey);
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', 'attachment; filename="'+s.sample_no+'_label.html"');
        res.send(html);
      })
      .catch(e => {
        logger.error('\u751f\u6210\u6807\u7b7e\u5931\u8d25: '+e.message);
        res.status(500).json({ error: '\u751f\u6210\u6807\u7b7e\u5931\u8d25' });
      });
  });
```

- [ ] **Step 4: Commit**

```bash
git add routes/cards.js
git commit -m "feat(print): routes accept ?size= param, auto-print with size selector"
```

---

### Task 5: 前端打印函数传递尺寸参数

**Files:**
- Modify: `public/js/new.js:48-49`
- Modify: `public/js/detail.js:150-152`
- Modify: `public/js/scan.js:221`
- Modify: `public/js/print-queue.js:14`

- [ ] **Step 1: new.js — openPrintLabel 传递尺寸**

将 `openPrintLabel` 改为：

```js
function openPrintLabel(s){
  var sz=getPrintSize();
  window.open('/api/samples/'+s.id+'/label/print?size='+sz,'_blank');
}
```

`printSampleLabel` 函数不变（它调用 `openPrintLabel`）。

- [ ] **Step 2: detail.js — printCard 传递尺寸**

将第 150-152 行改为：

```js
function printCard(id){
  var sz=getPrintSize();
  window.open('/api/samples/'+id+'/card/print?size='+sz,'_blank');
}
```

- [ ] **Step 3: scan.js — 扫码后打印传递尺寸**

将第 221 行改为：

```js
        var sz=(typeof getPrintSize==='function'?getPrintSize():'medium');
        setTimeout(function(){window.open('/api/samples/'+r.sample.id+'/card/print?size='+sz,'_blank');},600);
```

- [ ] **Step 4: print-queue.js — 批量打印传递尺寸**

将第 14 行改为：

```js
  var sz=(typeof getPrintSize==='function'?getPrintSize():'medium');
  printQueue.forEach(function(c){window.open('/api/samples/'+c.id+'/card/print?size='+sz,'_blank');});
```

- [ ] **Step 5: Commit**

```bash
git add public/js/new.js public/js/detail.js public/js/scan.js public/js/print-queue.js
git commit -m "feat(print): all print call sites pass current size from localStorage"
```

---

### Task 6: 回归验证

- [ ] **Step 1: 重启服务**

```bash
npm start
```

- [ ] **Step 2: 验证大号（兼容）**

用浏览器打开 `http://localhost:3000`，登录 rd01，新建样品 → 打印标签：
- 标签页 URL 应包含 `?size=large`（首次无 localStorage 时默认 medium）
- 标签尺寸与之前完全一致（280px）
- 顶部有尺寸选择器，默认选中「中标70mm」或「大号100mm」

- [ ] **Step 3: 验证尺寸切换**

在标签打印页切换尺寸为「小号」→ 页面重载 → 标签缩小到约 140px 宽：
- QR 缩小、字号缩小、边框变细
- 顶部选择器选中「小号50mm」

- [ ] **Step 4: 验证标示卡跟随**

在详情弹窗标示卡 Tab → 点击「打印标示卡」→ 新页面：
- URL 包含 `?size=` 参数
- 顶部显示只读尺寸标签 `打印尺寸: XXmm（跟随标签尺寸）`
- 标示卡等比缩放

- [ ] **Step 5: 验证自定义尺寸**

在标签打印页选择「自定义」→ 输入 80 → 标签宽度约 224px（280×0.8）

- [ ] **Step 6: 验证 localStorage 记忆**

切换为「小号」→ 关闭标签页 → 重新新建样品 → 打印标签 → 应默认为小号

- [ ] **Step 7: 验证 batch 打印**

扫码台 → 连续扫码模式 → 品保发行 2 个样品 → 点击「打印全部」→ 所有标示卡使用当前尺寸

- [ ] **Step 8: 验证标签下载**

在样品列表点击「下载标签」→ 下载的 HTML 文件也使用当前尺寸

---

### Task 7: 提交最终 commit

- [ ] **Step 1: 提交**

```bash
git add -A
git status
# 确认无误后
git commit -m "feat(print): add multi-size print support with 3 presets + custom input"
```

---

### 全链路影响清单

| 维度 | 影响范围 |
|---|---|
| **后端** | `routes/cards.js`: `buildLabelHtml` / `buildCardPrintHtml` 新增 `sizeKey` 参数；3 条路由读取 `req.query.size` |
| **前端** | `constants.js`: 新增 `PRINT_SIZES` + `getPrintSize`/`setPrintSize`；`new.js`/`detail.js`/`scan.js`/`print-queue.js`: 传递 `?size=` |
| **接口** | `GET /api/samples/:id/label/print` `GET /api/samples/:id/card/print` `GET /api/samples/:id/label/download`: 新增可选参数 `?size=` |
| **兼容性** | 不传 `?size=` 默认 `large`，与当前行为完全一致；旧 URL 零破坏 |
