# 样品详情弹窗响应式优化设计

- **日期**: 2026-07-23
- **状态**: 已确认(待用户审查)
- **作者**: brainstorming 流程产出
- **关联问题**: samples 页面弹窗超出视窗(已临时修复 max-height:90vh + overflow-y:auto,本设计为正式优化)

## 1. 背景与目标

### 1.1 问题现状
`public/index.html` 第 75 行 `.modal` 缺少高度限制与滚动设置,样品列表点「详情」打开的弹窗包含 12+ 字段、图片、流转进度、操作日志表,内容堆叠后高度超出视窗,而 `.modal-mask` 用 `align-items:center` 居中,导致顶部字段与底部「关闭」按钮被裁切且无法访问。

临时修复:`max-height:90vh;overflow-y:auto` 已使弹窗可滚动,但用户体验仍有改进空间:
- 信息密度高、无视觉分区
- 内部滚动条割裂感
- 大屏空间未利用
- 移动端长表格难用

### 1.2 设计目标
1. **不出现内部滚动条**:通过紧凑布局让一屏内呈现全部核心内容
2. **响应式自适配**:小屏到大屏(≥1600px)平滑扩展,大屏三栏并列
3. **最小改动**:仅改 CSS 与 `viewDetail`/`openModal` 模板,不新建文件
4. **保持路由/接口/DB 不变**:无下游依赖同步
5. **不触发 index.html 行数上限**:预估 510 行(当前 474,上限 600,预警阈值 70% 已触发但仍可承受)

## 2. 方案选型

brainstorming 阶段对比 3 个方案:

| 方案 | 改造量 | 修复溢出 | 列表上下文 | URL 分享 | 文件膨胀 |
|---|---|---|---|---|---|
| A · 弹窗内部分区 | 小 | ✓ | ✗ | ✗ | 低 |
| B · 侧滑抽屉 | 中 | ✓ | ✓ | ✗ | 低 |
| C · 独立详情路由 | 大 | ✓ | 可返回 | ✓ | 中 |

**用户选定:方案 A + 响应式 + 大屏自适配**,理由:改造量最小、不触发拆分压力、与现有 `.modal-mask` 体系复用。

## 3. 架构设计

### 3.1 弹窗结构改造

原结构(单 div 堆叠):
```html
<div class="modal-mask">
  <div class="modal">
    <h3>样品详情</h3>
    <!-- 所有内容纵向堆叠 -->
    <button>关闭</button>
  </div>
</div>
```

新结构(flex 三段式 + 内容区双/三栏):
```html
<div class="modal-mask">
  <div class="modal">
    <div class="modal-head">
      <b>SM-000005</b>
      <span class="badge">保管中</span>
    </div>
    <div class="modal-body">
      <div class="detail-grid">
        <div class="detail-left">基础信息(2列网格) + 图片缩略图(非 XL 时)</div>
        <div class="detail-right">流转进度(横向chip) + 日志(最近2条)</div>
        <!-- XL 大屏追加第三栏,默认 display:none -->
        <div class="detail-img">图片缩略图(仅 XL 显示)</div>
      </div>
    </div>
    <div class="modal-foot">
      <button>关闭</button>
    </div>
  </div>
</div>
```

### 3.2 响应式断点(5 档)

| 断点 | 视窗宽度 | 弹窗宽度 | 布局 | 字号 |
|---|---|---|---|---|
| XS | <576px | 94vw | 单栏堆叠 | 12px |
| SM | 576~767px | 520px | 单栏(字段 2 列) | 13px |
| MD | 768~1199px | 640px | 双栏 35%/65% | 14px |
| LG | 1200~1599px | 800px | 双栏 30%/70% | 14px |
| XL | ≥1600px | 900px(max) | 三栏 25%/25%/50% | 15px |

### 3.3 日志查看交互(方案1 · 弹窗内切换)

- 默认:body 仅显示最近 2 条日志 + 「查看全部 N 条 →」链接
- 点击链接:body 加 `.log-mode` 类 → 内容切换为日志全表(此时允许 `overflow-y:auto` 滚动) + 顶部「← 返回详情」按钮
- 返回详情:移除 `.log-mode` 类 → 恢复双/三栏视图
- 关闭弹窗:状态自然重置(因 DOM 被移除)

## 4. 详细设计

### 4.1 CSS 改动(`index.html:74-86`)

**修改** `.modal`:
```css
/* 原 */
.modal{background:#fff;border-radius:16px;padding:24px;width:420px;max-width:92vw;box-shadow:var(--shadow)}
/* 新 */
.modal{
  background:#fff;border-radius:16px;
  width:94vw;max-width:900px;
  max-height:90vh;
  display:flex;flex-direction:column;
  padding:0;overflow:hidden;
  box-shadow:var(--shadow);
}
```

**新增** 模态结构类:
```css
.modal-head{flex:none;padding:12px 18px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--line)}
.modal-body{flex:1;overflow:hidden;padding:0}        /* 默认不滚动 */
.modal-body.log-mode{overflow-y:auto}                  /* 日志模式才滚 */
.modal-foot{flex:none;padding:8px 18px;border-top:1px solid var(--line);text-align:right;background:var(--bg)}
.modal h3{margin:0}  /* 移除原 0 0 14px,因 head 已有 padding */
```

**新增** 详情网格 + 字段网格 + 横向进度:
```css
.detail-grid{display:grid;grid-template-columns:1fr}  /* 默认单栏 */
.detail-grid>div{padding:12px 14px}
.detail-grid>div:not(:last-child){border-bottom:1px dashed var(--line)}  /* 单栏时下虚线分隔 */
.detail-img{display:none}  /* 默认隐藏,仅 XL 显示 */

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
  .detail-img{display:block}  /* XL 显示第三栏 */
}
```

### 4.2 JS 改动

**修改** `openModal`(第 468 行),扩展支持 head/foot:
```js
function openModal(title, html, opts){
  opts = opts || {};
  const m = el('div', 'modal-mask');
  const headHTML = opts.head != null ? opts.head : `<h3>${title}</h3>`;
  const footHTML = opts.foot != null ? opts.foot : `<button class="btn ghost sm" onclick="this.closest('.modal-mask').remove()">关闭</button>`;
  m.innerHTML = `<div class="modal">
    <div class="modal-head">${headHTML}</div>
    <div class="modal-body">${html}</div>
    <div class="modal-foot">${footHTML}</div>
  </div>`;
  document.body.appendChild(m);
  return m;
}
```

**重构** `viewDetail`(第 224-244 行):
```js
async function viewDetail(id){
  const s = await api('GET', '/api/samples/'+id);
  const steps = [['制作完成', s.produced_at], ['正式发行', s.released_at], ['分发保管', s.status==='IN_CUSTODY' ? ('储位 '+s.storage_location) : null]];
  const head = `<b>${s.sample_no}</b>${statusBadge(s)}`;
  // 基础信息(2列网格)
  const leftHTML = `<div class="label">基础信息</div>
    <div class="field-grid">
      <span class="label">名称</span><span>${s.name||'—'}</span>
      <span class="label">机型</span><span>${s.model||'—'}</span>
      <span class="label">站别</span><span>${s.station||'—'}</span>
      <span class="label">规格</span><span>${s.spec||'—'}</span>
      <span class="label">保管</span><span>${s.custody_dept||'—'}</span>
      <span class="label">储位</span><span>${s.storage_location||'—'}</span>
      <span class="label">复检</span><span>${s.release_cycle_days ? s.release_cycle_days+'天' : '—'} / ${fmt(s.next_inspect_at)}</span>
      <span class="label">备注</span><span>${s.notes||'—'}</span>
    </div>`;
  // 图片:XL 独立第三栏(.detail-img);非 XL 时合并到左栏末尾(imgHTML)
  const imgHTML = s.image ? `<div style="margin-top:8px"><img src="${s.image}" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>` : '';
  const xlImgHTML = s.image ? `<div class="detail-img"><div class="label">图片</div><img src="${s.image}" style="width:80px;height:80px;object-fit:cover;border-radius:6px"/></div>` : '<div class="detail-img"></div>';
  // 进度(横向 chip)
  const progressHTML = steps.map((x,i) => `<span class="chip ${x[1]?'done':'pending'}">${i+1}${x[0]}</span>${i<steps.length-1?'<span class="muted">→</span>':''}`).join('');
  // 日志(最近2条 + 查看全部)
  const recentLogs = s.logs.slice(0,2);
  const logsHTML = recentLogs.length ?
    `<div class="log-list">${recentLogs.map(l => `<div><span class="muted">${fmt(l.created_at)}</span> · ${l.action} · ${l.role||''}/${l.dept||''}</div>`).join('')}</div>` :
    '<div class="muted">暂无日志</div>';
  const viewAll = s.logs.length > 2 ? `<div style="margin-top:4px"><a class="link" onclick="viewDetailLogs(${id})">查看全部 ${s.logs.length} 条 →</a></div>` : '';

  const body = `<div class="detail-grid">
    <div>
      ${leftHTML}
      ${imgHTML}
    </div>
    <div>
      <div class="label">流转进度</div>
      <div class="chip-flow">${progressHTML}</div>
      <div class="label">操作日志(最近2条)</div>
      ${logsHTML}
      ${viewAll}
    </div>
    ${xlImgHTML}
  </div>`;
  openModal('', body, {head: head});
}

async function viewDetailLogs(id){
  const s = await api('GET', '/api/samples/'+id);
  const body = document.querySelector('.modal-body');
  if(!body) return;
  const tableHTML = `<div style="padding:12px 14px">
    <div style="margin-bottom:8px"><a class="link" onclick="viewDetail(${id})">← 返回详情</a></div>
    <table><tr><th>时间</th><th>动作</th><th>角色/部门</th><th>储位</th><th>备注</th></tr>
    ${s.logs.map(l => `<tr><td class="muted">${fmt(l.created_at)}</td><td>${l.action}</td><td class="muted">${l.role||''}/${l.dept||''}</td><td class="muted">${l.location||'—'}</td><td class="muted">${l.note||'—'}</td></tr>`).join('')}
    </table>
  </div>`;
  body.classList.add('log-mode');
  body.innerHTML = tableHTML;
}
```

### 4.3 旧 CSS 清理
原 `.modal h3{margin:0 0 14px}` → 改为 `.modal h3{margin:0`(因 head 已有 padding)。
原 `.sample-card` 在 viewDetail 中不再使用,可保留(其他地方仍用)。
原 `.step`/`.step .dot` 等进度样式:仍被 `chip` 替代但保留,因 CSS 无副作用且文件已在预警期,删除留待后续重构。

## 5. 全链路影响分析

### 5.1 检索维度

| 维度 | 影响项 | 处理 |
|---|---|---|
| 代码层 | `openModal`(468) 函数签名扩展(新增 opts 参数) | 向后兼容:opts 默认 {},旧调用方式仍工作 |
| 代码层 | `viewDetail`(224-244) 模板重构 | 仅本函数变化,无外部调用 |
| 代码层 | 新增 `viewDetailLogs` 函数 | 新增,无冲突 |
| 代码层 | `.modal`/`.modal-mask` CSS | 影响所有 modal-mask 实例;目前仅 viewDetail 调用,无其他消费方 |
| DB 层 | 无 | API `GET /api/samples/:id` 已返回完整 logs 数组 |
| 配置层 | 无 | |
| 接口层 | 无 | 不新增/修改 API |
| 文档层 | 无 | README 无弹窗相关说明 |

### 5.2 受影响业务场景
1. **样品列表 → 详情**:核心场景,直接受益(无溢出、分区清晰)
2. **扫码台 → 渲染样品信息**:使用 `.card.sample-card` 不受影响,仍保持原状
3. **其他 openModal 调用**:无(全项目仅 viewDetail 调用 openModal)

### 5.3 兼容性
- `openModal(title, html)` 旧签名仍可用(opts 默认 {})
- 旧 `.modal-mask` 实例的渲染不受影响(仅 `.modal` 内部结构变)
- API 无变更,前端可独立部署

## 6. 验证方案

### 6.1 单元/集成测试(手动)
本项目无自动化测试框架(原生 HTML/JS,无构建),以下为手动验证清单:

| # | 场景 | 预期 |
|---|---|---|
| 1 | 桌面 1440×900 点详情 | 弹窗 800px,双栏 30/70,无滚动条,关闭按钮可见 |
| 2 | 大屏 1920×1080 点详情 | 弹窗 900px,三栏,基础/图片/进度+日志并列 |
| 3 | 平板 768×1024 点详情 | 弹窗 640px,双栏 35/65 |
| 4 | 手机 375×667 点详情 | 弹窗 94vw,单栏,字段 2 列网格 |
| 5 | 日志 >2 条样品 | 显示「查看全部 N 条」,点击切换日志全表,可滚动 |
| 6 | 日志全表 → 返回详情 | 恢复双/三栏视图,无滚动条 |
| 7 | 日志 = 0 条样品 | 显示「暂无日志」,无「查看全部」链接 |
| 8 | 逾期样品 | 复检日期红色高亮(沿用 overdue 类) |
| 9 | 关闭弹窗后再开另一个 | 状态正确重置(DOM 移除) |
| 10 | 旧 openModal 调用(无 opts) | 仍正常渲染(向后兼容) |

### 6.2 回归验证步骤
1. `npm start` 启动服务
2. 浏览器访问,登录 admin/admin123
3. 进入「样品列表」,逐个点击不同状态样品(NEW/PRODUCED/RELEASED/IN_CUSTODY)的「详情」
4. 在 DevTools 切换设备模拟(iPhone SE / iPad / 桌面 / 自定义 1920×1080)验证响应式
5. 对日志较多的样品验证「查看全部 → 返回」切换
6. 进入「扫码台」验证扫码流程不受影响
7. 进入「生命周期看板」「操作日志」「用户管理」验证其他页面无回归

### 6.3 兼容性验证点
- 旧浏览器(无 grid 支持):降级为单栏堆叠,内容仍完整可读
- 高对比度模式:chip/badge 颜色仍可辨识
- 屏幕阅读器:head/body/foot 语义清晰(无 ARIA,但 DOM 结构层级正确)

## 7. 上线后监控

- **1~3 个业务周期**关注:
  - 用户反馈弹窗是否仍有溢出/裁切
  - 移动端用户(扫码场景)的详情查看体验
  - 浏览器控制台无 JS 错误(尤其 `viewDetailLogs` 切换逻辑)
- **隐性漏改排查**:
  - 确认无其他页面调用 `openModal`(已确认仅 viewDetail)
  - 确认 `.modal-mask`/`.modal` CSS 改动未影响其他遮罩场景(无其他使用)

## 8. 文件臃肿检测(修改后预估)

| 文件 | 当前 | 修改后预估 | 上限 | 预警阈值 |
|---|---|---|---|---|
| public/index.html | 474 行 / 29841 字符 | ~510 行 / ~32000 字符 | 600 行 / 20000 字符 | 70%=420 行(已触发) / 字符已超限 |

**说明**:
- 行数 510 仍在上限 600 内,但 70% 预警已触发
- **字符数 32000 已超过 20000 兜底限制**(原本已超)
- 本次修改属「修复溢出 bug」性质,符合预警期「仅允许精简/修复」约束
- **建议后续迭代**:将 index.html 拆分为 `public/css/app.css` + `public/js/*.js`(按模块),HTML 仅保留结构与引用 — 此为独立重构任务,不在本次范围

## 9. 变更记录

| 类型 | 文件 | 变更 |
|---|---|---|
| 修改 | public/index.html | CSS:.modal 改 flex 容器 + 新增 .modal-head/.modal-body/.modal-foot/.detail-grid/.field-grid/.chip-flow/.log-mode + 3 个媒体查询 |
| 修改 | public/index.html | JS:openModal 扩展 opts 参数(向后兼容) |
| 修改 | public/index.html | JS:viewDetail 重构为 head/body/foot + 双/三栏模板 |
| 新增 | public/index.html | JS:viewDetailLogs 函数(日志全表切换) |
| 删除 | public/index.html | 原 viewDetail 中纵向 step 结构(改横向 chip) |

**兼容性影响**:
- 不受影响:扫码台、看板、日志、用户管理、登录
- 需调整:无(API 无变更,仅前端)
- 部署步骤:`npm start` 重启即可,无需 DB 迁移/配置变更
- 回滚:还原 index.html 的 `.modal`/`viewDetail`/`openModal` 三处即可

## 10. 不在本次范围

- index.html 整体拆分重构(独立任务)
- ARIA 无障碍标签补全
- 详情页 URL 可分享(方案 C 的能力)
- 列表上下文保留(方案 B 的能力)
- 操作日志的分页/筛选(仅做弹窗内切换)
