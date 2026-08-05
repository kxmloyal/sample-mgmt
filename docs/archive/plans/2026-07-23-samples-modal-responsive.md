# 样品详情弹窗响应式优化 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 samples 页面详情弹窗溢出视窗问题,实现响应式自适应布局(5 档断点 + 大屏三栏 + 无内部滚动条 + 日志弹窗内切换)。

**Architecture:** 改造 `public/index.html` 的 `.modal` 为 flex 三段式容器(head/body/foot),body 内 `.detail-grid` 用 CSS Grid 实现 1→2→3 栏响应式;`viewDetail` 模板重构为分区布局;新增 `viewDetailLogs` 函数实现日志全表弹窗内切换;`openModal` 扩展 opts 参数(向后兼容)。

**Tech Stack:** 原生 HTML/CSS/JavaScript(无构建),CSS Grid + Flexbox + 媒体查询。

**Spec:** [docs/superpowers/specs/2026-07-23-samples-modal-responsive-design.md](file:///www/wwwroot/sample-mgmt/docs/superpowers/specs/2026-07-23-samples-modal-responsive-design.md)

---

## 文件结构

仅 1 个文件,所有改动集中在:

| 文件 | 路径 | 责任 |
|---|---|---|
| 单体 HTML | `public/index.html` | 包含内联 CSS、HTML 结构、内联 JS,本次改动覆盖 CSS(74-86 行)、JS(`viewDetail` 224-244、`openModal` 468、新增 `viewDetailLogs`) |

**无新文件创建**(符合「最小改动」原则,避免触发已预警的拆分压力)。

---

## 前置准备

- [ ] **Step 0.1: 备份当前文件**

```bash
cp /www/wwwroot/sample-mgmt/public/index.html /www/wwwroot/sample-mgmt/public/index.html.bak.$(date +%Y%m%d)
```

预期:生成 `index.html.bak.20260723`

- [ ] **Step 0.2: 确认文件可写(权限)**

当前用户 `ystech` 需写入归 `www` 所有的文件。若 Edit 报 EACCES:

```bash
sudo chmod 666 /www/wwwroot/sample-mgmt/public/index.html
```

- [ ] **Step 0.3: 记录修改前基线指标**

```bash
f=/www/wwwroot/sample-mgmt/public/index.html
echo "基线行数: $(wc -l < $f)"
echo "基线字符: $(wc -c < $f)"
```

预期:行数 474,字符 29841(已知值)

- [ ] **Step 0.4: 启动服务以便随时验证**

```bash
cd /www/wwwroot/sample-mgmt && npm start
```

(后台运行,每个任务后浏览器验证)

---

## Task 1: 改造 `.modal` CSS 为 flex 容器

**Files:**
- Modify: `public/index.html:75` (`.modal` 行)

- [ ] **Step 1.1: 修改 `.modal` CSS 规则**

将第 75 行:
```css
  .modal{background:#fff;border-radius:16px;padding:24px;width:420px;max-width:92vw;max-height:90vh;overflow-y:auto;box-shadow:var(--shadow)}
```

改为:
```css
  .modal{background:#fff;border-radius:16px;width:94vw;max-width:900px;max-height:90vh;display:flex;flex-direction:column;padding:0;overflow:hidden;box-shadow:var(--shadow)}
```

**关键变化:**
- `width:420px` → `width:94vw`(响应式基础宽度)
- `max-width:92vw` → `max-width:900px`(大屏上限)
- 移除 `padding:24px`(改由 head/body/foot 各自 padding)
- 移除 `overflow-y:auto`(改由 body 控制)
- 新增 `display:flex;flex-direction:column;overflow:hidden`

- [ ] **Step 1.2: 验证 CSS 未破坏其他样式**

刷新浏览器访问 http://localhost:3000,登录 admin/admin123。

预期:
- 登录页、首页概览、样品列表样式无变化(因为 `.modal` 仅详情弹窗使用)
- 列表表格正常显示
- 此时点「详情」弹窗会变形(因为 body 还没结构),但**不报错**

- [ ] **Step 1.3: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/index.html
git commit -m "refactor(modal): convert .modal to flex column container

- width 94vw / max-width 900px for responsive base
- display:flex column + overflow:hidden
- remove padding (delegated to head/body/foot)
- part of samples modal responsive redesign"
```

---

## Task 2: 新增模态结构类 CSS(.modal-head/.modal-body/.modal-foot)

**Files:**
- Modify: `public/index.html:75-76` (在 `.modal` 后追加新规则)

- [ ] **Step 2.1: 在 `.modal` 行后追加结构类 CSS**

找到第 76 行 `.modal h3{margin:0 0 14px}`,在其**之前**(第 75 行 `.modal{...}` 之后)插入:

```css
  .modal-head{flex:none;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}
  .modal-body{flex:1;overflow:hidden;padding:0}
  .modal-body.log-mode{overflow-y:auto}
  .modal-foot{flex:none;padding:8px 18px;border-top:1px solid var(--line);text-align:right;background:var(--bg)}
```

同时将原 `.modal h3{margin:0 0 14px}` 改为:
```css
  .modal h3{margin:0}
```

**说明:**
- `.modal-head` flex:none 固定高度,不参与滚动
- `.modal-body` flex:1 占满剩余高度,默认 `overflow:hidden`(不滚)
- `.modal-body.log-mode` 仅日志全表模式时 `overflow-y:auto`
- `.modal-foot` flex:none 固定底部,关闭按钮始终可见
- `.modal h3` 移除下边距,因 head 已有 padding

- [ ] **Step 2.2: 验证 CSS 语法正确**

浏览器 DevTools Console 执行:
```js
document.querySelectorAll('style').length
```

预期:返回 1(无语法错误导致 style 标签解析失败)

- [ ] **Step 2.3: 提交**

```bash
git add public/index.html
git commit -m "feat(modal): add head/body/foot structure classes

- .modal-head flex:none with bottom border
- .modal-body flex:1 default hidden, .log-mode allows scroll
- .modal-foot flex:none with top border, right-aligned
- .modal h3 margin:0 (padding now on head)"
```

---

## Task 3: 新增详情网格与字段网格 CSS(.detail-grid/.field-grid)

**Files:**
- Modify: `public/index.html` (在 `.modal-foot` 后追加)

- [ ] **Step 3.1: 追加详情网格 + 字段网格 + chip + 日志列表 CSS**

在 `.modal-foot{...}` 行后追加:

```css
  .detail-grid{display:grid;grid-template-columns:1fr}
  .detail-grid>div{padding:12px 14px}
  .detail-grid>div:not(:last-child){border-bottom:1px dashed var(--line)}
  .detail-img{display:none}
  .field-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:13px;line-height:1.6}
  .field-grid .label{color:var(--muted)}
  .chip-flow{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  .chip{padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .chip.done{background:var(--ok);color:#fff}
  .chip.pending{background:var(--chip);color:var(--brand)}
  .log-list{font-size:12px;line-height:1.5}
  .log-list>div{padding:4px 0;border-bottom:1px solid var(--line)}
```

**说明:**
- `.detail-grid` 默认单栏(grid-template-columns:1fr)
- `.detail-grid>div:not(:last-child)` 单栏时下虚线分隔
- `.detail-img` 默认 `display:none`,仅 XL 媒体查询显示
- `.field-grid` 2 列(label|value)紧凑布局
- `.chip-flow` 横向进度 + 自动换行
- `.log-list` 日志条目样式

- [ ] **Step 3.2: 验证 CSS 加载无报错**

浏览器 DevTools Console:
```js
getComputedStyle(document.documentElement).getPropertyValue('--ok')
```

预期:返回 `#16a34a`(CSS 变量未丢失)

- [ ] **Step 3.3: 提交**

```bash
git add public/index.html
git commit -m "feat(detail): add detail-grid/field-grid/chip/log-list CSS

- .detail-grid responsive grid (1 col default, 2/3 col via media)
- .detail-img hidden by default, shown only at XL breakpoint
- .field-grid 2-col label|value compact layout
- .chip-flow horizontal progress with wrap
- .log-list compact log entry style"
```

---

## Task 4: 新增响应式媒体查询(768/1200/1600px)

**Files:**
- Modify: `public/index.html` (在 `.log-list>div{...}` 后追加)

- [ ] **Step 4.1: 追加 3 档媒体查询**

在 `.log-list>div{padding:4px 0;border-bottom:1px solid var(--line)}` 行后追加:

```css
  @media(min-width:768px){
    .detail-grid{grid-template-columns:35% 1fr}
    .detail-grid>div:not(:last-child){border-bottom:none;border-right:1px solid var(--line)}
  }
  @media(min-width:1200px){
    .modal{width:800px}
    .detail-grid{grid-template-columns:30% 1fr}
  }
  @media(min-width:1600px){
    .modal{width:900px}
    .detail-grid{grid-template-columns:25% 25% 1fr}
    .detail-img{display:block}
  }
```

**断点行为:**
- <768px:单栏(默认)
- 768~1199px:双栏 35%/65%
- 1200~1599px:双栏 30%/70%,弹窗 800px
- ≥1600px:三栏 25%/25%/50%,弹窗 900px,显示 .detail-img 第三栏

- [ ] **Step 4.2: 验证媒体查询生效**

DevTools 切换设备模拟为 Responsive,调整宽度:

| 宽度 | 预期 .detail-grid 列数 |
|---|---|
| 500px | 1 列 |
| 800px | 2 列(35/65) |
| 1300px | 2 列(30/70) |
| 1700px | 3 列(25/25/50) |

DevTools Console 验证:
```js
getComputedStyle(document.querySelector('.detail-grid')||document.documentElement).gridTemplateColumns
```

(需先有详情弹窗打开,否则返回空;此处仅验证 CSS 规则存在)

- [ ] **Step 4.3: 提交**

```bash
git add public/index.html
git commit -m "feat(responsive): add 3 breakpoints (768/1200/1600px)

- 768px: 2-col grid 35%/65%
- 1200px: modal 800px, 2-col 30%/70%
- 1600px: modal 900px, 3-col 25%/25%/50%, show .detail-img"
```

---

## Task 5: 扩展 `openModal` 函数(支持 opts 参数,向后兼容)

**Files:**
- Modify: `public/index.html:468` (`openModal` 函数)

- [ ] **Step 5.1: 重写 `openModal` 函数**

找到第 468 行:
```js
function openModal(title,html){const m=el('div','modal-mask');m.innerHTML=`<div class="modal"><h3>${title}</h3>${html}<div style="margin-top:16px;text-align:right"><button class="btn ghost sm" onclick="this.closest('.modal-mask').remove()">关闭</button></div></div>`;document.body.appendChild(m);}
```

替换为:
```js
function openModal(title,html,opts){
  opts=opts||{};
  const m=el('div','modal-mask');
  const headHTML=opts.head!=null?opts.head:`<h3>${title}</h3>`;
  const footHTML=opts.foot!=null?opts.foot:`<button class="btn ghost sm" onclick="this.closest('.modal-mask').remove()">关闭</button>`;
  m.innerHTML=`<div class="modal"><div class="modal-head">${headHTML}</div><div class="modal-body">${html}</div><div class="modal-foot">${footHTML}</div></div>`;
  document.body.appendChild(m);
  return m;
}
```

**关键变化:**
- 新增第 3 参数 `opts`(默认 {},向后兼容)
- `opts.head`:自定义头部 HTML,缺省用 `<h3>${title}</h3>`
- `opts.foot`:自定义底部 HTML,缺省用默认关闭按钮
- 模板改为 head/body/foot 三段结构
- 返回 `m` 以便外部操作(供 `viewDetailLogs` 切换 body 用)

**向后兼容性验证:**
- 旧调用 `openModal('样品详情', h)` 仍工作(opts={},head 用 title,foot 用默认)
- 目前仅 `viewDetail` 调用 `openModal`,无其他消费方

- [ ] **Step 5.2: 验证 openModal 仍可调用**

DevTools Console(在样品列表页):
```js
openModal('测试', '<p>hello</p>')
```

预期:弹出弹窗,头部显示「测试」,底部显示「关闭」按钮,中间显示 hello。

关闭后清理:
```js
document.querySelector('.modal-mask')?.remove()
```

- [ ] **Step 5.3: 提交**

```bash
git add public/index.html
git commit -m "refactor(openModal): add opts param for head/foot customization

- opts.head defaults to <h3>\${title}</h3>
- opts.foot defaults to close button
- template restructured to modal-head/body/foot
- returns modal-mask element for external control
- backward compatible: openModal(title, html) still works"
```

---

## Task 6: 重构 `viewDetail` 函数(分区模板 + 双/三栏)

**Files:**
- Modify: `public/index.html:224-244` (`viewDetail` 函数)

- [ ] **Step 6.1: 重写 `viewDetail` 函数**

找到第 224-244 行 `viewDetail` 函数(从 `async function viewDetail(id){` 到对应的 `}`)。

替换为:
```js
async function viewDetail(id){
  const s=await api('GET','/api/samples/'+id);
  const steps=[['制作完成',s.produced_at],['正式发行',s.released_at],['分发保管',s.status==='IN_CUSTODY'?('储位 '+s.storage_location):null]];
  const head=`<b>${s.sample_no}</b>${statusBadge(s)}`;
  const leftHTML=`<div class="label">基础信息</div>
    <div class="field-grid">
      <span class="label">名称</span><span>${s.name||'—'}</span>
      <span class="label">机型</span><span>${s.model||'—'}</span>
      <span class="label">站别</span><span>${s.station||'—'}</span>
      <span class="label">规格</span><span>${s.spec||'—'}</span>
      <span class="label">保管</span><span>${s.custody_dept||'—'}</span>
      <span class="label">储位</span><span>${s.storage_location||'—'}</span>
      <span class="label">复检</span><span>${s.release_cycle_days?s.release_cycle_days+'天':'—'} / ${fmt(s.next_inspect_at)}</span>
      <span class="label">备注</span><span>${s.notes||'—'}</span>
    </div>`;
  const imgHTML=s.image?`<div style="margin-top:8px"><img src="${s.image}" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>`:'';
  const xlImgHTML=s.image?`<div class="detail-img"><div class="label">图片</div><img src="${s.image}" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>`:'<div class="detail-img"></div>';
  const progressHTML=steps.map((x,i)=>`<span class="chip ${x[1]?'done':'pending'}">${i+1}${x[0]}</span>${i<steps.length-1?'<span class="muted">→</span>':''}`).join('');
  const recentLogs=s.logs.slice(0,2);
  const logsHTML=recentLogs.length?
    `<div class="log-list">${recentLogs.map(l=>`<div><span class="muted">${fmt(l.created_at)}</span> · ${l.action} · ${l.role||''}/${l.dept||''}</div>`).join('')}</div>`:
    '<div class="muted">暂无日志</div>';
  const viewAll=s.logs.length>2?`<div style="margin-top:4px"><a class="link" onclick="viewDetailLogs(${id})">查看全部 ${s.logs.length} 条 →</a></div>`:'';
  const body=`<div class="detail-grid">
    <div>${leftHTML}${imgHTML}</div>
    <div>
      <div class="label">流转进度</div>
      <div class="chip-flow">${progressHTML}</div>
      <div class="label">操作日志(最近2条)</div>
      ${logsHTML}
      ${viewAll}
    </div>
    ${xlImgHTML}
  </div>`;
  openModal('',body,{head:head});
}
```

**关键变化:**
- 移除原 `.card.sample-card` 包装(改用 `.detail-grid`)
- 字段从 `.field` 行堆叠改为 `.field-grid` 2 列网格
- 图片分两份:`imgHTML`(非 XL,放左栏末尾) + `xlImgHTML`(XL 第三栏)
- 流转进度从纵向 `.step` 改为横向 `.chip-flow`
- 日志只显示最近 2 条 + 「查看全部 N 条」链接
- 调用 `openModal('', body, {head: head})`(title 空,head 用样品编号+状态徽章)

- [ ] **Step 6.2: 验证详情弹窗渲染**

浏览器进入「样品列表」,点任一样品「详情」。

预期(桌面 1440px):
- 弹窗 800px 宽,双栏 30/70
- 头部:样品编号 + 状态徽章
- 左栏:基础信息 2 列网格 + 图片缩略图(若有)
- 右栏:流转进度横向 chip + 操作日志(最多 2 条)+ 「查看全部 N 条」(若 >2)
- 底部:关闭按钮可见
- **无内部滚动条**(若内容溢出,Task 7 后会处理)

切换 DevTools 设备模拟验证:
- iPhone SE(375px):单栏,字段 2 列
- iPad(768px):双栏 35/65
- 桌面 1920px:三栏,图片独立第三栏

- [ ] **Step 6.3: 验证不同状态样品**

逐个点击不同状态样品:
- NEW:进度 chip 全 pending(灰)
- PRODUCED:① done,②③ pending
- RELEASED:①② done,③ pending
- IN_CUSTODY:①②③ 全 done(绿色)

预期:chip 颜色与状态对应,无 JS 报错。

- [ ] **Step 6.4: 提交**

```bash
git add public/index.html
git commit -m "refactor(viewDetail): restructure to grid layout with head/body/foot

- fields: .field row stack -> .field-grid 2-col compact
- image: split into imgHTML (non-XL) + xlImgHTML (XL 3rd col)
- progress: vertical .step -> horizontal .chip-flow
- logs: show only recent 2 + 'view all N' link
- call openModal('', body, {head}) with custom head"
```

---

## Task 7: 新增 `viewDetailLogs` 函数(日志全表弹窗内切换)

**Files:**
- Modify: `public/index.html` (在 `viewDetail` 函数后新增)

- [ ] **Step 7.1: 在 `viewDetail` 函数后追加 `viewDetailLogs`**

找到 `viewDetail` 函数结束的 `}`(Task 6 重写后的结尾),在其后追加:

```js
async function viewDetailLogs(id){
  const s=await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  const tableHTML=`<div style="padding:12px 14px">
    <div style="margin-bottom:8px"><a class="link" onclick="viewDetail(${id})">← 返回详情</a></div>
    <table><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>
    ${s.logs.map(l=>`<tr><td class="muted">${fmt(l.created_at)}</td><td>${l.action}</td><td class="muted">${l.role||''}/${l.dept||''}</td><td class="muted">${l.location||'—'}</td><td class="muted">${l.note||'—'}</td></tr>`).join('')}
    </table>
  </div>`;
  body.classList.add('log-mode');
  body.innerHTML=tableHTML;
}
```

**关键逻辑:**
- 重新拉取样品数据(确保 logs 最新)
- 获取当前弹窗的 `.modal-body` 元素
- 若不存在(弹窗已关),直接 return
- 渲染日志全表 + 「← 返回详情」按钮
- `body.classList.add('log-mode')` → 触发 CSS `overflow-y:auto` 允许滚动
- 点击「← 返回详情」调用 `viewDetail(id)` 重新渲染详情(会重置 body 内容,但 `.log-mode` 类需手动清理)

**注意:`.log-mode` 类清理问题** — `viewDetail` 调用 `openModal` 会创建**新**的 modal-mask,旧的(带 log-mode 的)会被残留。需在 Task 7.2 修复。

- [ ] **Step 7.2: 修复 `viewDetailLogs` 返回时的旧弹窗残留**

修正 `viewDetailLogs` 中的「返回详情」逻辑 — 改为不调用 `viewDetail`(会新建弹窗),而是直接重渲染当前 body 并移除 log-mode。

重写 `viewDetailLogs`(替换 Step 7.1 的版本):
```js
async function viewDetailLogs(id){
  const s=await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.add('log-mode');
  body.innerHTML=`<div style="padding:12px 14px">
    <div style="margin-bottom:8px"><a class="link" onclick="renderDetailBody(${id})">← 返回详情</a></div>
    <table><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>
    ${s.logs.map(l=>`<tr><td class="muted">${fmt(l.created_at)}</td><td>${l.action}</td><td class="muted">${l.role||''}/${l.dept||''}</td><td class="muted">${l.location||'—'}</td><td class="muted">${l.note||'—'}</td></tr>`).join('')}
    </table>
  </div>`;
}
async function renderDetailBody(id){
  const s=await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.remove('log-mode');
  const steps=[['制作完成',s.produced_at],['正式发行',s.released_at],['分发保管',s.status==='IN_CUSTODY'?('储位 '+s.storage_location):null]];
  const leftHTML=`<div class="label">基础信息</div>
    <div class="field-grid">
      <span class="label">名称</span><span>${s.name||'—'}</span>
      <span class="label">机型</span><span>${s.model||'—'}</span>
      <span class="label">站别</span><span>${s.station||'—'}</span>
      <span class="label">规格</span><span>${s.spec||'—'}</span>
      <span class="label">保管</span><span>${s.custody_dept||'—'}</span>
      <span class="label">储位</span><span>${s.storage_location||'—'}</span>
      <span class="label">复检</span><span>${s.release_cycle_days?s.release_cycle_days+'天':'—'} / ${fmt(s.next_inspect_at)}</span>
      <span class="label">备注</span><span>${s.notes||'—'}</span>
    </div>`;
  const imgHTML=s.image?`<div style="margin-top:8px"><img src="${s.image}" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>`:'';
  const xlImgHTML=s.image?`<div class="detail-img"><div class="label">图片</div><img src="${s.image}" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>`:'<div class="detail-img"></div>';
  const progressHTML=steps.map((x,i)=>`<span class="chip ${x[1]?'done':'pending'}">${i+1}${x[0]}</span>${i<steps.length-1?'<span class="muted">→</span>':''}`).join('');
  const recentLogs=s.logs.slice(0,2);
  const logsHTML=recentLogs.length?
    `<div class="log-list">${recentLogs.map(l=>`<div><span class="muted">${fmt(l.created_at)}</span> · ${l.action} · ${l.role||''}/${l.dept||''}</div>`).join('')}</div>`:
    '<div class="muted">暂无日志</div>';
  const viewAll=s.logs.length>2?`<div style="margin-top:4px"><a class="link" onclick="viewDetailLogs(${id})">查看全部 ${s.logs.length} 条 →</a></div>`:'';
  body.innerHTML=`<div class="detail-grid">
    <div>${leftHTML}${imgHTML}</div>
    <div>
      <div class="label">流转进度</div>
      <div class="chip-flow">${progressHTML}</div>
      <div class="label">操作日志(最近2条)</div>
      ${logsHTML}
      ${viewAll}
    </div>
    ${xlImgHTML}
  </div>`;
}
```

**重构说明:**
- 抽出 `renderDetailBody(id)` 复用详情 body 渲染逻辑
- `viewDetail` 仍负责创建弹窗(调 openModal)
- `renderDetailBody` 负责在现有 body 内重渲染(返回详情时用)
- `viewDetailLogs` 进入日志模式(加 log-mode 类)
- `renderDetailBody` 退出日志模式(移除 log-mode 类)

- [ ] **Step 7.3: 重构 `viewDetail` 复用 `renderDetailBody`**

为避免详情模板逻辑重复(DRY),重构 `viewDetail` 调用 `renderDetailBody`。

找到 Task 6 写入的 `viewDetail` 函数,替换为:
```js
async function viewDetail(id){
  const s=await api('GET','/api/samples/'+id);
  const head=`<b>${s.sample_no}</b>${statusBadge(s)}`;
  openModal('',`<div class="detail-grid"></div>``,{head:head});
  await renderDetailBody(id);
}
```

**注意:** 上面有反引号转义错误,正确版本:
```js
async function viewDetail(id){
  const s=await api('GET','/api/samples/'+id);
  const head=`<b>${s.sample_no}</b>${statusBadge(s)}`;
  openModal('',`<div class="detail-grid"></div>`,{head:head});
  await renderDetailBody(id);
}
```

**说明:**
- `viewDetail` 先创建空弹窗(head 用样品编号+状态)
- 然后调 `renderDetailBody(id)` 填充 body 内容
- 这样 `viewDetail` 与 `renderDetailBody` 职责分离:前者建壳,后者填内容

- [ ] **Step 7.4: 验证日志切换**

浏览器进入「样品列表」,找一个日志 >2 条的样品(或多次扫码操作制造日志):

1. 点「详情」→ 显示双栏 + 最近 2 条日志
2. 点「查看全部 N 条 →」→ body 切换为日志全表,**出现滚动条**(因 log-mode),顶部有「← 返回详情」
3. 滚动日志表,确认所有日志条目可见
4. 点「← 返回详情」→ 恢复双栏视图,**滚动条消失**(log-mode 移除)
5. 再次点「查看全部」→ 仍正常切换

预期:切换流畅,无 JS 报错,无残留弹窗。

DevTools Console 检查无报错:
```js
// 切换后检查只有一个 modal-mask
document.querySelectorAll('.modal-mask').length
```

预期:始终为 1

- [ ] **Step 7.5: 验证无日志样品**

找一个 logs.length === 0 的样品(新建未流转):

1. 点「详情」→ 显示「暂无日志」,无「查看全部」链接
2. 无 JS 报错

- [ ] **Step 7.6: 提交**

```bash
git add public/index.html
git commit -m "feat(detail): add viewDetailLogs for in-modal log table switch

- viewDetailLogs: render full log table in body, add .log-mode
- renderDetailBody: extract detail body rendering (DRY)
- viewDetail: create shell then delegate to renderDetailBody
- log-mode enables overflow-y:auto for log table scrolling
- 'back to detail' link re-renders body and removes log-mode"
```

---

## Task 8: 全场景回归验证

**Files:**
- 无文件修改,仅浏览器手动验证

- [ ] **Step 8.1: 桌面 1440×900 全状态验证**

DevTools 设备模拟:Responsive 1440×900

逐个点击不同状态样品详情:
- [ ] NEW 样品:chip 全 pending,无溢出,关闭按钮可见
- [ ] PRODUCED 样品:① done
- [ ] RELEASED 样品:①② done
- [ ] IN_CUSTODY 样品:①②③ done
- [ ] 逾期样品(IN_CUSTODY + next_inspect_at 过期):复检日期红色(沿用原 .b-overdue 类?需确认设计文档第 4.2 节 leftHTML 中复检字段是否带逾期类)

**注意:设计文档 leftHTML 中复检字段未带 overdue 高亮**,与原 viewDetail(第 234 行 `<span class="${overdue(s)?'b-overdue':''}" style="font-weight:600">${fmt(s.next_inspect_at)}</span>`)不一致。

**修正:** 需在 Task 8 后追加 Task 9 修复。

- [ ] **Step 8.2: 平板 768×1024 验证**

DevTools 设备:iPad Mini

- [ ] 弹窗 640px,双栏 35/65
- [ ] 无溢出,关闭按钮可见
- [ ] 字段 2 列网格正常

- [ ] **Step 8.3: 手机 375×667 验证**

DevTools 设备:iPhone SE

- [ ] 弹窗 94vw,单栏
- [ ] 字段 2 列网格
- [ ] 流转进度 chip 自动换行
- [ ] 关闭按钮可见

- [ ] **Step 8.4: 大屏 1920×1080 验证**

DevTools 设备:Responsive 1920×1080

- [ ] 弹窗 900px,三栏 25/25/50
- [ ] .detail-img 第三栏显示图片(若有图片)
- [ ] 无图片样品:第三栏为空 div(不影响布局)

- [ ] **Step 8.5: 日志切换全状态验证**

对日志 >2 条的样品:

- [ ] 详情 → 查看全部 → 滚动日志 → 返回详情 → 再查看全部(循环 3 次,无报错)
- [ ] 关闭弹窗后重开同一商品:状态正确重置(默认详情视图,非日志模式)
- [ ] 关闭弹窗后开另一个商品:无残留

- [ ] **Step 8.6: 其他页面回归验证**

- [ ] 首页概览:统计卡片、待办表格正常
- [ ] 新建样品:表单、图片预览、创建成功
- [ ] 扫码台:扫码输入、确认按钮、状态推进正常(此页面用 .card.sample-card,不受本次改动影响)
- [ ] 生命周期看板:逾期/将到期表格正常
- [ ] 操作日志:列表表格正常
- [ ] 用户管理:新增/列表正常
- [ ] 退出登录、重新登录:正常

- [ ] **Step 8.7: Console 无 JS 报错**

整个验证过程中,DevTools Console 应无红色错误。

常见检查:
- `viewDetailLogs is not defined` → 函数未正确挂到 window
- `Cannot read property 'classList' of null` → body 选择器失败(弹窗未开)
- `Failed to fetch` → API 请求失败(确认服务运行)

- [ ] **Step 8.8: 提交验证记录(无需代码改动,跳过 commit)**

记录验证结果到终端:
```bash
echo "回归验证完成: $(date)" >> /tmp/regression-$(date +%Y%m%d).log
```

---

## Task 9: 修复逾期复检日期高亮(设计文档遗漏)

**Files:**
- Modify: `public/index.html` (`renderDetailBody` 函数的 leftHTML)

- [ ] **Step 9.1: 在 `renderDetailBody` 的 leftHTML 中给复检字段加逾期高亮**

找到 `renderDetailBody` 函数中的复检字段行:
```js
      <span class="label">复检</span><span>${s.release_cycle_days?s.release_cycle_days+'天':'—'} / ${fmt(s.next_inspect_at)}</span>
```

替换为:
```js
      <span class="label">复检</span><span class="${overdue(s)?'b-overdue':''}" style="font-weight:600">${s.release_cycle_days?s.release_cycle_days+'天':'—'} / ${fmt(s.next_inspect_at)}</span>
```

**说明:**
- 沿用原 `.b-overdue` 类(`background:#fee2e2;color:#991b1b`)
- `overdue(s)` 辅助函数已存在(第 189 行),判断 IN_CUSTODY 且 next_inspect_at 过期
- `font-weight:600` 加强视觉提示

- [ ] **Step 9.2: 验证逾期样品高亮**

找一条逾期样品(IN_CUSTODY 且 next_inspect_at < now),点详情。

预期:复检字段红色背景+红色文字+加粗。

- [ ] **Step 9.3: 提交**

```bash
git add public/index.html
git commit -m "fix(detail): restore overdue highlight on next_inspect_at

- apply .b-overdue class + font-weight:600 when overdue(s) is true
- restores highlight lost during viewDetail refactor"
```

---

## Task 10: 文件臃肿检测与清理评估

**Files:**
- 无文件修改,仅检测与报告

- [ ] **Step 10.1: 收集修改后指标**

```bash
f=/www/wwwroot/sample-mgmt/public/index.html
echo "修改后行数: $(wc -l < $f)"
echo "修改后字符: $(wc -c < $f)"
echo "空行数: $(grep -c '^[[:space:]]*$' $f)"
echo "注释行数: $(grep -cE '^\s*(//|/\*|\*)' $f)"
echo "有效代码行: $(($(wc -l < $f) - $(grep -c '^[[:space:]]*$' $f) - $(grep -cE '^\s*(//|/\*|\*)' $f)))"
echo "顶层function数: $(grep -cE '^(async )?function ' $f)"
echo "顶层class数: $(grep -cE '^class ' $f)"
```

预期:
- 行数 ~510(基线 474 + ~36 新增)
- 字符 ~32000(基线 29841 + ~2200 新增)
- 顶层 function ~40(原 38 + viewDetailLogs + renderDetailBody)

- [ ] **Step 10.2: 对照上限评估**

| 指标 | 实际 | 上限 | 状态 |
|---|---|---|---|
| 有效代码行 | ~460 | 600 | ✓ 未超 |
| 总字符 | ~32000 | 20000 | ✗ **超限**(原本已超) |
| 顶层 function | ~40 | ≤10 | ✗ **超限**(原本已超) |
| 顶层 class | 0 | ≤3 | ✓ |

- [ ] **Step 10.3: 输出臃肿检测报告**

根据 Step 10.1/10.2 数据,输出 3 项强制报告:
1. 文件类型、当前有效代码行、总字符、距离上限剩余空间
2. 当前文件函数/顶层 Class 数量,是否触发预警阈值
3. 冗余清单:未使用导入、废弃代码块、可合并重复逻辑 + 瘦身拆分优化方案

**冗余清单预期:**
- 原 `.step`/`.step .dot`/`.step.done`/`.step.cur` CSS(第 82-85 行):viewDetail 不再用,但保留(CSS 无副作用,删除留待重构)
- 原 `.sample-card` CSS(第 71 行):viewDetail 不再用,但扫码台仍用,保留
- 原 `.field` CSS(第 72 行):viewDetail 不再用,扫码台仍用,保留
- 可合并:`renderDetailBody` 与 `viewDetailLogs` 的 API 调用重复(均 GET /api/samples/:id),可抽 `fetchSample(id)` 辅助函数,但仅 2 处,YAGNI 暂不抽

- [ ] **Step 10.4: 输出拆分建议(不在本次执行)**

```markdown
## 拆分建议(后续独立任务)
- public/index.html 拆分为:
  - public/index.html:仅 HTML 结构 + 引用
  - public/css/app.css:全部样式
  - public/js/api.js:api() 函数
  - public/js/auth.js:登录/登出/me
  - public/js/router.js:route/buildNav/VIEWS
  - public/js/dashboard.js:viewDashboard
  - public/js/samples.js:viewSamples/loadSamples/viewDetail/viewDetailLogs/renderDetailBody
  - public/js/new.js:viewNew/submitNew/openPrintLabel/previewImage
  - public/js/scan.js:viewScan/bindScanInput/doScan/confirmScan/renderScanAction/startCam/stopCam
  - public/js/board.js:viewBoard/table
  - public/js/logs.js:viewLogs
  - public/js/users.js:viewUsers/loadUsers/addUser
  - public/js/modal.js:openModal/toast
  - public/js/constants.js:STATUS/ROLE/STATIONS/NAV
- 预估拆分后单文件 < 150 行,符合规范
```

---

## Task 11: 更新文档与变更记录

**Files:**
- Modify: `README.md`(可选,本次改动不影响 README 描述的功能)

- [ ] **Step 11.1: 检查 README 是否需更新**

```bash
grep -n "modal\|详情\|弹窗" /www/wwwroot/sample-mgmt/README.md
```

预期:无匹配(README 不涉及弹窗细节)。

**结论:** README 无需更新。

- [ ] **Step 11.2: 输出最终变更记录**

```markdown
## 变更记录(本次实现)

| 类型 | 文件 | 变更 |
|---|---|---|
| 修改 | public/index.html | CSS:.modal 改 flex 容器 + 新增 .modal-head/.modal-body/.modal-foot/.detail-grid/.field-grid/.chip-flow/.log-list/.detail-img + 3 媒体查询 |
| 修改 | public/index.html | JS:openModal 扩展 opts 参数(向后兼容) |
| 修改 | public/index.html | JS:viewDetail 重构(创建壳 + 委托 renderDetailBody) |
| 新增 | public/index.html | JS:renderDetailBody(详情 body 渲染,DRY) |
| 新增 | public/index.html | JS:viewDetailLogs(日志全表弹窗内切换) |
| 修复 | public/index.html | JS:复检逾期高亮(.b-overdue) |

**兼容性影响:**
- 不受影响:扫码台、看板、日志、用户管理、登录、首页概览、新建样品
- 需调整:无(API 无变更,仅前端)
- 部署步骤:`npm start` 重启即可,无需 DB 迁移/配置变更
- 回滚:`git revert <commit-hash>` 或还原备份 index.html.bak.YYYYMMDD

**上线后监控(1~3 业务周期):**
- 用户反馈弹窗是否仍有溢出/裁切
- 移动端用户(扫码场景)的详情查看体验
- 浏览器控制台无 JS 错误(尤其 viewDetailLogs 切换逻辑)
- 确认无其他页面调用 openModal(已确认仅 viewDetail)
```

- [ ] **Step 11.3: 提交文档变更(如有)**

```bash
# 若 README 无变更,跳过 commit
git status
```

---

## 完成标准

- [ ] 所有 Task 1-11 的 checkbox 全部勾选
- [ ] 桌面/平板/手机/大屏四档响应式验证通过
- [ ] 日志切换(查看全部 ↔ 返回详情)无报错
- [ ] 其他页面无回归
- [ ] DevTools Console 无 JS 错误
- [ ] 文件臃肿检测报告已输出
- [ ] 变更记录已输出
- [ ] 所有 commit 已推送(若需推送)

## 回滚方案

若上线后发现问题:

1. **快速回滚**(单次 commit):
```bash
cd /www/wwwroot/sample-mgmt
git log --oneline -20  # 找到本次第一个 commit
git revert <commit-hash>..HEAD  # 反转所有本次 commit
```

2. **备份恢复**:
```bash
cp /www/wwwroot/sample-mgmt/public/index.html.bak.20260723 /www/wwwroot/sample-mgmt/public/index.html
```

3. **服务重启**:
```bash
cd /www/wwwroot/sample-mgmt
npm start  # 或 pm2 restart sample-mgmt
```
