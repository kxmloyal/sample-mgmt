# 样品列表筛选功能修复 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复样品列表筛选功能的5个问题：近7天SQL含逾期、QA待处理缺RETURNING、逾期筛选不支持标示卡字段、Chips不显示快速筛选态、后端不支持多状态查询。

**Architecture:** 后端 db/samples.js 改2处SQL（多状态支持 + 近7天范围修正），前端 samples.js 新增 `_quickFilterType` 跟踪状态变量 + `_renderSampleList` 提取公共渲染 + `loadSamplesWithStatus` 多状态查询 + `clearQuickFilter` 清除方法。

**Tech Stack:** Node.js + Express + SQLite + 原生 JS

**Files to modify:**
- `db/samples.js` — 后端 SQL 过滤逻辑（2处修改）
- `public/js/samples.js` — 前端筛选 UI 逻辑（4处修改 + 2个新函数 + 1个重构函数）

---

### Task 1: 后端 — 修复近7天SQL + 支持多状态查询

**Files:**
- Modify: `db/samples.js:37-42`

- [ ] **Step 1: 修改 status 参数支持逗号分隔多值**

将 `db/samples.js` 第37行的单值匹配改为支持逗号分隔：

```js
// 修改前（db/samples.js:37）
if (status) { where.push('status = ?'); params.push(status); }

// 修改后
if (status) {
  const statuses = status.split(',').filter(function(s){return s;});
  if (statuses.length === 1) { where.push('status = ?'); params.push(statuses[0]); }
  else { where.push('status IN (' + statuses.map(function(){return '?';}).join(',') + ')'); params.push.apply(params, statuses); }
}
```

- [ ] **Step 2: 修复近7天SQL，排除已逾期样品**

将 `db/samples.js` 第42行的 overdue 条件改为包含下界：

```js
// 修改前（db/samples.js:42）
else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at < datetime('now','+7 days')"); }

// 修改后
else if (overdue === '7') { where.push("status='IN_CUSTODY' AND next_inspect_at IS NOT NULL AND next_inspect_at >= datetime('now') AND next_inspect_at < datetime('now','+7 days')"); }
```

- [ ] **Step 3: 语法验证**

Run: `cd /www/wwwroot/sample-mgmt && node -c db/samples.js`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add db/samples.js && git commit -m "fix(db): support multi-status query and fix near-7-day SQL range

- status param now supports comma-separated values (e.g. PRODUCED,RETURNING)
- overdue=7 now uses BETWEEN now AND now+7 instead of < now+7
- Fixes Bug 1 (near-7-day includes overdue) and Bug 5 (no multi-status support)"
```

---

### Task 2: 前端 — 新增 `_renderSampleList` 提取公共渲染逻辑

**Files:**
- Modify: `public/js/samples.js:38-43`

`loadSamples` 的列表渲染代码与 `loadSamplesOverdue` 高度重复，且新函数 `loadSamplesWithStatus` 也将需要相同逻辑。提取为公共函数避免三重复制。

- [ ] **Step 1: 提取 `_renderSampleList` 函数**

在 `public/js/samples.js` 中，在 `loadSamples` 函数之前插入新的公共渲染函数：

```js
function _renderSampleList(list, isOverdue){
  var box=$('#s-list');
  if(!list.length){box.innerHTML='<div class="empty">'+(isOverdue?'无逾期/即将到期样品':'无样品')+'</div>';return;}
  var cols=isOverdue?
    '<tr><th>编号</th><th>名称</th><th>机型/站别</th><th>图片</th><th>规格</th><th>类型</th><th>状态</th><th>制作</th><th>发行</th><th>保管部门/储位</th><th>复检到期</th><th></th></tr>':
    '<tr><th>编号</th><th>名称</th><th>机型/站别</th><th>图片</th><th>规格</th><th>类型</th><th>状态</th><th>制作</th><th>发行</th><th>保管部门/储位</th><th></th></tr>';
  var rows=list.map(function(s){
    var imgCell=s.produced_image||s.image?'<img src="'+(s.produced_image||s.image)+'" width="40" style="border-radius:4px"/>':'—';
    var typeCell=s.sample_type?'<span class="badge" style="background:'+(s.sample_type==='OK'?'#16a34a':'#dc2626')+';color:#fff">'+stLabel(s.sample_type)+'</span>':'—';
    var actions='<a class="link" onclick="viewDetail('+s.id+')">详情</a>';
    if(s.status==='NEW') actions='<a class="link" style="margin-right:8px" onclick="event.stopPropagation();printSampleLabel('+s.id+')">打印</a>'+actions;
    actions='<a class="link" style="margin-right:8px" onclick="event.stopPropagation();downloadQR('+s.id+')">下载QR</a>'+actions;
    if((s.status==='NEW'||s.status==='PRODUCED')&&(me.role==='ADMIN'||me.role==='RD'||s.created_by===me.id))
      actions='<a class="link" style="margin-right:8px;color:var(--bad)" onclick="event.stopPropagation();deleteSample('+s.id+')">取消</a>'+actions;
    var overdueCell=isOverdue?'<td class="'+(new Date(s.next_inspect_at).getTime()<Date.now()?'b-overdue':'muted')+'">'+fmt(s.next_inspect_at)+'</td>':'';
    return '<tr><td>'+s.sample_no+'</td><td>'+(s.name||'—')+'</td><td class="muted">'+(s.model||'—')+(s.station?(' · '+s.station):'')+'</td><td>'+imgCell+'</td><td class="muted">'+(s.spec||'—')+'</td><td>'+typeCell+'</td><td>'+statusBadge(s)+'</td><td class="muted">'+fmt(s.produced_at)+'</td><td class="muted">'+fmt(s.released_at)+'</td><td class="muted">'+(s.custody_dept||'—')+'/'+(s.storage_location||'—')+'</td>'+overdueCell+'<td>'+actions+'</td></tr>';
  });
  box.innerHTML='<div class="card" style="padding:0"><table>'+cols+rows.join('')+'</table></div>';
}
```

- [ ] **Step 2: 修改 `loadSamples` 使用 `_renderSampleList`**

将 `loadSamples` 中 L38-L43 的渲染代码替换为调用公共函数：

```js
// 删除 loadSamples 中的以下代码（L38-L43）：
//   var box=$('#s-list');
//   if(!list.length){box.innerHTML='<div class="empty">无样品</div>';}
//   else{box.innerHTML='<div class="card"...'+

// 替换为：
  _renderSampleList(list, false);
  renderChips();
```

- [ ] **Step 3: 修改 `loadSamplesOverdue` 使用 `_renderSampleList`**

将 `loadSamplesOverdue` 中 L66-L71 的渲染代码替换为调用公共函数：

```js
// 删除 loadSamplesOverdue 中的以下代码（L66-L71）：
//   var box=$('#s-list');
//   if(!list.length){box.innerHTML='<div class="empty">无逾期/即将到期样品</div>';}
//   else{box.innerHTML='<div class="card"...'+

// 替换为：
  _renderSampleList(list, true);
  renderChips();
```

- [ ] **Step 4: 语法验证**

Run: `cd /www/wwwroot/sample-mgmt && node -c public/js/samples.js`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/samples.js && git commit -m "refactor(samples): extract _renderSampleList to eliminate triple rendering duplication

- loadSamples and loadSamplesOverdue now share _renderSampleList(list, isOverdue)
- Prepares for loadSamplesWithStatus which needs same rendering logic"
```

---

### Task 3: 前端 — 修复快速筛选 + 补参数 + 新增 Chips

**Files:**
- Modify: `public/js/samples.js:53-85`

修复 Bug 2（QA待处理缺RETURNING）、Bug 3（逾期筛选不支持标示卡字段）、Bug 4（Chips不显示快速筛选态）。

- [ ] **Step 1: 新增全局状态变量**

在 `public/js/samples.js` 文件顶部（`_debounceTimer` 之后）添加：

```js
var _quickFilterType=null;
```

- [ ] **Step 2: 新增 `loadSamplesWithStatus` 函数**

在 `deleteSample` 函数之后插入：

```js
function loadSamplesWithStatus(statusStr){
  var q=$('#f-q').value,dept=$('#f-dept').value,sort=$('#f-sort').value;
  var tp=$('#f-type').value,li=$('#f-limit-item').value,src=$('#f-source').value;
  var params='status='+statusStr;
  if(q)params+='&q='+encodeURIComponent(q);
  if(dept)params+='&dept='+encodeURIComponent(dept);
  if(sort)params+='&sort='+sort;
  if(tp)params+='&sample_type='+tp;
  if(li)params+='&limit_item='+li;
  if(src)params+='&source_type='+src;
  api('GET','/api/samples?'+params).then(function(list){
    _renderSampleList(list,false);
    renderChips();
  });
}
```

- [ ] **Step 3: 修改 `quickFilter` 函数**

将原 `quickFilter` 改为使用 `_quickFilterType` + 新的多状态方法：

```js
function quickFilter(type){
  _quickFilterType=type;
  if(type==='pending'){
    var st=me.role==='RD'?'NEW':me.role==='QA'?'PRODUCED,RETURNING':(me.role==='CUSTODY'||me.role==='ME')?'RELEASED':'';
    $('#f-status').value='';$('#f-dept').value='';
    loadSamplesWithStatus(st);
    return;
  }
  if(type==='overdue'){loadSamplesOverdue('1');return;}
  if(type==='soon'){loadSamplesOverdue('7');return;}
}
```

- [ ] **Step 4: 修改 `loadSamplesOverdue` 补传标示卡字段参数**

在 `loadSamplesOverdue` 函数中，新增读取 `sample_type/limit_item/source_type` 并传给后端：

```js
function loadSamplesOverdue(v){
  _quickFilterType=v==='1'?'overdue':'soon';
  $('#f-status').value='';$('#f-dept').value='';
  var q=$('#f-q').value,sort=$('#f-sort').value;
  var tp=$('#f-type').value,li=$('#f-limit-item').value,src=$('#f-source').value;
  var params='overdue='+v;
  if(q)params+='&q='+encodeURIComponent(q);
  if(sort)params+='&sort='+sort;
  if(tp)params+='&sample_type='+tp;
  if(li)params+='&limit_item='+li;
  if(src)params+='&source_type='+src;
  api('GET','/api/samples?'+params).then(function(list){
    _renderSampleList(list,true);
    renderChips();
  });
}
```

- [ ] **Step 5: 修改 `loadSamples` 重置 `_quickFilterType`**

在 `loadSamples` 函数开头（变量声明之后）添加：

```js
async function loadSamples(){
  _quickFilterType=null;
  var q=$('#f-q').value,... // 现有代码
```

- [ ] **Step 6: 修改 `renderChips` 新增快速筛选芯片**

在 `renderChips` 函数中，在现有 chips 渲染之后（`chips.innerHTML=html` 之前）添加：

```js
  if(_quickFilterType==='pending')html+='<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">待处理 ✕</span>';
  if(_quickFilterType==='overdue')html+='<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">逾期 ✕</span>';
  if(_quickFilterType==='soon')html+='<span class="chip done" style="cursor:pointer" onclick="clearQuickFilter()">近7天 ✕</span>';
```

- [ ] **Step 7: 新增 `clearQuickFilter` 函数**

在 `renderChips` 之后添加：

```js
function clearQuickFilter(){
  _quickFilterType=null;
  $('#f-status').value='';$('#f-dept').value='';
  loadSamples();
}
```

- [ ] **Step 8: 语法验证**

Run: `cd /www/wwwroot/sample-mgmt && node -c public/js/samples.js`
Expected: No errors.

- [ ] **Step 9: Commit**

```bash
cd /www/wwwroot/sample-mgmt && git add public/js/samples.js && git commit -m "fix(samples): fix 3 quick-filter bugs + add chips

- Bug 2: QA pending now includes RETURNING (PRODUCED,RETURNING)
- Bug 3: overdue/due-soon filters now pass sample_type/limit_item/source_type
- Bug 4: chips show active quick-filter (pending/overdue/soon) with clear action
- Add _quickFilterType state var, loadSamplesWithStatus, clearQuickFilter"
```

---

### Task 4: 端到端验证

- [ ] **Step 1: 重启服务**

```bash
# 宝塔面板 PM2 管理器 → 重启 sample-mgmt
```

- [ ] **Step 2: 用 browser_use subagent 执行以下回归步骤：**

登录 rd01/rd123 → 样品列表：
1. 点击「待处理」→ 仅显示 NEW 状态样品，Chips 栏显示「待处理 ✕」
2. 点击 ✕ 清除 → 恢复全部列表
3. 选状态「制作完成」→ 列表只显示 PRODUCED，Chips 显示「制作完成 ✕」

登录 qa01/qa123 → 样品列表：
4. 点击「待处理」→ 显示 PRODUCED + RETURNING 两种状态（Bug 2 验证）
5. 筛选类型「OK样品」+ 待处理 → 联动正常
6. 点击「近7天」→ 结果不包含已逾期的样品（Bug 1 验证）
7. 点击「逾期」+ 类型「NG样品」→ 联动正常（Bug 3 验证）
8. Chips 栏分别显示对应标签（Bug 4 验证）

登录 mfg01/mfg123 → 样品列表：
9. 点击「逾期」→ 只显示已过复检日期的 IN_CUSTODY 样品
10. 点击「近7天」→ 只显示7天内到期的 IN_CUSTODY 样品

- [ ] **Step 3: 验证看板数据一致性**

检查各角色看板的「待处理」数量是否与列表筛选一致。

---

### Task 5: 臃肿检测报告

- [ ] **Step 1: 输出最终臃肿检测**

| 文件 | 类型 | 行数 | 字符 | 上限 | 使用率 | 顶层函数 | 状态 |
|------|------|------|------|------|--------|---------|------|
| `db/samples.js` | DAO | ~86(+4) | — | 300行脚本 | 28.7% | 7 | 安全 |
| `public/js/samples.js` | 前端模块 | ~110(+25) | — | 300行 | 36.7% | 10 | 安全(刚达上限) |

冗余清单：Task 2 中提取 `_renderSampleList` 已消除 `loadSamples` 与 `loadSamplesOverdue` 之间的 ~10行重复渲染代码。

- [ ] **Step 2: Commit（如有文档更新）**

```bash
cd /www/wwwroot/sample-mgmt && git add . && git commit -m "docs: update operation manual for filter fixes" || echo "No doc changes needed"
```
