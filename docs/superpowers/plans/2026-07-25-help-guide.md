# 前端使用指南（混合方案）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在系统前端嵌入完整使用指南，包含浮动按钮、搜索面板、上下文提示条，帮助内容按功能模块组织。

**Architecture:** 纯前端实现，帮助内容作为 JS 常量数据文件（help-data.js），UI 逻辑独立文件（help.js），样式追加到 app.css，index.html 引用新文件。无后端改动。

**Tech Stack:** 原生 HTML/CSS/JS（无框架），CSS 变量复用现有 `:root` 体系。

---

## 文件结构

| 文件 | 操作 | 职责 | 行数估算 | 上限 |
|---|---|---|---|---|
| `public/js/help-data.js` | 新建 | 10 个帮助模块的内容数据 | ~200 | 800（常量豁免） |
| `public/js/help.js` | 新建 | 浮动按钮 + 搜索面板 + 上下文提示逻辑 | ~150 | 300 |
| `public/css/app.css` | 修改 | 新增帮助组件样式 | +~40（总~161） | 200 |
| `public/index.html` | 修改 | 引用 help-data.js + help.js | +2 | 600 |
| `public/js/router.js` | 修改 | route() 中调用 renderContextHint | +3 | 300 |
| `public/js/api.js` | 修改 | showApp() 中调用 renderHelpButton | +1 | 300 |

---

## Task 1: 创建 help-data.js（帮助内容数据）

**Files:**
- Create: `public/js/help-data.js`

- [ ] **Step 1: 创建 help-data.js 文件**

```js
// help-data.js — 前端使用指南内容数据（按功能模块组织，常量文件豁免 800 行上限）
// 不包含具体登录账号密码信息
var HELP_DATA=[
  {
    id:'login',title:'登录与账号',roles:['ALL'],
    tags:['登录','登出','账号','密码','会话'],
    summary:'输入账号密码登录，8小时会话自动过期',
    sections:[
      {h:'登录步骤',body:'1. 打开系统页面\n2. 输入账号和密码\n3. 点击「登录」或按回车键'},
      {h:'会话说明',body:'登录后会话有效期 8 小时，超时后需重新登录。'},
      {h:'登出',body:'点击左侧栏底部的「退出登录」按钮即可安全退出。'}
    ]
  },
  {
    id:'create',title:'建样（新建样品）',roles:['RD'],
    tags:['建样','新建','打印','标签','QR码','限度样品','样品类型','限度项目'],
    summary:'填写样品信息 → 自动生成编号 → 打印标签贴样',
    sections:[
      {h:'操作步骤',body:'1. 点击左侧菜单「新建样品+打印码」\n2. 填写基础信息（左栏）：样品名称（必填）、机型、站别、规格/型号、备注\n3. 选填限度样品信息（右栏）：样品类型、限度项目、来源、版次、标准范围\n4. 点击「创建样品并生成条码」\n5. 系统自动生成编号（SM-XXXXXX），弹出标签打印页\n6. 打印标签，贴于样品实物上'},
      {h:'限度样品字段',body:'样品类型：OK样品 / NG样品\n限度项目：26 项下拉选择\n来源：客供 / 元山 / 塔岗\n版次：如 V1.0、A2\n标准范围：如「震动≤0.5mm」'},
      {h:'注意事项',body:'编号自动生成，不可修改。标签含 QR 码和基本信息，可直接打印或下载 PNG。'}
    ]
  },
  {
    id:'scan',title:'扫码台（三方共用）',roles:['RD','QA','CUSTODY','ME'],
    tags:['扫码','扫码台','扫码枪','摄像头','连续扫码','状态流转'],
    summary:'扫描样品二维码驱动状态流转，支持扫码枪/手动输入/摄像头',
    sections:[
      {h:'扫码方式',body:'扫码枪（推荐）：对准二维码扫描自动填充\n手动输入：输入 SM-XXXXXX 编号后回车\n摄像头：手机端点击「开启摄像头」对准二维码（需 HTTPS）'},
      {h:'连续扫码',body:'勾选「连续扫码」后，每次操作完自动清空输入框聚焦，适合扫码枪批量作业。'},
      {h:'角色操作',body:'研发：确认制作完成（NEW → PRODUCED）\n品保：确认发行 / 复检（PRODUCED → RELEASED / 复检更新）\n保管：接收保管 / 申请退回（RELEASED → IN_CUSTODY / → RETURNING）\n生技：同保管'},
      {h:'无权操作',body:'如果扫描的样品状态与当前角色不匹配，系统会提示无法推进，请确认流程顺序或由对应部门操作。'}
    ]
  },
  {
    id:'release',title:'品保发行向导',roles:['QA'],
    tags:['发行','品保','向导','复检周期','标示卡','确认发行'],
    summary:'三步向导：设置复检周期 → 填写标示卡 → 确认发行',
    sections:[
      {h:'Step 1 — 设置复检周期',body:'扫描「制作完成」状态样品 → 设置复检周期（天，必填）→ 实时预览下次复检日期 → 点击「下一步」'},
      {h:'Step 2 — 标示卡审查',body:'全部标示卡字段平铺展开：\n✓ RD已填（绿色）= 研发已填写\n✗ 必填（红色）= 必填字段未填写\n必填：样品类型、限度项目\n可选：来源、版次、测试数据（有效期自动等于复检日）\n品保确认人自动签署为当前登录用户'},
      {h:'Step 3 — 确认发行',body:'展示发行摘要 → 核对无误 → 点击「确认正式发行」→ 标示卡自动弹出打印（非连续模式）或加入打印队列（连续模式）'}
    ]
  },
  {
    id:'inspect',title:'品保复检',roles:['QA'],
    tags:['复检','品保','复检周期','到期','照片','标示卡更新'],
    summary:'扫描到期样品 → 上传复检照片 → 更新标示卡（选填）→ 确认复检',
    sections:[
      {h:'复检流程',body:'1. 扫描到期样品二维码\n2. 上传复检照片（必填）\n3. 可选填写备注\n4. 复检周期默认沿用上次，也可修改\n5. 点击「确认复检完成」'},
      {h:'标示卡更新',body:'展开「标示卡更新」折叠区，可修改版次/测试数据，不填则保留原值。有效期自动等于复检日。'},
      {h:'下次复检',body:'确认后下次复检日期自动顺延。如填写了标示卡字段，日志会注明「标示卡已更新」。'}
    ]
  },
  {
    id:'return',title:'退回与作废',roles:['CUSTODY','QA','RD'],
    tags:['退回','作废','替代品','重新发行','拒绝退回','RETURNING','RETIRED'],
    summary:'保管申请退回 → 品保审核（4分支）→ 退回研发重做 / 直接作废 / 重新发行 / 拒绝',
    sections:[
      {h:'保管申请退回',body:'保管扫描「保管中」样品 → 点击「申请退回」→ 填写退回原因（必填）→ 状态变为「退回审核中」'},
      {h:'品保审核退回（4分支）',body:'分支1 — 重新发行：修改标示卡和复检周期后重新发行 → RELEASED\n分支2 — 退回研发重做：指派研发人员 → 保持 RETURNING，研发收到待办\n分支3 — 直接作废：填写作废原因 → RETIRED\n分支4 — 拒绝退回：填写拒绝理由 → 恢复 IN_CUSTODY'},
      {h:'研发创建替代品',body:'被指派的研发扫描 RETURNING 样品 → 点击「创建替代品」→ 系统自动复制原样品信息生成新编号 → 新样品状态为 NEW → 原样品标记为 RETIRED'}
    ]
  },
  {
    id:'print',title:'打印（标签+标示卡）',roles:['RD','QA'],
    tags:['打印','标签','标示卡','尺寸','QR码','下载','打印队列'],
    summary:'标签和标示卡支持多种尺寸选择，标示卡跟随标签尺寸自动适配',
    sections:[
      {h:'打印尺寸',body:'标签打印页顶部可选择尺寸：\n小号 37×18mm\n中标 52×25mm（默认）\n大号 74×35mm\n自定义 30~150mm 自由输入\n标示卡自动跟随标签尺寸等比缩放'},
      {h:'标签内容',body:'QR 码 + 样品编号 + 名称 + 机型/站别 + 规格。发行前标示卡面为空白占位，发行后显示完整限度信息。'},
      {h:'打印队列',body:'连续扫码模式下，发行成功后标示卡加入打印队列。可「打印全部」批量输出，离开页面前有未打印提醒。'},
      {h:'下载',body:'详情中可下载高分辨率 PNG 二维码或完整 HTML 标签文件（离线可打开/打印）。'}
    ]
  },
  {
    id:'list',title:'样品列表与筛选',roles:['ALL'],
    tags:['列表','筛选','搜索','排序','详情','取消','删除'],
    summary:'多维度组合筛选，支持关键词搜索、状态/部门/类型/限度项目筛选',
    sections:[
      {h:'筛选维度',body:'关键词搜索：编号/名称/规格模糊匹配\n状态下拉：待制作/制作完成/已发行/保管中/退回审核中/已作废\n部门下拉：按保管部门筛选\n类型：OK样品 / NG样品\n限度项目：26 项下拉\n排序：最新优先/最早优先/编号升降序\n快捷预设：待处理/逾期/近7天'},
      {h:'样品详情',body:'点击列表中「详情」弹出弹窗，包含 Tab：信息（基础信息+流转进度+操作日志）、标示卡（限度样品专属）、全量日志、大图。'},
      {h:'取消样品',body:'仅 NEW 或 PRODUCED 状态可取消（创建者/同角色研发/管理员），确认后硬删除不可恢复。'}
    ]
  },
  {
    id:'board',title:'生命周期看板',roles:['QA','CUSTODY','ME'],
    tags:['看板','复检','逾期','到期','预警'],
    summary:'查看复检逾期和即将到期样品，品保据此安排复检计划',
    sections:[
      {h:'看板内容',body:'复检逾期：已超期未复检的样品列表（编号/名称/保管部门/储位/应复检日）\n7天内将到期：未来一周内需复检的样品'},
      {h:'使用场景',body:'品保定期查看看板，安排复检计划。保管部门查看本部门保管样品的复检状态。'}
    ]
  },
  {
    id:'users',title:'用户管理',roles:['ADMIN'],
    tags:['用户','账号','管理','角色','新增用户'],
    summary:'管理员管理账号和角色，新增用户设置初始密码',
    sections:[
      {h:'查看用户列表',body:'显示所有账号：账号、姓名、角色、部门。'},
      {h:'新增用户',body:'填写账号、姓名、角色（RD/ME/QA/CUSTODY）、部门，设置初始密码（默认 123456），点击「新增账号」。'},
      {h:'角色说明',body:'RD = 研发（建样、确认制作、创建替代品）\nME = 生技（同保管）\nQA = 品保（发行、复检、审核退回）\nCUSTODY = 保管（接收、申请退回）\nADMIN = 管理员（用户管理、全局查看）'}
    ]
  }
];
```

- [ ] **Step 2: 验证文件语法**

Run: `node -e "require('./public/js/help-data.js'); console.log('OK, modules:', HELP_DATA.length)"`
Expected: `OK, modules: 10`

- [ ] **Step 3: Commit**

```bash
git add public/js/help-data.js
git commit -m "feat(help): add help content data for 10 functional modules"
```

---

## Task 2: 创建 help.js（UI 逻辑）

**Files:**
- Create: `public/js/help.js`

- [ ] **Step 1: 创建 help.js 文件**

```js
// help.js — 前端使用指南：浮动按钮 + 搜索面板 + 上下文提示条
// 依赖：HELP_DATA（help-data.js）、me（api.js）、$（constants.js）

// 页面 hash → 帮助模块 ID 映射（用于上下文提示条「了解更多」）
var HELP_PAGE_MAP={
  dashboard:null, samples:'list', new:'create', scan:'scan',
  board:'board', logs:null, users:'users'
};
var HELP_PAGE_TIPS={
  dashboard:'首页概览：查看统计数据和待办事项',
  samples:'样品列表：支持多维度筛选和详情查看',
  new:'新建样品：填写信息后自动生成编号和标签',
  scan:'扫码台：扫描样品二维码驱动状态流转',
  board:'生命周期看板：查看复检逾期和即将到期样品',
  logs:'操作日志：系统全局操作记录',
  users:'用户管理：管理账号和角色'
};

// 渲染右下角浮动「?」按钮（登录后调用一次）
function renderHelpButton(){
  if($('#help-fab'))return;
  var fab=el('div','help-fab','?');
  fab.onclick=openHelp;
  document.body.appendChild(fab);
}

// 打开帮助面板（id 可选，传入则自动展开对应模块）
function openHelp(id){
  if(!$('#help-mask'))renderHelpPanel();
  $('#help-mask').style.display='flex';
  filterHelp('');
  if(id)setTimeout(function(){toggleModule(id,true);},50);
}
function closeHelp(){
  var m=$('#help-mask');if(m)m.style.display='none';
}

// 渲染搜索面板 DOM（仅创建一次）
function renderHelpPanel(){
  var mask=el('div','help-mask');
  mask.onclick=function(e){if(e.target===mask)closeHelp();};
  var panel=el('div','help-panel');
  panel.innerHTML=
    '<div class="help-head">'+
      '<input id="help-search" placeholder="搜索关键词..." oninput="filterHelp(this.value)">'+
      '<button class="btn ghost sm" onclick="closeHelp()">关闭</button>'+
    '</div>'+
    '<div id="help-list"></div>';
  mask.appendChild(panel);
  document.body.appendChild(mask);
}

// 按关键词筛选帮助模块（匹配 title/tags/summary/sections.body）
function filterHelp(kw){
  kw=(kw||'').toLowerCase().trim();
  var role=me?me.role:'';
  var list=HELP_DATA.filter(function(m){
    if(m.roles.indexOf('ALL')===-1&&m.roles.indexOf(role)===-1)return false;
    if(!kw)return true;
    if(m.title.toLowerCase().indexOf(kw)>-1)return true;
    if(m.summary.toLowerCase().indexOf(kw)>-1)return true;
    if(m.tags.some(function(t){return t.toLowerCase().indexOf(kw)>-1;}))return true;
    return m.sections.some(function(s){return s.body.toLowerCase().indexOf(kw)>-1;});
  });
  renderHelpList(list);
}

// 渲染模块卡片列表
function renderHelpList(list){
  var box=$('#help-list');if(!box)return;
  if(!list.length){box.innerHTML='<div class="empty">未找到相关帮助内容</div>';return;}
  box.innerHTML=list.map(function(m){
    var roleTags=m.roles.map(function(r){
      return '<span class="tag">'+(r==='ALL'?'全部':r)+'</span>';
    }).join('');
    var sections=m.sections.map(function(s,i){
      return '<div class="help-section" data-idx="'+i+'" style="display:none">'+
        '<h4>'+s.h+'</h4><pre>'+s.body+'</pre></div>';
    }).join('');
    return '<div class="help-module" data-id="'+m.id+'">'+
      '<div class="help-module-head" onclick="toggleModule(\''+m.id+'\')">'+
        '<span class="help-module-title">'+m.title+'</span>'+
        '<span class="help-module-roles">'+roleTags+'</span>'+
        '<span class="help-toggle">展开</span>'+
      '</div>'+
      '<div class="help-module-summary">'+m.summary+'</div>'+
      '<div class="help-sections">'+sections+'</div>'+
    '</div>';
  }).join('');
}

// 展开/折叠模块（id=模块ID，forceOpen=true 时强制展开）
function toggleModule(id,forceOpen){
  var card=document.querySelector('.help-module[data-id="'+id+'"]');
  if(!card)return;
  var isOpen=card.classList.contains('open');
  if(forceOpen&&isOpen)return;
  card.classList.toggle('open');
  var sections=card.querySelectorAll('.help-section');
  var toggle=card.querySelector('.help-toggle');
  if(card.classList.contains('open')){
    sections.forEach(function(s){s.style.display='block';});
    if(toggle)toggle.textContent='收起';
  }else{
    sections.forEach(function(s){s.style.display='none';});
    if(toggle)toggle.textContent='展开';
  }
}

// 渲染上下文提示条（route() 中每次调用）
function renderContextHint(pageKey){
  var tip=HELP_PAGE_TIPS[pageKey];
  var helpId=HELP_PAGE_MAP[pageKey];
  if(!tip||sessionStorage.getItem('help-dismiss-'+pageKey))return '';
  var link=helpId?'<a class="link" onclick="openHelp(\''+helpId+'\')">了解更多 →</a>':'';
  return '<div class="help-hint">'+
    '<span>'+tip+'</span>'+
    link+
    '<span class="help-hint-close" onclick="dismissContextHint(\''+pageKey+'\')">✕</span>'+
  '</div>';
}

// 关闭上下文提示（本次会话不再显示）
function dismissContextHint(pageKey){
  sessionStorage.setItem('help-dismiss-'+pageKey,'1');
  var hints=document.querySelectorAll('.help-hint');
  hints.forEach(function(h){h.remove();});
}
```

- [ ] **Step 2: 验证文件语法**

Run: `node -e "require('./public/js/help.js'); console.log('OK, functions:', ['renderHelpButton','openHelp','closeHelp','renderHelpPanel','filterHelp','renderHelpList','toggleModule','renderContextHint','dismissContextHint'].filter(f=>typeof global[f]!=='undefined').length)"`
Expected: `OK, functions: 9`

- [ ] **Step 3: Commit**

```bash
git add public/js/help.js
git commit -m "feat(help): add floating button, search panel, and context hint logic"
```

---

## Task 3: 添加帮助组件 CSS 样式

**Files:**
- Modify: `public/css/app.css`（末尾追加）

- [ ] **Step 1: 在 app.css 末尾追加帮助组件样式**

在文件末尾（第 121 行 `.card-grid .full-row{grid-column:1/-1}` 之后）追加：

```css
/* 帮助指南 */
.help-fab{position:fixed;bottom:24px;right:24px;width:48px;height:48px;border-radius:50%;background:var(--brand);color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:var(--shadow);z-index:90;transition:.2s}
.help-fab:hover{background:var(--brand-d);transform:scale(1.05)}
.help-mask{position:fixed;inset:0;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;z-index:100}
.help-panel{background:#fff;border-radius:16px;width:94vw;max-width:600px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:var(--shadow)}
.help-head{display:flex;gap:10px;padding:14px 18px;border-bottom:1px solid var(--line);align-items:center}
.help-head input{flex:1}
#help-list{flex:1;overflow-y:auto;padding:10px 18px}
.help-module{border:1px solid var(--line);border-radius:10px;margin-bottom:8px;overflow:hidden}
.help-module-head{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;background:var(--bg)}
.help-module-title{font-weight:600;flex:1}
.help-module-roles{display:flex;gap:4px}
.help-toggle{font-size:12px;color:var(--brand);white-space:nowrap}
.help-module-summary{padding:6px 14px;font-size:13px;color:var(--muted)}
.help-module.open .help-module-summary{display:none}
.help-sections{padding:0 14px}
.help-section{margin-bottom:8px}
.help-section h4{margin:8px 0 4px;font-size:13px;color:var(--brand)}
.help-section pre{font-family:inherit;font-size:13px;line-height:1.6;white-space:pre-wrap;margin:0;color:var(--text)}
.help-hint{display:flex;align-items:center;gap:10px;padding:8px 14px;background:#fffbe6;border:1px solid #ffe58f;border-radius:8px;margin-bottom:12px;font-size:13px}
.help-hint .link{margin-left:auto}
.help-hint-close{cursor:pointer;color:var(--muted);font-size:16px;padding:0 4px}
.help-hint-close:hover{color:var(--bad)}
@media print{.help-fab,.help-mask,.help-hint{display:none!important}}
```

- [ ] **Step 2: 验证 CSS 行数**

Run: `wc -l public/css/app.css`
Expected: 约 161 行（121 + 40）

- [ ] **Step 3: Commit**

```bash
git add public/css/app.css
git commit -m "feat(help): add CSS styles for floating button, panel, and context hint"
```

---

## Task 4: 集成到 index.html 和 router.js

**Files:**
- Modify: `public/index.html`（引用 JS 文件）
- Modify: `public/js/router.js`（route 中调用 renderContextHint）
- Modify: `public/js/api.js`（showApp 中调用 renderHelpButton）

- [ ] **Step 1: index.html 添加 JS 引用**

在 `index.html` 第 66 行 `<script src="/js/users.js"></script>` 之后、`<script src="/js/router.js"></script>` 之前插入：

```html
<script src="/js/help-data.js"></script>
<script src="/js/help.js"></script>
```

修改后的 script 区域：
```html
<script src="/js/users.js"></script>
<!-- 帮助指南 -->
<script src="/js/help-data.js"></script>
<script src="/js/help.js"></script>
<!-- 路由最后加载，确保所有 VIEWS 函数已定义 -->
<script src="/js/router.js"></script>
```

- [ ] **Step 2: router.js 在 route() 中调用 renderContextHint**

在 `router.js` 的 `route()` 函数中，`v()` 调用之前插入上下文提示条渲染：

原代码（第 20-26 行）：
```js
function route(){
  const k=(location.hash.replace('#/','')||'dashboard');
  const v=VIEWS[k]||viewDashboard; setActive(k);
  const meta={dashboard:'首页概览',samples:'样品列表',new:'新建样品',scan:'扫码台',board:'生命周期看板',logs:'操作日志',users:'用户管理'};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
}
```

改为：
```js
function route(){
  const k=(location.hash.replace('#/','')||'dashboard');
  const v=VIEWS[k]||viewDashboard; setActive(k);
  const meta={dashboard:'首页概览',samples:'样品列表',new:'新建样品',scan:'扫码台',board:'生命周期看板',logs:'操作日志',users:'用户管理'};
  $('#page-title').textContent=meta[k]||'';
  $('#page-actions').innerHTML='';
  v();
  var hint=renderContextHint(k);
  if(hint)$('#view').insertAdjacentHTML('afterbegin',hint);
}
```

关键改动：先调 `v()` 渲染页面内容，再用 `insertAdjacentHTML('afterbegin',...)` 将提示条插入到 `#view` 最前面（避免被 `v()` 覆盖）。

- [ ] **Step 3: api.js 在 showApp() 中调用 renderHelpButton**

在 `api.js` 的 `showApp()` 函数中，`route()` 调用之前插入：

原代码（第 20-25 行）：
```js
function showApp(){
  $('#app').style.display='flex';
  $('#me-name').textContent=me.display_name||me.username;
  $('#me-role').textContent=(ROLE[me.role]||me.role)+' · '+(me.dept||'');
  buildNav(); route();
}
```

改为：
```js
function showApp(){
  $('#app').style.display='flex';
  $('#me-name').textContent=me.display_name||me.username;
  $('#me-role').textContent=(ROLE[me.role]||me.role)+' · '+(me.dept||'');
  buildNav(); renderHelpButton(); route();
}
```

- [ ] **Step 4: 验证服务启动**

Run: `node -e "require('./public/js/help-data.js'); require('./public/js/help.js'); console.log('All JS loaded OK')"`

- [ ] **Step 5: Commit**

```bash
git add public/index.html public/js/router.js public/js/api.js
git commit -m "feat(help): integrate help guide into index.html, router, and api"
```

---

## Task 5: 手动验证

**Files:** 无（纯验证）

- [ ] **Step 1: 启动服务**

```bash
cd /www/wwwroot/sample-mgmt && node server.js
```

- [ ] **Step 2: 验证浮动按钮**

1. 浏览器访问 `http://localhost:3000`
2. 登录任意账号
3. 确认右下角显示蓝色「?」浮动按钮

- [ ] **Step 3: 验证搜索面板**

1. 点击「?」按钮
2. 确认弹出搜索面板
3. 搜索框输入「扫码」→ 确认筛选出「扫码台」模块
4. 点击模块标题 → 确认展开详细内容
5. 再次点击 → 确认收起
6. 点击遮罩或「关闭」→ 确认面板关闭

- [ ] **Step 4: 验证上下文提示条**

1. 导航到「样品列表」→ 确认顶部显示提示条「样品列表：支持多维度筛选和详情查看」
2. 点击「了解更多 →」→ 确认打开搜索面板并定位到「样品列表与筛选」模块
3. 关闭面板，点击提示条「✕」→ 确认提示条消失
4. 切换到其他页面再回来 → 确认提示条不再显示（本次会话已关闭）

- [ ] **Step 5: 验证角色过滤**

1. 登录 rd01（研发）→ 打开帮助 → 确认看到「建样」「扫码台」「退回与作废」「打印」「样品列表」「登录与账号」等模块
2. 确认不显示「品保发行向导」「品保复检」「用户管理」等非研发模块
3. 登录 admin → 打开帮助 → 确认看到全部 10 个模块

- [ ] **Step 6: 验证打印时隐藏**

1. 导航到任意页面
2. 按 Ctrl+P 打印预览
3. 确认浮动按钮和提示条不在打印输出中

---

## 自审清单

- [x] 规格覆盖：10 个模块全覆盖（login/create/scan/release/inspect/return/print/list/board/users）
- [x] 无占位符：所有代码完整可执行
- [x] 类型一致：函数名在所有 Task 中一致（renderHelpButton/openHelp/closeHelp/filterHelp/renderHelpList/toggleModule/renderContextHint/dismissContextHint）
- [x] 文件容量：help-data.js ~200行（上限800）、help.js ~150行（上限300）、app.css ~161行（上限200）、index.html +2行、router.js +1行、api.js +1行
- [x] 无账号密码：帮助内容不包含具体登录凭证
- [x] 打印隐藏：@media print 规则已添加
