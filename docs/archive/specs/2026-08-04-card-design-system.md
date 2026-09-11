# 卡片设计系统规范（Card Design System）

> 版本：1.0.0 ｜ 日期：2026-08-04 ｜ 状态：已实施
> 本规范定义制造品质管理系统所有子系统的**卡片组件统一标准**，后续新子系统 MUST 按本规范实现卡片。

## 1. 设计 Token（CSS 变量，定义于 app.css :root）

所有卡片 MUST 使用以下 token，禁止硬编码圆角/阴影/过渡值。

```css
:root{
  /* 卡片设计 token */
  --card-radius:12px;                    /* 统一圆角（原 kb-stat 14px / portal-card 12px 混用） */
  --card-border:1px solid var(--line);   /* 统一边框 */
  --card-pad:14px 16px;                  /* 统一内边距 */
  --card-hover:transform .15s ease,box-shadow .15s ease;  /* 统一过渡 */
  --card-shadow-hover:0 4px 12px rgba(15,23,42,.10);      /* 统一 hover 阴影 */
}
```

## 2. 卡片类型

| 类型 | 类名 | 用途 | 结构 |
|---|---|---|---|
| 统计卡 | `.kb-stat` | 看板/工作台待办统计 | 色条 + 数字 + 标签（+可选扩展区） |
| 入口卡 | `.portal-card` | 门户子系统入口 | 图标 + 标题 + 描述 + 按钮 |
| 内容卡 | `.card` | 表格/表单内容容器 | 任意内容块 |

## 3. 统计卡 `.kb-stat` 组件规范（唯一标准）

### 3.1 结构（四区）

```html
<fluent-card class="kb-stat" style="--stat-color:#0f766e" data-k="requested" onclick="onCardClick(this)">
  <div class="n">12</div>          <!-- ① 数字区：26px 粗体，颜色 = --stat-color -->
  <div class="l">待处理</div>       <!-- ② 标签区：12px 弱化色 -->
  <div class="x">可选扩展区</div>    <!-- ③ 扩展区（可选）：如积压标签 .wb-tags -->
</fluent-card>
```

### 3.2 视觉规范（app.css 已定义，子系统禁止覆盖）

| 属性 | 值 | 说明 |
|---|---|---|
| 背景 | `var(--panel)` | 白面板 |
| 边框 | `var(--card-border)` | 1px 分隔线 |
| 圆角 | `var(--card-radius)` | 12px |
| 左侧色条 | `::before` 4px `--stat-color` | 状态色语义 |
| 数字 | 26px/700，`--stat-color` | 主指标 |
| 标签 | 12px `var(--muted)` | 指标说明 |
| hover | `translateY(-2px)` + `--card-shadow-hover` | 上浮反馈 |
| active | 边框高亮 + `--stat-color` 2px 光环 + `#eef2ff` 背景 | 选中态 |

### 3.3 交互协议（MUST）

| 动作 | 行为 | 实现 |
|---|---|---|
| hover | 上浮 + 阴影加深 | CSS `.kb-stat:hover` |
| 单击 | 联动筛选对应数据（看板筛选待办 / 工作台筛选部门） | `onclick` 设置全局筛选变量后重渲染 |
| 再次单击 | 切换（取消筛选） | 若卡片已 active，再次点击清除筛选 |
| 双击 | 跳转对应列表页 | `ondblclick="location.hash=..."`（仅单一子系统看板） |

### 3.4 颜色语义（--stat-color）

| 语义 | 值 |
|---|---|
| 品牌/待办 | `var(--brand)` |
| 警告/待验证 | `var(--warn)` |
| 进行中 | `#1d4ed8` / `#065f46` / `#92400e` |
| 危险/逾期 | `var(--bad)` |

## 4. 入口卡 `.portal-card`（门户专用）

- 整卡为 `<a>`，点击进入子系统
- 视觉 token：`border-radius:var(--card-radius)`、`transition:var(--card-hover)`、hover `box-shadow:var(--card-shadow-hover)`
- 结构：图标（SVG 40px）+ 标题 + 描述 + 「进入系统」按钮
- **禁止**：统计卡与入口卡混用结构

## 5. 新子系统导入方法

1. `index.html` 引入共享样式：`<link rel="stylesheet" href="/css/app.css" />`
2. 统计卡直接使用 `.kb-stat`（fluent-card 容器），MUST 加载 `/vendor/fluentui-web-components.js`
3. 数据渲染：卡片遍历 `data-k` + `onclick` 调子系统筛选函数 + `active` 态管理
4. 子系统专属补充样式（如积压标签）写入本子系统 `css/module.css`，**禁止**写入 app.css
5. 不得修改 app.css 中 `.kb-stat` 的视觉/交互定义（共享约束，双系统依赖）

## 6. 一致性校验清单

- [ ] 卡片圆角使用 `var(--card-radius)`，无硬编码 14/16px
- [ ] hover 过渡使用 `var(--card-hover)`，阴影使用 `var(--card-shadow-hover)`
- [ ] 统计卡结构为 `.n` + `.l`（+可选 `.x`），无其他自定义结构
- [ ] 单击/双击交互符合 §3.3 协议
- [ ] 子系统扩展样式在 `module.css`，未污染 app.css
