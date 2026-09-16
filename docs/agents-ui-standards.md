# AGENTS.md 参考卷 B — UI 与标签标准（§18 / §18.6 / §24）

> 本文件是 `AGENTS.md` 的参考卷，收录原 §18（卡片设计系统规范）、§18.6（详情弹窗设计系统）、§24（标签与标示卡标准化规则）全文，**编号保持不变**。
> 拆分原因同上，详见 `AGENTS.md`「本文件结构与参考卷」。
> 权威补充：标签/标示卡细则另见 `docs/label-card-standard.md`；卡片设计完整规范与已实施记录另见 `docs/archive/specs/2026-08-04-card-design-system.md`、`docs/archive/specs/2026-09-03-detail-modal-design-system.md`。

---

## 18. 卡片设计系统规范（强制）

> 完整规范见 `docs/archive/specs/2026-08-04-card-design-system.md`（该迭代已实施完成，设计文档于 2026-09-11 归档；当前未完成的规范保留在 `docs/superpowers/`）。
> 所有子系统的卡片组件 MUST 遵循本节规范，禁止各自定义风格不一的卡片。

### 18.1 设计 Token（app.css :root 已定义）

```css
--card-radius:12px;                    /* 统一圆角 */
--card-border:1px solid var(--line);   /* 统一边框 */
--card-pad:14px 16px;                  /* 统一内边距 */
--card-hover:transform .15s ease,box-shadow .15s ease;  /* 统一过渡 */
--card-shadow-hover:0 4px 12px rgba(15,23,42,.10);      /* 统一 hover 阴影 */
```

所有卡片 MUST 使用上述 token，禁止硬编码圆角/阴影/过渡值。

### 18.2 卡片类型

| 类型 | 类名 | 用途 | 结构 |
|---|---|---|---|
| 统计卡 | `.kb-stat` | 看板/工作台待办统计 | 色条 + 数字 + 标签（+可选扩展区） |
| 入口卡 | `.portal-card` | 门户子系统入口 | 图标 + 标题 + 描述 + 按钮 |
| 内容卡 | `.card` | 表格/表单内容容器 | 任意内容块 |

### 18.3 统计卡 .kb-stat 组件规范（唯一标准）

**结构（四区）**：fluent-card 容器 + `.n` 数字（26px 粗体，颜色 = `--stat-color`）+ `.l` 标签（12px muted）+ 可选 `.x` 扩展区；左侧 4px 色条 `--stat-color`。

**交互协议（MUST）**：

| 动作 | 行为 |
|---|---|
| hover | 上浮 `translateY(-2px)` + `--card-shadow-hover` |
| 单击 | 联动筛选对应数据（看板筛选待办 / 工作台筛选部门） |
| 再次单击 | 切换（取消筛选） |
| 双击 | 跳转对应列表页（仅单一子系统看板） |
| active | 边框高亮 + `--stat-color` 2px 光环 + `#eef2ff` 背景 |

**颜色语义（--stat-color）**：品牌/待办 = `var(--brand)`；警告/待验证 = `var(--warn)`；进行中 = `#1d4ed8`/`#065f46`/`#92400e`；危险/逾期 = `var(--bad)`。

**渲染组件（2026-09-04）**：`shared/frontend/kb-stats.js` 提供 `KbStats.render(cards, opts)`（opts.click = filter/navigate、filterHandler、activeIndex）统一生成统计卡 HTML 与双击绑定；登记于 bundle-sources 的 samples/fixtures/projects 数组（control/workbench 未接入）。samples 看板当前为等价内联实现（协议一致），迁移统一时见 §14 技术债条目。

### 18.4 新子系统导入方法

1. `index.html` 引入 `/css/app.css` + 加载 `/vendor/fluentui-web-components.js`
2. 统计卡直接使用 `.kb-stat`（fluent-card 容器），MUST 加载 fluent 组件
3. 卡片遍历 `data-k` + `onclick` 调子系统筛选函数 + `active` 态管理
4. 子系统专属补充样式（如积压标签）写入本子系统 `css/module.css`，**禁止**写入 app.css
5. 禁止修改 app.css 中 `.kb-stat` 的视觉/交互定义（共享约束，三系统依赖）

### 18.5 AI 拦截规则（卡片相关）

- 新增卡片自定义样式未使用共享 token/类 → 拒绝，要求使用 `.kb-stat` + `module.css`
- 在 app.css 添加子系统卡片样式 → 拒绝，要求写入 `module.css`
- 修改 app.css 中 `.kb-stat` 共享定义 → 标记高危，需样品/治具/工作台三系统回归

## 18.6 详情弹窗设计系统（强制）

> 完整规范见 `docs/archive/specs/2026-09-03-detail-modal-design-system.md`（该迭代已实施完成：共享组件缺陷修复 + fixtures/projects/samples 三子系统详情弹窗统一，设计文档于 2026-09-11 归档；行为回归护栏 `tests/detail-modal-shared.test.js`）。
> 各子系统详情弹窗 MUST 复用 `shared/frontend/detail-modal.js` 的 `openDetailModal` 组件与 `public/css/app.css` 的共享样式（骨架屏/置顶Tab/密度自适应/未保存拦截/409刷新/日志时间线）。
> 禁止各子系统重复实现弹窗交互骨架（违反 §15）；在 app.css 新增子系统专属详情弹窗样式同样禁止（应写子系统 module.css，但交互骨架样式应下沉共享）。

---

## 24. 标签与标示卡标准化规则（强制）

> 完整规范见 `docs/label-card-standard.md`。适用于样品子系统中「标签」与「标示卡」的代码/文档变更。

**核心结论（必须遵守）**：
1. **定义**：标签 = 贴实物的标签纸打印视图（2:3 布局，左 QR+基本信息，右空白标示卡区）；标示卡 = 承载品质信息的内容卡，三种形态（打印版 / 数字匿名卡 / 详情页编辑表单）。
2. **唯一事实来源 = `samples` 表**：标签与标示卡均**实时派生**渲染，**无独立存储**。禁止为二者建立独立数据副本、持久化缓存、冗余快照字段。
3. **尺寸联动**：标示卡纸张 = 标签纸去掉 QR 侧边的空白卡区尺寸；标签纸尺寸唯一数据源 `card-constants.js` 的 `PRESET_MM`（小 37×18 / 中 52×25 / 大 60×40mm + 自定义 30~150mm），**禁止各自硬编码**。
4. **双向更新**：字段变更仅需更新 `samples` 表一次，另一视图下次打印/查看自动同步；已打印旧纸需人工重新打印更换（旧纸不会自动更新）。
5. **版次机制**：新建/首发默认 `01`，复检/再发行自动 +1（上限 99），替代品复制原标示卡信息。
6. **缓存边界**：仅 QR 有 LRU 缓存（上限 200，键 = `sample_no/qr_token + width`），缓存仅依赖二维码编码内容，与品质字段无关。
7. **接口权限**：`label/download`、`qrcode/download` 仅 ADMIN/QA/RD；`card/print`、`label/print` 登录即可；数字标示卡 `GET /card/:sample_no` 为公开匿名。

**AI 拦截逻辑**：
- 在 `app.css` 添加标签/标示卡专属样式 → 拒绝，要求写入 `subsystems/samples/frontend/css/module.css`。
- 为标签/标示卡引入独立数据副本、持久化缓存 → 标记高危，中止。
- 尺寸常量各文件硬编码而非引用 `PRESET_MM` → 拒绝，要求统一引用。
- 修改标签/标示卡字段、尺寸、接口而未同步更新 `docs/label-card-standard.md` → 暂停，要求补齐。

---

**本文件为项目级 AI 协作指南,适用于所有 AI agent。修改本文件需用户明确同意。**
