# 建样-扫码流程优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 照片从建样环节后置到制作完成 + 复检环节，新增 NEW 状态条码补打，新增 INSPECT 复检扫码动作。

**Architecture:** 修改 3 个文件：`db.js`（+2列迁移）、`server.js`（扩展 actionForRole + /api/scan + /api/samples）、`public/index.html`（6 处前端修改，净增约 10 行）。后端 TDD 先写后写实现，前端增量修改。

**Tech Stack:** Node.js + Express + SQLite + 原生 HTML/CSS/JS

**Spec:** [docs/superpowers/specs/2026-07-23-sample-create-scan-workflow-design.md](file:///www/wwwroot/sample-mgmt/docs/superpowers/specs/2026-07-23-sample-create-scan-workflow-design.md)

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `db.js` | 修改 | 新增 `produced_image` / `inspect_image` 列迁移 |
| `server.js` | 修改 | actionForRole 扩展 + /api/scan INSPECT + /api/samples 去 image |
| `public/index.html` | 修改 | 建样/列表/扫码/详情/标签 5 处 UI 改动 |

---

## 容量基线

| 指标 | 当前值 | 上限 | 状态 |
|---|---|---|---|
| index.html 行数 | 582 | 600 | 97%，净增目标 ≤10 行 |
| index.html 字符 | 35316 | 20000 | 超标（历史技术债） |
| server.js 行数 | 284 | 400 | 71%，安全 |

> 本次采用「删旧补新」策略：建样删图片上传(~15行)，扫码加图片表单(~20行)，列表加补打按钮(~3行)，净增控制在 10 行以内。

---

### Task 0: 前置基线

- [ ] **Step 0.1: 记录基线**

```bash
cd /www/wwwroot/sample-mgmt
echo "before: index.html=$(wc -l < public/index.html)行 server.js=$(wc -l < server.js)行 db.js=$(wc -l < db.js)行"
npx jest --forceExit 2>&1 | tail -3
```

预期: 14 passed, index.html=582

- [ ] **Step 0.2: 如有未提交变更先暂存**

```bash
cd /www/wwwroot/sample-mgmt
git stash list
```

---

### Task 1: db.js — 新增 produced_image / inspect_image 列

**Files:**
- Modify: `db.js:71-74`

- [ ] **Step 1.1: 追加列迁移逻辑**

读取 `db.js` 第 71-74 行，当前迁移动态加列代码：

```js
  for (const col of ['model', 'station', 'image']) {
    const has = db.exec(`PRAGMA table_info(samples)`)[0].values.some(r => r[1] === col);
    if (!has) db.run(`ALTER TABLE samples ADD COLUMN ${col} TEXT`);
  }
```

**执行 Edit：** 将 `['model', 'station', 'image']` 改为 `['model', 'station', 'image', 'produced_image', 'inspect_image']`

- [ ] **Step 1.2: 验证迁移**

```bash
cd /www/wwwroot/sample-mgmt
node -e "
const D=require('./db');
D.ready.then(()=>{
  const cols=D.db().exec('PRAGMA table_info(samples)')[0].values.map(r=>r[1]);
  console.log('has produced_image:', cols.includes('produced_image'));
  console.log('has inspect_image:', cols.includes('inspect_image'));
  console.log('all cols:', cols.join(','));
});
"
```

预期: `has produced_image: true`, `has inspect_image: true`

- [ ] **Step 1.3: 运行测试确认不破坏现有功能**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit 2>&1 | tail -3
```

预期: 14 passed

- [ ] **Step 1.4: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add db.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(db): add produced_image and inspect_image columns

- extend migration loop to add 2 new TEXT columns
- produced_image: uploaded at PRODUCE step (RND)
- inspect_image: uploaded at INSPECT step (QA recheck)"
```

---

### Task 2: server.js — API 层变更

**Files:**
- Modify: `server.js:122-133` (/api/samples POST)
- Modify: `server.js:153-160` (actionForRole)
- Modify: `server.js:166-206` (/api/scan POST)
- Modify: `server.js:96-100` (/api/samples/:id GET)

#### 子任务 2.1: 写测试（TDD）

- [ ] **Step 2.1.1: 新增 INSPECT 和 PRODUCE-with-image 测试用例**

读取 `tests/samples.test.js` 确认现有测试。然后在 `tests/samples.test.js` 中追加以下测试用例：

```js
describe('POST /api/scan - PRODUCE with image', () => {
  test('拒绝无图片的 PRODUCE 请求', async () => {
    const agent = await login('rd01', 'rd123');
    // 先建样（无图）
    const s = await agent.post('/api/samples').send({ name: '测试样品-制作图' }).expect(200);
    // PRODUCE 不带 image → 400
    await agent.post('/api/scan').send({ code: s.body.sample_no }).expect(400);
  });

  test('允许带图片的 PRODUCE 请求', async () => {
    const agent = await login('rd01', 'rd123');
    const s = await agent.post('/api/samples').send({ name: '测试样品-带图' }).expect(200);
    const res = await agent.post('/api/scan')
      .send({ code: s.body.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=', note: '制作完成' })
      .expect(200);
    expect(res.body.sample.status).toBe('PRODUCED');
    expect(res.body.sample.produced_image).toBeTruthy();
  });
});

describe('POST /api/scan - INSPECT', () => {
  test('QA 可以复检到期样品', async () => {
    // 需要先建样→RND扫码→QA发行，然后手动设 next_inspect_at 为过去
    // 简化：直接用 qa01 扫描状态为 RELEASED 且 next_inspect_at 已过期的样品
    // 由于 seed 数据中可能有合适的样品，需先确认
    const agent = await login('qa01', 'qa123');
    // 获取看板数据找逾期样品
    const dash = await agent.get('/api/dashboard').expect(200);
    const overdue = dash.body.overdue;
    if (overdue.length === 0) {
      console.log('SKIP: 无逾期样品，跳过 INSPECT 测试');
      return;
    }
    const target = overdue[0];
    const res = await agent.post('/api/scan')
      .send({ code: target.sample_no, image: 'data:image/png;base64,iVBORw0KGgo=', note: '复检通过' })
      .expect(200);
    expect(res.body.action).toBe('INSPECT');
    expect(res.body.sample.inspect_image).toBeTruthy();
  });
});

describe('POST /api/samples - 建样无图片', () => {
  test('建样不传 image 字段，正常创建', async () => {
    const agent = await login('rd01', 'rd123');
    const res = await agent.post('/api/samples').send({ name: '测试-无图建样' }).expect(200);
    expect(res.body.sample_no).toMatch(/^SM-/);
    expect(res.body.image).toBeFalsy();
  });
});
```

- [ ] **Step 2.1.2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit tests/samples.test.js 2>&1 | tail -10
```

预期: 新增测试 FAIL

#### 子任务 2.2: 实现后端

- [ ] **Step 2.2.1: 修改 actionForRole（server.js:153-160）**

将：

```js
function actionForRole(role, status) {
  if (role === 'RND' && status === 'NEW') return 'PRODUCE';
  if (role === 'QA' && status === 'PRODUCED') return 'RELEASE';
  if (role === 'CUSTODY' && status === 'RELEASED') return 'CUSTODY';
  return null;
}
```

替换为：

```js
function actionForRole(role, status, next_inspect_at) {
  if (role === 'RND' && status === 'NEW') return 'PRODUCE';
  if (role === 'QA' && status === 'PRODUCED') return 'RELEASE';
  if (role === 'QA' && status === 'RELEASED' && next_inspect_at && new Date(next_inspect_at).getTime() <= Date.now()) return 'INSPECT';
  if (role === 'CUSTODY' && status === 'RELEASED') return 'CUSTODY';
  return null;
}
```

- [ ] **Step 2.2.2: 修改 /api/resolve（server.js:148）**

将 `actionForRole(u.role, s.status)` 改为 `actionForRole(u.role, s.status, s.next_inspect_at)`

- [ ] **Step 2.2.3: 修改 /api/scan POST（server.js:166-206）**

将 `const action = actionForRole(u.role, s.status);` 改为 `const action = actionForRole(u.role, s.status, s.next_inspect_at);`

在 PRODUCE 分支中（`if (action === 'PRODUCE')` 内），增加图片必填校验和 `produced_image` 存储：

在 `if (action === 'PRODUCE') {` 之后、`updated.status = 'PRODUCED';` 之前插入：

```js
    const img = req.body.image;
    if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传制作照片' });
    const imgUrl = saveSampleImage(img, s.sample_no + '_prod');
    updated.produced_image = imgUrl || null;
```

在 `} else if (action === 'CUSTODY') {` 之前新增 INSPECT 分支：

```js
  } else if (action === 'INSPECT') {
    const img = req.body.image;
    if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传复检照片' });
    const imgUrl = saveSampleImage(img, s.sample_no + '_insp');
    const cyc = Number(cycleDays) || s.release_cycle_days || 90;
    const d = new Date(ts); d.setDate(d.getDate() + cyc);
    updated.inspect_image = imgUrl || null;
    updated.next_inspect_at = d.toISOString();
    D.addLog({ sample_id: s.id, action: 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次复检周期' + cyc + '天') });
```

**注意：** INSPECT 分支 `action === 'INSPECT'` 不需要改 `updated.status`（保持 RELEASED）。需要在 `/api/scan` 的 `req.body` 解构中增加对 `action` 参数的兼容接收。

同时更新 `/api/scan` 中从 `req.body` 解构，增加 `action` 参数（用于区分 INSPECT vs 默认行为，但实际上我们用 `actionForRole` 返回的值区分即可，不需要前端传 action。删除之前 spec 中关于前端传 `action: 'INSPECT'` 的设计——后端通过 `actionForRole` 自动判断）。

- [ ] **Step 2.2.4: 修改 /api/samples POST（server.js:122-133）**

去掉建样时的图片处理：将第 126 行 `const { name, spec, model, station, notes, image }` 改为 `const { name, spec, model, station, notes }`；删除第 128-130 行的 `saveSampleImage` 调用相关代码（2行）。保持 `image: ''`。

即把：
```js
  const { name, spec, model, station, notes, image } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
  const s = D.createSample({ name: name.trim(), spec: spec || '', model: model || '', station: station || '', notes: notes || '', image: '', created_by: u.id });
  const imgUrl = saveSampleImage(image, s.sample_no);
  if (imgUrl) { s.image = imgUrl; D.updateSample(s); }
```

替换为：
```js
  const { name, spec, model, station, notes } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
  const s = D.createSample({ name: name.trim(), spec: spec || '', model: model || '', station: station || '', notes: notes || '', image: '', created_by: u.id });
```

- [ ] **Step 2.2.5: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit 2>&1 | tail -10
```

预期: 全部测试 PASS（含新增测试）

- [ ] **Step 2.2.6: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add server.js tests/samples.test.js
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(scan): add INSPECT action, PRODUCE requires image, creation no image

- extend actionForRole to detect INSPECT (QA + RELEASED + overdue)
- PRODUCE now requires image upload, stored as produced_image
- INSPECT action uploads image to inspect_image, renews next_inspect_at
- remove image handling from sample creation
- add test cases for new scan behaviors"
```

---

### Task 3: 前端 — 建样页去图片 + 标签去图

**Files:**
- Modify: `public/index.html:355-404`

- [ ] **Step 3.1: 修改 viewNew（355-368 行）**

删除图片上传行（`.card` 内的 `label>样品图片` 和 `input#n-image` 和 preview div），当前第 363-364 行：

```html
    <label>样品图片</label><input id="n-image" type="file" accept="image/*" onchange="previewImage(event)"/>
    <div id="n-img-prev" style="margin-top:8px"></div>
```

**执行 Edit：** 删除这 2 行。

同时改按钮文字：将 `创建并生成二维码` 改为 `创建样品并生成条码`。

- [ ] **Step 3.2: 删除 previewImage 函数（369-373 行）**

**执行 Edit：** 删除整个 `function previewImage(e){...}` 函数（5行）。

- [ ] **Step 3.3: 简化 submitNew 函数（374-391 行）**

删除图片处理逻辑。将：

```js
async function submitNew(){
  $('#n-msg').textContent='';
  try{
    let image=null;
    const f=$('#n-image').files[0];
    if(f) image=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});
    const s=await api('POST','/api/samples',{
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      spec:$('#n-spec').value,
      notes:$('#n-notes').value,
      image
    });
    openPrintLabel(s);
    toast('已创建 '+s.sample_no,'ok');
  }catch(e){$('#n-msg').textContent=e.message;}
}
```

替换为：

```js
async function submitNew(){
  $('#n-msg').textContent='';
  try{
    const s=await api('POST','/api/samples',{
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      spec:$('#n-spec').value,
      notes:$('#n-notes').value
    });
    openPrintLabel(s);
    toast('已创建 '+s.sample_no+'，可到样品列表补打条码','ok');
  }catch(e){$('#n-msg').textContent=e.message;}
}
```

- [ ] **Step 3.4: 修改 openPrintLabel — 去掉标签内图片（392-404 行）**

删除标签模板中的图片行（第 403 行）：

```js
  ${s.image?`<img src="${s.image}" style="max-width:200px;margin-top:8px;border-radius:6px"/>`:''}
```

**执行 Edit：** 删除此行。

- [ ] **Step 3.5: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/index.html
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "refactor(create): remove image from sample creation and label

- remove image upload field from new sample form
- remove previewImage function
- simplify submitNew (no image param)
- remove image from print label template
- update button text and toast message"
```

---

### Task 4: 前端 — 列表 NEW 状态补打 + 详情图字段升级

**Files:**
- Modify: `public/index.html:251-258` (loadSamples)
- Modify: `public/index.html:265-303` (renderDetailBody)

- [ ] **Step 4.1: loadSamples 新增补打按钮 + 图片字段改为 produced_image**

当前 loadSamples 第 256-257 行的 table 渲染。修改两处：

**A. 图片列：** 将 `s.image` 改为 `s.produced_image||s.image`（优先制作图）：

```js
<td>${s.produced_image||s.image?`<img src="${s.produced_image||s.image}" width="40" style="border-radius:4px"/>`:'—'}</td>
```

**B. 操作列：** 在「详情」链接前加打印按钮（仅 NEW 状态）：

```js
<td>${s.status==='NEW'?`<a class="link" style="margin-right:8px" onclick="openPrintLabel(${JSON.stringify(s).replace(/"/g,'&quot;')})">打印</a>`:''}<a class="link" onclick="viewDetail(${s.id})">详情</a></td>
```

完整替换行 256-257：

```js
  box.innerHTML='<div class="card" style="padding:0"><table><tr><th>编号</th><th>名称</th><th>机型/站别</th><th>图片</th><th>规格</th><th>状态</th><th>制作</th><th>发行</th><th>保管部门/储位</th><th></th></tr>'+
    list.map(s=>`<tr><td>${s.sample_no}</td><td>${s.name||'—'}</td><td class="muted">${s.model||'—'}${s.station?(' · '+s.station):''}</td><td>${s.produced_image||s.image?`<img src="${s.produced_image||s.image}" width="40" style="border-radius:4px"/>`:'—'}</td><td class="muted">${s.spec||'—'}</td><td>${statusBadge(s)}</td><td class="muted">${fmt(s.produced_at)}</td><td class="muted">${fmt(s.released_at)}</td><td class="muted">${s.custody_dept||'—'}/${s.storage_location||'—'}</td><td>${s.status==='NEW'?`<a class="link" style="margin-right:8px" onclick="openPrintLabel(${JSON.stringify(s).replace(/"/g,'&quot;')})">打印</a>`:''}<a class="link" onclick="viewDetail(${s.id})">详情</a></td></tr>`).join('')+'</table></div>';
```

- [ ] **Step 4.2: renderDetailBody — 图片卡片优先 produced_image，增加 inspect_image**

当前详情弹窗图片卡片（第 284 行）：

```js
  const imageCard=s.image?`<div class="detail-card image" onclick="showImageOverlay('${s.image}')"><img src="${s.image}" alt="样品图片"/></div>`:'';
```

替换为（优先 produced_image，增加 inspect_image 卡片）：

```js
  const mainImg=s.produced_image||s.image;
  const imageCard=mainImg?`<div class="detail-card image" onclick="showImageView('${mainImg}')"><img src="${mainImg}" alt="样品图片"/></div>`:'';
  const inspectCard=s.inspect_image?`<div class="detail-card image" onclick="showImageView('${s.inspect_image}')" style="cursor:pointer;text-align:center"><div class="label">复检照片</div><img src="${s.inspect_image}" alt="复检照片" style="width:100px;height:100px;object-fit:cover;border-radius:6px"/></div>`:'';
```

同时在 `body.innerHTML` 中 `\${imageCard}` 后追加 `\${inspectCard}`：

```js
  body.innerHTML=`<div class="detail-cards">
    <div class="detail-card info">${leftHTML}${imgHTML}</div>
    ...${imageCard}${inspectCard}
    ...
  </div>`;
```

- [ ] **Step 4.3: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/index.html
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(list,detail): reprint button for NEW, dual image display in detail

- add 'Print' link for NEW status samples in list
- list thumbnail prefers produced_image over image
- detail modal shows produced_image + inspect_image (two cards)
- data passed via JSON.stringify in onclick (inline)"
```

---

### Task 5: 前端 — 扫码台 PRODUCE/INSPECT 照片上传

**Files:**
- Modify: `public/index.html:473-516` (renderScanAction, confirmScan)

- [ ] **Step 5.1: renderScanAction — 为 PRODUCE 和 INSPECT 添加图片上传字段**

当前 `renderScanAction` 第 473-491 行，在 `extra` 变量构建中增加处理：

将 `renderScanAction` 函数开头（473-476 行）：

```js
function renderScanAction(s,action){
  const box=$('#scan-result');
  let extra='';
  if(action==='RELEASE')extra=`<label>复检周期（天）*</label><input id="scan-cycle" type="number" min="1" value="90" placeholder="如 90"/>`;
  if(action==='CUSTODY')extra=`<label>保管储位 *</label><input id="scan-loc" placeholder="如 A区-3架-2层"/>`;
```

替换为：

```js
function renderScanAction(s,action){
  const box=$('#scan-result');
  let extra='';
  if(action==='PRODUCE')extra=`<label>制作照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/><div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><input id="scan-note" placeholder="如：制作完成"/>`;
  if(action==='INSPECT')extra=`<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/><div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><input id="scan-note" placeholder="如：复检通过"/>`;
  if(action==='RELEASE')extra=`<label>复检周期（天）*</label><input id="scan-cycle" type="number" min="1" value="90" placeholder="如 90"/>`;
  if(action==='CUSTODY')extra=`<label>保管储位 *</label><input id="scan-loc" placeholder="如 A区-3架-2层"/>`;
```

同时更新 actLabel 对象，增加 INSPECT：

```js
  const actLabel={PRODUCE:'确认制作完成（研发）',RELEASE:'确认正式发行（品保）',INSPECT:'确认复检完成（品保）',CUSTODY:'确认接收保管（'+me.dept+'）'}[action];
```

- [ ] **Step 5.2: 新增 previewScanImg 工具函数**

在 `renderScanAction` 函数附近（如 `afterScanReset` 之后）追加：

```js
function previewScanImg(e){
  const f=e.target.files[0];const p=$('#scan-img-prev');
  if(!f){p.innerHTML='';return;}
  const r=new FileReader();r.onload=ev=>{p.innerHTML='<img src="'+ev.target.result+'" style="max-width:120px;border-radius:6px"/>'};r.readAsDataURL(f);
}
```

- [ ] **Step 5.3: confirmScan — 增加图片参数传递**

当前 `confirmScan` 第 492-516 行，修改第 493-496 行：

```js
async function confirmScan(action){
  const code=$('#scan-code').value.trim();
  const body={code};
  if(action==='RELEASE')body.cycleDays=$('#scan-cycle').value;
  if(action==='CUSTODY')body.location=$('#scan-loc').value;
```

替换为：

```js
async function confirmScan(action){
  const code=$('#scan-code').value.trim();
  const body={code};
  if(action==='PRODUCE'||action==='INSPECT'){
    const f=$('#scan-img').files[0];
    if(!f){toast('请上传照片','err');$('#scan-confirm').disabled=false;return;}
    const reader=new FileReader();
    body.image=await new Promise((res,rej)=>{reader.onload=()=>res(reader.result);reader.onerror=rej;reader.readAsDataURL(f);});
    const noteEl=$('#scan-note');if(noteEl&&noteEl.value.trim())body.note=noteEl.value.trim();
  }
  if(action==='RELEASE')body.cycleDays=$('#scan-cycle').value;
  if(action==='CUSTODY')body.location=$('#scan-loc').value;
```

- [ ] **Step 5.4: 添加 INSPECT 的 STATUS 标签（如有 STATUS 字典）**

确认 STATUS/STATUS_LABEL 常量中是否需要加 INSPECT 状态标签。由于 INSPECT 不改变状态（保持 RELEASED），不需要。

- [ ] **Step 5.5: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/index.html
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(scan): add image upload for PRODUCE and INSPECT actions

- PRODUCE now shows image upload + note fields
- INSPECT shows image upload + note fields  
- new previewScanImg helper for scan image preview
- confirmScan reads image as base64 for PRODUCE/INSPECT
- image is required field for both actions"
```

---

### Task 6: 回归验证

**Files:**
- 无文件修改

- [ ] **Step 6.1: 运行全部测试**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit 2>&1
```

预期: 全部 PASS（含新增测试）

- [ ] **Step 6.2: 手动浏览器验证**

1. 访问 `http://localhost:4000`
2. 登录 RND 账号 → 新建样品 → 确认无图片上传字段
3. 建完后列表 NEW 样品显示「打印」按钮
4. 点击打印 → 弹窗无图片
5. 扫码台 → 输入 NEW 样品编号 → 确认出现图片上传 + 备注
6. 上传图片 → 确认制作完成 → 状态变为 PRODUCED
7. 登录 QA → 接续扫码 → 填周期 → 发行
8. 手动修改 next_inspect_at 为过去时间（或等待种子数据中已有的）
9. QA 扫码逾期样品 → 确认出现复检照片上传
10. 上传 → 复检完成
11. 详情弹窗 → 确认两张照片卡片正常显示

- [ ] **Step 6.3: 记录验证结果**

```bash
echo "regression: $(date) - ALL PASS" >> /tmp/workflow-regression.log
```

---

### Task 7: 臃肿检测报告

**Files:**
- 无文件修改

- [ ] **Step 7.1: 收集指标**

```bash
cd /www/wwwroot/sample-mgmt
for f in public/index.html server.js db.js; do
  echo "$f: $(wc -l < $f)行, $(wc -c < $f)字符"
done
```

- [ ] **Step 7.2: 对照上限输出**

预估：

| 文件 | 预估行数 | 上限 | 状态 |
|---|---|---|---|
| public/index.html | ~590 | 600 | 98.3%，接近极限 |
| server.js | ~310 | 400 | 77.5%，安全 |
| db.js | ~80 | 200 | 40%，安全 |

- [ ] **Step 7.3: 提交变更记录**

无代码变更，记录到日志。

---

## 完成标准

- [ ] 所有测试 PASS
- [ ] 建样无图片上传
- [ ] NEW 状态可打印标签
- [ ] PRODUCE 必须上传照片
- [ ] INSPECT 可上传复检照片
- [ ] 详情弹窗显示两张照片
- [ ] 标签无图片
- [ ] index.html 不超 600 行
- [ ] 臃肿检测报告已输出

## 回滚方案

```bash
cd /www/wwwroot/sample-mgmt
git revert <commit-hash>  # 逐个回滚
# 或
git reset --hard HEAD~5   # 回退到 Task 0 之前
```
