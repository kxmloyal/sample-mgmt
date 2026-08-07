# 项目追踪·迭代1（簇A 检索与批量 + 缺陷#2/#3）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为项目追踪子系统实现任务检索与批量处理能力（全文搜索/多维筛选/批量操作/筛选 URL 化），并修复 2 个现存缺陷（`/api/projects/users` 权限过严、CSV 导出忽略筛选）。

**Architecture:** 后端在 `dao-tasks.js` 的 `buildTaskWhere` 扩展 `q` 参数（LIKE 匹配），在 `routes-stats.js` 透传新筛选参数、放宽 users 端点权限、export 复用筛选；新增 `POST /api/projects/tasks/batch` 批量端点（事务+逐条权限+跳过统计）。前端改造 `list.js`（搜索框/下拉筛选/checkbox 批量/URL 化）与 `kanban.js`（下拉筛选），`router.js` 解析 URL 参数。所有改动遵循 AGENTS.md §6 全链路规则与 §20 上线保护（projects 未上线可写入测试，samples 已上线仅只读回归）。

**Tech Stack:** Node.js + Express 4（CommonJS）、MariaDB（mysql2）、原生 HTML/JS（fluent UI 组件）、Jest + supertest（测试）、build-bundles.js 构建。

---

### Task 0: 测试环境准备与基线确认

**Files:**
- Test: `tests/projects.test.js`（追加，不新建文件）
- Read: `tests/helpers/setup.js`（已核验：getApp/login 可用）

- [ ] **Step 1: 确认 projects 未上线（可写入测试）**

```bash
cat /www/wwwroot/sample-mgmt/subsystems/projects/manifest.json | grep deployed
```
Expected: 无 `"deployed": true` 输出（projects 未上线，允许写入测试数据；samples 已上线仅只读）。

- [ ] **Step 2: 跑基线测试确认现有通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js --forceExit 2>&1 | tail -5
```
Expected: `Tests: X passed`（现有项目 CRUD/任务 CRUD/流转用例全部通过）。

- [ ] **Step 3: 记录基线状态**

确认 `git status` 干净（或仅设计文档变更 `docs/superpowers/specs/2026-08-06-projects-enhancement-design.md`）。

---

### Task 1: 后端 — `/api/projects/users` 放宽为 requireAuth（缺陷#2）

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-stats.js:17-23`
- Test: `/www/wwwroot/sample-mgmt/tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `tests/projects.test.js` 文件末尾追加（文件级变量 `pm`、`admin` 已有，需确认 `makeUser` helper 存在并复用）：

```js
describe('缺陷#2 用户列表权限放宽', () => {
  test('非 ADMIN/PM 登录用户可访问 /api/projects/users', async () => {
    const rd = await makeUser({ username: 'rd-users', password: 'rd123', role: 'RD', dept: '研发部', display_name: '研发' });
    const res = await rd.agent.get('/api/projects/users');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // 仅暴露安全字段，不泄露 password_hash
    expect(res.body[0]).toHaveProperty('id');
    expect(res.body[0]).toHaveProperty('username');
    expect(res.body[0]).toHaveProperty('display_name');
    expect(res.body[0]).not.toHaveProperty('password_hash');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "用户列表权限放宽" --forceExit 2>&1 | tail -8
```
Expected: FAIL，`403` 收到（当前仅 ADMIN/PM）。

- [ ] **Step 3: 实现放宽**

修改 `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-stats.js:17-23`，删除角色判断：

```js
  // 用户列表（所有登录用户；项目成员/新建任务指派/@提及/筛选下拉用；共享 /api/users 仅 ADMIN，故子系统提供）
  // 缺陷#2 修复：原仅 ADMIN/PM，非管理者新建任务指派下拉静默为空 → 放宽为 requireAuth（仅暴露安全字段）
  app.get('/api/projects/users', requireAuth, async (req, res) => {
    try {
      res.json(await D.fetchAll(null, 'SELECT id,username,display_name FROM users ORDER BY id'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
```

> 注意：修改前先 Read 该文件确认现有实现细节（D 的引用名、requireAuth 变量来源），保持与文件内既有代码风格一致。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "用户列表权限放宽" --forceExit 2>&1 | tail -5
```
Expected: PASS，200。

- [ ] **Step 5: Commit**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add subsystems/projects/backend/routes-stats.js tests/projects.test.js && sudo -u www git commit -m "fix(projects): 放宽 /api/projects/users 为登录即可访问

非 ADMIN/PM 用户新建任务时指派下拉静默为空（现存活缺陷）。
放宽为 requireAuth，仅暴露 id/username/display_name，不泄露 password_hash。"
```
（若 sudo -u www 无权限，改用用户提供的 sudo 方式执行 git。）

---

### Task 2: 后端 — CSV 导出复用筛选参数（缺陷#3）

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-stats.js:42-58`
- Test: `/www/wwwroot/sample-mgmt/tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `tests/projects.test.js` 追加：

```js
describe('缺陷#3 CSV 导出复用筛选', () => {
  test('导出带筛选参数仅包含匹配行', async () => {
    // 创建一条高优先级 + 一条低优先级任务（项目 pid 已有）
    const hi = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '任务-导出高', priority: 'H' });
    const lo = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '任务-导出低', priority: 'L' });
    expect(hi.status).toBe(201);
    expect(lo.status).toBe(201);
    const res = await pm.agent.get('/api/projects/tasks/export?priority=H&project_id=' + pid);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('任务-导出高');
    expect(res.text).not.toContain('任务-导出低');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "CSV 导出复用筛选" --forceExit 2>&1 | tail -8
```
Expected: FAIL — 导出当前忽略筛选，`任务-导出低` 也出现在 CSV 中。

- [ ] **Step 3: 实现筛选透传**

修改 `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-stats.js:42-58` 的 export 路由（先 Read 确认现有实现）：

```js
  // CSV 导出（UTF-8 BOM；列：项目名称/任务名称/类别/优先级/责任人/状态/进度/计划日期/实际日期/描述/方案/备注）
  // 缺陷#3 修复：复用列表筛选参数（q/category/priority/status/assignee_id/project_id），与 §21 列表导出标准一致
  app.get('/api/projects/tasks/export', requireAuth, async (req, res) => {
    try {
      const filters = { project_id: req.query.project_id, category: req.query.category,
        priority: req.query.priority, status: req.query.status, assignee_id: req.query.assignee_id,
        q: req.query.q };
      const rows = await D.listAllTasks(null, Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
      const head = ['项目名称', '任务名称', '类别', '优先级', '责任人', '状态', '进度(%)', '计划完成日期', '实际完成日期', '描述', '解决方案', '备注'];
      const esc = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const lines = [head.map(esc).join(',')];
      const STATE_CN = { NOT_STARTED: '未开始', IN_PROGRESS: '进行中', DONE: '已完成', OVERDUE: '已延期' };
      for (const r of rows) {
        lines.push([r.project_name, r.title, r.category, r.priority, r.assignee_name || '',
          STATE_CN[r.status] || r.status, r.progress, r.planned_date, r.actual_date,
          r.description, r.solution, r.notes].map(esc).join(','));
      }
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="tasks-' + Date.now() + '.csv"');
      res.send('\uFEFF' + lines.join('\r\n'));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
```

> 注意：若现有 export 实现已用 `shared/csv.js` 的 `sendCsv`，优先复用（AGENTS.md §21），只需改动查询过滤部分；上面的内联 CSV 仅为保底实现，执行时以现有代码为准。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "CSV 导出复用筛选" --forceExit 2>&1 | tail -5
```
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add subsystems/projects/backend/routes-stats.js tests/projects.test.js && sudo -u www git commit -m "fix(projects): CSV 导出复用列表筛选参数

原导出忽略筛选全量导出，与 AGENTS.md §21 标准不符。
现透传 q/category/priority/status/assignee_id/project_id 参数。"
```

---

### Task 3: 后端 — 全文搜索 q 参数（A1）

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/db/dao-tasks.js:11-22`（buildTaskWhere）
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-stats.js:26-39`（/tasks 路由）
- Test: `/www/wwwroot/sample-mgmt/tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `tests/projects.test.js` 追加：

```js
describe('A1 全文搜索', () => {
  test('q 参数跨字段 LIKE 匹配标题/描述，可与筛选叠加', async () => {
    await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '搜索锚点-定位精度', description: '治具根因分析' });
    const hit1 = await pm.agent.get('/api/projects/tasks?q=' + encodeURIComponent('定位精度'));
    expect(hit1.status).toBe(200);
    expect(Array.isArray(hit1.body)).toBe(true);
    expect(hit1.body.some(t => t.title === '搜索锚点-定位精度')).toBe(true);
    // 描述命中
    const hit2 = await pm.agent.get('/api/projects/tasks?q=' + encodeURIComponent('根因分析'));
    expect(hit2.body.some(t => t.title === '搜索锚点-定位精度')).toBe(true);
    // 与 project_id 筛选叠加（不匹配词的组合应空）
    const miss = await pm.agent.get('/api/projects/tasks?q=' + encodeURIComponent('不存在的词xyz') + '&project_id=' + pid);
    expect(miss.body.length).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "全文搜索" --forceExit 2>&1 | tail -8
```
Expected: FAIL — q 参数被忽略，返回全部任务（或 0 条）。

- [ ] **Step 3: 实现 buildTaskWhere 扩展**

在 `/www/wwwroot/sample-mgmt/subsystems/projects/db/dao-tasks.js:11-22` 的 `buildTaskWhere` 中追加 q 分支（注意转义 `%/_` 防 LIKE 注入；先 Read 确认现有实现结构）：

```js
  function buildTaskWhere(filters) {
    var sql = '', params = [];
    if (filters.project_id) { sql += ' AND t.project_id=?'; params.push(filters.project_id); }
    if (filters.category) { sql += ' AND t.category=?'; params.push(filters.category); }
    if (filters.priority) { sql += ' AND t.priority=?'; params.push(filters.priority); }
    if (filters.status && filters.status !== 'OVERDUE') { sql += ' AND t.status=?'; params.push(filters.status); }
    if (filters.status === 'OVERDUE') {
      sql += " AND (t.status='OVERDUE' OR (t.status IN ('NOT_STARTED','IN_PROGRESS') AND t.planned_date < CURDATE()))";
    }
    if (filters.assignee_id) { sql += ' AND t.assignee_id=?'; params.push(filters.assignee_id); }
    // A1 全文搜索：title/description/notes/solution LIKE 匹配；转义 %/_ 防通配符注入；无索引全表扫，<5万行可接受
    if (filters.q) {
      const escaped = String(filters.q).replace(/[\\%_]/g, '\\$&');
      sql += " AND (t.title LIKE ? OR t.description LIKE ? OR t.notes LIKE ? OR t.solution LIKE ?)";
      const like = '%' + escaped + '%';
      params.push(like, like, like, like);
    }
    return { sql: sql, params: params };
  }
```

- [ ] **Step 4: 路由透传 q**

修改 `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-stats.js:26-39` 中 `/api/projects/tasks` 路由的 filters 对象：

```js
      const filters = { project_id: req.query.project_id, category: req.query.category,
        priority: req.query.priority, status: req.query.status, assignee_id: req.query.assignee_id,
        q: req.query.q };
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "全文搜索" --forceExit 2>&1 | tail -5
```
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add subsystems/projects/db/dao-tasks.js subsystems/projects/backend/routes-stats.js tests/projects.test.js && sudo -u www git commit -m "feat(projects): 任务全文搜索 q 参数

跨 title/description/notes/solution LIKE 匹配，与现有筛选叠加；
转义 %/_ 防通配符注入；分页/导出共用 buildTaskWhere。"
```

---

### Task 4: 后端 — 批量操作 POST /api/projects/tasks/batch（A3，核心）

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-tasks.js`（追加路由，注意文件容量<400行，当前约 271 行）
- Test: `/www/wwwroot/sample-mgmt/tests/projects.test.js`（追加 describe）

- [ ] **Step 1: 写失败测试**

在 `tests/projects.test.js` 追加（复用文件级 `pid`、`pm`、`rd2`、`makeUser`、`tid`）：

```js
describe('A3 批量操作', () => {
  test('批量指派：无权限条目跳过并统计', async () => {
    const t1 = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '批量-指派1' });
    const t2 = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '批量-指派2' });
    expect(t1.status).toBe(201);
    expect(t2.status).toBe(201);
    const r = await pm.agent.post('/api/projects/tasks/batch').send({
      action: 'assign', ids: [t1.body.id, t2.body.id], assignee_id: rd2.user.id
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(2);
    expect(r.body.skipped.length).toBe(0);
    const d1 = await pm.agent.get('/api/projects/tasks/' + t1.body.id);
    expect(d1.body.task.assignee_id).toBe(rd2.user.id);
  });

  test('批量流转 STATUS：仅合法转移执行', async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '批量-流转' });
    const r = await pm.agent.post('/api/projects/tasks/batch').send({
      action: 'status', ids: [t.body.id], action2: 'START'
    });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(1);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.body.task.status).toBe('IN_PROGRESS');
  });

  test('批量删除：任务消失且留痕', async () => {
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '批量-删除' });
    const r = await pm.agent.post('/api/projects/tasks/batch').send({ action: 'delete', ids: [t.body.id] });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(1);
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.status).toBe(404);
  });

  test('非项目成员批量删除 → 全部跳过', async () => {
    const outsider = await makeUser({ username: 'rd-batch-out', password: 'rd123', role: 'RD', dept: '研发部', display_name: '外部' });
    const t = await pm.agent.post('/api/projects/' + pid + '/tasks').send({ title: '批量-无权限' });
    const r = await outsider.agent.post('/api/projects/tasks/batch').send({ action: 'delete', ids: [t.body.id] });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(0);
    expect(r.body.skipped.length).toBe(1);
    expect(r.body.skipped[0].id).toBe(t.body.id);
    // 任务仍存在
    const d = await pm.agent.get('/api/projects/tasks/' + t.body.id);
    expect(d.status).toBe(200);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "批量操作" --forceExit 2>&1 | tail -10
```
Expected: FAIL — 404（路由不存在）。

- [ ] **Step 3: 实现批量路由**

先 Read `/www/wwwroot/sample-mgmt/subsystems/projects/backend/routes-tasks.js` 确认 `canEditTask`、`currentUser`、`wf`、`D` 的引用方式，然后在 `register` 内追加（路径 `/batch` 与 `/:tid` 无冲突）：

```js
  // A3 批量操作（事务内逐条 canEditTask 校验 + 留痕；无权限条目跳过并统计；单批上限 100）
  // 返回 { ok, skipped:[{id,reason}] }；delete 走 deleteTaskCascade 级联清理
  app.post('/api/projects/tasks/batch', requireAuth, async (req, res) => {
    try {
      const u = await currentUser(req);
      const body = req.body || {};
      const action = body.action;
      const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isInteger).slice(0, 100) : [];
      if (!['assign', 'status', 'delete'].includes(action)) return res.status(400).json({ error: '非法批量操作' });
      if (ids.length === 0) return res.status(400).json({ error: 'ids 必填' });
      const ok = []; const skipped = [];
      await D.withTransaction(async conn => {
        for (const tid of ids) {
          const t = await D.getTask(conn, tid);
          if (!t) { skipped.push({ id: tid, reason: '任务不存在' }); continue; }
          if (!await canEditTask(conn, u, t, action !== 'delete')) {
            skipped.push({ id: tid, reason: '无权限' }); continue;
          }
          if (action === 'assign') {
            const assigneeId = Number(body.assignee_id) || null;
            await D.updateTask(conn, tid, { assignee_id: assigneeId, version: t.version }, t.version);
            await D.addProjectLog(conn, 'task', tid, 'BATCH_ASSIGN', JSON.stringify({ assignee_id: assigneeId }), u.id);
          } else if (action === 'status') {
            const act2 = String(body.action2 || '').trim();
            const cfg = await wf.loadWorkflow(conn);
            const tr = cfg.transitions.find(x => x.action === act2 && x.from === t.status);
            if (!tr) { skipped.push({ id: tid, reason: '状态不允许该操作' }); continue; }
            const r = await conn.execute('UPDATE project_tasks SET status=?, version=version+1 WHERE id=? AND status=?',
              [tr.to, tid, t.status]);
            if (r[0].affectedRows === 0) { skipped.push({ id: tid, reason: '状态已变更' }); continue; }
            await D.addProjectLog(conn, 'task', tid, 'STATUS_CHANGE', JSON.stringify({ from: t.status, to: tr.to, action: act2, batch: 1 }), u.id);
          } else if (action === 'delete') {
            await D.deleteTaskCascade(conn, tid);
            await D.addProjectLog(conn, 'task', tid, 'DELETE', JSON.stringify({ title: t.title, batch: 1 }), u.id);
          }
          ok.push(tid);
        }
      });
      res.json({ ok: ok, skipped: skipped });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
```

> **容量约束**：routes-tasks.js 当前约 271 行，追加约 50 行后 ~321 行，仍 <400 行上限（§7.1）。若后续继续膨胀，须拆独立文件 `routes-task-batch.js`。

- [ ] **Step 4: 运行测试确认通过**

```bash
cd /www/wwwroot/sample-mgmt && npx jest tests/projects.test.js -t "批量操作" --forceExit 2>&1 | tail -5
```
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add subsystems/projects/backend/routes-tasks.js tests/projects.test.js && sudo -u www git commit -m "feat(projects): 批量指派/流转/删除 POST /tasks/batch

事务内逐条 canEditTask 校验，无权限跳过并统计；
delete 走级联清理；单批上限 100；每条写 project_logs 留痕（BATCH 标记）。"
```

---

### Task 5: 前端 — list.js 搜索框 + 多维筛选下拉 + URL 化（A1/A2/A4）

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/views/list.js`
- Create: `/www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/views/list-batch.js`（批量函数独立文件，满足顶层函数≤10 约束）
- Modify: `/www/wwwroot/sample-mgmt/tools/bundle-sources.json`（projects 数组在 list.js 后追加 list-batch.js）
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/api.js`（追加 PApi.users = '/api/projects/users'，如需）

- [ ] **Step 1: 先 Read list.js 全文，确认现有结构（lkLoad/lkToggleMine/lkCreate/renderTaskList、顶层函数数量、_lkPage/_lkPageSize 变量）**

执行时以实际代码为准，复用现有 `_lkMine`、`_lkPage`、`_lkPageSize`、`esc`、`showToast`、`api`、`me`、`CATEGORY_KEYS`、`PRIORITY_KEYS`、`CATEGORY_CN`、`PRIORITY_CN`。

- [ ] **Step 2: renderTaskList 增加搜索框 + 下拉筛选 + checkbox 表头**

在现有 filters 区追加（保持与现有布局一致）：

```js
    '<fluent-text-field id="lk-q" placeholder="搜索标题/描述/备注…" style="width:200px"></fluent-text-field>' +
    '<fluent-select id="lk-project"><fluent-option value="">全部项目</fluent-option></fluent-select>' +
    '<fluent-select id="lk-status"><fluent-option value="">全部状态</fluent-option>' +
    '<fluent-option value="NOT_STARTED">未开始</fluent-option><fluent-option value="IN_PROGRESS">进行中</fluent-option>' +
    '<fluent-option value="DONE">已完成</fluent-option><fluent-option value="OVERDUE">已延期</fluent-option></fluent-select>' +
    '<fluent-select id="lk-category"><fluent-option value="">全部类别</fluent-option>' +
    CATEGORY_KEYS.map(k => '<fluent-option value="' + k + '">' + CATEGORY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="lk-priority"><fluent-option value="">全部优先级</fluent-option>' +
    PRIORITY_KEYS.map(k => '<fluent-option value="' + k + '">' + PRIORITY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="lk-assignee"><fluent-option value="">全部责任人</fluent-option></fluent-select>' +
    '<fluent-button appearance="secondary" onclick="lkApplyFilters()">查询</fluent-button>' +
    '<fluent-button appearance="secondary" id="lk-mine" onclick="lkToggleMine()">只看我的</fluent-button>' +
    '<fluent-button appearance="accent" onclick="lkCreate()">新建任务</fluent-button>' +
    '<fluent-button appearance="secondary" onclick="lkExport()">导出 CSV</fluent-button>'
```

表头首列加全选框：

```js
    '<th style="width:36px"><fluent-checkbox id="lk-check-all" onchange="lkToggleAll()"></fluent-checkbox></th>' +
```

渲染行首列加行选框：

```js
    '<td><fluent-checkbox class="lk-row-check" data-id="' + t.id + '" onchange="lkRowCheck(this)"></fluent-checkbox></td>' +
```

批量操作栏（表格下方）：

```js
    '<div class="pk-filters" id="lk-batch" style="display:none;padding:8px 12px;background:#f0fdfa;border-radius:8px"></div>' +
```

- [ ] **Step 3: 新建 views/list-batch.js（批量相关函数，保持 list.js 顶层函数 ≤10）**

```js
// list-batch.js — 任务列表批量操作（checkbox 选择 + 批量指派/流转/删除）
// 独立文件原因：list.js 顶层函数逼近 10 个上限（AGENTS.md §7.2），批量函数隔离于此
var _lkSel = new Set();

function lkRowCheck(cb) {
  const id = Number(cb.dataset.id);
  // fluent-checkbox 用 .checked 属性判断（:checked 伪类不匹配自定义元素）
  if (cb.checked) _lkSel.add(id); else _lkSel.delete(id);
  lkRenderBatchBar();
  const all = document.querySelectorAll('.lk-row-check');
  const allChecked = all.length > 0 && Array.from(all).every(c => c.checked);
  const head = $('#lk-check-all');
  if (head) head.checked = allChecked;
}

function lkToggleAll() {
  const head = $('#lk-check-all');
  const all = document.querySelectorAll('.lk-row-check');
  for (const cb of all) {
    cb.checked = head.checked; // 属性赋值触发组件回显
    if (head.checked) _lkSel.add(Number(cb.dataset.id)); else _lkSel.delete(Number(cb.dataset.id));
  }
  lkRenderBatchBar();
}

function lkRenderBatchBar() {
  const bar = $('#lk-batch');
  if (!bar) return;
  const n = _lkSel.size;
  if (n === 0) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
  bar.style.display = 'flex';
  bar.innerHTML =
    '<span style="align-self:center;font-size:13px">已选 <b>' + n + '</b> 条</span>' +
    '<fluent-button appearance="secondary" size="small" onclick="lkBatch(\'status\',\'START\')">批量开始</fluent-button>' +
    '<fluent-button appearance="secondary" size="small" onclick="lkBatch(\'status\',\'COMPLETE\')">批量完成</fluent-button>' +
    '<fluent-button appearance="accent" size="small" onclick="lkBatch(\'delete\')">批量删除</fluent-button>' +
    '<fluent-button appearance="neutral" size="small" onclick="lkClearSel()">取消</fluent-button>';
}

function lkClearSel() {
  _lkSel.clear();
  document.querySelectorAll('.lk-row-check').forEach(c => { c.checked = false; });
  const head = $('#lk-check-all'); if (head) head.checked = false;
  lkRenderBatchBar();
}

async function lkBatch(action, action2) {
  const ids = Array.from(_lkSel);
  if (ids.length === 0) return showToast('请先勾选任务', 'err');
  const body = { action: action, ids: ids };
  if (action === 'status') body.action2 = action2;
  try {
    const r = await api('POST', '/api/projects/tasks/batch', body);
    showToast('成功 ' + r.ok.length + ' 条' + (r.skipped.length ? '，跳过 ' + r.skipped.length + ' 条' : ''));
    lkClearSel();
    lkLoad();
  } catch (e) { showToast(e.message, 'err'); }
}
```

- [ ] **Step 4: list.js 追加 lkApplyFilters / lkRestoreFromHash / lkExport，并扩展 lkLoad 筛选读取**

```js
// A4 筛选状态 URL 化：查询时把筛选写入 hash（页码不写入，刷新回第一页）
function lkApplyFilters() {
  const qs = new URLSearchParams();
  const map = {
    q: '#lk-q', project: '#lk-project', status: '#lk-status',
    category: '#lk-category', priority: '#lk-priority', assignee: '#lk-assignee'
  };
  for (const [key, sel] of Object.entries(map)) {
    const val = $(sel).value;
    if (val) qs.set(key, val);
  }
  if (_lkMine) qs.set('mine', '1');
  _lkPage = 0;
  location.hash = '#/list' + (qs.toString() ? '?' + qs : '');
  lkLoad();
}
// 从 hash 恢复筛选（进入页面时调用）
function lkRestoreFromHash() {
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const set = function (id, v) { if (v) $(id).value = v; };
  set('#lk-q', qs.get('q'));
  set('#lk-project', qs.get('project'));
  set('#lk-status', qs.get('status'));
  set('#lk-category', qs.get('category'));
  set('#lk-priority', qs.get('priority'));
  set('#lk-assignee', qs.get('assignee'));
  if (qs.get('mine') === '1' && !_lkMine) lkToggleMine();
}
// 导出：复用当前筛选参数拼 URL（location.href 触发下载，避免弹窗拦截）
function lkExport() {
  const qs = new URLSearchParams();
  const map = { q: '#lk-q', project: '#lk-project', status: '#lk-status',
    category: '#lk-category', priority: '#lk-priority', assignee: '#lk-assignee' };
  for (const [key, sel] of Object.entries(map)) {
    const val = $(sel).value;
    if (val) qs.set(key, val);
  }
  location.href = '/api/projects/tasks/export' + (qs.toString() ? '?' + qs : '');
}
```

`lkLoad()` 中筛选读取扩展为全部字段：

```js
  const qs = new URLSearchParams();
  const pid = $('#lk-project').value;
  if (pid) qs.set('project_id', pid);
  const st = $('#lk-status').value;
  if (st) qs.set('status', st);
  const cat = $('#lk-category').value;
  if (cat) qs.set('category', cat);
  const pr = $('#lk-priority').value;
  if (pr) qs.set('priority', pr);
  const as = $('#lk-assignee').value;
  if (as) qs.set('assignee_id', as);
  const q = $('#lk-q').value.trim();
  if (q) qs.set('q', q);
  if (_lkMine) qs.set('assignee_id', me.id);
  qs.set('limit', String(_lkPageSize));
  qs.set('offset', String(_lkPage * _lkPageSize));
```

`renderTaskList` 内：项目/责任人下拉填充（`/api/projects/users` 缺陷#2 修复后全员可访问）、搜索框防抖、调用 `lkRestoreFromHash()`。

- [ ] **Step 5: 注册 bundle 顺序**

修改 `/www/wwwroot/sample-mgmt/tools/bundle-sources.json`：projects 数组在 `views/list.js` 后追加 `views/list-batch.js`。

- [ ] **Step 6: 重建 bundle**

```bash
cd /www/wwwroot/sample-mgmt && node tools/build-bundles.js
sudo -u www cp /tmp/bundle-projects.js /www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/bundle.js
sudo -u www sed -i 's|bundle.js?v=[^"]*|bundle.js?v='$(cat tools/.bundle-ver)'|' /www/wwwroot/sample-mgmt/subsystems/projects/frontend/index.html
```

- [ ] **Step 7: Commit**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add subsystems/projects/frontend/js/views/list.js subsystems/projects/frontend/js/views/list-batch.js tools/bundle-sources.json subsystems/projects/frontend/js/bundle.js subsystems/projects/frontend/index.html && sudo -u www git commit -m "feat(projects): 任务列表搜索/多维筛选/批量操作/URL 化

- 全文搜索框（防抖 300ms）
- 类别/优先级/责任人下拉筛选（users 放宽后全员可拉取）
- checkbox 批量指派/流转/删除（fluent-checkbox .checked 属性，独立 list-batch.js）
- 筛选状态写入 hash（A4），刷新恢复；导出复用当前筛选"
```

---

### Task 6: 前端 — kanban.js 多维筛选 + URL 化（A2 看板侧）

**Files:**
- Modify: `/www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/views/kanban.js`

- [ ] **Step 1: 先 Read kanban.js 确认现有 renderTaskKanban/kbLoad/kbToggleMine 结构**

- [ ] **Step 2: renderTaskKanban 项目下拉后追加类别/优先级/责任人下拉**

```js
    '<fluent-select id="kb-category" onchange="kbLoad()"><fluent-option value="">全部类别</fluent-option>' +
    CATEGORY_KEYS.map(k => '<fluent-option value="' + k + '">' + CATEGORY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="kb-priority" onchange="kbLoad()"><fluent-option value="">全部优先级</fluent-option>' +
    PRIORITY_KEYS.map(k => '<fluent-option value="' + k + '">' + PRIORITY_CN[k] + '</fluent-option>').join('') + '</fluent-select>' +
    '<fluent-select id="kb-assignee" onchange="kbLoad()"><fluent-option value="">全部责任人</fluent-option></fluent-select>'
```

填充责任人下拉（拉 `/api/projects/users`），渲染末尾支持 `#/kanban?category=…&priority=…&assignee=…` URL 恢复，`kbLoad` 读取全部筛选。

- [ ] **Step 3: 重建 bundle**

```bash
cd /www/wwwroot/sample-mgmt && node tools/build-bundles.js
sudo -u www cp /tmp/bundle-projects.js /www/wwwroot/sample-mgmt/subsystems/projects/frontend/js/bundle.js
sudo -u www sed -i 's|bundle.js?v=[^"]*|bundle.js?v='$(cat tools/.bundle-ver)'|' /www/wwwroot/sample-mgmt/subsystems/projects/frontend/index.html
```

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add subsystems/projects/frontend/js/views/kanban.js subsystems/projects/frontend/js/bundle.js subsystems/projects/frontend/index.html && sudo -u www git commit -m "feat(projects): 看板页多维筛选下拉 + URL 参数恢复"
```

---

### Task 7: 回归验证与收尾（含双系统回归）

**Files:**
- Test: `/www/wwwroot/sample-mgmt/tests/projects.test.js`
- Read: `/www/wwwroot/sample-mgmt/subsystems/samples/manifest.json`（确认 deployed 状态）

- [ ] **Step 1: 全量测试**

```bash
cd /www/wwwroot/sample-mgmt && npm test 2>&1 | tail -8
```
Expected: 全部通过（projects/samples/fixtures 等既有测试不受影响）。若 samples 相关测试因上线护栏跳过，属正常。

- [ ] **Step 2: 既有功能回归清单（手动，按 AGENTS.md §16）**

- [ ] 看板拖拽流转（NOT_STARTED→IN_PROGRESS→DONE）正常
- [ ] 列表分页（50/页）正常
- [ ] 详情 5-tab（子任务/评论/附件/关联/日志）正常
- [ ] 依赖环检测 + 未完成前置 409 正常
- [ ] 新建任务弹窗（kbCreate/lkCreate）类别/优先级/责任人下拉正常
- [ ] 状态机管理页（workflow）不受影响

- [ ] **Step 3: 双系统回归（共享文件如有改动）**

本轮未改共享文件（app.css/modal.js/api-base.js 均未动），但 bundle 重建涉及共享模块（api-base/modal/utils）——按 §6.1 需在**样品**与**治具**子系统验证：
- [ ] 打开 sample 子系统首页/列表/看板，确认无 JS 报错
- [ ] 打开 fixture 子系统首页/列表，确认无 JS 报错

- [ ] **Step 4: 文件臃肿检测报告（MUST 输出）**

修改完成后输出 3 项：
1. `routes-stats.js`：行数与字符数、是否预警
2. `routes-tasks.js`：当前约 271 行 + 批量 ~50 行 = ~321 行，<400 行上限（剩余 ~80 行），函数数 ≤10，未触发预警；后续迭代关注（若继续膨胀拆 `routes-task-batch.js`）
3. `list.js`：新增 lkApplyFilters/lkRestoreFromHash/lkExport ≈ +3 个；批量函数已隔离至 list-batch.js（+5 个，独立文件 ≤10）；list.js 顶层函数总数需核验 ≤10

- [ ] **Step 5: 更新 docs（如适用）**

本轮为功能新增，不涉及 AGENTS.md/CLAUDE.md 修改。README 或接口文档如有受影响接口描述，同步更新（如 API 表加上 `POST /api/projects/tasks/batch`）。

- [ ] **Step 6: 最终 Commit（如有文档/修正产生）**

```bash
cd /www/wwwroot/sample-mgmt && sudo -u www git add -A && sudo -u www git commit -m "docs(projects): 迭代1接口文档同步"
```

---

## Self-Review（计划自审）

**Spec coverage（对照设计文档 §3 簇A + §2.5 缺陷#2/#3）：**
- A1 全文搜索 → Task 3 ✓
- A2 多维筛选（类别/优先级/责任人）→ Task 5（列表）+ Task 6（看板）✓
- A3 批量操作（指派/流转/删除 + 跳过统计）→ Task 4（后端）+ Task 5（前端）✓
- A4 URL 化 → Task 5（lkApplyFilters/lkRestoreFromHash）+ Task 6 ✓
- 缺陷#2 users 放宽 → Task 1 ✓
- 缺陷#3 导出筛选 → Task 2 ✓
- bundle 重建 → Task 5/6 ✓
- 双系统回归 → Task 7 ✓
- 容量红线（list.js 拆分）→ Task 5 前置拆分 list-batch.js ✓

**Placeholder scan：** 无 TBD/TODO；所有代码步骤含完整代码或明确「先 Read 现有代码再按现有风格修改」的执行指引；测试用例含断言。

**Type consistency：** `buildTaskWhere` 的 `filters.q`、路由 filters 透传、导出 filters 一致；`lkBatch(action, action2)` 参数与批量路由 `{action, action2, ids}` 一致；`kbLoad` 的 `#kb-category` 等 ID 与渲染一致。
