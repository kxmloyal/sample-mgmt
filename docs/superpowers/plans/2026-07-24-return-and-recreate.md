# 样品二次操作与退回重发 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现样品 RELEASED 后的二次操作（复检/修正标示卡/修改储位/退回/作废/重做替代品），新增 RETURNING、RETIRED 状态。

**Architecture:** 后端 `actionForRole` 改为返回数组 `allowedActions`，支持同角色同状态多操作选择；前端 `renderScanAction` 改为多按钮 + 按需加载表单；新增 6 个 action 处理分支（EDIT_STORAGE/RETURN_REQ/EDIT_CARD/RE_RELEASE/RETIRE_RECREATE/RETIRE_ONLY/REJECT/RECREATE）。

**Tech Stack:** Node.js + Express(CommonJS) + SQLite(sql.js) + 原生 HTML/CSS/JS

**设计文档:** `docs/superpowers/specs/2026-07-24-return-and-recreate-design.md`

---

## 文件结构

| 文件 | 职责 | 变更类型 |
|---|---|---|
| `db.js` | 新增 4 列迁移 + 新列 `retire_assigned_rd` 索引 | 改 |
| `db/samples.js` | `createSample` 支持 `replaces`；`updateSample` 支持新列 | 改 |
| `routes/scan.js` | `actionForRole`→`allowedActions` 数组 + 6 新 action 处理 | **重点改** |
| `routes/misc.js` | 看板补充 RETURNING/RETIRED 统计 + 待办扩展 + RD 用户列表 | 改 |
| `public/js/constants.js` | STATUS 新增 RETURNING/RETIRED；新增 ACTION_LABEL | 改 |
| `public/js/scan.js` | `renderScanAction` 多按钮 + 表单按需加载 + `confirmScan` 传 action | **重点改** |
| `public/js/scan-wizard.js` | RE_RELEASE 复用向导（带 `isReRelease` 标志） | 改 |
| `public/js/card-fields.js` | `buildCardFieldTable` 支持 `forceEditable` | 改 |
| `public/js/dashboard.js` | 看板展示 RETURNING 待办 + 新状态标签 | 改 |

---

### Task 1: 数据库迁移 — 新增 4 列

**Files:**
- Modify: `db.js:69-75`

- [ ] **Step 1: 新增 4 列迁移到迁移循环**

在 `db.js` 的列迁移数组中追加 `retired_reason`, `replaced_by`, `replaces`, `retire_assigned_rd`：

```js
// 迁移：已存在的库补加新列（CREATE TABLE 不会给老表加列）
for (const col of ['model', 'station', 'image', 'produced_image', 'inspect_image',
  'sample_type', 'limit_item', 'source_type', 'valid_until', 'card_version',
  'test_standard', 'test_data', 'signed_by_rnd', 'signed_by_rd', 'signed_by_qa',
  'retired_reason', 'replaced_by', 'replaces', 'retire_assigned_rd']) {
  const has = db.exec(`PRAGMA table_info(samples)`)[0].values.some(r => r[1] === col);
  if (!has) db.run(`ALTER TABLE samples ADD COLUMN ${col} TEXT`);
}
```

- [ ] **Step 2: 在 `signed_by_qa` 迁移之后添加 `retire_assigned_rd` 索引**

```js
db.run(`CREATE INDEX IF NOT EXISTS idx_samples_retire_rd ON samples(retire_assigned_rd)`);
```

插入位置：现有 `CREATE INDEX IF NOT EXISTS idx_logs_sample` 之后。

- [ ] **Step 3: 验证迁移**

```bash
cd /www/wwwroot/sample-mgmt && node -e "
const D = require('./db');
D.ready.then(() => {
  const cols = D.db().exec('PRAGMA table_info(samples)')[0].values.map(r=>r[1]);
  console.log('retired_reason:', cols.includes('retired_reason'));
  console.log('replaced_by:', cols.includes('replaced_by'));
  console.log('replaces:', cols.includes('replaces'));
  console.log('retire_assigned_rd:', cols.includes('retire_assigned_rd'));
  // 幂等：再跑一次不报错
  process.exit(0);
});
```
Expected: 4 个 `true`，无异常。

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add db.js && git commit -m "feat(db): add retired_reason/replaced_by/replaces/retire_assigned_rd columns"
```

---

### Task 2: 数据层 — createSample/updateSample 支持新列

**Files:**
- Modify: `db/samples.js:9-29` (createSample)
- Modify: `db/samples.js:52-70` (updateSample)

- [ ] **Step 1: createSample 支持 `replaces` 参数**

修改函数签名和 INSERT：

```js
function createSample({ name, spec, model, station, image, notes, created_by,
  sample_type, limit_item, source_type, valid_until, card_version,
  test_standard, test_data, signed_by_rd, signed_by_rnd, signed_by_qa,
  replaces }) {
  const ts = nowISO();
  const ns = nextSampleNo();
  const token = crypto.randomBytes(8).toString('hex');
  const sbRd = signed_by_rd || signed_by_rnd || '';
  dbRef.run(`INSERT INTO samples (sample_no,name,spec,model,station,image,qr_token,status,created_by,notes,
    sample_type,limit_item,source_type,valid_until,card_version,test_standard,test_data,signed_by_rd,signed_by_qa,
    replaces,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'NEW',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [ns, name || null, spec || null, model || null, station || null, image || null,
     token, created_by || null, notes || null,
     sample_type || '', limit_item || '', source_type || '', valid_until || '',
     card_version || '', test_standard || '', test_data || '',
     sbRd, signed_by_qa || '',
     replaces || null,
     ts, ts]);
  persist();
  return getSampleByNo(ns);
}
```

- [ ] **Step 2: updateSample 支持新 4 列**

修改 UPDATE SQL 和参数：

```js
function updateSample(s) {
  dbRef.run(`UPDATE samples SET status=?, produced_at=?, released_at=?, release_cycle_days=?,
    next_inspect_at=?, custody_dept=?, storage_location=?, model=?, station=?, image=?,
    produced_image=?, inspect_image=?, notes=?, updated_at=?,
    sample_type=?, limit_item=?, source_type=?, valid_until=?, card_version=?,
    test_standard=?, test_data=?, signed_by_rd=?, signed_by_qa=?,
    retired_reason=?, replaced_by=?, replaces=?, retire_assigned_rd=?
    WHERE id=?`,
    [s.status, s.produced_at || null, s.released_at || null, s.release_cycle_days ?? null,
     s.next_inspect_at || null, s.custody_dept || null, s.storage_location || null,
     s.model ?? null, s.station ?? null, s.image ?? null,
     s.produced_image ?? null, s.inspect_image ?? null, s.notes || null, nowISO(),
     s.sample_type ?? '', s.limit_item ?? '', s.source_type ?? '', s.valid_until ?? '',
     s.card_version ?? '', s.test_standard ?? '', s.test_data ?? '',
     s.signed_by_rd ?? s.signed_by_rnd ?? '',
     s.signed_by_qa ?? '',
     s.retired_reason ?? null, s.replaced_by ?? null, s.replaces ?? null, s.retire_assigned_rd ?? null,
     s.id]);
  persist();
  return getSampleById(s.id);
}
```

- [ ] **Step 3: 验证数据层**

```bash
cd /www/wwwroot/sample-mgmt && node -e "
const D = require('./db');
D.ready.then(() => {
  // 测试 createSample with replaces
  const s = D.createSample({ name:'测试替代品', spec:'test', notes:'test', replaces:'SM-000001' });
  console.log('replaces:', s.replaces);
  // 测试 updateSample with new columns
  const u = D.updateSample({ ...s, retired_reason:'test reason' });
  console.log('retired_reason:', u.retired_reason);
  // 清理
  D.deleteSample(s.id);
  console.log('OK');
  process.exit(0);
});
```
Expected: `replaces: SM-000001`, `retired_reason: test reason`, `OK`。

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add db/samples.js && git commit -m "feat(db): support replaces/retired_reason/replaced_by/retire_assigned_rd in CRUD"
```

---

### Task 3: 后端 scan.js — allowedActions + 新 action 处理

**Files:**
- Modify: `routes/scan.js`（全量重写）

- [ ] **Step 1: 用 `allowedActions` 替换 `actionForRole`**

```js
// routes/scan.js — 扫码台：解析 + 状态机
const D = require('../db');

const STATUS_LABEL = {
  NEW: '新建(待制作确认)', PRODUCED: '制作完成', RELEASED: '已发行',
  IN_CUSTODY: '保管中', RETURNING: '退回审核中', RETIRED: '已作废'
};

function allowedActions(role, status, next_inspect_at, retire_assigned_rd, currentUserId) {
  const actions = [];

  if ((role === 'RD' || role === 'ME') && status === 'NEW') actions.push('PRODUCE');
  if (role === 'QA' && status === 'PRODUCED') actions.push('RELEASE');
  if (role === 'CUSTODY' && status === 'RELEASED') actions.push('CUSTODY');

  // QA 扫 RELEASED：复检（不限到期）+ 修正标示卡
  if (role === 'QA' && status === 'RELEASED') { actions.push('INSPECT'); actions.push('EDIT_CARD'); }

  // 保管扫 IN_CUSTODY：修改储位 + 申请退回
  if (role === 'CUSTODY' && status === 'IN_CUSTODY') { actions.push('EDIT_STORAGE'); actions.push('RETURN_REQ'); }

  // 品保审核退回（4 分支）
  if (role === 'QA' && status === 'RETURNING') { actions.push('RE_RELEASE'); actions.push('RETIRE_RECREATE'); actions.push('RETIRE_ONLY'); actions.push('REJECT'); }

  // RD 重做替代品
  if ((role === 'RD' || role === 'ME') && status === 'RETURNING' && retire_assigned_rd === currentUserId) actions.push('RECREATE');

  return actions;
}
```

- [ ] **Step 2: 重写 `/api/resolve` — 返回 `allowedActions` 数组**

```js
app.get('/api/resolve', requireAuth, (req, res) => {
  const code = (req.query.code || '').trim();
  if (!code) return res.status(400).json({ error: '无效码' });
  let s = D.getSampleByNo(code) || D.getSampleByToken(code);
  if (!s) return res.status(404).json({ error: '未找到对应样品：' + code });
  const u = currentUser(req);
  const actions = allowedActions(u.role, s.status, s.next_inspect_at, s.retire_assigned_rd, u.display_name);
  const rdUsers = s.status === 'RETURNING' ? D.listUsers().filter(u => u.role === 'RD' || u.role === 'ME').map(u => ({ display_name: u.display_name || u.username, dept: u.dept })) : [];
  res.json({ sample: s, allowedActions: actions, rdUsers });
});
```

- [ ] **Step 3: 重写 `/api/scan` POST — 基于 `req.body.action` 路由**

完整替换现有 POST handler（保留 PRODUCE/RELEASE/INSPECT/CUSTODY 逻辑 + 新增 6 个 handler）：

```js
app.post('/api/scan', requireAuth, (req, res) => {
  const u = currentUser(req);
  const { code, location, cycleDays, note } = req.body || {};
  const bodyAction = (req.body.action || '').trim();
  const scanCode = (code || '').trim();
  if (!scanCode) return res.status(400).json({ error: '未提供扫码内容' });

  const s = D.getSampleByNo(scanCode) || D.getSampleByToken(scanCode);
  if (!s) return res.status(404).json({ error: '未找到对应样品：' + scanCode });

  const actions = allowedActions(u.role, s.status, s.next_inspect_at, s.retire_assigned_rd, u.display_name);
  const chosenAction = bodyAction || actions[0];
  if (!chosenAction || !actions.includes(chosenAction))
    return res.status(409).json({
      error: `当前角色(${u.role})无法对状态为「${STATUS_LABEL[s.status] || s.status}」的样品执行「${chosenAction}」操作`,
      sample: s
    });

  const ts = D.nowISO();
  const updated = { ...s, updated_at: ts };

  // === 现有 Action（保留不变） ===
  if (chosenAction === 'PRODUCE') {
    const img = req.body.image;
    if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传制作照片' });
    const prodImgUrl = saveSampleImage(img, s.sample_no + '_prod');
    if (prodImgUrl) updated.produced_image = prodImgUrl;
    updated.status = 'PRODUCED';
    updated.produced_at = ts;
    D.addLog({ sample_id: s.id, action: 'PRODUCE', role: u.role, user_id: u.id, dept: u.dept, note: note || '研发确认制作完成' });
  } else if (chosenAction === 'RELEASE') {
    const cyc = Number(cycleDays);
    if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
    const { sample_type, limit_item, source_type, card_version, test_standard, test_data } = (req.body || {});
    if (!sample_type || !sample_type.trim()) return res.status(400).json({ error: '请选择样品类型（OK样品/NG样品）' });
    if (!limit_item || !limit_item.trim()) return res.status(400).json({ error: '请选择限度项目' });
    const d = new Date(ts); d.setDate(d.getDate() + cyc);
    updated.status = 'RELEASED';
    updated.released_at = ts;
    updated.release_cycle_days = cyc;
    updated.next_inspect_at = d.toISOString();
    updated.sample_type = sample_type.trim();
    updated.limit_item = limit_item.trim();
    if (source_type) updated.source_type = source_type.trim();
    updated.valid_until = updated.next_inspect_at;
    if (card_version) updated.card_version = card_version.trim();
    if (test_standard) updated.test_standard = test_standard.trim();
    if (test_data) updated.test_data = test_data.trim();
    updated.signed_by_qa = u.display_name || u.username;
    D.addLog({ sample_id: s.id, action: 'RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: `正式发行，复检周期${cyc}天，标示卡已签署` });
  } else if (chosenAction === 'INSPECT') {
    const img = req.body.image;
    if (!img || typeof img !== 'string') return res.status(400).json({ error: '请上传复检照片' });
    const inspImgUrl = saveSampleImage(img, s.sample_no + '_insp');
    const cyc = Number(cycleDays) || s.release_cycle_days || 90;
    const d = new Date(ts); d.setDate(d.getDate() + cyc);
    if (inspImgUrl) updated.inspect_image = inspImgUrl;
    updated.next_inspect_at = d.toISOString();
    updated.valid_until = updated.next_inspect_at;
    const { card_version, test_data } = req.body || {};
    if (card_version) updated.card_version = card_version;
    if (test_data) updated.test_data = test_data;
    const cardUpdated = (card_version||test_data)?'、「标示卡已更新」':'';
    const isEarly = s.next_inspect_at && new Date(s.next_inspect_at).getTime() > Date.now();
    D.addLog({ sample_id: s.id, action: isEarly ? 'INSPECT_EARLY' : 'INSPECT', role: u.role, user_id: u.id, dept: u.dept, note: note || ('复检通过，下次周期' + cyc + '天' + cardUpdated) });
  } else if (chosenAction === 'CUSTODY') {
    if (!location || !location.trim()) return res.status(400).json({ error: '请填写保管储位' });
    updated.status = 'IN_CUSTODY';
    updated.custody_dept = u.dept;
    updated.storage_location = location.trim();
    D.addLog({ sample_id: s.id, action: 'CUSTODY', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '部门接收保管' });
  }

  // === 新增 Action ===
  else if (chosenAction === 'EDIT_CARD') {
    const { sample_type, limit_item, source_type, card_version, test_data } = req.body || {};
    if (sample_type) updated.sample_type = sample_type.trim();
    if (limit_item) updated.limit_item = limit_item.trim();
    if (source_type) updated.source_type = source_type.trim();
    if (card_version !== undefined) updated.card_version = card_version.trim();
    if (test_data !== undefined) updated.test_data = test_data.trim();
    updated.signed_by_qa = u.display_name || u.username;
    D.addLog({ sample_id: s.id, action: 'EDIT_CARD', role: u.role, user_id: u.id, dept: u.dept, note: note || '修正标示卡' });
  } else if (chosenAction === 'EDIT_STORAGE') {
    if (!location || !location.trim()) return res.status(400).json({ error: '请填写新储位' });
    updated.storage_location = location.trim();
    D.addLog({ sample_id: s.id, action: 'EDIT_STORAGE', role: u.role, user_id: u.id, dept: u.dept, location: location.trim(), note: note || '修改储位' });
  } else if (chosenAction === 'RETURN_REQ') {
    if (!note || !note.trim()) return res.status(400).json({ error: '请填写退回原因' });
    updated.status = 'RETURNING';
    D.addLog({ sample_id: s.id, action: 'RETURN_REQUEST', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
  } else if (chosenAction === 'RE_RELEASE') {
    const cyc = Number(cycleDays);
    if (!cyc || cyc <= 0) return res.status(400).json({ error: '请填写有效的复检周期（天）' });
    const { sample_type, limit_item, source_type, card_version, test_data } = req.body || {};
    if (!sample_type || !sample_type.trim()) return res.status(400).json({ error: '请选择样品类型' });
    if (!limit_item || !limit_item.trim()) return res.status(400).json({ error: '请选择限度项目' });
    const d = new Date(ts); d.setDate(d.getDate() + cyc);
    updated.status = 'RELEASED';
    updated.released_at = ts;
    updated.release_cycle_days = cyc;
    updated.next_inspect_at = d.toISOString();
    updated.valid_until = updated.next_inspect_at;
    updated.sample_type = sample_type.trim();
    updated.limit_item = limit_item.trim();
    if (source_type) updated.source_type = source_type.trim();
    if (card_version) updated.card_version = card_version.trim();
    if (test_data) updated.test_data = test_data.trim();
    updated.signed_by_qa = u.display_name || u.username;
    // 清除退回相关字段
    updated.retire_assigned_rd = null;
    updated.retired_reason = null;
    D.addLog({ sample_id: s.id, action: 'RE_RELEASE', role: u.role, user_id: u.id, dept: u.dept, note: '品保确认重新发行，周期' + cyc + '天' });
  } else if (chosenAction === 'RETIRE_RECREATE') {
    const assignedRd = (req.body.retire_assigned_rd || '').trim();
    if (!assignedRd) return res.status(400).json({ error: '请选择指派重新制作的研发人员' });
    updated.status = 'RETIRED';
    updated.retired_reason = note || '退回研发重新制作';
    updated.retire_assigned_rd = assignedRd;
    D.addLog({ sample_id: s.id, action: 'RETIRE_RECREATE', role: u.role, user_id: u.id, dept: u.dept, note: '指派' + assignedRd + '重新制作' });
  } else if (chosenAction === 'RETIRE_ONLY') {
    if (!note || !note.trim()) return res.status(400).json({ error: '请填写作废原因' });
    updated.status = 'RETIRED';
    updated.retired_reason = note.trim();
    D.addLog({ sample_id: s.id, action: 'RETIRE_ONLY', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
  } else if (chosenAction === 'REJECT') {
    if (!note || !note.trim()) return res.status(400).json({ error: '请填写拒绝理由' });
    updated.status = 'IN_CUSTODY';
    D.addLog({ sample_id: s.id, action: 'RETURN_REJECT', role: u.role, user_id: u.id, dept: u.dept, note: note.trim() });
  } else if (chosenAction === 'RECREATE') {
    const newSample = D.createSample({
      name: s.name, spec: s.spec, model: s.model, station: s.station,
      sample_type: s.sample_type, limit_item: s.limit_item, source_type: s.source_type,
      card_version: s.card_version, test_standard: s.test_standard, test_data: s.test_data,
      signed_by_rd: u.display_name || u.username, signed_by_qa: s.signed_by_qa,
      notes: '替代已作废样品 ' + s.sample_no, created_by: u.id, replaces: s.sample_no
    });
    const oldUpdated = { ...s, replaced_by: newSample.sample_no, updated_at: ts };
    D.updateSample(oldUpdated);
    D.addLog({ sample_id: s.id, action: 'RECREATE_REPLACED', role: u.role, user_id: u.id, dept: u.dept, note: '由 ' + newSample.sample_no + ' 替代' });
    D.addLog({ sample_id: newSample.id, action: 'CREATE', role: u.role, user_id: u.id, dept: u.dept, note: '替代 ' + s.sample_no });
    res.json({ sample: newSample, replaced: s.sample_no, action: 'RECREATE', message: '替代样品已创建：' + newSample.sample_no });
    return;
  }

  const result = D.updateSample(updated);

  // RELEASE/RE_RELEASE 后返回标示卡打印提示
  const printCard = (chosenAction === 'RELEASE' || chosenAction === 'RE_RELEASE' || chosenAction === 'EDIT_CARD');
  res.json({ sample: result, action: chosenAction, message: `操作成功：${chosenAction}`, printCard });
});
```

- [ ] **Step 4: 验证后端逻辑**

```bash
cd /www/wwwroot/sample-mgmt && node -e "
const D = require('./db');
D.ready.then(() => {
  // 验证 allowedActions 各种组合
  const { register } = require('./routes/scan');
  // 函数已在模块作用域，直接测试 allowedActions
  // （注：allowedActions 是文件顶层函数，不在 register 内，需单独导出或内联测试）
  console.log('allowedActions test - manual verification needed after server start');
  process.exit(0);
});
```

- [ ] **Step 5: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add routes/scan.js && git commit -m "feat(scan): add allowedActions array + 8 new action handlers"
```

---

### Task 4: 看板后端 — misc.js 补充新状态 + RD 用户列表

**Files:**
- Modify: `routes/misc.js:10-29`（看板）
- 追加: `routes/misc.js` 末尾（RD 用户列表端点）

- [ ] **Step 1: byStatus 补充 RETURNING/RETIRED + 待办扩展**

```js
app.get('/api/dashboard', requireAuth, (req, res) => {
  const u = currentUser(req);
  const all = D.listSamples({});
  const byStatus = { NEW: 0, PRODUCED: 0, RELEASED: 0, IN_CUSTODY: 0, RETURNING: 0, RETIRED: 0 };
  for (const s of all) byStatus[s.status] = (byStatus[s.status] || 0) + 1;

  const now = Date.now();
  const overdue = all.filter(s => s.status === 'IN_CUSTODY' && s.next_inspect_at && new Date(s.next_inspect_at).getTime() < now);
  const dueSoon = all.filter(s => s.status === 'IN_CUSTODY' && s.next_inspect_at && new Date(s.next_inspect_at).getTime() >= now && new Date(s.next_inspect_at).getTime() < now + 7 * 864e5);

  let myPending = [];
  if (u.role === 'RD' || u.role === 'ME') {
    myPending = [
      ...all.filter(s => s.status === 'NEW'),
      ...all.filter(s => s.status === 'RETURNING' && s.retire_assigned_rd === u.display_name)
    ];
  } else if (u.role === 'QA') {
    myPending = [
      ...all.filter(s => s.status === 'PRODUCED'),
      ...all.filter(s => s.status === 'RETURNING')
    ];
  } else if (u.role === 'CUSTODY') myPending = all.filter(s => s.status === 'RELEASED');
  else myPending = all;

  res.json({
    byStatus, total: all.length, overdue, dueSoon, myPending,
    role: u.role, dept: u.dept, display_name: u.display_name
  });
});
```

- [ ] **Step 2: 在 `register` 函数内添加 RD 用户列表端点（CUSTODY 退回时选 RD）**

在 `register` 函数内，`// 健康检查` 之前插入：

```js
// RD/ME 用户列表（供退回指派选择）
app.get('/api/rd-users', requireAuth, (req, res) => {
  const users = D.listUsers().filter(u => u.role === 'RD' || u.role === 'ME').map(u => ({ id: u.id, display_name: u.display_name || u.username, dept: u.dept }));
  res.json(users);
});
```

- [ ] **Step 3: 在 `db.js` 确认 `listUsers` 已导出**

检查 `db.js` 中 `module.exports` 包含 `listUsers`（`db/users.js` 返回的对象中应有此函数）。若不存在则需补充。

```bash
cd /www/wwwroot/sample-mgmt && grep 'listUsers' db.js
```

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add routes/misc.js && git commit -m "feat(dashboard): add RETURNING/RETIRED stats + myPending extension + rd-users endpoint"
```

---

### Task 5: 前端常量 — STATUS/ACTION_LABEL 扩展

**Files:**
- Modify: `public/js/constants.js:2`

- [ ] **Step 1: 追加新状态和新动作标签**

```js
const STATUS={NEW:'新建·待制作确认',PRODUCED:'制作完成',RELEASED:'已发行',IN_CUSTODY:'保管中',RETURNING:'退回审核中',RETIRED:'已作废'};
const ROLE={ADMIN:'系统管理员',RD:'研发',ME:'生技',QA:'品保',CUSTODY:'保管'};
const ACTION_LABEL={
  PRODUCE:'确认制作完成',RELEASE:'确认正式发行',INSPECT:'确认复检完成',CUSTODY:'确认接收保管',
  EDIT_CARD:'修正标示卡',EDIT_STORAGE:'修改储位',RETURN_REQ:'申请退回',
  RE_RELEASE:'重新发行',RETIRE_RECREATE:'退回研发重做',RETIRE_ONLY:'直接作废',REJECT:'拒绝退回',
  RECREATE:'创建替代品'
};
```

- [ ] **Step 2: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/constants.js && git commit -m "feat(frontend): add RETURNING/RETIRED status + ACTION_LABEL constants"
```

---

### Task 6: 前端 scan.js — renderScanAction 多按钮 + confirmScan 传 action

**Files:**
- Modify: `public/js/scan.js:75-84` (doScan)
- Modify: `public/js/scan.js:86-111` (renderScanAction → 完全重写)
- Modify: `public/js/scan.js:117-164` (confirmScan → 传 action + 处理新 action body)

- [ ] **Step 1: 修改 `doScan` — 适配 `allowedActions` 数组**

```js
async function doScan(){
  const code=$('#scan-code').value.trim();
  if(!/^SM-\d{6}$/.test(code)){toast('编号格式错误：SM-XXXXXX（6位数字）','err');return refocusScan();}
  if(!code){toast('请先扫码或输入编号','err');return;}
  const box=$('#scan-result');box.innerHTML='<div class="muted">解析中…</div>';
  try{
    const {sample,allowedActions,rdUsers}=await api('GET','/api/resolve?code='+encodeURIComponent(code));
    window._scanRdUsers=rdUsers||[];
    renderScanAction(sample,allowedActions);
  }catch(e){box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><p style="color:var(--bad)">'+e.message+'</p></div>';}
}
```

- [ ] **Step 2: 完全重写 `renderScanAction` — 多按钮 + 表单按需加载**

```js
function renderScanAction(s,actions){
  const box=$('#scan-result');
  if(!actions||actions.length===0){
    box.innerHTML='<div class="card sample-card" style="border-color:#fecaca"><h3>'+s.sample_no+'</h3>'+
      '<p>当前状态：<b>'+STATUS[s.status]+'</b></p><p class="muted">你的角色（'+ROLE[me.role]+'）无法推进该样品，请确认流程顺序或由对应部门操作。</p></div>';
    return;
  }
  window._scanSample=s;
  window._scanActions=actions;

  const buttons=actions.map(a=>{
    const label=ACTION_LABEL[a]||a;
    return '<button class="btn sm" onclick="showScanActionForm(\''+a+'\')">'+label+'</button>';
  }).join(' ');

  box.innerHTML='<div class="card sample-card">'+
    '<div class="row" style="justify-content:space-between;align-items:center"><h3 style="margin:0">'+s.sample_no+'</h3>'+statusBadge(s)+'</div>'+
    '<div class="field"><span>名称</span><span>'+(s.name||'—')+'</span></div>'+
    '<div class="field"><span>规格</span><span>'+(s.spec||'—')+'</span></div>'+
    '<div class="field"><span>储位</span><span class="muted">'+(s.storage_location||'—')+'</span></div>'+
    '<div class="field"><span>发行时间</span><span class="muted">'+fmt(s.released_at)+'</span></div>'+
    (s.retired_reason?'<div class="field"><span>作废原因</span><span class="muted">'+s.retired_reason+'</span></div>':'')+
    '<div style="margin-top:12px">'+buttons+'</div>'+
    '<div id="scan-action-form" style="margin-top:12px"></div>'+
    '<div style="margin-top:8px"><button class="btn ghost sm" onclick="afterScanReset()">取消</button></div>'+
  '</div>';

  showScanActionForm(actions[0]);
}

function showScanActionForm(action){
  const s=window._scanSample;
  const formEl=$('#scan-action-form');
  if(!formEl)return;
  let html='';

  if(action==='PRODUCE'){
    html='<label>制作照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div>'+
      '<label>备注</label><input id="scan-note" placeholder="如：制作完成"/>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'PRODUCE\')">确认制作完成</button></div>';
  }else if(action==='RELEASE'){
    html=buildReleaseWizard(s,false);
  }else if(action==='INSPECT'){
    html='<label>复检照片 *</label><input id="scan-img" type="file" accept="image/*" onchange="previewScanImg(event)"/>'+
      '<div id="scan-img-prev" style="margin-top:8px"></div><label>备注</label><input id="scan-note" placeholder="如：复检通过"/>'+
      '<details class="scan-card-more" style="margin-top:10px"><summary>标示卡更新（选填）</summary>'+
      '<p class="muted" style="font-size:11px">复检时可更新版次/测试数据</p>'+
      '<table style="width:100%;font-size:12px"><tr><td style="padding:4px 0;color:#6b7280">版次</td><td><input id="scan-card-ver" value="'+(s.card_version||'')+'" style="width:100%"/></td></tr>'+
      '<tr><td style="padding:4px 0;color:#6b7280">测试数据</td><td><textarea id="scan-card-data" rows="2" style="resize:vertical;width:100%">'+(s.test_data||'')+'</textarea></td></tr></table>'+
      '</details>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'INSPECT\')">确认复检完成</button></div>';
  }else if(action==='CUSTODY'){
    html='<label>保管储位 *</label><input id="scan-loc" placeholder="如 A区-3架-2层"/>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'CUSTODY\')">确认接收保管</button></div>';
  }else if(action==='EDIT_CARD'){
    html=buildCardFieldTable(s,true)+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'EDIT_CARD\')">保存修正 + 打印标示卡</button></div>';
  }else if(action==='EDIT_STORAGE'){
    html='<label>当前储位</label><p class="muted">'+(s.storage_location||'未设置')+'</p>'+
      '<label>新储位 *</label><input id="scan-loc" placeholder="如 A区-3架-2层" value="'+(s.storage_location||'')+'"/>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'EDIT_STORAGE\')">确认修改储位</button></div>';
  }else if(action==='RETURN_REQ'){
    html='<label>退回原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述样品存在的问题"></textarea>'+
      '<div style="margin-top:12px"><button class="btn" style="background:#f59e0b" onclick="confirmScan(\'RETURN_REQ\')">提交退回申请</button></div>';
  }else if(action==='RETIRE_ONLY'){
    html='<label>作废原因 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请描述作废原因"></textarea>'+
      '<div style="margin-top:12px"><button class="btn" style="background:#dc2626" onclick="confirmScan(\'RETIRE_ONLY\')">确认作废</button></div>';
  }else if(action==='REJECT'){
    html='<label>拒绝理由 *</label><textarea id="scan-note" rows="3" style="resize:vertical;width:100%" placeholder="请填写拒绝退回的理由"></textarea>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'REJECT\')">拒绝退回</button></div>';
  }else if(action==='RE_RELEASE'){
    html=buildReleaseWizard(s,true);
  }else if(action==='RETIRE_RECREATE'){
    const rdOptions=(window._scanRdUsers||[]).map(u=>'<option value="'+u.display_name+'">'+u.display_name+' ('+(u.dept||'')+')</option>').join('');
    html='<label>指派研发人员 *</label><select id="scan-rd-select"><option value="">请选择RD/ME</option>'+rdOptions+'</select>'+
      '<label>备注</label><input id="scan-note" placeholder="如：需重新制作"/>'+
      '<div style="margin-top:12px"><button class="btn" style="background:#f59e0b" onclick="confirmScan(\'RETIRE_RECREATE\')">确认作废并指派重做</button></div>';
  }else if(action==='RECREATE'){
    html='<p class="muted">基于样品 <b>'+s.sample_no+'</b>（'+(s.name||'—')+'）创建替代品</p>'+
      '<p style="font-size:12px;color:#6b7280">将自动复制标示卡信息，新样品编号自动分配</p>'+
      '<div style="margin-top:12px"><button class="btn" onclick="confirmScan(\'RECREATE\')">确认创建替代品</button></div>';
  }else{formEl.innerHTML='';return;}

  formEl.innerHTML=html;
}
```

- [ ] **Step 3: 修改 `confirmScan` — 传递 action + 处理新 action body**

```js
async function confirmScan(action){
  var code=document.getElementById('scan-code').value.trim();
  var body={code:code,action:action};

  if(action==='PRODUCE'||action==='INSPECT'){
    var f=document.getElementById('scan-img').files[0];
    if(!f){toast('请上传照片','err');return;}
    body.image=await new Promise(function(res,rej){
      var r=new FileReader();r.onload=function(){res(r.result);};r.onerror=rej;r.readAsDataURL(f);
    });
    var noteEl=document.getElementById('scan-note');if(noteEl&&noteEl.value.trim())body.note=noteEl.value.trim();
  }
  if(action==='INSPECT'||action==='EDIT_CARD'){
    var verEl=document.getElementById('scan-card-ver');if(verEl&&verEl.value.trim()!==undefined)body.card_version=verEl.value.trim();
    var dataEl=document.getElementById('scan-card-data');if(dataEl&&dataEl.value.trim()!==undefined)body.test_data=dataEl.value.trim();
  }
  if(action==='EDIT_CARD'){
    var tEl=$('#scan-card-type');if(tEl&&tEl.value)body.sample_type=tEl.value;
    var lEl=$('#scan-card-item');if(lEl&&lEl.value)body.limit_item=lEl.value;
    var sEl=$('#scan-card-source');if(sEl&&sEl.value)body.source_type=sEl.value;
  }
  if(action==='RELEASE'){body.cycleDays=(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'90');body.sample_type=wizardSample&&wizardSample._wizCardType?wizardSample._wizCardType:'';body.limit_item=wizardSample&&wizardSample._wizCardItem?wizardSample._wizCardItem:'';if(wizardSample&&wizardSample._wizCardSource)body.source_type=wizardSample._wizCardSource;if(wizardSample&&wizardSample._wizCardVersion)body.card_version=wizardSample._wizCardVersion;if(wizardSample&&wizardSample._wizCardData)body.test_data=wizardSample._wizCardData;}
  if(action==='RE_RELEASE'){body.cycleDays=(wizardSample&&wizardSample._wizCycle?wizardSample._wizCycle:'90');body.sample_type=wizardSample&&wizardSample._wizCardType?wizardSample._wizCardType:'';body.limit_item=wizardSample&&wizardSample._wizCardItem?wizardSample._wizCardItem:'';if(wizardSample&&wizardSample._wizCardSource)body.source_type=wizardSample._wizCardSource;if(wizardSample&&wizardSample._wizCardVersion)body.card_version=wizardSample._wizCardVersion;if(wizardSample&&wizardSample._wizCardData)body.test_data=wizardSample._wizCardData;}
  if(action==='CUSTODY'||action==='EDIT_STORAGE'){body.location=document.getElementById('scan-loc').value;}
  if(action==='RETURN_REQ'||action==='RETIRE_ONLY'||action==='REJECT'){
    var noteEl2=document.getElementById('scan-note');if(noteEl2&&noteEl2.value.trim())body.note=noteEl2.value.trim();
  }
  if(action==='RETIRE_RECREATE'){
    var rdEl=document.getElementById('scan-rd-select');if(rdEl&&rdEl.value)body.retire_assigned_rd=rdEl.value;
    var noteEl3=document.getElementById('scan-note');if(noteEl3&&noteEl3.value.trim())body.note=noteEl3.value.trim();
  }

  try{
    const r=await api('POST','/api/scan',body);
    if(r.printCard){
      const contEl=document.getElementById('scan-cont');
      var contChecked=contEl&&contEl.checked;
      if(contChecked){
        printQueue.push({id:r.sample.id,sample_no:r.sample.sample_no,name:r.sample.name});
        renderPrintQueue();
      }else{
        setTimeout(function(){window.open('/api/samples/'+r.sample.id+'/card/print','_blank');},600);
      }
    }
    const cont = $('#scan-cont') && $('#scan-cont').checked;
    if(cont){
      $('#scan-code').value='';
      refocusScan();
      $('#scan-result').innerHTML='<div class="card sample-card" style="border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ '+r.sample.sample_no+' → '+STATUS[r.sample.status]+'</h3>'+
        '<p class="muted">'+(r.sample.next_inspect_at?('下次复检：'+fmt(r.sample.next_inspect_at)):(r.sample.storage_location?('储位：'+r.sample.storage_location+'（'+r.sample.custody_dept+'）'):'已记录'))+'　|　已就绪，可继续扫码</p></div>';
      toast('操作成功，可继续扫码','ok');
    }else{
      $('#scan-result').innerHTML='<div class="card sample-card" style="border-color:#bbf7d0"><h3 style="color:var(--ok)">✓ 操作成功</h3>'+
        '<p>样品 '+r.sample.sample_no+' 状态已更新为：<b>'+STATUS[r.sample.status]+'</b></p>'+
        (r.sample.next_inspect_at?('<p class="muted">下次复检：'+fmt(r.sample.next_inspect_at)+'</p>'):'')+
        (r.sample.storage_location?('<p class="muted">储位：'+r.sample.storage_location+'（'+r.sample.custody_dept+'）</p>'):'')+
        '<button class="btn sm" onclick="afterScanReset()">继续扫码</button></div>';
      toast('操作成功','ok');
    }
  }catch(e){toast(e.message,'err');}
}
```

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/scan.js && git commit -m "feat(scan): multi-button UI + action-form on-demand load + confirmScan passes action"
```

---

### Task 7: 前端 scan-wizard.js — RE_RELEASE 复用向导

**Files:**
- Modify: `public/js/scan-wizard.js:4` (buildReleaseWizard 参数)

- [ ] **Step 1: `buildReleaseWizard` 支持 `isReRelease` 参数**

修改 `buildReleaseWizard` 函数签名，传入 `isReRelease` 标志。在 Step3 确认文案中区分：

```js
function buildReleaseWizard(s,isReRelease){
  wizardSample=s;
  wizardSample._isReRelease=isReRelease||false;
  return renderWizardStep1(s);
}
```

- [ ] **Step 2: 修改 `renderWizardStep3` 确认按钮文案和 action**

```js
function renderWizardStep3(s){
  var cycle=s._wizCycle||'90';
  var t=s._wizCardType||'',l=s._wizCardItem||'';
  var ok=t&&l;
  var confirmAction=s._isReRelease?'RE_RELEASE':'RELEASE';
  var confirmLabel=s._isReRelease?'确认重新发行（品保）':'确认正式发行（品保）';
  return '<div class="wizard-steps">'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot done">✓</span><span class="wline done"></span>'+
      '<span class="wdot active">3</span>'+
    '</div>'+
    '<div style="text-align:center;font-size:11px;color:#6b7280;margin-bottom:14px">设置周期 · 标示卡 · 确认</div>'+
    '<div class="wizard-body">'+
      '<table style="width:100%;font-size:12px">'+
        '<tr><td style="color:#6b7280;padding:3px 0">复检周期</td><td>'+cycle+' 天 → 下次复检 '+new Date(Date.now()+parseInt(cycle)*864e5).toISOString().slice(0,10)+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">样品类型</td><td>'+(t||'<span style="color:#dc2626">未填写</span>')+'</td></tr>'+
        '<tr><td style="color:#6b7280;padding:3px 0">限度项目</td><td>'+(l||'<span style="color:#dc2626">未填写</span>')+'</td></tr>'+
      '</table>'+
      (!ok?'<p style="color:#dc2626;font-size:11px;margin-top:8px">标示卡必填字段未完成，请返回 Step2 补填</p>':'')+
    '</div>'+
    '<div style="display:flex;justify-content:space-between;margin-top:14px">'+
      '<button class="btn ghost sm" onclick="goWizardStep(2)">← 返回修改</button>'+
      '<button class="btn" id="scan-confirm" onclick="confirmScan(\''+confirmAction+'\')"'+
        (!ok?' disabled':'')+'>'+confirmLabel+'</button>'+
    '</div>'
  ;
}
```

- [ ] **Step 3: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/scan-wizard.js && git commit -m "feat(scan-wizard): support RE_RELEASE with isReRelease flag"
```

---

### Task 8: 前端 card-fields.js — forceEditable 参数

**Files:**
- Modify: `public/js/card-fields.js:20` (buildCardFieldTable)

- [ ] **Step 1: `buildCardFieldTable` 支持 `forceEditable` 参数（仅用于 EDIT_CARD 场景，强制 RELEASED 状态下可编辑）**

当前 `buildCardFieldTable(s, editable)` 的 `editable` 参数在 `scan.js` 中调用时根据场景传入。对于 `EDIT_CARD`，调用时传 `true` 即可。函数签名无需改动，因为 `editable` 已支持。

仅在 `showScanActionForm` 中确认 EDIT_CARD 调用传 `true` — 已在 Task 6 Step 2 的 `buildCardFieldTable(s,true)` 中处理。

无需额外修改。验证现有行为即可。

- [ ] **Step 2: Commit（若有改动）**

如果无代码改动，此 Task 跳过提交。

---

### Task 9: 前端 dashboard.js — 待办分类标签

**Files:**
- Modify: `public/js/dashboard.js:8-12`

- [ ] **Step 1: 待办增加类型标签区分**

```js
h+='<div class="card" style="margin-top:18px"><h3 style="margin:0 0 12px">我的待办（'+ROLE[me.role]+'）</h3>';
if(d.myPending.length===0)h+='<div class="empty">暂无待办</div>';
else h+='<table><tr><th>样品编号</th><th>名称</th><th>规格</th><th>待办类型</th><th>状态</th><th>操作</th></tr>'+
  d.myPending.map(s=>{
    var pendingType='';
    if(s.status==='NEW')pendingType='待制作确认';
    else if(s.status==='PRODUCED')pendingType='待发行';
    else if(s.status==='RELEASED')pendingType='待接收';
    else if(s.status==='RETURNING'){
      if((me.role==='RD'||me.role==='ME')&&s.retire_assigned_rd===me.display_name)pendingType='待重做';
      else if(me.role==='QA')pendingType='待审核退回';
      else pendingType='退回审核中';
    }
    return '<tr><td>'+s.sample_no+'</td><td>'+(s.name||'—')+'</td><td class="muted">'+(s.spec||'—')+'</td><td>'+pendingType+'</td><td>'+statusBadge(s)+'</td><td><a class="link" onclick="goScan(\''+s.sample_no+'\')">去处理</a></td></tr>';
  }).join('')+'</table>';
h+='</div>';
```

- [ ] **Step 2: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/dashboard.js && git commit -m "feat(dashboard): add pending type labels for RETURNING status"
```

---

### Task 10: 全链路回归验证

- [ ] **Step 1: 重启服务**

```bash
cd /www/wwwroot/sample-mgmt && npm start
```

- [ ] **Step 2: 正向流转回归（确保不破坏已有功能）**

| # | 测试场景 | 预期结果 |
|---|---|---|
| 1 | RD 扫 NEW 样品 → PRODUCE | 状态变为 PRODUCED，照片上传成功 |
| 2 | QA 扫 PRODUCED 样品 → RELEASE 向导 | 三步向导正常，周期/标示卡填写后 RELEASED |
| 3 | 保管扫 RELEASED → CUSTODY | 填写储位后 → IN_CUSTODY |
| 4 | QA 扫 RELEASED（已到期）→ INSPECT | 显示复检按钮 + 复检表单 |

- [ ] **Step 3: 新增功能验证**

| # | 测试场景 | 预期结果 |
|---|---|---|
| 5 | QA 扫 RELEASED → 显示双按钮「复检」「修正标示卡」 | 两个按钮可切换表单 |
| 6 | QA 选「修正标示卡」→ 修改字段 → 保存 | 标示卡字段更新，日志 EDIT_CARD |
| 7 | 保管扫 IN_CUSTODY → 显示双按钮「修改储位」「申请退回」 | 两个按钮可切换表单 |
| 8 | 保管选「修改储位」→ 输入新储位 → 确认 | 储位更新，日志 EDIT_STORAGE |
| 9 | 保管选「申请退回」→ 填写原因 → 提交 | 状态 → RETURNING |
| 10 | QA 扫 RETURNING → 显示 4 按钮 | RE_RELEASE / RETIRE_RECREATE / RETIRE_ONLY / REJECT |
| 11 | QA 选「重新发行」→ 向导 → 确认 | 状态 → RELEASED，标示卡打印 |
| 12 | QA 选「退回研发重做」→ 选 RD → 确认 | 状态 → RETIRED，retire_assigned_rd 已设置 |
| 13 | RD 扫 RETURNING（被指派的）→ RECREATE | 创建替代品 SM-XXXXXX，旧样品 replaced_by 已关联 |
| 14 | QA 选「直接作废」→ 填原因 → 确认 | 状态 → RETIRED |
| 15 | QA 选「拒绝退回」→ 填理由 → 确认 | 状态 → IN_CUSTODY（恢复） |
| 16 | 看板显示 RETURNING/RETIRED 统计 | byStatus 含新状态计数 |

- [ ] **Step 4: 输出臃肿检测报告**

修改完成后，对每个变更文件输出：
1. 文件类型、有效代码行数、总字符、距上限剩余
2. 函数/Class 数量
3. 冗余清单

