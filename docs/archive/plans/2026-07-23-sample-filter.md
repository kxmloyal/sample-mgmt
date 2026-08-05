# 样品列表筛选功能优化 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 增强样品列表筛选能力：debounce 搜索 + 部门/逾期筛选 + 排序 + 快捷预设 + 激活标签

**Architecture:** 后端 db.js→server.js 逐层传递 sort/overdue 参数，前端 index.html 重写 viewSamples 渲染展开型筛选栏，loadSamples 读取所有筛选参数构建 URL。同时修复 server.js→db.js 之间 q/search 参数名不匹配的历史 bug。

**Tech Stack:** Node.js + Express + SQLite(sql.js) + 原生 HTML/CSS/JS

**Spec:** [docs/superpowers/specs/2026-07-23-sample-filter-design.md](../specs/2026-07-23-sample-filter-design.md)

---

### Task 1: db.js — 增强 listSamples（修复 q→search + 新增 sort/overdue）

**Files:**
- Modify: `db.js:131-139`

- [ ] **Step 1: 增强 listSamples 函数**

将现有 `listSamples` 替换为增强版。核心变更：
1. 参数名 `search` 不变（server.js 侧修复传参）
2. 新增 `sort` 参数：`-created_at` / `created_at` / `-sample_no` / `sample_no`
3. 新增 `overdue` 参数：`1`=已逾期 / `7`=7天内到期

```js
function listSamples({ status, dept, search, sort, overdue } = {}) {
  const where = []; const params = [];
  if (status) { where.push('status = ?'); params.push(status); }
  if (dept) { where.push('custody_dept = ?'); params.push(dept); }
  if (search) { where.push('(sample_no LIKE ? OR name LIKE ? OR spec LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%'); }
  if (overdue === '1') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now')"); }
  else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now','+7 days')"); }
  let orderBy = 'ORDER BY id DESC';
  if (sort === 'created_at') orderBy = 'ORDER BY created_at ASC';
  else if (sort === '-created_at') orderBy = 'ORDER BY created_at DESC';
  else if (sort === 'sample_no') orderBy = 'ORDER BY sample_no ASC';
  else if (sort === '-sample_no') orderBy = 'ORDER BY sample_no DESC';
  const sql = 'SELECT * FROM samples' + (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ' + orderBy;
  return q(sql, params);
}
```

- [ ] **Step 2: 重启服务并验证**

```bash
sudo fuser -k 4000/tcp 2>/dev/null; sleep 1; cd /www/wwwroot/sample-mgmt && npm start
```

验证逾期筛选：
```bash
curl -s -c /tmp/cookie.txt -X POST http://localhost:4000/api/login -H 'Content-Type: application/json' -d '{"username":"qa01","password":"qa123"}' > /dev/null && curl -s -b /tmp/cookie.txt 'http://localhost:4000/api/samples?overdue=1' | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const a=JSON.parse(d);console.log('overdue count:',a.length);a.forEach(s=>console.log(s.sample_no,s.status,s.next_inspect_at))"
```
Expected: 返回逾期样品（next_inspect_at < now）

- [ ] **Step 3: 提交**

```bash
git add db.js
git commit -m "$(cat <<'EOF'
feat(db): add sort and overdue filter to listSamples

- sort: -created_at/created_at/-sample_no/sample_no
- overdue: 1=expired, 7=due within 7 days
EOF
)"
```

---

### Task 2: server.js — 增强 /api/samples 路由（修复 q→search + 新增 sort/overdue）

**Files:**
- Modify: `server.js:94-98`

- [ ] **Step 1: 增强路由处理**

将现有路由替换为增强版。历史 bug 修复：server.js 传 `q` 但 db.js 期望 `search`，此处统一改为 `search`。

```js
app.get('/api/samples', requireAuth, (req, res) => {
  const { status, dept, q, sort, overdue } = req.query;
  res.json(D.listSamples({
    status: status || undefined,
    dept: dept || undefined,
    search: q || undefined,
    sort: sort || undefined,
    overdue: overdue || undefined
  }));
});
```

- [ ] **Step 2: 验证搜索功能仍然正常（修复 q→search bug 后）**

```bash
curl -s -c /tmp/cookie.txt -X POST http://localhost:4000/api/login -H 'Content-Type: application/json' -d '{"username":"rd01","password":"rd123"}' > /dev/null && curl -s -b /tmp/cookie.txt 'http://localhost:4000/api/samples?q=震动' | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const a=JSON.parse(d);console.log('search results:',a.length);a.forEach(s=>console.log(s.sample_no,s.name))"
```
Expected: 返回名称含"震动"的样品

- [ ] **Step 3: 验证排序**

```bash
curl -s -b /tmp/cookie.txt 'http://localhost:4000/api/samples?sort=sample_no' | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');const a=JSON.parse(d);console.log('sorted by sample_no ASC:');a.forEach(s=>console.log(s.sample_no))"
```
Expected: 按编号升序排列

- [ ] **Step 4: 提交**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
feat(api): add sort/overdue params, fix q→search mismatch

- Pass sort and overdue from query to listSamples
- Fix: server.js was passing 'q' but db.js expected 'search'
EOF
)"
```

---

### Task 3: index.html — 精简冗余 CSS，为新增筛选代码腾空间

**Files:**
- Modify: `public/index.html:104`（CSS 区域）

- [ ] **Step 1: 移除空媒体查询和冗余 CSS**

移除第 104 行空媒体查询 `@media(min-width:768px){}`（1 行）。

将第 106-110 行两个媒体查询合并压缩：
```css
@media(min-width:1200px){.modal{width:800px}}
@media(min-width:1600px){.modal{width:900px}}
```
替换原来的：
```css
@media(min-width:1200px){
  .modal{width:800px}
}
@media(min-width:1600px){
  .modal{width:900px}
}
```
节省 ~1 行。

将 `.modal h3{margin:0}` 合并到 `.modal-head` 或 `.modal-body` 附近以减少单独规则行。

- [ ] **Step 2: 验证页面渲染不变**

刷新 http://localhost:4000，确认登录页、样品列表、详情弹窗样式不变。

- [ ] **Step 3: 提交**

```bash
git add public/index.html
git commit -m "$(cat <<'EOF'
style: slim down CSS, remove empty media query

Free up ~3 lines for upcoming filter bar additions.
EOF
)"
```

---

### Task 4: index.html — 重写 viewSamples + loadSamples（筛选栏 + debounce + 芯片 + 预设）

**Files:**
- Modify: `public/index.html:246-258`（viewSamples + loadSamples）

- [ ] **Step 1: 重写 viewSamples 函数**

替换现有 `viewSamples`（当前第 246-250 行）。新增：
- 状态下拉改为中文选项
- 新增部门下拉 + 排序下拉
- 快捷预设行：待处理 / 逾期 / 近7天
- 激活标签行
- debounce 搜索 300ms

```js
var _debounceTimer=null;
function debounceSearch(){clearTimeout(_debounceTimer);_debounceTimer=setTimeout(loadSamples,300);}
async function viewSamples(){
  var v=$('#view');
  var stOpts='<option value="">全部状态</option><option value="NEW">待制作</option><option value="PRODUCED">制作完成</option><option value="RELEASED">已发行</option><option value="IN_CUSTODY">保管中</option>';
  var deptOpts='<option value="">全部部门</option><option value="研发中心">研发中心</option><option value="品保文管中心">品保文管中心</option><option value="制造部">制造部</option><option value="FQC">FQC</option><option value="生技部">生技部</option>';
  var sortOpts='<option value="">排序：最新优先</option><option value="-created_at">最早优先</option><option value="sample_no">编号升序</option><option value="-sample_no">编号降序</option>';
  v.innerHTML='<div class="filters"><input id="f-q" placeholder="搜索编号/名称/规格" oninput="debounceSearch()"/>'+
    '<select id="f-status" onchange="loadSamples()">'+stOpts+'</select>'+
    '<select id="f-dept" onchange="loadSamples()">'+deptOpts+'</select>'+
    '<select id="f-sort" onchange="loadSamples()">'+sortOpts+'</select>'+
    '<button class="btn sm" onclick="loadSamples()">查询</button></div>'+
    '<div class="filters" style="margin-bottom:14px;align-items:center">'+
    '<span style="font-size:12px;color:var(--muted)">快捷：</span>'+
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'pending\')">待处理</a>'+
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'overdue\')">逾期</a>'+
    '<a class="link" style="font-size:12px" onclick="quickFilter(\'soon\')">近7天</a>'+
    '<span id="f-chips" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:10px"></span></div>'+
    '<div id="s-list"></div>';
  loadSamples();
}
```

- [ ] **Step 2: 重写 loadSamples 函数**

替换现有 `loadSamples`（当前第 251-258 行）。新增读取所有筛选参数、构建激活标签。

```js
async function loadSamples(){
  var q=$('#f-q').value,st=$('#f-status').value,dept=$('#f-dept').value,sort=$('#f-sort').value;
  var params='';
  if(q)params+='&q='+encodeURIComponent(q);
  if(st)params+='&status='+st;
  if(dept)params+='&dept='+encodeURIComponent(dept);
  if(sort)params+='&sort='+sort;
  var list=await api('GET','/api/samples?'+params.substring(1));
  var box=$('#s-list');
  if(!list.length){box.innerHTML='<div class="empty">无样品</div>';}
  else{box.innerHTML='<div class="card" style="padding:0"><table><tr><th>编号</th><th>名称</th><th>机型/站别</th><th>图片</th><th>规格</th><th>状态</th><th>制作</th><th>发行</th><th>保管部门/储位</th><th></th></tr>'+
    list.map(s=>'<tr><td>'+s.sample_no+'</td><td>'+(s.name||'—')+'</td><td class="muted">'+(s.model||'—')+(s.station?(' · '+s.station):'')+'</td><td>'+((s.produced_image||s.image)?'<img src="'+(s.produced_image||s.image)+'" width="40" style="border-radius:4px"/>':'—')+'</td><td class="muted">'+(s.spec||'—')+'</td><td>'+statusBadge(s)+'</td><td class="muted">'+fmt(s.produced_at)+'</td><td class="muted">'+fmt(s.released_at)+'</td><td class="muted">'+(s.custody_dept||'—')+'/'+(s.storage_location||'—')+'</td><td>'+(s.status==='NEW'?'<a class="link" style="margin-right:8px" onclick="event.stopPropagation();printSampleLabel('+s.id+')">打印</a>':'')+'<a class="link" style="margin-right:8px" onclick="event.stopPropagation();downloadQR('+s.id+')">下载QR</a>'+((s.status==='NEW'||s.status==='PRODUCED')&&(me.role==='ADMIN'||me.role==='RND'||s.created_by===me.id)?'<a class="link" style="margin-right:8px;color:var(--bad)" onclick="event.stopPropagation();deleteSample('+s.id+')">取消</a>':'')+'<a class="link" onclick="viewDetail('+s.id+')">详情</a></td></tr>').join('')+'</table></div>';}
  renderChips();
}
```

- [ ] **Step 3: 新增辅助函数**

在 `deleteSample` 函数之后（第 429 行后）新增快捷筛选和芯片渲染函数：

```js
function quickFilter(type){
  if(type==='pending'){$('#f-status').value=me.role==='RND'?'NEW':me.role==='QA'?'PRODUCED':me.role==='CUSTODY'?'RELEASED':'';$('#f-dept').value='';}
  else if(type==='overdue'){loadSamplesOverdue('1');return;}
  else if(type==='soon'){loadSamplesOverdue('7');return;}
  loadSamples();
}
function loadSamplesOverdue(v){
  $('#f-status').value='';$('#f-dept').value='';
  var q=$('#f-q').value,sort=$('#f-sort').value;
  var params='overdue='+v;
  if(q)params+='&q='+encodeURIComponent(q);
  if(sort)params+='&sort='+sort;
  api('GET','/api/samples?'+params).then(function(list){
    var box=$('#s-list');
    if(!list.length){box.innerHTML='<div class="empty">无逾期/即将到期样品</div>';}
    else{box.innerHTML='<div class="card" style="padding:0"><table><tr><th>编号</th><th>名称</th><th>机型/站别</th><th>图片</th><th>规格</th><th>状态</th><th>制作</th><th>发行</th><th>保管部门/储位</th><th>复检到期</th><th></th></tr>'+
      list.map(function(s){return '<tr><td>'+s.sample_no+'</td><td>'+(s.name||'—')+'</td><td class="muted">'+(s.model||'—')+(s.station?(' · '+s.station):'')+'</td><td>'+((s.produced_image||s.image)?'<img src="'+(s.produced_image||s.image)+'" width="40" style="border-radius:4px"/>':'—')+'</td><td class="muted">'+(s.spec||'—')+'</td><td>'+statusBadge(s)+'</td><td class="muted">'+fmt(s.produced_at)+'</td><td class="muted">'+fmt(s.released_at)+'</td><td class="muted">'+(s.custody_dept||'—')+'/'+(s.storage_location||'—')+'</td><td class="'+(new Date(s.next_inspect_at).getTime()<Date.now()?'b-overdue':'muted')+'">'+fmt(s.next_inspect_at)+'</td><td><a class="link" onclick="viewDetail('+s.id+')">详情</a></td></tr>';}).join('')+'</table></div>';}
    renderChips();
  });
}
function renderChips(){
  var chips=$('#f-chips');if(!chips)return;
  var html='',st=$('#f-status').value,dept=$('#f-dept').value,sort=$('#f-sort').value;
  var stLabels={NEW:'待制作',PRODUCED:'制作完成',RELEASED:'已发行',IN_CUSTODY:'保管中'};
  if(st)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-status\').value=\'\';loadSamples()">'+(stLabels[st]||st)+' ✕</span>';
  if(dept)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-dept\').value=\'\';loadSamples()">'+dept+' ✕</span>';
  if(sort)html+='<span class="chip done" style="cursor:pointer" onclick="$(\'#f-sort\').value=\'\';loadSamples()">排序 ✕</span>';
  chips.innerHTML=html;
}
```

- [ ] **Step 4: 刷新页面验证**

打开 http://localhost:4000，登录 rd01：
- 筛选栏应显示 5 个控件（搜索/状态下拉/部门/排序/查询按钮）
- 第二行显示快捷预设：待处理 / 逾期 / 近7天
- 选中状态下拉 → 出现激活标签 chip，点击 ✕ 可移除
- 输入搜索内容 300ms 后自动刷新列表
- 各角色「待处理」预设有不同行为

- [ ] **Step 5: 提交**

```bash
git add public/index.html
git commit -m "$(cat <<'EOF'
feat(filter): rewrite sample list with expanded filter bar

- Add debounce search (300ms), dept/sort dropdowns
- Quick presets: pending (role-aware), overdue, soon
- Active filter chips with remove
- Chinese status labels in dropdown
- Fix overdue rows show extra '复检到期' column
EOF
)"
```

---

### Task 5: tests — 新增筛选/排序测试用例

**Files:**
- Modify: `tests/samples.test.js`

- [ ] **Step 1: 新增测试用例**

在文件末尾 `})` 之前新增 describe 块：

```js
describe('GET /api/samples — filtering & sorting', () => {
  it('should filter by department', async () => {
    const res = await request(app).get('/api/samples?dept=制造部').set('Cookie', rdCookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    for (const s of res.body) expect(s.custody_dept).toBe('制造部');
  });

  it('should sort by sample_no ascending', async () => {
    const res = await request(app).get('/api/samples?sort=sample_no').set('Cookie', rdCookie);
    expect(res.status).toBe(200);
    for (let i = 1; i < res.body.length; i++)
      expect(res.body[i].sample_no >= res.body[i-1].sample_no).toBe(true);
  });

  it('should sort by created_at descending', async () => {
    const res = await request(app).get('/api/samples?sort=-created_at').set('Cookie', rdCookie);
    expect(res.status).toBe(200);
    for (let i = 1; i < res.body.length; i++)
      expect(new Date(res.body[i].created_at) <= new Date(res.body[i-1].created_at)).toBe(true);
  });

  it('should return overdue samples (overdue=1)', async () => {
    const res = await request(app).get('/api/samples?overdue=1').set('Cookie', rdCookie);
    expect(res.status).toBe(200);
    const now = new Date().toISOString();
    for (const s of res.body) {
      expect(s.status).toBe('IN_CUSTODY');
      expect(new Date(s.next_inspect_at).toISOString() < now).toBe(true);
    }
  });

  it('should filter overdue within 7 days (overdue=7)', async () => {
    const res = await request(app).get('/api/samples?overdue=7').set('Cookie', rdCookie);
    expect(res.status).toBe(200);
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString();
    for (const s of res.body) {
      expect(s.status).toBe('IN_CUSTODY');
      expect(new Date(s.next_inspect_at).toISOString() < in7Days).toBe(true);
    }
  });

  it('should combine search, status, sort', async () => {
    const res = await request(app).get('/api/samples?q=SM&status=NEW&sort=-created_at').set('Cookie', rdCookie);
    expect(res.status).toBe(200);
    for (const s of res.body) expect(s.status).toBe('NEW');
    for (const s of res.body) expect(s.sample_no.includes('SM')).toBe(true);
    for (let i = 1; i < res.body.length; i++)
      expect(new Date(res.body[i].created_at) <= new Date(res.body[i-1].created_at)).toBe(true);
  });
});
```

- [ ] **Step 2: 运行全部测试**

```bash
cd /www/wwwroot/sample-mgmt && npm test
```
Expected: 所有测试通过（原 18 条 + 新增 6 条 = 24 条）

- [ ] **Step 3: 提交**

```bash
git add tests/samples.test.js
git commit -m "$(cat <<'EOF'
test: add filter/sort/overdue test cases for listSamples

- dept filter, sort ascending/descending
- overdue=1 (expired) and overdue=7 (within 7 days)
- combined search+status+sort
EOF
)"
```

---

### Task 6: 回归验证 + 最终提交

- [ ] **Step 1: 运行全部测试确认**

```bash
cd /www/wwwroot/sample-mgmt && npm test 2>&1
```
Expected: 24 tests passed, 0 failures

- [ ] **Step 2: 手工验证完整流程**

以 rd01 登录 http://localhost:4000：
1. 样品列表 → 筛选栏显示 5 个控件 + 快捷预设
2. 选择状态「待制作」→ 列表过滤，出现 chip
3. 搜索框输入 → 300ms 后自动更新列表
4. 点击「待处理」→ 自动筛选 NEW 样品
5. 点击「逾期」→ 显示逾期样品（含复检到期列）
6. 选择部门 → 过滤 + chip
7. 选择排序「编号升序」→ 列表重新排列
8. 点击 chip × → 移除条件 + 刷新

- [ ] **Step 3: 最终提交**

```bash
git add -A && git status
```

确认只包含预期的 4 个文件变更后：

```bash
git commit -m "$(cat <<'EOF'
feat(filter): add expanded filter bar with debounce, presets, sorting

- Frontend: 5-filter controls (search/dept/status/sort/button)
- Quick presets: pending (role-aware), overdue, soon (7 days)
- Active filter chips with remove
- Debounce search 300ms, Chinese status labels
- Backend: sort (-created_at/created_at/-sample_no/sample_no)
- Backend: overdue filter (1=expired, 7=within 7 days)
- Fix: server.js→db.js q/search parameter mismatch
- Tests: 6 new filter/sort/overdue test cases
EOF
)"
```
