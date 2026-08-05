# 扫码台页面优化 — 实现计划

> **For agentic workers:** 每个 Task 一个独立 git commit，Task 间做 review。Steps 使用 checkbox (`- [ ]`) 跟踪。

**Goal:** 修复扫码台 7 个交互缺陷，RELEASE 模式叠加分步向导，提升批量发行体验。

**Architecture:** 基底增量修复（全部模式 7 点修复）+ RELEASE 分步向导叠加（Step1 周期 → Step2 标示卡审查 → Step3 确认打印）。抽离 `buildCardFieldTable` 组件在三处复用。

**Tech Stack:** 原生 JavaScript + Express 4 + SQLite，不改布局结构，不新增 API。

---

### Task 1: Fix4 焦点双向状态 + Fix5 格式校验

**Files:**
- Modify: `public/js/scan.js:33-47` (bindScanInput)
- Modify: `public/js/scan.js:56-63` (doScan)

- [ ] **Step 1: bindScanInput 添加 onfocus 恢复绿色状态**

在 `bindScanInput()` 的 `inp.onblur` 之后添加 `inp.onfocus`：

```js
function bindScanInput(){
  const inp=$('#scan-code');
  if(!inp)return;
  inp.onkeydown=e=>{
    if(e.key==='Enter'||e.key==='NumpadEnter'){e.preventDefault();doScan();}
  };
  inp.onblur=()=>{
    const s=$('#scan-status');
    if(s) s.innerHTML='⚠ 输入框未聚焦，扫码枪无法输入 — 点此区域或重新扫码即可恢复';
  };
  inp.onfocus=()=>{
    const s=$('#scan-status');
    if(s) s.innerHTML='● 已就绪，等待扫码枪…';
  };
}
```

- [ ] **Step 2: doScan 开头添加格式校验**

```js
async function doScan(){
  const code=$('#scan-code').value.trim();
  if(!code){toast('请先扫码或输入编号','err');return;}
  if(!/^SM-\d{6}$/.test(code)){toast('编号格式错误：SM-XXXXXX（6位数字）','err');return refocusScan();}
  const box=$('#scan-result');box.innerHTML='<div class="muted">解析中…</div>';
  // ... 余下不变
}
```

- [ ] **Step 3: viewScan 更新提示文字**

把第 10 行 placeholder 改为：
```html
<input id="scan-code" class="scan-input" placeholder="扫描或输入 SM-XXXXXX" autocomplete="off"/>
```

并在输入框下方（第 10 行后）添加格式提示：
```html
<small class="muted" style="font-size:11px">格式：SM-XXXXXX</small>
```

- [ ] **Step 4: 验证**

```bash
# 启动服务，浏览器测试：
# 1. 输入框聚焦 → 状态显示绿色「已就绪」
# 2. 点击其他区域 → 状态变红色警告
# 3. 重新点输入框 → 恢复绿色
# 4. 输入"abc"回车 → toast "编号格式错误"
# 5. 输入"SM-000001"回车 → 正常解析
```

- [ ] **Step 5: 提交**

```bash
git add public/js/scan.js
git commit -m "fix(scan): add focus state recovery and format validation"
```

---

### Task 2: Fix7 摄像头 HTTPS 检测 + 权限引导

**Files:**
- Modify: `public/js/camera-helper.js:4-18` (startCam)
- Modify: `public/js/scan.js:19-26` (viewScan 摄像头区域)

- [ ] **Step 1: camera-helper.js 添加 HTTPS 检测和细粒度错误提示**

```js
// camera-helper.js — 摄像头扫码辅助（startCamera/stopCamera）
let camStream=null;

function camProtocolOk(){
  return location.protocol==='https:';
}

async function startCam(){
  const msg=$('#cam-msg');const video=$('#cam');
  if(!camProtocolOk()){
    msg.innerHTML='<span style="color:#dc2626">摄像头仅 HTTPS 可用，当前为 HTTP。请使用扫码枪或手动输入。</span>';
    return;
  }
  if(!('BarcodeDetector'in window)){
    msg.textContent='当前浏览器不支持摄像头识别，请使用 Chrome/Edge，或直接用扫码枪/手动输入。';
    return;
  }
  try{
    camStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject=camStream;video.style.display='block';await video.play();
    const bd=new BarcodeDetector({formats:['qr_code']});msg.textContent='摄像头已开启，对准二维码…';
    const tick=async()=>{
      if(video.readyState>=2){
        try{const cs=await bd.detect(video);if(cs.length){stopCam();$('#scan-code').value=cs[0].rawValue.trim();doScan();return;}}catch(e){}
      }
      requestAnimationFrame(tick);
    };tick();
  }catch(e){
    if(e.name==='NotAllowedError')msg.textContent='摄像头权限被拒绝，请在浏览器设置中允许摄像头访问。';
    else if(e.name==='NotFoundError')msg.textContent='未检测到摄像头设备，请连接摄像头后重试。';
    else msg.textContent='摄像头启动失败：'+e.message;
  }
}

function stopCam(){if(camStream){camStream.getTracks().forEach(t=>t.stop());camStream=null;$('#cam').style.display='none';}}
```

- [ ] **Step 2: viewScan 摄像头区域显示协议状态**

修改 `viewScan()` 第 19-26 行：

```html
'<details>'+
  '<summary style="cursor:pointer" class="muted">或用手机摄像头扫码 '+
    (location.protocol==='https:'?'<span style="color:var(--ok)">HTTPS ✓</span>':'<span style="color:var(--bad)">HTTP ✗</span>')+
  '</summary>'+
  '<div style="margin-top:10px">'+
    '<button class="btn ghost sm" onclick="startCam()">📷 开启摄像头</button>'+
    '<video id="cam" playsinline style="display:none;margin-top:10px;border-radius:8px;max-width:100%"></video>'+
    '<div id="cam-msg" class="muted" style="font-size:12px;margin-top:8px"></div>'+
  '</div>'+
'</details>'+
```

- [ ] **Step 3: 验证**

```bash
# HTTP 环境：摄像头折叠区显示「HTTP ✗」，点击开启 → 提示摄像头不可用
# HTTPS 环境：摄像头折叠区显示「HTTPS ✓」，点击开启 → 正常启动
# 权限拒绝 → 提示去浏览器设置中允许
```

- [ ] **Step 4: 提交**

```bash
git add public/js/camera-helper.js public/js/scan.js
git commit -m "fix(scan): add HTTPS detection and camera permission guidance"
```

---

### Task 3: Fix2+Fix3 — buildCardFieldTable 组件 + 取消折叠

**Files:**
- Modify: `public/js/scan.js` (新增 buildCardFieldTable，重写 buildReleaseCardForm)

- [ ] **Step 1: 抽离 buildCardFieldTable(s, editable) 组件**

在 `buildReleaseCardForm` 之前（约 L71 处）插入：

```js
// 标示卡字段状态判断
function cardFieldStatus(s,field){
  var val=s[field]||'';
  if(field==='sample_type'||field==='limit_item'){
    return val?'filled':'required_empty';
  }
  return val?'filled':'empty';
}
// 标示卡字段表格组件，三处复用（RELEASE Step2, INSPECT, 详情弹窗标示卡Tab）
function buildCardFieldTable(s,editable){
  var t=s.sample_type||'', l=s.limit_item||'', src=s.source_type||'';
  var v=s.valid_until?new Date(s.valid_until).toISOString().slice(0,10):'';
  var ver=s.card_version||'', data=s.test_data||'';
  var typeSt=cardFieldStatus(s,'sample_type'), itemSt=cardFieldStatus(s,'limit_item');
  var srcSt=cardFieldStatus(s,'source_type'), vSt=cardFieldStatus(s,'valid_until');
  var verSt=cardFieldStatus(s,'card_version'), dataSt=cardFieldStatus(s,'test_data');

  function mark(field,status){
    if(status==='required_empty')return '<span style="color:#dc2626;font-size:11px;margin-left:4px">✗ 必填</span>';
    if(status==='filled')return '<span style="color:#16a34a;font-size:11px;margin-left:4px">✓'+(s.signed_by_rd||s.signed_by_rnd?' RD已填':'')+'</span>';
    return '';
  }

  var ro=editable?'':'disabled';
  return '<table style="width:100%;font-size:12px;border-collapse:collapse">'+
    '<tr><td style="padding:4px 0;width:70px;color:#6b7280">样品类型 *</td>'+
      '<td style="padding:4px 0"><select id="scan-card-type" '+ro+'><option value="">请选择</option><option value="OK"'+(t==='OK'?' selected':'')+'>OK</option><option value="NG"'+(t==='NG'?' selected':'')+'>NG</option></select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('sample_type',typeSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">限度项目 *</td>'+
      '<td style="padding:4px 0"><select id="scan-card-item" '+ro+'><option value="">请选择</option>'+limitItemOptions(l)+'</select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('limit_item',itemSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">来源</td>'+
      '<td style="padding:4px 0"><select id="scan-card-source" '+ro+'><option value="">未指定</option><option value="C"'+(src==='C'?' selected':'')+'>客供(C)</option><option value="T"'+(src==='T'?' selected':'')+'>元山(T)</option><option value="G"'+(src==='G'?' selected':'')+'>元将五金塔岗分厂(G)</option></select></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('source_type',srcSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">有效期</td>'+
      '<td style="padding:4px 0"><input id="scan-card-valid" type="date" value="'+v+'" '+ro+' style="font-size:12px"/></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('valid_until',vSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">版次</td>'+
      '<td style="padding:4px 0"><input id="scan-card-ver" value="'+ver+'" '+ro+' style="font-size:12px;width:100%"/></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('card_version',verSt)+'</td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td>'+
      '<td style="padding:4px 0"><textarea id="scan-card-data" rows="2" style="resize:vertical;font-size:12px;width:100%" '+ro+'>'+data+'</textarea></td>'+
      '<td style="padding:4px 0;text-align:right">'+mark('test_data',dataSt)+'</td></tr>'+
  '</table>';
}
```

- [ ] **Step 2: 重写 buildReleaseCardForm 使用新组件（临时，后续 Task 会被分步向导替代）**

```js
function buildReleaseCardForm(s){
  return '<label>复检周期（天）<b class="required">*</b></label><input id="scan-cycle" type="number" min="1" value="90" placeholder="如 90"/>'+
    '<div class="scan-section-title">标示卡 <b class="required">*</b></div>'+
    buildCardFieldTable(s,true)+
    '<div class="muted" style="font-size:12px;margin-top:6px">品保确认人：<b>'+(me.display_name||me.username)+'</b>（自动签署）</div>';
}
```

- [ ] **Step 3: 验证**

```bash
# 品保发行 RELEASE 表单：标示卡全部6个字段平铺展开，右侧逐字段显示 ✓/✗
# 研发已填的字段标记 ✓ RD已填（绿色）
# 必填字段未填标记 ✗ 必填（红色）
# 无 <details> 折叠
```

- [ ] **Step 4: 提交**

```bash
git add public/js/scan.js
git commit -m "feat(scan): add buildCardFieldTable component with per-field status"
```

---

### Task 4: Fix1 打印队列

**Files:**
- Modify: `public/js/scan.js` (新增 printQueue + renderPrintQueue + printAllCards，修改 confirmScan)

- [ ] **Step 1: 在文件顶部（L1 后）添加打印队列全局变量和函数**

```js
// 打印队列：连续扫码模式下积累标示卡，批量打印
var printQueue=[]; // {id,sample_no,name}
function renderPrintQueue(){
  var pq=document.getElementById('scan-print-queue');
  if(!pq)return;
  if(printQueue.length===0){pq.innerHTML='';return;}
  pq.innerHTML='<div style="padding:6px 10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af;display:flex;align-items:center;gap:8px">'+
    '📋 已积累 <b>'+printQueue.length+'</b> 张标示卡'+
    '<button class="btn ghost sm" onclick="printAllCards()" style="margin-left:auto;font-size:10px">打印全部</button>'+
    '<button class="btn ghost sm" onclick="printQueue=[];renderPrintQueue()" style="font-size:10px">清空</button>'+
  '</div>';
}
function printAllCards(){
  printQueue.forEach(function(c){window.open('/api/samples/'+c.id+'/card/print','_blank');});
  printQueue=[];renderPrintQueue();
}
```

- [ ] **Step 2: viewScan 中添加打印队列占位区**

在 `viewScan()` 的结果区域 `<div id="scan-result"></div>` 之后添加：

```js
'<div id="scan-print-queue"></div>'+
```

即第 28 行后：

```js
'<div id="scan-result"></div>'+
'<div id="scan-print-queue"></div>'+
'</div>';
```

- [ ] **Step 3: confirmScan RELEASE 分支中使用队列**

修改 `confirmScan` 中第 140 行的 RELEASE 打印逻辑：

```js
// 修改前：
if(action==='RELEASE'){setTimeout(function(){window.open('/api/samples/'+r.sample.id+'/card/print','_blank');},600);}

// 修改后：
if(action==='RELEASE'){
  if($('#scan-cont')&&$('#scan-cont').checked){
    printQueue.push({id:r.sample.id,sample_no:r.sample.sample_no,name:r.sample.name});
    renderPrintQueue();
  }else{
    setTimeout(function(){window.open('/api/samples/'+r.sample.id+'/card/print','_blank');},600);
  }
}
```

- [ ] **Step 4: 添加 beforeunload 保护**

在 `confirmScan` catch 之前或 viewScan 中注册事件。在 scan.js 末尾（L158 后）添加：

```js
window.addEventListener('beforeunload',function(e){
  if(printQueue.length>0){
    e.preventDefault();
    e.returnValue='有 '+printQueue.length+' 张标示卡未打印，离开将丢失';
    return e.returnValue;
  }
});
```

- [ ] **Step 5: 验证**

```bash
# 连续模式 + RELEASE 发行 3 个样品
# → 扫码区下方显示「已积累 3 张标示卡」+「打印全部」+「清空」
# → 不弹打印窗口
# → 点击「打印全部」→ 弹出 3 个打印页
# → 刷新/离开页面 → 浏览器提示「有 N 张未打印标示卡」
# 非连续模式 + RELEASE → 仍直接弹打印窗口
```

- [ ] **Step 6: 提交**

```bash
git add public/js/scan.js
git commit -m "feat(scan): add print queue for continuous scan RELEASE mode"
```

---

### Task 5: RELEASE 分步向导（buildReleaseWizard）

**Files:**
- Modify: `public/js/scan.js` (新增 buildReleaseWizard，修改 buildReleaseCardForm 调用点)

- [ ] **Step 1: 新增 buildReleaseWizard 函数（替换 buildReleaseCardForm）**

在 `buildCardFieldTable` 之后插入：

```js
// 分步向导：RELEASE 专用三步向导
var wizardSample=null; // 当前向导的样品数据
var wizardStep=1;

function buildReleaseWizard(s){
  wizardSample=s; wizardStep=1;
  return renderWizardStep1(s);
}

function renderWizardStep1(s){
  var nextDate=new Date(Date.now()+90*864e5).toISOString().slice(0,10);
  return '<div class="wizard-steps">'+
      '<span class="wdot active">1</span><span class="wline"></span>'+
      '<span class="wdot">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<label>复检周期（天）<b class="required">*</b></label>'+
      '<input id="scan-cycle" type="number" min="1" value="90" placeholder="如 90" oninput="updateWizardNextDate()" style="width:100px;text-align:center"/>'+
      '<span class="muted" style="margin-left:8px;font-size:12px" id="wiz-next-date">→ 下次复检：'+nextDate+'</span>'+
    '</div>'+
    '<div style="text-align:right;margin-top:14px">'+
      '<button class="btn sm" onclick="goWizardStep(2)">下一步：填写标示卡 →</button>'+
    '</div>'
  ;
}
function updateWizardNextDate(){
  var days=parseInt($('#scan-cycle').value)||90;
  var d=new Date(Date.now()+days*864e5).toISOString().slice(0,10);
  var el=document.getElementById('wiz-next-date');if(el)el.textContent='→ 下次复检：'+d;
}

function renderWizardStep2(s){
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">2</span><span class="wline"></span>'+
      '<span class="wdot">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<div class="scan-section-title">标示卡审查</div>'+
      buildCardFieldTable(s,true)+
      '<div class="muted" style="font-size:12px;margin-top:6px">品保确认人：<b>'+(me.display_name||me.username)+'</b>（自动签署）</div>'+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<button class="btn ghost sm" onclick="goWizardStep(1)">← 上一步</button>'+
      '<button class="btn sm" onclick="goWizardStep(3)">下一步：确认发行 →</button>'+
    '</div>'
  ;
}

function renderWizardStep3(s){
  var cycle=($('#scan-cycle')?$('#scan-cycle').value:'90')||'90';
  var t=$('#scan-card-type')?$('#scan-card-type').value:'';
  var l=$('#scan-card-item')?$('#scan-card-item').value:'';
  var ok=t&&l;
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<table style="width:100%;font-size:12px">'+
        '<tr><td style="color:#6b7280;padding:3px 0">复检周期</td><td>'+cycle+' 天 → 下次复检 '+new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10)+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">样品类型</td><td>'+(t||'未填写')+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">限度项目</td><td>'+(l||'未填写')+'</td></tr>'+
      '</table>'+
      (!ok?'<p style="color:#dc2626;font-size:11px">⚠ 标示卡必填字段未完成，请返回 Step2 补填</p>':'')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<button class="btn ghost sm" onclick="goWizardStep(2)">← 返回修改</button>'+
      '<button class="btn" id="scan-confirm" onclick="confirmScan(\'RELEASE\')"'+
        (!ok?' disabled':'')+'>确认正式发行（品保）</button>'+
    '</div>'
  ;
}

function goWizardStep(step){
  var s=wizardSample;if(!s)return;
  wizardStep=step;
  var html='';
  if(step===1)html=renderWizardStep1(s);
  else if(step===2)html=renderWizardStep2(s);
  else if(step===3){
    // Step2→3 门禁：类型+项目必填
    var t=$('#scan-card-type')?$('#scan-card-type').value:'';
    var l=$('#scan-card-item')?$('#scan-card-item').value:'';
    if(!t||!l){toast('请填写样品类型和限度项目（必填）','err');return;}
    html=renderWizardStep3(s);
  }
  // 替换 action 区内向导部分
  var box=$('#scan-result');
  var card=box.querySelector('.sample-card');
  if(card)card.innerHTML=html;
}
```

- [ ] **Step 2: 添加向导 CSS 样式**

在 `viewScan` 渲染完成后，注入样式（放在 viewScan 末尾或 index.html CSS 中）。建议在 scan.js 的 `viewScan` 末尾动态注入：

```js
if(!document.getElementById('wiz-css')){
  var style=document.createElement('style');
  style.id='wiz-css';
  style.textContent='.wizard-steps{display:flex;align-items:center;justify-content:center;gap:0;margin-bottom:6px}'+
    '.wdot{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;background:#e5e7eb;color:#6b7280}'+
    '.wdot.active{background:#2563eb;color:#fff}'+
    '.wdot.done{background:#16a34a;color:#fff}'+
    '.wline{width:32px;height:2px;background:#e5e7eb}'+
    '.wline.done{background:#16a34a}';
  document.head.appendChild(style);
}
```

- [ ] **Step 3: 将 buildReleaseCardForm 调用替换为 buildReleaseWizard**

在 `renderScanAction` 第 103 行：

```js
// 修改前：
if(action==='RELEASE')extra=buildReleaseCardForm(s);
// 修改后：
if(action==='RELEASE')extra=buildReleaseWizard(s);
```

- [ ] **Step 4: 验证**

```bash
# 非连续模式 RELEASE：
# Step1: 设置复检周期 + 预览日期 → 点「下一步」
# Step2: 标示卡审查（全部字段平铺+状态标记）→ 填类型+项目 → 点「下一步」
#   → 类型或项目为空时提示"请填写必填字段"
# Step3: 确认摘要 → 点「确认正式发行」→ 弹打印窗
# 点「← 返回修改」可从 Step3→Step2, Step2→Step1
```

- [ ] **Step 5: 提交**

```bash
git add public/js/scan.js
git commit -m "feat(scan): add RELEASE step wizard with card field review"
```

---

### Task 6: Fix6 INSPECT 标示卡更新

**Files:**
- Modify: `public/js/scan.js:102` (renderScanAction INSPECT 分支)
- Modify: `routes/scan.js:81-90` (INSPECT 后端)

- [ ] **Step 1: renderScanAction INSPECT 分支追加标示卡更新区**

修改第 102 行 INSPECT 分支：

```js
if(action==='INSPECT')extra='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/><div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><input id="scan-note" placeholder="如：复检通过"/>'+
  '<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
    '<p class="muted" style="font-size:11px">复检时可更新有效期/版次/测试数据</p>'+
    '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;width:70px;color:#6b7280">有效期</td><td><input id="scan-card-valid" type="date" value="'+(s.valid_until?new Date(s.valid_until).toISOString().slice(0,10):'')+'"/></td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">版次</td><td><input id="scan-card-ver" value="'+(s.card_version||'')+'" style="width:100%"/></td></tr>'+
    '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td><td><textarea id="scan-card-data" rows="2" style="resize:vertical;width:100%">'+(s.test_data||'')+'</textarea></td></tr></table>'+
  '</details>';
```

- [ ] **Step 2: confirmScan INSPECT 分支收集标示卡字段**

在 `confirmScan` 的 INSPECT 分支（L127-134 附近）追加标示卡字段收集。在 `if(action==='PRODUCE'||action==='INSPECT')` 块内，图片处理之后，添加：

```js
// INSPECT 标示卡更新（选填）
if(action==='INSPECT'){
  var vuEl=$('#scan-card-valid');if(vuEl&&vuEl.value)body.valid_until=vuEl.value;
  var verEl=$('#scan-card-ver');if(verEl&&verEl.value.trim())body.card_version=verEl.value.trim();
  var dataEl=$('#scan-card-data');if(dataEl&&dataEl.value.trim())body.test_data=dataEl.value.trim();
}
```

- [ ] **Step 3: 后端 routes/scan.js INSPECT 分支接受标示卡字段**

修改第 81-89 行 INSPECT 分支：

```js
} else if (action === 'INSPECT') {
  const img = req.body.image;
  if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传复检照片' });
  const inspImgUrl = saveSampleImage(img, s.sample_no + '_insp');
  const cyc = Number(cycleDays) || s.release_cycle_days || 90;
  const d = new Date(ts); d.setDate(d.getDate() + cyc);
  if (inspImgUrl) updated.inspect_image = inspImgUrl;
  updated.next_inspect_at = d.toISOString();
  // INSPECT 标示卡更新（选填，仅允许非签署字段）
  const { valid_until, card_version, test_data } = req.body || {};
  if (valid_until) updated.valid_until = valid_until;
  if (card_version) updated.card_version = card_version;
  if (test_data) updated.test_data = test_data;
  D.addLog({ sample_id: s.id, action: 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次周期' + cyc + '天' + (valid_until||card_version||test_data?'，「标示卡已更新」':'')) });
```

- [ ] **Step 4: 验证**

```bash
# 已发行到期的样品 → QA 扫码 → INSPECT 表单
# → 折叠「标示卡更新」→ 展开 → 修改有效期 → 点「确认复检完成」
# → 复检日期更新 + 有效期更新
# → 操作日志包含"标示卡已更新"
```

- [ ] **Step 5: 提交**

```bash
git add public/js/scan.js routes/scan.js
git commit -m "feat(scan): allow INSPECT to update card fields (valid_until/version/test_data)"
```

---

### Task 7: 文档同步

**Files:**
- Modify: `docs/operation-manual.md` (第五章 扫码台)

- [ ] **Step 1: 更新操作手册扫码台章节**

```bash
sudo chmod 666 docs/operation-manual.md
```

更新 5.3 品保确认发行（三步向导）和第 5.6 节（增加打印队列说明）：

把现有 5.3 和 5.4 之间插入打印队列说明，并在全文适当位置补充。主要变更：

1. **5.1 扫码方式**：格式提示 `SM-XXXXXX` + 格式校验说明
2. **5.3 品保确认发行**：更新为三步向导流程
3. **新增 5.7 打印队列**（连续模式下的标示卡批量打印）

具体内容按照设计文档的 RELEASE 分步向导描述更新即可。

- [ ] **Step 2: 验证与提交**

```bash
sudo chmod 644 docs/operation-manual.md
git add docs/operation-manual.md
git commit -m "docs: update scan chapter for step wizard and print queue"
```

---

### 验证总清单

- [ ] PRODUCE + 非连续：正常上传照片 → PRODUCED
- [ ] PRODUCE + 连续：批量确认 → 状态正常
- [ ] RELEASE + 非连续：三步向导 → 确认 → 单张打印弹窗 ✓
- [ ] RELEASE + 连续：三步向导 → 确认 → 队列+1，不弹窗 ✓
- [ ] 打印队列：积累 N 张 → 打印全部 → 弹出 N 页 ✓
- [ ] 打印队列：清除 / 离开页面 beforeunload 提示 ✓
- [ ] 标示卡逐字段 ✓/✗ 状态正确 ✓
- [ ] INSPECT：标示卡更新区可编辑 → 保存 → 字段+日志更新 ✓
- [ ] 格式校验：`abc` → toast 错误 ✓
- [ ] 焦点状态：失焦红 / 聚焦绿 ✓
- [ ] 摄像头：HTTP 不可用提示 ✓
- [ ] CUSTODY：接收保管不受影响 ✓
- [ ] 详情弹窗标示卡 Tab 不受影响 ✓
