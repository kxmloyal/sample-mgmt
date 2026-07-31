# 样品详情弹窗 — B+C 混合卡片流式布局 设计文档

> **状态：已确认** | **关联计划：待生成**

## 1. 目标

将样品列表的详情弹窗从当前 CSS Grid 自适应分栏布局，升级为 **卡片流式 + 底部 Tab** 的 B+C 混合方案，并支持图片点击放大。

## 2. 动机

当前 Grid 布局存在三个问题：
- XL 断点以下样品图片不可见（仅在 ≥1600px 三栏时显示）
- 信息密度偏低，左右两栏内容量不均导致大量留白
- 无法按需求快速查看特定信息块（如全量日志需替换整个 body）

## 3. 方案选择

对比了 3 种方案后选择 **B+C 混合方案**：

| 方案 | 优势 | 不足 |
|---|---|---|
| A. 当前 Grid | 成熟稳定 | 图片不可见、留白多 |
| B. 卡片流式 | 层级清晰、图片全断点可见 | 日志卡全宽时空间占用大 |
| C. Tabs 面板 | 信息密度最高 | 无法一屏纵览 |
| **B+C 混合（选中）** | 一屏纵览 + 深度查看兼顾 | 实现复杂度中等 |

## 4. 整体结构

```
┌─────────────────────────────────────┐
│ 弹窗头部: SM-000001 [已发行] [关闭]   │
├─────────────────────────────────────┤
│                                     │
│  ┌─ 基本信息卡 ───┐ ┌─ 流转进度卡 ─┐│
│  │名称/机型/站别   │ │ ● 制作完成 ✓  ││
│  │规格/保管/储位   │ │ ● 正式发行 ✓  ││
│  │复检/备注       │ │ ○ 分发保管    ││
│  └────────────────┘ └──────────────┘│
│  ┌─ 图片卡 ───┐                     │
│  │ [样品缩略图] │ ← 点击弹大图       │
│  └────────────┘                     │
│  ┌─ 操作日志卡（最近2条）───────────┐ │
│  │ 07-20 RELEASE ... [查看全部5条→] │ │
│  └────────────────────────────────┘ │
│                                     │
├─ Tab栏: [📋信息] [📝全量日志] [📷大图] ─┤
│  (默认激活「信息」，仅在有内容时显示)   │
└─────────────────────────────────────┘
```

**核心原则：** 主视图用 flex-wrap 卡片流（方案 B），底部 Tab 做辅助切换（方案 C），图片点击独立弹层放大。

## 5. 响应式布局策略

5 档断点，移动优先：

| 断点 | 宽度 | 卡片排列 | 弹窗宽度 |
|---|---|---|---|
| XS | <576px | 全部单列堆叠 | 94vw |
| SM | 576-767px | 信息+进度各50%并排，图片/日志全宽 | 94vw |
| MD | 768-1199px | 信息55%+进度45%并排，图片200px固定，日志全宽 | 750px |
| LG | 1200-1599px | 信息45%+进度30%+图片25%并排，日志全宽 | 800px |
| XL | ≥1600px | 信息40%+进度25%+图片15%+日志20%四栏 | 900px |

关键规则：
- 图片在所有断点可见（不再 XL 才显示）
- 日志卡始终全宽
- 流转进度用纵向时间线替代横向 chip 流
- `@media` 查询用 `min-width`（移动优先）

## 6. 组件设计

### 6.1 卡片

每一信息块为独立卡片，共用 `.detail-card` 基类，按功能加修饰类：

| CSS 类 | 用途 | flex 参数 |
|---|---|---|
| `.detail-card.info` | 基本信息（label-value 网格） | `flex:1 1 260px` |
| `.detail-card.progress` | 流转进度（纵向时间线） | `flex:1 1 180px` |
| `.detail-card.image` | 样品图片（缩略图） | `flex:0 0 auto` |
| `.detail-card.logs` | 操作日志（全宽） | `flex:1 1 100%` |

卡片容器 `.detail-cards` 使用 `flex-wrap:wrap; gap:10px`。

### 6.2 流转进度（纵向时间线）

```
● 制作完成 ✓  07-18
● 正式发行 ✓  07-20
○ 分发保管
```

- 每步：圆点(8px) + 文字 + 日期
- 完成态：绿色圆点 + `var(--ok)`
- 未完成：灰色圆点 + `#ddd`

### 6.3 图片点击放大

- 缩略图 100×100px，`object-fit:cover`
- 点击触发 `showImageView(src)` → 全屏半透明遮罩（z-index:50）
- 大图 `max-width:80vw; max-height:80vh`
- 点击遮罩或 `×` 关闭

### 6.4 Tab 栏

- 仅在对应内容存在时显示（有图片显示「📷大图」，有日志显示「📝全量日志」）
- 默认激活「信息」Tab
- 切换「全量日志」→ 复用 `viewDetailLogs` 逻辑
- 切换「大图」→ body 居中展示大图
- Tab 切换不重新请求数据

## 7. 文件变更清单

| 文件 | 操作 | 说明 |
|---|---|---|
| `public/index.html` | 修改 | CSS 新增卡片/Tab/图片弹层样式 + 重写 renderDetailBody |
| 其他文件 | 不变 | 后端 API、数据结构、openModal 均兼容 |

**仅修改 1 个文件**，无新建/删除。

## 8. CSS 变更详述

### 新增（约 35 行）
```css
.detail-cards{...}
.detail-card{...}
.detail-card.info{...}
.detail-card.progress{...}
.progress-timeline{...}
.progress-step{...}
.progress-step.done .dot{...}
.progress-step.pending .dot{...}
.progress-step .dot{...}
.detail-card.image{...}
.detail-card.image img{...}
.detail-card.logs{...}
.detail-tabs{...}
.detail-tab{...}
.detail-tab.active{...}
.img-overlay{...}
.img-overlay img{...}
```

### 修改
- 各响应式断点内：替换 `.detail-grid` 规则为 `.detail-card` 规则

### 删除（约 20 行）
- `.detail-grid` 及所有响应式变体
- `.detail-img` 及 XL 断点 `display:block`
- `.chip-flow`（保留 `.chip` 基础样式，其他页面可能引用）

**净增约 15 行 CSS，10 行 JS。**

## 9. JS 变更详述

### 重写 `renderDetailBody(id)`
- 生成 `.detail-cards` 容器 + 4 张卡片 HTML
- 生成 `.detail-tabs` Tab 栏（条件渲染）
- 数据复用现有 API（`GET /api/samples/:id`），无需变更

### 新增 `showImageView(src)`
```js
function showImageView(src){
  const overlay=el('div','img-overlay');
  overlay.innerHTML='<img src="'+src+'" onclick="event.stopPropagation()"><span style="position:absolute;top:20px;right:30px;color:#fff;font-size:28px;cursor:pointer">×</span>';
  overlay.onclick=function(){this.remove();};
  overlay.querySelector('span').onclick=function(){overlay.remove();};
  document.body.appendChild(overlay);
}
```

### 修改 `viewDetailLogs(id)`
- 增加 Tab 高亮切换（将 `.detail-tab` 的 `active` 类切换到「全量日志」）

### 修改 `openModal(title,html,opts)`
- 新增 `opts.tabs` 参数，支持在 `.modal-foot` 上方插入 Tab 栏 HTML

## 10. 兼容性说明

| 影响范围 | 评估 |
|---|---|
| 其他弹窗 | 无影响（`.detail-grid` 仅详情弹窗使用） |
| API | 不变（仍用 `GET /api/samples/:id`） |
| 数据库 | 不变 |
| 现有功能 | `viewDetailLogs` 逻辑保留并增强 |
| 浏览器兼容 | flex-wrap/gap 均为基础特性，全兼容 |

## 11. 容量红线

| 文件 | 当前 | 预估变更后 | 上限 | 状态 |
|---|---|---|---|---|
| `public/index.html` | ~535 行 | ~550 行 | 600 行 | 91.7%，安全 |
| 字符数 | ~32757 | ~33500 | 20000 | **已超限，但本次不新增文件** |

> 注：index.html 字符超限为历史技术债，不在本次解决范围。本次仅做增量优化。

## 12. 完成标准

- [ ] 5 档断点均正常显示
- [ ] 图片在所有断点可见
- [ ] 点击图片弹大图，可关闭
- [ ] Tab 切换正常（信息/全量日志/大图）
- [ ] 现有 14 条测试全部 PASS
- [ ] 手动验收：XS/SM/MD/LG/XL 各档截图

## 13. 不涉及范围

- 不拆分 index.html 文件（属于独立架构重构任务）
- 不修改后端 API
- 不新增数据库字段
- 不改变 openModal 外部调用签名
