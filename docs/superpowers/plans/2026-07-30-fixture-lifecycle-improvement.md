# 治具管理生命周期完善 — 实现计划

> **For agentic workers:** 使用 Subagent-Driven（推荐）或 Inline 逐 Task 执行。步骤均用 `- [ ]` 语法跟踪。

**Goal:** 完善治具生命周期：RD接收+预计完成日、直接归还、撤销申请、升级优化（含IATF 16949版次控制）、验证方改为申请单位

**Architecture:** 新增 ACCEPTED/IMPROVING 两个状态（12态），新增 5 个 Action handler，VERIFY_ME_OK 重命名为 VERIFY_ORG_OK（兼容过渡），验证时校验 dept 匹配

**Tech Stack:** Node.js + Express + MariaDB + 原生 HTML/CSS/JS

---

### Task 1: 数据库迁移 — 新增字段 + ACCEPTED/IMPROVING 状态

**Files:**
- Modify: `db.js` — ALTER TABLE fixtures ADD 5 列
- Modify: `db/fixtures.js` — updateFixture SQL 追加新列

- [ ] **Step 1: 在 db.js init() 末尾追加 ALTER TABLE**

在 `init()` 函数的 fixtures 建表后追加迁移 SQL（MariaDB 用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` 不支持，改用 try-catch）：

```js
// 生命周期完善迁移（2026-07-30）
async function migrateFixtureLifecycle() {
  const adds = [
    'ADD COLUMN expected_finish_at DATETIME',
    'ADD COLUMN improve_note TEXT',
    'ADD COLUMN improvement_count INT DEFAULT 0',
    'ADD COLUMN improved_by INT',
    'ADD COLUMN improved_at DATETIME'
  ];
  for (const col of adds) {
    try { await pool.execute('ALTER TABLE fixtures ' + col); }
    catch (e) { if (e.code !== 'ER_DUP_FIELDNAME') throw e; }
  }
}
await migrateFixtureLifecycle();
```

- [ ] **Step 2: 更新 db/fixtures.js 的 updateFixture SQL**

在现有 `updateFixture` 的 UPDATE 语句中追加 `improvement_count`、`expected_finish_at`、`improve_note`、`improved_by`、`improved_at` 5 列：

```js
async function updateFixture(updated) {
  await dbRef.run(`UPDATE fixtures SET name=?,spec=?,model=?,station=?,category=?,status=?,requested_by=?,requested_dept=?,
    request_note=?,request_image=?,made_by=?,made_at=?,made_note=?,made_image=?,
    verified_rd=?,verified_rd_at=?,verified_me=?,verified_me_at=?,transferred_at=?,verify_note=?,
    used_by=?,used_at=?,use_location=?,expected_return_days=?,expected_return_at=?,use_note=?,
    repair_type=?,repair_requested_by=?,repair_requested_at=?,repair_note=?,repaired_by=?,repaired_at=?,
    repair_done_image=?,repair_confirmed_by=?,repair_confirmed_at=?,retired_by=?,retired_at=?,retired_reason=?,
    expected_finish_at=?,improve_note=?,improvement_count=?,improved_by=?,improved_at=?,
    notes=?,updated_at=NOW() WHERE id=?`,
    [updated.name||null,updated.spec||null,updated.model||null,updated.station||null,updated.category||null,
     updated.status||'REQUESTED',updated.requested_by||null,updated.requested_dept||null,
     updated.request_note||null,updated.request_image||null,updated.made_by||null,toDT(updated.made_at),updated.made_note||null,updated.made_image||null,
     updated.verified_rd||null,toDT(updated.verified_rd_at),updated.verified_me||null,toDT(updated.verified_me_at),toDT(updated.transferred_at),updated.verify_note||null,
     updated.used_by||null,toDT(updated.used_at),updated.use_location||null,updated.expected_return_days||null,toDT(updated.expected_return_at),updated.use_note||null,
     updated.repair_type||null,updated.repair_requested_by||null,toDT(updated.repair_requested_at),updated.repair_note||null,updated.repaired_by||null,toDT(updated.repaired_at),
     updated.repair_done_image||null,updated.repair_confirmed_by||null,toDT(updated.repair_confirmed_at),updated.retired_by||null,toDT(updated.retired_at),updated.retired_reason||null,
     toDT(updated.expected_finish_at),updated.improve_note||null,updated.improvement_count||0,updated.improved_by||null,toDT(updated.improved_at),
     updated.notes||null,updated.id]);
  persist();
  return await getFixtureById(updated.id);
}
```

- [ ] **Step 3: 验证数据库迁移**

```bash
node -e "require('dotenv').config();const D=require('./db');D.init().then(()=>{console.log('OK');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
```

Expected: `OK`（重复运行不报错）

---

### Task 2: 后端 — 状态机扩展 + dept 校验

**Files:**
- Modify: `routes/fixtures.js` — 全量修改

- [ ] **Step 1: 更新 STATUS_LABEL 和 allowedActions**

```js
const STATUS_LABEL = {
  REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待双人验证',
  VERIFY_RD_OK: 'RD已确认(待申请单位)', VERIFY_ORG_OK: '申请单位已确认(待RD)',
  TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
  REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成(待确认)', RETIRED: '已报废'
};

function isVerifyOrg(user, fixture) {
  // 申请单位验证：dept 必须匹配 requested_dept（RD 不限制）
  return user.role === 'RD' || user.dept === fixture.requested_dept;
}

function allowedActions(role, status, fixture, userId) {
  var actions = [];
  if (role === 'RD' && status === 'REQUESTED') actions.push('ACCEPT');
  // 申请人本人可撤销
  if (status === 'REQUESTED' && fixture.requested_by === userId) actions.push('CANCEL');
  if (role === 'RD' && status === 'ACCEPTED') actions.push('MAKE');
  if (role === 'RD' && (status === 'VERIFY_PENDING' || status === 'VERIFY_ORG_OK')) actions.push('VERIFY_RD');
  if (isMECustodyQA(role) && (status === 'VERIFY_PENDING' || status === 'VERIFY_RD_OK')) actions.push('VERIFY_ORG');
  if (isMECustodyQA(role) && status === 'TRANSFERRED') actions.push('USE');
  // 任何人可申请改善
  if (status === 'TRANSFERRED') actions.push('IMPROVE');
  if (isMECustodyQA(role) && status === 'IN_USE') { actions.push('RETURN'); actions.push('REPAIR_ME'); actions.push('REPAIR_RD_REQ'); }
  if (isMECustodyQA(role) && status === 'REPAIRING_ME') actions.push('REPAIR_DONE');
  if (role === 'RD' && status === 'REPAIRING_RD') actions.push('REPAIR_RD_DONE');
  if (isMECustodyQA(role) && status === 'REPAIR_DONE') actions.push('REPAIR_CONFIRM');
  if (role === 'ADMIN' && ['IN_USE','TRANSFERRED','IMPROVING','ACCEPTED','VERIFY_PENDING'].indexOf(status) !== -1) actions.push('RETIRE');
  return actions;
}
```

- [ ] **Step 2: 修改 doVerifyME → doVerifyOrg（含 dept 校验）**

```js
async function doVerifyOrg(updated, u, ts, f, note) {
  // 非 RD 角色需校验 dept
  if (u.role !== 'RD' && u.dept !== f.requested_dept) {
    throw new Error('验证需要 RD 与 申请单位（' + f.requested_dept + '）共同完成');
  }
  updated.verified_me = u.id; updated.verified_me_at = ts; updated.verify_note = note || '';
  var oldMeVal = f.status;
  updated.status = f.status === 'VERIFY_RD_OK' ? 'TRANSFERRED' : 'VERIFY_ORG_OK';
  if (updated.status === 'TRANSFERRED') {
    updated.transferred_at = ts;
    // 分配储位（验证时填写）
    if (note && note.indexOf('储位:') !== -1) {
      var sl = note.split('储位:')[1]; if (sl) updated.storage_location = sl.trim();
    }
  }
  await D.addFixtureLog({ fixture_id: f.id, action: 'VERIFY_ORG', role: u.role, user_id: u.id, dept: u.dept,
    note: updated.status === 'TRANSFERRED' ? '双人验证完成，已移交' : '申请单位验证通过，待RD验证' });
  return updated;
}
```

- [ ] **Step 3: 新增 5 个 Action handler**

```js
async function doAccept(updated, u, ts, f, note, expectedDays) {
  if (!expectedDays || expectedDays <= 0) throw new Error('请填写预计完成天数');
  var ed = new Date(ts); ed.setDate(ed.getDate() + expectedDays);
  updated.expected_finish_at = ed.toISOString();
  updated.status = 'ACCEPTED';
  await D.addFixtureLog({ fixture_id: f.id, action: 'ACCEPT', role: u.role, user_id: u.id, dept: u.dept,
    note: 'RD已接收，预计' + expectedDays + '天后完成' });
  return updated;
}

async function doCancel(updated, u, ts, f, note) {
  if (f.requested_by !== u.id) throw new Error('仅申请人可撤销自己的申请');
  updated.status = 'RETIRED'; updated.retired_reason = note || '申请人撤销';
  await D.addFixtureLog({ fixture_id: f.id, action: 'CANCEL', role: u.role, user_id: u.id, dept: u.dept,
    note: note || '申请人撤销申请' });
  return updated;
}

async function doReturn(updated, u, ts, f, note) {
  updated.status = 'TRANSFERRED';
  updated.expected_return_days = null; updated.expected_return_at = null;
  await D.addFixtureLog({ fixture_id: f.id, action: 'RETURN', role: u.role, user_id: u.id, dept: u.dept,
    note: note || '使用完毕归还' });
  return updated;
}

async function doImprove(updated, u, ts, f, note) {
  if (!note || !note.trim()) throw new Error('请填写改善说明');
  updated.improve_note = note.trim(); updated.status = 'IMPROVING';
  await D.addFixtureLog({ fixture_id: f.id, action: 'IMPROVE', role: u.role, user_id: u.id, dept: u.dept,
    note: note.trim() });
  return updated;
}

async function doImproveDone(updated, u, ts, f, note) {
  updated.improved_by = u.id; updated.improved_at = ts;
  updated.improvement_count = (f.improvement_count || 0) + 1;
  updated.status = 'VERIFY_PENDING';
  await D.addFixtureLog({ fixture_id: f.id, action: 'IMPROVE_DONE', role: u.role, user_id: u.id, dept: u.dept,
    note: note || ('改善完成，版次 V' + updated.improvement_count) });
  return updated;
}
```

- [ ] **Step 4: 修改 scan 解析和扫码路由签名**

`/api/fixtures/scan` GET endpoint — allowedActions 签名改为 `(role, status, fixture, userId)`：

```js
var actions = allowedActions(u.role, f.status, f, u.id);
```

`/api/fixtures/scan` POST endpoint — 签名同样改为 `allowedActions(u.role, f.status, f, u.id)`；新增 expectedDays 参数解析；追加 ACCEPT 需要天数校验：

```js
var actions = allowedActions(u.role, f.status, f, u.id);
// 参数校验追加 ACCEPT
if (chosenAction === 'ACCEPT') {
  var ed = Number(req.body.expectedDays || days);
  if (!ed || ed <= 0) return res.status(400).json({ error: '请填写预计完成天数' });
}
// Action 分发追加
else if (chosenAction === 'ACCEPT')       updated = await doAccept(updated, u, ts, f, note, Number(req.body.expectedDays || days));
else if (chosenAction === 'CANCEL')       updated = await doCancel(updated, u, ts, f, note);
else if (chosenAction === 'RETURN')       updated = await doReturn(updated, u, ts, f, note);
else if (chosenAction === 'IMPROVE')      updated = await doImprove(updated, u, ts, f, note);
else if (chosenAction === 'IMPROVE_DONE') updated = await doImproveDone(updated, u, ts, f, note);
```

并修改后续分发中 `VERIFY_ME` → `VERIFY_ORG`，调用 `doVerifyOrg`。

- [ ] **Step 5: 修改看板 myPending 逻辑**

```js
var myPending = all.filter(function(f) {
  if (u.role === 'RD') return ['REQUESTED','ACCEPTED','VERIFY_PENDING','VERIFY_ORG_OK','REPAIRING_RD','IMPROVING'].indexOf(f.status) !== -1;
  if (isMECustodyQA(u.role)) return ['VERIFY_PENDING','VERIFY_RD_OK','TRANSFERRED','REPAIRING_ME','REPAIR_DONE','IN_USE'].indexOf(f.status) !== -1;
  if (u.role === 'ADMIN') return f.status !== 'RETIRED';
  return f.requested_by === u.id;
});
```

- [ ] **Step 6: 修改详情接口用户姓名解析（追加 improved_by、requested_by）**

在 `GET /api/fixtures/:id` 中追加：

```js
var userIds = [f.requested_by, f.made_by, f.verified_rd, f.verified_me, f.used_by,
  f.repair_requested_by, f.repaired_by, f.repair_confirmed_by, f.retired_by, f.improved_by].filter(Boolean);
// ... userMap ...
f.requested_by_name = userMap[f.requested_by] || null;
f.improved_by_name = userMap[f.improved_by] || null;
```

- [ ] **Step 7: 验证路由语法**

```bash
node -c routes/fixtures.js
```

Expected: 无输出（语法正确）

---

### Task 3: 前端 — 常量 + 版次 + 新状态

**Files:**
- Modify: `public/js/fixture-api.js`

- [ ] **Step 1: 更新 STATUS 和 STATUS_LABEL（前端用 STATUS 字典）**

```js
const STATUS = {
  REQUESTED: '已申请', ACCEPTED: '已接收', VERIFY_PENDING: '待双人验证',
  VERIFY_RD_OK: 'RD已确认', VERIFY_ORG_OK: '申请单位已确认',
  TRANSFERRED: '已移交', IN_USE: '领用中', IMPROVING: '改善中',
  REPAIRING_ME: 'ME维修中', REPAIRING_RD: 'RD维修中', REPAIR_DONE: '维修完成', RETIRED: '已报废'
};
```

- [ ] **Step 2: 新增版次显示工具函数 `fixtureVersion(f)`**

```js
function fixtureVersion(f) {
  if (!f.improvement_count || f.improvement_count <= 0) return '';
  return '-V' + f.improvement_count;
}
function fixtureNoVersion(f) {
  return (f.fixture_no || '') + fixtureVersion(f);
}
```

- [ ] **Step 3: 更新 ACTION_CN 字典（追加新 action）**

```js
const ACTION_CN = {
  CREATE: '新建申请', ACCEPT: 'RD接收', MAKE: '制作完成', MAKE_DONE: '进入双人验证',
  CANCEL: '撤销申请',
  VERIFY_RD: 'RD验证', VERIFY_ORG: '申请单位验证', VERIFY_ME: '申请单位验证',
  USE: '领用', RETURN: '归还',
  IMPROVE: '申请改善', IMPROVE_DONE: '改善完成',
  REPAIR_ME: 'ME自行维修', REPAIR_RD_REQ: '退回RD维修',
  REPAIR_DONE: 'ME维修完成', REPAIR_RD_DONE: 'RD维修完成',
  REPAIR_CONFIRM: 'ME确认维修', RETIRE: '报废'
};
```

---

### Task 4: 前端 — 扫码台

**Files:**
- Modify: `public/js/fixture-scan.js`

- [ ] **Step 1: 更新 labelMap（追加新操作按钮文本）**

```js
var labelMap = {
  ACCEPT: '接收治具', MAKE: '制作完成', CANCEL: '撤销申请',
  VERIFY_RD: 'RD验证确认', VERIFY_ORG: '申请单位验证',
  USE: '领用', RETURN: '归还',
  IMPROVE: '申请改善', IMPROVE_DONE: '改善完成',
  REPAIR_ME: '自行维修', REPAIR_RD_REQ: '退回RD维修',
  REPAIR_DONE: '维修完成', REPAIR_RD_DONE: 'RD维修完成',
  REPAIR_CONFIRM: '确认维修', RETIRE: '报废'
};
```

- [ ] **Step 2: 更新 execFixAction 表单逻辑**

追加 ACCEPT、IMPROVE 和 RETURN 的表单：

```js
function execFixAction(fixtureNo, action) {
  var formHtml = '';
  if (action === 'ACCEPT') {
    formHtml += '<label>预计完成天数<span style="color:var(--bad)">*</span></label><input id="fx-days" type="number" min="1" value="7" />';
    formHtml += '<label>备注说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'IMPROVE') {
    formHtml += '<label>改善说明<span style="color:var(--bad)">*</span></label><textarea id="fx-note" rows="2" placeholder="请填写改善内容"></textarea>';
  }
  if (action === 'IMPROVE_DONE') {
    formHtml += '<label>改善结果说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (action === 'RETURN') {
    formHtml += '<label>归还说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (['USE'].includes(action)) {
    formHtml += '<label>使用位置<span style="color:var(--bad)">*</span></label><input id="fx-location" placeholder="生产线/工位" />';
    formHtml += '<label>预计使用天数<span style="color:var(--bad)">*</span></label><input id="fx-days" type="number" min="1" value="30" placeholder="如 30" />';
  }
  if (['MAKE', 'REPAIR_DONE', 'REPAIR_RD_DONE'].includes(action)) {
    formHtml += '<label>备注说明</label><textarea id="fx-note" rows="2" placeholder="选填"></textarea>';
  }
  if (['REPAIR_ME', 'REPAIR_RD_REQ', 'REPAIR_CONFIRM', 'RETIRE'].includes(action)) {
    formHtml += '<label>说明<span style="color:var(--bad)">*</span></label><textarea id="fx-note" rows="2" placeholder="请填写说明"></textarea>';
  }
  if (['VERIFY_RD', 'VERIFY_ORG'].includes(action)) {
    formHtml += '<label>验证备注</label><textarea id="fx-note" rows="2" placeholder="选填（储位请写：储位:xxx）"></textarea>';
  }
  formHtml += '<button class="btn" style="margin-top:8px" onclick="submitFixAction(\'' + fixtureNo + '\',\'' + action + '\')">确认执行</button>';
  document.getElementById('fix-action-form').innerHTML = formHtml;
}
```

- [ ] **Step 3: 更新 submitFixAction 传递 expectedDays**

在 ACCEPT 时传 expectedDays：

```js
async function submitFixAction(fixtureNo, action) {
  var body = { code: fixtureNo, action: action };
  var locEl = document.getElementById('fx-location');
  var daysEl = document.getElementById('fx-days');
  var noteEl = document.getElementById('fx-note');
  if (locEl) body.location = locEl.value;
  if (daysEl) body.expectedDays = Number(daysEl.value);
  if (noteEl) body.note = noteEl.value;
  // ... rest unchanged
}
```

- [ ] **Step 4: 更新结果卡片显示版次**

```js
document.getElementById('scan-result').innerHTML = '<div class="sample-card" style="margin-top:12px"><h3>' + fixtureNoVersion(r.fixture) + ' ' + (r.fixture.name || '—') + '</h3><p>操作：' + (ACTION_CN[action] || action) + ' | 当前状态：' + statusBadge(r.fixture) + '</p></div>';
```

- [ ] **Step 5: 更新 showFixActions 显示版次和预计完成日**

```js
function showFixActions(result) {
  var f = result.fixture, actions = result.allowedActions;
  var html = '<div class="sample-card" style="margin-top:12px">';
  html += '<h3>' + fixtureNoVersion(f) + ' ' + (f.name || '—') + '</h3>';
  html += '<p>状态：' + statusBadge(f);
  if (f.spec) html += ' | 规格：' + f.spec;
  if (f.station) html += ' | 工站：' + f.station;
  if (f.expected_return_at) html += ' | 预计归还：' + fmt(f.expected_return_at);
  if (f.expected_finish_at) html += ' | RD预计完成：' + fmt(f.expected_finish_at);
  html += '</p>';
  if (f.request_note) html += '<p style="color:var(--muted)">说明：' + f.request_note + '</p>';
  if (f.improve_note) html += '<p style="color:var(--muted)">改善：' + f.improve_note + '</p>';
  html += '</div>';
  // ... rest unchanged
}
```

---

### Task 5: 前端 — 清单 + 详情弹窗

**Files:**
- Modify: `public/js/fixture-list.js`

- [ ] **Step 1: 清单表格显示版次 + 预计完成日**

修改 `renderFixtureList` 中的表格行：

```js
fixtures.forEach(function (f) {
  var cls = isOverdue(f) ? ' class="overdue-row"' : '';
  html += '<tr' + cls + ' style="cursor:pointer" onclick="showFixtureDetail(' + f.id + ')"><td><b>' + fixtureNoVersion(f) + '</b></td><td>' + (f.name || '—') + '</td><td>' + (f.spec || '—') + '</td><td>' + (f.requested_dept || '—') + '</td><td>' + statusBadge(f) + '</td><td><small>' + fmt(f.updated_at) + '</small></td></tr>';
});
```

- [ ] **Step 2: 详情弹窗追加 ACCEPTED/IMPROVING 字段 + 版次 + 预计完成日**

在 `showFixtureDetail` 中追加：

```js
html += '<dt style="color:var(--muted)">申请部门</dt><dd>' + (f.requested_dept || '—') + '</dd>';
if (f.requested_by) html += '<dt style="color:var(--muted)">申请人</dt><dd>' + (f.requested_by_name || 'ID:' + f.requested_by) + '</dd>';
html += '<dt style="color:var(--muted)">申请说明</dt><dd>' + (f.request_note || '—') + '</dd>';
if (f.expected_finish_at) html += '<dt style="color:var(--muted)">预计完成</dt><dd>' + fmt(f.expected_finish_at) + '</dd>';
if (f.made_by) html += '<dt style="color:var(--muted)">制作人</dt><dd>' + (f.made_by_name || 'ID:' + f.made_by) + ' | ' + fmt(f.made_at) + '</dd>';
if (f.verified_rd) html += '<dt style="color:var(--muted)">RD验证</dt><dd>' + (f.verified_rd_name || 'ID:' + f.verified_rd) + ' | ' + fmt(f.verified_rd_at) + '</dd>';
if (f.verified_me) html += '<dt style="color:var(--muted)">申请单位验证</dt><dd>' + (f.verified_me_name || 'ID:' + f.verified_me) + ' | ' + fmt(f.verified_me_at) + '</dd>';
// ... after repair section ...
if (f.improvement_count > 0) html += '<dt style="color:var(--muted)">改善版次</dt><dd>V' + f.improvement_count + '</dd>';
if (f.improve_note) html += '<dt style="color:var(--muted)">改善说明</dt><dd>' + f.improve_note + '</dd>';
if (f.improved_by) html += '<dt style="color:var(--muted)">改善人</dt><dd>' + (f.improved_by_name || 'ID:' + f.improved_by) + ' | ' + fmt(f.improved_at) + '</dd>';
```

- [ ] **Step 3: 详情弹窗标题显示版次**

```js
html += '<h3 style="margin:0 0 16px">' + fixtureNoVersion(f) + ' ' + (f.name || '—') + '</h3>';
```

---

### Task 6: 前端 — 看板

**Files:**
- Modify: `public/js/fixture-dashboard.js`

- [ ] **Step 1: 看板统计追加 ACCEPTED + IMPROVING**

```js
html += '<div class="stat"><b>' + (s.ACCEPTED || 0) + '</b><span>已接收</span></div>';
html += '<div class="stat"><b>' + (s.IMPROVING || 0) + '</b><span>改善中</span></div>';
```

- [ ] **Step 2: 待办卡片中显示版次 + 预计完成日**

```js
d.myPending.forEach(function (f) {
  var extra = '';
  if (f.expected_finish_at) extra += '<br><small>预计完成：' + fmt(f.expected_finish_at) + '</small>';
  html += '<div class="sample-card"><b>' + fixtureNoVersion(f) + '</b> <span class="badge">' + (STATUS[f.status] || f.status) + '</span><br>' + (f.name || '—') + extra + '</div>';
});
```

---

### Task 7: 前端 — fixture.html CSS 新状态徽章

**Files:**
- Modify: `public/fixture.html`

- [ ] **Step 1: 在 `<style>` 中追加 ACCEPTED + IMPROVING 徽章样式**

```css
.b-ACCEPTED{background:#dbeafe;color:#1d4ed8}.b-IMPROVING{background:#fef3c7;color:#92400e}.b-VERIFY_ORG_OK{background:#fce7f3;color:#9d174d}
```

---

### Task 8: 前端 — portal.html 卡片状态（无变化，确认兼容）

**Files:**
- 无需修改 — portal.html 不涉及状态机

- [ ] **Step 1: 确认 portal.html 卡片链接仍指向 fixture.html**

```bash
grep -n 'fixture.html' public/portal.html
```

Expected: `<a href="/fixture.html" class="card">` 存在

---

### Task 9: 端到端回归测试

**Files:**
- 运行: `test_flow.js`（如存在 fixture 相关测试），否则手动 E2E

- [ ] **Step 1: 重启服务加载新代码**

```bash
node -e "require('dotenv').config();const D=require('./db');D.init().then(()=>{console.log('DB OK');process.exit(0)}).catch(e=>{console.error(e);process.exit(1)})"
```

- [ ] **Step 2: E2E 手动验证清单**

| # | 场景 | 预期结果 |
|---|---|---|
| 1 | me01 新建申请治具 | 成功，状态：已申请 |
| 2 | rd01 扫码接收 | 显示预计完成天数输入，状态→已接收 |
| 3 | me01 查看清单 | 显示「已接收」+ 预计完成日 |
| 4 | rd01 扫码制作 | 状态→待双人验证 |
| 5 | rd01 扫码验证 | 状态→RD已确认 |
| 6 | me01 扫码验证（dept匹配） | 状态→已移交 |
| 7 | fqc01 扫码验证（dept不匹配） | 拒绝：“验证需要 RD 与 申请单位（生技部）共同完成” |
| 8 | me01 扫码领用 | 填写位置+天数，状态→领用中 |
| 9 | me01 扫码归还 | 状态→已移交 |
| 10 | me01 扫码申请改善 | 填写改善说明，状态→改善中 |
| 11 | rd01 扫码改善完成 | 版次+1，状态→待双人验证 |
| 12 | 改善后验证通过 | 清单显示 FJ-XXXXXX-V1 |
| 13 | me01 撤销自己的申请 | 状态→已报废 |
| 14 | fqc01 撤销他人的申请 | 拒绝：“仅申请人可撤销” |
| 15 | admin 报废任何非终态治具 | 成功 |

---
