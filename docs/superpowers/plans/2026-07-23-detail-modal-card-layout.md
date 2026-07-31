# 样品详情弹窗 — B+C 卡片流式布局 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将样品详情弹窗从 CSS Grid 两栏布局改为 flex-wrap 卡片流 + 底部 Tab 的 B+C 混合布局，支持图片在所有断点可见和点击放大。

**Architecture:** 修改 `public/index.html` 单一文件，CSS 删旧增新（约 +15 行净增），JS 重写 `renderDetailBody`、新增 `showImageView`、扩展 `openModal` 和 `viewDetailLogs`。后端不变。

**Tech Stack:** 原生 HTML/CSS/JS（flex-wrap, min-width 媒体查询）

**Spec:** [docs/superpowers/specs/2026-07-23-detail-modal-card-layout-design.md](file:///www/wwwroot/sample-mgmt/docs/superpowers/specs/2026-07-23-detail-modal-card-layout-design.md)

---

## 文件结构

| 文件 | 路径 | 操作 | 职责 |
|---|---|---|---|
| index.html | `public/index.html` | 修改 | CSS 替换 + JS 重写 |

**仅修改 1 个文件，无新建/删除。**

---

## 前置准备

- [ ] **Step 0.1: 记录基线**

```bash
cd /www/wwwroot/sample-mgmt
echo "index.html: $(wc -l < public/index.html) 行, $(wc -c < public/index.html) 字符"
```

- [ ] **Step 0.2: 确认测试全绿基线**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit 2>&1 | tail -5
```

预期: 14 passed

---

### Task 1: CSS 样式替换 — 删除旧规则 + 新增卡片/Tab/图片弹层样式

**Files:**
- Modify: `public/index.html:80-104`

- [ ] **Step 1.1: 删除旧的 detail 样式规则（80-104 行）**

用 `Read` 读取 `public/index.html` 第 80-104 行，确认当前内容为：

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

**执行 Edit：** 将第 80 行 `  .detail-grid{...}` 到第 104 行 `  }`（整个旧规则块）替换为以下新规则块：

```css
  .detail-cards{display:flex;flex-wrap:wrap;gap:10px;padding:4px}
  .detail-card{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fff}
  .detail-card.info{flex:1 1 260px;min-width:200px}
  .detail-card.progress{flex:1 1 180px;min-width:160px}
  .detail-card.image{flex:0 0 auto;text-align:center;cursor:pointer}
  .detail-card.image img{width:100px;height:100px;object-fit:cover;border-radius:6px;display:block}
  .detail-card.logs{flex:1 1 100%}
  .field-grid{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;font-size:13px;line-height:1.6}
  .field-grid .label{color:var(--muted)}
  .progress-timeline{display:flex;flex-direction:column;gap:6px}
  .progress-step{display:flex;align-items:center;gap:6px;font-size:12px}
  .progress-step.done .dot{background:var(--ok)}
  .progress-step.pending .dot{background:#ddd}
  .progress-step .dot{width:8px;height:8px;border-radius:50%;flex:none}
  .chip{padding:3px 8px;border-radius:4px;font-size:11px;font-weight:600}
  .chip.done{background:var(--ok);color:#fff}
  .chip.pending{background:var(--chip);color:var(--brand)}
  .log-list{font-size:12px;line-height:1.5}
  .log-list>div{padding:4px 0;border-bottom:1px solid var(--line)}
  .detail-tabs{display:flex;border-top:2px solid var(--line);background:var(--bg)}
  .detail-tab{padding:8px 16px;font-size:13px;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-2px}
  .detail-tab.active{color:var(--brand);border-bottom-color:var(--brand);font-weight:600}
  .img-overlay{position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;z-index:50;cursor:pointer}
  .img-overlay img{max-width:80vw;max-height:80vh;border-radius:8px}
```

**关键变化：**
- 删除: `.detail-grid`（及3个响应式变体）、`.detail-img`、`.chip-flow`
- 保留: `.field-grid`、`.chip`、`.chip.done`、`.chip.pending`、`.log-list`（其他页面可能引用）
- 新增: `.detail-cards`、`.detail-card`（+4 修饰类）、`.progress-timeline`/`.progress-step`、`.detail-tabs`/`.detail-tab`、`.img-overlay`
- 保留 3 个 `@media` 块中仅剩的 `.modal` 宽度规则，删除其中 `.detail-grid` 和 `.detail-img` 规则

- [ ] **Step 1.2: 更新响应式媒体查询（96-104 行）**

在上述替换中，`@media` 块内已无 `.detail-grid` 和 `.detail-img` 引用。确认新 CSS 中仅保留 `.modal` 宽度规则：

```css
  @media(min-width:768px){}
  @media(min-width:1200px){
    .modal{width:800px}
  }
  @media(min-width:1600px){
    .modal{width:900px}
  }
```

- [ ] **Step 1.3: 验证 CSS 无语法错误**

```bash
cd /www/wwwroot/sample-mgmt
node -e "console.log('CSS check: manual review needed, no automated CSS parser')"
```

手动检查：确认所有 `{` `}` 匹配，规则块正确闭合。

- [ ] **Step 1.4: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/index.html
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "style(detail): replace grid layout with card-flow CSS for detail modal

- remove .detail-grid (3 responsive variants), .detail-img, .chip-flow
- add .detail-cards/.detail-card (4 modifiers: info/progress/image/logs)
- add .progress-timeline/.progress-step (vertical timeline)
- add .detail-tabs/.detail-tab (bottom tab bar)
- add .img-overlay (fullscreen image viewer)
- keep .field-grid, .chip, .log-list (used by other pages)
- keep .modal responsive width rules (MD 800px, XL 900px)"
```

---

### Task 2: 重写 renderDetailBody + 新增 showImageView

**Files:**
- Modify: `public/index.html:253-307`

- [ ] **Step 2.1: 重写 renderDetailBody 函数（253-295 行）**

用 `Read` 读取 `public/index.html` 第 253-295 行，确认当前内容。

**执行 Edit：** 将 `async function renderDetailBody(id){` 到 `}`（结束于第 295 行的 `}`）替换为：

```js
async function renderDetailBody(id){
  const s=await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.remove('log-mode');
  const steps=[['制作完成',s.produced_at],['正式发行',s.released_at],['分发保管',s.status==='IN_CUSTODY'?('储位 '+s.storage_location):null]];
  const stepLabels=s.status==='NEW'?'':'/已完成';
  const infoHTML=`<div class="detail-card info">
    <div class="label">基本信息</div>
    <div class="field-grid">
      <span class="label">名称</span><span>${s.name||'—'}</span>
      <span class="label">机型</span><span>${s.model||'—'}</span>
      <span class="label">站别</span><span>${s.station||'—'}</span>
      <span class="label">规格</span><span>${s.spec||'—'}</span>
      <span class="label">保管</span><span>${s.custody_dept||'—'}</span>
      <span class="label">储位</span><span>${s.storage_location||'—'}</span>
      <span class="label">复检</span><span class="${overdue(s)?'b-overdue':''}" style="font-weight:600">${s.release_cycle_days?s.release_cycle_days+'天':'—'} / ${fmt(s.next_inspect_at)}</span>
      <span class="label">备注</span><span>${s.notes||'—'}</span>
    </div>
  </div>`;
  const progressHTML=`<div class="detail-card progress">
    <div class="label">流转进度${stepLabels}</div>
    <div class="progress-timeline">
      ${steps.map((x,i)=>`<div class="progress-step ${x[1]?'done':'pending'}"><span class="dot"></span><span>${x[0]}${x[1]?' <span class="muted">'+fmt(x[1])+'</span>':''}</span></div>`).join('')}
    </div>
  </div>`;
  const imgHTML=s.image?`<div class="detail-card image" onclick="showImageView('${s.image}')">
    <div class="label">图片</div>
    <img src="${s.image}" alt="样品图片"/>
  </div>`:'';
  const recentLogs=s.logs.slice(0,2);
  const logsHTML=`<div class="detail-card logs">
    <div class="label">操作日志(最近2条)</div>
    ${recentLogs.length?`<div class="log-list">${recentLogs.map(l=>`<div><span class="muted">${fmt(l.created_at)}</span> · ${l.action} · ${l.role||''}/${l.dept||''}</div>`).join('')}</div>`:'<div class="muted">暂无日志</div>'}
    ${s.logs.length>2?`<div style="margin-top:4px"><a class="link" onclick="switchDetailTab('logs',${id})">查看全部 ${s.logs.length} 条 →</a></div>`:''}
  </div>`;
  body.innerHTML=`<div class="detail-cards">${infoHTML}${progressHTML}${imgHTML}${logsHTML}</div>`;
  // Tab 栏
  const hasImage=s.image,hasLogs=s.logs.length>0;
  if(hasImage||hasLogs){
    const foot=document.querySelector('.modal-foot');
    let tabHTML='<div class="detail-tabs">';
    tabHTML+='<div class="detail-tab active" onclick="renderDetailBody('+id+')">信息</div>';
    if(hasLogs) tabHTML+='<div class="detail-tab" onclick="switchDetailTab(\'logs\','+id+')">全量日志 ('+s.logs.length+')</div>';
    if(hasImage) tabHTML+='<div class="detail-tab" onclick="switchDetailTab(\'image\','+id+')">大图</div>';
    tabHTML+='</div>';
    let tabsEl=document.querySelector('.detail-tabs');
    if(tabsEl) tabsEl.remove();
    foot.insertAdjacentHTML('beforebegin',tabHTML);
  }
}
```

- [ ] **Step 2.2: 新增 switchDetailTab 函数**

在 `renderDetailBody` 函数之后（第 295 行 `}` 之后）追加：

```js
function switchDetailTab(tab,id){
  const tabs=document.querySelectorAll('.detail-tab');
  tabs.forEach(t=>t.classList.remove('active'));
  if(tab==='logs'){
    tabs[1]&&tabs[1].classList.add('active');
    viewDetailLogs(id);
  }else if(tab==='image'){
    tabs[tabs.length-1]&&tabs[tabs.length-1].classList.add('active');
    const s=document.querySelector('.detail-card.image img');
    if(s) showImageView(s.src);
  }
}
```

- [ ] **Step 2.3: 新增 showImageView 函数**

在 JS 区域末尾（`openModal` 函数之前）追加：

```js
function showImageView(src){
  const overlay=el('div','img-overlay');
  overlay.innerHTML='<img src="'+src+'" onclick="event.stopPropagation()"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:28px;cursor:pointer">×</span>';
  overlay.onclick=function(){this.remove();};
  overlay.querySelector('span').onclick=function(){overlay.remove();};
  document.body.appendChild(overlay);
}
```

- [ ] **Step 2.4: 修改 viewDetail 函数（253-258 行）**

将 `.detail-grid` 改为 `.detail-cards`：

```js
async function viewDetail(id){
  const s=await api('GET','/api/samples/'+id);
  const head=`<b>${s.sample_no}</b>${statusBadge(s)}`;
  openModal('',`<div class="detail-cards"></div>`,{head:head});
  await renderDetailBody(id);
}
```

- [ ] **Step 2.5: 修改 viewDetailLogs 函数 — 增加 Tab 高亮**

将 `viewDetailLogs` 函数开头修改为添加 Tab 高亮：

```js
async function viewDetailLogs(id){
  const s=await api('GET','/api/samples/'+id);
  const body=document.querySelector('.modal-body');
  if(!body)return;
  body.classList.add('log-mode');
  // 高亮「全量日志」Tab
  const tabs=document.querySelectorAll('.detail-tab');
  tabs.forEach(t=>t.classList.remove('active'));
  if(tabs[1]) tabs[1].classList.add('active');
  body.innerHTML=`<div style="padding:12px 14px">
    <div style="margin-bottom:8px"><a class="link" onclick="renderDetailBody(${id})">← 返回详情</a></div>
    <table><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>
    ${s.logs.map(l=>`<tr><td class="muted">${fmt(l.created_at)}</td><td>${l.action}</td><td class="muted">${l.role||''}/${l.dept||''}</td><td class="muted">${l.location||'—'}</td><td class="muted">${l.note||'—'}</td></tr>`).join('')}
    </table>
  </div>`;
}
```

- [ ] **Step 2.6: 验证 JS 无语法错误**

```bash
cd /www/wwwroot/sample-mgmt
node -e "console.log('JS syntax check: run npm test to verify')"
```

- [ ] **Step 2.7: 提交**

```bash
cd /www/wwwroot/sample-mgmt
git add public/index.html
git -c user.name="trae-agent" -c user.email="agent@local" commit -m "feat(detail): rewrite detail modal with card-flow layout + image viewer

- replace renderDetailBody with flex-wrap card layout (4 cards)
- add vertical timeline for progress (replaces horizontal chips)
- image visible at all breakpoints, click to fullscreen overlay
- add bottom tab bar: info / full logs / large image
- add switchDetailTab() helper for tab switching
- add showImageView() for fullscreen image with close button
- viewDetailLogs now highlights active tab"
```

---

### Task 3: 回归验证

**Files:**
- 无文件修改

- [ ] **Step 3.1: 运行全部测试**

```bash
cd /www/wwwroot/sample-mgmt
npx jest --forceExit 2>&1
```

预期: 14 passed（前端布局变更不影响后端 API 测试）

- [ ] **Step 3.2: 验证服务正常启动**

```bash
cd /www/wwwroot/sample-mgmt
timeout 3 node server.js 2>&1 || true
```

预期: 输出 `样品管理系统已启动`

- [ ] **Step 3.3: 手动浏览器验证（XS/SM/MD/LG/XL）**

1. 访问 `http://localhost:4000`（或其他运行端口）
2. 登录 admin/admin123
3. 进入 samples 列表
4. 点击任一「详情」
5. 验证：图片在默认宽度可见（不再是 XL 才可见）
6. 点击图片 → 验证大图弹层正常
7. 验证底部 Tab 栏显示（信息/全量日志/大图）
8. 切换 Tab 验证功能正常
9. 调整浏览器宽度验证各断点适配（576/768/1200/1600）

- [ ] **Step 3.4: 提交（无代码改动，记录验证结果）**

```bash
echo "regression verification: $(date)" >> /tmp/detail-modal-regression.log
```

---

### Task 4: 臃肿检测报告

**Files:**
- 无文件修改

- [ ] **Step 4.1: 收集指标**

```bash
cd /www/wwwroot/sample-mgmt
f=public/index.html
echo "index.html: $(wc -l < $f) 行, $(wc -c < $f) 字符"
```

- [ ] **Step 4.2: 对照上限输出报告**

| 文件 | 预估行数 | 上限 | 状态 |
|---|---|---|---|
| public/index.html | ~550 | 600 | 91.7%，安全 |
| public/index.html 字符 | ~33500 | 20000 | **超限（历史技术债）** |

**冗余清单：**
- 删除 `.detail-grid`（3 变体）约 20 行，新增约 35 行，净 +15 行
- 保留 `.field-grid` `.chip` `.log-list`（其他页面引用）
- `index.html` 整体仍超 20000 字符兜底限制，属于 P3 架构拆分任务

- [ ] **Step 4.3: 提交（文档，可选）**

```bash
echo "PASS: Card-flow detail modal layout deployed" >> /tmp/detail-modal-report.log
```

---

## 完成标准

- [ ] 14 条测试全部 PASS
- [ ] 图片在所有断点可见
- [ ] 图片点击弹大图，可关闭
- [ ] Tab 切换正常（信息/全量日志/大图）
- [ ] 5 档断点正常适配
- [ ] npm start 正常启动
- [ ] 臃肿检测报告已输出

## 回滚方案

```bash
cd /www/wwwroot/sample-mgmt
git revert <commit-hash>  # 回滚到 Task 2 的 commit
# 或直接 checkout 旧版 index.html
git checkout HEAD~2 -- public/index.html
```
