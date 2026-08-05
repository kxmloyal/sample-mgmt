# 结构化样品编号自动生成 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 限度样品使用结构化编码 `[来源前缀][限度项目][流水号4位][保管单位][序号+K/N]` 替代通用 `SM-XXXXXX`，非限度样品保持旧编号不变。

**Architecture:** 在 `nextSampleNo()` 中根据是否有 `source_type + limit_item + sample_type` 分流；新增 `custody_unit` 字段（1-8 保管单位代码）作为编码段 + 新建表单下拉；流水号按 (来源+项目) 独立递增，序号按 (来源+项目+保管单位+OK/NG类型) 递增。

**Tech Stack:** Node.js + Express + SQLite (sql.js) + 原生 HTML/CSS/JS

---

## 文件结构

| 文件 | 操作 | 职责 |
|---|---|---|
| `db.js` | 修改 | 迁移新增 `custody_unit` 列 |
| `db/samples.js` | 修改 | `nextSampleNo()` 分流逻辑；`createSample` 接收 `custody_unit` |
| `routes/samples.js` | 修改 | POST 路由传递 `custody_unit` |
| `public/js/constants.js` | 修改 | 新增 `CUSTODY_UNITS` 常量 |
| `public/js/new.js` | 修改 | 新建表单增加保管单位下拉 |
| `tests/samples.test.js` | 修改 | 结构化编码生成测试 |

---

### Task 1: 数据库新增 custody_unit 列

**Files:**
- Modify: `db.js:70-75`（迁移列数组）

- [ ] **Step 1: 在迁移数组中追加 `custody_unit`**

`db.js` 第 70-71 行，在当前迁移数组末尾追加 `'custody_unit'`：

```js
  for (const col of ['model', 'station', 'image', 'produced_image', 'inspect_image',
    'sample_type', 'limit_item', 'source_type', 'valid_until', 'card_version',
    'test_standard', 'test_data', 'signed_by_rnd', 'signed_by_rd', 'signed_by_qa', 'custody_unit']) {
```

- [ ] **Step 2: db/samples.js createSample 接收 custody_unit**

`db/samples.js` 第 9-29 行 `createSample` 函数：

解构参数中追加 `custody_unit`，INSERT SQL 和 VALUES 中追加对应列：

```js
  function createSample({ name, spec, model, station, image, notes, created_by,
    sample_type, limit_item, source_type, valid_until, card_version,
    test_standard, test_data, signed_by_rd, signed_by_rnd, signed_by_qa, custody_unit }) {
    const ts = nowISO();
    const ns = nextSampleNo({ source_type, limit_item, sample_type, custody_unit });
    const token = crypto.randomBytes(8).toString('hex');
    const sbRd = signed_by_rd || signed_by_rnd || '';
    dbRef.run(`INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,
      sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rd,signed_by_qa,custody_unit,
      created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'NEW',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [ns, name || null, spec || null, model || null, station || null, image || null,
       token, created_by || null, notes || null,
       sample_type || '', limit_item || '', source_type || '', valid_until || '',
       card_version || '', test_standard || '', test_data || '',
       sbRd, signed_by_qa || '', custody_unit || '',
       ts, ts]);
    persist();
    return getSampleByNo(ns);
  }
```

注意：`nextSampleNo()` 现在接收参数 `{ source_type, limit_item, sample_type, custody_unit }`。

- [ ] **Step 3: 运行已有测试确保兼容**

```bash
cd /www/wwwroot/sample-mgmt && npm test
```
Expected: 所有已有测试 PASS。

- [ ] **Step 4: Commit**

```bash
git add db.js db/samples.js
git commit -m "feat(db): add custody_unit column; pass to createSample"
```

---

### Task 2: nextSampleNo() 结构化编码生成逻辑

**Files:**
- Modify: `db/samples.js:5-8`（nextSampleNo 函数）

- [ ] **Step 1: 重写 nextSampleNo 函数**

替换 `db/samples.js` 第 5-8 行：

```js
  function nextSampleNo({ source_type, limit_item, sample_type, custody_unit } = {}) {
    // 非限度样品：保持原有 SM-XXXXXX 格式
    if (!source_type || !limit_item || !sample_type) {
      const row = one('SELECT COUNT(*) AS c FROM samples');
      return 'SM-' + String((row.c || 0) + 1).padStart(6, '0');
    }

    // 限度样品：结构化编码 [来源前缀][限度项目][流水号4位][保管单位][序号+K/N]
    // 流水号：按 来源+项目 独立递增
    const seqRow = one(
      'SELECT COUNT(*) AS c FROM samples WHERE source_type = ? AND limit_item = ?',
      [source_type, limit_item]
    );
    const seq = String((seqRow.c || 0) + 1).padStart(4, '0');

    // 序号：按 来源+项目+保管单位+类型 独立递增
    const cu = custody_unit || '';
    const idxRow = one(
      'SELECT COUNT(*) AS c FROM samples WHERE source_type = ? AND limit_item = ? AND custody_unit = ? AND sample_type = ?',
      [source_type, limit_item, cu, sample_type]
    );
    const idx = String((idxRow.c || 0) + 1);
    const marker = sample_type === 'OK' ? idx + 'K' : idx + 'N';

    return source_type + limit_item + seq + cu + marker;
  }
```

- [ ] **Step 2: 运行测试验证**

```bash
cd /www/wwwroot/sample-mgmt && npm test
```
Expected: 已有测试 PASS（现有测试创建的是非限度样品，走 SM-XXXXXX 分支不受影响）。

- [ ] **Step 3: Commit**

```bash
git add db/samples.js
git commit -m "feat(db): structured sample_no for limit samples — [source][item][seq4][unit][idx+K/N]"
```

---

### Task 3: server.js 路由传递 custody_unit

**Files:**
- Modify: `routes/samples.js:51-71`（POST /api/samples）

- [ ] **Step 1: POST 路由接收并传递 custody_unit**

`routes/samples.js` 第 55-67 行：

```js
    const { name, spec, model, station, notes,
      sample_type, limit_item, source_type, valid_until, card_version,
      test_standard, test_data, custody_unit } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: '请填写样品名称' });
    const s = D.createSample({
      name: name.trim(), spec: spec || '', model: model || '', station: station || '',
      notes: notes || '', image: '', created_by: u.id,
      sample_type: sample_type || '', limit_item: limit_item || '',
      source_type: source_type || '', valid_until: valid_until || '',
      card_version: card_version || '', test_standard: test_standard || '',
      test_data: test_data || '',
      signed_by_rd: u.display_name || u.username,
      signed_by_qa: '',
      custody_unit: custody_unit || ''
    });
```

- [ ] **Step 2: 运行测试验证**

```bash
cd /www/wwwroot/sample-mgmt && npm test
```
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add routes/samples.js
git commit -m "feat(api): pass custody_unit from POST to createSample"
```

---

### Task 4: 前端常量 + 表单增加保管单位

**Files:**
- Modify: `public/js/constants.js`（新增 CUSTODY_UNITS）
- Modify: `public/js/new.js`（添加保管单位下拉）

- [ ] **Step 1: constants.js 新增 CUSTODY_UNITS**

在 `SOURCE_TYPES` 行之后追加：

```js
const CUSTODY_UNITS=[{code:'1',label:'品保'},{code:'2',label:'厂务'},{code:'3',label:'工程'},{code:'4',label:'研发'},{code:'5',label:'客户'},{code:'6',label:'厂务二部'},{code:'8',label:'工程二部'}];
```

- [ ] **Step 2: new.js 新增保管单位下拉**

修改 `viewNew()` 函数中「限度样品信息」区域，在「来源」和「有效期」之间增加保管单位：

```js
function viewNew(){
  const v=$('#view');
  const stationOpts='<option value="">请选择站别</option>'+STATIONS.map(x=>'<option value="'+x+'">'+x+'</option>').join('');
  const limitOpts='<option value="">不适用</option>'+LIMIT_ITEMS.map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join('');
  const unitOpts='<option value="">不适用</option>'+CUSTODY_UNITS.map(x=>'<option value="'+x.code+'">'+x.label+'</option>').join('');
  v.innerHTML='<div class="card" style="max-width:960px">'+
    '<div class="new-grid">'+
    '<div class="new-col">'+
    '<div class="new-col-title">基础信息</div>'+
    '<label>样品名称 *</label><input id="n-name" placeholder="如 1225震动样"/>'+
    '<label>机型</label><input id="n-model" placeholder="如 1225 / X200 等"/>'+
    '<label>站别</label><select id="n-station">'+stationOpts+'</select>'+
    '<label>规格/型号</label><input id="n-spec" placeholder="如 容量/尺寸等"/>'+
    '<label>备注</label><textarea id="n-notes" rows="3"></textarea>'+
    '</div>'+
    '<div class="new-col">'+
    '<div class="new-col-title">限度样品信息（选填）</div>'+
    '<label>样品类型</label><select id="n-type"><option value="">不适用</option><option value="OK">OK</option><option value="NG">NG</option></select>'+
    '<label>限度项目</label><select id="n-limit-item">'+limitOpts+'</select>'+
    '<label>来源</label><select id="n-source"><option value="">不适用</option><option value="C">客供(C)</option><option value="T">元山(T)</option><option value="G">塔岗(G)</option></select>'+
    '<label>保管单位</label><select id="n-custody-unit">'+unitOpts+'</select>'+
    '<label>有效期</label><input type="date" id="n-valid-until"/>'+
    '<label>版次</label><input id="n-card-version" placeholder="如 A1"/>'+
    '<label>测试标准/规格</label><textarea id="n-test-standard" rows="3"></textarea>'+
    '</div>'+
    '</div>'+
    '<div style="margin-top:16px"><button class="btn" onclick="submitNew()">创建样品并生成条码</button></div>'+
    '<div id="n-msg" class="muted" style="margin-top:10px"></div></div>';
}
```

- [ ] **Step 3: submitNew 传递 custody_unit**

```js
async function submitNew(){
  $('#n-msg').textContent='';
  try{
    const payload={
      name:$('#n-name').value,
      model:$('#n-model').value,
      station:$('#n-station').value,
      spec:$('#n-spec').value,
      notes:$('#n-notes').value,
      sample_type:$('#n-type').value,
      limit_item:$('#n-limit-item').value,
      source_type:$('#n-source').value,
      custody_unit:$('#n-custody-unit').value,
      valid_until:$('#n-valid-until').value,
      card_version:$('#n-card-version').value,
      test_standard:$('#n-test-standard').value
    };
    const s=await api('POST','/api/samples',payload);
    openPrintLabel(s);
    toast('已创建 '+s.sample_no+'，可到样品列表补打条码','ok');
  }catch(e){$('#n-msg').textContent=e.message;}
}
```

- [ ] **Step 4: 运行测试验证**

```bash
cd /www/wwwroot/sample-mgmt && npm test
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add public/js/constants.js public/js/new.js
git commit -m "feat(frontend): add custody_unit dropdown to new sample form"
```

---

### Task 5: 测试用例

**Files:**
- Modify: `tests/samples.test.js`

- [ ] **Step 1: 新增结构化编码测试套件**

在 `tests/samples.test.js` 末尾（第 380 行之前）追加：

```js
describe('POST /api/samples — structured coding', () => {
  it('should generate structured code for limit sample (OK)', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({
        name: '限度OK编码测试', spec: 'OK-CD', model: 'CD', station: '站CD',
        sample_type: 'OK', limit_item: 'A1', source_type: 'T', custody_unit: '3',
        valid_until: '2027-06-01', card_version: 'A1',
        test_standard: '标准', test_data: ''
      });
    expect(res.status).toBe(200);
    // 格式: TA1[流水4位]3[序号]K
    expect(res.body.sample_no).toMatch(/^TA1\d{4}3\d+K$/);
  });

  it('should generate structured code for limit sample (NG)', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({
        name: '限度NG编码测试', spec: 'NG-CD', model: 'CD', station: '站CD',
        sample_type: 'NG', limit_item: 'B', source_type: 'C', custody_unit: '1',
        valid_until: '2027-06-01', card_version: 'B1',
        test_standard: '异音标准', test_data: ''
      });
    expect(res.status).toBe(200);
    // 格式: CB[流水4位]1[序号]N
    expect(res.body.sample_no).toMatch(/^CB\d{4}1\d+N$/);
  });

  it('should keep SM-XXXXXX for non-limit sample', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent
      .post('/api/samples')
      .send({ name: '普通样品', spec: 'ordinary', notes: 'no limit' });
    expect(res.status).toBe(200);
    expect(res.body.sample_no).toMatch(/^SM-\d{6}$/);
  });

  it('should increment流水号 independently per source+item', async () => {
    const { agent } = await login('rd01', 'rd123');
    // 创建第一个 T+A 样品
    const r1 = await agent.post('/api/samples').send({
      name: 'TA-1', sample_type: 'OK', limit_item: 'A', source_type: 'T', custody_unit: '3'
    });
    expect(r1.status).toBe(200);
    // 创建第二个 T+A 样品
    const r2 = await agent.post('/api/samples').send({
      name: 'TA-2', sample_type: 'NG', limit_item: 'A', source_type: 'T', custody_unit: '4'
    });
    expect(r2.status).toBe(200);
    // 流水号应递增
    const seq1 = r1.body.sample_no.match(/^TA(\d{4})/)[1];
    const seq2 = r2.body.sample_no.match(/^TA(\d{4})/)[1];
    expect(Number(seq2)).toBe(Number(seq1) + 1);
  });
});
```

- [ ] **Step 2: 运行全量测试**

```bash
cd /www/wwwroot/sample-mgmt && npm test
```
Expected: 所有测试 PASS（包含新增 4 个 + 已有 40 个 = 44 个）。

- [ ] **Step 3: Commit**

```bash
git add tests/samples.test.js
git commit -m "test: add structured coding test cases for limit samples"
```

---

### Task 6: 回归验证 + 臃肿检测报告

- [ ] **Step 1: 启动服务手动验证**

```bash
cd /www/wwwroot/sample-mgmt && npm start &
```

验证清单：
1. 新建非限度样品 → 编号仍为 `SM-XXXXXX`
2. 新建限度样品（类型=OK，项目=A1，来源=T，保管单位=3）→ 编号格式 `TA1XXXX3XK`
3. 再建一个同来源+项目的限度样品 → 流水号递增
4. 匿名标示卡 `/card/TA1000131K` → 正常显示
5. 打印标示卡 → 编号正确

- [ ] **Step 2: 臃肿检测报告**

| 文件 | 类型 | 行数 | 上限 | 使用率 | 函数 | 预警 |
|---|---|---|---|---|---|---|
| `db/samples.js` | 数据层 | ~80 | 200 | 40% | 6 | OK |
| `routes/samples.js` | 路由 | ~120 | 400 | 30% | 3 | OK |
| `public/js/constants.js` | 常量(豁免) | ~20 | 800 | 3% | 0 | OK |
| `public/js/new.js` | 页面 | ~85 | 300 | 28% | 5 | OK |
| `tests/samples.test.js` | 测试(豁免) | ~410 | 1000 | 41% | — | OK |

本次修改仅新增小体量代码，未触发任何阈值预警。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-23-structured-coding.md
git commit -m "docs: add structured coding implementation plan"
```

---

## 自审清单

1. **Spec coverage**: 结构化编码 5 段全部覆盖 — 来源前缀 ✓ / 限度项目 ✓ / 流水号4位 ✓ / 保管单位 ✓ / 序号+K/N ✓；非限度样品兼容 ✓；保管单位下拉 ✓
2. **Placeholder scan**: 无 TBD/TODO，所有代码完整可执行
3. **Type consistency**: `custody_unit` 字段名在 db.js → db/samples.js → routes/samples.js → new.js → tests 中保持一致；`nextSampleNo({...})` 参数签名一致；编码格式 `TA1000131K` 在测试正则中一致
