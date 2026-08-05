# 新建样品页面排版布局优化 — 设计文档

> 日期：2026-08-05
> 状态：已确认（用户批准方案 A：双列卡片 + 列内字段 2 列网格；机型选择置于首位）

## 1. 背景与现状

新建样品页面（`subsystems/samples/frontend/js/views/new.js`）当前布局：

- 外层 `.card`（max-width:960px），内部 `.new-grid` 两列卡片（≥768px 生效）：「基础信息」6 字段、「限度样品信息」5 字段
- 所有字段竖排：`label` + fluent 组件逐行堆叠
- 底部为编号预览文本 + 创建按钮 + 消息区（内联样式，无视觉层次）

**现有问题**：
1. 字段竖排密度低：960px 宽下每列约 460px，单个输入框占整行浪费空间
2. 列高不平衡：基础信息列（6 字段）明显长于限度列（5 字段）
3. 操作区简陋：预览/按钮/错误消息混在底部无分隔
4. 机型选择器（规格/型号下拉）位于字段中部，非主要操作路径首位

## 2. 目标

- 提升表单信息密度与视觉层次，不改字段、不改交互逻辑
- 机型选择（规格/型号下拉）置于基础信息首位，符合主要操作路径
- 样式全部落在 samples 子系统 `module.css`，不触碰 app.css 共享类，避免双系统回归

## 3. 需求（已与用户确认）

1. 布局方向：**方案 A = 双列卡片 + 列内字段 2 列网格**（保留 `.new-grid` 两卡片骨架）
2. 基础信息列字段顺序：**规格/型号（下拉选机型）→ 样品名称 → 提供处 → 组别 → 备注**
3. 「机型编码（只读，选中自动填入）」框**紧跟规格/型号下拉下方整行显示**
4. 限度样品信息列：样品类型/限度项目同行、版次+说明文字同行、标准范围全宽
5. 底部操作条：编号预览（左）+ 创建按钮/错误消息（右），顶部边框分隔
6. 窄屏（<768px）降级为单列卡片 + 列内 1 列网格
7. **零 JS 逻辑变更**：字段 id、提交 payload、下拉联动、编号预览、错误处理全部不变

## 4. 布局结构（HTML 重排）

```
.card (max-width:960px)
└ .new-grid                        ← 双列卡片（≥768px），结构/类名不变
  ├ 基础信息 .new-col
  │ └ .nf-grid                     ← 新增：列内 2 列字段网格
  │   ├ 规格/型号* 下拉(n-spec)         │ 样品名称* 输入(n-name)      ← 第 1 行（机型选择首位）
  │   ├ 机型编码(只读) n-model          ← 全宽行（nf-full），选中后自动显示
  │   ├ 提供处* (n-source)             │ 组别* (n-station)          ← 第 2 行
  │   └ 备注 (n-notes)                 ← 全宽行
  └ 限度样品信息（选填） .new-col
    └ .nf-grid
      ├ 样品类型 (n-type)              │ 限度项目 (n-limit-item)    ← 第 1 行
      ├ 版次 (n-card-version)          │ 说明「编号固定不随版次」      ← 第 2 行
      └ 标准范围 (n-test-standard)     ← 全宽行
└ .nf-actions                       ← 新增：底部操作条
  ├ 编号预览 (n-preview)               ← 左
  └ 创建按钮 + 错误消息 (n-msg)         ← 右
```

**说明**：
- 「机型编码」只读框用 `.nf-full` 占全宽，置于规格/型号下方——用户确认的「跟随后方整行」
- 版次输入框与说明文字同行，替代当前 `style="width:80px"` + 换行的内联写法

## 5. 样式方案（module.css 新增）

新增到 `subsystems/samples/frontend/css/module.css`（**禁止**写入 app.css）：

```css
.nf-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}
.nf-grid fluent-text-field,.nf-grid fluent-select,.nf-grid textarea{margin-bottom:0}
.nf-full{grid-column:1/-1}
.nf-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:18px;padding-top:14px}
.nf-actions fluent-button{min-width:180px}
@media(max-width:767px){.nf-grid{grid-template-columns:1fr}}
```

要点：
- `.nf-grid fluent-*{margin-bottom:0}` 覆盖 app.css L66 `.new-grid fluent-*{margin-bottom:8px}`（列内改用 gap 控制间距）
- 字段全宽通过 `.nf-full{grid-column:1/-1}` 实现
- `.nf-actions` 复用 `--line`/`--card-radius` 等共享 token，无硬编码色值
- 移动优先：默认 2 列，`max-width:767px` 降级 1 列

## 6. 响应式

| 断点 | 布局 |
|---|---|
| ≥768px | 双列卡片 + 列内 2 列网格 |
| <768px | 单列卡片 + 列内 1 列网格（字段全宽） |
| 底部操作条 | 窄屏 `flex-wrap` 自动换行堆叠 |

遵循项目 5 档断点体系（XS/SM/MD/LG/XL），不硬编码 px 宽度。

## 7. 交互与兼容性

- **零 JS 逻辑变更**：`viewNew`/`submitNew`/`_schedulePreview`/`_refreshPreview` 均不改；仅 HTML 字符串重排 + 新增 CSS 类
- 字段 id 不变（n-name/n-model/n-station/n-source/n-spec/n-notes/n-type/n-limit-item/n-card-version/n-test-standard/n-preview/n-msg）
- 下拉选中 → `n-model` 自动填入 + 编号预览联动逻辑不变
- `.new-grid`/`.new-col`/`.new-col-title` 保持 app.css 原样，**不触发双系统（fixtures/workbench）回归**
- 版次输入 `style="width:80px"` 内联样式可移除（网格自动适配），属本次瘦身范畴

## 8. 测试计划

- **逻辑回归**：现有 jest 测试（samples/models）不涉及页面渲染，无需改动；跑一遍确认无回归（142/142）
- **视觉回归（browser_use）**：
  1. 新建页字段顺序：规格/型号 → 样品名称 → 机型编码（只读）→ 提供处/组别 → 备注
  2. 选中机型：下拉联动 n-model 自动填入 + 编号预览出现
  3. 底部操作条：预览左、按钮右，边框分隔可见
  4. 窄屏（<768px）：单列 + 字段全宽
  5. 创建流程：填必填项 → 创建成功弹出打印标签
- **双系统回归**：本次未改 app.css 共享类，fixtures/workbench 无影响（在回归清单中注明）

## 9. 文件变更清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `subsystems/samples/frontend/js/views/new.js` | 修改 | HTML 字符串重排（字段顺序 + .nf-grid/.nf-full/.nf-actions 结构） |
| `subsystems/samples/frontend/css/module.css` | 修改 | 新增 .nf-grid/.nf-full/.nf-actions + 窄屏降级 |
| `subsystems/samples/frontend/js/bundle.js` | 重建产物 | bundle 重建 + index.html 版本号更新 |
| `subsystems/samples/frontend/index.html` | 修改 | bundle 版本号 |

## 10. 部署与监控

- 部署：修改 new.js/module.css → 重建 bundle → 更新 index.html 版本号 → 提交
- 回滚：撤销 commit 即可（纯前端样式，无数据库变更）
- 上线后 1~3 周期监控：新建样品流程是否正常（下拉选机型→编号预览→创建）、窄屏终端（手机扫码场景）排版是否可读
