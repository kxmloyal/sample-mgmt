# 门户入口卡片个性化排列 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为门户页（portal.html）添加用户级卡片个性化排列：编辑模式拖拽排序 + 手动保存，偏好按用户持久化到独立表 `user_portal_prefs`。

**Architecture:** 框架级功能，不绑定任一子系统。新增框架级表 `user_portal_prefs`（user_id + portal_order JSON），`db/portal-prefs.js` DAO 读写；`routes/misc.js` 新增 GET/PUT `/api/portal/prefs`（requireAuth 按会话用户隔离，PUT 校验仅允许已注册子系统 id）；portal.html 前端加载时并行拉取子系统列表与偏好并合并排序（prefs 置前、未配置排尾），编辑模式用原生 HTML5 DnD 拖拽、保存/取消恢复浏览态。

**Tech Stack:** Node.js + Express 4（CommonJS）、MariaDB（mysql2）、原生 HTML/CSS/JS、HTML5 Drag & Drop、jest + supertest（TDD）、browser_use（E2E）。

**Spec:** `docs/superpowers/specs/2026-08-06-portal-card-order-design.md`

---

### Task 1: 后端 —— 建表 + DAO + GET/PUT API（TDD）

**Files:**
- Modify: `db.js`（init() 中追加建表、实例化并导出 portalPrefs DAO）
- Create: `db/portal-prefs.js`
- Modify: `routes/misc.js`（register 内追加 2 个端点）
- Test: `tests/portal-prefs.test.js`

- [ ] **Step 1: 写失败测试 `tests/portal-prefs.test.js`**

```js
// tests/portal-prefs.test.js — 门户卡片排序偏好 API（框架级，不受子系统上线保护限制）
const request = require('supertest');
const { getApp, login } = require('./helpers/setup');

describe('GET/PUT /api/portal/prefs — 门户卡片排序偏好', () => {
  beforeAll(async () => { await getApp(); }, 30000);

  it('未登录 GET 返回 401', async () => {
    const res = await request(await getApp()).get('/api/portal/prefs');
    expect(res.status).toBe(401);
  });

  it('未登录 PUT 返回 401', async () => {
    const res = await request(await getApp()).put('/api/portal/prefs').send({ order: ['samples'] });
    expect(res.status).toBe(401);
  });

  it('GET 无记录返回空数组', async () => {
    const { agent } = await login('rd01', 'rd123');
    const res = await agent.get('/api/portal/prefs');
    expect(res.status).toBe(200);
    expect(res.body.order).toEqual([]);
  });

  it('PUT 保存后 GET 返回一致顺序', async () => {
    const { agent } = await login('rd01', 'rd123');
    const order = ['workbench', 'fixtures', 'samples', 'projects'];
    const put = await agent.put('/api/portal/prefs').send({ order });
    expect(put.status).toBe(200);
    expect(put.body.order).toEqual(order);
    const get = await agent.get('/api/portal/prefs');
    expect(get.body.order).toEqual(order);
  });

  it('PUT 非法 id（未注册子系统）返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/portal/prefs').send({ order: ['not-exist-subsystem'] });
    expect(res.status).toBe(400);
  });

  it('PUT 重复 id 去重（保序）', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/portal/prefs').send({ order: ['samples', 'samples', 'fixtures'] });
    expect(res.status).toBe(200);
    expect(res.body.order).toEqual(['samples', 'fixtures']);
  });

  it('PUT 空数组清除偏好', async () => {
    const { agent } = await login('rd01', 'rd123');
    await agent.put('/api/portal/prefs').send({ order: ['samples', 'fixtures'] });
    const res = await agent.put('/api/portal/prefs').send({ order: [] });
    expect(res.status).toBe(200);
    const get = await agent.get('/api/portal/prefs');
    expect(get.body.order).toEqual([]);
  });

  it('PUT order=null 清除偏好', async () => {
    const { agent } = await login('qa01', 'qa123');
    await agent.put('/api/portal/prefs').send({ order: ['samples'] });
    const res = await agent.put('/api/portal/prefs').send({ order: null });
    expect(res.status).toBe(200);
    const get = await agent.get('/api/portal/prefs');
    expect(get.body.order).toEqual([]);
  });

  it('用户 A 与用户 B 偏好隔离', async () => {
    const { agent: a } = await login('rd01', 'rd123');
    const { agent: b } = await login('qa01', 'qa123');
    await a.put('/api/portal/prefs').send({ order: ['fixtures', 'samples'] });
    await b.put('/api/portal/prefs').send({ order: ['projects'] });
    const ga = await a.get('/api/portal/prefs');
    const gb = await b.get('/api/portal/prefs');
    expect(ga.body.order).toEqual(['fixtures', 'samples']);
    expect(gb.body.order).toEqual(['projects']);
  });

  it('PUT 非数组返回 400', async () => {
    const { agent } = await login('admin', 'admin123');
    const res = await agent.put('/api/portal/prefs').send({ order: 'samples' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest tests/portal-prefs.test.js 2>&1 | tail -20`
Expected: FAIL —— `GET /api/portal/prefs` 返回 404（路由不存在），所有用例失败。

- [ ] **Step 3: 实现建表（db.js）**

在 `db.js` 的 `init()` 中，`users` 建表语句之后（第 39 行 `\`);` 之后、`// ★ 子系统 DDL 已迁移...` 注释之前）追加：

```js
    // ★ 门户卡片排序偏好表（框架级，AGENTS.md §21 门户个性化）
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS user_portal_prefs (
        user_id INT PRIMARY KEY,
        portal_order JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_portal_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
```

- [ ] **Step 4: 实现 DAO（新建 `db/portal-prefs.js`）**

```js
// db/portal-prefs.js — 门户卡片个性化排序偏好 DAO（框架级）
// 表：user_portal_prefs（user_id PK, portal_order JSON, updated_at）
module.exports = function ({ q, one, dbRef }) {

  /**
   * 获取用户门户排序偏好；无记录返回 []
   * @param {number} userId - 用户 ID
   * @returns {Promise<string[]>} 子系统 id 有序数组
   */
  async function getPortalPrefs(userId) {
    const row = await one('SELECT portal_order FROM user_portal_prefs WHERE user_id = ?', [userId]);
    if (!row || row.portal_order == null) return [];
    // MariaDB 的 JSON 列可能返回字符串或已解析对象，双兼容
    if (Array.isArray(row.portal_order)) return row.portal_order;
    if (typeof row.portal_order === 'string') {
      try { return JSON.parse(row.portal_order); } catch (e) { return []; }
    }
    return [];
  }

  /**
   * upsert 用户门户排序偏好（幂等，存在即覆盖）
   * @param {number} userId - 用户 ID
   * @param {string[]} order - 子系统 id 有序数组
   */
  async function upsertPortalPrefs(userId, order) {
    await dbRef.run(
      'INSERT INTO user_portal_prefs (user_id, portal_order) VALUES (?, ?) ' +
      'ON DUPLICATE KEY UPDATE portal_order = VALUES(portal_order)',
      [userId, JSON.stringify(order)]
    );
  }

  /** 清除用户门户排序偏好（恢复默认顺序） */
  async function deletePortalPrefs(userId) {
    await dbRef.run('DELETE FROM user_portal_prefs WHERE user_id = ?', [userId]);
  }

  return { getPortalPrefs, upsertPortalPrefs, deletePortalPrefs };
};
```

- [ ] **Step 5: 实例化并导出 DAO（db.js）**

在 `db.js` 第 96 行 `const users = require('./db/users')({ q, one, dbRef });` 之后追加：

```js
const portalPrefs = require('./db/portal-prefs')({ q, one, dbRef });
```

在 `module.exports`（第 137 行起）中追加 `...portalPrefs`：

```js
module.exports = {
  init, ready, pool: getPool, nowISO, withTransaction,
  ...users, ...portalPrefs, ...allDaoExports, ...fixtureFiles
};
```

- [ ] **Step 6: 实现 API（routes/misc.js）**

在 `routes/misc.js` 的 `// 健康检查` 端点之前（第 176 行 `// 健康检查` 上方）插入：

```js
  // 门户卡片排序偏好（框架级，用户级个性化；AGENTS.md §21）
  // GET：返回当前用户偏好；无记录返回 { order: [] }
  app.get('/api/portal/prefs', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const order = await D.getPortalPrefs(u.id);
    res.json({ order });
  });

  // PUT：保存偏好（order 为子系统 id 有序数组）；order=[] 或 null 表示清除恢复默认
  // 校验：数组、去重（保序）、仅允许已注册子系统 id（实时扫描 subsystems/）
  app.put('/api/portal/prefs', requireAuth, async (req, res) => {
    const u = await currentUser(req);
    const body = req.body || {};
    if (body.order == null || (Array.isArray(body.order) && body.order.length === 0)) {
      await D.deletePortalPrefs(u.id);
      return res.json({ ok: true, order: [] });
    }
    if (!Array.isArray(body.order)) return res.status(400).json({ error: 'order 必须为子系统 id 数组' });
    const seen = {};
    const ids = [];
    body.order.forEach(id => {
      if (typeof id === 'string' && !seen[id]) { seen[id] = true; ids.push(id); }
    });
    const { scanSubsystems } = require('./subsystems');
    const validIds = Object.keys(scanSubsystems());
    if (!ids.every(id => validIds.includes(id))) return res.status(400).json({ error: 'order 包含未注册的子系统 id' });
    await D.upsertPortalPrefs(u.id, ids);
    res.json({ ok: true, order: ids });
  });
```

- [ ] **Step 7: 运行测试确认通过**

Run: `npx jest tests/portal-prefs.test.js 2>&1 | tail -20`
Expected: PASS —— 10 个用例全部通过（`Tests: 10 passed`）。

- [ ] **Step 8: 提交**

```bash
git add db.js db/portal-prefs.js routes/misc.js tests/portal-prefs.test.js
git commit -m "feat(portal): 门户卡片排序偏好后端（user_portal_prefs 表 + GET/PUT /api/portal/prefs）

框架级功能：独立偏好表隔离用户排序，PUT 校验仅允许已注册子系统 id，
order=[] 清除偏好恢复默认，不影响 GET /api/subsystems 返回格式。"
```

---

### Task 2: 前端 —— portal.html 编辑模式拖拽排序 + 样式（含 E2E 验证）

**Files:**
- Modify: `public/portal.html`（欢迎语区加按钮、toast 容器、重写 script 渲染与编辑逻辑）
- Modify: `public/css/app.css`（门户编辑模式专用样式块，遵循 §18 token）

- [ ] **Step 1: 修改 portal.html 结构**

将 `public/portal.html` 中 `.main` 区块（第 26-32 行）替换为：

```html
<div class="main">
  <h1>欢迎使用制造品质管理系统</h1>
  <div class="welcome-sub">
    <span>请选择子系统进入</span>
    <span class="order-btns" id="order-btns"></span>
  </div>
  <div class="portal-cards" id="subsystem-grid">
    <div class="portal-card"><div class="card-desc" style="text-align:center;color:var(--muted);padding:20px">加载子系统…</div></div>
  </div>
  <div id="portal-toast" class="portal-toast" style="display:none"></div>
</div>
```

- [ ] **Step 2: 重写 portal.html script**

将 `public/portal.html` 中 `<script>...</script>`（第 34-65 行）整体替换为：

```html
<script>
// 子系统图标映射（按 manifest.icon 匹配）
var ICONS = {
  flask:  '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3h6M10 3v6.5L5.2 17.5a2 2 0 0 0 1.7 3h10.2a2 2 0 0 0 1.7-3L14 9.5V3M7.5 14h9"/></svg>',
  wrench: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-2.4 2.5-2.5Z"/></svg>',
  chart:  '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>',
  _default: '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/></svg>'
};

var grid = document.getElementById('subsystem-grid');
var state = { cards: [], editMode: false, prefs: [] };

/** 合并排序：prefs 中的 id 按用户顺序置前，未配置的按默认顺序排尾 */
function mergeOrder(list, prefs) {
  var byId = {};
  list.forEach(function (m) { byId[m.id] = m; });
  var ordered = [];
  prefs.forEach(function (id) {
    if (byId[id]) { ordered.push(byId[id]); delete byId[id]; }
  });
  Object.keys(byId).forEach(function (id) { ordered.push(byId[id]); });
  return ordered;
}

function cardHtml(m) {
  var icon = ICONS[m.icon] || ICONS._default;
  var href = state.editMode ? 'javascript:void(0)' : m.route.entry;
  return '<a class="portal-card" draggable="' + state.editMode + '" data-id="' + m.id + '" href="' + href + '">' +
    (state.editMode ? '<span class="card-grip" title="拖动排序">⋮⋮</span>' : '') +
    '<span class="card-icon">' + icon + '</span>' +
    '<h3>' + m.name + '</h3>' +
    '<span class="card-desc">' + (m.description || '') + '</span>' +
    '<span class="card-action">' + (state.editMode ? '拖动排序' : '进入系统') + '</span>' +
    '</a>';
}

function renderCards() {
  grid.classList.toggle('edit-mode', state.editMode);
  grid.innerHTML = state.cards.map(cardHtml).join('');
}

function renderOrderBtns() {
  var box = document.getElementById('order-btns');
  if (state.editMode) {
    box.innerHTML =
      '<button id="btn-save" class="btn-order primary" type="button">保存顺序</button>' +
      '<button id="btn-cancel" class="btn-order" type="button">取消</button>';
    document.getElementById('btn-save').onclick = saveOrder;
    document.getElementById('btn-cancel').onclick = cancelEdit;
  } else {
    box.innerHTML = '<button id="btn-edit" class="btn-order" type="button">编辑排列</button>';
    document.getElementById('btn-edit').onclick = enterEdit;
  }
}

function showToast(msg, isErr) {
  var t = document.getElementById('portal-toast');
  t.textContent = msg;
  t.style.display = 'block';
  t.className = 'portal-toast' + (isErr ? ' err' : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(function () { t.style.display = 'none'; }, 2500);
}

function enterEdit() { state.editMode = true; renderCards(); renderOrderBtns(); }
function cancelEdit() { state.editMode = false; renderCards(); renderOrderBtns(); }

async function saveOrder() {
  var ids = state.cards.map(function (m) { return m.id; });
  try {
    var res = await fetch('/api/portal/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: ids })
    });
    if (!res.ok) throw new Error((await res.json()).error || '保存失败');
    state.prefs = ids;
    state.editMode = false;
    renderCards();
    renderOrderBtns();
    showToast('已保存排列顺序');
  } catch (e) {
    showToast('保存失败，请重试：' + e.message, true);
  }
}

// 拖拽换位（仅编辑态生效；事件委托到容器）
grid.addEventListener('dragstart', function (e) {
  var card = e.target.closest('.portal-card');
  if (!card || !state.editMode) return;
  state.dragIndex = Array.prototype.indexOf.call(grid.children, card);
  card.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
grid.addEventListener('dragover', function (e) {
  if (!state.editMode) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
});
grid.addEventListener('drop', function (e) {
  if (!state.editMode) return;
  e.preventDefault();
  var target = e.target.closest('.portal-card');
  if (!target) return;
  var to = Array.prototype.indexOf.call(grid.children, target);
  if (to === state.dragIndex) return;
  var card = state.cards.splice(state.dragIndex, 1)[0];
  state.cards.splice(to, 0, card);
  renderCards();
});
grid.addEventListener('dragend', function () {
  var dragging = grid.querySelector('.dragging');
  if (dragging) dragging.classList.remove('dragging');
});

(async function () {
  try {
    var [subRes, prefRes] = await Promise.all([
      fetch('/api/subsystems'),
      fetch('/api/portal/prefs')
    ]);
    var subsystems = await subRes.json();
    var prefs = (await prefRes.json()).order || [];
    if (!subsystems.length) {
      grid.innerHTML = '<div class="portal-card"><div class="card-desc" style="padding:20px">暂无可用子系统</div></div>';
      return;
    }
    state.cards = mergeOrder(subsystems, prefs);
    state.prefs = prefs;
    renderCards();
    renderOrderBtns();
  } catch (e) {
    grid.innerHTML = '<div class="portal-card"><div class="card-desc" style="color:#dc2626;padding:20px">加载子系统失败：' + e.message + '</div></div>';
  }
})();
</script>
```

- [ ] **Step 3: 追加 app.css 门户编辑样式**

在 `public/css/app.css` 末尾追加门户个性化专用块（仅 portal.html 使用的类，不影响子系统页面）：

```css
/* ===== 门户个性化排列（portal.html 编辑模式，AGENTS.md §21）===== */
.welcome-sub{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap}
.order-btns{display:inline-flex;gap:8px}
.btn-order{display:inline-flex;align-items:center;padding:4px 12px;font-size:12px;line-height:1.5;color:var(--brand-d);background:#f0fdfa;border:1px solid var(--brand);border-radius:999px;cursor:pointer;transition:background .15s ease}
.btn-order:hover{background:#ccfbf1}
.btn-order.primary{background:var(--brand);color:#fff}
.btn-order.primary:hover{background:var(--brand-d)}
.portal-cards.edit-mode .portal-card{cursor:grab}
.portal-cards.edit-mode .portal-card:hover{transform:translateY(-2px);box-shadow:var(--card-shadow-hover)}
.portal-card .card-grip{position:absolute;top:8px;right:10px;color:#94a3b8;font-size:15px;letter-spacing:1px;user-select:none}
.portal-card.dragging{opacity:.45}
.portal-toast{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:999;padding:8px 18px;border-radius:8px;color:#fff;background:var(--brand);font-size:13px;box-shadow:0 4px 12px rgba(15,23,42,.18)}
.portal-toast.err{background:#dc2626}
```

> 注意：`.welcome-sub` 已有 `.main .welcome-sub{color:var(--muted);margin:0 0 40px;font-size:14px}`，追加的 `.welcome-sub` 只补 flex 布局，不覆盖原有颜色/外边距（同特异性时后者生效，需确认颜色与 margin 仍保留——若被覆盖则在新块中补回 `color:var(--muted);margin:0 0 40px;font-size:14px`）。

- [ ] **Step 4: 重启服务**

后端已改 `db.js`/`routes/misc.js`，需重启使建表与路由生效（精确 kill 4000，勿碰 3500）：

```bash
# 1) 精确识别 4000 PID（禁止 pkill 宽泛匹配）
sudo ss -tlnp | grep ':4000'
# 2) kill 对应 PID 后以 www 身份重启
echo 'mnbvcxz123' | sudo -S bash -c 'kill <PID>; cd /www/wwwroot/sample-mgmt && setsid nohup node server.js > /tmp/sample-mgmt.log 2>&1 < /dev/null &'
# 3) 确认启动
tail -5 /tmp/sample-mgmt.log
```

- [ ] **Step 5: API 冒烟验证**

```bash
rm -f /tmp/sm-cookie.txt
curl -s -c /tmp/sm-cookie.txt -H 'Content-Type: application/json' -d '{"username":"admin","password":"admin123"}' http://localhost:4000/api/login -o /dev/null -w 'login=%{http_code}\n'
curl -s -b /tmp/sm-cookie.txt http://localhost:4000/api/portal/prefs
# 期望：{"order":[]}
curl -s -b /tmp/sm-cookie.txt -X PUT -H 'Content-Type: application/json' -d '{"order":["fixtures","samples","workbench","projects"]}' http://localhost:4000/api/portal/prefs
# 期望：{"ok":true,"order":["fixtures","samples","workbench","projects"]}
curl -s -b /tmp/sm-cookie.txt -X PUT -H 'Content-Type: application/json' -d '{"order":[]}' http://localhost:4000/api/portal/prefs
# 期望：{"ok":true,"order":[]}（清理，保持测试后环境干净）
```

- [ ] **Step 6: 提交**

```bash
git add public/portal.html public/css/app.css
git commit -m "feat(portal): 门户卡片编辑模式拖拽排序（保存/取消/实时预览）

编辑排列按钮进入编辑态显示拖拽手柄，HTML5 DnD 换位仅内存操作，
保存统一 PUT /api/portal/prefs，失败停留编辑态不丢顺序；
未配置用户与新增子系统按默认顺序排尾，浏览态与旧版行为一致。"
```

---

### Task 3: E2E 回归 + 文档同步

**Files:**
- Modify: `AGENTS.md`（目录结构、API 表、新增「门户个性化」小节）
- Modify: `README.md`（功能说明）
- Modify: `docs/operation-manual.md`（操作说明）
- E2E: browser_use（登录 → 编辑排列 → 拖拽 → 保存 → 刷新顺序保持）

- [ ] **Step 1: 全量单测回归**

Run: `npx jest 2>&1 | tail -15`
Expected: 新增 portal-prefs 10 用例通过；samples 上线保护生效（samples.test.js 按 §20 跳过）；其余套件不回归（fixtures 等原有通过数不变）。

- [ ] **Step 2: browser_use E2E**

用 browser_use subagent 执行（浏览器 http://localhost:4000/portal.html）：

1. 登录 admin/admin123 → 进入门户 → 确认「编辑排列」按钮存在
2. 点击「编辑排列」→ 确认每卡出现 ⋮⋮ 手柄、按钮变为「保存顺序」「取消」
3. 模拟拖拽（mouse down/move/up 或浏览器原生 DnD）将「治具管理」拖至首位
4. 点击「保存顺序」→ toast「已保存排列顺序」出现
5. 刷新页面 → 确认「治具管理」仍在首位（顺序保持）
6. 再次进入编辑 → 点击「取消」→ 顺序回退到保存前（不生效）
7. 小屏（390px 宽）→ 按钮与手柄不破版

> 若浏览器原生 DnD 模拟不可行：改用「先通过 API 设偏好（curl PUT），再刷新门户页验证排序渲染」+「保存按钮交互」两步验证，拖拽交互手动验证并记录。

- [ ] **Step 3: 同步 AGENTS.md**

1. 目录结构（`routes/misc.js` 行注释）追加说明：`# 杂项路由(看板/日志/用户/健康检查/门户偏好)`；根目录结构 `db/` 列表追加 `portal-prefs.js`
2. API 约定表（§11 或既有 API 文档位置）追加：

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | /api/portal/prefs | 当前用户门户卡片排序偏好（无记录返回空数组） | 登录 |
| PUT | /api/portal/prefs | 保存/清除排序偏好（order=[] 或 null 清除） | 登录 |

3. 追加小节「§22 门户个性化排列」（AGENTS.md 已有 §21 列表导出标准，编号顺延；置于文档末尾收尾声明前）。同时把 Task 1 在 `db.js`、Task 2 在 `public/css/app.css` 注释中误写的「AGENTS.md §21 门户个性化」修正为 §22：

```markdown
## 22. 门户卡片个性化排列

- 门户卡片顺序 = 用户偏好（user_portal_prefs.portal_order）优先，未配置子系统按默认顺序排尾
- 用户级隔离：偏好仅对当前登录用户生效；新用户/新增子系统无需迁移自动获得默认位置
- 交互：门户「编辑排列」→ 拖拽手柄换位 → 「保存顺序」统一提交；取消丢弃调整
- 清除：PUT /api/portal/prefs 传 order=[] 或 null 恢复默认顺序
```

- [ ] **Step 4: 同步 README.md 与操作手册**

- README.md 功能章节追加「门户卡片个性化排列」描述
- docs/operation-manual.md 追加操作说明：编辑入口、拖拽、保存/取消、默认行为

- [ ] **Step 5: 提交**

```bash
git add AGENTS.md README.md docs/operation-manual.md
git commit -m "docs(portal): 门户卡片个性化排列文档同步（AGENTS.md §21 + README + 操作手册）"
```

- [ ] **Step 6: 输出强制报告**

修改完成后输出 3 项臃肿检测报告：
1. db.js（~150 行/上限 600）、db/portal-prefs.js（~40 行/上限 200）、routes/misc.js（~234 行/上限 400）、portal.html（~200 行）、app.css 增量
2. 顶层函数数量与阈值预警
3. 冗余清单（新增代码无未使用导入/废弃代码块）
